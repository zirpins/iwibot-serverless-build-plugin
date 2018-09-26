import * as Archiver from 'archiver';
import * as Bluebird from 'bluebird';
import * as path from 'path';
import {join, resolve} from 'path';
import {spawn} from 'child_process';
import * as c from 'chalk';
import {copySync, createWriteStream, emptyDir, ensureDir, readFile, rename, writeFile} from 'fs-extra';
import {clone, isArray, merge} from 'lutils';
import * as semver from 'semver';
import {defaultConfig, IPluginConfig} from './config';
import {FileBuild} from './FileBuild';
import {Logger} from './lib/Logger';

import {NodeJsModuleBundler} from './NodeJsModuleBundler';
import {SourceBundler} from './SourceBundler';

import deployPackages from './lib/deployPackages';
import configureServiceBindings from './lib/deployServiceBindings';
import deployRules from './lib/deployRules'
import deployTriggers from './lib/deployTriggers'
import deployFeeds from './lib/deployFeeds'
import deployRoutes from './lib/deployApiGw'
import {deployFunctions, deploySequences} from "./lib/deployFunctions";
import {readFileSync, writeFileSync} from "fs";

const OpenwhiskProvider = require('./OpenwhiskProvider');
const { initializeResources } = require('./lib/initializeResources');
const ncp = require('ncp').ncp; // library for copy directories recursively
// limit of concurrently handled files by ncp
ncp.limit = 16;
const xml2js = require('xml2js')
const yaml = require('js-yaml');


export class ServerlessBuildPlugin {
    config: IPluginConfig = defaultConfig;

    serverless: any;
    options: Object;
    servicePath: string;
    tmpDir: string;
    buildTmpDir: string;
    artifactTmpDir: string;

    functions: any;
    hooks: any;
    commands: any;
    provider: any;

    fileBuild: FileBuild;
    logger: Logger;

    isCalled: boolean = false;
    packageIsFinished: boolean = false;

    constructor (serverless, options = {}) {
        //
        // SERVERLESS
        //

        this.logger = new Logger({ serverless });
        this.serverless = serverless;
        this.options = options;

        // Add wsk provider and deploy plugins
        this.serverless.pluginManager.addPlugin(OpenwhiskProvider);
        this.provider = this.serverless.getProvider('openwhisk');
        const version = this.serverless.getVersion();

        if (semver.lt(version, '1.0.0')) {
            throw new this.serverless.classes.Error(
                'iwibot-serverless-build-plugin requires serverless@1.x.x',
            );
        }

        this.servicePath = this.serverless.config.servicePath;
        this.tmpDir = join(this.servicePath, '.serverless');
        this.buildTmpDir = join(this.tmpDir, 'build');
        this.artifactTmpDir = join(this.tmpDir, 'artifacts');

        //
        // COMPATIBILITY
        //
        // Put the package plugin into 'individual' mode
        this.serverless.service.package.individually = true;
        this.serverless.service.package.exclude = ['**/*'];
        this.serverless.service.package.name = 'IWIBot';

        if (semver.lt(version, '1.12.0')) {

            // In sls 1.11 and lower this will skip 'archiving'
            this.serverless.service.package.artifact = true;

            this.logger.message(
                c.red('DEPRECATION'),
                'Upgrade to >= serverless@1.12. Build plugin is dropping support in the next major version',
            );
        }


        this.serverless.service.triggers = [];
        this.serverless.service.rules = [];
        this.serverless.service.bindings = [[{ packages:  [], fns: [] }]]; // array o
        this.serverless.service.packages = [];

        //
        // PLUGIN CONFIG GENERATION
        //

        const buildConfig = {
            method: 'bundle',
            babel: false,
            uglify: false,
            uglifyModules: false,
            uglifySource: false,
            sourceMaps: true,
            synchronous: true,
            functions: {},
            include: [],
            exclude: []
        };

        const serverlessCustom = this.serverless.service.custom || {};

        // The config inherits from multiple sources
        this.config = merge(
            this.config,
            clone(serverlessCustom.build || {}),
            clone(buildConfig),
            clone(options),
        );

        const { functions } = this.serverless.service;

        const functionSelection = this.config.f || this.config.function;
        let selectedFunctions = [];
        selectedFunctions = isArray(functionSelection)
            ? functionSelection
            : [functionSelection];


        selectedFunctions = selectedFunctions.filter((key) => key in functions);
        selectedFunctions = selectedFunctions.length ? selectedFunctions : Object.keys(functions);

        /**
         *  An array of realized functions configs to build against.
         *  Inherits from
         *  - serverless.yml functions.<fn>.package
         *
         *  in order to generate `include`, `exclude`
         */
        this.functions = selectedFunctions.reduce((obj, fnKey) => {
            const fnCfg = functions[fnKey];
            const fnBuildCfg = this.config.functions[fnKey] || {};

            const include = [
                ...(this.config.include || []),
                ...((fnCfg.package && fnCfg.package.include) || []),
                ...(fnBuildCfg.include || []),
            ];

            const exclude = [
                ...(this.config.baseExclude || []),
                ...(this.config.exclude || []),
                ...((fnCfg.package && fnCfg.package.exclude) || []),
                ...(fnBuildCfg.exclude || []),
            ];

            // Utilize the proposed `package` configuration for functions
            obj[fnKey] = {
                ...fnCfg,
                name: fnKey,

                package: {
                    ...(fnCfg.package || {}),
                    ...(this.config.functions[fnKey] || {}),
                    include,
                    exclude,
                },
            };

            return obj;
        }, {});

        this.overridePackagePlugin();

        this.hooks = {
            'before:iwibot:deployAll': initializeResources.bind(this),
            'iwibot:deployAll': this.deployAll.bind(this),
            'iwibot:package:iwibot-package': this.build.bind(this),
            'before:iwibot:deploy:iwibot-deploy': initializeResources.bind(this),
            'iwibot:deploy:iwibot-deploy': this.deploy.bind(this),
            'iwibot:service:bind:service-bind': configureServiceBindings.bind(this),
            'iwibot:template:create:create-from-template': this.createFromTemplate.bind(this),
            'iwibot:remove:iwibot-remove': this.removeFunctions.bind(this),
            'iwibot:enable:iwibot-enable': this.enableFunctions.bind(this),
            'iwibot:disable:iwibot-disable': this.disableFunctions.bind(this)
        };

        this.commands = {
            iwibot: {
                usage: 'This plugin provides dependency bundling and deployment for nodejs functions with the openwhisk provider. \nYou can also bind resources to functions or packages and create new functions from a given language type (eg. nodejs).',
                lifecycleEvents: [
                    'deployAll'
                ],
                options: {

                },
                commands: {
                    package: {
                        usage: 'Package all iwibot functions',
                        lifecycleEvents: ['iwibot-package']
                    },
                    deploy: {
                        usage: 'Deploy all enabled iwibot functions',
                        lifecycleEvents: ['iwibot-deploy']
                    },
                    remove: {
                        usage: 'Undeploy all enabled iwibot functions',
                        options: {
                            force: {
                                usage: 'force undeployment of all functions',
                                shortcut: 'f'
                            }
                        },
                        lifecycleEvents: ['iwibot-remove']
                    },
                    enable: {
                        usage: 'enables all functions in the serverless.yml',
                        lifecycleEvents: ['iwibot-enable']
                    },
                    disable: {
                        usage: 'disables all functions in the serverless.yml',
                        lifecycleEvents: ['iwibot-disable']
                    },
                    service: {
                        usage: 'Use the bind command to bind resources to functions',
                        commands: {
                            bind: {
                                usage: 'Bind services',
                                lifecycleEvents: [
                                    'service-bind'
                                ]
                            }
                        }
                    },
                    template: {
                        usage: 'Use "sls iwibot template create --name fnName --kind nodejs|go|python|php|java" ',
                        commands: {
                            create: {
                                usage: 'create a function from a template',
                                options: {
                                    kind: {
                                        usage: 'kind of the function (nodejs, go, php, python, java)',
                                        shortcut: 'k',
                                        required: true,
                                    },
                                    name: {
                                        usage: 'Name of the function',
                                        shortcut: 'n',
                                        required: true,
                                    }
                                },
                                lifecycleEvents: [
                                    'create-from-template'
                                ]
                            }
                        }
                    }
                }
            },
        };

        this.fileBuild = new FileBuild({
            logger: this.logger,
            servicePath: this.servicePath,
            buildTmpDir: this.buildTmpDir,
            handlerEntryExt: this.config.handlerEntryExt,
            tryFiles: this.config.tryFiles,
        });
    }

    /**
     *  Builds either from file or through babel
     */
    private build = async () => {
        this.logger.message('BUILDS', 'Initializing');
        this.logger.log('');

        const reduceConfig = (keys) =>
            keys.reduce((obj, key) => {
                obj[key] = this.config[key];
                return obj;
            }, {});

        if (this.config.nodejsMethod === 'file') {
            this.logger.config(reduceConfig([
                'method', 'tryFiles', 'handlerEntryExt',
                'synchronous', 'deploy', 'useServerlessOffline',
                'modules', 'zip',
            ]));
        } else {
            this.logger.config(reduceConfig([
                'method',
                'synchronous', 'deploy', 'useServerlessOffline',
                'babel', 'uglify', 'uglifySource', 'uglifyModules',
                'normalizeBabelExt', 'sourceMaps', 'transformExtensions',
                'baseExclude',
                'modules', 'include', 'exclude', 'zip',
            ]));
        }

        // Ensure directories

        await ensureDir(this.buildTmpDir);
        await ensureDir(this.artifactTmpDir);

        if (!this.config.keep) { await emptyDir(this.artifactTmpDir); }

        /**
         * Iterate functions and run builds either synchronously or concurrently
         */
        await Bluebird.map(Object.keys(this.functions), (name) => {
            const config = this.functions[name];

            return this.buildFunction(name, config);
        }, {
            concurrency: this.config.synchronous ? 1 : Infinity,
        });

        this.packageIsFinished = true;
        this.logger.log('');
        this.logger.message('BUILDS', 'Complete!');
        this.logger.log('');

        if (this.config.deploy === false) {
            this.logger.message('EXIT', 'User requested via --no-deploy');

            Bluebird.delay(1);

            process.exit();
        }
    };

    private createFromTemplate = async (params) => {
        const name = this.options['name'];
        const kind = this.options['kind'];
        const fnPathName = kind + '-' + name.toLowerCase();
        const types = ['nodejs', 'go', 'java', 'php', 'python'];

        if (!types.includes(kind)) {
            return this.logger.message('Template', `The type ${kind} is unsupported!`);
        }

        ncp(join(this.servicePath, 'template-' + kind), join(this.servicePath, fnPathName), async (err) => {
            if (err) {
                return console.error(err);
            }

            switch (kind) {
                case 'nodejs':
                    // modify package.json values
                    const packageJson = require(join(this.servicePath, fnPathName, 'package.json'));
                    packageJson.name = name;
                    packageJson.main = join('lib', name + '.js');
                    await writeFile(join(this.servicePath, fnPathName, 'package.json'), JSON.stringify(packageJson, null, 2));

                    // rename files
                    await rename(join(this.servicePath, fnPathName, 'lib', 'Test.js'), join(this.servicePath, fnPathName, 'lib', name + '.js'));
                    await rename(join(this.servicePath, fnPathName, 'test', 'Test.iwibot_test.js'), join(this.servicePath, fnPathName, 'test', name + '.iwibot_test.js'));

                    this.logger.message('Template', `nodejs template written to directory ${fnPathName}`);

                    this.addYamlPartToFile(name, kind + ':8', fnPathName, join('lib', name + '.main'), [
                        'lib/**/*',
                        'package.json',
                        'README.md'
                    ]);
                    break;

                case 'go':
                    await rename(join(this.servicePath, fnPathName, 'src', 'de.hska.iwibot.actions.go', 'test.go'), join(this.servicePath, fnPathName, 'src', 'de.hska.iwibot.actions.go', name + '.go'));
                    this.logger.message('Template', `go template written to directory ${fnPathName}`);
                    this.addYamlPartToFile(name, kind, fnPathName, 'bin/exec', [
                        'bin/exec',
                        'README.md'
                    ]);
                    break;

                case 'python':
                    this.logger.message('Template', `python template written to directory ${fnPathName}`);
                    this.addYamlPartToFile(name, kind + ':3', fnPathName, '__main__.main', [
                        'lib/**/*',
                        'README.md'
                    ]);
                    break;

                case 'php':
                    // modify composer.json name value
                    const composerJson = require(join(this.servicePath, fnPathName, 'composer.json'));
                    composerJson.name = name;
                    await writeFile(join(this.servicePath, fnPathName, 'composer.json'), JSON.stringify(composerJson, null, 2));

                    this.logger.message('Template', `php template written to directory ${fnPathName}`);

                    this.addYamlPartToFile(name, kind + ':7.2', fnPathName, 'index.main', [
                        'lib/**/*',
                        'vendor/**/*',
                        'composer.json',
                        'README.md'
                    ]);
                    break;

                case 'java':

                    // rename Template.java
                    await rename(
                        join(this.servicePath, fnPathName, 'src', 'main', 'java', 'de', 'hska', 'iwibot', 'actions', 'java', 'Template.java'),
                        join(this.servicePath, fnPathName, 'src', 'main', 'java', 'de', 'hska', 'iwibot', 'actions', 'java', name + '.java')
                    );

                    // modify file name.java
                    readFile(join(this.servicePath, fnPathName, 'src', 'main', 'java', 'de', 'hska', 'iwibot', 'actions', 'java', name + '.java'), 'utf8', async (err, data) => {
                        if (err) {
                            console.error(err);
                        }

                        writeFile(join(this.servicePath, fnPathName, 'src', 'main', 'java', 'de', 'hska', 'iwibot', 'actions', 'java', name + '.java'), data.replace('Template', name), (err) => {
                            if (err) {
                                console.error(err);
                            }
                            // modify the final build name in the pom.xml
                            readFile(join(this.servicePath, fnPathName, 'pom.xml'), 'utf-8', async (err, data) => {
                                if(err) console.error(err);
                                // we then pass the data to our method here
                                xml2js.parseString(data, async (err, result) => {
                                    if(err) console.error(err);

                                    result.project.build[0].finalName = name;

                                    // create a new builder object and then convert
                                    // our json back to xml.
                                    const xml = new xml2js.Builder().buildObject(result);
                                    await writeFile(join(this.servicePath, fnPathName, 'pom.xml'), xml);
                                    this.logger.message('Template', `java template written to directory ${fnPathName}`);
                                });
                            });

                            this.addYamlPartToFile(name, kind, fnPathName, 'de.hska.iwibot.actions.java.' + name,[
                                'src/**/*',
                                'pom.xml',
                                'README.md'
                            ]);
                        });
                    });
                    break;
            }
        });
    };

    private addYamlPartToFile(name, kind, fnPathName, handler, includes) {
        const doc = yaml.safeLoad(readFileSync(join(this.servicePath, 'serverless.yml'), 'utf8'));

        const writePart = () => {
            doc.functions[name] = {
                enabled: true,
                name: name,
                runtime: kind === 'go' ? 'blackbox' : kind,
                handler: handler,
                package: {
                    name: fnPathName,
                    include: includes
                }
            };

            if (kind === 'go') {
                Object.assign(doc.functions[name], {kind: kind});
            }

            writeFileSync(join(this.servicePath, 'serverless.yml'), yaml.safeDump(doc));

            this.logger.message('Template', 'part written to serverless.yml!');
        }

        if (doc.functions[name]) {
            process.stdin.resume();
            process.stdout.write('The function name already exists in the serverless.yml. Would you like to overwrite it? ' + c.reset.bold('Y|N') + ': ');
            process.stdin.once('data', (data) => {
                if (data.toString().trim() === 'y' || data.toString().trim() === 'Y' || data.toString().trim() === 'yes') {
                    writePart();
                } else {
                    this.logger.message('Template', `skipping yaml part for function ${name}`)
                }
                process.stdin.destroy();
            });
        } else {
            writePart();
        }
    }

    private removeFunctions = async () => {
        this.provider.client().then(async (ow) => {
            if (this.options['force']) {
                Bluebird.map(await ow.actions.list(), async (fnConfig) => {
                    try {
                        await ow.actions.delete(fnConfig['name']);
                        this.logger.message('Function', c.reset.bold(fnConfig['name']) + ' ' + c.green('successfully deleted!'));
                    } catch (e) {
                        this.logger.message('Function', c.reset.bold(fnConfig['name']) + ' ' + c.green('do not exist!'));
                    }
                });
            } else {
                Bluebird.map(Object.keys(this.serverless.service.functions), async (fnName) => {
                    if (this.serverless.service.functions[fnName].enabled) {
                        try {
                            await ow.actions.delete(fnName);
                            this.logger.message('Function', c.reset.bold(fnName) + ' ' + c.green('successfully deleted!'));
                        } catch (e) {
                            this.logger.message('Function', c.reset.bold(fnName) + ' ' + c.green('do not exist!'));
                        }
                    }
                });
            }
        });
    };

    private enableFunctions = async () => {
        const doc = yaml.safeLoad(readFileSync(join(this.servicePath, 'serverless.yml'), 'utf8'));

        await Bluebird.all(Object.keys(doc.functions).map((fnName) => {
            doc.functions[fnName].enabled = true;
        }));

        writeFileSync(join(this.servicePath, 'serverless.yml'), yaml.safeDump(doc));
        this.logger.message('Functions', c.reset.bold('enabled') + ' all functions in serverless.yml');
    };

    private disableFunctions = async () => {
        const doc = yaml.safeLoad(readFileSync(join(this.servicePath, 'serverless.yml'), 'utf8'));

        await Bluebird.all(Object.keys(doc.functions).map((fnName) => {
            doc.functions[fnName].enabled = false;
        }));

        writeFileSync(join(this.servicePath, 'serverless.yml'), yaml.safeDump(doc));
        this.logger.message('Functions', c.reset.bold('disabled') + ' all functions in serverless.yml');
    };

    private deployAll = async () => {
        await this.build();
        await this.deploy();
    };

    private deploy = async () => {
        await Bluebird.bind(this)
            //.then(deployPackages.bind(this))
            .then(deployFunctions.bind(this))
            .then(deploySequences.bind(this))
            .then(deployRoutes.bind(this))
            .then(deployTriggers.bind(this))
            .then(deployFeeds.bind(this))
            .then(deployRules.bind(this))
            .then(() => this.serverless.cli.log('Deployment successful!'));
    };

    private async buildFunction (fnName, fnConfig) {
        const runtime = fnConfig.runtime || this.serverless.service.provider.runtime;

        this.logger.message('FUNCTION', c.reset.bold(fnName) + ' with runtime ' + c.reset.blue(runtime));

        if (!fnConfig.enabled) {
            this.logger.message('FUNCTION', c.reset.bold(fnName) + c.red(' is excluded from packaging'));
            return fnConfig;
        }

        if (runtime.indexOf('nodejs') > -1) {
            return await this.buildNodejsFunction(fnName, fnConfig);
        }
        if (runtime.indexOf('php') > -1) {
            return await this.buildPhpFunction(fnName, fnConfig);
        }
        if (runtime.indexOf('java') > -1) {
            return await this.buildJavaFunction(fnName, fnConfig);
        }
        if (runtime.indexOf('python') > -1) {
            return this.buildPythonFunction(fnName, fnConfig);
        }
        if (runtime.indexOf('blackbox') > -1) {
            switch (fnConfig.kind) {
                case 'go':
                    return await this.buildGoFunction(fnName, fnConfig);
            }
        }

        return fnConfig;
    }

    private async buildGoFunction(fnName: any, fnConfig: any) {
        const artifact = Archiver('zip', this.config.zip);
        this.setConfig(false, false, false, false);

        return new Promise((resolve, reject) => {
            process.chdir(join(this.servicePath, fnConfig.package.name, 'src', 'de.hska.iwibot.actions.go'));
            // prepare go env for cross compilation
            process.env.GOPATH = join(this.servicePath, fnConfig.package.name);
            process.env.GOOS='linux';
            process.env.GOARCH='amd64';

            // download the dependencies
            const getRes = spawn('go', ['get']);

            getRes.stdout.on('data', (data) => {
                console.log('' + data);
            });

            getRes.on('close',  (code) => {
               if (code === 0) {
                   // build the executable
                   const res = spawn('go', ['build', '-o', join('..', '..', 'bin', 'exec')]);
                   res.stdout.on('data', (data) => {
                      console.log('' + data);
                   });

                   res.on('close', async (code) => {
                      if (code === 0) {
                          const sourceBundler = new SourceBundler({
                              logger: this.logger,
                              archive: artifact,
                              servicePath: join(this.servicePath, fnConfig.package.name, 'bin'),
                          });

                          this.logger.log('');

                          await sourceBundler.bundle({
                              exclude: [],
                              include: ['exec'],
                          });

                          delete process.env.GOPATH;
                          delete process.env.GOOS;
                          delete process.env.GOARCH;

                          fnConfig = await this.completeFunctionArtifact(fnName, artifact);

                          process.chdir(this.servicePath);
                          resolve(fnConfig);
                      } else {
                          process.chdir(this.servicePath);
                          reject()
                      }
                   });
               } else {
                   delete process.env.GOPATH;
                   delete process.env.GOOS;
                   delete process.env.GOARCH;

                   process.chdir(this.servicePath);
                   reject()
               }
            });
        });
    }

    private setConfig(sourceMaps: boolean, uglify: boolean, uglifySource: boolean, uglifyModules: boolean) {
        this.config.sourceMaps = sourceMaps;
        this.config.uglify = uglify;
        this.config.uglifySource = uglifySource;
        this.config.uglifyModules = uglifyModules;
    }

    private async buildPythonFunction(fnName: any, fnConfig: any) {
        const artifact = Archiver('zip', this.config.zip);
        this.setConfig(false, false, false, false);

        this.serverless.pluginManager.addPlugin(require('serverless-python-requirements'))
        await this.serverless.pluginManager.invoke(['requirements', 'install']);

        const sourceBundler = new SourceBundler({
            logger: this.logger,
            archive: artifact,
            // requirements are packages with another plugin and the __main__.py
            // need to be at the root of the zip, so the relative path here is lib. Not the action root dir!
            servicePath: join(this.servicePath, fnConfig.package.name, 'lib')
        });

        const sourceBundlerPythonRequirements = new SourceBundler({
            logger: this.logger,
            archive: artifact,
            servicePath: join('.serverless', 'requirements')
        });

        this.logger.log('');

        await sourceBundler.bundle({
            exclude: fnConfig.package.exclude,
            include: ['**/*'],
        });

        this.logger.log('');

        await sourceBundlerPythonRequirements.bundle({
            exclude: fnConfig.package.exclude,
            include: ['**/*']
        });

        const result = await this.completeFunctionArtifact(fnName, artifact);

        this.logger.log('');

        await this.serverless.pluginManager.invoke(['requirements', 'clean']);

        return result;
    }

    private async buildPhpFunction (fnName, fnConfig) {
        this.setConfig(false, false, false, false);
        return new Promise(async (resolve, reject) => {
            let moduleIncludes: Set<string>;
            const artifact = Archiver('zip', this.config.zip);
            process.chdir(fnConfig.package.name);
            const res = spawn('composer', ['install']);

            res.stdout.on('data', (data) => {
               console.log('' + data);
            });

            res.on('close', async (code) => {
               if (code === 0) {
                   let sourceBundler = new SourceBundler({
                       logger: this.logger,
                       archive: artifact,
                       servicePath: join(this.servicePath, fnConfig.package.name, 'lib'),
                   });

                   await sourceBundler.bundle({
                       exclude: fnConfig.package.exclude,
                       include: ['*'],
                   });
                   sourceBundler = null;

                   sourceBundler = new SourceBundler({
                       logger: this.logger,
                       archive: artifact,
                       servicePath: join(this.servicePath, fnConfig.package.name),
                   });

                   await sourceBundler.bundle({
                       exclude: ['lib'],
                       include: fnConfig.package.include.filter((el) => { return el.indexOf('lib') === -1 })
                   });

                   const result = await this.completeFunctionArtifact(fnName, artifact);
                   process.chdir('..');
                   resolve(result);
               } else {
                   reject()
               }
            });
        });
    }

    private async buildJavaFunction (fnName, fnConfig) {
        this.setConfig(false, false, false, false);
        return new Promise((resolve, reject) => {
            const res = spawn('mvn', ['package', '-f' + fnConfig.package.name]);

            res.stdout.on('data', (data) => console.log('' + data));
            res.on('close',  (code)=>{
                if (code === 0) {
                    // copy jar to artifacts dir (.serverless)
                    copySync(join(path.resolve(fnConfig.package.name), 'target', fnName + '.jar'), join(path.resolve('.serverless'), fnName + '.jar'));

                    const artifactPath = join(path.resolve('.serverless'), fnName + '.jar');
                    fnConfig.artifact = artifactPath;
                    fnConfig.package.artifact = artifactPath;
                    resolve(fnConfig);
                } else {
                    reject();
                }
            });
        });
    }

    /**
     * Builds a function into an streaming zip artifact
     * and sets it in `serverless.yml:functions[fnName].artifact`
     * in order for `serverless` to consume it.
     */
    private async buildNodejsFunction (fnName, fnConfig) {
        let moduleIncludes: Set<string>;
        const { nodejsMethod } = this.config;
        const artifact = Archiver('zip', this.config.zip);
        this.setConfig(false, false, false, false);

        return new Promise(async (resolve, reject) => {
            process.chdir(fnConfig.package.name);
            const res = spawn('npm', ['install']);

            res.stdout.on('data', (data) => {
               console.log('' + data);
            });


            if (nodejsMethod === 'bundle') {
                const sourceBundler = new SourceBundler({
                    uglify: this.config.uglifySource
                        ? this.config.uglify
                        : undefined,
                    babel: this.config.babel,
                    sourceMaps: this.config.sourceMaps,
                    transformExtensions: this.config.transformExtensions,
                    logger: this.logger,
                    archive: artifact,
                    servicePath: join(this.servicePath, fnConfig.package.name),
                });

                this.logger.log('servicePath: ' + this.servicePath);

                this.logger.log('');

                await sourceBundler.bundle({
                    exclude: [],
                    include: ['**/*', 'lib/**/*', '*']
                });
            } else if (nodejsMethod === 'file') {
                //
                // BUILD FILE
                //

                await this.fileBuild.build(fnConfig, artifact);

                moduleIncludes = this.fileBuild.externals;
            } else {
                throw new Error('Unknown build method');
            }

            res.on('close', async (code) => {
               if (code === 0) {

                   this.logger.log('');

                   await new NodeJsModuleBundler(
                       {
                           logger: this.logger,
                           uglify: this.config.uglifyModules
                               ? this.config.uglify
                               : undefined,

                           servicePath: join(this.servicePath, fnConfig.package.name),
                           archive: artifact,
                       },
                   ).bundle({
                       include: Array.from(moduleIncludes || []),
                       ...this.config.modules,
                   });

                   this.logger.log('');

                   const result = await this.completeFunctionArtifact(fnName, artifact);

                   this.logger.log('');
                   process.chdir(this.servicePath);
                   resolve(result);
               } else {
                   process.chdir(this.servicePath);
                   reject()
               }
            });
        });
    }

    /**
     *  Writes the `artifact` and attaches it to serverless
     */
    private async completeFunctionArtifact (fnName: string, artifact: Archiver.Archiver) {
        const artifactPath = join(
            this.servicePath,
            '.serverless',
            `${fnName}.zip`
        );

        // create zip file from buffered zip archive
        await new Promise((resolve, reject) => {
            const stream = createWriteStream(artifactPath);
            stream
                .on('error', reject)
                .on('close', resolve);

            artifact.pipe(stream);
            artifact.finalize();
        });

        const size = `${(artifact.pointer() / 1024 / 1024).toFixed(4)} MB`;

        this.logger.message(
            'ARTIFACT',
            `${c.bold(fnName)} ${c.blue(size)}`,
        );

        this.serverless.service.functions[fnName].artifact = artifactPath;
        this.serverless.service.functions[fnName].package.artifact = artifactPath;

        return this.serverless.service.functions[fnName];
    }

  /**
   * Mutates `packageFunction` on the `Package` serverless built-in plugin
   * in order to intercept
   */
  private overridePackagePlugin = () => {
    const packagePlugin = this.serverless.pluginManager.plugins.find((item) =>
      item.constructor.name === 'Package',
    );

    const oldPluginFn = packagePlugin.packageFunction;
    packagePlugin.packageFunction = async (fnName) => {
      const fnConfig = this.serverless.service.functions[fnName];
      const artifactPath = fnConfig.artifact || (fnConfig.package && fnConfig.package.artifact);

      // If we haven't built the artifact ourself, delegate back to the vanilla packagePlugin implementation
      if (!artifactPath ||
          (fnConfig.runtime.indexOf('nodejs') > -1
          || fnConfig.runtime.indexOf('java') > -1
          || fnConfig.runtime.indexOf('php') > -1
      )) {
        return oldPluginFn.call(packagePlugin, fnName);
      }

      return fnConfig.artifact;
    };
  }
}
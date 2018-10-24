"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Archiver = require("archiver");
const Bluebird = require("bluebird");
const path = require("path");
const path_1 = require("path");
const child_process_1 = require("child_process");
const c = require("chalk");
const fs_extra_1 = require("fs-extra");
const lutils_1 = require("lutils");
const semver = require("semver");
const config_1 = require("./config");
const FileBuild_1 = require("./FileBuild");
const Logger_1 = require("./lib/Logger");
const NodeJsModuleBundler_1 = require("./NodeJsModuleBundler");
const SourceBundler_1 = require("./SourceBundler");
const deployServiceBindings_1 = require("./lib/deployServiceBindings");
const deployApiGw_1 = require("./lib/deployApiGw");
const deployFunctions_1 = require("./lib/deployFunctions");
const deployPackages_1 = require("./lib/deployPackages");
const deployRules_1 = require("./lib/deployRules");
const deployTriggers_1 = require("./lib/deployTriggers");
const deployFeeds_1 = require("./lib/deployFeeds");
const fs_1 = require("fs");
const OpenwhiskProvider = require('./OpenwhiskProvider');
const { initializeResources } = require('./lib/initializeResources');
const ncp = require('ncp').ncp; // library for copy directories recursively
// limit of concurrently handled files by ncp
ncp.limit = 16;
const xml2js = require('xml2js');
const yaml = require('js-yaml');
class ServerlessBuildPlugin {
    constructor(serverless, options = {}) {
        //
        // SERVERLESS
        //
        this.config = config_1.defaultConfig;
        this.isCalled = false;
        this.packageIsFinished = false;
        this.afterDeploy = () => __awaiter(this, void 0, void 0, function* () {
            deployServiceBindings_1.bindServices.call(this);
            yield deployApiGw_1.bindRoutes.call(this);
        });
        this.unbindResources = () => __awaiter(this, void 0, void 0, function* () {
            deployServiceBindings_1.unbindServices.call(this);
            yield deployApiGw_1.unbindRoutes.call(this);
        });
        this.afterTestDeploy = () => __awaiter(this, void 0, void 0, function* () {
            this.serverless.service.deployTest = true;
            deployServiceBindings_1.bindTestServices.call(this);
            yield deployApiGw_1.bindTestRoutes.call(this);
        });
        this.unbindTestResources = () => __awaiter(this, void 0, void 0, function* () {
            this.serverless.service.deployTest = true;
            deployServiceBindings_1.unbindTestServices.call(this);
            yield deployApiGw_1.unbindTestRoutes.call(this);
        });
        /**
         *  Builds either from file or through babel
         */
        this.buildFunctions = () => __awaiter(this, void 0, void 0, function* () {
            this.logger.message('BUILDS', 'Initializing');
            this.logger.log('');
            // Ensure directories
            yield fs_extra_1.ensureDir(this.buildTmpDir);
            yield fs_extra_1.ensureDir(this.artifactTmpDir);
            if (!this.config.keep) {
                yield fs_extra_1.emptyDir(this.artifactTmpDir);
            }
            /**
             * Iterate functions and run builds either synchronously or concurrently
             */
            yield Bluebird.map(Object.keys(this.functions), (name) => {
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
        });
        this.createFromTemplate = (params) => __awaiter(this, void 0, void 0, function* () {
            const name = this.options['name'];
            const kind = this.options['kind'];
            const fnPathName = kind + '-' + name.toLowerCase();
            const types = ['nodejs', 'go', 'java', 'php', 'python'];
            if (!types.includes(kind)) {
                return this.logger.message('Template', `The type ${kind} is unsupported! Supported types are ${types}`);
            }
            ncp(path_1.join(this.servicePath, 'template-' + kind), path_1.join(this.servicePath, fnPathName), (err) => __awaiter(this, void 0, void 0, function* () {
                if (err) {
                    return console.error(err);
                }
                switch (kind) {
                    case 'nodejs':
                        // modify package.json values
                        const packageJson = require(path_1.join(this.servicePath, fnPathName, 'package.json'));
                        packageJson.name = name;
                        packageJson.main = 'lib/' + name + '.js';
                        yield fs_extra_1.writeFile(path_1.join(this.servicePath, fnPathName, 'package.json'), JSON.stringify(packageJson, null, 2));
                        // rename files
                        fs_extra_1.renameSync(path_1.join(this.servicePath, fnPathName, 'lib', 'Test.js'), path_1.join(this.servicePath, fnPathName, 'lib', name + '.js'));
                        fs_extra_1.renameSync(path_1.join(this.servicePath, fnPathName, 'test', 'Test.iwibot_test.js'), path_1.join(this.servicePath, fnPathName, 'test', name + '.iwibot_test.js'));
                        this.logger.message('Template', `nodejs template written to directory ${fnPathName}`);
                        this.addYamlPartToFile(name, kind + ':8', fnPathName, 'lib/' + name + '.main', [
                            'lib/**/*',
                            'package.json',
                            'README.md'
                        ]);
                        break;
                    case 'go':
                        fs_extra_1.renameSync(path_1.join(this.servicePath, fnPathName, 'src', 'de.hska.iwibot.actions.go', 'test.go'), path_1.join(this.servicePath, fnPathName, 'src', 'de.hska.iwibot.actions.go', name + '.go'));
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
                        const composerJson = require(path_1.join(this.servicePath, fnPathName, 'composer.json'));
                        composerJson.name = name;
                        yield fs_extra_1.writeFile(path_1.join(this.servicePath, fnPathName, 'composer.json'), JSON.stringify(composerJson, null, 2));
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
                        fs_extra_1.renameSync(path_1.join(this.servicePath, fnPathName, 'src', 'main', 'java', 'de', 'hska', 'iwibot', 'actions', 'java', 'Template.java'), path_1.join(this.servicePath, fnPathName, 'src', 'main', 'java', 'de', 'hska', 'iwibot', 'actions', 'java', name + '.java'));
                        // modify file name.java
                        fs_extra_1.readFile(path_1.join(this.servicePath, fnPathName, 'src', 'main', 'java', 'de', 'hska', 'iwibot', 'actions', 'java', name + '.java'), 'utf8', (err, data) => __awaiter(this, void 0, void 0, function* () {
                            if (err) {
                                console.error(err);
                            }
                            fs_extra_1.writeFile(path_1.join(this.servicePath, fnPathName, 'src', 'main', 'java', 'de', 'hska', 'iwibot', 'actions', 'java', name + '.java'), data.replace('Template', name), (err) => {
                                if (err) {
                                    console.error(err);
                                }
                                // modify the final build name in the pom.xml
                                fs_extra_1.readFile(path_1.join(this.servicePath, fnPathName, 'pom.xml'), 'utf-8', (err, data) => __awaiter(this, void 0, void 0, function* () {
                                    if (err)
                                        console.error(err);
                                    // we then pass the data to our method here
                                    xml2js.parseString(data, (err, result) => __awaiter(this, void 0, void 0, function* () {
                                        if (err)
                                            console.error(err);
                                        result.project.build[0].finalName = name;
                                        // create a new builder object and then convert
                                        // our json back to xml.
                                        const xml = new xml2js.Builder().buildObject(result);
                                        yield fs_extra_1.writeFile(path_1.join(this.servicePath, fnPathName, 'pom.xml'), xml);
                                        this.logger.message('Template', `java template written to directory ${fnPathName}`);
                                    }));
                                }));
                                this.addYamlPartToFile(name, kind, fnPathName, 'de.hska.iwibot.actions.java.' + name, [
                                    'src/**/*',
                                    'pom.xml',
                                    'README.md'
                                ]);
                            });
                        }));
                        break;
                }
            }));
        });
        this.removeTestFunctions = () => __awaiter(this, void 0, void 0, function* () {
            this.provider.client().then((ow) => __awaiter(this, void 0, void 0, function* () {
                let result = null;
                try {
                    result = yield ow.packages.get({ name: this.serverless.service.package.testname });
                }
                catch (e) {
                    console.log(`Package ${this.serverless.service.package.testname} does not exist`);
                    return;
                }
                yield Bluebird.all(Bluebird.map(result.actions, (fnConfig) => {
                    if (this.serverless.service.functions[fnConfig['name']].enabled || this.options['force']) {
                        ow.actions.delete({ name: `${result.name}/${fnConfig['name']}` }).then(() => {
                            console.log(`${c.green('successfully') + ' deleted ' + c.reset.bold(result.name + '/' + fnConfig['name'])}`);
                        });
                    }
                }));
            }));
        });
        this.removeFunctions = () => __awaiter(this, void 0, void 0, function* () {
            this.provider.client().then((ow) => __awaiter(this, void 0, void 0, function* () {
                if (this.options['force']) {
                    Bluebird.map(yield ow.actions.list(), (fnConfig) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            yield ow.actions.delete(fnConfig['name']);
                            this.logger.message('Function', c.reset.bold(fnConfig['name']) + ' ' + c.green('successfully deleted!'));
                        }
                        catch (e) {
                            this.logger.message('Function', c.reset.bold(fnConfig['name']) + ' ' + c.green('do not exist!'));
                        }
                    }));
                }
                else {
                    Bluebird.map(Object.keys(this.serverless.service.functions), (fnName) => __awaiter(this, void 0, void 0, function* () {
                        const fnConfig = this.serverless.service.functions[fnName];
                        if (fnConfig.enabled) {
                            try {
                                if (fnConfig.package && fnConfig.package.name) {
                                    yield ow.actions.delete(`${fnConfig.package.name}/${fnName}`);
                                }
                                else {
                                    yield ow.actions.delete(fnName);
                                }
                                this.logger.message('Function', c.reset.bold(fnName) + ' ' + c.green('successfully deleted!'));
                            }
                            catch (e) {
                                this.logger.message('Function', c.reset.bold(fnName) + ' ' + c.green('do not exist!'));
                            }
                        }
                    }));
                }
            }));
        });
        this.enableFunctions = () => __awaiter(this, void 0, void 0, function* () {
            const doc = yaml.safeLoad(fs_1.readFileSync(path_1.join(this.servicePath, 'serverless.yml'), 'utf8'));
            if (this.options['fn']) {
                if (doc.functions[this.options['fn']]) {
                    doc.functions[this.options['fn']].enabled = true;
                }
            }
            else {
                yield Bluebird.all(Object.keys(doc.functions).map((fnName) => {
                    doc.functions[fnName].enabled = true;
                }));
            }
            fs_1.writeFileSync(path_1.join(this.servicePath, 'serverless.yml'), yaml.safeDump(doc));
            if (this.options['fn']) {
                if (doc.functions[this.options['fn']]) {
                    this.logger.message('Functions', c.reset.bold('enabled') + ` ${c.reset.bold(this.options['fn'])} function in serverless.yml`);
                }
            }
            else {
                this.logger.message('Functions', c.reset.bold('enabled') + ' all functions in serverless.yml');
            }
        });
        this.disableFunctions = () => __awaiter(this, void 0, void 0, function* () {
            const doc = yaml.safeLoad(fs_1.readFileSync(path_1.join(this.servicePath, 'serverless.yml'), 'utf8'));
            if (this.options['fn']) {
                if (doc.functions[this.options['fn']]) {
                    doc.functions[this.options['fn']].enabled = false;
                }
            }
            else {
                yield Bluebird.all(Object.keys(doc.functions).map((fnName) => {
                    doc.functions[fnName].enabled = false;
                }));
            }
            fs_1.writeFileSync(path_1.join(this.servicePath, 'serverless.yml'), yaml.safeDump(doc));
            if (this.options['fn']) {
                if (doc.functions[this.options['fn']]) {
                    this.logger.message('Functions', c.reset.bold('disabled') + ` ${this.options['fn']} function in serverless.yml`);
                }
            }
            else {
                this.logger.message('Functions', c.reset.bold('disabled') + ' all functions in serverless.yml');
            }
        });
        this.deployAll = () => __awaiter(this, void 0, void 0, function* () {
            yield this.buildFunctions();
            yield this.deployFunctions();
        });
        this.deployFunctions = () => __awaiter(this, void 0, void 0, function* () {
            yield Bluebird.bind(this)
                .then(deployPackages_1.default.bind(this))
                .then(deployFunctions_1.deployFunctions.bind(this))
                .then(deployFunctions_1.deploySequences.bind(this))
                .then(deployTriggers_1.default.bind(this))
                .then(deployFeeds_1.default.bind(this))
                .then(deployRules_1.default.bind(this))
                .then(() => this.serverless.cli.log('Uploading the archives..'));
        });
        this.deployTestFunctions = () => __awaiter(this, void 0, void 0, function* () {
            this.serverless.service.deployTest = true;
            yield deployPackages_1.default.bind(this)();
            yield deployFunctions_1.deployFunctions.bind(this)();
        });
        this.logger = new Logger_1.Logger({ serverless });
        this.serverless = serverless;
        this.options = options;
        // Add wsk provider and deploy plugins
        this.serverless.pluginManager.addPlugin(OpenwhiskProvider);
        this.provider = this.serverless.getProvider('openwhisk');
        const version = this.serverless.getVersion();
        if (semver.lt(version, '1.0.0')) {
            throw new this.serverless.classes.Error('iwibot-serverless-build-plugin requires serverless@1.x.x');
        }
        this.servicePath = this.serverless.config.servicePath;
        this.tmpDir = path_1.join(this.servicePath, '.serverless');
        this.buildTmpDir = path_1.join(this.tmpDir, 'build');
        this.artifactTmpDir = path_1.join(this.tmpDir, 'artifacts');
        const doc = yaml.safeLoad(fs_1.readFileSync(path_1.join(this.servicePath, 'serverless.yml'), 'utf8'));
        Object.assign(this.serverless.service, { package: doc.package });
        this.serverless.service.triggers = [];
        this.serverless.service.rules = [];
        this.serverless.service.bindings = { fns: [], packages: [] };
        this.serverless.service.packages = [];
        this.serverless.service.apis = [];
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
        this.config = lutils_1.merge(this.config, lutils_1.clone(serverlessCustom.build || {}), lutils_1.clone(buildConfig), lutils_1.clone(options));
        const { functions } = this.serverless.service;
        const functionSelection = this.config.f || this.config.function;
        let selectedFunctions = [];
        selectedFunctions = lutils_1.isArray(functionSelection)
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
            obj[fnKey] = Object.assign({}, fnCfg, { name: fnKey, package: Object.assign({}, (fnCfg.package || {}), (this.config.functions[fnKey] || {}), { include,
                    exclude }) });
            return obj;
        }, {});
        this.hooks = {
            'before:iwibot:deployAll': initializeResources.bind(this),
            'iwibot:deployAll': this.deployAll.bind(this),
            'after:iwibot:deployAll:iwibot-deploy': deployApiGw_1.bindRoutes.bind(this),
            'iwibot:package:iwibot-package': this.buildFunctions.bind(this),
            'before:iwibot:deploy:iwibot-deploy': initializeResources.bind(this),
            'iwibot:deploy:iwibot-deploy': this.deployFunctions.bind(this),
            'iwibot:deploy:test:iwibot-deploy-test': this.deployTestFunctions.bind(this),
            'iwibot:api:bind:api-bind': deployApiGw_1.bindRoutes.bind(this),
            'iwibot:api:unbind:api-unbind': deployApiGw_1.unbindRoutes.bind(this),
            'iwibot:service:bind:service-bind': deployServiceBindings_1.bindServices.bind(this),
            'iwibot:service:unbind:service-unbind': deployServiceBindings_1.unbindServices.bind(this),
            'iwibot:bind:fin': this.afterDeploy.bind(this),
            'iwibot:bind:test:fin-test': this.afterTestDeploy.bind(this),
            'iwibot:unbind:unfin': this.unbindResources.bind(this),
            'iwibot:unbind:test:unfin-test': this.unbindTestResources.bind(this),
            'iwibot:template:create:create-from-template': this.createFromTemplate.bind(this),
            'iwibot:remove:iwibot-remove': this.removeFunctions.bind(this),
            'iwibot:remove:test:iwibot-remove-test': this.removeTestFunctions.bind(this),
            'iwibot:enable:iwibot-enable': this.enableFunctions.bind(this),
            'iwibot:disable:iwibot-disable': this.disableFunctions.bind(this)
        };
        this.commands = {
            iwibot: {
                usage: 'This plugin provides dependency bundling and deployment for nodejs functions with the openwhisk provider. \nYou can also bind resources to functions or packages and create new functions from a given language type (eg. nodejs).',
                lifecycleEvents: [
                    'deployAll'
                ],
                options: {},
                commands: {
                    bind: {
                        usage: 'Configure service bindings and api gateway definitions (shorthand for `sls iwibot service bind` and `sls iwibot api bind`)',
                        commands: {
                            test: {
                                usage: 'Configure service bindings and api gateway definitions for testing',
                                lifecycleEvents: ['fin-test']
                            }
                        },
                        lifecycleEvents: ['fin']
                    },
                    unbind: {
                        usage: 'remove the api gateway definitions and service bindings (shorthand for `sls iwibot service unbind` and `sls iwibot api unbind`)',
                        commands: {
                            test: {
                                usage: '',
                                lifecycleEvents: ['unfin-test']
                            }
                        },
                        lifecycleEvents: ['unfin']
                    },
                    package: {
                        usage: 'Package all iwibot functions',
                        lifecycleEvents: ['iwibot-package']
                    },
                    deploy: {
                        usage: 'Deploy all enabled iwibot functions',
                        commands: {
                            test: {
                                usage: 'Deploy all enabled functions to the /iwibotTest api',
                                lifecycleEvents: ['iwibot-deploy-test']
                            }
                        },
                        lifecycleEvents: ['iwibot-deploy']
                    },
                    remove: {
                        usage: 'Undeploy all enabled iwibot functions',
                        commands: {
                            test: {
                                usage: 'Remove all enabled functions from the test api',
                                lifecycleEvents: ['iwibot-remove-test'],
                                options: {
                                    force: {
                                        usage: 'force undeployment of all functions',
                                        shortcut: 'f'
                                    }
                                }
                            }
                        },
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
                            },
                            unbind: {
                                usage: 'Unbind services',
                                lifecycleEvents: [
                                    'service-unbind'
                                ]
                            }
                        }
                    },
                    api: {
                        usage: 'Use the bind command to configure the api gateway defenitions',
                        commands: {
                            bind: {
                                usage: 'Bind api gateway definitions',
                                lifecycleEvents: ['api-bind']
                            },
                            unbind: {
                                usage: 'Unbind api gateway definitions',
                                lifecycleEvents: ['api-unbind']
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
        this.fileBuild = new FileBuild_1.FileBuild({
            logger: this.logger,
            servicePath: this.servicePath,
            buildTmpDir: this.buildTmpDir,
            handlerEntryExt: this.config.handlerEntryExt,
            tryFiles: this.config.tryFiles,
        });
    }
    addYamlPartToFile(name, kind, fnPathName, handler, includes) {
        const doc = yaml.safeLoad(fs_1.readFileSync(path_1.join(this.servicePath, 'serverless.yml'), 'utf8'));
        const writePart = () => {
            doc.functions[name] = {
                enabled: true,
                relpath: fnPathName,
                name: name,
                runtime: kind === 'go' ? 'blackbox' : kind,
                handler: handler,
                package: {
                    name: this.serverless.service.package.name,
                    include: includes
                }
            };
            if (kind === 'go') {
                Object.assign(doc.functions[name], { kind: kind });
            }
            fs_1.writeFileSync(path_1.join(this.servicePath, 'serverless.yml'), yaml.safeDump(doc));
            this.logger.message('Template', 'part written to serverless.yml!');
        };
        if (doc.functions[name]) {
            process.stdin.resume();
            process.stdout.write('The function name already exists in the serverless.yml. Would you like to overwrite it? ' + c.reset.bold('Y|N') + ': ');
            process.stdin.once('data', (data) => {
                if (data.toString().trim() === 'y' || data.toString().trim() === 'Y' || data.toString().trim() === 'yes') {
                    writePart();
                }
                else {
                    this.logger.message('Template', `skipping yaml part for function ${name}`);
                }
                process.stdin.destroy();
            });
        }
        else {
            writePart();
        }
    }
    buildFunction(fnName, fnConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            const runtime = fnConfig.runtime || this.serverless.service.provider.runtime;
            if (!fnConfig.enabled) {
                if (this.options['verbose']) {
                    this.logger.message('FUNCTION', c.reset.bold(fnName) + c.red(' is excluded from packaging'));
                }
                return fnConfig;
            }
            else {
                this.logger.message('FUNCTION', c.reset.bold(fnName) + ' with runtime ' + c.reset.blue(runtime));
            }
            if (runtime.indexOf('nodejs') > -1) {
                return yield this.buildNodejsFunction(fnName, fnConfig);
            }
            if (runtime.indexOf('php') > -1) {
                return yield this.buildPhpFunction(fnName, fnConfig);
            }
            if (runtime.indexOf('java') > -1) {
                return yield this.buildJavaFunction(fnName, fnConfig);
            }
            if (runtime.indexOf('python') > -1) {
                return this.buildPythonFunction(fnName, fnConfig);
            }
            if (runtime.indexOf('blackbox') > -1) {
                switch (fnConfig.kind) {
                    case 'go':
                        return yield this.buildGoFunction(fnName, fnConfig);
                }
            }
            return fnConfig;
        });
    }
    buildGoFunction(fnName, fnConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            const artifact = Archiver('zip', this.config.zip);
            this.setConfig(false, false, false, false);
            return new Promise((resolve, reject) => {
                process.chdir(path_1.join(this.servicePath, fnConfig.relpath, 'src', 'de.hska.iwibot.actions.go'));
                // prepare go env for cross compilation
                process.env.GOPATH = path_1.join(this.servicePath, fnConfig.relpath);
                process.env.GOOS = 'linux';
                process.env.GOARCH = 'amd64';
                // download the dependencies
                const getRes = child_process_1.spawn('go', ['get']);
                getRes.stdout.on('data', (data) => {
                    console.log('' + data);
                });
                getRes.on('close', (code) => {
                    if (code === 0) {
                        // build the executable
                        const res = child_process_1.spawn('go', ['build', '-o', path_1.join('..', '..', 'bin', 'exec')]);
                        res.stdout.on('data', (data) => {
                            console.log('' + data);
                        });
                        res.on('close', (code) => __awaiter(this, void 0, void 0, function* () {
                            if (code === 0) {
                                const sourceBundler = new SourceBundler_1.SourceBundler({
                                    logger: this.logger,
                                    archive: artifact,
                                    servicePath: path_1.join(this.servicePath, fnConfig.relpath, 'bin'),
                                });
                                this.logger.log('');
                                yield sourceBundler.bundle({
                                    exclude: [],
                                    include: ['exec'],
                                });
                                delete process.env.GOPATH;
                                delete process.env.GOOS;
                                delete process.env.GOARCH;
                                fnConfig = yield this.completeFunctionArtifact(fnConfig, artifact);
                                process.chdir(this.servicePath);
                                resolve(fnConfig);
                            }
                            else {
                                process.chdir(this.servicePath);
                                reject();
                            }
                        }));
                    }
                    else {
                        delete process.env.GOPATH;
                        delete process.env.GOOS;
                        delete process.env.GOARCH;
                        process.chdir(this.servicePath);
                        reject();
                    }
                });
            });
        });
    }
    setConfig(sourceMaps, uglify, uglifySource, uglifyModules) {
        this.config.sourceMaps = sourceMaps;
        this.config.uglify = uglify;
        this.config.uglifySource = uglifySource;
        this.config.uglifyModules = uglifyModules;
    }
    buildPythonFunction(fnName, fnConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            const artifact = Archiver('zip', this.config.zip);
            this.setConfig(false, false, false, false);
            yield fs_extra_1.copy(path_1.join(this.servicePath, fnConfig.relpath, 'requirements.txt'), path_1.join(this.servicePath, '.serverless', 'requirements', 'reqirements.txt'));
            this.serverless.pluginManager.addPlugin(require('serverless-python-requirements'));
            yield this.serverless.pluginManager.invoke(['requirements', 'install']);
            const sourceBundler = new SourceBundler_1.SourceBundler({
                logger: this.logger,
                archive: artifact,
                // requirements are packages with another plugin and the __main__.py
                // need to be at the root of the zip, so the relative path here is lib. Not the action root dir!
                servicePath: path_1.join(this.servicePath, fnConfig.relpath, 'lib')
            });
            const sourceBundlerPythonRequirements = new SourceBundler_1.SourceBundler({
                logger: this.logger,
                archive: artifact,
                servicePath: path_1.join('.serverless', fnConfig.relpath)
            });
            this.logger.log('');
            yield sourceBundler.bundle({
                exclude: fnConfig.package.exclude,
                include: ['**/*'],
            });
            this.logger.log('');
            yield sourceBundlerPythonRequirements.bundle({
                exclude: fnConfig.package.exclude,
                include: ['**/*']
            });
            const result = yield this.completeFunctionArtifact(fnConfig, artifact);
            this.logger.log('');
            yield this.serverless.pluginManager.invoke(['requirements', 'clean']);
            return result;
        });
    }
    buildPhpFunction(fnName, fnConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            this.setConfig(false, false, false, false);
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let moduleIncludes;
                const artifact = Archiver('zip', this.config.zip);
                process.chdir(fnConfig.relpath);
                const res = child_process_1.spawn('composer', ['install']);
                res.stdout.on('data', (data) => {
                    console.log('' + data);
                });
                res.on('close', (code) => __awaiter(this, void 0, void 0, function* () {
                    if (code === 0) {
                        let sourceBundler = new SourceBundler_1.SourceBundler({
                            logger: this.logger,
                            archive: artifact,
                            servicePath: path_1.join(this.servicePath, fnConfig.relpath, 'lib'),
                        });
                        yield sourceBundler.bundle({
                            exclude: fnConfig.package.exclude,
                            include: ['*'],
                        });
                        sourceBundler = null;
                        sourceBundler = new SourceBundler_1.SourceBundler({
                            logger: this.logger,
                            archive: artifact,
                            servicePath: path_1.join(this.servicePath, fnConfig.relpath),
                        });
                        yield sourceBundler.bundle({
                            exclude: ['lib'],
                            include: fnConfig.package.include.filter((el) => { return el.indexOf('lib') === -1; })
                        });
                        const result = yield this.completeFunctionArtifact(fnConfig, artifact);
                        process.chdir('..');
                        resolve(result);
                    }
                    else {
                        reject();
                    }
                }));
            }));
        });
    }
    buildJavaFunction(fnName, fnConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            this.setConfig(false, false, false, false);
            return new Promise((resolve, reject) => {
                const res = child_process_1.spawn('mvn', ['package', '-f' + fnConfig.relpath]);
                res.stdout.on('data', (data) => console.log('' + data));
                res.on('close', (code) => {
                    if (code === 0) {
                        // copy jar to artifacts dir (.serverless)
                        let targetPath = '';
                        if (fnConfig.package && fnConfig.package.name) {
                            targetPath = path_1.join(path.resolve('.serverless'), fnConfig.package.name, fnName + '.jar');
                        }
                        else {
                            targetPath = path_1.join(path.resolve('.serverless'), fnName + '.jar');
                        }
                        fs_extra_1.copySync(path_1.join(path.resolve(fnConfig.relpath), 'target', fnName + '.jar'), targetPath);
                        resolve(fnConfig);
                    }
                    else {
                        reject();
                    }
                });
            });
        });
    }
    /**
     * Builds a function into an streaming zip artifact
     * and sets it in `serverless.yml:functions[fnName].artifact`
     * in order for `serverless` to consume it.
     */
    buildNodejsFunction(fnName, fnConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            let moduleIncludes;
            const { nodejsMethod } = this.config;
            const artifact = Archiver('zip', this.config.zip);
            this.setConfig(true, false, false, false);
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                process.chdir(fnConfig.relpath);
                let cmd = 'npm';
                if (process.platform.indexOf('darwin') === -1 && process.platform.indexOf('win') > -1) {
                    cmd = 'npm.cmd';
                }
                const res = child_process_1.spawn(cmd, ['install']);
                res.stdout.on('data', (data) => {
                    console.log('' + data);
                });
                if (nodejsMethod === 'bundle') {
                    const sourceBundler = new SourceBundler_1.SourceBundler({
                        uglify: this.config.uglifySource
                            ? this.config.uglify
                            : undefined,
                        babel: this.config.babel,
                        sourceMaps: this.config.sourceMaps,
                        transformExtensions: this.config.transformExtensions,
                        logger: this.logger,
                        archive: artifact,
                        servicePath: path_1.join(this.servicePath, fnConfig.relpath),
                    });
                    this.logger.log('');
                    yield sourceBundler.bundle({
                        exclude: [],
                        include: ['**/*', 'lib/**/*', '*']
                    });
                }
                else if (nodejsMethod === 'file') {
                    //
                    // BUILD FILE
                    //
                    yield this.fileBuild.build(fnConfig, artifact);
                    moduleIncludes = this.fileBuild.externals;
                }
                else {
                    throw new Error('Unknown build method');
                }
                res.on('close', (code) => __awaiter(this, void 0, void 0, function* () {
                    if (code === 0) {
                        this.logger.log('');
                        yield new NodeJsModuleBundler_1.NodeJsModuleBundler({
                            logger: this.logger,
                            uglify: this.config.uglifyModules
                                ? this.config.uglify
                                : undefined,
                            servicePath: path_1.join(this.servicePath, fnConfig.relpath),
                            archive: artifact,
                        }).bundle(Object.assign({ include: Array.from(moduleIncludes || []) }, this.config.modules));
                        this.logger.log('');
                        const result = yield this.completeFunctionArtifact(fnConfig, artifact);
                        this.logger.log('');
                        process.chdir(this.servicePath);
                        resolve(result);
                    }
                    else {
                        process.chdir(this.servicePath);
                        reject();
                    }
                }));
            }));
        });
    }
    /**
     *  Writes the `artifact` and attaches it to serverless
     */
    completeFunctionArtifact(fnConfig, artifact) {
        return __awaiter(this, void 0, void 0, function* () {
            let artifactPath = path_1.join(this.servicePath, '.serverless', `${fnConfig['name']}.zip`);
            if (fnConfig['package'] && fnConfig['package']['name']) {
                yield fs_extra_1.ensureDir(path_1.join(this.servicePath, '.serverless', fnConfig['package']['name']));
                artifactPath = path_1.join(this.servicePath, '.serverless', fnConfig['package']['name'], `${fnConfig['name']}.zip`);
            }
            // create zip file from buffered zip archive
            yield new Promise((resolve, reject) => {
                const stream = fs_extra_1.createWriteStream(artifactPath);
                stream
                    .on('error', reject)
                    .on('close', resolve);
                artifact.pipe(stream);
                artifact.finalize();
            });
            const size = `${(artifact.pointer() / 1024 / 1024).toFixed(4)} MB`;
            this.logger.message('ARTIFACT', `${c.bold.blue(artifactPath)} ${c.blue(size)}`);
            return fnConfig;
        });
    }
}
exports.ServerlessBuildPlugin = ServerlessBuildPlugin;

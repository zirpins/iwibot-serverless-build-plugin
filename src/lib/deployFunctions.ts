import * as Bluebird from 'bluebird';
import * as JSZip from 'jszip';
import * as fs from 'fs';
import * as c from 'chalk'
import {spawn} from "child_process";
import {join, resolve} from "path";

export function deployFunctions() {
    this.serverless.cli.log('Deploying Functions...');
    return filterActions.bind(this)().then(names => {
        return deployActions.bind(this)(names);
    })
}

export function deploySequences() {
    filterActions.bind(this)(true).then(sequences => {
        if (sequences.length) {
            this.serverless.cli.log('Deploying Sequences...');
        }

        return deployActions.bind(this)(sequences);
    });
}

function calculateFunctionMain(functionObject) {
    const splitted = functionObject.handler.split('.');
    if (functionObject.runtime === 'java') {
        return functionObject.handler;
    }
    if (splitted.length < 2) {
        return functionObject;
    }
    return splitted[splitted.length - 1];
}

async function filterActions(sequence) {
    const functionsObj = this.serverless.service.functions;
    const kind = action => action.runtime; // TODO: sequence !!
    const match = action => ((kind(action) === 'sequence') === !!sequence);
    return Object.keys(functionsObj).filter(a => match(functionsObj[a]));
}

function convertAnnotations(annotations) {
    if (!annotations) {
        return {};
    }
    return Object.keys(annotations).map((ano) => {
       return { key: ano, value: annotations[ano]};
    });
}

function getArtifactZip(fnConfig) {
    const artifactPath = getArtifactPath.bind(this)(fnConfig)
    const readFile = Bluebird.promisify(fs.readFile);
    return readFile(artifactPath).then(zipBuffer => JSZip.loadAsync(zipBuffer))
}

function getArtifactPath(fnConfig) {
    let name = fnConfig.name;

    // Prefix the artifact path with the package name or use the default package path
    if (fnConfig.package && fnConfig.package.name) {
        name = join(fnConfig.package.name, fnConfig.name)
    }
    const ext = fnConfig.runtime.indexOf('java') > -1 ? '.jar' : '.zip'
    return resolve('.serverless', name + ext)
}

function deployActions(names) {
    const functions = this.serverless.service.functions;

    return Bluebird.all(
        names.map(name =>  {
            return new Promise((resolveProm, reject) => {
                if (functions[name].enabled) {
                    if (functions[name].runtime === 'blackbox') {
                        // handle binary actions
                        let zipPath = '';
                        let tmpName = name;

                        if (functions[name].package && functions[name].package.name) {
                            zipPath = resolve('.serverless', functions[name].package.name, functions[name].name + '.zip')
                            if (this.serverless.service.deployTest) {
                                tmpName = this.serverless.service.package.testname + '/' + functions[name].name
                            } else {
                                tmpName = functions[name].package.name + '/' + functions[name].name
                            }
                        } else {
                            zipPath = resolve('.serverless', functions[name].name + '.zip')
                        }
                        const res = spawn('ibmcloud', ['fn', 'action', 'update', tmpName, '--native', zipPath]);
                        res.stdout.on('data', (data) => {
                            console.log('' + data);
                        });

                        res.on('close', (code) => {
                            if (code === 0) {
                                this.serverless.cli.log('binary function created');
                                resolveProm();
                            } else {
                                this.logger.error('error creating binary function');
                                reject();
                            }
                        });

                    } else {
                        // handle action with specific kind/runtime
                        deployFunctionHandler.bind(this)(functions[name])
                        resolveProm();
                    }
                } else {
                    if (this.options.verbose) {
                        this.logger.message('Function', c.reset.bold(name) + c.red(' is excluded from deployment'));
                    }
                    resolveProm();
                }
            });
        })
    );
}

async function deployFunctionHandler(functionHandler) {
    const props = await this.serverless.getProvider('openwhisk').props();

    functionHandler.namespace = props['namespace'];
    functionHandler.overwrite = true;
    functionHandler.action = {
        exec: {
            main: calculateFunctionMain.bind(this)(functionHandler),
            kind: functionHandler.runtime
        },
        limits: {},
    };

    try {
        const zip = await getArtifactZip.bind(this)(functionHandler);
        const buf = await zip.generateAsync(
            { type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }}
        );

        functionHandler.action.exec.code = buf.toString('base64');
    } catch (e) {
        throw new Error(e);
    }

    if (this.serverless.service.deployTest) {
        functionHandler.name = this.serverless.service.package.testname.concat('/').concat(functionHandler.name)
        Object.assign(functionHandler.action, { annotations: convertAnnotations( { 'web-export': true })})
    } else if (functionHandler.package && functionHandler.package.name) {
        functionHandler.name = functionHandler.package.name + '/' + functionHandler.name
    }

    if (!this.serverless.service.deployTest && functionHandler.annotations) {
        Object.assign(functionHandler.action, { annotations: convertAnnotations(functionHandler.annotations)});
    }

    return this.provider.client().then(ow => {

        if (this.options.verbose) {
            this.serverless.cli.log(`Deploying Function: ${functionHandler.name}`);
        }

        return ow.actions.update(functionHandler)
            .then(() => {
                this.serverless.cli.log(`Deployed Function: ${functionHandler.name}`);
            })
            .catch(err => {
                throw new this.serverless.classes.Error(
                    `Failed to deploy function (${JSON.stringify(functionHandler, null, 2)}) due to error: ${err.message}`
                );
            })}
    );
}

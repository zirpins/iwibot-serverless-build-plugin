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
const Bluebird = require("bluebird");
const JSZip = require("jszip");
const fs = require("fs");
const c = require("chalk");
const child_process_1 = require("child_process");
const path_1 = require("path");
function deployFunctions() {
    this.serverless.cli.log('Deploying Functions...');
    return filterActions.bind(this)().then(names => {
        return deployActions.bind(this)(names);
    });
}
exports.deployFunctions = deployFunctions;
function deploySequences() {
    filterActions.bind(this)(true).then(sequences => {
        if (sequences.length) {
            this.serverless.cli.log('Deploying Sequences...');
        }
        return deployActions.bind(this)(sequences);
    });
}
exports.deploySequences = deploySequences;
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
function filterActions(sequence) {
    return __awaiter(this, void 0, void 0, function* () {
        const functionsObj = this.serverless.service.functions;
        const kind = action => action.runtime; // TODO: sequence !!
        const match = action => ((kind(action) === 'sequence') === !!sequence);
        return Object.keys(functionsObj).filter(a => match(functionsObj[a]));
    });
}
function convertToKeyValue(annotations) {
    if (!annotations) {
        return {};
    }
    return Object.keys(annotations).map((ano) => {
        return { key: ano, value: annotations[ano] };
    });
}
function getArtifactZip(fnConfig) {
    const artifactPath = getArtifactPath.bind(this)(fnConfig);
    const readFile = Bluebird.promisify(fs.readFile);
    return readFile(artifactPath).then(zipBuffer => JSZip.loadAsync(zipBuffer));
}
function getArtifactPath(fnConfig) {
    let name = fnConfig.name;
    // Prefix the artifact path with the package name or use the default package path
    if (fnConfig.package && fnConfig.package.name) {
        name = path_1.join(fnConfig.package.name, fnConfig.name);
    }
    const ext = fnConfig.runtime.indexOf('java') > -1 ? '.jar' : '.zip';
    return path_1.resolve('.serverless', name + ext);
}
function deployActions(names) {
    const functions = this.serverless.service.functions;
    return Bluebird.all(names.map(name => {
        return new Promise((resolveProm, reject) => {
            if (functions[name].enabled) {
                if (functions[name].runtime === 'blackbox') {
                    // handle binary actions
                    let zipPath = '';
                    let tmpName = name;
                    if (functions[name].package && functions[name].package.name) {
                        zipPath = path_1.resolve('.serverless', functions[name].package.name, functions[name].name + '.zip');
                        if (this.serverless.service.deployTest) {
                            tmpName = this.serverless.service.package.testname + '/' + functions[name].name;
                        }
                        else {
                            tmpName = functions[name].package.name + '/' + functions[name].name;
                        }
                    }
                    else {
                        zipPath = path_1.resolve('.serverless', functions[name].name + '.zip');
                    }
                    const res = child_process_1.spawn('ibmcloud', ['fn', 'action', 'update', tmpName, '--native', zipPath]);
                    res.stdout.on('data', (data) => {
                        console.log('' + data);
                    });
                    res.on('close', (code) => {
                        if (code === 0) {
                            this.serverless.cli.log('binary function created');
                            resolveProm();
                        }
                        else {
                            this.logger.error('error creating binary function');
                            reject();
                        }
                    });
                }
                else {
                    // handle action with specific kind/runtime
                    deployFunctionHandler.bind(this)(functions[name]);
                    resolveProm();
                }
            }
            else {
                if (this.options.verbose) {
                    this.logger.message('Function', c.reset.bold(name) + c.red(' is excluded from deployment'));
                }
                resolveProm();
            }
        });
    }));
}
function deployFunctionHandler(functionHandler) {
    return __awaiter(this, void 0, void 0, function* () {
        const props = yield this.serverless.getProvider('openwhisk').props();
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
            const zip = yield getArtifactZip.bind(this)(functionHandler);
            const buf = yield zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
            functionHandler.action.exec.code = buf.toString('base64');
        }
        catch (e) {
            throw new Error(e);
        }
        if (functionHandler.parameters) {
            Object.assign(functionHandler.action, { parameters: convertToKeyValue(functionHandler.parameters) });
        }
        if (this.serverless.service.deployTest) {
            functionHandler.name = this.serverless.service.package.testname.concat('/').concat(functionHandler.name);
            Object.assign(functionHandler.action, { annotations: convertToKeyValue({ 'web-export': true }) });
        }
        else if (functionHandler.package && functionHandler.package.name) {
            functionHandler.name = functionHandler.package.name + '/' + functionHandler.name;
        }
        if (!this.serverless.service.deployTest && functionHandler.annotations) {
            Object.assign(functionHandler.action, { annotations: convertToKeyValue(functionHandler.annotations) });
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
                throw new this.serverless.classes.Error(`Failed to deploy function (${JSON.stringify(functionHandler, null, 2)}) due to error: ${err.message}`);
            });
        });
    });
}

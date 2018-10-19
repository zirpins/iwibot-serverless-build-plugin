"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const Bluebird = require("bluebird");
const c = require("chalk");
function unbindServices() {
    const bindings = getServiceBindings.bind(this)();
    if (bindings.fns.length || bindings.packages.length) {
        this.serverless.cli.log('Unbind Service Bindings...');
    }
    return Bluebird.all(bindings.packages.map(sbs => Bluebird.mapSeries(sbs, sb => unbindService.bind(this)(sb)))).then(() => Bluebird.all(bindings.fns.map(sb => unbindService.bind(this)(sb))));
}
exports.unbindServices = unbindServices;
function bindServices() {
    const bindings = getServiceBindings.bind(this)();
    if (bindings.fns.length || bindings.packages.length) {
        this.serverless.cli.log('Configuring Service Bindings...');
    }
    return Bluebird.all(bindings.packages.map(sbs => Bluebird.mapSeries(sbs, sb => bindService.bind(this)(sb)))).then(() => Bluebird.all(bindings.fns.map(sb => bindService.bind(this)(sb))));
}
exports.bindServices = bindServices;
function unbindTestServices() {
    return unbindServices.call(this);
}
exports.unbindTestServices = unbindTestServices;
function bindTestServices() {
    return bindServices.call(this);
}
exports.bindTestServices = bindTestServices;
function bindService(binding) {
    if (this.options.verbose) {
        this.serverless.cli.log(`Configuring Service Binding: ${JSON.stringify(binding)}`);
    }
    let actionName = binding.action;
    if (this.serverless.service.deployTest) {
        actionName = this.serverless.service.package.testname + '/' + binding.tmpAction;
    }
    return new Promise((resolve, reject) => {
        const stderr = [];
        let hasBinding = false;
        // First get the action
        let args = ['wsk', 'action', 'get', actionName];
        const ibmcloud = child_process_1.spawn(`ibmcloud`, args);
        ibmcloud.stdout.on('data', (data) => {
            if (('' + data).indexOf(binding.type) > -1) {
                hasBinding = true;
            }
        });
        ibmcloud.stderr.on('data', (data) => {
            stderr.push('' + data);
        });
        ibmcloud.on('error', (err) => {
            if (err.name === 'ENOENT') {
                const err = new this.serverless.classes.Error('Unable to execute `ibmcloud wsk action get` command. Is IBM Cloud CLI installed?');
                return reject(err);
            }
            reject(err.message);
        });
        ibmcloud.on('close', (code) => {
            const stdout = [];
            const stderr = [];
            if (code === 2) {
                const err = new this.serverless.classes.Error('Unable to execute `ibmcloud wsk action get` command. Is IBM Cloud Functions CLI plugin installed?');
                return reject(err);
            }
            if (code > 0) {
                const errmsg = (stderr[0] || '').split('\n')[0];
                const err = new this.serverless.classes.Error(`Failed to configure service binding (${JSON.stringify(binding)})\n  ${errmsg}`);
                return reject(err);
            }
            if (this.options.verbose) {
                this.serverless.cli.log(`Configured Service Binding: ${JSON.stringify(binding)}`);
            }
            if (!hasBinding) {
                args = ['wsk', 'service', 'bind', binding.type, actionName, '--keyname', binding.key, '--instance', binding.instance];
                const ibmcloud2 = child_process_1.spawn('ibmcloud', args);
                ibmcloud2.stdout.on('data', (data) => {
                    stdout.push(data.toString());
                });
                ibmcloud2.stderr.on('data', (data) => {
                    stderr.push(data.toString());
                });
                ibmcloud2.on('error', (err) => {
                    if (err.name === 'ENOENT') {
                        const err = new this.serverless.classes.Error('Unable to execute `ibmcloud wsk service bind` command. Is IBM Cloud CLI installed?');
                        return reject(err);
                    }
                    reject(err.message);
                });
                ibmcloud2.on('close', (code) => {
                    if (code === 2) {
                        const err = new this.serverless.classes.Error('Unable to execute `ibmcloud wsk action get` command. Is IBM Cloud Functions CLI plugin installed?');
                        return reject(err);
                    }
                    if (code > 0) {
                        const errmsg = (stderr[0] || '').split('\n')[0];
                        const err = new this.serverless.classes.Error(`Failed to configure service binding (${JSON.stringify(binding)})\n  ${errmsg}`);
                        return reject(err);
                    }
                    if (this.options.verbose) {
                        this.serverless.cli.log(`Configured Service Binding: ${JSON.stringify(binding)}`);
                    }
                    console.log(`Service ${c.reset.bold.blue(binding.type)} bound to ${c.reset.bold.blue(actionName)}`);
                    resolve();
                });
            }
            else {
                console.log(`Service ${c.reset.bold.blue(binding.type)} already bound to ${c.reset.bold.blue(actionName)}`);
                resolve();
            }
        });
    });
}
function unbindService(binding) {
    if (this.options.verbose) {
        this.serverless.cli.log(`Unbind Service Binding: ${JSON.stringify(binding)}`);
    }
    let actionName = binding.action;
    if (this.serverless.service.deployTest) {
        actionName = this.serverless.service.package.testname + '/' + binding.tmpAction;
    }
    return new Promise((resolve, reject) => {
        // First get the action
        let args = ['wsk', 'action', 'get', actionName];
        const ibmcloud = child_process_1.spawn('ibmcloud', args);
        const stdout = [];
        const stderr = [];
        let hasBinding = false;
        ibmcloud.stdout.on('data', (data) => {
            if (('' + data).indexOf(binding.type) > -1) {
                hasBinding = true;
            }
        });
        ibmcloud.stderr.on('data', (data) => {
            stderr.push(data.toString());
        });
        ibmcloud.on('error', (err) => {
            if (err.name === 'ENOENT') {
                const err = new this.serverless.classes.Error('Unable to execute `ibmcloud wsk action get` command. Is IBM Cloud CLI installed?');
                return reject(err);
            }
            reject(err.message);
        });
        ibmcloud.on('close', (code) => {
            if (code === 2) {
                const err = new this.serverless.classes.Error('Unable to execute `ibmcloud wsk service unbind` command. Is IBM Cloud Functions CLI plugin installed?');
                return reject(err);
            }
            if (code > 0) {
                const errmsg = (stderr[0] || '').split('\n')[0];
                const err = new this.serverless.classes.Error(`Failed to unbind service binding (${JSON.stringify(binding)})\n  ${errmsg}`);
                return reject(err);
            }
            if (this.options.verbose) {
                this.serverless.cli.log(`Service unbound from action ${actionName}`);
            }
            if (hasBinding) {
                args = ['wsk', 'service', 'unbind', binding.type, actionName];
                const ibmcloud2 = child_process_1.spawn('ibmcloud', args);
                ibmcloud2.stdout.on('data', (data) => {
                    stdout.push(data.toString());
                });
                ibmcloud2.stderr.on('data', (data) => {
                    stderr.push(data.toString());
                });
                ibmcloud2.on('error', (err) => {
                    if (err.name === 'ENOENT') {
                        const err = new this.serverless.classes.Error('Unable to execute `ibmcloud wsk service unbind` command. Is IBM Cloud CLI installed?');
                        return reject(err);
                    }
                    reject(err.message);
                });
                ibmcloud2.on('close', (code) => {
                    if (code === 2) {
                        const err = new this.serverless.classes.Error('Unable to execute `ibmcloud wsk service unbind` command. Is IBM Cloud Functions CLI plugin installed?');
                        return reject(err);
                    }
                    if (code > 0) {
                        const errmsg = (stderr[0] || '').split('\n')[0];
                        const err = new this.serverless.classes.Error(`Failed to configure service binding (${JSON.stringify(binding)})\n  ${errmsg}`);
                        return reject(err);
                    }
                    if (this.options.verbose) {
                        this.serverless.cli.log(`Unbound Service Binding: ${JSON.stringify(binding)}`);
                    }
                    console.log(`Service ${c.reset.bold.blue(binding.type)} unbound from ${c.reset.bold.blue(actionName)}`);
                    resolve();
                });
            }
            else {
                console.log(`Service ${c.reset.bold.blue(binding.type)} not bound to ${c.reset.bold.blue(actionName)}`);
                resolve();
            }
        });
    });
}
function getServiceBindings() {
    Object.keys(this.serverless.service.functions).map((fnName) => {
        const fnConfig = this.serverless.service.functions[fnName];
        const bindings = fnConfig.bind;
        if (!fnConfig.enabled) {
            if (this.options.verbose) {
                this.logger.message('SERVICE_BINDINGS', 'Bindings for function ' + c.reset.bold(fnName) + c.red(' are excluded from deployment'));
            }
            return;
        }
        if (bindings && bindings.length) {
            bindings.reduce((val, el) => {
                if (fnConfig.package && fnConfig.package.name) {
                    val.fns.push(Object.assign(el.service, { action: fnConfig.package.name + '/' + fnConfig.name, tmpAction: fnConfig.name }));
                }
                else {
                    val.fns.push(Object.assign(el.service, { action: fnConfig.name, tmpAction: fnConfig.name }));
                }
            }, this.serverless.service.bindings);
        }
    });
    return this.serverless.service.bindings;
}

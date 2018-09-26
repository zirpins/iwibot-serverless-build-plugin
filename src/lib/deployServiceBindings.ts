import {spawn} from "child_process";
import Bluebird = require("bluebird");
import * as c from "chalk";

function configureServiceBinding(binding) {
    if (this.options.verbose) {
        this.serverless.cli.log(`Configuring Service Binding: ${JSON.stringify(binding)}`);
    }

    return new Promise((resolve, reject) => {
        const args = ['wsk', 'service', 'bind', binding.name, binding.action]

        if (binding.instance) {
            args.push("--instance", binding.instance)
        }

        if (binding.key) {
            args.push("--keyname", binding.key)
        }

        const ibmcloud = spawn('ibmcloud', args);

        const stdout = []
        const stderr = []

        ibmcloud.stdout.on('data', data => {
            stdout.push(data.toString())
        });

        ibmcloud.stderr.on('data', (data) => {
            stderr.push(data.toString())
        });

        ibmcloud.on('error', (err) => {
            if (err.name === 'ENOENT') {
                const err = new this.serverless.classes.Error(
                    'Unable to execute `ibmcloud wsk service bind` command. Is IBM Cloud CLI installed?'
                )
                return reject(err)
            }
            reject(err.message)
        });

        ibmcloud.on('close', (code) => {
            if (code === 2) {
                const err = new this.serverless.classes.Error(
                    'Unable to execute `ibmcloud wsk service bind` command. Is IBM Cloud Functions CLI plugin installed?'
                )
                return reject(err)
            }
            if (code > 0) {
                const errmsg = (stderr[0] || '').split('\n')[0]
                const err = new this.serverless.classes.Error(`Failed to configure service binding (${JSON.stringify(binding)})\n  ${errmsg}`);
                return reject(err)
            }
            if (this.options.verbose) {
                this.serverless.cli.log(`Configured Service Binding: ${JSON.stringify(binding)}`);
            }
            resolve()
        });
    });
}

export default function configureServiceBindings() {
    const bindings = getServiceBindings.bind(this)();

    if (bindings.fns.length || bindings.packages.length) {
        this.serverless.cli.log('Configuring Service Bindings...');
    }

    return Bluebird.all(
        bindings.packages.map(sbs => Bluebird.mapSeries(sbs, sb => configureServiceBinding.bind(this)(sb)))
    ).then(() => Bluebird.all(
        bindings.fns.map(sb => configureServiceBinding.bind(this)(sb)))
    );
}

function getServiceBindings() {
    this.serverless.service.bindings = { fns: [], packages: []};
    Object.keys(this.serverless.service.functions).map((fnName)=> {
        const bindings = this.serverless.service.functions[fnName].bind;

        if (!this.serverless.service.functions[fnName].enabled) {
            return this.logger.message('SERVICE_BINDINGS', 'Bindings for function ' + c.reset.bold(fnName) + c.red(' are excluded from deployment'));
        }

        if (bindings && bindings.length) {
            bindings.reduce((val, el)=> {
                    val.fns.push(Object.assign(el.service, { action: this.serverless.service.functions[fnName].name }));
                },
                this.serverless.service.bindings
            );
        }
        // TODO implement package bindings deployment
    });

    return this.serverless.service.bindings;
}
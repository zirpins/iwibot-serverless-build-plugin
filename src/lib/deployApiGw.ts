const Bluebird = require("bluebird");
import * as c from "chalk";

export function bindRoutes() {
    const routes = getRoutes.bind(this)();
    return _bindRoutes.bind(this)(routes);
}

export function unbindRoutes() {
    const routes = getRoutes.bind(this)();
    return unbindSequentialRoutes.bind(this)(routes)
}

export async function bindTestRoutes() {
    const routes = await getTestRoutes.bind(this)();
    debugger
    return _bindRoutes.bind(this)(routes);
}

export async function unbindTestRoutes() {
    const routes = await getTestRoutes.bind(this)();
    return unbindSequentialRoutes.bind(this)(routes);
}

function getTestRoutes() {
    return this.provider.client().then(async (ow) => {
        const routes = [];

        const result = await ow.packages.get({ name: this.serverless.service.package.testname});

        await Bluebird.all(
            result.actions.map( (fnConfig) => {
                if (this.serverless.service.functions[fnConfig.name].enabled || this.options['force']) {
                    fnConfig = this.serverless.service.functions[fnConfig.name]
                    routes.push({
                        action: this.serverless.service.package.testname + '/' + fnConfig.name,
                        basepath: this.serverless.service.package.testbasepath,
                        relpath: '/' + fnConfig.name.toLowerCase(),
                        operation: 'post',
                        'response-type': fnConfig.events.length > 0 && fnConfig.events[0].http ? fnConfig.events[0].http.responsetype : 'json',
                        responsetype: fnConfig.events.length > 0 && fnConfig.events[0].http ? fnConfig.events[0].http.responsetype : 'json',
                        cors: 'true'
                    })
                }
            })
        );
        return routes
    });
}

function getRoutes() {
    Object.keys(this.serverless.service.functions).map((fnName)=> {
        const fnConfig = this.serverless.service.functions[fnName];

        if (!fnConfig.enabled) {
            return
        }

        const events = fnConfig.events;
        if (events && events.length) {
            return events.reduce((val, el)=> {
                    if (fnConfig.package && fnConfig.package.name) {
                        val.push(Object.assign(el.http, { action: fnConfig.package.name + '/' + fnConfig.name, tmpAction: fnConfig.name }));
                    } else {
                        val.push(Object.assign(el.http, { action: fnConfig.name, tmpAction: fnConfig.name  }));
                    }
                },
                this.serverless.service.apis
            );
        }

        return [];
    });

    return this.serverless.service.apis;
}

function bindRoute(route) {
    return this.provider.client().then((ow) => {
       return ow.routes.create(route).then((code) => {

            if (this.options.verbose) {
                this.serverless.cli.log(`${c.green('configured')} ${c.blue('gateway')} definition ${JSON.stringify(route, null, 2)}`)
            } else {
                this.serverless.cli.log(`${c.green('configured')} ${c.blue('gateway')} definition ${route.basepath}${route.relpath}`)
            }
        }).catch((err) => {
            if (err.message.indexOf('Endpoint name not unique') > -1) {
                this.serverless.cli.log(`The ${c.blue('gateway')} definition ${c.reset.bold(route.basepath+ route.relpath)} already exists`)
            } else {
                this.serverless.cli.log(`${err.message}`)
            }
        })
    });
}

function unbindRoute(route) {
    if (this.serverless.service.deployTest) {
        route.action = this.serverless.service.package.testname + '/' + route.tmpAction
    }

    return this.provider.client().then((ow) => {
        return ow.routes.delete(route).then(() => {
            if (this.options.verbose) {
                this.serverless.cli.log(`${c.red('deleted')} ${c.blue('gateway')} definition ${JSON.stringify(route, null, 2)}`)
            } else {
                this.serverless.cli.log(`${c.red('deleted')} ${c.blue('gateway')} definition ${route.basepath}${route.relpath}`)
            }
        }).catch((err) => {

        })
    });
}

function unbindSequentialRoutes(routes) {
    if (routes.length) {
        this.serverless.cli.log('Unbind API Gateway definitions...');
        // Unbind sequential, because more routes can be deleted
        return Bluebird.mapSeries(routes, (r) => unbindRoute.bind(this)(r))
    }
    return Bluebird.resolve()
}

function _bindRoutes(routes) {
    if (routes.length) {
        this.serverless.cli.log('Configure API Gateway definitions...');
        return routes.map((r) => bindRoute.bind(this)(r))
    }
    return Bluebird.resolve();
}
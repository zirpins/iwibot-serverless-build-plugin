import Bluebird = require("bluebird");
import * as c from "chalk";

export default function deployRoutes() {
    this.serverless.service.bindings = [];
    Object.keys(this.serverless.service.functions).map((fnName)=> {
        const events = this.serverless.service.functions[fnName].events;

        if (this.serverless.service.functions[fnName].enabled && (events && events.length)) {
            events.reduce((val, el)=> {
                    val.push(el.http)
                },
                this.serverless.service.bindings
            );
        }
    });
    if (this.serverless.service.bindings.length === 0) {
        return Bluebird.resolve();
    }

    this.serverless.cli.log('Deploying API Gateway definitions...');
    return unbindAllRoutes.bind(this)()
        .then(() => deploySequentialRoutes.bind(this)(this.serverless.service.bindings))
}

function deployRoute(route) {
    return this.provider.client().then(ow => {
        if (this.options.verbose) {
            this.serverless.cli.log(`Deploying API Gateway Route: ${JSON.stringify(route)}`);
        }
        return ow.routes.create(route)
            .then(() => {
                if (this.options.verbose) {
                    this.serverless.cli.log(`Deployed API Gateway Route: ${JSON.stringify(route)}`);
                }
            }).catch(err => {
                throw new this.serverless.classes.Error(
                    `Failed to deploy API Gateway route (${route.relpath}) due to error: ${err.message}`
                );
            })
    });
}

function unbindAllRoutes() {
    return new Promise((resolve) => {
        this.provider.client()
            .then(ow => ow.routes.delete({basepath:`/iwibot`}))
            .then(resolve)
            .catch(resolve)
    })
}

function deploySequentialRoutes(routes) {
    return Bluebird.mapSeries(routes, r => deployRoute.bind(this)(r))
}
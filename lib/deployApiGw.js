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
const c = require("chalk");
function bindRoutes() {
    const routes = getRoutes.bind(this)();
    return _bindRoutes.bind(this)(routes);
}
exports.bindRoutes = bindRoutes;
function unbindRoutes() {
    const routes = getRoutes.bind(this)();
    return unbindSequentialRoutes.bind(this)(routes);
}
exports.unbindRoutes = unbindRoutes;
function bindTestRoutes() {
    return __awaiter(this, void 0, void 0, function* () {
        const routes = yield getTestRoutes.bind(this)();
        debugger;
        return _bindRoutes.bind(this)(routes);
    });
}
exports.bindTestRoutes = bindTestRoutes;
function unbindTestRoutes() {
    return __awaiter(this, void 0, void 0, function* () {
        const routes = yield getTestRoutes.bind(this)();
        return unbindSequentialRoutes.bind(this)(routes);
    });
}
exports.unbindTestRoutes = unbindTestRoutes;
function getTestRoutes() {
    return this.provider.client().then((ow) => __awaiter(this, void 0, void 0, function* () {
        const routes = [];
        const result = yield ow.packages.get({ name: this.serverless.service.package.testname });
        yield Bluebird.all(result.actions.map((fnConfig) => {
            if (this.serverless.service.functions[fnConfig.name].enabled || this.options['force']) {
                fnConfig = this.serverless.service.functions[fnConfig.name];
                routes.push({
                    action: this.serverless.service.package.testname + '/' + fnConfig.name,
                    basepath: this.serverless.service.package.testbasepath,
                    relpath: '/' + fnConfig.name.toLowerCase(),
                    operation: 'post',
                    'response-type': fnConfig.events.length > 0 && fnConfig.events[0].http ? fnConfig.events[0].http.responsetype : 'json',
                    responsetype: fnConfig.events.length > 0 && fnConfig.events[0].http ? fnConfig.events[0].http.responsetype : 'json',
                    cors: 'true'
                });
            }
        }));
        return routes;
    }));
}
function getRoutes() {
    Object.keys(this.serverless.service.functions).map((fnName) => {
        const fnConfig = this.serverless.service.functions[fnName];
        if (!fnConfig.enabled) {
            return;
        }
        const events = fnConfig.events;
        if (events && events.length) {
            return events.reduce((val, el) => {
                if (fnConfig.package && fnConfig.package.name) {
                    val.push(Object.assign(el.http, { action: fnConfig.package.name + '/' + fnConfig.name, tmpAction: fnConfig.name }));
                }
                else {
                    val.push(Object.assign(el.http, { action: fnConfig.name, tmpAction: fnConfig.name }));
                }
            }, this.serverless.service.apis);
        }
        return [];
    });
    return this.serverless.service.apis;
}
function bindRoute(route) {
    return this.provider.client().then((ow) => {
        return ow.routes.create(route).then((code) => {
            if (this.options.verbose) {
                this.serverless.cli.log(`${c.green('configured')} ${c.blue('gateway')} definition ${JSON.stringify(route, null, 2)}`);
            }
            else {
                this.serverless.cli.log(`${c.green('configured')} ${c.blue('gateway')} definition ${route.basepath}${route.relpath}`);
            }
        }).catch((err) => {
            if (err.message.indexOf('Endpoint name not unique') > -1) {
                this.serverless.cli.log(`The ${c.blue('gateway')} definition ${c.reset.bold(route.basepath + route.relpath)} already exists`);
            }
            else {
                this.serverless.cli.log(`${err.message}`);
            }
        });
    });
}
function unbindRoute(route) {
    if (this.serverless.service.deployTest) {
        route.action = this.serverless.service.package.testname + '/' + route.tmpAction;
    }
    return this.provider.client().then((ow) => {
        return ow.routes.delete(route).then(() => {
            if (this.options.verbose) {
                this.serverless.cli.log(`${c.red('deleted')} ${c.blue('gateway')} definition ${JSON.stringify(route, null, 2)}`);
            }
            else {
                this.serverless.cli.log(`${c.red('deleted')} ${c.blue('gateway')} definition ${route.basepath}${route.relpath}`);
            }
        }).catch((err) => {
        });
    });
}
function unbindSequentialRoutes(routes) {
    if (routes.length) {
        this.serverless.cli.log('Unbind API Gateway definitions...');
        // Unbind sequential, because more routes can be deleted
        return Bluebird.mapSeries(routes, (r) => unbindRoute.bind(this)(r));
    }
    return Bluebird.resolve();
}
function _bindRoutes(routes) {
    if (routes.length) {
        this.serverless.cli.log('Configure API Gateway definitions...');
        return routes.map((r) => bindRoute.bind(this)(r));
    }
    return Bluebird.resolve();
}

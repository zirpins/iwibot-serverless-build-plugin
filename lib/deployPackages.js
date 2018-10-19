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
const _ = require("lodash");
function deployPackages() {
    return __awaiter(this, void 0, void 0, function* () {
        const pkges = yield getPackages.bind(this)();
        if (pkges.length) {
            this.serverless.cli.log('Deploying Packages...');
        }
        return Bluebird.all(pkges.map(p => deployPackage.bind(this)(p)));
    });
}
exports.default = deployPackages;
function deployPackage(pkge) {
    return this.provider.client().then(ow => {
        if (this.options.verbose) {
            this.serverless.cli.log(`Deploying Package: ${pkge.name}`);
        }
        return ow.packages.update(pkge)
            .then(() => {
            if (this.options.verbose) {
                this.serverless.cli.log(`Deployed Package: ${pkge.name}`);
            }
        }).catch(err => {
            throw new this.serverless.classes.Error(`Failed to deploy package (${pkge.name}) due to error: ${err.message}`);
        });
    });
}
function getPackages(undeploy) {
    return __awaiter(this, void 0, void 0, function* () {
        const packages = [];
        // when getting packages for undeployment, omit the standard two
        if (!undeploy) {
            packages.push({ name: this.serverless.service.package.name });
            packages.push({ name: this.serverless.service.package.testname });
        }
        yield Bluebird.map(Object.keys(this.serverless.service.functions), (fnName) => {
            const fnConfig = this.serverless.service.functions[fnName];
            if (fnConfig.enabled) {
                if (fnConfig.package && fnConfig.package.name) {
                    packages.push({ name: fnConfig.package.name });
                }
            }
        });
        // remove duplicates by name
        return _.uniqBy(packages, (e) => { return e.name; });
    });
}

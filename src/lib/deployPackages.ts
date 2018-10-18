import * as Bluebird from 'bluebird';
import * as _ from 'lodash';

export default async function deployPackages() {
    const pkges = await getPackages.bind(this)();
    if (pkges.length) {
        this.serverless.cli.log('Deploying Packages...');
    }

    return Bluebird.all(
        pkges.map(p => deployPackage.bind(this)(p))
    );
}

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
                throw new this.serverless.classes.Error(
                    `Failed to deploy package (${pkge.name}) due to error: ${err.message}`
                );
            });
    })
}

async function getPackages(undeploy) {
    const packages = [];
    // when getting packages for undeployment, omit the standard two
    if (!undeploy) {
        packages.push({ name: this.serverless.service.package.name });
        packages.push({ name: this.serverless.service.package.testname });
    }

    await Bluebird.map(Object.keys(this.serverless.service.functions), (fnName) => {
        const fnConfig = this.serverless.service.functions[fnName];
        if (fnConfig.enabled) {
            if (fnConfig.package && fnConfig.package.name) {
                packages.push({ name: fnConfig.package.name });
            }
        }
    });
    // remove duplicates by name
    return _.uniqBy(packages, (e) => { return e.name; })
}
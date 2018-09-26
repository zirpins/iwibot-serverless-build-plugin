import * as Bluebird from 'bluebird';

export default function deployPackages() {
    const pkges = getPackages.bind(this)();

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

function getPackages() {
    /*const pkges = this.serverless.service.packages;
    return Object.keys(this.serverless.service.packages).map(p => pkges[p]);*/
    return [{name: 'IWIBot'}];
}
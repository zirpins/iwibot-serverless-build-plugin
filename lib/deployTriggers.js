"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
function deployTriggers() {
    const triggers = getTriggers.bind(this)();
    if (triggers.length) {
        this.serverless.cli.log('Deploying Triggers...');
    }
    return Bluebird.all(triggers.map(t => deployTrigger.bind(this)(t)));
}
exports.default = deployTriggers;
function getTriggers() {
    const triggers = this.serverless.service.triggers;
    const trigger = { feed: undefined };
    return Object.keys(triggers)
        .map(t => Object.assign({}, triggers[t], trigger));
}
function deployTrigger(trigger) {
    return this.provider.client().then(ow => {
        if (this.options.verbose) {
            this.serverless.cli.log(`Deploying Trigger: ${trigger.triggerName}`);
        }
        const feed = getFeed.bind(this)(trigger);
        if (feed) {
            Object.assign(trigger, { annotations: [{ key: 'feed', value: feed }] });
        }
        return ow.triggers.create(trigger)
            .then(() => {
            if (this.options.verbose) {
                this.serverless.cli.log(`Deployed Trigger: ${trigger.triggerName}`);
            }
        }).catch(err => {
            throw new this.serverless.classes.Error(`Failed to deploy trigger (${trigger.triggerName}) due to error: ${err.message}`);
        });
    });
}
function getFeed(trigger) {
    return trigger.feed;
}

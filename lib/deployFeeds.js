"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
const c = require("chalk");
function deployFeeds() {
    const feeds = getFeeds.bind(this)();
    if (feeds.length) {
        this.serverless.cli.log('Binding Feeds To Triggers...');
    }
    const deleteAndDeployFeeds = feeds.map(feed => {
        return deleteFeed.bind(this)(feed).then(() => deployFeed.bind(this)(feed));
    });
    return Bluebird.all(deleteAndDeployFeeds);
}
exports.default = deployFeeds;
function getFeeds() {
    const triggers = this.serverless.service.triggers;
    return Object.keys(triggers).map(t => triggers[t].feed).filter(f => f);
}
function deployFeed(feed) {
    if (!feed.enabled) {
        if (this.options.verbose) {
            this.logger.message('FEED', c.reset.bold(feed.name) + c.red(' is excluded from deployment'));
        }
        return;
    }
    return this.provider.client().then(ow => {
        if (this.options.verbose) {
            this.serverless.cli.log(`Deploying Feed: ${feed.feedName}`);
        }
        return ow.feeds.create(feed)
            .then(() => {
            if (this.options.verbose) {
                this.serverless.cli.log(`Deployed Feed: ${feed.feedName}`);
            }
        }).catch(err => {
            throw new this.serverless.classes.Error(`Failed to deploy feed (${feed.feedName}) due to error: ${err.message}`);
        });
    });
}
function deleteFeed(feed) {
    return new Promise((resolve, reject) => {
        this.provider.client().then(ow => ow.feeds.delete(feed).then(() => resolve(feed)).catch(() => resolve(feed)));
    });
}

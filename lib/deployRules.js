"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
const c = require("chalk");
function deployRules() {
    const rules = getRules.bind(this)();
    if (rules.length) {
        this.serverless.cli.log('Deploying Rules...');
    }
    return Bluebird.all(rules.map(r => deployRule.bind(this)(r).then(() => enableRule.bind(this)(r))));
}
exports.default = deployRules;
function getRules() {
    const rules = this.serverless.service.rules;
    return rules ? Object.keys(this.serverless.service.rules).map(r => rules[r]) : [];
}
function enableRule(rule) {
    return this.provider.client().then(ow => ow.rules.enable(rule).catch(err => {
        throw new this.serverless.classes.Error(`Failed to enable rule (${rule.ruleName}) due to error: ${err.message}`);
    }));
}
function deployRule(rule) {
    if (!rule.enabled) {
        if (this.options.verbose) {
            this.logger.message('RULE', c.reset.bold(rule.name) + c.red(' is excluded from deployment'));
        }
        return;
    }
    return this.provider.client().then(ow => {
        if (this.options.verbose) {
            this.serverless.cli.log(`Deploying Rule: ${rule.ruleName}`);
        }
        return ow.rules.create(rule)
            .then(() => {
            if (this.options.verbose) {
                this.serverless.cli.log(`Deployed Rule: ${rule.ruleName}`);
            }
        }).catch(err => {
            throw new this.serverless.classes.Error(`Failed to deploy rule (${rule.ruleName}) due to error: ${err.message}`);
        });
    });
}

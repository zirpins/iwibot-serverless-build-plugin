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
const bluebird_1 = require("bluebird");
const c = require("chalk");
const getFolderSize = require("get-folder-size");
const path = require("path");
const util_1 = require("util");
const indent = (str) => str.split('\n').map((line) => `  ${line}`).join('\n');
const getFolderSizeAsync = bluebird_1.promisify(getFolderSize);
/** Returns size in MB */
const directorySize = (directory) => __awaiter(this, void 0, void 0, function* () {
    try {
        const size = yield getFolderSizeAsync(directory);
        return `${(size / 1024 / 1024).toFixed(3)} MB`;
    }
    catch (err) {
        return null;
    }
});
class Logger {
    constructor({ serverless, silent = false } = {}) {
        this.log = (...args) => !this.silent && console.log.apply(console, args);
        this.logSls = (...args) => !this.silent && this.serverless.cli.log(...args);
        Object.assign(this, { serverless, silent });
    }
    message(prefix, str = '') {
        return this.log(`${c.grey(`[${prefix}]`)} ${str}`);
    }
    module({ filePath, realPath, packageJson }) {
        return __awaiter(this, void 0, void 0, function* () {
            const directory = path.basename(filePath);
            const size = yield directorySize(realPath || filePath);
            return this.message('MODULE', `${packageJson && c.grey(`${packageJson.name}\t`)}${c.grey(filePath
                .replace(directory, c.reset(directory))
                .replace(/\bnode_modules\b/, '~'))} ${size ? c.grey(`- ${c.blue(size)}`) : ''}`);
        });
    }
    phpModule({ filePath, realPath, composerJson }) {
        return __awaiter(this, void 0, void 0, function* () {
            this.module({ filePath, realPath, packageJson: composerJson });
        });
    }
    source({ filePath }) {
        const basename = path.basename(filePath);
        return this.message('SOURCE', c.grey(filePath.replace(basename, c.reset(basename))));
    }
    config(config) {
        const str = c.grey(util_1.inspect(config, { depth: 10, colors: true }));
        this.block('CONFIG', str);
    }
    block(prefix, text) {
        this.message(prefix);
        this.log('');
        this.log(indent(text));
        this.log('');
    }
}
exports.Logger = Logger;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const requireResolve = require("resolve-pkg");
class UglifyTransform {
    constructor(config = {}, options = {}) {
        this.config = Object.assign({ dead_code: true, unsafe: false }, config);
        this.options = Object.assign({ skipOnError: true, logErrors: false }, options);
        // eslint-disable-next-line
        this.uglify = require(requireResolve('uglify-js', { cwd: this.options.servicePath.slice(0, this.options.servicePath.indexOf('iwibot-openwhisk') + 16) }));
    }
    run({ code, map, filePath }) {
        const fileName = path.basename(filePath);
        let result = { code, map };
        try {
            result = this.uglify.minify({ [fileName]: code }, Object.assign({}, this.config, { 
                // Must pass through any previous source maps
                inSourceMap: map || null, outSourceMap: `${fileName}.map`, fromString: true }));
        }
        catch (err) {
            // tslint:disable-next-line:no-console
            if (this.options.logErrors) {
                console.error(err);
            } // eslint-disable-line
            if (!this.options.skipOnError) {
                throw err;
            }
        }
        return result;
    }
}
exports.UglifyTransform = UglifyTransform;

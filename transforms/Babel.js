"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const requireResolve = require("resolve-pkg");
class BabelTransform {
    constructor(config = {}, options = {}) {
        this.config = Object.assign({ sourceMaps: 'both' }, config);
        this.options = Object.assign({ servicePath: '', skipOnError: false, logErrors: true, normalizeBabelExt: false }, options);
        // eslint-disable-next-line
        this.babel = require(requireResolve('babel-core', { cwd: this.options.servicePath }));
    }
    run({ code, map, relPath }) {
        let result = { code, map, relPath };
        try {
            const transformed = this.babel.transform(code, Object.assign({}, this.config, { sourceFileName: relPath, sourceMapTarget: relPath, allowJs: true }));
            result = Object.assign({}, result, transformed, { relPath: this.options.normalizeBabelExt
                    ? relPath.replace(/\.[^.]+$/, '.js')
                    : relPath });
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
exports.BabelTransform = BabelTransform;

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
const lutils_1 = require("lutils");
const requireResolve = require("resolve-pkg");
class WebpackBuilder {
    constructor(config) {
        this.entryCache = new Set();
        this.cache = true;
        Object.assign(this, config);
        try {
            // eslint-disable-next-line
            this.webpack = require(requireResolve('webpack', { cwd: this.servicePath }));
        }
        catch (err) { /**/ }
    }
    /**
     *  Builds a webpack config into the build directory.
     */
    build(config) {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = config.entry || [];
            if (entry.length) {
                const cacheKey = entry.join('');
                if (this.entryCache.has(cacheKey)) {
                    return;
                }
                this.entryCache.add(cacheKey);
            }
            config.context = this.servicePath;
            config.entry = [...entry];
            config.output = Object.assign({}, config.output, { libraryTarget: 'commonjs', path: this.buildTmpDir });
            const externals = this.normalizeExternals(config.externals || []);
            this.logger.message('WEBPACK');
            this.logger.log('');
            const logs = yield this.runWebpack(config);
            this.logger.log('');
            this.logger.block('WEBPACK', logs);
            return externals;
        });
    }
    /**
     *  Normalizes webpacks externals into an array of strings.
     *  This is fairly rough, could be better.
     *
     *  @return [ "moduleName" ]
     */
    normalizeExternals(externals) {
        return externals.reduce((arr, external) => {
            const type = lutils_1.typeOf(external);
            if (type === 'string') {
                arr.push(external);
            }
            else if (type === 'object') {
                Object.keys(external).forEach((key) => {
                    const val = external[key];
                    if (val === true) {
                        arr.push(key);
                    }
                });
            }
            return arr;
        }, []);
    }
    runWebpack(config) {
        return new Promise((resolve, reject) => {
            this.webpack(config).run((err, stats) => {
                if (err) {
                    return reject(err);
                }
                return resolve(stats.toString({
                    colors: true,
                    hash: false,
                    version: false,
                    chunks: false,
                    children: false,
                }));
            });
        });
    }
}
exports.WebpackBuilder = WebpackBuilder;

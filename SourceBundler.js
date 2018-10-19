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
const fs_extra_1 = require("fs-extra");
const lutils_1 = require("lutils");
const glob = require("minimatch");
const path_1 = require("path");
const utils_1 = require("./lib/utils");
const Walker_1 = require("./lib/Walker");
const Babel_1 = require("./transforms/Babel");
const Uglify_1 = require("./transforms/Uglify");
/**
 *  @class SourceBundler
 *
 *  Handles the inclusion of source code in the artifact.
 */
class SourceBundler {
    constructor(config) {
        this.sourceMaps = false;
        this.transformExtensions = ['ts', 'js', 'jsx', 'tsx'];
        Object.assign(this, config);
    }
    /**
     *  Walks through, transforms, and zips source content wich
     *  is both `included` and not `excluded` by the regex or glob patterns.
     */
    bundle({ exclude = [], include = [] }) {
        return __awaiter(this, void 0, void 0, function* () {
            const transforms = yield this.createTransforms();
            const onFile = (filePath, stats, stop) => __awaiter(this, void 0, void 0, function* () {
                /**
                 *  A relative path to the servicePath
                 *  @example ./functions/test/handler.js
                 */
                const relPath = path_1.join(filePath.split(this.servicePath)[1]).replace(/^\/|\/$/g, '');
                const testPattern = (pattern) => (lutils_1.isRegExp(pattern)
                    ? pattern.test(relPath)
                    : glob(relPath, pattern, { dot: true }));
                const isIncluded = include.some(testPattern);
                const isExcluded = exclude.some(testPattern);
                /**
                 *  When a pattern matches an exclude, it skips
                 *  When a pattern doesnt match an include, it skips
                 */
                if (!isIncluded || isExcluded) {
                    return;
                }
                yield utils_1.handleFile({
                    filePath,
                    relPath: relPath,
                    transforms,
                    transformExtensions: this.transformExtensions,
                    useSourceMaps: this.sourceMaps,
                    archive: this.archive,
                });
                this.logger.source({ filePath: relPath });
            });
            function filter(dirPath, stats) {
                if (dirPath.endsWith('node_modules') || dirPath.endsWith(path_1.sep + 'test') || dirPath.endsWith('.serverless')) {
                    return false;
                }
                return true;
            }
            yield new Walker_1.Walker(this.servicePath)
                .filter(filter)
                .file(onFile)
                .end();
            return this.archive;
        });
    }
    createTransforms() {
        return __awaiter(this, void 0, void 0, function* () {
            const transforms = [];
            if (this.babel) {
                let babelQuery = this.babel;
                if (!lutils_1.isObject(babelQuery)) {
                    const babelrcPath = path_1.join(this.servicePath, '.babelrc');
                    babelQuery = fs_extra_1.existsSync(babelrcPath)
                        ? JSON.parse(yield fs_extra_1.readFile(babelrcPath, 'utf8'))
                        : {};
                }
                // If `sourceMaps` are switched off by the plugin's configuration,
                // ensure that is passed down to the babel transformer too.
                if (this.sourceMaps === false) {
                    babelQuery.sourceMaps = false;
                }
                transforms.push(new Babel_1.BabelTransform(babelQuery, this));
            }
            let uglifyConfig = this.uglify;
            if (uglifyConfig) {
                if (!lutils_1.isObject(uglifyConfig)) {
                    uglifyConfig = null;
                }
                transforms.push(new Uglify_1.UglifyTransform(uglifyConfig, { servicePath: this.servicePath, logErrors: true }));
            }
            return transforms;
        });
    }
}
exports.SourceBundler = SourceBundler;

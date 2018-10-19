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
const Bluebird = require("bluebird");
const path_1 = require("path");
const resolvePackage = require("resolve-pkg");
const fs_extra_1 = require("fs-extra");
const utils_1 = require("./lib/utils");
const Walker_1 = require("./lib/Walker");
const Uglify_1 = require("./transforms/Uglify");
/**
 *  @class NodeJsModuleBundler
 *
 *  Handles the inclusion of node_modules.
 */
class NodeJsModuleBundler {
    constructor(config) {
        Object.assign(this, config);
    }
    /**
     *  Determines module locations then adds them into ./node_modules
     *  inside the artifact.
     */
    bundle({ include = [], exclude = [], deepExclude = [] }) {
        return __awaiter(this, void 0, void 0, function* () {
            const links = yield Walker_1.findSymlinks(path_1.join(this.servicePath, 'node_modules'));
            /**
             * @type {IModule[]}
             */
            this.modules = this.resolveDependencies(this.servicePath, { include, exclude, deepExclude, links });
            const transforms = this.resolveTransforms();
            const readModule = ({ packagePath, packageDir, relativePath, packageJson }) => __awaiter(this, void 0, void 0, function* () {
                const filter = (dirPath, stats) => {
                    const { linkedPath, link } = this.resolveSymlinkPath(dirPath, links);
                    let testPackagePath = packagePath;
                    if (linkedPath) {
                        dirPath = linkedPath;
                        testPackagePath = link;
                    }
                    if (!dirPath || !testPackagePath) {
                        return true;
                    }
                    // If there are no deep exclusions, then there is no more filtering.
                    if (!deepExclude.length) {
                        return true;
                    }
                    // This pulls ['node_modules', 'pack'] out of
                    // .../node_modules/package/node_modules/pack
                    const endParts = dirPath.split(testPackagePath)[1].split(path_1.sep).slice(-2);
                    // When a directory is a package and matches a deep exclude pattern
                    // Then skip it
                    if (endParts[0] === 'node_modules' &&
                        deepExclude.indexOf(endParts[1]) !== -1) {
                        return false;
                    }
                    return true;
                };
                const onFile = (filePath, stats) => __awaiter(this, void 0, void 0, function* () {
                    let relPath;
                    const { relLinkedPath } = this.resolveSymlinkPath(filePath, links);
                    if (relLinkedPath) {
                        relPath = path_1.join(relativePath, relLinkedPath);
                    }
                    if (!relPath) {
                        relPath = filePath.substr(filePath.indexOf(relativePath));
                    }
                    relPath = relPath.replace(/^\/|\/$/g, '');
                    yield utils_1.handleFile({
                        filePath,
                        relPath,
                        transforms,
                        transformExtensions: ['js', 'jsx'],
                        useSourceMaps: false,
                        archive: this.archive,
                    });
                });
                yield new Walker_1.Walker(packagePath)
                    .filter(filter)
                    .file(onFile)
                    .end();
                return this.logger.module(({ filePath: relativePath, realPath: packagePath, packageJson }));
            });
            yield Bluebird.map(this.modules, readModule);
            return this;
        });
    }
    resolveTransforms() {
        const transforms = [];
        let uglifyConfig = this.uglify;
        if (uglifyConfig) {
            if (uglifyConfig === true) {
                uglifyConfig = null;
            }
            transforms.push(new Uglify_1.UglifyTransform(uglifyConfig, this));
        }
        return transforms;
    }
    resolveSymlinkPath(filePath, links) {
        const items = Array.from(links.entries()).reverse();
        // Get a relPath from using a matching symlink
        for (const [real, link] of items) {
            if (filePath.startsWith(real)) {
                const relLinkedPath = filePath.slice(real.length);
                return {
                    real, link,
                    relLinkedPath,
                    linkedPath: path_1.join(link, relLinkedPath),
                };
            }
        }
        return {};
    }
    /**
     * Resolves a package's dependencies to an array of paths.
     */
    resolveDependencies(initialPackageDir, { include = [], exclude = [], deepExclude = [], links = new Map() } = {}) {
        const resolvedDeps = [];
        const cache = new Set();
        const separator = `${path_1.sep}node_modules${path_1.sep}`;
        /**
         *  Resolves packages to their package root directory &
         *  also resolves dependant packages recursively.
         *  - Will also ignore the input package in the results
         */
        const recurse = (packageDir, _include = [], _exclude = []) => {
            const jsonObj = require(path_1.join(packageDir, 'package.json')); // eslint-disable-line
            const { name } = jsonObj;
            const dependencies = jsonObj.dependencies;
            const result = {
                name,
                packageDir,
                packagePath: packageDir,
            };
            if (!dependencies) {
                return result;
            }
            Object.keys(dependencies).map((packageName) => {
                // Skips on exclude matches, if set
                if (_exclude.length && _exclude.indexOf(packageName) > -1) {
                    return;
                }
                // Skips on include mis-matches, if set
                if (_include.length && !(_include.indexOf(packageName) >= 0 || _include.indexOf('**/*') > -1)) {
                    return;
                }
                let nextPackagePath = resolvePackage(packageName, { cwd: packageDir });
                if (!nextPackagePath) {
                    return;
                }
                const link = links.get(nextPackagePath);
                if (link) {
                    nextPackagePath = link;
                }
                const relativePath = path_1.join('node_modules', nextPackagePath.split(separator).slice(1).join(separator));
                if (cache.has(relativePath)) {
                    return;
                }
                cache.add(relativePath);
                const childPackageJsonPath = path_1.join(nextPackagePath, 'node_modules', 'package.json');
                let childJsonObj;
                if (fs_extra_1.existsSync(childPackageJsonPath)) {
                    childJsonObj = require(childPackageJsonPath); // eslint-disable-line
                }
                const childResult = recurse(nextPackagePath, undefined, deepExclude);
                resolvedDeps.push(Object.assign({}, childResult, { packageDir, relativePath, packageJson: childJsonObj }));
            });
            return result;
        };
        recurse(initialPackageDir, include, exclude);
        return resolvedDeps;
    }
}
exports.NodeJsModuleBundler = NodeJsModuleBundler;

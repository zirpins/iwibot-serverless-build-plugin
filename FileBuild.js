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
const fs_extra_1 = require("fs-extra");
const isStream = require("is-stream");
const lutils_1 = require("lutils");
const path = require("path");
const requireResolve = require("resolve-pkg");
const WebpackBuilder_1 = require("./WebpackBuilder");
class FileBuild {
    constructor(config) {
        Object.assign(this, config);
        this.externals = new Set();
        this.webpackBuilder = new WebpackBuilder_1.WebpackBuilder({
            logger: this.logger,
            buildTmpDir: this.buildTmpDir,
            servicePath: this.servicePath,
        });
        try {
            // Register TypeScript for requiring if possible
            require(requireResolve('ts-node/register', { cwd: this.servicePath }));
        }
        catch (err) { /**/ }
    }
    /**
     *  Handles building from a build file's output.
     */
    build(fnConfig, archive) {
        return __awaiter(this, void 0, void 0, function* () {
            let builderFilePath = this.tryBuildFiles();
            if (!builderFilePath) {
                throw new Error('Unrecognized build file path');
            }
            builderFilePath = path.resolve(this.servicePath, builderFilePath);
            const entryRelPath = `${fnConfig.handler.split(/\.[^.]+$/)[0]}`;
            const entryPoint = `./${entryRelPath}.${this.handlerEntryExt}`;
            const buildFilename = `./${entryRelPath}.js`;
            // eslint-disable-next-line
            let result = require(builderFilePath);
            // Fudge to default exports
            if (result instanceof Object && result.default) {
                result = result.default;
            }
            // Resolve any functions...
            if (lutils_1.isFunction(result)) {
                result = yield Bluebird.try(() => result(fnConfig, this, { entryRelPath, entryPoint, buildFilename }));
            }
            //
            // - String, Buffer or Stream : piped as 'handler.js' into zip
            // - Webpack Config           : executed and output files are zipped
            //
            if (lutils_1.isObject(result)) {
                //
                // WEBPACK CONFIG
                //
                const webpackConfig = lutils_1.clone(result);
                lutils_1.merge(webpackConfig, {
                    entry: [...(webpackConfig.entry || []), entryPoint],
                    output: {
                        filename: buildFilename,
                    },
                });
                const externals = yield this.webpackBuilder.build(webpackConfig);
                externals && externals.forEach((ext) => this.externals.add(ext));
                [buildFilename, `${buildFilename}.map`].forEach((relPath) => {
                    const filePath = path.resolve(this.buildTmpDir, relPath);
                    if (!fs_extra_1.existsSync(filePath)) {
                        return;
                    }
                    archive.file(filePath, { name: relPath });
                });
            }
            else if (lutils_1.isString(result) || result instanceof Buffer) {
                //
                // STRINGS, BUFFERS
                //
                if (lutils_1.isString(result)) {
                    result = new Buffer(result);
                }
                archive.append(result, { name: entryPoint });
            }
            else if (isStream(result)) {
                //
                // STREAMS
                //
                archive.append(result, { name: entryPoint });
            }
            else {
                throw new Error('Unrecognized build output');
            }
            return this;
        });
    }
    /**
     *  Allows for build files to be auto selected
     */
    tryBuildFiles() {
        for (const fileName of this.tryFiles) {
            if (fs_extra_1.existsSync(fileName)) {
                return fileName;
            }
        }
        return null;
    }
}
exports.FileBuild = FileBuild;

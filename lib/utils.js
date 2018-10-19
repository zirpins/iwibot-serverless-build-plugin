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
const c = require("chalk");
const fs_extra_1 = require("fs-extra");
const YAML = require("js-yaml");
const lutils_1 = require("lutils");
const path = require("path");
/**
 * Read any of:
 * - .json
 * - .yml / .yaml
 * - .js
 *
 * @param {String} fileLookup
 * @returns {any} config
 */
function loadFile(fileLookup) {
    const tryExts = ['.yml', '.yaml', ''];
    for (const ext of tryExts) {
        try {
            const filePath = require.resolve(`${fileLookup}${ext}`);
            if (/\.ya?ml$/i.test(filePath)) {
                return YAML.load(fs_extra_1.readFileSync(filePath, 'utf8'));
            }
            return require(filePath); // eslint-disable-line
        }
        catch (err) { /* */ }
    }
    return null;
}
exports.loadFile = loadFile;
/**
 *  Normalizes transforming and zip allocation for walked files.
 *  Used by SourceBundler & NodeJsModuleBundler.
 */
function handleFile({ filePath, relPath, archive, useSourceMaps, transformExtensions, transforms, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const extname = path.extname(filePath);
        const isTransformable = transformExtensions.some((ext) => `.${ext}` === extname.toLowerCase());
        if (isTransformable) {
            //
            // JAVASCRIPT
            //
            let code = yield fs_extra_1.readFileSync(filePath, 'utf8');
            let map = '';
            let destRelPath = relPath;
            /**
             *  Runs transforms against the code, mutating the code & map
             *  with each iteration, optionally producing source maps
             */
            if (transforms.length) {
                for (const transformer of transforms) {
                    const result = transformer.run({ code, map, filePath, relPath });
                    if (result.code) {
                        code = result.code;
                        if (result.map) {
                            map = result.map;
                        }
                        if (result.relPath) {
                            destRelPath = result.relPath;
                        }
                    }
                }
            }
            archive.append(new Buffer(code), { name: destRelPath });
            if (useSourceMaps && map) {
                if (lutils_1.isObject(map)) {
                    map = JSON.stringify(map);
                }
                archive.append(new Buffer(map), { name: `${destRelPath}.map` });
            }
        }
        else {
            //
            // ARBITRARY FILES
            //
            archive.file(filePath, { name: relPath });
        }
        return archive;
    });
}
exports.handleFile = handleFile;
function displayModule({ filePath, packageJson }) {
    const basename = path.basename(filePath);
    return `${packageJson && c.grey(`${packageJson.version}\t`)}${c.grey(filePath.replace(basename, `${c.reset(basename)}`))}`;
}
exports.displayModule = displayModule;
function colorizeConfig(config) {
    return c.grey(`{ ${Object.keys(config).map((key) => {
        const val = config[key];
        return `${c.white(key)}: ${val ? c.green(val) : c.yellow(val)}`;
    }).join(', ')} }`);
}
exports.colorizeConfig = colorizeConfig;

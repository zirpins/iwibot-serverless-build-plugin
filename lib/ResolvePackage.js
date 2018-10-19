"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path_1 = require("path");
function resolvePackage(packageName, workDir) {
    const res = fs.existsSync(path_1.join(workDir.cwd, 'vendor', packageName));
    if (res) {
        const items = fs.readdirSync(path_1.join(workDir.cwd, 'vendor', packageName));
        // filter for composer.json file
        const result = items.filter((item) => { return item === 'composer.json'; });
        if (result.length === 0) {
            return resolvePackage(path_1.join(packageName, items[0]), workDir);
        }
        else {
            return path_1.join(workDir.cwd, 'vendor', packageName);
        }
    }
    throw new Error(`The dependency ${packageName} is missing or there is no composer.json in the package directory or subdirectories!`);
}
exports.resolvePackage = resolvePackage;

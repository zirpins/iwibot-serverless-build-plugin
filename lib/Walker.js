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
const createWalker = require("walker");
const fs_1 = require("fs");
class Walker {
    constructor(directory) {
        this.pending = [];
        this.symlinkRoots = new Set();
        this.capture = (fn) => {
            return (...args) => {
                const result = fn(...args);
                this.pending.push(result);
                return result;
            };
        };
        this.walker = createWalker(directory);
    }
    filter(fn) {
        this.walker.filterDir(this.capture(fn));
        return this;
    }
    directory(fn) {
        this.walker.on('dir', this.capture(fn));
        return this;
    }
    file(fn) {
        this.walker.on('file', this.capture(fn));
        return this;
    }
    end() {
        return __awaiter(this, void 0, void 0, function* () {
            yield new Promise((resolve, reject) => {
                this.walker.on('error', reject);
                this.walker.on('end', resolve);
            });
            return Promise.all(this.pending);
        });
    }
}
exports.Walker = Walker;
function findSymlinks(dirPath, maxDepth = 2) {
    return __awaiter(this, void 0, void 0, function* () {
        const links = new Map();
        const traverse = (dir, depth) => __awaiter(this, void 0, void 0, function* () {
            if (depth < 0) {
                return;
            }
            --depth;
            const stats = yield fs_1.lstatSync(dir);
            if (stats.isSymbolicLink()) {
                const real = yield fs_1.realpathSync(dir);
                return links.set(real, dir);
            }
            if (!stats.isDirectory()) {
                return;
            }
            const entries = yield fs_1.readdirSync(dir);
            return Bluebird.map(entries, (entry) => traverse(path_1.join(dir, entry), depth));
        });
        yield traverse(dirPath, maxDepth);
        return links;
    });
}
exports.findSymlinks = findSymlinks;

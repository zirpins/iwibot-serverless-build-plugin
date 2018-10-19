"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = {
    nodejsMethod: 'bundle',
    useServerlessOffline: false,
    tryFiles: [
        'webpack.config.ts',
        'webpack.config.js',
    ],
    baseExclude: [/\bnode_modules\b/],
    modules: {
        exclude: [],
        deepExclude: [],
    },
    exclude: [],
    include: [],
    uglify: false,
    uglifySource: false,
    uglifyModules: true,
    babel: null,
    normalizeBabelExt: false,
    sourceMaps: true,
    transformExtensions: ['ts', 'js', 'jsx', 'tsx'],
    handlerEntryExt: 'js',
    zip: { gzip: true, gzipOptions: { level: 5 } },
    functions: {},
    synchronous: true,
    deploy: true,
    silent: false,
};

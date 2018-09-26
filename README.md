If you modify the plugin, it need to be installed in the `iwibot-openwhisk` project. Modify the `installPlugin` script in the `package.json` to point to your clone of the `iwibot-openwhisk` repository locally. Then run `npm run installPlugin`.

The packaging of the functions is synchronous. The deployment is asynchronous. 

Source and Module-bundling is taken from the [serverless-build-plugin](https://github.com/nfour/serverless-build-plugin). The deployment part is a modified version of the [serverless-openwhisk](https://github.com/serverless/serverless-openwhisk) plugin. For packaging python requirements the [serverless-python-requirements](https://www.npmjs.com/package/serverless-python-requirements) plugin is used. 

Inspired by [serverless-build-plugin](https://github.com/nfour/serverless-build-plugin) and [serverless-openwhisk](https://github.com/serverless/serverless-openwhisk). Using [serverless-python-requirements](https://www.npmjs.com/package/serverless-python-requirements) plugin.
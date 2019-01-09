Wherever there is talk of v1.0.3 in this document, the newest `package.json` version of the plugin is meant.. So if you make changes and want to point the release to a new commit, don't forget to change the version in the `package.json`.  
With `lastCommitId`, the id of the commit your new release should point to is meant.

When you modified the plugin and want to make a new release, so you can update the `ìwibot-openwhisk` repository with `npm update` and pull in the newest changes, you have to do 4 steps:    
* First create a worktree and checkout the `release` branch
  
    `git add worktree ../iwibot-serverless-build-plugin-release release`  
    `cd ../iwibot-serverless-build-plugin-release`  
    `git checkout release`  
    `cd ../iwibot-serverless-build-plugin`  
    
* Then run `npm run installPlugin` to compile the typescript files and copy everything to the release directory. Change back to the release directory with
`cd ../iwibot-serverless-build-plugin-release`  

* After that commit the changes and push them to the origin: `git add * && git commit -m 'v1.0.3' && git push origin` (v1.0.3 in ascending order. See first section!)

* Finally tag the branch with `git tag v1.0.3 lastCommitId`, push the tag with `git push --tags origin` and remove the working tree. This is accomplished by changing back to the cloned Repo, then run `npm run uninstallPlugin` and `git worktree prune` 

Source and Module-bundling is taken from the [serverless-build-plugin](https://github.com/nfour/serverless-build-plugin). The deployment part is a modified version of the [serverless-openwhisk](https://github.com/serverless/serverless-openwhisk) plugin. For packaging python requirements the [serverless-python-requirements](https://www.npmjs.com/package/serverless-python-requirements) plugin is used. 

Inspired by [serverless-build-plugin](https://github.com/nfour/serverless-build-plugin) and [serverless-openwhisk](https://github.com/serverless/serverless-openwhisk). Using [serverless-python-requirements](https://www.npmjs.com/package/serverless-python-requirements) plugin.


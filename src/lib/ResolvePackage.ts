import * as fs from 'fs';
import { join } from 'path';

export function resolvePackage(packageName: string, workDir): string {
    const res = fs.existsSync(join(workDir.cwd, 'vendor', packageName));
    if (res) {
        const items = fs.readdirSync(join(workDir.cwd, 'vendor', packageName));
        // filter for composer.json file
        const result = items.filter((item)=>{ return item === 'composer.json'});
        if (result.length === 0) {
            return resolvePackage(join(packageName, items[0]), workDir);
        } else {
            return join(workDir.cwd, 'vendor', packageName);
        }
    }
    throw new Error(`The dependency ${packageName} is missing or there is no composer.json in the package directory or subdirectories!`);
}
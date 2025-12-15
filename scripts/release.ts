import { $ } from "bun";
import z from "zod";

const validBumps = ["major", "minor", "patch"] as const;
type BumpType = (typeof validBumps)[number];

const bumpType = process.argv[2] as BumpType | undefined;

if (!bumpType || !validBumps.includes(bumpType)) {
    console.error(`Usage: bun run release <${validBumps.join("|")}>`);
    process.exit(1);
}

const pkgPath = "package.json";
const pkgContent = await Bun.file(pkgPath).text();

const versionMatch = pkgContent.match(/"version":\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!versionMatch) {
    console.error("Could not find version in package.json");
    process.exit(1);
}

const [, majorStr, minorStr, patchStr] = versionMatch;
const [major, minor, patch] = z
    .tuple([z.number(), z.number(), z.number()])
    .parse([majorStr, minorStr, patchStr].map(Number));

const currentVersion = `${major}.${minor}.${patch}`;

let newVersion: string;
switch (bumpType) {
    case "major":
        newVersion = `${major + 1}.0.0`;
        break;
    case "minor":
        newVersion = `${major}.${minor + 1}.0`;
        break;
    case "patch":
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
}

const updatedContent = pkgContent.replace(
    /"version":\s*"\d+\.\d+\.\d+"/,
    `"version": "${newVersion}"`,
);
await Bun.write(pkgPath, updatedContent);

console.log(`Bumped version: ${currentVersion} -> ${newVersion}`);

await $`git add package.json`;
await $`git commit -m "chore: bump version to ${newVersion}"`;
await $`git tag -a v${newVersion} -m "Release v${newVersion}"`;

console.log(`Created tag: v${newVersion}`);
console.log(`\nTo push: git push && git push --tags`);

/**
 * Set the Android versionCode/versionName derived from package.json version.
 *
 * Every release should bump the `version` field in package.json. This script
 * maps that semver to a strictly-increasing Android versionCode so updates
 * install over the previous build without Android demanding an uninstall.
 *
 * Run from the repo root AFTER `cap sync android` has generated/updated the
 * native project:
 *
 *   node scripts/set-android-version.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const version = String(pkg.version || '1.0.0');
const parts = version.split('.').map((n) => Number.parseInt(n, 10) || 0);
const [major = 0, minor = 0, patch = 0] = parts;

// Monotonic versionCode: major * 10000 + minor * 100 + patch.
const versionCode = major * 10000 + minor * 100 + patch;

const gradlePath = join(root, 'android', 'app', 'build.gradle');
let content = readFileSync(gradlePath, 'utf8');

if (!/versionCode\s+\d+/.test(content)) {
  throw new Error('Could not find an existing "versionCode" line in ' + gradlePath);
}

content = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
content = content.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
writeFileSync(gradlePath, content);

console.log(`Set android versionName=${version} versionCode=${versionCode} in ${gradlePath}`);

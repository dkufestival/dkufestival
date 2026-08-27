const { readdirSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const roots = ['src', 'scripts', 'test'];

function collectJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectJsFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

let failed = false;
for (const file of roots.flatMap(collectJsFiles)) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exitCode = 1;

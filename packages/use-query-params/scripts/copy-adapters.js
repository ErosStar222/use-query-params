#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const packagesDir = path.resolve(__dirname, '../../');
const outputDir = path.resolve(__dirname, '../dist/adapters');
console.log(packagesDir);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const adapterDirs = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory() && dirent.name.includes('-adapter-'))
  .map((dirent) => dirent.name);

for (const adapterDir of adapterDirs) {
  const adapterName = adapterDir.split('-adapter-')[1];
  const adapterBuildDir = path.resolve(packagesDir, adapterDir, 'dist');
  console.log(
    'copying adapter files for',
    adapterName,
    'from',
    adapterBuildDir
  );

  const adapterOutDir = path.resolve(outputDir, adapterName);
  if (!fs.existsSync(adapterOutDir)) {
    fs.mkdirSync(adapterOutDir);
  }

  const buildFiles = fs.readdirSync(adapterBuildDir);
  for (const buildFile of buildFiles) {
    if (buildFile !== 'package.json') {
      fs.copyFileSync(
        path.resolve(adapterBuildDir, buildFile),
        path.resolve(adapterOutDir, buildFile)
      );
    }
  }
}

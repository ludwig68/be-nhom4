const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'dist-cpanel');

const runtimeItems = [
  'server.js',
  'package.json',
  'package-lock.json',
  '.env.production',
  '.env.production.example',
  'src',
  'scripts'
];

const copyItem = (itemPath) => {
  const sourcePath = path.join(rootDir, itemPath);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const destinationPath = path.join(outputDir, itemPath);
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
};

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

runtimeItems.forEach(copyItem);

fs.writeFileSync(
  path.join(outputDir, '.htaccess'),
  'Options -Indexes\n',
  'utf8'
);

console.log(`Prepared cPanel package at: ${outputDir}`);

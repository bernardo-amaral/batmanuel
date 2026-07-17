// scripts/fix-dist-package-bin.cjs
const fs = require('node:fs');
const path = require('node:path');

const distDir = path.join(__dirname, '..', 'dist');
const pkgPath = path.join(distDir, 'package.json');
const readmeSrc = path.join(__dirname, '..', 'README.md');
const readmeDst = path.join(distDir, 'README.md');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.bin = {
    batmanuel: './src/bin/cli.js',
};

pkg.files = pkg.files || [];
if (!pkg.files.includes('README.md')) {
    pkg.files.push('README.md');
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('Updated dist/package.json bin to ./src/bin/cli.js');

if (fs.existsSync(readmeSrc)) {
    fs.copyFileSync(readmeSrc, readmeDst);
    console.log('Copied README.md to dist/');
} else {
    console.warn('README.md not found in project root.');
}

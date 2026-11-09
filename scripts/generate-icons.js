import fs from 'fs';
import path from 'path';

// Let's create build directory
const buildDir = path.resolve(process.cwd(), 'build');
const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Copy PNG from public to build
const publicIcon = path.join(publicDir, 'icon.png');
const buildIcon = path.join(buildDir, 'icon.png');
if (fs.existsSync(publicIcon)) {
  fs.copyFileSync(publicIcon, buildIcon);
  console.log('Copied icon.png to build/');
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filesToPatch = [
  path.join(__dirname, '../node_modules/html2canvas/dist/html2canvas.esm.js'),
  path.join(__dirname, '../node_modules/html2canvas/dist/html2canvas.js'),
  path.join(__dirname, '../node_modules/html2canvas/dist/html2canvas.min.js'),
  path.join(__dirname, '../node_modules/html2canvas/dist/lib/css/types/color.js'),
];

// Remove the obsolete tsconfig.json shipped inside the html2canvas npm package.
// It references a non-existent 'src' folder which triggers TS18003 errors in TypeScript Language Server / IDE.
const html2canvasTsConfig = path.join(__dirname, '../node_modules/html2canvas/tsconfig.json');
if (fs.existsSync(html2canvasTsConfig)) {
  try {
    fs.unlinkSync(html2canvasTsConfig);
    console.log('[patch-html2canvas] Successfully removed unused node_modules/html2canvas/tsconfig.json');
  } catch (err) {
    console.warn('[patch-html2canvas] Notice: could not remove tsconfig.json:', err.message);
  }
}

let patchedCount = 0;

for (const filePath of filesToPatch) {
  if (!fs.existsSync(filePath)) continue;

  try {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Regex matching any indentation or minified format
    const regex = /if\s*\(\s*typeof\s+colorFunction\s*===\s*['"]undefined['"]\s*\)\s*\{\s*throw\s+new\s+Error\s*\(\s*["']Attempting to parse an unsupported color function\s*\\?["']\s*\+\s*value\.name\s*\+\s*["']\\?["']\s*\)\s*;?\s*\}/;
    const replacement = `if (typeof colorFunction === 'undefined') { return (typeof COLORS !== 'undefined' ? COLORS.TRANSPARENT : (typeof exports !== 'undefined' && exports.COLORS ? exports.COLORS.TRANSPARENT : 0)); }`;

    let modified = false;

    if (regex.test(content)) {
      content = content.replace(regex, replacement);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf-8');
      patchedCount++;
      console.log(`[patch-html2canvas] Successfully patched: ${path.basename(filePath)}`);
    } else {
      console.log(`[patch-html2canvas] Already patched or target not found: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.warn(`[patch-html2canvas] Error patching ${filePath}:`, err.message);
  }
}

console.log(`[patch-html2canvas] Completed. ${patchedCount} files updated to support oklch and modern colors.`);

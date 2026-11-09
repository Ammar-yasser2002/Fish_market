const fs = require('fs');
const path = require('path');

function patchBuffer(buf, targetStr, replacementStr) {
  if (targetStr.length !== replacementStr.length) {
    throw new Error(`Length mismatch: target (${targetStr.length}) vs replacement (${replacementStr.length})`);
  }
  const str = buf.toString('binary');
  let count = 0;
  let idx = 0;
  while ((idx = str.indexOf(targetStr, idx)) !== -1) {
    buf.write(replacementStr, idx, replacementStr.length, 'binary');
    count++;
    idx += replacementStr.length;
  }
  return count;
}

function patchAsarFile(asarPath) {
  if (!fs.existsSync(asarPath)) return false;
  try {
    const buf = fs.readFileSync(asarPath);

    // 1. Disable startup prewarm timeout call:
    const prewarmTarget = '      getOrCreatePrintWorker();';
    const prewarmRepl   = '      /* worker disabled */;   ';
    const c1 = patchBuffer(buf, prewarmTarget, prewarmRepl);

    // 2. Patch printWorkerWin from show: true to show: false, skipTaskbar: true:
    const targetWorker1 = '\n        show: true,\n        x: -20000,\n        y: -20000,';
    const replWorker1   = '\n        show: false,\n        skipTaskbar: true,          ';
    const c2 = patchBuffer(buf, targetWorker1, replWorker1);

    // 3. Patch fallback workerWin from show: true to show: false, skipTaskbar: true:
    const targetWorker2 = '\n          show: true,\n          x: -20000,\n          y: -20000,';
    const replWorker2   = '\n          show: false,\n          skipTaskbar: true,            ';
    const c3 = patchBuffer(buf, targetWorker2, replWorker2);

    fs.writeFileSync(asarPath, buf);
    console.log(`[patch-asar] ✓ Patched ${asarPath} (prewarm: ${c1}, worker1: ${c2}, worker2: ${c3})`);
    return true;
  } catch (err) {
    console.error(`[patch-asar] Error patching ${asarPath}:`, err.message);
    return false;
  }
}

// Export for post-build-sync
module.exports = { patchAsarFile };

if (require.main === module) {
  const targetAsar = path.resolve('release/win-unpacked/resources/app.asar');
  patchAsarFile(targetAsar);
}

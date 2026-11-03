// Writes Brotli (.br) and gzip (.gz) copies of the built web files, so the server can send them
// compressed without doing the work on every request. Runs after `vite build`.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.join(process.cwd(), 'dist', 'web');
const types = /\.(js|css|html|svg|json|webmanifest|txt)$/;
let n = 0, before = 0, after = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (types.test(e.name)) {
      const buf = fs.readFileSync(p);
      if (buf.length < 1024) continue;
      const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
      fs.writeFileSync(`${p}.br`, br);
      fs.writeFileSync(`${p}.gz`, zlib.gzipSync(buf, { level: 9 }));
      n++; before += buf.length; after += br.length;
    }
  }
};
walk(root);
console.log(`compress: ${n} files, ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB (brotli)`);

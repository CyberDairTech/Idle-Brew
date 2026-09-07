// One-time/offline-refresh helper: downloads the "latin" subset of the
// Google Fonts used by the game and inlines them as a self-contained CSS
// file (base64 data URIs) so the Android build doesn't need network access
// to render text. Re-run this only if the fonts used in index.html change.
const fs = require('fs');
const path = require('path');
const https = require('https');

const cssPath = path.join(__dirname, '..', 'vendor', 'fonts', 'google-fonts.css');
const outPath = path.join(__dirname, '..', 'vendor', 'fonts', 'fonts.css');
const raw = fs.readFileSync(cssPath, 'utf8');

// Split into individual @font-face blocks, keep only the ones Google tagged
// "latin" (not latin-ext/cyrillic/greek/vietnamese) - that's all this game needs.
const blocks = raw.split(/(?=\/\* [a-z-]+ \*\/)/g).filter((b) => /^\/\* latin \*\//.test(b.trim()));

function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBinary(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  let out = '';
  for (const block of blocks) {
    const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    const bin = await fetchBinary(url);
    const b64 = bin.toString('base64');
    const inlined = block.replace(url, `data:font/woff2;base64,${b64}`);
    out += inlined.trim() + '\n\n';
    console.log('inlined', url, `(${bin.length} bytes)`);
  }
  fs.writeFileSync(outPath, out);
  console.log('wrote', outPath, `(${out.length} chars)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

'use strict';
/*
  Build web untuk APK: salin aset statis ke www/ lalu obfuscate semua js/*.js.
  Pakai: node scripts/build-web.js [--no-obfuscate]
  Sumber di repo tidak diubah; hanya isi www/ yang ter-obfuscate.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');
const SKIP_OBFUSCATE = process.argv.includes('--no-obfuscate');

/* Yang ikut ke APK. .htaccess dan 404.html khusus hosting web, tidak dibawa. */
const COPY = ['index.html', 'manifest.webmanifest', 'sw.js', 'favicon.ico', 'css', 'img'];

/*
  Opsi dipilih yang aman untuk kode berbasis <script> global:
  semua file berbagi variabel/fungsi top-level, jadi renameGlobals HARUS false.
  Control-flow flattening dan self-defending dimatikan supaya ukuran dan kecepatan tetap wajar.
*/
const OBF = {
  compact: true,
  renameGlobals: false,
  identifierNamesGenerator: 'hexadecimal',
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  rotateStringArray: true,
  shuffleStringArray: true,
  splitStrings: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  numbersToExpressions: false,
  simplify: true,
  target: 'browser',
  sourceMap: false
};

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copy(src, dst) { fs.cpSync(src, dst, { recursive: true }); }

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });
for (const f of COPY) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) throw new Error('File/folder tidak ditemukan: ' + f);
  copy(src, path.join(OUT, f));
}

const jsSrc = path.join(ROOT, 'js');
const jsOut = path.join(OUT, 'js');
fs.mkdirSync(jsOut, { recursive: true });

let Obf = null;
if (!SKIP_OBFUSCATE) {
  try { Obf = require('javascript-obfuscator'); }
  catch (e) { throw new Error('javascript-obfuscator belum terpasang. Jalankan "npm install" dulu, atau pakai --no-obfuscate.'); }
}

let before = 0, after = 0, n = 0;
for (const f of fs.readdirSync(jsSrc).filter(x => x.endsWith('.js'))) {
  const code = fs.readFileSync(path.join(jsSrc, f), 'utf8');
  const out = Obf ? Obf.obfuscate(code, OBF).getObfuscatedCode() : code;
  fs.writeFileSync(path.join(jsOut, f), out);
  before += Buffer.byteLength(code); after += Buffer.byteLength(out); n++;
  console.log((Obf ? 'obfuscate ' : 'salin     ') + 'js/' + f);
}

/* sw.js juga ikut di-obfuscate; file kecil dan tidak berbagi global dengan yang lain. */
if (Obf) {
  const swPath = path.join(OUT, 'sw.js');
  fs.writeFileSync(swPath, Obf.obfuscate(fs.readFileSync(swPath, 'utf8'), OBF).getObfuscatedCode());
  console.log('obfuscate sw.js');
}

console.log(`\nSelesai: ${n} file JS, ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB. Output: www/`);

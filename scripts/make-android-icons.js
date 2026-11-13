'use strict';
/*
  Ganti ikon launcher dan splash default Capacitor dengan logo Lapak Kosan.
  Dijalankan SETELAH "npx cap add android" (folder android/ harus sudah ada):
    node scripts/make-android-icons.js

  Sumber: img/icon-512.png dan img/icon-maskable-512.png (ikon launcher, rumah saja),
  img/logo.png (splash, lengkap dengan tulisan "Lapak Kosan").
  Nama "Lapak Kosan" di bawah ikon launcher datang dari appName di capacitor.config.json.
*/
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const LOGO = path.join(ROOT, 'img', 'icon-512.png');
const LOGO_FULL = path.join(ROOT, 'img', 'logo.png'); /* logo + tulisan "Lapak Kosan", untuk splash */
const LEGACY_SRC = path.join(ROOT, 'img', 'icon-maskable-512.png');
const BG = '#FCF9F2'; /* sama dengan background_color di manifest.webmanifest */

/* ukuran piksel per density: ikon biasa (48dp) dan layer adaptive (108dp) */
const DENSITIES = {
  mdpi: { legacy: 48, fg: 108 },
  hdpi: { legacy: 72, fg: 162 },
  xhdpi: { legacy: 96, fg: 216 },
  xxhdpi: { legacy: 144, fg: 324 },
  xxxhdpi: { legacy: 192, fg: 432 }
};

function bgRgb() {
  const n = parseInt(BG.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}

/* logo ditaruh di tengah kanvas transparan; ratio = lebar logo / lebar kanvas */
async function centered(size, ratio, background) {
  const inner = Math.round(size * ratio);
  const logo = await sharp(LOGO).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: background || { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, gravity: 'center' }]).png().toBuffer();
}

async function main() {
  if (!fs.existsSync(RES)) throw new Error('Folder android/ belum ada. Jalankan "npx cap add android" dulu.');

  for (const [d, s] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, 'mipmap-' + d);
    fs.mkdirSync(dir, { recursive: true });

    /* ikon biasa (Android < 8): persegi dan bulat */
    const sq = await sharp(LEGACY_SRC).resize(s.legacy, s.legacy).png().toBuffer();
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), sq);
    const mask = Buffer.from(`<svg width="${s.legacy}" height="${s.legacy}"><circle cx="${s.legacy / 2}" cy="${s.legacy / 2}" r="${s.legacy / 2}" fill="#fff"/></svg>`);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await sharp(sq).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer());

    /* ikon adaptive (Android 8+): logo di tengah, tersisa di zona aman (66% dari layer 108dp) */
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await centered(s.fg, 0.6));
  }

  /* warna latar adaptive icon */
  const valuesDir = path.join(RES, 'values');
  fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

  /* splash: timpa setiap splash.png bawaan Capacitor, ukuran aslinya dipertahankan */
  let nSplash = 0;
  for (const e of fs.readdirSync(RES, { withFileTypes: true })) {
    if (!e.isDirectory() || !e.name.startsWith('drawable')) continue;
    const p = path.join(RES, e.name, 'splash.png');
    if (!fs.existsSync(p)) continue;
    const m = await sharp(p).metadata();
    /* splash pakai logo lengkap (rumah + tulisan "Lapak Kosan"), lebar 60% sisi terpendek layar */
    const box = Math.round(Math.min(m.width, m.height) * 0.6);
    const logo = await sharp(LOGO_FULL).resize(box, box, { fit: 'inside' }).png().toBuffer();
    const out = await sharp({ create: { width: m.width, height: m.height, channels: 4, background: bgRgb() } })
      .composite([{ input: logo, gravity: 'center' }]).png().toBuffer();
    fs.writeFileSync(p, out);
    nSplash++;
  }
  console.log(`Ikon launcher (${Object.keys(DENSITIES).length} density) dan ${nSplash} splash diganti dengan logo Lapak Kosan.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

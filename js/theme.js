'use strict';
/* ============================================================
   TEMA TAMPILAN
   Admin memilih warna dan gaya di tab Tampilan. Tema disimpan di Firestore (site/theme),
   dibaca semua pengguna, lalu diubah jadi variabel CSS di sini. Dimuat di <head> supaya
   tema terakhir (disimpan di localStorage) langsung dipakai sebelum halaman tampil.
   Semua warna turunan (teks, garis, status, panel depan) dihitung dari tiga warna pilihan
   admin dan dijaga agar kontrasnya terbaca.
   ============================================================ */
const THEME_KEY = 'kk-theme-v1';
const PRESETS = {
  lapak:   { name: 'Lapak',   accent: '#F5A00A', bg: '#F6F4F0', hero: '#1B1E21' },
  hutan:   { name: 'Hutan',   accent: '#0B6E60', bg: '#EDF1F0' },
  samudra: { name: 'Samudra', accent: '#1D4ED8', bg: '#EDF1F9' },
  anggur:  { name: 'Anggur',  accent: '#7E22CE', bg: '#F3F0F8' },
  mawar:   { name: 'Mawar',   accent: '#BE123C', bg: '#F8F0F2' },
  jeruk:   { name: 'Jeruk',   accent: '#C2410C', bg: '#F3F2F0' },
  arang:   { name: 'Arang',   accent: '#273244', bg: '#EEEFF0' },
  malam:   { name: 'Malam',   accent: '#4CC3AC', bg: '#0E1619' }
};
const RADII = { tegas: ['2px', '2px'], sedang: ['8px', '6px'], bulat: ['16px', '10px'] };
let THEME = null, themeKeys = [];
try { const c = localStorage.getItem(THEME_KEY); if (c) THEME = JSON.parse(c); } catch (e) {}

const DEFAULT_THEME = { preset: 'lapak' };
const CUSTOM_BRAND = () => !!(THEME && THEME.appName && THEME.appName.trim());
const APP = () => (THEME && THEME.appName && THEME.appName.trim()) || 'Lapak Kosan';
const APPLOGO = () => APP().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'LK';

/* ---------- warna ---------- */
const hx = h => { h = String(h || '').trim(); if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null; };
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mixc = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);
const lumOf = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const contrastOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const WHITE = [255, 255, 255], NIGHT = [11, 17, 20];
const onColor = c => contrastOf(c, WHITE) >= contrastOf(c, NIGHT) ? WHITE : NIGHT;
/* geser warna ke arah `toward` sampai kontrasnya terhadap `on` cukup */
function legible(c, on, toward, min) { for (let p = 0; p <= 1.001; p += .05) { const m = mixc(c, toward, p); if (contrastOf(m, on) >= min) return m; } return toward; }
const rgba = (c, a) => 'rgba(' + c.map(Math.round).join(',') + ',' + a + ')';

function themeVars(t) {
  const accent0 = hx(t.accent) || hx(PRESETS.hutan.accent), bg = hx(t.bg) || hx(PRESETS.hutan.bg);
  const dark = lumOf(bg) < .18;
  const ink = dark ? mixc([238, 243, 244], bg, .06) : mixc([13, 20, 23], accent0, .08);
  const surface = dark ? mixc(bg, WHITE, .05) : mixc(bg, WHITE, .86);
  const surface2 = dark ? mixc(bg, WHITE, .11) : mixc(bg, ink, .07);
  const line = dark ? mixc(bg, WHITE, .17) : mixc(bg, ink, .17);
  const muted = legible(mixc(ink, bg, .4), surface, ink, 4.6);
  const accent = dark && lumOf(accent0) < .2 ? mixc(accent0, WHITE, .4) : accent0;
  const accentText = legible(accent, surface, dark ? WHITE : ink, 4.6);
  const accentSoft = dark ? mixc(bg, accent, .24) : mixc(bg, accent, .15);
  const heroOwn = hx(t.hero);
  const heroBg = heroOwn || (dark ? mixc(bg, accent, .14) : mixc(accent0, [4, 14, 12], .6));
  const heroDark = lumOf(heroBg) < .35;
  const heroInk = heroDark ? [238, 247, 245] : [13, 20, 23];
  const heroAccent = heroDark ? (contrastOf(accent, heroBg) >= 3 ? accent : legible(accent, heroBg, WHITE, 3)) : accent0;
  const st = dark
    ? { ok: '#6FD39A', 'ok-bg': '#163526', warn: '#F0C26B', 'warn-bg': '#3A2D10', 'warn-line': '#8A6A24', bad: '#FF9C93', 'bad-bg': '#3E1B18', 'bad-line': '#9A4640' }
    : { ok: '#17703F', 'ok-bg': '#D8F0E1', warn: '#7F4A00', 'warn-bg': '#F9E7C1', 'warn-line': '#D9A441', bad: '#A8231B', 'bad-bg': '#FADAD6', 'bad-line': '#DB7F77' };
  const rad = RADII[t.radius] || RADII.sedang;
  const v = {
    bg: toHex(bg), surface: toHex(surface), 'surface-2': toHex(surface2), ink: toHex(ink), muted: toHex(muted), line: toHex(line),
    accent: toHex(accent), 'accent-ink': toHex(onColor(accent)), 'accent-soft': toHex(accentSoft), 'accent-text': toHex(accentText),
    'hero-bg': toHex(heroBg), 'hero-ink': toHex(heroInk), 'hero-mute': toHex(mixc(heroInk, heroBg, .36)), 'hero-line': rgba(heroInk, .28), 'hero-grid': rgba(heroInk, .07),
    'hero-accent': toHex(heroAccent), 'hero-accent-ink': toHex(onColor(heroAccent)),
    r: rad[0], 'r-sm': rad[1],
    sh: '0 1px 2px ' + rgba(dark ? [0, 0, 0] : ink, dark ? .5 : .06) + ', 0 8px 20px -10px ' + rgba(dark ? [0, 0, 0] : ink, dark ? .7 : .2)
  };
  Object.keys(st).forEach(k => { v[k] = st[k]; });
  return { vars: v, dark };
}

function applyTheme(t) {
  t = t || DEFAULT_THEME;
  const root = document.documentElement;
  themeKeys.forEach(k => root.style.removeProperty('--' + k)); themeKeys = [];
  if (t && (t.accent || t.bg || t.preset)) {
    const p = PRESETS[t.preset] || {};
    const T = Object.assign({}, p, t);
    const { vars, dark } = themeVars(T);
    Object.keys(vars).forEach(k => { root.style.setProperty('--' + k, vars[k]); themeKeys.push(k); });
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.style.colorScheme = dark ? 'dark' : 'light';
    let m = document.querySelector('meta[name=theme-color]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = vars.surface;
  } else { root.removeAttribute('data-theme'); root.style.colorScheme = ''; }
  syncBrand();
}
/* logo untuk panel halaman masuk: versi terang untuk panel gelap, versi asli untuk panel terang */
function heroLogo() {
  const c = hx(getComputedStyle(document.documentElement).getPropertyValue('--hero-ink').trim());
  return c && lumOf(c) < .3 ? 'img/logo.png' : 'img/logo-light.png';
}
function syncBrand() {
  const l = document.getElementById('applogo');
  if (l) {
    if (CUSTOM_BRAND()) { if (l.firstElementChild) l.textContent = ''; l.className = 'logo'; if (l.textContent !== APPLOGO()) l.textContent = APPLOGO(); }
    else { l.className = 'logo logo-img'; if (!l.firstElementChild) l.innerHTML = '<img src="img/icon.png" alt="" width="40" height="40">'; }
  }
  if (!/^\(\d+\)/.test(document.title)) document.title = isAdminTitle() ? 'Admin ' + APP() : APP();
}
const isAdminTitle = () => typeof isAdmin !== 'undefined' && isAdmin;
function setTheme(t) {
  THEME = t && Object.keys(t).length ? t : null;
  try { if (THEME) localStorage.setItem(THEME_KEY, JSON.stringify(THEME)); else localStorage.removeItem(THEME_KEY); } catch (e) {}
  applyTheme(THEME);
}
applyTheme(THEME);
document.addEventListener('DOMContentLoaded', syncBrand);

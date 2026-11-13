'use strict';
//#PURE-START
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseD = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
function dueFor(moveIn, y, m) {
  const d = parseD(moveIn).getDate();
  const last = new Date(y, m + 1, 0).getDate();
  return y + '-' + pad(m + 1) + '-' + pad(Math.min(d, last));
}
function deriveBills(tenants, payments, todayStr, horizon) {
  const lim = addDays(todayStr, horizon == null ? 14 : horizon);
  const out = [];
  for (const tid of Object.keys(tenants)) {
    const t = tenants[tid];
    if (!t || !t.moveIn) continue;
    const s = parseD(t.moveIn);
    let y = s.getFullYear(), m = s.getMonth();
    if (t.billFrom && /^\d{4}-\d{2}$/.test(t.billFrom)) {
      const by = Number(t.billFrom.slice(0, 4)), bm = Number(t.billFrom.slice(5, 7)) - 1;
      if (by * 12 + bm > y * 12 + m) { y = by; m = bm; }
    }
    for (let i = 0; i < 480; i++) {
      const due = dueFor(t.moveIn, y, m);
      if (due > lim) break;
      if (t.moveOut && due > t.moveOut) break;
      const period = y + '-' + pad(m + 1);
      const id = tid + '_' + period;
      const pay = payments[id] || null;
      if (Number(t.contractMonths) > 0) {
        /* penghuni berkontrak: satu tagihan penuh = harga × durasi, ditambah satu tagihan per perpanjangan */
        const exts = Array.isArray(t.extensions) ? t.extensions : [];
        const first = Math.max(1, Number(t.contractMonths) - exts.reduce((n, e) => n + (Number(e.months) || 0), 0));
        out.push({ id, tenantId: tid, roomId: (pay && pay.roomId) || t.roomId, period, due, amount: pay ? Number(pay.amount) : Number(t.firstRent || t.rent) * first, paid: !!pay, pay });
        for (const e of exts) {
          if (!e.start || e.start > lim || (t.moveOut && e.start > t.moveOut)) continue;
          const ep = e.start.slice(0, 7), eid = tid + '_' + ep, epay = payments[eid] || null;
          out.push({ id: eid, tenantId: tid, roomId: (epay && epay.roomId) || t.roomId, period: ep, due: e.start, amount: epay ? Number(epay.amount) : Number(e.rent) * (Number(e.months) || 1), paid: !!epay, pay: epay });
        }
        break;
      }
      out.push({ id, tenantId: tid, roomId: (pay && pay.roomId) || t.roomId, period, due, amount: pay ? Number(pay.amount) : Number(t.rent), paid: !!pay, pay });
      m++; if (m > 11) { m = 0; y++; }
    }
  }
  /* pembayaran yang tagihannya tidak ikut terbentuk (bayar di muka, tanggal masuk diubah, dan sebagainya) tetap dihitung sebagai tagihan lunas supaya Laporan sama dengan Keuangan */
  const seen = {}; out.forEach(b => { seen[b.id] = 1; });
  Object.keys(payments || {}).forEach(pid => {
    const x = payments[pid];
    if (seen[pid] || !x || !x.tenantId || !/^\d{4}-\d{2}$/.test(String(x.period || ''))) return;
    const t = tenants[x.tenantId];
    let due = x.paidAt || '';
    if (t && t.moveIn) due = dueFor(t.moveIn, Number(x.period.slice(0, 4)), Number(x.period.slice(5, 7)) - 1);
    out.push({ id: pid, tenantId: x.tenantId, roomId: x.roomId || (t && t.roomId) || '', period: x.period, due, amount: Number(x.amount) || 0, paid: true, pay: x });
  });
  return out;
}
function billStatus(b, todayStr) {
  if (b.paid) return { k: 'paid', d: 0 };
  const d = daysBetween(todayStr, b.due);
  if (d < 0) return { k: 'late', d: -d };
  if (d <= 7) return { k: 'soon', d };
  return { k: 'later', d };
}
function roomPrice(room, features) {
  let p = Number(room.base) || 0;
  const ids = room.features || [];
  for (const f of (features || [])) if (ids.indexOf(f.id) >= 0) p += Number(f.price) || 0;
  return p;
}
function nextDue(moveIn, todayStr) {
  const s = parseD(moveIn); let y = s.getFullYear(), m = s.getMonth();
  for (let i = 0; i < 600; i++) { const d = dueFor(moveIn, y, m); if (d >= todayStr) return d; m++; if (m > 11) { m = 0; y++; } }
  return moveIn;
}
let migrated = false;
async function migrateLegacy() {
  if (migrated || !canWrite || mode === 'loading') return;
  migrated = true;
  const ids = Object.keys(S.tenants).filter(id => {
    const t = S.tenants[id];
    return !t.moveOut && !t.billFrom && t.moveIn && !Object.keys(S.payments).some(k => S.payments[k].tenantId === id);
  });
  if (!ids.length) return;
  await run(async () => { for (const id of ids) { const t = S.tenants[id]; await repo.set('tenants', id, Object.assign({}, t, { billFrom: nextDue(t.moveIn, todayStr()).slice(0, 7) })); } });
}
const natCmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
//#PURE-END

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => ymd(new Date());
const rp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const fmtDate = s => s ? parseD(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtPeriod = p => parseD(p + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
const safePhoto = s => (typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(s)) ? s : '';
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/* jenis usaha: kosan (kamar per lantai), kontrakan (rumah dengan alamat sendiri), atau keduanya */
const KOS_TYPES = { kosan: 'Kosan', kontrakan: 'Kontrakan', both: 'Keduanya (kosan dan kontrakan)' };
const kosType = () => { const t = (S.meta.kos || {}).type; return KOS_TYPES[t] ? t : 'kosan'; };
const isKon = r => !!r && r.kind === 'kontrakan';
const unitName = r => isKon(r) ? (/^kontrakan\b/i.test(r.number) ? '' : 'Kontrakan ') + r.number : 'Kamar ' + (r ? r.number : '?');
const unitNameId = id => (cur && cur.roomsById[id]) ? unitName(cur.roomsById[id]) : 'Kamar ?';
const showKos = () => kosType() !== 'kontrakan' || !!(cur && cur.rooms.some(r => !isKon(r)));
const showKon = () => kosType() !== 'kosan' || !!(cur && cur.rooms.some(isKon));
const unitHead = () => { const a = showKos(), b = showKon(); return a && b ? 'Unit' : b ? 'Kontrakan' : 'Kamar'; };
const shortAddr = (a, n) => { a = String(a || '').replace(/\s+/g, ' ').trim(); n = n || 42; return a.length > n ? a.slice(0, n - 1) + '…' : a; };
const typeRadios = v => '<div class="fld full"><span>Jenis usaha</span><div class="checks">' + Object.keys(KOS_TYPES).map(k => '<label class="check"><input type="radio" name="kosType" value="' + k + '"' + (v === k ? ' checked' : '') + '>' + KOS_TYPES[k] + '</label>').join('') + '</div><small>Kosan: kamar per lantai. Kontrakan: rumah dengan alamat masing-masing. Bisa diubah nanti di Pengaturan.</small></div>';

const DEFAULT_FEATURES = [
  { id: 'ac', name: 'AC', price: 300000 },
  { id: 'kmd', name: 'Kamar mandi dalam', price: 250000 },
  { id: 'wh', name: 'Water heater', price: 100000 },
  { id: 'fur', name: 'Furnished', price: 150000 },
  { id: 'bal', name: 'Balkon', price: 100000 },
  { id: 'lnd', name: 'Laundry', price: 100000 },
  { id: 'prk', name: 'Parkir motor', price: 50000 },
  { id: 'prm', name: 'Parkir mobil', price: 250000 }
];
const COLS = ['rooms', 'tenants', 'payments', 'cameras', 'staff', 'salary', 'meta', 'utils', 'expenses', 'waitlist'];
const S = { rooms: {}, tenants: {}, payments: {}, cameras: {}, staff: {}, salary: {}, meta: {}, utils: {}, expenses: {}, waitlist: {} };
const loaded = {};
let repo = null, dl = null, canWrite = true, mode = 'loading', loadErr = '';
let auth = null, fdb = null, fbUser = null, authReady = false, unsubs = [];
let authMode = 'login', authMsg = '', authBusy = false, authEmail = '', authSig = '';
/* pengunjung baru melihat halaman depan dulu; aplikasi yang sudah dipasang di HP langsung ke form masuk */
const isStandalone = () => { try { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { return false; } };
let authView = isStandalone() ? 'form' : 'landing';
const LOADING = '<p class="loading" style="grid-column:1/-1;align-self:center">Memuat data kos…</p>';
const UI = { chatWith: '', chatDraft: '', le: '', lePick: '', tab: 'dashboard', bk: 'tunggu', dy: '', wp: '', wq: '', wk: 'all', lf: 'all', tf: 'aktif', sf: 'aktif', tl: 'all', q: '', bf: 'tagih', af: 'pending', abf: 'tagih', aq: '', up: null, kp: null, rp: { period: null, room: 'all' } };
let cur = null;

function stopOwner() {
  unsubs.forEach(f => { try { f(); } catch (e) {} }); unsubs = [];
  COLS.forEach(c => { S[c] = {}; delete loaded[c]; });
  cur = null; migrated = false; loadErr = ''; repo = null; mode = 'loading';
}
function stopData() { stopOwner(); sessStop(); closeModal(true); }
function effTab() {
  const adm = ADMIN_TABS.indexOf(UI.tab) >= 0;
  if (isAdmin && VIEW) return (adm || UI.tab === 'langganan' || UI.tab === 'chat') ? 'dashboard' : UI.tab;
  if (isAdmin) return adm ? UI.tab : 'daftar';
  return adm ? 'dashboard' : UI.tab;
}
const errText = e => {
  const c = e && e.code;
  if (c === 'view-only') return 'Mode lihat saja. Admin tidak bisa mengubah data pemilik.';
  if (c === 'quota_exceeded') return 'Penyimpanan penuh. Hapus data yang tidak dipakai.';
  if (c === 'invalid_argument') return 'Kamu tidak punya izin mengubah data ini.';
  if (c === 'permission-denied') return 'Tidak punya izin. Cek aturan Firestore di Firebase.';
  if (c === 'unavailable') return 'Tidak ada koneksi internet.';
  if (c === 'resource_exhausted') return 'Terlalu cepat. Tunggu sebentar lalu coba lagi.';
  return (e && e.message && !c) ? e.message : 'Gagal menyimpan. Coba lagi.';
};
let authed = false, lastGateSig = '';
async function hashPin(pin) {
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kelola-kos:' + pin));
    return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { return 'p:' + btoa(pin); }
}
function setAuthed(v) {
  authed = v; lastGateSig = '';
  try { if (v) sessionStorage.setItem('kk-authed', '1'); else sessionStorage.removeItem('kk-authed'); } catch (e) {}
  render(); window.scrollTo(0, 0);
}
function gateHTML(k, setup, custom) {
  const T = [['101', 'occ'], ['102', 'occ'], ['103', 'soon'], ['104', 'vac'], ['105', 'occ'], ['106', 'late'], ['107', 'occ'], ['108', 'vac'], ['109', 'occ'], ['110', 'occ'], ['111', 'vac'], ['112', 'occ']];
  const tile = (t, i) => '<div class="gt gt-' + t[1] + '" style="--i:' + i + '"><b>' + t[0] + '</b></div>';
  const named = !!(k.name && k.setupDone);
  const hero = '<div class="g-hero"><div class="g-in"><div class="g-top">' + (CUSTOM_BRAND() ? '<span class="g-logo">' + esc(APPLOGO()) + '</span><span>' + esc(APP()) + '</span>' : '<img class="g-brand" src="' + heroLogo() + '" alt="' + esc(APP()) + '" width="800" height="555">') + '</div><div class="g-mid"><p class="g-eyebrow">' + (named ? 'Panel pemilik' : 'Untuk pemilik kos') + '</p><h1>' + (named ? esc(k.name) : esc((THEME && THEME.heroTitle) || 'Kosan dan kontrakan, rapi dalam satu layar.')) + '</h1><p class="g-sub">' + (named ? esc(k.address || '') : esc((THEME && THEME.heroSub) || 'Catat penghuni, kontrak, tagihan, listrik dan air, sampai laporan keuangan. Semua dalam satu tempat.')) + '</p>' +
    (custom && FB_READY && authMode === 'login' ? '<button type="button" class="g-trial" data-act="auth-trial"><span><b>Coba gratis 1 bulan</b><small>Tanpa bayar · maksimal ' + TRIAL_MAX + ' unit · kosan, kontrakan, atau keduanya</small></span><i aria-hidden="true">→</i></button>' : '') +
    '<div class="g-plan" aria-hidden="true">' + T.slice(0, 6).map((t, i) => tile(t, i)).join('') + '<div class="g-corr">koridor</div>' + T.slice(6).map((t, i) => tile(t, i + 6)).join('') + '</div>' +
    '<ul class="g-feat"><li>Denah kamar dan kontrakan, yang terisi dan kosong langsung kelihatan</li><li>Jatuh tempo, kontrak, dan tagihan listrik air dihitung otomatis</li><li>Pengingat WhatsApp dan kwitansi PDF sekali klik</li></ul></div>' +
    '<div class="g-foot">' + (named && k.ownerName ? 'Pemilik: ' + esc(k.ownerName) + (k.ownerPhone ? ' · ' + esc(k.ownerPhone) : '') : '') + '</div></div></div>';
  let card;
  if (setup) {
    card = '<form id="gate-setup" class="g-card"><h2>Atur kos kamu</h2><p class="muted">Cukup diisi sekali. Semuanya bisa diubah nanti di Pengaturan.</p><div class="formgrid">' +
      fld('Nama kos / usaha', '<input name="name" id="g-name" required maxlength="60" autocomplete="off" placeholder="Kos Melati" value="' + esc(k.name || '') + '">', '', 'full') +
      typeRadios(KOS_TYPES[k.type] ? k.type : 'kosan') +
      fld('Alamat kosan / usaha', '<textarea name="address" id="g-addr" maxlength="200" rows="2" placeholder="Jl. Kenanga No. 12, Kelurahan, Kota">' + esc(k.address || '') + '</textarea>', 'Alamat kosan atau alamat utama usaha. Alamat tiap kontrakan diisi nanti, satu per satu.', 'full') +
      '<div class="fsec">Data pemilik</div>' +
      fld('Nama pemilik', '<input name="ownerName" id="g-owner" required maxlength="80" autocomplete="off" value="' + esc(k.ownerName || '') + '">', '', 'full') +
      fld('No. WhatsApp', '<input name="ownerPhone" id="g-phone" required inputmode="tel" maxlength="20" placeholder="0812xxxxxxxx" value="' + esc(k.ownerPhone || '') + '">') +
      fld('Email (opsional)', '<input name="ownerEmail" id="g-email" type="email" maxlength="80" value="' + esc(k.ownerEmail || (fbUser && fbUser.email) || '') + '">') +
      '</div><button class="btn primary lg" type="submit">Simpan dan masuk</button></form>';
  } else if (!k.setupDone && !canWrite) {
    card = '<form id="gate-login" class="g-card"><h2>Kos belum disiapkan</h2><p class="muted">Pemilik belum mengisi nama dan alamat kos. Kamu bisa melihat data yang sudah ada.</p><button class="btn primary lg" type="submit">Lihat data</button></form>';
  } else {
    card = '<form id="gate-login" class="g-card"><h2>' + (canWrite ? 'Masuk sebagai admin' : 'Lihat data kos') + '</h2><p class="muted">' + (canWrite ? (k.pinHash ? 'Masukkan PIN admin untuk membuka panel.' : 'Klik masuk untuk membuka panel kelola kos.') : 'Kamu bisa melihat data, tanpa mengubahnya.') + '</p>' +
      (k.pinHash ? fld('PIN admin', '<input name="pin" id="g-pin" type="password" inputmode="numeric" maxlength="6" required autocomplete="current-password">') : '') +
      '<button class="btn primary lg" type="submit">' + (canWrite ? 'Masuk' : 'Lihat data') + '</button>' +
      (k.pinHash && canWrite ? '<button type="button" class="btn sm g-link" data-act="pin-reset" data-confirm="Klik lagi untuk hapus PIN">Lupa PIN? Hapus PIN</button>' : '') +
      '<p class="g-note">Siapa yang bisa membuka halaman ini diatur lewat tombol Share. PIN hanya pengunci layar.</p></form>';
  }
  return hero + '<div class="g-side">' + (custom || card) + '</div>';
}
function authErr(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/invalid-email') return 'Format email tidak benar.';
  if (c === 'auth/user-not-found' || c === 'auth/wrong-password' || c === 'auth/invalid-credential') return 'Email atau password salah.';
  if (c === 'auth/email-already-in-use') return 'Email ini sudah terdaftar. Silakan masuk.';
  if (c === 'auth/weak-password') return 'Password terlalu lemah. Minimal 6 karakter.';
  if (c === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (c === 'auth/network-request-failed') return 'Tidak ada koneksi internet.';
  if (c === 'auth/operation-not-allowed') return 'Login Email/Password belum diaktifkan di Firebase.';
  if (c === 'auth/unauthorized-domain') return 'Domain ini belum didaftarkan di Firebase (Authorized domains).';
  return 'Gagal. Coba lagi.';
}
/* captcha sederhana di halaman masuk dan daftar (gambar kode 5 karakter), mata untuk lihat/sembunyikan password */
const CAP = { code: '' };
function capNew() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint32Array(5); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 4294967295); });
  CAP.code = Array.from(a).map(n => ch[n % ch.length]).join('');
}
function capDraw() {
  const cv = document.getElementById('cap-cv'); if (!cv || !cv.getContext) return;
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, r = n => Math.random() * n;
  c.fillStyle = '#F4F1EA'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) { c.strokeStyle = 'hsla(' + Math.floor(r(360)) + ',45%,45%,.45)'; c.lineWidth = 1 + r(1.5); c.beginPath(); c.moveTo(r(W), r(H)); c.bezierCurveTo(r(W), r(H), r(W), r(H), r(W), r(H)); c.stroke(); }
  for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(40,40,40,.35)'; c.fillRect(r(W), r(H), 2, 2); }
  c.textBaseline = 'middle'; c.textAlign = 'center';
  CAP.code.split('').forEach((t, i) => {
    c.save(); c.translate(22 + i * ((W - 44) / 4), H / 2 + (r(10) - 5)); c.rotate((r(0.7) - 0.35));
    c.font = '700 ' + (28 + Math.floor(r(6))) + 'px "Familjen Grotesk", Arial, sans-serif'; c.fillStyle = 'hsl(' + Math.floor(r(360)) + ',55%,28%)'; c.fillText(t, 0, 0); c.restore();
  });
}
const EYE = '<svg class="eye-on" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-off" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/></svg>';
const pwBox = input => '<span class="pw">' + input + '<button type="button" class="eye" data-act="pw-eye" aria-label="Tampilkan password" aria-pressed="false">' + EYE + '</button></span>';
const AUTH_H = {
  'pw-eye': el => { const i = el.closest('.pw').querySelector('input'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.setAttribute('aria-pressed', String(show)); el.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password'); el.classList.toggle('on', show); },
  'cap-new': () => { capNew(); capDraw(); const i = document.getElementById('cap-in'); if (i) { i.value = ''; i.focus(); } }
};
function authCard() {
  capNew();
  const reg = authMode === 'register', plans = planList(true);
  const trialOn = !plans.length || REG.mode === 'trial';
  const planSel = plans.length ? '<div id="r-plan-wrap"' + (trialOn ? ' hidden' : '') + '>' + fld('Paket langganan', '<select name="planId" id="r-plan" data-reg="planId"' + (trialOn ? ' disabled' : ' required') + '><option value="">- pilih paket -</option>' + plans.map(p => '<option value="' + esc(p.id) + '"' + (REG.planId === p.id ? ' selected' : '') + '>' + esc(planLabel(p)) + '</option>').join('') + '</select>', 'Tagihan bulanan dan batas kamar mengikuti paket. Bisa diganti admin nanti.', 'full') + '</div>' : '';
  const modeSel = '<div class="fld full"><span>Mulai dengan</span><div class="checks"><label class="check"><input type="radio" name="regMode" value="trial" data-reg="mode"' + (trialOn ? ' checked' : '') + '>Free trial 1 bulan</label>' + (plans.length ? '<label class="check"><input type="radio" name="regMode" value="plan" data-reg="mode"' + (trialOn ? '' : ' checked') + '>Langsung pilih paket</label>' : '') + '</div><small id="r-trialnote"' + (trialOn ? '' : ' hidden') + '>Gratis 1 bulan sejak akun disetujui, maksimal ' + TRIAL_MAX + ' unit. Unit boleh kamar kosan, kontrakan, atau keduanya. Setelah itu pilih paket berbayar untuk lanjut.</small></div>';
  const regFields = reg ? fld('Nama pemilik', '<input name="ownerName" data-reg="ownerName" required maxlength="80" autocomplete="name" value="' + esc(REG.ownerName) + '">') +
    fld('No. WhatsApp', '<input name="phone" data-reg="phone" required inputmode="tel" maxlength="20" autocomplete="tel" placeholder="0812xxxxxxxx" value="' + esc(REG.phone) + '">') +
    fld('Nama kos', '<input name="kosName" data-reg="kosName" required maxlength="60" placeholder="Kos Melati" value="' + esc(REG.kosName) + '">') + modeSel + planSel : '';
  return '<form id="auth-form" class="g-card"><h2>' + (reg ? 'Buat akun' : 'Masuk') + '</h2><p class="muted">' + (reg ? 'Daftar dulu, lalu tunggu admin memverifikasi. Akun baru bisa dipakai setelah disetujui.' : 'Masuk untuk membuka panel kos kamu.') + '</p>' +
    (reg ? '' : '<div class="trial-box"><div><b>Baru di sini?</b><small>Coba gratis 1 bulan, maksimal ' + TRIAL_MAX + ' unit.</small></div><button type="button" class="btn sm primary" data-act="auth-trial">Coba gratis</button></div>') + regFields +
    fld('Email', '<input name="email" id="a-email" type="email" required maxlength="120" autocomplete="email" value="' + esc(authEmail) + '">') +
    fld('Password', pwBox('<input name="password" id="a-pass" type="password" required minlength="6" autocomplete="' + (reg ? 'new-password' : 'current-password') + '">'), reg ? 'Minimal 6 karakter.' : '') +
    (reg ? fld('Ulangi password', pwBox('<input name="password2" type="password" required minlength="6" autocomplete="new-password">')) : '') +
    '<div class="fld cap"><span>Verifikasi bukan robot</span><div class="caprow"><canvas id="cap-cv" width="180" height="52" role="img" aria-label="Kode captcha"></canvas><button type="button" class="btn sm" data-act="cap-new" aria-label="Ganti kode captcha" title="Ganti kode">↻</button></div><input name="captcha" id="cap-in" required maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ketik 5 karakter di gambar"><small>Tidak peka huruf besar atau kecil.</small></div>' +
    (authMsg ? '<p class="g-note" role="alert" style="color:var(--bad);font-weight:600">' + esc(authMsg) + '</p>' : '') +
    '<button class="btn primary lg" type="submit"' + (authBusy ? ' disabled' : '') + '>' + (authBusy ? 'Memproses…' : (reg ? 'Daftar' : 'Masuk')) + '</button>' +
    (reg ? '' : '<button type="button" class="btn sm g-link" data-act="auth-reset">Lupa password?</button>') +
    '<button type="button" class="btn sm g-link" data-act="auth-mode">' + (reg ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar') + '</button>' +
    '<button type="button" class="btn sm g-link" data-act="land-back">← Kembali ke beranda</button></form>';
}
function configCard() {
  return '<div class="g-card"><h2>Firebase belum diisi</h2><p class="muted">Buka file ini di editor teks, cari <b>FIREBASE_CONFIG</b> di bagian atas script, lalu isi dengan config web app dari Firebase Console. Setelah itu upload ulang.</p></div>';
}
function renderAuth() {
  const g = $('#gate');
  const land = authView === 'landing' && FB_READY;
  const sig = ['auth', FB_READY, land, authMode, authMsg, authBusy, planSig(), REG.mode, heroLogo(), APP(), (PAYINFO && PAYINFO.wa) || ''].join('|');
  if (sig === authSig) return;
  authSig = sig; lastGateSig = '';
  g.className = land ? 'landing' : '';
  if (land) { g.innerHTML = landingHTML(); return; }
  g.innerHTML = gateHTML({}, false, FB_READY ? authCard() : configCard());
  capDraw();
}
function renderGate() {
  const g = $('#gate'); g.className = '';
  const k = Object.assign(cur.kos.setupDone || !ACC ? {} : { name: ACC.kosName || '', ownerName: ACC.ownerName || '', ownerPhone: ACC.phone || '', ownerEmail: ACC.email || '' }, cur.kos);
  const setup = !k.setupDone && canWrite;
  const sig = [setup, !!k.pinHash, canWrite, k.name, k.address, k.ownerName, k.ownerPhone, !!k.setupDone, heroLogo(), APP()].join('|');
  if (sig === lastGateSig) return;
  lastGateSig = sig;
  g.innerHTML = gateHTML(k, setup);
}
let toastT = 0;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3200);
}
async function run(fn) { try { await fn(); return true; } catch (e) { toast(errText(e), true); return false; } }

/* ---------- turunan data ---------- */
function firstPayday(x) {
  const sd = parseD(x.startDate), day = Math.min(31, Math.max(1, Number(x.payDay) || sd.getDate()));
  const mk = (yy, mm) => yy + '-' + pad(mm + 1) + '-' + pad(Math.min(day, new Date(yy, mm + 1, 0).getDate()));
  let y = sd.getFullYear(), m = sd.getMonth(), d = mk(y, m);
  if (d <= x.startDate) { m++; if (m > 11) { m = 0; y++; } d = mk(y, m); }
  return d;
}
function compute() {
  const t = todayStr();
  const kos = S.meta.kos || {};
  const features = kos.features || DEFAULT_FEATURES;
  const rooms = Object.keys(S.rooms).map(id => Object.assign({ id }, S.rooms[id])).sort((a, b) => natCmp(a.number, b.number));
  const roomsById = {}; rooms.forEach(r => { roomsById[r.id] = r; });
  const bills = deriveBills(S.tenants, S.payments, t, 14).map(b => Object.assign(b, { st: billStatus(b, t) }));
  const billsById = {}; bills.forEach(b => { billsById[b.id] = b; });
  const activeByRoom = {};
  Object.keys(S.tenants).forEach(id => { const tn = S.tenants[id]; if (!tn.moveOut) activeByRoom[tn.roomId] = Object.assign({ id }, tn); });
  const worst = {};
  bills.forEach(b => {
    if (b.paid) return;
    const rank = b.st.k === 'late' ? 2 : b.st.k === 'soon' ? 1 : 0;
    const c = worst[b.tenantId];
    if (!c || rank > c.rank || (rank === c.rank && b.due < c.b.due)) worst[b.tenantId] = { rank, b };
  });
  const vm = rooms.map(r => {
    const tenant = activeByRoom[r.id] || null;
    let state = 'vacant', bill = null;
    if (r.maintenance) state = 'maint';
    else if (tenant) {
      state = 'occ';
      const w = worst[tenant.id];
      if (w && w.rank === 2) { state = 'late'; bill = w.b; }
      else if (w && w.rank === 1) { state = 'soon'; bill = w.b; }
    }
    return Object.assign({}, r, { price: roomPrice(r, features), tenant, state, bill, floor: isKon(r) ? 0 : (Number(r.floor) || 1) });
  });
  const vmById = {}; vm.forEach(r => { vmById[r.id] = r; });
  const floors = Array.from(new Set(vm.filter(r => !isKon(r)).map(r => r.floor))).sort((a, b) => a - b);
  const count = k => vm.filter(r => r.state === k).length;
  const stats = {
    total: vm.length,
    occ: vm.filter(r => r.tenant).length,
    vacant: count('vacant'),
    soon: count('soon'), late: count('late'), maint: count('maint')
  };
  const staffT = {};
  Object.keys(S.staff).forEach(id => { const x = S.staff[id]; if (x && x.startDate && Number(x.salary) > 0) staffT[id] = { moveIn: firstPayday(x), rent: Number(x.salary), moveOut: x.endDate || '', roomId: '' }; });
  const staffBills = deriveBills(staffT, S.salary, t, 14).map(b => Object.assign(b, { st: billStatus(b, t) }));
  return { t, kos, staffBills, features, rooms: vm, roomsById: vmById, bills, billsById, floors, stats, activeByRoom };
}
const roomNo = id => (cur && cur.roomsById[id]) ? cur.roomsById[id].number : '?';
const statusText = b => {
  const s = b.st;
  if (s.k === 'paid') return 'Lunas';
  if (s.k === 'late') return 'Telat ' + s.d + ' hari';
  if (s.k === 'soon') return s.d === 0 ? 'Jatuh tempo hari ini' : 'Jatuh tempo ' + s.d + ' hari lagi';
  return 'Belum jatuh tempo';
};
const pill = (k, text) => '<span class="pill p-' + k + '">' + esc(text) + '</span>';
function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (!p) return '';
  if (p.indexOf('0') === 0) p = '62' + p.slice(1); else if (p.indexOf('8') === 0) p = '62' + p;
  return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text);
}
function stayLabel(t) {
  const a = parseD(t.moveIn), b = t.moveOut ? parseD(t.moveOut) : new Date();
  let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) m--;
  if (m < 1) return Math.max(0, Math.round((b - a) / 86400000)) + ' hari';
  return m >= 12 ? Math.floor(m / 12) + ' th ' + (m % 12) + ' bln' : m + ' bln';
}

/* ---------- tampilan ---------- */
let raf = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render() {
  const main = $('#main'), g = $('#gate');
  const viewing = !!(isAdmin && VIEW);
  document.body.classList.toggle('is-admin', !!isAdmin && !viewing);
  syncBrand();
  if (!authReady) { document.body.classList.add('gated'); authSig = ''; lastGateSig = ''; g.innerHTML = LOADING; return; }
  if (!fbUser) { document.body.classList.add('gated'); renderAuth(); return; }
  if (!sessReady() && !SESS.err) { document.body.classList.add('gated'); authSig = ''; lastGateSig = ''; g.innerHTML = LOADING; return; }
  if (isAdmin && !viewing) { renderAdmin(); return; }
  if (!viewing && (SESS.err || !ACC)) { document.body.classList.add('gated'); authSig = ''; lastGateSig = ''; g.innerHTML = SESS.err ? gateHTML({}, false, sessErrCard()) : LOADING; return; }
  if (!viewing && ACC.status !== 'approved') { document.body.classList.add('gated'); authSig = ''; lastGateSig = ''; g.innerHTML = gateHTML({}, false, statusCard()); return; }
  if (!viewing && !SESS.payLoaded) { document.body.classList.add('gated'); authSig = ''; lastGateSig = ''; g.innerHTML = LOADING; return; }
  if (lockInfo().locked) { document.body.classList.add('gated'); authSig = ''; lastGateSig = ''; g.innerHTML = gateHTML({}, false, lockCard()); return; }
  if (!COLS.every(c => loaded[c])) { document.body.classList.add('gated'); authSig = ''; lastGateSig = ''; g.innerHTML = LOADING; return; }
  cur = compute();
  authed = viewing || !!cur.kos.setupDone;
  document.body.classList.toggle('gated', !authed);
  authSig = '';
  if (!authed) { renderGate(); return; }
  lastGateSig = '';
  $('#kossub').textContent = cur.kos.address || 'Panel pemilik';
  $('#kosname').textContent = cur.kos.name || 'Kos Saya';
  syncMe();
  const tab = effTab();
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
  if (!loadErr && !viewing) { syncRoomCount(cur.rooms.length); syncKosName(cur.kos.name); }
  /* lonceng: hanya yang sudah telat atau jatuh tempo dalam 3 hari (H-3) */
  const h3 = b => !b.paid && (b.st.k === 'late' || (b.st.k === 'soon' && b.st.d <= 3));
  const sdueN = ownSubBills().filter(h3).length;
  const late = cur.bills.filter(h3).length;
  const sdue = cur.staffBills.filter(b => S.staff[b.tenantId] && h3(b)).length;
  const trialLeft = isTrial(ACC) ? trialDaysLeft(ACC) : null, trialSoon = trialLeft != null && trialLeft <= 3;
  renderBell([
    { tab: 'tagihan', n: late, text: late + ' tagihan sewa telat atau jatuh tempo ≤ 3 hari' },
    { tab: 'penjaga', n: sdue, text: sdue + ' gaji penjaga telat atau jatuh tempo ≤ 3 hari' },
    { tab: 'langganan', n: sdueN, text: sdueN + ' tagihan langganan telat atau jatuh tempo ≤ 3 hari' },
    { tab: 'langganan', n: trialSoon ? 1 : 0, text: 'Free trial ' + (trialLeft > 0 ? 'tinggal ' + trialLeft + ' hari' : 'berakhir hari ini') }
  ].concat(expiringContracts().filter(x => x.c.d <= 3).map(x => ({ tab: 'penghuni', n: 1, text: x.t.name + ' (' + unitNameId(x.t.roomId) + '): ' + contractText(x.c).toLowerCase() }))).concat(chatNotes()));
  if (tab !== 'chat') chatUnwatch();
  syncChatBtn(tab);
  let html = '';
  if (mode === 'local') html += '<div class="banner">Data bersama tidak tersedia di tampilan ini. Perubahan hanya tersimpan di browser ini.</div>';
  if (viewing) html += '<div class="banner view-banner">Mode admin: melihat data <b>' + esc(VIEW.name) + '</b> (hanya baca, tidak bisa mengubah).' + (loadErr ? ' <b>Data gagal dimuat (' + esc(loadErr) + '): publish ulang firestore.rules terbaru di Firebase Console.</b>' : '') + ' <button type="button" class="btn sm" data-act="view-exit">Kembali ke admin</button></div>';
  else if (!canWrite) html += '<div class="banner">Kamu hanya bisa melihat data. Perubahan hanya bisa dilakukan oleh pemilik atau editor.</div>';
  if (loadErr) html += '<div class="banner">Sebagian data gagal dimuat (' + esc(loadErr) + '). Muat ulang halaman.</div>';
  if (cur.kos.demo) html += '<div class="banner" data-w>Ini data contoh. Buka Pengaturan untuk menghapusnya dan mulai dengan data kos kamu.</div>';
  const lim = planOfAcc();
  if (lim && Number(lim.maxRooms) > 0 && cur.rooms.length > Number(lim.maxRooms)) html += '<div class="banner">Jumlah unit (' + cur.rooms.length + ') melebihi batas ' + planWord(lim) + esc(lim.name) + ' (' + lim.maxRooms + ' unit). Buka tab Langganan untuk ' + (lim.trial ? 'memilih paket.' : 'naik paket.') + '</div>';
  if (trialSoon && tab !== 'langganan') html += '<div class="banner">Free trial ' + (trialLeft > 0 ? 'tinggal ' + trialLeft + ' hari' : 'berakhir hari ini') + '. Buka tab Langganan untuk memilih paket supaya akun tetap aktif.</div>';
  const views = { dashboard: viewDashboard, layout: viewLayout, penghuni: viewTenants, penjaga: viewStaff, tagihan: viewBills, utilitas: viewUtil, keuangan: viewFin, kwitansi: viewKwitansi, booking: viewBooking, laporan: viewReport, langganan: viewSub, chat: viewChat };
  html += (views[tab] || viewDashboard)();
  setMain(main, html);
  migrateLegacy();
}

/* --- layout --- */
function emptyRooms() {
  const ty = kosType();
  const konTxt = 'Tambahkan kontrakan satu per satu: isi nama kontrakan, alamat lengkap, jumlah kamar tidur, dan harga sewa per bulan. Penghuni, tagihan, dan laporan jalan sama seperti kamar kos.';
  if (ty === 'kontrakan') return '<div class="empty"><h2>Belum ada kontrakan</h2><p>' + konTxt + '</p><div class="row" data-w><button class="btn primary" data-act="kon-add">Tambah kontrakan</button></div></div>';
  if (ty === 'both') return '<div class="empty"><h2>Belum ada kamar atau kontrakan</h2><p>Kosan: isi jumlah kamar dan fasilitas per lantai. Kontrakan: isi alamat tiap kontrakan. Penghuni, tagihan, dan laporan jalan sama untuk keduanya.</p><div class="row" data-w><button class="btn primary" data-act="bulk">Buat lantai 1 kosan</button><button class="btn" data-act="kon-add">Tambah kontrakan</button></div></div>';
  return '<div class="empty"><h2>Belum ada kamar</h2><p>Mulai dari lantai 1: isi jumlah kamar, pilih fasilitas (AC, kamar mandi dalam, dan lain-lain) dan layanan tambahan (laundry, parkir motor atau mobil). Setelah disimpan, denah lantai langsung tampil. Lantai 2 dan seterusnya dibuat dengan cara yang sama.</p><div class="row" data-w><button class="btn primary" data-act="bulk">Buat lantai 1</button><button class="btn" data-act="room-add" data-floor="1">Tambah satu kamar saja</button></div></div>';
}
function roomCell(r) {
  const f = UI.lf;
  const match = f === 'all' || (f === 'vacant' && r.state === 'vacant') || (f === 'occ' && r.tenant) || (f === 'soon' && r.state === 'soon') || (f === 'late' && r.state === 'late');
  let lab = { vacant: 'Kosong', occ: 'Terisi', maint: 'Perbaikan' }[r.state];
  if (r.state === 'late') lab = 'Telat ' + r.bill.st.d + ' hr';
  if (r.state === 'soon') lab = r.bill.st.d === 0 ? 'Jatuh tempo hari ini' : 'Tempo ' + r.bill.st.d + ' hr lagi';
  const bkg = r.state === 'vacant' ? bookingOf(r.id) : null; if (bkg) lab = 'Dibooking';
  const ed = !!UI.le && UI.le === secKey(r), tag = ed ? 'div' : 'button';
  return '<' + tag + ' class="room' + (isKon(r) ? ' kon' : '') + ' s-' + r.state + (bkg ? ' booked' : '') + (match || ed ? '' : ' dim') + (ed ? ' editing' + (UI.lePick === r.id ? ' picked' : '') : '') + '"' + (ed ? ' draggable="true" role="button" tabindex="0" data-le="1" data-act="le-pick"' : ' data-act="room"') + ' data-id="' + esc(r.id) + '"><span class="rno">' + esc(r.number) + '</span>' + (isKon(r) ? '<span class="radr">' + esc(r.address ? shortAddr(r.address, 60) : 'Alamat belum diisi') + '</span>' : '') + '<span class="rst">' + esc(lab) + '</span><span class="rwho">' + (r.tenant ? esc(r.tenant.name) : bkg ? esc(bkg.name) : '&nbsp;') + '</span><span class="rprice">' + rp(r.price) + '</span></' + tag + '>';
}
/* --- layout denah yang bisa diubah: kolom per baris, posisi koridor, urutan kamar --- */
const secKey = r => isKon(r) ? 'kon' : String(Number(r.floor) || 1);
const roomsOfSec = key => cur.rooms.filter(r => key === 'kon' ? isKon(r) : (!isKon(r) && String(Number(r.floor) || 1) === key));
const ordRooms = rs => rs.slice().sort((a, b) => { const ha = typeof a.ord === 'number', hb = typeof b.ord === 'number'; if (ha && hb && a.ord !== b.ord) return a.ord - b.ord; if (ha !== hb) return ha ? -1 : 1; return natCmp(a.number, b.number); });
function layoutCfg(key, n) {
  const sv = ((S.meta.kos || {}).layout || {})[key];
  if (sv && Number(sv.cols) > 0) { const cols = Math.min(8, Math.max(1, Number(sv.cols))), rows = Math.max(1, Math.ceil(n / cols)); return { cols, corr: Math.min(Math.max(0, Number(sv.corr) || 0), rows - 1), saved: true }; }
  if (key === 'kon') return { cols: 0, corr: 0, saved: false };
  const split = n <= 12, cols = split ? Math.max(1, Math.ceil(n / 2)) : 6;
  return { cols, corr: split && n > cols ? 1 : 0, saved: false };
}
const effCfg = (key, n) => { const c = layoutCfg(key, n); return c.cols ? c : { cols: 3, corr: 0, saved: false }; };
function planCells(rs, cfg) {
  if (!cfg.corr) return rs.map(roomCell).join('');
  const k = cfg.corr * cfg.cols;
  return rs.slice(0, k).map(roomCell).join('') + (rs.length > k ? '<div class="corridor">Koridor</div>' + rs.slice(k).map(roomCell).join('') : '');
}
function layoutEditor(key, n) {
  const c = effCfg(key, n), rows = Math.max(1, Math.ceil(n / c.cols));
  const step = (f, label, shown) => '<div class="lrow"><span>' + label + '</span><div class="lstep"><button type="button" class="btn sm" data-act="le-step" data-key="' + key + '" data-f="' + f + '" data-d="-1" aria-label="Kurangi">−</button><b>' + shown + '</b><button type="button" class="btn sm" data-act="le-step" data-key="' + key + '" data-f="' + f + '" data-d="1" aria-label="Tambah">+</button></div></div>';
  return '<div class="ledit" data-w>' + step('cols', 'Kamar per baris', c.cols) + step('corr', 'Koridor setelah baris', c.corr ? c.corr : 'Tanpa') +
    '<div class="lrow lact"><button type="button" class="btn sm" data-act="le-reset" data-key="' + key + '" data-confirm="Klik lagi untuk reset layout">Reset otomatis</button><button type="button" class="btn sm primary" data-act="le-off">Selesai</button></div>' +
    '<p class="muted lhint">Seret kamar ke posisi lain, atau ketuk satu kamar lalu ketuk kamar tujuan untuk menukar posisinya. Jumlah baris: ' + rows + '.</p></div>';
}
const layoutBtn = key => '<button class="btn sm" data-act="le-on" data-key="' + key + '">Ubah layout</button>';
async function saveLayoutCfg(key, cfg) {
  const kos = S.meta.kos || {};
  await run(() => repo.set('meta', 'kos', Object.assign({}, kos, { layout: Object.assign({}, kos.layout || {}, { [key]: { cols: cfg.cols, corr: cfg.corr } }) })));
}
async function swapRooms(a, b) {
  const ra = cur.rooms.find(x => x.id === a), rb = cur.rooms.find(x => x.id === b);
  if (!ra || !rb || secKey(ra) !== secKey(rb)) { render(); return; }
  const list = ordRooms(roomsOfSec(secKey(ra))), i = list.findIndex(x => x.id === a), j = list.findIndex(x => x.id === b);
  [list[i], list[j]] = [list[j], list[i]];
  const jobs = list.map((r, idx) => [r.id, idx]).filter(([id, idx]) => S.rooms[id] && S.rooms[id].ord !== idx);
  await run(async () => { for (let k = 0; k < jobs.length; k += 8) await Promise.all(jobs.slice(k, k + 8).map(([id, idx]) => repo.set('rooms', id, Object.assign({}, S.rooms[id], { ord: idx })))); });
}
function viewLayout() {
  const D = cur;
  if (!D.rooms.length) return emptyRooms();
  const s = D.stats;
  const btn = (k, n, label, cls) => '<button class="' + (cls || '') + '" data-act="lf" data-v="' + k + '" aria-pressed="' + (UI.lf === k) + '"><b>' + n + '</b><span>' + label + '</span></button>';
  const kosRooms = D.rooms.filter(r => !isKon(r)), konRooms = D.rooms.filter(isKon), sk = showKos(), sn = showKon();
  let h = '<div class="toolbar"><p class="muted" style="margin:0">Klik ' + (sk && sn ? 'kamar atau kontrakan' : sn ? 'kontrakan' : 'kamar') + ' untuk lihat detail, check-in, ubah, atau hapus.</p><span class="row" data-w>' + (sk ? '<button class="btn primary" data-act="bulk">+ Tambah lantai</button>' : '') + (sn ? '<button class="btn' + (sk ? '' : ' primary') + '" data-act="kon-add">+ Kontrakan</button>' : '') + '</span></div>' + layoutSummary() + '<div class="sumbar">' + btn('all', s.total, sk && sn ? 'Total unit' : sn ? 'Total kontrakan' : 'Total kamar') + btn('occ', s.occ + '/' + s.total, 'Terisi') + btn('vacant', s.vacant, 'Kosong') + btn('soon', s.soon, 'Jatuh tempo 7 hari', 's-warn') + btn('late', s.late, 'Telat bayar', 's-bad') + '</div>';
  D.floors.forEach(fl => {
    const key = String(fl), rs = ordRooms(D.rooms.filter(r => r.floor === fl));
    const occ = rs.filter(r => r.tenant).length, ed = UI.le === key, cfg = ed ? effCfg(key, rs.length) : layoutCfg(key, rs.length);
    h += '<section class="floor"><div class="floor-h"><h2>' + (sn ? 'Kosan · ' : '') + 'Lantai ' + fl + '</h2><span>' + occ + ' dari ' + rs.length + ' kamar terisi</span><div class="row" style="margin-left:auto" data-w>' + (ed ? '' : layoutBtn(key)) + '<button class="btn sm" data-act="room-add" data-floor="' + fl + '">+ Kamar</button><button class="btn sm danger" data-act="floor-del" data-confirm="Klik lagi untuk hapus lantai" data-floor="' + fl + '">Hapus lantai</button></div></div>' + (ed ? layoutEditor(key, rs.length) : '') + '<div class="plan" style="--n:' + cfg.cols + '">' + planCells(rs, cfg) + '</div></section>';
  });
  if (sn) {
    const occ = konRooms.filter(r => r.tenant).length;
    h += '<section class="floor"><div class="floor-h"><h2>Kontrakan</h2><span>' + occ + ' dari ' + konRooms.length + ' kontrakan terisi</span><div class="row" style="margin-left:auto" data-w>' + (konRooms.length > 1 && UI.le !== 'kon' ? layoutBtn('kon') : '') + '<button class="btn sm" data-act="kon-add">+ Kontrakan</button></div></div>' + (UI.le === 'kon' ? layoutEditor('kon', konRooms.length) : '') +
      (konRooms.length ? (() => { const ordK = ordRooms(konRooms), kc = UI.le === 'kon' ? effCfg('kon', ordK.length) : layoutCfg('kon', ordK.length); return kc.cols ? '<div class="plan" style="--n:' + kc.cols + '">' + planCells(ordK, kc) + '</div>' : '<div class="plan kongrid">' + ordK.map(roomCell).join('') + '</div>'; })() : '<p class="muted">Belum ada kontrakan. Klik + Kontrakan, lalu isi nama dan alamatnya.</p>') + '</section>';
  }
  return h;
}

/* --- cctv --- */
const maskRtsp = u => String(u || '').replace(/(rtsp:\/\/[^:\/@]+:)[^@]*@/i, '$1••••@');
function viewCctv() {
  const cams = Object.keys(S.cameras).map(id => Object.assign({ id }, S.cameras[id])).sort((a, b) => camOrder(a) - camOrder(b) || natCmp(camKey(a), camKey(b)) || natCmp(a.name, b.name));
  let h = '<div class="note"><p>Browser tidak bisa memutar RTSP langsung. Untuk melihat video, jalankan gateway di jaringan kos (misalnya go2rtc atau MediaMTX) yang mengubah RTSP menjadi tampilan web, lalu isi Link live view tiap kamera. Halaman ini menyimpan daftar kamera dan membuka link-nya.</p><div class="row"><button class="btn sm" data-act="cfg-copy">Salin config go2rtc</button></div></div>';
  h += '<div class="toolbar"><button class="btn primary" data-act="cam-edit" data-id="" data-w>+ Kamera</button></div>';
  if (!cams.length) return h + '<div class="empty"><h2>Belum ada kamera</h2><p>Tambahkan kamera dengan alamat RTSP-nya. Contoh Hikvision: rtsp://user:sandi@192.168.1.64:554/Streaming/Channels/101 (101 stream utama, 102 sub stream).</p></div>';
  const groups = Array.from(new Set(cams.map(camKey)));
  groups.forEach(g => {
    h += '<section class="floor"><div class="floor-h"><h2>' + esc(camTitle(g)) + '</h2></div><div class="camgrid">';
    cams.filter(c => camKey(c) === g).forEach((c, i) => {
      const link = /^https?:\/\//i.test(c.viewUrl || '') ? c.viewUrl : '';
      h += '<article class="cam"><div class="screen"><span class="osd">' + esc((c.name || '').toUpperCase()) + '</span>' + (link ? '<a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Buka live ↗</a>' : '<span>Belum ada link live view</span>') + '</div><div class="cam-b"><h3>' + esc(c.name) + (c.place ? ' <span class="muted" style="font-weight:400">· ' + esc(c.place) + '</span>' : '') + '</h3><code>' + esc(maskRtsp(c.rtsp)) + '</code><div class="row"><button class="btn sm" data-act="cam-copy" data-id="' + esc(c.id) + '">Salin RTSP</button><button class="btn sm" data-act="cam-edit" data-id="' + esc(c.id) + '" data-w>Ubah</button></div></div></article>';
    });
    h += '</div></section>';
  });
  return h;
}

/* --- penghuni --- */
function viewTenants() {
  const D = cur;
  const q = UI.q.trim().toLowerCase();
  let list = Object.keys(S.tenants).map(id => Object.assign({ id }, S.tenants[id]));
  list = list.filter(t => UI.tf === 'aktif' ? !t.moveOut : !!t.moveOut);
  if (q) list = list.filter(t => (t.name + ' ' + roomNo(t.roomId) + ' ' + ((D.roomsById[t.roomId] || {}).address || '') + ' ' + (t.phone || '')).toLowerCase().indexOf(q) >= 0);
  list.sort((a, b) => natCmp(roomNo(a.roomId), roomNo(b.roomId)));
  const floorOf = t => { const r = D.roomsById[t.roomId]; return r ? r.floor : -1; };
  const groups = D.floors.concat(D.rooms.some(isKon) ? [0] : []);
  const counts = {}; list.forEach(t => { const f = floorOf(t); counts[f] = (counts[f] || 0) + 1; });
  const total = list.length;
  if (UI.tl !== 'all' && groups.indexOf(Number(UI.tl)) < 0) UI.tl = 'all';
  if (UI.tl !== 'all') list = list.filter(t => floorOf(t) === Number(UI.tl));
  const seg = (k, l) => '<button data-act="tf" data-v="' + k + '" aria-pressed="' + (UI.tf === k) + '">' + l + '</button>';
  let h = '<p class="hint-top">' + Object.keys(S.tenants).filter(k => !S.tenants[k].moveOut).length + ' penghuni aktif. Tanggal masuk menentukan tanggal jatuh tempo tiap bulan.</p><div class="toolbar"><div class="seg">' + seg('aktif', 'Aktif') + seg('keluar', 'Sudah keluar') + '</div><div class="grow"><input id="q" type="search" placeholder="Cari nama, kamar, atau nomor HP" value="' + esc(UI.q) + '" aria-label="Cari penghuni"></div>' + exBtns('penghuni') + '<button class="btn primary" data-act="tenant" data-id="" data-w>+ Penghuni</button></div>';
  if (groups.length > 1) {
    const fb = (k, l, n) => '<button data-act="tl" data-v="' + k + '" aria-pressed="' + (String(UI.tl) === String(k)) + '">' + l + ' <span class="cnt">' + n + '</span></button>';
    h += '<div class="toolbar"><div class="seg" role="group" aria-label="Filter lantai">' + fb('all', 'Semua lantai', total) + groups.map(f => fb(f, f ? 'Lantai ' + f : 'Kontrakan', counts[f] || 0)).join('') + '</div></div>';
  }
  if (!list.length) return h + '<div class="empty"><h2>' + (q ? 'Tidak ada hasil' : UI.tl !== 'all' ? 'Belum ada penghuni di ' + (Number(UI.tl) ? 'lantai ' + UI.tl : 'kontrakan') : UI.tf === 'aktif' ? 'Belum ada penghuni aktif' : 'Belum ada penghuni yang keluar') + '</h2><p>' + (UI.tf === 'aktif' && !q && UI.tl === 'all' ? 'Tambahkan penghuni lewat tombol di atas, atau klik kamar kosong di tab Layout.' : 'Ubah kata kunci atau filter.') + '</p></div>';
  const card = t => {
    const r = D.roomsById[t.roomId];
    const ph = safePhoto(t.photo);
    let st = '';
    if (!t.moveOut) {
      const own = D.bills.filter(b => b.tenantId === t.id && !b.paid).sort((a, b) => a.due < b.due ? -1 : 1)[0];
      st = own ? pill(own.st.k, statusText(own)) : pill('paid', 'Tagihan lunas');
    } else st = pill('later', 'Keluar ' + fmtDate(t.moveOut));
    return '<article class="tcard' + (t.moveOut ? ' out' : '') + '"><div class="thead"><div class="ph">' + (ph ? '<img src="' + ph + '" alt="Foto ' + esc(t.name) + '">' : esc(initials(t.name))) + '</div><div style="min-width:0"><h3>' + esc(t.name) + '</h3><p>' + esc(r ? unitName(r) : 'Kamar ?') + (r ? (isKon(r) ? ' · ' + esc(shortAddr(r.address, 50)) : ' · Lantai ' + r.floor) : '') + ' · ' + (Number(t.people) || 1) + ' orang</p></div></div>' +
      '<dl class="tmeta"><div><dt>Masuk</dt><dd>' + fmtDate(t.moveIn) + '</dd></div><div><dt>Lama tinggal</dt><dd>' + stayLabel(t) + '</dd></div>' + (t.moveOut ? '<div class="due"><dt>Keluar</dt><dd>' + fmtDate(t.moveOut) + '</dd></div>' : '<div class="due"><dt>Jatuh tempo tiap tanggal ' + parseD(t.moveIn).getDate() + '</dt><dd>Berikutnya ' + fmtDate(nextDue(t.moveIn, D.t)) + '</dd></div>') + '<div><dt>Harga / bulan</dt><dd class="mono">' + rp(t.rent) + '</dd></div><div><dt>No. HP</dt><dd>' + esc(t.phone || '-') + '</dd></div>' + tenantExtraMeta(t) + '</dl>' +
      '<div class="tfoot">' + st + tenantExtraFoot(t) + '<button class="btn sm" data-act="tenant" data-id="' + esc(t.id) + '" data-w>Ubah</button>' + (t.moveOut ? '' : '<button class="btn sm" data-act="checkout" data-id="' + esc(t.id) + '" data-w>Check-out</button>') + '</div></article>';
  };
  const grid = arr => '<div class="tgrid">' + arr.map(card).join('') + '</div>';
  if (UI.tl === 'all' && groups.length > 1) {
    groups.concat([-1]).forEach(fl => {
      const arr = list.filter(t => floorOf(t) === fl);
      if (arr.length) h += '<section class="floor"><div class="floor-h"><h2>' + (fl > 0 ? 'Lantai ' + fl : fl === 0 ? 'Kontrakan' : 'Tanpa kamar') + '</h2><span>' + arr.length + ' penghuni</span></div>' + grid(arr) + '</section>';
    });
    return h;
  }
  return h + grid(list);
}

/* --- penjaga --- */
const STAFF_ROLES = ['Penjaga kos', 'Satpam', 'Petugas kebersihan', 'Pengelola', 'Lainnya'];
const STAFF_SHIFTS = ['Pagi', 'Siang', 'Malam', 'Sehari penuh', 'Bergilir'];
function staffList() {
  return Object.keys(S.staff).map(id => Object.assign({ id }, S.staff[id])).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
}
function viewStaff() {
  const all = staffList();
  const aktif = all.filter(x => !x.endDate), keluar = all.filter(x => !!x.endDate);
  const list = UI.sf === 'aktif' ? aktif : keluar;
  const gaji = aktif.reduce((n, x) => n + (Number(x.salary) || 0), 0);
  const seg = (k, l, n) => '<button data-act="sf" data-v="' + k + '" aria-pressed="' + (UI.sf === k) + '">' + l + ' <span class="cnt">' + n + '</span></button>';
  const dueB = cur.staffBills.filter(b => !b.paid && S.staff[b.tenantId] && (b.st.k === 'late' || b.st.k === 'soon'));
  let h = dueB.length ? '<div class="banner">Gaji perlu dibayar: ' + dueB.map(b => esc(S.staff[b.tenantId].name) + ' (' + esc(statusText(b).toLowerCase()) + ')').join(', ') + '.</div>' : '';
  h += '<p class="hint-top">' + aktif.length + ' penjaga aktif' + (gaji ? '. Total gaji ' + rp(gaji) + ' per bulan.' : '.') + '</p><div class="toolbar"><div class="seg">' + seg('aktif', 'Aktif', aktif.length) + seg('keluar', 'Sudah berhenti', keluar.length) + '</div>' +
    (all.length ? exBtns('penjaga') : '') +
    '<button class="btn primary" data-act="staff" data-id="" data-w>+ Penjaga</button></div>';
  if (!list.length) return h + '<div class="empty"><h2>' + (UI.sf === 'aktif' ? 'Belum ada penjaga aktif' : 'Belum ada penjaga yang berhenti') + '</h2><p>' + (UI.sf === 'aktif' ? 'Catat penjaga kosan, satpam, atau petugas kebersihan lewat tombol + Penjaga: nomor HP, shift, area tugas, gaji, dan kontak darurat.' : 'Penjaga yang ditandai berhenti akan muncul di sini.') + '</p></div>';
  const card = x => {
    const ph = safePhoto(x.photo);
    const wa = x.phone ? waLink(x.phone, 'Halo ' + x.name + ', ') : '';
    const cell = (l, v) => '<div><dt>' + l + '</dt><dd>' + v + '</dd></div>';
    let meta = cell('No. HP', esc(x.phone || '-')) + cell('Jam jaga', esc(x.hours || '-')) + cell('Area tugas', esc(x.area || '-')) + cell('Mulai kerja', fmtDate(x.startDate));
    meta += '<div><dt>Gaji / bulan</dt><dd class="mono">' + (Number(x.salary) ? rp(x.salary) : '-') + '</dd></div>';
    if (x.emName || x.emPhone) meta += '<div><dt>Kontak darurat</dt><dd>' + esc([x.emName, x.emPhone].filter(Boolean).join(' · ')) + '</dd></div>';
    const lama = x.startDate ? ' · ' + stayLabel({ moveIn: x.startDate, moveOut: x.endDate }) : '';
    const st = x.endDate ? pill('later', 'Berhenti ' + fmtDate(x.endDate)) : pill('paid', 'Aktif' + lama);
    const mine = cur.staffBills.filter(b => b.tenantId === x.id);
    const own = mine.filter(b => !b.paid).sort((a, b) => a.due < b.due ? -1 : 1)[0];
    const last = mine.filter(b => b.paid).sort((a, b) => a.due < b.due ? 1 : -1)[0];
    const lastTxt = last ? '<small class="muted" style="display:block;margin-top:.25rem">Terakhir dibayar ' + rp(last.pay.amount) + ' (' + esc(fmtPeriod(last.period)) + ')</small>' : '';
    if (Number(x.salary) > 0) meta += own ? '<div class="due"><dt>Gaji ' + esc(fmtPeriod(own.period)) + '</dt><dd>' + pill(own.st.k, statusText(own)) + ' · tempo ' + fmtDate(own.due) + '</dd>' + lastTxt + '</div>' : '<div class="due"><dt>Gaji</dt><dd>' + (last ? 'Lunas, dibayar ' + fmtDate(last.pay.paidAt) : 'Belum ada tagihan gaji') + '</dd>' + lastTxt + '</div>';
    return '<article class="tcard' + (x.endDate ? ' out' : '') + '"><div class="thead"><div class="ph">' + (ph ? '<img src="' + ph + '" alt="Foto ' + esc(x.name) + '">' : esc(initials(x.name))) + '</div><div style="min-width:0"><h3>' + esc(x.name) + '</h3><p>' + esc(x.role || 'Penjaga kos') + (x.shift ? ' · Shift ' + esc(x.shift.toLowerCase()) : '') + '</p></div></div>' +
      '<dl class="tmeta">' + meta + '</dl>' + (x.note ? '<p class="muted" style="font-size:.85rem">' + esc(x.note) + '</p>' : '') +
      '<div class="tfoot">' + st + (wa ? '<a class="btn sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">WA</a>' : '') + (own ? '<button class="btn sm primary" data-act="staff-pay" data-id="' + esc(own.id) + '" data-w>Sudah bayar gaji</button>' : '') + (last ? '<button class="btn sm" data-act="staff-pay" data-id="' + esc(last.id) + '" data-w>Ubah gaji dibayar</button>' : '') + '<button class="btn sm" data-act="staff" data-id="' + esc(x.id) + '" data-w>Ubah</button>' +
      (x.endDate ? '<button class="btn sm" data-act="staff-resume" data-id="' + esc(x.id) + '" data-w>Aktifkan lagi</button>' : '<button class="btn sm" data-act="staff-stop" data-confirm="Klik lagi untuk tandai berhenti" data-id="' + esc(x.id) + '" data-w>Berhenti</button>') + '</div></article>';
  };
  return h + '<div class="tgrid">' + list.map(card).join('') + '</div>';
}
function staffAoa() {
  const all = staffList();
  const head = ['Nama', 'Peran', 'No. HP', 'Shift', 'Jam jaga', 'Area tugas', 'Mulai kerja', 'Status', 'Tanggal berhenti', 'Gaji per bulan (Rp)', 'Kontak darurat', 'No. HP darurat', 'Catatan'];
  const aoa = [head].concat(all.map(x => [x.name || '', x.role || '', x.phone || '', x.shift || '', x.hours || '', x.area || '', x.startDate || '', x.endDate ? 'Berhenti' : 'Aktif', x.endDate || '', Number(x.salary) || '', x.emName || '', x.emPhone || '', x.note || '']));
  const aktif = all.filter(x => !x.endDate);
  aoa.push([]); aoa.push(['Total gaji penjaga aktif', '', '', '', '', '', '', '', '', aktif.reduce((n, x) => n + (Number(x.salary) || 0), 0)]);
  return { aoa, aktif: aktif.length, keluar: all.length - aktif.length, gaji: aktif.reduce((n, x) => n + (Number(x.salary) || 0), 0) };
}
function salarySheet() {
  const rows = cur.staffBills.filter(b => S.staff[b.tenantId]).sort((a, b) => a.due < b.due ? -1 : 1).map(b => [S.staff[b.tenantId].name || '', b.period, b.due, b.amount, statusText(b), b.paid ? Number(b.pay.amount) : '', b.paid ? b.pay.paidAt : '', b.paid ? (b.pay.note || '') : '']);
  if (!rows.length) return null;
  const ws = XLSX.utils.aoa_to_sheet([['Penjaga', 'Periode', 'Jatuh tempo', 'Gaji (Rp)', 'Status', 'Dibayar (Rp)', 'Tanggal bayar', 'Catatan']].concat(rows));
  ws['!cols'] = [22, 10, 13, 14, 24, 14, 13, 26].map(w => ({ wch: w }));
  for (let r = 1; r <= rows.length; r++) [3, 5].forEach(c => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && typeof ws[a].v === 'number') ws[a].z = '#,##0'; });
  return ws;
}
function staffSheet() {
  const A = staffAoa();
  const ws = XLSX.utils.aoa_to_sheet(A.aoa);
  ws['!cols'] = [22, 18, 15, 12, 14, 24, 13, 10, 15, 18, 20, 15, 28].map(w => ({ wch: w }));
  for (let r = 1; r < A.aoa.length; r++) { const a = XLSX.utils.encode_cell({ r, c: 9 }); if (ws[a] && typeof ws[a].v === 'number') ws[a].z = '#,##0'; }
  return { ws, A };
}
async function doExportStaff() {
  if (!staffList().length) { toast('Belum ada data penjaga.', true); return; }
  const fname = 'penjaga-kos-' + todayStr();
  try {
    if (window.XLSX) {
      const { ws, A } = staffSheet();
      const sum = [['Kos', cur.kos.name || 'Kos'], ['Dibuat', fmtDate(cur.t)], [], ['Penjaga aktif', A.aktif], ['Sudah berhenti', A.keluar], ['Total gaji aktif per bulan (Rp)', A.gaji]];
      const ws2 = XLSX.utils.aoa_to_sheet(sum); ws2['!cols'] = [{ wch: 30 }, { wch: 26 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Penjaga'); const wg = salarySheet(); if (wg) XLSX.utils.book_append_sheet(wb, wg, 'Gaji'); XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan');
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await dl.save({ filename: fname + '.xlsx', data: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
    } else {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      await dl.save({ filename: fname + '.csv', data: '\ufeff' + staffAoa().aoa.map(r => r.map(q).join(';')).join('\r\n') });
      toast('Library Excel tidak termuat, data disimpan sebagai CSV.');
    }
  } catch (e) { if (!e || e.code !== 'declined') toast('Export gagal. Coba lagi.', true); }
}

/* --- tagihan --- */
/* listrik dan air yang belum dibayar untuk unit dan periode yang sama ikut ditampilkan di tagihan sewa */
const utilOfBill = b => { const u = S.utils[utilId(b.roomId, b.period)]; return (u && !u.paidAt && Number(u.total) > 0) ? u : null; };
function billMsg(b) {
  const t = S.tenants[b.tenantId] || {}, u = utilOfBill(b);
  let m = 'Halo ' + (t.name || '') + ', pengingat sewa ' + unitNameId(b.roomId) + ' periode ' + fmtPeriod(b.period) + ' sebesar ' + rp(b.amount);
  if (u) m += ', ditambah listrik dan air ' + rp(u.total) + ' (total ' + rp(b.amount + Number(u.total)) + ')';
  m += ', jatuh tempo ' + fmtDate(b.due) + (b.st.k === 'late' ? ' (sudah telat ' + b.st.d + ' hari)' : '') + '. Mohon segera diselesaikan. Terima kasih.';
  return m;
}
const waDue = () => cur.bills.filter(b => !b.paid && (b.st.k === 'late' || b.st.k === 'soon')).sort((a, b) => a.due < b.due ? -1 : 1);
function openWaAll() {
  const list = waDue(), ok = list.filter(b => (S.tenants[b.tenantId] || {}).phone), no = list.filter(b => !(S.tenants[b.tenantId] || {}).phone);
  if (!list.length) { toast('Tidak ada tagihan yang perlu diingatkan.'); return; }
  const row = b => { const t = S.tenants[b.tenantId] || {}, u = utilOfBill(b), tot = b.amount + (u ? Number(u.total) : 0); return '<div class="wrow"><div class="wi"><b>' + esc(t.name || '-') + '</b><small>' + esc(unitNameId(b.roomId)) + ' · ' + esc(fmtPeriod(b.period)) + ' · ' + rp(tot) + (u ? ' (termasuk listrik dan air)' : '') + '</small>' + pill(b.st.k, statusText(b)) + '</div>' + (t.phone ? '<a class="btn sm primary wa-send" href="' + esc(waLink(t.phone, billMsg(b))) + '" target="_blank" rel="noopener noreferrer">Kirim WA</a>' : '<span class="muted" style="font-size:.8rem">Tanpa nomor HP</span>') + '</div>'; };
  const b = '<div class="wlist"><p class="muted" style="margin:0 0 .6rem">WhatsApp tidak mengizinkan kirim massal otomatis. Tiap pesan dibuka satu per satu dengan teks yang sudah terisi, tinggal tekan kirim di WhatsApp. Yang sudah dibuka ditandai.</p>' +
    (ok.length ? '<button type="button" class="btn primary" data-act="wa-next" style="margin-bottom:.6rem">Buka berikutnya (' + ok.length + ' pesan)</button>' : '') +
    ok.concat(no).map(row).join('') + '</div>';
  openModal('Ingatkan semua (' + list.length + ' tagihan)', b);
}
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('.wa-send'); if (a) { const r = a.closest('.wrow'); if (r) { r.classList.add('sent'); a.textContent = 'Terkirim ✓'; } } });
const WA_H = {
  'wa-all': () => openWaAll(),
  'wa-next': () => { const a = document.querySelector('.wlist .wrow:not(.sent) .wa-send'); if (a) a.click(); else toast('Semua sudah dibuka.'); }
};
function viewBills() {
  const D = cur, curP = D.t.slice(0, 7);
  const sum = a => a.reduce((s, b) => s + b.amount, 0);
  const late = D.bills.filter(b => b.st.k === 'late'), soon = D.bills.filter(b => b.st.k === 'soon');
  const mine = D.bills.filter(b => b.period === curP);
  const paidM = mine.filter(b => b.paid), allM = sum(mine), gotM = sum(paidM);
  const pct = allM ? Math.round(gotM / allM * 100) : 0;
  let h = lockNote() + '<div class="stats3"><div class="stat s-bad"><span>Telat bayar</span><b>' + late.length + ' tagihan</b><small>' + rp(sum(late)) + '</small></div><div class="stat s-warn"><span>Jatuh tempo 7 hari ke depan</span><b>' + soon.length + ' tagihan</b><small>' + rp(sum(soon)) + '</small></div><div class="stat"><span>Terkumpul ' + esc(fmtPeriod(curP)) + '</span><b>' + rp(gotM) + '</b><small>dari ' + rp(allM) + ' (' + pct + '%)</small><div class="bar"><i style="width:' + pct + '%"></i></div></div></div>';
  const seg = (k, l) => '<button data-act="bf" data-v="' + k + '" aria-pressed="' + (UI.bf === k) + '">' + l + '</button>';
  h += '<div class="toolbar"><div class="seg">' + seg('tagih', 'Perlu ditagih') + seg('bulan', 'Bulan ini') + seg('belum', 'Belum lunas') + seg('lunas', 'Lunas') + seg('semua', 'Semua') + '</div>' + (waDue().length ? '<button class="btn" data-act="wa-all">Ingatkan semua (' + waDue().length + ')</button>' : '') + '</div>';
  let list = D.bills.slice();
  if (UI.bf === 'tagih') list = list.filter(b => b.st.k === 'late' || b.st.k === 'soon');
  else if (UI.bf === 'bulan') list = list.filter(b => b.period === curP);
  else if (UI.bf === 'belum') list = list.filter(b => !b.paid);
  else if (UI.bf === 'lunas') list = list.filter(b => b.paid);
  list.sort((a, b) => (a.paid === b.paid) ? (a.paid ? (a.due < b.due ? 1 : -1) : (a.due < b.due ? -1 : 1)) : (a.paid ? 1 : -1));
  if (!list.length) return h + '<div class="empty"><h2>' + (UI.bf === 'tagih' ? 'Tidak ada yang perlu ditagih' : 'Tidak ada tagihan') + '</h2><p>' + (UI.bf === 'tagih' ? 'Semua tagihan sudah lunas atau jatuh temponya masih lebih dari 7 hari.' : 'Ganti filter untuk melihat tagihan lain.') + '</p></div>';
  h += '<div class="bills">';
  list.slice(0, 300).forEach(b => {
    const t = S.tenants[b.tenantId] || {};
    const wa = (!b.paid && t.phone) ? waLink(t.phone, billMsg(b)) : '', ub = b.paid ? null : utilOfBill(b);
    h += '<div class="bill"><span class="r">' + esc(roomNo(b.roomId)) + '</span><span class="w">' + esc(t.name || '-') + '</span><span class="d">' + esc(fmtPeriod(b.period)) + ' · tempo ' + fmtDate(b.due) + (ub ? '<br>+ listrik dan air ' + rp(ub.total) : '') + '</span><span class="a">' + rp(b.amount) + (ub ? '<br><small class="muted">Total ' + rp(b.amount + Number(ub.total)) + '</small>' : '') + '</span><span class="s">' + pill(b.st.k, statusText(b)) + '</span><span class="x">' +
      (b.paid ? '<span class="muted" style="font-size:.8rem;align-self:center">Dibayar ' + fmtDate(b.pay.paidAt) + (b.pay.method ? ' · ' + esc(b.pay.method) : '') + '</span><button class="btn sm" data-act="receipt" data-kind="rent" data-id="' + esc(b.id) + '">Kwitansi</button><button class="btn sm danger" data-act="unpay" data-confirm="Klik lagi untuk batalkan" data-id="' + esc(b.id) + '" data-w>Batalkan</button>'
        : (wa ? '<a class="btn sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Ingatkan WA</a>' : '') + '<button class="btn sm primary" data-act="pay" data-id="' + esc(b.id) + '" data-w>Catat bayar</button>') + '</span></div>';
  });
  h += '</div>';
  if (list.length > 300) h += '<p class="muted" style="margin-top:.6rem">Menampilkan 300 teratas. Pakai filter atau Laporan untuk sisanya.</p>';
  return h;
}

/* --- laporan --- */
function reportData() {
  const D = cur, curP = D.t.slice(0, 7);
  if (!UI.rp.period) UI.rp.period = curP;
  const f = UI.rp;
  const rows = [];
  D.bills.filter(b => (f.period === 'all' || b.period === f.period) && (f.room === 'all' || b.roomId === f.room)).forEach(b => {
    const r = D.roomsById[b.roomId], t = S.tenants[b.tenantId] || {};
    rows.push({ period: b.period, room: r ? r.number : '?', floor: r && !isKon(r) ? r.floor : '', who: t.name || '-', amount: b.amount, due: b.due, status: statusText(b), k: b.st.k, paid: b.paid ? Number(b.pay.amount) : 0, paidAt: b.paid ? b.pay.paidAt : '', method: b.paid ? (b.pay.method || '') : '', note: b.paid ? (b.pay.note || '') : '' });
  });
  if (f.period === curP && f.room === 'all') {
    D.rooms.filter(r => !r.tenant).forEach(r => rows.push({ period: curP, room: r.number, floor: isKon(r) ? '' : r.floor, who: '-', amount: 0, due: '', status: r.state === 'maint' ? 'Perbaikan' : 'Kosong', k: 'vacant', paid: 0, paidAt: '', method: '', note: '' }));
  }
  if (f.period === curP && f.room === 'all') {
    const has = {}; rows.forEach(r => { has[r.room] = 1; });
    D.rooms.filter(r => r.tenant && !has[r.number]).forEach(r => rows.push({ period: curP, room: r.number, floor: isKon(r) ? '' : r.floor, who: r.tenant.name || '-', amount: 0, due: '', status: 'Belum ada tagihan', k: 'later', paid: 0, paidAt: '', method: '', note: '' }));
  }
  rows.sort((a, b) => natCmp(a.room, b.room) || (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
  const bill = rows.filter(r => r.k !== 'vacant');
  const tot = { tagihan: bill.reduce((s, r) => s + r.amount, 0), dibayar: bill.reduce((s, r) => s + r.paid, 0), telat: bill.filter(r => r.k === 'late').length, kosong: rows.filter(r => r.k === 'vacant').length };
  tot.sisa = tot.tagihan - tot.dibayar;
  return { rows, tot };
}
function viewReport() {
  const D = cur, curP = D.t.slice(0, 7);
  const R = reportData(), f = UI.rp;
  const periods = Array.from(new Set(D.bills.map(b => b.period).concat([curP]))).sort().reverse();
  let h = '<div class="toolbar"><label class="fld"><span>Bulan</span><select id="rp-period"><option value="all"' + (f.period === 'all' ? ' selected' : '') + '>Semua bulan</option>' + periods.map(p => '<option value="' + p + '"' + (f.period === p ? ' selected' : '') + '>' + esc(fmtPeriod(p)) + '</option>').join('') + '</select></label><label class="fld"><span>Kamar</span><select id="rp-room"><option value="all">Semua ' + (unitHead() === 'Unit' ? 'unit' : unitHead().toLowerCase()) + '</option>' + D.rooms.map(r => '<option value="' + esc(r.id) + '"' + (f.room === r.id ? ' selected' : '') + '>' + esc(unitName(r)) + '</option>').join('') + '</select></label>' + exBtns('laporan', 'exr') + '</div>';
  h += '<p class="rsum"><span>Tagihan <b>' + rp(R.tot.tagihan) + '</b></span><span>Dibayar <b>' + rp(R.tot.dibayar) + '</b></span><span>Belum dibayar <b>' + rp(R.tot.sisa) + '</b></span><span>Telat <b>' + R.tot.telat + '</b></span>' + (R.tot.kosong ? '<span>' + unitHead() + ' kosong <b>' + R.tot.kosong + '</b></span>' : '') + '</p>';
  if (!R.rows.length) return h + '<div class="empty"><h2>Tidak ada data</h2><p>Belum ada tagihan untuk kombinasi bulan dan kamar ini.</p></div>';
  h += '<div class="tablewrap"><table class="fit"><thead><tr><th>' + unitHead() + '</th><th>Periode</th><th>Penghuni</th><th class="n">Tagihan</th><th>Jatuh tempo</th><th>Status</th><th class="n">Dibayar</th><th>Tgl bayar</th><th>Metode</th></tr></thead><tbody>';
  R.rows.forEach(r => {
    h += '<tr><td class="mono">' + esc(r.room) + '</td><td>' + esc(fmtPeriod(r.period)) + '</td><td>' + esc(r.who) + '</td><td class="n mono">' + (r.k === 'vacant' ? '-' : rp(r.amount)) + '</td><td>' + (r.due ? fmtDate(r.due) : '-') + '</td><td>' + pill(r.k, r.status) + '</td><td class="n mono">' + (r.paid ? rp(r.paid) : '-') + '</td><td>' + (r.paidAt ? fmtDate(r.paidAt) : '-') + '</td><td>' + esc(r.method || '-') + '</td></tr>';
  });
  h += '</tbody><tfoot><tr><td colspan="3">Total</td><td class="n mono">' + rp(R.tot.tagihan) + '</td><td></td><td></td><td class="n mono">' + rp(R.tot.dibayar) + '</td><td></td><td></td></tr></tfoot></table></div>';
  return h;
}
async function doExport() {
  const R = reportData(), f = UI.rp;
  const kos = cur.kos.name || 'Kos';
  const periodLabel = f.period === 'all' ? 'Semua bulan' : fmtPeriod(f.period);
  const roomLabel = f.room === 'all' ? 'Semua ' + unitHead().toLowerCase() : unitNameId(f.room);
  const head = [unitHead(), 'Lantai', 'Periode', 'Penghuni', 'Tagihan (Rp)', 'Jatuh tempo', 'Status', 'Dibayar (Rp)', 'Tanggal bayar', 'Metode', 'Catatan'];
  const aoa = [head].concat(R.rows.map(r => [r.room, r.floor, r.period, r.who, r.k === 'vacant' ? '' : r.amount, r.due, r.status, r.paid || '', r.paidAt, r.method, r.note]));
  aoa.push([]); aoa.push(['Total', '', '', '', R.tot.tagihan, '', '', R.tot.dibayar]);
  const sum = [['Kos', kos], ['Bulan', periodLabel], ['Kamar', roomLabel], ['Dibuat', fmtDate(cur.t)], [], ['Total tagihan (Rp)', R.tot.tagihan], ['Total dibayar (Rp)', R.tot.dibayar], ['Belum dibayar (Rp)', R.tot.sisa], ['Jumlah telat', R.tot.telat], [unitHead() + ' kosong', R.tot.kosong]];
  const slug = (f.room === 'all' ? '' : '-kamar-' + String(roomNo(f.room)).replace(/[^\w-]/g, '')) + '-' + (f.period === 'all' ? 'semua-bulan' : f.period);
  try {
    if (window.XLSX) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [8, 7, 10, 22, 14, 13, 22, 14, 13, 10, 24].map(w => ({ wch: w }));
      for (let r = 1; r < aoa.length; r++) [4, 7].forEach(c => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && typeof ws[a].v === 'number') ws[a].z = '#,##0'; });
      const ws2 = XLSX.utils.aoa_to_sheet(sum); ws2['!cols'] = [{ wch: 22 }, { wch: 26 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Laporan'); XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan');
      if (staffList().length) { XLSX.utils.book_append_sheet(wb, staffSheet().ws, 'Penjaga'); const wg = salarySheet(); if (wg) XLSX.utils.book_append_sheet(wb, wg, 'Gaji'); }
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await dl.save({ filename: 'laporan-kos' + slug + '.xlsx', data: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
    } else {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const csv = '﻿' + aoa.map(r => r.map(q).join(';')).join('\r\n');
      await dl.save({ filename: 'laporan-kos' + slug + '.csv', data: csv });
      toast('Library Excel tidak termuat, laporan disimpan sebagai CSV.');
    }
  } catch (e) { if (!e || e.code !== 'declined') toast('Export gagal. Coba lagi.', true); }
}

/* ---------- modal ---------- */
let modalEl = null, lastFocus = null;
function openModal(title, body) {
  closeModal(true);
  lastFocus = document.activeElement;
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header class="sh"><h2>' + esc(title) + '</h2><button type="button" class="x" data-close aria-label="Tutup">✕</button></header><div class="sb">' + body + '</div></div>';
  m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); });
  m.querySelector('[data-close]').addEventListener('click', () => closeModal());
  document.body.appendChild(m); modalEl = m; document.body.classList.add('noscroll');
  const first = m.querySelector('input:not([type=hidden]):not([type=file]):not([type=checkbox]),select,textarea'); if (first) first.focus();
  return m;
}
function closeModal(silent) {
  if (!modalEl) return;
  modalEl.remove(); modalEl = null; document.body.classList.remove('noscroll');
  if (!silent && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function onSubmit(m, fn) {
  const form = m.querySelector('form'); const btn = form.querySelector('[type=submit]');
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (btn.disabled) return; btn.disabled = true;
    try { const ok = await fn(new FormData(form), form); if (ok !== false) closeModal(); }
    catch (err) { toast(errText(err), true); }
    finally { btn.disabled = false; }
  });
}
const fld = (label, inner, hint, cls) => '<label class="fld ' + (cls || '') + '"><span>' + label + '</span>' + inner + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
const numIn = (name, val, extra) => {
  extra = extra || '';
  /* kolom rupiah (step 1000, tanpa id): tampil dengan titik ribuan, nilai asli disimpan di input tersembunyi bernama */
  if (/step="1000"/.test(extra) && !/\bid=/.test(extra)) {
    const raw = String(val == null ? '' : val).replace(/\D/g, ''), req = /\brequired\b/.test(extra) ? ' required' : '';
    return '<input type="text" inputmode="numeric" autocomplete="off" data-money value="' + (raw ? Number(raw).toLocaleString('id-ID') : '') + '"' + req + '><input type="hidden" name="' + name + '" value="' + raw + '">';
  }
  return '<input name="' + name + '" type="number" inputmode="numeric" min="0" step="1" value="' + esc(val) + '" ' + extra + '>';
};

/* kamar */
function openRoom(id) {
  const r = cur.roomsById[id]; if (!r) return;
  const t = r.tenant;
  const fs = (r.features || []).map(fid => (cur.features.find(f => f.id === fid) || {}).name).filter(Boolean);
  const stLabel = { vacant: bookingOf(r.id) ? pill('soon', 'Dibooking') : pill('later', 'Kosong'), occ: pill('occ', 'Terisi'), soon: pill('soon', r.bill ? statusText(r.bill) : ''), late: pill('late', r.bill ? statusText(r.bill) : ''), maint: pill('later', 'Perbaikan') }[r.state];
  let b = '<dl class="kv"><div><dt>Status</dt><dd>' + stLabel + '</dd></div><div><dt>Harga / bulan</dt><dd class="mono" id="rm-price">' + rp(r.price) + '</dd></div>' + (isKon(r) ? '<div><dt>Alamat</dt><dd>' + esc(r.address || '-') + '</dd></div>' + (Number(r.bedrooms) ? '<div><dt>Kamar tidur</dt><dd>' + Number(r.bedrooms) + '</dd></div>' : '') : '<div><dt>Lantai</dt><dd>' + r.floor + '</dd></div>') + '</dl>';
  if (r.note) b += '<p class="muted">' + esc(r.note) + '</p>';
  if (t) {
    const ph = safePhoto(t.photo);
    b += '<div class="sect"><h3>Penghuni</h3><div class="thead"><div class="ph">' + (ph ? '<img src="' + ph + '" alt="Foto ' + esc(t.name) + '">' : esc(initials(t.name))) + '</div><div style="min-width:0"><h3 style="font-size:1rem;text-transform:none;letter-spacing:0;color:var(--ink)">' + esc(t.name) + '</h3><p>' + (Number(t.people) || 1) + ' orang · masuk ' + fmtDate(t.moveIn) + '</p><p>' + esc(t.phone || '') + '</p></div></div>';
    if (r.bill) b += '<div class="row">' + '<span>' + esc(fmtPeriod(r.bill.period)) + ' · ' + rp(r.bill.amount) + ' · tempo ' + fmtDate(r.bill.due) + '</span><button class="btn sm primary" data-act="pay" data-id="' + esc(r.bill.id) + '" data-w>Catat bayar</button></div>';
    b += '</div>';
  }
  const bk = bookingOf(r.id);
  if (bk) b += '<div class="sect"><h3>Booking</h3><div class="row"><span><b>' + esc(bk.name) + '</b>' + (bk.phone ? ' · ' + esc(bk.phone) : '') + '<br><span class="muted">' + (bk.moveIn ? 'Rencana masuk ' + fmtDate(bk.moveIn) : 'Tanggal masuk belum ditentukan') + (bk.dp > 0 ? ' · DP ' + rp(bk.dp) : '') + (bk.note ? ' · ' + esc(bk.note) : '') + '</span></span>' + (t ? '' : '<button class="btn sm primary" data-act="bk-in" data-id="' + esc(bk.id) + '" data-w>Check-in</button>') + '</div></div>';
  b += '<div class="sect"><h3>' + (isKon(r) ? 'Fasilitas' : 'Fitur') + ' dan layanan tambahan</h3><div class="checks">' + cur.features.map(f => '<label class="check"><input type="checkbox" class="rm-chk" data-room="' + esc(r.id) + '" value="' + esc(f.id) + '"' + ((r.features || []).indexOf(f.id) >= 0 ? ' checked' : '') + (canWrite ? '' : ' disabled') + '>' + esc(f.name) + ' <small>+' + Math.round(f.price / 1000) + 'rb</small></label>').join('') + '</div><small class="muted">Centang untuk menambah atau melepas. Harga kamar ikut berubah dan langsung tersimpan.' + (t ? ' Harga sewa penghuni yang sudah tersimpan tidak berubah.' : '') + '</small><div class="row" data-w><input id="nf-name" class="grow" maxlength="40" placeholder="Fitur baru, misal Kulkas atau Dapur" aria-label="Nama fitur baru"><input id="nf-price" type="number" inputmode="numeric" min="0" step="1000" placeholder="Tambahan Rp" style="width:9rem" aria-label="Tambahan harga per bulan"><button type="button" class="btn sm" data-act="feat-new" data-room="' + esc(r.id) + '">+ Tambah</button></div></div>';
  b += '<div class="actions">' + (t ? '' : '<button class="btn danger left" data-act="room-del" data-confirm="Klik lagi untuk hapus" data-id="' + esc(r.id) + '" data-w>' + (isKon(r) ? 'Hapus kontrakan' : 'Hapus kamar') + '</button>') + '<button class="btn" data-act="room-edit" data-id="' + esc(r.id) + '" data-w>' + (isKon(r) ? 'Ubah kontrakan' : 'Ubah kamar') + '</button>' + (t ? '<button class="btn" data-act="tenant" data-id="' + esc(t.id) + '" data-w>Ubah penghuni</button>' : (r.state === 'vacant' ? '<button class="btn primary" data-act="checkin" data-room="' + esc(r.id) + '" data-w>Check-in penghuni</button>' : '')) + '</div>';
  openModal(unitName(r), b);
}
function featChecks(sel) {
  return cur.features.map(f => '<label class="check"><input type="checkbox" name="feat" value="' + esc(f.id) + '"' + (sel.indexOf(f.id) >= 0 ? ' checked' : '') + '>' + esc(f.name) + ' <small>+' + Math.round(f.price / 1000) + 'rb</small></label>').join('');
}
function openRoomForm(id, floor, kind) {
  const r = id ? S.rooms[id] : null;
  const kon = r ? isKon(r) : kind === 'kontrakan';
  const base = r ? r.base : (kon ? (cur.kos.konDefault || 1500000) : (cur.kos.baseDefault || 900000));
  const sel = r ? (r.features || []) : [];
  const b = '<form id="rf" class="sb" style="padding:0"><div class="formgrid">' +
    (kon ? fld('Nama kontrakan', '<input name="number" required maxlength="40" value="' + esc(r ? r.number : '') + '" placeholder="Kontrakan A, atau Melati 1">', 'Nama pendek supaya mudah dikenali di denah dan tagihan.', 'full') +
      fld('Alamat lengkap', '<textarea name="address" required maxlength="250" rows="2" placeholder="Jl. Kenanga No. 12 RT 03/RW 05, Kelurahan, Kota">' + esc(r ? r.address : '') + '</textarea>', 'Alamat rumah kontrakan ini.', 'full') +
      fld('Jumlah kamar tidur (opsional)', numIn('bedrooms', r && r.bedrooms ? r.bedrooms : '', 'min="0" max="20"')) +
      fld('Harga sewa per bulan (Rp)', numIn('base', base, 'required step="1000"'))
    : fld('Nomor kamar', '<input name="number" required maxlength="12" value="' + esc(r ? r.number : '') + '" placeholder="101">') +
      fld('Lantai', numIn('floor', r ? r.floor : floor, 'required min="1" max="50"')) +
      fld('Harga dasar per bulan (Rp)', numIn('base', base, 'required step="1000"'), '', 'full')) +
    '<div class="fld full"><span>' + (kon ? 'Fasilitas dan layanan tambahan' : 'Fitur kamar') + '</span><div class="checks">' + featChecks(sel) + '</div><small>Harga akhir: <b class="mono" id="rprice"></b></small></div>' +
    fld('Catatan', '<textarea name="note" maxlength="300">' + esc(r ? r.note : '') + '</textarea>', '', 'full') +
    '<label class="check full"><input type="checkbox" name="maint"' + (r && r.maintenance ? ' checked' : '') + '> Sedang perbaikan, belum disewakan</label></div>' +
    '<div class="actions">' + (id ? '<button type="button" class="btn danger left" data-act="room-del" data-confirm="Klik lagi untuk hapus" data-id="' + esc(id) + '">' + (kon ? 'Hapus kontrakan' : 'Hapus kamar') + '</button>' : '') + '<button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal(id ? 'Ubah ' + unitName(r).toLowerCase() : (kon ? 'Tambah kontrakan' : 'Tambah kamar'), b);
  const form = m.querySelector('form');
  const upd = () => { const fd = new FormData(form); const room = { base: Number(fd.get('base')) || 0, features: fd.getAll('feat') }; $('#rprice').textContent = rp(roomPrice(room, cur.features)); };
  form.addEventListener('input', upd); upd();
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const number = f.get('number').trim();
    if (kon) {
      const address = f.get('address').trim();
      if (!number || !address) { toast('Nama dan alamat kontrakan wajib diisi.', true); return false; }
      if (Object.keys(S.rooms).some(k => k !== id && isKon(S.rooms[k]) && String(S.rooms[k].number).toLowerCase() === number.toLowerCase())) { toast('Nama kontrakan ' + number + ' sudah ada.', true); return false; }
      if (!id && roomsLeft() < 1) { toast(limitMsg(), true); return false; }
      const data = Object.assign({}, r || {}, { kind: 'kontrakan', number, address, bedrooms: Math.max(0, Number(f.get('bedrooms')) || 0), floor: 0, base: Number(f.get('base')) || 0, features: f.getAll('feat'), note: f.get('note').trim(), maintenance: f.get('maint') === 'on' });
      await repo.set('rooms', id || rid('k'), data);
      toast('Kontrakan disimpan');
      return;
    }
    const cid = id || 'r' + number.replace(/[^A-Za-z0-9_-]/g, '');
    if (!number || cid === 'r') { toast('Nomor kamar wajib diisi dengan huruf atau angka.', true); return false; }
    if (!id && S.rooms[cid]) { toast('Nomor kamar ' + number + ' sudah ada.', true); return false; }
    if (!id && roomsLeft() < 1) { toast(limitMsg(), true); return false; }
    const data = Object.assign({}, r || {}, { number, floor: Number(f.get('floor')) || 1, base: Number(f.get('base')) || 0, features: f.getAll('feat'), note: f.get('note').trim(), maintenance: f.get('maint') === 'on' });
    await repo.set('rooms', cid, data);
    toast('Kamar disimpan');
  });
}
let fbRefresh = null;
const ADDON_IDS = ['lnd', 'prk', 'prm'];
function nextFloorNo() { return cur.floors.length ? Math.max.apply(null, cur.floors) + 1 : 1; }
function startNo(fl) {
  let mx = 0;
  cur.rooms.forEach(r => { if (r.floor === fl) { const n = parseInt(r.number, 10); if (n > mx) mx = n; } });
  return mx ? mx + 1 : fl * 100 + 1;
}
function ftypeRow(d) {
  const chk = list => list.map(f => '<label class="check"><input type="checkbox" class="ft-feat" value="' + esc(f.id) + '"' + (d.feats.indexOf(f.id) >= 0 ? ' checked' : '') + '>' + esc(f.name) + ' <small>+' + Math.round(f.price / 1000) + 'rb</small></label>').join('');
  const feats = cur.features.filter(f => ADDON_IDS.indexOf(f.id) < 0), adds = cur.features.filter(f => ADDON_IDS.indexOf(f.id) >= 0);
  return '<div class="ftype"><div class="ftype-h"><b class="ft-title"></b><button type="button" class="x" data-act="ft-del" aria-label="Hapus tipe kamar">✕</button></div><div class="formgrid">' +
    fld('Jumlah kamar', '<input class="ft-n" type="number" inputmode="numeric" min="1" max="30" value="' + d.n + '">') +
    fld('Harga dasar per bulan (Rp)', '<input class="ft-base" type="number" inputmode="numeric" min="0" step="1000" value="' + d.base + '">') +
    '<div class="fld full"><span>Fasilitas kamar</span><div class="checks">' + chk(feats) + '</div><small>Tidak ada yang dicentang berarti kamar biasa.</small></div>' +
    (adds.length ? '<div class="fld full"><span>Layanan tambahan</span><div class="checks">' + chk(adds) + '</div></div>' : '') +
    '<p class="full ft-price" style="margin:0"></p></div></div>';
}
function openBulk(preFloor) {
  const fl0 = preFloor || nextFloorNo();
  const base = cur.kos.baseDefault || 900000;
  let goNext = false;
  const b = '<form class="sb" style="padding:0"><p class="muted">Isi jumlah kamar di lantai ini dan pilih fasilitasnya. Kalau ada kamar dengan fasilitas berbeda, tambahkan sebagai tipe lain. Setelah disimpan, denah lantai langsung tampil.</p><div class="formgrid">' +
    fld('Lantai ke', numIn('floor', fl0, 'required min="1" max="30" id="fb-floor"')) +
    '<div class="fld"><span>Nomor kamar</span><b class="mono" id="fb-range" style="padding:.5rem 0"></b></div></div>' +
    '<div id="ft-rows" style="display:flex;flex-direction:column;gap:.8rem">' + ftypeRow({ n: 4, base, feats: [] }) + '</div>' +
    '<div><button type="button" class="btn sm" data-act="ft-add">+ Tipe kamar lain</button></div>' +
    '<div class="duebox" id="fb-sum" aria-live="polite"></div>' +
    '<div class="actions"><button type="button" class="btn left" data-close2>Batal</button><button class="btn" type="submit" id="fb-next">Simpan dan lanjut lantai berikutnya</button><button class="btn primary" type="submit" id="fb-save">Simpan lantai</button></div></form>';
  const m = openModal('Buat lantai', b);
  const readRows = () => Array.from(document.querySelectorAll('#ft-rows .ftype')).map(el => ({
    n: Math.max(0, Math.min(30, Math.round(Number(el.querySelector('.ft-n').value) || 0))),
    base: Math.max(0, Number(el.querySelector('.ft-base').value) || 0),
    feats: Array.from(el.querySelectorAll('.ft-feat:checked')).map(x => x.value)
  }));
  const featNames = ids => ids.map(id => (cur.features.find(f => f.id === id) || {}).name).filter(Boolean);
  fbRefresh = () => {
    const rows = readRows(), fl = Math.max(1, Number($('#fb-floor').value) || 1);
    let total = 0;
    document.querySelectorAll('#ft-rows .ftype').forEach((el, i) => {
      const r = rows[i], nm = featNames(r.feats);
      el.querySelector('.ft-title').textContent = 'Tipe ' + (i + 1) + ': ' + (nm.length ? nm.join(' + ') : 'Kamar biasa');
      el.querySelector('.ft-price').innerHTML = 'Harga per kamar: <b class="mono">' + rp(roomPrice({ base: r.base, features: r.feats }, cur.features)) + '</b> / bulan';
      el.querySelector('[data-act=ft-del]').hidden = rows.length < 2;
      total += r.n;
    });
    const st = startNo(fl);
    $('#fb-range').textContent = total ? st + ' sampai ' + (st + total - 1) : '-';
    $('#fb-sum').innerHTML = '<b>Lantai ' + fl + ': ' + total + ' kamar</b><span>' + rows.map(r => r.n + ' ' + (featNames(r.feats).join(' + ') || 'biasa')).join(', ') + '</span>';
  };
  const form = m.querySelector('form');
  form.addEventListener('input', () => fbRefresh());
  fbRefresh();
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  $('#fb-next').addEventListener('click', () => { goNext = true; });
  $('#fb-save').addEventListener('click', () => { goNext = false; });
  onSubmit(m, async () => {
    const fl = Math.min(30, Math.max(1, Number($('#fb-floor').value) || 1)), rows = readRows().filter(r => r.n > 0);
    if (!rows.length) { toast('Isi jumlah kamar minimal 1.', true); return false; }
    const want = rows.reduce((n, r) => n + r.n, 0);
    if (want > roomsLeft()) { toast(limitMsg() + ' Sisa kuota: ' + Math.max(0, roomsLeft()) + ' unit.', true); return false; }
    let no = startNo(fl); const jobs = [];
    rows.forEach(r => { for (let i = 0; i < r.n; i++) { while (S.rooms['r' + no]) no++; jobs.push(['r' + no, { number: String(no), floor: fl, base: r.base, features: r.feats, note: '', maintenance: false }]); no++; } });
    for (let k = 0; k < jobs.length; k += 8) await Promise.all(jobs.slice(k, k + 8).map(j => repo.set('rooms', j[0], j[1])));
    toast(jobs.length + ' kamar dibuat di lantai ' + fl);
    UI.tab = 'dashboard';
    if (goNext) setTimeout(() => openBulk(fl + 1), 80);
  });
}
async function deleteRoom(id) {
  if (cur.activeByRoom[id]) { toast('Kamar masih dihuni. Check-out penghuni dulu.', true); return; }
  if (await run(() => repo.del('rooms', id))) { closeModal(); toast('Kamar dihapus'); }
}

/* penghuni */
let photoData = '';
function openTenant(id, presetRoom) {
  const t = id ? S.tenants[id] : null;
  const rooms = cur.rooms.filter(r => (!r.tenant && !r.maintenance) || (t && r.id === t.roomId) || (presetRoom === r.id));
  if (!rooms.length) { toast('Tidak ada kamar atau kontrakan kosong. Tambah unit baru atau check-out penghuni lain.', true); return; }
  const selRoom = t ? t.roomId : (presetRoom || rooms[0].id);
  photoData = t ? safePhoto(t.photo) : '';
  const b = '<form class="sb" style="padding:0"><div class="formgrid">' +
    '<div class="fsec">Data penghuni</div>' +
    fld('Nama lengkap', '<input name="name" required maxlength="80" value="' + esc(t ? t.name : '') + '" placeholder="Contoh: Budi Santoso">', '', 'full') +
    fld('No. HP / WhatsApp', '<input name="phone" inputmode="tel" maxlength="20" value="' + esc(t ? t.phone : '') + '" placeholder="0812xxxxxxxx">', 'Dipakai untuk kirim pengingat tagihan.') +
    fld('Jumlah orang', numIn('people', t ? t.people : 1, 'required min="1" max="10"')) +
    '<div class="fsec">' + unitHead() + ' dan masa sewa</div>' +
    fld(unitHead() === 'Unit' ? 'Kamar / kontrakan' : unitHead(), '<select name="room" id="t-room">' + rooms.map(r => '<option value="' + esc(r.id) + '" data-price="' + r.price + '"' + (r.id === selRoom ? ' selected' : '') + '>' + esc(unitName(r)) + ' · ' + (isKon(r) ? esc(shortAddr(r.address, 36) || 'tanpa alamat') : 'Lt ' + r.floor) + ' · ' + rp(r.price) + '</option>').join('') + '</select>', '', 'full') +
    fld('Tanggal masuk', '<div class="inrow"><input name="moveIn" id="t-movein" type="date" required value="' + esc(t ? t.moveIn : todayStr()) + '"><button type="button" class="btn sm" id="t-today">Hari ini</button></div>') +
    fld('Harga per bulan (Rp)', numIn('rent', t ? t.rent : (rooms.find(r => r.id === selRoom) || {}).price, 'required step="1000" id="t-rent"'), 'Otomatis dari harga kamar, bisa diubah.') +
    '<div class="full duebox" id="duebox" aria-live="polite"></div>' +
    fld('Durasi kontrak (bulan)', numIn('contractMonths', t && t.contractMonths ? t.contractMonths : '', 'min="0" max="120" id="t-cm"'), 'Kosong = tanpa kontrak, tagihan bulanan terus. Diisi = bayar penuh di muka: satu tagihan sebesar harga × durasi. Pengingat muncul 30 hari sebelum habis.', 'full') + '<div class="full duebox" id="cbox" aria-live="polite" hidden></div>' +
    fld('Deposit (Rp)', numIn('deposit', t ? (t.deposit || 0) : 0, 'step="1000"'), 'Boleh dikosongkan.', 'full') +
    '<div class="fsec">Foto dan catatan</div>' +
    '<div class="fld full"><span>Foto penghuni (opsional)</span><div class="photo-pick"><div class="ph" id="ph-prev"></div><div class="row"><input id="photo" type="file" accept="image/*" style="width:auto;max-width:100%"><button type="button" class="btn sm" id="photo-clear">Hapus foto</button></div></div></div>' +
    fld('Catatan', '<textarea name="note" maxlength="300">' + esc(t ? t.note : '') + '</textarea>', '', 'full') + '</div>' +
    '<div class="actions"><button type="button" class="btn left" data-close2 style="margin-right:auto">Batal</button><button class="btn primary" type="submit">' + (t ? 'Simpan perubahan' : 'Simpan penghuni') + '</button></div></form>';
  const m = openModal(t ? 'Ubah penghuni' : 'Check-in penghuni', b);
  const prev = () => { const p = $('#ph-prev'); p.innerHTML = photoData ? '<img src="' + photoData + '" alt="Foto penghuni">' : esc(initials((m.querySelector('[name=name]').value) || '?')); };
  prev();
  const updDue = () => {
    const v = $('#t-movein').value, box = $('#duebox');
    if (!v) { box.innerHTML = '<span>Isi tanggal masuk untuk melihat jatuh tempo.</span>'; return; }
    const day = parseD(v).getDate(), nx = nextDue(v, todayStr());
    const diff = daysBetween(todayStr(), nx);
    box.innerHTML = '<b>Jatuh tempo tiap tanggal ' + day + '</b><span>' + (v > todayStr() ? 'Masuk ' + fmtDate(v) + '. Tagihan pertama jatuh tempo di tanggal itu.' : 'Tagihan berikutnya ' + fmtDate(nx) + (diff === 0 ? ' (hari ini)' : ' (' + diff + ' hari lagi)') + '.') + (day > 28 ? ' Di bulan yang lebih pendek, jatuh tempo jadi akhir bulan.' : '') + '</span>';
  };
  const updC = () => { const v = $('#t-movein').value, n = Number($('#t-cm').value) || 0, box = $('#cbox'); if (!v || n <= 0) { box.hidden = true; return; } box.hidden = false; const rent = Number($('#t-rent').value) || 0; box.innerHTML = '<b>Kontrak sampai ' + fmtDate(addMonths(v, n)) + '</b><span>' + 'Bayar penuh di muka: ' + rp(rent * n) + ' (' + rp(rent) + ' × ' + n + ' bulan), jatuh tempo di tanggal masuk. Tidak ada tagihan bulanan lagi selama kontrak.' + '</span>'; };
  $('#t-movein').addEventListener('input', () => { updDue(); updC(); });
  $('#t-cm').addEventListener('input', updC); $('#t-rent').addEventListener('input', updC);
  $('#t-today').addEventListener('click', () => { $('#t-movein').value = todayStr(); updDue(); updC(); });
  updDue(); updC();
  let touched = !!t;
  $('#t-rent').addEventListener('input', () => { touched = true; });
  $('#t-room').addEventListener('change', e => { if (!touched) $('#t-rent').value = e.target.selectedOptions[0].dataset.price; });
  m.querySelector('[name=name]').addEventListener('input', () => { if (!photoData) prev(); });
  $('#photo').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { photoData = await resizePhoto(file); prev(); } catch (err) { toast('Foto tidak bisa dibaca. Coba foto lain.', true); }
  });
  $('#photo-clear').addEventListener('click', () => { photoData = ''; $('#photo').value = ''; prev(); });
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const name = f.get('name').trim(), roomId = f.get('room'), rent = Number(f.get('rent')) || 0, moveIn = f.get('moveIn');
    if (!name || !roomId || !moveIn || rent <= 0) { toast('Lengkapi nama, kamar, tanggal masuk, dan harga.', true); return false; }
    const other = cur.activeByRoom[roomId];
    if (other && other.id !== id) { toast('Unit itu sudah dihuni ' + other.name + '.', true); return false; }
    const billFrom = (t && t.billFrom && t.moveIn === moveIn) ? t.billFrom : nextDue(moveIn, todayStr()).slice(0, 7);
    const cm = Math.max(0, Math.round(Number(f.get('contractMonths')) || 0));
    const data = Object.assign({}, t || {}, { contractMonths: cm, contractEnd: cm > 0 ? addMonths(moveIn, cm) : '', billFrom, name, phone: f.get('phone').trim(), roomId, people: Math.max(1, Number(f.get('people')) || 1), moveIn, rent, deposit: Number(f.get('deposit')) || 0, note: f.get('note').trim(), photo: photoData });
    await repo.set('tenants', id || rid('t'), data);
    toast('Penghuni disimpan');
  });
}
function openStaff(id) {
  const x = id ? S.staff[id] : null;
  photoData = x ? safePhoto(x.photo) : '';
  const opt = (arr, v) => arr.map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
  const b = '<form class="sb" style="padding:0"><div class="formgrid">' +
    '<div class="fsec">Data penjaga</div>' +
    fld('Nama lengkap', '<input name="name" required maxlength="80" value="' + esc(x ? x.name : '') + '" placeholder="Contoh: Pak Slamet">', '', 'full') +
    fld('No. HP / WhatsApp', '<input name="phone" inputmode="tel" maxlength="20" value="' + esc(x ? x.phone : '') + '" placeholder="0812xxxxxxxx">') +
    fld('Peran', '<select name="role">' + opt(STAFF_ROLES, x ? x.role : STAFF_ROLES[0]) + '</select>') +
    '<div class="fsec">Jadwal dan tugas</div>' +
    fld('Shift', '<select name="shift">' + opt(STAFF_SHIFTS, x ? x.shift : STAFF_SHIFTS[0]) + '</select>') +
    fld('Jam jaga (opsional)', '<input name="hours" maxlength="30" value="' + esc(x ? x.hours : '') + '" placeholder="22.00 - 06.00">') +
    fld('Area tugas (opsional)', '<input name="area" maxlength="80" value="' + esc(x ? x.area : '') + '" placeholder="Gerbang, lantai 1 dan 2">', '', 'full') +
    fld('Mulai kerja', '<input name="startDate" type="date" required value="' + esc(x ? x.startDate : todayStr()) + '">') +
    fld('Gaji per bulan (Rp)', numIn('salary', x ? (x.salary || 0) : 0, 'step="1000"'), 'Boleh dikosongkan.') +
    fld('Tanggal gajian (1-31)', numIn('payDay', x && x.payDay ? x.payDay : '', 'min="1" max="31"'), 'Kosong = sama dengan tanggal mulai kerja. Pengingat gaji muncul 7 hari sebelumnya.') +
    '<div class="fsec">Kontak darurat dan catatan</div>' +
    fld('Nama kontak darurat', '<input name="emName" maxlength="80" value="' + esc(x ? x.emName : '') + '" placeholder="Keluarga atau kerabat">') +
    fld('No. HP kontak darurat', '<input name="emPhone" inputmode="tel" maxlength="20" value="' + esc(x ? x.emPhone : '') + '">') +
    '<div class="fld full"><span>Foto (opsional)</span><div class="photo-pick"><div class="ph" id="ph-prev"></div><div class="row"><input id="photo" type="file" accept="image/*" style="width:auto;max-width:100%"><button type="button" class="btn sm" id="photo-clear">Hapus foto</button></div></div></div>' +
    fld('Catatan', '<textarea name="note" maxlength="300">' + esc(x ? x.note : '') + '</textarea>', '', 'full') + '</div>' +
    '<div class="actions">' + (id ? '<button type="button" class="btn danger left" data-act="staff-del" data-confirm="Klik lagi untuk hapus" data-id="' + esc(id) + '">Hapus</button>' : '') + '<button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">' + (x ? 'Simpan perubahan' : 'Simpan penjaga') + '</button></div></form>';
  const m = openModal(x ? 'Ubah penjaga' : 'Tambah penjaga', b);
  const prev = () => { const p = $('#ph-prev'); p.innerHTML = photoData ? '<img src="' + photoData + '" alt="Foto penjaga">' : esc(initials((m.querySelector('[name=name]').value) || '?')); };
  prev();
  m.querySelector('[name=name]').addEventListener('input', () => { if (!photoData) prev(); });
  $('#photo').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { photoData = await resizePhoto(file); prev(); } catch (err) { toast('Foto tidak bisa dibaca. Coba foto lain.', true); }
  });
  $('#photo-clear').addEventListener('click', () => { photoData = ''; $('#photo').value = ''; prev(); });
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const name = f.get('name').trim();
    if (!name) { toast('Nama penjaga wajib diisi.', true); return false; }
    const data = Object.assign({}, x || {}, { name, phone: f.get('phone').trim(), role: f.get('role'), shift: f.get('shift'), hours: f.get('hours').trim(), area: f.get('area').trim(), startDate: f.get('startDate'), salary: Number(f.get('salary')) || 0, payDay: Math.min(31, Number(f.get('payDay')) || 0), emName: f.get('emName').trim(), emPhone: f.get('emPhone').trim(), note: f.get('note').trim(), photo: photoData });
    await repo.set('staff', id || rid('s'), data);
    toast('Penjaga disimpan');
  });
}
function openStaffPay(billId) {
  const rec = S.salary[billId] || null;
  const bl = cur.staffBills.find(b => b.id === billId) || (rec ? { id: billId, tenantId: rec.staffId, period: rec.period, amount: rec.amount, due: '' } : null);
  if (!bl || guardLock(bl.period) || (rec && rec.paidAt && guardLock(rec.paidAt))) return;
  const x = S.staff[bl.tenantId] || {};
  const b = '<form class="sb" style="padding:0"><dl class="kv"><div><dt>Penjaga</dt><dd>' + esc(x.name || '-') + '</dd></div><div><dt>Periode</dt><dd>' + esc(fmtPeriod(bl.period)) + '</dd></div>' + (bl.due ? '<div><dt>Jatuh tempo</dt><dd>' + fmtDate(bl.due) + '</dd></div>' : '') + '</dl><div class="formgrid">' +
    fld('Tanggal bayar', '<input name="paidAt" type="date" required value="' + esc(rec && rec.paidAt ? rec.paidAt : todayStr()) + '">') +
    fld('Jumlah (Rp)', numIn('amount', rec ? rec.amount : bl.amount, 'required step="1000"'), Number(x.salary) > 0 ? 'Gaji per bulan saat ini ' + rp(x.salary) + '.' : '') +
    fld('Catatan', '<input name="note" maxlength="120" value="' + esc(rec ? rec.note || '' : '') + '" placeholder="Potong kasbon, bonus, dll">', '', 'full') + '</div>' +
    (rec ? '<p class="muted" style="font-size:.84rem;margin:.2rem 0 0">Mengubah jumlah di sini ikut mengubah angka di Keuangan dan Laporan.</p>' : '') +
    '<div class="actions">' + (rec ? '<button type="button" class="btn danger left" data-act="staff-unpay" data-confirm="Klik lagi untuk batalkan" data-id="' + esc(bl.id) + '">Batalkan pembayaran</button>' : '') + '<button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">' + (rec ? 'Simpan perubahan' : 'Simpan') + '</button></div></form>';
  const m = openModal(rec ? 'Ubah gaji dibayar' : 'Catat gaji dibayar', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const amount = Number(f.get('amount')) || 0;
    if (amount <= 0) { toast('Jumlah harus lebih dari 0.', true); return false; }
    const paidAt = f.get('paidAt');
    if (rec && guardLock(paidAt)) return false;
    await repo.set('salary', bl.id, Object.assign({}, rec || {}, { staffId: bl.tenantId, roomId: '', period: bl.period, amount, paidAt, note: f.get('note').trim() }));
    toast(rec ? 'Pembayaran gaji diperbarui' : 'Gaji tercatat dibayar');
  });
}
function resizePhoto(file, max, q) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sc = Math.min(1, (max || 360) / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q || 0.78));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('x')); };
    img.src = url;
  });
}
/* pembayaran */
function openPay(billId) {
  const bl = cur.billsById[billId]; if (!bl || guardLock(bl.period)) return;
  const t = S.tenants[bl.tenantId] || {}, ut = utilOfBill(bl);
  const b = '<form class="sb" style="padding:0"><dl class="kv"><div><dt>' + unitHead() + '</dt><dd class="mono">' + esc(roomNo(bl.roomId)) + '</dd></div><div><dt>Penghuni</dt><dd>' + esc(t.name || '-') + '</dd></div><div><dt>Periode</dt><dd>' + esc(fmtPeriod(bl.period)) + '</dd></div><div><dt>Jatuh tempo</dt><dd>' + fmtDate(bl.due) + '</dd></div></dl><div class="formgrid">' +
    fld('Tanggal bayar', '<input name="paidAt" type="date" required value="' + todayStr() + '">') + fld('Jumlah (Rp)', numIn('amount', bl.amount, 'required step="1000"')) +
    fld('Metode', '<select name="method"><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select>') + fld('Catatan', '<input name="note" maxlength="120">') + (ut ? '<label class="check full"><input type="checkbox" name="withUtil" checked> Sekaligus lunasi listrik dan air periode ini (' + rp(ut.total) + ')</label>' : '') + '</div><div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan pembayaran</button></div></form>';
  const m = openModal('Catat pembayaran', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const amount = Number(f.get('amount')) || 0;
    if (amount <= 0) { toast('Jumlah harus lebih dari 0.', true); return false; }
    await repo.set('payments', bl.id, { tenantId: bl.tenantId, roomId: bl.roomId, period: bl.period, amount, paidAt: f.get('paidAt'), method: f.get('method'), note: f.get('note').trim() });
    if (ut && f.get('withUtil') === 'on') await repo.set('utils', utilId(bl.roomId, bl.period), Object.assign({}, ut, { paidAt: f.get('paidAt'), method: f.get('method') }));
    toast(ut && f.get('withUtil') === 'on' ? 'Pembayaran sewa dan listrik air tercatat' : 'Pembayaran tercatat');
  });
}

/* cctv */
function openCam(id) {
  const c = id ? S.cameras[id] : null;
  const floors = cur.floors.slice();
  const b = '<form class="sb" style="padding:0"><div class="formgrid">' + fld('Nama kamera', '<input name="name" required maxlength="60" value="' + esc(c ? c.name : '') + '" placeholder="Koridor lantai 1">', '', 'full') +
    fld('Area', camLocSelect(c)) + fld('Lokasi', '<input name="place" maxlength="60" value="' + esc(c ? c.place : '') + '" placeholder="Dekat tangga">') +
    fld('Alamat RTSP', '<input name="rtsp" required maxlength="300" value="' + esc(c ? c.rtsp : '') + '" placeholder="rtsp://user:sandi@192.168.1.64:554/Streaming/Channels/101">', 'Pakai akun CCTV khusus lihat saja. Data ini bisa dilihat siapa pun yang diberi akses ke halaman ini.', 'full') +
    fld('Link live view (opsional)', '<input name="view" type="url" maxlength="300" value="' + esc(c ? c.viewUrl : '') + '" placeholder="http://192.168.1.10:1984/stream.html?src=cam1">', 'Alamat halaman web dari gateway yang menampilkan video kamera ini.', 'full') + '</div>' +
    '<div class="actions">' + (id ? '<button type="button" class="btn danger left" data-act="cam-del" data-confirm="Klik lagi untuk hapus" data-id="' + esc(id) + '">Hapus</button>' : '') + '<button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal(id ? 'Ubah kamera' : 'Tambah kamera', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const rtsp = f.get('rtsp').trim(), view = f.get('view').trim();
    if (!/^rtsps?:\/\//i.test(rtsp)) { toast('Alamat RTSP harus diawali rtsp://', true); return false; }
    if (view && !/^https?:\/\//i.test(view)) { toast('Link live view harus diawali http:// atau https://', true); return false; }
    await repo.set('cameras', id || rid('c'), Object.assign({}, c || {}, { name: f.get('name').trim(), floor: camLoc(f.get('loc')).floor, unitId: camLoc(f.get('loc')).unitId, place: f.get('place').trim(), rtsp, viewUrl: view }));
    toast('Kamera disimpan');
  });
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return; } catch (e) {}
  const m = openModal('Salin manual', '<textarea readonly rows="8" id="cp" style="font-family:var(--f-mono);font-size:.8rem">' + esc(text) + '</textarea>');
  const ta = $('#cp'); ta.focus(); ta.select();
}
function go2rtcConfig() {
  const used = {};
  const lines = ['# go2rtc.yaml: jalankan go2rtc di jaringan kos, lalu buka http://<ip-server>:1984', 'streams:'];
  Object.keys(S.cameras).map(id => S.cameras[id]).forEach(c => {
    let s = 'cam_' + String(c.name || 'kamera').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    while (used[s]) s += '_2'; used[s] = 1;
    lines.push('  ' + s + ': ' + c.rtsp);
  });
  return lines.join('\n');
}

/* pengaturan */
function featRow(f) {
  return '<div class="featrow"><input type="hidden" name="fid" value="' + esc(f ? f.id : '') + '"><input name="fname" maxlength="40" placeholder="Nama fitur" value="' + esc(f ? f.name : '') + '" aria-label="Nama fitur"><input name="fprice" type="number" inputmode="numeric" min="0" step="1000" placeholder="Tambahan" value="' + esc(f ? f.price : '') + '" aria-label="Tambahan harga per bulan"><button type="button" class="x" data-act="feat-del" aria-label="Hapus fitur">✕</button></div>';
}
function openSettings() {
  const k = cur.kos;
  const b = '<form class="sb" style="padding:0"><div class="formgrid">' + fld('Nama kos', '<input name="name" required maxlength="60" value="' + esc(k.name || '') + '" placeholder="Kos Melati">', '', 'full') +
    typeRadios(kosType()) +
    fld('Alamat kosan / usaha', '<textarea name="address" maxlength="200" rows="2" placeholder="Jl. Kenanga No. 12, Kelurahan, Kota">' + esc(k.address || '') + '</textarea>', 'Alamat tiap kontrakan diisi di masing-masing kontrakan.', 'full') +
    '<div class="fsec">Data pemilik</div>' +
    fld('Nama pemilik', '<input name="ownerName" maxlength="80" value="' + esc(k.ownerName || '') + '">', '', 'full') +
    fld('No. WhatsApp', '<input name="ownerPhone" inputmode="tel" maxlength="20" value="' + esc(k.ownerPhone || '') + '">') +
    fld('Email', '<input name="ownerEmail" type="email" maxlength="80" value="' + esc(k.ownerEmail || '') + '">') +
    '</div>' +
    '<div class="sect"><h3>Akun</h3><p class="muted" style="margin:0">' + esc(fbUser ? fbUser.email : '') + '</p><div><button type="button" class="btn sm" data-act="pw-reset">Kirim link ganti password</button></div></div>' +
    '<div class="sect"><h3>Fitur kamar dan tambahan harga per bulan</h3><div id="feat-rows">' + cur.features.map(featRow).join('') + '</div><div><button type="button" class="btn sm" data-act="feat-add">+ Tambah fitur</button></div><p class="muted" style="font-size:.82rem">Harga kamar = harga dasar + tambahan tiap fitur yang dicentang di kamar itu. Mengubah angka di sini mengubah harga di tampilan kamar, tapi tidak mengubah harga sewa penghuni yang sudah tersimpan.</p></div>' +
    '<div class="sect"><h3>' + (showKos() && showKon() ? 'Kamar dan kontrakan' : showKon() ? 'Kontrakan' : 'Kamar') + '</h3><div class="row">' + (showKos() ? '<button type="button" class="btn sm" data-act="bulk">+ Tambah lantai kosan</button>' : '') + (showKon() ? '<button type="button" class="btn sm" data-act="kon-add">+ Tambah kontrakan</button>' : '') + '</div><p class="muted" style="font-size:.82rem;margin:0">Mengganti jenis usaha tidak menghapus data. Kamar dan kontrakan yang sudah ada tetap tampil.</p></div>' +
    settingsExtra() +
    (k.demo ? '<div class="sect"><h3>Data contoh</h3><p class="muted" style="font-size:.88rem">Hapus semua kamar, penghuni, penjaga, pembayaran, dan kamera contoh. Data yang kamu tambah sendiri tidak ikut terhapus.</p><div><button type="button" class="btn sm danger" data-act="demo-clear" data-confirm="Klik lagi untuk hapus data contoh">Hapus data contoh</button></div></div>' : '') +
    '<div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal('Pengaturan', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const ids = f.getAll('fid'), names = f.getAll('fname'), prices = f.getAll('fprice');
    const features = [];
    names.forEach((n, i) => { n = n.trim(); if (n) features.push({ id: ids[i] || rid('f'), name: n, price: Number(prices[i]) || 0 }); });
    const data = Object.assign({}, S.meta.kos || {}, { name: f.get('name').trim(), address: f.get('address').trim(), ownerName: f.get('ownerName').trim(), ownerPhone: f.get('ownerPhone').trim(), ownerEmail: f.get('ownerEmail').trim(), type: KOS_TYPES[f.get('kosType')] ? f.get('kosType') : kosType(), elecRate: Number(f.get('elecRate')) || 0, waterRate: Number(f.get('waterRate')) || 0, lockBefore: f.get('lockBefore') || '', setupDone: true, features });
    await repo.set('meta', 'kos', data);
    toast('Pengaturan disimpan');
  });
}
async function clearDemo() {
  const jobs = [];
  COLS.filter(c => c !== 'meta').forEach(c => Object.keys(S[c]).forEach(id => { if (S[c][id] && S[c][id].demo) jobs.push([c, id]); }));
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(j => repo.del(j[0], j[1])));
  await repo.set('meta', 'kos', Object.assign({}, S.meta.kos || {}, { demo: false, name: (S.meta.kos && S.meta.kos.name === 'Kos Contoh') ? 'Kos Saya' : S.meta.kos.name }));
}

/* ---------- event ---------- */
const armed = el => {
  if (el.dataset.armed === '1') return true;
  el.dataset.armed = '1'; el.dataset.orig = el.textContent; el.textContent = el.dataset.confirm; el.classList.add('armed');
  setTimeout(() => { if (el.isConnected && el.dataset.armed === '1') { el.dataset.armed = ''; el.textContent = el.dataset.orig; el.classList.remove('armed'); } }, 4000);
  return false;
};
const H = {
  tab: el => setTab(el.dataset.tab),
  lf: el => { UI.lf = UI.lf === el.dataset.v && el.dataset.v !== 'all' ? 'all' : el.dataset.v; render(); },
  tf: el => { UI.tf = el.dataset.v; render(); },
  tl: el => { UI.tl = el.dataset.v; render(); },
  bf: el => { UI.bf = el.dataset.v; render(); },
  room: el => openRoom(el.dataset.id),
  'room-add': el => openRoomForm('', Number(el.dataset.floor) || 1),
  'le-on': el => { UI.le = el.dataset.key; UI.lePick = ''; render(); },
  'le-off': () => { UI.le = ''; UI.lePick = ''; render(); },
  'le-step': el => {
    const key = el.dataset.key, n = roomsOfSec(key).length, c = effCfg(key, n), d = Number(el.dataset.d) || 0;
    let cols = c.cols, corr = c.corr;
    if (el.dataset.f === 'cols') cols = Math.min(8, Math.max(1, cols + d)); else corr += d;
    corr = Math.min(Math.max(0, corr), Math.max(1, Math.ceil(n / cols)) - 1);
    saveLayoutCfg(key, { cols, corr });
  },
  'le-reset': async el => {
    const key = el.dataset.key, rs = roomsOfSec(key), kos = S.meta.kos || {}, lay = Object.assign({}, kos.layout || {});
    delete lay[key]; UI.lePick = '';
    const ok = await run(async () => {
      await repo.set('meta', 'kos', Object.assign({}, kos, { layout: lay }));
      const ch = rs.filter(r => S.rooms[r.id] && typeof S.rooms[r.id].ord === 'number');
      for (let k = 0; k < ch.length; k += 8) await Promise.all(ch.slice(k, k + 8).map(r => { const d = Object.assign({}, S.rooms[r.id]); delete d.ord; return repo.set('rooms', r.id, d); }));
    });
    if (ok) toast('Layout dikembalikan ke otomatis');
  },
  'le-pick': el => {
    const id = el.dataset.id;
    if (!UI.lePick) { UI.lePick = id; render(); return; }
    if (UI.lePick === id) { UI.lePick = ''; render(); return; }
    const a = UI.lePick; UI.lePick = ''; render(); swapRooms(a, id);
  },
  'kon-add': () => openRoomForm('', 0, 'kontrakan'),
  'room-edit': el => openRoomForm(el.dataset.id),
  'room-del': el => deleteRoom(el.dataset.id),
  bulk: el => openBulk(Number(el.dataset.floor) || 0),
  'ft-add': () => { const first = document.querySelector('#ft-rows .ft-base'); $('#ft-rows').insertAdjacentHTML('beforeend', ftypeRow({ n: 2, base: first ? first.value : 900000, feats: ['ac'] })); if (fbRefresh) fbRefresh(); const rows = document.querySelectorAll('#ft-rows .ftype'); rows[rows.length - 1].querySelector('.ft-n').focus(); },
  'ft-del': el => { const row = el.closest('.ftype'); if (document.querySelectorAll('#ft-rows .ftype').length > 1) row.remove(); if (fbRefresh) fbRefresh(); },
  'floor-del': async el => {
    const fl = Number(el.dataset.floor), rs = cur.rooms.filter(r => r.floor === fl);
    if (rs.some(r => r.tenant)) { toast('Lantai ' + fl + ' masih ada penghuni. Check-out dulu.', true); return; }
    const ok = await run(async () => { for (let i = 0; i < rs.length; i += 8) await Promise.all(rs.slice(i, i + 8).map(r => repo.del('rooms', r.id))); });
    if (ok) toast('Lantai ' + fl + ' dihapus');
  },
  checkin: el => openTenant('', el.dataset.room),
  tenant: el => openTenant(el.dataset.id || ''),
  checkout: el => openCheckout(el.dataset.id),
  pay: el => openPay(el.dataset.id),
  unpay: el => { const p0 = S.payments[el.dataset.id]; if (p0 && guardLock(p0.period)) return; run(() => repo.del('payments', el.dataset.id)).then(ok => ok && toast('Pembayaran dibatalkan')); },
  'cam-edit': el => openCam(el.dataset.id || ''),
  'cam-del': el => run(() => repo.del('cameras', el.dataset.id)).then(ok => { if (ok) { closeModal(); toast('Kamera dihapus'); } }),
  'cam-copy': el => { const c = S.cameras[el.dataset.id]; if (c) copyText(c.rtsp, 'Alamat RTSP disalin'); },
  'cfg-copy': () => { if (!Object.keys(S.cameras).length) toast('Tambahkan kamera dulu.', true); else copyText(go2rtcConfig(), 'Config go2rtc disalin'); },
  'feat-new': async el => {
    const name = $('#nf-name').value.trim(), price = Math.max(0, Number($('#nf-price').value) || 0), id = el.dataset.room, r0 = S.rooms[id];
    if (!name) { toast('Isi nama fitur dulu.', true); return; }
    if (cur.features.some(f => f.name.toLowerCase() === name.toLowerCase())) { toast('Fitur ' + name + ' sudah ada di daftar.', true); return; }
    const f = { id: rid('f'), name, price };
    const feats = Array.from(document.querySelectorAll('.rm-chk:checked')).map(x => x.value).concat(f.id);
    const ok = await run(async () => {
      await repo.set('meta', 'kos', Object.assign({}, S.meta.kos || {}, { features: cur.features.concat([f]) }));
      if (r0) await repo.set('rooms', id, Object.assign({}, r0, { features: feats }));
    });
    if (ok) { toast(name + ' ditambahkan'); setTimeout(() => { cur = compute(); if (modalEl) openRoom(id); }, 500); }
  },
  logout: () => { if (auth) auth.signOut(); },
  'land-login': () => { authView = 'form'; authMode = 'login'; authMsg = ''; scrollTo(0, 0); renderAuth(); },
  'land-trial': () => { authView = 'form'; authMode = 'register'; REG.mode = 'trial'; authMsg = ''; scrollTo(0, 0); renderAuth(); },
  'land-plan': el => { authView = 'form'; authMode = 'register'; REG.mode = 'plan'; REG.planId = el.dataset.id || ''; authMsg = ''; scrollTo(0, 0); renderAuth(); },
  'land-back': () => { authView = 'landing'; authMsg = ''; scrollTo(0, 0); renderAuth(); },
  'land-go': el => { const t = document.getElementById(el.dataset.to); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'auth-trial': () => { authMode = 'register'; REG.mode = 'trial'; authMsg = ''; renderAuth(); },
  'auth-mode': () => { authMode = authMode === 'login' ? 'register' : 'login'; authMsg = ''; renderAuth(); },
  'auth-reset': async () => {
    const em = ($('#a-email') ? $('#a-email').value : authEmail).trim();
    if (!em) { toast('Isi email dulu, lalu klik Lupa password.', true); return; }
    try { await auth.sendPasswordResetEmail(em); toast('Link ganti password dikirim ke ' + em); } catch (e) { toast(authErr(e), true); }
  },
  'pw-reset': async () => { try { await auth.sendPasswordResetEmail(fbUser.email); toast('Link ganti password dikirim ke ' + fbUser.email); } catch (e) { toast(authErr(e), true); } },
  'pin-reset': async () => {
    const o = Object.assign({}, S.meta.kos || {}); delete o.pinHash;
    if (await run(() => repo.set('meta', 'kos', o))) toast('PIN dihapus');
  },
  settings: () => openSettings(),
  'feat-add': () => { $('#feat-rows').insertAdjacentHTML('beforeend', featRow(null)); const r = $('#feat-rows').lastElementChild.querySelector('[name=fname]'); r.focus(); },
  'feat-del': el => el.closest('.featrow').remove(),
  'demo-clear': () => run(clearDemo).then(ok => { if (ok) { closeModal(); toast('Data contoh dihapus'); } }),
  export: () => doExport(),
  sf: el => { UI.sf = el.dataset.v; render(); },
  staff: el => openStaff(el.dataset.id || ''),
  'staff-del': el => run(() => repo.del('staff', el.dataset.id)).then(ok => { if (ok) { closeModal(); toast('Penjaga dihapus'); } }),
  'staff-stop': el => { const x = S.staff[el.dataset.id]; if (x) run(() => repo.set('staff', el.dataset.id, Object.assign({}, x, { endDate: todayStr() }))).then(ok => ok && toast('Penjaga ditandai berhenti')); },
  'staff-resume': el => { const x = S.staff[el.dataset.id]; if (!x) return; const o = Object.assign({}, x); delete o.endDate; run(() => repo.set('staff', el.dataset.id, o)).then(ok => ok && toast('Penjaga aktif lagi')); },
  'staff-pay': el => openStaffPay(el.dataset.id),
  'staff-unpay': el => { const s0 = S.salary[el.dataset.id]; if (s0 && guardLock(s0.period)) return; run(() => repo.del('salary', el.dataset.id)).then(ok => { if (ok) { closeModal(); toast('Pembayaran gaji dibatalkan'); } }); },
  'staff-export': () => doExportStaff()
};
Object.assign(H, ADMIN_H, EXPORT_H, EXTRA_H, CHAT_H, WA_H, DASH_H, AUTH_H, KW_H, BK_H, REKAP_H);
/* seret dan lepas kamar saat mode Ubah layout (di HP: ketuk dua kamar untuk menukar) */
let LE_DRAG = '';
const leRoom = e => (e.target && e.target.closest) ? e.target.closest('.room[data-le]') : null;
document.addEventListener('dragstart', e => { const r = leRoom(e); if (!r) return; LE_DRAG = r.dataset.id; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', LE_DRAG); } catch (x) {} r.classList.add('dragging'); });
document.addEventListener('dragover', e => { if (!LE_DRAG) return; const r = leRoom(e); if (r && r.dataset.id !== LE_DRAG) { e.preventDefault(); document.querySelectorAll('.room.over').forEach(x => { if (x !== r) x.classList.remove('over'); }); r.classList.add('over'); } });
document.addEventListener('drop', e => { if (!LE_DRAG) return; const r = leRoom(e); if (r && r.dataset.id !== LE_DRAG) { e.preventDefault(); const a = LE_DRAG; LE_DRAG = ''; UI.lePick = ''; swapRooms(a, r.dataset.id); } });
document.addEventListener('dragend', () => { LE_DRAG = ''; document.querySelectorAll('.room.dragging,.room.over').forEach(x => x.classList.remove('dragging', 'over')); });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('.room[data-le]')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || !H[el.dataset.act]) return;
  if (el.dataset.confirm !== undefined && !armed(el)) return;
  if (el.dataset.act === 'room' || el.dataset.act === 'room-edit' || el.dataset.act === 'checkin' || el.dataset.act === 'tenant' || el.dataset.act === 'pay' || el.dataset.act === 'bulk') { /* buka modal baru menggantikan yang lama */ }
  H[el.dataset.act](el, e);
});
document.addEventListener('input', e => {
  if (e.target.id === 'a-email') authEmail = e.target.value;
  if (e.target.dataset && e.target.dataset.reg) { REG[e.target.dataset.reg] = e.target.value; if (e.target.dataset.reg === 'mode') regModeSync(); }
  if (e.target.id === 'aq') { UI.aq = e.target.value; render(); const q = $('#aq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  if (e.target.id === 'q') { UI.q = e.target.value; render(); const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
});
document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.id === 'gate-setup') {
    e.preventDefault();
    const fd = new FormData(f);
    const data = Object.assign({}, S.meta.kos || {}, { name: fd.get('name').trim(), address: fd.get('address').trim(), ownerName: fd.get('ownerName').trim(), ownerPhone: fd.get('ownerPhone').trim(), ownerEmail: fd.get('ownerEmail').trim(), type: KOS_TYPES[fd.get('kosType')] ? fd.get('kosType') : 'kosan', setupDone: true });
    await run(() => repo.set('meta', 'kos', data));
  } else if (f.id === 'auth-form') {
    e.preventDefault();
    const fd = new FormData(f), email = String(fd.get('email') || '').trim(), pw = String(fd.get('password') || '');
    authEmail = email;
    if (String(fd.get('captcha') || '').trim().toUpperCase() !== CAP.code) { toast('Kode captcha salah. Coba lagi.', true); capNew(); capDraw(); const ci = $('#cap-in'); if (ci) { ci.value = ''; ci.focus(); } return; }
    if (authMode === 'register' && pw !== String(fd.get('password2') || '')) { authMsg = 'Password dan ulangi password tidak sama.'; renderAuth(); return; }
    if (authMode === 'register') {
      const trial = !planList(true).length || String(fd.get('regMode') || 'trial') === 'trial';
      const info = { ownerName: String(fd.get('ownerName') || '').trim(), phone: String(fd.get('phone') || '').trim(), kosName: String(fd.get('kosName') || '').trim(), planId: trial ? '' : String(fd.get('planId') || ''), trial };
      if (!info.ownerName || !info.phone || !info.kosName) { authMsg = 'Lengkapi nama pemilik, WhatsApp, dan nama kos.'; renderAuth(); return; }
      if (!trial && !info.planId) { authMsg = 'Pilih paket langganan dulu.'; renderAuth(); return; }
      regInfo = info;
    }
    authBusy = true; authMsg = ''; renderAuth();
    try {
      if (authMode === 'register') await auth.createUserWithEmailAndPassword(email, pw);
      else await auth.signInWithEmailAndPassword(email, pw);
      authBusy = false; authMsg = '';
    } catch (err) { authBusy = false; authMsg = authErr(err); regInfo = null; }
    if (!fbUser) renderAuth();
  } else if (f.id === 'gate-login') {
    e.preventDefault();
    const k = cur.kos;
    if (k.pinHash && canWrite) {
      const input = $('#g-pin'), h = await hashPin(String(input.value).trim());
      if (h !== k.pinHash) { toast('PIN salah. Coba lagi.', true); input.value = ''; input.focus(); return; }
    }
    setAuthed(true);
  }
});
document.addEventListener('change', e => {
  if (e.target.classList && e.target.classList.contains('rm-chk')) {
    const el = e.target, id = el.dataset.room, r0 = S.rooms[id]; if (!r0) return;
    const apply = () => { const feats = Array.from(document.querySelectorAll('.rm-chk:checked')).map(x => x.value); const pe = $('#rm-price'); if (pe) pe.textContent = rp(roomPrice({ base: r0.base, features: feats }, cur.features)); return feats; };
    const feats = apply();
    run(() => repo.set('rooms', id, Object.assign({}, r0, { features: feats }))).then(ok => { if (!ok) { el.checked = !el.checked; apply(); } });
  }
  if (e.target.id === 'up-period') { UI.up = e.target.value; render(); }
  if (e.target.id === 'kp-period') { UI.kp = e.target.value; render(); }
  if (e.target.id === 'rp-period') { UI.rp.period = e.target.value; render(); }
  if (e.target.id === 'rp-room') { UI.rp.room = e.target.value; render(); }
});
const TABS = ['dashboard', 'layout', 'penghuni', 'penjaga', 'tagihan', 'utilitas', 'keuangan', 'kwitansi', 'booking', 'laporan', 'langganan', 'chat'].concat(ADMIN_TABS);
function setTab(t) {
  UI.tab = t; menuOpen(false);
  try { if (location.hash !== '#' + t) location.hash = t; } catch (e) {}
  render(); window.scrollTo(0, 0);
}
function readHash() {
  let h = ''; try { h = location.hash.replace('#', ''); } catch (e) {}
  if (TABS.indexOf(h) >= 0 && h !== UI.tab) { UI.tab = h; if (cur) render(); }
}

/* ---------- mulai ---------- */
(function boot() {
  document.body.classList.add('gated');
  try { const h = location.hash.replace('#', ''); if (TABS.indexOf(h) >= 0) UI.tab = h; } catch (e) {}
  window.addEventListener('hashchange', readHash);
  dl = { save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } };
  if (!FB_READY || !window.firebase) { authReady = true; render(); return; }
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth(); fdb = firebase.firestore();
  startPublic();
  /* auto logout bila tidak ada aktivitas 10 menit (juga berlaku kalau tab ditutup lalu dibuka lagi setelah lewat batas) */
  const IDLE_MS = 10 * 60 * 1000, IDLE_KEY = 'lk_last_active';
  let lastAct = Date.now(), lastSaved = 0, idleMsg = '';
  const IDLE_TXT = 'Sesi berakhir karena tidak ada aktivitas selama 10 menit. Silakan masuk lagi.';
  const readAct = () => { try { return Number(localStorage.getItem(IDLE_KEY)) || 0; } catch (e) { return 0; } };
  const saveAct = force => { const n = Date.now(); if (!force && n - lastSaved < 5000) return; lastSaved = n; try { localStorage.setItem(IDLE_KEY, String(n)); } catch (e) {} };
  const touch = () => { lastAct = Date.now(); saveAct(false); };
  ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel', 'click'].forEach(ev => document.addEventListener(ev, touch, { passive: true, capture: true }));
  let bootStale = (() => { const r = readAct(); return !!r && Date.now() - r >= IDLE_MS; })();
  const idleCheck = () => {
    if (!fbUser) return;
    const last = Math.max(lastAct, readAct());
    if (Date.now() - last < IDLE_MS) return;
    idleMsg = IDLE_TXT; auth.signOut().catch(() => {});
  };
  setInterval(idleCheck, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) idleCheck(); });
  window.addEventListener('storage', e => { if (e.key === IDLE_KEY && e.newValue) lastAct = Math.max(lastAct, Number(e.newValue) || 0); });
  auth.onAuthStateChanged(u => {
    stopData();
    if (u && bootStale) { bootStale = false; idleMsg = IDLE_TXT; auth.signOut().catch(() => {}); return; }
    bootStale = false;
    fbUser = u || null; authReady = true;
    if (u) { sessStart(u); lastAct = Date.now(); saveAct(true); }
    else { authMode = 'login'; authView = (idleMsg || isStandalone()) ? 'form' : 'landing'; authMsg = idleMsg; idleMsg = ''; authBusy = false; UI.tab = 'dashboard'; }
    render();
  });
})();

/* samakan nama kos, nama pemilik, dan nomor WA di akun dan chat dengan data terbaru, supaya admin melihat yang sudah diganti */
let lastKN = '';
function syncKosName(n) {
  const k = (cur && cur.kos) || {};
  n = String(n || '').trim().slice(0, 80);
  const want = { kosName: n, ownerName: String(k.ownerName || '').trim().slice(0, 80), phone: String(k.ownerPhone || '').trim().slice(0, 30) };
  const sig = JSON.stringify(want);
  if (!n || sig === lastKN || !ACC || !fbUser || isAdmin || ACC.status !== 'approved') return;
  const patch = {};
  Object.keys(want).forEach(f => { if (want[f] && ACC[f] !== want[f]) patch[f] = want[f]; });
  const ch = () => { if (CHAT.mine && CHAT.mine.name !== n) fdb.doc('chats/' + fbUser.uid).update({ name: n }).catch(() => {}); };
  lastKN = sig;
  if (!Object.keys(patch).length) { ch(); return; }
  fdb.doc('accounts/' + fbUser.uid).update(patch).then(ch).catch(() => { lastKN = ''; });
}

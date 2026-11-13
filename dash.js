'use strict';
/* ============================================================
   DASHBOARD + kerangka sidebar
   Dimuat sebelum app.js; memakai variabel app.js hanya saat fungsi dipanggil.
   ============================================================ */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const shortRp = n => {
  n = Math.round(Number(n) || 0); const a = Math.abs(n), sg = n < 0 ? '-' : '';
  if (a >= 1e9) return sg + (a / 1e9).toFixed(1).replace('.0', '').replace('.', ',') + ' M';
  if (a >= 1e6) return sg + (a / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' jt';
  if (a >= 1e3) return sg + Math.round(a / 1e3) + ' rb';
  return sg + a;
};
const DI = {
  home: '<path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  door: '<path d="M14 3h5v18h-5"/><path d="M4 21V5l10-2v18Z"/><path d="M11 12h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const dico = k => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + DI[k] + '</svg>';

/* ---------- grafik pemasukan dan pengeluaran: harian, mingguan, bulanan, tahunan, atau rentang tanggal sendiri ---------- */
const DM = { hari: 'Harian', minggu: 'Mingguan', bulan: 'Bulanan', tahun: 'Tahunan', custom: 'Custom' };
const fmtShort = s => parseD(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const monthEnd = ym => ym + '-' + pad(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate());
function chunks7(from, to) {
  const out = []; let a = from;
  while (a <= to) { let b = addDays(a, 6); if (b > to) b = to; out.push({ from: a, to: b, label: a.slice(8) + '–' + b.slice(8), full: fmtShort(a) + ' – ' + fmtShort(b) }); a = addDays(b, 1); }
  return out;
}
function dashRange() {
  const m = UI.dm && DM[UI.dm] ? UI.dm : 'bulan', today = todayStr(), items = [];
  const mon = /^\d{4}-\d{2}$/.test(UI.dmon || '') ? UI.dmon : thisMonth(), yr = Number(UI.dy) || Number(today.slice(0, 4));
  let title = '', from = '', to = '', note = '';
  if (m === 'hari') {
    from = mon + '-01'; to = monthEnd(mon); title = fmtPeriod(mon);
    for (let a = from; a <= to; a = addDays(a, 1)) items.push({ from: a, to: a, label: String(Number(a.slice(8))), full: fmtDate(a) });
  } else if (m === 'minggu') {
    from = mon + '-01'; to = monthEnd(mon); title = fmtPeriod(mon);
    chunks7(from, to).forEach((c, i) => { c.label = 'Mg ' + (i + 1); items.push(c); });
  } else if (m === 'bulan') {
    title = String(yr); from = yr + '-01-01'; to = yr + '-12-31';
    for (let k = 0; k < 12; k++) { const ym = yr + '-' + pad(k + 1); items.push({ from: ym + '-01', to: monthEnd(ym), label: MON[k], full: fmtPeriod(ym) }); }
  } else if (m === 'tahun') {
    const ys = dashYears().slice().reverse(), lo = Math.min(ys[0], Number(today.slice(0, 4)) - 2);
    for (let y = lo; y <= Number(today.slice(0, 4)); y++) items.push({ from: y + '-01-01', to: y + '-12-31', label: String(y), full: String(y) });
    from = items[0].from; to = items[items.length - 1].to; title = lo + ' – ' + today.slice(0, 4);
  } else {
    from = UI.dfrom || mon + '-01'; to = UI.dto || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) from = mon + '-01';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) to = today;
    if (to < from) { const t = from; from = to; to = t; }
    const days = daysBetween(from, to) + 1;
    title = fmtDate(from) + ' – ' + fmtDate(to);
    if (days <= 31) { note = 'per hari'; for (let a = from; a <= to; a = addDays(a, 1)) items.push({ from: a, to: a, label: String(Number(a.slice(8))), full: fmtDate(a) }); }
    else if (days <= 120) { note = 'per minggu'; chunks7(from, to).forEach(c => { c.label = c.label.split('–')[0] + '/' + c.from.slice(5, 7); items.push(c); }); }
    else {
      note = 'per bulan'; let y = Number(from.slice(0, 4)), k = Number(from.slice(5, 7)) - 1;
      while (y + '-' + pad(k + 1) <= to.slice(0, 7) && items.length < 60) {
        const ym = y + '-' + pad(k + 1);
        items.push({ from: ym + '-01' < from ? from : ym + '-01', to: monthEnd(ym) > to ? to : monthEnd(ym), label: MON[k] + (items.length && k !== 0 ? '' : " '" + String(y).slice(2)), full: fmtPeriod(ym) });
        k++; if (k > 11) { k = 0; y++; }
      }
    }
  }
  const tx = finTx();
  items.forEach(it => { it.inn = 0; it.out = 0; });
  tx.forEach(x => { if (x.date < from || x.date > to) return; const it = items.find(b => x.date >= b.from && x.date <= b.to); if (!it) return; if (x.type === 'in') it.inn += x.amount; else it.out += x.amount; });
  return { m, items, title, note, inn: items.reduce((n, b) => n + b.inn, 0), out: items.reduce((n, b) => n + b.out, 0), mon, yr, from, to };
}
function niceMax(v) {
  if (v <= 0) return 1000000;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
function chartSvg(R) {
  const items = R.items, N = Math.max(1, items.length);
  /* lebar gambar mengikuti lebar kotak supaya tulisan tetap berukuran normal di layar lebar maupun HP */
  const mw = (document.getElementById('main') || {}).clientWidth || 640, W = Math.max(300, Math.min(1400, Math.round(mw - (window.innerWidth >= 1400 ? 26 * 16 + 17 : 0) - 44))), Hh = 260, L = 46, T = 14, B = 28, Rm = 8, ph = Hh - T - B, pw = W - L - Rm;
  const mx = niceMax(Math.max.apply(null, [0].concat(items.map(b => Math.max(b.inn, b.out))))), step = pw / N, bw = Math.max(2, Math.min(14, step / 2.6));
  const every = N <= 14 ? 1 : Math.ceil(N / 12);
  let s = '<svg class="ch" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Grafik pemasukan dan pengeluaran">';
  for (let i = 0; i <= 4; i++) {
    const y = T + ph - ph * i / 4;
    s += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + y + '" y2="' + y + '" class="gl"/><text x="' + (L - 6) + '" y="' + (y + 3) + '" text-anchor="end" class="gt">' + shortRp(mx * i / 4) + '</text>';
  }
  items.forEach((b, m) => {
    const cx = L + step * m + step / 2, hi = ph * b.inn / mx, ho = ph * b.out / mx;
    s += '<g><title>' + esc(b.full) + ': masuk ' + rp(b.inn) + ', keluar ' + rp(b.out) + '</title>' +
      '<rect x="' + (cx - bw - 1) + '" y="' + (T + ph - hi) + '" width="' + bw + '" height="' + Math.max(hi, b.inn ? 2 : 0) + '" rx="' + Math.min(3, bw / 2) + '" class="b-in"/>' +
      '<rect x="' + (cx + 1) + '" y="' + (T + ph - ho) + '" width="' + bw + '" height="' + Math.max(ho, b.out ? 2 : 0) + '" rx="' + Math.min(3, bw / 2) + '" class="b-out"/>' +
      (m % every === 0 ? '<text x="' + cx + '" y="' + (Hh - 9) + '" text-anchor="middle" class="gt">' + esc(b.label) + '</text>' : '') + '</g>';
  });
  return s + '</svg>';
}
const PIE_C = ['#2DB38F', '#4C8DF6', '#F0A23C', '#E5566B', '#8B6FD6', '#2BB0C8', '#9AA3A8'];
function pieSvg(rows, total) {
  const R = 90, C = 100;
  let s = '<svg class="pie" viewBox="0 0 200 200" role="img" aria-label="Grafik lingkaran">';
  if (rows.length === 1) s += '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="' + PIE_C[0] + '"><title>' + esc(rows[0].cat) + ': ' + rp(rows[0].amount) + ' (100%)</title></circle>';
  else {
    let a0 = -Math.PI / 2;
    rows.forEach((r, i) => {
      const a1 = a0 + Math.PI * 2 * r.amount / total, big = a1 - a0 > Math.PI ? 1 : 0;
      const x0 = C + R * Math.cos(a0), y0 = C + R * Math.sin(a0), x1 = C + R * Math.cos(a1), y1 = C + R * Math.sin(a1);
      s += '<path d="M' + C + ' ' + C + 'L' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + 'Z" fill="' + PIE_C[Math.min(i, PIE_C.length - 1)] + '" class="pie-s"><title>' + esc(r.cat) + ': ' + rp(r.amount) + ' (' + Math.round(r.amount / total * 100) + '%)</title></path>';
      a0 = a1;
    });
  }
  return s + '</svg>';
}
function piePanel() {
  const R = dashRange(), type = UI.pt === 'out' ? 'out' : 'in', by = {};
  finTx().forEach(x => { if (x.type === type && x.date >= R.from && x.date <= R.to) by[x.cat] = (by[x.cat] || 0) + x.amount; });
  let rows = Object.keys(by).map(k => ({ cat: k, amount: by[k] })).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);
  if (rows.length > PIE_C.length) { const rest = rows.slice(PIE_C.length - 1).reduce((n, r) => n + r.amount, 0); rows = rows.slice(0, PIE_C.length - 1).concat([{ cat: 'Lainnya', amount: rest }]); }
  const total = rows.reduce((n, r) => n + r.amount, 0);
  const seg = '<div class="seg" role="group" aria-label="Jenis grafik lingkaran"><button type="button" data-act="pt" data-v="in" aria-pressed="' + (type === 'in') + '">Pemasukan</button><button type="button" data-act="pt" data-v="out" aria-pressed="' + (type === 'out') + '">Pengeluaran</button></div>';
  let body;
  if (!total) body = '<p class="muted dempty">Belum ada ' + (type === 'in' ? 'pemasukan' : 'pengeluaran') + ' pada periode ini.</p>';
  else body = '<div class="pie-wrap">' + pieSvg(rows, total) + '<ul class="pie-leg">' + rows.map((r, i) => '<li><i style="background:' + PIE_C[Math.min(i, PIE_C.length - 1)] + '"></i><span>' + esc(r.cat) + '</span><b>' + Math.round(r.amount / total * 100) + '%</b><em>' + rp(r.amount) + '</em></li>').join('') + '<li class="pie-tot"><i></i><span>Total</span><b></b><em>' + rp(total) + '</em></li></ul></div>';
  return '<section class="dpanel"><div class="dp-h"><h3>Komposisi ' + (type === 'in' ? 'pemasukan' : 'pengeluaran') + ' <small class="muted">· ' + esc(R.title) + '</small></h3>' + seg + '</div>' + body + '</section>';
}
function dashYears() {
  const ys = new Set([Number(todayStr().slice(0, 4))]);
  finTx().forEach(x => ys.add(Number(x.date.slice(0, 4))));
  return Array.from(ys).sort((a, b) => b - a);
}
function chartPanel() {
  const R = dashRange(), seg = Object.keys(DM).map(k => '<button type="button" data-act="dm" data-v="' + k + '" aria-pressed="' + (R.m === k) + '">' + DM[k] + '</button>').join('');
  let ctl = '';
  if (R.m === 'hari' || R.m === 'minggu') ctl = '<label class="fld inl"><span class="sr">Bulan</span><select id="dmon">' + monthOpts(R.mon, false, [R.mon]) + '</select></label>';
  else if (R.m === 'bulan') ctl = '<label class="fld inl"><span class="sr">Tahun</span><select id="dy-year">' + dashYears().map(y => '<option' + (String(y) === String(R.yr) ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></label>';
  else if (R.m === 'custom') ctl = '<label class="fld inl"><span>Dari</span><input type="date" id="dfrom" value="' + esc(R.from) + '" max="' + esc(todayStr()) + '"></label><label class="fld inl"><span>Sampai</span><input type="date" id="dto" value="' + esc(R.to) + '"></label>';
  return '<section class="dpanel"><div class="dp-h"><h3>Pemasukan dan pengeluaran <small class="muted">· ' + esc(R.title) + (R.note ? ' (' + R.note + ')' : '') + '</small></h3></div>' +
    '<div class="dctl"><div class="seg" role="group" aria-label="Periode grafik">' + seg + '</div>' + ctl + '</div>' +
    '<div class="leg"><span><i class="b-in"></i>Pemasukan ' + rp(R.inn) + '</span><span><i class="b-out"></i>Pengeluaran ' + rp(R.out) + '</span><span>Selisih ' + rp(R.inn - R.out) + '</span></div>' + chartSvg(R) + '</section>';
}
function viewDashboard() {
  const D = cur, p = thisMonth(), st = D.stats;
  const tx = finTx().filter(x => x.date.slice(0, 7) === p);
  const inc = tx.filter(x => x.type === 'in').reduce((n, x) => n + x.amount, 0), out = tx.filter(x => x.type === 'out').reduce((n, x) => n + x.amount, 0);
  const lateB = D.bills.filter(b => b.st.k === 'late'), late = lateB.reduce((n, b) => n + b.amount, 0);
  const soonB = D.bills.filter(b => b.st.k === 'soon' && b.st.d <= 7);
  const potential = D.rooms.reduce((n, r) => n + (r.tenant ? Number(r.tenant.rent) || 0 : 0), 0);
  const tenants = Object.keys(S.tenants).filter(k => !S.tenants[k].moveOut).length;
  const pct = st.total ? Math.round(st.occ / st.total * 100) : 0;
  const owner = (D.kos.ownerName || '').trim().split(/\s+/)[0];
  const card = (cls, ico, lab, val, sub, tab) => '<button class="gc ' + cls + '" data-act="tab" data-tab="' + tab + '"><span class="gi">' + dico(ico) + '</span><span class="gl2">' + lab + '</span><b>' + val + '</b><small>' + sub + '</small></button>';
  let h = '<div class="dh"><div><h2>Halo' + (owner ? ', ' + esc(owner) : '') + '</h2><p class="muted">Ringkasan ' + esc(D.kos.name || 'kos kamu') + ' · ' + esc(fmtPeriod(p)) + '</p></div></div>';
  h += '<div class="gcards">' +
    card('g1', 'door', 'Unit terisi', st.occ + ' <i>/ ' + st.total + '</i>', pct + '% hunian · ' + st.vacant + ' kosong', 'layout') +
    card('g2', 'users', 'Penghuni aktif', tenants, soonB.length + ' tagihan jatuh tempo ≤ 7 hari', 'penghuni') +
    card('g3', 'down', 'Pemasukan bulan ini', rp(inc), 'Potensi sewa ' + rp(potential), 'keuangan') +
    card('g4', 'alert', 'Tunggakan sewa', rp(late), lateB.length + ' tagihan telat', 'tagihan') + '</div>';
  const chartHtml = chartPanel();
  const net = inc - out;
  const exp = expiringContracts();
  const tile = (cls, ico, lab, val, tab) => '<button class="tl ' + cls + '" data-act="tab" data-tab="' + tab + '"><span class="ti2">' + dico(ico) + '</span><span><small>' + lab + '</small><b>' + val + '</b></span></button>';
  const tilesHtml = '<div class="tiles">' + tile('t1', 'up', 'Pengeluaran bulan ini', rp(out), 'keuangan') + tile('t2', 'wallet', 'Laba bersih bulan ini', rp(net), 'keuangan') + tile('t3', 'clock', 'Jatuh tempo ≤ 7 hari', soonB.length + ' tagihan', 'tagihan') + tile('t4', 'door', 'Unit kosong', st.vacant + ' unit', 'layout') + '</div>';
  /* perlu perhatian */
  const items = [];
  lateB.slice().sort((a, b) => a.due < b.due ? -1 : 1).slice(0, 5).forEach(b => items.push('<li><span class="dot bad"></span><span><b>' + esc((S.tenants[b.tenantId] || {}).name || '-') + '</b> · ' + esc(unitNameId(b.roomId)) + '<small>Telat ' + b.st.d + ' hari · ' + esc(fmtPeriod(b.period)) + '</small></span><em>' + rp(b.amount) + '</em></li>'));
  soonB.slice(0, 4).forEach(b => items.push('<li><span class="dot warn"></span><span><b>' + esc((S.tenants[b.tenantId] || {}).name || '-') + '</b> · ' + esc(unitNameId(b.roomId)) + '<small>Jatuh tempo ' + fmtDate(b.due) + '</small></span><em>' + rp(b.amount) + '</em></li>'));
  exp.slice(0, 4).forEach(x => items.push('<li><span class="dot ' + (x.c.k === 'late' ? 'bad' : 'warn') + '"></span><span><b>' + esc(x.t.name) + '</b> · ' + esc(unitNameId(x.t.roomId)) + '<small>' + esc(contractText(x.c)) + '</small></span><em></em></li>'));
  const recent = finTx().slice(0, 6);
  const sideHtml = '<section class="dpanel"><div class="dp-h"><h3>Perlu perhatian</h3><button class="btn sm" data-act="tab" data-tab="tagihan">Semua tagihan</button></div>' +
    (items.length ? '<ul class="dlist">' + items.join('') + '</ul>' : '<p class="muted dempty">Semua beres. Tidak ada tagihan telat atau kontrak yang mau habis.</p>') + '</section>' +
    '<section class="dpanel"><div class="dp-h"><h3>Transaksi terbaru</h3><button class="btn sm" data-act="tab" data-tab="keuangan">Keuangan</button></div>' +
    (recent.length ? '<ul class="dlist">' + recent.map(x => '<li><span class="dot ' + (x.type === 'in' ? 'ok' : 'warn') + '"></span><span><b>' + esc(x.cat) + '</b>' + (x.note ? ' · ' + esc(x.note) : '') + '<small>' + fmtDate(x.date) + ' · ' + esc(x.unit) + '</small></span><em class="' + (x.type === 'in' ? 'pos' : 'neg') + '">' + (x.type === 'in' ? '+' : '-') + rp(x.amount) + '</em></li>').join('') + '</ul>' : '<p class="muted dempty">Belum ada transaksi. Catat pembayaran sewa untuk mulai.</p>') + '</section>';
  const k = D.kos;
  const infoHtml = '<section class="dpanel"><div class="dp-h"><h3>Info kos</h3><button class="btn sm" data-act="settings" data-w>Pengaturan</button></div><dl class="kv dinfo"><div><dt>Nama</dt><dd>' + esc(k.name || '-') + '</dd></div><div><dt>Alamat</dt><dd>' + esc(k.address || '-') + '</dd></div><div><dt>Pemilik</dt><dd>' + esc(k.ownerName || '-') + (k.ownerPhone ? ' · ' + esc(k.ownerPhone) : '') + '</dd></div><div><dt>Tarif listrik</dt><dd>' + (k.elecRate ? rp(k.elecRate) + ' / kWh' : '-') + '</dd></div><div><dt>Tarif air</dt><dd>' + (k.waterRate ? rp(k.waterRate) + ' / m³' : '-') + '</dd></div></dl></section>';
  h += '<div class="dlayout"><div class="dmain">' + chartHtml + piePanel() + tilesHtml + '</div><div class="dside">' + sideHtml + infoHtml + '</div></div>';
  return h;
}

/* ---------- kerangka: menu geser (HP), cari, avatar ---------- */
function menuOpen(on) { document.body.classList.toggle('menu-on', !!on); }
function userMenu(open) {
  const m = document.getElementById('umenu'), b = document.getElementById('me'); if (!m || !b) return;
  m.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
const DASH_H = {
  pt: el => { UI.pt = el.dataset.v; render(); },
  dm: el => { UI.dm = el.dataset.v; render(); },
  'menu-open': () => { userMenu(false); menuOpen(true); },
  'menu-close': () => menuOpen(false),
  'user-menu': () => { const m = document.getElementById('umenu'); userMenu(!!m && m.hidden); },
  'me-photo': () => { const f = document.getElementById('me-file'); if (f) f.click(); },
  'me-photo-del': () => { userMenu(false); saveMyPhoto(null); },
  logout: () => { userMenu(false); if (auth) auth.signOut(); }
};
document.addEventListener('click', e => { if (!(e.target.closest && e.target.closest('.umw'))) userMenu(false); });
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'dy-year') { UI.dy = e.target.value; render(); }
  else if (id === 'dmon') { UI.dmon = e.target.value; render(); }
  else if (id === 'dfrom' || id === 'dto') { UI[id] = e.target.value; render(); }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'gsearch' && e.key === 'Enter') { UI.q = e.target.value; UI.tf = 'aktif'; setTab('penghuni'); }
  if (e.key === 'Escape') { menuOpen(false); userMenu(false); }
});
function syncMe() {
  const el = document.getElementById('me'); if (!el) return;
  const n = (typeof isAdmin !== 'undefined' && isAdmin) ? 'A' : ((cur && cur.kos.ownerName) || (cur && cur.kos.name) || 'U');
  const ph = safePhoto((typeof isAdmin !== 'undefined' && isAdmin) ? ADMIN_PHOTO : (ACC && ACC.photo));
  if (ph) { if (el.dataset.ph !== ph) { el.innerHTML = '<img src="' + ph + '" alt="">'; el.dataset.ph = ph; } el.classList.add('has-img'); }
  else { el.textContent = String(n).trim().charAt(0).toUpperCase() || 'U'; el.dataset.ph = ''; el.classList.remove('has-img'); }
  const rm = document.getElementById('um-rmph'); if (rm) rm.hidden = !ph;
  const nm = document.getElementById('um-name'), ml = document.getElementById('um-mail');
  if (nm) nm.textContent = (typeof isAdmin !== 'undefined' && isAdmin) ? 'Admin' : ((cur && (cur.kos.ownerName || cur.kos.name)) || 'Akun saya');
  if (ml) ml.textContent = (typeof fbUser !== 'undefined' && fbUser && fbUser.email) || '';
}

async function saveMyPhoto(img) {
  if (!fbUser) return;
  try {
    const ref = (typeof isAdmin !== 'undefined' && isAdmin) ? fdb.doc('admins/' + fbUser.uid) : fdb.doc('accounts/' + fbUser.uid);
    if (img === null) await ref.update({ photo: firebase.firestore.FieldValue.delete() }); else await ref.update({ photo: img });
    if (!(typeof isAdmin !== 'undefined' && isAdmin) && ACC) ACC.photo = img || '';
    if (typeof isAdmin !== 'undefined' && isAdmin) ADMIN_PHOTO = img || '';
    syncMe(); toast(img ? 'Foto profil disimpan' : 'Foto profil dihapus');
  } catch (e) { toast('Gagal menyimpan foto. Pastikan aturan Firestore terbaru sudah dipublish.'); }
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'me-file') return;
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  userMenu(false);
  try { let img = await resizePhoto(f, 200, 0.8); if (img.length > 45000) img = await resizePhoto(f, 140, 0.7); await saveMyPhoto(img); }
  catch (er) { toast('Foto tidak bisa dibaca'); }
});

/* kolom rupiah: titik ribuan saat mengetik */
document.addEventListener('input', e => {
  const t = e.target; if (!t || !t.matches || !t.matches('input[data-money]')) return;
  const d = t.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  t.value = d ? Number(d).toLocaleString('id-ID') : '';
  const h = t.nextElementSibling; if (h && h.type === 'hidden') h.value = d;
});

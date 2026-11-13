'use strict';
/* ============================================================
   FITUR TAMBAHAN
   Kontrak sewa, deposit, listrik dan air, keuangan (pengeluaran dan laba),
   ringkasan layout, kunci bulan, dan kwitansi PDF.
   Dimuat sebelum app.js; memakai variabel app.js hanya saat fungsi dipanggil.
   ============================================================ */

/* ---------- umum ---------- */
const addMonths = (s, n) => {
  const d = parseD(s), day = d.getDate(), t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return ymd(t);
};
const thisMonth = () => todayStr().slice(0, 7);
const lockMonth = () => (S.meta.kos || {}).lockBefore || '';
const isLocked = p => !!lockMonth() && String(p || '').slice(0, 7) <= lockMonth();
function guardLock(p) {
  if (!isLocked(p)) return false;
  toast('Bulan ' + fmtPeriod(String(p).slice(0, 7)) + ' sudah dikunci. Buka kunci di Pengaturan kalau perlu mengubahnya.', true);
  return true;
}
const lockNote = () => lockMonth() ? '<p class="muted" style="margin:0 0 .8rem;font-size:.85rem">Catatan sampai ' + esc(fmtPeriod(lockMonth())) + ' dikunci dan tidak bisa diubah. Atur di Pengaturan.</p>' : '';
const nz = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
const monthOpts = (sel, withAll, extra) => {
  const set = new Set([thisMonth()].concat(extra || []));
  for (let i = 1; i < 12; i++) set.add(addMonths(thisMonth() + '-01', -i).slice(0, 7));
  const list = Array.from(set).sort().reverse();
  return (withAll ? '<option value="all"' + (sel === 'all' ? ' selected' : '') + '>Semua bulan</option>' : '') + list.map(p => '<option value="' + p + '"' + (sel === p ? ' selected' : '') + '>' + esc(fmtPeriod(p)) + '</option>').join('');
};

/* ---------- terbilang (angka jadi kata) ---------- */
function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const f = x => {
    if (x < 12) return s[x];
    if (x < 20) return f(x - 10) + ' belas';
    if (x < 100) return f(Math.floor(x / 10)) + ' puluh' + (x % 10 ? ' ' + f(x % 10) : '');
    if (x < 200) return 'seratus' + (x - 100 ? ' ' + f(x - 100) : '');
    if (x < 1000) return f(Math.floor(x / 100)) + ' ratus' + (x % 100 ? ' ' + f(x % 100) : '');
    if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + f(x - 1000) : '');
    if (x < 1e6) return f(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + f(x % 1000) : '');
    if (x < 1e9) return f(Math.floor(x / 1e6)) + ' juta' + (x % 1e6 ? ' ' + f(x % 1e6) : '');
    if (x < 1e12) return f(Math.floor(x / 1e9)) + ' miliar' + (x % 1e9 ? ' ' + f(x % 1e9) : '');
    return String(x);
  };
  return n === 0 ? 'nol' : f(n);
}

/* ============================================================
   KONTRAK SEWA
   ============================================================ */
function contractInfo(t) {
  if (!t || !t.contractEnd || t.moveOut) return null;
  const d = daysBetween(todayStr(), t.contractEnd);
  return { end: t.contractEnd, d, k: d < 0 ? 'late' : d <= 30 ? 'soon' : 'ok' };
}
function contractText(c) {
  return c.d < 0 ? 'Kontrak lewat ' + (-c.d) + ' hari' : c.d === 0 ? 'Kontrak habis hari ini' : 'Kontrak habis ' + c.d + ' hari lagi';
}
function expiringContracts() {
  return Object.keys(S.tenants).map(id => { const t = Object.assign({ id }, S.tenants[id]); return { t, c: contractInfo(t) }; })
    .filter(x => x.c && x.c.k !== 'ok').sort((a, b) => a.c.d - b.c.d);
}
function contractBanner() {
  const l = expiringContracts(); if (!l.length) return '';
  return '<div class="banner">Kontrak perlu diperhatikan: ' + l.map(x => esc(x.t.name) + ' (' + esc(unitNameId(x.t.roomId)) + ', ' + esc(contractText(x.c).toLowerCase()) + ')').join(', ') + '. Buka tab Penghuni untuk perpanjang.</div>';
}
function openExtend(id) {
  const t = S.tenants[id]; if (!t) return;
  const base = (t.contractEnd && t.contractEnd > todayStr()) ? t.contractEnd : (t.contractEnd || todayStr());
  const b = '<form class="sb" style="padding:0"><dl class="kv"><div><dt>Penghuni</dt><dd>' + esc(t.name) + '</dd></div><div><dt>' + esc(unitNameId(t.roomId)) + '</dt><dd>Kontrak ' + (t.contractEnd ? 'sampai ' + fmtDate(t.contractEnd) : 'belum diatur') + '</dd></div></dl><div class="formgrid">' +
    fld('Perpanjang (bulan)', '<select name="n" id="ex-n">' + [1, 3, 6, 12, 24].map(n => '<option value="' + n + '"' + (n === 12 ? ' selected' : '') + '>' + n + ' bulan</option>').join('') + '</select>') +
    fld('Harga sewa per bulan (Rp)', numIn('rent', t.rent, 'required step="1000"'), 'Ubah kalau ada kenaikan. Tagihan perpanjangan = harga × jumlah bulan, jatuh tempo di tanggal mulai perpanjangan.') +
    '<div class="full duebox" id="ex-box" aria-live="polite"></div></div><div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan perpanjangan</button></div></form>';
  const m = openModal('Perpanjang kontrak', b);
  const upd = () => { const n = Number($('#ex-n').value) || 1; $('#ex-box').innerHTML = '<b>Kontrak baru sampai ' + fmtDate(addMonths(base, n)) + '</b><span>Dihitung dari ' + (t.contractEnd ? 'akhir kontrak sekarang' : 'hari ini') + '.</span>'; };
  $('#ex-n').addEventListener('change', upd); upd();
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const n = Number(f.get('n')) || 1, rent = Number(f.get('rent')) || 0;
    if (rent <= 0) { toast('Harga sewa harus lebih dari 0.', true); return false; }
    const start = base > todayStr() ? base : todayStr();
    const ext = Number(t.contractMonths) > 0 ? { extensions: (Array.isArray(t.extensions) ? t.extensions : []).concat([{ start, months: n, rent }]), firstRent: t.firstRent || t.rent } : {};
    await repo.set('tenants', id, Object.assign({}, t, ext, { contractEnd: addMonths(base, n), contractMonths: (Number(t.contractMonths) || 0) + n, rent }));
    toast('Kontrak diperpanjang sampai ' + fmtDate(addMonths(base, n)));
  });
}
function contractWa(id) {
  const t = S.tenants[id]; if (!t || !t.phone) return '';
  return waLink(t.phone, 'Halo ' + t.name + ', kontrak sewa ' + unitNameId(t.roomId) + ' akan berakhir pada ' + fmtDate(t.contractEnd) + '. Apakah ingin diperpanjang? Terima kasih.');
}

/* ============================================================
   DEPOSIT
   ============================================================ */
const depositOf = t => Number(t && t.deposit) || 0;
function depositStatus(t) {
  const dep = depositOf(t); if (!dep) return null;
  if (t.depositSettledAt) return { settled: true, back: Number(t.depositReturned) || 0, cut: Number(t.depositDeduct) || 0 };
  return { settled: false };
}
function depositBlock(t, dateValue) {
  const dep = depositOf(t);
  return '<div class="fsec">Deposit</div><div class="full duebox"><b>Deposit ' + rp(dep) + '</b><span>Isi jumlah yang dikembalikan. Sisanya dianggap potongan (misal kerusakan atau tunggakan) dan tercatat sebagai pemasukan.</span></div>' +
    fld('Dikembalikan (Rp)', numIn('back', dep, 'required step="1000" id="dp-back" max="' + dep + '"')) +
    fld('Potongan (Rp)', '<input id="dp-cut" readonly value="0">') +
    fld('Alasan potongan', '<input name="cutNote" maxlength="160" placeholder="Misal: cat dinding, tunggakan listrik" value="' + esc(t.depositNote || '') + '">', '', 'full');
}
function wireDeposit(t) {
  const upd = () => { const back = Math.min(depositOf(t), Math.max(0, Number($('#dp-back').value) || 0)); $('#dp-cut').value = rp(depositOf(t) - back); };
  $('#dp-back').addEventListener('input', upd); upd();
}
function depositPatch(t, f, date) {
  const dep = depositOf(t), back = Math.min(dep, Math.max(0, Number(f.get('back')) || 0));
  return { depositReturned: back, depositDeduct: dep - back, depositNote: String(f.get('cutNote') || '').trim(), depositSettledAt: date };
}
function openCheckout(id) {
  const t = S.tenants[id]; if (!t) return;
  const unpaid = cur.bills.filter(b => b.tenantId === id && !b.paid).length, dep = depositOf(t);
  const b = '<form class="sb" style="padding:0"><p>' + esc(t.name) + ' · ' + esc(unitNameId(t.roomId)) + '</p>' + (unpaid ? '<div class="banner" style="margin:0">Masih ada ' + unpaid + ' tagihan belum lunas.</div>' : '') +
    '<div class="formgrid">' + fld('Tanggal keluar', '<input name="out" type="date" required value="' + todayStr() + '">', '', 'full') + (dep ? depositBlock(t) : '') + '</div>' +
    '<div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Check-out</button></div></form>';
  const m = openModal('Check-out penghuni', b);
  if (dep) wireDeposit(t);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const out = f.get('out');
    let data = Object.assign({}, t, { moveOut: out });
    if (dep) { const p = depositPatch(t, f, out); if (p.depositDeduct > 0 && guardLock(out)) return false; data = Object.assign(data, p); }
    await repo.set('tenants', id, data);
    toast('Unit sekarang kosong');
  });
}
function openDeposit(id) {
  const t = S.tenants[id]; if (!t || !depositOf(t)) return;
  const b = '<form class="sb" style="padding:0"><p>' + esc(t.name) + ' · ' + esc(unitNameId(t.roomId)) + '</p><div class="formgrid">' + fld('Tanggal selesai', '<input name="date" type="date" required value="' + todayStr() + '">', '', 'full') + depositBlock(t) + '</div><div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal('Selesaikan deposit', b); wireDeposit(t);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const date = f.get('date'), p = depositPatch(t, f, date);
    if (p.depositDeduct > 0 && guardLock(date)) return false;
    await repo.set('tenants', id, Object.assign({}, t, p));
    toast('Deposit diselesaikan');
  });
}
/* potongan deposit dihitung sebagai pemasukan pada tanggal selesai */

/* ============================================================
   LISTRIK DAN AIR
   ============================================================ */
const utilId = (rid, p) => rid + '_' + p;
const utilPrev = (rid, p) => S.utils[utilId(rid, addMonths(p + '-01', -1).slice(0, 7))] || null;
function utilCalc(o) {
  const use = (a, b) => (nz(a) != null && nz(b) != null) ? Math.max(0, Number(b) - Number(a)) : 0;
  const ek = use(o.elecPrev, o.elecNow), wk = use(o.waterPrev, o.waterNow);
  const e = Math.round(ek * (Number(o.elecRate) || 0)), w = Math.round(wk * (Number(o.waterRate) || 0)), x = Math.round(Number(o.extra) || 0);
  return { ek, wk, e, w, x, total: e + w + x };
}
function utilRows(p) {
  const D = cur, map = {};
  Object.keys(S.tenants).forEach(id => {
    const t = S.tenants[id]; if (!t.moveIn || t.moveIn.slice(0, 7) > p || (t.moveOut && t.moveOut.slice(0, 7) < p)) return;
    const c = map[t.roomId]; if (!c || t.moveIn > c.moveIn) map[t.roomId] = Object.assign({ id }, t);
  });
  const ids = new Set(Object.keys(map));
  Object.keys(S.utils).forEach(k => { const u = S.utils[k]; if (u && u.period === p) ids.add(u.roomId); });
  const rows = [];
  ids.forEach(rid => {
    const r = D.roomsById[rid]; if (!r) return;
    const u = S.utils[utilId(rid, p)] || null;
    const t = map[rid] || (u && S.tenants[u.tenantId] ? Object.assign({ id: u.tenantId }, S.tenants[u.tenantId]) : null);
    rows.push({ r, t, u, id: utilId(rid, p) });
  });
  return rows.sort((a, b) => natCmp(a.r.number, b.r.number));
}
function viewUtil() {
  const p = UI.up || thisMonth(), kos = cur.kos, rows = utilRows(p);
  const tot = rows.reduce((n, x) => n + (x.u ? Number(x.u.total) || 0 : 0), 0), got = rows.reduce((n, x) => n + (x.u && x.u.paidAt ? Number(x.u.total) || 0 : 0), 0);
  const noRate = !(Number(kos.elecRate) > 0) && !(Number(kos.waterRate) > 0);
  let h = '<div class="toolbar"><label class="fld"><span>Bulan</span><select id="up-period">' + monthOpts(p) + '</select></label>' + (rows.length ? exBtns('utilitas') : '') + '</div>' + lockNote();
  if (noRate) h += '<div class="banner" data-w>Tarif listrik dan air belum diisi. Buka Pengaturan untuk mengisi tarif per kWh dan per m³ (bisa juga diisi per catatan).</div>';
  h += '<div class="stats3"><div class="stat"><span>Tagihan listrik dan air ' + esc(fmtPeriod(p)) + '</span><b>' + rp(tot) + '</b><small>' + rows.filter(x => x.u).length + ' dari ' + rows.length + ' unit sudah dicatat</small></div><div class="stat s-ok"><span>Sudah dibayar</span><b>' + rp(got) + '</b></div><div class="stat s-warn"><span>Belum dibayar</span><b>' + rp(tot - got) + '</b></div></div>';
  if (!rows.length) return h + '<div class="empty"><h2>Belum ada unit terisi</h2><p>Catat meteran untuk unit yang ada penghuninya. Tambahkan penghuni dulu di tab Penghuni.</p></div>';
  h += '<div class="tablewrap"><table><thead><tr><th>Unit</th><th>Penghuni</th><th class="n">Listrik (kWh)</th><th class="n">Air (m³)</th><th class="n">Biaya lain</th><th class="n">Total</th><th>Status</th><th></th></tr></thead><tbody>';
  rows.forEach(x => {
    const u = x.u, c = u ? utilCalc(u) : null;
    const st = !u ? pill('later', 'Belum dicatat') : u.paidAt ? pill('paid', 'Lunas ' + fmtDate(u.paidAt)) : pill('soon', 'Belum dibayar');
    const msg = u && x.t ? 'Halo ' + x.t.name + ', tagihan listrik dan air ' + unitNameId(x.r.id) + ' periode ' + fmtPeriod(p) + ': ' + (c.ek ? 'listrik ' + c.ek + ' kWh ' + rp(c.e) + '; ' : '') + (c.wk ? 'air ' + c.wk + ' m3 ' + rp(c.w) + '; ' : '') + (c.x ? 'biaya lain ' + rp(c.x) + '; ' : '') + 'total ' + rp(u.total) + '. Terima kasih.' : '';
    const wa = (u && !u.paidAt && x.t && x.t.phone) ? waLink(x.t.phone, msg) : '';
    h += '<tr><td class="mono">' + esc(unitName(x.r)) + '</td><td>' + esc(x.t ? x.t.name : '-') + '</td><td class="n mono">' + (u ? c.ek : '-') + '</td><td class="n mono">' + (u ? c.wk : '-') + '</td><td class="n mono">' + (u && c.x ? rp(c.x) : '-') + '</td><td class="n mono">' + (u ? rp(u.total) : '-') + '</td><td>' + st + '</td><td><span class="row" style="justify-content:flex-end">' +
      '<button class="btn sm' + (u ? '' : ' primary') + '" data-act="util-edit" data-room="' + esc(x.r.id) + '" data-w>' + (u ? 'Ubah' : 'Catat meteran') + '</button>' +
      (u && !u.paidAt ? (wa ? '<a class="btn sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Ingatkan WA</a>' : '') + '<button class="btn sm primary" data-act="util-pay" data-id="' + esc(x.id) + '" data-w>Catat bayar</button>' : '') +
      (u && u.paidAt ? '<button class="btn sm" data-act="receipt" data-kind="util" data-id="' + esc(x.id) + '">Kwitansi</button><button class="btn sm danger" data-act="util-unpay" data-confirm="Klik lagi untuk batalkan" data-id="' + esc(x.id) + '" data-w>Batalkan</button>' : '') + '</span></td></tr>';
  });
  return h + '</tbody></table></div>';
}
function openUtil(rid, p) {
  const r = cur.roomsById[rid]; if (!r) return;
  p = p || UI.up || thisMonth();
  if (guardLock(p)) return;
  const id = utilId(rid, p), u = S.utils[id] || null, pv = utilPrev(rid, p), kos = cur.kos;
  const v = (a, b, c) => a != null ? a : (b != null ? b : (c != null ? c : ''));
  const o = {
    elecPrev: v(u && u.elecPrev, pv && pv.elecNow), elecNow: v(u && u.elecNow), elecRate: v(u && u.elecRate, kos.elecRate),
    waterPrev: v(u && u.waterPrev, pv && pv.waterNow), waterNow: v(u && u.waterNow), waterRate: v(u && u.waterRate, kos.waterRate),
    extra: v(u && u.extra), extraNote: u && u.extraNote || ''
  };
  const num = (n, val, ex) => '<input name="' + n + '" type="number" inputmode="decimal" min="0" step="any" value="' + esc(val) + '" ' + (ex || '') + '>';
  const b = '<form class="sb" style="padding:0"><p>' + esc(unitName(r)) + ' · ' + esc(fmtPeriod(p)) + (cur.activeByRoom[rid] ? ' · ' + esc(cur.activeByRoom[rid].name) : '') + '</p><div class="formgrid">' +
    '<div class="fsec">Listrik</div>' + fld('Meter awal (kWh)', num('elecPrev', o.elecPrev), pv ? 'Diambil dari catatan bulan lalu.' : '') + fld('Meter akhir (kWh)', num('elecNow', o.elecNow)) + fld('Tarif per kWh (Rp)', num('elecRate', o.elecRate), '', 'full') +
    '<div class="fsec">Air</div>' + fld('Meter awal (m³)', num('waterPrev', o.waterPrev)) + fld('Meter akhir (m³)', num('waterNow', o.waterNow)) + fld('Tarif per m³ (Rp)', num('waterRate', o.waterRate), '', 'full') +
    '<div class="fsec">Biaya lain</div>' + fld('Jumlah (Rp)', num('extra', o.extra, 'step="1000"'), 'Misal iuran sampah atau keamanan.') + fld('Keterangan', '<input name="extraNote" maxlength="80" value="' + esc(o.extraNote) + '">') +
    '<div class="full duebox" id="ut-box" aria-live="polite"></div></div><div class="actions">' + (u ? '<button type="button" class="btn danger left" data-act="util-del" data-confirm="Klik lagi untuk hapus" data-id="' + esc(id) + '">Hapus</button>' : '') + '<button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal('Catat listrik dan air', b);
  const form = m.querySelector('form');
  const read = f => ({ elecPrev: f.get('elecPrev'), elecNow: f.get('elecNow'), elecRate: f.get('elecRate'), waterPrev: f.get('waterPrev'), waterNow: f.get('waterNow'), waterRate: f.get('waterRate'), extra: f.get('extra') });
  const upd = () => { const c = utilCalc(read(new FormData(form))); $('#ut-box').innerHTML = '<b>Total ' + rp(c.total) + '</b><span>Listrik ' + c.ek + ' kWh = ' + rp(c.e) + ' · Air ' + c.wk + ' m³ = ' + rp(c.w) + ' · Lain ' + rp(c.x) + '</span>'; };
  form.addEventListener('input', upd); upd();
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const g = read(f), t = cur.activeByRoom[rid] || (u && S.tenants[u.tenantId] ? Object.assign({ id: u.tenantId }, S.tenants[u.tenantId]) : null);
    if (nz(g.elecNow) != null && nz(g.elecPrev) != null && Number(g.elecNow) < Number(g.elecPrev)) { toast('Meter listrik akhir lebih kecil dari awal.', true); return false; }
    if (nz(g.waterNow) != null && nz(g.waterPrev) != null && Number(g.waterNow) < Number(g.waterPrev)) { toast('Meter air akhir lebih kecil dari awal.', true); return false; }
    const c = utilCalc(g);
    if (c.total <= 0) { toast('Isi meteran atau biaya lain dulu. Total masih 0.', true); return false; }
    const data = Object.assign({}, u || {}, { roomId: rid, tenantId: t ? t.id : (u ? u.tenantId : ''), period: p, elecPrev: nz(g.elecPrev), elecNow: nz(g.elecNow), elecRate: nz(g.elecRate) || 0, waterPrev: nz(g.waterPrev), waterNow: nz(g.waterNow), waterRate: nz(g.waterRate) || 0, extra: nz(g.extra) || 0, extraNote: f.get('extraNote').trim(), total: c.total });
    await repo.set('utils', id, data);
    toast('Listrik dan air tersimpan');
  });
}
function openUtilPay(id) {
  const u = S.utils[id]; if (!u || guardLock(u.period)) return;
  const b = '<form class="sb" style="padding:0"><dl class="kv"><div><dt>' + esc(unitNameId(u.roomId)) + '</dt><dd>' + esc((S.tenants[u.tenantId] || {}).name || '-') + '</dd></div><div><dt>Periode</dt><dd>' + esc(fmtPeriod(u.period)) + '</dd></div><div><dt>Tagihan</dt><dd class="mono">' + rp(u.total) + '</dd></div></dl><div class="formgrid">' +
    fld('Tanggal bayar', '<input name="paidAt" type="date" required value="' + todayStr() + '">') + fld('Metode', '<select name="method"><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select>') +
    '</div><div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan pembayaran</button></div></form>';
  const m = openModal('Catat pembayaran listrik dan air', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    if (guardLock(f.get('paidAt'))) return false;
    await repo.set('utils', id, Object.assign({}, u, { paidAt: f.get('paidAt'), method: f.get('method') }));
    toast('Pembayaran tercatat');
  });
}
function exportUtil() {
  const p = UI.up || thisMonth(), rows = utilRows(p).filter(x => x.u);
  const sum = rows.reduce((n, x) => n + (Number(x.u.total) || 0), 0), got = rows.reduce((n, x) => n + (x.u.paidAt ? Number(x.u.total) || 0 : 0), 0);
  return {
    title: 'Listrik dan air - ' + exKos(), subtitle: fmtPeriod(p) + ' | Dibuat ' + fmtDate(cur.t),
    summary: [['Total tagihan', rp(sum)], ['Sudah dibayar', rp(got)], ['Belum dibayar', rp(sum - got)]],
    head: [unitHead(), 'Penghuni', 'Listrik awal', 'Listrik akhir', 'kWh', 'Air awal', 'Air akhir', 'm3', 'Biaya lain (Rp)', 'Total (Rp)', 'Status', 'Tgl bayar'],
    rows: rows.map(x => { const u = x.u, c = utilCalc(u); return [unitName(x.r), x.t ? x.t.name : '', u.elecPrev == null ? '' : u.elecPrev, u.elecNow == null ? '' : u.elecNow, c.ek, u.waterPrev == null ? '' : u.waterPrev, u.waterNow == null ? '' : u.waterNow, c.wk, c.x, Number(u.total) || 0, u.paidAt ? 'Lunas' : 'Belum dibayar', u.paidAt ? fmtDate(u.paidAt) : '']; }),
    foot: ['Total', '', '', '', '', '', '', '', '', sum, '', ''], num: [8, 9], fname: 'listrik-air-' + exSlug(exKos()) + '-' + p
  };
}

/* ============================================================
   KEUANGAN
   ============================================================ */
const EXP_CATS = ['Perbaikan', 'Listrik dan air umum', 'Pajak / PBB', 'Kebersihan', 'Internet', 'Perlengkapan', 'Gaji lain', 'Lainnya'];
function finTx() {
  const tx = [];
  Object.keys(S.payments).forEach(id => { const x = S.payments[id]; if (x && x.paidAt) tx.push({ date: x.paidAt, type: 'in', cat: 'Sewa', note: (S.tenants[x.tenantId] || {}).name || '', unit: unitNameId(x.roomId), amount: Number(x.amount) || 0 }); });
  Object.keys(S.utils).forEach(id => { const x = S.utils[id]; if (x && x.paidAt) tx.push({ date: x.paidAt, type: 'in', cat: 'Listrik dan air', note: (S.tenants[x.tenantId] || {}).name || '', unit: unitNameId(x.roomId), amount: Number(x.total) || 0 }); });
  Object.keys(S.tenants).forEach(id => { const t = S.tenants[id]; if (t && t.depositSettledAt && Number(t.depositDeduct) > 0) tx.push({ date: t.depositSettledAt, type: 'in', cat: 'Potongan deposit', note: t.name + (t.depositNote ? ' - ' + t.depositNote : ''), unit: unitNameId(t.roomId), amount: Number(t.depositDeduct) }); });
  Object.keys(S.expenses).forEach(id => { const x = S.expenses[id]; if (x && x.date) tx.push({ date: x.date, type: 'out', cat: x.category || 'Lainnya', note: x.note || '', unit: x.roomId ? unitNameId(x.roomId) : 'Umum', amount: Number(x.amount) || 0, id }); });
  Object.keys(S.salary).forEach(id => { const x = S.salary[id]; if (x && x.paidAt) tx.push({ date: x.paidAt, type: 'out', cat: 'Gaji penjaga', note: (S.staff[x.staffId] || {}).name || '', unit: 'Umum', amount: Number(x.amount) || 0, sal: id }); });
  return tx.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
}
function finData() {
  const p = UI.kp || thisMonth(), all = finTx();
  const tx = all.filter(x => p === 'all' || x.date.slice(0, 7) === p);
  const sum = f => tx.filter(f).reduce((n, x) => n + x.amount, 0);
  const inc = sum(x => x.type === 'in'), out = sum(x => x.type === 'out');
  const cats = {}; tx.filter(x => x.type === 'out').forEach(x => { cats[x.cat] = (cats[x.cat] || 0) + x.amount; });
  return { p, all, tx, inc, out, net: inc - out, cats, rent: sum(x => x.cat === 'Sewa'), util: sum(x => x.cat === 'Listrik dan air'), dep: sum(x => x.cat === 'Potongan deposit') };
}
function viewFin() {
  const F = finData(), extra = F.all.map(x => x.date.slice(0, 7));
  let h = '<div class="toolbar"><label class="fld"><span>Bulan</span><select id="kp-period">' + monthOpts(F.p, true, extra) + '</select></label>' + exBtns('keuangan') + '<button class="btn" data-act="rekap-pdf">Rekap PDF</button>' + '<button class="btn primary" data-act="exp-edit" data-id="" data-w>+ Pengeluaran</button></div>' + lockNote();
  h += '<div class="stats3"><div class="stat s-ok"><span>Pemasukan</span><b>' + rp(F.inc) + '</b><small>Sewa ' + rp(F.rent) + ' · Listrik dan air ' + rp(F.util) + (F.dep ? ' · Potongan deposit ' + rp(F.dep) : '') + '</small></div><div class="stat s-warn"><span>Pengeluaran</span><b>' + rp(F.out) + '</b><small>Termasuk gaji penjaga yang sudah dibayar</small></div><div class="stat ' + (F.net < 0 ? 's-bad' : 's-ok') + '"><span>Laba bersih</span><b>' + rp(F.net) + '</b><small>' + (F.inc ? Math.round(F.net / F.inc * 100) + '% dari pemasukan' : 'Belum ada pemasukan') + '</small></div></div>';
  h += '<p class="muted" style="font-size:.84rem;margin:-.5rem 0 1rem">Dihitung dari tanggal uang diterima atau dikeluarkan, bukan tanggal jatuh tempo.</p>';
  const cats = Object.keys(F.cats).sort((a, b) => F.cats[b] - F.cats[a]);
  if (cats.length) h += '<div class="note" style="display:block"><b style="color:var(--ink)">Pengeluaran per kategori</b>' + cats.map(c => '<div style="margin-top:.5rem"><div style="display:flex;justify-content:space-between;gap:1rem"><span>' + esc(c) + '</span><span class="mono">' + rp(F.cats[c]) + '</span></div><div class="bar"><i style="width:' + Math.round(F.cats[c] / F.out * 100) + '%"></i></div></div>').join('') + '</div>';
  if (!F.tx.length) return h + '<div class="empty"><h2>Belum ada transaksi</h2><p>Pemasukan muncul otomatis saat kamu mencatat pembayaran sewa atau listrik dan air. Catat biaya perbaikan, pajak, dan lainnya lewat tombol + Pengeluaran.</p></div>';
  h += '<div class="tablewrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Unit</th><th>Keterangan</th><th class="n">Jumlah</th><th></th></tr></thead><tbody>';
  F.tx.slice(0, 400).forEach(x => {
    h += '<tr><td>' + fmtDate(x.date) + '</td><td>' + pill(x.type === 'in' ? 'paid' : 'soon', x.type === 'in' ? 'Masuk' : 'Keluar') + '</td><td>' + esc(x.cat) + '</td><td>' + esc(x.unit) + '</td><td>' + esc(x.note) + '</td><td class="n mono">' + (x.type === 'out' ? '-' : '') + rp(x.amount) + '</td><td>' + (x.id ? '<button class="btn sm" data-act="exp-edit" data-id="' + esc(x.id) + '" data-w>Ubah</button>' : (x.sal ? '<button class="btn sm" data-act="staff-pay" data-id="' + esc(x.sal) + '" data-w>Ubah</button>' : '')) + '</td></tr>';
  });
  h += '</tbody><tfoot><tr><td colspan="5">Laba bersih</td><td class="n mono">' + rp(F.net) + '</td><td></td></tr></tfoot></table></div>';
  if (F.tx.length > 400) h += '<p class="muted" style="margin-top:.6rem">Menampilkan 400 transaksi terbaru. Pilih bulan tertentu atau export untuk sisanya.</p>';
  return h;
}
function openExpense(id) {
  const x = id ? S.expenses[id] : null;
  const b = '<form class="sb" style="padding:0"><div class="formgrid">' +
    fld('Tanggal', '<input name="date" type="date" required value="' + esc(x ? x.date : todayStr()) + '">') +
    fld('Jumlah (Rp)', numIn('amount', x ? x.amount : '', 'required step="1000" min="1"')) +
    fld('Kategori', '<select name="category">' + EXP_CATS.map(c => '<option' + (x && x.category === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>') +
    fld('Untuk unit (opsional)', '<select name="roomId"><option value="">Umum</option>' + cur.rooms.map(r => '<option value="' + esc(r.id) + '"' + (x && x.roomId === r.id ? ' selected' : '') + '>' + esc(unitName(r)) + '</option>').join('') + '</select>') +
    fld('Keterangan', '<input name="note" maxlength="160" value="' + esc(x ? x.note : '') + '" placeholder="Misal: ganti pompa air">', '', 'full') +
    '</div><div class="actions">' + (id ? '<button type="button" class="btn danger left" data-act="exp-del" data-confirm="Klik lagi untuk hapus" data-id="' + esc(id) + '">Hapus</button>' : '') + '<button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal(id ? 'Ubah pengeluaran' : 'Catat pengeluaran', b);
  if (x && guardLock(x.date)) { closeModal(true); return; }
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const date = f.get('date'), amount = Number(f.get('amount')) || 0;
    if (amount <= 0) { toast('Jumlah harus lebih dari 0.', true); return false; }
    if (guardLock(date)) return false;
    await repo.set('expenses', id || rid('e'), { date, amount, category: f.get('category'), roomId: f.get('roomId') || '', note: f.get('note').trim() });
    toast('Pengeluaran tersimpan');
  });
}
function exportFin() {
  const F = finData();
  return {
    title: 'Laporan keuangan - ' + exKos(), subtitle: (F.p === 'all' ? 'Semua bulan' : fmtPeriod(F.p)) + ' | Dibuat ' + fmtDate(cur.t),
    summary: [['Pemasukan', rp(F.inc)], ['Pengeluaran', rp(F.out)], ['Laba bersih', rp(F.net)]],
    head: ['Tanggal', 'Jenis', 'Kategori', 'Unit', 'Keterangan', 'Masuk (Rp)', 'Keluar (Rp)'],
    rows: F.tx.slice().reverse().map(x => [fmtDate(x.date), x.type === 'in' ? 'Masuk' : 'Keluar', x.cat, x.unit, x.note, x.type === 'in' ? x.amount : '', x.type === 'out' ? x.amount : '']),
    foot: ['Total', '', '', '', 'Laba bersih: ' + Math.round(F.net).toLocaleString('id-ID'), F.inc, F.out], num: [5, 6],
    fname: 'keuangan-' + exSlug(exKos()) + '-' + (F.p === 'all' ? 'semua-bulan' : F.p)
  };
}

/* ============================================================
   RINGKASAN LAYOUT
   ============================================================ */
function layoutSummary() {
  const D = cur, p = thisMonth();
  const part = f => { const rs = D.rooms.filter(f); return { n: rs.length, occ: rs.filter(r => r.tenant).length }; };
  const all = part(() => true), kos = part(r => !isKon(r)), kon = part(isKon);
  const pct = all.n ? Math.round(all.occ / all.n * 100) : 0;
  const potential = D.rooms.reduce((n, r) => n + (r.tenant ? Number(r.tenant.rent) || 0 : 0), 0);
  const tx = finTx().filter(x => x.date.slice(0, 7) === p);
  const inc = tx.filter(x => x.type === 'in').reduce((n, x) => n + x.amount, 0), out = tx.filter(x => x.type === 'out').reduce((n, x) => n + x.amount, 0);
  const late = D.bills.filter(b => b.st.k === 'late').reduce((n, b) => n + b.amount, 0);
  const split = showKos() && showKon() ? '<small>Kosan ' + kos.occ + '/' + kos.n + ' · Kontrakan ' + kon.occ + '/' + kon.n + '</small>' : '<small>' + all.occ + ' dari ' + all.n + ' unit terisi</small>';
  return '<div class="stats3"><div class="stat"><span>Tingkat hunian</span><b>' + pct + '%</b>' + split + '<div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
    '<div class="stat s-ok"><span>Pemasukan ' + esc(fmtPeriod(p)) + '</span><b>' + rp(inc) + '</b><small>Potensi sewa bulanan ' + rp(potential) + '</small></div>' +
    '<div class="stat ' + (late ? 's-bad' : '') + '"><span>Tunggakan sewa</span><b>' + rp(late) + '</b><small>' + D.bills.filter(b => b.st.k === 'late').length + ' tagihan telat</small></div>' +
    '<div class="stat ' + (inc - out < 0 ? 's-bad' : '') + '"><span>Laba bersih bulan ini</span><b>' + rp(inc - out) + '</b><small>Pengeluaran ' + rp(out) + '</small></div></div>';
}

/* ============================================================
   KWITANSI PDF
   ============================================================ */
async function makeReceipt(o) {
  if (!window.PDFLib) { toast('Library PDF tidak termuat. Cek koneksi internet lalu muat ulang.', true); return; }
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const ok = new Set(font.getCharacterSet());
  const clean = v => Array.from(String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ')).map(ch => ok.has(ch.codePointAt(0)) ? ch : '?').join('');
  const PW = 595.28, PH = 297.64, M = 28, ink = rgb(0.07, 0.12, 0.16), grey = rgb(0.35, 0.4, 0.43), teal = rgb(0.043, 0.43, 0.376);
  const page = doc.addPage([PW, PH]);
  page.drawRectangle({ x: 14, y: 14, width: PW - 28, height: PH - 28, borderColor: teal, borderWidth: 1.5 });
  const wrap = (txt, w, f, size) => {
    const out = []; let line = '';
    clean(txt).split(' ').forEach(word => { const c = line ? line + ' ' + word : word; if (f.widthOfTextAtSize(c, size) <= w || !line) line = c; else { out.push(line); line = word; } });
    out.push(line); return out;
  };
  let y = PH - M - 6, hx = M;
  try { const r = await fetch('img/icon.png'); if (r.ok) { const im = await doc.embedPng(await r.arrayBuffer()); page.drawImage(im, { x: M, y: PH - M - 26, width: 32, height: 32 }); hx = M + 40; } } catch (e) {}
  page.drawText(clean(o.kos), { x: hx, y, size: 14, font: bold, color: ink });
  if (o.address) { y -= 13; wrap(o.address, 300, font, 8.5).slice(0, 2).forEach(l => { page.drawText(l, { x: hx, y, size: 8.5, font, color: grey }); y -= 11; }); y += 11; }
  page.drawText('KWITANSI', { x: PW - M - bold.widthOfTextAtSize('KWITANSI', 20), y: PH - M - 8, size: 20, font: bold, color: teal });
  const no = 'No. ' + clean(o.no); page.drawText(no, { x: PW - M - font.widthOfTextAtSize(no, 9), y: PH - M - 22, size: 9, font, color: grey });
  y -= 14; page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.8, color: rgb(0.8, 0.84, 0.84) });
  const L = 128, W = PW - M - L - M;
  const row = (label, text, f, size) => {
    y -= 20; page.drawText(label, { x: M, y, size: 9.5, font, color: grey });
    const ls = wrap(text, W, f || font, size || 10.5);
    ls.forEach((l, i) => { page.drawText(l, { x: L + M - 14, y: y - i * 13, size: size || 10.5, font: f || font, color: ink }); });
    y -= (ls.length - 1) * 13;
  };
  row('Telah terima dari', o.from, bold, 11);
  row('Uang sejumlah', terbilang(o.amount).replace(/^./, c => c.toUpperCase()) + ' rupiah', ital, 10.5);
  row('Untuk pembayaran', o.purpose, font, 10.5);
  if (o.method) row('Metode', o.method, font, 10.5);
  const by = 44;
  const amt = clean(rp(o.amount));
  page.drawRectangle({ x: M, y: by - 8, width: 180, height: 32, color: rgb(0.9, 0.95, 0.94), borderColor: teal, borderWidth: 1 });
  page.drawText(amt, { x: M + 10, y: by + 3, size: 15, font: bold, color: ink });
  const sx = PW - M - 170;
  page.drawText(clean(fmtDate(o.date)), { x: sx, y: by + 78, size: 9.5, font, color: ink });
  page.drawText(clean(o.signLabel || 'Penerima'), { x: sx, y: by + 64, size: 9.5, font, color: grey });
  page.drawLine({ start: { x: sx, y: by + 2 }, end: { x: sx + 150, y: by + 2 }, thickness: 0.6, color: grey });
  page.drawText(clean(o.signer || o.owner || ''), { x: sx, y: by - 10, size: 9.5, font: bold, color: ink });
  const bytes = await doc.save();
  const name = 'kwitansi-' + exSlug(o.no) + '.pdf';
  const blob = new Blob([bytes], { type: 'application/pdf' });
  try {
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ files: [file], title: 'Kwitansi' }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  await dl.save({ filename: name, data: blob });
  toast('Kwitansi diunduh');
  return 'saved';
}
function receiptFor(kind, id) {
  const k = cur.kos;
  const base = { kos: k.name || 'Kos', address: k.address || '', owner: k.ownerName || '' };
  if (kind === 'util') {
    const u = S.utils[id]; if (!u || !u.paidAt) return null;
    return Object.assign(base, { no: 'KW-' + u.period.replace('-', '') + '-' + String(roomNo(u.roomId)).replace(/[^A-Za-z0-9]/g, '') + '-LA', from: (S.tenants[u.tenantId] || {}).name || '-', amount: Number(u.total) || 0, purpose: 'Pembayaran listrik dan air ' + unitNameId(u.roomId) + ' periode ' + fmtPeriod(u.period), date: u.paidAt, method: u.method || '' });
  }
  const slug = v => String(v || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
  if (kind === 'dep') {
    const t = S.tenants[id]; if (!t || !(Number(t.deposit) > 0)) return null;
    return Object.assign(base, { no: 'KW-DEP-' + slug(roomNo(t.roomId)) + '-' + String(t.moveIn || '').replace(/-/g, '').slice(0, 8), from: t.name || '-', amount: Number(t.deposit) || 0, purpose: 'Deposit sewa ' + unitNameId(t.roomId), date: t.moveIn || todayStr(), method: '' });
  }
  if (kind === 'sal') {
    const x = S.salary[id]; if (!x || !x.paidAt) return null;
    const st = S.staff[x.staffId] || {};
    return Object.assign(base, { no: 'KW-GJ-' + String(x.period || '').replace('-', '') + '-' + slug(st.name), from: base.owner || base.kos, amount: Number(x.amount) || 0, purpose: 'Gaji penjaga ' + (st.name || '') + (x.period ? ' periode ' + fmtPeriod(x.period) : ''), date: x.paidAt, method: x.method || '', signer: st.name || '' });
  }
  const b = cur.billsById[id]; if (!b || !b.paid) return null;
  return Object.assign(base, { no: 'KW-' + b.period.replace('-', '') + '-' + String(roomNo(b.roomId)).replace(/[^A-Za-z0-9]/g, ''), from: (S.tenants[b.tenantId] || {}).name || '-', amount: Number(b.pay.amount) || 0, purpose: 'Pembayaran sewa ' + unitNameId(b.roomId) + ' periode ' + fmtPeriod(b.period), date: b.pay.paidAt, method: b.pay.method || '' });
}

/* ---------- pengaturan tambahan (tarif dan kunci bulan) ---------- */
function settingsExtra() {
  const k = cur.kos;
  return '<div class="sect"><h3>Listrik dan air</h3><div class="formgrid">' + fld('Tarif listrik per kWh (Rp)', '<input name="elecRate" type="number" inputmode="decimal" min="0" step="any" value="' + esc(k.elecRate || '') + '" placeholder="1500">') + fld('Tarif air per m³ (Rp)', '<input name="waterRate" type="number" inputmode="decimal" min="0" step="any" value="' + esc(k.waterRate || '') + '" placeholder="8000">') + '</div><small class="muted">Jadi nilai awal saat mencatat meteran. Tarif tiap catatan tetap bisa diubah.</small></div>' +
    '<div class="sect"><h3>Kunci catatan</h3><label class="fld"><span>Kunci semua catatan sampai bulan</span><div class="inrow"><input name="lockBefore" id="lk-month" type="month" value="' + esc(k.lockBefore || '') + '"><button type="button" class="btn sm" data-act="lock-prev">Bulan lalu</button><button type="button" class="btn sm" data-act="lock-clear">Buka kunci</button></div></label><small class="muted">Pembayaran, listrik dan air, pengeluaran, serta gaji pada bulan yang dikunci tidak bisa ditambah, diubah, atau dihapus dari aplikasi. Berguna supaya laporan yang sudah ditutup tidak berubah tanpa sengaja.</small></div>';
}

const EXTRA_H = {
  extend: el => openExtend(el.dataset.id),
  'dep-settle': el => openDeposit(el.dataset.id),
  'util-edit': el => openUtil(el.dataset.room),
  'util-pay': el => openUtilPay(el.dataset.id),
  'util-unpay': el => { const u = S.utils[el.dataset.id]; if (!u || guardLock(u.period)) return; const o = Object.assign({}, u); delete o.paidAt; delete o.method; run(() => repo.set('utils', el.dataset.id, o)).then(ok => ok && toast('Pembayaran dibatalkan')); },
  'util-del': el => { const u = S.utils[el.dataset.id]; if (!u || guardLock(u.period)) return; run(() => repo.del('utils', el.dataset.id)).then(ok => { if (ok) { closeModal(); toast('Catatan dihapus'); } }); },
  'exp-edit': el => openExpense(el.dataset.id || ''),
  'exp-del': el => { const x = S.expenses[el.dataset.id]; if (!x || guardLock(x.date)) return; run(() => repo.del('expenses', el.dataset.id)).then(ok => { if (ok) { closeModal(); toast('Pengeluaran dihapus'); } }); },
  receipt: async el => { const o = receiptFor(el.dataset.kind, el.dataset.id); if (!o) { toast('Pembayaran belum tercatat.', true); return; } try { await makeReceipt(o); } catch (e) { toast('Kwitansi gagal dibuat. Coba lagi.', true); } },
  'lock-prev': () => { const i = $('#lk-month'); if (i) i.value = addMonths(thisMonth() + '-01', -1).slice(0, 7); },
  'lock-clear': () => { const i = $('#lk-month'); if (i) i.value = ''; }
};

/* ---------- potongan tampilan penghuni ---------- */
function tenantExtraMeta(t) {
  let h = '';
  const c = contractInfo(t);
  if (t.contractEnd) h += '<div' + (c && c.k !== 'ok' ? ' class="due"' : '') + '><dt>Kontrak sampai</dt><dd>' + fmtDate(t.contractEnd) + (c && c.k !== 'ok' ? ' · ' + esc(contractText(c)) : '') + '</dd></div>';
  const d = depositStatus(t);
  if (d) h += '<div><dt>Deposit</dt><dd>' + (d.settled ? 'Kembali ' + rp(d.back) + (d.cut ? ' · potong ' + rp(d.cut) : '') : rp(depositOf(t)) + (t.moveOut ? ' (belum diselesaikan)' : ' (ditahan)')) + '</dd></div>';
  return h;
}
function tenantExtraFoot(t) {
  let h = '';
  if (!t.moveOut && t.contractEnd) {
    h += '<button class="btn sm" data-act="extend" data-id="' + esc(t.id) + '" data-w>Perpanjang</button>';
    const c = contractInfo(t), wa = (c && c.k !== 'ok') ? contractWa(t.id) : '';
    if (wa) h += '<a class="btn sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Ingatkan kontrak</a>';
  }
  if (t.moveOut && depositOf(t) && !t.depositSettledAt) h += '<button class="btn sm primary" data-act="dep-settle" data-id="' + esc(t.id) + '" data-w>Selesaikan deposit</button>';
  return h;
}

/* ---------- lokasi kamera: area umum, lantai, atau kontrakan ---------- */
const camKey = c => (c.unitId && S.rooms[c.unitId]) ? 'u:' + c.unitId : 'f:' + (Number(c.floor) || 0);
const camOrder = c => (c.unitId && S.rooms[c.unitId]) ? 1e6 : (Number(c.floor) || 0);
function camTitle(key) {
  if (key.indexOf('u:') === 0) { const r = S.rooms[key.slice(2)]; return r ? unitName(Object.assign({ id: key.slice(2) }, r)) + (r.address ? ' · ' + shortAddr(r.address, 40) : '') : 'Kontrakan'; }
  const f = Number(key.slice(2)); return f ? 'Lantai ' + f : 'Area umum';
}
function camLocSelect(c) {
  const sel = c ? camKey(c) : 'f:0';
  const opt = (v, l) => '<option value="' + esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + esc(l) + '</option>';
  const kons = cur.rooms.filter(isKon);
  return '<select name="loc">' + opt('f:0', 'Area umum / luar') + cur.floors.map(f => opt('f:' + f, 'Lantai ' + f)).join('') + kons.map(r => opt('u:' + r.id, unitName(r))).join('') + '</select>';
}
function camLoc(v) {
  v = String(v || 'f:0');
  return v.indexOf('u:') === 0 ? { floor: 0, unitId: v.slice(2) } : { floor: Number(v.slice(2)) || 0, unitId: '' };
}

/* ---------- input nominal Rupiah: titik ribuan otomatis saat mengetik ----------
   Input aslinya jadi hidden (nama, id, dan class tetap, nilainya angka polos), jadi semua kode yang membaca form tidak berubah.
   Yang terlihat adalah input teks yang diformat 1.500.000. */
(function () {
  const SEL = ['amount', 'back', 'base', 'deposit', 'price', 'rent', 'salary', 'extra', 'fprice'].map(n => 'input[type="number"][name="' + n + '"]').concat(['input[type="number"].ft-base']).join(',');
  const group = d => d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fromVal = v => { const s = String(v == null ? '' : v).trim(), n = Number(s); return s !== '' && isFinite(n) ? group(String(Math.round(n))) : ''; };
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  function enhance(el) {
    if (el.dataset.rpDone || !el.parentNode) return;
    el.dataset.rpDone = '1';
    const wasFocus = document.activeElement === el;
    const vis = document.createElement('input');
    vis.type = 'text'; vis.inputMode = 'numeric'; vis.autocomplete = 'off'; vis.value = fromVal(el.value);
    if (el.required) vis.required = true;
    ['placeholder', 'aria-label'].forEach(a => { if (el.hasAttribute(a)) vis.setAttribute(a, el.getAttribute(a)); });
    el.type = 'hidden';
    el.parentNode.insertBefore(vis, el);
    /* kode lain yang mengisi nilai lewat el.value ikut memperbarui tampilan */
    Object.defineProperty(el, 'value', { configurable: true, get() { return desc.get.call(el); }, set(v) { desc.set.call(el, v); vis.value = fromVal(v); } });
    el.focus = () => vis.focus(); el.select = () => vis.select();
    vis.addEventListener('input', () => {
      const pos = vis.selectionStart == null ? vis.value.length : vis.selectionStart;
      const before = vis.value.slice(0, pos).replace(/\D/g, '').length;
      const raw = vis.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      const f = group(raw); vis.value = f;
      let c = 0, cnt = 0; while (c < f.length && cnt < before) { if (/\d/.test(f[c])) cnt++; c++; }
      try { vis.setSelectionRange(c, c); } catch (e) {}
      desc.set.call(el, raw);
      el.dispatchEvent(new Event('input', { bubbles: true })); /* listener yang dipasang langsung di input asli (#t-rent, #dp-back) tetap jalan */
    });
    if (wasFocus) { vis.focus(); vis.select(); }
  }
  const scan = root => { if (root.nodeType !== 1) return; if (root.matches && root.matches(SEL)) enhance(root); root.querySelectorAll && root.querySelectorAll(SEL).forEach(enhance); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.documentElement, { childList: true, subtree: true });
  scan(document.documentElement);
})();

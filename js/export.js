'use strict';
/* ============================================================
   EXPORT EXCEL DAN PDF
   Tiap laporan dibangun jadi satu bentuk umum:
   { title, subtitle, summary: [[label, nilai]], head: [], rows: [[]], foot: [], num: [indeks kolom angka], fname }
   lalu ditulis ke .xlsx (SheetJS) atau .pdf (pdf-lib). Tabel PDF dirakit sendiri di bawah.
   Dimuat sebelum app.js; memakai variabel app.js saat dipanggil.
   ============================================================ */
const exBtns = (what, cls) => '<span class="xwrap' + (cls ? ' ' + cls : '') + '"><button type="button" class="btn" data-act="xp-menu" aria-haspopup="menu" aria-expanded="false">Export <span aria-hidden="true">▾</span></button><span class="xmenu" role="menu" hidden><button type="button" role="menuitem" data-act="xp" data-what="' + what + '" data-fmt="xlsx">Excel</button><button type="button" role="menuitem" data-act="xp" data-what="' + what + '" data-fmt="pdf">PDF</button></span></span>';
const closeXMenus = () => document.querySelectorAll('.xmenu').forEach(m => { m.hidden = true; const b = m.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); });
document.addEventListener('click', e => { if (!e.target.closest('.xwrap')) closeXMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeXMenus(); });
const exSlug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const exKos = () => (cur && cur.kos && cur.kos.name) || 'Kos';

/* ---------- pembangun data ---------- */
const EX = {
  utilitas: () => exportUtil(),
  keuangan: () => exportFin(),
  /* owner */
  laporan() {
    const R = reportData(), f = UI.rp;
    const periodLabel = f.period === 'all' ? 'Semua bulan' : fmtPeriod(f.period), roomLabel = f.room === 'all' ? 'Semua ' + unitHead().toLowerCase() : unitNameId(f.room);
    return {
      title: 'Laporan tagihan - ' + exKos(), subtitle: periodLabel + ' | ' + roomLabel,
      summary: [['Total tagihan', rp(R.tot.tagihan)], ['Dibayar', rp(R.tot.dibayar)], ['Belum dibayar', rp(R.tot.sisa)], ['Telat', R.tot.telat], [unitHead() + ' kosong', R.tot.kosong]],
      head: [unitHead(), 'Periode', 'Penghuni', 'Tagihan (Rp)', 'Jatuh tempo', 'Status', 'Dibayar (Rp)', 'Tgl bayar', 'Metode'],
      rows: R.rows.map(r => [r.room, fmtPeriod(r.period), r.who, r.k === 'vacant' ? '' : r.amount, r.due ? fmtDate(r.due) : '', r.status, r.paid || '', r.paidAt ? fmtDate(r.paidAt) : '', r.method || '']),
      foot: ['Total', '', '', R.tot.tagihan, '', '', R.tot.dibayar, '', ''], num: [3, 6],
      fname: 'laporan-' + exSlug(exKos()) + '-' + (f.period === 'all' ? 'semua-bulan' : f.period)
    };
  },
  penghuni() {
    const all = Object.keys(S.tenants).map(id => Object.assign({ id }, S.tenants[id])).sort((a, b) => (a.moveOut ? 1 : 0) - (b.moveOut ? 1 : 0) || natCmp(roomNo(a.roomId), roomNo(b.roomId)));
    const aktif = all.filter(t => !t.moveOut);
    return {
      title: 'Daftar penghuni - ' + exKos(), subtitle: 'Dibuat ' + fmtDate(cur.t),
      summary: [['Penghuni aktif', aktif.length], ['Sudah keluar', all.length - aktif.length], ['Total sewa aktif / bulan', rp(aktif.reduce((n, t) => n + (Number(t.rent) || 0), 0))]],
      head: ['Nama', unitHead(), 'Lantai / alamat', 'No. HP', 'Orang', 'Masuk', 'Keluar', 'Sewa / bulan (Rp)', 'Deposit (Rp)', 'Status', 'Kontrak sampai', 'Deposit kembali (Rp)', 'Potongan deposit (Rp)'],
      rows: all.map(t => { const r = cur.roomsById[t.roomId]; return [t.name || '', r ? r.number : '?', r ? (isKon(r) ? (r.address || '') : r.floor) : '', t.phone || '', Number(t.people) || 1, fmtDate(t.moveIn), t.moveOut ? fmtDate(t.moveOut) : '', Number(t.rent) || 0, Number(t.deposit) || 0, t.moveOut ? 'Keluar' : 'Aktif', t.contractEnd ? fmtDate(t.contractEnd) : '', t.depositSettledAt ? Number(t.depositReturned) || 0 : '', t.depositSettledAt ? Number(t.depositDeduct) || 0 : '']; }),
      foot: ['Total sewa aktif', '', '', '', '', '', '', aktif.reduce((n, t) => n + (Number(t.rent) || 0), 0), '', '', '', '', ''], num: [7, 8, 11, 12],
      fname: 'penghuni-' + exSlug(exKos()) + '-' + cur.t
    };
  },
  penjaga() {
    const all = staffList(), aktif = all.filter(x => !x.endDate), gaji = aktif.reduce((n, x) => n + (Number(x.salary) || 0), 0);
    return {
      title: 'Daftar penjaga - ' + exKos(), subtitle: 'Dibuat ' + fmtDate(cur.t),
      summary: [['Penjaga aktif', aktif.length], ['Sudah berhenti', all.length - aktif.length], ['Total gaji aktif / bulan', rp(gaji)]],
      head: ['Nama', 'Peran', 'No. HP', 'Shift', 'Area tugas', 'Mulai kerja', 'Status', 'Gaji / bulan (Rp)'],
      rows: all.map(x => [x.name || '', x.role || '', x.phone || '', x.shift || '', x.area || '', x.startDate ? fmtDate(x.startDate) : '', x.endDate ? 'Berhenti ' + fmtDate(x.endDate) : 'Aktif', Number(x.salary) || 0]),
      foot: ['Total gaji aktif', '', '', '', '', '', '', gaji], num: [7],
      fname: 'penjaga-' + exSlug(exKos()) + '-' + cur.t
    };
  },
  langganan() {
    const p = planOfAcc(), bills = ownSubBills().sort((a, b) => a.due < b.due ? -1 : 1), sum = f => bills.filter(f).reduce((n, b) => n + b.amount, 0);
    return {
      title: 'Tagihan langganan - ' + (ACC.kosName || exKos()), subtitle: (p ? 'Paket ' + p.name + ' | ' + rp(p.price) + ' / bulan | ' + planRange(p) : 'Belum ada paket') + ' | Dibuat ' + fmtDate(todayStr()),
      summary: [['Total tagihan', rp(sum(() => true))], ['Sudah dibayar', rp(sum(b => b.paid))], ['Belum dibayar', rp(sum(b => !b.paid))]],
      head: ['Periode', 'Jatuh tempo', 'Tagihan (Rp)', 'Status', 'Dibayar (Rp)', 'Tgl bayar', 'Metode'],
      rows: bills.map(b => [fmtPeriod(b.period), fmtDate(b.due), b.amount, statusText(b), b.paid ? Number(b.pay.amount) : '', b.paid ? fmtDate(b.pay.paidAt) : '', b.paid ? (b.pay.method || '') : '']),
      foot: ['Total', '', sum(() => true), '', sum(b => b.paid), '', ''], num: [2, 4],
      fname: 'langganan-' + exSlug(ACC.kosName || exKos()) + '-' + todayStr()
    };
  },
  /* admin */
  daftar() {
    const q = (UI.aq || '').trim().toLowerCase();
    let list = accList().filter(a => UI.af === 'all' || a.status === UI.af);
    if (q) list = list.filter(a => [a.ownerName, a.kosName, a.email, a.phone].join(' ').toLowerCase().indexOf(q) >= 0);
    list.sort((a, b) => String(a.kosName || a.email).localeCompare(String(b.kosName || b.email), 'id'));
    const monthly = list.filter(a => a.status === 'approved').reduce((n, a) => n + (Number((PLANS[a.planId] || {}).price) || 0), 0);
    return {
      title: 'Daftar akun pemilik kos', subtitle: 'Filter: ' + (UI.af === 'all' ? 'Semua' : ACC_STATUS[UI.af]) + (q ? ' | Cari: ' + UI.aq : '') + ' | Dibuat ' + fmtDate(todayStr()),
      summary: [['Jumlah akun', list.length], ['Perkiraan pendapatan / bulan (akun aktif)', rp(monthly)]],
      head: ['Kos', 'Pemilik', 'Email', 'WhatsApp', 'Paket', 'Harga / bulan (Rp)', 'Unit', 'Batas', 'Status', 'Daftar', 'Mulai langganan'],
      rows: list.map(a => { const p = accPlan(a); return [a.kosName || '', a.ownerName || '', a.email || '', a.phone || '', p ? p.name : '', p ? Number(p.price) : '', Number(a.roomCount) || 0, p && Number(p.maxRooms) ? Number(p.maxRooms) : '', ACC_STATUS[a.status] || a.status, a.createdAt ? fmtDate(a.createdAt) : '', a.approvedAt ? fmtDate(a.approvedAt) : '']; }),
      foot: null, num: [5, 6, 7], fname: 'akun-pemilik-' + todayStr()
    };
  },
  abill() {
    const curP = todayStr().slice(0, 7), all = adminSubBills();
    let list = all.slice();
    if (UI.abf === 'tagih') list = list.filter(b => b.st.k === 'late' || b.st.k === 'soon');
    else if (UI.abf === 'bulan') list = list.filter(b => b.period === curP);
    else if (UI.abf === 'belum') list = list.filter(b => !b.paid);
    else if (UI.abf === 'lunas') list = list.filter(b => b.paid);
    list.sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
    const sum = f => list.filter(f).reduce((n, b) => n + b.amount, 0), lbl = { tagih: 'Perlu ditagih', bulan: 'Bulan ini', belum: 'Belum lunas', lunas: 'Lunas', semua: 'Semua' }[UI.abf] || 'Semua';
    return {
      title: 'Tagihan langganan', subtitle: 'Filter: ' + lbl + ' | Dibuat ' + fmtDate(todayStr()),
      summary: [['Jumlah tagihan', list.length], ['Total tagihan', rp(sum(() => true))], ['Sudah dibayar', rp(sum(b => b.paid))], ['Belum dibayar', rp(sum(b => !b.paid))]],
      head: ['Kos', 'Pemilik', 'Paket', 'Periode', 'Jatuh tempo', 'Tagihan (Rp)', 'Status', 'Dibayar (Rp)', 'Tgl bayar', 'Metode'],
      rows: list.map(b => { const a = AD.accounts[b.tenantId] || {}, p = PLANS[a.planId] || {}; return [a.kosName || a.email || '', a.ownerName || '', p.name || '', fmtPeriod(b.period), fmtDate(b.due), b.amount, statusText(b), b.paid ? Number(b.pay.amount) : '', b.paid ? fmtDate(b.pay.paidAt) : '', b.paid ? (b.pay.method || '') : '']; }),
      foot: ['Total', '', '', '', '', sum(() => true), '', sum(b => b.paid), '', ''], num: [5, 7],
      fname: 'tagihan-langganan-' + (UI.abf || 'semua') + '-' + todayStr()
    };
  },
  paket() {
    const used = {}; accList().forEach(a => { if (a.planId) used[a.planId] = (used[a.planId] || 0) + 1; });
    return {
      title: 'Daftar paket', subtitle: 'Dibuat ' + fmtDate(todayStr()), summary: [['Jumlah paket', planList(false).length]],
      head: ['Paket', 'Harga / bulan (Rp)', 'Unit min', 'Unit maks', 'Akun', 'Status', 'Keterangan'],
      rows: planList(false).map(p => [p.name, Number(p.price) || 0, Number(p.minRooms) || 1, Number(p.maxRooms) || '', used[p.id] || 0, p.active === false ? 'Nonaktif' : 'Aktif', p.desc || '']),
      foot: null, num: [1, 2, 3, 4], fname: 'paket-' + todayStr()
    };
  }
};

/* ---------- Excel ---------- */
async function exXlsx(d) {
  if (!window.XLSX) { toast('Library Excel tidak termuat. Cek koneksi internet lalu muat ulang.', true); return; }
  const aoa = [d.head].concat(d.rows);
  if (d.foot) { aoa.push([]); aoa.push(d.foot); }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = d.head.map((h, c) => ({ wch: Math.min(40, Math.max(String(h).length, ...aoa.map(r => String(r[c] == null ? '' : r[c]).length)) + 2) }));
  for (let r = 1; r < aoa.length; r++) d.num.forEach(c => { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && typeof ws[a].v === 'number') ws[a].z = '#,##0'; });
  const ws2 = XLSX.utils.aoa_to_sheet([[d.title], [d.subtitle || ''], []].concat(d.summary.map(x => [x[0], x[1]])));
  ws2['!cols'] = [{ wch: 36 }, { wch: 28 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data'); XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  await dl.save({ filename: d.fname + '.xlsx', data: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
}

/* ---------- PDF (tabel dirakit dengan pdf-lib) ---------- */
async function exPdf(d) {
  if (!window.PDFLib) { toast('Library PDF tidak termuat. Cek koneksi internet lalu muat ulang.', true); return; }
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const okChars = new Set(font.getCharacterSet());
  const clean = v => Array.from(String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ')).map(ch => okChars.has(ch.codePointAt(0)) ? ch : '?').join('');
  const fmtCell = (v, c) => (d.num.indexOf(c) >= 0 && typeof v === 'number') ? Math.round(v).toLocaleString('id-ID') : clean(v);
  const land = d.head.length > 6, PW = land ? 841.89 : 595.28, PH = land ? 595.28 : 841.89, M = 36, FS = 8, LH = 10.5, PX = 4, PY = 3.5;
  const avail = PW - 2 * M;
  const W = (t, f) => (f || font).widthOfTextAtSize(t, FS);
  const wrap = (txt, w, f) => {
    const out = []; let line = '';
    String(txt).split(' ').forEach(word => {
      let cand = line ? line + ' ' + word : word;
      if (W(cand, f) <= w) { line = cand; return; }
      if (line) { out.push(line); line = ''; }
      while (W(word, f) > w && word.length > 1) { let n = word.length; while (n > 1 && W(word.slice(0, n), f) > w) n--; out.push(word.slice(0, n)); word = word.slice(n); }
      line = word;
    });
    out.push(line); return out;
  };
  const body = d.rows.map(r => r.map((v, c) => fmtCell(v, c))), foot = d.foot ? d.foot.map((v, c) => fmtCell(v, c)) : null, head = d.head.map(clean);
  /* lebar kolom: sesuai isi terpanjang, lalu diskalakan agar muat satu halaman */
  const nat = head.map((h, c) => Math.min(150, Math.max(W(h, bold), ...body.map(r => W(r[c], font)), foot ? W(foot[c], bold) : 0)) + 2 * PX + 2);
  const tot = nat.reduce((a, b) => a + b, 0), minW = 34;
  let cw = nat.map(w => tot > avail ? Math.max(minW, w * avail / tot) : w);
  const over = cw.reduce((a, b) => a + b, 0) - avail;
  if (over > 0) { const big = cw.reduce((m, w, i) => w > cw[m] ? i : m, 0); cw[big] = Math.max(minW, cw[big] - over); }
  else if (tot < avail) cw = cw.map(w => w * Math.min(1.5, avail / tot));
  const rowH = (cells, f) => Math.max(...cells.map((t, c) => wrap(t, cw[c] - 2 * PX, f).length)) * LH + 2 * PY;
  const grey = rgb(0.35, 0.4, 0.43), teal = rgb(0.043, 0.43, 0.376), line = rgb(0.8, 0.84, 0.84);
  let page, y;
  const drawRow = (cells, f, fill, color) => {
    const h = rowH(cells, f);
    if (fill) page.drawRectangle({ x: M, y: y - h, width: cw.reduce((a, b) => a + b, 0), height: h, color: fill });
    let x = M;
    cells.forEach((t, c) => {
      const ls = wrap(t, cw[c] - 2 * PX, f), right = d.num.indexOf(c) >= 0;
      ls.forEach((l, i) => { const tw = W(l, f); page.drawText(l, { x: right ? x + cw[c] - PX - tw : x + PX, y: y - PY - FS - i * LH + 1.5, size: FS, font: f, color: color || rgb(0.07, 0.12, 0.16) }); });
      x += cw[c];
    });
    page.drawLine({ start: { x: M, y: y - h }, end: { x: M + cw.reduce((a, b) => a + b, 0), y: y - h }, thickness: 0.5, color: line });
    y -= h; return h;
  };
  const newPage = first => {
    page = doc.addPage([PW, PH]); y = PH - M;
    if (first) {
      page.drawText(clean(d.title), { x: M, y: y - 14, size: 15, font: bold, color: rgb(0.07, 0.12, 0.16) }); y -= 28;
      if (d.subtitle) { wrap(clean(d.subtitle), avail, font).forEach(l => { page.drawText(l, { x: M, y: y - 8, size: 9, font, color: grey }); y -= 12; }); }
      y -= 2;
      const sumTxt = d.summary.map(s => clean(s[0]) + ': ' + (typeof s[1] === 'number' ? s[1].toLocaleString('id-ID') : clean(s[1]))).join('   |   ');
      wrap(sumTxt, avail, font).forEach(l => { page.drawText(l, { x: M, y: y - 8, size: 9, font: bold, color: rgb(0.07, 0.12, 0.16) }); y -= 12; });
      y -= 8;
    }
    drawRow(head, bold, teal, rgb(1, 1, 1));
  };
  newPage(true);
  if (!body.length) { page.drawText('Tidak ada data.', { x: M + PX, y: y - 16, size: 10, font, color: grey }); y -= 24; }
  body.forEach((r, i) => { if (y - rowH(r, font) < M + 24) newPage(false); drawRow(r, font, i % 2 ? rgb(0.95, 0.97, 0.97) : null); });
  if (foot) { if (y - rowH(foot, bold) < M + 24) newPage(false); drawRow(foot, bold, rgb(0.86, 0.91, 0.91)); }
  const pages = doc.getPages();
  pages.forEach((p, i) => { p.drawText('Dibuat ' + fmtDate(todayStr()) + ' dari Lapak Kosan', { x: M, y: 20, size: 7.5, font, color: grey }); const t = 'Halaman ' + (i + 1) + ' dari ' + pages.length; p.drawText(t, { x: PW - M - font.widthOfTextAtSize(t, 7.5), y: 20, size: 7.5, font, color: grey }); });
  const bytes = await doc.save();
  await dl.save({ filename: d.fname + '.pdf', data: new Blob([bytes], { type: 'application/pdf' }) });
}

async function runExport(what, fmt) {
  try {
    if (fmt === 'xlsx' && what === 'laporan') return await doExport();
    if (fmt === 'xlsx' && what === 'penjaga') return await doExportStaff();
    const d = EX[what](); if (!d) return;
    if (!d.rows.length && what !== 'laporan') { toast('Belum ada data untuk di-export.', true); return; }
    if (fmt === 'pdf') await exPdf(d); else await exXlsx(d);
  } catch (e) { if (!e || e.code !== 'declined') toast('Export gagal. Coba lagi.', true); }
}
const EXPORT_H = {
  xp: el => { closeXMenus(); runExport(el.dataset.what, el.dataset.fmt); },
  'xp-menu': el => { const m = el.nextElementSibling, open = m.hidden; closeXMenus(); m.hidden = !open; el.setAttribute('aria-expanded', String(open)); }
};

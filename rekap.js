'use strict';
/* ============================================================
   REKAP BULANAN PDF (A4): ringkasan, pengeluaran per kategori, tunggakan, daftar transaksi.
   Dimuat sebelum app.js; memakai variabel app.js hanya saat fungsi dipanggil.
   ============================================================ */
async function makeRekap() {
  if (!window.PDFLib) { toast('Library PDF tidak termuat. Cek koneksi internet lalu muat ulang.', true); return; }
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const F = finData(), D = cur, k = D.kos, all = F.p === 'all';
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ok = new Set(font.getCharacterSet());
  const cl = v => Array.from(String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ')).map(ch => ok.has(ch.codePointAt(0)) ? ch : '?').join('');
  const PW = 595.28, PH = 841.89, M = 40, ink = rgb(0.07, 0.12, 0.16), grey = rgb(0.38, 0.43, 0.46), teal = rgb(0.043, 0.43, 0.376), line = rgb(0.82, 0.86, 0.86), red = rgb(0.66, 0.14, 0.1);
  let page = doc.addPage([PW, PH]), y = PH - M;
  const txt = (t, x, yy, o) => { o = o || {}; const f = o.b ? bold : font, sz = o.size || 10; t = cl(t); if (o.right) x -= f.widthOfTextAtSize(t, sz); page.drawText(t, { x, y: yy, size: sz, font: f, color: o.color || ink }); };
  const need = h => { if (y - h < M + 20) { page = doc.addPage([PW, PH]); y = PH - M; } };
  const clip = (t, w, f, sz) => { t = cl(t); while (t.length > 1 && f.widthOfTextAtSize(t, sz) > w) t = t.slice(0, -1); return t; };
  let hx = M;
  try { const r = await fetch('img/icon.png'); if (r.ok) { const im = await doc.embedPng(await r.arrayBuffer()); page.drawImage(im, { x: M, y: y - 26, width: 34, height: 34 }); hx = M + 44; } } catch (e) {}
  txt(k.name || 'Kos', hx, y - 8, { b: 1, size: 16 });
  if (k.address) txt(clip(k.address, 330, font, 9), hx, y - 21, { size: 9, color: grey });
  txt('REKAP KEUANGAN', PW - M, y - 8, { b: 1, size: 15, color: teal, right: 1 });
  txt(all ? 'Semua bulan' : fmtPeriod(F.p), PW - M, y - 22, { size: 10, color: grey, right: 1 });
  y -= 48; page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: teal }); y -= 22;
  /* ringkasan */
  const bw = (PW - 2 * M - 20) / 3;
  [['Pemasukan', F.inc, ink], ['Pengeluaran', F.out, ink], ['Laba bersih', F.net, F.net < 0 ? red : teal]].forEach((c, i) => {
    const x = M + i * (bw + 10);
    page.drawRectangle({ x, y: y - 44, width: bw, height: 48, color: rgb(0.94, 0.97, 0.96), borderColor: line, borderWidth: 0.8 });
    txt(c[0], x + 10, y - 12, { size: 9, color: grey }); txt(rp(c[1]), x + 10, y - 33, { b: 1, size: 13, color: c[2] });
  });
  y -= 66;
  /* hunian dan tunggakan */
  const st = D.stats, pct = st.total ? Math.round(st.occ / st.total * 100) : 0;
  const lateB = D.bills.filter(b => b.st.k === 'late'), late = lateB.reduce((n, b) => n + b.amount, 0);
  txt('Hunian', M, y, { b: 1, size: 11 }); txt(st.occ + ' dari ' + st.total + ' unit terisi (' + pct + '%), ' + st.vacant + ' kosong', M + 110, y, { size: 10 }); y -= 16;
  txt('Tunggakan sewa', M, y, { b: 1, size: 11 }); txt(rp(late) + ' (' + lateB.length + ' tagihan telat)', M + 110, y, { size: 10, color: lateB.length ? red : ink }); y -= 16;
  txt('Rincian pemasukan', M, y, { b: 1, size: 11 }); txt('Sewa ' + rp(F.rent) + '  |  Listrik dan air ' + rp(F.util) + (F.dep ? '  |  Potongan deposit ' + rp(F.dep) : ''), M + 110, y, { size: 10 }); y -= 26;
  /* pengeluaran per kategori */
  const cats = Object.keys(F.cats).sort((a, b) => F.cats[b] - F.cats[a]);
  if (cats.length) {
    txt('Pengeluaran per kategori', M, y, { b: 1, size: 11, color: teal }); y -= 8;
    cats.forEach(c => { need(16); y -= 15; txt(c, M, y, { size: 10 }); txt(rp(F.cats[c]), PW - M, y, { size: 10, right: 1 }); page.drawLine({ start: { x: M, y: y - 4 }, end: { x: PW - M, y: y - 4 }, thickness: 0.4, color: line }); });
    y -= 22;
  }
  /* tunggakan */
  if (lateB.length) {
    need(40); txt('Tagihan telat', M, y, { b: 1, size: 11, color: red }); y -= 8;
    lateB.slice().sort((a, b) => a.due < b.due ? -1 : 1).slice(0, 15).forEach(b => {
      need(16); y -= 15;
      txt(clip(((S.tenants[b.tenantId] || {}).name || '-') + ' - ' + unitNameId(b.roomId) + ' - ' + fmtPeriod(b.period), 340, font, 10), M, y, { size: 10 });
      txt('telat ' + b.st.d + ' hr', M + 360, y, { size: 9, color: grey }); txt(rp(b.amount), PW - M, y, { size: 10, right: 1 });
    });
    if (lateB.length > 15) { y -= 14; txt('dan ' + (lateB.length - 15) + ' tagihan lainnya', M, y, { size: 9, color: grey }); }
    y -= 22;
  }
  /* transaksi */
  need(50); txt('Daftar transaksi', M, y, { b: 1, size: 11, color: teal }); y -= 6;
  const head = () => { need(24); y -= 14; page.drawRectangle({ x: M, y: y - 4, width: PW - 2 * M, height: 16, color: rgb(0.9, 0.94, 0.93) }); txt('Tanggal', M + 4, y, { b: 1, size: 8.5 }); txt('Kategori', M + 78, y, { b: 1, size: 8.5 }); txt('Keterangan', M + 190, y, { b: 1, size: 8.5 }); txt('Masuk', PW - M - 90, y, { b: 1, size: 8.5, right: 1 }); txt('Keluar', PW - M - 4, y, { b: 1, size: 8.5, right: 1 }); y -= 4; };
  head();
  if (!F.tx.length) { y -= 18; txt('Belum ada transaksi.', M + 4, y, { size: 10, color: grey }); }
  F.tx.slice().reverse().slice(0, 600).forEach(x => {
    if (y - 14 < M + 20) { page = doc.addPage([PW, PH]); y = PH - M; head(); }
    y -= 13;
    txt(fmtDate(x.date), M + 4, y, { size: 8.5 }); txt(clip(x.cat, 106, font, 8.5), M + 78, y, { size: 8.5 });
    txt(clip((x.unit && x.unit !== 'Umum' ? x.unit + ' - ' : '') + (x.note || ''), 175, font, 8.5), M + 190, y, { size: 8.5 });
    if (x.type === 'in') txt(rp(x.amount), PW - M - 90, y, { size: 8.5, right: 1 }); else txt(rp(x.amount), PW - M - 4, y, { size: 8.5, right: 1 });
    page.drawLine({ start: { x: M, y: y - 3 }, end: { x: PW - M, y: y - 3 }, thickness: 0.3, color: line });
  });
  y -= 20; need(24);
  txt('TOTAL', M + 190, y, { b: 1, size: 9 }); txt(rp(F.inc), PW - M - 90, y, { b: 1, size: 9, right: 1 }); txt(rp(F.out), PW - M - 4, y, { b: 1, size: 9, right: 1 });
  const pages = doc.getPages();
  pages.forEach((pg, i) => { const t = cl('Dibuat ' + fmtDate(todayStr()) + ' - Halaman ' + (i + 1) + ' dari ' + pages.length); pg.drawText(t, { x: PW - M - font.widthOfTextAtSize(t, 8), y: 22, size: 8, font, color: grey }); });
  const bytes = await doc.save(), name = 'rekap-' + exSlug(k.name || 'kos') + '-' + (all ? 'semua-bulan' : F.p) + '.pdf', blob = new Blob([bytes], { type: 'application/pdf' });
  try {
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ files: [file], title: 'Rekap keuangan' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  await dl.save({ filename: name, data: blob });
  toast('Rekap diunduh');
}
const REKAP_H = { 'rekap-pdf': async () => { try { await makeRekap(); } catch (e) { toast('Rekap gagal dibuat. Coba lagi.', true); } } };

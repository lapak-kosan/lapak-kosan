'use strict';
/* ============================================================
   TAB KWITANSI: daftar semua pembayaran yang bisa dibuatkan kwitansi
   (sewa, listrik dan air, deposit, gaji penjaga) + kwitansi manual.
   Dimuat sebelum app.js; memakai variabel app.js hanya saat fungsi dipanggil.
   ============================================================ */
function kwList() {
  const L = [];
  cur.bills.filter(b => b.paid && b.pay && b.pay.paidAt).forEach(b => L.push({ kind: 'rent', id: b.id, date: b.pay.paidAt, jenis: 'Sewa', who: (S.tenants[b.tenantId] || {}).name || '-', phone: (S.tenants[b.tenantId] || {}).phone || '', note: unitNameId(b.roomId) + ' · ' + fmtPeriod(b.period), amount: Number(b.pay.amount) || 0 }));
  Object.keys(S.utils).forEach(id => { const u = S.utils[id]; if (u && u.paidAt) L.push({ kind: 'util', id, date: u.paidAt, jenis: 'Listrik dan air', who: (S.tenants[u.tenantId] || {}).name || '-', phone: (S.tenants[u.tenantId] || {}).phone || '', note: unitNameId(u.roomId) + ' · ' + fmtPeriod(u.period), amount: Number(u.total) || 0 }); });
  Object.keys(S.tenants).forEach(id => { const t = S.tenants[id]; if (t && Number(t.deposit) > 0 && t.moveIn) L.push({ kind: 'dep', id, date: t.moveIn, jenis: 'Deposit', who: t.name || '-', phone: t.phone || '', note: unitNameId(t.roomId), amount: Number(t.deposit) || 0 }); });
  Object.keys(S.salary).forEach(id => { const x = S.salary[id]; if (x && x.paidAt) L.push({ kind: 'sal', id, date: x.paidAt, jenis: 'Gaji penjaga', who: (S.staff[x.staffId] || {}).name || '-', phone: (S.staff[x.staffId] || {}).phone || '', note: x.period ? fmtPeriod(x.period) : '', amount: Number(x.amount) || 0 }); });
  return L.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
}
function kwText(x) {
  const o = receiptFor(x.kind, x.id); if (!o) return '';
  const t = terbilang(o.amount); 
  return 'Halo ' + x.who + ', berikut bukti pembayaran (kwitansi) dari ' + o.kos + ':\n\nNo. ' + o.no + '\nTanggal: ' + fmtDate(o.date) + '\nUntuk: ' + o.purpose + '\nJumlah: ' + rp(o.amount) + ' (' + t.replace(/^./, c => c.toUpperCase()) + ' rupiah)' + (o.method ? '\nMetode: ' + o.method : '') + '\n\nTerima kasih.' + (o.owner ? '\n' + o.owner : '');
}
function kwWa(x) {
  if (!x.phone) return '';
  return ' <button class="btn sm" data-act="kw-wa" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '" data-phone="' + esc(x.phone) + '" data-who="' + esc(x.who) + '">Kirim WA</button>';
}
/* HP: lembar bagikan dengan file PDF (pilih WhatsApp). Komputer: PDF diunduh, chat WA dibuka, lalu lampirkan file itu. */
async function kwSendWa(el) {
  const x = { kind: el.dataset.kind, id: el.dataset.id, who: el.dataset.who }, o = receiptFor(x.kind, x.id);
  if (!o) { toast('Pembayaran belum tercatat.', true); return; }
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const w = mobile ? null : window.open('about:blank', '_blank');
  let r = '';
  try { r = await makeReceipt(o); } catch (e) { if (w) w.close(); toast('Kwitansi gagal dibuat. Coba lagi.', true); return; }
  if (mobile) return;
  const l = waLink(el.dataset.phone, 'Halo ' + x.who + ', berikut kwitansi ' + o.purpose.toLowerCase() + ' sebesar ' + rp(o.amount) + ' (No. ' + o.no + '). File PDF terlampir. Terima kasih.' + (o.owner ? ' ' + o.owner : ''));
  if (w && l && r === 'saved') { w.location.href = l; toast('PDF diunduh. Lampirkan file kwitansi di chat WhatsApp yang terbuka.'); } else if (w) w.close();
}
function viewKwitansi() {
  const all = kwList(), p = UI.wp || thisMonth(), q = (UI.wq || '').trim().toLowerCase();
  let list = all.filter(x => p === 'all' || x.date.slice(0, 7) === p);
  if (UI.wk && UI.wk !== 'all') list = list.filter(x => x.kind === UI.wk);
  if (q) list = list.filter(x => [x.who, x.note, x.jenis].join(' ').toLowerCase().indexOf(q) >= 0);
  const seg = (k, l) => '<button data-act="wk" data-v="' + k + '" aria-pressed="' + ((UI.wk || 'all') === k) + '">' + l + '</button>';
  let h = '<div class="toolbar"><label class="fld"><span>Bulan</span><select id="kw-period">' + monthOpts(p, true, all.map(x => x.date.slice(0, 7))) + '</select></label>' +
    '<div class="seg">' + seg('all', 'Semua') + seg('rent', 'Sewa') + seg('util', 'Listrik dan air') + seg('dep', 'Deposit') + seg('sal', 'Gaji') + '</div>' +
    '<input id="kw-q" type="search" placeholder="Cari nama atau unit…" value="' + esc(UI.wq || '') + '" style="flex:1 1 12rem;min-width:0"><button class="btn primary" data-act="kw-manual" data-w>+ Kwitansi manual</button></div>';
  h += '<p class="muted" style="font-size:.84rem;margin:-.4rem 0 1rem">Kwitansi dibuat dari pembayaran yang sudah dicatat. Klik Kwitansi untuk mengunduh PDF (di HP langsung bisa dibagikan ke WhatsApp). Untuk pembayaran di luar aplikasi, pakai Kwitansi manual.</p>';
  if (!list.length) return h + '<div class="empty"><h2>Belum ada kwitansi</h2><p>Kwitansi muncul otomatis setelah pembayaran sewa, listrik dan air, atau gaji dicatat. Ganti bulan atau filter untuk melihat yang lain.</p></div>';
  const tot = list.reduce((n, x) => n + x.amount, 0);
  h += '<div class="tablewrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Nama</th><th>Keterangan</th><th class="n">Jumlah</th><th></th></tr></thead><tbody>';
  list.slice(0, 300).forEach(x => {
    h += '<tr><td>' + fmtDate(x.date) + '</td><td>' + esc(x.jenis) + '</td><td>' + esc(x.who) + '</td><td>' + esc(x.note) + '</td><td class="n mono">' + rp(x.amount) + '</td><td><button class="btn sm" data-act="receipt" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '">Kwitansi</button>' + kwWa(x) + '</td></tr>';
  });
  h += '</tbody><tfoot><tr><td colspan="4">' + list.length + ' kwitansi</td><td class="n mono">' + rp(tot) + '</td><td></td></tr></tfoot></table></div>';
  if (list.length > 300) h += '<p class="muted" style="margin-top:.6rem">Menampilkan 300 teratas. Pilih bulan tertentu untuk sisanya.</p>';
  return h;
}
function openKwManual() {
  const k = cur.kos;
  const b = '<form class="sb" style="padding:0"><div class="formgrid">' +
    fld('Diterima dari', '<input name="from" required maxlength="80" placeholder="Nama pembayar">', '', 'full') +
    fld('Jumlah (Rp)', numIn('amount', '', 'required step="1000" min="1"')) +
    fld('Tanggal', '<input name="date" type="date" required value="' + esc(todayStr()) + '">') +
    fld('Untuk pembayaran', '<input name="purpose" required maxlength="160" placeholder="Misal: Sewa Kamar 101 bulan November">', '', 'full') +
    fld('Metode (opsional)', '<input name="method" maxlength="40" placeholder="Tunai / Transfer">') +
    fld('Penerima', '<input name="signer" maxlength="60" value="' + esc(k.ownerName || '') + '">') +
    '</div><div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Buat kwitansi</button></div></form>';
  const m = openModal('Kwitansi manual', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const amount = Number(f.get('amount')) || 0;
    if (amount <= 0) { toast('Jumlah harus lebih dari 0.', true); return false; }
    const d = f.get('date');
    try {
      await makeReceipt({ kos: k.name || 'Kos', address: k.address || '', owner: k.ownerName || '', signer: f.get('signer').trim(), no: 'KW-' + d.replace(/-/g, '') + '-' + String(Date.now()).slice(-4), from: f.get('from').trim(), amount, purpose: f.get('purpose').trim(), date: d, method: f.get('method').trim() });
    } catch (e) { toast('Kwitansi gagal dibuat. Coba lagi.', true); return false; }
  });
}
const KW_H = {
  'kw-wa': el => kwSendWa(el),
  wk: el => { UI.wk = el.dataset.v; render(); },
  'kw-manual': () => openKwManual()
};
document.addEventListener('change', e => { if (e.target.id === 'kw-period') { UI.wp = e.target.value; render(); } });
document.addEventListener('input', e => { if (e.target.id === 'kw-q') { UI.wq = e.target.value; render(); const q = document.getElementById('kw-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } } });

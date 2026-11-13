'use strict';
/* ============================================================
   BOOKING / DAFTAR TUNGGU: calon penghuni yang minta unit tertentu.
   Disimpan di users/<uid>/waitlist. Dimuat sebelum app.js.
   ============================================================ */
const BK_ST = { tunggu: 'Menunggu', masuk: 'Sudah masuk', batal: 'Batal' };
function bkList() {
  const f = UI.bk || 'tunggu';
  return Object.keys(S.waitlist).map(id => Object.assign({ id }, S.waitlist[id])).filter(b => b && (f === 'all' || (b.status || 'tunggu') === f))
    .sort((a, b) => String(a.moveIn || '9999').localeCompare(String(b.moveIn || '9999')) || (a.createdMs || 0) - (b.createdMs || 0));
}
function bookingOf(roomId) {
  if (!roomId || !S.waitlist) return null;
  const l = Object.keys(S.waitlist).map(id => Object.assign({ id }, S.waitlist[id])).filter(b => b && b.roomId === roomId && (b.status || 'tunggu') === 'tunggu')
    .sort((a, b) => String(a.moveIn || '9999').localeCompare(String(b.moveIn || '9999')));
  return l[0] || null;
}
function viewBooking() {
  const f = UI.bk || 'tunggu', n = s => Object.keys(S.waitlist).filter(id => (S.waitlist[id].status || 'tunggu') === s).length;
  const seg = (k, l, c) => '<button data-act="bk-f" data-v="' + k + '" aria-pressed="' + (f === k) + '">' + l + (c != null ? ' <span class="cnt">' + c + '</span>' : '') + '</button>';
  let h = '<div class="toolbar"><div class="seg">' + seg('tunggu', 'Menunggu', n('tunggu')) + seg('masuk', 'Sudah masuk', n('masuk')) + seg('batal', 'Batal', n('batal')) + seg('all', 'Semua') + '</div><button class="btn primary" data-act="bk-edit" data-id="" data-w>+ Calon penghuni</button></div>';
  const list = bkList();
  if (!list.length) return h + '<div class="empty"><h2>Belum ada booking</h2><p>Catat calon penghuni yang minta unit tertentu atau yang sedang menunggu ada yang kosong: nama, nomor WhatsApp, unit yang diminta, dan rencana tanggal masuk. Saat unitnya siap, tinggal klik Check-in.</p></div>';
  h += '<div class="bills">';
  list.forEach(b => {
    const r = b.roomId ? cur.roomsById[b.roomId] : null, st = b.status || 'tunggu';
    const free = r ? !r.tenant && !r.maintenance : null;
    const wa = b.phone ? waLink(b.phone, 'Halo ' + b.name + ', ' + (r ? (free ? unitNameId(b.roomId) + ' sekarang kosong dan siap ditempati' : 'kami kabari kalau ' + unitNameId(b.roomId) + ' sudah kosong') : 'kami kabari kalau ada unit kosong') + (b.moveIn ? '. Rencana masuk ' + fmtDate(b.moveIn) : '') + '. Terima kasih, ' + (cur.kos.name || '') + '.') : '';
    h += '<div class="bill"><span class="r">' + esc(r ? unitNameId(b.roomId) : 'Belum dipilih') + '</span><span class="w">' + esc(b.name) + (b.phone ? ' · ' + esc(b.phone) : '') + '</span><span class="d">' + (b.moveIn ? 'Rencana masuk ' + fmtDate(b.moveIn) : 'Tanggal masuk belum ditentukan') + (b.note ? ' · ' + esc(b.note) : '') + '</span>' +
      '<span class="a">' + (b.dp > 0 ? 'DP ' + rp(b.dp) : '') + '</span><span class="s">' + (st === 'tunggu' ? (r ? pill(free ? 'paid' : 'soon', free ? 'Unit kosong' : 'Unit terisi') : pill('soon', 'Menunggu')) : pill(st === 'masuk' ? 'paid' : 'late', BK_ST[st])) + '</span>' +
      '<span class="x">' + (st === 'tunggu' ? (wa ? '<a class="btn sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">WA</a>' : '') + '<button class="btn sm primary" data-act="bk-in" data-id="' + esc(b.id) + '" data-w>Check-in</button>' : '') + '<button class="btn sm" data-act="bk-edit" data-id="' + esc(b.id) + '" data-w>Ubah</button></span></div>';
  });
  return h + '</div>';
}
function openBooking(id) {
  const b = id ? S.waitlist[id] : null;
  const body = '<form class="sb" style="padding:0"><div class="formgrid">' +
    fld('Nama calon penghuni', '<input name="name" required maxlength="80" value="' + esc(b ? b.name : '') + '">', '', 'full') +
    fld('No. HP / WhatsApp', '<input name="phone" inputmode="tel" maxlength="20" value="' + esc(b ? b.phone : '') + '" placeholder="0812xxxxxxxx">') +
    fld('Rencana tanggal masuk', '<input name="moveIn" type="date" value="' + esc(b ? b.moveIn : '') + '">') +
    fld('Unit yang diminta', '<select name="roomId"><option value="">Belum ditentukan</option>' + cur.rooms.map(r => '<option value="' + esc(r.id) + '"' + (b && b.roomId === r.id ? ' selected' : '') + '>' + esc(unitName(r)) + (r.tenant ? ' (terisi)' : ' (kosong)') + '</option>').join('') + '</select>') +
    fld('Uang muka / DP (Rp, opsional)', numIn('dp', b ? b.dp || '' : '', 'step="1000" min="0"')) +
    fld('Status', '<select name="status">' + Object.keys(BK_ST).map(k => '<option value="' + k + '"' + ((b ? b.status || 'tunggu' : 'tunggu') === k ? ' selected' : '') + '>' + BK_ST[k] + '</option>').join('') + '</select>') +
    fld('Catatan', '<input name="note" maxlength="160" value="' + esc(b ? b.note : '') + '" placeholder="Misal: butuh kamar mandi dalam">', '', 'full') +
    '</div><div class="actions">' + (id ? '<button type="button" class="btn danger left" data-act="bk-del" data-confirm="Klik lagi untuk hapus" data-id="' + esc(id) + '">Hapus</button>' : '') + '<button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal(id ? 'Ubah booking' : 'Calon penghuni baru', body);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const data = { name: f.get('name').trim(), phone: f.get('phone').trim(), moveIn: f.get('moveIn') || '', roomId: f.get('roomId') || '', dp: Number(f.get('dp')) || 0, status: f.get('status') || 'tunggu', note: f.get('note').trim(), createdMs: b ? b.createdMs || Date.now() : Date.now() };
    if (!data.name) { toast('Nama wajib diisi.', true); return false; }
    await repo.set('waitlist', id || rid('b'), data);
    toast('Booking tersimpan');
  });
}
function bookingCheckin(id) {
  const b = S.waitlist[id]; if (!b) return;
  const r = b.roomId ? cur.roomsById[b.roomId] : null;
  if (r && r.tenant) { toast(unitNameId(b.roomId) + ' masih terisi. Check-out penghuninya dulu atau ubah unit yang diminta.', true); return; }
  openTenant('', r ? r.id : undefined);
  const m = document.querySelector('.modal'); if (!m) return;
  const set = (n, v) => { const el = m.querySelector('[name=' + n + ']'); if (el && v) el.value = v; };
  set('name', b.name); set('phone', b.phone);
  if (b.moveIn) { set('moveIn', b.moveIn); const mi = m.querySelector('#t-movein'); if (mi) mi.dispatchEvent(new Event('input', { bubbles: true })); }
  if (b.dp > 0) { const nt = m.querySelector('[name=note]'); if (nt && !nt.value) nt.value = 'DP booking ' + rp(b.dp); }
  toast('Data booking sudah terisi. Simpan, lalu tandai booking Sudah masuk.');
}
const BK_H = {
  'bk-f': el => { UI.bk = el.dataset.v; render(); },
  'bk-edit': el => openBooking(el.dataset.id || ''),
  'bk-in': el => bookingCheckin(el.dataset.id),
  'bk-del': el => { run(() => repo.del('waitlist', el.dataset.id)).then(ok => { if (ok) { closeModal(); toast('Booking dihapus'); } }); }
};

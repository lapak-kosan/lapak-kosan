'use strict';
/* ============================================================
   AKUN, VERIFIKASI, PAKET, DAN TAGIHAN LANGGANAN
   - Pendaftar baru berstatus "pending" sampai admin menyetujui.
   - Admin = akun yang punya dokumen admins/<uid> di Firestore.
   - Paket (plans) dibuat admin, dipilih pemilik saat daftar, dan
     menentukan tagihan bulanan serta batas jumlah kamar.
   Dimuat sebelum app.js; fungsi di sini memakai variabel app.js
   (S, cur, fdb, fbUser, UI, run, toast, dll) saat dipanggil.
   ============================================================ */
const ADMIN_TABS = ['daftar', 'abill', 'paket', 'achat', 'tampilan'];
let TD = null;
const ACC_STATUS = { pending: 'Menunggu', approved: 'Aktif', suspended: 'Ditangguhkan', rejected: 'Ditolak' };
let VIEW = null, ADMIN_PHOTO = '', ACC = null, isAdmin = false, PLANS = {}, PAYINFO = {}, MYPAY = {}, MYPROOF = {}, MYUP = {}, regInfo = null, lastProofN = -1;
let AD = { accounts: {}, pay: {}, proofs: {}, ups: {}, loaded: {}, err: '' };
const REG = { ownerName: '', phone: '', kosName: '', planId: '', mode: 'trial' };
/* free trial: gratis 1 bulan sejak disetujui admin, maksimal 3 unit (kamar kosan dan/atau kontrakan, bebas campur) */
const TRIAL_MAX = 3;
const TRIAL_PLAN = { name: 'Free Trial', price: 0, minRooms: 1, maxRooms: TRIAL_MAX, trial: true, desc: 'Gratis 1 bulan, maksimal ' + TRIAL_MAX + ' unit' };
const isTrial = a => !!a && !!a.trial && !(a.planId && PLANS[a.planId]);
const accPlan = a => (a && PLANS[a.planId]) || (isTrial(a) ? TRIAL_PLAN : null);
function addMonth(s) {
  const d = parseD(s); let y = d.getFullYear(), m = d.getMonth() + 1; if (m > 11) { m = 0; y++; }
  return y + '-' + pad(m + 1) + '-' + pad(Math.min(d.getDate(), new Date(y, m + 1, 0).getDate()));
}
const trialEndOf = a => (a && (a.trialEnd || (a.approvedAt ? addMonth(a.approvedAt) : ''))) || '';
const trialDaysLeft = a => { const e = trialEndOf(a); return e ? daysBetween(todayStr(), e) : null; };
function regModeSync() {
  const trial = REG.mode === 'trial', w = $('#r-plan-wrap'), sel = $('#r-plan');
  if (w) w.hidden = trial;
  if (sel) { sel.required = !trial; sel.disabled = trial; }
  const n = $('#r-trialnote'); if (n) n.hidden = !trial;
}
const SESS = { un: [], adminChecked: false, accLoaded: false, err: '', adminOn: false, subOn: false, payLoaded: false };
let creatingAcc = false, lastRC = -1;

const fsClean = d => JSON.parse(JSON.stringify(d));
const fsSet = (path, data) => fdb.doc(path).set(fsClean(data), { merge: true });
const planList = onlyActive => Object.keys(PLANS).map(id => Object.assign({ id }, PLANS[id])).filter(p => !onlyActive || p.active !== false).sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0) || String(a.name).localeCompare(String(b.name)));
const planRange = p => Number(p.maxRooms) > 0 ? (Number(p.minRooms) || 1) + '–' + Number(p.maxRooms) + ' unit' : 'Unit tanpa batas';
const planLabel = p => p.name + ' · ' + rp(p.price) + '/bulan · ' + planRange(p);
const planSig = () => planList(true).map(p => p.id + ':' + p.name + ':' + p.price + ':' + p.maxRooms).join(',');

/* ---------- data publik (paket dan info bayar), dibaca sebelum login ---------- */
function startPublic() {
  fdb.collection('plans').onSnapshot(snap => { PLANS = {}; snap.docs.forEach(d => { PLANS[d.id] = d.data(); }); schedule(); }, () => {});
  fdb.doc('site/theme').onSnapshot(s => { setTheme(s.exists ? s.data() : null); schedule(); }, () => {});
  fdb.doc('site/payinfo').onSnapshot(s => { PAYINFO = s.exists ? s.data() : {}; schedule(); }, () => {});
}

/* ---------- sesi: admin atau pemilik ---------- */
function sessStart(u) {
  const uid = u.uid;
  SESS.un.push(fdb.doc('admins/' + uid).onSnapshot(s => { isAdmin = !!s.exists; ADMIN_PHOTO = (s.exists && s.data().photo) || ''; SESS.adminChecked = true; sessStep(); schedule(); }, () => { isAdmin = false; SESS.adminChecked = true; sessStep(); schedule(); }));
  SESS.un.push(fdb.doc('accounts/' + uid).onSnapshot(s => { ACC = s.exists ? s.data() : null; SESS.accLoaded = true; sessStep(); schedule(); }, e => { SESS.err = (e && e.code) || 'error'; SESS.accLoaded = true; schedule(); }));
}
function sessStop() {
  SESS.un.forEach(f => { try { f(); } catch (e) {} });
  SESS.un = []; SESS.adminChecked = false; SESS.accLoaded = false; SESS.err = ''; SESS.adminOn = false; SESS.subOn = false; SESS.payLoaded = false;
  chatStop(); VIEW = null; canWrite = true; ACC = null; isAdmin = false; ADMIN_PHOTO = ''; MYPAY = {}; MYPROOF = {}; MYUP = {}; AD = { accounts: {}, pay: {}, proofs: {}, ups: {}, loaded: {}, err: '' }; creatingAcc = false; lastRC = -1; lastProofN = -1; TD = null; syncBrand();
}
const sessReady = () => SESS.adminChecked && SESS.accLoaded;
function sessStep() {
  if (!fbUser || !sessReady()) return;
  if (isAdmin) { startAdminData(); chatStart(); if (repo && !VIEW) stopOwner(); return; }
  if (!ACC) { createAccount(); return; }
  startMySub(); chatStart();
  if (ACC.status === 'approved') {
    if (!repo) { repo = dbRepo(fdb, fbUser.uid); mode = 'db'; repo.start(schedule); }
  } else if (repo) stopOwner();
}
async function createAccount() {
  if (creatingAcc || !fbUser) return;
  creatingAcc = true;
  const r = regInfo || {};
  try {
    await fdb.doc('accounts/' + fbUser.uid).set(fsClean({ email: fbUser.email || '', ownerName: r.ownerName || '', phone: r.phone || '', kosName: r.kosName || '', planId: r.planId || '', trial: !!r.trial, status: 'pending', createdAt: todayStr(), createdMs: Date.now(), roomCount: 0 }));
    regInfo = null;
  } catch (e) { SESS.err = (e && e.code) || 'error'; }
  creatingAcc = false; schedule();
}
function startAdminData() {
  if (SESS.adminOn) return; SESS.adminOn = true;
  const watch = (col, key, flag) => SESS.un.push(fdb.collection(col).onSnapshot(snap => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); AD[key] = m; AD.loaded[flag] = true; schedule();
  }, e => { AD.loaded[flag] = true; AD.err = (e && e.code) || 'error'; schedule(); }));
  watch('accounts', 'accounts', 'a'); watch('subPayments', 'pay', 'p'); watch('proofs', 'proofs', 'r'); watch('upgrades', 'ups', 'u');
}
function startMySub() {
  if (SESS.subOn) return; SESS.subOn = true;
  SESS.un.push(fdb.collection('subPayments').where('tenantId', '==', fbUser.uid).onSnapshot(snap => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); MYPAY = m; SESS.payLoaded = true; schedule();
  }, () => { SESS.payLoaded = true; schedule(); }));
  SESS.un.push(fdb.collection('proofs').where('tenantId', '==', fbUser.uid).onSnapshot(snap => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); MYPROOF = m; schedule();
  }, () => {}));
  SESS.un.push(fdb.collection('upgrades').where('tenantId', '==', fbUser.uid).onSnapshot(snap => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); MYUP = m; schedule();
  }, () => {}));
}
/* jumlah kamar dilaporkan pemilik ke admin supaya batas paket bisa dipantau */
function syncRoomCount(n) {
  if (!ACC || n === lastRC || n === (Number(ACC.roomCount) || 0)) return;
  lastRC = n;
  fdb.doc('accounts/' + fbUser.uid).update({ roomCount: n }).catch(() => {});
}

/* ---------- tagihan langganan (memakai mesin tagihan yang sama dengan sewa kamar) ---------- */
function subBills(accts, pays, horizon) {
  const t = {};
  Object.keys(accts).forEach(id => {
    const a = accts[id], p = a && PLANS[a.planId];
    if (!a || !p || !a.approvedAt || (a.status !== 'approved' && a.status !== 'suspended')) return;
    t[id] = { moveIn: a.approvedAt, rent: Number(p.price) || 0, moveOut: a.endDate || '', roomId: '' };
  });
  const today = todayStr();
  return deriveBills(t, pays, today, horizon == null ? 14 : horizon).map(b => Object.assign(b, { st: billStatus(b, today) }));
}
const ownSubBills = () => (ACC && fbUser) ? subBills({ [fbUser.uid]: ACC }, MYPAY) : [];
const adminSubBills = () => { const a = Object.assign({}, AD.accounts); if (fbUser) delete a[fbUser.uid]; return subBills(a, AD.pay); };
const planOfAcc = () => accPlan(ACC);
/* sisa kamar yang boleh ditambah; Infinity bila paket tanpa batas atau belum ada paket */
function roomsLeft() {
  const p = planOfAcc(), max = p ? Number(p.maxRooms) || 0 : 0;
  return max > 0 ? max - cur.rooms.length : Infinity;
}
const planWord = p => (p.trial || /^paket\b/i.test(p.name)) ? '' : 'Paket ';
function limitMsg() { const p = planOfAcc(); return planWord(p) + p.name + ' maksimal ' + p.maxRooms + ' unit (kamar dan kontrakan, dihitung gabungan). Buka tab Langganan untuk ' + (p.trial ? 'memilih paket.' : 'naik paket.'); }
const subPillFor = a => ({ pending: pill('soon', 'Menunggu verifikasi'), approved: pill('paid', 'Aktif'), suspended: pill('late', 'Ditangguhkan'), rejected: pill('later', 'Ditolak') }[a.status] || pill('later', a.status || '-'));
const adminWaMsg = (what) => 'Halo admin Lapak Kosan, ' + what;

/* ---------- layar status untuk pemilik yang belum aktif ---------- */
function payInfoBox(title, fallback) {
  const raw = String(PAYINFO.payText || '').trim(), head = esc(title || 'Cara pembayaran');
  if (!raw) return fallback ? '<div class="paybox"><b>' + head + '</b><p class="pb-text">' + esc(fallback) + '</p></div>' : '';
  /* nomor rekening = deret angka terpanjang (minimal 8 digit) di teks cara pembayaran */
  let best = null;
  for (const m of raw.matchAll(/\d[\d .-]{5,}\d/g)) { const d = m[0].replace(/\D/g, ''); if (d.length >= 8 && (!best || d.length > best.d.length)) best = { i: m.index, t: m[0], d }; }
  const copyBtn = v => '<button type="button" class="btn sm" data-act="copy-pay" data-copy="' + esc(v) + '">Salin</button>';
  if (!best) return '<div class="paybox"><b>' + head + '</b><p class="pb-text">' + esc(raw) + '</p><div class="pb-row" style="justify-content:flex-end;background:none;border:0;padding:0">' + copyBtn(raw) + '</div></div>';
  const pre = raw.slice(0, best.i).trim(), post = raw.slice(best.i + best.t.length).trim();
  const shown = /^\d+$/.test(best.t) ? best.d.replace(/(\d{4})(?=\d)/g, '$1 ') : best.t.trim();
  return '<div class="paybox"><b>' + head + '</b>' + (pre ? '<p class="pb-text">' + esc(pre) + '</p>' : '') +
    '<div class="pb-row"><code class="pb-num">' + esc(shown) + '</code>' + copyBtn(best.d) + '</div>' +
    (post ? '<p class="pb-text">' + esc(post) + '</p>' : '') + '</div>';
}
function statusCard() {
  const a = ACC, p = PLANS[a.planId];
  const wa = PAYINFO.wa ? waLink(PAYINFO.wa, adminWaMsg('saya ' + (a.ownerName || a.email) + (a.kosName ? ' (' + a.kosName + ')' : '') + ', mau menanyakan akun saya.')) : '';
  const waBtn = wa ? '<a class="btn primary lg" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Hubungi admin lewat WhatsApp</a>' : '';
  const kv = '<dl class="kv"><div><dt>Email</dt><dd>' + esc(a.email) + '</dd></div>' + (a.kosName ? '<div><dt>Kos</dt><dd>' + esc(a.kosName) + '</dd></div>' : '') + '<div><dt>Paket</dt><dd>' + (p ? esc(planLabel(p)) : isTrial(a) ? 'Free Trial 1 bulan · maksimal ' + TRIAL_MAX + ' unit' : 'Belum dipilih') + '</dd></div></dl>';
  const out = '<button type="button" class="btn sm g-link" data-act="logout">Keluar</button>';
  const note = a.adminNote ? '<div class="duebox"><b>Catatan admin</b><span>' + esc(a.adminNote) + '</span></div>' : '';
  if (a.status === 'rejected') return '<div class="g-card"><h2>Pendaftaran ditolak</h2><p class="muted">Admin belum bisa menyetujui pendaftaran ini.</p>' + kv + note + waBtn + out + '</div>';
  if (a.status === 'suspended') {
    const un = ownSubBills().filter(b => !b.paid && (b.st.k === 'late' || b.st.k === 'soon'));
    return '<div class="g-card"><h2>Akun ditangguhkan</h2><p class="muted">Data kos kamu aman dan tidak hilang. Akun aktif lagi setelah admin mengaktifkannya' + (un.length ? '. Tagihan langganan yang belum dibayar: ' + un.map(b => esc(fmtPeriod(b.period)) + ' ' + rp(b.amount)).join(', ') : '') + '.</p>' + kv + note + payInfoBox() + waBtn + out + '</div>';
  }
  return '<div class="g-card"><h2>Menunggu verifikasi</h2><p class="muted">Pendaftaran kamu sudah masuk. Admin memeriksa dulu sebelum akun bisa dipakai.' + (a.trialEnd ? ' Free trial kamu sudah selesai dan paket pilihanmu sudah diajukan. Datamu selama trial tetap aman dan terbuka lagi setelah disetujui.' : '') + (isTrial(a) ? ' Masa free trial 1 bulan mulai dihitung sejak akun disetujui.' : '') + ' Halaman ini otomatis berganti begitu disetujui.</p>' + kv + (isTrial(a) ? '' : payInfoBox()) + waBtn + out + '<p class="g-note">ID akun: <code style="user-select:all">' + esc(fbUser.uid) + '</code></p></div>';
}
function sessErrCard() {
  return '<div class="g-card"><h2>Akun belum bisa dimuat</h2><p class="muted">Kode: ' + esc(SESS.err) + '. Pastikan aturan Firestore terbaru sudah dipublish di Firebase, lalu muat ulang halaman.</p><button type="button" class="btn sm g-link" data-act="logout">Keluar</button></div>';
}

/* ---------- tampilan pemilik: Langganan ---------- */
function viewSub() {
  const p = planOfAcc(), bills = ownSubBills(), cnt = cur.rooms.length, max = p ? Number(p.maxRooms) || 0 : 0;
  const unpaid = bills.filter(b => !b.paid).sort((a, b) => a.due < b.due ? -1 : 1);
  const next = unpaid[0], trial = isTrial(ACC), tl = trial ? trialDaysLeft(ACC) : null;
  const pct = max ? Math.min(100, Math.round(cnt / max * 100)) : 0;
  let h = '<div class="toolbar">' + (bills.length ? exBtns('langganan', 'exr') : '') + '</div><div class="stats3"><div class="stat"><span>Paket kamu</span><b>' + (p ? esc(p.name) : 'Belum ada paket') + '</b><small>' + (p ? rp(p.price) + ' / bulan · ' + planRange(p) : 'Hubungi admin untuk memilih paket.') + '</small></div>' +
    '<div class="stat' + (max && cnt > max ? ' s-bad' : '') + '"><span>Unit terpakai</span><b>' + cnt + (max ? ' dari ' + max : '') + '</b><small>' + (max ? (cnt > max ? 'Melebihi batas paket' : 'Sisa ' + (max - cnt) + ' unit') : 'Tanpa batas') + '</small>' + (max ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') + '</div>' +
    (trial ? '<div class="stat' + (tl != null && tl <= 7 ? ' s-warn' : '') + '"><span>Masa free trial</span><b>' + (tl == null ? '-' : tl > 0 ? tl + ' hari lagi' : 'Berakhir') + '</b><small>' + (trialEndOf(ACC) ? 'Sampai ' + esc(fmtDate(trialEndOf(ACC))) : 'Dihitung sejak akun disetujui') + '</small></div>' : '<div class="stat' + (next && next.st.k === 'late' ? ' s-bad' : next && next.st.k === 'soon' ? ' s-warn' : '') + '"><span>Tagihan berikutnya</span><b>' + (next ? rp(next.amount) : 'Lunas') + '</b><small>' + (next ? esc(fmtPeriod(next.period)) + ' · ' + esc(statusText(next).toLowerCase()) : 'Tidak ada tagihan yang menunggu.') + '</small></div>') + '</div>';
  h += payInfoBox() ? '<div style="margin-bottom:1rem">' + payInfoBox() + '</div>' : '';
  h += trial ? trialSection() : upgradeSection();
  if (!bills.length) return h + '<div class="empty"><h2>' + (trial ? 'Free trial tidak ada tagihan' : 'Belum ada tagihan langganan') + '</h2><p>' + (trial ? 'Pilih paket sebelum masa trial habis supaya akun tetap bisa dipakai. Datamu tidak hilang.' : p ? 'Tagihan pertama muncul sesuai tanggal mulai langganan.' : 'Tagihan muncul setelah admin menetapkan paket untuk akunmu.') + '</p></div>';
  h += '<div class="bills">';
  bills.sort((a, b) => a.due < b.due ? 1 : -1).forEach(b => {
    h += '<div class="bill"><span class="r">' + esc(parseD(b.period + '-01').toLocaleDateString('id-ID', { month: 'short' })) + '</span><span class="w">Langganan ' + esc(p ? p.name : '') + '</span><span class="d">' + esc(fmtPeriod(b.period)) + ' · tempo ' + fmtDate(b.due) + '</span><span class="a">' + rp(b.amount) + '</span><span class="s">' + pill(b.st.k, statusText(b)) + '</span><span class="x">' +
      (b.paid ? '<span class="muted" style="font-size:.8rem;align-self:center">Dibayar ' + fmtDate(b.pay.paidAt) + (b.pay.method ? ' · ' + esc(b.pay.method) : '') + '</span>' : ((MYPROOF[b.id] && MYPROOF[b.id].status === 'pending') ? pill('soon', 'Bukti menunggu diperiksa') : '<label class="btn sm primary" style="cursor:pointer">Upload bukti bayar<input type="file" class="proof-file" data-bill="' + esc(b.id) + '" accept="image/*" hidden></label>')) + '</span></div>';
  });
  return h + '</div>';
}

/* ---------- free trial: pilih paket berbayar (lewat chat admin) ---------- */
function trialSection() {
  const opts = planList(true);
  if (!opts.length) return '';
  let h = '<section class="floor"><div class="floor-h"><h2>Lanjut ke paket berbayar</h2><span>Free trial maksimal ' + TRIAL_MAX + ' unit</span></div><p class="hint-top">Pilih paket yang cocok, lalu kabari admin lewat Chat. Admin mengaktifkan paketnya dan tagihan bulanan mulai dari hari itu. Data kos tidak berubah.</p><div class="tgrid">';
  opts.forEach(x => {
    h += '<article class="tcard"><div class="thead"><div class="ph">' + Math.round((Number(x.price) || 0) / 1000) + 'rb</div><div style="min-width:0"><h3>' + esc(x.name) + '</h3><p>' + esc(planRange(x)) + '</p></div></div><dl class="tmeta"><div><dt>Harga / bulan</dt><dd class="mono">' + rp(x.price) + '</dd></div>' + (x.desc ? '<div class="due"><dt>Keterangan</dt><dd>' + esc(x.desc) + '</dd></div>' : '') + '</dl><div class="tfoot"><button class="btn sm primary" data-act="trial-pick" data-id="' + esc(x.id) + '">Pilih dan chat admin</button></div></article>';
  });
  return h + '</div></section>';
}
function trialEndCard() {
  const opts = planList(true), wa = PAYINFO.wa ? waLink(PAYINFO.wa, adminWaMsg('saya ' + (ACC.ownerName || '') + (ACC.kosName ? ' (' + ACC.kosName + ')' : '') + ', free trial saya sudah habis dan saya mau lanjut ke paket berbayar.')) : '';
  return '<div class="g-card"><h2>Free trial selesai</h2><p class="muted">Masa free trial 1 bulan' + (trialEndOf(ACC) ? ' (sampai ' + esc(fmtDate(trialEndOf(ACC))) + ')' : '') + ' sudah habis. Datamu aman dan tidak dihapus. Pilih paket yang mau diambil di bawah.</p>' +
    (opts.length ? '<div class="bills">' + opts.map(x => '<div class="bill" style="grid-template-columns:minmax(0,1fr) auto;grid-template-areas:\'d a\' \'x x\'"><span class="d" style="font-size:.9rem;color:var(--ink);font-weight:600">' + esc(x.name) + ' <span class="muted" style="font-weight:400">· ' + esc(planRange(x)) + '</span></span><span class="a">' + rp(x.price) + '/bln</span><span class="x" style="justify-content:flex-start"><button type="button" class="btn sm primary" data-act="trial-end-pick" data-confirm="Klik lagi untuk ajukan paket ini" data-id="' + esc(x.id) + '">Pilih paket ini</button></span></div>').join('') + '</div><p class="g-note">Setelah memilih paket, akunmu diperiksa admin seperti pendaftaran biasa. Begitu disetujui, semua datamu selama trial langsung bisa dipakai lagi.</p>' : '') +
    payInfoBox() + (wa ? '<a class="btn primary lg" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Lanjut paket lewat WhatsApp admin</a>' : '<p class="g-note">Hubungi admin untuk memilih paket.</p>') +
    '<button type="button" class="btn sm g-link" data-act="logout">Keluar</button></div>';
}

/* ---------- naik paket (pemilik): pilih paket, bayar selisih, upload bukti; admin yang memverifikasi ---------- */
const UP_FULL_DAYS = 3;
/* Naik paket sebelum H-3 jatuh tempo berikutnya: bayar selisih saja. Mulai H-3 (atau sudah lewat): bayar penuh harga paket baru,
   sekaligus melunasi tagihan periode berikutnya. */
function upgradeTiming() {
  const next = subBills({ [fbUser.uid]: ACC }, MYPAY, 45).filter(b => !b.paid).sort((a, b) => a.due < b.due ? -1 : 1)[0];
  if (!next) return { full: false, bill: null, days: null, due: '' };
  const days = daysBetween(todayStr(), next.due);
  return { full: days <= UP_FULL_DAYS, bill: next, days, due: next.due };
}
function upgradeAmount(t, tm) { const price = Number(planOfAcc().price) || 0, np = Number(t.price) || 0; return tm.full ? np : np - price; }
const upgradeWhy = tm => tm.full
  ? 'Masa paket lama tinggal ' + Math.max(0, tm.days) + ' hari (jatuh tempo ' + fmtDate(tm.due) + '), jadi bayar penuh harga paket baru. Pembayaran ini sekaligus melunasi tagihan ' + fmtPeriod(tm.bill.period) + '.'
  : 'Paket lama masih aktif' + (tm.due ? ' sampai ' + fmtDate(tm.due) : '') + ', jadi cukup bayar selisih harganya. Penuh baru dibayar mulai H-' + UP_FULL_DAYS + ' sebelum jatuh tempo.';
const myUps = () => Object.keys(MYUP).map(id => Object.assign({ id }, MYUP[id])).sort((a, b) => (b.sentMs || 0) - (a.sentMs || 0));
function upgradeSection() {
  const p = planOfAcc(); if (!p) return '';
  const price = Number(p.price) || 0, ups = myUps(), pend = ups.find(u => u.status === 'pending'), last = ups[0];
  const opts = planList(true).filter(x => x.id !== ACC.planId && (Number(x.price) || 0) > price);
  const full = Number(p.maxRooms) > 0 && cur.rooms.length >= Number(p.maxRooms), tm = upgradeTiming();
  let h = '';
  if (pend) {
    const t = PLANS[pend.planId] || {};
    return '<div class="duebox" style="margin-bottom:1rem"><b>Permintaan naik ke ' + esc(t.name || 'paket baru') + ' menunggu verifikasi</b><span>Bukti bayar ' + rp(pend.amount) + ' sudah terkirim ' + esc(fmtDate(pend.sentAt)) + '. Paketmu otomatis naik begitu admin memverifikasi. Datamu tidak berubah.</span></div>';
  }
  if (last && last.status === 'rejected') h += '<div class="banner" style="margin-bottom:1rem">Permintaan naik paket ditolak' + (last.adminNote ? ': ' + esc(last.adminNote) : '') + '. Kamu bisa memilih paket dan mengirim bukti lagi.</div>';
  if (!opts.length) return h;
  h += '<section class="floor"><div class="floor-h"><h2>Naik paket</h2><span>' + (full ? 'Kuota unit sudah penuh' : 'Butuh lebih banyak unit?') + '</span></div><p class="hint-top">' + esc(upgradeWhy(tm)) + '</p><div class="tgrid">';
  opts.forEach(x => {
    const diff = upgradeAmount(x, tm);
    h += '<article class="tcard"><div class="thead"><div class="ph">' + Math.round((Number(x.price) || 0) / 1000) + 'rb</div><div style="min-width:0"><h3>' + esc(x.name) + '</h3><p>' + esc(planRange(x)) + '</p></div></div><dl class="tmeta"><div><dt>Harga / bulan</dt><dd class="mono">' + rp(x.price) + '</dd></div><div><dt>Bayar sekarang' + (tm.full ? ' (penuh)' : ' (selisih)') + '</dt><dd class="mono">' + rp(diff) + '</dd></div>' + (x.desc ? '<div class="due"><dt>Keterangan</dt><dd>' + esc(x.desc) + '</dd></div>' : '') + '</dl><div class="tfoot"><button class="btn sm primary" data-act="up-pick" data-id="' + esc(x.id) + '">Pilih paket ini</button></div></article>';
  });
  return h + '</div></section>';
}
function openUpgrade(planId) {
  const p = planOfAcc(), t = PLANS[planId];
  if (!p || !t || t.active === false || (Number(t.price) || 0) <= (Number(p.price) || 0)) { toast('Paket tidak tersedia.', true); return; }
  if (myUps().some(u => u.status === 'pending')) { toast('Masih ada permintaan yang menunggu verifikasi.', true); return; }
  const tm = upgradeTiming(), diff = upgradeAmount(t, tm);
  const b = '<form class="sb" style="padding:0"><dl class="kv"><div><dt>Paket sekarang</dt><dd>' + esc(planLabel(p)) + '</dd></div><div><dt>Paket baru</dt><dd>' + esc(planLabel(t)) + '</dd></div><div><dt>Bayar sekarang (' + (tm.full ? 'harga penuh' : 'selisih harga') + ')</dt><dd><b>' + rp(diff) + '</b></dd></div></dl><p class="muted" style="margin:.2rem 0 .8rem;font-size:.88rem">' + esc(upgradeWhy(tm)) + '</p>' +
    payInfoBox() +
    '<div class="formgrid">' + fld('Foto bukti transfer', '<input name="img" type="file" accept="image/*" required>', 'Setelah admin memverifikasi, paket langsung naik tanpa mengubah data kos kamu. Tagihan bulan berikutnya mengikuti harga paket baru.', 'full') + '</div>' +
    '<div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Kirim bukti dan ajukan</button></div></form>';
  const m = openModal('Naik ke ' + t.name, b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const file = f.get('img');
    if (!file || !file.size) { toast('Pilih foto bukti transfer dulu.', true); return false; }
    let img;
    try { img = await resizePhoto(file, 1100, 0.7); if (img.length > 650000) img = await resizePhoto(file, 800, 0.6); } catch (e) { toast('Foto tidak bisa dibaca. Coba foto lain.', true); return false; }
    if (img.length > 650000) { toast('Foto terlalu besar. Coba foto lain atau screenshot bukti transfer.', true); return false; }
    await fdb.doc('upgrades/' + fbUser.uid + '_' + Date.now()).set({ tenantId: fbUser.uid, planId, fromPlanId: ACC.planId || '', amount: diff, full: tm.full, billId: tm.full && tm.bill ? tm.bill.id : '', image: img, sentAt: todayStr(), sentMs: Date.now(), status: 'pending' });
    toast('Terkirim. Paket naik otomatis setelah admin memverifikasi.');
  });
}

/* ---------- tampilan admin ---------- */
function renderAdmin() {
  const main = $('#main'), g = $('#gate');
  if (!(AD.loaded.a && AD.loaded.p)) { document.body.classList.add('gated'); g.innerHTML = LOADING; return; }
  document.body.classList.remove('gated');
  authSig = ''; lastGateSig = '';
  $('#kosname').textContent = 'Admin ' + APP(); $('#kossub').textContent = ''; syncMe();
  const tab = effTab();
  if (tab === 'tampilan') { if (!TD) TD = themeDraft(); applyTheme(TD); } else if (TD) { TD = null; applyTheme(THEME); }
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
  const all = Object.keys(AD.accounts).filter(id => id !== fbUser.uid).map(id => AD.accounts[id]);
  const pend = all.filter(a => a.status === 'pending').length, lateN = adminSubBills().filter(b => b.st.k === 'late' || (b.st.k === 'soon' && b.st.d <= 3)).length, proofN = pendingProofs().length, upN = pendingUps().length;
  renderBell([
    { tab: 'daftar', n: pend, text: pend + ' pendaftar menunggu verifikasi' },
    { tab: 'abill', n: proofN, text: proofN + ' bukti bayar menunggu diperiksa' },
    { tab: 'abill', n: upN, text: upN + ' permintaan naik paket' },
    { tab: 'abill', n: lateN, text: lateN + ' tagihan langganan telat atau jatuh tempo ≤ 3 hari' }
  ].concat(chatNotes()));
  if (tab !== 'achat') chatUnwatch();
  notifyProofs();
  let html = '';
  if (AD.err) html += '<div class="banner">Sebagian data gagal dimuat (' + esc(AD.err) + '). Pastikan aturan Firestore terbaru sudah dipublish, lalu muat ulang.</div>';
  html += ({ daftar: viewAccounts, abill: viewAdminBills, paket: viewPlans, achat: viewAdminChat, tampilan: viewTheme }[tab])();
  setMain(main, html);
}
function accList() {
  return Object.keys(AD.accounts).filter(id => id !== fbUser.uid).map(id => Object.assign({ id }, AD.accounts[id]));
}
function viewAccounts() {
  const all = accList(), q = (UI.aq || '').trim().toLowerCase();
  const cnt = k => all.filter(a => a.status === k).length;
  const monthly = all.filter(a => a.status === 'approved').reduce((n, a) => n + (Number((PLANS[a.planId] || {}).price) || 0), 0);
  const bills = adminSubBills(), byAcc = {};
  bills.forEach(b => { if (!b.paid) { const c = byAcc[b.tenantId]; if (!c || b.due < c.due) byAcc[b.tenantId] = b; } });
  let list = UI.af === 'all' ? all.slice() : all.filter(a => a.status === UI.af);
  if (q) list = list.filter(a => [a.ownerName, a.kosName, a.email, a.phone].join(' ').toLowerCase().indexOf(q) >= 0);
  list.sort((a, b) => UI.af === 'pending' ? (a.createdMs || 0) - (b.createdMs || 0) : String(a.kosName || a.email).localeCompare(String(b.kosName || b.email), 'id'));
  const seg = (k, l, n) => '<button data-act="af" data-v="' + k + '" aria-pressed="' + (UI.af === k) + '">' + l + ' <span class="cnt">' + n + '</span></button>';
  let h = '<div class="stats3"><div class="stat' + (cnt('pending') ? ' s-warn' : '') + '"><span>Menunggu verifikasi</span><b>' + cnt('pending') + ' akun</b><small>Setujui atau tolak di bawah.</small></div><div class="stat"><span>Akun aktif</span><b>' + cnt('approved') + ' akun</b><small>' + all.filter(a => a.status === 'approved' && isTrial(a)).length + ' free trial · ' + cnt('suspended') + ' ditangguhkan · ' + cnt('rejected') + ' ditolak</small></div><div class="stat"><span>Perkiraan pendapatan / bulan</span><b>' + rp(monthly) + '</b><small>Dari paket akun aktif</small></div></div>';
  h += '<div class="toolbar"><div class="seg">' + seg('pending', 'Menunggu', cnt('pending')) + seg('approved', 'Aktif', cnt('approved')) + seg('suspended', 'Ditangguhkan', cnt('suspended')) + seg('rejected', 'Ditolak', cnt('rejected')) + seg('all', 'Semua', all.length) + '</div><div class="grow"><input id="aq" type="search" placeholder="Cari nama, kos, email, atau HP" value="' + esc(UI.aq || '') + '" aria-label="Cari akun"></div>' + exBtns('daftar') + '</div>';
  if (!list.length) return h + '<div class="empty"><h2>' + (q ? 'Tidak ada hasil' : UI.af === 'pending' ? 'Tidak ada yang menunggu' : 'Belum ada akun') + '</h2><p>' + (UI.af === 'pending' && !q ? 'Pendaftar baru muncul di sini dan harus kamu setujui dulu sebelum bisa masuk.' : 'Ubah filter atau kata kunci.') + '</p></div>';
  const card = a => {
    const p = accPlan(a), nb = byAcc[a.id], max = p ? Number(p.maxRooms) || 0 : 0, over = max && (Number(a.roomCount) || 0) > max;
    const wa = a.phone ? waLink(a.phone, 'Halo ' + (a.ownerName || '') + ', ini admin Lapak Kosan. ') : '';
    const cell = (l, v) => '<div><dt>' + l + '</dt><dd>' + v + '</dd></div>';
    let meta = cell('Email', esc(a.email || '-')) + cell('No. WhatsApp', esc(a.phone || '-')) + cell('Paket', !a.trial && a.trialEnd && a.status === 'pending' && p ? esc(p.name) + ' · ' + rp(p.price) + ' <small>(lanjut dari free trial)</small>' : p && p.trial ? 'Free Trial' + (trialEndOf(a) && a.status === 'approved' ? ' · sampai ' + esc(fmtDate(trialEndOf(a))) : '') : p ? esc(p.name) + ' · <span class="mono">' + rp(p.price) + '</span>' : '<b style="color:var(--bad)">Belum dipilih</b>') + cell('Unit', (Number(a.roomCount) || 0) + (max ? ' dari ' + max : '') + (over ? ' ' + pill('late', 'Melebihi paket') : '')) + cell('Daftar', fmtDate(a.createdAt));
    if (a.approvedAt) meta += cell('Mulai langganan', fmtDate(a.approvedAt));
    if (nb) meta += '<div class="due"><dt>Tagihan ' + esc(fmtPeriod(nb.period)) + '</dt><dd>' + pill(nb.st.k, statusText(nb)) + ' · ' + rp(nb.amount) + '</dd></div>';
    if (a.adminNote) meta += '<div class="due"><dt>Catatan admin</dt><dd>' + esc(a.adminNote) + '</dd></div>';
    let acts = '';
    if (a.status === 'pending') acts = '<button class="btn sm primary" data-act="acc-approve" data-confirm="Klik lagi untuk setujui" data-id="' + esc(a.id) + '">Setujui</button><button class="btn sm danger" data-act="acc-reject" data-confirm="Klik lagi untuk tolak" data-id="' + esc(a.id) + '">Tolak</button>';
    else if (a.status === 'approved') acts = '<button class="btn sm danger" data-act="acc-suspend" data-confirm="Klik lagi untuk tangguhkan" data-id="' + esc(a.id) + '">Tangguhkan</button>';
    else acts = '<button class="btn sm primary" data-act="acc-approve" data-confirm="Klik lagi untuk aktifkan" data-id="' + esc(a.id) + '">Aktifkan</button>';
    return '<article class="tcard' + (a.status === 'rejected' ? ' out' : '') + '"><div class="thead"><div class="ph">' + esc(initials(a.kosName || a.ownerName || a.email)) + '</div><div style="min-width:0"><h3>' + esc(a.kosName || '(Nama kos belum diisi)') + '</h3><p>' + esc(a.ownerName || '-') + '</p></div></div><dl class="tmeta">' + meta + '</dl><div class="tfoot">' + subPillFor(a) + (wa ? '<a class="btn sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">WA</a>' : '') + acts + '<button class="btn sm" data-act="view-owner" data-id="' + esc(a.id) + '">Lihat data</button><button class="btn sm" data-act="acc-open" data-id="' + esc(a.id) + '">Detail</button></div></article>';
  };
  return h + '<div class="tgrid">' + list.map(card).join('') + '</div>';
}
function openAccount(id) {
  const a = AD.accounts[id]; if (!a) return;
  const plans = planList(false);
  const b = '<form class="sb" style="padding:0"><dl class="kv"><div><dt>Email</dt><dd>' + esc(a.email || '-') + '</dd></div><div><dt>Pemilik</dt><dd>' + esc(a.ownerName || '-') + '</dd></div><div><dt>Kos</dt><dd>' + esc(a.kosName || '-') + '</dd></div><div><dt>WhatsApp</dt><dd>' + esc(a.phone || '-') + '</dd></div><div><dt>Daftar</dt><dd>' + fmtDate(a.createdAt) + '</dd></div><div><dt>Jumlah unit</dt><dd>' + (Number(a.roomCount) || 0) + '</dd></div></dl><div class="formgrid">' +
    fld('Status', '<select name="status">' + Object.keys(ACC_STATUS).map(k => '<option value="' + k + '"' + (a.status === k ? ' selected' : '') + '>' + ACC_STATUS[k] + '</option>').join('') + '</select>') +
    fld('Paket', '<select name="planId"><option value="">' + (isTrial(a) ? '- Free Trial (maks ' + TRIAL_MAX + ' unit) -' : '- belum dipilih -') + '</option>' + (isTrial(a) ? '' : '<option value="__trial">Free Trial 1 bulan (maks ' + TRIAL_MAX + ' unit)</option>') + plans.map(p => '<option value="' + esc(p.id) + '"' + (a.planId === p.id ? ' selected' : '') + '>' + esc(planLabel(p)) + (p.active === false ? ' (nonaktif)' : '') + '</option>').join('') + '</select>', 'Harga tagihan bulanan mengikuti paket ini.', 'full') +
    fld(isTrial(a) ? 'Mulai free trial' : 'Mulai langganan', '<input name="approvedAt" type="date" value="' + esc(a.approvedAt || '') + '">', 'Kosong = hari ini saat disetujui. Tanggal ini juga jadi tanggal jatuh tempo tiap bulan.') +
    (isTrial(a) ? fld('Akhir free trial', '<input name="trialEnd" type="date" value="' + esc(a.trialEnd || trialEndOf(a)) + '">', 'Kosong = 1 bulan setelah mulai. Mau mengubahnya jadi berlangganan? Pilih paket di atas, tagihan mulai hari ini.') : '') +
    fld('Berhenti langganan', '<input name="endDate" type="date" value="' + esc(a.endDate || '') + '">', 'Opsional. Tagihan berhenti setelah tanggal ini.') +
    fld('Catatan admin', '<textarea name="adminNote" maxlength="300" placeholder="Tampil ke pemilik kalau ditolak atau ditangguhkan">' + esc(a.adminNote || '') + '</textarea>', '', 'full') + '</div>' +
    '<div class="actions"><button type="button" class="btn" data-act="view-owner" data-id="' + esc(id) + '">Lihat data kos</button><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal('Detail akun', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const status = f.get('status'), toTrial = f.get('planId') === '__trial', planId = toTrial ? '' : f.get('planId');
    let approvedAt = f.get('approvedAt') || '';
    if ((status === 'approved' || status === 'suspended') && !planId && !a.trial && !toTrial) { toast('Pilih paket dulu sebelum akun diaktifkan.', true); return false; }
    if (status === 'approved' && !approvedAt) approvedAt = todayStr();
    const fromTrial = !toTrial && !a.trial && a.trialEnd && status === 'approved' && a.status !== 'approved';
    if (fromTrial && (!f.get('approvedAt') || f.get('approvedAt') === a.approvedAt)) approvedAt = todayStr();
    const patch = { status, planId, approvedAt, endDate: f.get('endDate') || '', adminNote: f.get('adminNote').trim(), reviewedAt: todayStr() };
    if (a.trial || toTrial) {
      if (toTrial) patch.trial = true;
      if (planId) { patch.trial = false; patch.trialEnd = ''; if (!f.get('approvedAt') || f.get('approvedAt') === a.approvedAt) patch.approvedAt = todayStr(); }
      else patch.trialEnd = f.get('trialEnd') || (approvedAt ? addMonth(approvedAt) : '');
    }
    if (fromTrial) patch.trialEnd = '';
    await fsSet('accounts/' + id, patch);
    toast('Akun disimpan');
  });
}
function setAccStatus(id, status, msg) {
  const a = AD.accounts[id]; if (!a) return;
  if (status === 'approved' && !(a.planId && PLANS[a.planId]) && !a.trial) { toast('Pilih paket dulu di Detail.', true); openAccount(id); return; }
  const patch = { status, reviewedAt: todayStr() };
  if (status === 'approved' && !a.approvedAt) patch.approvedAt = todayStr();
  if (status === 'approved' && !a.trial && a.trialEnd) { patch.approvedAt = todayStr(); patch.trialEnd = ''; }
  if (status === 'approved' && isTrial(a) && !a.trialEnd) patch.trialEnd = addMonth(patch.approvedAt || a.approvedAt);
  run(() => fsSet('accounts/' + id, patch)).then(ok => ok && toast(msg));
}

/* --- tagihan langganan (admin) --- */
function viewAdminBills() {
  const curP = todayStr().slice(0, 7), sum = a => a.reduce((s, b) => s + b.amount, 0);
  const all = adminSubBills();
  const late = all.filter(b => b.st.k === 'late'), soon = all.filter(b => b.st.k === 'soon');
  const mine = all.filter(b => b.period === curP), gotM = sum(mine.filter(b => b.paid)), allM = sum(mine), pct = allM ? Math.round(gotM / allM * 100) : 0;
  let h = upgradesSection() + proofsSection() + '<div class="stats3"><div class="stat s-bad"><span>Telat bayar (akun terkunci)</span><b>' + late.length + ' tagihan</b><small>' + rp(sum(late)) + '</small></div><div class="stat s-warn"><span>Jatuh tempo 7 hari ke depan</span><b>' + soon.length + ' tagihan</b><small>' + rp(sum(soon)) + '</small></div><div class="stat"><span>Terkumpul ' + esc(fmtPeriod(curP)) + '</span><b>' + rp(gotM) + '</b><small>dari ' + rp(allM) + ' (' + pct + '%)</small><div class="bar"><i style="width:' + pct + '%"></i></div></div></div>';
  const seg = (k, l) => '<button data-act="abf" data-v="' + k + '" aria-pressed="' + (UI.abf === k) + '">' + l + '</button>';
  h += '<div class="toolbar"><div class="seg">' + seg('tagih', 'Perlu ditagih') + seg('bulan', 'Bulan ini') + seg('belum', 'Belum lunas') + seg('lunas', 'Lunas') + seg('semua', 'Semua') + '</div>' + exBtns('abill', 'exr') + '</div>';
  let list = all.slice();
  if (UI.abf === 'tagih') list = list.filter(b => b.st.k === 'late' || b.st.k === 'soon');
  else if (UI.abf === 'bulan') list = list.filter(b => b.period === curP);
  else if (UI.abf === 'belum') list = list.filter(b => !b.paid);
  else if (UI.abf === 'lunas') list = list.filter(b => b.paid);
  list.sort((a, b) => (a.paid === b.paid) ? (a.paid ? (a.due < b.due ? 1 : -1) : (a.due < b.due ? -1 : 1)) : (a.paid ? 1 : -1));
  if (!list.length) return h + '<div class="empty"><h2>' + (UI.abf === 'tagih' ? 'Tidak ada yang perlu ditagih' : 'Tidak ada tagihan') + '</h2><p>' + (all.length ? 'Ganti filter untuk melihat tagihan lain.' : 'Tagihan muncul setelah ada akun aktif yang punya paket.') + '</p></div>';
  h += '<div class="bills">';
  list.slice(0, 300).forEach(b => {
    const a = AD.accounts[b.tenantId] || {}, p = PLANS[a.planId] || {};
    const msg = 'Halo ' + (a.ownerName || '') + ', pengingat tagihan langganan Lapak Kosan' + (a.kosName ? ' untuk ' + a.kosName : '') + ' periode ' + fmtPeriod(b.period) + ' sebesar ' + rp(b.amount) + ', jatuh tempo ' + fmtDate(b.due) + '. Terima kasih.';
    const wa = (!b.paid && a.phone) ? waLink(a.phone, msg) : '';
    h += '<div class="bill"><span class="r">' + Math.round((Number(p.price) || 0) / 1000) + 'rb</span><span class="w">' + esc(a.kosName || a.email || '-') + ' <span class="muted" style="font-weight:400">· ' + esc(a.ownerName || '') + '</span></span><span class="d">' + esc(fmtPeriod(b.period)) + ' · tempo ' + fmtDate(b.due) + ' · ' + esc(p.name || '') + '</span><span class="a">' + rp(b.amount) + '</span><span class="s">' + pill(b.st.k, statusText(b)) + '</span><span class="x">' +
      (b.paid ? '<span class="muted" style="font-size:.8rem;align-self:center">Dibayar ' + fmtDate(b.pay.paidAt) + (b.pay.method ? ' · ' + esc(b.pay.method) : '') + '</span><button class="btn sm danger" data-act="sub-unpay" data-confirm="Klik lagi untuk batalkan" data-id="' + esc(b.id) + '">Batalkan</button>'
        : (wa ? '<a class="btn sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Ingatkan WA</a>' : '') + '<button class="btn sm primary" data-act="sub-pay" data-id="' + esc(b.id) + '">Catat bayar</button>') + '</span></div>';
  });
  h += '</div>';
  if (list.length > 300) h += '<p class="muted" style="margin-top:.6rem">Menampilkan 300 teratas. Pakai filter untuk sisanya.</p>';
  return h;
}
function openSubPay(billId) {
  const bl = adminSubBills().find(b => b.id === billId); if (!bl) return;
  const a = AD.accounts[bl.tenantId] || {};
  const b = '<form class="sb" style="padding:0"><dl class="kv"><div><dt>Kos</dt><dd>' + esc(a.kosName || a.email || '-') + '</dd></div><div><dt>Periode</dt><dd>' + esc(fmtPeriod(bl.period)) + '</dd></div><div><dt>Jatuh tempo</dt><dd>' + fmtDate(bl.due) + '</dd></div></dl><div class="formgrid">' +
    fld('Tanggal bayar', '<input name="paidAt" type="date" required value="' + todayStr() + '">') + fld('Jumlah (Rp)', numIn('amount', bl.amount, 'required step="1000"')) +
    fld('Metode', '<select name="method"><option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option></select>') + fld('Catatan', '<input name="note" maxlength="120">') + '</div><div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan pembayaran</button></div></form>';
  const m = openModal('Catat pembayaran langganan', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const amount = Number(f.get('amount')) || 0;
    if (amount <= 0) { toast('Jumlah harus lebih dari 0.', true); return false; }
    await fdb.doc('subPayments/' + bl.id).set(fsClean({ tenantId: bl.tenantId, period: bl.period, amount, paidAt: f.get('paidAt'), method: f.get('method'), note: f.get('note').trim() }));
    toast('Pembayaran tercatat');
  });
}

/* --- paket --- */
function viewPlans() {
  const plans = planList(false), used = {};
  accList().forEach(a => { if (a.planId) used[a.planId] = (used[a.planId] || 0) + 1; });
  let h = '<p class="hint-top">Paket dipilih pemilik saat daftar dan menentukan tagihan bulanan serta batas jumlah unit (kamar dan kontrakan dihitung sama). Kamu bisa mengganti paket tiap akun lewat Detail di tab Pendaftar.</p><div class="toolbar"><button class="btn" data-act="payinfo">Info pembayaran</button>' + exBtns('paket', 'exr') + '<button class="btn primary" data-act="plan-edit" data-id="">+ Paket</button></div>';
  const pi = PAYINFO.wa || PAYINFO.payText;
  h += '<div class="note"><p>' + (pi ? '<b>Info pembayaran untuk pemilik:</b> ' + (PAYINFO.wa ? 'WA ' + esc(PAYINFO.wa) + '. ' : '') + '<span style="white-space:pre-wrap">' + esc(PAYINFO.payText || '') + '</span>' : 'Belum ada info pembayaran. Isi nomor WhatsApp dan cara bayar (nomor rekening, QRIS) lewat tombol Info pembayaran, supaya pemilik tahu cara membayar dan menghubungimu.') + '</p></div>';
  if (!plans.length) return h + '<div class="empty"><h2>Belum ada paket</h2><p>Contoh: Rp 100.000 per bulan untuk 1–10 unit, Rp 200.000 per bulan untuk 1–30 unit. Satu kamar atau satu kontrakan dihitung satu unit. Pendaftar memilih salah satu saat daftar.</p></div>';
  return h + '<div class="tgrid">' + plans.map(p => '<article class="tcard' + (p.active === false ? ' out' : '') + '"><div class="thead"><div class="ph">' + Math.round((Number(p.price) || 0) / 1000) + 'rb</div><div style="min-width:0"><h3>' + esc(p.name) + '</h3><p>' + esc(planRange(p)) + '</p></div></div><dl class="tmeta"><div><dt>Harga / bulan</dt><dd class="mono">' + rp(p.price) + '</dd></div><div><dt>Dipakai</dt><dd>' + (used[p.id] || 0) + ' akun</dd></div>' + (p.desc ? '<div class="due"><dt>Keterangan</dt><dd>' + esc(p.desc) + '</dd></div>' : '') + '</dl><div class="tfoot">' + (p.active === false ? pill('later', 'Nonaktif') : pill('paid', 'Tampil saat daftar')) + '<button class="btn sm" data-act="plan-edit" data-id="' + esc(p.id) + '">Ubah</button></div></article>').join('') + '</div>';
}
function openPlan(id) {
  const p = id ? PLANS[id] : null;
  const b = '<form class="sb" style="padding:0"><div class="formgrid">' +
    fld('Nama paket', '<input name="name" required maxlength="40" value="' + esc(p ? p.name : '') + '" placeholder="Paket Kecil">', '', 'full') +
    fld('Harga per bulan (Rp)', numIn('price', p ? p.price : '', 'required step="1000"'), '', 'full') +
    fld('Unit minimal', numIn('minRooms', p ? (p.minRooms || 1) : 1, 'min="1"')) +
    fld('Unit maksimal', numIn('maxRooms', p && p.maxRooms ? p.maxRooms : '', 'min="1"'), 'Kosong = tanpa batas.') +
    fld('Keterangan (opsional)', '<input name="desc" maxlength="120" value="' + esc(p ? p.desc : '') + '">', '', 'full') +
    '<label class="check full"><input type="checkbox" name="active"' + (!p || p.active !== false ? ' checked' : '') + '> Tampilkan saat pendaftaran</label></div>' +
    '<div class="actions">' + (id ? '<button type="button" class="btn danger left" data-act="plan-del" data-confirm="Klik lagi untuk hapus" data-id="' + esc(id) + '">Hapus</button>' : '') + '<button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal(id ? 'Ubah paket' : 'Tambah paket', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => {
    const name = f.get('name').trim(), price = Number(f.get('price')) || 0, minRooms = Math.max(1, Number(f.get('minRooms')) || 1), maxRooms = Number(f.get('maxRooms')) || 0;
    if (!name || price <= 0) { toast('Isi nama paket dan harga.', true); return false; }
    if (maxRooms && maxRooms < minRooms) { toast('Unit maksimal tidak boleh lebih kecil dari minimal.', true); return false; }
    await fsSet('plans/' + (id || rid('p')), { name, price, minRooms, maxRooms, desc: f.get('desc').trim(), active: f.get('active') === 'on' });
    toast('Paket disimpan');
  });
}
function deletePlan(id) {
  const n = accList().filter(a => a.planId === id).length;
  if (n) { toast('Paket masih dipakai ' + n + ' akun. Pindahkan akun itu ke paket lain, atau cukup nonaktifkan paketnya.', true); return; }
  run(() => fdb.doc('plans/' + id).delete()).then(ok => { if (ok) { closeModal(); toast('Paket dihapus'); } });
}
function openPayInfo() {
  const b = '<form class="sb" style="padding:0"><div class="formgrid">' +
    fld('No. WhatsApp admin', '<input name="wa" inputmode="tel" maxlength="20" value="' + esc(PAYINFO.wa || '') + '" placeholder="0812xxxxxxxx">', 'Dipakai tombol hubungi admin dan konfirmasi bayar di akun pemilik.', 'full') +
    fld('Toleransi telat (hari)', numIn('grace', PAYINFO.grace || 0, 'min="0" max="60"'), 'Akun terkunci otomatis setelah jatuh tempo lewat sekian hari. 0 = terkunci sehari setelah jatuh tempo.', 'full') +
    fld('Cara pembayaran', '<textarea name="payText" rows="4" maxlength="500" placeholder="Transfer ke BCA 1234567890 a.n. Nama Kamu. Kirim bukti lewat WhatsApp.">' + esc(PAYINFO.payText || '') + '</textarea>', 'Tampil ke pemilik di halaman tunggu verifikasi, tab Langganan, dan layar tagihan terkunci.', 'full') + '</div>' +
    '<div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
  const m = openModal('Info pembayaran', b);
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => { await fsSet('site/payinfo', { wa: f.get('wa').trim(), payText: f.get('payText').trim(), grace: Math.max(0, Math.min(60, Number(f.get('grace')) || 0)) }); toast('Info pembayaran disimpan'); });
}

/* ---------- kunci otomatis kalau tagihan telat, dan bukti bayar ---------- */
function lockInfo() {
  if (!ACC || ACC.status !== 'approved' || isAdmin) return { locked: false, late: [] };
  if (isTrial(ACC)) { const e = trialEndOf(ACC); return { locked: !!e && todayStr() > e, late: [], trial: true }; }
  const grace = Number(PAYINFO.grace) || 0, today = todayStr();
  const late = ownSubBills().filter(b => !b.paid && daysBetween(b.due, today) > grace).sort((a, b) => a.due < b.due ? -1 : 1);
  return { locked: late.length > 0, late };
}
function proofRow(b) {
  const pr = MYPROOF[b.id];
  let st, act = '';
  if (pr && pr.status === 'pending') st = pill('soon', 'Bukti terkirim, menunggu diperiksa');
  else {
    st = pr && pr.status === 'rejected' ? pill('late', 'Bukti ditolak' + (pr.adminNote ? ': ' + pr.adminNote : '')) : pill('late', 'Belum ada bukti');
    act = '<label class="btn sm primary" style="cursor:pointer">' + (pr ? 'Kirim ulang bukti' : 'Upload bukti bayar') + '<input type="file" class="proof-file" data-bill="' + esc(b.id) + '" accept="image/*" hidden></label>';
  }
  return '<div class="bill" style="grid-template-columns:minmax(0,1fr) auto;grid-template-areas:\'d a\' \'s s\' \'x x\'"><span class="d" style="font-size:.9rem;color:var(--ink);font-weight:600">' + esc(fmtPeriod(b.period)) + ' <span class="muted" style="font-weight:400">· tempo ' + fmtDate(b.due) + '</span></span><span class="a">' + rp(b.amount) + '</span><span class="s" style="text-align:left">' + st + '</span><span class="x" style="justify-content:flex-start">' + act + '</span></div>';
}
function lockCard() {
  if (lockInfo().trial) return trialEndCard();
  const L = lockInfo().late, total = L.reduce((n, b) => n + b.amount, 0);
  const wa = PAYINFO.wa ? waLink(PAYINFO.wa, adminWaMsg('saya ' + (ACC.ownerName || '') + (ACC.kosName ? ' (' + ACC.kosName + ')' : '') + ' sudah membayar tagihan langganan. Bukti sudah saya upload di aplikasi.')) : '';
  return '<div class="g-card"><h2>Selesaikan tagihan</h2><p class="muted">Akses ke data kos dikunci sampai tagihan langganan dibayar. Datamu aman dan tidak dihapus. Total yang harus dibayar: <b>' + rp(total) + '</b>.</p>' +
    payInfoBox('Silakan bayar ke rekening berikut', 'Hubungi admin untuk nomor rekening pembayaran.') +
    '<div class="bills">' + L.map(proofRow).join('') + '</div>' +
    '<p class="g-note">Setelah bayar, upload foto bukti transfer. Admin akan memeriksa lalu mengaktifkan akunmu lagi. Halaman ini otomatis terbuka begitu pembayaran diterima.</p>' +
    (wa ? '<a class="btn lg" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Kabari admin lewat WhatsApp</a>' : '') +
    '<button type="button" class="btn sm g-link" data-act="logout">Keluar</button></div>';
}
async function sendProof(billId, file) {
  const b = ownSubBills().find(x => x.id === billId); if (!b || !file) return;
  toast('Mengirim bukti…');
  try {
    let img = await resizePhoto(file, 1100, 0.7);
    if (img.length > 650000) img = await resizePhoto(file, 800, 0.6);
    if (img.length > 650000) { toast('Foto terlalu besar. Coba foto lain atau screenshot bukti transfer.', true); return; }
    await fdb.doc('proofs/' + billId).set({ tenantId: fbUser.uid, period: b.period, amount: b.amount, image: img, sentAt: todayStr(), sentMs: Date.now(), status: 'pending' });
    toast('Bukti terkirim. Admin akan memeriksa.');
  } catch (e) { toast(e && e.code ? errText(e) : 'Foto tidak bisa dibaca. Coba foto lain.', true); }
}
document.addEventListener('change', e => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('proof-file')) { const f = t.files && t.files[0]; sendProof(t.dataset.bill, f); t.value = ''; }
});
const pendingProofs = () => Object.keys(AD.proofs).filter(id => AD.proofs[id].status === 'pending').map(id => Object.assign({ id }, AD.proofs[id])).sort((a, b) => (a.sentMs || 0) - (b.sentMs || 0));
function notifyProofs() {
  const n = pendingProofs().length + pendingUps().length + chatUnreadCount();
  document.title = (n ? '(' + n + ') ' : '') + 'Admin ' + APP();
  if (lastProofN >= 0 && n > lastProofN) { try { if (window.Notification && Notification.permission === 'granted') new Notification('Bukti bayar baru', { body: n + ' bukti bayar menunggu diperiksa' }); } catch (e) {} }
  lastProofN = n;
}
function proofsSection() {
  const list = pendingProofs();
  let h = '';
  if (window.Notification && Notification.permission === 'default') h += '<div class="note"><p>Aktifkan notifikasi browser supaya kamu diberi tahu saat ada bukti bayar masuk (selama halaman ini terbuka).</p><button class="btn sm" data-act="notif-on">Aktifkan notifikasi</button></div>';
  if (!list.length) return h;
  h += '<section class="floor"><div class="floor-h"><h2>Bukti bayar menunggu diperiksa</h2><span>' + list.length + ' bukti</span></div><div class="tgrid">';
  list.forEach(pr => {
    const a = AD.accounts[pr.tenantId] || {}, img = safePhoto(pr.image);
    h += '<article class="tcard"><div class="thead"><div class="ph">' + esc(initials(a.kosName || a.ownerName || a.email)) + '</div><div style="min-width:0"><h3>' + esc(a.kosName || a.email || '-') + '</h3><p>' + esc(a.ownerName || '') + ' · ' + esc(fmtPeriod(pr.period)) + ' · ' + rp(pr.amount) + '</p></div></div>' +
      (img ? '<a href="' + img + '" target="_blank" rel="noopener"><img src="' + img + '" alt="Bukti bayar" style="width:100%;max-height:16rem;object-fit:contain;background:var(--surface-2);border-radius:6px"></a>' : '<p class="muted">Gambar tidak bisa ditampilkan.</p>') +
      '<div class="tfoot">' + pill('soon', 'Dikirim ' + fmtDate(pr.sentAt)) + '<button class="btn sm primary" data-act="proof-ok" data-confirm="Klik lagi untuk terima" data-id="' + esc(pr.id) + '">Terima dan aktifkan</button><button class="btn sm danger" data-act="proof-no" data-id="' + esc(pr.id) + '">Tolak</button></div></article>';
  });
  return h + '</div></section>';
}
async function acceptProof(id) {
  const pr = AD.proofs[id]; if (!pr) return;
  const bl = adminSubBills().find(b => b.id === id);
  const ok = await run(async () => {
    if (!(bl && bl.paid)) await fdb.doc('subPayments/' + id).set(fsClean({ tenantId: pr.tenantId, period: pr.period, amount: bl ? bl.amount : pr.amount, paidAt: todayStr(), method: 'Transfer', note: 'Bukti bayar diterima' }));
    await fsSet('proofs/' + id, { status: 'approved', reviewedAt: todayStr() });
  });
  if (ok) toast('Pembayaran diterima, akun aktif lagi');
}
function openRejectProof(id) {
  const m = openModal('Tolak bukti bayar', '<form class="sb" style="padding:0"><div class="formgrid">' + fld('Alasan (tampil ke pemilik)', '<input name="note" maxlength="120" placeholder="Nominal tidak sesuai / foto tidak jelas">', '', 'full') + '</div><div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn danger" type="submit">Tolak bukti</button></div></form>');
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => { await fsSet('proofs/' + id, { status: 'rejected', adminNote: f.get('note').trim(), reviewedAt: todayStr() }); toast('Bukti ditolak, pemilik bisa kirim ulang'); });
}

/* --- permintaan naik paket (admin) --- */
const pendingUps = () => Object.keys(AD.ups || {}).filter(id => AD.ups[id].status === 'pending').map(id => Object.assign({ id }, AD.ups[id])).sort((a, b) => (a.sentMs || 0) - (b.sentMs || 0));
function upgradesSection() {
  const list = pendingUps(); if (!list.length) return '';
  let h = '<section class="floor"><div class="floor-h"><h2>Permintaan naik paket</h2><span>' + list.length + ' permintaan</span></div><div class="tgrid">';
  list.forEach(u => {
    const a = AD.accounts[u.tenantId] || {}, from = PLANS[u.fromPlanId] || PLANS[a.planId] || {}, to = PLANS[u.planId] || {}, img = safePhoto(u.image);
    h += '<article class="tcard"><div class="thead"><div class="ph">' + esc(initials(a.kosName || a.ownerName || a.email)) + '</div><div style="min-width:0"><h3>' + esc(a.kosName || a.email || '-') + '</h3><p>' + esc(a.ownerName || '') + ' · ' + esc(from.name || '-') + ' → <b>' + esc(to.name || '(paket dihapus)') + '</b></p></div></div>' +
      '<dl class="tmeta"><div><dt>Seharusnya dibayar</dt><dd class="mono">' + rp(u.amount) + '</dd></div><div><dt>Jenis</dt><dd>' + (u.full ? 'Bayar penuh (sekaligus tagihan ' + esc(fmtPeriod(String(u.billId || '').slice(String(u.tenantId).length + 1))) + ')' : 'Selisih harga') + '</dd></div><div><dt>Harga baru / bulan</dt><dd class="mono">' + rp(to.price) + '</dd></div><div><dt>Unit terpakai</dt><dd>' + (Number(a.roomCount) || 0) + '</dd></div></dl>' +
      (img ? '<a href="' + img + '" target="_blank" rel="noopener"><img src="' + img + '" alt="Bukti bayar" style="width:100%;max-height:16rem;object-fit:contain;background:var(--surface-2);border-radius:6px"></a>' : '<p class="muted">Gambar tidak bisa ditampilkan.</p>') +
      '<div class="tfoot">' + pill('soon', 'Dikirim ' + fmtDate(u.sentAt)) + '<button class="btn sm primary" data-act="up-ok" data-confirm="Klik lagi untuk terima" data-id="' + esc(u.id) + '">Terima dan naikkan paket</button><button class="btn sm danger" data-act="up-no" data-id="' + esc(u.id) + '">Tolak</button></div></article>';
  });
  return h + '</div></section>';
}
async function acceptUpgrade(id) {
  const u = AD.ups[id]; if (!u) return;
  if (!PLANS[u.planId]) { toast('Paket tujuan sudah tidak ada.', true); return; }
  const ok = await run(async () => {
    if (u.full && u.billId) {
      const bl = adminSubBills().find(b => b.id === u.billId);
      if (bl && !bl.paid) await fdb.doc('subPayments/' + u.billId).set(fsClean({ tenantId: u.tenantId, period: bl.period, amount: Number(u.amount) || Number(PLANS[u.planId].price) || 0, paidAt: todayStr(), method: 'Transfer', note: 'Naik paket, bayar penuh' }));
    }
    await fsSet('accounts/' + u.tenantId, { planId: u.planId, reviewedAt: todayStr() });
    await fsSet('upgrades/' + id, { status: 'approved', reviewedAt: todayStr() });
  });
  if (ok) toast('Paket dinaikkan. Dashboard pemilik otomatis ikut berubah.');
}
function openRejectUpgrade(id) {
  const m = openModal('Tolak permintaan naik paket', '<form class="sb" style="padding:0"><div class="formgrid">' + fld('Alasan (tampil ke pemilik)', '<input name="note" maxlength="120" placeholder="Nominal tidak sesuai / foto tidak jelas">', '', 'full') + '</div><div class="actions"><button type="button" class="btn" data-close2>Batal</button><button class="btn danger" type="submit">Tolak</button></div></form>');
  m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
  onSubmit(m, async f => { await fsSet('upgrades/' + id, { status: 'rejected', adminNote: f.get('note').trim(), reviewedAt: todayStr() }); toast('Permintaan ditolak, pemilik bisa mengajukan lagi'); });
}

/* --- tampilan --- */
function themeDraft() {
  const t = Object.assign({ preset: 'lapak', radius: 'sedang', hero: '', appName: '', heroTitle: '', heroSub: '' }, THEME || {});
  const p = PRESETS[t.preset] || PRESETS.lapak;
  if (!THEME && !t.hero) t.hero = p.hero || '';
  if (!t.accent) t.accent = p.accent;
  if (!t.bg) t.bg = p.bg;
  return t;
}
function viewTheme() {
  const t = TD, sw = Object.keys(PRESETS).map(k => '<button type="button" class="thm-sw" data-act="th-preset" data-v="' + k + '" aria-pressed="' + (t.preset === k) + '"><i style="background:' + PRESETS[k].bg + ';--c:' + PRESETS[k].accent + '"></i><b>' + PRESETS[k].name + '</b></button>').join('');
  const seg = (k, l) => '<button type="button" data-act="th-radius" data-v="' + k + '" aria-pressed="' + (t.radius === k) + '">' + l + '</button>';
  const ic = (key, label, hint) => fld(label, '<input type="color" data-th="' + key + '" value="' + esc(hx(t[key]) ? toHex(hx(t[key])) : '#000000') + '">', hint);
  const tile = (cls, no, lab, who) => '<span class="room ' + cls + '"><span class="rno">' + no + '</span><span class="rst">' + lab + '</span><span class="rwho">' + who + '</span></span>';
  return '<p class="hint-top">Pilih warna dan gaya. Perubahan langsung terlihat di halaman ini. Setelah disimpan, berlaku untuk semua pemilik kos dan halaman masuk.</p>' +
    '<div class="thm-grid">' + sw + '</div>' +
    '<div class="thm-form">' + ic('accent', 'Warna utama', 'Tombol, tab terpilih, logo, dan penanda.') + ic('bg', 'Warna latar', 'Latar halaman. Teks dan garis menyesuaikan otomatis, latar gelap juga bisa.') +
    '<div class="fld"><span>Panel halaman masuk</span><label class="check"><input type="checkbox" data-th="heroAuto"' + (hx(t.hero) ? '' : ' checked') + '> Otomatis dari warna utama</label><input type="color" data-th="hero" id="th-hero" value="' + esc(hx(t.hero) ? toHex(hx(t.hero)) : '#0a3a34') + '"' + (hx(t.hero) ? '' : ' disabled') + '></div>' +
    '<div class="fld"><span>Sudut</span><div class="seg">' + seg('tegas', 'Tegas') + seg('sedang', 'Sedang') + seg('bulat', 'Bulat') + '</div></div>' +
    fld('Nama aplikasi', '<input data-th="appName" maxlength="30" placeholder="Lapak Kosan" value="' + esc(t.appName || '') + '">', 'Kosongkan untuk memakai logo Lapak Kosan. Kalau diisi, halaman masuk dan topbar memakai nama ini dengan inisial sebagai logo.') +
    fld('Judul halaman masuk', '<input data-th="heroTitle" maxlength="60" placeholder="Kosan dan kontrakan, rapi dalam satu layar." value="' + esc(t.heroTitle || '') + '">') +
    fld('Teks di bawah judul', '<textarea data-th="heroSub" rows="2" maxlength="160" placeholder="Catat penghuni, kontrak, tagihan, listrik dan air, sampai laporan keuangan. Semua dalam satu tempat.">' + esc(t.heroSub || '') + '</textarea>', '', 'full') + '</div>' +
    '<div class="thm-prev" aria-label="Contoh tampilan">' + tile('s-occ', '101', 'Terisi', 'Budi Santoso') + tile('s-vacant', '102', 'Kosong', '&nbsp;') + tile('s-soon', '103', 'Tempo 3 hr lagi', 'Siti') + tile('s-late', '104', 'Telat 5 hr', 'Agus') +
    '<span style="display:flex;flex-direction:column;gap:.5rem;justify-content:center"><span class="row"><button type="button" class="btn primary">Simpan</button><button type="button" class="btn">Batal</button></span><span class="row">' + pill('paid', 'Lunas') + pill('soon', 'Segera') + pill('late', 'Telat') + '</span></span></div>' +
    '<div class="row" style="margin-top:1rem"><button class="btn primary" data-act="th-save">Simpan tampilan</button><button class="btn" data-act="th-reset" data-confirm="Klik lagi untuk kembalikan bawaan">Kembalikan bawaan</button></div>';
}
function themeInput(el) {
  const k = el.dataset.th; if (!TD) return;
  if (k === 'heroAuto') { const h = $('#th-hero'); h.disabled = el.checked; TD.hero = el.checked ? '' : h.value; }
  else { TD[k] = el.value; if (k === 'accent' || k === 'bg') TD.preset = 'custom'; }
  applyTheme(TD);
  if (k === 'accent' || k === 'bg') document.querySelectorAll('.thm-sw').forEach(b => b.setAttribute('aria-pressed', 'false'));
}
document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.th) themeInput(e.target); });
async function saveTheme() {
  const o = Object.assign({}, TD); ['appName', 'heroTitle', 'heroSub'].forEach(k => { o[k] = String(o[k] || '').trim(); });
  if (o.preset !== 'custom' && PRESETS[o.preset]) { o.accent = hx(o.accent) ? toHex(hx(o.accent)) : PRESETS[o.preset].accent; }
  const ok = await run(() => fdb.doc('site/theme').set(fsClean(o)));
  if (ok) { TD = null; toast('Tampilan disimpan untuk semua akun'); render(); }
}

const ADMIN_H = {
  'copy-pay': async el => {
    const t = el.dataset.copy || ''; let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (e) {
      try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e2) {}
    }
    toast(ok ? 'Nomor rekening tersalin' : 'Gagal menyalin, salin manual ya', !ok);
    if (ok) { const o = el.textContent; el.textContent = 'Tersalin ✓'; setTimeout(() => { el.textContent = o; }, 1500); }
  },
  'th-preset': el => { const p = PRESETS[el.dataset.v]; TD = Object.assign(TD || themeDraft(), { preset: el.dataset.v, accent: p.accent, bg: p.bg, hero: p.hero || '' }); applyTheme(TD); render(); },
  'th-radius': el => { TD.radius = el.dataset.v; applyTheme(TD); render(); },
  'th-save': () => saveTheme(),
  'th-reset': () => run(() => fdb.doc('site/theme').delete()).then(ok => { if (ok) { TD = null; toast('Tampilan dikembalikan ke bawaan'); render(); } }),
  'notif-on': () => { try { Notification.requestPermission().then(() => render()); } catch (e) {} },
  'proof-ok': el => acceptProof(el.dataset.id),
  'proof-no': el => openRejectProof(el.dataset.id),
  'up-pick': el => openUpgrade(el.dataset.id),
  'up-ok': el => acceptUpgrade(el.dataset.id),
  'up-no': el => openRejectUpgrade(el.dataset.id),
  af: el => { UI.af = el.dataset.v; render(); },
  abf: el => { UI.abf = el.dataset.v; render(); },
  'acc-open': el => openAccount(el.dataset.id),
  /* admin melihat data kos milik pemilik (hanya baca) */
  'view-owner': el => {
    const id = el.dataset.id, a = AD.accounts[id]; if (!isAdmin || !a) return;
    closeModal(true); stopOwner();
    VIEW = { uid: id, name: a.kosName || a.ownerName || a.email || '' };
    canWrite = false; mode = 'db';
    repo = Object.assign(dbRepo(fdb, id), { set: () => Promise.reject({ code: 'view-only' }), del: () => Promise.reject({ code: 'view-only' }) });
    repo.start(schedule); UI.tab = 'dashboard'; render(); window.scrollTo(0, 0);
  },
  'view-exit': () => { stopOwner(); VIEW = null; canWrite = true; UI.tab = 'daftar'; closeModal(true); render(); window.scrollTo(0, 0); },
  'acc-approve': el => setAccStatus(el.dataset.id, 'approved', 'Akun aktif'),
  'acc-reject': el => setAccStatus(el.dataset.id, 'rejected', 'Pendaftaran ditolak'),
  'acc-suspend': el => setAccStatus(el.dataset.id, 'suspended', 'Akun ditangguhkan'),
  'sub-pay': el => openSubPay(el.dataset.id),
  'sub-unpay': el => run(() => fdb.doc('subPayments/' + el.dataset.id).delete()).then(ok => ok && toast('Pembayaran dibatalkan')),
  'plan-edit': el => openPlan(el.dataset.id || ''),
  'plan-del': el => deletePlan(el.dataset.id),
  'trial-end-pick': el => { const x = PLANS[el.dataset.id]; if (!x || !isTrial(ACC)) return; run(() => fdb.doc('accounts/' + fbUser.uid).update({ planId: el.dataset.id, trial: false, status: 'pending' })).then(ok => ok && toast('Paket diajukan. Menunggu persetujuan admin.')); },
  'trial-pick': el => { const x = PLANS[el.dataset.id]; if (!x) return; UI.chatDraft = 'Halo admin, saya mau lanjut ke ' + planLabel(x) + ' setelah free trial. Mohon diaktifkan, terima kasih.'; setTab('chat'); },
  payinfo: () => openPayInfo()
};

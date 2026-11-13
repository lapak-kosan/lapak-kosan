'use strict';
/* ============================================================
   CHAT ADMIN <-> PEMILIK dan LONCENG NOTIFIKASI
   Firestore:
     chats/<uidPemilik>              ringkasan percakapan (pesan terakhir, tanda sudah dibaca)
     chats/<uidPemilik>/msgs/<id>    isi pesan {from:'owner'|'admin', text, ms, expireAt}
   Pemilik hanya punya satu percakapan (dengan admin). Admin melihat semua percakapan.
   Dimuat sebelum app.js; memakai variabel app.js (fdb, fbUser, ACC, isAdmin, UI, ...) saat dipanggil.
   ============================================================ */
const CHAT_KEEP_DAYS = 30; // pesan lebih tua dari ini dihapus otomatis saat admin membuka aplikasi (chatCleanup). expireAt tetap diisi supaya TTL Firestore bisa dipakai kalau billing diaktifkan.
const CHAT = { on: false, un: [], threads: {}, mine: null, loaded: false, msgUid: '', msgUn: null, msgs: [], mLoaded: false, marked: '', err: '' };
let BELL = [], bellSig = null;

function chatStart() {
  if (CHAT.on || !fbUser) return;
  CHAT.on = true;
  const fail = e => { CHAT.err = (e && e.code) || 'error'; CHAT.loaded = true; schedule(); };
  if (isAdmin) {
    CHAT.un.push(fdb.collection('chats').onSnapshot(snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); CHAT.threads = m; CHAT.loaded = true; schedule(); chatCleanup(m); }, fail));
  } else {
    CHAT.un.push(fdb.doc('chats/' + fbUser.uid).onSnapshot(s => { CHAT.mine = s.exists ? s.data() : null; CHAT.loaded = true; schedule(); }, fail));
  }
}
/* admin: hapus pesan yang lebih tua dari CHAT_KEEP_DAYS di semua percakapan (otomatis hilang juga di akun pemilik). Maksimal sekali sehari per browser. */
async function chatCleanup(threads) {
  if (CHAT.cleaned || !isAdmin) return;
  CHAT.cleaned = true;
  try { if (Date.now() - (Number(localStorage.getItem('chatCleanMs')) || 0) < 864e5) return; } catch (e) {}
  const cutoff = Date.now() - CHAT_KEEP_DAYS * 864e5;
  try {
    for (const uid of Object.keys(threads)) {
      for (;;) {
        const snap = await fdb.collection('chats/' + uid + '/msgs').where('ms', '<', cutoff).limit(400).get();
        if (snap.empty) break;
        const b = fdb.batch(); snap.docs.forEach(d => b.delete(d.ref)); await b.commit();
        if (snap.size < 400) break;
      }
      if ((Number(threads[uid].lastMs) || 0) < cutoff) await fdb.doc('chats/' + uid).delete();
    }
    try { localStorage.setItem('chatCleanMs', String(Date.now())); } catch (e) {}
  } catch (e) { CHAT.cleaned = false; }
}
function chatStop() {
  CHAT.un.forEach(f => { try { f(); } catch (e) {} });
  if (CHAT.msgUn) { try { CHAT.msgUn(); } catch (e) {} }
  Object.assign(CHAT, { on: false, un: [], threads: {}, mine: null, loaded: false, msgUid: '', msgUn: null, msgs: [], mLoaded: false, marked: '', err: '' });
  BELL = [];
}
/* isi pesan: hanya didengarkan untuk percakapan yang sedang dibuka */
function chatWatch(uid) {
  if (CHAT.msgUid === uid && CHAT.msgUn) return;
  if (CHAT.msgUn) { try { CHAT.msgUn(); } catch (e) {} }
  CHAT.msgUid = uid; CHAT.msgs = []; CHAT.mLoaded = false;
  CHAT.msgUn = fdb.collection('chats/' + uid + '/msgs').orderBy('ms').limitToLast(200).onSnapshot(snap => {
    CHAT.msgs = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); CHAT.mLoaded = true; schedule();
  }, e => { CHAT.err = (e && e.code) || 'error'; CHAT.mLoaded = true; schedule(); });
}
function chatUnwatch() {
  if (CHAT.msgUn) { try { CHAT.msgUn(); } catch (e) {} }
  CHAT.msgUn = null; CHAT.msgUid = ''; CHAT.msgs = []; CHAT.mLoaded = false;
}
const threadUnread = (t, who) => !!t && t.lastFrom === (who === 'admin' ? 'owner' : 'admin') && (Number(t.lastMs) || 0) > (Number(t[who + 'ReadMs']) || 0);
function chatUnreadCount() {
  if (isAdmin) return Object.keys(CHAT.threads).filter(id => threadUnread(CHAT.threads[id], 'admin')).length;
  return threadUnread(CHAT.mine, 'owner') ? 1 : 0;
}
function chatNotes() {
  /* pemilik: pesan baru ditandai titik di ikon chat (pojok kanan atas); admin: lewat lonceng */
  const n = chatUnreadCount();
  if (!n || !isAdmin) return [];
  return [{ tab: 'achat', n, text: n + ' percakapan dengan pesan baru dari pemilik' }];
}
function syncChatBtn(tab) {
  const b = document.getElementById('chatbtn'); if (!b) return;
  const n = (!isAdmin && chatUnreadCount()) || 0;
  b.querySelector('.bdot').hidden = !n; b.classList.toggle('has', n > 0); b.classList.toggle('on', tab === 'chat');
  b.setAttribute('aria-label', n ? 'Chat dengan admin, ada pesan baru' : 'Chat dengan admin');
}
function chatMarkRead(uid) {
  const who = isAdmin ? 'admin' : 'owner', t = isAdmin ? CHAT.threads[uid] : CHAT.mine;
  if (!threadUnread(t, who) || document.hidden) return;
  const key = uid + ':' + t.lastMs; if (CHAT.marked === key) return;
  CHAT.marked = key;
  fdb.doc('chats/' + uid).set({ [who + 'ReadMs']: Date.now() }, { merge: true }).catch(() => { CHAT.marked = ''; });
}
async function chatSend(uid, text) {
  text = String(text || '').trim().slice(0, 1000);
  if (!text) return false;
  const now = Date.now(), from = isAdmin ? 'admin' : 'owner', a = isAdmin ? AD.accounts[uid] : ACC;
  const th = { tenantId: uid, name: String((!isAdmin && cur && cur.kos && cur.kos.name) || (a && (a.kosName || a.ownerName || a.email)) || '').slice(0, 80), lastMs: now, lastFrom: from, lastText: text.slice(0, 80) };
  th[from + 'ReadMs'] = now;
  const b = fdb.batch();
  b.set(fdb.doc('chats/' + uid + '/msgs/' + rid('m')), { from, text, ms: now, expireAt: firebase.firestore.Timestamp.fromMillis(now + CHAT_KEEP_DAYS * 864e5) });
  b.set(fdb.doc('chats/' + uid), th, { merge: true });
  await b.commit();
  return true;
}

/* ---------- tampilan ---------- */
const chatTime = ms => ms ? new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
function chatThread(uid, title, sub, back) {
  chatWatch(uid);
  const me = isAdmin ? 'admin' : 'owner';
  let h = '<section class="chat"><header class="chat-h">' + (back ? '<button type="button" class="btn sm" data-act="chat-back">← Kembali</button>' : '') + '<div style="min-width:0"><h2>' + esc(title) + '</h2>' + (sub ? '<p class="muted">' + esc(sub) + '</p>' : '') + '</div></header><div class="chat-box" id="chat-box" tabindex="0" aria-live="polite">';
  if (CHAT.err && !CHAT.msgs.length) h += '<p class="muted chat-empty">Chat belum bisa dimuat (' + esc(CHAT.err) + '). Pastikan aturan Firestore terbaru sudah dipublish.</p>';
  else if (!CHAT.mLoaded) h += '<p class="muted chat-empty">Memuat pesan…</p>';
  else if (!CHAT.msgs.length) h += '<p class="muted chat-empty">' + (isAdmin ? 'Belum ada pesan. Tulis pesan pertama ke pemilik ini.' : 'Belum ada pesan. Tulis pertanyaan atau kendalamu ke admin di bawah.') + '</p>';
  else h += CHAT.msgs.map(m => '<div class="cm ' + (m.from === me ? 'me' : 'them') + '"><p>' + esc(m.text) + '</p><small>' + (m.from === me ? '' : (m.from === 'admin' ? 'Admin · ' : 'Pemilik · ')) + esc(chatTime(m.ms)) + '</small></div>').join('');
  h += '</div><form id="chat-form" class="chat-form" data-uid="' + esc(uid) + '"><textarea id="chat-in" name="text" rows="2" maxlength="1000" placeholder="Tulis pesan… (Enter untuk kirim, Shift+Enter baris baru)" aria-label="Pesan">' + esc(UI.chatDraft || '') + '</textarea><button class="btn primary" type="submit">Kirim</button></form></section>';
  chatMarkRead(uid);
  return h;
}
function viewChat() {
  if (!CHAT.loaded && !CHAT.err) return LOADING;
  return '<p class="hint-top">Chat langsung dengan admin Lapak Kosan: tanya soal akun, paket, atau pembayaran. Balasan muncul di sini dan lonceng akan menyala kalau ada pesan baru.</p>' + chatThread(fbUser.uid, 'Chat dengan admin', (cur && cur.kos && cur.kos.name) || (ACC && ACC.kosName) || '', false);
}
function viewAdminChat() {
  if (!CHAT.loaded && !CHAT.err) return LOADING;
  const accs = accList(), byId = {}; accs.forEach(a => { byId[a.id] = a; });
  const open = UI.chatWith && byId[UI.chatWith] ? UI.chatWith : '';
  if (open) {
    const a = byId[open];
    return chatThread(open, a.kosName || (CHAT.threads[open] && CHAT.threads[open].name) || a.email || '-', [a.ownerName, a.phone].filter(Boolean).join(' · '), true);
  }
  chatUnwatch();
  const ids = Object.keys(CHAT.threads).filter(id => byId[id]).sort((x, y) => (Number(CHAT.threads[y].lastMs) || 0) - (Number(CHAT.threads[x].lastMs) || 0));
  const row = (id, t) => { const a = byId[id], un = t && threadUnread(t, 'admin'); return '<button type="button" class="crow' + (un ? ' un' : '') + '" data-act="chat-open" data-id="' + esc(id) + '"><span class="ph">' + (safePhoto(a.photo) ? '<img src="' + safePhoto(a.photo) + '" alt="">' : esc(initials(a.kosName || a.ownerName || a.email))) + '</span><span class="cr-t"><b>' + esc(a.kosName || (t && t.name) || a.email || '-') + '</b><small>' + esc(a.ownerName || '') + (t ? ' · ' + esc(t.lastFrom === 'admin' ? 'Kamu: ' : '') + esc(t.lastText || '') : '') + '</small></span>' + (t ? '<span class="cr-m">' + esc(chatTime(t.lastMs)) + '</span>' : '') + (un ? '<i class="udot" aria-label="Pesan baru"></i>' : '') + '</button>'; };
  const rest = accs.filter(a => !CHAT.threads[a.id]).sort((a, b) => String(a.kosName || a.email).localeCompare(String(b.kosName || b.email), 'id'));
  let h = '<p class="hint-top">Chat dengan pemilik kos. Percakapan yang ada pesan baru ditandai titik merah.</p>';
  if (CHAT.err) h += '<div class="banner">Sebagian data chat gagal dimuat (' + esc(CHAT.err) + '). Pastikan aturan Firestore terbaru sudah dipublish.</div>';
  h += '<div class="clist">' + (ids.length ? ids.map(id => row(id, CHAT.threads[id])).join('') : '<p class="muted" style="padding:1rem">Belum ada percakapan.</p>') + '</div>';
  if (rest.length) h += '<details class="cnew"><summary>Mulai chat dengan pemilik lain (' + rest.length + ')</summary><div class="clist">' + rest.map(a => row(a.id, null)).join('') + '</div></details>';
  return h;
}

/* menggantikan main.innerHTML supaya ketikan, fokus, dan posisi gulir chat tidak hilang saat data masuk */
function setMain(main, html) {
  const a = document.activeElement, keep = !!(a && a.id === 'chat-in'), sel = keep ? [a.selectionStart, a.selectionEnd] : null;
  const old = document.getElementById('chat-box'), top = old ? old.scrollTop : 0, atBottom = !old || old.scrollHeight - old.scrollTop - old.clientHeight < 80;
  main.innerHTML = html;
  const box = document.getElementById('chat-box');
  if (box) box.scrollTop = atBottom ? box.scrollHeight : top;
  if (keep) { const ta = document.getElementById('chat-in'); if (ta) { ta.focus(); try { ta.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
}
function chatSubmit(f) {
  const ta = f.querySelector('#chat-in'), btn = f.querySelector('[type=submit]'), text = ta.value.trim();
  if (!text || btn.disabled) return;
  btn.disabled = true;
  /* kosongkan kotak sebelum kirim: data masuk bisa menggambar ulang halaman sebelum pengiriman selesai */
  UI.chatDraft = ''; ta.value = '';
  chatSend(f.dataset.uid, text).catch(e => { toast(errText(e), true); if (!UI.chatDraft) { UI.chatDraft = text; const t2 = document.getElementById('chat-in'); if (t2 && !t2.value) t2.value = text; } }).then(() => { btn.disabled = false; const t3 = document.getElementById('chat-in'); if (t3) t3.focus(); });
}
document.addEventListener('submit', e => { if (e.target.id === 'chat-form') { e.preventDefault(); chatSubmit(e.target); } });
document.addEventListener('keydown', e => {
  if (e.target.id === 'chat-in' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); chatSubmit(e.target.form); }
});
document.addEventListener('input', e => { if (e.target.id === 'chat-in') UI.chatDraft = e.target.value; });

/* ---------- lonceng ---------- */
function renderBell(items) {
  BELL = items.filter(i => i.n > 0);
  const b = document.getElementById('bell'); if (!b) return;
  const n = BELL.reduce((s, i) => s + i.n, 0);
  b.querySelector('.bdot').hidden = !n; b.classList.toggle('has', n > 0);
  b.setAttribute('aria-label', n ? 'Notifikasi, ada yang perlu dicek' : 'Notifikasi');
  /* notifikasi sistem (HP/komputer): hanya saat aplikasi masih berjalan di latar belakang dan ada hal baru */
  const sig = BELL.map(i => i.text).join('|');
  if (bellSig !== null && sig !== bellSig && n > 0 && document.hidden && window.Notification && Notification.permission === 'granted') {
    const opt = { body: BELL.map(i => i.text).join('\n'), icon: 'img/icon-192.png', badge: 'img/icon-192.png', tag: 'lk-bell' };
    try { navigator.serviceWorker.getRegistration().then(r => { if (r) r.showNotification('Lapak Kosan', opt); else new Notification('Lapak Kosan', opt); }); } catch (e) { try { new Notification('Lapak Kosan', opt); } catch (e2) {} }
  }
  bellSig = sig;
}
function openBell() {
  const body = BELL.length
    ? '<div class="nlist">' + BELL.map(i => '<button type="button" class="nitem" data-act="bell-go" data-tab="' + esc(i.tab) + '"><span>' + esc(i.text) + '</span><b aria-hidden="true">›</b></button>').join('') + '</div>'
    : '<p class="muted" style="padding:.4rem 0 .6rem">Tidak ada notifikasi. Semua aman.</p>';
  const np = window.Notification ? Notification.permission : 'unsupported';
  const tail = np === 'default' ? '<div class="notif-opt"><p class="muted">Aktifkan notifikasi supaya HP atau komputer memberi tahu saat ada tagihan telat atau pesan baru, selama aplikasi masih terbuka atau jalan di latar belakang.</p><button type="button" class="btn sm primary" data-act="notif-ask">Aktifkan notifikasi perangkat</button></div>'
    : np === 'denied' ? '<p class="muted notif-opt">Notifikasi diblokir di browser ini. Izinkan lewat pengaturan situs (ikon gembok di address bar).</p>'
    : np === 'granted' ? '<p class="muted notif-opt">Notifikasi perangkat aktif.</p>' : '';
  openModal('Notifikasi', body + tail);
}
const CHAT_H = {
  bell: () => openBell(),
  'notif-ask': () => { try { Notification.requestPermission().then(() => { closeModal(); openBell(); }); } catch (e) {} },
  'bell-go': el => { closeModal(); setTab(el.dataset.tab); },
  'chat-open': el => { UI.chatWith = el.dataset.id; UI.chatDraft = ''; render(); },
  'chat-back': () => { UI.chatWith = ''; UI.chatDraft = ''; chatUnwatch(); render(); }
};

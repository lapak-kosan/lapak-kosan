'use strict';
/* ============================================================
   LAPISAN DATABASE
   dbRepo    -> Firestore (data per akun di users/<uid>/<koleksi>)
   localRepo -> cadangan localStorage bila Firebase tidak dipakai
   Variabel S, COLS, loaded, unsubs, loadErr didefinisikan di app.js.
   ============================================================ */
function dbRepo(db, uid) {
  const base = 'users/' + uid + '/';
  const clean = d => JSON.parse(JSON.stringify(d));
  return {
    start(cb) {
      COLS.forEach(c => {
        unsubs.push(db.collection(base + c).onSnapshot(snap => {
          const m = {};
          snap.docs.forEach(d => { m[d.id] = d.data(); });
          S[c] = m; loaded[c] = true; cb();
        }, err => { loaded[c] = true; loadErr = (err && err.code) || 'error'; cb(); }));
      });
    },
    set: (c, id, data) => db.doc(base + c + '/' + id).set(clean(data)),
    del: (c, id) => db.doc(base + c + '/' + id).delete()
  };
}
function localRepo() {
  const KEY = 'kelola-kos-v1';
  let cb = () => {};
  try { const raw = localStorage.getItem(KEY); if (raw) { const o = JSON.parse(raw); COLS.forEach(c => { if (o[c]) S[c] = o[c]; }); } } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  return {
    start(f) { cb = f; COLS.forEach(c => { loaded[c] = true; }); cb(); },
    async set(c, id, data) { S[c][id] = data; persist(); cb(); },
    async del(c, id) { delete S[c][id]; persist(); cb(); }
  };
}

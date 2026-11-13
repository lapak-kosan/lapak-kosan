'use strict';
/* ============================================================
   KONFIGURASI FIREBASE
   Isi dengan config web app dari Firebase Console
   (Project settings -> Your apps -> SDK setup and configuration).
   Hanya file ini yang perlu diedit kalau ganti project database.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD7OekmB2rqxNqyutjgVQfz-2qj5JLJzH0",
  authDomain: "kelola-kos-d2fd3.firebaseapp.com",
  projectId: "kelola-kos-d2fd3",
  storageBucket: "kelola-kos-d2fd3.firebasestorage.app",
  messagingSenderId: "614020354051",
  appId: "1:614020354051:web:d1ca3f6937c203e5b7fe36",
  measurementId: "G-RG2FMC6JZX"
};
const FB_READY = !/^ISI/.test(FIREBASE_CONFIG.apiKey) && !/^ISI/.test(FIREBASE_CONFIG.projectId);

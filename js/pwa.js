'use strict';
/* Pasang aplikasi ke layar utama (PWA). Tombol "Pasang aplikasi" muncul di bilah atas bila browser mendukung. */
(function () {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  let ev = null;
  const btn = () => document.getElementById('pwa-install');
  const show = () => { const b = btn(); if (b && !standalone()) b.hidden = false; };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ev = e; show(); });
  window.addEventListener('appinstalled', () => { ev = null; const b = btn(); if (b) b.hidden = true; });
  document.addEventListener('DOMContentLoaded', () => {
    if (ios) show();
    const b = btn(); if (!b) return;
    b.addEventListener('click', async () => {
      if (ev) { ev.prompt(); try { await ev.userChoice; } catch (e) {} ev = null; b.hidden = true; return; }
      if (typeof openModal === 'function') {
        const m = openModal('Pasang aplikasi', '<div class="sb" style="padding:0"><p>Di iPhone atau iPad, buka halaman ini lewat <b>Safari</b>, lalu:</p><ol style="padding-left:1.2rem;line-height:1.7"><li>Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas).</li><li>Pilih <b>Tambah ke Layar Utama</b>.</li><li>Ketuk <b>Tambah</b>.</li></ol><div class="actions"><button type="button" class="btn primary" data-close2>Mengerti</button></div></div>');
        m.querySelector('[data-close2]').addEventListener('click', () => closeModal());
      }
    });
  });
})();

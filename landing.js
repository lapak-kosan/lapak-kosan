'use strict';
/* ============================================================
   HALAMAN DEPAN (landing) untuk pengunjung yang belum masuk.
   Tombol Masuk / Coba gratis membuka form masuk dan daftar yang sudah ada.
   Dimuat sebelum app.js; memakai helper app.js dan admin.js saat dipanggil.
   ============================================================ */
const LD_ICON = {
  denah: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  orang: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  struk: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  petir: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  dompet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  grafik: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  perisai: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  hp: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  centang: '<path d="M20 6 9 17l-5-5"/>'
};
const ldIcon = (k, s) => '<svg viewBox="0 0 24 24" width="' + (s || 22) + '" height="' + (s || 22) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + LD_ICON[k] + '</svg>';

function landingHTML() {
  const plans = planList(true), wa = PAYINFO && PAYINFO.wa ? waLink(PAYINFO.wa, 'Halo admin ' + APP() + ', saya mau tanya soal aplikasinya.') : '';
  const brand = CUSTOM_BRAND() ? '<span class="g-logo">' + esc(APPLOGO()) + '</span><b>' + esc(APP()) + '</b>' : '<img src="' + heroLogo() + '" alt="' + esc(APP()) + '" width="800" height="555">';
  const title = (THEME && THEME.heroTitle) || 'Kosan dan kontrakan, rapi dalam satu layar.';
  const sub = (THEME && THEME.heroSub) || 'Catat penghuni, kontrak, tagihan, listrik dan air, sampai laporan keuangan. Semua dalam satu tempat, bisa dibuka dari HP.';
  const tile = (n, k) => '<span class="ld-t ld-t-' + k + '"><b>' + n + '</b></span>';
  const tiles = [['101', 'occ'], ['102', 'occ'], ['103', 'soon'], ['104', 'vac'], ['105', 'occ'], ['106', 'late'], ['107', 'occ'], ['108', 'vac'], ['109', 'occ'], ['110', 'occ'], ['111', 'soon'], ['112', 'occ']].map(t => tile(t[0], t[1])).join('');
  const feat = [
    ['denah', 'Denah kamar dan kontrakan', 'Lihat yang terisi, kosong, dan hampir jatuh tempo langsung dari denah. Kosan per lantai, kontrakan dengan alamat sendiri.'],
    ['orang', 'Penghuni dan kontrak', 'Data penghuni, deposit, dan durasi kontrak. Pengingat muncul 30 hari sebelum kontrak habis, perpanjang sekali klik.'],
    ['struk', 'Tagihan otomatis', 'Jatuh tempo dihitung dari tanggal masuk. Penghuni berkontrak dibayar penuh di muka sesuai durasinya.'],
    ['petir', 'Listrik dan air', 'Catat meteran, tarif dan total dihitung otomatis, lalu ikut tampil di tagihan sewa.'],
    ['dompet', 'Keuangan', 'Pemasukan, pengeluaran, dan selisih bulanan tercatat rapi tanpa buku catatan.'],
    ['grafik', 'Laporan Excel dan PDF', 'Unduh laporan per periode, per kamar, atau per penghuni kapan saja.'],
    ['perisai', 'Penjaga dan gaji', 'Catat penjaga, jadwal gaji, dan pembayarannya dalam satu tempat.'],
    ['chat', 'Chat dan notifikasi', 'Tanya admin langsung dari aplikasi. Lonceng menyala kalau ada tagihan telat atau pesan baru.'],
    ['hp', 'Bisa dipasang di HP', 'Buka lewat browser atau pasang ke layar utama, Android maupun iPhone.']
  ].map(f => '<article class="ld-card"><span class="ld-ic">' + ldIcon(f[0]) + '</span><h3>' + f[1] + '</h3><p>' + f[2] + '</p></article>').join('');
  const planCards = plans.map(p => '<article class="ld-price"><h3>' + esc(p.name) + '</h3><p class="ld-amt"><b>' + rp(p.price) + '</b><small>/ bulan</small></p><p class="ld-range">' + esc(planRange(p)) + '</p>' + (p.desc ? '<p class="muted">' + esc(p.desc) + '</p>' : '') + '<ul><li>Semua fitur aplikasi</li><li>Kamar kosan dan kontrakan</li><li>Verifikasi dan aktivasi oleh admin</li></ul><button type="button" class="btn lg" data-act="land-plan" data-id="' + esc(p.id) + '">Pilih paket</button></article>').join('');
  const faq = [
    ['Apakah free trial benar-benar gratis?', 'Ya. Gratis 1 bulan sejak akun disetujui admin, maksimal ' + TRIAL_MAX + ' unit. Tidak ada pembayaran selama masa trial, dan kamu bisa memakai semua fitur.'],
    ['Bisa untuk kontrakan, bukan hanya kamar kos?', 'Bisa. Kamu bebas memilih kosan, kontrakan, atau keduanya. Satu kamar atau satu kontrakan dihitung satu unit.'],
    ['Apakah bisa dipakai di HP?', 'Bisa. Buka lewat browser di HP, atau pasang ke layar utama supaya terbuka seperti aplikasi biasa. Tombol pasang ada di dalam aplikasi setelah masuk.'],
    ['Bagaimana cara membayar paket?', 'Pilih paket di dalam aplikasi, transfer sesuai petunjuk, lalu upload foto bukti. Setelah admin memverifikasi, paketmu otomatis aktif tanpa mengubah data yang sudah kamu isi.'],
    ['Apakah data saya aman?', 'Data disimpan di Google Firebase dan hanya bisa dibuka dengan akunmu. Aplikasi juga otomatis keluar kalau 10 menit tidak ada aktivitas.'],
    ['Apa yang terjadi setelah trial selesai?', 'Pilih salah satu paket berbayar untuk lanjut memakai aplikasi. Kamu bisa memilih paket kapan saja dari tab Langganan.']
  ].map(q => '<details><summary>' + q[0] + '</summary><p>' + q[1] + '</p></details>').join('');
  return '<div class="ld">' +
    '<header class="ld-nav"><div class="ld-wrap"><button type="button" class="ld-brand" data-act="land-go" data-to="ld-top" aria-label="' + esc(APP()) + '">' + brand + '</button>' +
      '<nav class="ld-links" aria-label="Menu halaman"><button type="button" data-act="land-go" data-to="fitur">Fitur</button><button type="button" data-act="land-go" data-to="cara">Cara kerja</button><button type="button" data-act="land-go" data-to="harga">Harga</button><button type="button" data-act="land-go" data-to="faq">FAQ</button></nav>' +
      '<div class="ld-cta"><button type="button" class="btn sm ld-ghost" data-act="land-login">Masuk</button><button type="button" class="btn sm primary" data-act="land-trial">Coba gratis</button></div></div></header>' +
    '<section class="ld-hero" id="ld-top"><div class="ld-wrap ld-hero-in"><div class="ld-hero-t"><p class="g-eyebrow">Untuk pemilik kos dan kontrakan</p><h1>' + esc(title) + '</h1><p class="ld-sub">' + esc(sub) + '</p>' +
      '<div class="ld-btns"><button type="button" class="btn primary lg" data-act="land-trial">Coba gratis 1 bulan</button><button type="button" class="btn lg ld-ghost" data-act="land-go" data-to="fitur">Lihat fitur</button></div>' +
      '<p class="ld-trust"><span>' + ldIcon('centang', 16) + ' Tanpa bayar</span><span>' + ldIcon('centang', 16) + ' Maksimal ' + TRIAL_MAX + ' unit</span><span>' + ldIcon('centang', 16) + ' Kosan, kontrakan, atau keduanya</span></p></div>' +
      '<div class="ld-mock" aria-hidden="true"><div class="ld-win"><div class="ld-bar"><i></i><i></i><i></i><span>Contoh tampilan</span></div><div class="ld-body">' +
        '<div class="ld-stats"><div><small>Terisi</small><b>9 dari 12</b></div><div><small>Telat bayar</small><b class="bad">1</b></div><div><small>Terkumpul</small><b>75%</b></div></div>' +
        '<div class="ld-grid">' + tiles + '</div><div class="ld-leg"><span class="occ">Terisi</span><span class="soon">Segera tempo</span><span class="late">Telat</span><span class="vac">Kosong</span></div></div></div></div></div></section>' +
    '<section class="ld-sec" id="cara"><div class="ld-wrap"><h2 class="ld-h">Dari denah sampai tagihan, tanpa buku catatan</h2><p class="ld-lead">Tiga hal yang paling sering dikerjakan pemilik kos, dibuat cukup satu atau dua ketukan.</p>' +
      '<div class="ld-row"><div class="ld-copy"><span class="ld-num">1</span><h3>Pendataan yang langsung kelihatan</h3><p>Buat lantai atau kontrakan sekali, lalu semua penghuni, harga, dan fasilitas tampil di denah. Kamar yang kosong, terisi, atau hampir jatuh tempo bisa dikenali sekilas.</p></div>' +
        '<div class="ld-fig"><div class="ld-win sm"><div class="ld-bar"><i></i><i></i><i></i><span>Layout</span></div><div class="ld-body"><div class="ld-grid g4">' + tiles.split('</span>').slice(0, 8).join('</span>') + '</span></div></div></div></div></div>' +
      '<div class="ld-row rev"><div class="ld-copy"><span class="ld-num">2</span><h3>Tagihan jalan otomatis</h3><p>Jatuh tempo dihitung dari tanggal masuk. Catat pembayaran dengan satu form, listrik dan air bisa dilunasi sekaligus, lalu kirim kwitansi PDF ke penghuni.</p></div>' +
        '<div class="ld-fig"><div class="ld-win sm"><div class="ld-bar"><i></i><i></i><i></i><span>Tagihan</span></div><div class="ld-body ld-bills">' +
          '<div><b>203</b><span>Natal<small>Jatuh tempo 1 hari lagi</small></span><em>Rp 1.450.000</em><u class="soon">Segera</u></div><div><b>105</b><span>Sari<small>Lunas 28 Okt</small></span><em>Rp 1.200.000</em><u class="ok">Lunas</u></div><div><b>106</b><span>Budi<small>Telat 3 hari</small></span><em>Rp 1.300.000</em><u class="late">Telat</u></div></div></div></div></div>' +
      '<div class="ld-row"><div class="ld-copy"><span class="ld-num">3</span><h3>Pengingat WhatsApp sekali klik</h3><p>Pesan pengingat sudah terisi nama, unit, nominal, dan tanggal jatuh tempo. Tinggal tekan kirim, satu per satu atau dari daftar semua yang perlu ditagih.</p></div>' +
        '<div class="ld-fig"><div class="ld-chat"><p class="b in">Halo Budi, pengingat sewa Kamar 106 periode Oktober 2026 sebesar Rp 1.300.000, jatuh tempo 26 Okt (sudah telat 3 hari). Mohon segera diselesaikan. Terima kasih.</p><p class="b out">Siap kak, transfer hari ini ya</p><span class="ld-pdf">' + ldIcon('struk', 16) + ' Kwitansi.pdf</span></div></div></div>' +
    '</div></section>' +
    '<section class="ld-sec alt" id="fitur"><div class="ld-wrap"><h2 class="ld-h">Semua yang kamu butuhkan mengelola kos</h2><p class="ld-lead">Satu aplikasi, tidak perlu pindah-pindah catatan.</p><div class="ld-feat">' + feat + '</div></div></section>' +
    '<section class="ld-sec" id="harga"><div class="ld-wrap"><h2 class="ld-h">Mulai gratis, lanjut kalau cocok</h2><p class="ld-lead">Free trial 1 bulan dulu. Tidak ada kewajiban lanjut.</p><div class="ld-prices">' +
      '<article class="ld-price hot"><span class="ld-tag">Paling mudah mulai</span><h3>Free Trial</h3><p class="ld-amt"><b>Rp 0</b><small>/ 1 bulan</small></p><p class="ld-range">Maksimal ' + TRIAL_MAX + ' unit</p><ul><li>Semua fitur aplikasi</li><li>Kosan, kontrakan, atau keduanya</li><li>Tanpa bayar selama trial</li></ul><button type="button" class="btn primary lg" data-act="land-trial">Coba gratis</button></article>' + planCards + '</div>' +
      '<p class="ld-note">Akun baru diperiksa admin dulu sebelum aktif. Pembayaran paket lewat transfer, lalu upload bukti di dalam aplikasi.</p></div></section>' +
    '<section class="ld-sec alt" id="faq"><div class="ld-wrap ld-narrow"><h2 class="ld-h">Pertanyaan yang sering muncul</h2><div class="ld-faq">' + faq + '</div></div></section>' +
    '<section class="ld-final"><div class="ld-wrap"><h2>Siap merapikan kosmu?</h2><p>Daftar sekarang dan pakai gratis selama 1 bulan.</p><div class="ld-btns c"><button type="button" class="btn primary lg" data-act="land-trial">Coba gratis 1 bulan</button>' + (wa ? '<a class="btn lg ld-ghost" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Tanya via WhatsApp</a>' : '') + '</div></div></section>' +
    '<footer class="ld-foot"><div class="ld-wrap"><div class="ld-brand sm">' + brand + '</div><p>Aplikasi manajemen kosan dan kontrakan.</p><nav><button type="button" data-act="land-go" data-to="fitur">Fitur</button><button type="button" data-act="land-go" data-to="harga">Harga</button><button type="button" data-act="land-go" data-to="faq">FAQ</button><button type="button" data-act="land-login">Masuk</button></nav><small>© ' + new Date().getFullYear() + ' ' + esc(APP()) + '</small></div></footer></div>';
}

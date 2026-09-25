// Kategori yang dihitung PER TIM: kapasitas hariannya dipotong per PESANAN,
// bukan per unit.
//
// MUA, EO, dan fotografer adalah tim yang hadir di acaranya. MUA yang merias
// 5 orang tetap memakai satu tim, jadi pesanan berisi 5 orang memotong 1 dari
// kapasitas — bukan 5. Florist dan sewa jas/kebaya kebalikannya: yang habis
// stok barang, jadi 5 buket memang memotong 5.
//
// Berapa banyak yang muat dalam sehari BUKAN lagi urusan file ini — itu
// vendors.daily_capacity, diisi vendornya sendiri. Dulu di sini ada
// EKSKLUSIF_HARIAN yang memaksa "satu tanggal penuh"; ternyata itu cuma
// kapasitas = 1, jadi lima kategori tidak butuh dua cabang logika.
//
// Namanya KUNCI_SHIFT sampai migrasi 014. Shift sudah tidak ada, dan yang
// tersisa dari flag itu cuma cara menghitung kapasitas — jadi namanya ikut
// pindah supaya tidak berbohong.
const PER_TIM = ['event_organizer', 'makeup_artist', 'photographer'];

const perTim = (category) => PER_TIM.includes(category);

// Pesanan dianggap MASIH MEMAKAI kapasitas selama belum batal/kedaluwarsa.
// Penolakan vendor dan pembatalan customer dua-duanya ikut menulis
// payment_status = 'cancelled', jadi satu predikat ini sudah mencakup
// ditolak/dibatalkan/kedaluwarsa sekaligus — sama persis dengan cakupan
// idx_booking_slot_ke_aktif di migrasi 014.
const BOOKING_AKTIF = `payment_status NOT IN ('cancelled', 'expired')`;

// Kategori yang dipesan per RENTANG JAM (migrasi 016). Untuk dua kategori ini
// daily_capacity = jumlah tim yang bisa jalan bersamaan, dan yang habis adalah
// jam tim-nya — bukan harinya. EO tetap satu tim per hari.
const BERBASIS_JAM = ['makeup_artist', 'photographer'];
const berbasisJam = (category) => BERBASIS_JAM.includes(category);

// Durasi paket kalau vendor tidak mengisinya (layanan baru).
const DURASI_BAWAAN = { makeup_artist: 180, photographer: 240 };
const MAKS_JAM_TAMBAHAN = 6;

/** Durasi TOTAL yang dipesan, dalam menit, tanpa jeda perjalanan.
 *  Paket per orang dikali jumlah orang; hasilnya dibulatkan ke atas ke jam
 *  penuh karena jadwal dipilih per jam. Jam tambahan ditempel sesudahnya.
 *  Rumus yang sama dipakai frontend (lib/durasi.ts) untuk menyalakan blok jam
 *  — kalau salah satu diubah, ubah dua-duanya. */
function durasiPesanan({ durasi_menit, per_orang }, jumlah, jamTambahan) {
  const dasar = durasi_menit * (per_orang ? jumlah : 1);
  return Math.ceil(dasar / 60) * 60 + jamTambahan * 60;
}

module.exports = {
  PER_TIM, perTim, BOOKING_AKTIF,
  BERBASIS_JAM, berbasisJam, DURASI_BAWAAN, MAKS_JAM_TAMBAHAN, durasiPesanan,
};

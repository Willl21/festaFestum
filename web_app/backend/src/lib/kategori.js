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

module.exports = { PER_TIM, perTim, BOOKING_AKTIF };

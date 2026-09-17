// Kategori yang mengunci SATU TANGGAL PENUH, bukan cuma satu shift.
//
// MUA, EO, dan fotografer adalah satu badan yang hadir di acaranya: begitu
// dipesan tanggal 21, dia tidak bisa melayani siapa pun lagi hari itu, shift
// mana pun. Florist dan sewa jas/kebaya tidak begitu — yang habis di sana
// stok barang, bukan waktu orangnya, jadi keduanya tetap boleh menerima
// beberapa pesanan di tanggal yang sama seperti sebelumnya.
const EKSKLUSIF_HARIAN = ['event_organizer', 'makeup_artist', 'photographer'];

const kunciSeharian = (category) => EKSKLUSIF_HARIAN.includes(category);

// Pesanan dianggap MASIH MEMAKAI jadwal selama belum batal/kedaluwarsa.
// Penolakan vendor dan pembatalan customer dua-duanya ikut menulis
// payment_status = 'cancelled', jadi satu predikat ini sudah mencakup
// ditolak/dibatalkan/kedaluwarsa sekaligus — sama persis dengan cakupan
// idx_booking_slot_aktif di migrasi 010.
const BOOKING_AKTIF = `payment_status NOT IN ('cancelled', 'expired')`;

module.exports = { EKSKLUSIF_HARIAN, kunciSeharian, BOOKING_AKTIF };

// Field tambahan per kategori layanan, disimpan di services.details (JSONB,
// migrasi 012).
//
// INI SUMBER KEBENARANNYA. Kembarannya di frontend ada di
// src/data/layananFields.ts dan kunci-kuncinya HARUS sama persis — pola yang
// sama dipakai payments.ts <-> midtrans.js dan BANKS <-> BANK_CODES. Kalau
// sebuah kunci meleset, field itu diam-diam hilang saat disimpan, tanpa error.
//
// Semua field bersifat OPSIONAL: vendor boleh mengisi sebagian saja. Yang
// dijaga di sini cuma tiga hal — kuncinya dikenal, nilainya teks, dan
// panjangnya wajar.

const PANJANG_PENDEK = 200;
const PANJANG_PANJANG = 600;

// true = boleh panjang (dirender sebagai textarea di frontend).
const FIELD = {
  makeup_artist: {
    jenis_layanan: false,
    gaya_makeup: false,
    durasi: false,
    jumlah_orang: false,
    fasilitas: true,
  },
  event_organizer: {
    jenis_acara: false,
    cakupan: true,
    durasi: false,
    kapasitas: false,
    tim: true,
  },
  photographer: {
    jenis_fotografi: false,
    gaya_fotografi: false,
    durasi: false,
    jumlah_fotografer: false,
    output: true,
    estimasi_pengerjaan: false,
    area_layanan: false,
  },
  florist: {
    jenis_produk: false,
    jenis_bunga: false,
    warna: false,
    ukuran: false,
    bisa_custom: false,
    estimasi_pengerjaan: false,
    fasilitas: true,
  },
  attire_rental: {
    jenis_pakaian: false,
    model: false,
    ukuran: false,
    warna: false,
    durasi_sewa: false,
    fasilitas: true,
    ketentuan: true,
  },
};

/** Memeriksa dan merapikan details untuk satu kategori.
 *
 *  Balasannya { salah } berisi pesan kesalahan, atau { nilai } berisi objek
 *  yang siap disimpan. Field kosong dibuang, bukan disimpan sebagai string
 *  kosong — supaya halaman detail tinggal menampilkan apa yang ada tanpa
 *  menyaring lagi.
 *
 *  `undefined` = tidak dikirim (biarkan apa adanya saat PATCH); `{}` = minta
 *  dikosongkan. Dua hal itu sengaja dibedakan, sama seperti `image`. */
function periksaDetail(details, category) {
  if (details === undefined || details === null) return { nilai: null };

  if (typeof details !== 'object' || Array.isArray(details)) {
    return { salah: 'details harus berupa objek' };
  }

  const izin = FIELD[category];
  if (!izin) return { salah: `Kategori ${category} tidak punya field tambahan` };

  const bersih = {};
  for (const [kunci, isi] of Object.entries(details)) {
    if (!(kunci in izin)) {
      return { salah: `Field "${kunci}" tidak dikenal untuk kategori ini` };
    }
    if (isi === null || isi === undefined || isi === '') continue;
    if (typeof isi !== 'string') {
      return { salah: `Field "${kunci}" harus berupa teks` };
    }
    const nilai = isi.trim();
    if (!nilai) continue;

    const maks = izin[kunci] ? PANJANG_PANJANG : PANJANG_PENDEK;
    if (nilai.length > maks) {
      return { salah: `Field "${kunci}" maksimal ${maks} karakter` };
    }
    bersih[kunci] = nilai;
  }

  return { nilai: bersih };
}

module.exports = { FIELD, periksaDetail };

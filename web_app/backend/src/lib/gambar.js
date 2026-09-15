// Validasi gambar yang dikirim sebagai data URL.
//
// Dipakai dua tempat dengan plafon berbeda: foto profil user (kecil, 256px)
// dan foto portofolio vendor (hero, jauh lebih besar). Aturan bentuknya sama
// persis, jadi cuma batas ukurannya yang jadi parameter.
//
// Gambar disimpan sebagai data URL di kolom TEXT karena proyek ini tidak punya
// object storage — lihat migrasi 006 dan 008.

/** Mengembalikan pesan kesalahan, atau null kalau gambarnya lolos. */
function gambarBermasalah(value, maxChars, sebutan = 'Gambar') {
  if (typeof value !== 'string') return `${sebutan} harus berupa teks`;
  if (value.length > maxChars) {
    return `${sebutan} terlalu besar, maksimal ~${Math.round((maxChars * 3) / 4 / 1024)} KB`;
  }
  // URL http diizinkan supaya gambar hasil seed (yang menunjuk ke berkas di
  // public/) tidak ikut tertolak.
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) &&
      !/^https?:\/\//.test(value)) {
    return `${sebutan} harus gambar PNG/JPEG/WebP`;
  }
  return null;
}

module.exports = { gambarBermasalah };

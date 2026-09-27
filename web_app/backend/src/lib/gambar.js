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

/** Alamat foto yang siap dipakai sebagai target redirect.
 *
 *  `unduh-foto.js` menulis '/img/pexels-N.jpg' ke DB — path itu relatif
 *  terhadap FRONTEND, bukan API. Selama demo satu port keduanya satu origin
 *  jadi apa adanya benar; sesudah dideploy terpisah (Netlify + Railway),
 *  browser menyelesaikannya ke domain backend dan dapat 404. Origin frontend
 *  diambil dari CORS_ORIGINS pertama — daftar yang memang sudah berisi alamat
 *  frontend, jadi tidak ada variabel baru yang bisa lupa diisi. */
function urlFotoAbsolut(value) {
  if (!value.startsWith('/')) return value;
  const frontend = (process.env.CORS_ORIGINS || '').split(',')[0].trim();
  return frontend ? frontend.replace(/\/$/, '') + value : value;
}

// Dokumen legal vendor (KTP/NPWP/SIUP): gambar ATAU PDF. Plafonnya ~700 KB
// berkas asli — base64 menggelembungkannya ke ~950 ribu karakter, masih di
// bawah express.json() 1 MB. Gambar sudah diperkecil browser (bacaDokumen).
// ponytail: PII di kolom TEXT database utama. Upgrade-nya bucket privat +
// kebijakan retensi; yang penting sekarang berkasnya tidak pernah publik.
const DOKUMEN_MAX_CHARS = 950_000;
const POLA_DOKUMEN = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;

function dokumenBermasalah(value) {
  if (typeof value !== 'string') return 'Berkas harus berupa teks';
  if (value.length > DOKUMEN_MAX_CHARS) return 'Berkas terlalu besar, maksimal ~700 KB';
  if (!POLA_DOKUMEN.test(value)) return 'Berkas harus gambar JPG/PNG/WebP atau PDF';
  return null;
}

/** Mengirim dokumen tersimpan sebagai berkas. `private, no-store`: isinya
 *  data pribadi, jangan sampai tertahan di cache bersama. */
function kirimDokumen(res, dataUrl) {
  const cocok = POLA_DOKUMEN.exec(dataUrl || '');
  if (!cocok) return res.status(404).json({ message: 'Berkas belum diunggah' });
  res.set('Content-Type', cocok[1]);
  res.set('Cache-Control', 'private, no-store');
  res.send(Buffer.from(cocok[2], 'base64'));
}

module.exports = { gambarBermasalah, urlFotoAbsolut, dokumenBermasalah, kirimDokumen };

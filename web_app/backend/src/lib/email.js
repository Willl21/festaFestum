// Email transaksional lewat Brevo (HTTP API, memakai fetch bawaan Node — nol
// dependensi baru). Dipilih karena Brevo cukup memverifikasi SATU alamat
// pengirim, tanpa domain sendiri, dan bisa mengirim ke siapa saja; Railway
// juga memblokir port SMTP keluar, jadi nodemailer + Gmail tidak jalan di sana.
//
// Dua variabel .env: BREVO_API_KEY dan EMAIL_PENGIRIM (alamat yang sudah
// diverifikasi di dashboard Brevo). Kalau salah satu kosong, kirimEmail diam
// saja — dev lokal dan anggota tim tanpa akun Brevo tetap jalan normal.
//
// ponytail: dikirim sekali, tanpa antrean dan tanpa ulang-coba. Kalau Brevo
// sedang gagal, emailnya hilang — pemberitahuan di chat & lencana navbar tetap
// ada. Tambah antrean kalau email jadi satu-satunya jalur pemberitahuan.

/** Alamat yang TIDAK boleh dikirimi. `@mail.com` itu domain asli milik orang
 *  lain yang dipakai skrip tes (lihat test-*.js) — tanpa saringan ini tiap
 *  kali suite jalan, kotak masuk orang asing ikut kebanjiran dan reputasi
 *  pengirim di Brevo rusak. `.test` domain yang memang tidak pernah ada
 *  (akun seed). */
const JANGAN_KIRIM = /@mail\.com$|\.test$/i;

async function kirimEmail({ ke, nama, subjek, teks }) {
  const kunci = process.env.BREVO_API_KEY;
  const dari = process.env.EMAIL_PENGIRIM;
  if (!kunci || !dari || !ke || JANGAN_KIRIM.test(ke)) return;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': kunci, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: dari, name: 'Festa Festum' },
      to: [{ email: ke, name: nama }],
      subject: subjek,
      textContent: teks,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}

/** Alamat frontend untuk tautan di email — CORS_ORIGINS pertama, aturan yang
 *  sama dengan urlFotoAbsolut di gambar.js. */
const urlFrontend = (path) =>
  ((process.env.CORS_ORIGINS || '').split(',')[0].trim().replace(/\/$/, '') || 'http://localhost:5173') + path;

module.exports = { kirimEmail, urlFrontend };

// Kode 6 digit sekali pakai via email — satu mekanisme untuk lupa sandi,
// langkah kedua login (2FA), dan konfirmasi menyalakan 2FA. Lihat migrasi 022.
//
// "Tiket" yang dipegang browser = kode_id. Tiket saja tidak cukup (butuh kode
// dari email), kode saja juga tidak (butuh tiket yang cocok), jadi tiket boleh
// dikirim ke browser.
const crypto = require('crypto');
const pool = require('../config/db');
const { kirimEmail } = require('./email');

const UMUR_MENIT = 10;
const MAKS_PERCOBAAN = 5;
// Kode yang terbit kurang dari ini dipakai ulang tanpa email baru: tombol
// "kirim ulang" atau form lupa sandi yang ditekan berulang tidak boleh jadi
// alat membanjiri kotak masuk orang.
const JEDA_KIRIM_DETIK = 60;

const SUBJEK = {
  reset_sandi: 'Kode atur ulang kata sandi Festa Festum',
  login: 'Kode masuk Festa Festum',
  aktifkan_2fa: 'Kode verifikasi dua langkah Festa Festum',
};
const PEMBUKA = {
  reset_sandi: 'Seseorang meminta atur ulang kata sandi akun Festa Festum Anda.',
  login: 'Ada upaya masuk ke akun Festa Festum Anda dengan kata sandi yang benar.',
  aktifkan_2fa: 'Anda sedang menyalakan verifikasi dua langkah di akun Festa Festum.',
};

const hashKode = (kode) =>
  crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:${kode}`).digest('hex');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "wi***@gmail.com" — cukup bagi pemiliknya untuk tahu kode dikirim ke mana. */
const samarkanEmail = (email) => email.replace(/^(.{2})[^@]*/, '$1***');

/** Terbitkan kode untuk user+tujuan dan kirim ke emailnya. Mengembalikan tiket
 *  (kode_id). Melempar kalau email gagal terkirim — pemanggil yang memutuskan
 *  apakah kegagalan itu boleh terlihat (login) atau harus disembunyikan
 *  (lupa sandi, supaya tidak membocorkan email mana yang terdaftar). */
async function terbitkanKode(user, tujuan) {
  const { rows: [segar] } = await pool.query(
    `SELECT kode_id FROM kode_otp
      WHERE user_id = $1 AND tujuan = $2 AND dipakai_at IS NULL AND kedaluwarsa > now()
        AND dibuat_at > now() - make_interval(secs => $3)
        AND percobaan < $4  -- kode yang sudah habis jatah salahnya jangan dipakai ulang
      ORDER BY dibuat_at DESC LIMIT 1`,
    [user.user_id, tujuan, JEDA_KIRIM_DETIK, MAKS_PERCOBAAN]
  );
  if (segar) return segar.kode_id;

  const kode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // Satu kode aktif per tujuan: yang lama hangus begitu yang baru terbit.
  await pool.query(
    `UPDATE kode_otp SET dipakai_at = now()
      WHERE user_id = $1 AND tujuan = $2 AND dipakai_at IS NULL`,
    [user.user_id, tujuan]
  );
  const { rows: [baris] } = await pool.query(
    `INSERT INTO kode_otp (user_id, tujuan, kode_hash, kedaluwarsa)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))
     RETURNING kode_id`,
    [user.user_id, tujuan, hashKode(kode), UMUR_MENIT]
  );

  // Dev tanpa akun Brevo (anggota tim lain): kodenya dicetak di log server
  // supaya alurnya tetap bisa dicoba. Dengan Brevo, kode HANYA lewat email.
  if (!process.env.BREVO_API_KEY) console.log(`[kode ${tujuan}] ${user.email}: ${kode}`);

  await kirimEmail({
    ke: user.email,
    nama: user.name,
    subjek: SUBJEK[tujuan],
    teks:
      `${PEMBUKA[tujuan]}\n\nKode Anda: ${kode}\n\n`
      + `Berlaku ${UMUR_MENIT} menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku tim Festa Festum.\n`
      + 'Kalau bukan Anda yang memintanya, abaikan email ini dan segera ganti kata sandi Anda.',
  });
  return baris.kode_id;
}

/** Cocokkan kode dengan tiketnya. Percobaan dinaikkan SEBELUM dibandingkan,
 *  dalam satu UPDATE, jadi tebakan paralel pun tetap terhitung. Kode yang
 *  cocok langsung ditandai terpakai. `userId` diisi kalau tiketnya harus milik
 *  akun yang sedang login (konfirmasi 2FA).
 *  @returns {{ user_id: string } | { salah: string }} */
async function cocokkanKode(tiket, tujuan, kode, userId = null) {
  if (!UUID.test(String(tiket)) || !/^\d{6}$/.test(String(kode))) {
    return { salah: 'Kode harus 6 digit angka.' };
  }
  const { rows: [k] } = await pool.query(
    `UPDATE kode_otp SET percobaan = percobaan + 1
      WHERE kode_id = $1 AND tujuan = $2 AND dipakai_at IS NULL
        AND kedaluwarsa > now() AND percobaan < $3
        AND ($4::uuid IS NULL OR user_id = $4::uuid)
      RETURNING user_id, kode_hash`,
    [tiket, tujuan, MAKS_PERCOBAAN, userId]
  );
  if (!k) return { salah: 'Kode sudah kedaluwarsa atau terlalu sering salah. Minta kode baru.' };

  const cocok = crypto.timingSafeEqual(Buffer.from(hashKode(kode)), Buffer.from(k.kode_hash));
  if (!cocok) return { salah: 'Kode salah.' };

  const { rowCount } = await pool.query(
    'UPDATE kode_otp SET dipakai_at = now() WHERE kode_id = $1 AND dipakai_at IS NULL',
    [tiket]
  );
  if (!rowCount) return { salah: 'Kode sudah dipakai. Minta kode baru.' };
  return { user_id: k.user_id };
}

module.exports = { terbitkanKode, cocokkanKode, samarkanEmail };

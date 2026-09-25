// Error handler global, dipasang paling akhir di app.js
function errorHandler(err, req, res, next) {
  console.error(err);

  // Koneksi database penuh (Supabase session pooler: 15 klien untuk SEMUA
  // proses sekaligus — Railway, dev lokal, skrip tes). Bukan salah pemakai dan
  // biasanya lewat dalam hitungan detik, jadi 503 + ajakan mencoba lagi.
  if (/EMAXCONNSESSION|max clients reached|too many clients/i.test(err.message || '')) {
    return res.status(503).json({ message: 'Server sedang sibuk. Coba lagi beberapa saat lagi.' })
  }

  // Duplicate key error dari PostgreSQL (mis. email sudah terdaftar)
  if (err.code === '23505') {
    return res.status(409).json({ message: 'Data sudah terdaftar (duplikat)' });
  }

  // 22P02 = invalid_text_representation, mis. ":vendorId" bukan UUID valid.
  // Ini salah input user, bukan error server, jadi 400 bukan 500.
  if (err.code === '22P02') {
    return res.status(400).json({ message: 'Format ID tidak valid' });
  }

  // Hanya error yang sengaja kita lempar (punya err.status) yang pesannya
  // boleh sampai ke client. Sisanya generik, supaya detail PostgreSQL
  // (nama constraint, tipe kolom, potongan query) tidak bocor ke penyerang.
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }

  res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

module.exports = errorHandler;

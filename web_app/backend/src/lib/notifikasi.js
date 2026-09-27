// Satu pintu untuk menulis notifikasi lonceng (migrasi 019).
//
// Selalu dipanggil dengan `db` = client transaksi kejadiannya, supaya
// notifikasi ikut batal kalau kejadiannya di-ROLLBACK. Penerimanya bisa akun
// (userId) atau vendor — untuk vendor, pemiliknya dicari lewat subquery, jadi
// pemanggil tidak perlu membaca owner_user_id dulu.

async function beriTahu(db, userId, { judul, isi, tautan = null }) {
  await db.query(
    'INSERT INTO notifikasi (user_id, judul, isi, tautan) VALUES ($1, $2, left($3, 500), $4)',
    [userId, judul, isi, tautan]
  );
}

async function beriTahuVendor(db, vendorId, { judul, isi, tautan = null }) {
  await db.query(
    `INSERT INTO notifikasi (user_id, judul, isi, tautan)
     SELECT owner_user_id, $2, left($3, 500), $4 FROM vendors WHERE vendor_id = $1`,
    [vendorId, judul, isi, tautan]
  );
}

module.exports = { beriTahu, beriTahuVendor };

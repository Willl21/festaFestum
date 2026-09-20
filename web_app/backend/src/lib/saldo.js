// Satu rumus saldo vendor untuk seluruh backend.
//
// Dipusatkan (bukan disalin ke tiap controller) karena ini jalur uang: kalau
// halaman keuangan vendor dan pemeriksaan batas pencairan memakai rumus yang
// sedikit berbeda, vendor bisa menarik lebih besar dari yang benar-benar
// dimilikinya, dan selisihnya baru ketahuan belakangan.
//
// Definisinya:
//   dirilis_kotor = pembayaran sukses untuk acara yang SUDAH lewat
//   escrow        = pembayaran sukses untuk acara yang BELUM lewat
//   saldo         = dirilis_kotor - biaya platform - payout (pending + paid)
//
// Payout 'pending' ikut mengurangi saldo: dana yang sedang diajukan tidak
// boleh bisa diajukan dua kali sambil menunggu keputusan admin.

const PLATFORM_FEE_RATE = 0.025;

/** @param db pool atau client transaksi (pakai client kalau sedang mengunci baris). */
async function hitungSaldo(db, vendorId) {
  const { rows } = await db.query(
    `WITH lunas AS (
       SELECT p.amount, bk.event_date
         FROM payments p
         JOIN bookings bk ON bk.booking_id = p.booking_id
         JOIN services s  ON s.service_id  = bk.service_id
        WHERE s.vendor_id = $1 AND p.gateway_status = 'success'
     )
     SELECT
       COALESCE((SELECT SUM(amount) FROM lunas WHERE event_date <  CURRENT_DATE), 0) AS dirilis_kotor,
       COALESCE((SELECT SUM(amount) FROM lunas WHERE event_date >= CURRENT_DATE), 0) AS escrow,
       COALESCE((SELECT SUM(amount) FROM lunas), 0)                                  AS total_masuk,
       (SELECT count(*) FROM lunas WHERE event_date >= CURRENT_DATE)::int            AS pesanan_escrow,
       COALESCE((SELECT SUM(amount) FROM payouts
                  WHERE vendor_id = $1 AND status IN ('pending', 'paid')), 0)        AS ditarik,
       COALESCE((SELECT SUM(amount) FROM payouts
                  WHERE vendor_id = $1 AND status = 'pending'), 0)                   AS menunggu_persetujuan`,
    [vendorId]
  );

  const r = rows[0];
  const kotor = Number(r.dirilis_kotor);
  const fee = Math.round(kotor * PLATFORM_FEE_RATE);
  const ditarik = Number(r.ditarik);

  return {
    saldo_tersedia: kotor - fee - ditarik,
    escrow: Number(r.escrow),
    total_masuk: Number(r.total_masuk),
    biaya_platform: fee,
    platform_fee_rate: PLATFORM_FEE_RATE,
    pesanan_escrow: r.pesanan_escrow,
    sudah_ditarik: ditarik,
    menunggu_persetujuan: Number(r.menunggu_persetujuan),
  };
}

/** vendor_id milik akun yang login, atau null kalau dia belum punya profil vendor. */
async function vendorIdMilik(db, userId) {
  const { rows } = await db.query('SELECT vendor_id FROM vendors WHERE owner_user_id = $1', [userId]);
  return rows[0]?.vendor_id ?? null;
}

module.exports = { PLATFORM_FEE_RATE, hitungSaldo, vendorIdMilik };

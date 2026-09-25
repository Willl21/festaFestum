const pool = require('../config/db');
const { hitungSaldo, vendorIdMilik } = require('../lib/saldo');

// ------------------------------------------------------------
// PENCAIRAN DANA VENDOR (payout)
//
// Uang tidak pernah mengalir lewat gateway ke vendor — ini buku besar
// internal. Vendor mengajukan, admin memutuskan, transfer sungguhannya
// terjadi di luar sistem.
// ------------------------------------------------------------

// POST /api/v1/payouts  (vendor_owner)
// Body: { amount }
async function requestPayout(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'amount harus angka lebih dari 0' });
    }

    await client.query('BEGIN');

    const vendorId = await vendorIdMilik(client, req.user.user_id);
    if (!vendorId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Anda belum memiliki profil vendor' });
    }

    // Baris vendor dikunci selama pemeriksaan saldo. Tanpa ini, dua pengajuan
    // yang dikirim bersamaan sama-sama lolos pemeriksaan dan totalnya bisa
    // melebihi saldo — pola yang sama dengan penguncian slot di booking.
    await client.query('SELECT vendor_id FROM vendors WHERE vendor_id = $1 FOR UPDATE', [vendorId]);

    const saldo = await hitungSaldo(client, vendorId);

    if (amount > saldo.saldo_tersedia) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Jumlah melebihi saldo yang bisa dicairkan',
        saldo_tersedia: saldo.saldo_tersedia,
      });
    }

    const { rows } = await client.query(
      `INSERT INTO payouts (vendor_id, amount)
       VALUES ($1, $2)
       RETURNING payout_id, amount, status, requested_at`,
      [vendorId, amount]
    );

    await client.query('COMMIT');
    res.status(201).json({ payout: rows[0], sisa_saldo: saldo.saldo_tersedia - amount });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client?.release();
  }
}

// GET /api/v1/payouts  (vendor_owner) — riwayat pencairan vendor sendiri.
async function listMyPayouts(req, res, next) {
  try {
    const vendorId = await vendorIdMilik(pool, req.user.user_id);
    if (!vendorId) {
      return res.status(404).json({ message: 'Anda belum memiliki profil vendor' });
    }

    const { rows } = await pool.query(
      `SELECT payout_id, amount, status, note, requested_at, decided_at
         FROM payouts WHERE vendor_id = $1
        ORDER BY requested_at DESC
        LIMIT 100`,
      [vendorId]
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { requestPayout, listMyPayouts };

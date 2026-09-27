const pool = require('../config/db');
const { beriTahu, beriTahuVendor } = require('../lib/notifikasi');

// ------------------------------------------------------------
// REFUND & LAPORAN VENDOR (migrasi 020)
//
// Klien mengajukan dari Pesanan Saya, admin memutuskan di Pusat Escrow &
// Penyelesaian. Refund tidak lewat gateway (di luar lingkup sandbox): yang
// disetujui menandai pembayarannya 'refunded', sehingga keluar sendiri dari
// saldo & escrow vendor — lib/saldo.js cuma menghitung 'success'.
// ------------------------------------------------------------

const JENIS = ['refund', 'laporan'];

// POST /api/v1/bookings/:bookingId/laporan  (pemilik pesanan)
// Body: { jenis: 'refund' | 'laporan', alasan }
async function ajukanLaporan(req, res, next) {
  const { jenis, alasan } = req.body || {};
  if (!JENIS.includes(jenis)) {
    return res.status(400).json({ message: "jenis harus 'refund' atau 'laporan'" });
  }
  const teks = typeof alasan === 'string' ? alasan.trim() : '';
  if (teks.length < 10 || teks.length > 1000) {
    return res.status(400).json({ message: 'Alasan wajib diisi, 10–1000 karakter' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Kepemilikan di WHERE: pesanan orang lain = 404, bukan 403.
    const bk = await client.query(
      `SELECT b.booking_id, b.payment_status, b.vendor_id, s.service_name,
              to_char(b.event_date, 'DD/MM/YYYY') AS tanggal
         FROM bookings b JOIN services s ON s.service_id = b.service_id
        WHERE b.booking_id = $1 AND b.user_id = $2
        FOR UPDATE OF b`,
      [req.params.bookingId, req.user.user_id]
    );
    if (bk.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }
    const booking = bk.rows[0];

    // Refund cuma berarti kalau ada uang yang masuk. Pesanan yang belum
    // dibayar cukup dibatalkan lewat tombol Batalkan.
    if (jenis === 'refund' && !['dp_paid', 'fully_paid'].includes(booking.payment_status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Refund hanya untuk pesanan yang sudah dibayar. Pesanan ini cukup dibatalkan.',
      });
    }

    const { rows } = await client.query(
      `INSERT INTO laporan (booking_id, user_id, jenis, alasan)
       VALUES ($1, $2, $3, $4)
       RETURNING laporan_id, jenis, status, dibuat_at`,
      [booking.booking_id, req.user.user_id, jenis, teks]
    );

    await beriTahuVendor(client, booking.vendor_id, {
      judul: jenis === 'refund' ? 'Klien mengajukan refund' : 'Klien melaporkan pesanan',
      isi: `"${booking.service_name}" untuk ${booking.tanggal}. Admin sedang meninjaunya.`,
      tautan: '/vendor/pemesanan',
    });

    await client.query('COMMIT');
    res.status(201).json({ laporan: rows[0] });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    // idx_laporan_satu_menunggu: sudah ada pengajuan yang belum diputuskan.
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Masih ada pengajuan untuk pesanan ini yang menunggu admin' });
    }
    next(err);
  } finally {
    client?.release();
  }
}

// GET /api/v1/admin/laporan?status=menunggu|disetujui|ditolak|all  (admin)
async function listLaporan(req, res, next) {
  try {
    const status = req.query.status || 'menunggu';
    if (!['menunggu', 'disetujui', 'ditolak', 'all'].includes(status)) {
      return res.status(400).json({ message: 'status tidak valid' });
    }
    const { rows } = await pool.query(
      `SELECT l.laporan_id, l.jenis, l.alasan, l.status, l.catatan_admin,
              l.dibuat_at, l.diputuskan_at,
              b.booking_id, b.event_date, b.total_price, b.payment_status,
              s.service_name, v.business_name, u.name AS customer_name, u.email AS customer_email,
              COALESCE((SELECT SUM(p.amount) FROM payments p
                         WHERE p.booking_id = b.booking_id AND p.gateway_status = 'success'), 0)
                AS dibayar
         FROM laporan l
         JOIN bookings b ON b.booking_id = l.booking_id
         JOIN services s ON s.service_id = b.service_id
         JOIN vendors  v ON v.vendor_id  = b.vendor_id
         JOIN users    u ON u.user_id    = l.user_id
        WHERE $1 = 'all' OR l.status = $1
        ORDER BY l.dibuat_at DESC
        LIMIT 100`,
      [status]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/laporan/:laporanId  (admin)
// Body: { action: 'setujui' | 'tolak', catatan? } — catatan wajib saat menolak.
async function putuskanLaporan(req, res, next) {
  const { action, catatan } = req.body || {};
  if (action !== 'setujui' && action !== 'tolak') {
    return res.status(400).json({ message: "action harus 'setujui' atau 'tolak'" });
  }
  const note = typeof catatan === 'string' ? catatan.trim() : '';
  if (action === 'tolak' && !note) {
    return res.status(400).json({ message: 'catatan wajib diisi saat menolak' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Status lama di WHERE: klik dua kali tidak me-refund dua kali.
    const { rows } = await client.query(
      `UPDATE laporan
          SET status = $1, catatan_admin = $2, diputuskan_at = now(), diputuskan_oleh = $3
        WHERE laporan_id::text = $4 AND status = 'menunggu'
        RETURNING laporan_id, booking_id, user_id, jenis, status, catatan_admin, diputuskan_at`,
      [action === 'setujui' ? 'disetujui' : 'ditolak', note || null, req.user.user_id, req.params.laporanId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      const ada = await pool.query('SELECT status FROM laporan WHERE laporan_id::text = $1', [req.params.laporanId]);
      return ada.rows.length === 0
        ? res.status(404).json({ message: 'Pengajuan tidak ditemukan' })
        : res.status(409).json({ message: 'Pengajuan ini sudah diputuskan', status: ada.rows[0].status });
    }
    const lap = rows[0];

    const refund = lap.jenis === 'refund' && action === 'setujui';
    let dikembalikan = 0;
    if (refund) {
      const p = await client.query(
        `UPDATE payments SET gateway_status = 'refunded'
          WHERE booking_id = $1 AND gateway_status = 'success'
          RETURNING amount`,
        [lap.booking_id]
      );
      dikembalikan = p.rows.reduce((t, r) => t + Number(r.amount), 0);
      // 'cancelled' melepas slotnya (kapasitas & indeks cuma menghitung
      // pesanan aktif) dan menutup jalan untuk membayar lagi.
      // ponytail: kalau dananya sudah dicairkan vendor, saldonya jadi minus
      // dan pencairan berikutnya tertahan sampai tertutup. Penagihan balik
      // ke vendor di luar sistem.
      await client.query(
        `UPDATE bookings SET payment_status = 'cancelled', updated_at = now() WHERE booking_id = $1`,
        [lap.booking_id]
      );
    }

    const { rows: [bk] } = await client.query(
      `SELECT b.vendor_id, s.service_name FROM bookings b
         JOIN services s ON s.service_id = b.service_id WHERE b.booking_id = $1`,
      [lap.booking_id]
    );
    const rp = `Rp${dikembalikan.toLocaleString('id-ID')}`;
    const apa = lap.jenis === 'refund' ? 'Refund' : 'Laporan';
    const hasil = action === 'setujui' ? 'disetujui' : 'ditolak';
    const catatanAdmin = note ? ` Catatan admin: ${note}` : '';
    await beriTahu(client, lap.user_id, {
      judul: `${apa} ${hasil}`,
      isi: refund
        ? `${rp} untuk "${bk.service_name}" dikembalikan ke rekening Anda secara manual oleh admin.`
        : `"${bk.service_name}".${catatanAdmin}`,
      tautan: '/pesanan',
    });
    await beriTahuVendor(client, bk.vendor_id, {
      judul: `${apa} klien ${hasil} admin`,
      isi: refund
        ? `Pesanan "${bk.service_name}" dibatalkan dan ${rp} ditarik dari escrow/saldo Anda.`
        : `"${bk.service_name}".${catatanAdmin}`,
      tautan: '/vendor/pemesanan',
    });

    await client.query('COMMIT');
    res.json({ laporan: lap, dikembalikan });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client?.release();
  }
}

module.exports = { ajukanLaporan, listLaporan, putuskanLaporan };

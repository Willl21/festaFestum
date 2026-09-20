const pool = require('../config/db');
const { periksaDetail } = require('../lib/layananDetail');
const { gambarBermasalah, urlFotoAbsolut } = require('../lib/gambar');

const VALID_CATEGORIES = [
  'event_organizer', 'florist', 'attire_rental', 'makeup_artist', 'photographer',
];

// Sama dengan plafon foto portofolio vendor: dua-duanya foto etalase lanskap
// yang dikecilkan browser ke 900x600 sebelum dikirim.
const FOTO_MAX_CHARS = 200_000;

// image_url TIDAK pernah ikut di respons: isinya data URL ratusan KB, dan satu
// halaman katalog bisa memuat belasan layanan. Yang dikirim cuma penandanya;
// gambarnya diambil terpisah lewat GET /services/:serviceId/photo.
const KOLOM_LAYANAN = `service_id, vendor_id, service_name, category, description,
         price, minimum_notice_days, is_active, created_at, details,
         (image_url IS NOT NULL) AS has_photo`;

/** null kalau tidak ada gambar yang dikirim, string kosong kalau diminta
 *  dihapus, atau pesan kesalahan kalau gambarnya bermasalah. */
function periksaFoto(image) {
  if (image === undefined || image === null) return { nilai: null };
  if (image === '') return { nilai: '' };
  const salah = gambarBermasalah(image, FOTO_MAX_CHARS, 'Foto layanan');
  return salah ? { salah } : { nilai: image };
}

// Helper: pastikan vendor ini milik user yang login
async function assertVendorOwnership(vendorId, userId) {
  const result = await pool.query(
    'SELECT vendor_id FROM vendors WHERE vendor_id = $1 AND owner_user_id = $2',
    [vendorId, userId]
  );
  return result.rows.length > 0;
}

// POST /api/v1/vendors/:vendorId/services  (pemilik vendor)
// Satu vendor = satu kategori. Dibatasi di level aplikasi, mengikuti pola
// "satu akun satu profil vendor" — schema-nya sengaja dibiarkan tetap
// mendukung banyak kategori supaya aturan ini bisa dilonggarkan lagi tanpa
// migrasi kalau nanti berubah pikiran.
//
// Layanan nonaktif ikut dihitung: menonaktifkan layanan bukan menghapusnya
// (keputusan desain no. 6), dan pesanan lama masih menunjuk ke barisnya.
async function kategoriLain(vendorId, category, kecualiServiceId = null) {
  const { rows } = await pool.query(
    `SELECT DISTINCT category::text AS category
       FROM services
      WHERE vendor_id = $1 AND category <> $2::vendor_category
        AND ($3::uuid IS NULL OR service_id <> $3::uuid)`,
    [vendorId, category, kecualiServiceId]
  );
  return rows.map((r) => r.category);
}

async function createService(req, res, next) {
  try {
    const { vendorId } = req.params;
    const { service_name, category, description, price, minimum_notice_days, image, details } = req.body;

    if (!service_name || !category || price === undefined) {
      return res.status(400).json({ message: 'service_name, category, dan price wajib diisi' });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'category tidak valid', allowed: VALID_CATEGORIES });
    }

    if (Number(price) < 0) {
      return res.status(400).json({ message: 'price tidak boleh negatif' });
    }

    const foto = periksaFoto(image);
    if (foto.salah) return res.status(400).json({ message: foto.salah });

    const rinci = periksaDetail(details, category);
    if (rinci.salah) return res.status(400).json({ message: rinci.salah });

    const isOwner = await assertVendorOwnership(vendorId, req.user.user_id);
    if (!isOwner) {
      return res.status(404).json({ message: 'Vendor tidak ditemukan atau bukan milik Anda' });
    }

    const lain = await kategoriLain(vendorId, category);
    if (lain.length > 0) {
      return res.status(409).json({
        message: `Vendor ini sudah terdaftar di kategori ${lain.join(', ')}.`
          + ' Satu vendor hanya boleh menjual satu kategori.',
        kategori_terpakai: lain,
      });
    }

    const result = await pool.query(
      `INSERT INTO services
         (vendor_id, service_name, category, description, price, minimum_notice_days,
          image_url, details)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 7), $7, COALESCE($8::jsonb, '{}'::jsonb))
       RETURNING ${KOLOM_LAYANAN}`,
      [vendorId, service_name, category, description || null, price,
       minimum_notice_days ?? null, foto.nilai || null,
       rinci.nilai ? JSON.stringify(rinci.nilai) : null]
    );

    res.status(201).json({ service: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/vendors/me/services  (role: vendor_owner)
//
// Kembarannya yang publik di bawah sengaja menyaring is_active = TRUE, supaya
// layanan yang disembunyikan tidak bocor ke halaman detail vendor. Tapi
// PEMILIKNYA harus tetap melihatnya — kalau tidak, menyembunyikan sebuah
// layanan sama saja dengan menghapusnya, karena tidak ada lagi tempat untuk
// menampilkannya kembali.
async function listMyServices(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT s.service_id, s.service_name, s.category, s.description, s.price,
              s.minimum_notice_days, s.is_active, s.created_at, s.details,
              (s.image_url IS NOT NULL) AS has_photo
         FROM services s
        WHERE s.vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = $1)
        ORDER BY s.is_active DESC, s.price ASC`,
      [req.user.user_id]
    );

    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/vendors/:vendorId/services?category=  (public)
//
// `category` opsional, tapi halaman detail vendor tetap WAJIB mengirimnya.
// Sejak 17 Sep satu vendor cuma boleh satu kategori, jadi filter ini bukan
// lagi pengaman utama — tapi data lama masih bisa lintas kategori (aturannya
// di level aplikasi, bukan constraint DB), dan tanpa filter halaman Event
// Organizer ikut menampilkan paket floristnya: terbaca seperti data dobel,
// dan paket yang salah yang terpilih duluan di halaman pesan.
async function listServices(req, res, next) {
  try {
    const { vendorId } = req.params;
    const { category } = req.query;

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'category tidak valid', allowed: VALID_CATEGORIES });
    }

    const result = await pool.query(
      `SELECT service_id, service_name, category, description, price,
              minimum_notice_days, is_active, created_at, details,
              (image_url IS NOT NULL) AS has_photo
       FROM services
       WHERE vendor_id = $1 AND is_active = TRUE
         AND ($2::text IS NULL OR category = $2::vendor_category)
       ORDER BY price ASC`,
      [vendorId, category || null]
    );

    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/services/:serviceId  (pemilik vendor)
async function updateService(req, res, next) {
  try {
    const { serviceId } = req.params;
    const {
      service_name, category, description, price, minimum_notice_days, is_active, image, details,
    } = req.body;

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'category tidak valid', allowed: VALID_CATEGORIES });
    }

    const foto = periksaFoto(image);
    if (foto.salah) return res.status(400).json({ message: foto.salah });

    // Pindah kategori juga tidak boleh bikin vendor jadi lintas kategori.
    // Layanan yang sedang diubah dikecualikan dari pengecekan — kalau dia satu
    // satunya layanan vendor itu, memindahkannya sah dan justru cara vendor
    // berganti kategori.
    // Field tambahan divalidasi terhadap kategori EFEKTIF layanan sesudah
    // perubahan ini, bukan terhadap `category` di body — yang boleh saja tidak
    // dikirim sama sekali.
    let rinciJson = null;
    if (category || details !== undefined) {
      const milik = await pool.query(
        `SELECT s.vendor_id, s.category::text AS category FROM services s
           JOIN vendors v ON v.vendor_id = s.vendor_id
          WHERE s.service_id = $1 AND v.owner_user_id = $2`,
        [serviceId, req.user.user_id]
      );
      if (milik.rows.length === 0) {
        return res.status(404).json({ message: 'Layanan tidak ditemukan atau bukan milik Anda' });
      }

      const { vendor_id: vendorId, category: kategoriLama } = milik.rows[0];

      if (category) {
        const lain = await kategoriLain(vendorId, category, serviceId);
        if (lain.length > 0) {
          return res.status(409).json({
            message: `Vendor ini sudah terdaftar di kategori ${lain.join(', ')}.`
              + ' Satu vendor hanya boleh menjual satu kategori.',
            kategori_terpakai: lain,
          });
        }
      }

      const kategoriEfektif = category || kategoriLama;
      const rinci = periksaDetail(details, kategoriEfektif);
      if (rinci.salah) return res.status(400).json({ message: rinci.salah });

      if (rinci.nilai) {
        rinciJson = JSON.stringify(rinci.nilai);
      } else if (category && category !== kategoriLama) {
        // Pindah kategori tanpa mengirim details: isi lama pasti memakai kunci
        // milik kategori lama (mis. `jenis_bunga` di layanan fotografer), jadi
        // dikosongkan daripada ditinggal jadi data yang tidak bisa dibaca
        // siapa pun.
        rinciJson = '{}';
      }
    }

    // Kepemilikan diverifikasi lewat join ke vendors di dalam subquery.
    const result = await pool.query(
      `UPDATE services SET
         service_name        = COALESCE($1, service_name),
         category            = COALESCE($2, category),
         description         = COALESCE($3, description),
         price               = COALESCE($4, price),
         minimum_notice_days = COALESCE($5, minimum_notice_days),
         is_active           = COALESCE($6, is_active),
         details             = COALESCE($10::jsonb, details),
         -- Tiga keadaan, bukan dua: tidak dikirim = biarkan, string kosong =
         -- hapus fotonya, selain itu = ganti. COALESCE saja tidak cukup karena
         -- dia tidak bisa membedakan "tidak diubah" dari "dikosongkan".
         image_url           = CASE WHEN $7::text IS NULL THEN image_url
                                    WHEN $7 = '' THEN NULL
                                    ELSE $7 END,
         updated_at          = now()
       WHERE service_id = $8
         AND vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = $9)
       RETURNING ${KOLOM_LAYANAN}`,
      [service_name || null, category || null, description || null,
       price ?? null, minimum_notice_days ?? null, is_active ?? null,
       foto.nilai, serviceId, req.user.user_id, rinciJson]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau bukan milik Anda' });
    }

    res.json({ service: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/services/:serviceId  (soft delete)
// Sengaja tidak menghapus baris, karena booking lama masih mereferensikan
// service ini. Cukup nonaktifkan agar tidak muncul di pencarian.
async function deactivateService(req, res, next) {
  try {
    const { serviceId } = req.params;

    const result = await pool.query(
      `UPDATE services SET is_active = FALSE, updated_at = now()
       WHERE service_id = $1
         AND vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = $2)
       RETURNING service_id`,
      [serviceId, req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau bukan milik Anda' });
    }

    res.json({ message: 'Layanan berhasil dinonaktifkan' });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/services/:serviceId/photo  (publik, tanpa token)
//
// Dipasang langsung sebagai <img src>, dan tag itu tidak bisa mengirim header
// Authorization — jadi endpoint ini memang harus publik. Layanan nonaktif tetap
// dilayani: halaman vendor menampilkan kartunya yang meredup, dan fotonya
// bagian dari kartu itu.
async function getServicePhoto(req, res, next) {
  try {
    const r = await pool.query(
      'SELECT image_url FROM services WHERE service_id = $1',
      [req.params.serviceId]
    );
    if (r.rows.length === 0 || !r.rows[0].image_url) return res.status(404).end();

    const cocok = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      r.rows[0].image_url
    );

    // Sama seperti foto vendor: nilai berupa URL http biasa diteruskan sebagai
    // redirect, bukan dipaksa jadi berkas.
    if (!cocok) return res.redirect(302, urlFotoAbsolut(r.rows[0].image_url));

    res.set('Content-Type', cocok[1]);
    // URL-nya tetap sama waktu fotonya diganti, jadi cache-nya harus bisa
    // divalidasi ulang — pemanggilnya menambahkan ?v= supaya benar-benar segar.
    res.set('Cache-Control', 'public, max-age=300, must-revalidate');
    res.send(Buffer.from(cocok[2], 'base64'));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createService, listServices, listMyServices, updateService, deactivateService,
  getServicePhoto,
};

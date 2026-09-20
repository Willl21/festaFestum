const Redis = require('ioredis');

// Soft lock 15 menit: cukup untuk user mengisi form checkout, tapi tidak
// selama itu menyandera slot kalau user kabur.
const LOCK_TTL_SECONDS = 900;

// Kalau REDIS_URL belum diisi, aplikasi tetap jalan tanpa lock. Ini disengaja:
// pg_advisory_xact_lock(vendor+tanggal) + idx_booking_slot_ke_aktif sudah
// menjamin tidak ada double-booking. Redis cuma bikin bentrokannya ketahuan
// lebih awal (saat user klik "Pesan"), bukan syarat kebenaran.
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

if (redis) {
  redis.on('error', (err) => console.error('[redis]', err.message));
} else {
  console.warn('[redis] REDIS_URL kosong — soft lock dimatikan, andalkan constraint DB');
}

// Sejak migrasi 014 kuncinya per TANGGAL, bukan per shift — tidak ada lagi
// bagian hari yang bisa dipegang sendirian. Lock ini cuma dipasang untuk
// vendor yang benar-benar eksklusif seharian (per_tim & daily_capacity = 1);
// memasangnya pada vendor berkapasitas banyak akan memaksa pembeli antre
// satu-satu tanpa mencegah apa pun.
const lockKey = (vendorId, eventDate) => `lock:${vendorId}:${eventDate}`;

// Lepas lock hanya kalau pemegangnya memang kita. Tanpa pengecekan ini, user A
// yang lock-nya sudah kedaluwarsa bisa menghapus lock milik user B yang baru.
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

// true  = lock didapat (atau Redis mati, jadi lanjut saja)
// false = slot sedang dipegang user lain
async function acquireLock(vendorId, eventDate, userId) {
  if (!redis) return true;
  try {
    const res = await redis.set(
      lockKey(vendorId, eventDate), userId, 'EX', LOCK_TTL_SECONDS, 'NX'
    );
    return res === 'OK';
  } catch (err) {
    // Redis ngambek jangan sampai menjatuhkan booking — DB masih jadi penjaga.
    console.error('[redis] acquire gagal, lanjut tanpa lock:', err.message);
    return true;
  }
}

// Siapa pemegang lock saat ini (null kalau bebas / Redis mati)
async function lockHolder(vendorId, eventDate) {
  if (!redis) return null;
  try {
    return await redis.get(lockKey(vendorId, eventDate));
  } catch (err) {
    console.error('[redis] get gagal:', err.message);
    return null;
  }
}

async function releaseLock(vendorId, eventDate, userId) {
  if (!redis) return;
  try {
    await redis.eval(RELEASE_SCRIPT, 1, lockKey(vendorId, eventDate), userId);
  } catch (err) {
    console.error('[redis] release gagal:', err.message);
  }
}

module.exports = { redis, acquireLock, lockHolder, releaseLock, LOCK_TTL_SECONDS };

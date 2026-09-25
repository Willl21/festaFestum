// Konsultasi sebelum memesan (migrasi 017): form EO -> ruang chat konsultasi ->
// rekomendasi paket dari vendor -> pesanan -> konfirmasi vendor, semuanya di
// SATU ruang. Jalankan dengan server hidup: node test-konsultasi.js
require('dotenv').config();
const assert = require('assert');
const pool = require('./src/config/db');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';
const DIBUAT = [];

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const uniq = () => Math.random().toString(36).slice(2, 10);
const futureDate = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function register(role) {
  const tag = uniq()
  const email = `ks${tag}@mail.com`
  const r = await api('/auth/register', {
    method: 'POST',
    body: { name: `KS ${tag}`, email, phone: `0817${tag}`, password: 'password123', role },
  })
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`)
  DIBUAT.push(email)
  return r.body.token
}

async function vendorEo() {
  const token = await register('vendor_owner')
  const v = await api('/vendors', { method: 'POST', token, body: { business_name: `EO Uji ${uniq()}`, city: 'depok' } })
  assert.strictEqual(v.status, 201, JSON.stringify(v.body))
  const s = await api(`/vendors/${v.body.vendor.vendor_id}/services`, {
    method: 'POST', token,
    body: { service_name: 'Paket Gala', category: 'event_organizer', price: 5000000, minimum_notice_days: 1 },
  })
  assert.strictEqual(s.status, 201, JSON.stringify(s.body))
  return { token, vendorId: v.body.vendor.vendor_id, serviceId: s.body.service.service_id }
}

let lolos = 0
const ok = (m) => { lolos++; console.log(`  ok  ${m}`) }

const FORM = {
  nama: 'Budi Uji', perusahaan: 'PT Uji', email: 'budi@contoh.com',
  jenis_acara: 'Gala Dinner', pesan: 'Gala dinner 200 tamu bulan depan.',
}

;(async () => {
  const eo = await vendorEo()
  const eoLain = await vendorEo()
  const klien = await register('customer')
  const klienLain = await register('customer')

  console.log('\nForm konsultasi:')
  const tamu = await api(`/vendors/${eo.vendorId}/konsultasi`, { method: 'POST', body: FORM })
  assert.strictEqual(tamu.status, 401)
  ok('tanpa login ditolak 401')

  const olehVendor = await api(`/vendors/${eo.vendorId}/konsultasi`, { method: 'POST', token: eoLain.token, body: FORM })
  assert.strictEqual(olehVendor.status, 403)
  ok('akun vendor ditolak 403 — konsultasi khusus pelanggan')

  const kosong = await api(`/vendors/${eo.vendorId}/konsultasi`, { method: 'POST', token: klien, body: { ...FORM, pesan: '' } })
  assert.strictEqual(kosong.status, 400)
  ok('pesan kosong ditolak 400')

  const a = await api(`/vendors/${eo.vendorId}/konsultasi`, { method: 'POST', token: klien, body: FORM })
  assert.strictEqual(a.status, 201, JSON.stringify(a.body))
  assert.strictEqual(a.body.conversation.jenis, 'konsultasi')
  const ruangId = a.body.conversation.conversation_id
  const isi = await api(`/chat/${ruangId}`, { token: klien })
  assert.match(isi.body.data[0].body, /Permintaan konsultasi[\s\S]*Gala Dinner[\s\S]*200 tamu/)
  ok('ruang konsultasi terbuka, isi form jadi pesan pertama')

  const lagi = await api(`/vendors/${eo.vendorId}/konsultasi`, { method: 'POST', token: klien, body: FORM })
  assert.strictEqual(lagi.body.conversation.conversation_id, ruangId)
  ok('mengirim form lagi melanjutkan ruang yang SAMA')

  const daftarVendor = await api('/chat', { token: eo.token })
  assert.ok(daftarVendor.body.data.some((c) => c.conversation_id === ruangId))
  const daftarLain = await api('/chat', { token: eoLain.token })
  assert.ok(!daftarLain.body.data.some((c) => c.conversation_id === ruangId))
  ok('vendor tujuan melihat ruangnya, vendor lain tidak')

  console.log('\nRekomendasi paket:')
  const rek = await api(`/chat/${ruangId}/pesan`, { method: 'POST', token: eo.token, body: { service_id: eo.serviceId } })
  assert.strictEqual(rek.status, 201, JSON.stringify(rek.body))
  assert.strictEqual(rek.body.message.paket_nama, 'Paket Gala')
  assert.strictEqual(rek.body.message.paket_kategori, 'event_organizer')
  ok('vendor merekomendasikan paketnya sendiri, kartunya membawa nama & kategori')

  const paketOrang = await api(`/chat/${ruangId}/pesan`, { method: 'POST', token: eo.token, body: { service_id: eoLain.serviceId } })
  assert.strictEqual(paketOrang.status, 404)
  ok('paket milik vendor lain ditolak 404')

  const olehKlien = await api(`/chat/${ruangId}/pesan`, { method: 'POST', token: klien, body: { service_id: eo.serviceId } })
  assert.strictEqual(olehKlien.status, 403)
  ok('klien tidak bisa mengirim rekomendasi 403')

  console.log('\nPesan dari rekomendasi:')
  const pesan = (token, extra) => api('/bookings', {
    method: 'POST', token,
    body: {
      service_id: eo.serviceId, event_date: futureDate(30), start_time: '18:00',
      event_type: 'gala_dinner', event_location_detail: 'Hotel Uji', ...extra,
    },
  })
  const salahRuang = await pesan(klienLain, { konsultasi_id: ruangId })
  assert.strictEqual(salahRuang.status, 404)
  ok('ruang konsultasi orang lain tidak bisa ditempeli pesanan (404)')

  const b = await pesan(klien, { konsultasi_id: ruangId })
  assert.strictEqual(b.status, 201, JSON.stringify(b.body))
  assert.strictEqual(b.body.booking.konsultasi_id, ruangId)
  const setelahPesan = await api(`/chat/${ruangId}`, { token: eo.token })
  assert.ok(setelahPesan.body.data.some((m) => /Pesanan dibuat: Paket Gala/.test(m.body)))
  ok('pesanan tertaut ke ruang, vendor dapat jejak "Pesanan dibuat" di chat')

  const buka = await api('/chat', { method: 'POST', token: klien, body: { booking_id: b.body.booking.booking_id } })
  assert.strictEqual(buka.body.conversation.conversation_id, ruangId)
  ok('"Hubungi vendor" untuk pesanan itu membuka ruang konsultasi, bukan ruang baru')

  const terima = await api(`/bookings/${b.body.booking.booking_id}/konfirmasi`, {
    method: 'PATCH', token: eo.token, body: { action: 'terima' },
  })
  assert.strictEqual(terima.status, 200, JSON.stringify(terima.body))
  const akhir = await api(`/chat/${ruangId}`, { token: klien })
  assert.ok(akhir.body.data.some((m) => /DITERIMA/.test(m.body)))
  const ruangLain = await pool.query('SELECT count(*)::int n FROM conversations WHERE booking_id = $1', [b.body.booking.booking_id])
  assert.strictEqual(ruangLain.rows[0].n, 0)
  ok('konfirmasi vendor tetap wajib; pemberitahuannya masuk ke ruang konsultasi, tanpa ruang kedua')

  console.log(`\nOK: ${lolos} pemeriksaan lolos.`)
})()
  .catch((e) => {
    console.error('\nGAGAL:', e.message)
    process.exitCode = 1
  })
  .finally(async () => {
    // bookings RESTRICT ke users -> payments & bookings dulu, baru users.
    if (DIBUAT.length) {
      const ids = (await pool.query('SELECT user_id FROM users WHERE email = ANY($1)', [DIBUAT])).rows.map((r) => r.user_id)
      if (ids.length) {
        const kena = 'user_id = ANY($1) OR vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = ANY($1))'
        await pool.query(`DELETE FROM payments WHERE booking_id IN (SELECT booking_id FROM bookings WHERE ${kena})`, [ids])
        await pool.query(`DELETE FROM bookings WHERE ${kena}`, [ids])
        await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [ids])
      }
      console.log(`Data uji dibersihkan: ${ids.length} akun.`)
    }
    await pool.end()
  })

import type { ApiService } from './api'

/** Rumus paket berbasis jam (MUA & fotografer, migrasi 016). CERMINAN
 *  durasiPesanan() di backend/src/lib/kategori.js — backend tetap yang
 *  memutuskan dan menghitung harga final; yang di sini cuma supaya blok jam
 *  dan harga di layar sama dengan yang nanti ditagih. Ubah dua-duanya. */

export const MAKS_JAM_TAMBAHAN = 6

export const berbasisJam = (l?: Pick<ApiService, 'durasi_menit'>) => l?.durasi_menit != null

/** Durasi total dalam menit, tanpa jeda: per orang dikali jumlah orang,
 *  dibulatkan ke atas ke jam penuh, lalu ditambah jam tambahan. */
export function durasiPesanan(l: ApiService, jumlah: number, tambahan: number) {
  const dasar = (l.durasi_menit ?? 0) * (l.per_orang ? jumlah : 1)
  return Math.ceil(dasar / 60) * 60 + tambahan * 60
}

/** Harga paket x jumlah + jam tambahan x harga per jam. Jam tambahan ditagih
 *  per pesanan, bukan per orang. */
export function hargaPesanan(l: ApiService, jumlah: number, tambahan: number) {
  return Number(l.price) * jumlah + tambahan * Number(l.harga_per_jam_tambahan ?? 0)
}

/** "06:00" + 180 menit -> "09:00". Boleh lewat tengah malam ("02:00"). */
export function tambahJam(jam: string, menit: number) {
  const [h, m] = jam.split(':').map(Number)
  const t = (h * 60 + m + menit) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** "06:00 – 09:00" untuk pesanan berbasis jam, "06:00" untuk yang harian. */
export const rentangJam = (b: { start_time: string; end_time?: string | null }) =>
  b.end_time ? `${b.start_time} – ${b.end_time}` : b.start_time

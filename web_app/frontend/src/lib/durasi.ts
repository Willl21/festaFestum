import type { ApiService } from './api'
import type { CategoryKey } from '../data/categories'

/** Rumus paket berbasis jam (MUA & fotografer, migrasi 016). CERMINAN
 *  durasiPesanan() di backend/src/lib/kategori.js — backend tetap yang
 *  memutuskan dan menghitung harga final; yang di sini cuma supaya blok jam
 *  dan harga di layar sama dengan yang nanti ditagih. Ubah dua-duanya. */

export const MAKS_JAM_TAMBAHAN = 6

/** Jam yang bisa dipilih per kategori (jam penuh saja; backend mewajibkan
 *  HH:00 untuk MUA & fotografer). MUA mulai subuh karena rias pengantin biasa
 *  jam 4-5 pagi; florist & sewa jas memakai jam kirim/ambil, jadi cukup jam
 *  kerja gerai. Jam terakhir itu LAST ORDER: pesanan boleh selesai melewatinya.
 *  Dipakai KalenderSlot dan Pesan Semua (Festa AI). */
export const RENTANG_JAM: Record<CategoryKey, [number, number]> = {
  mua: [4, 20],
  eo: [6, 22],
  fotografer: [6, 22],
  florist: [7, 20],
  attire: [7, 20],
}

export function daftarJam([mulai, selesai]: [number, number]) {
  const jam: string[] = []
  for (let h = mulai; h <= selesai; h++) jam.push(`${String(h).padStart(2, '0')}:00`)
  return jam
}

export const berbasisJam = (l?: Pick<ApiService, 'durasi_menit'>) => l?.durasi_menit != null

/** Orang yang sudah termasuk harga paket per orang (migrasi 023). */
export const orangDasar = (l: ApiService) => l.min_orang || 1

/** Jumlah orang yang dihitung: paling sedikit orangDasar. Sama dengan
 *  orangEfektif di backend/src/lib/kategori.js. */
export const orangEfektif = (l: ApiService, jumlah: number) => Math.max(jumlah, orangDasar(l))

/** Durasi total dalam menit, tanpa jeda: per orang dikali jumlah orang,
 *  dibulatkan ke atas ke jam penuh, lalu ditambah jam tambahan. */
export function durasiPesanan(l: ApiService, jumlah: number, tambahan: number) {
  const dasar = (l.durasi_menit ?? 0) * (l.per_orang ? orangEfektif(l, jumlah) : 1)
  return Math.ceil(dasar / 60) * 60 + tambahan * 60
}

/** Paket per orang: harga paket (sudah mencakup orangDasar) + orang tambahan
 *  x tarifnya. Lainnya: harga x jumlah. Jam tambahan ditagih per pesanan.
 *  Rumus yang sama ada di createBooking — ubah dua-duanya. */
export function hargaPesanan(l: ApiService, jumlah: number, tambahan: number) {
  const barang = l.per_orang
    ? Number(l.price) + (orangEfektif(l, jumlah) - orangDasar(l)) * Number(l.harga_per_orang_tambahan ?? 0)
    : Number(l.price) * jumlah
  return barang + tambahan * Number(l.harga_per_jam_tambahan ?? 0)
}

/** "06:00" + 180 menit -> "09:00". Boleh lewat tengah malam ("02:00"). */
export function tambahJam(jam: string, menit: number) {
  const [h, m] = jam.split(':').map(Number)
  const t = (h * 60 + m + menit) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** "06:00 – 09:00" untuk pesanan berbasis jam, "06:00" untuk yang harian.
 *  Florist memesan tanpa jam (start_time NULL, migrasi 018). */
export const rentangJam = (b: { start_time: string | null; end_time?: string | null }) =>
  !b.start_time ? 'jam menyesuaikan' : b.end_time ? `${b.start_time} – ${b.end_time}` : b.start_time

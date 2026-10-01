import type { RekomendasiAi } from './api'

/** Hasil pencarian Festa AI terakhir. Dibaca ulang saat user kembali dari
 *  halaman layanan, dan dipakai halaman "Pesan Semua". sessionStorage:
 *  hilang sendiri saat tab ditutup. */
export const KUNCI_HASIL = 'festa-ai-hasil'

export type Simpanan = {
  fokus: string[]
  nilai: { tipe: string; tamu: string; budget: string; lokasi: string; tanggal: string }
  rekomendasi: RekomendasiAi[]
  total: number
  penuh: number
  catatan: { pembuka: string; saran: string }
}

export function bacaSimpanan(): Simpanan | null {
  try { return JSON.parse(sessionStorage.getItem(KUNCI_HASIL) || 'null') } catch { return null }
}

/** Kategori API -> kunci `categories` (slug, label, warna). */
export const KATEGORI_AI = {
  florist: 'florist',
  makeup_artist: 'mua',
  attire_rental: 'attire',
  photographer: 'fotografer',
  event_organizer: 'eo',
} as const

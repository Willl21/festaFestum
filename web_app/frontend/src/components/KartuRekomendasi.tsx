import { Link } from 'react-router-dom'
import { ArrowRight } from './icons'
import { categories } from '../data/categories'
import { rupiah } from '../lib/format'
import type { ApiPesan } from '../lib/api'

/** Kartu "Rekomendasi Paket" di dalam obrolan (migrasi 017).
 *
 *  Dipakai dua halaman — ChatPage (klien) dan VendorPesanPage (vendor) — jadi
 *  dipusatkan: kartunya harus terlihat sama di kedua sisi, dan tautan pesannya
 *  harus menyusun query yang sama persis dengan yang dibaca halaman pesan.
 *
 *  Tombol "Pesan Paket Ini" cuma untuk klien. Pesanannya tetap menunggu
 *  vendor MENERIMA — kartu ini jalan pintas memilih paket, bukan persetujuan. */
export default function KartuRekomendasi({
  pesan: m,
  vendorId,
  konsultasiId,
  untukKlien,
}: {
  pesan: ApiPesan
  vendorId: string | null
  /** Ruang asal rekomendasi, dibawa ke halaman pesan supaya pesanannya
   *  tertaut ke obrolan ini. */
  konsultasiId?: string
  untukKlien: boolean
}) {
  const kat = Object.values(categories).find((c) => c.apiCategory === m.paket_kategori)
  // Catatan tambahan dari vendor, kalau bukan teks bawaan.
  const catatan = m.body.startsWith('Rekomendasi paket:') ? '' : m.body
  const q = new URLSearchParams({ service: m.service_id ?? '', ...(konsultasiId ? { konsultasi: konsultasiId } : {}) })

  return (
    <div className="w-[300px] max-w-full overflow-hidden rounded-lg border border-navy-900/15 bg-white">
      <p className="bg-lavender/60 px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-navy-900">
        REKOMENDASI PAKET
      </p>
      <div className="px-4 py-3">
        <p className="font-display text-[18px] leading-snug font-semibold">
          {m.paket_nama ?? 'Paket tidak tersedia'}
        </p>
        {m.paket_harga && (
          <p className="mt-0.5 text-[14px] font-semibold text-navy-900">{rupiah(Number(m.paket_harga))}</p>
        )}
        {catatan && <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink/80">{catatan}</p>}

        {untukKlien && m.paket_aktif && kat && vendorId && (
          <Link
            to={`/${kat.slug}/${vendorId}/pesan?${q}`}
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-sm bg-amber text-[13px] font-semibold text-navy-900 hover:opacity-90"
          >
            Pesan Paket Ini <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {m.paket_aktif === false && (
          <p className="mt-2 text-[12px] text-ink/70">Paket ini sudah tidak ditawarkan vendor.</p>
        )}
        {!untukKlien && m.paket_aktif && (
          <p className="mt-2 text-[12px] text-ink/70">Klien bisa langsung memesan dari kartu ini.</p>
        )}
      </div>
    </div>
  )
}

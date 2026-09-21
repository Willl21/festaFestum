import { useEffect, useState } from 'react'
import HeroSlideshow from '../components/HeroSlideshow'
import SearchPanel, { type Field } from '../components/SearchPanel'
import VendorCard, { type Vendor } from '../components/VendorCard'
import KategoriSkeleton from '../components/KategoriSkeleton'
import TukarHalus from '../components/TukarHalus'
import AiBanner from '../components/AiBanner'
import Reveal from '../components/Reveal'
import { listVendors, urlFotoVendor } from '../lib/api'
import { categories, namaKota } from '../data/categories'

const kategori = categories.fotografer

const searchFields: Field[] = [
  {
    kind: 'select',
    label: 'Lokasi (JABODETABEK)',
    options: ['JABODETABEK', 'Jakarta Selatan', 'Jakarta Pusat', 'Depok', 'Bogor', 'Bekasi'],
  },
  {
    kind: 'select',
    label: 'Harga Mulai',
    options: ['Semua Harga', '< Rp 1.500.000', 'Rp 1.500.000 - Rp 2.000.000', '> Rp 2.000.000'],
  },
  {
    kind: 'select',
    label: 'Jenis Acara',
    options: ['Semua Acara', 'Pernikahan', 'Wisuda', 'Korporat', 'Prewedding'],
  },
]


/** Lima foto hero yang berganti tiap 6 detik. Ditulis di sini, bukan di
 *  HeroSlideshow, supaya tiap halaman tetap bisa dibaca utuh dan fotonya
 *  bisa ditukar tanpa menyentuh halaman lain. */
const fotoHero = [1, 2, 3, 4, 5].map((n) => `/img/hero-fotografer-${n}.jpg`)

export default function FotograferPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    listVendors({ category: kategori.apiCategory })
      .then((r) =>
        // Perhatikan kunci `data`, bukan `vendors`.
        setVendors(
          r.data.map((v) => ({
            id: v.vendor_id,
            name: v.business_name,
            city: namaKota(v.city),
            rating: Number(v.rating_avg),
            ratingCount: v.rating_count,
            priceFrom: Number(v.price_start_from ?? 0),
            // has_photo cuma penanda; gambarnya diambil dari endpoint terpisah
            // supaya JSON listing tidak membawa data URL tiap vendor. Kalau
            // kosong, Img jatuh ke emoji kategori di bawah ini.
            image: v.has_photo ? urlFotoVendor(v.vendor_id) : undefined,
            emoji: kategori.emoji,
            tint: kategori.tint,
          }))
        )
      )
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [])

  return (
    <TukarHalus memuat={memuat} rangka={<KategoriSkeleton label="Memuat fotografer…" />}>
      {() => (
        <>
      {/* HERO */}
      <section className="relative">
        <HeroSlideshow
          foto={fotoHero}
          alt="Kamera profesional"
          emoji={kategori.emoji}
          tint={kategori.tint}
          className="h-[340px] overflow-hidden md:h-[500px]"
        />

        <div className="relative z-10 mx-auto -mt-2 max-w-[1330px] px-6 md:px-12">
          <SearchPanel fields={searchFields} />
        </div>
      </section>

      {/* GRID VENDOR */}
      <section className="mx-auto max-w-[1330px] px-6 pt-10 md:px-12">
        <h2 className="font-display text-[32px] font-semibold">Pilihan Fotografer</h2>


        {galat && (
          <p className="mt-7 border border-line bg-white px-5 py-4 text-[14px] text-ink/80">
            {galat}
          </p>
        )}

        {!memuat && !galat && vendors.length === 0 && (
          <p className="mt-7 text-[14px] text-muted">
            Belum ada fotografer terdaftar. Isi datanya lewat <code>seed-vendors.js</code> di backend.
          </p>
        )}

        <div className="mt-7 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v, i) => (
            <VendorCard key={v.id} index={i} vendor={v} to={`/${kategori.slug}/${v.id}`} />
          ))}
        </div>
      </section>

      <Reveal className="pt-20">
        <AiBanner
          subtitle="Belum Tahu Fotografer yang Cocok?"
          body="Temukan rekomendasi fotografer berdasarkan jenis acara, gaya dokumentasi, lokasi, dan budget Anda."
          cta="Cari Rekomendasi"
        />
      </Reveal>
      </>
      )}
    </TukarHalus>
  )
}

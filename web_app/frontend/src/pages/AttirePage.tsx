import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import HeroSlideshow from '../components/HeroSlideshow'
import SearchPanel, { type Field } from '../components/SearchPanel'
import VendorCard, { type Vendor } from '../components/VendorCard'
import KategoriSkeleton from '../components/KategoriSkeleton'
import TukarHalus from '../components/TukarHalus'
import AiBanner from '../components/AiBanner'
import Reveal from '../components/Reveal'
import { listVendors, urlFotoVendor } from '../lib/api'
import { categories, KOTA, namaKota } from '../data/categories'

const kategori = categories.attire

/** Empat filter, dan ketiganya yang penting benar-benar menyaring:
 *  Tanggal + Lokasi disaring BACKEND lewat GET /vendors, Harga & Urutan di
 *  sini karena `price_start_from` dan `rating_avg` sudah ikut di respons
 *  listing — menambah dua parameter server demi itu cuma menambah kueri.
 *
 *  Tanggal sengaja ikut muncul di halaman kategori, tidak cuma di landing:
 *  tanpa itu orang yang mendarat langsung ke sini tidak punya cara memakai
 *  schedule-first discovery sama sekali. */
const HARGA = [
  { value: '', label: 'Semua Harga' },
  { value: `-1000000`, label: '< Rp 1.000.000' },
  { value: `1000000-2000000`, label: 'Rp 1.000.000 - Rp 2.000.000' },
  { value: `2000000-`, label: '> Rp 2.000.000' },
]

const URUT = [
  { value: 'rating', label: 'Rating tertinggi' },
  { value: 'murah', label: 'Harga terendah' },
  { value: 'mahal', label: 'Harga tertinggi' },
]

const searchFields: Field[] = [
  { kind: 'date', key: 'tanggal', label: 'Tanggal Acara' },
  {
    kind: 'select',
    key: 'kota',
    label: 'Lokasi (JABODETABEK)',
    options: [
      { value: '', label: 'JABODETABEK' },
      ...KOTA.map((k) => ({ value: k, label: namaKota(k) })),
    ],
  },
  { kind: 'select', key: 'harga', label: 'Harga Mulai', options: HARGA },
  { kind: 'select', key: 'urut', label: 'Urutkan', options: URUT },
]


/** Lima foto hero yang berganti tiap 6 detik. Ditulis di sini, bukan di
 *  HeroSlideshow, supaya tiap halaman tetap bisa dibaca utuh dan fotonya
 *  bisa ditukar tanpa menyentuh halaman lain. */
const fotoHero = [1, 2, 3, 4, 5].map((n) => `/img/hero-attire-${n}.jpg`)

export default function AttirePage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [memuat, setMemuat] = useState(true)
  const [mencari, setMencari] = useState(false)
  const [galat, setGalat] = useState('')

  // Nilai form dan nilai yang SEDANG dipakai dipisah: kalau disatukan, tiap
  // ketukan dropdown langsung menembak backend. Yang dikirim cuma saat tombol
  // Cari ditekan.
  const [params, setParams] = useSearchParams()
  const [cari, setCari] = useState<Record<string, string>>({
    tanggal: params.get('date') ?? '',
    kota: params.get('city') ?? '',
    harga: '',
    urut: 'rating',
  })
  const [dipakai, setDipakai] = useState({
    tanggal: params.get('date') ?? '',
    kota: params.get('city') ?? '',
  })

  useEffect(() => {
    listVendors({
      category: kategori.apiCategory,
      city: dipakai.kota || undefined,
      eventDate: dipakai.tanggal || undefined,
    })
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
      .finally(() => { setMemuat(false); setMencari(false) })
  }, [dipakai])

  function jalankanCari() {
    setMencari(true)
    // Objeknya selalu baru, jadi efek di atas pasti jalan lagi walau nilainya
    // sama — kalau tidak, penanda "Mencari…" tidak pernah dimatikan.
    setDipakai({ tanggal: cari.tanggal, kota: cari.kota })
    // URL ikut berubah supaya hasil pencarian bisa di-refresh dan dibagikan.
    const q = new URLSearchParams()
    if (cari.kota) q.set('city', cari.kota)
    if (cari.tanggal) q.set('date', cari.tanggal)
    setParams(q, { replace: true })
  }

  // Harga dan urutan diterapkan di sini, bukan lewat request baru.
  const tampil = useMemo(() => {
    const [dari, sampai] = cari.harga.split('-')
    const hasil = vendors.filter((v) => {
      if (dari && v.priceFrom < Number(dari)) return false
      if (sampai && v.priceFrom > Number(sampai)) return false
      return true
    })
    hasil.sort((x, y) =>
      cari.urut === 'murah' ? x.priceFrom - y.priceFrom
      : cari.urut === 'mahal' ? y.priceFrom - x.priceFrom
      : y.rating - x.rating)
    return hasil
  }, [vendors, cari.harga, cari.urut])

  return (
    <TukarHalus memuat={memuat} rangka={<KategoriSkeleton label="Memuat penyedia jas & kebaya…" />}>
      {() => (
        <>
      {/* HERO */}
      <section className="relative">
        <HeroSlideshow
          foto={fotoHero}
          alt="Busana formal tradisional"
          emoji={kategori.emoji}
          tint={kategori.tint}
          className="h-[340px] overflow-hidden md:h-[500px]"
        />

        <div className="relative z-10 mx-auto -mt-2 max-w-[1330px] px-6 md:px-12">
          <SearchPanel
            fields={searchFields}
            nilai={cari}
            onUbah={(k, v) => setCari((c) => ({ ...c, [k]: v }))}
            onCari={jalankanCari}
            sibuk={mencari}
          />
        </div>
      </section>

      {/* GRID VENDOR */}
      <section className="mx-auto max-w-[1330px] px-6 pt-10 md:px-12">
        <h2 className="font-display text-[32px] font-semibold">Pilihan Jas/Kebaya</h2>


        {galat && (
          <p className="mt-7 border border-line bg-white px-5 py-4 text-[14px] text-ink/80">
            {galat}
          </p>
        )}

        {/* Dua sebab kosong yang tidak boleh tertukar: benar-benar belum ada
            vendor, atau ada tapi tersaring habis. Pesan yang sama untuk
            dua-duanya bikin filter yang kelewat sempit terbaca seperti
            database kosong. */}
        {!memuat && !galat && tampil.length === 0 && (
          <p className="mt-7 text-[14px] text-muted">
            {vendors.length === 0 && !dipakai.kota && !dipakai.tanggal ? (
              <>Belum ada penyedia jas & kebaya terdaftar. Isi datanya lewat <code>seed-vendors.js</code> di backend.</>
            ) : (
              <>
                Tidak ada vendor yang cocok dengan pencarian ini
                {dipakai.tanggal && ` pada ${dipakai.tanggal}`}
                {dipakai.kota && ` di ${namaKota(dipakai.kota)}`}. Coba longgarkan
                tanggal, lokasi, atau rentang harganya.
              </>
            )}
          </p>
        )}

        <div className="mt-7 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {tampil.map((v, i) => (
            <VendorCard key={v.id} index={i} vendor={v} to={`/${kategori.slug}/${v.id}`} />
          ))}
        </div>
      </section>

      <Reveal className="pt-20">
        <AiBanner
          subtitle="Belum Menemukan Outfit yang Tepat?"
          body="Biarkan AI membantu merekomendasikan jas atau kebaya berdasarkan jenis acara, preferensi warna, ukuran, dan gaya yang Anda inginkan."
          cta="Cari Rekomendasi"
        />
      </Reveal>
      </>
      )}
    </TukarHalus>
  )
}

import { useEffect, useState } from 'react'
import LandingSkeleton from '../components/LandingSkeleton'
import Reveal from '../components/Reveal'
import TukarHalus from '../components/TukarHalus'
import { Link, useNavigate } from 'react-router-dom'
import Img from '../components/Img'
import HeroSlideshow from '../components/HeroSlideshow'
import HoverRevealCards, { type CardItem } from '../components/hovercard'
import { listVendors, urlFotoVendor, type ApiVendor } from '../lib/api'
import { categories, KOTA, namaKota, type CategoryKey } from '../data/categories'

/** Enum kategori backend -> kunci kategori frontend. */
const KATEGORI: Record<string, CategoryKey> = {
  florist: 'florist',
  makeup_artist: 'mua',
  attire_rental: 'attire',
  photographer: 'fotografer',
  event_organizer: 'eo',
}
import SearchPanel, { type Field } from '../components/SearchPanel'
import AiBanner from '../components/AiBanner'
import { StarIcon } from '../components/icons'
import { rupiahBulat } from '../lib/format'

/** Panel cari landing = pintu masuk schedule-first discovery. Ketiganya
 *  diteruskan ke halaman kategori sebagai query string, bukan diproses di
 *  sini: yang menampilkan daftar vendor memang halaman itu, dan dengan begitu
 *  hasil pencarian punya URL sendiri yang bisa di-refresh dan dibagikan. */
const searchFields: Field[] = [
  { kind: 'date', key: 'tanggal', label: 'Tanggal' },
  {
    kind: 'select',
    key: 'kota',
    label: 'Lokasi',
    options: [
      { value: '', label: 'Semua Lokasi' },
      ...KOTA.map((k) => ({ value: k, label: namaKota(k) })),
    ],
  },
  {
    kind: 'select',
    key: 'kategori',
    label: 'Vendor',
    options: (Object.keys(categories) as CategoryKey[]).map((k) => ({
      value: k,
      label: categories[k].label,
    })),
  },
]

// Subtitle-nya bukan hiasan: dia yang membedakan lima kartu yang fotonya
// sama-sama gelap, dan HoverRevealCards memang menaruh dua baris teks.
const kategori: CardItem[] = [
  { id: 'mua', title: 'MUA', subtitle: 'Rias pengantin', imageUrl: '/img/kategori-mua.jpg', to: '/mua' },
  { id: 'attire', title: 'Jas & Kebaya', subtitle: 'Sewa busana', imageUrl: '/img/kategori-attire.jpg', to: '/jas-kebaya' },
  { id: 'florist', title: 'Florist', subtitle: 'Buket & dekorasi', imageUrl: '/img/kategori-florist.jpg', to: '/florist' },
  { id: 'fotografer', title: 'Fotografer', subtitle: 'Dokumentasi', imageUrl: '/img/kategori-fotografer.jpg', to: '/fotografer' },
  { id: 'eo', title: 'Event Organizer', subtitle: 'Perencana acara', imageUrl: '/img/kategori-eo.jpg', to: '/event-organizer' },
]

/** Lima foto hero yang berganti tiap 6 detik. Satu per kategori, jadi yang
 *  baru mendarat langsung melihat cakupan marketplace-nya — bukan lima
 *  variasi satu tema. `hero-landing.jpg` dipertahankan sebagai foto PERTAMA:
 *  dia yang di-preload di index.html, jadi menggantinya berarti layar
 *  pertama menunggu unduhan baru. Dia juga yang mewakili Event Organizer. */
const fotoHero = [
  '/img/hero-landing.jpg',
  '/img/hero-florist-1.jpg',
  '/img/hero-mua-1.jpg',
  '/img/hero-fotografer-1.jpg',
  '/img/hero-attire-1.jpg',
]

const langkah = [
  {
    no: '01',
    title: 'Tentukan Kebutuhan',
    body: 'Pilih tanggal, lokasi, dan layanan yang Anda butuhkan.',
  },
  {
    no: '02',
    title: 'Temukan Vendor',
    body: 'Jelajahi berbagai vendor sesuai kebutuhan acara Anda.',
  },
  {
    no: '03',
    title: 'Rencanakan dengan Festa AI',
    body: 'Dapatkan bantuan untuk menyusun kebutuhan dan koordinasi acara.',
  },
]

export default function LandingPage() {
  // Rekomendasi = tiga vendor dengan rating tertinggi. GET /vendors sudah
  // mengurutkan berdasarkan rating_avg, jadi cukup ambil tiga teratas.
  // Ini BUKAN rekomendasi AI — Smart Planner ada di halaman /festa-ai.
  const [unggulan, setUnggulan] = useState<ApiVendor[]>([])
  const [memuat, setMemuat] = useState(true)

  const navigate = useNavigate()
  const [cari, setCari] = useState<Record<string, string>>({
    tanggal: '', kota: '', kategori: 'mua',
  })

  useEffect(() => {
    Promise.all(
      Object.keys(KATEGORI).map((c) => listVendors({ category: c, limit: 2 }))
    )
      .then((hasil) => {
        const semua = hasil.flatMap((r) => r.data)
        semua.sort((a, b) => Number(b.rating_avg) - Number(a.rating_avg))
        setUnggulan(semua.slice(0, 3))
      })
      .catch(() => setUnggulan([]))
      .finally(() => setMemuat(false))
  }, [])

  const [besar, ...kecil] = unggulan

  function jalankanCari() {
    const q = new URLSearchParams()
    if (cari.kota) q.set('city', cari.kota)
    if (cari.tanggal) q.set('date', cari.tanggal)
    const slug = categories[(cari.kategori as CategoryKey) ?? 'mua'].slug
    navigate(`/${slug}${q.toString() ? `?${q}` : ''}`)
  }

  return (
    <TukarHalus memuat={memuat} rangka={<LandingSkeleton label="Memuat beranda…" />}>
      {() => (
        <>
          {/* HERO */}
          <section className="relative">
            <div className="relative h-[560px] overflow-hidden md:h-[720px]">
              <HeroSlideshow
                foto={fotoHero}
                alt="Dekorasi acara formal"
                className="h-full w-full"
              />
              <div className="absolute inset-0 bg-black/35" />

              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <h1 className="max-w-[900px] font-display text-4xl font-bold text-white drop-shadow-sm md:text-[46px]">
                  Wujudkan Acara Formal Anda dengan Lebih Mudah
                </h1>
                <p className="mt-4 max-w-[640px] font-display text-lg text-white/95 md:text-[19px]">
                  Temukan vendor terbaik untuk kebutuhan acara Anda, mulai dari MUA, fotografer,
                  florist, sewa jas &amp; kebaya, hingga Event Organizer.
                </p>
              </div>
            </div>

            {/* Panel duduk di batas bawah foto, menindih tipis saja. */}
            <div className="relative z-10 mx-auto -mt-3 max-w-[1290px] px-6 md:px-12">
              <SearchPanel
                fields={searchFields}
                nilai={cari}
                onUbah={(k, v) => setCari((c) => ({ ...c, [k]: v }))}
                onCari={jalankanCari}
                labelTombol="Cari"
              />
            </div>
          </section>

          {/* KATEGORI */}
          <Reveal className="mx-auto max-w-[1290px] px-6 pt-14 md:px-12">
            <h2 className="font-display text-[26px] font-semibold">
              Temukan Vendor Sesuai Kebutuhan Anda
            </h2>
            <p className="mt-2 text-[13px] text-muted">
              Berbagai pilihan layanan untuk membantu mempersiapkan acara formal Anda.
            </p>

            <HoverRevealCards items={kategori} className="mt-7" />
          </Reveal>

          {/* REKOMENDASI */}
          <Reveal className="mx-auto max-w-[1290px] px-6 pt-24 md:px-12">
            {/* Tombol panah "lihat semua" di sini dibuang: dia <button> tanpa
                onClick, dan memang belum ada halaman "semua rekomendasi". */}
            <h2 className="font-display text-[30px] font-semibold">Rekomendasi Vendor</h2>
            <p className="mt-2 text-[14px] text-muted">Pilihan terbaik untuk acara pentingmu</p>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
              {besar && <KartuUnggulan v={besar} besar />}
              <div className="grid gap-6">
                {kecil.map((v) => <KartuUnggulan key={v.vendor_id} v={v} />)}
              </div>
            </div>
          </Reveal>

          {/* 3 LANGKAH */}
          <Reveal className="mx-auto max-w-[1290px] px-6 pt-24 md:px-12">
            <div className="bg-lavender px-8 py-14 md:px-16">
              <h2 className="text-center font-display text-[26px] font-semibold">
                Rencanakan Acara dalam 3 Langkah
              </h2>

              <div className="mt-10 grid gap-10 md:grid-cols-3">
                {langkah.map((l) => (
                  <div key={l.no} className="flex flex-col items-center text-center">
                    <div className="flex h-[52px] w-[52px] items-center justify-center rounded-sm bg-navy-900 font-display text-[19px] font-semibold text-white">
                      {l.no}
                    </div>
                    <h3 className="mt-5 font-display text-[16px] font-semibold">{l.title}</h3>
                    <p className="mt-2 max-w-[230px] text-[12px] leading-relaxed text-muted">
                      {l.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal className="pt-24">
            <AiBanner
              body="Jelaskan visi Anda dalam bahasa sehari-hari. AI kami akan menyusun jadwal terkoordinasi lengkap dan mengusulkan vendor papan atas yang tersedia secara instan."
              cta="Mulai Menyusun"
            />
          </Reveal>
        </>
      )}
    </TukarHalus>
  )
}

/** Kartu "Rekomendasi Vendor". Satu susunan untuk ketiga kartu: di HP mereka
 *  ditumpuk berurutan, dan dulu kartu besar & kecil menaruh kategori, kota, dan
 *  tombolnya di tempat berbeda. Yang beda di desktop cuma ukuran foto & judul.
 *  Tombol dibungkus `mt-auto pt-5`: mt-auto saja bernilai 0 di HP (kartu
 *  setinggi isinya), sehingga tombolnya dulu menempel ke baris lencana. */
function KartuUnggulan({ v, besar = false }: { v: ApiVendor; besar?: boolean }) {
  const kat = categories[KATEGORI[v.categories[0]] ?? 'eo']
  const harga = Number(v.price_start_from)
  return (
    <article className="bingkai-gradien flex flex-col transition-transform duration-200 motion-safe:hover:scale-[1.02]">
      <div className="flex flex-1 flex-col border border-line bg-white">
        <Img
          src={v.has_photo ? urlFotoVendor(v.vendor_id) : undefined}
          alt={v.business_name}
          tint={kat.tint}
          // Di desktop kartu besar setinggi dua kartu kecil; fotonya yang
          // memanjang mengisi sisa tinggi itu, bukan ruang kosong di bawah judul.
          className={`h-[200px] w-full object-cover ${besar ? 'lg:h-auto lg:min-h-[290px] lg:flex-1' : 'lg:h-[150px]'}`}
        />
        <div className={`flex flex-col p-5 ${besar ? 'lg:flex-none lg:p-7' : 'flex-1'}`}>
          <span className="self-start rounded-sm bg-maroon px-2.5 py-1 text-[12px] font-medium text-white">
            {kat.label}
          </span>
          <h3 className={`mt-3 font-display text-[24px] leading-tight font-semibold ${besar ? 'lg:text-[30px]' : ''}`}>
            {v.business_name}
          </h3>
          <p className="mt-1.5 flex items-center gap-1 text-[13px] text-ink/80">
            {/* Vendor tanpa ulasan dulu tampil "★ 0" — terbaca rating terburuk,
                padahal artinya belum pernah dinilai. */}
            {v.rating_count > 0 ? (
              <>
                <StarIcon className="h-3.5 w-3.5 text-star" />
                {Number(v.rating_avg).toFixed(1)} ({v.rating_count} ulasan)
              </>
            ) : (
              'Belum ada ulasan'
            )}
            {v.city && ` · ${namaKota(v.city)}`}
          </p>
          <div className="mt-auto flex items-end justify-between gap-4 pt-5">
            {harga > 0 ? (
              <div>
                <p className="text-[12px] text-muted">Mulai dari</p>
                <p className="font-display text-[21px] font-semibold">{rupiahBulat(harga)}</p>
              </div>
            ) : <span />}
            <Link
              to={`/${kat.slug}/${v.vendor_id}`}
              className="shrink-0 rounded-sm bg-navy-900 px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Lihat Detail
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

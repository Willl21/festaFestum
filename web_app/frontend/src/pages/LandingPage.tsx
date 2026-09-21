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
import { StarIcon, ArrowRight } from '../components/icons'

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
  { id: 'florist', title: 'Florist', subtitle: 'Buket & dekorasi', imageUrl: '/img/kategori-florist.png', to: '/florist' },
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
            <div className="flex items-end justify-between">
              <div>
                <h2 className="font-display text-[30px] font-semibold">Rekomendasi Vendor</h2>
                <p className="mt-2 text-[14px] text-muted">Pilihan terbaik untuk acara pentingmu</p>
              </div>
              <button type="button" aria-label="Lihat semua rekomendasi" className="text-ink">
                <ArrowRight className="h-6 w-6" />
              </button>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
              {/* Kartu besar */}
              {besar && (() => {
                const kat = categories[KATEGORI[besar.categories[0]] ?? 'eo']
                return (
                  <article className="flex flex-col border border-line bg-white transition-transform duration-200 motion-safe:hover:scale-[1.02]">
                    <Img
                      src={besar.has_photo ? urlFotoVendor(besar.vendor_id) : undefined}
                      alt={besar.business_name}
                      emoji={kat.emoji}
                      tint={kat.tint}
                      className="h-[290px] w-full object-cover"
                    />
                    <div className="flex flex-1 flex-col px-7 py-7">
                      <h3 className="font-display text-[30px] font-semibold">{besar.business_name}</h3>
                      <div className="mt-3 flex items-center gap-4">
                        <span className="rounded-sm bg-maroon px-3 py-1 text-[11px] font-medium text-white">
                          {kat.label}
                        </span>
                        <span className="flex items-center gap-1 text-[12px] text-ink/80">
                          <StarIcon className="h-3.5 w-3.5 text-star" />
                          {Number(besar.rating_avg)} · {namaKota(besar.city)}
                        </span>
                      </div>
                      <Link
                        to={`/${kat.slug}/${besar.vendor_id}`}
                        className="mt-auto w-full rounded-sm bg-navy-900 py-3.5 text-center text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        Lihat Detail
                      </Link>
                    </div>
                  </article>
                )
              })()}

              {/* Dua kartu kecil */}
              <div className="grid gap-6">
                {kecil.map((v) => {
                  const kat = categories[KATEGORI[v.categories[0]] ?? 'eo']
                  return (
                    <article key={v.vendor_id} className="flex flex-col border border-line bg-white transition-transform duration-200 motion-safe:hover:scale-[1.02]">
                      <Img
                        src={v.has_photo ? urlFotoVendor(v.vendor_id) : undefined}
                        alt={v.business_name}
                        emoji={kat.emoji}
                        tint={kat.tint}
                        className="h-[150px] w-full object-cover"
                      />
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between">
                          <h3 className="font-display text-[23px] font-semibold">{v.business_name}</h3>
                          <span className="pt-1.5 text-[11px] font-semibold">{namaKota(v.city)}</span>
                        </div>
                        <span className="mt-1 flex items-center gap-1 text-[12px] text-ink/80">
                          <StarIcon className="h-3.5 w-3.5 text-star" />
                          {Number(v.rating_avg)} · {kat.label}
                        </span>
                        <Link
                          to={`/${kat.slug}/${v.vendor_id}`}
                          className="mt-4 inline-block rounded-sm border border-line px-4 py-1.5 text-[12px] transition-colors hover:border-navy-900"
                        >
                          Lihat Profil
                        </Link>
                      </div>
                    </article>
                  )
                })}
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

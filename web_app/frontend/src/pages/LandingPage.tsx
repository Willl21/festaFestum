import { useEffect, useState } from 'react'
import LandingSkeleton from '../components/LandingSkeleton'
import Reveal from '../components/Reveal'
import TukarHalus from '../components/TukarHalus'
import { Link } from 'react-router-dom'
import Img from '../components/Img'
import { listVendors, type ApiVendor } from '../lib/api'
import { categories, namaKota, type CategoryKey } from '../data/categories'

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

const searchFields: Field[] = [
  { kind: 'date', label: 'Tanggal', placeholder: 'Pilih Tanggal' },
  { kind: 'select', label: 'Lokasi', options: ['Jakarta Pusat', 'Jakarta Selatan','Jakarta Timur','Jakarta Barat','Tanggerang','Bekasi', 'Depok', 'Bogor'] },
  {
    kind: 'select',
    label: 'Vendor',
    options: ['Pilih Vendor', 'MUA', 'Fotografer', 'Florist', 'Jas & Kebaya', 'Event Organizer'],
  },
]

const kategori = [
  { label: 'MUA', image: '/img/kategori-mua.jpg', to: '/mua' },
  { label: 'Jas & Kebaya', image: '/img/kategori-attire.jpg', to: '/jas-kebaya' },
  { label: 'Florist', image: '/img/kategori-florist.png', to: '/florist' },
  { label: 'Fotografer', image: '/img/kategori-fotografer.jpg', to: '/fotografer' },
  { label: 'Event Organizer', image: '/img/kategori-eo.jpg', to: '/event-organizer' },
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

  return (
    <TukarHalus memuat={memuat} rangka={<LandingSkeleton label="Memuat beranda…" />}>
      {() => (
        <>
          {/* HERO */}
          <section className="relative">
            <div className="relative h-[560px] overflow-hidden md:h-[720px]">
              <Img
                src="/img/hero-landing.jpg"
                prioritas
                alt="Dekorasi acara formal"
                className="h-full w-full object-cover"
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
              <SearchPanel fields={searchFields} />
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

            <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
              {kategori.map((k) => (
                <Link key={k.label} to={k.to} className="group block">
                  <Img
                    src={k.image}
                    alt={k.label}
                    className="h-[240px] w-full object-cover transition-opacity group-hover:opacity-90"
                  />
                  <span className="mt-3 block text-center text-[14px] font-medium">{k.label}</span>
                </Link>
              ))}
            </div>
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

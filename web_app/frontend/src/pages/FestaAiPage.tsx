import { useEffect, useState } from 'react'
import FestaAiSkeleton from '../components/FestaAiSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link } from 'react-router-dom'
import Img from '../components/Img'
import { ChevronDown, SearchIcon } from '../components/icons'
import { rupiah } from '../lib/format'
import { categories, namaKota, type CategoryKey } from '../data/categories'
import { listVendors, type ApiVendor } from '../lib/api'
import Bagian from '../components/Bagian'

/** Umur minimum rangka hasil pencarian, diteruskan ke <TukarHalus>. Lebih
 *  pendek dari bawaannya (1 detik) karena ini bukan animasi masuk halaman —
 *  pencarian adalah tindakan sadar, jadi jedanya cukup sekadar supaya
 *  rangkanya sempat terbaca. */
const RANGKA_HASIL_MINIMUM_MS = 500

const KATEGORI: Record<string, CategoryKey> = {
  florist: 'florist',
  makeup_artist: 'mua',
  attire_rental: 'attire',
  photographer: 'fotografer',
  event_organizer: 'eo',
}

/** Fokus acara -> kategori vendor yang dicari. Dipakai sebagai pencocokan
 *  SEMENTARA sampai AI Engineer menyediakan POST /api/v1/ai/recommend. */
const FOKUS_KE_KATEGORI: Record<string, string> = {
  Dekorasi: 'florist',
  Dokumentasi: 'photographer',
  Katering: 'event_organizer',
  Hiburan: 'event_organizer',
  Busana: 'attire_rental',
  Rias: 'makeup_artist',
}

/** Batas atas budget, dibaca dari label pilihan di form. */
const BATAS_BUDGET: Record<string, number> = {
  'Rp 10.000.000 - 50.000.000': 50_000_000,
  'Rp 50.000.000 - 100.000.000': 100_000_000,
  'Rp 100.000.000 - 250.000.000': 250_000_000,
  '> Rp 250.000.000': Number.MAX_SAFE_INTEGER,
}

const parameterFields = [
  { id: 'tipe', label: 'Tipe Acara', options: ['Pernikahan', 'Wisuda', 'Gala Dinner', 'Konferensi'] },
  { id: 'tamu', label: 'Jumlah Tamu', options: ['< 50', '50-100', '100-150', '150-300', '> 300'] },
  {
    id: 'budget',
    label: 'Target Budget',
    options: [
      'Rp 10.000.000 - 50.000.000',
      'Rp 50.000.000 - 100.000.000',
      'Rp 100.000.000 - 250.000.000',
      '> Rp 250.000.000',
    ],
  },
]

const fokusOptions = ['Dekorasi', 'Dokumentasi', 'Katering', 'Hiburan', 'Busana', 'Rias']


export default function FestaAiPage() {
  const [fokus, setFokus] = useState<string[]>([])
  const [budget, setBudget] = useState('')
  const [rekomendasi, setRekomendasi] = useState<ApiVendor[]>([])
  // Halaman ini tidak mengambil data saat dibuka, jadi tidak ada yang bisa
  // dipakai sebagai penanda "sedang memuat". Penanda ini murni untuk animasi
  // masuk: dinyalakan saat dipasang lalu dimatikan seketika, dan <TukarHalus>
  // yang menahan rangkanya selama umur minimum.
  const [masuk, setMasuk] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setMasuk(false), 0)
    return () => clearTimeout(t)
  }, [])

  const [mencari, setMencari] = useState(false)
  const [galat, setGalat] = useState('')
  const [sudahCari, setSudahCari] = useState(false)

  const total = rekomendasi.reduce((sum, r) => sum + Number(r.price_start_from ?? 0), 0)

  // Pencocokan SEMENTARA: ambil vendor teratas dari kategori yang dipilih,
  // saring dengan batas budget. Ini BUKAN model rekomendasi — begitu AI
  // Engineer menyediakan POST /api/v1/ai/recommend, ganti isi fungsi ini saja.
  async function cariPaket() {
    setMencari(true)
    setGalat('')
    try {
      const kategoriDicari = fokus.length
        ? [...new Set(fokus.map((f) => FOKUS_KE_KATEGORI[f]).filter(Boolean))]
        : Object.keys(KATEGORI)

      const hasil = await Promise.all(
        kategoriDicari.map((c) => listVendors({ category: c, limit: 3 }))
      )

      const batas = BATAS_BUDGET[budget] ?? Number.MAX_SAFE_INTEGER
      const semua = hasil
        .flatMap((r) => r.data)
        .filter((v) => Number(v.price_start_from ?? 0) <= batas)

      semua.sort((a, b) => Number(b.rating_avg) - Number(a.rating_avg))
      setRekomendasi(semua.slice(0, 5))
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setMencari(false)
      setSudahCari(true)
    }
  }

  const toggleFokus = (f: string) =>
    setFokus((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))

  return (
    <TukarHalus memuat={masuk} rangka={<FestaAiSkeleton label="Memuat Festa AI…" />}>
      {() => (
        <div className="mx-auto max-w-[1330px] px-6 py-10 md:px-12">
          <div className="grid gap-10 lg:grid-cols-[420px_1fr]">
            {/* PARAMETER */}
            <aside className="h-fit rounded-sm border border-line bg-white p-7 lg:sticky lg:top-[90px]">
              <h1 className="border-b border-line pb-5 font-display text-[30px] font-semibold">
                Parameter Acara
              </h1>

              <div className="mt-6 space-y-5">
                {parameterFields.map((f) => (
                  <div key={f.id}>
                    <label htmlFor={f.id} className="block text-[15px]">
                      {f.label}
                    </label>
                    <div className="relative mt-2">
                      <select
                        id={f.id}
                        value={f.id === 'budget' ? budget : undefined}
                        onChange={f.id === 'budget' ? (e) => setBudget(e.target.value) : undefined}
                        className="h-12 w-full appearance-none rounded-sm border border-line bg-white px-4 pr-10 text-[15px] outline-none focus:border-navy-900"
                      >
                        {f.options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-ink/50" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Mockup menampilkan dua kotak kosong; diisi pilihan fokus yang
                  bisa dicentang lebih dari satu. */}
              <p className="mt-5 text-[15px]">Fokus Prioritas</p>
              <div className="mt-2 grid grid-cols-2 gap-2.5">
                {fokusOptions.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFokus(f)}
                    aria-pressed={fokus.includes(f)}
                    className={`rounded-sm border py-2.5 text-[13px] transition-colors ${
                      fokus.includes(f)
                        ? 'border-navy-900 bg-navy-900 text-white'
                        : 'border-line bg-white hover:border-navy-900'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Sementara memakai pencocokan sederhana di frontend. Diganti
                  POST /api/v1/ai/recommend begitu AI Engineer menyediakannya. */}
              <button
                type="button"
                onClick={cariPaket}
                disabled={mencari}
                className="mt-7 flex h-14 w-full items-center justify-center gap-3 rounded-sm bg-navy-900 text-[17px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <SearchIcon className="h-5 w-5" />
                {mencari ? 'Mencari...' : 'Cari Paket'}
              </button>
            </aside>

            {/* HASIL */}
            <section>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-[32px] font-semibold">Rekomendasi Festa AI</h2>
                  <p className="mt-2 max-w-[500px] text-[14px] leading-relaxed text-ink/75">
                    Berdasarkan parameter acara yang Anda masukkan, Festa AI memilih vendor yang paling
                    sesuai. Saat ini pencocokannya masih sederhana (kategori + budget + rating) sambil
                    menunggu model rekomendasi dari tim AI.
                  </p>
                </div>
                <p className="font-display text-[24px] font-semibold">{rupiah(total)}</p>
              </div>

              <TukarHalus
                memuat={mencari}
                umurMinimum={RANGKA_HASIL_MINIMUM_MS}
                rangka={
                  <div className="mt-6 space-y-6">
                    {[0, 1, 2].map((i) => (
                      <Bagian key={i} urutan={i}>
                        <div className="grid gap-6 rounded-sm border border-line bg-white p-4 sm:grid-cols-[320px_1fr]">
                          <div className="shimmer h-[200px] w-full bg-line" />
                          <div className="flex flex-col py-2 pr-2">
                            <div className="shimmer h-[26px] w-3/5 rounded-sm bg-line" />
                            <div className="shimmer mt-3 h-3.5 w-full max-w-[420px] rounded-sm bg-line/60" />
                            <div className="shimmer mt-2 h-3.5 w-4/5 max-w-[420px] rounded-sm bg-line/60" />
                            <div className="shimmer mt-4 h-[30px] w-64 rounded-sm bg-line/70" />
                            <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                              <div className="shimmer h-[34px] w-28 rounded-sm bg-line/70" />
                              <div className="shimmer h-[24px] w-32 rounded-sm bg-line" />
                            </div>
                          </div>
                        </div>
                      </Bagian>
                    ))}
                  </div>
                }
              >
                {() => (
                  <div className="mt-6 space-y-6">
                    {rekomendasi.map((r) => {
                      const kat = categories[KATEGORI[r.categories[0]] ?? 'eo']
                      return (
                        <article
                          key={r.vendor_id}
                          className="grid gap-6 rounded-sm border border-line bg-white p-4 sm:grid-cols-[320px_1fr]"
                        >
                          <Img
                            alt={r.business_name}
                            emoji={kat.emoji}
                            tint={kat.tint}
                            className="h-[200px] w-full object-cover"
                          />

                          <div className="flex flex-col py-2 pr-2">
                            <h3 className="font-display text-[26px] font-semibold">{r.business_name}</h3>
                            <p className="mt-2 max-w-[420px] text-[14px] leading-relaxed text-ink/75">
                              {r.description || 'Vendor ini belum menuliskan deskripsi.'}
                            </p>
                            <span className="mt-3 w-fit rounded-sm bg-[#fdeceb] px-3 py-1.5 text-[13px] text-[#c0392b]">
                              {kat.label} - {namaKota(r.city)} - rating {Number(r.rating_avg)}
                            </span>
                            <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                              <Link
                                to={`/${kat.slug}/${r.vendor_id}`}
                                className="rounded-sm border border-line px-4 py-2 text-[13px] transition-colors hover:border-navy-900"
                              >
                                Lihat Profil
                              </Link>
                              <p className="font-display text-[24px] font-semibold">
                                {rupiah(Number(r.price_start_from ?? 0))}
                              </p>
                            </div>
                          </div>
                        </article>
                        )
                      })}


                    {galat && (
                      <p className="border border-maroon/30 bg-maroon/5 px-5 py-4 text-[14px] text-maroon">
                        {galat}
                      </p>
                    )}

                    {sudahCari && !mencari && rekomendasi.length === 0 && !galat && (
                      <p className="border border-line bg-white py-16 text-center text-[15px] text-muted">
                        Tidak ada vendor yang cocok dengan parameter itu. Coba longgarkan budget atau fokusnya.
                      </p>
                    )}

                    {!sudahCari && !mencari && (
                      <p className="border border-line bg-white py-16 text-center text-[15px] text-muted">
                        Atur parameter acara di sebelah kiri, lalu tekan "Cari Paket".
                      </p>
                    )}
                  </div>
                )}
              </TukarHalus>
            </section>
          </div>
        </div>
      )}
    </TukarHalus>
  )
}

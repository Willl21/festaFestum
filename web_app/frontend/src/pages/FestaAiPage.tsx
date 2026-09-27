import { useEffect, useState } from 'react'
import FestaAiSkeleton from '../components/FestaAiSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link } from 'react-router-dom'
import Img from '../components/Img'
import { ChevronDown, SearchIcon } from '../components/icons'
import { rupiah } from '../lib/format'
import { categories, KOTA, namaKota, type CategoryKey } from '../data/categories'
import { rekomendasiAi, urlFotoLayanan, type RekomendasiAi } from '../lib/api'
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

/** Fokus acara -> kategori vendor. Dikirim ke backend, yang menyaring hasil AI
 *  ke kategori ini. Satu fokus = satu kategori yang memang kita layani. "Katering" dan
 *  "Hiburan" dibuang (revisi PM): dua-duanya diam-diam dipetakan ke EO,
 *  padahal kategori itu tidak ada. */
const FOKUS_KE_KATEGORI: Record<string, string> = {
  'Perencanaan Acara': 'event_organizer',
  Dekorasi: 'florist',
  Dokumentasi: 'photographer',
  Busana: 'attire_rental',
  Rias: 'makeup_artist',
}

/** AI menerima angka, bukan rentang: yang dikirim batas ATAS tiap pilihan
 *  (AI memang tidak akan melewati budget). Rentang terbuka diberi atap wajar. */
const BATAS_BUDGET: Record<string, number> = {
  'Rp 10.000.000 - 50.000.000': 50_000_000,
  'Rp 50.000.000 - 100.000.000': 100_000_000,
  'Rp 100.000.000 - 250.000.000': 250_000_000,
  '> Rp 250.000.000': 500_000_000,
}

const JUMLAH_TAMU: Record<string, number> = {
  '< 50': 50,
  '50-100': 100,
  '100-150': 150,
  '150-300': 300,
  '> 300': 500,
}

const TIPE_ACARA = ['Pernikahan', 'Wisuda', 'Gala Dinner', 'Konferensi']

const fokusOptions = Object.keys(FOKUS_KE_KATEGORI)


export default function FestaAiPage() {
  const [fokus, setFokus] = useState<string[]>([])
  const [nilai, setNilai] = useState({
    tipe: TIPE_ACARA[0],
    tamu: Object.keys(JUMLAH_TAMU)[0],
    budget: Object.keys(BATAS_BUDGET)[0],
    lokasi: KOTA[0],
  })
  const [rekomendasi, setRekomendasi] = useState<RekomendasiAi[]>([])
  const [total, setTotal] = useState(0)
  const [catatan, setCatatan] = useState({ pembuka: '', saran: '' })
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

  async function cariPaket() {
    setMencari(true)
    setGalat('')
    try {
      const r = await rekomendasiAi({
        event_type: nilai.tipe,
        budget: BATAS_BUDGET[nilai.budget],
        guest_count: JUMLAH_TAMU[nilai.tamu],
        location: nilai.lokasi,
        kategori: fokus.map((f) => FOKUS_KE_KATEGORI[f]),
      })
      setRekomendasi(r.data)
      setTotal(r.total)
      setCatatan({ pembuka: r.pesan_pembuka, saran: r.saran_penghematan })
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
                {(
                  [
                    { id: 'tipe', label: 'Tipe Acara', options: TIPE_ACARA },
                    { id: 'lokasi', label: 'Lokasi', options: KOTA },
                    { id: 'tamu', label: 'Jumlah Tamu', options: Object.keys(JUMLAH_TAMU) },
                    { id: 'budget', label: 'Target Budget', options: Object.keys(BATAS_BUDGET) },
                  ] as const
                ).map((f) => (
                  <div key={f.id}>
                    <label htmlFor={f.id} className="block text-[15px]">
                      {f.label}
                    </label>
                    <div className="relative mt-2">
                      <select
                        id={f.id}
                        value={nilai[f.id]}
                        onChange={(e) => setNilai((n) => ({ ...n, [f.id]: e.target.value }))}
                        className="h-12 w-full appearance-none rounded-sm border border-line bg-white px-4 pr-10 text-[15px] outline-none focus:border-navy-900"
                      >
                        {f.options.map((o) => (
                          <option key={o} value={o}>
                            {f.id === 'lokasi' ? namaKota(o) : o}
                          </option>
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
                    className={`rounded-sm border py-2.5 text-[13px] transition-colors first:col-span-2 ${
                      fokus.includes(f)
                        ? 'border-navy-900 bg-navy-900 text-white'
                        : 'border-line bg-white hover:border-navy-900'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={cariPaket}
                disabled={mencari}
                className="mt-7 flex h-14 w-full items-center justify-center gap-3 rounded-sm bg-navy-900 text-[17px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <SearchIcon className="h-5 w-5" />
                {mencari ? 'Mencari...' : 'Cari Paket'}
              </button>
              {/* Layanan AI di hosting gratis tertidur saat sepi; permintaan
                  pertama menunggu dia bangun. */}
              {mencari && (
                <p className="mt-3 text-center text-[13px] text-muted">
                  Permintaan pertama bisa memakan waktu hingga satu menit.
                </p>
              )}
            </aside>

            {/* HASIL */}
            <section>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-[32px] font-semibold">Rekomendasi Festa AI</h2>
                  <p className="mt-2 max-w-[500px] text-[14px] leading-relaxed text-ink/75">
                    {catatan.pembuka ||
                      'Berdasarkan parameter acara yang Anda masukkan, Festa AI menyusun paket vendor yang muat di budget Anda.'}
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
                      const kat = categories[KATEGORI[r.category] ?? 'eo']
                      return (
                        <article
                          key={r.service_id}
                          className="grid gap-6 rounded-sm border border-line bg-white p-4 sm:grid-cols-[320px_1fr]"
                        >
                          <Img
                            src={r.has_photo ? urlFotoLayanan(r.service_id) : undefined}
                            alt={r.business_name}
                            tint={kat.tint}
                            className="h-[200px] w-full object-cover"
                          />

                          <div className="flex flex-col py-2 pr-2">
                            <h3 className="font-display text-[26px] font-semibold">{r.business_name}</h3>
                            <p className="mt-2 max-w-[420px] text-[14px] leading-relaxed text-ink/75">
                              {r.service_name}
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
                                {rupiah(Number(r.price))}
                              </p>
                            </div>
                          </div>
                        </article>
                        )
                      })}


                    {catatan.saran && rekomendasi.length > 0 && (
                      <p className="border border-line bg-white px-5 py-4 text-[14px] leading-relaxed text-ink/75">
                        {catatan.saran}
                      </p>
                    )}

                    {galat && (
                      <p className="border border-maroon/30 bg-maroon/5 px-5 py-4 text-[14px] text-maroon">
                        {galat}
                      </p>
                    )}

                    {sudahCari && !mencari && rekomendasi.length === 0 && !galat && (
                      <p className="border border-line bg-white py-16 text-center text-[15px] text-muted">
                        {catatan.saran ||
                          'Tidak ada vendor yang cocok dengan parameter itu. Coba longgarkan budget atau fokusnya.'}
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

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import UlasanVendor from '../components/UlasanVendor'
import Img from '../components/Img'
import RincianLayanan from '../components/RincianLayanan'
import VendorLocation from '../components/VendorLocation'
import BackButton from '../components/BackButton'
import KalenderSlot from '../components/KalenderSlot'
import KalenderTanggal from '../components/KalenderTanggal'
import DetailSkeleton from '../components/DetailSkeleton'
import TukarHalus from '../components/TukarHalus'
import { ArrowRight } from '../components/icons'
import { categories, namaKota } from '../data/categories'
import { rupiah } from '../lib/format'
import {
  getVendor, getVendorServices, cekKetersediaan, urlFotoVendor, urlFotoLayanan,
  type ApiService, type ApiVendor,
} from '../lib/api'

const kat = categories.attire

/** Warna tidak punya kolom di database — hiasan mockup yang dibiarkan statis. */
const WARNA = [
  { name: 'Hitam', hex: '#111111' },
  { name: 'Navy', hex: '#1a3263' },
  { name: 'Hijau tua', hex: '#2e4034' },
]


/** Jas dan kebaya dijual dari halaman yang sama — yang membedakan cuma
 *  panduan ukurannya, jadi tabelnya ikut kategori yang dipilih. */
const sizeGuides = {
  jas: [
    { size: 'S', rows: ['Lingkar Dada : 86-90 cm', 'Lingkar Pinggang : 72-76 cm', 'Lingkar Bahu : 42 cm'] },
    { size: 'M', rows: ['Lingkar Dada : 91-95 cm', 'Lingkar Pinggang : 77-81 cm', 'Lingkar Bahu : 44 cm'] },
    { size: 'L', rows: ['Lingkar Dada : 96-100 cm', 'Lingkar Pinggang : 82-86 cm', 'Lingkar Bahu : 46 cm'] },
    { size: 'XL', rows: ['Lingkar Dada : 101-105 cm', 'Lingkar Pinggang : 87-91 cm', 'Lingkar Bahu : 48 cm'] },
    { size: 'XXL', rows: ['Lingkar Dada : 106-110 cm', 'Lingkar Pinggang : 92-96 cm', 'Lingkar Bahu : 50 cm'] },
  ],
  kebaya: [
    { size: 'S', rows: ['Lingkar Dada : 82-86 cm', 'Lingkar Pinggang : 64-68 cm', 'Lingkar Pinggul : 88-92 cm', 'Lebar Bahu : 36-38 cm'] },
    { size: 'M', rows: ['Lingkar Dada : 87-91 cm', 'Lingkar Pinggang : 69-73 cm', 'Lingkar Pinggul : 93-97 cm', 'Lebar Bahu : 39-41 cm'] },
    { size: 'L', rows: ['Lingkar Dada : 92-96 cm', 'Lingkar Pinggang : 74-78 cm', 'Lingkar Pinggul : 98-102 cm', 'Lebar Bahu : 42-44 cm'] },
    { size: 'XL', rows: ['Lingkar Dada : 97-101 cm', 'Lingkar Pinggang : 79-83 cm', 'Lingkar Pinggul : 103-107 cm', 'Lebar Bahu : 45-47 cm'] },
    { size: 'XXL', rows: ['Lingkar Dada : 102-106 cm', 'Lingkar Pinggang : 84-88 cm', 'Lingkar Pinggul : 108-112 cm', 'Lebar Bahu : 48-50 cm'] },
  ],
}

const sizes = ['S', 'M', 'L', 'XL', 'XLL']

type Jenis = 'semua' | 'jas' | 'kebaya'

/** Jas/Kebaya dibaca dari `details.jenis_pakaian`, teks bebas isian vendor —
 *  tidak ada kolom jenis di database. Jas = busana pria (jas, beskap), Kebaya =
 *  busana wanita (kebaya, gaun malam), selaras dengan dua tabel ukuran di atas.
 *  Koleksi yang tidak mengisinya cuma muncul di "Semua". */
function jenisDari(s: ApiService | undefined): 'jas' | 'kebaya' | null {
  const t = (s?.details?.jenis_pakaian ?? '').toLowerCase()
  if (/kebaya|gaun/.test(t)) return 'kebaya'
  if (/jas|beskap/.test(t)) return 'jas'
  return null
}

/** Tombol pilihan dua-arah (Jas/Kebaya, Ya/Tidak). Terpilih = navy. */
function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 flex-1 rounded-sm border text-[14px] font-medium transition-colors ${
        active ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink hover:border-navy-900'
      }`}
    >
      {children}
    </button>
  )
}

export default function AttireDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  // Nomor slot portofolio yang TERISI. GET /vendors/:id membalas nomor slot
  // saja, bukan gambarnya — lihat image-storage-pattern.
  const [fotoSlot, setFotoSlot] = useState<number[]>([])

  /** Produk yang sedang dipilih. Halaman ini dulu selalu memakai layanan
   *  PERTAMA, jadi vendor dengan enam koleksi cuma bisa menjual satu. */
  const [produkId, setProdukId] = useState('')
  // Penyaring daftar koleksi (revisi PM). Dulu tombol Jas/Kebaya di panel
  // kanan cuma mengganti tabel ukuran, tidak menyaring apa pun — orang
  // bingung harus menekan yang mana untuk memesan.
  const [jenis, setJenis] = useState<Jenis>('semua')
  const [size, setSize] = useState('')
  const [color, setColor] = useState(WARNA[0].hex)
  const [fitting, setFitting] = useState(true)
  const [tglSewa, setTglSewa] = useState('')
  const [tglAmbil, setTglAmbil] = useState('')
  const [tglFitting, setTglFitting] = useState('')
  const [cek, setCek] = useState<{ ada: boolean; alasan: string | null } | null>(null)
  const [mengecek, setMengecek] = useState(false)

  useEffect(() => {
    Promise.all([getVendor(id), getVendorServices(id, kat.apiCategory)])
      .then(([r, s]) => {
        setVendor(r.vendor)
        setFotoSlot(r.portfolio.map((f) => f.sort_order))
        const aktif = s.data.filter((x) => x.is_active)
        setLayanan(aktif)
        if (aktif[0]) setProdukId(aktif[0].service_id)
      })
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [id])

  const utama = layanan.find((s) => s.service_id === produkId) ?? layanan[0]
  const tampil = jenis === 'semua' ? layanan : layanan.filter((s) => jenisDari(s) === jenis)
  // Saat "Semua", tabel ukuran mengikuti koleksi yang sedang dipilih.
  const jenisUkuran = jenis !== 'semua' ? jenis : jenisDari(utama) ?? 'jas'
  const [jam, setJam] = useState('')

  /** Tiap produk punya kalender dan lead time sendiri, jadi tanggal yang
   *  sudah dipilih untuk produk lama belum tentu sah untuk yang baru.
   *  Dikosongkan supaya orang tidak membawa tanggal mati ke halaman pesan. */
  function pilihProduk(id: string) {
    if (id === produkId) return
    setProdukId(id)
    setTglSewa(''); setJam(''); setTglAmbil(''); setTglFitting(''); setCek(null)
  }

  /** Koleksi yang sedang dipilih bisa tersaring keluar; kalau begitu pilihan
   *  pindah ke koleksi pertama yang tersisa, supaya panel pemesanan tidak
   *  memegang barang yang tidak kelihatan di daftar. */
  function pilihJenis(j: Jenis) {
    setJenis(j)
    const sisa = j === 'semua' ? layanan : layanan.filter((s) => jenisDari(s) === j)
    if (sisa.length && !sisa.some((s) => s.service_id === produkId)) pilihProduk(sisa[0].service_id)
  }

  // Jadwal sewa dipakai sebagai tanggal acara — itu hari busananya dipakai.
  // Jamnya jam PENGAMBILAN setelan, diisi bebas oleh penyewa. Dia tidak
  // menentukan ketersediaan apa pun — yang habis kapasitas harian vendor.
  async function lanjutkan() {
    if (!utama) return
    if (!tglSewa || !jam) {
      setCek({ ada: false, alasan: 'Pilih tanggal dan jam dulu.' })
      return
    }
    if (!size) {
      setCek({ ada: false, alasan: 'Pilih ukuran dulu.' })
      return
    }
    if (!tglAmbil) {
      setCek({ ada: false, alasan: 'Pilih jadwal pengambilan dulu.' })
      return
    }

    setMengecek(true)
    try {
      const r = await cekKetersediaan({
        service_id: utama.service_id, event_date: tglSewa,
      })
      setCek({ ada: r.available, alasan: r.reason })
      if (r.available) {
        const q = new URLSearchParams({
          service: utama.service_id, date: tglSewa, jam: jam,
          jenis: jenisUkuran, size, color, fitting: String(fitting),
          ambil: tglAmbil, ...(fitting && tglFitting ? { tglFitting } : {}),
        })
        navigate(`/${kat.slug}/${id}/pesan?${q}`)
      }
    } catch (e) {
      setCek({ ada: false, alasan: (e as Error).message })
    } finally {
      setMengecek(false)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<DetailSkeleton label="Memuat detail penyedia jas & kebaya…" />}>
      {() => {
        if (galat || !vendor) {
          return (
            <div className="mx-auto max-w-[1330px] px-6 py-20">
              <BackButton ke={`/${kat.slug}`} />
              <p className="mt-6 text-[15px]">{galat || 'Vendor tidak ditemukan.'}</p>
            </div>
          )
        }

        return (
        <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
          <BackButton ke={`/${kat.slug}`} />

          <h1 className="mt-5 font-display text-[28px] md:text-[38px] font-semibold">{vendor.business_name}</h1>
          <p className="mt-2 text-[14px] text-[#2e6b52]">
            {kat.label} · {namaKota(vendor.city)}
            {vendor.is_verified && ' · Terverifikasi'}
          </p>

          {/* GALERI: satu foto tinggi di kiri, dua bertumpuk di kanan. */}
          <section className="mt-6 grid gap-3 md:grid-cols-2">
            <Img
              src={fotoSlot.includes(0) ? urlFotoVendor(id, 0) : undefined}
              alt={vendor.business_name}
              tint={kat.tint}
              className="h-[400px] w-full object-cover md:h-[640px]"
            />
            <div className="grid gap-3">
              {[1, 2].map((n) => (
                <Img
                  key={n}
                  src={fotoSlot.includes(n) ? urlFotoVendor(id, n) : undefined}
                  alt={`${vendor.business_name} ${n + 1}`}
                  tint={kat.tint}
                  className={`w-full object-cover ${n === 1 ? 'h-[200px] md:h-[310px]' : 'h-[200px] md:h-[318px]'}`}
                />
              ))}
            </div>
          </section>

          <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_420px]">
            <div>
              <h2 className="font-display text-[17px] font-semibold">Tentang Koleksi</h2>
              <p className="mt-4 max-w-[560px] text-[15px] leading-[1.85] text-ink/85">{vendor.description || 'Vendor ini belum menuliskan deskripsi.'}</p>

              {/* KOLEKSI — yang dijual vendor jas/kebaya adalah BARANG, bukan
                  paket jasa seperti florist atau EO. Jadi daftarnya foto
                  dulu, baru nama: orang memilih kebayanya dari rupanya.
                  Datanya tetap tabel `services` yang sama — tiap baris satu
                  potong koleksi, fotonya dari `services.image_url` yang sudah
                  ada sejak migrasi 011 dan diisi vendor lewat /vendor/layanan.
                  Tidak ada tabel produk baru. */}
              <h2 className="mt-12 border-t border-line pt-12 font-display text-[26px] font-semibold">
                Koleksi Tersedia
              </h2>
              <p className="mt-3 max-w-[520px] text-[12px] leading-relaxed text-ink/70">
                Pilih satu koleksi untuk melihat jadwal dan harga sewanya di panel pemesanan.
              </p>

              {layanan.length > 0 && (
                <div className="mt-5 flex max-w-[400px] gap-3" role="group" aria-label="Saring koleksi">
                  <Toggle active={jenis === 'semua'} onClick={() => pilihJenis('semua')}>Semua</Toggle>
                  <Toggle active={jenis === 'jas'} onClick={() => pilihJenis('jas')}>Jas</Toggle>
                  <Toggle active={jenis === 'kebaya'} onClick={() => pilihJenis('kebaya')}>Kebaya</Toggle>
                </div>
              )}

              {tampil.length === 0 ? (
                <p className="mt-7 text-[14px] text-muted">
                  {layanan.length === 0
                    ? 'Vendor ini belum menambahkan koleksi.'
                    : `Vendor ini belum punya koleksi ${jenis}.`}
                </p>
              ) : (
                <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {tampil.map((s) => {
                    const aktif = s.service_id === utama?.service_id
                    return (
                      <li key={s.service_id}>
                        <button
                          type="button"
                          onClick={() => pilihProduk(s.service_id)}
                          aria-pressed={aktif}
                          className={`flex h-full w-full flex-col overflow-hidden border text-left transition-colors ${
                            aktif ? 'border-navy-900 bg-lavender/25' : 'border-line bg-white hover:border-navy-900/40'
                          }`}
                        >
                          <Img
                            src={s.has_photo ? urlFotoLayanan(s.service_id) : undefined}
                            alt={s.service_name}
                            tint={kat.tint}
                            className="h-[200px] w-full object-cover"
                          />
                          <span className="flex flex-1 flex-col px-4 pt-3 pb-4">
                            <span className="font-display text-[17px] font-semibold">
                              {s.service_name}
                            </span>
                            <span className="mt-1 text-[13px] font-semibold">
                              {rupiah(Number(s.price))}
                            </span>
                            <RincianLayanan service={s} className="mt-2.5" />
                            {/* mt-auto, bukan mt-3: tiap koleksi punya jumlah
                                baris rincian yang berbeda, jadi penanda yang
                                mengikuti isi mendarat di ketinggian yang
                                beda-beda di tiap kartu. Didorong ke dasar
                                kolom supaya sebarisnya rata. `flex` menjaga
                                lebarnya tetap seukuran teks, tidak melar. */}
                            <span className="mt-auto flex pt-3">
                              <span
                                className={`rounded-sm px-2.5 py-1 text-[11px] font-semibold ${
                                  aktif ? 'bg-navy-900 text-white' : 'border border-line text-ink/70'
                                }`}
                              >
                                {aktif ? 'Dipilih' : 'Pilih koleksi'}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <h2 className="mt-12 border-t border-line pt-12 font-display text-[26px] font-semibold">
                Paduan Ukuran
              </h2>
              <p className="mt-3 max-w-[520px] text-[12px] leading-relaxed text-ink/70">
                Pilih ukuran yang sesuai untuk kenyamanan maksimal. Layanan fitting tersedia untuk membantu
                memastikan pakaian pas saat digunakan.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sizeGuides[jenisUkuran].map((g) => (
                  <div key={g.size} className="border border-lavender bg-lavender/40 p-4">
                    <span className="inline-block rounded-sm bg-[#8f9bd4] px-2.5 py-0.5 text-[11px] font-bold text-white">
                      {g.size}
                    </span>
                    <ul className="mt-3 space-y-1 border-t border-white/70 pt-3 text-[11px] leading-relaxed text-ink/85">
                      {g.rows.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* PANEL PEMESANAN */}
            <aside className="h-fit border border-line bg-white p-5 lg:sticky lg:top-[90px]">
              <p className="rounded-sm bg-navy-900 px-4 py-3.5 text-[15px] font-semibold text-white">
                Detail Informasi
              </p>

              {/* Pilihan Jas/Kebaya pindah ke atas daftar koleksi sebagai
                  penyaring. Di sini cukup diingatkan apa yang sedang dipesan. */}
              <p className="mt-5 text-[15px] font-semibold">Koleksi Dipilih</p>
              <p className="mt-1 text-[14px] text-ink/80">{utama?.service_name ?? '—'}</p>

              <p className="mt-5 text-[15px] font-semibold">Input Ukuran</p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    aria-pressed={size === s}
                    className={`h-10 rounded-sm border text-[13px] transition-colors ${
                      size === s ? 'border-navy-900 bg-lavender/50 font-semibold' : 'border-line bg-white hover:border-navy-900'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <p className="mt-5 text-[15px] font-semibold">Pilih Warna</p>
              <div className="mt-2 flex gap-2">
                {WARNA.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setColor(c.hex)}
                    aria-label={c.name}
                    aria-pressed={color === c.hex}
                    style={{ backgroundColor: c.hex }}
                    className={`h-8 w-9 rounded-sm ring-offset-2 transition-shadow ${
                      color === c.hex ? 'ring-2 ring-navy-900' : ''
                    }`}
                  />
                ))}
              </div>

              <p className="mt-5 text-[15px] font-semibold">Jadwal Sewa</p>
              {utama ? (
                <div className="mt-3">
                  <KalenderSlot
                    serviceId={utama.service_id}
                    tanggal={tglSewa}
                    jam={jam}
                    labelJam="Jam Pengambilan"
                    keteranganJam="Jam Anda mengambil setelannya di gerai vendor."
                    onPilih={(t, j) => { setTglSewa(t); setJam(j); setCek(null) }}
                  />
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-muted">
                  Vendor ini belum menambahkan koleksi, jadi jadwalnya belum bisa dilihat.
                </p>
              )}
              {/* BERTAHAP: tiap tanggal baru muncul setelah yang sebelumnya
                  terisi. Tiga kalender sekaligus di satu panel sempit bukan
                  cuma panjang — urutannya juga tidak kelihatan, padahal dua
                  tanggal di bawah memang BERGANTUNG pada tanggal sewa
                  (pengambilan dibatasi olehnya, fitting harus sebelumnya).
                  Yang belum relevan tidak ditampilkan, bukan dinonaktifkan:
                  kontrol mati yang menumpuk sama membingungkannya. */}
              {tglSewa && jam && (
                <>
                  {/* Pengambilan bukan slot pemesanan — tidak tersimpan di
                      vendor_schedules dan tidak memakan kuota — jadi
                      kalendernya polos: tanpa jam, tanpa pengabuan
                      ketersediaan. Batas paling awalnya tanggal sewa, karena
                      baju tidak bisa diambil setelah hari pakainya lewat. */}
                  <p className="mt-5 text-[15px] font-semibold">Jadwal Pengambilan</p>
                  <div className="mt-3">
                    <KalenderTanggal
                      tanggal={tglAmbil}
                      onPilih={setTglAmbil}
                      mulaiDari={tglSewa || undefined}
                    />
                  </div>
                </>
              )}

              {tglSewa && jam && tglAmbil && (
                <>
                  <p className="mt-5 text-[15px] font-semibold">Perlu Fitting?</p>
                  <div className="mt-2 flex gap-4">
                    <Toggle active={fitting} onClick={() => setFitting(true)}>
                      Ya
                    </Toggle>
                    <Toggle active={!fitting} onClick={() => setFitting(false)}>
                      Tidak
                    </Toggle>
                  </div>

                  {/* Jadwal fitting hanya relevan kalau user memang mau fitting. */}
                  {fitting && (
                    <>
                      <p className="mt-5 text-[15px] font-semibold">Jadwal Fitting</p>
                      <div className="mt-3">
                        {/* Fitting harus SEBELUM hari pakai, jadi tidak
                            dibatasi tanggal sewa seperti pengambilan. */}
                        <KalenderTanggal tanggal={tglFitting} onPilih={setTglFitting} />
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Keterangan koleksi yang sedang dipilih, diulang di panel
                  tepat sebelum harga supaya yang sudah menggulir jauh dari
                  grid koleksi tidak perlu naik lagi untuk memastikan. */}
              {utama && (
                <RincianLayanan service={utama} className="mt-6 border-t border-line pt-4" />
              )}

              <div className="mt-6 flex items-baseline justify-between border-t border-line pt-4">
                <span className="text-[14px] text-ink/80">Estimasi Harga Sewa</span>
                <span className="font-display text-[19px] font-semibold">{utama ? rupiah(Number(utama.price)) : '-'}</span>
              </div>

              {cek && !cek.ada && (
                <p className="mt-4 border border-maroon/30 bg-maroon/5 px-3 py-2 text-[13px] text-maroon">
                  {cek.alasan || 'Slot tidak tersedia.'}
                </p>
              )}

              <button
                type="button"
                onClick={lanjutkan}
                disabled={mengecek || !utama}
                className="mt-4 flex h-11 w-full items-center justify-center gap-3 rounded-sm bg-amber text-[15px] font-semibold text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {mengecek ? 'Mengecek jadwal…' : 'Lanjutkan Pesanan'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </aside>
          </div>

          <div className="mt-16">
            <VendorLocation />
          </div>

          <div className="mt-16">
            <UlasanVendor vendorId={id} />
          </div>
        </div>
        )
      }}
    </TukarHalus>
  )
}

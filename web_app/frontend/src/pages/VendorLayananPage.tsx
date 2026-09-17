import { useEffect, useRef, useState } from 'react'
import TabelSkeleton from '../components/TabelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { VendorPageHeader } from '../components/VendorLayout'
import Img from '../components/Img'
import {
  ChevronDown, ClockIcon, EyeIcon, EyeOffIcon, PlusIcon, UploadCloudIcon,
} from '../components/icons'
import { rupiahBulat } from '../lib/format'
import { categories as katalogKategori } from '../data/categories'
import {
  getMyVendor, getMyServices, tambahLayanan, ubahLayanan, setAktifLayanan,
  simpanFotoVendor, urlFotoLayanan, urlFotoVendor, type ApiService,
} from '../lib/api'
import { kecilkanGambar, PORTOFOLIO } from '../lib/gambar'

/** Katalog layanan + galeri portofolio milik vendor.
 *
 *  "Waktu Persiapan Minimum" = kolom minimum_notice_days di tabel services.
 *  Di mockup nilainya satu untuk seluruh vendor, padahal di DB tiap layanan
 *  punya nilai sendiri (sewa kebaya butuh fitting lama, buket bisa mendadak).
 *  Field di panel kiri diperlakukan sebagai nilai bawaan untuk layanan baru,
 *  dan form tambah layanan boleh menimpanya per layanan.
 */

/** Nilainya harus persis enum vendor_category di DB; labelnya untuk manusia. */
const categories = [
  { value: 'event_organizer', label: 'Event Organizer' },
  { value: 'florist', label: 'Florist' },
  { value: 'attire_rental', label: 'Sewa Jas / Kebaya' },
  { value: 'makeup_artist', label: 'Makeup Artist' },
  { value: 'photographer', label: 'Fotografer' },
] as const

/** Bentuk data layanan mengikuti tabel services apa adanya (ApiService),
 *  supaya tidak ada lapisan penerjemah yang bisa meleset. */
type BaruLayanan = {
  service_name: string
  category: string
  description: string
  price: number
  minimum_notice_days: number
}

/** Emoji per kategori, dipakai sebagai pengganti foto layanan. */
const EMOJI: Record<string, { emoji: string; tint: string }> = {
  event_organizer: katalogKategori.eo,
  florist: katalogKategori.florist,
  attire_rental: katalogKategori.attire,
  makeup_artist: katalogKategori.mua,
  photographer: katalogKategori.fotografer,
}


/** Tiga slot tetap, sama dengan yang dipakai langkah 3 onboarding dan
 *  indeks unik (vendor_id, sort_order) di migrasi 008. */
const SLOT_FOTO = 3

const categoryLabel = (value: string) =>
  categories.find((c) => c.value === value)?.label ?? value

export default function VendorLayananPage() {
  const [services, setServices] = useState<ApiService[]>([])
  const [vendorId, setVendorId] = useState('')
  const [defaultNotice, setDefaultNotice] = useState(14)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  // Layanan yang formnya sedang terbuka: 'baru' untuk tambah, objeknya untuk
  // ubah, null kalau tertutup. Satu form dipakai dua-duanya — field-nya sama
  // persis, cuma nilai awal dan tujuan simpannya yang beda.
  const [formUntuk, setFormUntuk] = useState<ApiService | 'baru' | null>(null)
  // Dinaikkan tiap foto berubah. URL foto tetap sama setelah diganti, jadi
  // tanpa penanda ini browser menyajikan gambar lama dari cache.
  const [versiFoto, setVersiFoto] = useState(0)
  const [fotoVendor, setFotoVendor] = useState<boolean[]>(Array(SLOT_FOTO).fill(false))
  const [unggahSlot, setUnggahSlot] = useState<number | null>(null)

  async function pilihFotoVendor(slot: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // supaya memilih berkas yang sama lagi tetap memicu onChange
    if (!file) return

    setGalat('')
    setUnggahSlot(slot)
    try {
      const { photos } = await simpanFotoVendor(slot, await kecilkanGambar(file, ...PORTOFOLIO))
      setFotoVendor(photos)
      setVersiFoto((v) => v + 1)
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setUnggahSlot(null)
    }
  }

  async function hapusFotoVendor(slot: number) {
    setGalat('')
    setUnggahSlot(slot)
    try {
      const { photos } = await simpanFotoVendor(slot, '')
      setFotoVendor(photos)
      setVersiFoto((v) => v + 1)
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setUnggahSlot(null)
    }
  }

  useEffect(() => {
    getMyVendor()
      .then(async (r) => {
        setVendorId(r.vendor.vendor_id)
        setFotoVendor(r.vendor.photos ?? Array(SLOT_FOTO).fill(false))
        // Sengaja TIDAK disaring: layanan yang disembunyikan tetap harus
        // terlihat oleh pemiliknya, lengkap dengan tombol menampilkannya lagi.
        const s = await getMyServices()
        setServices(s.data)
      })
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [])

  async function simpan(isi: BaruLayanan) {
    if (formUntuk === 'baru') {
      const r = await tambahLayanan(vendorId, isi)
      setServices((prev) => [...prev, r.service])
    } else if (formUntuk) {
      const r = await ubahLayanan(formUntuk.service_id, isi)
      setServices((prev) =>
        prev.map((x) => (x.service_id === r.service.service_id ? r.service : x))
      )
    }
    setVersiFoto((v) => v + 1)
  }

  // Menyembunyikan layanan = is_active false di backend, BUKAN DELETE: booking
  // lama masih mereferensikan baris itu. Dulu kartunya ikut hilang dari daftar
  // begitu disembunyikan, sehingga tidak ada lagi jalan menghidupkannya —
  // sekarang dia tetap tampil, meredup, dengan tombol yang sama untuk balik.
  async function ubahTampil(s: ApiService) {
    setGalat('')
    try {
      const r = await setAktifLayanan(s.service_id, !s.is_active)
      setServices((prev) =>
        prev.map((x) => (x.service_id === s.service_id ? r.service : x))
      )
    } catch (e) {
      setGalat((e as Error).message)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<TabelSkeleton kolom={3} baris={5} label="Memuat layanan…" />}>
      {() => (
        <>
          <VendorPageHeader
            title="Manajemen Layanan"
            description="Atur penawaran inti Anda, perbarui detail harga, dan kelola portofolio visual untuk menarik klien potensial di ekosistem premium Festa."
            action={
              <button
                type="button"
                onClick={() => setFormUntuk('baru')}
                className="flex items-center gap-2 rounded-md bg-navy-900 px-5 py-3 text-[13px] font-semibold text-white"
              >
                <PlusIcon /> Tambah Layanan Baru
              </button>
            }
          />

          {galat && (
            <p className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
              {galat}
            </p>
          )}

          <div className="mt-8 grid gap-7 lg:grid-cols-[300px_1fr]">
            <section className="h-fit rounded-lg border border-line bg-white p-6">
              <h2 className="flex items-center gap-2.5 font-display text-[21px] font-semibold">
                <ClockIcon className="h-5 w-5 text-amber" />
                Konfigurasi Operasional
              </h2>
              <p className="mt-3 text-[14px] text-ink/70">
                Nilai bawaan untuk layanan baru. Tiap layanan tetap menyimpan angkanya
                sendiri — ubah lewat tombol Ubah di kartunya.
              </p>

              <div className="mt-6">
                <label htmlFor="notice" className="block text-[12px] font-semibold text-ink/75">
                  Waktu Persiapan Minimum
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    id="notice"
                    type="number"
                    min={0}
                    value={defaultNotice}
                    onChange={(e) => setDefaultNotice(Math.max(0, Number(e.target.value)))}
                    className="h-11 w-20 rounded-sm border border-line bg-lavender/25 px-3 text-center text-[15px] font-semibold outline-none focus:border-navy-900"
                  />
                  <span className="text-[14px] text-ink/80">Hari kalender</span>
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  Tanggal dalam rentang ini otomatis mati di kalender pemesanan.
                </p>
              </div>

              {/* "Kapasitas Simultan" dan tombol "Simpan Pengaturan" dibuang.
                  Kapasitas tidak punya kolom di DB sama sekali — ketersediaan
                  di sini ditentukan per slot jadwal, bukan per jumlah event
                  bersamaan — jadi apa pun yang dipilih tidak berpengaruh.
                  Tombol simpannya pun tidak pernah punya handler; angka di atas
                  langsung terpakai sebagai nilai awal form layanan baru, tidak
                  ada yang perlu disimpan. */}
            </section>

            <section>
              <h2 className="border-b border-line pb-3 font-display text-[24px] font-semibold">
                Katalog Layanan Aktif
              </h2>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                {services.map((s) => {
                  const gaya = EMOJI[s.category]
                  return (
                    <article
                      key={s.service_id}
                      className={`overflow-hidden rounded-lg border bg-white ${
                        s.is_active ? 'border-line' : 'border-dashed border-muted/50 opacity-60'
                      }`}
                    >
                      <div className="relative">
                        <Img
                          src={s.has_photo ? urlFotoLayanan(s.service_id, versiFoto) : undefined}
                          alt={s.service_name}
                          emoji={gaya?.emoji}
                          tint={gaya?.tint}
                          className="h-[165px] w-full object-cover"
                        />
                        <span className="absolute top-3 left-3 rounded bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink">
                          {categoryLabel(s.category)}
                        </span>
                        {!s.is_active && (
                          <span className="absolute top-3 right-3 rounded bg-ink/85 px-2.5 py-1 text-[11px] font-semibold text-white">
                            DISEMBUNYIKAN
                          </span>
                        )}
                      </div>
                      <div className="p-5">
                        <h3 className="font-display text-[21px] leading-tight font-semibold">
                          {s.service_name}
                        </h3>
                        <p className="mt-2 line-clamp-3 text-[13px] text-ink/70">{s.description}</p>
                        <p className="mt-3 text-[12px] text-muted">
                          Butuh pemesanan {s.minimum_notice_days} hari sebelumnya
                        </p>
                        <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-4">
                          <div>
                            <p className="text-[11px] font-semibold tracking-[0.04em] text-ink/60">
                              Harga Mulai Dari
                            </p>
                            <p className="mt-0.5 text-[19px] font-semibold">
                              {rupiahBulat(Number(s.price))}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setFormUntuk(s)}
                            className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium hover:border-ink"
                          >
                            Ubah
                          </button>
                          <button
                            type="button"
                            onClick={() => ubahTampil(s)}
                            aria-label={
                              s.is_active
                                ? `Sembunyikan ${s.service_name}`
                                : `Tampilkan lagi ${s.service_name}`
                            }
                            title={
                              s.is_active
                                ? 'Sembunyikan dari halaman vendor (booking lama tetap aman)'
                                : 'Tampilkan lagi ke pelanggan'
                            }
                            className="text-ink/50 hover:text-navy-900"
                          >
                            {s.is_active ? <EyeIcon /> : <EyeOffIcon />}
                          </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}

                {!memuat && services.length === 0 && (
                  <p className="text-[14px] text-muted">
                    Belum ada layanan. Tambahkan lewat tombol di kanan atas.
                  </p>
                )}
              </div>
            </section>
          </div>

          <section className="mt-11">
            <h2 className="font-display text-[26px] font-semibold">Galeri Portofolio Utama</h2>
            <p className="mt-1 text-[15px] text-ink/70">
              Tiga foto yang tampil di kartu vendor dan halaman detail Anda. Slot pertama jadi
              foto utama.
            </p>

            {/* Dulu bagian ini memajang tiga foto contoh dari /public/img dan
                input file tanpa handler — terlihat seperti galeri yang sudah
                terisi, padahal tidak ada apa pun yang tersimpan. Tabel
                portfolio_images dan PUT /vendors/me/photos/:slot sudah ada
                sejak onboarding, jadi yang kurang cuma penyambungannya. */}
            <div className="mt-6 rounded-lg border border-line bg-white p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((slot) => (
                  <div key={slot}>
                    <div className="relative overflow-hidden rounded-md border border-line bg-lavender/25">
                      <Img
                        src={fotoVendor[slot] ? urlFotoVendor(vendorId, slot, versiFoto) : undefined}
                        alt={`Portofolio slot ${slot + 1}`}
                        className="h-[150px] w-full object-cover"
                      />
                      {slot === 0 && (
                        <span className="absolute top-2 left-2 rounded bg-navy-900/85 px-2 py-0.5 text-[10px] font-semibold text-white">
                          FOTO UTAMA
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-navy-900 hover:underline">
                        <UploadCloudIcon />
                        {unggahSlot === slot
                          ? 'Mengunggah…'
                          : fotoVendor[slot]
                            ? 'Ganti'
                            : 'Unggah'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={unggahSlot !== null || !vendorId}
                          onChange={(e) => pilihFotoVendor(slot, e)}
                        />
                      </label>
                      {fotoVendor[slot] && (
                        <button
                          type="button"
                          disabled={unggahSlot !== null}
                          onClick={() => hapusFotoVendor(slot)}
                          className="text-[13px] font-medium text-maroon hover:underline disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-[12px] text-muted">
                Dipotong otomatis jadi 900×600. Slot yang kosong akan tampil sebagai emoji
                kategori di halaman pelanggan.
              </p>
            </div>
          </section>

          {/* key memaksa form dipasang ulang tiap ganti sasaran, supaya nilai
              awal tiap field benar-benar segar tanpa menyetel ulang satu-satu. */}
          <ServiceDialog
            key={formUntuk === 'baru' ? 'baru' : formUntuk?.service_id ?? 'tutup'}
            awal={formUntuk === 'baru' ? null : formUntuk}
            buka={formUntuk !== null}
            defaultNotice={defaultNotice}
            versiFoto={versiFoto}
            onTutup={() => setFormUntuk(null)}
            onSimpan={simpan}
          />
        </>
      )}
    </TukarHalus>
  )
}

/** Form layanan — dipakai untuk TAMBAH maupun UBAH.
 *
 *  Satu form untuk dua hal karena field-nya memang sama persis; yang beda cuma
 *  nilai awal dan endpoint tujuannya. Dua komponen terpisah berarti dua tempat
 *  yang harus diperbaiki tiap kali ada field baru.
 *
 *  Pakai <dialog> bawaan browser, bukan modal buatan sendiri: fokus terkunci
 *  di dalam form, Esc menutup, dan latarnya otomatis inert — semua gratis.
 */
function ServiceDialog({
  awal,
  buka,
  defaultNotice,
  versiFoto,
  onTutup,
  onSimpan,
}: {
  /** null = tambah layanan baru. */
  awal: ApiService | null
  buka: boolean
  defaultNotice: number
  versiFoto: number
  onTutup: () => void
  onSimpan: (isi: BaruLayanan) => Promise<void>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const [mengirim, setMengirim] = useState(false)

  // undefined = fotonya tidak disentuh, '' = minta dihapus, string = foto baru.
  const [foto, setFoto] = useState<string | undefined>(undefined)
  const [memproses, setMemproses] = useState(false)

  // Dibuka dari induknya lewat prop, bukan lewat ref yang dioper turun: dengan
  // key remount di induk, elemen <dialog>-nya baru tiap kali sasarannya ganti.
  useEffect(() => {
    if (buka) ref.current?.showModal()
  }, [buka])

  async function pilihFoto(file: File | undefined) {
    if (!file) return
    setError('')
    setMemproses(true)
    try {
      setFoto(await kecilkanGambar(file, ...PORTOFOLIO))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMemproses(false)
    }
  }

  /** Yang tampil di kotak pratinjau, urut dari yang paling baru dipilih. */
  const pratinjau =
    foto !== undefined
      ? foto || null
      : awal?.has_photo
        ? urlFotoLayanan(awal.service_id, versiFoto)
        : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)

    const name = String(data.get('service_name') || '').trim()
    const category = String(data.get('category') || '')
    const price = Number(data.get('price'))
    const noticeDays = Number(data.get('minimum_notice_days'))

    // Divalidasi ulang di sini walaupun input-nya sudah required/min, karena
    // atribut HTML bisa dilewati dan backend pun mengecek hal yang sama.
    if (!name || !category) return setError('Nama layanan dan kategori wajib diisi.')
    if (!Number.isFinite(price) || price < 0) return setError('Harga harus berupa angka positif.')
    if (!Number.isInteger(noticeDays) || noticeDays < 0) {
      return setError('Waktu persiapan harus berupa jumlah hari yang bulat.')
    }

    setMengirim(true)
    try {
      await onSimpan({
        service_name: name,
        category,
        description: String(data.get('description') || '').trim(),
        price,
        minimum_notice_days: noticeDays,
        // Dibiarkan hilang dari body kalau fotonya tidak disentuh — backend
        // membedakan "tidak dikirim" (biarkan) dari "" (hapus).
        ...(foto !== undefined ? { image: foto } : {}),
      })
      setError('')
      ref.current?.close()
    } catch (err) {
      // Dialog sengaja tidak ditutup kalau gagal — isinya masih dibutuhkan.
      setError((err as Error).message)
    } finally {
      setMengirim(false)
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onTutup}
      className="m-auto w-[min(560px,92vw)] rounded-lg border border-line bg-white p-0 backdrop:bg-navy-900/40"
    >
      <form onSubmit={handleSubmit} className="max-h-[86vh] overflow-y-auto p-7">
        <h2 className="font-display text-[26px] font-semibold">
          {awal ? 'Ubah Layanan' : 'Tambah Layanan Baru'}
        </h2>
        <p className="mt-1 text-[14px] text-ink/70">
          {awal
            ? 'Perubahan langsung berlaku di halaman kategori dan detail vendor.'
            : 'Layanan yang ditambahkan langsung tampil di halaman kategori yang sesuai.'}
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <span className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
              FOTO LAYANAN
            </span>
            <div className="mt-2 flex items-center gap-4">
              <div className="h-[86px] w-[130px] shrink-0 overflow-hidden rounded-sm border border-line bg-lavender/25">
                {pratinjau && (
                  <img src={pratinjau} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-2 text-[13px] font-medium hover:border-ink">
                  <UploadCloudIcon />
                  {memproses ? 'Memproses…' : pratinjau ? 'Ganti Foto' : 'Pilih Foto'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => pilihFoto(e.target.files?.[0])}
                  />
                </label>
                {pratinjau && (
                  <button
                    type="button"
                    onClick={() => setFoto('')}
                    className="ml-3 text-[13px] font-medium text-maroon hover:underline"
                  >
                    Hapus
                  </button>
                )}
                <p className="mt-1.5 text-[12px] text-muted">
                  Dipotong otomatis jadi 900×600. Kosong = pakai emoji kategori.
                </p>
              </div>
            </div>
          </div>

          <Field
            id="service_name"
            label="NAMA LAYANAN"
            placeholder="Contoh: Paket Wedding Intimate"
            defaultValue={awal?.service_name}
          />

          <div>
            <label htmlFor="category" className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
              KATEGORI
            </label>
            <div className="relative">
              <select
                id="category"
                name="category"
                required
                defaultValue={awal?.category ?? ''}
                className="mt-2 h-11 w-full appearance-none rounded-sm border border-line bg-white px-3 pr-9 text-[14px] outline-none focus:border-navy-900"
              >
                <option value="" disabled>
                  Pilih kategori…
                </option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 bottom-3.5 h-4 w-4 text-ink/50" />
            </div>
            <p className="mt-1.5 text-[12px] text-muted">
              Satu vendor boleh menjual lintas kategori — kategori melekat pada layanan, bukan pada
              profil Anda.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="price"
              label="HARGA (RP)"
              type="number"
              min={0}
              placeholder="15000000"
              defaultValue={awal ? Number(awal.price) : undefined}
            />
            <Field
              id="minimum_notice_days"
              label="WAKTU PERSIAPAN (HARI)"
              type="number"
              min={0}
              defaultValue={awal?.minimum_notice_days ?? defaultNotice}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
              DESKRIPSI
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={awal?.description ?? ''}
              placeholder="Jelaskan cakupan layanan, durasi, dan apa saja yang klien dapatkan."
              className="mt-2 w-full rounded-sm border border-line bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-ink/35 focus:border-navy-900"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-sm bg-maroon/10 px-4 py-3 text-[13px] text-maroon">
            {error}
          </p>
        )}

        <div className="mt-7 flex justify-end gap-3 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-md border border-line px-5 py-2.5 text-[13px] font-medium hover:border-ink"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={mengirim || memproses}
            className="rounded-md bg-navy-900 px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {mengirim ? 'Menyimpan…' : awal ? 'Simpan Perubahan' : 'Simpan Layanan'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function Field({
  id,
  label,
  type = 'text',
  placeholder,
  min,
  defaultValue,
}: {
  id: string
  label: string
  type?: string
  placeholder?: string
  min?: number
  defaultValue?: string | number
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        min={min}
        required
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-2 h-11 w-full rounded-sm border border-line bg-white px-3 text-[14px] outline-none placeholder:text-ink/35 focus:border-navy-900"
      />
    </div>
  )
}

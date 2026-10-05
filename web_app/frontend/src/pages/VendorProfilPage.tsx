import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import FormSkeleton from '../components/FormSkeleton'
import Img from '../components/Img'
import TukarHalus from '../components/TukarHalus'
import { inputClass } from '../components/AuthLayout'
import { VendorPageHeader, type KonteksVendor } from '../components/VendorLayout'
import { ArrowRight, NoteIcon, UploadCloudIcon } from '../components/icons'
import {
  bukaBerkas, get, getMyVendor, kirim, simpanUser, usePengguna, type ApiVendor,
} from '../lib/api'
import { AVATAR, bacaDokumen, kecilkanGambar } from '../lib/gambar'
import Dropdown from '../components/Dropdown'
import RekeningBank from '../components/RekeningBank'
import DuaLangkah from '../components/DuaLangkah'
import UlasanVendor from '../components/UlasanVendor'
import type { Rekening } from '../data/banks'

/** Kelola profil vendor sesudah onboarding (revisi PM 26 Sep 2026).
 *
 *  Sebelumnya vendor cuma bisa mengisi profilnya SEKALI di onboarding, dan
 *  foto di sidebar menunjuk berkas yang tidak pernah ada. Halaman ini tidak
 *  menambah endpoint apa pun — semuanya sudah ada:
 *  - Foto profil  → PATCH /auth/me { avatar_url } (sama dengan profil klien)
 *  - Info bisnis  → PATCH /vendors/:id
 *  - Dokumen      → PUT /vendors/me/documents/:jenis
 *  - Rekening     → PATCH /auth/rekening (wajib sandi; tujuan transfer payout)
 *  - 2FA          → POST /auth/dua-langkah(/konfirmasi|/matikan)
 *  Portofolio tetap di /vendor/layanan, tidak diduplikasi di sini. */

const kota = [
  'jakarta_pusat', 'jakarta_utara', 'jakarta_barat', 'jakarta_selatan', 'jakarta_timur',
  'bogor', 'depok', 'tangerang', 'tangerang_selatan', 'bekasi',
]
const labelKota = (k: string) =>
  k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

type Dokumen = {
  doc_type: 'ktp' | 'npwp' | 'siup'
  file_name: string
  status: 'pending' | 'approved' | 'rejected'
  uploaded_at: string
  ada_berkas: boolean
}

const JENIS_DOKUMEN = [
  { type: 'ktp', judul: 'KTP Penanggung Jawab' },
  { type: 'npwp', judul: 'NPWP Perusahaan / Pribadi' },
  { type: 'siup', judul: 'SIUP atau Portofolio Bisnis' },
] as const

const labelStatus: Record<Dokumen['status'], { teks: string; kelas: string }> = {
  pending: { teks: 'Menunggu kurasi', kelas: 'bg-amber/15 text-[#8a5a00]' },
  approved: { teks: 'Terverifikasi', kelas: 'bg-[#2e6b52]/10 text-[#2e6b52]' },
  rejected: { teks: 'Ditolak, unggah ulang', kelas: 'bg-maroon/10 text-maroon' },
}

export default function VendorProfilPage() {
  const { setVendor: setVendorSidebar } = useOutletContext<KonteksVendor>()
  const user = usePengguna()

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [dokumen, setDokumen] = useState<Dokumen[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  // Foto & dokumen disimpan seketika saat dipilih, terpisah dari tombol
  // Simpan info bisnis — sama seperti kotak foto di onboarding.
  const [unggah, setUnggah] = useState<string | null>(null)
  const [rekening, setRekening] = useState<Rekening | null>(null)
  const [duaLangkah, setDuaLangkah] = useState(false)
  // Keuangan menautkan ke sini lewat #rekening. Router tidak menggulung ke
  // hash, dan isinya baru terpasang sesudah rangka TukarHalus lepas — jadi
  // digulung dari ref bagiannya, sekali saja.
  const sudahGulir = useRef(false)

  useEffect(() => {
    Promise.all([
      getMyVendor(),
      get<{ documents: Dokumen[] }>('/vendors/me/documents').catch(() => ({ documents: [] })),
      get<{ user: Rekening & { dua_langkah: boolean } }>('/auth/me'),
    ])
      .then(([v, d, me]) => {
        setVendor(v.vendor)
        setDokumen(d.documents)
        setRekening(me.user)
        setDuaLangkah(me.user.dua_langkah)
      })
      .catch((e) => setGalat((e as Error).message))
      .finally(() => setMemuat(false))
  }, [])

  async function simpanInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!vendor) return
    setGalat('')
    setPesan('')
    setMenyimpan(true)
    const form = new FormData(e.currentTarget)
    try {
      const r = await kirim<{ vendor: ApiVendor }>(`/vendors/${vendor.vendor_id}`, 'PATCH', {
        business_name: String(form.get('business_name')).trim(),
        description: String(form.get('description')).trim(),
        city: form.get('city'),
        address: String(form.get('address')).trim(),
      })
      // PATCH membalas baris vendors saja, tanpa penanda foto dari GET /me.
      const baru = { ...vendor, ...r.vendor }
      setVendor(baru)
      setVendorSidebar(baru)
      setPesan('Profil bisnis tersimpan.')
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setMenyimpan(false)
    }
  }

  async function gantiFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    setGalat('')
    setPesan('')
    setUnggah('foto')
    try {
      const avatar = await kecilkanGambar(file, ...AVATAR)
      const r = await kirim<{ user: { avatar_url: string | null } }>('/auth/me', 'PATCH', { avatar_url: avatar })
      // Sidebar membaca foto dari identitas di localStorage (usePengguna).
      simpanUser({ ...user, avatar_url: r.user.avatar_url })
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setUnggah(null)
    }
  }

  async function gantiDokumen(jenis: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setGalat('')
    setPesan('')
    setUnggah(jenis)
    try {
      const isi = await bacaDokumen(file)
      const { document } = await kirim<{ document: Dokumen }>(
        `/vendors/me/documents/${jenis}`, 'PUT', { file_name: file.name, file: isi },
      )
      setDokumen((d) => [...d.filter((x) => x.doc_type !== jenis), document])
      setPesan('Dokumen terkirim. Status kembali menunggu kurasi admin.')
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setUnggah(null)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<FormSkeleton label="Memuat profil vendor…" />}>
      {() => {
        if (!vendor) {
          return <p className="mt-8 text-[14px] text-maroon">{galat || 'Profil vendor tidak ditemukan.'}</p>
        }

        return (
          <>
            <VendorPageHeader
              title="Profil Vendor"
              description="Atur identitas bisnis yang dilihat klien, dan pantau dokumen verifikasi Anda."
            />

            <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
              {/* Foto profil = foto di sidebar dan identitas di Pusat Obrolan. */}
              <section className="h-fit rounded-lg border border-line bg-white p-6 text-center">
                <Img
                  src={user?.avatar_url || undefined}
                  alt="Foto profil vendor"
                  className="mx-auto h-[120px] w-[120px] rounded-lg object-cover"
                />
                <label
                  htmlFor="foto-profil"
                  className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-2 text-[13px] font-semibold text-navy-900 transition-colors hover:border-navy-900"
                >
                  <UploadCloudIcon className="h-4 w-4" />
                  {unggah === 'foto' ? 'Mengunggah…' : user?.avatar_url ? 'Ganti Foto' : 'Unggah Foto'}
                </label>
                <input
                  id="foto-profil"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={gantiFoto}
                  disabled={unggah !== null}
                  className="sr-only"
                />
                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  Logo atau foto usaha Anda. Dipotong kotak 256×256.
                </p>
                <Link
                  to="/vendor/layanan"
                  className="mt-5 flex items-center justify-center gap-2 border-t border-line pt-4 text-[13px] font-semibold"
                >
                  Kelola Foto Portofolio <ArrowRight className="h-4 w-4" />
                </Link>
              </section>

              <div className="space-y-6">
                <form onSubmit={simpanInfo} className="rounded-lg border border-line bg-white p-6">
                  <h2 className="font-display text-[22px] font-semibold text-navy-900">Informasi Bisnis</h2>

                  <label htmlFor="business_name" className="mt-5 block text-[13px] font-semibold text-navy-900">
                    Nama Bisnis
                  </label>
                  <input
                    id="business_name" name="business_name" required maxLength={150}
                    defaultValue={vendor.business_name}
                    className={`mt-2 ${inputClass}`}
                  />

                  <label htmlFor="description" className="mt-5 block text-[13px] font-semibold text-navy-900">
                    Deskripsi Singkat Bisnis
                  </label>
                  <textarea
                    id="description" name="description" rows={4}
                    defaultValue={vendor.description ?? ''}
                    placeholder="Ceritakan keahlian unik layanan Anda…"
                    className="mt-2 w-full rounded border border-line bg-cream px-4 py-3 text-[14px] text-ink outline-none placeholder:text-ink/55 focus:border-navy-900"
                  />

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="city" className="block text-[13px] font-semibold text-navy-900">
                        Lokasi Operasional Utama
                      </label>
                      <Dropdown
                        id="city" name="city" required defaultValue={vendor.city ?? ''}
                        className={`mt-2 ${inputClass}`}
                      >
                        <option value="" disabled>Pilih wilayah</option>
                        {kota.map((k) => <option key={k} value={k}>{labelKota(k)}</option>)}
                      </Dropdown>
                    </div>
                    <div>
                      <label htmlFor="address" className="block text-[13px] font-semibold text-navy-900">
                        Alamat Usaha
                      </label>
                      <input
                        id="address" name="address"
                        defaultValue={vendor.address ?? ''}
                        placeholder="Jalan, nomor, kelurahan"
                        className={`mt-2 ${inputClass}`}
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      type="submit"
                      disabled={menyimpan}
                      className="h-11 rounded-md bg-navy-900 px-7 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {menyimpan ? 'Menyimpan…' : 'Simpan Perubahan'}
                    </button>
                  </div>
                </form>

                {rekening && (
                  <section
                    id="rekening"
                    ref={(el) => {
                      if (el && !sudahGulir.current && window.location.hash === '#rekening') {
                        sudahGulir.current = true
                        el.scrollIntoView({ block: 'start' })
                      }
                    }}
                    className="scroll-mt-6 rounded-lg border border-line bg-white p-6"
                  >
                    <h2 className="font-display text-[22px] font-semibold text-navy-900">Rekening Pencairan</h2>
                    <p className="mt-1 text-[13px] text-muted">
                      Saat Anda menarik dana, admin mentransfer ke rekening ini. Rekening dicatat
                      pada tiap pengajuan, jadi menggantinya tidak mengubah pengajuan yang sudah antre.
                    </p>
                    <RekeningBank rekening={rekening} onTersimpan={setRekening} />
                  </section>
                )}

                <section className="rounded-lg border border-line bg-white p-6">
                  <h2 className="font-display text-[22px] font-semibold text-navy-900">Keamanan Akun</h2>
                  <DuaLangkah aktif={duaLangkah} onBerubah={setDuaLangkah} />
                </section>

                <section className="rounded-lg border border-line bg-white p-6">
                  <h2 className="font-display text-[22px] font-semibold text-navy-900">Dokumen Verifikasi</h2>
                  <p className="mt-1 text-[13px] text-muted">
                    Hanya Anda dan admin yang bisa membuka berkas ini. Mengganti dokumen mengulang kurasi.
                  </p>

                  <div className="mt-5 space-y-2">
                    {JENIS_DOKUMEN.map(({ type, judul }) => {
                      const d = dokumen.find((x) => x.doc_type === type)
                      return (
                        <div
                          key={type}
                          className="flex flex-wrap items-center gap-3 rounded border border-line px-4 py-3 text-[13px]"
                        >
                          <NoteIcon className="h-4 w-4 shrink-0 text-ink/50" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-navy-900">{judul}</span>
                            <span className="block truncate text-[12px] text-muted" title={d?.file_name}>
                              {d ? d.file_name : 'Belum diunggah'}
                            </span>
                          </span>
                          {d && (
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${labelStatus[d.status].kelas}`}>
                              {labelStatus[d.status].teks}
                            </span>
                          )}
                          {d?.ada_berkas && (
                            <button
                              type="button"
                              onClick={() =>
                                bukaBerkas(`/vendors/me/documents/${type}/berkas`)
                                  .catch((e) => setGalat((e as Error).message))
                              }
                              className="rounded border border-line px-2.5 py-1 text-[11px] font-semibold text-navy-900 transition-colors hover:border-navy-900"
                            >
                              Lihat
                            </button>
                          )}
                          <label
                            htmlFor={`dok-${type}`}
                            className="cursor-pointer rounded bg-navy-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                          >
                            {unggah === type ? 'Mengirim…' : d ? 'Ganti' : 'Unggah'}
                          </label>
                          <input
                            id={`dok-${type}`}
                            type="file"
                            accept=".jpg,.jpeg,.png,.pdf"
                            disabled={unggah !== null}
                            onChange={(e) => gantiDokumen(type, e)}
                            className="sr-only"
                          />
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-muted">JPG, PNG, atau PDF maks. 700 KB.</p>
                </section>

                <section className="rounded-lg border border-line bg-white p-6">
                  <UlasanVendor vendorId={vendor.vendor_id} bisaHapus />
                </section>

                {galat && <p role="alert" className="text-[14px] text-maroon">{galat}</p>}
                {pesan && <p className="text-[14px] font-semibold text-[#2e6b52]">{pesan}</p>}
              </div>
            </div>
          </>
        )
      }}
    </TukarHalus>
  )
}

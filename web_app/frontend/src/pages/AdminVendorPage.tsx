import { useCallback, useEffect, useState } from 'react'
import TabelSkeleton from '../components/TabelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { ShieldIcon, CheckCircleIcon, NoteIcon } from '../components/icons'
import { categories, namaKota } from '../data/categories'
import { get, kirim } from '../lib/api'

/** Persetujuan Vendor — antrean kurasi di Pusat Kendali admin.
 *
 *  Beda dari mockup, dan alasannya:
 *  - Angka "SLA kurator", "NIB terverifikasi", dan skor kepatuhan tidak ada
 *    datanya di DB. Yang ditampilkan cuma yang benar-benar tersimpan:
 *    dokumen (KTP/NPWP/SIUP), kategori layanan, kota, dan pemiliknya.
 *  - Sampel portofolio berupa foto juga belum ada penyimpanannya, jadi
 *    kolomnya diganti ringkasan kategori.
 *  - Menyetujui vendor sekaligus menandai dokumennya 'approved' di backend,
 *    supaya vendor tidak melihat status yang saling bertentangan. */

type Dokumen = {
  doc_type: 'ktp' | 'npwp' | 'siup'
  file_name: string
  status: 'pending' | 'approved' | 'rejected'
  uploaded_at: string
}

type VendorReview = {
  vendor_id: string
  business_name: string
  city: string | null
  description: string | null
  is_verified: boolean
  verification_note: string | null
  verified_at: string | null
  rating_avg: string
  rating_count: number
  created_at: string
  owner_id: string
  owner_name: string
  owner_full_name: string | null
  owner_email: string
  owner_phone: string | null
  documents: Dokumen[]
  categories: string[]
}

type Stats = {
  menunggu: string
  terverifikasi: string
  dokumen_menunggu: string
  gmv: string
}

const tabs = [
  { id: 'pending', label: 'Menunggu Kurasi' },
  { id: 'verified', label: 'Terverifikasi' },
  { id: 'all', label: 'Semua' },
] as const

const labelDokumen: Record<Dokumen['doc_type'], string> = {
  ktp: 'KTP Penanggung Jawab',
  npwp: 'NPWP',
  siup: 'SIUP / Portofolio',
}

const rupiah = (n: string | number) =>
  'Rp ' + Math.round(Number(n)).toLocaleString('id-ID')

const labelKategori = (apiCategory: string) =>
  Object.values(categories).find((c) => c.apiCategory === apiCategory)?.label ?? apiCategory

export default function AdminVendorPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('pending')
  const [daftar, setDaftar] = useState<VendorReview[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [terpilih, setTerpilih] = useState<string | null>(null)
  const [catatan, setCatatan] = useState('')
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    setMemuat(true)
    setGalat('')
    try {
      const [v, s] = await Promise.all([
        get<{ data: VendorReview[] }>(`/admin/vendors?status=${tab}`),
        get<{ stats: Stats }>('/admin/stats'),
      ])
      setDaftar(v.data)
      setStats(s.stats)
      // Pilihan lama dibuang kalau vendornya tidak ada lagi di tab ini.
      setTerpilih((t) => (t && v.data.some((x) => x.vendor_id === t) ? t : v.data[0]?.vendor_id ?? null))
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setMemuat(false)
    }
  }, [tab])

  useEffect(() => { muat() }, [muat])

  const vendor = daftar.find((v) => v.vendor_id === terpilih) ?? null

  async function putuskan(action: 'approve' | 'reject') {
    if (!vendor) return
    if (action === 'reject' && !catatan.trim()) {
      setGalat('Alasan penolakan wajib diisi supaya vendor tahu harus memperbaiki apa.')
      return
    }

    setSibuk(true)
    setGalat('')
    try {
      await kirim(`/admin/vendors/${vendor.vendor_id}/verification`, 'PATCH', {
        action,
        note: catatan.trim() || undefined,
      })
      setCatatan('')
      await muat()
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<TabelSkeleton kolom={4} baris={7} label="Memuat daftar vendor…" />}>
      {() => (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-[32px] font-semibold text-navy-900">Persetujuan Vendor</h1>
              <p className="mt-2 text-[14px] text-muted">
                Vendor hanya tampil di marketplace setelah dikurasi. Menyetujui vendor sekaligus
                menandai dokumen legalnya.
              </p>
            </div>
            {stats && (
              <span className="rounded-full bg-amber/20 px-4 py-2 text-[13px] font-semibold text-navy-900">
                {stats.menunggu} menunggu kurasi
              </span>
            )}
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kartu label="Menunggu Kurasi" nilai={stats?.menunggu ?? '—'} catatan="Vendor belum terverifikasi" />
            <Kartu label="Vendor Terverifikasi" nilai={stats?.terverifikasi ?? '—'} catatan="Tampil di pencarian" />
            <Kartu
              label="Dokumen Menunggu"
              nilai={stats?.dokumen_menunggu ?? '—'}
              catatan="KTP / NPWP / SIUP belum dikurasi"
            />
            <Kartu
              label="GMV Ditransaksikan"
              nilai={stats ? rupiah(stats.gmv) : '—'}
              catatan="Dari pesanan yang DP-nya masuk"
            />
          </div>

          {galat && (
            <p role="alert" className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
              {galat}
            </p>
          )}

          <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_380px]">
            <section className="min-w-0 rounded-lg border border-line bg-white">
              <div className="flex flex-wrap gap-2 border-b border-line p-4">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`rounded-md px-4 py-2 text-[13px] font-semibold transition-colors ${
                      tab === t.id ? 'bg-navy-900 text-white' : 'text-ink/70 hover:bg-lavender/40'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {!memuat && daftar.length === 0 ? (
                <p className="p-8 text-[14px] text-muted">Tidak ada vendor di kategori ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <thead className="bg-cream text-[11px] tracking-wide text-ink/60 uppercase">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Entitas Vendor</th>
                        <th className="px-5 py-3 font-semibold">Kategori / Lokasi</th>
                        <th className="px-5 py-3 font-semibold">Dokumen Legal</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daftar.map((v) => (
                        <tr
                          key={v.vendor_id}
                          onClick={() => { setTerpilih(v.vendor_id); setCatatan('') }}
                          className={`cursor-pointer border-t border-line transition-colors ${
                            v.vendor_id === terpilih ? 'bg-lavender/40' : 'hover:bg-cream'
                          }`}
                        >
                          <td className="px-5 py-4">
                            <p className="font-semibold text-navy-900">{v.business_name}</p>
                            <p className="mt-1 text-[12px] text-muted">
                              {v.owner_full_name || v.owner_name} · {v.owner_email}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <p>{v.categories.map(labelKategori).join(', ') || 'Belum ada layanan'}</p>
                            <p className="mt-1 text-[12px] text-muted">{namaKota(v.city)}</p>
                          </td>
                          <td className="px-5 py-4">
                            {v.documents.length === 0 ? (
                              <span className="text-muted">Belum diunggah</span>
                            ) : (
                              v.documents.map((d) => (
                                <span key={d.doc_type} className="mr-2 text-[12px]">
                                  {d.doc_type.toUpperCase()}
                                  <span
                                    className={
                                      d.status === 'approved'
                                        ? 'text-[#2e6b52]'
                                        : d.status === 'rejected'
                                          ? 'text-maroon'
                                          : 'text-amber'
                                    }
                                  >
                                    {' '}
                                    ●
                                  </span>
                                </span>
                              ))
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {v.is_verified ? (
                              <span className="rounded-full bg-[#2e6b52]/10 px-3 py-1 text-[12px] font-semibold text-[#2e6b52]">
                                Terverifikasi
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber/20 px-3 py-1 text-[12px] font-semibold text-navy-900">
                                Menunggu
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="flex gap-3 border-t border-line bg-cream px-5 py-4 text-[12px] leading-relaxed text-muted">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                Vendor yang belum terverifikasi tetap bisa mengisi layanan dan jadwal, tapi menandai
                terverifikasi adalah keputusan kurator — dan tercatat atas nama akun admin ini.
              </p>
            </section>

            <section className="h-fit rounded-lg border border-line bg-white p-6">
              {!vendor ? (
                <p className="text-[14px] text-muted">Pilih vendor di tabel untuk melihat berkasnya.</p>
              ) : (
                <>
                  <p className="text-[11px] tracking-wide text-muted uppercase">Berkas Kurasi Aktif</p>
                  <h2 className="mt-1 font-display text-[24px] font-semibold text-navy-900">
                    {vendor.business_name}
                  </h2>
                  <p className="mt-1 text-[12px] text-muted">UUID: {vendor.vendor_id.slice(0, 8)}…</p>

                  <dl className="mt-5 space-y-2 text-[13px]">
                    <Baris label="Penanggung jawab" nilai={vendor.owner_full_name || vendor.owner_name} />
                    <Baris label="Email" nilai={vendor.owner_email} />
                    <Baris label="WhatsApp" nilai={vendor.owner_phone ?? '—'} />
                    <Baris label="Wilayah" nilai={namaKota(vendor.city)} />
                    <Baris
                      label="Kategori"
                      nilai={vendor.categories.map(labelKategori).join(', ') || 'Belum ada layanan'}
                    />
                    <Baris
                      label="Rating"
                      nilai={`${vendor.rating_avg} (${vendor.rating_count} ulasan)`}
                    />
                  </dl>

                  {vendor.description && (
                    <p className="mt-4 rounded border border-line bg-cream p-4 text-[13px] leading-relaxed text-ink/80">
                      {vendor.description}
                    </p>
                  )}

                  <p className="mt-6 text-[11px] tracking-wide text-muted uppercase">Berkas Legal</p>
                  <div className="mt-2 space-y-2">
                    {(['ktp', 'npwp', 'siup'] as const).map((jenis) => {
                      const d = vendor.documents.find((x) => x.doc_type === jenis)
                      return (
                        <div
                          key={jenis}
                          className="flex items-center gap-3 rounded border border-line px-4 py-3 text-[13px]"
                        >
                          <NoteIcon className="h-4 w-4 shrink-0 text-ink/50" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-navy-900">{labelDokumen[jenis]}</span>
                            <span className="block truncate text-[12px] text-muted">
                              {d ? d.file_name : 'Belum diunggah'}
                            </span>
                          </span>
                          {d && (
                            <span
                              className={`text-[11px] font-semibold tracking-wide uppercase ${
                                d.status === 'approved'
                                  ? 'text-[#2e6b52]'
                                  : d.status === 'rejected'
                                    ? 'text-maroon'
                                    : 'text-amber'
                              }`}
                            >
                              {d.status}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    Yang tersimpan baru nama berkasnya — isi file belum diunggah ke penyimpanan mana pun.
                  </p>

                  {vendor.verification_note && (
                    <p className="mt-5 rounded border border-lavender bg-lavender/40 p-4 text-[13px] leading-relaxed text-ink/80">
                      <b>Catatan kurasi terakhir:</b> {vendor.verification_note}
                    </p>
                  )}

                  <label
                    htmlFor="catatan"
                    className="mt-6 block text-[11px] tracking-wide text-muted uppercase"
                  >
                    Catatan Kurasi (dibaca vendor)
                  </label>
                  <textarea
                    id="catatan"
                    rows={3}
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Wajib diisi kalau menolak — sebutkan apa yang harus diperbaiki."
                    className="mt-2 w-full rounded border border-line bg-cream px-4 py-3 text-[13px] text-ink outline-none placeholder:text-ink/35 focus:border-navy-900"
                  />

                  <button
                    type="button"
                    disabled={sibuk || vendor.is_verified}
                    onClick={() => putuskan('approve')}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded bg-navy-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <CheckCircleIcon className="h-4 w-4" />
                    {vendor.is_verified ? 'Sudah terverifikasi' : sibuk ? 'Memproses…' : 'Setujui Vendor'}
                  </button>
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => putuskan('reject')}
                    className="mt-2 h-11 w-full rounded border border-maroon/40 text-[13px] font-semibold text-maroon transition-colors hover:bg-maroon/5 disabled:opacity-50"
                  >
                    Tolak & Kirim Catatan
                  </button>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </TukarHalus>
  )
}

function Kartu({ label, nilai, catatan }: { label: string; nilai: string; catatan: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 font-display text-[28px] leading-none font-semibold text-navy-900">{nilai}</p>
      <p className="mt-2 text-[12px] text-muted">{catatan}</p>
    </div>
  )
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-navy-900">{nilai}</dd>
    </div>
  )
}

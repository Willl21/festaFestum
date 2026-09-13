import { useCallback, useEffect, useState } from 'react'
import TabelSkeleton from '../components/TabelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { UserCircleIcon, SearchIcon } from '../components/icons'
import { namaKota } from '../data/categories'
import { rupiahBulat } from '../lib/format'
import { get } from '../lib/api'

/** Registri akun — daftar seluruh pengguna, vendor, dan admin.
 *
 *  Halaman ini SENGAJA hanya membaca. Mockup punya tombol sanksi, penangguhan
 *  akun, dan reset 2FA; ketiganya butuh kolom status akun yang belum ada di
 *  tabel users, dan menonaktifkan akun orang adalah aksi yang tidak bisa
 *  dibatalkan dari UI. Ditunda sampai diminta, bukan dipasang sebagai tombol
 *  yang tidak melakukan apa-apa.
 *  ponytail: baca saja. Upgrade: kolom users.status + endpoint PATCH. */

type Akun = {
  user_id: string
  name: string
  full_name: string | null
  email: string
  phone: string | null
  role: 'customer' | 'vendor_owner' | 'admin'
  created_at: string
  vendor_id: string | null
  business_name: string | null
  city: string | null
  is_verified: boolean | null
  rating_avg: string | null
  rating_count: number | null
  nilai_transaksi: string
  jumlah_pesanan: number
}

type Ringkasan = { klien: number; vendor: number; admin: number; total: number }

const tabs = [
  { id: 'all', label: 'Semua Akun' },
  { id: 'customer', label: 'Klien' },
  { id: 'vendor_owner', label: 'Vendor' },
  { id: 'admin', label: 'Admin' },
] as const

const labelPeran = { customer: 'Klien', vendor_owner: 'Vendor', admin: 'Admin' }

export default function AdminAkunPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('all')
  const [cari, setCari] = useState('')
  const [daftar, setDaftar] = useState<Akun[]>([])
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  const muat = useCallback(async () => {
    setMemuat(true)
    setGalat('')
    try {
      const r = await get<{ data: Akun[]; ringkasan: Ringkasan }>(
        `/admin/users?role=${tab}&q=${encodeURIComponent(cari)}`
      )
      setDaftar(r.data)
      setRingkasan(r.ringkasan)
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setMemuat(false)
    }
  }, [tab, cari])

  // Pencarian ditunda sebentar supaya tidak menembak backend tiap ketukan.
  useEffect(() => {
    const t = setTimeout(muat, 300)
    return () => clearTimeout(t)
  }, [muat])

  return (
    <TukarHalus memuat={memuat} rangka={<TabelSkeleton kolom={6} baris={7} label="Memuat daftar akun…" />}>
      {() => (
        <>
          <h1 className="font-display text-[32px] font-semibold text-navy-900">Akun Pengguna &amp; Vendor</h1>
          <p className="mt-2 text-[14px] text-muted">
            Registri seluruh akun terdaftar beserta nilai transaksinya.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kartu label="Total Akun" nilai={ringkasan?.total ?? '—'} catatan="Semua peran" />
            <Kartu label="Klien" nilai={ringkasan?.klien ?? '—'} catatan="Pemesan acara" />
            <Kartu label="Vendor" nilai={ringkasan?.vendor ?? '—'} catatan="Mitra penyedia layanan" />
            <Kartu label="Admin" nilai={ringkasan?.admin ?? '—'} catatan="Dibuat langsung di database" />
          </div>

          {galat && (
            <p role="alert" className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
              {galat}
            </p>
          )}

          <section className="mt-7 rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
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

              <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-[320px]">
                <SearchIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink/40" />
                <input
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari nama, email, atau nama usaha…"
                  className="h-10 w-full rounded border border-line pr-4 pl-10 text-[13px] outline-none focus:border-navy-900"
                />
              </div>
            </div>

            {!memuat && daftar.length === 0 ? (
              <p className="p-8 text-[14px] text-muted">Tidak ada akun yang cocok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-[13px]">
                  <thead className="bg-cream text-[11px] tracking-wide text-ink/60 uppercase">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Akun</th>
                      <th className="px-5 py-3 font-semibold">Peran</th>
                      <th className="px-5 py-3 font-semibold">Kontak</th>
                      <th className="px-5 py-3 font-semibold">Wilayah</th>
                      <th className="px-5 py-3 font-semibold">Terdaftar</th>
                      <th className="px-5 py-3 text-right font-semibold">Nilai Transaksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daftar.map((a) => (
                      <tr key={a.user_id} className="border-t border-line hover:bg-cream">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender text-[12px] font-semibold text-navy-900">
                              {(a.business_name || a.full_name || a.name).slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold text-navy-900">
                                {a.business_name || a.full_name || a.name}
                                {a.is_verified && <span className="ml-1 text-[#2e6b52]">✔</span>}
                              </span>
                              <span className="block text-[12px] text-muted">
                                #{a.user_id.slice(0, 8).toUpperCase()}
                                {a.rating_count ? ` · ${a.rating_avg}★ (${a.rating_count})` : ''}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-lavender/60 px-3 py-1 text-[12px] font-medium text-navy-900">
                            {labelPeran[a.role]}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p>{a.email}</p>
                          <p className="mt-1 text-[12px] text-muted">{a.phone ?? '—'}</p>
                        </td>
                        <td className="px-5 py-4">{a.vendor_id ? namaKota(a.city) : '—'}</td>
                        <td className="px-5 py-4">
                          {new Date(a.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="font-semibold text-navy-900">
                            {rupiahBulat(Number(a.nilai_transaksi))}
                          </p>
                          <p className="mt-1 text-[12px] text-muted">{a.jumlah_pesanan} pesanan</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="flex gap-3 border-t border-line bg-cream px-5 py-4 text-[12px] leading-relaxed text-muted">
              <UserCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              Halaman ini hanya membaca. Sanksi, penangguhan akun, dan reset 2FA yang ada di mockup
              belum dibuat — tabel users belum punya kolom statusnya.
            </p>
          </section>
        </>
      )}
    </TukarHalus>
  )
}

function Kartu({ label, nilai, catatan }: { label: string; nilai: number | string; catatan: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 font-display text-[28px] leading-none font-semibold text-navy-900">{nilai}</p>
      <p className="mt-2 text-[12px] text-muted">{catatan}</p>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import TabelSkeleton from '../components/TabelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { LockIcon, WalletIcon, InfoIcon } from '../components/icons'
import { namaKota } from '../data/categories'
import { rupiahBulat } from '../lib/format'
import { get, kirim } from '../lib/api'

/** Pusat Escrow — antrean pencairan dana lintas vendor.
 *
 *  Yang ditampilkan di sini adalah BUKU BESAR INTERNAL, bukan transfer bank.
 *  Midtrans cuma mengantar uang ke akun merchant platform; meneruskannya ke
 *  vendor butuh produk lain yang tidak dipakai proyek ini. Jadi "Cairkan"
 *  berarti: catat disetujui, transfernya dilakukan manual di luar sistem.
 *
 *  Karena itu bagian mockup yang berhubungan dengan bank (Host-to-Host,
 *  kliring BI-FAST, hash SHA-256) dan sengketa/arbitrase tidak dibuat —
 *  tidak ada datanya, dan menampilkannya berarti berbohong di depan juri. */

type Payout = {
  payout_id: string
  amount: string
  status: 'pending' | 'paid' | 'rejected'
  note: string | null
  requested_at: string
  decided_at: string | null
  vendor_id: string
  business_name: string
  city: string | null
  is_verified: boolean
  owner_name: string
  owner_email: string
  decided_by_name: string | null
}

type Escrow = {
  tertahan: number
  dirilis_kotor: number
  biaya_platform: number
  platform_fee_rate: number
  pesanan_tertahan: number
  antrean_pencairan: number
  jumlah_antrean: number
  sudah_dicairkan: number
}

const tabs = [
  { id: 'pending', label: 'Menunggu Persetujuan' },
  { id: 'paid', label: 'Sudah Dicairkan' },
  { id: 'rejected', label: 'Ditolak' },
  { id: 'all', label: 'Semua' },
] as const

const tanggal = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

export default function AdminEscrowPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('pending')
  const [daftar, setDaftar] = useState<Payout[]>([])
  const [escrow, setEscrow] = useState<Escrow | null>(null)
  const [catatan, setCatatan] = useState<Record<string, string>>({})
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState('')

  const muat = useCallback(async () => {
    setMemuat(true)
    setGalat('')
    try {
      const [p, e] = await Promise.all([
        get<{ data: Payout[] }>(`/admin/payouts?status=${tab}`),
        get<{ escrow: Escrow }>('/admin/escrow'),
      ])
      setDaftar(p.data)
      setEscrow(e.escrow)
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setMemuat(false)
    }
  }, [tab])

  useEffect(() => { muat() }, [muat])

  async function putuskan(po: Payout, action: 'approve' | 'reject') {
    const note = catatan[po.payout_id]?.trim()
    if (action === 'reject' && !note) {
      setGalat('Alasan penolakan wajib diisi — vendor membacanya di halaman keuangannya.')
      return
    }

    setSibuk(po.payout_id)
    setGalat('')
    try {
      await kirim(`/admin/payouts/${po.payout_id}`, 'PATCH', { action, note: note || undefined })
      setCatatan((c) => ({ ...c, [po.payout_id]: '' }))
      await muat()
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setSibuk('')
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<TabelSkeleton kolom={5} baris={7} label="Memuat escrow…" />}>
      {() => (
        <>
          <h1 className="font-display text-[32px] font-semibold text-navy-900">
            Pusat Rekening Bersama &amp; Pencairan
          </h1>
          <p className="mt-2 max-w-[720px] text-[14px] leading-relaxed text-muted">
            Dana pemesanan ditahan sampai tanggal acara terlampaui, lalu masuk saldo vendor dikurangi
            biaya platform {escrow ? escrow.platform_fee_rate * 100 : 2.5}%. Pencairan di bawah ini
            adalah persetujuan pembukuan — transfer ke rekening vendor dilakukan manual.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kartu
              ikon={<LockIcon className="h-5 w-5 text-amber" />}
              label="Tertahan di Escrow"
              nilai={escrow ? rupiahBulat(escrow.tertahan) : '—'}
              catatan={escrow ? `${escrow.pesanan_tertahan} pemesanan aktif` : ''}
            />
            <Kartu
              ikon={<WalletIcon className="h-5 w-5 text-amber" />}
              label="Antrean Pencairan"
              nilai={escrow ? rupiahBulat(escrow.antrean_pencairan) : '—'}
              catatan={escrow ? `${escrow.jumlah_antrean} pengajuan menunggu` : ''}
            />
            <Kartu
              ikon={<WalletIcon className="h-5 w-5 text-amber" />}
              label="Sudah Dicairkan"
              nilai={escrow ? rupiahBulat(escrow.sudah_dicairkan) : '—'}
              catatan="Disetujui admin"
            />
            <Kartu
              ikon={<InfoIcon className="h-5 w-5 text-amber" />}
              label="Pendapatan Platform"
              nilai={escrow ? rupiahBulat(escrow.biaya_platform) : '—'}
              catatan={escrow ? `${escrow.platform_fee_rate * 100}% dari dana yang dirilis` : ''}
            />
          </div>

          {galat && (
            <p role="alert" className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
              {galat}
            </p>
          )}

          <section className="mt-7 rounded-lg border border-line bg-white">
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
              <p className="p-8 text-[14px] text-muted">
                Belum ada pengajuan pencairan di kategori ini.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {daftar.map((po) => (
                  <li key={po.payout_id} className="p-5 md:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy-900">
                          {po.business_name}
                          {!po.is_verified && (
                            <span className="ml-2 rounded-full bg-maroon/10 px-2 py-0.5 text-[11px] font-semibold text-maroon">
                              belum terverifikasi
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-[12px] text-muted">
                          {po.owner_name} · {po.owner_email} · {namaKota(po.city)}
                        </p>
                        <p className="mt-1 text-[12px] text-muted">
                          Diajukan {tanggal(po.requested_at)}
                          {po.decided_at && ` · diputuskan ${tanggal(po.decided_at)}`}
                          {po.decided_by_name && ` oleh ${po.decided_by_name}`}
                        </p>
                        {po.note && (
                          <p className="mt-2 max-w-[560px] rounded border border-line bg-cream px-3 py-2 text-[12px] text-ink/75">
                            {po.note}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="font-display text-[24px] font-semibold text-navy-900">
                          {rupiahBulat(Number(po.amount))}
                        </p>
                        <span
                          className={`mt-1 inline-block rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ${
                            po.status === 'paid'
                              ? 'bg-[#2e6b52]/10 text-[#2e6b52]'
                              : po.status === 'rejected'
                                ? 'bg-maroon/10 text-maroon'
                                : 'bg-amber/20 text-navy-900'
                          }`}
                        >
                          {po.status === 'paid' ? 'dicairkan' : po.status === 'rejected' ? 'ditolak' : 'menunggu'}
                        </span>
                      </div>
                    </div>

                    {po.status === 'pending' && (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <input
                          value={catatan[po.payout_id] ?? ''}
                          onChange={(e) =>
                            setCatatan((c) => ({ ...c, [po.payout_id]: e.target.value }))
                          }
                          placeholder="Catatan (wajib kalau menolak)"
                          className="h-10 min-w-[240px] flex-1 rounded border border-line px-4 text-[13px] outline-none focus:border-navy-900"
                        />
                        <button
                          type="button"
                          disabled={sibuk === po.payout_id}
                          onClick={() => putuskan(po, 'approve')}
                          className="h-10 rounded bg-navy-900 px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {sibuk === po.payout_id ? 'Memproses…' : 'Setujui Pencairan'}
                        </button>
                        <button
                          type="button"
                          disabled={sibuk === po.payout_id}
                          onClick={() => putuskan(po, 'reject')}
                          className="h-10 rounded border border-maroon/40 px-5 text-[13px] font-semibold text-maroon transition-colors hover:bg-maroon/5 disabled:opacity-50"
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <p className="flex gap-3 border-t border-line bg-cream px-6 py-4 text-[12px] leading-relaxed text-muted">
              <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              Menyetujui hanya mencatat pencairan di buku besar Festa Festum. Transfer ke rekening
              vendor dilakukan di luar sistem — gateway tidak pernah meneruskan dana ke vendor.
            </p>
          </section>
        </>
      )}
    </TukarHalus>
  )
}

function Kartu({
  ikon,
  label,
  nilai,
  catatan,
}: {
  ikon: React.ReactNode
  label: string
  nilai: string
  catatan: string
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <p className="flex items-center gap-2 text-[11px] tracking-wide text-muted uppercase">
        {ikon} {label}
      </p>
      <p className="mt-3 font-display text-[26px] leading-none font-semibold text-navy-900">{nilai}</p>
      <p className="mt-2 text-[12px] text-muted">{catatan}</p>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PanelSkeleton from '../components/PanelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { VendorPageHeader, StatusPill } from '../components/VendorLayout'
import {
  ArrowRight, InfoIcon, LockIcon, WalletIcon,
} from '../components/icons'
import { rupiahBulat } from '../lib/format'
import {
  getVendorBalance, listVendorBookings, get, post,
  type ApiBooking, type VendorBalance,
} from '../lib/api'

/** Arus kas vendor: saldo yang bisa ditarik, dana yang masih ditahan escrow,
 *  dan riwayat transaksinya.
 *
 *  Angkanya DITURUNKAN dari tabel payments (GET /bookings/vendor/balance),
 *  bukan disimpan sebagai kolom saldo — kolom saldo gampang melenceng dari
 *  kenyataan kalau ada satu update yang terlewat.
 *
 *  Aturannya: pembayaran sukses masih ESCROW selama acaranya belum lewat;
 *  setelah tanggal acara terlampaui, dana masuk saldo tersedia dikurangi
 *  biaya platform.
 *
 *  Penarikan dana masuk ke tabel payouts sebagai pengajuan berstatus
 *  'pending' dan HARUS disetujui admin. Uang tidak pernah mengalir lewat
 *  gateway ke vendor — transfernya di luar sistem, ini buku besarnya.
 *  Pengajuan yang masih menunggu sudah mengurangi saldo tersedia, supaya
 *  dana yang sama tidak bisa diajukan dua kali.
 */

type Payout = {
  payout_id: string
  amount: string
  status: 'pending' | 'paid' | 'rejected'
  note: string | null
  requested_at: string
  decided_at: string | null
}

const labelPayout = { pending: 'Menunggu Admin', paid: 'Withdrawn', rejected: 'Ditolak' } as const



type Row = {
  id: string
  client: string
  date: string
  amount: number
  status: 'Released' | 'In Escrow' | 'Withdrawn' | 'Menunggu Admin' | 'Ditolak'
}


const tone = {
  Released: 'info', 'In Escrow': 'warn', Withdrawn: 'muted',
  'Menunggu Admin': 'warn', Ditolak: 'danger',
} as const

/** Biaya platform tidak dikenakan pada penarikan dana, hanya pada pemasukan. */
function feeLabel(row: Row) {
  if (row.amount < 0) return '-'
  const fee = `- ${rupiahBulat(Math.round(row.amount * 0.025))}`
  return row.status === 'In Escrow' ? `(Estimasi) ${fee}` : fee
}

export default function VendorKeuanganPage() {
  const [saldo, setSaldo] = useState<VendorBalance | null>(null)
  const [pesanan, setPesanan] = useState<ApiBooking[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  const [formTarik, setFormTarik] = useState(false)
  const [nominal, setNominal] = useState('')
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        getVendorBalance(),
        listVendorBookings(),
        get<{ data: Payout[] }>('/payouts'),
      ])
      setSaldo(a.balance)
      setPesanan(b.data)
      setPayouts(c.data)
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setMemuat(false)
    }
  }, [])

  // muat() tidak pernah memanggil setState secara sinkron: semuanya sesudah
  // await, jadi satu kali muat = satu kali render, bukan render berantai yang
  // dicegah aturan di bawah. Menyalin isi muat() ke dalam efek cuma untuk
  // mendiamkan linter berarti dua salinan logika pengambilan data per halaman.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { muat() }, [muat])

  async function ajukanPenarikan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGalat('')
    setPesan('')
    setSibuk(true)
    try {
      await post('/payouts', { amount: Number(nominal) })
      setNominal('')
      setFormTarik(false)
      setPesan('Pengajuan terkirim. Menunggu persetujuan admin.')
      await muat()
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<PanelSkeleton kartu={3} blok={2} label="Memuat keuangan…" />}>
      {() => {
        if (galat || !saldo) {
          return (
            <p className="mt-8 border border-maroon/30 bg-maroon/5 px-5 py-4 text-[14px] text-maroon">
              {galat || 'Data keuangan tidak tersedia.'}
            </p>
          )
        }

        const balance = {
          available: saldo.saldo_tersedia,
          inEscrow: saldo.escrow,
          escrowOrders: saldo.pesanan_escrow,
        }

        // Riwayat = pembayaran masuk + pengajuan penarikan (nominal negatif),
        // diurutkan bersama supaya arus kasnya terbaca sebagai satu daftar.
        const today = new Date(new Date().toDateString())
        const history: Row[] = pesanan.flatMap((b) =>
          b.payments
            .filter((p) => p.gateway_status === 'success')
            .map((p) => ({
              id: p.payment_id.slice(0, 8).toUpperCase(),
              client: `${b.customer_name} - ${b.service_name}`,
              date: new Date(b.event_date).toLocaleDateString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric',
              }),
              amount: Number(p.amount),
              status: new Date(b.event_date) < today ? 'Released' : 'In Escrow',
            }))
        )

        history.push(
          ...payouts.map((po) => ({
            id: po.payout_id.slice(0, 8).toUpperCase(),
            client: po.note ? `Penarikan dana — ${po.note}` : 'Penarikan dana',
            date: new Date(po.requested_at).toLocaleDateString('id-ID', {
              day: '2-digit', month: 'short', year: 'numeric',
            }),
            // Ditolak tidak mengurangi saldo, jadi ditulis positif supaya tidak
            // terbaca seperti uang yang keluar.
            amount: po.status === 'rejected' ? Number(po.amount) : -Number(po.amount),
            status: labelPayout[po.status] as Row['status'],
          }))
        )

        return (
          <>
            <VendorPageHeader
              title="Keuangan & Payout"
              description="Kelola arus kas, pantau dana yang ditahan di Escrow, dan tarik pendapatan Anda secara aman."
              action={
                <div className="max-w-[250px] rounded-lg border border-amber/70 bg-navy-900 p-4 text-white">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-amber">
                    <LockIcon /> Festa Escrow Protected
                  </p>
                  <p className="mt-1 text-[12px] text-white/75">Dana aman hingga layanan selesai</p>
                </div>
              }
            />

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              <section className="rounded-lg border border-line border-t-4 border-t-amber bg-white p-6">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-ink/80">
                  <WalletIcon className="h-5 w-5 text-amber" /> Saldo Tersedia
                </p>
                <p className="mt-4 font-display text-[38px] leading-tight font-semibold">
                  {rupiahBulat(balance.available)}
                </p>
                <p className="mt-1 text-[13px] text-ink/70">Siap untuk ditarik ke rekening terdaftar.</p>

                <div className="mt-6 border-t border-line pt-5">
                  {!formTarik ? (
                    <button
                      type="button"
                      disabled={!saldo.penarikan_aktif || balance.available <= 0}
                      title={balance.available <= 0 ? 'Belum ada saldo yang bisa ditarik' : undefined}
                      onClick={() => { setFormTarik(true); setPesan('') }}
                      className="rounded-md bg-navy-900 px-5 py-2.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Tarik Dana
                    </button>
                  ) : (
                    <form onSubmit={ajukanPenarikan}>
                      <label htmlFor="nominal" className="block text-[13px] font-semibold">
                        Nominal penarikan
                      </label>
                      <input
                        id="nominal"
                        type="number"
                        min={1}
                        max={balance.available}
                        required
                        autoFocus
                        value={nominal}
                        onChange={(e) => setNominal(e.target.value)}
                        placeholder={String(balance.available)}
                        className="mt-2 h-11 w-full rounded border border-line px-4 text-[14px] outline-none focus:border-navy-900"
                      />
                      <p className="mt-2 text-[12px] text-ink/65">
                        Maksimal {rupiahBulat(balance.available)}. Pengajuan diperiksa admin dulu.
                      </p>
                      <div className="mt-3 flex gap-3">
                        <button
                          type="submit"
                          disabled={sibuk}
                          className="rounded-md bg-navy-900 px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                        >
                          {sibuk ? 'Mengirim…' : 'Ajukan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setFormTarik(false); setGalat('') }}
                          className="text-[13px] font-medium underline underline-offset-4"
                        >
                          Batal
                        </button>
                      </div>
                    </form>
                  )}

                  {pesan && <p className="mt-3 text-[13px] font-semibold text-[#2e6b52]">{pesan}</p>}
                  {galat && (
                    <p role="alert" className="mt-3 text-[13px] text-maroon">
                      {galat}
                    </p>
                  )}
                  {saldo.menunggu_persetujuan > 0 && (
                    <p className="mt-3 text-[12px] text-ink/65">
                      {rupiahBulat(saldo.menunggu_persetujuan)} sedang menunggu persetujuan admin dan sudah
                      dikurangi dari saldo tersedia.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-6">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-ink/80">
                  <LockIcon /> Tertahan di Escrow
                </p>
                <p className="mt-4 font-display text-[30px] font-semibold">{rupiahBulat(balance.inEscrow)}</p>
                {/* Aturannya diambil dari lib/saldo.js, bukan dikarang di sini.
                    Dulu tertulis "setelah klien mengonfirmasi penyelesaian" —
                    mekanisme itu tidak ada di sistem ini, dan salah menjelaskan
                    aturan uang lebih berbahaya daripada tombol yang mati. */}
                <p className="mt-2 text-[13px] text-ink/70">
                  Dana dari {balance.escrowOrders} pemesanan aktif. Dilepas otomatis setelah
                  tanggal acaranya lewat, dipotong biaya platform.
                </p>
                <Link
                  to="/vendor/pemesanan"
                  className="mt-5 flex items-center gap-2 text-[13px] font-semibold"
                >
                  Lihat Detail Pemesanan <ArrowRight className="h-4 w-4" />
                </Link>
              </section>

              <section className="rounded-lg border border-line bg-lavender/25 p-6">
                <span className="inline-block rounded-md bg-white p-2 text-navy-900">
                  <InfoIcon />
                </span>
                <p className="mt-3 text-[13px] font-semibold">Informasi Biaya Platform</p>
                <p className="mt-2 text-[13px] text-ink/75">
                  Biaya layanan platform sebesar <b>{saldo.platform_fee_rate * 100}%</b> dipotong secara otomatis
                  saat dana dipindahkan dari Escrow ke Saldo Tersedia Anda.
                </p>
                {/* Tombol "Baca Kebijakan Payout" dibuang: halamannya tidak
                    ada, dan aturannya sudah tertulis utuh di paragraf atas. */}
                <p className="mt-2 text-[13px] text-ink/75">
                  Penarikan perlu persetujuan admin sebelum dana ditransfer ke rekening Anda.
                </p>
              </section>
            </div>

            <section className="mt-11">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="font-display text-[26px] font-semibold">Riwayat Payout & Escrow</h2>
                {/* Filter & Export PDF dibuang: dua-duanya tidak punya
                    endpoint, dan riwayat payout di sini jumlahnya puluhan,
                    bukan ribuan — menyaringnya belum jadi masalah nyata. */}
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-line bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-[14px]">
                    <thead className="bg-lavender/30 text-[13px] text-ink/70">
                      <tr>
                        <th className="px-6 py-4 font-medium">ID Transaksi / Klien</th>
                        <th className="px-6 py-4 font-medium">Tanggal</th>
                        <th className="px-6 py-4 font-medium">Nominal (Kotor)</th>
                        <th className="px-6 py-4 font-medium">Biaya ({saldo.platform_fee_rate * 100}%)</th>
                        <th className="px-6 py-4 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((r) => (
                        <tr key={r.id} className="border-t border-line">
                          <td className="px-6 py-5">
                            <p className="font-semibold">{r.id}</p>
                            <p className="mt-0.5 text-[13px] text-ink/70">{r.client}</p>
                          </td>
                          <td className="px-6 py-5">{r.date}</td>
                          <td className={`px-6 py-5 ${r.amount < 0 ? 'text-maroon' : ''}`}>
                            {r.amount < 0 ? `- ${rupiahBulat(-r.amount)}` : rupiahBulat(r.amount)}
                          </td>
                          <td className="px-6 py-5 text-ink/75">{feeLabel(r)}</td>
                          <td className="px-6 py-5 text-right">
                            <StatusPill tone={tone[r.status]}>{r.status}</StatusPill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Tanpa "Muat Lebih Banyak": GET /payouts membalas seluruh
                    riwayat sekali jalan, jadi tidak ada yang tersisa untuk
                    dimuat. Tombolnya cuma menjanjikan data yang tidak ada. */}
              </div>
            </section>
          </>
        )
      }}
    </TukarHalus>
  )
}

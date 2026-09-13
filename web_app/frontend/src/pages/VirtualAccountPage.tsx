import { useEffect, useState } from 'react'
import FormSkeleton from '../components/FormSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Img from '../components/Img'
import FlowLayout from '../components/FlowLayout'
import { CopyIcon } from '../components/icons'
import { categories, type CategoryKey } from '../data/categories'
import { cariMetode } from '../data/payments'
import { rupiah } from '../lib/format'
import {
  getPayment, refreshPembayaran, simulasiBayar,
  type ApiPaymentDetail,
} from '../lib/api'

const KATEGORI: Record<string, CategoryKey> = {
  florist: 'florist',
  makeup_artist: 'mua',
  attire_rental: 'attire',
  photographer: 'fotografer',
  event_organizer: 'eo',
}

/** Nomor VA / kode bayar + tombol salin.
 *
 *  `display` dipisah dari `value` karena yang ditampilkan kadang bukan yang
 *  disalin (nominal tampil "Rp 4.500.000", yang disalin angka mentahnya).
 *  `bare` untuk yang sudah duduk di dalam kotak berwarna sendiri. */
function CopyBox({
  value,
  display,
  className = '',
  bare = false,
}: {
  value: string
  display: React.ReactNode
  className?: string
  bare?: boolean
}) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'gagal'>('idle')

  async function salin() {
    try {
      await navigator.clipboard.writeText(value)
      setStatus('ok')
    } catch {
      // Clipboard API butuh secure context (https / localhost) dan bisa
      // ditolak browser. Jangan diam — angkanya masih bisa diblok manual.
      setStatus('gagal')
    }
    setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        bare ? '' : 'rounded-sm border border-line bg-lavender/25 px-4 py-3'
      } ${className}`}
    >
      <span className="font-display text-[22px] font-semibold tracking-wide break-all">
        {display}
      </span>
      <button
        type="button"
        onClick={salin}
        aria-label={`Salin ${value}`}
        className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-navy-900 transition-colors hover:text-amber"
      >
        <CopyIcon />
        {status === 'ok' ? 'TERSALIN' : status === 'gagal' ? 'GAGAL — SALIN MANUAL' : 'SALIN'}
      </button>
    </div>
  )
}

/** Sisa waktu dalam format HH:MM:SS. */
function countdown(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000))
  const parts = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
  return parts.map((n) => String(n).padStart(2, '0')).join(':')
}

export default function VirtualAccountPage() {
  const { paymentId = '' } = useParams()
  const navigate = useNavigate()

  const [payment, setPayment] = useState<ApiPaymentDetail | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [now, setNow] = useState(Date.now)
  const [mengecek, setMengecek] = useState(false)
  const [pesan, setPesan] = useState('')

  useEffect(() => {
    getPayment(paymentId)
      .then((r) => setPayment(r.payment))
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [paymentId])

  // Detik berjalan untuk hitung mundur.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Polling: backend bertanya ke Midtrans setiap 10 detik. Ini yang bikin
  // halaman tetap maju walau webhook tidak sampai (backend masih localhost).
  useEffect(() => {
    if (!payment || payment.gateway_status !== 'pending') return

    const id = setInterval(async () => {
      try {
        const r = await refreshPembayaran(payment.payment_id)
        if (r.payment.gateway_status === 'success') {
          navigate(`/pesanan/selesai/${payment.booking_id}`)
        }
      } catch {
        // Mode simulasi membalas 409 di /refresh — diam saja, tombol
        // "Saya Sudah Bayar" yang jadi jalannya.
      }
    }, 10000)
    return () => clearInterval(id)
  }, [payment, navigate])

  async function sudahBayar() {
    if (!payment) return
    setMengecek(true)
    setPesan('')
    try {
      const r = await refreshPembayaran(payment.payment_id)
      if (r.payment.gateway_status === 'success') {
        navigate(`/pesanan/selesai/${payment.booking_id}`)
        return
      }
      setPesan('Pembayaran belum masuk. Coba lagi beberapa saat setelah transfer.')
    } catch {
      // Midtrans tidak aktif -> mode simulasi. Tandai lunas lokal supaya alur
      // demo tetap bisa jalan tanpa gateway sama sekali.
      try {
        await simulasiBayar(payment.payment_id)
        navigate(`/pesanan/selesai/${payment.booking_id}`)
      } catch (e2) {
        setPesan((e2 as Error).message)
      }
    } finally {
      setMengecek(false)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<FormSkeleton baris={3} label="Memuat tagihan…" />}>
      {() => {
        if (!payment) {
          return (
            <p className="mx-auto max-w-[1330px] px-6 py-20 text-[15px]">
              {galat || 'Tagihan tidak ditemukan.'}
            </p>
          )
        }

        const kat = categories[KATEGORI[payment.category] ?? 'eo']
        const metode = cariMetode(payment.method)
        const nominal = Number(payment.amount)
        const d = payment.details

        // Batas waktu datang dari kolom expires_at di DB, BUKAN dihitung di browser.
        // Kalau user refresh atau ganti perangkat, angkanya tetap sama.
        const deadline = payment.expires_at ? new Date(payment.expires_at).getTime() : null

        return (
          <FlowLayout>
            <div className="grid gap-8 lg:grid-cols-[1fr_430px]">
              <div className="space-y-7">
                <section className="rounded-sm border border-line bg-white p-7">
                  <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                      <h1 className="font-display text-[28px] font-semibold">
                        {payment.gateway_status === 'success' ? 'Pembayaran Diterima' : 'Menunggu Pembayaran'}
                      </h1>
                      <p className="mt-2 max-w-[380px] text-[14px] leading-relaxed text-ink/75">
                        {payment.payment_type === 'settlement'
                          ? 'Ini tagihan pelunasan. Selesaikan sebelum waktu habis.'
                          : 'Selesaikan pembayaran DP Anda sebelum waktu habis agar slot tidak dilepas.'}
                      </p>
                    </div>

                    {deadline && payment.gateway_status === 'pending' && (
                      <div className="rounded-sm border border-amber bg-amber/10 px-6 py-3 text-center">
                        <p className="text-[11px] font-semibold tracking-[0.08em] text-amber">BATAS WAKTU</p>
                        <p className="mt-1 font-display text-[26px] font-semibold text-amber">
                          {countdown(deadline - now)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-7 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.06em]">METODE PEMBAYARAN</p>
                      <div className="mt-3 flex items-center gap-4">
                        <span className="rounded-sm bg-lavender/40 px-4 py-2.5 text-[14px] font-bold text-navy-900">
                          {(d.bank ?? d.store ?? payment.method.split('_')[0]).toUpperCase()}
                        </span>
                        <span className="text-[15px]">{metode?.label ?? payment.method}</span>
                      </div>
                    </div>

                    {/* Tiap metode memberi hal yang berbeda: VA nomor, gerai kode,
                        Mandiri bill_key + biller_code, QRIS gambar QR. */}
                    <div>
                      {d.va_number && (
                        <>
                          <p className="text-[11px] font-semibold tracking-[0.06em]">NOMOR VIRTUAL ACCOUNT</p>
                          <CopyBox className="mt-3" value={d.va_number} display={d.va_number} />
                        </>
                      )}
                      {d.payment_code && (
                        <>
                          <p className="text-[11px] font-semibold tracking-[0.06em]">KODE PEMBAYARAN</p>
                          <CopyBox className="mt-3" value={d.payment_code} display={d.payment_code} />
                        </>
                      )}
                      {d.bill_key && (
                        <>
                          <p className="text-[11px] font-semibold tracking-[0.06em]">KODE PERUSAHAAN</p>
                          <CopyBox className="mt-2" value={d.biller_code ?? ''} display={d.biller_code ?? '-'} />
                          <p className="mt-3 text-[11px] font-semibold tracking-[0.06em]">KODE BAYAR</p>
                          <CopyBox className="mt-2" value={d.bill_key} display={d.bill_key} />
                        </>
                      )}
                    </div>
                  </div>

                  {d.qr_url && (
                    <div className="mt-6 flex flex-col items-center rounded-sm bg-lavender/25 p-6">
                      <p className="text-[11px] font-semibold tracking-[0.06em] text-ink/70">
                        PINDAI KODE QR
                      </p>
                      <img
                        src={d.qr_url}
                        alt="Kode QR pembayaran"
                        className="mt-4 h-[220px] w-[220px] bg-white object-contain p-2"
                      />
                      {d.deeplink && (
                        <a
                          href={d.deeplink}
                          className="mt-4 text-[13px] font-semibold text-amber hover:underline"
                        >
                          Buka aplikasi pembayaran
                        </a>
                      )}
                    </div>
                  )}

                  <div className="mt-6 rounded-sm bg-lavender/25 p-6">
                    <p className="text-[11px] font-semibold tracking-[0.06em] text-ink/70">
                      {payment.payment_type === 'settlement' ? 'TAGIHAN PELUNASAN' : 'TAGIHAN DP'}
                    </p>
                    <CopyBox
                      className="mt-2"
                      bare
                      value={String(nominal)}
                      display={<span className="font-display text-[30px] font-semibold">{rupiah(nominal)}</span>}
                    />
                  </div>
                </section>

                {/* Accordion pakai <details> bawaan browser — tidak perlu state. */}
                {metode && (
                  <section className="rounded-sm border border-line bg-white p-7">
                    <h2 className="font-display text-[21px] font-semibold">Instruksi Pembayaran</h2>

                    <div className="mt-5 space-y-3">
                      <details
                        open
                        className="rounded-sm border border-line [&_summary::-webkit-details-marker]:hidden"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px]">
                          Cara bayar lewat {metode.label}
                          <span className="text-ink/50">▾</span>
                        </summary>
                        <ol className="list-decimal space-y-2.5 border-t border-line px-8 py-4 text-[14px] leading-relaxed text-ink/80">
                          {metode.petunjuk.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ol>
                      </details>
                    </div>
                  </section>
                )}
              </div>

              <aside className="h-fit space-y-7 lg:sticky lg:top-8">
                <div className="rounded-sm border border-line bg-white p-6">
                  <button
                    type="button"
                    onClick={sudahBayar}
                    disabled={mengecek}
                    className="flex h-12 w-full items-center justify-center rounded-sm bg-ink text-[16px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {mengecek ? 'Mengecek pembayaran…' : 'Saya Sudah Bayar'}
                  </button>
                  <Link
                    to="/pesanan"
                    className="mt-3 flex h-12 w-full items-center justify-center rounded-sm border border-ink text-[16px] transition-colors hover:bg-lavender/30"
                  >
                    Lihat Status Pesanan
                  </Link>

                  {pesan && (
                    <p className="mt-4 border border-amber/40 bg-amber/10 px-3 py-2 text-[13px] text-ink/80">
                      {pesan}
                    </p>
                  )}

                  <p className="mt-4 text-center text-[13px] leading-relaxed text-muted">
                    Status dicek otomatis setiap 10 detik.
                  </p>
                </div>

                <div className="rounded-sm border border-line bg-white p-6">
                  <h2 className="border-b border-line pb-4 font-display text-[21px] font-semibold">
                    Ringkasan Pesanan
                  </h2>

                  <div className="flex gap-4 pt-5">
                    <Img
                      alt={payment.business_name}
                      emoji={kat.emoji}
                      tint={kat.tint}
                      className="h-[90px] w-[90px] shrink-0 object-cover"
                    />
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.06em] text-amber">
                        {kat.label.toUpperCase()}
                      </p>
                      <h3 className="mt-1 font-display text-[21px] font-semibold">
                        {payment.business_name}
                      </h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-ink/80">
                        {new Date(payment.event_date).toLocaleDateString('id-ID', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}{' '}
                        – {payment.service_name}
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </FlowLayout>
        )
      }}
    </TukarHalus>
  )
}


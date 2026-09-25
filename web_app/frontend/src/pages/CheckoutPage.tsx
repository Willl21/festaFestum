import { useEffect, useState } from 'react'
import FormSkeleton from '../components/FormSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Img from '../components/Img'
import FlowLayout from '../components/FlowLayout'
import { LockIcon, ShieldIcon } from '../components/icons'
import { categories, namaKota, type CategoryKey } from '../data/categories'
import { grupMetode, metodeBayar } from '../data/payments'
import { rupiah } from '../lib/format'
import { getBooking, bayarBooking, urlFotoLayanan, type ApiBooking } from '../lib/api'
import { rentangJam } from '../lib/durasi'

/** Enum vendor_category dari backend -> kunci kategori di frontend. */
const KATEGORI: Record<string, CategoryKey> = {
  florist: 'florist',
  makeup_artist: 'mua',
  attire_rental: 'attire',
  photographer: 'fotografer',
  event_organizer: 'eo',
}

export default function CheckoutPage() {
  const { bookingId = '' } = useParams()
  const navigate = useNavigate()

  const [booking, setBooking] = useState<ApiBooking | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [metode, setMetode] = useState('bca_va')
  const [membayar, setMembayar] = useState(false)

  useEffect(() => {
    getBooking(bookingId)
      .then((r) => setBooking(r.booking))
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [bookingId])

  async function bayar() {
    if (!booking) return
    setGalat('')
    setMembayar(true)
    try {
      // Nominal TIDAK dikirim dari sini — backend yang menghitung dp_amount
      // dari harga layanan. Kalau browser boleh menentukan nominal, user bisa
      // membayar seribu rupiah untuk pesanan sepuluh juta.
      const r = await bayarBooking({
        booking_id: booking.booking_id,
        payment_type: booking.payment_status === 'dp_paid' ? 'settlement' : 'down_payment',
        method: metode,
      })
      navigate(`/pembayaran/${r.payment.payment_id}`)
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setMembayar(false)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<FormSkeleton label="Memuat pesanan…" />}>
      {() => {
        if (!booking) {
          return (
            <p className="mx-auto max-w-[1330px] px-6 py-20 text-[15px]">
              {galat || 'Pesanan tidak ditemukan.'}
            </p>
          )
        }

        // Checkout dialamatkan lewat booking_id di URL, jadi halaman ini bisa
        // dibuka langsung — termasuk untuk pesanan yang vendornya belum
        // menjawab. Backend sudah menolak charge-nya; ini supaya orangnya
        // dapat penjelasan, bukan error 409 dari tombol Bayar.
        if (booking.confirm_status !== 'diterima') {
          const ditolak = booking.confirm_status === 'ditolak'
          return (
            <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
              <h1 className="font-display text-[28px] font-semibold">
                {ditolak ? 'Pesanan ini ditolak vendor' : 'Menunggu konfirmasi vendor'}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
                {ditolak
                  ? booking.confirm_note
                    || 'Vendor tidak bisa menerima pesanan ini. Slotnya sudah dilepas kembali.'
                  : 'Pembayaran dibuka setelah vendor menerima pesanan Anda. Slot acara tetap ditahan selama menunggu.'}
              </p>
              <Link
                to="/pesanan"
                className="mt-7 inline-flex h-11 items-center rounded bg-navy-900 px-8 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
              >
                Lihat Pesanan Saya
              </Link>
            </div>
          )
        }

        const kat = categories[KATEGORI[booking.category] ?? 'eo']
        const harga = Number(booking.total_price)
        const dp = Number(booking.dp_amount)
        const pelunasan = booking.payment_status === 'dp_paid'
        const tagihan = pelunasan ? harga - dp : dp

        return (
          <FlowLayout title={pelunasan ? 'Selesaikan Pelunasan' : 'Selesaikan Pesanan Anda'}>
            <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_460px]">
              <div className="space-y-7">
                <section className="rounded-sm border border-line bg-white">
                  <h2 className="border-b border-line px-7 py-5 font-display text-[21px] font-semibold">
                    Detail Pesanan
                  </h2>

                  <div className="p-7">
                    <div className="flex flex-wrap items-center gap-8">
                      {/* Foto LAYANAN yang dipesan, pola yang sama dengan
                          Pesanan Saya. Dulu <Img> ini tanpa src sama sekali,
                          jadi selamanya kotak polos. Slot kosong dibalas 404
                          dan Img jatuh ke blok polos lewat onError. */}
                      <Img
                        src={urlFotoLayanan(booking.service_id)}
                        alt={booking.service_name}
                        tint={kat.tint}
                        className="h-[170px] w-[170px] object-cover"
                      />
                      <div>
                        <h3 className="font-display text-[27px] font-semibold">{booking.business_name}</h3>
                        <p className="mt-1 text-[15px] text-muted">{booking.service_name}</p>
                        <p className="mt-1 text-[13px] text-muted">{namaKota(booking.city)}</p>
                      </div>
                    </div>

                    <dl className="mt-8 grid gap-6 sm:grid-cols-2">
                      <div>
                        <dt className="text-[14px] text-muted">Tanggal Acara</dt>
                        <dd className="mt-1.5 font-semibold">
                          {new Date(booking.event_date).toLocaleDateString('id-ID', {
                            day: 'numeric', month: 'long', year: 'numeric',
                          })}{' '}
                          · {rentangJam(booking)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[14px] text-muted">Lokasi Acara</dt>
                        {/* Detail lokasi disimpan multi-baris (venue, catatan,
                            estimasi) — baris pertama yang paling relevan di sini. */}
                        <dd className="mt-1.5 whitespace-pre-line font-semibold">
                          {booking.event_location_detail}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <section className="rounded-sm border border-line bg-white p-7">
                  <h2 className="font-display text-[21px] font-semibold">Rincian Biaya</h2>

                  <dl className="mt-6 space-y-4 text-[15px]">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted">Harga Layanan</dt>
                      <dd className="text-[17px] font-semibold">{rupiah(harga)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted">
                        DP ({Math.round((dp / harga) * 100)}%)
                        {pelunasan && ' — sudah dibayar'}
                      </dt>
                      <dd className="text-[17px] font-semibold">{rupiah(dp)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted">Sisa pelunasan</dt>
                      <dd className="text-[17px] font-semibold">{rupiah(harga - dp)}</dd>
                    </div>
                  </dl>

                  <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-line pt-5">
                    <span className="font-display text-[21px] font-semibold">
                      {pelunasan ? 'Tagihan Pelunasan' : 'Dibayar Sekarang (DP)'}
                    </span>
                    <span className="text-[19px] font-semibold">{rupiah(tagihan)}</span>
                  </div>
                </section>
              </div>

              {/* METODE PEMBAYARAN */}
              <aside className="h-fit rounded-sm border border-line bg-white p-6 lg:sticky lg:top-8">
                <h2 className="font-display text-[21px] font-semibold">Metode Pembayaran</h2>

                {grupMetode.map((grup) => (
                  <div key={grup} className="mt-5">
                    <p className="text-[11px] font-semibold tracking-[0.06em] text-muted">
                      {grup.toUpperCase()}
                    </p>
                    <div className="mt-2 space-y-2">
                      {metodeBayar.filter((m) => m.grup === grup).map((m) => (
                        <label
                          key={m.id}
                          className={`block cursor-pointer rounded-sm border px-4 py-3 transition-colors ${
                            metode === m.id ? 'border-ink bg-lavender/25' : 'border-line hover:border-ink/40'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="metode"
                              value={m.id}
                              checked={metode === m.id}
                              onChange={() => setMetode(m.id)}
                              className="h-4 w-4 accent-ink"
                            />
                            <span className="flex-1 text-[14px] font-semibold">{m.label}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {galat && (
                  <p className="mt-5 border border-maroon/30 bg-maroon/5 px-3 py-2 text-[13px] text-maroon">
                    {galat}
                  </p>
                )}

                <button
                  type="button"
                  onClick={bayar}
                  disabled={membayar}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2.5 rounded-sm bg-amber text-[16px] font-medium text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <LockIcon className="h-4 w-4" />
                  {membayar ? 'Menyiapkan tagihan…' : `Bayar ${rupiah(tagihan)}`}
                </button>

                <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-muted">
                  <ShieldIcon className="h-3.5 w-3.5" />
                  Pembayaran diproses secara aman.
                </p>
              </aside>
            </div>
          </FlowLayout>
        )
      }}
    </TukarHalus>
  )
}

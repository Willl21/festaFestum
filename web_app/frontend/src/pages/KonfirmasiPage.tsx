import { useEffect, useState } from 'react'
import FormSkeleton from '../components/FormSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import Img from '../components/Img'
import { CheckCircleIcon } from '../components/icons'
import { categories, type CategoryKey } from '../data/categories'
import { rupiah } from '../lib/format'
import { getBooking, urlFotoLayanan, type ApiBooking } from '../lib/api'
import { rentangJam } from '../lib/durasi'

/** Satu-satunya momen perayaan di aplikasi ini (review animasi 25 Sep):
 *  halaman ini dilihat sekali per pesanan, jadi di sinilah "rasa" boleh
 *  dibelanjakan. Centang memantul pelan, lalu judul & kalimatnya menyusul.
 *  Jedanya 0,1 detik supaya pantulannya jatuh sesudah fade .masuk-halus dari
 *  TukarHalus mulai, bukan tertutup olehnya. Pengguna gerak-minimal cuma
 *  dapat fade-nya — MotionConfig reducedMotion="user" di App.tsx. */
const KURVA_KELUAR = [0.23, 1, 0.32, 1] as const
const naik = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, delay, ease: KURVA_KELUAR },
})

const KATEGORI: Record<string, CategoryKey> = {
  florist: 'florist',
  makeup_artist: 'mua',
  attire_rental: 'attire',
  photographer: 'fotografer',
  event_organizer: 'eo',
}

/** Titik-titik status: hijau = selesai, amber = sedang berjalan, abu = belum. */
const steps = [
  { title: 'Pembayaran Diverifikasi', desc: 'Pembayaran telah kami terima dan masuk ke escrow.', state: 'done' },
  { title: 'Konfirmasi Vendor', desc: 'Vendor sedang meninjau detail acara Anda.', state: 'current' },
  { title: 'Sesi Konsultasi', desc: 'Jadwalkan pertemuan dengan vendor.', state: 'next' },
  { title: 'Pelaksanaan Acara', desc: 'Hari besar yang direncanakan tiba.', state: 'next' },
] as const

const dotClass = {
  done: 'bg-[#16a34a]',
  current: 'bg-amber',
  next: 'bg-lavender',
}

export default function KonfirmasiPage() {
  const { bookingId = '' } = useParams()
  const [booking, setBooking] = useState<ApiBooking | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    getBooking(bookingId)
      .then((r) => setBooking(r.booking))
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [bookingId])

  return (
    <TukarHalus memuat={memuat} rangka={<FormSkeleton baris={3} label="Memuat konfirmasi…" />}>
      {() => {
        if (!booking) {
          return (
            <p className="min-h-screen bg-cream px-6 py-20 text-center text-[15px]">
              {galat || 'Pesanan tidak ditemukan.'}
            </p>
          )
        }

        const kat = categories[KATEGORI[booking.category] ?? 'eo']
        const dibayar = booking.payments
          .filter((p) => p.gateway_status === 'success')
          .reduce((t, p) => t + Number(p.amount), 0)

        return (
          <div className="min-h-screen bg-cream px-6 py-16 md:px-12">
            <div className="mx-auto max-w-[1030px]">
              <div className="text-center">
                <span className="inline-flex h-[76px] w-[76px] items-center justify-center rounded-xl bg-lavender/60">
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', duration: 0.5, bounce: 0.25, delay: 0.1 }}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[#16a34a] text-white"
                  >
                    <CheckCircleIcon className="h-6 w-6" />
                  </motion.span>
                </span>

                <motion.h1 {...naik(0.16)} className="mt-8 font-display text-[30px] md:text-[42px] font-semibold">Pemesanan Berhasil!</motion.h1>
                <motion.p {...naik(0.22)} className="mx-auto mt-4 max-w-[460px] text-[15px] leading-relaxed text-ink/75">
                  Terima kasih telah mempercayakan perayaan Anda kepada Festa Festum. Pemesanan Anda telah
                  diamankan.
                </motion.p>
              </div>

              <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_420px]">
                <section className="border border-line bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-5">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.06em] text-ink/70">ID PESANAN</p>
                      <p className="mt-1 font-display text-[24px] font-semibold">{`#${booking.booking_id.slice(0, 8).toUpperCase()}`}</p>
                    </div>
                    {/* Mengarah ke invoice; unduhannya lewat dialog cetak browser
                        ("Simpan sebagai PDF"), jadi tidak perlu berkas dari backend. */}
                    <Link
                      to={`/invoice/${bookingId}`}
                      className="rounded-sm bg-[#efe2fb] px-5 py-2.5 text-[14px] text-[#5b2a86] transition-opacity hover:opacity-90"
                    >
                      Unduh Tanda Bukti
                    </Link>
                  </div>

                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-7">
                      {/* Foto LAYANAN yang dipesan, pola yang sama dengan
                          Pesanan Saya. Dulu <Img> ini tanpa src sama sekali,
                          jadi selamanya kotak polos. Slot kosong dibalas 404
                          dan Img jatuh ke blok polos lewat onError. */}
                      <Img
                        src={urlFotoLayanan(booking.service_id)}
                        alt={booking.service_name}
                        tint={kat.tint}
                        className="h-[130px] w-[130px] object-cover"
                      />
                      <div>
                        <h2 className="font-display text-[26px] font-semibold">{booking.business_name}</h2>
                        <p className="mt-1.5 text-[15px] text-ink/80">{booking.service_name}</p>
                      </div>
                    </div>

                    <dl className="mt-9 flex flex-wrap justify-between gap-6">
                      <div>
                        <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink/70">TANGGAL ACARA</dt>
                        <dd className="mt-2 text-[17px]">{`${new Date(booking.event_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · ${rentangJam(booking)}`}</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink/70">TOTAL DIBAYAR</dt>
                        <dd className="mt-2 font-display text-[22px] font-semibold">
                          {rupiah(dibayar)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <section className="border border-line bg-white p-7">
                  <h2 className="text-center font-display text-[24px] font-semibold">Langkah Selanjutnya</h2>

                  <ol className="mt-7 space-y-6">
                    {steps.map((s, i) => (
                      <li key={s.title} className="relative flex gap-4 pb-1">
                        {/* Garis penghubung, kecuali di langkah terakhir. */}
                        {i < steps.length - 1 && (
                          <span className="absolute top-4 left-[5px] h-full w-px bg-lavender" aria-hidden />
                        )}
                        <span className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[s.state]}`} />
                        <div>
                          <h3 className={`text-[15px] font-semibold ${s.state === 'next' ? 'text-muted' : ''}`}>
                            {s.title}
                          </h3>
                          <p className="mt-1 text-[14px] leading-relaxed text-muted">{s.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <div className="mt-16 flex flex-wrap justify-center gap-4">
                <Link
                  to="/pesanan"
                  className="bg-navy-900 px-7 py-3.5 text-[12px] font-semibold tracking-[0.06em] text-white transition-opacity hover:opacity-90"
                >
                  LIHAT DETAIL PESANAN
                </Link>
                <Link
                  to="/"
                  className="border border-ink px-7 py-3.5 text-[12px] font-semibold tracking-[0.06em] transition-colors hover:bg-white"
                >
                  KEMBALI KE BERANDA
                </Link>
              </div>
            </div>
          </div>
        )
      }}
    </TukarHalus>
  )
}

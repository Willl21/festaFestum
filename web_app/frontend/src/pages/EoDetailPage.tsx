import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Img from '../components/Img'
import BackButton from '../components/BackButton'
import DetailSkeleton from '../components/DetailSkeleton'
import TukarHalus from '../components/TukarHalus'
import { ArrowRight, MailIcon, MapPinIcon, PhoneIcon, StarIcon } from '../components/icons'
import { categories, namaKota } from '../data/categories'
import { rupiah } from '../lib/format'
import { getVendor, getVendorServices, type ApiService, type ApiVendor } from '../lib/api'

const kat = categories.eo

/** Kontak & portofolio belum punya tabelnya di database — hiasan mockup yang
 *  dibiarkan statis. Nomor telepon vendor ada di tabel users tapi sengaja
 *  tidak diekspos lewat API publik. */
const KONTAK = {
  phone: '+62 812 3456 7890',
  email: 'hello@epicureanevents.co',
  office: 'Sudirman Central Business District, Jakarta',
}
const PORTOFOLIO = {
  title: 'Gala & Acara Korporat',
  subtitle: 'Pilihan karya terbaik kami dalam mewujudkan malam yang spektakuler.',
  tag: 'Annual Tech Gala 2023',
  caption: 'Simfoni Cahaya & Inovasi',
}

const eventTypes = ['Gala Dinner', 'Konferensi', 'Perayaan Pribadi']

export default function EoDetailPage() {
  const { id = '' } = useParams()
  const [eventType, setEventType] = useState(eventTypes[0])

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    Promise.all([getVendor(id), getVendorServices(id)])
      .then(([r, s]) => {
        setVendor(r.vendor)
        setLayanan(s.data.filter((x) => x.is_active))
      })
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [id])

  return (
    <TukarHalus memuat={memuat} rangka={<DetailSkeleton label="Memuat detail event organizer…" />}>
      {() => {
        if (galat || !vendor) {
          return (
            <div className="mx-auto max-w-[1330px] px-6 py-20">
              <BackButton fallback={`/${kat.slug}`} />
              <p className="mt-6 text-[15px]">{galat || 'Vendor tidak ditemukan.'}</p>
            </div>
          )
        }

        return (
        <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
          <BackButton fallback={`/${kat.slug}`} />

          {/* HERO: teks kiri, foto kanan dengan panel statistik. */}
          <section className="mt-5 grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h1 className="font-display text-[38px] font-semibold">{vendor.business_name}</h1>
              <span className="mt-3 inline-block rounded-full bg-lavender px-4 py-1.5 text-[13px] text-navy-700">
                {`${kat.label} · ${namaKota(vendor.city)}`}
              </span>
              <p className="mt-6 max-w-[480px] text-[15px] leading-[1.8] text-ink/85">{vendor.description || 'Vendor ini belum menuliskan deskripsi.'}</p>

              <div className="mt-9 flex flex-wrap gap-4">
                <a
                  href="#paket"
                  className="inline-flex items-center gap-3 rounded-sm bg-ink px-5 py-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Pilih Paket
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <a
                  href="#konsultasi"
                  className="inline-flex items-center gap-3 rounded-sm bg-ink px-5 py-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Jadwalkan Konsultasi
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="relative">
              <Img alt={vendor.business_name} emoji={kat.emoji} tint={kat.tint} className="h-[300px] w-full object-cover md:h-[430px]" />

              <div className="absolute right-5 bottom-5 left-5 grid grid-cols-2 gap-4 bg-white/85 px-5 py-3 backdrop-blur">
                <div>
                  <p className="text-[11px] text-muted">Rating Klien</p>
                  <p className="mt-1 flex items-center gap-2 text-[16px] font-semibold">
                    <span className="flex text-star">
                      {Array.from({ length: 5 }, (_, i) => (
                        <StarIcon key={i} className="h-3.5 w-3.5" />
                      ))}
                    </span>
                    {Number(vendor.rating_avg)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted">Acara Sukses</p>
                  <p className="mt-1 font-display text-[19px] font-semibold">{vendor.rating_count > 0 ? `${vendor.rating_count}+` : "-"}</p>
                </div>
              </div>
            </div>
          </section>

          {/* PAKET */}
          <section id="paket" className="mt-16 border-t border-line pt-12">
            <h2 className="font-display text-[26px] font-semibold">Paket Perencanaan</h2>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {layanan.map((p) => (
                <article key={p.service_id} className="flex flex-col border border-line bg-white p-6">
                  <h3 className="font-display text-[24px] font-semibold">{p.service_name}</h3>
                  <p className="mt-3 text-[12px] leading-relaxed text-ink/70">{p.description}</p>

                  <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[12px] leading-relaxed text-ink/85">
                    <li>Pesan minimal {p.minimum_notice_days} hari sebelum acara</li>
                  </ul>

                  <div className="mt-auto border-t border-line pt-4">
                    <p className="mt-4 text-[12px] text-muted">Mulai dari</p>
                    <p className="font-display text-[24px] font-semibold">{rupiah(Number(p.price))}</p>
                    {/* Tanggal & shift dipilih di halaman pesan — mockup EO tidak
                        punya kalender di sini, jadi yang dibawa cuma paketnya. */}
                    <Link
                      to={`pesan?service=${p.service_id}`}
                      className="mt-3 inline-block rounded-sm border border-line px-4 py-1.5 text-[12px] transition-colors hover:border-navy-900 hover:text-navy-900"
                    >
                      Pesan Sekarang
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* PORTOFOLIO */}
          <section className="mt-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[26px] font-semibold">{PORTOFOLIO.title}</h2>
                <p className="mt-1 text-[13px] text-ink/70">{PORTOFOLIO.subtitle}</p>
              </div>
              <button type="button" className="flex items-center gap-2 text-[12px] font-semibold">
                Lihat Semua Portofolio
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="relative md:col-span-2">
                <Img
                  alt={PORTOFOLIO.title}
                  emoji={kat.emoji}
                  tint={kat.tint}
                  className="h-[320px] w-full object-cover md:h-[620px]"
                />
                <div className="absolute bottom-5 left-5">
                  <span className="bg-black/45 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
                    {PORTOFOLIO.tag}
                  </span>
                  <p className="mt-2 font-display text-[20px] font-semibold text-white">
                    {PORTOFOLIO.caption}
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                {[1, 2].map((n) => (
                  <Img
                    key={n}
                    alt={`Portofolio ${n}`}
                    emoji={kat.emoji}
                    tint={kat.tint}
                    className="h-[200px] w-full object-cover md:h-[304px]"
                  />
                ))}
              </div>
            </div>
          </section>

          {/* KONSULTASI */}
          <section id="konsultasi" className="mt-16 grid gap-10 rounded-sm bg-lavender/50 p-8 md:p-12 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-[26px] font-semibold">Mulai Rencanakan Acara Anda</h2>
              <p className="mt-3 max-w-[400px] text-[13px] leading-relaxed text-ink/75">
                Jadwalkan konsultasi awal gratis dengan tim ahli kami. Ceritakan visi Anda, dan mari kita
                wujudkan bersama.
              </p>

              <ul className="mt-8 space-y-5 text-[13px]">
                <ContactRow icon={<PhoneIcon />} label="Telepon" value={KONTAK.phone} />
                <ContactRow icon={<MailIcon />} label="Email" value={KONTAK.email} />
                <ContactRow icon={<MapPinIcon className="h-4 w-4" />} label="Kantor Pusat" value={KONTAK.office} />
              </ul>
            </div>

            {/* Form konsultasi belum ada endpoint-nya di backend. */}
            <form className="bg-white p-6" onSubmit={(e) => e.preventDefault()}>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="nama" label="Nama Lengkap" placeholder="Masukkan nama Anda" />
                <TextField id="perusahaan" label="Perusahaan (Opsional)" placeholder="Nama perusahaan" />
              </div>
              <div className="mt-4">
                <TextField id="email" label="Email" placeholder="email@contoh.com" type="email" />
              </div>

              <p className="mt-5 text-[11px] font-semibold">Jenis Acara</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {eventTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEventType(t)}
                    aria-pressed={eventType === t}
                    className={`rounded-sm border px-3 py-1.5 text-[11px] transition-colors ${
                      eventType === t
                        ? 'border-navy-900 bg-navy-900 text-white'
                        : 'border-line bg-white hover:border-navy-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <label htmlFor="pesan" className="mt-5 block text-[11px] font-semibold">
                Pesan Singkat
              </label>
              <textarea
                id="pesan"
                rows={3}
                placeholder="Ceritakan sedikit tentang rencana acara Anda..."
                className="mt-2 w-full border-b border-line bg-transparent pb-2 text-[13px] outline-none placeholder:text-ink/35 focus:border-navy-900"
              />

              <button
                type="submit"
                className="mt-6 h-11 w-full rounded-sm bg-navy-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Kirim Permintaan Konsultasi
              </button>
              <p className="mt-3 text-center text-[10px] text-muted">
                Informasi Anda aman dan dilindungi oleh Kebijakan Privasi kami.
              </p>
            </form>
          </section>
        </div>
        )
      }}
    </TukarHalus>
  )
}

function ContactRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-navy-900">
        {icon}
      </span>
      <span>
        <span className="block text-[11px] text-muted">{label}</span>
        <span className="font-semibold">{value}</span>
      </span>
    </li>
  )
}

function TextField({
  id,
  label,
  placeholder,
  type = 'text',
}: {
  id: string
  label: string
  placeholder: string
  type?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        className="mt-1.5 w-full border-b border-line bg-transparent pb-1.5 text-[13px] outline-none placeholder:text-ink/35 focus:border-navy-900"
      />
    </div>
  )
}

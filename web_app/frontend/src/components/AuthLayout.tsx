import { Link } from 'react-router-dom'
import Img from './Img'
import { ArrowRight } from './icons'

/** Kelas input dipakai bersama halaman masuk & daftar — bingkainya sama,
 *  yang beda cuma gaya labelnya. */
export const inputClass =
  'h-11 w-full rounded border border-line bg-white px-4 text-[14px] text-ink outline-none placeholder:text-ink/35 focus:border-navy-900'

type Props = {
  /** Foto panel kiri. Kalau file belum ada, Img menampilkan blok netral. */
  image: string
  imageAlt: string
  body: string
  panelClass?: string
  /** Lebar isi panel kanan. Dilebarkan oleh halaman yang form-nya dua kolom
   *  (daftar vendor) — 360px cuma muat satu kolom. Ditulis sebagai kelas
   *  utuh, bukan angka, supaya Tailwind ikut memindainya. */
  isiClass?: string
  children: React.ReactNode
}

/** Kartu auth di tengah layar: foto + kutipan di kiri, form di kanan.
 *  Di layar kecil fotonya disembunyikan supaya form dapat seluruh kartu. */
export default function AuthLayout({
  image,
  imageAlt,
  body,
  panelClass = 'bg-white',
  isiClass = 'max-w-[360px]',
  children,
}: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-lavender/50 px-4 py-10">
      <div className="mb-4 w-full max-w-[940px]">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[14px] text-navy-900/80 transition-colors hover:text-navy-900"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          Kembali ke Beranda
        </Link>
      </div>

      <div className="flex w-full max-w-[940px] overflow-hidden rounded-lg shadow-[0_10px_40px_rgba(13,27,62,0.12)]">
        <div className="relative hidden w-[46%] shrink-0 md:block">
          <Img src={image} alt={imageAlt} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

          <div className="absolute bottom-10 left-0 w-full px-9 text-white">
            <h2 className="font-display text-[34px] leading-none font-semibold">Orchestrate Elegance.</h2>
            <p className="mt-4 text-[14px] leading-[1.6] text-white/85">{body}</p>
          </div>
        </div>

        <div className={`flex flex-1 flex-col justify-center px-8 py-11 sm:px-11 ${panelClass}`}>
          <div className={`mx-auto w-full ${isiClass}`}>{children}</div>
        </div>
      </div>
    </div>
  )
}

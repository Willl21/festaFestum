import { Link } from 'react-router-dom'

/** Kartu grid dengan efek hover-reveal: yang ditunjuk menonjol, sisanya
 *  meredup dan sedikit blur.
 *
 *  Aslinya dari 21st.dev dan memakai `cn()` dari shadcn plus token tema
 *  shadcn (`ring-ring`, `ring-offset-background`). Dua-duanya TIDAK ada di
 *  proyek ini — tidak ada alias `@/`, tidak ada shadcn, dan tidak ada
 *  clsx/tailwind-merge. Yang dibutuhkan `cn()` di sini cuma menggabungkan
 *  string kelas, jadi dipakai template literal biasa seperti komponen lain
 *  di proyek ini; menambah dua dependensi untuk itu tidak sepadan
 *  (lihat npm-supply-chain-policy). Token warnanya diganti punya kita
 *  (navy-900/amber dari index.css).
 *
 *  `to` bikin kartunya jadi <Link>. Tanpa itu dia div biasa yang tetap bisa
 *  difokus keyboard — versi 21st.dev memakai tabIndex pada div, yang bisa
 *  difokus tapi tidak bisa "ditekan"; kalau kartunya menuju ke suatu tempat,
 *  <Link> memberi Enter, klik tengah, dan menu konteks secara gratis. */
export interface CardItem {
  id: string | number
  title: string
  subtitle: string
  imageUrl: string
  /** Tujuan navigasi. Kosong = kartunya bukan tautan. */
  to?: string
}

export interface HoverRevealCardsProps {
  items: CardItem[]
  className?: string
  cardClassName?: string
}

const KARTU = [
  'relative h-80 overflow-hidden rounded-xl bg-cover bg-center shadow-lg transition-all duration-500 ease-in-out',
  // Saat induknya disentuh, SEMUA kartu meredup...
  'group-hover:scale-[0.97] group-hover:opacity-60 group-hover:blur-[2px]',
  // ...lalu yang benar-benar ditunjuk menimpanya kembali.
  'hover:!scale-105 hover:!opacity-100 hover:!blur-none',
  'focus-visible:!scale-105 focus-visible:!opacity-100 focus-visible:!blur-none',
  'focus-visible:ring-navy-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
  // Gerakan dimatikan untuk yang memilih gerakan minimal. Versi aslinya tidak
  // punya ini; skala + blur yang berdenyut tiap kursor lewat termasuk yang
  // paling mengganggu buat orang yang sensitif gerakan.
  'motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-hover:blur-none',
].join(' ')

export default function HoverRevealCards({
  items,
  className = '',
  cardClassName = '',
}: HoverRevealCardsProps) {
  return (
    // `group` di wadahnya yang bikin kartu lain ikut bereaksi saat satu disentuh.
    <ul className={`group grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 ${className}`}>
      {items.map((item) => {
        const isi = (
          <>
            {/* Gradien supaya teks tetap terbaca di atas foto apa pun. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 p-5 text-white">
              <p className="text-[11px] font-light tracking-widest uppercase opacity-80">
                {item.subtitle}
              </p>
              <h3 className="mt-1 font-display text-[20px] font-semibold">{item.title}</h3>
            </div>
          </>
        )
        const kelas = `${KARTU} ${cardClassName}`
        const gaya = { backgroundImage: `url(${item.imageUrl})` }

        return (
          <li key={item.id}>
            {item.to ? (
              <Link to={item.to} className={`block ${kelas}`} style={gaya}>
                {isi}
              </Link>
            ) : (
              <div className={kelas} style={gaya} aria-label={`${item.title}, ${item.subtitle}`}>
                {isi}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

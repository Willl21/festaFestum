import { useEffect, useRef, useState } from 'react'
import Img from './Img'

/** Foto hero yang berganti sendiri, dipakai landing + lima halaman kategori.
 *
 *  Kerangkanya dipusatkan seperti SearchPanel dan AiBanner — bingkainya sama
 *  di enam halaman, yang beda cuma daftar fotonya, dan daftar itu tetap
 *  ditulis inline di tiap halaman. Tanpa ini, logika ganti-foto yang sama
 *  disalin enam kali.
 *
 *  Tanpa dependensi carousel: yang dibutuhkan cuma indeks yang bertambah dan
 *  dua kelas opacity. Slider siap pakai membawa swipe, dot, dan lazy-load
 *  yang tidak satu pun dipakai di sini. */

/** Jeda antar foto. 6 detik: cukup lama untuk dilihat, cukup cepat supaya
 *  orang yang mengisi panel cari di bawahnya sempat melihat lebih dari satu. */
const JEDA_MS = 6000

export default function HeroSlideshow({
  foto,
  alt,
  className = '',
  emoji,
  tint,
}: {
  /** Jalur foto di /public/img, ditulis inline oleh halamannya. */
  foto: string[]
  /** Dipakai foto yang sedang tampil; sisanya dianggap hiasan. */
  alt: string
  className?: string
  emoji?: string
  tint?: string
}) {
  const [aktif, setAktif] = useState(0)
  /** Foto yang tampil sebelumnya. Dia yang duduk DI BAWAH foto baru selama
   *  pergantian — lihat alasannya di komentar z-index di bawah. */
  const [sebelum, setSebelum] = useState(-1)
  /** Foto terjauh yang sudah dipasang ke DOM. Kelimanya ada di dalam layar
   *  sejak awal, jadi `loading="lazy"` TIDAK menahan unduhannya — browser
   *  tetap mengambil semuanya sekaligus. Yang benar-benar menahan cuma tidak
   *  memasang elemennya; di HP itu selisih ~1 MB pada layar pertama. */
  const [sampai, setSampai] = useState(1)

  // Indeksnya dipegang ref, bukan dibaca dari updater setAktif: memanggil
  // setState lain DI DALAM updater bikin updater-nya tidak murni, dan React
  // memang menjalankannya dua kali di StrictMode.
  const urut = useRef(0)

  useEffect(() => {
    if (foto.length < 2) return
    // Gerakan yang berulang tanpa henti dimatikan untuk yang memintanya —
    // sejalan dengan <MotionConfig reducedMotion="user"> di App.tsx, yang
    // tidak menjangkau transisi CSS seperti ini.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const t = setInterval(() => {
      const lama = urut.current
      urut.current = (urut.current + 1) % foto.length
      setSebelum(lama)
      setAktif(urut.current)
      // SATU foto di depan yang sedang tampil sudah dipasang, jadi unduhan
      // dan decode-nya selesai sebelum gilirannya. Tanpa ini, tiap foto baru
      // mulai diunduh TEPAT saat mulai muncul, dan yang terlihat bukan
      // pergantian halus tapi kotak kosong yang terisi separuh jalan.
      setSampai((s) => Math.max(s, urut.current + 1))
    }, JEDA_MS)
    return () => clearInterval(t)
  }, [foto.length])

  return (
    // ponytail: tanpa tombol jeda/lompat. Fotonya murni hiasan — tidak ada
    // keterangan, tautan, atau informasi yang cuma muncul di salah satunya,
    // jadi yang tidak sempat melihat satu foto tidak kehilangan apa pun, dan
    // prefers-reduced-motion sudah mematikannya. Kalau nanti tiap foto
    // membawa teks atau tautan sendiri, kontrolnya WAJIB ditambahkan.
    // `isolate` WAJIB: tanpa itu z-20/z-10 di bawah ikut dihitung di stacking
    // context HALAMAN, bukan di dalam sini — elemen yang posisinya relative
    // tapi z-index-nya auto tidak bikin context sendiri. Akibatnya fotonya
    // naik ke atas overlay gelap, judul hero, dan panel cari di halaman
    // kategori; semuanya hilang di balik foto.
    <div className={`relative isolate ${className}`}>
      {foto.map((f, i) => {
        // Yang menyilang cuma SATU lapis: foto baru muncul DI ATAS foto lama
        // yang tetap penuh. Kalau dua-duanya dianimasikan berlawanan, di
        // tengah jalan keduanya setengah tembus dan latar di belakangnya ikut
        // terbaca — hero-nya berkedip pudar tiap pergantian. Foto lama tidak
        // perlu dipudarkan: begitu yang baru penuh, dia tertutup rapat.
        const dipakai = i === aktif || i === sebelum
        return (
          <Img
            key={f}
            src={i <= sampai ? f : undefined}
            alt={i === aktif ? alt : ''}
            emoji={emoji}
            tint={tint}
            prioritas={i === 0}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-in-out motion-reduce:transition-none ${
              dipakai ? 'opacity-100' : 'opacity-0'
            } ${i === aktif ? 'z-20' : i === sebelum ? 'z-10' : 'z-0'}`}
          />
        )
      })}
    </div>
  )
}

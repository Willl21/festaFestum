import { useCallback, useState } from 'react'
import { motion } from 'motion/react'

/** Satu bagian halaman yang muncul saat masuk layar.
 *
 *  Pakai `whileInView` dari motion — IntersectionObserver-nya diurus library,
 *  termasuk membatalkan animasi kalau elemennya keburu keluar layar.
 *
 *  `once: true` disengaja: bagian yang bergerak lagi tiap kali di-scroll
 *  balik jadi mengganggu saat halaman dibaca ulang, dan saat presentasi
 *  membuat layar terasa gelisah.
 *
 *  PENTING — bagian yang SUDAH terlihat saat halaman dibuka tidak
 *  dianimasikan sama sekali. Dua alasan: (1) isi halaman masuk lewat fade
 *  `.masuk-halus` dari TukarHalus, jadi menganimasikannya lagi di sini
 *  membuat dua gerakan menumpuk di elemen yang sama dan terlihat tersendat;
 *  (2) `whileInView` pada elemen yang sudah di layar bergantung pada pemicu
 *  scroll yang mungkin tidak pernah datang, sehingga bagian itu bisa
 *  tertahan tak muncul. Keduanya terbaca seperti bug.
 *
 *  Pengukurannya lewat ref callback, bukan useEffect: ref callback jalan
 *  saat commit (sebelum paint), jadi tidak ada satu frame pun yang sempat
 *  tergambar dengan keadaan yang salah.
 *
 *  Gerakan dimatikan otomatis untuk pengguna yang memilih gerakan minimal —
 *  diatur sekali lewat <MotionConfig reducedMotion="user"> di App.tsx. */
export default function Reveal({
  children,
  className = '',
  /** Jeda mulai, untuk bagian yang ingin muncul berurutan. */
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  // null = belum diukur.
  const [sudahTerlihat, setSudahTerlihat] = useState<boolean | null>(null)

  const ukur = useCallback(
    (el: HTMLElement | null) => {
      if (!el || sudahTerlihat !== null) return

      // 60% layar, bukan tepi bawah: bagian yang cuma nyembul beberapa
      // piksel di bawah lipatan BUKAN "sudah terlihat" — justru itu bagian
      // pertama yang di-scroll orang, dan mematikan animasinya membuat
      // seluruh halaman terasa tidak punya animasi scroll sama sekali.
      const putuskan = () =>
        setSudahTerlihat(el.getBoundingClientRect().top < window.innerHeight * 0.6)

      // Saat ref callback jalan, elemennya kadang belum ikut tata letak dan
      // getBoundingClientRect() mengembalikan nol semua — kalau dipercaya,
      // SEMUA bagian dianggap sudah terlihat dan animasinya hilang total.
      // Tinggi nol dipakai sebagai tandanya; ukur ulang di frame berikutnya.
      if (el.getBoundingClientRect().height === 0) requestAnimationFrame(putuskan)
      else putuskan()
    },
    [sudahTerlihat]
  )

  if (sudahTerlihat) {
    return <section className={className}>{children}</section>
  }

  return (
    <motion.section
      ref={ukur}
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      // Pemicunya sengaja jauh dari tepi bawah: dengan margin -60px seperti
      // sebelumnya, animasinya jalan di pinggir bawah layar sambil halaman
      // masih bergulir, jadi tidak sempat terlihat. -28% membuatnya mulai
      // saat bagian itu sudah masuk sepertiga bawah layar.
      viewport={{ once: true, amount: 0, margin: '0px 0px -28% 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.section>
  )
}

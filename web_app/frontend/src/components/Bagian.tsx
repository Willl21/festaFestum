import { motion } from 'motion/react'

/** Satu bagian rangka, masuk sesuai gilirannya.
 *
 *  Rangka yang seluruh bagiannya muncul serentak menukar layar dalam satu
 *  frame dan terbaca sebagai kedipan; berurutan membuatnya terbaca sebagai
 *  halaman yang sedang tersusun.
 *
 *  Jeda dibatasi 0.6 detik: kalau data datang cepat, bagian yang masih
 *  mengantre justru muncul SETELAH isi aslinya siap.
 *
 *  Gerakan mengikuti <MotionConfig reducedMotion="user"> di App.tsx. */
export default function Bagian({
  urutan,
  className = '',
  children,
}: {
  urutan: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(urutan * 0.07, 0.6), ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

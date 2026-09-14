import { useEffect, useRef, useState } from 'react'

/** Pergantian rangka → isi asli, tanpa pertukaran mendadak.
 *
 *  Tanpa ini React membuang rangka dan memasang halaman asli di frame yang
 *  SAMA. Kartu boleh punya fade sendiri, tapi hero setinggi 500px, panel
 *  pencarian, dan judul tetap muncul sekaligus dengan opacity penuh — itu
 *  massa visual terbesar di layar, dan itulah yang terbaca "tiba-tiba".
 *
 *  Boleh dipakai berulang: kalau `memuat` menyala lagi, rangkanya dipasang
 *  kembali dan umur minimumnya dihitung ulang dari nol.
 *
 *  Dikerjakan dengan CSS, BUKAN <AnimatePresence>. Sudah dicoba pakai
 *  AnimatePresence dan animasi `exit`-nya tidak pernah selesai, jadi
 *  rangkanya menempel selamanya dan menumpuk dengan isi aslinya —
 *  AnimatePresence bersarang (App.tsx sudah punya satu untuk transisi rute)
 *  ditambah StrictMode. Transisi opacity biasa tidak punya masalah itu dan
 *  kodenya lebih pendek. */
export default function TukarHalus({
  memuat,
  rangka,
  umurMinimum = UMUR_MINIMUM_MS,
  children,
}: {
  memuat: boolean
  rangka: React.ReactNode
  /** Umur minimum rangka. Bawaannya 1 detik untuk animasi masuk halaman;
   *  turunkan untuk rangka yang dipicu tindakan sadar (mis. tombol cari),
   *  karena di situ pengguna sedang menunggu jawaban dan tiap ratus
   *  milidetik tambahan terasa. */
  umurMinimum?: number
  /** Fungsi, BUKAN elemen: JSX anak tetap dibangun walau tidak ditampilkan,
   *  jadi isi halaman yang membaca data (`vendor.business_name`) akan
   *  meledak selagi rangkanya tampil. Dibungkus fungsi, isinya baru
   *  dibangun setelah datanya ada. */
  children: () => React.ReactNode
}) {
  // Rangka bertahan sebentar setelah data datang, supaya sempat pudar dulu.
  const [tampilRangka, setTampilRangka] = useState(memuat)
  const [pudar, setPudar] = useState(false)

  // Kapan rangka mulai tampil, dipakai untuk menahan umur minimumnya.
  // Dicatat di dalam effect, bukan saat render: membaca jam saat render
  // itu tidak murni dan hasilnya bisa berbeda tiap render ulang.
  const mulai = useRef<number | null>(null)

  useEffect(() => {
    // Kembali memuat (mis. pencarian diulang): rangkanya dipasang lagi dan
    // jamnya disetel ulang. Lewat timer, bukan setState langsung di badan
    // effect, supaya tidak memicu render berantai.
    if (memuat) {
      mulai.current = Date.now()
      const pasang = setTimeout(() => {
        setPudar(false)
        setTampilRangka(true)
      }, 0)
      return () => clearTimeout(pasang)
    }

    if (mulai.current === null) mulai.current = Date.now()

    // Kalau datanya datang lebih cepat dari umur minimum, rangkanya ditahan
    // sampai genap. Rangka yang cuma berkedip 80 milidetik lebih mengganggu
    // daripada tidak ada rangka sama sekali — terbaca sebagai layar yang
    // berkelip, bukan sebagai halaman yang sedang tersusun.
    const sisa = Math.max(0, umurMinimum - (Date.now() - mulai.current))

    const mulaiPudar = setTimeout(() => setPudar(true), sisa)
    const copot = setTimeout(() => setTampilRangka(false), sisa + PUDAR_MS)
    return () => {
      clearTimeout(mulaiPudar)
      clearTimeout(copot)
    }
  }, [memuat, umurMinimum])

  if (tampilRangka) {
    return (
      <div
        // Opacity turun ke 0 begitu umur minimumnya genap; CSS yang
        // menganimasikan, timer di atas yang mencopotnya setelah selesai.
        style={{
          opacity: pudar ? 0 : 1,
          transition: `opacity ${PUDAR_MS}ms ease-in`,
        }}
      >
        {rangka}
      </div>
    )
  }

  return <div className="masuk-halus">{children()}</div>
}

/** Umur minimum bawaan, dihitung sejak rangka dipasang. Data yang datang
 *  lebih cepat dari ini tetap menunggu — tujuannya animasi, bukan
 *  pengukuran. Kalau datanya lebih lambat, rangka tampil selama apa pun yang
 *  dibutuhkan. Bisa ditimpa lewat prop `umurMinimum`. */
const UMUR_MINIMUM_MS = 1000

/** Lama rangka memudar. Disamakan dengan timer pencopotannya — kalau timer
 *  lebih cepat, rangka hilang mendadak di tengah pudar. */
const PUDAR_MS = 250

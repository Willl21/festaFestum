import { useEffect, useState } from 'react'

/** Umur kode OTP, harus sama dengan UMUR_MENIT di backend/src/lib/kodeOtp.js. */
export const UMUR_KODE_MS = 10 * 60 * 1000

/** Jam yang berdetak tiap detik selama `jalan`, untuk hitung mundur kode OTP. */
export function useDetik(jalan = true) {
  const [sekarang, setSekarang] = useState(() => Date.now())
  useEffect(() => {
    if (!jalan) return
    const id = setInterval(() => setSekarang(Date.now()), 1000)
    return () => clearInterval(id)
  }, [jalan])
  return sekarang
}

/** Sisa milidetik sampai `berakhir`, dijepit 0..UMUR_KODE_MS. Jepit atas perlu
 *  karena `sekarang` bisa basi sedetik saat jamnya baru mulai berdetak. */
export const sisaKode = (berakhir: number, sekarang: number) =>
  Math.max(0, Math.min(UMUR_KODE_MS, berakhir - sekarang))

/** 534000 -> "8:54" */
export function formatSisa(ms: number) {
  const detik = Math.ceil(ms / 1000)
  return `${Math.floor(detik / 60)}:${String(detik % 60).padStart(2, '0')}`
}

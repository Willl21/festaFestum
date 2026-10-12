import type { ReactNode } from 'react'

/**
 *  Pop-up "yakin?" untuk tombol penting (keluar, hapus, tolak, uang).
 *  Pengganti window.confirm/prompt: tampilannya sama di semua browser & HP.
 *
 *  Pakai dari mana saja, tanpa state di halamannya:
 *    if (!(await konfirmasi({ judul: 'Hapus layanan?', bahaya: true }))) return
 *  Butuh alasan (mis. tolak pesanan):
 *    const alasan = await mintaAlasan({ judul: 'Tolak pesanan?', ... })
 *    if (alasan === null) return
 *
 *  Dialognya sendiri ada di components/Konfirmasi.tsx (KonfirmasiHost),
 *  dipasang sekali di App.tsx.
 */

export type Opsi = {
  judul: string
  isi?: ReactNode
  /** Teks tombol aksi, default "Ya, lanjutkan". */
  ya?: string
  /** Merah untuk aksi merusak/tak bisa dibatalkan; selain itu navy. */
  bahaya?: boolean
  /** Tampilkan kolom alasan. */
  alasan?: { label: string; wajib?: boolean }
}

export type Permintaan = Opsi & { selesai: (hasil: string | null) => void; id: number }

let tampilkan: ((p: Permintaan) => void) | null = null

/** Dipanggil KonfirmasiHost saat terpasang; null saat dilepas. */
export function pasangHost(fn: typeof tampilkan) {
  tampilkan = fn
}
let urut = 0

/** null = dibatalkan, selain itu isi kolom alasan (string kosong kalau tidak diisi). */
export function mintaAlasan(opsi: Opsi): Promise<string | null> {
  return new Promise((selesai) => {
    // Host belum terpasang (mis. di tes): jangan pernah meloloskan aksi diam-diam.
    if (!tampilkan) return selesai(null)
    tampilkan({ ...opsi, selesai, id: ++urut })
  })
}

export async function konfirmasi(opsi: Omit<Opsi, 'alasan'>): Promise<boolean> {
  return (await mintaAlasan(opsi)) !== null
}

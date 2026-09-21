import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { id as localeId } from 'react-day-picker/locale'
import { ChevronDown } from './icons'
import { KELAS_KALENDER, isoLokal } from '../lib/kalender'

/** Kalender polos untuk tanggal yang BUKAN slot pemesanan.
 *
 *  Dipakai jadwal pengambilan dan jadwal fitting di halaman jas & kebaya.
 *  Dua tanggal itu tidak tersimpan di vendor_schedules dan tidak memakan
 *  kuota slot, jadi tidak boleh memakai KalenderSlot: kalender itu akan
 *  mematikan tanggal berdasarkan ketersediaan booking dan menampilkan
 *  pilihan shift untuk hari mengambil baju — dua-duanya keliru.
 *
 *  Tampilannya berbagi tabel kelas yang sama dengan KalenderSlot, jadi
 *  ketiganya terlihat satu keluarga. */
export default function KalenderTanggal({
  tanggal,
  onPilih,
  /** Tanggal paling awal yang boleh dipilih, format YYYY-MM-DD. */
  mulaiDari,
}: {
  tanggal: string
  onPilih: (tanggal: string) => void
  mulaiDari?: string
}) {
  // Bulan yang DIPILIH SENDIRI oleh pengguna lewat panah. Selama dia belum
  // menggeser, bulannya diturunkan dari data — itu yang bikin kalender ini
  // ikut pindah saat `mulaiDari` berubah.
  const [bulanManual, setBulanManual] = useState<Date | null>(null)

  // Tanpa `mulaiDari` di sini, kalender pengambilan terbuka di bulan berjalan
  // sementara seluruh tanggal sahnya ada di bulan berikutnya (sewa jas punya
  // lead time) — gridnya mati semua dan terbaca seperti "tidak ada tanggal
  // yang bisa dipilih". Masalah yang sama pernah diperbaiki di KalenderSlot
  // dengan melompat ke bulan pertama yang bisa dipesan.
  const bulan =
    bulanManual ??
    new Date(`${tanggal || mulaiDari || new Date().toISOString().slice(0, 10)}T00:00:00`)

  return (
    <DayPicker
      mode="single"
      locale={localeId}
      month={bulan}
      onMonthChange={setBulanManual}
      selected={tanggal ? new Date(`${tanggal}T00:00:00`) : undefined}
      disabled={mulaiDari ? (d) => isoLokal(d) < mulaiDari : undefined}
      onSelect={(d) => d && onPilih(isoLokal(d))}
      className="text-[14px]"
      classNames={KELAS_KALENDER}
      components={{
        Chevron: ({ orientation }) => (
          <ChevronDown
            className={`h-4 w-4 ${orientation === 'left' ? 'rotate-90' : '-rotate-90'}`}
          />
        ),
      }}
    />
  )
}

import { useId, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { id as localeId } from 'react-day-picker/locale'
import { ChevronDown } from './icons'
import { KELAS_KALENDER, isoLokal } from '../lib/kalender'
import { RENTANG_JAM, daftarJam } from '../lib/durasi'

const JAM_AMBIL = daftarJam(RENTANG_JAM.attire)

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
  sebelum,
  jam,
  onPilihJam,
  labelJam = 'Jam Ambil',
  jamMinimal,
}: {
  tanggal: string
  onPilih: (tanggal: string) => void
  mulaiDari?: string
  /** Tanggal ini dan sesudahnya tidak bisa dipilih (fitting harus sebelum hari H). */
  sebelum?: string
  /** Kalau diisi, kolom tombol jam (per jam penuh) tampil di samping
   *  kalender, gayanya sama dengan kolom jam KalenderSlot. Dipakai jam
   *  pengambilan sewa jas. */
  jam?: string
  onPilihJam?: (jam: string) => void
  labelJam?: string
  /** Jam ini dan sebelumnya dimatikan (ambil di hari fitting harus sesudah
   *  jam fitting). */
  jamMinimal?: string
}) {
  const idLabel = useId()
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

  const kalender = (
    <DayPicker
      mode="single"
      locale={localeId}
      month={bulan}
      onMonthChange={setBulanManual}
      selected={tanggal ? new Date(`${tanggal}T00:00:00`) : undefined}
      disabled={(d) => (mulaiDari !== undefined && isoLokal(d) < mulaiDari) || (sebelum !== undefined && isoLokal(d) >= sebelum)}
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

  if (!onPilihJam) return kalender

  return (
    <div className="sm:flex sm:gap-4">
      <div className="min-w-0 flex-1">{kalender}</div>
      <div className="mt-5 sm:mt-0 sm:w-[88px] sm:shrink-0">
        <p id={idLabel} className="flex h-9 items-center text-[13px] font-semibold sm:justify-center">
          {labelJam}
        </p>
        <div
          role="group"
          aria-labelledby={idLabel}
          className="mt-2 grid max-h-[176px] grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:max-h-[268px] sm:grid-cols-1"
        >
          {JAM_AMBIL.map((j) => (
            <button
              key={j}
              type="button"
              disabled={!tanggal || (jamMinimal !== undefined && j <= jamMinimal)}
              aria-pressed={jam === j}
              onClick={() => onPilihJam(j)}
              className={`h-9 shrink-0 rounded-sm border text-[13px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                jam === j ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white hover:border-navy-900'
              }`}
            >
              {j}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

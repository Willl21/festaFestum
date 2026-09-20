import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { id as localeId } from 'react-day-picker/locale'
import { ChevronDown } from './icons'
import { KELAS_KALENDER, isoLokal as iso } from '../lib/kalender'
import { listKetersediaan, type SlotKetersediaan } from '../lib/api'

/** Kalender + jam acara, satu komponen untuk semua halaman pemesanan.
 *
 *  SHIFT DIBUANG di migrasi 014. Dulu di bawah kalender ada tiga tombol
 *  (Pagi/Siang/Sore) dengan jam 08-12 / 12-16 / 16-22 — angka yang KARANGAN
 *  kita sendiri, bukan dari PM, dan kelima mockup "Isi data diri" memang
 *  meminta WAKTU MULAI sebagai input bebas. Sekarang jamnya <input
 *  type="time"> biasa: native, bisa diketik, dan punya penanganan keyboard
 *  serta format lokal tanpa kode tambahan.
 *
 *  Jam TIDAK menentukan ketersediaan apa pun. Yang habis kapasitas harian
 *  vendor, jadi yang perlu dicek cuma tanggalnya — dan itu sudah dijawab
 *  satu request GET /services/:id/availability untuk sebulan penuh.
 *
 *  Dibangun di atas react-day-picker, bukan blok shadcn utuh: proyek ini
 *  tidak memakai shadcn/Radix sama sekali, jadi ikut cara itu berarti
 *  menyeret masuk lima dependensi plus sistem gaya kedua yang bentrok dengan
 *  token warna di index.css. Yang dipakai cuma grid bulan + aksesibilitas
 *  keyboardnya; seluruh tampilannya dari kelas Tailwind proyek ini. */
export default function KalenderSlot({
  serviceId,
  tanggal,
  jam,
  onPilih,
  labelJam = 'Jam Acara',
  keteranganJam,
}: {
  serviceId: string
  tanggal: string
  jam: string
  /** Dipanggil tiap tanggal atau jam berubah. Tanggal format YYYY-MM-DD,
   *  jam format HH:MM 24 jam — dua-duanya persis yang diminta backend. */
  onPilih: (tanggal: string, jam: string) => void
  /** Florist & sewa jas menyebutnya jam kirim, bukan jam acara. */
  labelJam?: string
  keteranganJam?: string
}) {
  const [bulan, setBulan] = useState(() => new Date())
  const [hari, setHari] = useState<SlotKetersediaan[]>([])
  const [paling, setPaling] = useState<string>('')
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  // Lompat otomatis ke bulan pertama yang bisa dipesan cuma boleh SEKALI.
  // Tanpa penjaga ini, tiap kali orangnya menggeser ke bulan yang memang
  // kosong, kalendernya menarik dia balik dan bulan itu jadi tidak bisa
  // dilihat sama sekali.
  const sudahLompat = useRef(false)

  // Satu request per bulan yang dilihat. Rentangnya sengaja melebar satu
  // minggu ke dua arah supaya baris pertama dan terakhir grid — yang berisi
  // tanggal dari bulan sebelah — ikut terwarnai benar.
  useEffect(() => {
    const dari = iso(new Date(bulan.getFullYear(), bulan.getMonth(), -7))
    const sampai = iso(new Date(bulan.getFullYear(), bulan.getMonth() + 1, 7))

    let batal = false
    listKetersediaan(serviceId, dari, sampai)
      .then((r) => {
        if (batal) return
        setHari(r.data)
        setPaling(r.earliest_date)
        setGalat('')

        // Layanan dengan minimum_notice_days panjang (mis. EO 14 hari) bikin
        // SELURUH bulan berjalan mati. Kalendernya terbuka abu-abu semua dan
        // terbaca seperti "vendor ini tidak bisa dipesan", padahal cukup
        // menggeser satu bulan. Jadi bukaannya yang dipindahkan ke bulan
        // pertama yang benar-benar punya tanggal terbuka.
        const awal = new Date(r.earliest_date + 'T00:00:00')
        const bedaBulan =
          awal.getFullYear() * 12 + awal.getMonth()
          - (bulan.getFullYear() * 12 + bulan.getMonth())
        if (!sudahLompat.current && bedaBulan > 0) {
          sudahLompat.current = true
          setBulan(awal)
        }
      })
      .catch((e) => !batal && setGalat((e as Error).message))
      .finally(() => !batal && setMemuat(false))

    return () => {
      batal = true
    }
  }, [serviceId, bulan])

  // Tanggal -> sisa kapasitas. Tanggal yang tidak ada di peta ini tidak bisa
  // dipilih: entah ditutup vendor, sudah penuh, atau melanggar lead time.
  const bisaDipilih = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of hari) {
      if (h.status !== 'available') continue
      if (paling && h.event_date < paling) continue
      m.set(h.event_date, h.sisa_kapasitas)
    }
    return m
  }, [hari, paling])

  const terpilih = tanggal ? new Date(`${tanggal}T00:00:00`) : undefined
  const sisa = bisaDipilih.get(tanggal)

  return (
    <div>
      <div className="relative">
        <DayPicker
          mode="single"
          locale={localeId}
          month={bulan}
          // Penanda muat dinyalakan di sini, bukan di dalam effect: setState
          // sinkron di badan effect memicu render berantai (dan ditolak lint).
          onMonthChange={(m) => { setBulan(m); setMemuat(true) }}
          selected={terpilih}
          disabled={(d) => !bisaDipilih.has(iso(d))}
          onSelect={(d) => d && onPilih(iso(d), jam)}
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

        {memuat && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-2">
            <span className="rounded-sm bg-white/90 px-2 py-1 text-[11px] text-muted">memuat…</span>
          </div>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor="jam-acara" className="text-[15px] font-semibold">
          {labelJam}
        </label>

        {galat ? (
          <p className="mt-3 text-[13px] text-maroon">{galat}</p>
        ) : (
          <>
            <input
              id="jam-acara"
              type="time"
              value={jam}
              disabled={!tanggal}
              onChange={(e) => onPilih(tanggal, e.target.value)}
              className="mt-3 w-full border border-line px-3 py-2.5 text-[14px] transition-colors focus:border-navy-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              {!tanggal
                ? 'Pilih tanggal dulu.'
                : keteranganJam
                  ?? (sisa !== undefined && sisa > 0
                    ? `Masih ada ${sisa} slot di tanggal ini.`
                    : 'Jam bebas — vendor menyesuaikan.')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

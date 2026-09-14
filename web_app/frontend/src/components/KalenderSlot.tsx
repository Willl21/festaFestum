import { useEffect, useMemo, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { id as localeId } from 'react-day-picker/locale'
import { ChevronDown } from './icons'
import { KELAS_KALENDER, isoLokal as iso } from '../lib/kalender'
import { shifts } from '../data/shifts'
import { listKetersediaan, type SlotKetersediaan } from '../lib/api'

/** Kalender + pilihan shift, satu komponen untuk semua halaman pemesanan.
 *
 *  Bentuknya mengikuti calendar-03 dari 21st.dev, tapi ditumpuk: kalender di
 *  atas, pilihan waktu di bawah. Aslinya bersebelahan dan butuh ~500px,
 *  sementara kartu pemesanan di halaman detail cuma 420px.
 *
 *  Daftar waktunya cuma DUA — `shifts` di data/shifts.ts, mengikuti mockup —
 *  bukan daftar jam yang bisa di-scroll seperti aslinya.
 *
 *  Dibangun di atas react-day-picker, bukan blok shadcn utuh: proyek ini
 *  tidak memakai shadcn/Radix sama sekali, jadi ikut cara itu berarti
 *  menyeret masuk lima dependensi plus sistem gaya kedua yang bentrok dengan
 *  token warna di index.css. Yang dipakai cuma grid bulan + aksesibilitas
 *  keyboardnya; seluruh tampilannya dari kelas Tailwind proyek ini.
 *
 *  Tanggal diabu-abukan lewat GET /services/:id/availability — satu request
 *  untuk sebulan. Tanggal yang vendornya tidak membuka slot sama sekali,
 *  yang semua slotnya sudah terpakai, atau yang melanggar minimum_notice_days
 *  tidak bisa dipilih. */
export default function KalenderSlot({
  serviceId,
  tanggal,
  shift,
  onPilih,
}: {
  serviceId: string
  tanggal: string
  shift: string
  /** Dipanggil tiap tanggal atau shift berubah. Tanggal format YYYY-MM-DD. */
  onPilih: (tanggal: string, shift: string) => void
}) {
  const [bulan, setBulan] = useState(() => new Date())
  const [slots, setSlots] = useState<SlotKetersediaan[]>([])
  const [paling, setPaling] = useState<string>('')
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

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
        setSlots(r.data)
        setPaling(r.earliest_date)
        setGalat('')
      })
      .catch((e) => !batal && setGalat((e as Error).message))
      .finally(() => !batal && setMemuat(false))

    return () => {
      batal = true
    }
  }, [serviceId, bulan])

  // Tanggal -> daftar shift yang masih bebas di tanggal itu.
  //
  // Hanya shift yang benar-benar ditawarkan UI yang dihitung. Enum time_slot
  // di DB punya tiga nilai, tapi mockup cuma punya dua ('siang' tidak dipakai
  // — lihat data/shifts.ts). Tanpa saringan ini, tanggal yang cuma punya slot
  // siang akan terlihat bisa dipilih lalu ternyata tidak ada shift apa pun.
  const bebasPerTanggal = useMemo(() => {
    const dipakai = new Set<string>(shifts.map((s) => s.value))
    const m = new Map<string, Set<string>>()
    for (const s of slots) {
      if (s.status !== 'available') continue
      if (!dipakai.has(s.time_slot)) continue
      if (paling && s.event_date < paling) continue
      if (!m.has(s.event_date)) m.set(s.event_date, new Set())
      m.get(s.event_date)!.add(s.time_slot)
    }
    return m
  }, [slots, paling])

  const terpilih = tanggal ? new Date(`${tanggal}T00:00:00`) : undefined
  const bebasHariIni = bebasPerTanggal.get(tanggal) ?? new Set<string>()

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
          // Tanggal tanpa satu pun shift bebas tidak bisa diklik.
          disabled={(d) => !bebasPerTanggal.has(iso(d))}
          onSelect={(d) => {
            if (!d) return
            const baru = iso(d)
            // Shift yang sedang dipilih belum tentu ada di tanggal baru.
            const bebas = bebasPerTanggal.get(baru) ?? new Set<string>()
            onPilih(baru, bebas.has(shift) ? shift : '')
          }}
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
        <p className="text-[15px] font-semibold">Shift Layanan</p>

        {galat ? (
          <p className="mt-3 text-[13px] text-maroon">{galat}</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {shifts.map((s) => {
              const bisa = bebasHariIni.has(s.value)
              const aktif = shift === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={!bisa}
                  onClick={() => onPilih(tanggal, s.value)}
                  className={`w-full border px-3 py-2.5 text-left transition-colors ${
                    aktif
                      ? 'border-navy-900 bg-lavender/40'
                      : 'border-line hover:border-navy-900 disabled:hover:border-line'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span className="block text-[13px] font-semibold">{s.label}</span>
                  <span className="block text-[12px] text-muted">{s.hours}</span>
                </button>
              )
            })}

            <p className="col-span-2 text-[12px] leading-relaxed text-muted">
              {!tanggal
                ? 'Pilih tanggal dulu untuk melihat shift yang tersedia.'
                : bebasHariIni.size === 0
                  ? 'Tidak ada shift tersisa di tanggal ini.'
                  : `${bebasHariIni.size} shift tersedia.`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

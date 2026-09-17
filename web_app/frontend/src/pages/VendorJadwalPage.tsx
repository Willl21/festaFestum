import { useCallback, useEffect, useMemo, useState } from 'react'
import { VendorPageHeader } from '../components/VendorLayout'
import { ChevronDown } from '../components/icons'
import { shifts } from '../data/shifts'
import { listMySchedules, tambahSlot, kirim } from '../lib/api'

/** Kalender ketersediaan vendor — sumber data untuk schedule-first discovery.
 *
 *  Aturan mainnya sama dengan tabel vendor_schedules: TIDAK ADA baris berarti
 *  vendor tidak menerima pesanan di slot itu. Jadi default tiap tanggal adalah
 *  tutup, dan vendor membukanya satu per satu. Slot yang sudah 'booked' tidak
 *  bisa ditutup lagi dari sini — pesanannya harus dibatalkan lebih dulu.
 *
 *  Shift-nya ikut src/data/shifts.ts (dua pilihan, mengikuti mockup), bukan
 *  tiga nilai enum di DB. Membuka 'siang' dari sini percuma selama halaman
 *  detail vendor belum menawarkannya ke customer.
 *
 *  Sudah tersambung ke backend:
 *  baca       -> GET    /api/v1/schedules/me?from=&to=
 *  buka slot  -> POST   /api/v1/schedules
 *  tutup slot -> DELETE /api/v1/schedules/:id
 *
 *  Perubahan dikirim ke server dulu, baru state lokal ikut. Kalau dibalik,
 *  kalender bisa menampilkan slot terbuka yang sebenarnya gagal tersimpan.
 */

type SlotStatus = 'available' | 'booked' | 'held' | 'blocked'

/** Satu baris vendor_schedules yang dipegang kalender. `id` dibutuhkan untuk
 *  menutup slot (DELETE butuh schedule_id, bukan tanggal + shift). */
type Slot = { id: string; status: SlotStatus; customer: string | null }

/** Kunci baris jadwal, sama bentuknya dengan (event_date, time_slot) di DB. */
type Availability = Record<string, Partial<Record<string, Slot>>>

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

/** Minggu dimulai Senin, seperti kalender yang biasa dipakai di Indonesia. */
const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

const today = new Date()
today.setHours(0, 0, 0, 0)


export default function VendorJadwalPage() {
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [availability, setAvailability] = useState<Availability>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState('')

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    // getDay(): 0 = Minggu. Digeser supaya Senin jadi kolom pertama.
    const offset = (first.getDay() + 6) % 7
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ]
  }, [month])

  // Rentang dibatasi per bulan yang sedang dilihat — GET /schedules/me memang
  // mewajibkan from & to supaya tidak menarik ribuan baris sekaligus.
  const muat = useCallback(async () => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    setMemuat(true)
    setGalat('')
    try {
      const r = await listMySchedules(iso(first), iso(last))
      const next: Availability = {}
      for (const row of r.data) {
        const tgl = row.event_date.slice(0, 10)
        next[tgl] = {
          ...(next[tgl] || {}),
          [row.time_slot]: {
            id: row.schedule_id,
            status: row.status,
            customer: row.customer_name,
          },
        }
      }
      setAvailability(next)
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setMemuat(false)
    }
  }, [month])

  // muat() tidak pernah memanggil setState secara sinkron: semuanya sesudah
  // await, jadi satu kali muat = satu kali render, bukan render berantai yang
  // dicegah aturan di bawah. Menyalin isi muat() ke dalam efek cuma untuk
  // mendiamkan linter berarti dua salinan logika pengambilan data per halaman.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { muat() }, [muat])

  const openCount = Object.values(availability).reduce(
    (n, slots) => n + Object.values(slots).filter((s) => s && s.status === 'available').length,
    0
  )

  async function toggle(date: string, shift: string) {
    const kini = availability[date]?.[shift]
    // Slot yang sudah dipesan atau sedang dipegang user lain tidak boleh
    // ditutup dari sini; backend juga menolaknya.
    if (kini && kini.status !== 'available') return

    setSibuk(date + shift)
    setGalat('')
    try {
      if (kini) {
        await kirim(`/schedules/${kini.id}`, 'DELETE')
      } else {
        await tambahSlot([{ event_date: date, time_slot: shift }])
      }
      // Muat ulang dari server, bukan menebak hasilnya di klien.
      await muat()
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk('')
    }
  }

  const selectedSlots = selected ? availability[selected] || {} : {}

  return (
    <>
      <VendorPageHeader
        title="Jadwal & Ketersediaan"
        description="Buka tanggal yang bisa dipesan klien. Tanggal yang tidak dibuka tidak akan muncul di hasil pencarian."
        action={
          <div className="rounded-md border border-line bg-white px-5 py-3 text-center">
            <p className="font-display text-[24px] font-semibold">{openCount}</p>
            <p className="text-[12px] text-ink/70">slot terbuka</p>
          </div>
        }
      />

      {galat && (
        <p className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
          {galat}
        </p>
      )}

      <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-line bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-[22px] font-semibold">
              {monthNames[month.getMonth()]} {month.getFullYear()}
              {memuat && <span className="ml-3 text-[13px] font-normal text-muted">memuat...</span>}
            </h2>
            <div className="flex gap-2">
              <MonthButton
                label="Bulan sebelumnya"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                rotate="rotate-90"
              />
              <MonthButton
                label="Bulan berikutnya"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                rotate="-rotate-90"
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-7 gap-1.5 text-center text-[12px] font-semibold text-ink/60">
            {dayNames.map((d) => (
              <div key={d} className="pb-1">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1.5">
            {days.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} />

              const key = iso(date)
              const slots = availability[key] || {}
              const values = Object.values(slots)
              const isPast = date < today
              const isSelected = key === selected

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPast}
                  onClick={() => setSelected(key)}
                  aria-pressed={isSelected}
                  className={`flex h-[74px] flex-col items-start rounded-md border p-2 text-left transition-colors ${
                    isSelected ? 'border-ink bg-lavender/40' : 'border-line hover:border-navy-900/40'
                  } ${isPast ? 'cursor-not-allowed opacity-35' : ''}`}
                >
                  <span className="text-[13px] font-semibold">{date.getDate()}</span>
                  <span className="mt-auto flex gap-1">
                    {values.map((slot, n) => (
                      <span
                        key={n}
                        className={`h-1.5 w-1.5 rounded-full ${
                          slot && slot.status !== 'available' ? 'bg-maroon' : 'bg-amber'
                        }`}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-5 border-t border-line pt-4 text-[12px] text-ink/70">
            <Legend className="bg-amber">Terbuka</Legend>
            <Legend className="bg-maroon">Sudah dipesan</Legend>
            <Legend className="border border-line bg-white">Tutup</Legend>
          </div>
        </section>

        <section className="h-fit rounded-lg border border-line bg-white p-6">
          {!selected ? (
            <p className="text-[14px] text-ink/70">
              Pilih tanggal di kalender untuk membuka atau menutup shift-nya.
            </p>
          ) : (
            <>
              <p className="text-[12px] font-semibold tracking-[0.04em] text-ink/60">TANGGAL DIPILIH</p>
              <h2 className="mt-1 font-display text-[22px] font-semibold">
                {new Date(selected).toLocaleDateString('id-ID', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </h2>

              <div className="mt-6 space-y-3">
                {shifts.map((s) => {
                  const slot = selectedSlots[s.value]
                  // 'held' = sedang dipegang user lain di checkout; sama-sama
                  // tidak boleh ditutup vendor.
                  const terkunci = !!slot && slot.status !== 'available'
                  const terbuka = !!slot && slot.status === 'available'
                  const sedang = sibuk === selected + s.value

                  return (
                    <div
                      key={s.value}
                      className={`flex items-center justify-between gap-3 rounded-md border p-4 ${
                        terkunci ? 'border-maroon/40 bg-maroon/5' : 'border-line'
                      }`}
                    >
                      <div>
                        <p className="text-[14px] font-semibold">{s.label}</p>
                        <p className="text-[12px] text-ink/65">{s.hours}</p>
                      </div>

                      {terkunci ? (
                        <span className="rounded-full bg-maroon/10 px-3 py-1 text-right text-[12px] font-medium text-maroon">
                          {slot.status === 'held' ? 'Sedang diproses' : 'Sudah dipesan'}
                          {slot.customer && (
                            <span className="block text-[11px] font-normal">{slot.customer}</span>
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={sedang}
                          onClick={() => toggle(selected, s.value)}
                          className={`rounded-md px-4 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                            terbuka
                              ? 'bg-amber text-navy-900'
                              : 'border border-line text-ink/70 hover:border-ink'
                          }`}
                        >
                          {sedang ? 'Menyimpan...' : terbuka ? 'Terbuka' : 'Tutup'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="mt-5 text-[12px] text-muted">
                Slot yang sudah dipesan hanya bisa dilepas dengan membatalkan pesanannya di menu
                Pemesanan.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  )
}

function MonthButton({
  label,
  onClick,
  rotate,
}: {
  label: string
  onClick: () => void
  rotate: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-md border border-line p-2 text-ink/70 hover:border-ink hover:text-ink"
    >
      <ChevronDown className={`h-4 w-4 ${rotate}`} />
    </button>
  )
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {children}
    </span>
  )
}

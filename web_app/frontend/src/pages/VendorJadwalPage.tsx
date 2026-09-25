import { useCallback, useEffect, useMemo, useState } from 'react'
import { VendorPageHeader } from '../components/VendorLayout'
import { ChevronDown, CheckCircleIcon } from '../components/icons'
import {
  listMySchedules, tutupTanggal, ubahKapasitas, ubahJeda, getMyVendor, getMyServices, kirim,
} from '../lib/api'

/** Kalender ketersediaan vendor — sumber data untuk schedule-first discovery.
 *
 *  ARAHNYA TERBALIK sejak migrasi 013. Dulu: tidak ada baris = tutup, dan
 *  vendor membuka slotnya satu per satu — yang berarti vendor baru lahir
 *  dalam keadaan tidak bisa dipesan sampai dia mengisi kalender ini. Sekarang
 *  vendor tersedia secara bawaan, dan yang dicatat justru penutupannya.
 *
 *  SATUANNYA TANGGAL sejak migrasi 014. Dulu tiap tanggal dipecah jadi tiga
 *  shift dan vendor menutupnya satu per satu. Untuk vendor berkapasitas 1
 *  ketiga tombol itu selalu bergerak barengan — satu pesanan pagi bikin
 *  ketiganya penuh — jadi yang terlihat cuma tiga kontrol yang hasilnya
 *  identik. Shift sudah tidak ada; jam acara diisi bebas oleh pemesan dan
 *  tidak mengunci apa pun.
 *
 *  Status yang datang dari server sudah diturunkan di sana:
 *    available -> tidak ditutup, kapasitas hari itu masih sisa
 *    blocked   -> vendor menutupnya sendiri (punya schedule_id, bisa dicabut)
 *    booked    -> kapasitas harian sudah habis
 *
 *  Sudah tersambung ke backend:
 *  baca          -> GET    /api/v1/schedules/me?from=&to=
 *  tutup tanggal -> POST   /api/v1/schedules
 *  buka lagi     -> DELETE /api/v1/schedules/:id
 *
 *  Perubahan dikirim ke server dulu, baru state lokal ikut. Kalau dibalik,
 *  kalender bisa menampilkan penutupan yang sebenarnya gagal tersimpan.
 */

type SlotStatus = 'available' | 'booked' | 'blocked'

/** Satu tanggal di kalender. `id` hanya terisi kalau tanggal itu memang
 *  penutupan — DELETE butuh schedule_id, dan tanggal 'available' tidak punya
 *  baris di DB. */
type Hari = {
  id: string | null
  status: SlotStatus
  customer: string | null
  jam: string | null
  terpakai: number
  jumlahPesanan: number
}

type Availability = Record<string, Hari>

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
  // Berapa pesanan yang sanggup dilayani dalam sehari. Vendor berkapasitas 1
  // otomatis penuh seharian begitu dapat satu pesanan; itu yang dulu jadi
  // aturan "kunci seharian" yang dipatok per kategori.
  const [kapasitas, setKapasitas] = useState(1)
  const [vendorId, setVendorId] = useState('')
  const [simpanKapasitas, setSimpanKapasitas] = useState('')
  // MUA & fotografer (migrasi 016): kapasitas = jumlah TIM yang bisa jalan
  // bersamaan, dan harinya tidak pernah "penuh" karena satu pesanan — yang
  // habis jam tim-nya. Jeda = waktu perjalanan yang ikut dikunci sesudah
  // tiap pesanan.
  const [perJam, setPerJam] = useState(false)
  const [jeda, setJeda] = useState(60)
  const [simpanJedaStatus, setSimpanJedaStatus] = useState('')

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
        next[row.event_date.slice(0, 10)] = {
          id: row.schedule_id,
          status: row.status,
          customer: row.customer_name,
          jam: row.start_time,
          terpakai: row.terpakai,
          jumlahPesanan: row.jumlah_pesanan,
        }
      }
      setAvailability(next)
      setKapasitas(r.daily_capacity)
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

  // vendor_id tidak ikut di /schedules/me, padahal PATCH kapasitas butuh dia.
  useEffect(() => {
    getMyVendor()
      .then((r) => {
        setVendorId(r.vendor.vendor_id)
        setJeda(r.vendor.jeda_menit ?? 60)
      })
      .catch(() => {})
    // Satu vendor satu kategori, jadi cukup melihat apakah layanannya
    // berbasis jam.
    getMyServices()
      .then((r) => setPerJam(r.data.some((s) => s.durasi_menit != null)))
      .catch(() => {})
  }, [])

  async function simpanKap(n: number) {
    if (!vendorId || n === kapasitas) return
    setSimpanKapasitas('menyimpan')
    setGalat('')
    try {
      await ubahKapasitas(vendorId, n)
      setSimpanKapasitas('tersimpan')
      // Kapasitas mengubah tanggal mana yang terbaca penuh, jadi kalendernya
      // ikut dimuat ulang dari server.
      await muat()
    } catch (e) {
      setGalat((e as Error).message)
      setSimpanKapasitas('')
    }
  }

  async function simpanJeda(n: number) {
    if (!vendorId) return
    setSimpanJedaStatus('menyimpan')
    setGalat('')
    try {
      await ubahJeda(vendorId, n)
      setSimpanJedaStatus('tersimpan')
    } catch (e) {
      setGalat((e as Error).message)
      setSimpanJedaStatus('')
    }
  }

  const semua = Object.values(availability)
  const bukaCount = semua.filter((h) => h.status === 'available').length
  const tutupCount = semua.filter((h) => h.status === 'blocked').length

  async function toggle(date: string) {
    const kini = availability[date]
    // Tanggal yang sudah terisi pesanan tidak boleh diapa-apakan dari sini;
    // backend juga menolaknya dengan menyebut tanggal mana yang bentrok.
    if (!kini || kini.status === 'booked') return

    setSibuk(date)
    setGalat('')
    try {
      if (kini.status === 'blocked' && kini.id) {
        await kirim(`/schedules/${kini.id}`, 'DELETE')
      } else {
        await tutupTanggal([date])
      }
      // Muat ulang dari server, bukan menebak hasilnya di klien.
      await muat()
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk('')
    }
  }

  const hariDipilih = selected ? availability[selected] : undefined

  return (
    <>
      <VendorPageHeader
        title="Jadwal & Ketersediaan"
        description="Anda tersedia secara bawaan. Tutup tanggal yang tidak bisa Anda layani — tanggal yang ditutup tidak akan muncul di hasil pencarian."
        action={
          <div className="flex gap-3">
            <div className="rounded-md border border-line bg-white px-5 py-3 text-center">
              <p className="font-display text-[24px] font-semibold">{bukaCount}</p>
              <p className="text-[12px] text-ink/70">
                tanggal terbuka{tutupCount > 0 && `, ${tutupCount} ditutup`}
              </p>
            </div>
            <div className="rounded-md border border-line bg-white px-5 py-3 text-center">
              <label htmlFor="kapasitas" className="sr-only">
                {perJam ? 'Jumlah tim bersamaan' : 'Pesanan per hari'}
              </label>
              <input
                id="kapasitas"
                type="number"
                min={1}
                max={99}
                value={kapasitas}
                onChange={(e) => setKapasitas(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
                onBlur={(e) => simpanKap(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 rounded border border-line text-center font-display text-[24px] font-semibold"
              />
              <p className="text-[12px] text-ink/70">
                {perJam ? 'tim bersamaan' : 'pesanan/hari'}
                {simpanKapasitas === 'tersimpan' && (
                  <CheckCircleIcon className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-[#2e6b52]" />
                )}
              </p>
            </div>
            {perJam && (
              <div className="rounded-md border border-line bg-white px-5 py-3 text-center">
                <label htmlFor="jeda" className="sr-only">Jeda antar-pesanan dalam menit</label>
                <input
                  id="jeda"
                  type="number"
                  min={0}
                  max={480}
                  step={15}
                  value={jeda}
                  onChange={(e) => setJeda(Math.min(480, Math.max(0, Number(e.target.value) || 0)))}
                  onBlur={(e) => simpanJeda(Math.min(480, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-20 rounded border border-line text-center font-display text-[24px] font-semibold"
                />
                <p className="text-[12px] text-ink/70" title="Waktu perjalanan yang ikut dikunci sesudah tiap pesanan. Berlaku untuk pesanan baru.">
                  menit jeda
                  {simpanJedaStatus === 'tersimpan' && (
                    <CheckCircleIcon className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-[#2e6b52]" />
                  )}
                </p>
              </div>
            )}
          </div>
        }
      />

      {galat && (
        <p className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
          {galat}
        </p>
      )}

      <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-line bg-white p-4 sm:p-6">
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

          <div className="mt-6 grid grid-cols-7 gap-1 text-center text-[12px] font-semibold text-ink/60 sm:gap-1.5">
            {dayNames.map((d) => (
              <div key={d} className="pb-1">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
            {days.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} />

              const key = iso(date)
              const hari = availability[key]
              const isPast = date < today
              const isSelected = key === selected

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPast}
                  onClick={() => setSelected(key)}
                  aria-pressed={isSelected}
                  className={`flex h-[64px] flex-col items-start rounded-md border p-1.5 text-left transition-colors sm:h-[74px] sm:p-2 ${
                    isSelected ? 'border-ink bg-lavender/40' : 'border-line hover:border-navy-900/40'
                  } ${isPast ? 'cursor-not-allowed opacity-35' : ''}`}
                >
                  <span className="text-[13px] font-semibold">{date.getDate()}</span>
                  {hari && (
                    <span className="mt-auto flex w-full items-center justify-between gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${WARNA_STATUS[hari.status]}`} />
                      {/* Angka terpakai/kapasitas menggantikan tiga titik shift:
                          tanpa itu, vendor berkapasitas 10 tidak punya cara
                          melihat berapa yang sudah masuk hari itu. */}
                      {perJam ? hari.jumlahPesanan > 0 && (
                        <span className="text-[11px] text-ink/60">{hari.jumlahPesanan} pesanan</span>
                      ) : hari.terpakai > 0 && (
                        <span className="text-[11px] text-ink/60">
                          {hari.terpakai}/{kapasitas}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-5 border-t border-line pt-4 text-[12px] text-ink/70">
            <Legend className="bg-amber">Terbuka</Legend>
            <Legend className="bg-maroon">Penuh</Legend>
            <Legend className="border border-line bg-white">Anda tutup</Legend>
          </div>
        </section>

        <section className="h-fit rounded-lg border border-line bg-white p-6">
          {!selected || !hariDipilih ? (
            <p className="text-[14px] text-ink/70">
              Pilih tanggal di kalender untuk menutup atau membukanya kembali.
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

              <p className="mt-4 text-[13px] text-ink/70">
                {perJam
                  ? `${hariDipilih.jumlahPesanan} pesanan di tanggal ini. Jam yang masih kosong tetap bisa dipesan.`
                  : `${hariDipilih.terpakai} dari ${kapasitas} terpakai`}
              </p>

              {hariDipilih.status === 'booked' ? (
                <div className="mt-4 rounded-md border border-maroon/40 bg-maroon/5 p-4">
                  <p className="text-[13px] font-medium text-maroon">Kapasitas penuh</p>
                  {hariDipilih.customer && (
                    <p className="mt-1 text-[12px] text-ink/70">
                      {hariDipilih.customer}
                      {hariDipilih.jam && ` · ${hariDipilih.jam}`}
                      {hariDipilih.jumlahPesanan > 1 && ` +${hariDipilih.jumlahPesanan - 1} lainnya`}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={sibuk === selected}
                  onClick={() => toggle(selected)}
                  className={`mt-4 w-full rounded-md px-4 py-3 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                    hariDipilih.status === 'available'
                      ? 'bg-amber text-navy-900'
                      : 'border border-line text-ink/70 hover:border-ink'
                  }`}
                >
                  {sibuk === selected
                    ? 'Menyimpan...'
                    : hariDipilih.status === 'available'
                      ? 'Terbuka — klik untuk tutup'
                      : 'Ditutup — klik untuk buka'}
                </button>
              )}

              {hariDipilih.status !== 'booked' && hariDipilih.terpakai > 0 && (
                <p className="mt-3 text-[12px] text-muted">
                  Sudah ada {hariDipilih.jumlahPesanan} pesanan di tanggal ini, jadi tanggalnya tidak
                  bisa ditutup sampai pesanannya dibatalkan.
                </p>
              )}

              <p className="mt-5 text-[12px] text-muted">
                Tanggal yang sudah dipesan hanya bisa dilepas dengan membatalkan pesanannya di menu
                Pemesanan.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  )
}

const WARNA_STATUS: Record<SlotStatus, string> = {
  available: 'bg-amber',
  booked: 'bg-maroon',
  blocked: 'border border-line bg-white',
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

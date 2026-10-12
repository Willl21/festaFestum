import { useCallback, useEffect, useMemo, useState } from 'react'
import { VendorPageHeader } from '../components/VendorLayout'
import { ChevronDown, CheckCircleIcon } from '../components/icons'
import {
  listMySchedules, tutupTanggal, bukaTanggal, ubahKapasitas, ubahJeda, getMyVendor, getMyServices,
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
 *  Sudah tersambung ke backend (tutup & buka menerima banyak tanggal
 *  sekaligus, dipakai mode "Pilih Beberapa"):
 *  baca          -> GET  /api/v1/schedules/me?from=&to=
 *  tutup tanggal -> POST /api/v1/schedules       { dates }
 *  buka lagi     -> POST /api/v1/schedules/buka  { dates }
 *
 *  Perubahan dikirim ke server dulu, baru state lokal ikut. Kalau dibalik,
 *  kalender bisa menampilkan penutupan yang sebenarnya gagal tersimpan.
 */

type SlotStatus = 'available' | 'booked' | 'blocked'

/** Satu tanggal di kalender. */
type Hari = {
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
  // Nilai terakhir dari server. Dibandingkan dengan INI, bukan dengan
  // `kapasitas`: onChange sudah mengisi `kapasitas` lebih dulu, jadi
  // pembandingan lama selalu "sama" dan PATCH tidak pernah terkirim.
  const [kapServer, setKapServer] = useState(1)
  const [vendorId, setVendorId] = useState('')
  const [simpanKapasitas, setSimpanKapasitas] = useState('')
  // MUA & fotografer (migrasi 016): kapasitas = jumlah TIM yang bisa jalan
  // bersamaan, dan harinya tidak pernah "penuh" karena satu pesanan — yang
  // habis jam tim-nya. Jeda = waktu perjalanan yang ikut dikunci sesudah
  // tiap pesanan.
  const [perJam, setPerJam] = useState(false)
  const [jeda, setJeda] = useState(60)
  const [simpanJedaStatus, setSimpanJedaStatus] = useState('')
  // Mode "Pilih Beberapa": klik tanggal = centang, lalu tutup/buka sekaligus.
  // Status disimpan saat dipilih, karena kalender hanya memuat bulan yang
  // sedang dilihat sedangkan pilihan boleh menyeberang bulan.
  const [modePilih, setModePilih] = useState(false)
  const [pilihan, setPilihan] = useState<Record<string, SlotStatus>>({})
  const [info, setInfo] = useState('')

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
          status: row.status,
          customer: row.customer_name,
          jam: row.start_time,
          terpakai: row.terpakai,
          jumlahPesanan: row.jumlah_pesanan,
        }
      }
      setAvailability(next)
      setKapasitas(r.daily_capacity)
      setKapServer(r.daily_capacity)
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
    if (!vendorId || n === kapServer) return
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
      if (kini.status === 'blocked') {
        await bukaTanggal([date])
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

  // Yang tidak bisa dipilih: penuh, atau masih terbuka tapi sudah ada
  // pesanannya. Menutup tanggal berpesanan ditolak backend untuk SELURUH
  // permintaan, jadi satu tanggal seperti itu akan menggagalkan semuanya.
  const bisaDipilih = (h: Hari | undefined): h is Hari =>
    !!h && h.status !== 'booked' && !(h.status === 'available' && (h.terpakai > 0 || h.jumlahPesanan > 0))

  function centang(date: string) {
    const h = availability[date]
    if (!bisaDipilih(h)) return
    setInfo('')
    setPilihan((lama) => {
      const baru = { ...lama }
      if (date in baru) delete baru[date]
      else baru[date] = h.status
      return baru
    })
  }

  function keluarModePilih() {
    setModePilih(false)
    setPilihan({})
  }

  const jumlahDipilih = Object.keys(pilihan).length
  const akanDitutup = Object.keys(pilihan).filter((d) => pilihan[d] === 'available').sort()
  const akanDibuka = Object.keys(pilihan).filter((d) => pilihan[d] === 'blocked').sort()

  async function jalankan(aksi: 'tutup' | 'buka') {
    const dates = aksi === 'tutup' ? akanDitutup : akanDibuka
    setSibuk(aksi)
    setGalat('')
    setInfo('')
    try {
      // Backend menerima maksimal 100 tanggal per permintaan.
      for (let i = 0; i < dates.length; i += 100) {
        const potong = dates.slice(i, i + 100)
        await (aksi === 'tutup' ? tutupTanggal(potong) : bukaTanggal(potong))
      }
      const sisa = { ...pilihan }
      for (const d of dates) delete sisa[d]
      setPilihan(sisa)
      if (Object.keys(sisa).length === 0) setModePilih(false)
      setInfo(`${dates.length} tanggal ${aksi === 'tutup' ? 'ditutup' : 'dibuka kembali'}.`)
      await muat()
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk('')
    }
  }

  return (
    <>
      <VendorPageHeader
        title="Jadwal & Ketersediaan"
        description="Anda tersedia secara bawaan. Tutup tanggal yang tidak bisa Anda layani, tanggal yang ditutup tidak akan muncul di hasil pencarian."
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
      {info && (
        <p role="status" className="mt-6 border border-[#2e6b52]/30 bg-[#2e6b52]/5 px-5 py-3 text-[13px] text-[#2e6b52]">
          {info}
        </p>
      )}

      <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-line bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[22px] font-semibold">
              {monthNames[month.getMonth()]} {month.getFullYear()}
              {memuat && <span className="ml-3 text-[13px] font-normal text-muted">memuat...</span>}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (modePilih) return keluarModePilih()
                  setModePilih(true)
                  setInfo('')
                }}
                aria-pressed={modePilih}
                className={`whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold transition-colors ${
                  modePilih
                    ? 'border-navy-900 bg-navy-900 text-white hover:bg-navy-700'
                    : 'border-line text-ink/80 hover:border-ink'
                }`}
              >
                {modePilih ? 'Selesai' : 'Pilih Beberapa'}
              </button>
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
              const dicentang = modePilih && key in pilihan
              const isSelected = modePilih ? dicentang : key === selected
              const mati = isPast || (modePilih && !bisaDipilih(hari))

              return (
                <button
                  key={key}
                  type="button"
                  disabled={mati}
                  onClick={() => (modePilih ? centang(key) : setSelected(key))}
                  aria-pressed={isSelected}
                  className={`relative flex h-[64px] flex-col items-start rounded-md border p-1.5 text-left transition-colors sm:h-[74px] sm:p-2 ${
                    dicentang
                      ? 'border-navy-900 bg-lavender/60 ring-1 ring-navy-900'
                      : isSelected ? 'border-ink bg-lavender/40' : 'border-line hover:border-navy-900/40'
                  } ${mati ? 'cursor-not-allowed opacity-35' : ''} ${
                    // Tanggal yang ditutup dulu cuma beda di titik kecil berwarna
                    // putih, nyaris tak terlihat. Sekarang seluruh petaknya redup.
                    hari?.status === 'blocked' && !isSelected ? 'bg-ink/[0.06] text-ink/45' : ''
                  }`}
                >
                  <span className="text-[13px] font-semibold">{date.getDate()}</span>
                  {dicentang && (
                    <CheckCircleIcon className="absolute right-1 bottom-1 h-3.5 w-3.5 text-navy-900" />
                  )}
                  {hari?.status === 'blocked' && <span className="text-[10px] font-medium">Ditutup</span>}
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
            <Legend className="border border-ink/30 bg-ink/10">Anda tutup</Legend>
          </div>
        </section>

        <section
          className={`h-fit rounded-lg border border-line bg-white p-6 ${
            // Di HP panel ini ada di bawah kalender; dalam mode pilih dibuat
            // menempel di bawah layar supaya tombolnya tetap terjangkau.
            modePilih ? 'max-lg:sticky max-lg:bottom-3 max-lg:z-10 max-lg:shadow-lg' : ''
          }`}
        >
          {modePilih ? (
            <>
              <p className="text-[12px] font-semibold tracking-[0.04em] text-ink/60">PILIH BEBERAPA</p>
              <h2 className="mt-1 font-display text-[22px] font-semibold">
                {jumlahDipilih} tanggal dipilih
              </h2>
              <p className="mt-2 text-[13px] text-ink/70">
                Klik tanggal di kalender untuk memilih, boleh pindah bulan. Tanggal yang sudah ada
                pesanannya tidak bisa dipilih.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {akanDitutup.length > 0 && (
                  <button
                    type="button"
                    disabled={!!sibuk}
                    onClick={() => jalankan('tutup')}
                    className="w-full rounded-md bg-amber px-4 py-3 text-[13px] font-semibold text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {sibuk === 'tutup' ? 'Menyimpan...' : `Tutup ${akanDitutup.length} tanggal`}
                  </button>
                )}
                {akanDibuka.length > 0 && (
                  <button
                    type="button"
                    disabled={!!sibuk}
                    onClick={() => jalankan('buka')}
                    className="w-full rounded-md border border-ink/30 px-4 py-3 text-[13px] font-semibold text-ink transition-colors hover:border-ink disabled:opacity-50"
                  >
                    {sibuk === 'buka' ? 'Menyimpan...' : `Buka ${akanDibuka.length} tanggal`}
                  </button>
                )}
                {jumlahDipilih > 0 && (
                  <button
                    type="button"
                    onClick={() => setPilihan({})}
                    className="text-[13px] font-medium text-ink/70 underline underline-offset-4"
                  >
                    Kosongkan pilihan
                  </button>
                )}
              </div>
            </>
          ) : !selected || !hariDipilih ? (
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
                      ? 'Terbuka, klik untuk tutup'
                      : 'Ditutup, klik untuk buka'}
                </button>
              )}

              {/* jumlahPesanan ikut dicek: untuk MUA & fotografer backend tidak
                  menghitung pesanan per jam ke `terpakai`, jadi peringatan ini
                  dulu tidak pernah muncul dan vendor baru tahu dari 409. */}
              {hariDipilih.status !== 'booked' && (hariDipilih.terpakai > 0 || hariDipilih.jumlahPesanan > 0) && (
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

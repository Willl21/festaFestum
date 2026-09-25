import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { id as localeId } from 'react-day-picker/locale'
import { ChevronDown } from './icons'
import { KELAS_KALENDER, isoLokal as iso } from '../lib/kalender'
import {
  listKetersediaan, listJamTerisi, type ApiService, type JamTerisi, type SlotKetersediaan,
} from '../lib/api'
import { berbasisJam, durasiPesanan, tambahJam, MAKS_JAM_TAMBAHAN } from '../lib/durasi'
import { rupiah } from '../lib/format'
import type { CategoryKey } from '../data/categories'

/** Rentang tombol jam mulai per kategori, tiap 1 jam (disepakati 25 Sep 2026).
 *  MUA mulai subuh karena rias pengantin biasa jam 4-5 pagi; florist & sewa
 *  jas memakai jam kirim/ambil, jadi cukup jam kerja gerai. Jam terakhir itu
 *  LAST ORDER: pesanan boleh selesai melewatinya. */
const RENTANG_JAM: Record<CategoryKey, [number, number]> = {
  mua: [4, 20],
  eo: [6, 22],
  fotografer: [6, 22],
  florist: [7, 20],
  attire: [7, 20],
}

function daftarJam([mulai, selesai]: [number, number]) {
  const jam: string[] = []
  for (let h = mulai; h <= selesai; h++) jam.push(`${String(h).padStart(2, '0')}:00`)
  return jam
}

const menitDari = (jam: string) => Number(jam.slice(0, 2)) * 60 + Number(jam.slice(3, 5))

/** Tombol − angka + untuk jumlah orang & jam tambahan. */
function Pengatur({ label, nilai, min, max, onUbah, catatan }: {
  label: string; nilai: number; min: number; max: number
  onUbah: (n: number) => void; catatan?: string
}) {
  const tombol = 'flex h-8 w-8 items-center justify-center rounded-sm border border-line text-[15px] transition-colors hover:border-navy-900 disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[13px] font-semibold">{label}</p>
        {catatan && <p className="text-[11px] text-muted">{catatan}</p>}
      </div>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <button type="button" className={tombol} disabled={nilai <= min}
          onClick={() => onUbah(nilai - 1)} aria-label={`Kurangi ${label.toLowerCase()}`}>−</button>
        <span className="w-6 text-center text-[14px] tabular-nums" aria-live="polite">{nilai}</span>
        <button type="button" className={tombol} disabled={nilai >= max}
          onClick={() => onUbah(nilai + 1)} aria-label={`Tambah ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  )
}

/** Kalender + jam, satu komponen untuk semua halaman pemesanan.
 *
 *  Bentuknya mengikuti blok calendar-03 (21st.dev) yang dipilih user sejak
 *  awal: kalender di kiri, kolom tombol jam yang bisa di-scroll di kanan.
 *  Riwayatnya: 13 Sep kolom jam diganti dua tombol shift, 20 Sep shift dibuang
 *  (migrasi 014) dan diganti <input type="time">, 25 Sep kolom tombol jamnya
 *  dikembalikan, lalu diberi mode jam untuk MUA & fotografer (migrasi 016).
 *
 *  DUA MODE:
 *  - Harian (EO, florist, sewa jas): jam cuma keterangan. Yang habis kapasitas
 *    harian, dan itu sudah dijawab kalender lewat /availability.
 *  - Berbasis jam (MUA & fotografer — `paket` punya durasi_menit): memilih jam
 *    mulai menyalakan satu BLOK selama durasinya, dan jam mulai yang bentrok
 *    dengan pesanan lain dimatikan. Data bentroknya satu request
 *    /services/:id/jam per tanggal; kecocokannya dihitung di sini, karena
 *    durasi berubah tiap jumlah orang / jam tambahan diubah. Keputusan akhirnya
 *    tetap createBooking + constraint EXCLUDE di DB.
 *
 *  Dibangun di atas react-day-picker, bukan blok shadcn utuh: proyek ini tidak
 *  memakai shadcn/Radix sama sekali. Yang dipakai cuma grid bulan +
 *  aksesibilitas keyboardnya; seluruh tampilannya dari kelas Tailwind proyek. */
export default function KalenderSlot({
  serviceId,
  kategori,
  tanggal,
  jam,
  onPilih,
  labelJam = 'Jam Acara',
  keteranganJam,
  paket,
  jumlah = 1,
  tambahan = 0,
  onUbahDurasi,
}: {
  serviceId: string
  /** Menentukan rentang tombol jam — lihat RENTANG_JAM. */
  kategori: CategoryKey
  tanggal: string
  jam: string
  /** Dipanggil tiap tanggal atau jam berubah. Tanggal format YYYY-MM-DD,
   *  jam format HH:MM 24 jam — dua-duanya persis yang diminta backend. */
  onPilih: (tanggal: string, jam: string) => void
  /** Florist & sewa jas menyebutnya jam kirim, bukan jam acara. */
  labelJam?: string
  keteranganJam?: string
  /** Layanan yang dipesan. Kalau berbasis jam, kalender masuk mode jam. */
  paket?: ApiService
  /** Jumlah orang (paket per orang) dan jam tambahan — dikendalikan halaman,
   *  karena ikut menentukan harga dan dikirim ke POST /bookings. */
  jumlah?: number
  tambahan?: number
  onUbahDurasi?: (jumlah: number, tambahan: number) => void
}) {
  const [bulan, setBulan] = useState(() => new Date())
  const [hari, setHari] = useState<SlotKetersediaan[]>([])
  const [paling, setPaling] = useState<string>('')
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [terisi, setTerisi] = useState<{ tanggal: string; data: JamTerisi } | null>(null)
  // Lompat otomatis ke bulan pertama yang bisa dipesan cuma boleh SEKALI.
  // Tanpa penjaga ini, tiap kali orangnya menggeser ke bulan yang memang
  // kosong, kalendernya menarik dia balik dan bulan itu jadi tidak bisa
  // dilihat sama sekali.
  const sudahLompat = useRef(false)
  const kolomJam = useRef<HTMLDivElement>(null)
  const pilihanJam = useMemo(() => daftarJam(RENTANG_JAM[kategori]), [kategori])

  const modeJam = paket && berbasisJam(paket) ? paket : null
  const durasi = modeJam ? durasiPesanan(modeJam, jumlah, tambahan) : 0

  // Jam yang sudah terpilih (mis. dibawa dari halaman detail ke halaman
  // pesan) harus kelihatan tanpa orangnya menggulir. scrollTop kolomnya
  // saja yang digeser — scrollIntoView ikut menggeser seluruh halaman.
  // Cuma kalau tombolnya di luar pandangan, supaya klik tidak bikin lompat.
  useEffect(() => {
    const kolom = kolomJam.current
    const tombol = kolom?.querySelector<HTMLElement>('[data-mulai="true"]')
    if (!kolom || !tombol) return
    const atas = tombol.offsetTop - kolom.offsetTop
    if (atas < kolom.scrollTop || atas + tombol.offsetHeight > kolom.scrollTop + kolom.clientHeight) {
      kolom.scrollTop = atas - 8
    }
  }, [jam])

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

  // Mode jam: rentang yang sudah terkunci di tanggal terpilih. Disimpan
  // bersama tanggalnya, supaya data tanggal lama tidak dipakai menilai
  // tanggal baru selagi request-nya masih jalan.
  const perluJam = Boolean(modeJam && tanggal)
  useEffect(() => {
    if (!perluJam) return
    let batal = false
    listJamTerisi(serviceId, tanggal)
      .then((r) => !batal && setTerisi({ tanggal, data: r }))
      .catch(() => {}) // tanpa data ini semua jam tetap bisa dipilih; backend tetap menolak yang bentrok
    return () => { batal = true }
  }, [perluJam, serviceId, tanggal])

  const dataJam = terisi && terisi.tanggal === tanggal ? terisi.data : null

  /** Jam mulai `h` muat kalau ada SATU tim yang kosong selama
   *  [h, h + durasi + jeda). Aturan yang sama dengan timKosong() di backend. */
  const muat = (j: string) => {
    if (!dataJam) return true
    const mulai = menitDari(j)
    const akhir = mulai + durasi + dataJam.jeda_menit
    for (let n = 0; n < dataJam.kapasitas; n++) {
      const bentrok = dataJam.terisi.some((t) => t.slot_ke === n && t.mulai < akhir && mulai < t.selesai)
      if (!bentrok) return true
    }
    return false
  }

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
  const mulaiDipilih = jam ? menitDari(jam) : -1
  const jamDipilihMuat = !jam || muat(jam)

  let keterangan: string
  if (!tanggal) keterangan = 'Pilih tanggal dulu, lalu jamnya.'
  else if (modeJam) keterangan = jam
    ? `${jam} – ${tambahJam(jam, durasi)} · ${durasi / 60} jam`
    : `Pilih jam mulai. Durasi ${durasi / 60} jam akan terpilih otomatis.`
  else keterangan = keteranganJam
    ?? (sisa !== undefined && sisa > 0
      ? `Masih ada ${sisa} slot di tanggal ini. Jam tidak mengurangi slot.`
      : 'Jam bebas — vendor menyesuaikan.')

  return (
    <div>
      {/* Berdampingan mulai sm (panel pemesanan 420px masih muat: kalender
          menyempit karena selnya w-full), bertumpuk di HP. */}
      <div className="sm:flex sm:gap-4">
        <div className="relative min-w-0 flex-1">
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

        <div className="mt-5 sm:mt-0 sm:w-[88px] sm:shrink-0">
          <p id="label-jam" className="flex h-9 items-center text-[13px] font-semibold sm:justify-center">
            {modeJam ? 'Jam Mulai' : labelJam}
          </p>
          {galat ? (
            <p className="mt-2 text-[13px] text-maroon">{galat}</p>
          ) : (
            <div
              ref={kolomJam}
              role="group"
              aria-labelledby="label-jam"
              className="mt-2 grid max-h-[176px] grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:max-h-[268px] sm:grid-cols-1"
            >
              {pilihanJam.map((j) => {
                const m = menitDari(j)
                const mulai = m === mulaiDipilih
                // Blok durasi: jam-jam sesudah jam mulai yang ikut terpakai.
                const dalamBlok = modeJam && jam && m > mulaiDipilih && m < mulaiDipilih + durasi
                const mati = !tanggal || (modeJam !== null && !muat(j))
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={mati}
                    aria-pressed={mulai}
                    data-mulai={mulai}
                    title={mati && tanggal ? 'Bentrok dengan pesanan lain' : undefined}
                    onClick={() => onPilih(tanggal, j)}
                    className={`h-9 shrink-0 rounded-sm border text-[13px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      mulai
                        ? 'border-navy-900 bg-navy-900 text-white'
                        : dalamBlok
                          ? 'border-navy-900/40 bg-lavender text-navy-900'
                          : 'border-line bg-white hover:border-navy-900'
                    } ${mati && tanggal ? 'line-through' : ''}`}
                  >
                    {j}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {!galat && (
        <p className={`mt-3 text-[12px] leading-relaxed ${jamDipilihMuat ? 'text-muted' : 'text-maroon'}`}>
          {jamDipilihMuat ? keterangan : `${jam} bentrok dengan pesanan lain untuk durasi ini. Pilih jam lain.`}
        </p>
      )}

      {/* Mode jam: jumlah orang (paket per orang) dan jam tambahan. Mengubah
          keduanya memanjangkan blok, jadi letaknya di sini, bukan di form. */}
      {modeJam && onUbahDurasi && (modeJam.per_orang || modeJam.harga_per_jam_tambahan != null) && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {modeJam.per_orang && (
            <Pengatur
              label="Jumlah orang" nilai={jumlah} min={1} max={30}
              catatan={`${modeJam.durasi_menit} menit per orang`}
              onUbah={(n) => onUbahDurasi(n, tambahan)}
            />
          )}
          {modeJam.harga_per_jam_tambahan != null && (
            <Pengatur
              label="Jam tambahan" nilai={tambahan} min={0} max={MAKS_JAM_TAMBAHAN}
              catatan={`${rupiah(Number(modeJam.harga_per_jam_tambahan))} per jam`}
              onUbah={(n) => onUbahDurasi(jumlah, n)}
            />
          )}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import FlowLayout from '../components/FlowLayout'
import { OrderSection, OrderTextarea } from '../components/OrderLayout'
import Dropdown from '../components/Dropdown'
import { RENTANG_JAM, daftarJam } from '../lib/durasi'
import { CalendarIcon, MapPinIcon } from '../components/icons'
import { categories } from '../data/categories'
import { buatBooking } from '../lib/api'
import { KATEGORI_AI, bacaSimpanan } from '../lib/festaAi'
import { rupiah } from '../lib/format'

/** Tipe acara di form Festa AI -> event_type yang diterima POST /bookings. */
const EVENT_TYPE: Record<string, string> = {
  Pernikahan: 'wedding',
  Wisuda: 'graduation',
  'Gala Dinner': 'gala_dinner',
  Konferensi: 'corporate_seminar',
}

type Hasil = { ok: true; bookingId: string } | { ok: false; galat: string }

/** Memesan semua rekomendasi Festa AI sekaligus.
 *
 *  Tetap SATU PESANAN PER VENDOR lewat POST /bookings yang sama dengan
 *  halaman pesan biasa: tiap vendor menerima pesanannya sendiri, pengunci
 *  anti-bentrok bekerja per vendor, dan pembayarannya per pesanan. Yang gagal
 *  (slot keburu diambil, jam bentrok) tidak membatalkan yang lain.
 *
 *  Tanggal diambil dari form Festa AI. Yang ditanyakan di sini cuma yang
 *  memang khusus kategori: jam mulai (EO/MUA/fotografer) dan jam pengambilan
 *  (sewa jas/kebaya). Florist tidak ditanya jam (revisi PM 26 Sep). */
export default function PesanSemuaPage() {
  const [simpanan] = useState(bacaSimpanan)
  const [pilih, setPilih] = useState<string[]>(() => simpanan?.rekomendasi.map((r) => r.service_id) ?? [])
  const [jam, setJam] = useState<Record<string, string>>({})
  const [venue, setVenue] = useState('')
  const [catatan, setCatatan] = useState('')
  const [hasil, setHasil] = useState<Record<string, Hasil>>({})
  const [mengirim, setMengirim] = useState(false)
  const [galat, setGalat] = useState('')

  if (!simpanan?.rekomendasi.length || !simpanan.nilai.tanggal) {
    return (
      <FlowLayout title="Pesan Semua Rekomendasi">
        <p className="mt-7 border border-line bg-white px-5 py-10 text-center text-[15px] text-muted">
          Belum ada rekomendasi untuk dipesan.{' '}
          <Link to="/festa-ai" className="font-semibold text-navy-900 hover:underline">
            Cari paket di Festa AI
          </Link>{' '}
          dulu, lengkap dengan tanggal acaranya.
        </p>
      </FlowLayout>
    )
  }

  const { rekomendasi, nilai } = simpanan
  const butuhJam = (category: string) => category !== 'florist'
  const labelJam = (category: string) => (category === 'attire_rental' ? 'JAM PENGAMBILAN' : 'JAM MULAI')
  // Yang sudah berhasil tidak dikirim ulang saat user mencoba lagi.
  const antre = rekomendasi.filter((r) => pilih.includes(r.service_id) && !hasil[r.service_id]?.ok)
  const berhasil = rekomendasi.filter((r) => hasil[r.service_id]?.ok)
  const total = rekomendasi
    .filter((r) => pilih.includes(r.service_id))
    .reduce((sum, r) => sum + Number(r.price), 0)

  async function ajukan() {
    setGalat('')
    if (!antre.length) return setGalat('Pilih minimal satu layanan.')
    if (!venue.trim()) return setGalat('Venue dan alamat lengkap wajib diisi.')
    const tanpaJam = antre.find((r) => butuhJam(r.category) && !jam[r.service_id])
    if (tanpaJam) return setGalat(`Isi jam untuk ${tanpaJam.service_name}.`)

    setMengirim(true)
    // Berurutan, bukan paralel: pesan galatnya jadi bisa dipasangkan ke baris
    // masing-masing, dan paling banyak lima permintaan.
    for (const r of antre) {
      const detail = [
        r.category === 'attire_rental'
          ? `Sewa busana untuk ${nilai.tipe}, ukuran & warna dikonfirmasi lewat chat vendor`
          : venue.trim(),
        r.category === 'attire_rental' && `Acara di: ${venue.trim()}`,
        catatan.trim() && `Catatan: ${catatan.trim()}`,
        'Dipesan lewat Festa AI',
      ].filter(Boolean).join('\n')
      try {
        const b = await buatBooking({
          service_id: r.service_id,
          event_date: nilai.tanggal,
          ...(butuhJam(r.category) ? { start_time: jam[r.service_id] } : {}),
          event_type: EVENT_TYPE[nilai.tipe] ?? 'wedding',
          event_location_detail: detail,
        })
        setHasil((h) => ({ ...h, [r.service_id]: { ok: true, bookingId: b.booking.booking_id } }))
      } catch (e) {
        setHasil((h) => ({ ...h, [r.service_id]: { ok: false, galat: (e as Error).message } }))
      }
    }
    setMengirim(false)
  }

  return (
    <FlowLayout title="Pesan Semua Rekomendasi">
      <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-7">
          <OrderSection title="Informasi Acara" icon={<CalendarIcon />}>
            <p className="text-[14px] text-ink/80">
              {nilai.tipe} · {new Date(`${nilai.tanggal}T00:00:00`).toLocaleDateString('id-ID', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Tanggal mengikuti pencarian Festa AI. Mau tanggal lain?{' '}
              <Link to="/festa-ai" className="underline">Cari ulang</Link>.
            </p>
          </OrderSection>

          {/* Layanan didahulukan dari lokasi: dulu daftar yang sedang dipesan
              baru terlihat sesudah menggulung melewati form alamat. */}
          <OrderSection title="Layanan yang Dipesan">
            <ul className="divide-y divide-line">
              {rekomendasi.map((r) => {
                const kunci = KATEGORI_AI[r.category as keyof typeof KATEGORI_AI] ?? 'eo'
                const kat = categories[kunci]
                const h = hasil[r.service_id]
                return (
                  <li key={r.service_id} className="py-5 first:pt-0 last:pb-0">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={pilih.includes(r.service_id)}
                        disabled={h?.ok || mengirim}
                        onChange={(e) =>
                          setPilih((p) => (e.target.checked ? [...p, r.service_id] : p.filter((x) => x !== r.service_id)))
                        }
                        className="mt-1.5 h-4 w-4"
                      />
                      <span className="flex-1">
                        <span className="block font-semibold">{r.service_name}</span>
                        <span className="block text-[13px] text-ink/70">
                          {kat.label} · oleh {r.business_name} · {rupiah(Number(r.price))}
                        </span>
                      </span>
                    </label>

                    {pilih.includes(r.service_id) && !h?.ok && (
                      <div className="mt-3 pl-7">
                        {butuhJam(r.category) ? (
                          // Daftar jam penuh, sama dengan KalenderSlot di halaman pesan
                          // biasa. Dulu <input type="time"> bebas: MUA/fotografer bisa
                          // memilih 09:30 lalu ditolak backend ("harus jam penuh").
                          <div className="max-w-[220px]">
                            <label
                              htmlFor={`jam-${r.service_id}`}
                              className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70"
                            >
                              {labelJam(r.category)}
                            </label>
                            <Dropdown
                              id={`jam-${r.service_id}`}
                              value={jam[r.service_id] ?? ''}
                              onChange={(v) => setJam((j) => ({ ...j, [r.service_id]: v }))}
                              className="mt-2 h-11 w-full rounded-sm border border-line bg-white px-3 text-[14px] outline-none focus:border-navy-900"
                            >
                              <option value="">Pilih jam</option>
                              {daftarJam(RENTANG_JAM[kunci]).map((j) => (
                                <option key={j} value={j}>{j}</option>
                              ))}
                            </Dropdown>
                          </div>
                        ) : (
                          <p className="text-[12px] text-muted">Dikirim di tanggal acara, tanpa jam.</p>
                        )}
                      </div>
                    )}

                    {h && (
                      <p
                        className={`mt-3 ml-7 px-3 py-2 text-[13px] ${
                          h.ok ? 'bg-emerald-50 text-emerald-800' : 'border border-maroon/30 bg-maroon/5 text-maroon'
                        }`}
                      >
                        {h.ok ? 'Terkirim. Menunggu vendor menerima pesanan.' : h.galat}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </OrderSection>

          <OrderSection title="Lokasi Acara" icon={<MapPinIcon />}>
            <div className="space-y-5">
              <OrderTextarea
                id="venue"
                label="VENUE & ALAMAT LENGKAP"
                rows={3}
                placeholder="Nama gedung / rumah, jalan, kota"
                value={venue}
                onChange={setVenue}
              />
              <OrderTextarea
                id="catatan"
                label="CATATAN UNTUK SEMUA VENDOR (OPSIONAL)"
                rows={3}
                value={catatan}
                onChange={setCatatan}
              />
            </div>
          </OrderSection>

          <Link
            to="/festa-ai"
            className="inline-block border border-ink px-5 py-2.5 text-[12px] font-semibold tracking-wide"
          >
            KEMBALI KE FESTA AI
          </Link>
        </div>

        {/* RINGKASAN */}
        <aside className="h-fit border border-line bg-white p-6 lg:sticky lg:top-8">
          <h2 className="font-display text-[24px] font-semibold">Ringkasan</h2>
          <dl className="mt-5 space-y-2 text-[15px]">
            <div className="flex justify-between gap-4">
              <dt className="text-ink/85">Layanan dipilih</dt>
              <dd className="font-semibold">{pilih.length}</dd>
            </div>
            <div className="flex justify-between gap-4 text-[17px]">
              <dt>Total estimasi</dt>
              <dd className="font-semibold">{rupiah(total)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            Tiap vendor menerima pesanannya sendiri. Setelah diterima, DP dibayar per pesanan dari halaman
            Pesanan Saya.
          </p>

          {galat && (
            <p className="mt-4 border border-maroon/30 bg-maroon/5 px-3 py-2 text-[13px] text-maroon">{galat}</p>
          )}

          {antre.length > 0 && (
            <button
              type="button"
              onClick={ajukan}
              disabled={mengirim}
              className="mt-4 h-12 w-full rounded-sm bg-amber text-[16px] font-medium text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {mengirim ? 'Mengirim pesanan…' : berhasil.length ? 'Coba Lagi yang Gagal' : `Ajukan ${antre.length} Pesanan`}
            </button>
          )}

          {berhasil.length > 0 && (
            <Link
              to="/pesanan"
              className="mt-3 flex h-12 w-full items-center justify-center rounded-sm bg-navy-900 text-[15px] font-semibold text-white"
            >
              Lihat Pesanan Saya ({berhasil.length})
            </Link>
          )}
        </aside>
      </div>
    </FlowLayout>
  )
}

import { useEffect, useMemo, useState } from 'react'
import TabelSkeleton from '../components/TabelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link, useNavigate } from 'react-router-dom'
import Img from '../components/Img'
import { SearchIcon, ChevronDown } from '../components/icons'
import { categories, namaKota, type CategoryKey } from '../data/categories'
import { rupiah } from '../lib/format'
import {
  getToken, listMyBookings, batalBooking, kirimUlasan, bukaPercakapan, urlFotoLayanan,
  type ApiBooking,
} from '../lib/api'
import { rentangJam } from '../lib/durasi'

const KATEGORI: Record<string, CategoryKey> = {
  florist: 'florist',
  makeup_artist: 'mua',
  attire_rental: 'attire',
  photographer: 'fotografer',
  event_organizer: 'eo',
}

type Tab = 'semua' | 'menunggu' | 'aktif' | 'selesai' | 'dibatalkan'

const tabs: { id: Tab; label: string }[] = [
  { id: 'semua', label: 'SEMUA' },
  { id: 'menunggu', label: 'MENUNGGU' },
  { id: 'aktif', label: 'AKTIF' },
  { id: 'selesai', label: 'SELESAI' },
  { id: 'dibatalkan', label: 'DIBATALKAN' },
]

/** payment_status dari DB -> tab + badge yang dipakai mockup.
 *  'aktif' = DP sudah masuk tapi acaranya belum lewat; 'selesai' = lunas
 *  atau acaranya sudah terlewat. */
function statusPesanan(b: ApiBooking): { tab: Exclude<Tab, 'semua'>; badge: string; tone: string } {
  const lewat = new Date(b.event_date) < new Date(new Date().toDateString())

  if (b.payment_status === 'cancelled') {
    return { tab: 'dibatalkan', badge: 'DIBATALKAN', tone: 'bg-muted/15 text-muted' }
  }
  if (b.payment_status === 'expired') {
    return { tab: 'dibatalkan', badge: 'KEDALUWARSA — SLOT DILEPAS', tone: 'bg-muted/15 text-muted' }
  }
  // Ditolak vendor berhenti di sini: pesanannya memang batal, tapi alasannya
  // beda dari batal sendiri dan customer perlu tahu bedanya.
  if (b.confirm_status === 'ditolak') {
    return { tab: 'dibatalkan', badge: 'DITOLAK VENDOR', tone: 'bg-maroon/15 text-maroon' }
  }
  if (b.payment_status === 'pending') {
    return b.confirm_status === 'menunggu'
      ? { tab: 'menunggu', badge: 'MENUNGGU KONFIRMASI VENDOR', tone: 'bg-lavender text-navy-900' }
      : { tab: 'menunggu', badge: 'DITERIMA — MENUNGGU PEMBAYARAN DP', tone: 'bg-amber/15 text-amber' }
  }
  if (b.payment_status === 'dp_paid') {
    return lewat
      ? { tab: 'selesai', badge: 'ACARA SELESAI — MENUNGGU PELUNASAN', tone: 'bg-amber/15 text-amber' }
      : { tab: 'aktif', badge: 'DP LUNAS — MENUNGGU PELUNASAN', tone: 'bg-amber/15 text-amber' }
  }
  return lewat
    ? { tab: 'selesai', badge: 'PESANAN SELESAI & DANA DILEPAS', tone: 'bg-[#16a34a]/15 text-[#16a34a]' }
    : { tab: 'aktif', badge: 'LUNAS — MENUNGGU HARI ACARA', tone: 'bg-[#16a34a]/15 text-[#16a34a]' }
}

const tanggalPanjang = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

export default function PesananSayaPage() {
  const navigate = useNavigate()
  const [pesanan, setPesanan] = useState<ApiBooking[]>([])
  // Tamu tidak pernah memuat apa pun, jadi berangkat dari false — bukan true
  // lalu dimatikan lagi di dalam efek. Selain menghemat satu render, itu
  // menghapus satu-satunya setState sinkron di badan efek halaman ini.
  const [memuat, setMemuat] = useState(() => !!getToken())
  const [galat, setGalat] = useState('')
  const [tab, setTab] = useState<Tab>('semua')
  const [query, setQuery] = useState('')
  const [filterKategori, setFilterKategori] = useState('semua')
  const [sibuk, setSibuk] = useState('')
  // booking_id yang form ulasannya sedang terbuka. Satu form untuk seluruh
  // daftar, bukan satu state per kartu.
  const [ulasanUntuk, setUlasanUntuk] = useState('')
  const [nilai, setNilai] = useState(5)
  const [komentar, setKomentar] = useState('')

  // Satu-satunya pintu masuk obrolan pelanggan ke vendor: ruangannya lahir
  // dari pesanan. Backend idempoten, jadi tombol ini selalu mendarat di
  // ruangan yang sama walau ditekan berkali-kali.
  async function chatVendor(p: ApiBooking) {
    setSibuk(p.booking_id)
    setGalat('')
    try {
      const r = await bukaPercakapan({ booking_id: p.booking_id })
      navigate(`/pesan?c=${r.conversation.conversation_id}`)
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk('')
    }
  }

  async function batalkan(p: ApiBooking) {
    if (!window.confirm('Batalkan pesanan ini? Slotnya akan dilepas untuk orang lain.')) return
    setSibuk(p.booking_id)
    setGalat('')
    try {
      const r = await batalBooking(p.booking_id)
      setPesanan((lama) => lama.map((x) => (x.booking_id === p.booking_id ? r.booking : x)))
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk('')
    }
  }

  async function simpanUlasan(p: ApiBooking) {
    setSibuk(p.booking_id)
    setGalat('')
    try {
      const r = await kirimUlasan(p.booking_id, nilai, komentar.trim() || undefined)
      // Tempel hasilnya ke kartu yang bersangkutan supaya tombolnya langsung
      // berganti jadi bintang, tanpa mengambil ulang seluruh daftar.
      setPesanan((lama) =>
        lama.map((x) => (x.booking_id === p.booking_id ? { ...x, review: r.review } : x))
      )
      setUlasanUntuk('')
      setKomentar('')
      setNilai(5)
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk('')
    }
  }

  // Navbar menyembunyikan menu ini untuk tamu, tapi URL-nya tetap bisa dibuka
  // langsung (atau token kedaluwarsa di tengah sesi) — jadi halamannya punya
  // penanganannya sendiri, bukan error 401 mentah.
  const masuk = !!getToken()

  useEffect(() => {
    if (!masuk) return
    listMyBookings()
      .then((r) => setPesanan(r.data))
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [masuk])

  const terlihat = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pesanan.filter((p) => {
      const st = statusPesanan(p)
      if (tab !== 'semua' && st.tab !== tab) return false
      if (filterKategori !== 'semua' && p.category !== filterKategori) return false
      if (!q) return true
      return (
        p.booking_id.toLowerCase().includes(q)
        || p.business_name.toLowerCase().includes(q)
        || p.service_name.toLowerCase().includes(q)
      )
    })
  }, [pesanan, tab, query, filterKategori])

  const jumlah = (id: Tab) =>
    id === 'semua' ? pesanan.length : pesanan.filter((p) => statusPesanan(p).tab === id).length

  if (!masuk) {
    return (
      <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
        <div className="mx-auto mt-10 max-w-[520px] rounded-sm border border-line bg-white px-8 py-12 text-center">
          <h1 className="font-display text-[30px] font-semibold">Masuk dulu, ya</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
            Daftar pesanan terikat ke akun Anda. Masuk untuk melihat status pembayaran
            dan jadwal acara yang sudah dipesan.
          </p>
          <Link
            to="/masuk"
            className="mt-7 inline-flex h-11 items-center rounded bg-navy-900 px-8 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Masuk
          </Link>
          <p className="mt-4 text-[14px] text-ink">
            Belum punya akun?{' '}
            <Link to="/daftar" className="font-semibold text-[#2e6b52] hover:underline">
              Daftar
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <TukarHalus memuat={memuat} rangka={<TabelSkeleton kolom={4} baris={5} label="Memuat pesanan…" />}>
      {() => (
        <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
          <h1 className="font-display text-[28px] md:text-[38px] font-semibold">Pesanan Saya</h1>
          <p className="mt-2 max-w-[560px] text-[15px] leading-relaxed text-ink/75">
            Pantau status pembayaran, jadwal acara, dan dana escrow setiap pesanan Anda di satu tempat.
          </p>

          {/* PENCARIAN & FILTER */}
          <div className="mt-8 flex flex-wrap gap-4">
            <div className="relative min-w-[280px] flex-1">
              <SearchIcon className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nomor pesanan, nama vendor, atau jenis layanan..."
                aria-label="Cari pesanan"
                className="h-12 w-full rounded-sm border border-line bg-white pr-4 pl-11 text-[14px] outline-none placeholder:text-ink/40 focus:border-navy-900"
              />
            </div>

            <div className="relative w-[280px]">
              <select
                aria-label="Filter kategori"
                value={filterKategori}
                onChange={(e) => setFilterKategori(e.target.value)}
                className="h-12 w-full appearance-none rounded-sm border border-line bg-white px-4 pr-9 text-[14px] outline-none focus:border-navy-900"
              >
                <option value="semua">Semua Layanan</option>
                {Object.entries(KATEGORI).map(([api, key]) => (
                  <option key={api} value={api}>{categories[key].label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink/50" />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            {tabs.map((t) => {
              const n = jumlah(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={tab === t.id}
                  disabled={n === 0}
                  className={`rounded-sm px-3.5 py-2 text-[11px] font-semibold tracking-[0.04em] transition-colors ${
                    tab === t.id
                      ? 'bg-ink text-white'
                      : n === 0
                        ? 'bg-lavender/20 text-muted'
                        : 'bg-lavender/40 text-ink hover:bg-lavender/60'
                  }`}
                >
                  {t.label} ({n})
                </button>
              )
            })}
          </div>

          {galat && (
            <p className="mt-8 border border-maroon/30 bg-maroon/5 px-5 py-4 text-[14px] text-maroon">
              {galat}
            </p>
          )}

          {/* DAFTAR PESANAN */}
          <div className="mt-8 space-y-6">
            {terlihat.map((p) => {
              const kat = categories[KATEGORI[p.category] ?? 'eo']
              const st = statusPesanan(p)
              const harga = Number(p.total_price)
              const dp = Number(p.dp_amount)
              const lunasDp = p.payments.some(
                (x) => x.payment_type === 'down_payment' && x.gateway_status === 'success'
              )
              const lunasPenuh = p.payment_status === 'fully_paid'
              // Tagihan yang masih menggantung, kalau ada.
              const tertunda = p.payments.find((x) => x.gateway_status === 'pending')

              return (
                <article key={p.booking_id} className="border border-line bg-white">
                  <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                    <div className="flex flex-wrap items-center gap-3 text-[13px]">
                      <span className="font-display text-[17px] font-semibold">
                        #{p.booking_id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-muted">• Dipesan {tanggalPanjang(p.created_at)} •</span>
                      <span className="rounded-sm bg-lavender/50 px-2.5 py-1 text-[10px] font-semibold tracking-[0.04em] text-navy-700">
                        {kat.label.toUpperCase()}
                      </span>
                    </div>
                    <span className={`rounded-sm px-3 py-1.5 text-[10px] font-semibold tracking-[0.04em] ${st.tone}`}>
                      {st.badge}
                    </span>
                  </header>

                  <div className="grid gap-6 px-6 pb-5 lg:grid-cols-[210px_1fr_330px]">
                    {/* Dulu <Img> ini dipasang TANPA src sama sekali, jadi
                        selamanya jatuh ke fallback — bug yang sama dengan
                        halaman florist dan kartu rekomendasi di landing.
                        Fotonya diambil per LAYANAN, bukan per vendor: yang
                        dipesan layanannya, dan itu yang fotonya dilihat user
                        waktu memesan. Slot kosong dibalas 404 dan Img jatuh ke
                        blok polos lewat onError. */}
                    <Img
                      src={urlFotoLayanan(p.service_id)}
                      alt={p.service_name}
                      tint={kat.tint}
                      className="h-[130px] w-full object-cover"
                    />

                    <div>
                      <h2 className="font-display text-[21px] font-semibold">{p.business_name}</h2>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-ink/80">{p.service_name}</p>

                      <dl className="mt-4 flex flex-wrap gap-8 border-y border-line py-3">
                        <div>
                          <dt className="text-[10px] font-semibold tracking-[0.04em] text-muted">TANGGAL ACARA</dt>
                          <dd className="mt-1 text-[13px] font-semibold">
                            {tanggalPanjang(p.event_date)} · {rentangJam(p)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-semibold tracking-[0.04em] text-muted">KOTA VENDOR</dt>
                          <dd className="mt-1 text-[13px] font-semibold">{namaKota(p.city)}</dd>
                        </div>
                      </dl>

                      {/* Detail lokasi disimpan multi-baris (venue, catatan,
                          ukuran) — ditampilkan apa adanya. */}
                      <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-ink/75">
                        {p.event_location_detail}
                      </p>
                    </div>

                    <div className="h-fit bg-lavender/25 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-semibold tracking-[0.04em] text-ink/70">
                          RINCIAN ESCROW
                        </span>
                        <span className="text-[9px] font-semibold tracking-[0.04em] text-muted">
                          TAHAP {lunasPenuh ? '2/2' : lunasDp ? '2/2' : '1/2'}
                        </span>
                      </div>

                      <dl className="mt-2.5 space-y-1">
                        <div className="flex items-baseline gap-2">
                          <dt className="text-[13px]">
                            DP {Math.round((dp / harga) * 100)}%{lunasDp ? ' lunas:' : ':'}
                          </dt>
                          <dd className="text-[17px] font-semibold">{rupiah(dp)}</dd>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <dt className="text-[13px]">Sisa pelunasan:</dt>
                          <dd
                            className={`font-semibold ${
                              lunasPenuh ? 'text-[17px]' : 'text-[15px] text-[#c0392b]'
                            }`}
                          >
                            {rupiah(harga - dp)}
                          </dd>
                        </div>
                      </dl>

                      <p className="mt-2 text-[11px] leading-relaxed text-ink/70">
                        {lunasPenuh
                          ? '*Dana ditahan Festa Escrow dan dilepas ke vendor setelah acara selesai.'
                          : '*Dana dipegang aman oleh Festa Escrow sampai acara Anda selesai.'}
                      </p>
                    </div>
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3.5">
                    <span className="text-[11px] text-muted">
                      {p.payment_status === 'pending' && p.confirm_status === 'menunggu'
                        && 'Slot ditahan sementara. Vendor punya 24 jam untuk menjawab.'}
                      {p.payment_status === 'pending' && p.confirm_status === 'diterima'
                        && 'Slot ditahan sampai DP masuk — selesaikan pembayaran agar tidak dilepas.'}
                      {p.confirm_status === 'ditolak' && p.confirm_note
                        && `Alasan vendor: ${p.confirm_note}`}
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      <Link
                        to={`/${kat.slug}/${p.vendor_id}`}
                        className="rounded-sm bg-lavender/40 px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em] transition-colors hover:bg-lavender/60"
                      >
                        LIHAT PROFIL VENDOR
                      </Link>

                      <button
                        type="button"
                        onClick={() => chatVendor(p)}
                        disabled={sibuk === p.booking_id}
                        className="rounded-sm bg-navy-900 px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        CHAT VENDOR
                      </button>

                      <Link
                        to={`/invoice/${p.booking_id}`}
                        className="rounded-sm border border-line px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em] transition-colors hover:border-navy-900"
                      >
                        INVOICE
                      </Link>

                      {/* Tagihan yang masih menggantung bisa dibuka lagi. */}
                      {tertunda && (
                        <Link
                          to={`/pembayaran/${tertunda.payment_id}`}
                          className="rounded-sm bg-amber px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em] text-navy-900 transition-opacity hover:opacity-90"
                        >
                          LANJUTKAN PEMBAYARAN
                        </Link>
                      )}

                      {!tertunda && lunasDp && !lunasPenuh && (
                        <Link
                          to={`/checkout/${p.booking_id}`}
                          className="rounded-sm bg-amber px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em] text-navy-900 transition-opacity hover:opacity-90"
                        >
                          BAYAR PELUNASAN ({rupiah(harga - dp)})
                        </Link>
                      )}

                      {/* Backend menolak pembayaran selama vendor belum setuju,
                          jadi tombolnya pun jangan ditawarkan lebih dulu. */}
                      {!tertunda && !lunasDp && p.payment_status === 'pending'
                        && p.confirm_status === 'diterima' && (
                        <Link
                          to={`/checkout/${p.booking_id}`}
                          className="rounded-sm bg-amber px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em] text-navy-900 transition-opacity hover:opacity-90"
                        >
                          BAYAR DP ({rupiah(dp)})
                        </Link>
                      )}

                      {/* Hanya selama belum ada uang masuk — sesudah itu backend
                          menolak, karena refund di luar lingkup proyek ini. */}
                      {p.payment_status === 'pending' && (
                        <button
                          type="button"
                          disabled={sibuk === p.booking_id}
                          onClick={() => batalkan(p)}
                          className="rounded-sm border border-line px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em] text-maroon transition-colors hover:border-maroon disabled:opacity-60"
                        >
                          {sibuk === p.booking_id ? 'MEMPROSES…' : 'BATALKAN'}
                        </button>
                      )}

                      {p.review && (
                        <span className="rounded-sm bg-lavender/40 px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em]">
                          ULASAN ANDA {'★'.repeat(p.review.rating)}
                          <span className="text-muted">{'★'.repeat(5 - p.review.rating)}</span>
                        </span>
                      )}

                      {/* Syaratnya sama persis dengan yang dijaga backend:
                          lunas dan acaranya sudah lewat. */}
                      {!p.review && lunasPenuh
                        && new Date(p.event_date) < new Date(new Date().toDateString()) && (
                        <button
                          type="button"
                          onClick={() =>
                            setUlasanUntuk((v) => (v === p.booking_id ? '' : p.booking_id))
                          }
                          className="rounded-sm bg-navy-900 px-3.5 py-2 text-[10px] font-semibold tracking-[0.04em] text-white transition-opacity hover:opacity-90"
                        >
                          {ulasanUntuk === p.booking_id ? 'TUTUP' : 'BERI ULASAN'}
                        </button>
                      )}
                    </div>
                  </footer>

                  {ulasanUntuk === p.booking_id && (
                    <div className="border-t border-line px-6 py-5">
                      <p className="text-[11px] font-semibold tracking-[0.04em] text-ink/70">
                        BAGAIMANA PENGALAMAN ANDA DENGAN {p.business_name.toUpperCase()}?
                      </p>

                      <div className="mt-3 flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setNilai(n)}
                            aria-label={`Beri ${n} bintang`}
                            aria-pressed={nilai === n}
                            className={`text-[26px] leading-none transition-colors ${
                              n <= nilai ? 'text-amber' : 'text-line'
                            }`}
                          >
                            ★
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={komentar}
                        onChange={(e) => setKomentar(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        placeholder="Ceritakan pengalaman Anda (boleh dikosongkan)"
                        className="mt-3 w-full rounded-sm border border-line px-3 py-2 text-[14px] outline-none focus:border-navy-900"
                      />

                      <button
                        type="button"
                        disabled={sibuk === p.booking_id}
                        onClick={() => simpanUlasan(p)}
                        className="mt-3 h-10 rounded-sm bg-navy-900 px-6 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        {sibuk === p.booking_id ? 'Mengirim…' : 'Kirim Ulasan'}
                      </button>
                    </div>
                  )}
                </article>
              )
            })}

            {!memuat && terlihat.length === 0 && (
              <p className="border border-line bg-white py-16 text-center text-[15px] text-muted">
                {pesanan.length === 0
                  ? 'Anda belum punya pesanan. Mulai dari halaman kategori vendor.'
                  : 'Tidak ada pesanan pada filter ini.'}
              </p>
            )}
          </div>

          {/* BANTUAN */}
          <section className="mt-10 flex flex-wrap items-center justify-between gap-6 border border-line bg-white p-7">
            <div className="flex gap-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-navy-900 text-[18px]">
                🎧
              </span>
              <div className="max-w-[330px]">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-amber">
                  LAYANAN PRIORITAS <span className="text-muted">• Tersedia 24/7</span>
                </p>
                <h2 className="mt-1.5 font-display text-[19px] font-semibold">
                  Butuh bantuan dengan pesanan Anda?
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/75">
                  Tim Concierge Festa Festum siap membantu mediasi vendor, penyesuaian jadwal acara penting,
                  hingga konfirmasi pengembalian dana perlindungan escrow.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-sm border border-line bg-lavender/25 px-4 py-2.5 text-[11px] font-semibold tracking-[0.04em] transition-colors hover:bg-lavender/40"
              >
                PUSAT BANTUAN FAQ
              </button>
              <button
                type="button"
                className="rounded-sm bg-ink px-4 py-2.5 text-[11px] font-semibold tracking-[0.04em] text-white transition-opacity hover:opacity-90"
              >
                HUBUNGI CONCIERGE
              </button>
            </div>
          </section>
        </div>
      )}
    </TukarHalus>
  )
}

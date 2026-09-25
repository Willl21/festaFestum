import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TukarHalus from '../components/TukarHalus'
import TabelSkeleton from '../components/TabelSkeleton'
import { VendorPageHeader } from '../components/VendorLayout'
import { SearchIcon, ArrowRight } from '../components/icons'
import { rupiah } from '../lib/format'
import {
  listPercakapan, getPercakapan, kirimPesan, bukaPercakapan, usePengguna, getMyServices,
  type ApiPercakapan, type ApiPesan, type ApiService, type JenisChat,
} from '../lib/api'
import KartuRekomendasi from '../components/KartuRekomendasi'

/** Pusat Obrolan vendor (mockup "Portal Vendor — Chat Klien & Admin").
 *
 *  Dua tab, dua jenis percakapan yang sama-sama sudah ada di backend:
 *  klien_vendor (per pesanan, dibuka klien atau vendor) dan admin_vendor
 *  (satu tiket per vendor ke tim admin).
 *
 *  Yang di mockup tapi TIDAK dibuat, karena tidak ada mekanismenya di
 *  belakang: SLA respon 98%, "Enkripsi SHA-256", template balasan siap pakai,
 *  lampiran berkas, tombol "Kirim Tagihan Termin 2" / "Ajukan BAST", dan
 *  "Buat Catatan Acara". Menampilkannya berarti memajang angka dan tombol
 *  yang tidak melakukan apa-apa — pelajaran yang sama dengan lima tombol mati
 *  yang dibuang dari halaman keuangan.
 */

const KATEGORI: Record<string, string> = {
  florist: 'Florist',
  makeup_artist: 'Makeup Artist',
  attire_rental: 'Sewa Jas / Kebaya',
  photographer: 'Fotografer',
  event_organizer: 'Event Organizer',
}

const BADGE: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Menunggu pembayaran', tone: 'bg-lavender text-navy-900' },
  dp_paid: { label: 'DP masuk escrow', tone: 'bg-amber/15 text-amber' },
  fully_paid: { label: 'Lunas', tone: 'bg-[#16a34a]/15 text-[#16a34a]' },
  cancelled: { label: 'Dibatalkan', tone: 'bg-muted/15 text-muted' },
  expired: { label: 'Kedaluwarsa', tone: 'bg-muted/15 text-muted' },
}

const jam = (s: string) =>
  new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

const tanggal = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

const inisial = (nama: string) =>
  nama.split(/\s+/).slice(0, 2).map((k) => k[0]).join('').toUpperCase()

// ponytail: polling, sama seperti halaman obrolan pelanggan.
const JEDA_TARIK_MS = 10_000

export default function VendorPesanPage() {
  const user = usePengguna()
  // Dibuka dari /vendor/pemesanan lewat ?c=<id>, jadi tombol di sana tidak
  // perlu tahu apa-apa selain id ruangan yang baru dibukanya.
  const [cari, setCari] = useSearchParams()
  const dariUrl = cari.get('c') || ''
  const [tab, setTab] = useState<Extract<JenisChat, 'klien_vendor' | 'admin_vendor'>>('klien_vendor')
  const [daftar, setDaftar] = useState<ApiPercakapan[]>([])
  const [aktif, setAktif] = useState('')
  const [pesan, setPesan] = useState<ApiPesan[]>([])
  const [kepala, setKepala] = useState<ApiPercakapan | null>(null)
  // Paket aktif milik vendor ini — pilihan untuk "Rekomendasikan Paket" di
  // ruang klien (migrasi 017). Diambil sekali; gagal = fitur itu disembunyikan.
  const [paketSaya, setPaketSaya] = useState<ApiService[]>([])
  const [paketDipilih, setPaketDipilih] = useState('')
  useEffect(() => {
    getMyServices()
      .then((r) => setPaketSaya(r.data.filter((x) => x.is_active)))
      .catch(() => {})
  }, [])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [teks, setTeks] = useState('')
  const [kirim, setKirim] = useState(false)
  const [query, setQuery] = useState('')
  // Di bawah lg, daftar dan ruang obrolan TIDAK ditumpuk: satu layar satu
  // panel, seperti aplikasi pesan mana pun. Menumpuknya berarti di HP harus
  // menggulung melewati seluruh daftar dulu sebelum sampai ke pesannya.
  // Penandanya cuma untuk kelas CSS; di lg ke atas keduanya tampil bersama.
  const [ruangDiHp, setRuangDiHp] = useState(() => !!cari.get('c'))
  const kotakPesan = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let hidup = true

    const tarik = () =>
      listPercakapan(tab === 'admin_vendor' ? 'admin_vendor' : undefined)
        .then((r) => {
          if (!hidup) return
          const data = tab === 'admin_vendor' ? r.data : r.data.filter((c) => c.jenis !== 'admin_vendor')
          setDaftar(data)
          setAktif((lama) => {
            // Pilihan lama dipertahankan hanya kalau masih ada di tab ini —
            // kalau tidak, ruangannya milik tab sebelah dan kepalanya akan
            // menampilkan konteks yang salah.
            const masihAda = data.some((c) => c.conversation_id === lama)
            return masihAda ? lama : dariUrl || data[0]?.conversation_id || ''
          })
        })
        .catch((e) => hidup && setGalat(e.message))
        .finally(() => hidup && setMemuat(false))

    tarik()
    const t = setInterval(tarik, JEDA_TARIK_MS)
    return () => {
      hidup = false
      clearInterval(t)
    }
  }, [tab, dariUrl])

  useEffect(() => {
    if (!aktif) return
    let hidup = true

    const tarik = () =>
      getPercakapan(aktif)
        .then((r) => {
          if (!hidup) return
          setPesan(r.data)
          setKepala(r.conversation)
        })
        .catch((e) => hidup && setGalat(e.message))

    tarik()
    const t = setInterval(tarik, JEDA_TARIK_MS)
    return () => {
      hidup = false
      clearInterval(t)
    }
  }, [aktif])

  // Menggulung KOTAKNYA sendiri, bukan scrollIntoView pada penanda di dasar:
  // scrollIntoView ikut menggulung semua leluhur, termasuk dokumen, jadi di
  // layar sempit seluruh halaman melompat ke bawah dan judul + tombol kembali
  // ikut terlewat. Dijalankan tiap jumlah pesan bertambah, bukan tiap render,
  // supaya penarikan ulang yang tidak membawa apa-apa tidak merebut posisi
  // gulungan yang sedang dibaca orangnya.
  useEffect(() => {
    const el = kotakPesan.current
    if (el) el.scrollTop = el.scrollHeight
  }, [pesan.length, aktif])

  const terlihat = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return daftar
    return daftar.filter(
      (c) =>
        (c.nama_klien || '').toLowerCase().includes(q)
        || (c.booking_id || '').toLowerCase().includes(q)
    )
  }, [daftar, query])

  // "Ruangnya belum siap" diturunkan, bukan disimpan di state sendiri: kepala
  // dan isi percakapan selalu datang dari SATU fetch, jadi selama kepala belum
  // menunjuk ruangan yang dipilih, isinya memang belum ada. Tanpa ini kotaknya
  // memajang "belum ada pesan" selagi datanya masih jalan — keterangan yang
  // salah, dan itu yang paling bikin ragu waktu ruangan pertama kali dibuka.
  const ruangSiap = !!aktif && kepala?.conversation_id === aktif

  async function kirimkan(e: React.FormEvent) {
    e.preventDefault()
    const isi = teks.trim()
    if (!isi || !aktif) return
    setKirim(true)
    setGalat('')
    try {
      const r = await kirimPesan(aktif, isi)
      setPesan((lama) => [...lama, r.message])
      setTeks('')
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setKirim(false)
    }
  }

  async function kirimRekomendasi() {
    if (!paketDipilih || !aktif) return
    setKirim(true)
    setGalat('')
    try {
      const r = await kirimPesan(aktif, teks.trim(), paketDipilih)
      setPesan((lama) => [...lama, r.message])
      setTeks('')
      setPaketDipilih('')
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setKirim(false)
    }
  }

  // Tiket ke admin dibuka dari sisi vendor; backend-nya idempoten, jadi tombol
  // ini aman ditekan berkali-kali dan selalu mendarat di ruangan yang sama.
  async function bukaTiketAdmin() {
    setGalat('')
    try {
      const r = await bukaPercakapan({ jenis: 'admin_vendor' })
      setDaftar((lama) =>
        lama.some((c) => c.conversation_id === r.conversation.conversation_id)
          ? lama
          : [r.conversation, ...lama]
      )
      setAktif(r.conversation.conversation_id)
      setRuangDiHp(true)
    } catch (err) {
      setGalat((err as Error).message)
    }
  }

  const tabs = [
    { id: 'klien_vendor' as const, label: 'Chat Klien / Pesanan' },
    { id: 'admin_vendor' as const, label: 'Chat Tim Admin' },
  ]

  return (
    <TukarHalus memuat={memuat} rangka={<TabelSkeleton kolom={3} baris={6} label="Memuat obrolan…" />}>
      {() => (
        <>
          <VendorPageHeader
            title="Pusat Obrolan"
            description="Kelola komunikasi pesanan dengan klien, dan koordinasi operasional dengan tim admin Festa Festum."
            action={
              tab === 'admin_vendor' && daftar.length === 0 ? (
                <button
                  type="button"
                  onClick={bukaTiketAdmin}
                  className="rounded-md bg-navy-900 px-5 py-3 text-[13px] font-semibold text-white"
                >
                  Buka Tiket ke Admin
                </button>
              ) : undefined
            }
          />

          {galat && (
            <p className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
              {galat}
            </p>
          )}

          <div className="mt-7 flex flex-wrap gap-2 border-b border-line">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id)
                  setAktif('')
                  setRuangDiHp(false)
                  setPesan([])
                  setKepala(null)
                }}
                aria-current={tab === t.id}
                className={`-mb-px border-b-2 px-4 py-3 text-[14px] font-medium ${
                  tab === t.id
                    ? 'border-navy-900 text-navy-900'
                    : 'border-transparent text-ink/60 hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {daftar.length === 0 ? (
            <div className="mt-8 rounded-lg border border-line bg-white px-8 py-14 text-center">
              <h2 className="font-display text-[22px] font-semibold">
                {tab === 'klien_vendor' ? 'Belum ada obrolan klien' : 'Belum ada tiket admin'}
              </h2>
              <p className="mx-auto mt-2 max-w-[460px] text-[15px] text-ink/70">
                {tab === 'klien_vendor' ? (
                  <>
                    Obrolan muncul begitu ada klien yang memesan layanan Anda. Anda juga bisa
                    memulainya dari <Link to="/vendor/pemesanan" className="font-semibold hover:underline">
                      Pemesanan
                    </Link>.
                  </>
                ) : (
                  'Buka tiket kalau ada kendala pencairan, verifikasi, atau pesanan bermasalah.'
                )}
              </p>
            </div>
          ) : (
            <div className="mt-7 grid gap-6 lg:grid-cols-[340px_1fr]">
              {/* --- daftar --- */}
              <section
                className={`h-fit rounded-lg border border-line bg-white p-4 ${
                  ruangDiHp ? 'hidden lg:block' : ''
                }`}
              >
                <label className="relative block">
                  <span className="sr-only">Cari klien atau nomor pesanan</span>
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari nama klien atau kode pesanan…"
                    className="h-11 w-full rounded-md border border-line bg-white pr-3 pl-9 text-[14px] outline-none focus:border-navy-900"
                  />
                </label>

                <ul className="mt-4 space-y-1">
                  {terlihat.map((c) => {
                    const badge = c.payment_status ? BADGE[c.payment_status] : null
                    const nama = c.jenis === 'admin_vendor' ? 'Tim Admin Festa Festum' : c.nama_klien
                    return (
                      <li key={c.conversation_id}>
                        <button
                          type="button"
                          onClick={() => {
                            // Isi ruangan dikosongkan HANYA kalau ruangannya memang berganti. Kalau
                            // id-nya sama (mis. balik dari daftar lalu membuka ruangan yang itu
                            // juga), efek penariknya TIDAK jalan lagi karena dependensinya tidak
                            // berubah — mengosongkan di sini berarti ruangan blank sampai polling
                            // 10 detik berikutnya. Itu yang bikin obrolan terasa menggantung.
                            if (c.conversation_id !== aktif) {
                              setPesan([])
                              setKepala(null)
                            }
                            setAktif(c.conversation_id)
                            setRuangDiHp(true)
                            if (dariUrl) setCari({}, { replace: true })
                            setDaftar((lama) =>
                              lama.map((x) =>
                                x.conversation_id === c.conversation_id
                                  ? { ...x, belum_dibaca: 0 }
                                  : x
                              )
                            )
                          }}
                          aria-current={c.conversation_id === aktif}
                          className={`flex w-full gap-3 rounded-md border-l-[3px] p-3 text-left transition-colors ${
                            c.conversation_id === aktif
                              ? 'border-amber bg-lavender/30'
                              : 'border-transparent hover:bg-lavender/15'
                          }`}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy-900 text-[12px] font-semibold text-white">
                            {inisial(nama || 'FF')}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[14px] font-semibold">{nama}</span>
                              {c.pesan_terakhir_at && (
                                <span className="shrink-0 text-[11px] text-muted">
                                  {jam(c.pesan_terakhir_at)}
                                </span>
                              )}
                            </span>
                            {c.booking_id && (
                              <span className="mt-0.5 block truncate text-[12px] text-muted">
                                #{c.booking_id.slice(0, 8).toUpperCase()}
                                {c.event_date && ` • ${tanggal(c.event_date)}`}
                              </span>
                            )}
                            {c.jenis === 'konsultasi' && (
                              <span className="mt-0.5 block truncate text-[12px] text-muted">Konsultasi</span>
                            )}
                            <span className="mt-1.5 block truncate text-[13px] text-ink/70">
                              {c.pesan_terakhir || 'Belum ada pesan'}
                            </span>
                            <span className="mt-2 flex items-center justify-between gap-2">
                              {badge && (
                                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}>
                                  {badge.label}
                                </span>
                              )}
                              {c.belum_dibaca > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-navy-900 px-1.5 text-[11px] font-semibold text-white">
                                  {c.belum_dibaca}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                  {terlihat.length === 0 && (
                    <li className="px-3 py-6 text-center text-[13px] text-muted">
                      Tidak ada yang cocok dengan “{query}”.
                    </li>
                  )}
                </ul>
              </section>

              {/* --- ruang obrolan --- */}
              <section
                className={`min-h-[560px] flex-col rounded-lg border border-line bg-white ${
                  ruangDiHp ? 'flex' : 'hidden lg:flex'
                }`}
              >
                {/* Header selalu dirender, bahkan selagi isi ruangan dimuat:
                    tombol kembali ada di dalamnya, dan di HP menyembunyikannya
                    selama menunggu berarti tidak ada jalan keluar sama sekali. */}
                <header className="border-b border-line p-5">
                    <button
                      type="button"
                      onClick={() => setRuangDiHp(false)}
                      className="mb-3 text-[13px] font-medium text-ink/70 hover:text-ink lg:hidden"
                    >
                      <ArrowRight className="mr-1 inline h-4 w-4 rotate-180 align-[-3px]" /> Semua obrolan
                    </button>
                    {!kepala && (
                      <div>
                        <div className="shimmer h-5 w-44 max-w-full rounded-sm bg-line/70" />
                        <div className="shimmer mt-2 h-3 w-56 max-w-full rounded-sm bg-line/50" />
                      </div>
                    )}
                    {kepala && (
                    <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-[20px] font-semibold">
                        {kepala.jenis === 'admin_vendor'
                          ? 'Tim Admin Festa Festum'
                          : kepala.nama_klien}
                      </h2>
                      <p className="text-[13px] text-ink/70">
                        {kepala.booking_id
                          ? `#${kepala.booking_id.slice(0, 8).toUpperCase()}`
                          : kepala.jenis === 'konsultasi'
                            ? 'Konsultasi sebelum pemesanan — rekomendasikan paket di bawah'
                            : 'Koordinasi operasional'}
                        {kepala.event_date && ` • ${tanggal(kepala.event_date)}`}
                        {kepala.category && ` • ${KATEGORI[kepala.category] || kepala.category}`}
                      </p>
                    </div>
                    {kepala.total_price && (
                      <div className="text-right">
                        <p className="text-[12px] text-muted">Nilai pesanan</p>
                        <p className="text-[17px] font-semibold">
                          {rupiah(Number(kepala.total_price))}
                        </p>
                        <Link
                          to="/vendor/pemesanan"
                          className="mt-1 inline-block text-[13px] font-medium hover:underline"
                        >
                          Lihat di Pemesanan
                        </Link>
                      </div>
                    )}
                    </div>
                    )}
                  </header>

                <div ref={kotakPesan} className="flex-1 space-y-4 overflow-y-auto p-5">
                  {!ruangSiap && (
                    <div className="space-y-4" role="status" aria-live="polite">
                      <span className="sr-only">Memuat pesan…</span>
                      {[0, 1, 2].map((i) => (
                        <div key={i} className={i % 2 ? 'flex justify-end' : 'flex justify-start'}>
                          <div className="w-[62%] max-w-[300px]">
                            <div className="shimmer h-3 w-20 rounded-sm bg-line/70" />
                            <div
                              className="shimmer mt-2 rounded-lg bg-line/60"
                              style={{ height: 52 + i * 14 }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {ruangSiap && pesan.length === 0 && (
                    <p className="py-10 text-center text-[13px] text-muted">
                      Belum ada pesan di ruangan ini.
                    </p>
                  )}
                  {pesan.map((m, i) => {
                    const dariSaya = m.sender_user_id === user?.user_id
                    const hariBaru =
                      i === 0
                      || new Date(m.created_at).toDateString()
                        !== new Date(pesan[i - 1].created_at).toDateString()
                    return (
                      <div key={m.message_id}>
                        {hariBaru && (
                          <p className="my-4 text-center">
                            <span className="rounded-full bg-lavender/40 px-3 py-1 text-[11px] text-ink/70">
                              {tanggal(m.created_at)}
                            </span>
                          </p>
                        )}
                        <div className={dariSaya ? 'flex justify-end' : 'flex justify-start'}>
                          <div className="max-w-[78%]">
                            <p className="mb-1 text-[12px] font-semibold text-ink/70">
                              {dariSaya ? 'Anda' : m.nama_pengirim}
                              {m.peran_pengirim === 'admin' && ' • Admin'}
                            </p>
                            {m.service_id ? (
                              <KartuRekomendasi pesan={m} vendorId={kepala?.vendor_id ?? null} untukKlien={false} />
                            ) : (
                              <p
                                className={`rounded-lg px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap ${
                                  dariSaya
                                    ? 'bg-navy-900 text-white'
                                    : 'border border-line bg-cream text-ink'
                                }`}
                              >
                                {m.body}
                              </p>
                            )}
                            <p className={`mt-1 text-[11px] text-muted ${dariSaya ? 'text-right' : ''}`}>
                              {jam(m.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {kepala && kepala.jenis !== 'admin_vendor' && paketSaya.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 pt-3">
                    <label htmlFor="paket-rekomendasi" className="text-[12px] font-semibold text-ink/70">
                      Rekomendasikan paket
                    </label>
                    <select
                      id="paket-rekomendasi"
                      value={paketDipilih}
                      onChange={(e) => setPaketDipilih(e.target.value)}
                      className="h-9 min-w-0 flex-1 rounded-md border border-line bg-white px-2 text-[13px] outline-none focus:border-navy-900"
                    >
                      <option value="">Pilih paket…</option>
                      {paketSaya.map((x) => (
                        <option key={x.service_id} value={x.service_id}>{x.service_name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={kirimRekomendasi}
                      disabled={!paketDipilih || kirim}
                      title="Teks di kotak pesan ikut terkirim sebagai catatan"
                      className="h-9 shrink-0 rounded-md border border-navy-900/30 px-3 text-[13px] font-semibold text-navy-900 hover:border-navy-900 disabled:opacity-50"
                    >
                      Kirim Rekomendasi
                    </button>
                  </div>
                )}

                <form onSubmit={kirimkan} className="flex items-end gap-3 border-t border-line p-4">
                  <label className="flex-1">
                    <span className="sr-only">Tulis pesan</span>
                    <textarea
                      value={teks}
                      onChange={(e) => setTeks(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          e.currentTarget.form?.requestSubmit()
                        }
                      }}
                      rows={2}
                      maxLength={2000}
                      placeholder="Tulis balasan…"
                      className="w-full resize-none rounded-md border border-line px-4 py-3 text-[14px] outline-none focus:border-navy-900"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={kirim || !teks.trim()}
                    className="h-12 shrink-0 rounded-md bg-navy-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50 sm:px-6"
                  >
                    {kirim ? 'Mengirim…' : 'Kirim'}
                  </button>
                </form>
              </section>
            </div>
          )}
        </>
      )}
    </TukarHalus>
  )
}

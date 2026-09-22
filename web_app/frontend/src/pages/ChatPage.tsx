import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TukarHalus from '../components/TukarHalus'
import TabelSkeleton from '../components/TabelSkeleton'
import { SearchIcon } from '../components/icons'
import { rupiah } from '../lib/format'
import {
  getToken, listPercakapan, getPercakapan, kirimPesan, bukaPercakapan,
  type ApiPercakapan, type ApiPesan,
} from '../lib/api'

/** Chat Vendor (mockup "page chat user"): daftar percakapan di kiri, ruang
 *  obrolan di kanan.
 *
 *  Obrolan dengan VENDOR selalu lahir dari sebuah pesanan — tombol "Chat
 *  Vendor" di /pesanan yang membukanya. Tidak ada "mulai obrolan dengan vendor
 *  mana saja": tanpa pesanan, kepala ruangan tidak punya konteks apa pun untuk
 *  ditampilkan, dan mockup pun menaruh nomor pesanan di tiap barisnya.
 *
 *  Satu tambahan di luar mockup: tiket ke tim admin. Mockup admin punya tab
 *  "Obrolan Klien/Pengguna", dan tanpa tombol di sisi pelanggan antrean itu
 *  tidak akan pernah terisi.
 *
 *  Yang ada di mockup tapi SENGAJA tidak dibuat: titik hijau "Online",
 *  lencana "PRO TIER", "Festa Escrow Proteksi Aktif", lampiran berkas, dan
 *  centang "terkirim & dibaca" per pesan. Tiga yang pertama hiasan yang
 *  menyamar jadi fakta soal vendornya — tidak ada sumber datanya, persis
 *  seperti KONTAK palsu yang dibuang dari halaman EO. Lampiran butuh
 *  penyimpanan berkas yang proyek ini tidak punya.
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

/** Inisial dua huruf untuk avatar kotak, seperti "LS" di mockup. */
const inisial = (nama: string) =>
  nama.split(/\s+/).slice(0, 2).map((k) => k[0]).join('').toUpperCase()

/** Lawan bicara pelanggan cuma dua kemungkinan: vendor pesanannya, atau tim
 *  admin. Tiket admin memang tidak punya nama_vendor. */
const lawanBicara = (c: ApiPercakapan) =>
  c.jenis === 'admin_klien' ? 'Tim Admin Festa Festum' : c.nama_vendor || 'Vendor'

// Tanpa websocket: halaman menarik ulang selama terbuka. 10 detik cukup untuk
// demo dan tidak membebani Supabase gratis.
// ponytail: polling. Naikkan ke SSE kalau jedanya terasa saat presentasi.
const JEDA_TARIK_MS = 10_000

export default function ChatPage() {
  const [cari, setCari] = useSearchParams()
  const [daftar, setDaftar] = useState<ApiPercakapan[]>([])
  const [aktif, setAktif] = useState('')
  const [pesan, setPesan] = useState<ApiPesan[]>([])
  const [kepala, setKepala] = useState<ApiPercakapan | null>(null)
  const [memuat, setMemuat] = useState(() => !!getToken())
  const [galat, setGalat] = useState('')
  const [teks, setTeks] = useState('')
  const [kirim, setKirim] = useState(false)
  const [query, setQuery] = useState('')
  // Di bawah lg, daftar dan ruang obrolan TIDAK ditumpuk: satu layar satu
  // panel, seperti aplikasi pesan mana pun. Menumpuknya berarti di HP kita
  // harus menggulung melewati seluruh daftar dulu sebelum sampai ke pesannya.
  // Penandanya cuma dipakai untuk kelas CSS; di lg ke atas keduanya tampil
  // bersama dan penanda ini tidak berpengaruh sama sekali.
  // Nilai awalnya dibaca dari URL sekali saja: datang lewat tombol "Chat
  // Vendor" berarti ruangannya yang dituju, bukan daftarnya, jadi di HP pun
  // langsung mendarat di percakapannya.
  const [ruangDiHp, setRuangDiHp] = useState(() => !!cari.get('c'))
  const kotakPesan = useRef<HTMLDivElement>(null)

  const masuk = !!getToken()
  // Dibuka dari /pesanan lewat ?c=<id>, jadi tombol di sana tidak perlu tahu
  // apa-apa selain id ruangan yang baru dibukanya.
  const dariUrl = cari.get('c') || ''

  useEffect(() => {
    if (!masuk) return
    let hidup = true

    const tarik = () =>
      listPercakapan()
        .then((r) => {
          if (!hidup) return
          setDaftar(r.data)
          // Pilihan awal: ruangan dari URL kalau ada, kalau tidak yang teratas.
          setAktif((lama) => lama || dariUrl || r.data[0]?.conversation_id || '')
        })
        .catch((e) => hidup && setGalat(e.message))
        .finally(() => hidup && setMemuat(false))

    tarik()
    const t = setInterval(tarik, JEDA_TARIK_MS)
    return () => {
      hidup = false
      clearInterval(t)
    }
  }, [masuk, dariUrl])

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

  // Menggulung ke pesan terbaru tiap jumlahnya bertambah — bukan tiap render,
  // supaya penarikan ulang yang tidak membawa apa-apa tidak merebut posisi
  // gulungan yang sedang dibaca orangnya.
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
        lawanBicara(c).toLowerCase().includes(q)
        || (c.booking_id || '').toLowerCase().includes(q)
    )
  }, [daftar, query])

  // Idempoten di backend: kalau tiketnya sudah ada, yang dibalas ruangan yang
  // sama, bukan ruangan kosong yang kedua.
  async function hubungiAdmin() {
    setGalat('')
    try {
      const r = await bukaPercakapan({ jenis: 'admin_klien' })
      setDaftar((lama) =>
        lama.some((c) => c.conversation_id === r.conversation.conversation_id)
          ? lama
          : [r.conversation, ...lama]
      )
      pilih(r.conversation.conversation_id)
    } catch (err) {
      setGalat((err as Error).message)
    }
  }

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

  function pilih(id: string) {
    // Isi ruangan dikosongkan HANYA kalau ruangannya memang berganti. Kalau
    // id-nya sama (mis. balik dari daftar lalu membuka ruangan yang itu
    // juga), efek penariknya TIDAK jalan lagi karena dependensinya tidak
    // berubah — mengosongkan di sini berarti ruangan blank sampai polling
    // 10 detik berikutnya. Itu yang bikin obrolan terasa menggantung.
    if (id !== aktif) {
      setPesan([])
      setKepala(null)
    }
    setAktif(id)
    setRuangDiHp(true)
    // Lencana belum-dibaca ikut nol begitu ruangannya dibuka; backend sudah
    // menandainya terbaca, jadi ini cuma menyusulkan tampilannya.
    setDaftar((lama) =>
      lama.map((c) => (c.conversation_id === id ? { ...c, belum_dibaca: 0 } : c))
    )
    if (dariUrl) setCari({}, { replace: true })
  }

  if (!masuk) {
    return (
      <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
        <div className="mx-auto mt-10 max-w-[520px] rounded-sm border border-line bg-white px-8 py-12 text-center">
          <h1 className="font-display text-[30px] font-semibold">Masuk dulu, ya</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
            Obrolan menempel pada pesanan Anda, jadi perlu masuk dulu untuk membukanya.
          </p>
          <Link
            to="/masuk"
            className="mt-7 inline-flex h-11 items-center rounded bg-navy-900 px-8 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Masuk
          </Link>
        </div>
      </div>
    )
  }

  return (
    <TukarHalus
      memuat={memuat}
      // Rangkanya dibungkus wadah yang SAMA dengan isi halaman. Tanpa itu dia
      // menempel ke tepi layar — padding halaman pelanggan hidup di dalam
      // halamannya, bukan di SiteLayout. Satu kolom, bukan tiga: yang dimuat
      // daftar percakapan, bukan tabel.
      rangka={
        <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
          <TabelSkeleton kolom={1} baris={5} label="Memuat obrolan…" />
        </div>
      }
    >
      {() => (
        <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
          <p className="text-[13px] text-muted">
            <Link to="/pesanan" className="hover:underline">Pesanan &amp; Booking Saya</Link>
            {kepala?.booking_id && ` / #${kepala.booking_id.slice(0, 8).toUpperCase()}`}
            {' / Chat Vendor'}
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[28px] font-semibold md:text-[38px]">Chat Vendor</h1>
              <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-ink/75">
                Koordinasikan detail acara, jadwal, dan rundown langsung dengan vendor pesanan Anda.
              </p>
            </div>
            <button
              type="button"
              onClick={hubungiAdmin}
              className="rounded-md border border-line bg-white px-5 py-3 text-[14px] font-medium hover:border-ink"
            >
              Hubungi Tim Admin
            </button>
          </div>

          {galat && (
            <p className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
              {galat}
            </p>
          )}

          {daftar.length === 0 ? (
            <div className="mt-8 rounded-lg border border-line bg-white px-8 py-14 text-center">
              <h2 className="font-display text-[22px] font-semibold">Belum ada obrolan</h2>
              <p className="mx-auto mt-2 max-w-[440px] text-[15px] text-ink/70">
                Obrolan dengan vendor dimulai dari pesanan. Buka salah satu pesanan Anda
                lalu tekan “Chat Vendor”. Untuk kendala di luar pesanan, hubungi tim admin.
              </p>
              <Link
                to="/pesanan"
                className="mt-6 inline-flex h-11 items-center rounded bg-navy-900 px-7 text-[15px] font-medium text-white"
              >
                Lihat Pesanan Saya
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
              {/* --- daftar percakapan --- */}
              <section
                className={`rounded-lg border border-line bg-white p-4 ${
                  ruangDiHp ? 'hidden lg:block' : ''
                }`}
              >
                <label className="relative block">
                  <span className="sr-only">Cari vendor atau nomor pesanan</span>
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari vendor atau nomor pesanan…"
                    className="h-11 w-full rounded-md border border-line bg-white pr-3 pl-9 text-[14px] outline-none focus:border-navy-900"
                  />
                </label>

                <ul className="mt-4 space-y-1">
                  {terlihat.map((c) => {
                    const badge = c.payment_status ? BADGE[c.payment_status] : null
                    return (
                      <li key={c.conversation_id}>
                        <button
                          type="button"
                          onClick={() => pilih(c.conversation_id)}
                          aria-current={c.conversation_id === aktif}
                          className={`flex w-full gap-3 rounded-md border-l-[3px] p-3 text-left transition-colors ${
                            c.conversation_id === aktif
                              ? 'border-amber bg-lavender/30'
                              : 'border-transparent hover:bg-lavender/15'
                          }`}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy-900 text-[12px] font-semibold text-white">
                            {inisial(lawanBicara(c))}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[14px] font-semibold">
                                {lawanBicara(c)}
                              </span>
                              {c.pesan_terakhir_at && (
                                <span className="shrink-0 text-[11px] text-muted">
                                  {jam(c.pesan_terakhir_at)}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-muted">
                              {c.jenis === 'admin_klien'
                                ? 'Bantuan & kendala pesanan'
                                : KATEGORI[c.category || ''] || 'Vendor'}
                              {c.booking_id && ` • #${c.booking_id.slice(0, 8).toUpperCase()}`}
                            </span>
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
                      <span aria-hidden>&larr;</span> Semua obrolan
                    </button>
                    {!kepala && (
                      <div className="flex gap-3">
                        <div className="shimmer h-11 w-11 shrink-0 rounded-md bg-line/70" />
                        <div className="flex-1">
                          <div className="shimmer h-5 w-44 max-w-full rounded-sm bg-line/70" />
                          <div className="shimmer mt-2 h-3 w-56 max-w-full rounded-sm bg-line/50" />
                        </div>
                      </div>
                    )}
                    {kepala && (
                    <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-navy-900 text-[13px] font-semibold text-white">
                        {inisial(lawanBicara(kepala))}
                      </span>
                      <div>
                        <h2 className="font-display text-[20px] font-semibold">
                          {lawanBicara(kepala)}
                        </h2>
                        <p className="text-[13px] text-ink/70">
                          {kepala.jenis === 'admin_klien'
                            ? 'Bantuan & kendala pesanan'
                            : KATEGORI[kepala.category || ''] || 'Vendor'}
                          {kepala.event_date && ` • ${tanggal(kepala.event_date)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {kepala.total_price && (
                        <p className="text-[13px] text-ink/70 sm:text-right">
                          Nilai pesanan
                          <span className="block text-[15px] font-semibold text-ink">
                            {rupiah(Number(kepala.total_price))}
                          </span>
                        </p>
                      )}
                      {kepala.booking_id && (
                        <Link
                          to="/pesanan"
                          className="rounded-md border border-line px-4 py-2 text-[13px] font-medium hover:border-ink"
                        >
                          Lihat Detail Pesanan
                        </Link>
                      )}
                    </div>
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
                      {kepala?.jenis === 'admin_klien'
                        ? 'Belum ada pesan. Ceritakan kendala Anda, tim admin akan membalas.'
                        : 'Belum ada pesan. Sapa vendornya duluan, yuk.'}
                    </p>
                  )}
                  {pesan.map((m, i) => {
                    const dariSaya = m.peran_pengirim === 'customer'
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
                            {!dariSaya && (
                              <p className="mb-1 text-[12px] font-semibold text-ink/70">
                                {m.nama_pengirim}
                              </p>
                            )}
                            <p
                              className={`rounded-lg px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap ${
                                dariSaya
                                  ? 'bg-navy-900 text-white'
                                  : 'border border-line bg-cream text-ink'
                              }`}
                            >
                              {m.body}
                            </p>
                            <p
                              className={`mt-1 text-[11px] text-muted ${
                                dariSaya ? 'text-right' : ''
                              }`}
                            >
                              {jam(m.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <form onSubmit={kirimkan} className="flex items-end gap-3 border-t border-line p-4">
                  <label className="flex-1">
                    <span className="sr-only">Tulis pesan</span>
                    <textarea
                      value={teks}
                      onChange={(e) => setTeks(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter mengirim, Shift+Enter baris baru — kebiasaan
                        // yang sudah melekat di aplikasi obrolan mana pun.
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          e.currentTarget.form?.requestSubmit()
                        }
                      }}
                      rows={2}
                      maxLength={2000}
                      placeholder={
                        kepala?.jenis === 'admin_klien'
                          ? 'Tulis pesan untuk tim admin…'
                          : 'Tulis pesan untuk vendor…'
                      }
                      className="w-full resize-none rounded-md border border-line px-4 py-3 text-[14px] outline-none focus:border-navy-900"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={kirim || !teks.trim()}
                    className="h-12 shrink-0 rounded-md bg-amber px-4 text-[14px] font-semibold text-navy-900 disabled:opacity-50 sm:px-6"
                  >
                    {kirim ? 'Mengirim…' : 'Kirim'}
                  </button>
                </form>
              </section>
            </div>
          )}
        </div>
      )}
    </TukarHalus>
  )
}

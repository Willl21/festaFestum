import { useEffect, useMemo, useRef, useState } from 'react'
import TukarHalus from '../components/TukarHalus'
import TabelSkeleton from '../components/TabelSkeleton'
import { SearchIcon } from '../components/icons'
import {
  listPercakapan, getPercakapan, kirimPesan, usePengguna,
  type ApiPercakapan, type ApiPesan,
} from '../lib/api'

/** Pusat Komunikasi admin (mockup "Pusat Kontrol Admin — Chat Klien &
 *  Vendor"). Dua tab = dua jenis tiket yang masuk ke tim admin.
 *
 *  Tidak ada penugasan per admin: semua admin melihat dan membalas antrean
 *  yang sama, sama seperti antrean kurasi vendor. Kalau nanti butuh
 *  "ditangani oleh", tambahkan kolom assigned_admin_id di conversations.
 *
 *  Yang di mockup tapi TIDAK dibuat: tab "Panggilan Mediasi & Sengketa",
 *  rata-rata respon 1m 42s, "Unduh Log Sesi", "Personalisasi Makro", dan
 *  tombol aksi cepat (Kirim Konfirmasi Jadwal / Tahan Dana Escrow / Beri
 *  Catatan Mediasi). Mediasi butuh alur sengketa yang belum ada sama sekali,
 *  dan tiga tombol aksi itu jalan pintas ke fitur escrow yang halaman
 *  Pusat Escrow sudah punya sendiri — menyalinnya ke sini berarti dua tempat
 *  yang harus benar.
 */

const jam = (s: string) =>
  new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

const tanggal = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

const inisial = (nama: string) =>
  nama.split(/\s+/).slice(0, 2).map((k) => k[0]).join('').toUpperCase()

// ponytail: polling, pola yang sama dengan dua halaman obrolan lain.
const JEDA_TARIK_MS = 10_000

export default function AdminPesanPage() {
  const user = usePengguna()
  const [tab, setTab] = useState<'admin_klien' | 'admin_vendor'>('admin_klien')
  const [daftar, setDaftar] = useState<ApiPercakapan[]>([])
  const [aktif, setAktif] = useState('')
  const [pesan, setPesan] = useState<ApiPesan[]>([])
  const [kepala, setKepala] = useState<ApiPercakapan | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [teks, setTeks] = useState('')
  const [kirim, setKirim] = useState(false)
  const [query, setQuery] = useState('')
  // Di bawah lg, daftar dan ruang obrolan TIDAK ditumpuk: satu layar satu
  // panel, seperti aplikasi pesan mana pun. Menumpuknya berarti di HP harus
  // menggulung melewati seluruh daftar dulu sebelum sampai ke pesannya.
  // Penandanya cuma untuk kelas CSS; di lg ke atas keduanya tampil bersama.
  const [ruangDiHp, setRuangDiHp] = useState(false)
  // Hitungan tab sebelah ikut ditarik supaya angkanya tidak baru muncul
  // sesudah tabnya dibuka. `belumDibalas` sengaja dihitung dari SELURUH
  // antrean, bukan dari daftar tab yang sedang terbuka: kartunya duduk di atas
  // tab, jadi angka yang berubah tiap pindah tab terbaca seperti salah.
  const [jumlahLain, setJumlahLain] = useState<Record<string, number>>({})
  const [belumDibalas, setBelumDibalas] = useState(0)
  const kotakPesan = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let hidup = true

    const tarik = () =>
      listPercakapan()
        .then((r) => {
          if (!hidup) return
          const punyaTab = r.data.filter((c) => c.jenis === tab)
          setDaftar(punyaTab)
          setJumlahLain({
            admin_klien: r.data.filter((c) => c.jenis === 'admin_klien').length,
            admin_vendor: r.data.filter((c) => c.jenis === 'admin_vendor').length,
          })
          setBelumDibalas(r.data.filter((c) => c.belum_dibaca > 0).length)
          setAktif((lama) => {
            const masihAda = punyaTab.some((c) => c.conversation_id === lama)
            return masihAda ? lama : punyaTab[0]?.conversation_id || ''
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
  }, [tab])

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

  const namaPihak = (c: ApiPercakapan) =>
    c.jenis === 'admin_vendor' ? c.nama_vendor || 'Vendor' : c.nama_klien || 'Pengguna'

  const terlihat = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return daftar
    return daftar.filter((c) => namaPihak(c).toLowerCase().includes(q))
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

  const tabs = [
    { id: 'admin_klien' as const, label: 'Obrolan Klien / Pengguna' },
    { id: 'admin_vendor' as const, label: 'Obrolan Vendor / Mitra' },
  ]

  return (
    <TukarHalus memuat={memuat} rangka={<TabelSkeleton kolom={3} baris={6} label="Memuat tiket…" />}>
      {() => (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[34px] font-semibold">Pusat Komunikasi</h1>
              <p className="mt-1 max-w-[620px] text-[15px] text-ink/70">
                Tiket masuk dari klien dan vendor terdaftar. Semua admin melihat antrean yang sama.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-white px-5 py-3 text-right">
              <p className="text-[12px] tracking-[0.04em] text-muted">BELUM DIBALAS</p>
              <p className="text-[22px] font-semibold">{belumDibalas}</p>
            </div>
          </div>

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
                <span className="ml-2 rounded-full bg-lavender px-2 py-0.5 text-[11px] font-semibold text-navy-900">
                  {jumlahLain[t.id] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {daftar.length === 0 ? (
            <div className="mt-8 rounded-lg border border-line bg-white px-8 py-14 text-center">
              <h2 className="font-display text-[22px] font-semibold">Antrean kosong</h2>
              <p className="mx-auto mt-2 max-w-[460px] text-[15px] text-ink/70">
                {tab === 'admin_klien'
                  ? 'Belum ada klien yang membuka tiket bantuan.'
                  : 'Belum ada vendor yang membuka tiket koordinasi.'}
              </p>
            </div>
          ) : (
            <div className="mt-7 grid gap-6 lg:grid-cols-[340px_1fr]">
              {/* --- antrean --- */}
              <section
                className={`h-fit rounded-lg border border-line bg-white p-4 ${
                  ruangDiHp ? 'hidden lg:block' : ''
                }`}
              >
                <label className="relative block">
                  <span className="sr-only">Cari nama klien atau vendor</span>
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari nama klien atau vendor…"
                    className="h-11 w-full rounded-md border border-line bg-white pr-3 pl-9 text-[14px] outline-none focus:border-navy-900"
                  />
                </label>

                <ul className="mt-4 space-y-1">
                  {terlihat.map((c) => (
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
                          if (c.belum_dibaca > 0) setBelumDibalas((n) => Math.max(0, n - 1))
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
                          {inisial(namaPihak(c))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[14px] font-semibold">
                              {namaPihak(c)}
                            </span>
                            {c.pesan_terakhir_at && (
                              <span className="shrink-0 text-[11px] text-muted">
                                {jam(c.pesan_terakhir_at)}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-muted">
                            {c.jenis === 'admin_vendor' ? 'Vendor mitra' : 'Klien'}
                          </span>
                          <span className="mt-1.5 block truncate text-[13px] text-ink/70">
                            {c.pesan_terakhir || 'Belum ada pesan'}
                          </span>
                          {c.belum_dibaca > 0 && (
                            <span className="mt-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-maroon px-1.5 text-[11px] font-semibold text-white">
                              {c.belum_dibaca}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
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
                      <div>
                        <div className="shimmer h-5 w-44 max-w-full rounded-sm bg-line/70" />
                        <div className="shimmer mt-2 h-3 w-56 max-w-full rounded-sm bg-line/50" />
                      </div>
                    )}
                    {kepala && (
                      <>
                        <h2 className="font-display text-[20px] font-semibold">
                          {namaPihak(kepala)}
                        </h2>
                        <p className="text-[13px] text-ink/70">
                          {kepala.jenis === 'admin_vendor'
                            ? 'Tiket koordinasi vendor mitra'
                            : 'Tiket bantuan klien'}
                        </p>
                      </>
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
                      Belum ada pesan di tiket ini.
                    </p>
                  )}
                  {pesan.map((m, i) => {
                    const dariSaya = m.sender_user_id === user?.user_id
                    // Admin lain juga "tim kami", jadi pesannya ikut di sisi
                    // kanan — yang dibedakan pihak luar vs tim admin, bukan
                    // saya vs bukan saya.
                    const dariTim = m.peran_pengirim === 'admin'
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
                        <div className={dariTim ? 'flex justify-end' : 'flex justify-start'}>
                          <div className="max-w-[78%]">
                            <p className="mb-1 text-[12px] font-semibold text-ink/70">
                              {dariSaya ? 'Anda' : m.nama_pengirim}
                              {dariTim && !dariSaya && ' • Admin'}
                            </p>
                            <p
                              className={`rounded-lg px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap ${
                                dariTim
                                  ? 'bg-navy-900 text-white'
                                  : 'border border-line bg-cream text-ink'
                              }`}
                            >
                              {m.body}
                            </p>
                            <p className={`mt-1 text-[11px] text-muted ${dariTim ? 'text-right' : ''}`}>
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
                    <span className="sr-only">Tulis balasan</span>
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
                      placeholder="Tulis balasan resmi…"
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

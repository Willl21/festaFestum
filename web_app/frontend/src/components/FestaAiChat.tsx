import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Img from './Img'
import { ArrowRight, PlusIcon, SendIcon, UserCircleIcon } from './icons'
import { chatAi, urlFotoLayanan, type ParameterChatAi, type PesanAi } from '../lib/api'
import { KATEGORI_AI, type Simpanan } from '../lib/festaAi'
import { categories, namaKota, type CategoryKey } from '../data/categories'
import { rupiah } from '../lib/format'

/** Riwayat yang dikirim ke AI: 12 pesan terakhir (hemat token, kuota Gemini
 *  gratis), diawali pesan user supaya giliran tetap bergantian. */
const RIWAYAT_MAKS = 12

/** Pilihan cepat di sapaan; harus sama dengan tipe acara yang dikenal AI. */
const TIPE = ['Pernikahan', 'Wisuda', 'Gala Dinner', 'Konferensi']

const KATEGORI: Record<string, CategoryKey> = KATEGORI_AI

/** `hasil`: pencarian paket yang dipicu balasan ini. undefined = bukan
 *  balasan lengkap, null = pencarian gagal. */
type Pesan = PesanAi & { jam: string; hasil?: Simpanan | null }

const jamSekarang = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

/** Logo situs (sama dengan navbar). Logonya melebar, jadi di lingkaran
 *  dipotong ke tengahnya. */
const AvatarAi = () => (
  <img
    src="/img/logo-navbar.webp"
    alt=""
    width={36}
    height={36}
    className="h-9 w-9 shrink-0 rounded-full border border-line bg-white object-cover"
  />
)

/** Panel obrolan Festa AI. AI mengumpulkan parameter acara; begitu lengkap,
 *  `onLengkap` mencarikan paket lewat alur rekomendasi biasa dan hasilnya
 *  ditampilkan sebagai kartu di bawah balasan itu. */
export default function FestaAiChat({
  onLengkap,
  onLihatSemua,
}: {
  onLengkap: (p: ParameterChatAi) => Promise<Simpanan | null>
  onLihatSemua: () => void
}) {
  const [pesan, setPesan] = useState<Pesan[]>([])
  const [teks, setTeks] = useState('')
  const [status, setStatus] = useState<'siap' | 'mengetik' | 'mencari'>('siap')
  const [galat, setGalat] = useState('')
  const kotak = useRef<HTMLDivElement>(null)
  // Parameter terakhir yang sudah dicarikan: obrolan lanjutan ("makasih")
  // yang membalas parameter sama tidak memicu pencarian ulang.
  const terakhir = useRef('')

  useEffect(() => {
    kotak.current?.scrollTo({ top: kotak.current.scrollHeight })
  }, [pesan, status])

  function chatBaru() {
    setPesan([])
    setTeks('')
    setGalat('')
    terakhir.current = ''
  }

  async function kirimkan(isi: string) {
    isi = isi.trim()
    if (!isi || status !== 'siap') return
    const baru: Pesan[] = [...pesan, { role: 'user', content: isi, jam: jamSekarang() }]
    setPesan(baru)
    setTeks('')
    setGalat('')
    setStatus('mengetik')
    try {
      let riwayat = baru.slice(-RIWAYAT_MAKS)
      while (riwayat[0].role !== 'user') riwayat = riwayat.slice(1)
      const r = await chatAi(riwayat.map(({ role, content }) => ({ role, content })))
      const i = baru.length
      setPesan([...baru, { role: 'assistant', content: r.balasan, jam: jamSekarang() }])

      const kunci = JSON.stringify(r.parameter)
      if (r.lengkap && r.parameter && kunci !== terakhir.current) {
        terakhir.current = kunci
        setStatus('mencari')
        const hasil = await onLengkap(r.parameter)
        setPesan((p) => p.map((m, j) => (j === i ? { ...m, hasil } : m)))
      }
    } catch (e) {
      // Pesan dikembalikan ke kotak tulis supaya tinggal dikirim ulang.
      setPesan(pesan)
      setTeks(isi)
      setGalat((e as Error).message)
    } finally {
      setStatus('siap')
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      {/* KEPALA */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <img src="/img/logo-navbar.webp" alt="" width={167} height={80} className="h-8 w-auto" />
          <p className="font-display text-[20px] font-semibold">Festa AI</p>
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-700">
            <span
              className={`h-1.5 w-1.5 rounded-full ${status === 'siap' ? 'bg-emerald-600' : 'animate-pulse bg-amber'}`}
            />
            {status === 'siap' ? 'Siap membantu' : status === 'mengetik' ? 'Sedang mengetik…' : 'Mencarikan paket…'}
          </span>
        </div>
        <button
          type="button"
          onClick={chatBaru}
          disabled={!pesan.length || status !== 'siap'}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line px-4 text-[13px] transition-colors hover:border-navy-900 disabled:cursor-default disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Chat Baru
        </button>
      </div>

      {/* OBROLAN */}
      <div
        ref={kotak}
        role="log"
        aria-live="polite"
        aria-label="Obrolan dengan Festa AI"
        className="h-[min(560px,62dvh)] space-y-5 overflow-y-auto overscroll-contain px-5 py-6"
      >
        <div className="flex gap-3">
          <AvatarAi />
          <div className="max-w-[min(520px,85%)] rounded-lg border border-line bg-white px-4 py-3 text-[14px] leading-relaxed">
            <p>Halo! Aku Festa AI, asisten perencanaan acara kamu.</p>
            <p className="mt-2">
              Ceritakan jenis acara, tanggal, kota, dan budget-nya. Nanti aku carikan paket vendor yang masih
              kosong di tanggal itu. Mau mulai dari mana?
            </p>
            {pesan.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {TIPE.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => kirimkan(`Aku mau merencanakan ${t.toLowerCase()}`)}
                    className="cursor-pointer rounded-full border border-line px-4 py-2 text-[13px] transition-colors hover:border-navy-900"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {pesan.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end gap-3">
              <div className="max-w-[min(520px,85%)]">
                <p className="rounded-lg bg-navy-900 px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap text-white">
                  {m.content}
                </p>
                <p className="mt-1 text-right text-[11px] text-muted">{m.jam}</p>
              </div>
              <UserCircleIcon className="h-9 w-9 shrink-0 text-muted" />
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <AvatarAi />
              <div className="min-w-0 flex-1">
                <p className="w-fit max-w-[min(520px,100%)] rounded-lg border border-line bg-white px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </p>
                {m.hasil !== undefined && <HasilChat hasil={m.hasil} onLihatSemua={onLihatSemua} />}
              </div>
            </div>
          ),
        )}

        {status !== 'siap' && (
          <div className="flex gap-3">
            <AvatarAi />
            <p className="rounded-lg border border-line px-4 py-3 text-[14px] text-muted">
              {status === 'mengetik' ? 'Festa AI sedang mengetik…' : 'Mencarikan paket vendor…'}
            </p>
          </div>
        )}
      </div>

      {/* TULIS */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          kirimkan(teks)
        }}
        className="flex gap-3 border-t border-line px-5 py-4"
      >
        <label className="flex-1 rounded-md border border-line px-4 py-2.5 focus-within:border-navy-900">
          <span className="sr-only">Tulis pesan untuk Festa AI</span>
          <textarea
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            onKeyDown={(e) => {
              // Enter mengirim, Shift+Enter baris baru, sama seperti ChatPage.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder="Ceritakan acara yang ingin kamu siapkan…"
            className="block w-full resize-none text-[16px] outline-none sm:text-[14px]"
          />
          <span className="mt-1 block text-[11px] text-muted">
            Contoh: jenis acara, tanggal, lokasi, jumlah tamu, dan budget
          </span>
        </label>
        <button
          type="submit"
          aria-label="Kirim"
          disabled={status !== 'siap' || !teks.trim()}
          className="flex w-14 shrink-0 cursor-pointer items-center justify-center rounded-md bg-navy-900 text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
        >
          <SendIcon />
        </button>
      </form>
      {galat && <p className="px-5 pb-4 text-[13px] text-maroon">{galat}</p>}
    </div>
  )
}

/** Kartu paket hasil pencarian, di bawah balasan AI yang memicunya. */
function HasilChat({ hasil, onLihatSemua }: { hasil: Simpanan | null; onLihatSemua: () => void }) {
  if (!hasil) {
    return (
      <p className="mt-3 w-fit rounded-lg border border-maroon/30 bg-maroon/5 px-4 py-3 text-[14px] text-maroon">
        Pencarian paket gagal. Coba kirim pesan lagi sebentar lagi.
      </p>
    )
  }
  if (!hasil.rekomendasi.length) {
    return (
      <p className="mt-3 w-fit max-w-[520px] rounded-lg border border-line px-4 py-3 text-[14px] leading-relaxed text-ink/75">
        {hasil.catatan.saran ||
          'Belum ada vendor yang cocok dan masih kosong di tanggal itu. Coba ubah budget atau tanggalnya.'}
      </p>
    )
  }
  return (
    <div className="mt-3">
      {/* Alasan dari AI, mis. kategori yang diambil dari kota terdekat. */}
      {hasil.catatan.pembuka && (
        <p className="mb-3 w-fit max-w-[min(520px,100%)] rounded-lg border border-line bg-white px-4 py-3 text-[14px] leading-relaxed">
          {hasil.catatan.pembuka}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hasil.rekomendasi.map((r) => {
          const kat = categories[KATEGORI[r.category] ?? 'eo']
          return (
            <article key={r.service_id} className="flex flex-col rounded-lg border border-line p-4">
              <div className="flex items-start gap-3">
                <Img
                  src={r.has_photo ? urlFotoLayanan(r.service_id) : undefined}
                  alt={r.service_name}
                  tint={kat.tint}
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="font-display text-[17px] font-semibold">{kat.label}</p>
                  <p className="text-[12px] text-muted">oleh {r.business_name}</p>
                  {r.city !== hasil.nilai.lokasi && (
                    <p className="text-[12px] text-maroon">{namaKota(r.city)} · di luar kota acara</p>
                  )}
                  <p className="mt-1 text-[14px] font-semibold">{rupiah(Number(r.price))}</p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink/75">{r.service_name}</p>
              <Link
                to={`/${kat.slug}/${r.vendor_id}?layanan=${r.service_id}&dari=festa-ai`}
                className="mt-auto flex w-fit items-center gap-2 pt-3 text-[13px] font-medium text-navy-900 hover:underline"
              >
                Lihat layanan <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </article>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-cream px-4 py-3">
        <p className="text-[14px]">
          Total <span className="font-semibold">{rupiah(hasil.total)}</span> untuk {hasil.rekomendasi.length} layanan
          {hasil.penuh > 0 && <span className="text-muted"> · {hasil.penuh} dilewati karena penuh</span>}
        </p>
        <button
          type="button"
          onClick={onLihatSemua}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-md bg-navy-900 px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Lihat semua & pesan <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { pasangHost, type Permintaan } from '../lib/konfirmasi'

/**
 *  Dialog untuk konfirmasi()/mintaAlasan() di lib/konfirmasi.ts.
 *  <dialog> bawaan browser: fokus terkunci, Escape = batal, latar gelap.
 *  Animasinya kelas ff-dialog yang sudah ada di index.css.
 */

/** Dipasang SEKALI di App.tsx. */
export function KonfirmasiHost() {
  const [minta, setMinta] = useState<Permintaan | null>(null)

  useEffect(() => {
    pasangHost((p) => setMinta((lama) => {
      // Permintaan baru saat yang lama masih terbuka: yang lama dianggap batal.
      lama?.selesai(null)
      return p
    }))
    return () => pasangHost(null)
  }, [])

  // key: <dialog> baru per permintaan, jadi animasi masuk selalu jalan dan
  // kolom alasan selalu mulai kosong.
  return minta ? <Dialog key={minta.id} {...minta} onSelesai={() => setMinta(null)} /> : null
}

function Dialog({ judul, isi, ya, bahaya, alasan, selesai, onSelesai }: Permintaan & { onSelesai: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [teks, setTeks] = useState('')
  const [galat, setGalat] = useState('')
  // Tutup lewat Escape/Batal = null; lewat tombol aksi = teks alasan.
  const hasil = useRef<string | null>(null)

  useEffect(() => { ref.current?.showModal() }, [])

  function setuju(e: React.FormEvent) {
    e.preventDefault()
    if (alasan?.wajib && !teks.trim()) return setGalat(`${alasan.label} wajib diisi.`)
    hasil.current = teks.trim()
    ref.current?.close()
  }

  const tombol = 'h-11 rounded px-4 text-[13px] font-semibold transition-colors sm:h-9'

  return (
    <dialog
      ref={ref}
      onClose={() => { selesai(hasil.current); onSelesai() }}
      aria-labelledby="konfirmasi-judul"
      className="ff-dialog m-auto w-[min(360px,92vw)] rounded-lg border border-line bg-white p-0 backdrop:bg-navy-900/40"
    >
      <form onSubmit={setuju} className="p-5">
        <h2 id="konfirmasi-judul" className="text-[16px] font-semibold text-navy-900">
          {judul}
        </h2>
        {isi && <div className="mt-1.5 text-[13px] leading-relaxed text-ink/75">{isi}</div>}

        {alasan && (
          <div className="mt-3">
            <label htmlFor="konfirmasi-alasan" className="text-[12px] font-medium text-ink">
              {alasan.label}{alasan.wajib ? '' : ' (boleh dikosongkan)'}
            </label>
            <textarea
              id="konfirmasi-alasan"
              rows={3}
              autoFocus
              value={teks}
              onChange={(e) => { setTeks(e.target.value); setGalat('') }}
              className="mt-1.5 w-full rounded border border-line-input px-3 py-2 text-[16px] sm:text-[14px]"
            />
            {galat && <p role="alert" className="mt-1 text-[13px] text-maroon">{galat}</p>}
          </div>
        )}

        {/* Di HP tombol aksi di atas & selebar layar; Batal tetap mudah dijangkau. */}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            // Aksi merusak: fokus awal di Batal, supaya Enter tidak langsung menghapus.
            autoFocus={bahaya && !alasan}
            onClick={() => ref.current?.close()}
            className={`${tombol} cursor-pointer border border-line-input text-ink hover:bg-cream`}
          >
            Batal
          </button>
          <button
            type="submit"
            autoFocus={!bahaya && !alasan}
            className={`${tombol} cursor-pointer text-white ${
              bahaya ? 'bg-red-700 hover:bg-red-800' : 'bg-navy-900 hover:bg-navy-700'
            }`}
          >
            {ya ?? 'Ya, lanjutkan'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

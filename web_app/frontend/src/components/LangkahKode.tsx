import { useState } from 'react'
import { inputClass } from './AuthLayout'
import { post, type AuthResponse, type TantanganKode } from '../lib/api'
import { UMUR_KODE_MS, formatSisa, sisaKode, useDetik } from '../lib/hitungMundur'

/** Langkah kedua masuk (migrasi 022): sandi sudah benar, server mengirim kode
 *  6 digit ke email dan baru memberi token sesudah kode dicocokkan. Dipakai
 *  ketiga halaman masuk — pelanggan, vendor, admin — yang masing-masing tetap
 *  memutuskan sendiri apa yang terjadi sesudah token didapat (cek role, arah). */
export default function LangkahKode({
  tantangan,
  onMasuk,
  onBatal,
}: {
  tantangan: TantanganKode
  onMasuk: (auth: AuthResponse) => void
  onBatal: () => void
}) {
  const [kode, setKode] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  // ponytail: dihitung dari saat layar ini muncul, bukan dari server. Masuk ulang
  // dalam 60 dtk memakai kode lama, jadi kode bisa habis <=1 menit lebih awal.
  // Kalau perlu presisi, kirim `kedaluwarsa` di balasan login.
  const [berakhir] = useState(() => Date.now() + UMUR_KODE_MS)
  const sisa = sisaKode(berakhir, useDetik())

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setGalat('')
    setSibuk(true)
    try {
      onMasuk(await post<AuthResponse>('/auth/login/kode', { tiket: tantangan.tiket, kode }))
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <form onSubmit={kirim} className="mt-7">
      <p className="rounded bg-lavender px-4 py-3 text-[14px] text-navy-900" role="status">
        Kode 6 digit sudah dikirim ke <span className="font-semibold">{tantangan.email}</span>.
      </p>
      <p className={`mt-2 text-[13px] ${sisa ? 'text-muted' : 'font-semibold text-maroon'}`}>
        {sisa ? (
          <>Berlaku <span className="font-mono font-semibold tabular-nums text-navy-900">{formatSisa(sisa)}</span> lagi</>
        ) : (
          'Kode sudah kedaluwarsa. Masuk ulang untuk meminta kode baru.'
        )}
      </p>

      <label htmlFor="kode" className="mt-5 block text-[12px] font-semibold tracking-[0.08em] text-navy-900">
        KODE VERIFIKASI
      </label>
      <input
        id="kode"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        required
        pattern="\d{6}"
        maxLength={6}
        value={kode}
        onChange={(e) => setKode(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        className={`mt-2.5 ${inputClass} text-center font-mono tracking-[0.5em]`}
      />

      {galat && <p role="alert" className="mt-4 text-[14px] text-maroon">{galat}</p>}

      <button
        type="submit"
        disabled={sibuk || !sisa || kode.length !== 6}
        className="mt-6 h-11 w-full rounded bg-navy-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {sibuk ? 'Memeriksa…' : 'Verifikasi & Masuk'}
      </button>

      {/* Kirim ulang = masuk ulang dengan sandi. Server memakai kode yang sama
          selama 60 detik pertama, jadi tombol ini tidak bisa dipakai membanjiri
          kotak masuk. */}
      <p className="mt-4 text-center text-[13px] text-muted">
        Belum menerima kode? Cek folder spam, atau{' '}
        <button type="button" onClick={onBatal} className="font-semibold text-navy-900 underline underline-offset-4">
          masuk ulang
        </button>{' '}
        untuk meminta kode baru.
      </p>
    </form>
  )
}

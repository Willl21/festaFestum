import { useState } from 'react'
import { inputClass } from './AuthLayout'
import { gantiToken, post } from '../lib/api'

const label = 'block text-[12px] font-semibold tracking-wide text-navy-900 uppercase'

/** Saklar verifikasi dua langkah via email (migrasi 022), untuk profil klien
 *  dan profil vendor. Admin tidak memakainya — admin selalu diminta kode.
 *
 *  Menyalakan = sandi -> kode ke email -> konfirmasi. 2FA baru menyala sesudah
 *  kodenya terbukti sampai; kalau langsung menyala, akun dengan email yang
 *  tidak menerima surat terkunci di luar. Mematikan cukup sandi.
 *
 *  Sengaja BUKAN <form> (di ProfilPage blok ini duduk di dalam form profil). */
export default function DuaLangkah({
  aktif,
  onBerubah,
}: {
  aktif: boolean
  onBerubah: (aktif: boolean) => void
}) {
  const [langkah, setLangkah] = useState<'diam' | 'sandi' | 'kode'>('diam')
  const [sandi, setSandi] = useState('')
  const [kode, setKode] = useState('')
  const [tiket, setTiket] = useState({ tiket: '', email: '' })
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)

  function batal() {
    setLangkah('diam')
    setSandi('')
    setKode('')
    setGalat('')
  }

  async function lanjut() {
    setGalat('')
    setPesan('')
    setSibuk(true)
    try {
      if (langkah === 'sandi' && aktif) {
        await post('/auth/dua-langkah/matikan', { current_password: sandi })
        onBerubah(false)
        setPesan('Verifikasi dua langkah dimatikan.')
        batal()
      } else if (langkah === 'sandi') {
        const r = await post<{ tiket: string; email: string }>('/auth/dua-langkah', { current_password: sandi })
        setTiket(r)
        setSandi('')
        setLangkah('kode')
      } else {
        const r = await post<{ token: string }>('/auth/dua-langkah/konfirmasi', { tiket: tiket.tiket, kode })
        // Server mencabut semua sesi lama, termasuk token halaman ini.
        gantiToken(r.token)
        onBerubah(true)
        setPesan('Verifikasi dua langkah aktif. Perangkat lain yang masih masuk sudah dikeluarkan.')
        batal()
      }
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setSibuk(false)
    }
  }

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      lanjut()
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-[14px] font-semibold text-navy-900">
            Verifikasi dua langkah{' '}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                aktif ? 'bg-[#2e6b52]/10 text-[#2e6b52]' : 'bg-line/60 text-ink/60'
              }`}
            >
              {aktif ? 'Aktif' : 'Nonaktif'}
            </span>
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Setiap masuk dengan sandi, kami kirim kode 6 digit ke email Anda. Sandi yang bocor saja
            tidak cukup untuk membuka akun.
          </p>
        </div>
        {langkah === 'diam' && (
          <button
            type="button"
            onClick={() => { setLangkah('sandi'); setPesan('') }}
            className="h-11 shrink-0 rounded border border-navy-900 px-6 text-[14px] font-semibold text-navy-900 transition-opacity hover:opacity-80"
          >
            {aktif ? 'Matikan' : 'Nyalakan'}
          </button>
        )}
      </div>

      {langkah !== 'diam' && (
        <div className="mt-4 rounded border border-line bg-cream p-4">
          {langkah === 'sandi' ? (
            <>
              <label htmlFor="sandi_2fa" className={label}>Kata sandi akun</label>
              <input
                id="sandi_2fa"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={sandi}
                onChange={(e) => setSandi(e.target.value)}
                onKeyDown={enter}
                className={`mt-2 ${inputClass}`}
              />
            </>
          ) : (
            <>
              <p className="text-[13px] text-navy-900">
                Kode 6 digit sudah dikirim ke <span className="font-semibold">{tiket.email}</span>. Masukkan
                untuk menyalakan.
              </p>
              <label htmlFor="kode_2fa" className={`mt-3 ${label}`}>Kode verifikasi</label>
              <input
                id="kode_2fa"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={kode}
                onChange={(e) => setKode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={enter}
                placeholder="000000"
                className={`mt-2 ${inputClass} text-center font-mono tracking-[0.5em]`}
              />
            </>
          )}

          {galat && <p role="alert" className="mt-3 text-[13px] text-maroon">{galat}</p>}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={lanjut}
              disabled={sibuk || (langkah === 'sandi' ? !sandi : kode.length !== 6)}
              className="h-10 rounded bg-navy-900 px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {sibuk
                ? 'Memproses…'
                : langkah === 'kode' ? 'Nyalakan 2FA' : aktif ? 'Matikan 2FA' : 'Kirim Kode'}
            </button>
            <button type="button" onClick={batal} className="h-10 px-2 text-[13px] font-medium underline underline-offset-4">
              Batal
            </button>
          </div>
        </div>
      )}

      {pesan && <p className="mt-3 text-[13px] font-semibold text-[#2e6b52]">{pesan}</p>}
    </div>
  )
}

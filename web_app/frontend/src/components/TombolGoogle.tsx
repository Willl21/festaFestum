import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleIcon } from './icons'
import { post, saveAuth, tujuanLanjut, type AuthResponse } from '../lib/api'

/** Tombol "Masuk dengan Google" — dipakai halaman masuk & daftar pelanggan.
 *
 *  Tombolnya digambar Google sendiri (Google Identity Services), bukan tombol
 *  kita: pedoman merek Google mewajibkannya, dan GIS yang mengurus popup pilih
 *  akun. Hasilnya ID token (`credential`) yang diperiksa backend di
 *  POST /auth/google, lalu diperlakukan persis seperti login biasa — termasuk
 *  `?lanjut=` yang membawa orang balik ke halaman pesan.
 *
 *  Tanpa VITE_GOOGLE_CLIENT_ID tombolnya tampil mati, seperti sebelum ada
 *  fitur ini, supaya anggota tim tanpa Client ID tetap bisa menjalankan app. */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

type Gis = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    }
  }
}
declare global {
  interface Window { google?: Gis }
}

/** Skrip GIS dimuat sekali per halaman, walau tombolnya dipasang berkali-kali
 *  (pindah bolak-balik masuk <-> daftar). */
let muatSkrip: Promise<void> | null = null
function skripGoogle() {
  muatSkrip ??= new Promise((ok, gagal) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => ok()
    s.onerror = () => { muatSkrip = null; gagal(new Error('Gagal memuat login Google')) }
    document.head.appendChild(s)
  })
  return muatSkrip
}

export default function TombolGoogle({ teks }: { teks: 'signin_with' | 'signup_with' }) {
  const navigate = useNavigate()
  const wadah = useRef<HTMLDivElement>(null)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    if (!CLIENT_ID) return
    let hidup = true
    skripGoogle()
      .then(() => {
        if (!hidup || !wadah.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            setGalat('')
            try {
              const auth = await post<AuthResponse>('/auth/google', { credential })
              saveAuth(auth)
              navigate(tujuanLanjut() ?? '/', { replace: true })
            } catch (e) {
              setGalat((e as Error).message)
            }
          },
        })
        window.google.accounts.id.renderButton(wadah.current, {
          theme: 'outline', size: 'large', text: teks, locale: 'id',
          width: wadah.current.offsetWidth || 360,
        })
      })
      .catch((e) => hidup && setGalat(e.message))
    return () => { hidup = false }
  }, [teks, navigate])

  if (!CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        title="Login Google belum dikonfigurasi (VITE_GOOGLE_CLIENT_ID kosong)"
        className="flex h-11 w-full items-center justify-center gap-3 rounded border border-line bg-white text-[14px] text-ink disabled:opacity-60"
      >
        <GoogleIcon />
        {teks === 'signup_with' ? 'Daftar dengan Google' : 'Masuk dengan Google'}
      </button>
    )
  }

  return (
    <div>
      {/* Tinggi dipesan dulu supaya form tidak melompat saat tombolnya muncul. */}
      <div ref={wadah} className="flex min-h-11 w-full justify-center" />
      {galat && (
        <p role="alert" className="mt-3 text-[14px] text-maroon">{galat}</p>
      )}
    </div>
  )
}

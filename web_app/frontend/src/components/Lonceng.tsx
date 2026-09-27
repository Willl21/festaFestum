import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon } from './icons'
import { bacaSemuaNotifikasi, listNotifikasi, type Notifikasi } from '../lib/api'

/** Lonceng notifikasi (migrasi 019), dipakai navbar klien dan header vendor.
 *
 *  Membuka panel = menandai semuanya dibaca, tapi yang tadinya belum dibaca
 *  tetap disorot selama panel terbuka — supaya orang masih tahu mana yang baru.
 *  ponytail: polling 30 detik, sama dengan lencana obrolan. */
export default function Lonceng() {
  const [data, setData] = useState<Notifikasi[]>([])
  const [belum, setBelum] = useState(0)
  const [buka, setBuka] = useState(false)

  useEffect(() => {
    let hidup = true
    const tarik = () =>
      listNotifikasi()
        .then((r) => {
          if (!hidup) return
          setData(r.data)
          setBelum(r.belum_dibaca)
        })
        .catch(() => {}) // lonceng bukan alasan merusak halaman
    tarik()
    const t = setInterval(tarik, 30_000)
    return () => {
      hidup = false
      clearInterval(t)
    }
  }, [])

  function alihkan() {
    setBuka((b) => !b)
    if (!buka && belum > 0) {
      setBelum(0)
      bacaSemuaNotifikasi().catch(() => {})
    }
  }

  return (
    <div
      className="relative"
      onKeyDown={(e) => e.key === 'Escape' && setBuka(false)}
      // Menutup saat fokus keluar dari lonceng + panelnya (klik di luar,
      // atau Tab melewati item terakhir). relatedTarget null = klik di area
      // kosong halaman.
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setBuka(false)}
    >
      <button
        type="button"
        onClick={alihkan}
        aria-expanded={buka}
        aria-label={belum > 0 ? `Notifikasi, ${belum} belum dibaca` : 'Notifikasi'}
        className="relative flex text-ink/70 transition-colors hover:text-navy-900"
      >
        <BellIcon className="h-[22px] w-[22px]" />
        {belum > 0 && (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-maroon px-1 text-[11px] font-semibold text-white">
            {belum > 9 ? '9+' : belum}
          </span>
        )}
      </button>

      {buka && (
        <div className="muncul-halus absolute right-0 z-50 mt-3 w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-lg border border-line bg-white text-left shadow-lg [--ff-geser:-8px]">
          <p className="border-b border-line px-4 py-3 text-[13px] font-semibold text-navy-900">Notifikasi</p>
          {data.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">Belum ada notifikasi.</p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {data.map((n) => {
                const isi = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.dibaca && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber" />}
                      <span className="text-[13px] font-semibold text-navy-900">{n.judul}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-ink/75">{n.isi}</span>
                    <span className="mt-1 block text-[11px] text-muted">
                      {new Date(n.dibuat_at).toLocaleString('id-ID', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </>
                )
                const kelas = `block border-b border-line px-4 py-3 last:border-b-0 ${n.dibaca ? '' : 'bg-lavender/25'}`
                return (
                  <li key={n.notifikasi_id}>
                    {n.tautan ? (
                      <Link to={n.tautan} onClick={() => setBuka(false)} className={`${kelas} hover:bg-lavender/40`}>
                        {isi}
                      </Link>
                    ) : (
                      <div className={kelas}>{isi}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

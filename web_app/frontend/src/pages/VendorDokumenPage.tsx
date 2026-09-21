import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldIcon, NoteIcon, FolderIcon, UserCircleIcon } from '../components/icons'
import { get, kirim } from '../lib/api'

/** Langkah 2 onboarding vendor: unggah dokumen legalitas.
 *
 *  CATATAN PENTING: backend hanya menyimpan NAMA BERKAS-nya
 *  (`vendor_documents.file_name`), bukan isinya — belum ada object storage.
 *  Jadi file yang dipilih di sini tidak benar-benar terkirim; yang tercatat
 *  cuma namanya, dan status kurasinya jadi `pending`.
 *  ponytail: metadata saja, cukup untuk demo lomba. Upgrade: Supabase
 *  Storage + simpan URL-nya di kolom yang sama. */

type ApiDocument = {
  document_id: string
  doc_type: string
  file_name: string
  status: 'pending' | 'approved' | 'rejected'
  uploaded_at: string
}

const jenisDokumen = [
  {
    type: 'ktp',
    judul: 'KTP Penanggung Jawab',
    catatan: 'Scan atau foto KTP asli, pastikan tulisan terbaca jelas.',
    tombol: 'Pilih File KTP',
    batas: 'Maksimal 5MB (JPG, PNG, PDF)',
    Icon: UserCircleIcon,
  },
  {
    type: 'npwp',
    judul: 'NPWP Perusahaan / Pribadi',
    catatan: 'Dokumen NPWP yang masih berlaku.',
    tombol: 'Pilih File NPWP',
    batas: 'Maksimal 5MB (JPG, PNG, PDF)',
    Icon: NoteIcon,
  },
  {
    type: 'siup',
    judul: 'SIUP atau Portofolio Bisnis',
    catatan:
      'Surat Izin Usaha Perdagangan atau dokumen portofolio komprehensif yang menunjukkan layanan Anda.',
    tombol: 'Pilih File SIUP/Portofolio',
    batas: 'Maksimal 10MB (PDF disarankan)',
    Icon: FolderIcon,
  },
]

const labelStatus: Record<ApiDocument['status'], string> = {
  pending: 'Menunggu kurasi tim',
  approved: 'Terverifikasi',
  rejected: 'Ditolak, unggah ulang',
}

export default function VendorDokumenPage() {
  const navigate = useNavigate()
  const lanjutan = (useLocation().state ?? {}) as { category?: string }

  const [tersimpan, setTersimpan] = useState<Record<string, ApiDocument>>({})
  const [dipilih, setDipilih] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    get<{ documents: ApiDocument[] }>('/vendors/me/documents')
      .then(({ documents }) =>
        setTersimpan(Object.fromEntries(documents.map((d) => [d.doc_type, d])))
      )
      .catch(() => {
        /* Vendor baru belum punya dokumen — biarkan kosong, bukan error. */
      })
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const baru = Object.entries(dipilih)
    if (baru.length === 0) {
      setError('Pilih minimal satu dokumen sebelum mengirim.')
      return
    }

    setLoading(true)
    try {
      for (const [docType, fileName] of baru) {
        await kirim<{ document: ApiDocument }>(`/vendors/me/documents/${docType}`, 'PUT', {
          file_name: fileName,
        })
      }
      navigate('/vendor/onboarding', { state: lanjutan })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream px-4 py-12">
      <h1 className="text-center font-display text-[28px] md:text-[36px] font-semibold text-navy-900">
        Festa Vendor
      </h1>

      <div className="mx-auto mt-10 w-full max-w-[800px]">
        <div className="flex items-baseline justify-between text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
          <span>Langkah 2 dari 3</span>
          <span>Verifikasi Dokumen</span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-lavender">
          <div className="h-full w-2/3 rounded-full bg-navy-900" />
        </div>

        <form onSubmit={handleSubmit} className="mt-8 rounded-lg border border-line bg-white p-8 sm:p-11">
          <h2 className="font-display text-[30px] font-semibold text-navy-900">
            Verifikasi Identitas &amp; Legalitas
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Unggah dokumen resmi perusahaan atau identitas pribadi Anda untuk memastikan keamanan dan
            membangun kepercayaan pelanggan di Festa Festum.
          </p>

          <div className="mt-7 flex gap-3 rounded border border-lavender bg-lavender/40 p-4">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <div>
              <p className="text-[14px] font-semibold text-navy-900">Keamanan Data Terjamin</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink/80">
                Dokumen hanya digunakan untuk keperluan verifikasi. Proses kurasi tim internal kami
                membutuhkan waktu 1–2 hari kerja.
              </p>
            </div>
          </div>

          {jenisDokumen.map(({ type, judul, catatan, tombol, batas, Icon }) => {
            const doc = tersimpan[type]
            const namaBaru = dipilih[type]

            return (
              <div key={type} className="mt-8">
                <p className="text-[15px] font-semibold text-navy-900">{judul}</p>
                <p className="mt-1 text-[13px] text-muted">{catatan}</p>

                <label
                  htmlFor={`file-${type}`}
                  className="mt-4 flex cursor-pointer flex-col items-center rounded bg-cream px-6 py-9 text-center transition-colors hover:bg-lavender/40"
                >
                  <Icon className="h-6 w-6 text-ink/60" />
                  <span className="mt-3 text-[14px] font-semibold text-navy-900">
                    {namaBaru ?? doc?.file_name ?? tombol}
                  </span>
                  <span className="mt-1 text-[12px] tracking-wide text-muted uppercase">{batas}</span>
                  {doc && !namaBaru && (
                    <span className="mt-2 text-[12px] font-semibold text-amber">
                      {labelStatus[doc.status]}
                    </span>
                  )}
                </label>
                <input
                  id={`file-${type}`}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setDipilih((d) => ({ ...d, [type]: f.name }))
                  }}
                />
              </div>
            )
          })}

          <p className="mt-8 rounded border border-line bg-cream px-4 py-3 text-[12px] leading-relaxed text-muted">
            Untuk demo lomba, yang tercatat baru <b>nama berkasnya</b> — isinya belum diunggah ke
            penyimpanan. Tim kurasi tetap melihat dokumen apa saja yang Anda lampirkan.
          </p>

          {error && (
            <p role="alert" className="mt-5 text-[14px] text-maroon">
              {error}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-11 rounded border border-navy-900 px-7 text-[14px] font-semibold text-navy-900"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded bg-navy-900 px-7 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? 'Mengirim…' : 'Kirim Dokumen'}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-[12px] text-muted">
          © 2026 Festa Festum. Secure Escrow Protected.
        </p>
      </div>
    </div>
  )
}

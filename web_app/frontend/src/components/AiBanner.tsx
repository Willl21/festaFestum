import { Link } from 'react-router-dom'
import { ArrowRight } from './icons'

type Props = {
  subtitle?: string
  body: string
  cta: string
}

export default function AiBanner({ subtitle, body, cta }: Props) {
  return (
    <section className="mx-auto max-w-[1440px] px-6 pb-24 md:px-12">
      <div className="grid items-center gap-8 rounded-sm bg-navy-900 px-8 py-12 md:grid-cols-2 md:px-14 md:py-16">
        <div>
          <h2 className="font-display text-3xl font-semibold text-white md:text-[38px]">
            Perencana AI Pintar
          </h2>
          {subtitle && (
            <p className="mt-3 text-[15px] font-semibold text-white">{subtitle}</p>
          )}
          <p className="mt-3 max-w-[380px] text-[13px] leading-relaxed text-white/60">{body}</p>
          {/* Dulu <button> tanpa aksi apa pun — mati di landing DAN kelima
              halaman kategori yang memakai banner ini. */}
          <Link
            to="/festa-ai"
            className="mt-7 inline-flex items-center gap-6 rounded-sm bg-amber px-4 py-2 text-[12px] font-semibold text-navy-900 transition-opacity hover:opacity-90"
          >
            {cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Ilustrasi abstrak "kartu jadwal" seperti di mockup */}
        <div className="rounded-sm bg-white/10 p-10">
          <div className="rotate-[-4deg] rounded-sm bg-white/15 p-6 shadow-lg">
            <div className="space-y-2.5">
              <div className="h-1.5 w-4/5 rounded bg-white/40" />
              <div className="h-1.5 w-full rounded bg-white/30" />
              <div className="h-1.5 w-3/5 rounded bg-white/30" />
            </div>
            <div className="mt-6 flex gap-2">
              <div className="h-4 w-4 rounded-full bg-amber" />
              <div className="h-4 w-4 rounded-full bg-white/40" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

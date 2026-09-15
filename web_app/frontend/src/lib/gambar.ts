/** Mengecilkan gambar di browser sebelum dikirim ke backend.
 *
 *  Yang masuk DB adalah data URL, bukan berkas — proyek ini tidak punya
 *  storage/CDN (lihat migrasi 006 & 008). Tanpa pengecilan ini, foto kamera
 *  4 MB menembus batas ukuran body dan ditolak mentah-mentah.
 *
 *  Dipotong di tengah, bukan digepengkan, supaya wajah dan objek utama tidak
 *  melar saat dipasang di bingkai dengan rasio berbeda. */
export function kecilkanGambar(file: File, lebar: number, tinggi: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('Berkas itu bukan gambar yang bisa dibaca.'))
    img.onload = () => {
      const kanvas = document.createElement('canvas')
      kanvas.width = lebar
      kanvas.height = tinggi
      const ctx = kanvas.getContext('2d')
      if (!ctx) return reject(new Error('Browser tidak mendukung pemotongan gambar.'))

      // Ambil kotak terbesar dari gambar asli yang rasionya sama dengan bingkai
      // tujuan, lalu tarik dari tengah.
      const rasio = lebar / tinggi
      const potongLebar = Math.min(img.width, img.height * rasio)
      const potongTinggi = potongLebar / rasio

      ctx.drawImage(
        img,
        (img.width - potongLebar) / 2, (img.height - potongTinggi) / 2, potongLebar, potongTinggi,
        0, 0, lebar, tinggi,
      )
      URL.revokeObjectURL(img.src)
      resolve(kanvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = URL.createObjectURL(file)
  })
}

/** Foto profil: kotak, dipakai di bingkai bulat 92px. */
export const AVATAR = [256, 256] as const

/** Foto portofolio vendor: lanskap 3:2, jadi gambar etalase. Ditahan di 900px
 *  supaya hasil base64-nya tetap di bawah FOTO_MAX_CHARS (~150 KB) di backend. */
export const PORTOFOLIO = [900, 600] as const

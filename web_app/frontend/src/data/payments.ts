/** Metode pembayaran, harus sama persis dengan tabel METHODS di
 *  `backend/src/config/midtrans.js`. Kalau `id` di sini meleset, backend
 *  membalas 400 "metode tidak didukung".
 *
 *  Kartu kredit dan paylater sengaja TIDAK ada: kartu butuh SDK tokenisasi
 *  Midtrans di browser plus alur 3DS, paylater dikeluarkan atas permintaan.
 */
export type MetodeBayar = {
  id: string
  label: string
  grup: 'Virtual Account' | 'E-Wallet / QRIS' | 'Bayar di Gerai'
  /** Petunjuk yang ditampilkan di halaman pembayaran. */
  petunjuk: string[]
}

export const metodeBayar: MetodeBayar[] = [
  {
    id: 'bca_va', label: 'BCA Virtual Account', grup: 'Virtual Account',
    petunjuk: [
      'Buka BCA Mobile, pilih m-BCA, masukkan kode akses.',
      'Pilih m-Transfer > BCA Virtual Account.',
      'Masukkan nomor Virtual Account di atas.',
      'Periksa nama dan nominal, lalu masukkan PIN m-BCA.',
    ],
  },
  {
    id: 'bni_va', label: 'BNI Virtual Account', grup: 'Virtual Account',
    petunjuk: [
      'Buka BNI Mobile Banking, pilih Transfer > Virtual Account Billing.',
      'Masukkan nomor Virtual Account di atas.',
      'Periksa detail tagihan, lalu masukkan password transaksi.',
    ],
  },
  {
    id: 'bri_va', label: 'BRI Virtual Account', grup: 'Virtual Account',
    petunjuk: [
      'Buka BRImo, pilih BRIVA.',
      'Masukkan nomor Virtual Account di atas.',
      'Periksa detail tagihan, lalu masukkan PIN.',
    ],
  },
  {
    id: 'cimb_va', label: 'CIMB Virtual Account', grup: 'Virtual Account',
    petunjuk: [
      'Buka OCTO Mobile, pilih Transfer > Transfer ke Rekening CIMB Niaga.',
      'Masukkan nomor Virtual Account di atas.',
      'Periksa detail tagihan, lalu konfirmasi.',
    ],
  },
  {
    id: 'permata_va', label: 'Permata Virtual Account', grup: 'Virtual Account',
    petunjuk: [
      'Buka PermataMobile X, pilih Pembayaran > Virtual Account.',
      'Masukkan nomor Virtual Account di atas.',
      'Periksa detail tagihan, lalu konfirmasi dengan token.',
    ],
  },
  {
    id: 'mandiri_bill', label: 'Mandiri Bill Payment', grup: 'Virtual Account',
    petunjuk: [
      'Buka Livin\' by Mandiri, pilih Bayar > Multipayment.',
      'Masukkan Kode Perusahaan (biller code) di atas.',
      'Masukkan Kode Bayar (bill key) di atas.',
      'Periksa detail tagihan, lalu konfirmasi dengan PIN.',
    ],
  },
  {
    id: 'qris', label: 'QRIS', grup: 'E-Wallet / QRIS',
    petunjuk: [
      'Buka aplikasi e-wallet atau mobile banking apa pun yang mendukung QRIS.',
      'Pilih menu Scan / Bayar, lalu pindai kode QR di atas.',
      'Periksa nama merchant dan nominal, lalu konfirmasi.',
    ],
  },
  {
    id: 'gopay', label: 'GoPay', grup: 'E-Wallet / QRIS',
    petunjuk: [
      'Buka aplikasi Gojek, pilih Bayar.',
      'Pindai kode QR di atas, atau ketuk tombol buka aplikasi.',
      'Periksa nominal, lalu konfirmasi dengan PIN GoPay.',
    ],
  },
  {
    id: 'indomaret', label: 'Indomaret', grup: 'Bayar di Gerai',
    petunjuk: [
      'Datang ke gerai Indomaret terdekat.',
      'Sebutkan pembayaran Midtrans dan tunjukkan kode bayar di atas.',
      'Bayar sesuai nominal, lalu simpan struknya.',
    ],
  },
  {
    id: 'alfamart', label: 'Alfamart', grup: 'Bayar di Gerai',
    petunjuk: [
      'Datang ke gerai Alfamart, Alfamidi, atau Dan+Dan terdekat.',
      'Sebutkan pembayaran Midtrans dan tunjukkan kode bayar di atas.',
      'Bayar sesuai nominal, lalu simpan struknya.',
    ],
  },
]

export const cariMetode = (id: string) => metodeBayar.find((m) => m.id === id)

/** Logo merek di public/img/bayar/, dinamai dari awalan id: bca_va -> bca.svg,
 *  mandiri_bill -> mandiri.svg. SVG dari Wikimedia Commons. */
export const logoMetode = (id: string) => `/img/bayar/${id.split('_')[0]}.svg`

/** Urutan grup untuk ditampilkan di halaman checkout. */
export const grupMetode = ['Virtual Account', 'E-Wallet / QRIS', 'Bayar di Gerai'] as const

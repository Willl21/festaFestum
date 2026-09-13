import { BrowserRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import LandingPage from './pages/LandingPage'
import FloristPage from './pages/FloristPage'
import MuaPage from './pages/MuaPage'
import AttirePage from './pages/AttirePage'
import FotograferPage from './pages/FotograferPage'
import EoPage from './pages/EoPage'
import FloristDetailPage from './pages/FloristDetailPage'
import MuaDetailPage from './pages/MuaDetailPage'
import AttireDetailPage from './pages/AttireDetailPage'
import FotograferDetailPage from './pages/FotograferDetailPage'
import EoDetailPage from './pages/EoDetailPage'
import FloristOrderPage from './pages/FloristOrderPage'
import AttireOrderPage from './pages/AttireOrderPage'
import VenueOrderPage from './pages/VenueOrderPage'
import CheckoutPage from './pages/CheckoutPage'
import VirtualAccountPage from './pages/VirtualAccountPage'
import KonfirmasiPage from './pages/KonfirmasiPage'
import InvoicePage from './pages/InvoicePage'
import PesananSayaPage from './pages/PesananSayaPage'
import FestaAiPage from './pages/FestaAiPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VendorLayout from './components/VendorLayout'
import VendorDashboardPage from './pages/VendorDashboardPage'
import VendorPemesananPage from './pages/VendorPemesananPage'
import VendorJadwalPage from './pages/VendorJadwalPage'
import VendorLayananPage from './pages/VendorLayananPage'
import VendorKeuanganPage from './pages/VendorKeuanganPage'
import VendorLoginPage from './pages/VendorLoginPage'
import VendorRegisterPage from './pages/VendorRegisterPage'
import VendorDokumenPage from './pages/VendorDokumenPage'
import VendorOnboardingPage from './pages/VendorOnboardingPage'
import ProfilPage from './pages/ProfilPage'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminLayout from './components/AdminLayout'
import AdminVendorPage from './pages/AdminVendorPage'
import AdminRingkasanPage from './pages/AdminRingkasanPage'
import AdminEscrowPage from './pages/AdminEscrowPage'
import AdminAkunPage from './pages/AdminAkunPage'

/** Navbar + Footer hanya untuk halaman situs. Halaman auth full-screen,
 *  jadi dia duduk di luar layout ini.
 *
 *  Transisi antar halaman ada di sini: <AnimatePresence mode="wait"> menunggu
 *  halaman lama selesai keluar sebelum yang baru masuk, jadi keduanya tidak
 *  pernah bertumpuk. Kuncinya pathname — tiap rute dianggap elemen berbeda.
 *
 *  POSISI SCROLL DIRESET di onExitComplete — tepat setelah halaman lama
 *  hilang dan sebelum yang baru muncul. Tanpa ini, pindah dari halaman
 *  panjang bikin halaman baru terbuka di posisi tengah, dan sisa halaman
 *  lama masih terlihat sekejap.
 *
 *  `behavior: 'instant'` wajib: html punya scroll-behavior: smooth untuk
 *  tautan anchor, dan tanpa override ini reset posisinya ikut dianimasikan
 *  pelan — itu justru sumber kesan "tidak benar-benar pindah".
 *
 *  Keluarnya tetap lebih cepat daripada masuknya (0,22s vs 0,52s): mata
 *  lebih memaafkan halaman baru yang datang perlahan daripada halaman lama
 *  yang lambat pergi. Kalau mau disetel, dua angka `duration` di bawah ini
 *  yang diubah — tidak ada tempat lain.
 *
 *  Animasi masuk isi halaman ada di <TukarHalus> (components/TukarHalus.tsx),
 *  bukan animasi saat di-scroll: <Reveal> dicopot 13 Sep karena `whileInView`
 *  membuat bagian yang sudah terlihat sejak awal animasi di saat yang tidak
 *  masuk akal, dan bertumpuk dengan fade masuk dari TukarHalus
 *  halaman yang memang perlu. */
function SiteLayout() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <AnimatePresence
        mode="wait"
        initial={false}
        onExitComplete={() => window.scrollTo({ top: 0, behavior: 'instant' })}
      >
        <motion.main
          key={pathname}
          className="flex-1"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.52, ease: [0.22, 0.61, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/florist" element={<FloristPage />} />
          <Route path="/florist/:id" element={<FloristDetailPage />} />
          <Route path="/mua" element={<MuaPage />} />
          <Route path="/mua/:id" element={<MuaDetailPage />} />
          <Route path="/jas-kebaya" element={<AttirePage />} />
          <Route path="/jas-kebaya/:id" element={<AttireDetailPage />} />
          <Route path="/fotografer" element={<FotograferPage />} />
          <Route path="/fotografer/:id" element={<FotograferDetailPage />} />
          <Route path="/event-organizer" element={<EoPage />} />
          <Route path="/event-organizer/:id" element={<EoDetailPage />} />
          <Route path="/pesanan" element={<PesananSayaPage />} />
          <Route path="/festa-ai" element={<FestaAiPage />} />
          <Route path="/profil" element={<ProfilPage />} />
        </Route>
        {/* Halaman pengisian pesanan punya header/footer sendiri (tanpa
            navigasi) supaya user tidak keluar alur di tengah pengisian. */}
        <Route path="/florist/:id/pesan" element={<FloristOrderPage />} />
        <Route path="/jas-kebaya/:id/pesan" element={<AttireOrderPage />} />
        <Route path="/mua/:id/pesan" element={<VenueOrderPage kind="mua" />} />
        <Route path="/fotografer/:id/pesan" element={<VenueOrderPage kind="fotografer" />} />
        <Route path="/event-organizer/:id/pesan" element={<VenueOrderPage kind="eo" />} />
        <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        <Route path="/pembayaran/:paymentId" element={<VirtualAccountPage />} />
        <Route path="/pesanan/selesai/:bookingId" element={<KonfirmasiPage />} />
        {/* Invoice punya tata letak cetak sendiri, jadi di luar SiteLayout. */}
        <Route path="/invoice/:bookingId" element={<InvoicePage />} />
        {/* Auth & onboarding vendor: layar penuh sendiri, di luar VendorLayout
            karena sidebar dashboard belum relevan sebelum profilnya jadi. */}
        <Route path="/vendor/masuk" element={<VendorLoginPage />} />
        <Route path="/vendor/daftar" element={<VendorRegisterPage />} />
        <Route path="/vendor/dokumen" element={<VendorDokumenPage />} />
        <Route path="/vendor/onboarding" element={<VendorOnboardingPage />} />

        {/* Sisi vendor: sidebar sendiri, tanpa navbar/footer marketplace. */}
        <Route path="/vendor" element={<VendorLayout />}>
          <Route index element={<VendorDashboardPage />} />
          <Route path="pemesanan" element={<VendorPemesananPage />} />
          <Route path="jadwal" element={<VendorJadwalPage />} />
          <Route path="layanan" element={<VendorLayananPage />} />
          <Route path="keuangan" element={<VendorKeuanganPage />} />
        </Route>

        {/* Pusat Kendali admin. Tidak ada rute pendaftaran — akun admin
            dibuat langsung di database. */}
        <Route path="/admin/masuk" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminRingkasanPage />} />
          <Route path="vendor" element={<AdminVendorPage />} />
          <Route path="escrow" element={<AdminEscrowPage />} />
          <Route path="akun" element={<AdminAkunPage />} />
        </Route>

        <Route path="/masuk" element={<LoginPage />} />
        <Route path="/daftar" element={<RegisterPage />} />
      </Routes>
      </MotionConfig>
    </BrowserRouter>
  )
}

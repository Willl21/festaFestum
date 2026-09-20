// Templat layanan per kategori untuk seed-layanan.js.
//
// Dipisah dari skripnya karena ini DATA, bukan logika — dan karena isinya
// yang paling sering diutak-atik kalau demo terasa kurang meyakinkan.
//
// Aturan yang harus dipatuhi tiap templat:
//   - `details` HANYA boleh memakai kunci yang ada di src/lib/layananDetail.js
//     untuk kategori itu. Kunci asing dibalas 400 oleh API, dan lewat INSERT
//     langsung dia akan tersimpan diam-diam lalu tidak pernah dirender.
//   - `faktor` dikali harga dasar vendor (harga layanan pertamanya, yang
//     datang dari price_start di CSV Data Scientist). Jadi vendor mahal tetap
//     mahal di semua paketnya, dan urutan harga antarvendor tidak berubah.
//   - `hariMinimal` = minimum_notice_days, per LAYANAN bukan per vendor.
//     Kebaya butuh fitting berminggu-minggu, buket hadiah bisa mendadak.
//   - `foto` adalah kueri Pexels khusus produk itu, sengaja tanpa potret
//     wajah. Ini yang bikin katalog florist tidak berisi lima foto buket yang
//     sama persis.

const TEMPLAT = {
  makeup_artist: [
    {
      nama: 'Makeup Akad & Resepsi',
      faktor: 1, hariMinimal: 14,
      foto: 'bridal makeup products flatlay',
      deskripsi: 'Rias pengantin untuk dua sesi dalam satu hari, akad dan resepsi, '
        + 'termasuk satu kali ganti tatanan rambut dan retouch di sela acara.',
      details: {
        jenis_layanan: 'Rias pengantin',
        gaya_makeup: 'Soft glam, flawless, tahan seharian',
        durasi: '5-6 jam termasuk retouch',
        jumlah_orang: '1 pengantin',
        fasilitas: 'Trial makeup sekali sebelum hari-H, hairdo, softlens bening, '
          + 'bulu mata, dan asisten rias. Produk tahan air dan tahan keringat.',
      },
    },
    {
      nama: 'Makeup Prewedding',
      faktor: 0.6, hariMinimal: 7,
      foto: 'makeup brushes cosmetics table',
      deskripsi: 'Rias untuk sesi pemotretan prewedding, indoor maupun outdoor, '
        + 'dengan dua pilihan tatanan yang bisa diganti di tengah sesi.',
      details: {
        jenis_layanan: 'Rias prewedding',
        gaya_makeup: 'Natural glow untuk kamera',
        durasi: '3-4 jam',
        jumlah_orang: '2 orang (pasangan)',
        fasilitas: 'Dua tatanan rambut, retouch selama sesi foto, dan konsultasi '
          + 'konsep bersama fotografer.',
      },
    },
    {
      nama: 'Makeup Keluarga Inti',
      faktor: 0.45, hariMinimal: 7,
      foto: 'cosmetics beauty products arrangement',
      deskripsi: 'Rias untuk orang tua dan keluarga inti pengantin, dikerjakan '
        + 'berurutan di lokasi yang sama sebelum acara dimulai.',
      details: {
        jenis_layanan: 'Rias keluarga',
        gaya_makeup: 'Elegan, menyesuaikan usia',
        durasi: '45 menit per orang',
        jumlah_orang: 'Mulai dari 2 orang',
        fasilitas: 'Hairdo sanggul atau blow, dan penyesuaian warna dengan '
          + 'kebaya yang dipakai.',
      },
    },
    {
      nama: 'Makeup Bridesmaid',
      faktor: 0.35, hariMinimal: 5,
      foto: 'makeup palette brushes',
      deskripsi: 'Rias untuk bridesmaid atau pagar ayu, dengan tampilan seragam '
        + 'yang disesuaikan dengan warna gaun.',
      details: {
        jenis_layanan: 'Rias bridesmaid',
        gaya_makeup: 'Seragam, natural, tidak menyaingi pengantin',
        durasi: '30-40 menit per orang',
        jumlah_orang: 'Mulai dari 3 orang',
        fasilitas: 'Bulu mata, penataan rambut sederhana, dan penyesuaian warna '
          + 'lipstik dengan tema acara.',
      },
    },
    {
      nama: 'Paket Rias Sehari Penuh',
      faktor: 1.8, hariMinimal: 21,
      foto: 'luxury cosmetics beauty flatlay',
      deskripsi: 'Tim rias menemani dari pagi sampai acara selesai: pengantin, '
        + 'keluarga inti, dan bridesmaid dikerjakan satu tim dalam satu hari.',
      details: {
        jenis_layanan: 'Paket lengkap sehari',
        gaya_makeup: 'Menyesuaikan tema acara',
        durasi: 'Sejak pagi sampai acara selesai',
        jumlah_orang: 'Pengantin + hingga 8 orang pendamping',
        fasilitas: 'Trial makeup, tim 3 perias, hairdo semua peserta, retouch '
          + 'tanpa batas selama acara, dan area rias portabel.',
      },
    },
  ],

  event_organizer: [
    {
      nama: 'Wedding Organizer Full Service',
      faktor: 1, hariMinimal: 60,
      foto: 'elegant wedding reception decoration',
      deskripsi: 'Pendampingan penuh sejak perencanaan sampai hari pelaksanaan, '
        + 'termasuk pencarian dan koordinasi seluruh vendor pendukung.',
      details: {
        jenis_acara: 'Pernikahan',
        cakupan: 'Konsep acara, penyusunan anggaran, kurasi vendor, kontrak, '
          + 'gladi bersih, rundown, sampai koordinasi hari-H dan pembongkaran.',
        durasi: 'Pendampingan 6-12 bulan',
        kapasitas: '200-800 tamu',
        tim: 'Satu project manager, dua koordinator area, dan tim lapangan yang '
          + 'jumlahnya menyesuaikan besar acara.',
      },
    },
    {
      nama: 'Paket Lamaran & Engagement',
      faktor: 0.5, hariMinimal: 30,
      foto: 'engagement party table setting flowers',
      deskripsi: 'Acara lamaran skala keluarga dengan dekorasi, MC, dan susunan '
        + 'acara adat yang disiapkan sesuai permintaan kedua keluarga.',
      details: {
        jenis_acara: 'Lamaran / engagement',
        cakupan: 'Dekorasi area lamaran, MC, seserahan, dokumentasi ringan, dan '
          + 'pengaturan alur acara adat.',
        durasi: '4-5 jam',
        kapasitas: '30-100 tamu',
        tim: 'Satu koordinator dan dua kru lapangan.',
      },
    },
    {
      nama: 'Gala Dinner Korporat',
      faktor: 1.4, hariMinimal: 45,
      foto: 'gala dinner ballroom table setting',
      deskripsi: 'Malam penghargaan atau jamuan perusahaan dengan panggung, tata '
        + 'cahaya, dan susunan acara yang disiapkan bersama tim internal klien.',
      details: {
        jenis_acara: 'Gala dinner korporat',
        cakupan: 'Konsep panggung, tata cahaya dan suara, run of show, registrasi '
          + 'tamu, hiburan pengisi acara, dan laporan pasca-acara.',
        durasi: '5-6 jam',
        kapasitas: '150-500 tamu',
        tim: 'Satu event director, tim teknis, dan kru registrasi.',
      },
    },
    {
      nama: 'Seminar & Corporate Gathering',
      faktor: 0.9, hariMinimal: 30,
      foto: 'conference seminar hall chairs stage',
      deskripsi: 'Seminar, workshop, atau gathering karyawan, termasuk kebutuhan '
        + 'teknis presentasi dan pengelolaan peserta.',
      details: {
        jenis_acara: 'Seminar / gathering',
        cakupan: 'Tata ruang, perlengkapan presentasi, registrasi peserta, '
          + 'konsumsi, dan dokumentasi acara.',
        durasi: 'Setengah hari sampai dua hari',
        kapasitas: '50-300 peserta',
        tim: 'Satu koordinator, tim registrasi, dan operator teknis.',
      },
    },
    {
      nama: 'Koordinator Hari-H',
      faktor: 0.35, hariMinimal: 21,
      foto: 'wedding venue aisle chairs decoration',
      deskripsi: 'Untuk yang sudah menyiapkan sendiri semua vendornya dan hanya '
        + 'butuh tim yang menjalankan rundown di hari pelaksanaan.',
      details: {
        jenis_acara: 'Semua jenis acara formal',
        cakupan: 'Pengambilalihan rundown dua minggu sebelum hari-H, gladi '
          + 'bersih, koordinasi vendor di lokasi, dan penanganan kendala.',
        durasi: 'Hari pelaksanaan saja',
        kapasitas: 'Sampai 500 tamu',
        tim: 'Satu koordinator dan empat kru lapangan.',
      },
    },
  ],

  photographer: [
    {
      nama: 'Dokumentasi Akad & Resepsi',
      faktor: 1, hariMinimal: 30,
      foto: 'wedding photography camera equipment',
      deskripsi: 'Liputan penuh dari persiapan pagi sampai resepsi selesai, '
        + 'dikerjakan lebih dari satu fotografer agar tidak ada momen terlewat.',
      details: {
        jenis_fotografi: 'Dokumentasi pernikahan',
        gaya_fotografi: 'Candid dan formal, keduanya',
        durasi: '10-12 jam',
        jumlah_fotografer: '2 fotografer + 1 asisten',
        output: 'Seluruh file hasil seleksi dalam resolusi penuh, 200 foto '
          + 'retouch, album cetak 20 halaman, dan cadangan penyimpanan digital.',
        estimasi_pengerjaan: '21-30 hari kerja',
        area_layanan: 'Jabodetabek, luar kota dengan biaya perjalanan',
      },
    },
    {
      nama: 'Prewedding Outdoor',
      faktor: 0.6, hariMinimal: 21,
      foto: 'camera lens photography gear',
      deskripsi: 'Sesi pemotretan di satu atau dua lokasi pilihan, termasuk '
        + 'survei lokasi dan penyusunan konsep bersama sebelum hari pemotretan.',
      details: {
        jenis_fotografi: 'Prewedding',
        gaya_fotografi: 'Cinematic, cahaya alami',
        durasi: '6-8 jam',
        jumlah_fotografer: '1 fotografer + 1 asisten',
        output: '100 foto hasil seleksi, 40 foto retouch penuh, dan satu foto '
          + 'cetak ukuran besar berbingkai.',
        estimasi_pengerjaan: '14 hari kerja',
        area_layanan: 'Jabodetabek dan Bandung',
      },
    },
    {
      nama: 'Foto Keluarga Studio',
      faktor: 0.35, hariMinimal: 7,
      foto: 'photography studio lighting equipment',
      deskripsi: 'Pemotretan keluarga di studio dengan beberapa pilihan latar '
        + 'dan penataan cahaya, cocok untuk foto resmi keluarga besar.',
      details: {
        jenis_fotografi: 'Foto keluarga',
        gaya_fotografi: 'Formal, latar bersih',
        durasi: '2-3 jam',
        jumlah_fotografer: '1 fotografer',
        output: '50 foto hasil seleksi, 15 foto retouch, dan cetak 10R sebanyak '
          + 'lima lembar.',
        estimasi_pengerjaan: '7 hari kerja',
        area_layanan: 'Studio sendiri',
      },
    },
    {
      nama: 'Dokumentasi Wisuda',
      faktor: 0.3, hariMinimal: 5,
      foto: 'graduation cap diploma photography',
      deskripsi: 'Liputan hari wisuda mulai dari prosesi di kampus sampai sesi '
        + 'foto bersama keluarga setelah acara selesai.',
      details: {
        jenis_fotografi: 'Dokumentasi wisuda',
        gaya_fotografi: 'Candid dan foto kelompok',
        durasi: '4 jam',
        jumlah_fotografer: '1 fotografer',
        output: '80 foto hasil seleksi, 20 foto retouch, dan cetak 4R sebanyak '
          + 'sepuluh lembar.',
        estimasi_pengerjaan: '7 hari kerja',
        area_layanan: 'Jabodetabek',
      },
    },
    {
      nama: 'Paket Foto & Video Sinematik',
      faktor: 1.9, hariMinimal: 45,
      foto: 'cinema video camera rig production',
      deskripsi: 'Dokumentasi foto sekaligus video, termasuk video pendek '
        + 'sinematik dan rekaman utuh jalannya acara.',
      details: {
        jenis_fotografi: 'Foto + videografi',
        gaya_fotografi: 'Sinematik',
        durasi: '12 jam',
        jumlah_fotografer: '2 fotografer + 2 videografer',
        output: 'Semua foto hasil seleksi, 250 foto retouch, video highlight '
          + '5 menit, video dokumenter 30 menit, dan album cetak premium.',
        estimasi_pengerjaan: '30-45 hari kerja',
        area_layanan: 'Seluruh Indonesia dengan biaya perjalanan',
      },
    },
  ],

  florist: [
    {
      nama: 'Buket Pengantin',
      faktor: 1, hariMinimal: 7,
      foto: 'wedding bouquet white flowers',
      deskripsi: 'Buket tangan pengantin yang dirangkai sesuai warna gaun dan '
        + 'tema acara, dikerjakan sehari sebelum acara agar bunganya segar.',
      details: {
        jenis_produk: 'Buket tangan pengantin',
        jenis_bunga: 'Mawar, peony, baby breath, eucalyptus',
        warna: 'Putih, nude, pastel, sesuai permintaan',
        ukuran: 'Diameter 25-35 cm',
        bisa_custom: 'Ya, termasuk pilihan pita dan gagang',
        estimasi_pengerjaan: '1-2 hari sebelum acara',
        fasilitas: 'Konsultasi konsep, foto contoh rangkaian sebelum dikerjakan, '
          + 'dan pengiriman ke lokasi acara.',
      },
    },
    {
      nama: 'Standing Flower Ucapan',
      faktor: 0.8, hariMinimal: 2,
      foto: 'standing flower arrangement stand',
      deskripsi: 'Papan bunga ucapan selamat untuk pernikahan, pembukaan usaha, '
        + 'atau belasungkawa, lengkap dengan kartu ucapan.',
      details: {
        jenis_produk: 'Standing flower / papan bunga',
        jenis_bunga: 'Krisan, anggrek, mawar',
        warna: 'Menyesuaikan jenis acara',
        ukuran: 'Tinggi 150-200 cm',
        bisa_custom: 'Ya, teks ucapan bebas',
        estimasi_pengerjaan: '1 hari',
        fasilitas: 'Pengantaran dan pemasangan di lokasi, serta pengambilan '
          + 'kembali rangka setelah acara.',
      },
    },
    {
      nama: 'Buket Hadiah Wisuda',
      faktor: 0.25, hariMinimal: 1,
      foto: 'graduation flower bouquet gift',
      deskripsi: 'Buket ukuran sedang untuk hadiah wisuda atau ulang tahun, bisa '
        + 'dikirim langsung ke penerima dengan kartu ucapan.',
      details: {
        jenis_produk: 'Buket hadiah',
        jenis_bunga: 'Mawar, matahari, baby breath',
        warna: 'Cerah atau pastel',
        ukuran: 'Diameter 20-25 cm',
        bisa_custom: 'Ya, bisa dicampur buket snack',
        estimasi_pengerjaan: 'Bisa hari yang sama',
        fasilitas: 'Kartu ucapan tulis tangan dan pengiriman ke alamat penerima '
          + 'di area Jabodetabek.',
      },
    },
    {
      nama: 'Dekorasi Meja Pelaminan',
      faktor: 2.2, hariMinimal: 21,
      foto: 'wedding table flower centerpiece decoration',
      deskripsi: 'Rangkaian bunga untuk area pelaminan dan meja tamu, dipasang '
        + 'dan dibongkar oleh tim kami di hari acara.',
      details: {
        jenis_produk: 'Dekorasi bunga acara',
        jenis_bunga: 'Bunga segar impor dan lokal, dikombinasi',
        warna: 'Mengikuti tema dekorasi',
        ukuran: 'Area pelaminan sampai 8 meter',
        bisa_custom: 'Ya, dengan survei lokasi lebih dulu',
        estimasi_pengerjaan: 'Pemasangan H-1 atau pagi hari-H',
        fasilitas: 'Survei lokasi, gambar rancangan, pemasangan, penjagaan '
          + 'selama acara, dan pembongkaran.',
      },
    },
    {
      nama: 'Hand Bouquet Bridesmaid',
      faktor: 0.3, hariMinimal: 5,
      foto: 'small flower bouquets bridesmaid',
      deskripsi: 'Buket kecil seragam untuk bridesmaid, dirangkai senada dengan '
        + 'buket pengantin tapi dengan ukuran yang lebih ringkas.',
      details: {
        jenis_produk: 'Buket bridesmaid',
        jenis_bunga: 'Mawar mini, baby breath, daun hias',
        warna: 'Senada dengan gaun bridesmaid',
        ukuran: 'Diameter 15-20 cm',
        bisa_custom: 'Ya, jumlah menyesuaikan',
        estimasi_pengerjaan: '1-2 hari sebelum acara',
        fasilitas: 'Pengiriman bersamaan dengan buket pengantin.',
      },
    },
  ],

  attire_rental: [
    {
      nama: 'Kebaya Pengantin Modern',
      faktor: 1, hariMinimal: 30,
      foto: 'wedding gown dress fabric detail',
      deskripsi: 'Kebaya pengantin dengan payet kerja tangan, disewakan bersama '
        + 'kain, selop, dan perlengkapan pelengkapnya.',
      details: {
        jenis_pakaian: 'Kebaya pengantin',
        model: 'Modern, brokat payet, lengan panjang',
        ukuran: 'S sampai XXL, bisa dipermak',
        warna: 'Putih, broken white, gading, dusty pink',
        durasi_sewa: '3 hari (H-1 sampai H+1)',
        fasilitas: 'Dua kali fitting, permak menyesuaikan badan, kain dan selop, '
          + 'serta cuci setelah pemakaian.',
        ketentuan: 'Deposit dikembalikan penuh bila pakaian kembali tanpa '
          + 'kerusakan. Keterlambatan pengembalian dikenakan biaya harian.',
      },
    },
    {
      nama: 'Jas Pengantin Pria',
      faktor: 0.8, hariMinimal: 21,
      foto: 'formal suit tuxedo hanging rack',
      deskripsi: 'Setelan jas pengantin lengkap dengan kemeja, dasi atau bowtie, '
        + 'dan sepatu bila dibutuhkan.',
      details: {
        jenis_pakaian: 'Jas pengantin pria',
        model: 'Tuxedo, slim fit, tiga potong',
        ukuran: '44 sampai 56',
        warna: 'Hitam, navy, abu, putih gading',
        durasi_sewa: '3 hari',
        fasilitas: 'Fitting dan permak, kemeja, dasi kupu-kupu, saku tangan, '
          + 'dan cuci setelah pemakaian.',
        ketentuan: 'Permak permanen tidak dilakukan pada koleksi sewa. Deposit '
          + 'ditahan sampai pakaian dikembalikan.',
      },
    },
    {
      nama: 'Kebaya Keluarga & Ibu',
      faktor: 0.45, hariMinimal: 14,
      foto: 'traditional fabric batik textile',
      deskripsi: 'Kebaya untuk orang tua dan keluarga inti, tersedia dalam set '
        + 'seragam beberapa potong dengan kain senada.',
      details: {
        jenis_pakaian: 'Kebaya keluarga',
        model: 'Kutubaru dan kebaya encim',
        ukuran: 'M sampai XXXL',
        warna: 'Maroon, navy, emas, hijau botol',
        durasi_sewa: '3 hari',
        fasilitas: 'Kain batik senada, fitting, dan permak ringan.',
        ketentuan: 'Pemesanan set seragam minimal empat potong disarankan '
          + 'memesan lebih awal karena stok warna terbatas.',
      },
    },
    {
      nama: 'Beskap Adat Jawa',
      faktor: 0.6, hariMinimal: 21,
      foto: 'traditional javanese batik clothing',
      deskripsi: 'Beskap lengkap dengan blangkon, keris imitasi, dan jarik untuk '
        + 'prosesi pernikahan adat.',
      details: {
        jenis_pakaian: 'Beskap adat Jawa',
        model: 'Solo dan Yogyakarta',
        ukuran: 'M sampai XXL',
        warna: 'Hitam, navy, dan gading',
        durasi_sewa: '3 hari',
        fasilitas: 'Blangkon, jarik, stagen, keris imitasi, dan bantuan '
          + 'pemakaian di hari acara.',
        ketentuan: 'Perlengkapan adat dihitung satu set, tidak disewakan '
          + 'terpisah.',
      },
    },
    {
      nama: 'Gaun Malam Gala',
      faktor: 0.9, hariMinimal: 14,
      foto: 'evening gown dress boutique',
      deskripsi: 'Gaun panjang untuk gala dinner atau acara resmi perusahaan, '
        + 'tersedia beberapa potongan dan panjang.',
      details: {
        jenis_pakaian: 'Gaun malam',
        model: 'A-line, mermaid, off-shoulder',
        ukuran: 'S sampai XL',
        warna: 'Hitam, merah marun, emas, biru malam',
        durasi_sewa: '2 hari',
        fasilitas: 'Fitting, permak ringan, dan cuci setelah pemakaian.',
        ketentuan: 'Noda permanen atau sobek dikenakan biaya perbaikan sesuai '
          + 'kerusakan.',
      },
    },
  ],
};

module.exports = { TEMPLAT };

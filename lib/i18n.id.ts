/**
 * 印度尼西亚语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再塞一张进来会把它冲到更长，谁都翻不动。理由和 `lib/legal.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序也一致**（558 个），`zh` / `ja` / `ko` 同理。
 *    改文案时先改 `en`，再回来对齐另外几份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的印尼语在数据库里
 *    （`game_texts` 的对应语言行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` …），
 *    它们由 `translate()` 在运行时替换；漏掉一个不会报错，只会在页面上少一段字。
 *    语序可以按印尼语调整（比如 `{count} game` 而不是 `game {count}`），但名字不能动。
 *
 * ⚠️ 本文件只是**文案表**：`Locale` / `LOCALES` / `LOCALE_OPTIONS` / `messages` 的接线
 *    在 `lib/i18n.ts`，不在这里。加语言时那边要一起挂上，否则这张表不会被读到。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → konsol；developer → pengembang；series → seri
 *   · cartridge → kartrid；room → ruang；host → host；guest → tamu
 *   · netplay → main jaringan；save → simpanan；key bindings → pemetaan tombol
 *   · game library → pustaka game；guestbook → buku tamu
 *
 * 语气：界面短句、按钮用动词开头（Main / Unduh / Muat / Simpan / Batal），
 * 不写书面语长句，不用机翻腔，不加 emoji。
 *
 * ⚠️ 机种名用**印尼语玩家的通行写法**（NES / SNES / Game Boy / GBC / GBA / NDS /
 *    Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade）。标签位上取的是 `lib/consoles.ts` 的
 *    `consoleLabel(type, locale)`，和文案同源，别在这里另写一套。
 *
 * 站点名统一写 `Retro Games Box`（不翻译）；文案里一律用 `{site}` 占位，由 `translate()` 替换。
 */

import type { MessageKey } from './i18n';

export const id: Record<MessageKey, string> = {
  /*
   * SEO 文案（<title> / description / og:* / JSON-LD）。不进界面，只给爬虫和社交卡片看。
   * 机种只列代表机型 + "dan lainnya" —— 全列出来读不通也太长，全名放在 `meta.keywords`。
   */
  'meta.title': '{site} — Main Game Retro di Browser: NES, SNES, GBA & Arcade',
  'meta.description':
    'Main game NES, SNES / SFC, Game Boy, GBA, Mega Drive, dan arcade langsung di browser. Pilih judul dari pustaka online, atau muat file ROM milikmu sendiri.',
  'meta.keywords':
    'game retro, pustaka game retro online, emulator NES, emulator SNES, emulator SFC, emulator GBA, emulator Game Boy Advance, emulator Game Boy, emulator Game Boy Color, emulator NDS, emulator Nintendo DS, emulator Mega Drive, emulator Sega Genesis, emulator Game Gear, emulator Master System, emulator Sega 32X, emulator WonderSwan, emulator Neo Geo Pocket, emulator PlayStation, emulator PS1, emulator PSX, emulator arcade, main NES di browser, emulator browser, RetroArch WASM, {site}',

  /* 下线页面的 meta：标题里不写 `{site}`，根布局的 template 会补站名 */
  'seo.room.title': 'Ruang Piksel — Main Game Retro di Browser',
  'seo.room.description':
    'Masuk ke ruang piksel: game NES, SNES / SFC, Game Boy, GBA, Mega Drive, dan arcade berjalan di layar CRT. Pilih judul dari pustaka online, atau seret file ROM milikmu ke layar.',

  /* 登录页（`/login`），这一页是 noindex —— 一张表单没有可索引的正文 */
  'seo.login.title': 'Masuk',
  'seo.login.description':
    'Masuk ke akunmu agar simpanan, riwayat game, dan favorit tetap sinkron di semua perangkat.',

  /* 首页落地页 */
  'home.hero.title': 'Main game retro klasik di browser',
  'home.hero.lead':
    '{site} punya game NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade, dan lainnya untuk dimainkan online, lengkap dengan main jaringan dua pemain.',
  /* 首屏两颗钮：左边进列表，右边进屋加载自己的 ROM（动词和房间里第一句同源） */
  'home.hero.play': 'Muat ROM lokal',
  'home.hero.browse': 'Jelajahi semua game',
  'home.join.title': 'Main bareng teman',
  'home.join.hint': 'Masukkan kode ruang 4 karakter yang dibagikan temanmu.',
  'home.join.submit': 'Gabung ruang',
  /* 「两颗钮」与「搜索框」之间的分隔词，单独一行 */
  'home.hero.or': 'ATAU',
  'home.search.label': 'Cari di pustaka game',
  'home.search.placeholder': 'Cari judul / pengembang / seri',
  'home.search.submit': 'Cari',
  'home.consoles.title': 'Jelajahi per konsol',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade, dan lainnya — pilih satu untuk melihat game-nya.',
  'home.consoles.count': '{count} game',
  'home.consoles.all': 'Semua konsol',
  'home.latest.title': 'Baru ditambahkan',
  'home.latest.lead': 'Game terbaru di situs ini.',
  'home.latest.viewAll': 'Semua game',
  'home.developers.title': 'Jelajahi per pengembang',
  'home.developers.lead': 'Studio-studio ini punya game terbanyak di sini.',
  'home.developers.viewAll': 'Semua pengembang',
  /* 库空了才会用到 */
  'home.empty':
    'Pustaka masih kosong — buka ruang dan seret ROM ke layar CRT untuk mulai main.',
  /* 折叠问答：只写真的实现了的事，不写没做的卖点 */
  'home.faq.title': 'Pertanyaan umum',
  'home.faq.q1': 'Apakah gratis?',
  'home.faq.a1':
    'Sepenuhnya gratis — semua game bisa dimainkan. Masuk untuk menyimpan riwayat main dan file simpanan di cloud.',
  'home.faq.q2': 'Perlu memasang sesuatu?',
  'home.faq.a2': 'Tidak — cukup klik game dan langsung main di browser.',
  'home.faq.q3': 'Bisa dimainkan di ponsel dan tablet?',
  'home.faq.a3': 'Bisa — jalan langsung di browser ponsel dan tablet.',
  'home.faq.q4': 'Bisakah mengunduh file ROM?',
  'home.faq.a4':
    'Bisa — setiap halaman game punya tombol unduh. Unduh hanya ROM yang memang berhak kamu gunakan.',
  'home.faq.q5': 'Bisa main bareng teman?',
  'home.faq.a5': 'Tentu! Ajak teman dan buat ruang untuk bertanding.',
  'home.faq.q6': 'Apakah mendukung gamepad?',
  'home.faq.a6':
    'Mendukung — colok gamepad USB atau Bluetooth dan emulator akan mengenalinya lewat browser. Pemetaan tombol mengikuti bawaan tiap core; di ponsel pakai tombol di layar.',

  /* 首屏那段看不见的正文（sr-only）：这页除了按钮没有可索引的文字 */
  'seo.heading': 'Main game retro di browser',
  'seo.intro':
    '{site} adalah ruang game retro online. Judul NES, SNES / SFC, Game Boy, GBA, Mega Drive, dan arcade berjalan langsung di browser — diemulasikan di perangkatmu sendiri, dengan RetroArch yang dikompilasi ke WebAssembly.',
  'seo.howTo':
    'Pilih game dari pustaka online, atau seret file ROM milikmu ke televisi. Tidak perlu memasang apa pun.',

  /* 游戏列表 / 详情 / 下载三页的 SEO 文案 */
  'seo.games.title': 'Semua game — Main NES, SNES, GBA & Arcade Online',
  'seo.games.description':
    '{count} game retro di pustaka online, semuanya bisa dimainkan di browser: NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade, dan lainnya. Buka judulnya untuk detail, langsung main, atau unduh file ROM-nya.',
  /* 搜索结果两条：不进索引，服务的是人和分享卡 */
  'seo.games.search.title': 'Hasil pencarian “{keyword}”',
  'seo.games.search.description':
    '{count} game di pustaka online cocok dengan “{keyword}”. Mainkan di browser atau unduh file ROM-nya.',
  /* 机种筛选：`{console}` 是 consoleLabel() 的短标签 */
  'seo.games.console.title': 'Game {console} — Main Online di Browser',
  'seo.games.console.description':
    '{count} game {console} di pustaka online, semuanya bisa dimainkan di browser atau diunduh sebagai file ROM.',
  'seo.game.title': '{title} — Main {console} Online',
  'seo.game.description':
    'Main {title} ({console}) langsung di browser — gratis, tanpa instalasi. File ROM-nya juga tersedia untuk diunduh.',
  'seo.gameDownload.title': 'Unduh ROM {title} ({console})',
  'seo.gameDownload.description':
    'Unduh file ROM {title} ({console}) dengan satu klik, tanpa perlu daftar. Kamu juga bisa memainkannya langsung di browser.',
  /* 开发商两页 */
  'seo.developers.title': 'Pengembang game — Mainkan game NES, SNES, GBA & Arcade buatan mereka',
  'seo.developers.description':
    '{count} pengembang di balik game di pustaka online. Buka salah satu untuk melihat semua judul dari studio itu.',
  'seo.developer.title': '{name} — Game dari pengembang ini',
  'seo.developer.description':
    'Semua game {name} di pustaka online ({count}), bisa dimainkan di browser atau diunduh sebagai file ROM.',

  /* 机种两页 */
  'seo.consoles.title': 'Jelajahi per konsol — Main game NES, SNES, GBA & Arcade online',
  'seo.consoles.description':
    'Semua konsol di pustaka online (total {count} game). Pilih satu untuk melihat seluruh game-nya, langsung bisa dimainkan di browser.',
  'seo.console.title': 'Game {name} — Main online',
  'seo.console.description':
    'Semua game {name} di pustaka online ({count}), bisa dimainkan di browser atau diunduh sebagai file ROM.',

  'theme.toDark': 'Ganti ke mode malam',
  'theme.toLight': 'Ganti ke mode siang',
  /* 吊灯的点击目标 —— 描述点下去会发生什么 */
  'lamp.turnOn': 'Nyalakan lampu',
  'lamp.turnOff': 'Matikan lampu',
  /* 简洁模式：同样是「描述点下去会发生什么」 */
  'simple.enter': 'Mode sederhana: sisakan hanya dinding, TV, meja, dan lantai',
  'simple.exit': 'Keluar dari mode sederhana',
  /* 电视机大小：钮的名字、三个选项、以及读屏那句完整的话 */
  'tvSize.open': 'Ukuran TV',
  'tvSize.opt.large': 'Besar',
  'tvSize.opt.medium': 'Sedang',
  'tvSize.opt.small': 'Kecil',
  'tvSize.pick': 'Atur ukuran TV ke {level}',
  /* 语言下拉的读屏名字。语言名本身不翻译（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Bahasa',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟当前页面语言，只有那颗钮跟目标语言（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'Halaman ini dalam bahasa Indonesia',
  'localePrompt.body': 'Browser-mu memilih bahasa lain. Mau ganti?',
  'localePrompt.keep': 'Tetap bahasa Indonesia',
  'fullscreen.enter': 'Layar penuh untuk layar game',
  'fullscreen.exit': 'Keluar dari layar penuh',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P）—— 拉丁字母有字形，所以照英文那套
   * 保持全大写；但屏幕不大，句子压到最短（太长会溢出 / 糊成一团）。
   */
  'screen.pick': 'Klik untuk memilih file ROM, atau lepas di sini',
  'screen.srLabel': 'Pilih file ROM untuk dijalankan',
  'screen.tapLoad': 'KLIK UNTUK MUAT ROM LOKAL',
  'screen.orLibrary': 'ATAU DARI PUSTAKA ONLINE',
  'screen.release': 'LEPAS UNTUK MUAT',
  'screen.mobileLibrary': 'JALANKAN DARI PUSTAKA',
  'screen.mobileTap': 'KETUK LAYAR: BUKA PUSTAKA',
  'screen.waitingHost': 'MENUNGGU HOST',
  'screen.paused': 'DIJEDA',
  'screen.resumeOnPanel': 'TEKAN LANJUTKAN DI PANEL',
  'screen.resumeInPanel': 'LANJUTKAN DI PANEL KANAN',
  'screen.waitHostResume': 'MENUNGGU HOST LANJUT',

  /* 机身面板那排钮 */
  'panel.resume': 'Lanjutkan',
  'panel.pause': 'Jeda',
  'panel.save': 'Simpan',
  'panel.load': 'Muat',
  'panel.reset': 'Reset',
  'panel.eject': 'Keluarkan',
  'volume.down': 'Kecilkan volume satu tingkat',
  'volume.up': 'Besarkan volume satu tingkat',
  'volume.set': 'Atur volume ke tingkat {level} dari {max}',

  /* 存档：电池存档，一款一份，所以文案里不提「状态 / 份数」 */
  'saves.title': 'Muat simpanan',
  'saves.load': 'Muat',
  'saves.close': 'Tutup',
  'saves.groupLocal': 'Perangkat ini',
  'saves.groupCloud': 'Cloud (akun)',
  'saves.deleteCloud': 'Hapus simpanan cloud ini',
  'saves.delete': 'Hapus',
  'saves.loginHint': 'Masuk untuk menyimpan di cloud dan melanjutkan di perangkat lain.',
  'saves.login': 'Masuk',
  'saves.loading': 'Memuat…',
  'saves.downloading': 'Mengunduh simpanan cloud…',
  'saves.restoring': 'Memulihkan game…',
  'saves.empty': 'Belum ada simpanan',

  'library.removeLabel': 'Hapus {name}',

  /* 键位说明弹窗：走系统字体，内容由 playerLegend() 现算 */
  'legend.moves': 'gerak',
  'legend.open': 'Kontrol',
  'legend.title': 'Kontrol',
  'legend.close': 'Tutup',
  /* 载入失败时唯一的提示通道（格式 / BIOS / 手柄） */
  'legend.needZip':
    'Format  FBNeo hanya membaca .zip — sepertinya ini {ext}. Bungkus ulang, atau pakai versi .zip',
  'play.needZip':
    'Format  ROM ini berupa arsip {ext} yang tidak bisa dibuka — coba .zip atau ROM tanpa kompresi',
  'legend.needDisc':
    'Format  Image disk biasanya terdiri dari beberapa file (.cue + .bin). Situs ini hanya menerima satu file — pakai versi .pbp, .iso, atau .chd',
  'play.needDisc':
    'Format  Ini image disk multi-file (.cue + .bin). Di sini hanya bisa satu file — coba versi .pbp, .iso, atau .chd',
  'legend.needBios':
    'BIOS  Sepertinya ini game Neo Geo (KOF, Metal Slug…). Perlu neogeo.zip — seret file itu ke halaman dan akan terpasang. Game CPS1 / CPS2 tidak memerlukannya.',
  'legend.gamepad':
    'Gamepad  Colok saja langsung jalan — di kedua sisi saat kamu berada di ruang.',

  /*
   * 联机面板。`netplay.codePlaceholder` 保持 ASCII：输入框走 font-pixel。
   */
  'netplay.title': 'Main Jaringan',
  'netplay.open': 'Main lewat jaringan',
  'netplay.close': 'Tutup',
  'netplay.create': 'Buat ruang',
  'netplay.or': 'atau',
  'netplay.join': 'Gabung',
  'netplay.codePlaceholder': 'KODE',
  'netplay.hint':
    'Kedua sisi hanya perlu menjangkau relay publik — LAN yang sama paling lancar. Sebutkan kode 4 karakter ke pemain lain. Host yang menjalankan emulator dan mengirim gambar; tamu tidak perlu ROM.',
  'netplay.roomCode': 'Kode ruang',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Internet publik',
  'netplay.wanDev': 'Main jaringan lewat internet publik masih dalam pengembangan.',
  /* 出画档位：三个按钮要并排塞下，标签保持一两个词 */
  'netplay.quality': 'Kualitas gambar',
  'netplay.qualitySmooth': 'Halus',
  'netplay.qualityBalanced': 'Seimbang',
  'netplay.qualitySharp': 'Tajam',
  'netplay.qualityHint':
    'Host menjalankan emulator sekaligus streaming di satu mesin. Kalau tidak sanggup, seluruh game jadi melambat (slow motion). Turunkan satu tingkat bila itu terjadi — ini hanya berlaku di sisi host.',
  'netplay.copy': 'Salin',
  'netplay.copied': 'Tersalin',
  /* 「分享」复制的是带房间码的整条链接，和上面那条只复制码的分工不同 */
  'netplay.share': 'Bagikan',
  'netplay.shareCopied': 'Tautan tersalin',
  /* 打开分享链接先确认，不直接进房间 */
  'netplay.inviteTitle': 'Undangan ruang',
  'netplay.inviteBody': 'Gabung ke ruang {code}?',
  'netplay.inviteJoin': 'Gabung',
  'netplay.inviteCancel': 'Batal',
  'netplay.connected': 'Terhubung',
  'netplay.waiting': 'Menunggu pemain lain',
  /* 加入者侧的「还没连上」——和上面那句是两码事 */
  'netplay.joining': 'Bergabung ke ruang…',
  'netplay.waitingGame': 'Terhubung — menunggu host memuat kartrid',
  'netplay.hostPlaying': 'Host sedang bermain',
  'netplay.paused': 'Dijeda',
  /* 刚连上那枚几秒后自己消失的提示：房主等的是对方进来，加入者等的是连上房主 */
  'netplay.toastHost': 'Terhubung · pemain lain sudah masuk · kamu pemain 1',
  'netplay.toastGuest': 'Terhubung ke host · kamu pemain 2',
  'netplay.toastHostLeft': 'Host keluar — ruang ditutup',
  'netplay.toastGuestLeft': 'Pemain 2 keluar dari ruang',
  /* 这两句刻意不列键位：键位只由实时值生成，指到「Kontrol」去看 */
  'netplay.youAreHost':
    'Kamu pemain 1. Muat kartrid dan gambarnya otomatis dikirim ke tamu. Kamu bermain dengan set tombolmu sendiri — lihat Kontrol untuk pemetaan saat ini.',
  'netplay.youAreGuest':
    'Kamu pemain 2. Tidak perlu kartrid — host mengirim gambar, dan input-mu dikirim ke host. Main dengan set tombolmu sendiri (grup Pemain 1) atau gamepad — lihat Kontrol.',
  'netplay.leave': 'Keluar dari ruang',
  'netplay.closeRoom': 'Tutup ruang',
  'netplay.badCode': 'Kodenya sepertinya tidak benar — harusnya 4 karakter.',
  'netplay.errInsecure':
    'Main jaringan butuh HTTPS atau localhost. Halaman ini memakai http biasa, jadi browser tidak menyediakan API kripto yang dibutuhkan.',
  'netplay.errNoDirect':
    'Kedua sisi berhasil menjangkau relay, tetapi koneksi langsung tidak bisa dibuka — biasanya karena NAT atau firewall. LAN yang sama paling sering berhasil.',
  'netplay.errPassword': 'Kode ruang tidak cocok.',
  'netplay.errHandshake': 'Handshake kehabisan waktu — mungkin pemain lain sudah keluar.',
  'netplay.errHostLeft': 'Host keluar dari ruang — ruang sudah ditutup.',
  'netplay.errNoRoom':
    'Tidak ada jawaban dari host. Kode ruang mungkin salah, atau host belum membuka ruang.',
  'netplay.errRoomFull': 'Ruang sudah penuh — game ini hanya untuk satu lawan satu.',
  'netplay.errUnknown':
    'Tidak bisa terhubung ke pemain lain. Alasan tepatnya ada di konsol browser.',

  /* `/play` —— 文案刻意短 */
  'seo.play.title': 'Ruang Main — Muat Game dan Main Online',
  'seo.play.description':
    'Satu layar untuk memulai game: main sendiri, atau buka ruang 1v1 dan bagikan kodenya. Judul NES, SNES / SFC, Game Boy, GBA, Mega Drive, dan arcade.',
  'play.modeSolo': 'Sendiri',
  'play.start': 'Mulai',
  'play.confirmStart': 'Konfirmasi dan mulai',
  'play.confirm': 'Konfirmasi',
  'play.qualityIntro': 'Pilih kualitas gambar untuk main online sesuai koneksimu.',
  'play.qualityHint.smooth': '30 fps · Lebih hemat bandwidth, cocok untuk koneksi lambat.',
  'play.qualityHint.balanced': 'Hingga 720p / 60 fps · Seimbang antara ketajaman dan kelancaran.',
  'play.qualityHint.sharp':
    'Hingga 60 fps · Mengutamakan detail resolusi asli; butuh koneksi cepat. Frame rate bisa turun di jaringan lambat.',
  'play.qualityConfirmHint':
    'Konfirmasi untuk terhubung ke ruang. Host memuat game, tamu menerima gambar dari host.',
  'play.connecting': 'Menghubungkan…',
  'play.confirmJoin': 'Konfirmasi dan gabung',
  'play.cancel': 'Batal',
  'play.screenSize': 'Ukuran layar',
  'play.controlsTitle': 'Kontrol game',
  'play.netplayKeysHint': 'Saat main online, tiap pemain memakai tombol Pemain 1 miliknya sendiri.',
  'play.cancelled': 'Pemuatan dibatalkan.',
  'play.retry': 'Muat lagi',
  'play.retryJoin': 'Coba gabung lagi',
  'play.saved': 'Game tersimpan.',
  'play.localSaving': 'Menyimpan…',
  'play.uploading': 'Mengunggah…',
  'play.cloudFailed': 'Sinkronisasi cloud gagal.',
  /* 401 专用：本机那份是好的，登录之后云同步就正常 */
  'play.saveNoLogin': 'Masuk untuk sinkron',
  /* 超过云端上限，压根没发出去（本机那份是好的） */
  'play.tooLarge': 'Simpanan terlalu besar',
  'play.theme': 'Tema',
  'play.saveFailed': 'Game tidak bisa disimpan. Coba lagi.',
  'play.loadFailed': 'Simpanan tidak bisa dimuat. Coba lagi.',
  'play.leftRoom': 'Kamu keluar dari ruang.',
  'play.latency': 'Latensi',
  'play.measuringLatency': 'Mengukur…',
  'play.downloading': 'Mengunduh ROM…',
  'play.booting': 'Menjalankan core…',
  'play.loadFail': 'Kartrid ini gagal dimuat.',
  'play.romIncomplete': 'File ROM tidak lengkap — muat ulang.',
  'play.notFound': 'Game itu tidak ditemukan.',
  'play.fullscreen': 'Layar penuh',
  'play.volume': 'Volume',
  /* 操作表底部那颗钮：只写「编辑」，编辑什么靠 tooltip（keybind.open）说 */
  'play.edit': 'Ubah',
  /* 右栏收起 / 展开那颗钮：**短** —— 收起后只有 40px 宽、竖排 */
  'play.hideSidebar': 'Sembunyikan panel',
  'play.showSidebar': 'Tampilkan panel',
  'play.hint': 'Esc keluar dari layar penuh. Tidak ada pintasan lain di sini.',
  'play.leaveTitle': 'Game sedang berjalan',
  'play.leaveBody': 'Kembali akan mengakhiri sesi ini — progres tidak disimpan otomatis.',
  'play.leaveStay': 'Lanjut main',
  'play.leaveGo': 'Keluar',
  'gamesPage.playOnline': 'Main online',

  /*
   * 自定义按键面板。钮名默认走街机叫法（A B C X Y Z），是手柄丝印、不进文案表；
   * 只有「开始 / 投币」是词。tooltip（`keybind.open`）和面板标题（`keybind.title`）
   * **故意不同名**：按钮是入口，标题说的是里面干的活。
   */
  'keybind.title': 'Pemetaan tombol',
  'keybind.open': 'Pengaturan tombol',
  'keybind.close': 'Tutup',
  'keybind.p1': 'Pemain 1',
  'keybind.p2': 'Pemain 2',
  /* 联机时唯一的标签：按「归属」命名，不按号位（加入者在游戏里是 2P） */
  'keybind.mine': 'Tombolmu',
  'keybind.pressKey': 'TEKAN…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Kembalikan bawaan',
  'keybind.reload': 'Muat ulang kartrid',
  'keybind.reloading': 'Memuat ulang…',
  'keybind.unsupported': 'Tombol itu tidak bisa dipakai — coba tombol lain.',
  'keybind.conflictSame': '{pressed} sudah dipetakan ke tombol {button} — coba tombol lain.',
  'keybind.conflictOther':
    '{pressed} sudah dipetakan ke tombol {button} pada pemain {player} — coba tombol lain.',
  'keybind.hint':
    'Peta keyboard dibaca sekali saat kartrid dimuat — muat ulang kartrid agar perubahan berlaku. Dua pemain tidak bisa memakai tombol yang sama.',
  /* 单人机（NDS）那一档：就是上面去掉「两位玩家不能共用同一个键」那半句 */
  'keybind.soloHint':
    'Peta keyboard dibaca sekali saat kartrid dimuat — muat ulang kartrid agar perubahan berlaku.',
  'keybind.hostHint':
    'Kamu host: Pemain 1 adalah tombolmu sendiri, Pemain 2 adalah tujuan injeksi input tamu. Keduanya tidak boleh memakai tombol yang sama, kalau tidak input tamu juga menggerakkan Pemain 1-mu. Muat ulang kartrid setelah mengubah.',
  'keybind.guestHint':
    'Kamu tamu dan bermain dengan set tombolmu sendiri (grup Pemain 1) — masing-masing di keyboard sendiri, jadi tidak akan bentrok. Perubahan langsung berlaku, tidak perlu muat ulang kartrid.',
  'keybind.guestLocalHint':
    'Kamu tamu, dan di perangkat ini kartridmu sendiri juga berjalan. Tombolmu adalah grup Pemain 1: itulah yang dibaca kartrid lokal, jadi muat ulang setelah mengubah — dan set yang sama juga dikirim ke host, yang langsung berlaku di sana.',

  /* 在线游戏库（服务端上传的那批游戏） */
  'games.open': 'Pustaka game',
  'games.title': 'Pustaka game',
  'games.close': 'Tutup',
  'games.empty': 'Pustaka kosong — belum ada yang diunggah',
  'games.loading': 'Memuat…',
  'games.loadingRom': 'Memuat {name}…',
  'games.cancel': 'Batal',
  'games.failed': 'Pustaka game tidak bisa dimuat',
  /* 弹窗里的两个 tab：在线库 / 从库里点开过的那批（上限 10 盘） */
  'games.tabLibrary': 'Pustaka game',
  'games.tabHistory': 'Riwayat',
  'games.historyEmpty': 'Belum ada yang dibuka dari pustaka',
  'games.historyLoad': '{name}\nKlik untuk muat lagi',
  /* 收藏：星标按钮只有图标，这两条是 aria-label，所以要带游戏名 */
  'games.tabFavorites': 'Favorit',
  'games.favorite': 'Tambahkan {name} ke favorit',
  'games.unfavorite': 'Hapus {name} dari favorit',
  'games.favoritesEmpty': 'Belum ada favorit — ketuk bintang di sampul mana pun.',
  /* 未登录那句拆成三截，中间是可点的「Masuk」；首尾空格有意义，别 trim */
  'games.favoritesSignInBefore': 'Masuk untuk menyimpan favorit — ',
  'games.favoritesSignInLink': 'Masuk',
  'games.favoritesSignInAfter': ' di sini, atau pakai tombol akun di kanan atas.',

  /* 用户面板：注册 / 登录 / 退出 + 云端三件套的说明 */
  'user.title': 'Akun',
  'user.close': 'Tutup',
  /* 账号钮的 title / aria-label：登录后把用户名带进去，悬停就能确认登的是哪个号 */
  'user.open': 'Akun — masuk atau daftar',
  'user.openSignedIn': 'Akun: {name}',
  'user.tabLogin': 'Masuk',
  'user.tabRegister': 'Buat akun',
  'user.username': 'Nama pengguna',
  'user.password': 'Kata sandi',
  /* 规则提示现在当 placeholder 用，越短越好（太长会被输入框截断） */
  'user.usernameHint': '3–20 karakter: huruf, angka, _ - .',
  /* 注册账号 = 邮箱；登录模式仍是 `user.username`（老账号可能是普通用户名） */
  'user.emailLabel': 'Email',
  'user.emailHint': 'Email kamu. Tanpa alias +, tanpa email sementara.',
  'user.passwordHint': 'Minimal 6 karakter, tanpa spasi.',
  'user.signIn': 'Masuk',
  'user.signUp': 'Buat akun',
  'user.signingIn': 'Sedang masuk…',
  'user.signingUp': 'Membuat…',
  'user.signOut': 'Keluar',
  'user.signedInAs': 'Masuk sebagai {name}.',
  'user.cloudHint':
    'Riwayat game, simpanan, dan favorit tersimpan di akunmu — buka game apa pun dari pustaka online dan semuanya tersinkron otomatis.',
  'user.formLead':
    'Masuk dan simpanan, riwayat game, serta favoritmu tersimpan di cloud — main kapan saja, di mana saja!',
  /* 表单下面那句法律声明：拆成四段，中间夹两个真链接；首尾空格有意义 */
  'user.consentLogin': 'Dengan masuk, kamu menyetujui ',
  'user.consentRegister': 'Dengan membuat akun, kamu menyetujui ',
  'user.consentMiddle': ' dan ',
  'user.consentAfter': '.',

  'user.error.failed': 'Ada yang salah — coba lagi.',
  'user.error.missingCredentials': 'Isi nama pengguna dan kata sandi.',
  'user.error.usernameInvalid': 'Nama pengguna hanya boleh berisi huruf, angka, _ - dan .',
  'user.error.usernameTooShort': 'Nama pengguna terlalu pendek (minimal 3 karakter).',
  'user.error.usernameTooLong': 'Nama pengguna terlalu panjang (maksimal 20 karakter).',
  'user.error.usernameTaken': 'Nama pengguna itu sudah dipakai — pilih yang lain.',
  /* 注册邮箱校验（登录不校验邮箱，老账号的用户名可能根本不是邮箱） */
  'user.error.emailInvalid': 'Masukkan alamat email yang valid.',
  'user.error.emailAlias':
    'Email alias (seperti name+tag@… atau Gmail dengan titik) tidak diizinkan.',
  'user.error.emailTemp': 'Email sekali pakai tidak diizinkan — pakai kotak masuk biasa.',
  'user.error.passwordInvalid': 'Masukkan kata sandi.',
  'user.error.passwordTooShort': 'Kata sandi terlalu pendek (minimal 6 karakter).',
  'user.error.passwordTooLong': 'Kata sandi terlalu panjang (maksimal 72 karakter).',
  'user.error.passwordHasSpace': 'Kata sandi tidak boleh mengandung spasi.',
  'user.error.invalidCredentials': 'Nama pengguna atau kata sandi salah.',
  'user.error.banned': 'Akun ini telah ditangguhkan.',
  /* 人机验证（Turnstile）：两句都只说「怎么办」，不解释 token 是什么 */
  'user.error.captchaRequired': 'Selesaikan verifikasi manusia dulu.',
  'user.error.captchaFailed': 'Verifikasi manusia gagal — coba lagi.',

  /* 独立登录页（`/login`）标题下面那句说明：说清好处，也点名「还能注册」 */
  'login.lead':
    'Masuk dan simpanan, riwayat game, serta favoritmu tersimpan di cloud — main kapan saja, di mana saja. Belum punya akun? Daftar.',

  /*
   * 个人中心（`/account`）。`account.error.*` 和 `user.error.*` **刻意分开**：
   * 前者是登录之后改自己资料那套（旧口令不对、头像太大…），后者是注册 / 登录那套。
   */
  'account.title': 'Akunmu',
  'account.loading': 'Memuat…',
  'account.failed': 'Ada yang salah — coba lagi.',
  'account.since': 'Anggota sejak {time}',
  /* VIP 标识：两种徽章都要有，非 VIP 那颗是灰的 */
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Standar',
  'account.vipUntil': 'VIP hingga {time}',
  'account.vipExpired': 'VIP berakhir {time}',
  'account.tabFavorites': 'Favorit',
  'account.tabHistory': 'Riwayat',
  'account.tabSaves': 'Simpanan',
  'account.tabProfile': 'Profil',
  'account.tabPassword': 'Kata sandi',
  /* 列表骨架屏文案，和页头那行 `account.loading` 分开 */
  'account.favoritesLoading': 'Memuat favorit…',
  'account.historyLoading': 'Memuat riwayat…',
  'account.savesLoading': 'Memuat simpanan…',

  'account.favoritesEmpty':
    'Belum ada favorit — buka pustaka game di ruang dan ketuk bintang pada sampul.',
  'account.unfavorite': 'Hapus {name} dari favorit',

  /* ---- 历史 ---- */
  'account.historyEmpty':
    'Belum ada riwayat main — game yang kamu buka dari pustaka online muncul di sini.',
  'account.historyCount': '{count} game terakhir dimainkan',
  'account.historyDeleted': 'Dihapus dari riwayat.',
  'account.clearHistory': 'Hapus semua',
  'account.confirmClearHistory': 'Yakin hapus semua?',
  'account.historyCleared': 'Riwayat dihapus.',
  /* 上限说明：和 lib/library.ts 的 MAX_CARTRIDGES 同口径，不写死数字 */
  'account.historyHint':
    'Riwayat menyimpan {max} game terakhir yang kamu mainkan — memainkan yang lama lagi akan memindahkannya ke atas.',

  'account.savesEmpty': 'Belum ada simpanan cloud.',
  'account.savesCount': 'Total {count} simpanan',
  'account.savesGroupCount': '{count} simpanan',
  'account.viewGame': 'Lihat {name}',
  /* 存档制式说明：一款一份，再存就是覆盖 —— 不写死数字，规则会变 */
  'account.savesHint':
    'Satu simpanan per game — menyimpan lagi akan menimpanya. Aturannya sama di perangkat ini dan di cloud.',
  'account.saveDeleted': 'Simpanan dihapus.',
  'account.clearSaves': 'Hapus semua',
  'account.confirmClearSaves': 'Yakin hapus semua?',
  'account.savesCleared': '{count} simpanan dihapus.',
  'account.delete': 'Hapus',
  'account.confirmDelete': 'Yakin hapus?',

  /* ---- 资料 ---- */
  'account.avatar': 'Avatar',
  'account.chooseImage': 'Pilih gambar',
  'account.clearAvatar': 'Hapus avatar',
  'account.uploading': 'Mengunggah…',
  'account.avatarSaved': 'Avatar diperbarui.',
  'account.avatarCleared': 'Avatar dihapus.',
  'account.avatarHint': 'PNG, JPEG, WebP, atau GIF, maksimal 2 MB.',
  'account.gender': 'Jenis kelamin',
  /* 三档：未设置 / 男 / 女（默认态是 NULL，没有「其他」那一档） */
  'account.genderNone': 'Belum diisi',
  'account.genderMale': 'Pria',
  'account.genderFemale': 'Wanita',
  'account.genderSaved': 'Tersimpan.',
  'account.genderHint': 'Opsional — hanya kamu yang bisa melihatnya.',
  'account.passwordTabHint': 'Kamu tetap masuk di perangkat ini setelahnya — tidak perlu login ulang.',
  'account.password': 'Kata sandi',
  'account.oldPassword': 'Kata sandi saat ini',
  'account.newPassword': 'Kata sandi baru',
  'account.confirmPassword': 'Ulangi kata sandi baru',
  'account.savePassword': 'Ganti kata sandi',
  'account.saving': 'Menyimpan…',
  'account.passwordSaved': 'Kata sandi diubah.',
  'account.passwordHint':
    'Kamu tetap masuk di perangkat ini setelah mengubahnya. Perangkat lain tetap aktif sampai sesinya berakhir.',

  'account.error.missingOld': 'Masukkan kata sandi saat ini.',
  'account.error.wrongPassword': 'Kata sandi saat ini salah.',
  'account.error.passwordTooShort': 'Kata sandi baru terlalu pendek (minimal 6 karakter).',
  'account.error.passwordTooLong': 'Kata sandi baru terlalu panjang (maksimal 72 karakter).',
  'account.error.passwordHasSpace': 'Kata sandi baru tidak boleh mengandung spasi.',
  'account.error.mismatch': 'Kedua kata sandi baru tidak cocok.',
  'account.error.avatarMissing': 'Pilih gambar dulu.',
  'account.error.avatarTooLarge': 'Gambar itu terlalu besar (maksimal 2 MB).',
  'account.error.avatarType': 'Format tidak didukung — pakai PNG, JPEG, WebP, atau GIF.',

  /* 在线库列表上那排筛选：机种 + 搜索（客户端过滤已拉回来的列表） */
  'games.filterAll': 'Semua',
  'games.searchPlaceholder': 'Cari judul / pengembang / seri',
  'games.search': 'Cari',
  'games.noMatch': 'Tidak ada game yang cocok.',
  'games.prev': 'Sebelumnya',
  'games.next': 'Berikutnya',
  /*
   * 在线库的加载速度提示。**印尼语同样是空串** —— 那句话是说给「文件在境外」的读者听的，
   * 印尼读者本来就在境外，这条既没用又显得莫名其妙（理由与英日两份相同）。
   */
  'games.remoteSlow': '',

  /* 地板上那张纸片 */
  'note.text': 'Semoga kita semua menemukan lagi kegembiraan masa kecil..',
  'note.open': 'Baca catatan di lantai',
  'note.title': 'Sebuah catatan',
  'note.close': 'Tutup',
  'window.cycle': 'Ganti musim di luar jendela',
  /*
   * 墙上那幅挂画：画名和作者只有这一个出处，点开之后那张说明牌才摆出来。
   * 第七幅是用户自家照片，指定说法就是「不知从哪来的不知名画作」，别改成正经画名。
   */
  'painting.open': 'Lihat lukisan lebih dekat',
  'painting.close': 'Tutup',
  'painting.title.sunflowers': 'Bunga Matahari',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'Mona Lisa',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'Malam Berbintang',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'Jeritan',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'Gadis dengan Anting Mutiara',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'Gelombang Besar di Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Lukisan Tanpa Nama Entah dari Mana',
  'painting.artist.unknown': 'Anonim',
  /* 地板上那台 MP4：整台机器就是一个按钮，这两条是它的无障碍名字 */
  'mp4.play': 'Putar lagu di pemutar MP4',
  'mp4.pause': 'Jeda pemutar MP4',

  /*
   * 逗猫棒是彩蛋的开关，所以写的是「叫人做什么动作」。
   * 下面七条是猫的品种名，只当无障碍名字用，画面上不写名字。
   */
  'cat.wand': 'Goyangkan tongkat kucing di lantai',
  'cat.ragdoll': 'Seekor ragdoll mengintip dari balik buku',
  'cat.siamese': 'Seekor siamese mengintip dari balik buku',
  'cat.tabby': 'Seekor tabby mengintip dari balik buku',
  'cat.orange': 'Seekor tabby oranye mengintip dari balik buku',
  'cat.american': 'Seekor american shorthair mengintip dari balik buku',
  'cat.tuxedo': 'Seekor kucing tuxedo mengintip dari balik buku',
  'cat.calico': 'Seekor calico mengintip dari balik buku',

  /* 地上那本留言本（留言列表 + 提交框） */
  'feedback.open': 'Baca buku tamu di lantai',
  'feedback.title': 'Buku tamu',
  'feedback.close': 'Tutup',
  'feedback.placeholder': 'Tulis sesuatu — saran, atau game yang ingin kamu lihat di sini…',
  'feedback.submit': 'Kirim',
  'feedback.submitting': 'Mengirim…',
  'feedback.ok': 'Terkirim — terima kasih!',
  'feedback.required': 'Tulis sesuatu dulu.',
  'feedback.failed': 'Gagal mengirim — coba lagi.',
  'feedback.loading': 'Memuat…',
  'feedback.empty': 'Belum ada pesan — jadilah yang pertama menulis.',
  'feedback.retry': 'Coba lagi',
  /* 翻页条：没有总页数（游标分页拿不到总数），所以只有「第几页」 */
  'feedback.prev': 'Sebelumnya',
  'feedback.next': 'Berikutnya',
  'feedback.page': 'Halaman {n}',
  'feedback.resolved': 'Selesai',
  'feedback.unresolved': 'Belum ditangani',

  /* 隐私政策 / 服务条款：正文在 lib/legal.ts，这里只有房间界面要用的几个词 */
  'legal.privacy': 'Kebijakan Privasi',
  'legal.terms': 'Ketentuan Layanan',
  'legal.updated': 'Terakhir diperbarui {date}',
  'legal.contact': 'Hubungi kami:',

  /* 初次打开的操作指引：只说怎么把游戏弄进去 + 右边那列按钮是干嘛的，不剧透彩蛋 */
  'tour.title': 'Panduan singkat',
  'tour.skip': 'Lewati',
  'tour.back': 'Kembali',
  'tour.next': 'Lanjut',
  'tour.done': 'Mulai main',
  'tour.replay': 'Tampilkan panduan lagi',
  'tour.screen.title': 'Mulai dengan satu game',
  'tour.screen.body':
    'Seret file ROM (.nes, .sfc, .gba, .md, .gb …) atau .zip arcade ke televisi, atau klik layar untuk memilih file. Repo ini tidak menyertakan ROM — bawa milikmu sendiri.',
  'tour.rail.title': 'Deretan sakelar di kanan',
  /* 逐项念那一列开关；语言那一项括号里写全名（和主题、电视大小那两处同一写法） */
  'tour.rail.body':
    'Tiga kelompok, dari atas ke bawah. Tampilan: tema (malam / siang), bahasa (18 bahasa), Layar penuh (yang penuh adalah layar gamenya), Mode sederhana (sisakan hanya dinding, TV, meja, dan lantai), Ukuran TV (membuka pilihan besar / sedang / kecil — mejanya ikut melebar). Game: Main Jaringan, Pemetaan tombol. Bantuan: Panduan kontrol, dan Buku tamu.',

  'topLinks.label': 'Halaman situs',
  'topLinks.games': 'Daftar game',
  /* 小屏右上角那颗菜单钮：名字要说清点开会看到什么 */
  'menu.open': 'Buka menu',
  'menu.close': 'Tutup menu',
  /* 抽屉里的目录项：说明「这一行管什么」，不用 theme.toDark / simple.enter 那两条 */
  'menu.theme': 'Tema',
  'menu.simple': 'Mode sederhana',

  /* 「离开房间」确认 */
  'leave.title': 'Tinggalkan halaman ini?',
  'leave.bodyGame': 'Game yang berjalan akan terhenti — progres tidak disimpan.',
  'leave.bodyNetplay': 'Kamu akan keluar dari ruang jaringan, dan lawanmu akan terputus.',
  'leave.stay': 'Tetap di sini',
  'leave.confirm': 'Tinggalkan',

  'gamesPage.heading': 'Semua game',
  'gamesPage.intro':
    '{count} game di pustaka online — NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade, dan lainnya. Klik sampul untuk detail, atau langsung mulai main.',
  'gamesPage.empty': 'Pustaka sedang kosong.',
  /* 机种筛选：筛了之后「共 N 款」说的是这一档，不再念那一长串机种 */
  'gamesPage.introConsole':
    '{count} game {console} di pustaka. Klik sampul untuk detail, atau langsung mulai main.',
  'gamesPage.filterLabel': 'Saring per konsol',
  'gamesPage.filterAll': 'Semua',
  /* 筛了机种、而这一档一款都没有时的空态 */
  'gamesPage.consoleEmpty': 'Belum ada game {console} di pustaka.',
  /* 列表页的搜索是服务端搜索，和弹窗那组 `games.search*` 刻意各写一份 */
  'gamesPage.searchLabel': 'Cari di pustaka game',
  'gamesPage.searchPlaceholder': 'Cari judul / pengembang / seri',
  'gamesPage.searchSubmit': 'Cari',
  'gamesPage.searchLoading': 'Mencari…',
  'gamesPage.searchClear': 'Hapus pencarian',
  'gamesPage.searchResults': '“{keyword}” — {count} game cocok.',
  'gamesPage.searchEmpty':
    'Tidak ada game yang cocok dengan “{keyword}”. Coba kata yang lebih pendek, atau judul gamenya.',
  'gamesPage.prev': 'Sebelumnya',
  'gamesPage.next': 'Berikutnya',
  /* 现在只剩 404 页那两颗在用它（那页刻意不挂顶栏） */
  'gamesPage.backHome': 'Kembali ke halaman utama',
  'gamesPage.backToGames': 'Semua game',
  /* 内容页左上角那条返回链接的通用文案：行为是浏览器回退，所以只说「返回」 */
  'common.back': 'Kembali',
  /* 页脚那颗「首页」回的是落地页，和 backHome（回房间）是两件事 */
  'common.home': 'Beranda',
  'gamesPage.play': 'Main sekarang',
  'gamesPage.download': 'Unduh ROM',
  'gamesPage.share': 'Bagikan game ini',
  'gamesPage.shareCopied': 'Tautan tersalin',
  'gamesPage.shareFailed': 'Gagal menyalin',
  'gamesPage.shareCopy': 'Salin tautan',
  'gamesPage.shareText': '{name} — mainkan di browser di {site}',
  'gamesPage.shareEmail': 'Email',
  'gamesPage.shareClose': 'Tutup',
  /* 详情页那颗收藏钮有文字位，所以说清「点了会发生什么」 */
  'gamesPage.favorite': 'Tambah ke favorit',
  'gamesPage.unfavorite': 'Hapus dari favorit',
  'gamesPage.favoriteSignIn': 'Masuk untuk menyimpan favorit — gunakan tombol masuk di bilah atas.',
  'gamesPage.favoriteFailed': 'Favorit tidak bisa diperbarui — coba lagi.',
  /* 收藏钮上那个数字：只当 title / 悬停说明用 */
  'gamesPage.favoriteCount': '{n} orang memfavoritkan',
  /* 「反馈问题」+ 它弹出的窗：提交**不需要登录**，文案里不要出现「登录」 */
  'gamesPage.report': 'Laporkan masalah',
  'gamesPage.reportTitle': 'Laporkan masalah',
  'gamesPage.reportSubject': 'Tentang: {name}',
  'gamesPage.reportPlaceholder':
    'Apa yang bermasalah? Misalnya: tidak mau jalan, gambar rusak, suara tidak ada…',
  'gamesPage.reportSubmit': 'Kirim laporan',
  'gamesPage.reportSubmitting': 'Mengirim…',
  'gamesPage.reportOk': 'Terima kasih — akan kami periksa.',
  'gamesPage.reportRequired': 'Jelaskan masalahnya dulu.',
  'gamesPage.reportFailed': 'Gagal mengirim — coba lagi.',
  'gamesPage.reportClose': 'Batal',

  /* 详情页的评论模块：发评论必须先登录，列表本身公开 */
  'comments.heading': 'Komentar',
  'comments.count': '{n} komentar',
  'comments.empty': 'Belum ada komentar — jadilah yang pertama.',
  'comments.placeholder': 'Bagaimana pendapatmu tentang game ini?',
  'comments.ratingLabel': 'Penilaianmu',
  'comments.ratingStar': 'Beri {n} dari 5',
  'comments.ratingValue': '{n} dari 5 bintang',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Pilih jumlah bintang dulu.',
  'comments.submit': 'Kirim komentar',
  'comments.submitting': 'Mengirim…',
  'comments.ok': 'Terkirim — komentarmu ada di paling atas.',
  'comments.required': 'Tulis sesuatu dulu.',
  'comments.failed': 'Gagal mengirim — coba lagi.',
  'comments.signInLead': 'Masuk untuk mengirim komentar.',
  'comments.signIn': 'Masuk',
  'comments.signInRequired': 'Silakan masuk lagi untuk mengirim.',
  'comments.loading': 'Memuat komentar…',
  'comments.retry': 'Coba lagi',
  'comments.loadFailed': 'Komentar tidak bisa dimuat.',
  'comments.loadMore': 'Muat lebih banyak',
  /* 自己的那条上的删除（两步：先删除，再确认） */
  'comments.delete': 'Hapus',
  'comments.deleteConfirm': 'Konfirmasi',
  'comments.cancel': 'Batal',
  'comments.deleted': 'Komentar dihapus.',
  'comments.deleteFailed': 'Gagal menghapus — coba lagi.',
  'gamesPage.field.console': 'Konsol',
  'gamesPage.field.year': 'Tahun',
  'gamesPage.field.developer': 'Pengembang',
  'gamesPage.field.series': 'Seri',
  'gamesPage.field.language': 'Bahasa',
  /* 详情页「操作说明」那块：只有源站模式的数据带这一段 */
  'gamesPage.controls': 'Kontrol',
  /* 点「开始游戏 / 联机游戏」时那个选语言版本的弹框标题 */
  'gamesPage.selectLanguage': 'Pilih bahasa',
  /* 全站 404：和 `gamesPage.notFoundTitle`（游戏没了）是两件事 */
  'notFound.title': 'Halaman tidak ditemukan',
  'notFound.description':
    'Alamat itu tidak ada di {site}. Periksa tautannya, atau kembali ke halaman utama.',
  'gamesPage.notFoundTitle': 'Game tidak ditemukan',
  'gamesPage.notFound': 'Game ini tidak ada lagi di pustaka.',
  'gamesPage.fallbackDescription': '{title} adalah game {console}.',

  /* 开发商两页：列表页 + 详情页共用一个 heading */
  'developersPage.heading': 'Pengembang',
  'developersPage.intro':
    '{count} pengembang di balik game di pustaka. Buka salah satu untuk melihat semua yang kami punya dari studio itu.',
  'developersPage.empty': 'Belum ada pengembang terdaftar.',
  'developersPage.gameCount': '{count} game',
  'developersPage.gamesHeading': 'Game dari {name}',
  'developersPage.gamesEmpty': 'Belum ada game dari pengembang ini di pustaka.',
  'developersPage.field.founded': 'Berdiri',
  /* 页脚与面包屑里那条「全部开发商」是真链接，留着（左上那颗已统一到 common.back） */
  'developersPage.backToDevelopers': 'Semua pengembang',
  'developersPage.notFoundTitle': 'Pengembang tidak ditemukan',
  'developersPage.notFound': 'Pengembang ini tidak ada lagi di pustaka.',

  /* 机种两页，结构照抄 developersPage；机种清单固定，不存在空列表 */
  'consolesPage.heading': 'Konsol',
  'consolesPage.intro':
    'Konsol di pustaka — total {count} game. Buka satu untuk melihat semua judulnya.',
  'consolesPage.gameCount': '{count} game',
  'consolesPage.gamesHeading': 'Game di {name}',
  'consolesPage.gamesEmpty': 'Belum ada game untuk konsol ini di pustaka.',
  /* 筛了语种却一款都没有（`{lang}` 来自 lib/rom-lang.ts 的语言全称） */
  'consolesPage.gamesEmptyLang': 'Belum ada game {lang} untuk konsol ini.',
  'consolesPage.filterLangLabel': 'Saring per bahasa',
  'consolesPage.field.released': 'Rilis',
  'consolesPage.backToConsoles': 'Semua konsol',
  'consolesPage.notFoundTitle': 'Konsol tidak ditemukan',
  'consolesPage.notFound': 'Konsol ini bukan bagian dari situs (lagi).',

  'download.heading': 'Unduh ROM',
  'download.hint': 'Klik tombol di bawah — unduhan mulai 6 detik kemudian.',
  'download.button': 'Mulai unduh',
  'download.waiting': 'Mulai dalam {seconds} detik…',
  'download.started': 'Unduhan dimulai — periksa unduhan di browser.',
  'download.rights': 'Unduh hanya file ROM yang memang berhak kamu gunakan.',
  /* 免责声明：和 download.rights 是两条，别合并 */
  'download.disclaimer':
    'Penafian: semua file ROM di halaman ini dikumpulkan dari pihak ketiga dan hanya untuk keperluan belajar serta pencadangan pribadi. Seluruh hak cipta milik pemegang haknya; jika ada konten yang melanggar hakmu, hubungi kami untuk menghapusnya.',

  /* 房间页那条 `?id=` 深链：从详情页过来，但库里已经没有这条了 */
  'deepLink.notFound': 'Game itu tidak ditemukan — mungkin sudah dihapus.',
  /* 深链载入中那颗独立弹窗；弹窗上的「取消」复用 games.cancel */
  'deepLink.title': 'Memuat game',
  'deepLink.loading': 'Mengunduh ROM…',
  'deepLink.hint': 'Mulai otomatis setelah unduhan selesai.',
};

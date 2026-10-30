/**
 * 马来语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表，再塞一张进来会更难翻；
 * 理由和 `lib/i18n.ja.ts` 当初分出去的一样 —— 加语言 = 加一个文件 + 在 `messages` 里挂上。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序也一致**，`zh` / `ja` / `ko` 同理。
 *    改文案时先改 `en`，再回来对齐另外几份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的马来语在数据库里
 *    （`game_texts` 的 `ms` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` /
 *    `{seconds}` / `{keyword}` / `{console}` / `{title}` / `{ext}` / `{n}` / `{max}` /
 *    `{avg}` / `{player}` / `{pressed}` / `{button}` / `{lang}` / `{code}` / `{date}` /
 *    `{time}`），它们由 `translate()` 在运行时替换；漏掉一个不会报错，
 *    只会在页面上少一段字。语序可以按马来语挪，但不能丢、不能改名。
 *
 * ⚠️ **站点名一律写 `Retro Games Box`**（品牌名不翻译）。表里的站名走 `{site}` 占位，
 *    取值来自 `lib/i18n.ts` 的 `SITE_NAME`（那份映射不在本文件里，改站名别改这里）。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → konsol；developer → pembangun；series → siri
 *   · cartridge → kartrij；room → bilik；host → hos；guest → tetamu
 *   · netplay → main rangkaian；save → simpanan；key bindings → pemetaan kekunci
 *   · game library → pustaka permainan；guestbook → buku tetamu
 *
 * ⚠️ 用**马来西亚口径的马来语**：tetapan / simpan / fail / muat turun / percuma，
 *    不用印尼语词（unduh / pengaturan / gratis）。
 *
 * ⚠️ 机种名用**马来西亚玩家的通行写法**：NES / SNES / Game Boy / GBC / GBA / NDS /
 *    Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade —— 不译成马来语词。标签位上取的是 `lib/consoles.ts` 的
 *    `consoleLabel(type, locale)`，和文案同源。
 */

import type { MessageKey } from './i18n';

export const ms: Record<MessageKey, string> = {
  /*
   * SEO 文案（<title> / description / og:* / JSON-LD）。不进界面，只给爬虫和社交卡片看，
   * 但同样跟着语言走。机种列举刻意只列代表机型 + "dan banyak lagi"，别补全。
   */
  'meta.title':
    '{site} — Main Permainan Retro dalam Pelayar: NES, SNES, GBA & Arcade',
  'meta.description':
    'Main permainan NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive dan arcade dalam pelayar. Pilih tajuk dari pustaka dalam talian, atau muatkan fail ROM anda sendiri.',
  'meta.keywords':
    'permainan retro, pustaka permainan retro dalam talian, emulator NES, emulator SNES, emulator SFC, emulator GBA, emulator Game Boy Advance, emulator Game Boy, emulator Game Boy Color, emulator NDS, emulator Nintendo DS, emulator Sega Mega Drive, emulator Sega Genesis, emulator Game Gear, emulator Master System, emulator Sega 32X, emulator WonderSwan, emulator Neo Geo Pocket, emulator PlayStation, emulator PS1, emulator PSX, emulator arcade, main NES dalam pelayar, emulator pelayar, RetroArch WASM, {site}',
  /* 下线页面的 meta，标题不写 {site}（根布局的 title.template 会补） */
  'seo.room.title': 'Bilik Piksel — Main Permainan Retro dalam Pelayar',
  'seo.room.description':
    'Masuk ke bilik piksel: permainan NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive dan arcade berjalan di TV CRT. Pilih tajuk dari pustaka dalam talian, atau lepaskan fail ROM anda sendiri ke skrin.',
  /* 登录页（`/login`），这一页是 noindex, follow */
  'seo.login.title': 'Log masuk',
  'seo.login.description':
    'Log masuk ke akaun anda untuk menyegerakkan simpanan, sejarah permainan dan kegemaran merentas peranti.',

  /* 首页落地页：Hero + 按机种 / 开发商浏览 + 最新收录 + FAQ */
  'home.hero.title': 'Main permainan retro klasik dalam pelayar',
  'home.hero.lead':
    '{site} ada permainan NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade dan banyak lagi untuk dimainkan dalam talian, dengan main berdua melalui rangkaian.',
  'home.hero.play': 'Muatkan ROM setempat',
  'home.hero.browse': 'Lihat semua permainan',
  'home.join.title': 'Main bersama rakan',
  'home.join.hint': 'Masukkan kod bilik 4 aksara yang dikongsi oleh rakan anda.',
  'home.join.submit': 'Sertai bilik',
  /* 「两颗钮」与「搜索框」之间的分隔词 */
  'home.hero.or': 'ATAU',
  'home.search.label': 'Cari dalam pustaka permainan',
  'home.search.placeholder': 'Cari tajuk / pembangun / siri',
  'home.search.submit': 'Cari',
  'home.consoles.title': 'Layari mengikut konsol',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade dan banyak lagi — pilih satu untuk melihat permainannya.',
  'home.consoles.count': '{count} permainan',
  'home.consoles.all': 'Semua konsol',
  'home.latest.title': 'Tambahan terkini',
  'home.latest.lead': 'Permainan terbaharu di laman ini.',
  'home.latest.viewAll': 'Semua permainan',
  'home.developers.title': 'Layari mengikut pembangun',
  'home.developers.lead': 'Studio ini mempunyai paling banyak permainan di sini.',
  'home.developers.viewAll': 'Semua pembangun',
  /* 库空了才会用到 */
  'home.empty':
    'Pustaka kosong sekarang — buka bilik dan lepaskan ROM ke TV CRT untuk mula bermain.',
  'home.faq.title': 'Soalan lazim',
  'home.faq.q1': 'Adakah ia percuma?',
  'home.faq.a1':
    'Sepenuhnya percuma — setiap permainan boleh dimainkan. Log masuk menambah simpanan awan untuk sejarah permainan dan fail simpanan anda.',
  'home.faq.q2': 'Perlukah saya memasang apa-apa?',
  'home.faq.a2': 'Tidak — klik sahaja permainan dan main terus dalam pelayar.',
  'home.faq.q3': 'Adakah ia berfungsi pada telefon dan tablet?',
  'home.faq.a3': 'Ya — ia berfungsi terus dalam pelayar pada telefon dan tablet.',
  'home.faq.q4': 'Bolehkah saya memuat turun fail ROM?',
  'home.faq.a4':
    'Ya — setiap halaman permainan ada butang muat turun. Muat turun hanya fail ROM yang anda sah berhak gunakan.',
  'home.faq.q5': 'Bolehkah saya bermain bersama rakan?',
  'home.faq.a5': 'Sudah tentu! Ajak rakan dan buka bilik untuk bertanding.',
  'home.faq.q6': 'Adakah ia menyokong pengawal permainan?',
  'home.faq.a6':
    'Ya — pasang pengawal USB atau Bluetooth dan emulator akan mengesannya melalui pelayar. Pemetaan butang mengikut tetapan lalai setiap teras; pada telefon anda guna butang di skrin.',

  /* 首屏那段看不见的正文（sr-only），简短且与页面真实功能一致 */
  'seo.heading': 'Main permainan retro dalam pelayar',
  'seo.intro':
    '{site} ialah bilik permainan retro dalam talian. Tajuk NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive dan arcade berjalan terus di sini dalam pelayar — diemulasikan pada mesin anda sendiri, dengan RetroArch dikompil ke WebAssembly.',
  'seo.howTo':
    'Pilih permainan dari pustaka dalam talian, atau lepaskan fail ROM anda sendiri ke televisyen. Tiada apa perlu dipasang.',

  /* 游戏列表 / 详情 / 下载三页的 SEO 文案 */
  'seo.games.title': 'Semua permainan — Main NES, SNES, GBA & Arcade dalam talian',
  'seo.games.description':
    '{count} permainan retro dalam pustaka dalam talian, semuanya boleh dimainkan dalam pelayar: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade dan banyak lagi. Buka tajuk untuk butiran, main serta-merta, atau muat turun fail ROM.',
  'seo.games.search.title': 'Hasil carian untuk “{keyword}”',
  'seo.games.search.description':
    '{count} permainan dalam pustaka dalam talian sepadan dengan “{keyword}”. Main dalam pelayar atau muat turun fail ROM.',
  'seo.games.console.title': 'Permainan {console} — Main dalam talian dalam pelayar',
  'seo.games.console.description':
    '{count} permainan {console} dalam pustaka dalam talian, semuanya boleh dimainkan dalam pelayar atau dimuat turun sebagai fail ROM.',
  'seo.game.title': '{title} — Main {console} dalam talian',
  'seo.game.description':
    'Main {title} ({console}) terus dalam pelayar — percuma, tiada apa perlu dipasang. Fail ROM juga tersedia untuk dimuat turun.',
  'seo.gameDownload.title': 'Muat turun ROM {title} ({console})',
  'seo.gameDownload.description':
    'Muat turun fail ROM untuk {title} ({console}) dengan satu klik, tanpa pendaftaran. Anda juga boleh memainkannya terus dalam pelayar.',
  /* 开发商两页 */
  'seo.developers.title': 'Pembangun permainan — Main permainan NES, SNES, GBA & Arcade mereka',
  'seo.developers.description':
    '{count} pembangun di sebalik permainan dalam pustaka dalam talian. Buka satu untuk melihat setiap tajuk yang kami ada daripada studio itu.',
  'seo.developer.title': '{name} — Permainan daripada pembangun ini',
  'seo.developer.description':
    'Setiap permainan {name} dalam pustaka dalam talian ({count}), boleh dimainkan dalam pelayar atau dimuat turun sebagai fail ROM.',
  /* 机种两页 */
  'seo.consoles.title': 'Layari mengikut konsol — Main permainan NES, SNES, GBA & Arcade dalam talian',
  'seo.consoles.description':
    'Setiap konsol dalam pustaka dalam talian ({count} permainan kesemuanya). Pilih satu untuk melihat semua permainannya, boleh dimainkan dalam pelayar.',
  'seo.console.title': '{name} — Main dalam talian',
  'seo.console.description':
    'Setiap permainan {name} dalam pustaka dalam talian ({count}), boleh dimainkan dalam pelayar atau dimuat turun sebagai fail ROM.',

  /* 右侧那排开关 */
  'theme.toDark': 'Tukar ke mod malam',
  'theme.toLight': 'Tukar ke mod siang',
  'lamp.turnOn': 'Hidupkan lampu',
  'lamp.turnOff': 'Padamkan lampu',
  'simple.enter': 'Mod ringkas: kekalkan hanya dinding, TV, meja dan lantai',
  'simple.exit': 'Keluar mod ringkas',
  'tvSize.open': 'Saiz TV',
  'tvSize.opt.large': 'Besar',
  'tvSize.opt.medium': 'Sederhana',
  'tvSize.opt.small': 'Kecil',
  'tvSize.pick': 'Tetapkan saiz TV kepada {level}',
  /* 语言下拉的读屏名字。语言名本身不翻译（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Bahasa',
  /* 语言提示弹窗：正文跟当前页面语言，只有那颗钮跟目标语言 */
  'localePrompt.title': 'Halaman ini dalam bahasa Melayu',
  'localePrompt.body': 'Pelayar anda lebih suka bahasa lain. Tukar?',
  'localePrompt.keep': 'Kekal dalam bahasa Melayu',
  'fullscreen.enter': 'Skrin penuh untuk paparan permainan',
  'fullscreen.exit': 'Keluar skrin penuh',

  /* 屏幕里那块提示（整块屏幕就是按钮，点它 = 选 ROM 文件） */
  'screen.pick': 'Klik untuk pilih fail ROM, atau lepaskan di sini',
  'screen.srLabel': 'Pilih fail ROM untuk dijalankan',
  /* 屏幕里的可见提示，走 font-pixel，全大写是英文那一侧的排版风格，这里跟着大写 */
  'screen.tapLoad': 'KLIK UNTUK MUATKAN ROM SETEMPAT',
  'screen.orLibrary': 'ATAU LANCARKAN DARI PUSTAKA DALAM TALIAN',
  'screen.release': 'LEPASKAN UNTUK MUATKAN',
  'screen.mobileLibrary': 'LANCARKAN DARI PUSTAKA',
  'screen.mobileTap': 'KETIK SKRIN UNTUK BUKA PUSTAKA',
  'screen.waitingHost': 'MENUNGGU HOS',
  'screen.paused': 'DIJEDA',
  'screen.resumeOnPanel': 'TEKAN SAMBUNG DI PANEL',
  'screen.resumeInPanel': 'TEKAN SAMBUNG DI PANEL KANAN',
  'screen.waitHostResume': 'MENUNGGU HOS SAMBUNG SEMULA',

  /* 机身面板那排钮 */
  'panel.resume': 'Sambung',
  'panel.pause': 'Jeda',
  'panel.save': 'Simpan',
  'panel.load': 'Muat',
  'panel.reset': 'Set semula',
  'panel.eject': 'Keluarkan',
  'volume.down': 'Turunkan volum satu tahap',
  'volume.up': 'Naikkan volum satu tahap',
  'volume.set': 'Tetapkan volum ke {level} daripada {max}',

  /* 存档。已从快照槽位制换成电池存档（一款一份），文案里不提份数 */
  'saves.title': 'Muat simpanan',
  'saves.load': 'Muat',
  'saves.close': 'Tutup',
  'saves.groupLocal': 'Peranti ini',
  'saves.groupCloud': 'Awan (akaun)',
  'saves.deleteCloud': 'Padam simpanan awan ini',
  'saves.delete': 'Padam',
  'saves.loginHint': 'Log masuk untuk menyimpan simpanan awan dan sambung di mana-mana peranti.',
  'saves.login': 'Log masuk',
  'saves.loading': 'Memuatkan…',
  'saves.downloading': 'Memuat turun simpanan awan…',
  'saves.restoring': 'Memulihkan permainan…',
  'saves.empty': 'Belum ada simpanan',

  'library.removeLabel': 'Buang {name}',

  /* 键位表。走系统字体：这几条是给人读懂的说明 */
  'legend.moves': 'gerak',
  'legend.open': 'Kawalan',
  'legend.title': 'Kawalan',
  'legend.close': 'Tutup',
  /* 载入失败时唯一的提示通道。FBNeo 只吃 .zip */
  'legend.needZip':
    'Format  FBNeo hanya membaca .zip — yang ini nampak seperti {ext}. Bungkus semula, atau dapatkan versi .zip',
  /* `/play` 专用：那一页没有「按键说明」弹窗可挂，措辞刻意不照抄上一条 */
  'play.needZip':
    'Format  ROM ini arkib {ext} yang tidak dapat dibuka — cuba .zip atau ROM tanpa arkib',
  /* 多文件光盘镜像：不说「哪种格式不吃」，而是说「要单文件」 */
  'legend.needDisc':
    'Format  Imej cakera biasanya berbilang fail (.cue + .bin). Laman ini hanya menerima imej satu fail — dapatkan versi .pbp, .iso atau .chd',
  'play.needDisc':
    'Format  Ini imej cakera berbilang fail (.cue + .bin). Hanya imej satu fail berfungsi di sini — cuba versi .pbp, .iso atau .chd',
  /* 看着像 Neo Geo 游戏而 BIOS 没拿到。判据是猜的，措辞留余地 */
  'legend.needBios':
    'BIOS  Ini nampak seperti permainan Neo Geo (KOF, Metal Slug…). Ia perlukan neogeo.zip — lepaskan fail itu ke halaman dan ia akan dipasang. Permainan CPS1 / CPS2 tidak memerlukannya.',
  'legend.gamepad':
    'Pengawal  Pasang dan ia terus berfungsi — pada kedua-dua pihak apabila anda berada dalam bilik.',

  /* 联机面板。房间码输入框走 font-pixel，值保持 ASCII */
  'netplay.title': 'Main rangkaian',
  'netplay.open': 'Main melalui rangkaian',
  'netplay.close': 'Tutup',
  'netplay.create': 'Buat bilik',
  'netplay.or': 'atau',
  'netplay.join': 'Sertai',
  'netplay.codePlaceholder': 'KOD',
  'netplay.hint':
    'Kedua-dua pihak hanya perlu sampai ke geganti awam — LAN yang sama paling berkesan. Sebut kod 4 aksara kepada pemain lain. Hos menjalankan emulator dan menstrim gambar; tetamu tidak perlukan ROM.',
  'netplay.roomCode': 'Kod bilik',
  /* 链路选择器：「局域网」= 只 STUN；「公网」= 额外带 TURN 兜底 */
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Internet awam',
  'netplay.wanDev': 'Main rangkaian melalui internet awam sedang dibangunkan.',
  /* 出画档位。标签保持一两个词 —— 三个按钮要并排塞下 */
  'netplay.quality': 'Kualiti strim',
  'netplay.qualitySmooth': 'Licin',
  'netplay.qualityBalanced': 'Seimbang',
  'netplay.qualitySharp': 'Tajam',
  'netplay.qualityHint':
    'Hos menjalankan emulator dan strim pada satu mesin. Jika ia tidak dapat menampung, seluruh permainan menjadi perlahan. Turunkan satu tahap jika itu berlaku — ini hanya terpakai pada hos.',
  'netplay.copy': 'Salin',
  'netplay.copied': 'Disalin',
  /* 「分享」= 复制一条带房间码的链接；上面那条复制的是码本身 */
  'netplay.share': 'Kongsi',
  'netplay.shareCopied': 'Pautan disalin',
  'netplay.inviteTitle': 'Jemputan bilik',
  'netplay.inviteBody': 'Sertai bilik {code}?',
  'netplay.inviteJoin': 'Sertai',
  'netplay.inviteCancel': 'Batal',
  'netplay.connected': 'Disambungkan',
  'netplay.waiting': 'Menunggu pemain lain',
  /* 加入者侧的「还没连上」，和上一条是两码事 */
  'netplay.joining': 'Menyertai bilik…',
  'netplay.waitingGame': 'Disambungkan — menunggu hos memuatkan kartrij',
  'netplay.hostPlaying': 'Hos sedang bermain',
  'netplay.paused': 'Dijeda',
  /* 刚连上那枚几秒后自己消失的提示，同时是「你是谁」的第一句话 */
  'netplay.toastHost': 'Disambungkan · pemain lain sudah masuk · anda pemain 1',
  'netplay.toastGuest': 'Disambungkan ke hos · anda pemain 2',
  'netplay.toastHostLeft': 'Hos telah keluar — bilik ditutup',
  'netplay.toastGuestLeft': 'Pemain 2 telah keluar dari bilik',
  /* 这两句刻意不列键位，键位只由实时值生成 */
  'netplay.youAreHost':
    'Anda pemain 1. Muatkan kartrij dan gambar akan dihantar kepada tetamu secara automatik. Anda bermain dengan set kekunci sendiri — lihat Kawalan untuk pemetaan semasa.',
  'netplay.youAreGuest':
    'Anda pemain 2. Kartrij tidak diperlukan — hos menstrim gambar, dan input anda dihantar kepada hos. Main dengan set kekunci sendiri (kumpulan Pemain 1) atau pengawal — lihat Kawalan.',
  'netplay.leave': 'Keluar bilik',
  'netplay.closeRoom': 'Tutup bilik',
  'netplay.badCode': 'Kod itu nampak tidak betul — sepatutnya 4 aksara.',
  'netplay.errInsecure':
    'Main rangkaian memerlukan HTTPS atau localhost. Halaman ini pada http biasa, jadi pelayar menahan API kripto yang digunakannya.',
  'netplay.errNoDirect':
    'Kedua-dua pihak sampai ke geganti, tetapi sambungan terus tidak dapat dibuka — biasanya NAT atau tembok api. LAN yang sama paling berkesan.',
  'netplay.errPassword': 'Kod bilik tidak sepadan.',
  'netplay.errHandshake': 'Handshake tamat masa — pemain lain mungkin telah keluar.',
  'netplay.errHostLeft': 'Hos telah keluar dari bilik — bilik telah ditutup.',
  'netplay.errNoRoom':
    'Tiada jawapan daripada hos. Kod bilik mungkin salah, atau hos belum membuka bilik.',
  'netplay.errRoomFull': 'Bilik itu sudah penuh — permainan ini hanya satu lawan satu.',
  'netplay.errUnknown':
    'Tidak dapat menyambung kepada pemain lain. Konsol pelayar ada sebab yang tepat.',

  /* `/play`：左边黑屏 + 右边一列控件。联机那部分词全部复用上面的 netplay.* */
  'seo.play.title': 'Bilik Main — Muatkan Permainan dan Main dalam Talian',
  'seo.play.description':
    'Satu skrin untuk mula bermain: main solo, atau buka bilik 1 lawan 1 dan kongsi kodnya. Tajuk NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive dan arcade.',
  'play.modeSolo': 'Solo',
  'play.start': 'Mula',
  'play.confirmStart': 'Sahkan dan mula',
  'play.confirm': 'Sahkan',
  'play.qualityIntro': 'Pilih kualiti gambar untuk main dalam talian mengikut sambungan anda.',
  'play.qualityHint.smooth': '30 fps · Guna lebar jalur lebih rendah, sesuai untuk sambungan perlahan.',
  'play.qualityHint.balanced': 'Sehingga 720p / 60 fps · Mengimbangi ketajaman dan gerakan licin.',
  'play.qualityHint.sharp':
    'Sehingga 60 fps · Utamakan butiran resolusi asal; perlukan sambungan pantas. Kadar bingkai mungkin menurun pada rangkaian perlahan.',
  'play.qualityConfirmHint':
    'Sahkan untuk menyambung ke bilik. Hos kemudian memuatkan permainan; tetamu menerima gambar hos.',
  'play.connecting': 'Menyambung…',
  'play.confirmJoin': 'Sahkan dan sertai',
  'play.cancel': 'Batal',
  'play.screenSize': 'Saiz skrin',
  'play.controlsTitle': 'Kawalan permainan',
  'play.netplayKeysHint': 'Untuk main dalam talian, setiap pemain guna kekunci Pemain 1 sendiri.',
  'play.cancelled': 'Pemuatan dibatalkan.',
  'play.retry': 'Muat semula',
  'play.retryJoin': 'Cuba sertai lagi',
  'play.saved': 'Permainan disimpan.',
  'play.localSaving': 'Menyimpan…',
  'play.uploading': 'Memuat naik…',
  'play.cloudFailed': 'Penyegerakan awan gagal.',
  'play.saveNoLogin': 'Log masuk untuk segerak',
  'play.tooLarge': 'Simpanan terlalu besar',
  'play.theme': 'Tema',
  'play.saveFailed': 'Tidak dapat menyimpan permainan. Sila cuba lagi.',
  'play.loadFailed': 'Tidak dapat memuatkan simpanan. Sila cuba lagi.',
  'play.leftRoom': 'Anda telah keluar dari bilik.',
  'play.latency': 'Kependaman',
  'play.measuringLatency': 'Mengukur…',
  'play.downloading': 'Memuat turun ROM…',
  'play.booting': 'Memulakan teras…',
  'play.loadFail': 'Kartrij ini gagal dimuatkan.',
  'play.romIncomplete': 'Fail ROM tidak lengkap — sila muat semula.',
  'play.notFound': 'Permainan itu tidak ditemui.',
  'play.fullscreen': 'Skrin penuh',
  'play.volume': 'Volum',
  'play.edit': 'Edit',
  /* 右栏收起 / 展开那颗钮：短，收起后只有 40px 宽、竖排 */
  'play.hideSidebar': 'Sembunyi panel',
  'play.showSidebar': 'Tunjuk panel',
  'play.hint': 'Esc keluar skrin penuh. Tiada apa-apa lagi di sini menggunakan papan kekunci.',
  'play.leaveTitle': 'Permainan sedang berjalan',
  'play.leaveBody':
    'Kembali akan menamatkan sesi ini — kemajuan tidak disimpan secara automatik.',
  'play.leaveStay': 'Terus bermain',
  'play.leaveGo': 'Keluar',
  'gamesPage.playOnline': 'Main dalam talian',

  /*
   * 自定义按键面板。钮名默认走街机叫法（A B C X Y Z），不进文案表；
   * 只有「开始 / 投币」是词，跟着语言走。
   */
  'keybind.title': 'Pemetaan kekunci',
  'keybind.open': 'Tetapan kekunci',
  'keybind.close': 'Tutup',
  'keybind.p1': 'Pemain 1',
  'keybind.p2': 'Pemain 2',
  /* 联机时唯一的标签：锁的是 1P 那组，但按归属命名，不按号位 */
  'keybind.mine': 'Kekunci anda',
  'keybind.pressKey': 'TEKAN…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Pulihkan lalai',
  'keybind.reload': 'Muat semula kartrij',
  'keybind.reloading': 'Memuat semula…',
  'keybind.unsupported': 'Kekunci itu tidak boleh digunakan — cuba yang lain.',
  'keybind.conflictSame': '{pressed} sudah dipetakan ke butang {button} — cuba kekunci lain.',
  'keybind.conflictOther':
    '{pressed} sudah dipetakan ke butang {button} pada pemain {player} — cuba kekunci lain.',
  'keybind.hint':
    'Peta papan kekunci dibaca sekali, semasa kartrij dimuatkan — muat semula untuk perubahan berkuat kuasa. Kedua-dua pemain tidak boleh berkongsi kekunci.',
  /* 单人机（NDS）那一档：去掉「两位玩家不能共用同一个键」那半句 */
  'keybind.soloHint':
    'Peta papan kekunci dibaca sekali, semasa kartrij dimuatkan — muat semula untuk perubahan berkuat kuasa.',
  'keybind.hostHint':
    'Anda hos: Pemain 1 ialah kekunci anda sendiri, Pemain 2 ialah tempat input tetamu disuntik. Kedua-duanya tidak boleh berkongsi kekunci, jika tidak input yang disuntik akan turut menggerakkan Pemain 1 anda. Muat semula kartrij selepas mengubah.',
  'keybind.guestHint':
    'Anda tetamu dan bermain dengan set kekunci sendiri (kumpulan Pemain 1) — setiap pihak di papan kekunci masing-masing, jadi tiada pertembungan. Perubahan berkuat kuasa serta-merta — tidak perlu muat semula kartrij.',
  'keybind.guestLocalHint':
    'Anda tetamu, dan kartrij anda sendiri juga berjalan di sini. Kekunci anda ialah kumpulan Pemain 1: ia menggerakkan kartrij setempat itu, jadi muat semula selepas mengubah — dan ia juga yang dihantar kepada hos, yang berkuat kuasa serta-merta.',

  /* 在线游戏库（服务端上传的那批游戏），和本机历史是两回事 */
  'games.open': 'Pustaka permainan',
  'games.title': 'Pustaka permainan',
  'games.close': 'Tutup',
  'games.empty': 'Pustaka kosong — belum ada apa-apa dimuat naik',
  'games.loading': 'Memuatkan…',
  'games.loadingRom': 'Memuatkan {name}…',
  'games.cancel': 'Batal',
  'games.failed': 'Tidak dapat memuatkan pustaka permainan',
  'games.tabLibrary': 'Pustaka permainan',
  'games.tabHistory': 'Sejarah',
  'games.historyEmpty': 'Belum ada apa-apa dibuka dari pustaka',
  'games.historyLoad': '{name}\nKlik untuk muat semula',
  'games.tabFavorites': 'Kegemaran',
  'games.favorite': 'Tambah {name} ke kegemaran',
  'games.unfavorite': 'Buang {name} dari kegemaran',
  'games.favoritesEmpty': 'Belum ada kegemaran — ketik bintang pada mana-mana kulit.',
  /* 未登录那句拆成三段，中间那颗「登录」是真按钮，首尾空格有意义 */
  'games.favoritesSignInBefore': 'Log masuk untuk menyimpan kegemaran — ',
  'games.favoritesSignInLink': 'Log masuk',
  'games.favoritesSignInAfter': ' di sini, atau guna butang akaun di kanan atas.',

  /* 用户面板：注册 / 登录 / 退出。和后台管理员是两回事，文案里不许暗示相通 */
  'user.title': 'Akaun',
  'user.close': 'Tutup',
  'user.open': 'Akaun — log masuk atau daftar',
  'user.openSignedIn': 'Akaun: {name}',
  'user.tabLogin': 'Log masuk',
  'user.tabRegister': 'Buat akaun',
  'user.username': 'Nama pengguna',
  'user.password': 'Kata laluan',
  /* 下面两条规则提示现在当 placeholder 用，越短越好 */
  'user.usernameHint': '3–20 aksara: huruf, digit, _ - .',
  'user.emailLabel': 'E-mel',
  'user.emailHint': 'E-mel anda. Tiada alias +, tiada mel sementara.',
  'user.passwordHint': 'Sekurang-kurangnya 6 aksara, tanpa ruang.',
  'user.signIn': 'Log masuk',
  'user.signUp': 'Buat akaun',
  'user.signingIn': 'Log masuk…',
  'user.signingUp': 'Mencipta…',
  'user.signOut': 'Log keluar',
  'user.signedInAs': 'Log masuk sebagai {name}.',
  'user.cloudHint':
    'Sejarah permainan, simpanan dan kegemaran anda disimpan dalam akaun anda — buka mana-mana permainan dari pustaka dalam talian dan ia disegerakkan secara automatik.',
  'user.formLead':
    'Log masuk dan simpanan, sejarah permainan serta kegemaran anda disimpan di awan — main bila-bila masa, di mana-mana!',
  /* 表单下面那句法律声明拆成四段，中间夹两个真链接；首尾空格有意义，别 trim */
  'user.consentLogin': 'Dengan log masuk, anda bersetuju dengan ',
  'user.consentRegister': 'Dengan membuat akaun, anda bersetuju dengan ',
  'user.consentMiddle': ' dan ',
  'user.consentAfter': '.',

  'user.error.failed': 'Ada masalah — cuba lagi.',
  'user.error.missingCredentials': 'Masukkan nama pengguna dan kata laluan.',
  'user.error.usernameInvalid': 'Nama pengguna hanya boleh mengandungi huruf, digit, _ - dan .',
  'user.error.usernameTooShort': 'Nama pengguna terlalu pendek (sekurang-kurangnya 3 aksara).',
  'user.error.usernameTooLong': 'Nama pengguna terlalu panjang (paling banyak 20 aksara).',
  'user.error.usernameTaken': 'Nama pengguna itu sudah digunakan — pilih yang lain.',
  /* 注册邮箱校验；登录不校验邮箱 */
  'user.error.emailInvalid': 'Masukkan alamat e-mel yang sah.',
  'user.error.emailAlias': 'E-mel alias (seperti name+tag@… atau Gmail dengan titik) tidak dibenarkan.',
  'user.error.emailTemp': 'Penyedia e-mel sekali guna tidak dibenarkan — guna peti mel biasa anda.',
  'user.error.passwordInvalid': 'Masukkan kata laluan.',
  'user.error.passwordTooShort': 'Kata laluan terlalu pendek (sekurang-kurangnya 6 aksara).',
  'user.error.passwordTooLong': 'Kata laluan terlalu panjang (paling banyak 72 aksara).',
  'user.error.passwordHasSpace': 'Kata laluan tidak boleh mengandungi ruang.',
  'user.error.invalidCredentials': 'Nama pengguna atau kata laluan salah.',
  'user.error.banned': 'Akaun ini telah digantung.',
  /* 人机验证（Cloudflare Turnstile）：两句都只说「怎么办」 */
  'user.error.captchaRequired': 'Sila selesaikan pengesahan manusia dahulu.',
  'user.error.captchaFailed': 'Pengesahan manusia gagal — sila cuba lagi.',

  /* 独立登录页（`/login`）标题下面那句说明 */
  'login.lead':
    'Log masuk dan simpanan, sejarah permainan serta kegemaran anda disimpan di awan — main bila-bila masa, di mana-mana. Belum ada akaun? Buat satu.',

  /* 个人中心（`/account`）。`account.error.*` 刻意和 `user.error.*` 分开 */
  'account.title': 'Akaun anda',
  'account.loading': 'Memuatkan…',
  'account.failed': 'Ada masalah — cuba lagi.',
  'account.since': 'Ahli sejak {time}',
  /* VIP 两种徽章都要有，非 VIP 那颗是灰的 */
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Biasa',
  'account.vipUntil': 'VIP sehingga {time}',
  'account.vipExpired': 'VIP tamat pada {time}',
  'account.tabFavorites': 'Kegemaran',
  'account.tabHistory': 'Sejarah',
  'account.tabSaves': 'Simpanan',
  'account.tabProfile': 'Profil',
  'account.tabPassword': 'Kata laluan',
  'account.favoritesLoading': 'Memuatkan kegemaran…',
  'account.historyLoading': 'Memuatkan sejarah…',
  'account.savesLoading': 'Memuatkan simpanan…',
  'account.favoritesEmpty':
    'Belum ada kegemaran — buka pustaka permainan dalam bilik dan ketik bintang pada kulit.',
  'account.unfavorite': 'Buang {name} dari kegemaran',
  'account.historyEmpty':
    'Belum ada sejarah permainan — permainan yang anda buka dari pustaka dalam talian akan muncul di sini.',
  'account.historyCount': '{count} permainan dimainkan baru-baru ini',
  'account.historyDeleted': 'Dibuang dari sejarah.',
  'account.clearHistory': 'Kosongkan semua',
  'account.confirmClearHistory': 'Betul-betul kosongkan semua?',
  'account.historyCleared': 'Sejarah dikosongkan.',
  /* 上限说明：不写死数字，那个数改了这里就会说谎 */
  'account.historyHint':
    'Sejarah menyimpan {max} permainan yang paling baru dimainkan — bermain yang lama semula akan mengalihkannya ke atas.',
  'account.savesEmpty': 'Belum ada simpanan awan.',
  'account.savesCount': '{count} simpanan kesemuanya',
  'account.savesGroupCount': '{count} simpanan',
  'account.viewGame': 'Lihat {name}',
  'account.savesHint':
    'Satu simpanan bagi setiap permainan — menyimpan lagi akan menimpanya. Perkara sama terpakai pada setempat dan awan.',
  'account.saveDeleted': 'Simpanan dipadam.',
  'account.clearSaves': 'Kosongkan semua',
  'account.confirmClearSaves': 'Betul-betul kosongkan semua?',
  'account.savesCleared': '{count} simpanan dikosongkan.',
  'account.delete': 'Padam',
  'account.confirmDelete': 'Betul-betul padam?',
  'account.avatar': 'Avatar',
  'account.chooseImage': 'Pilih imej',
  'account.clearAvatar': 'Buang avatar',
  'account.uploading': 'Memuat naik…',
  'account.avatarSaved': 'Avatar dikemas kini.',
  'account.avatarCleared': 'Avatar dibuang.',
  'account.avatarHint': 'PNG, JPEG, WebP atau GIF, sehingga 2 MB.',
  'account.gender': 'Jantina',
  'account.genderNone': 'Tidak dinyatakan',
  'account.genderMale': 'Lelaki',
  'account.genderFemale': 'Perempuan',
  'account.genderSaved': 'Disimpan.',
  'account.genderHint': 'Pilihan — tidak ditunjukkan kepada sesiapa kecuali anda.',
  'account.passwordTabHint': 'Anda kekal log masuk pada peranti ini selepas itu — tidak perlu log masuk semula.',
  'account.password': 'Kata laluan',
  'account.oldPassword': 'Kata laluan semasa',
  'account.newPassword': 'Kata laluan baharu',
  'account.confirmPassword': 'Ulang kata laluan baharu',
  'account.savePassword': 'Tukar kata laluan',
  'account.saving': 'Menyimpan…',
  'account.passwordSaved': 'Kata laluan ditukar.',
  'account.passwordHint':
    'Anda kekal log masuk pada peranti ini selepas menukarnya. Peranti lain yang log masuk terus berfungsi sehingga sesinya tamat.',

  'account.error.missingOld': 'Masukkan kata laluan semasa anda.',
  'account.error.wrongPassword': 'Kata laluan semasa salah.',
  'account.error.passwordTooShort': 'Kata laluan baharu terlalu pendek (sekurang-kurangnya 6 aksara).',
  'account.error.passwordTooLong': 'Kata laluan baharu terlalu panjang (paling banyak 72 aksara).',
  'account.error.passwordHasSpace': 'Kata laluan baharu tidak boleh mengandungi ruang.',
  'account.error.mismatch': 'Dua kata laluan baharu tidak sepadan.',
  'account.error.avatarMissing': 'Pilih imej dahulu.',
  'account.error.avatarTooLarge': 'Imej itu terlalu besar (maksimum 2 MB).',
  'account.error.avatarType': 'Format tidak disokong — guna PNG, JPEG, WebP atau GIF.',

  /* 在线库列表上那排筛选：机种 + 搜索，都只在已拉回来的列表上过滤 */
  'games.filterAll': 'Semua',
  'games.searchPlaceholder': 'Cari tajuk / pembangun / siri',
  'games.search': 'Cari',
  'games.noMatch': 'Tiada permainan sepadan.',
  'games.prev': 'Sebelum',
  'games.next': 'Seterusnya',
  /*
   * 在线库的加载速度提示。**马来语同样是空串** —— 那句话是说给「文件在境外」的读者听的，
   * 马来语界面下的读者多半就在境外，这条既没用又显得莫名其妙（理由与英文那份相同）。
   */
  'games.remoteSlow': '',

  /* 地板上那张纸片，点开弹出来的那句话 */
  'note.text': 'Semoga kita semua menemui semula kegembiraan masa kecil..',
  'note.open': 'Baca nota di lantai',
  'note.title': 'Sekeping nota',
  'note.close': 'Tutup',
  'window.cycle': 'Tukar musim di luar',
  /* 墙上那幅挂画：画名和作者只有这一个出处 */
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
  'painting.title.wave': 'Ombak Besar di Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Lukisan Tanpa Nama dari Entah Mana',
  'painting.artist.unknown': 'Tanpa nama',
  /* 地板上那台 MP4：整台机器就是一个按钮，这两条是它的无障碍名字 */
  'mp4.play': 'Mainkan lagu pada pemain MP4',
  'mp4.pause': 'Jedakan pemain MP4',
  /* 逗猫棒是彩蛋的开关；下面七条是猫的品种名，只当无障碍名字用 */
  'cat.wand': 'Goyangkan batang mainan kucing di lantai',
  'cat.ragdoll': 'Seekor ragdoll mengintai dari belakang buku',
  'cat.siamese': 'Seekor Siam mengintai dari belakang buku',
  'cat.tabby': 'Seekor tabby mengintai dari belakang buku',
  'cat.orange': 'Seekor tabby oren mengintai dari belakang buku',
  'cat.american': 'Seekor bulu pendek Amerika mengintai dari belakang buku',
  'cat.tuxedo': 'Seekor kucing tuxedo mengintai dari belakang buku',
  'cat.calico': 'Seekor calico mengintai dari belakang buku',

  /* 地上那本留言本 */
  'feedback.open': 'Baca buku tetamu di lantai',
  'feedback.title': 'Buku tetamu',
  'feedback.close': 'Tutup',
  'feedback.placeholder': 'Tulis sesuatu — cadangan, atau permainan yang anda ingin lihat di sini…',
  'feedback.submit': 'Hantar',
  'feedback.submitting': 'Menghantar…',
  'feedback.ok': 'Dihantar — terima kasih!',
  'feedback.required': 'Tulis sesuatu dahulu.',
  'feedback.failed': 'Tidak dapat menghantar — cuba lagi.',
  'feedback.loading': 'Memuatkan…',
  'feedback.empty': 'Belum ada mesej — jadilah yang pertama menulis.',
  'feedback.retry': 'Cuba lagi',
  /* 翻页条。没有总页数（游标分页拿不到总数），所以只有「第几页」 */
  'feedback.prev': 'Sebelum',
  'feedback.next': 'Seterusnya',
  'feedback.page': 'Halaman {n}',
  'feedback.resolved': 'Selesai',
  'feedback.unresolved': 'Belum selesai',

  /* 隐私政策 / 服务条款：正文在 lib/legal.ts，这里只有界面要用的几个词 */
  'legal.privacy': 'Dasar Privasi',
  'legal.terms': 'Terma Perkhidmatan',
  'legal.updated': 'Dikemas kini {date}',
  'legal.contact': 'Hubungi kami:',

  /* 初次打开的操作指引（两步） */
  'tour.title': 'Panduan pantas',
  'tour.skip': 'Langkau',
  'tour.back': 'Kembali',
  'tour.next': 'Seterusnya',
  'tour.done': 'Mula bermain',
  'tour.replay': 'Tunjuk panduan lagi',
  'tour.screen.title': 'Mulakan dengan permainan',
  'tour.screen.body':
    'Lepaskan fail ROM (.nes, .sfc, .gba, .md, .gb …) atau .zip arcade ke TV, atau klik skrin untuk pilih fail. Tiada ROM disertakan dengan repo ini — bawa sendiri.',
  'tour.rail.title': 'Rel suis',
  'tour.rail.body':
    'Tiga kumpulan, dari atas ke bawah. Rupa: tema (malam / siang), bahasa (中文 / English / 日本語 / 한국어 / Bahasa Melayu), Skrin penuh (skrin itu sendiri yang menjadi skrin penuh), Mod ringkas (kekalkan hanya dinding, TV, meja dan lantai), Saiz TV (buka pemilih besar / sederhana / kecil — meja turut melebar). Permainan: Main rangkaian, Pemetaan kekunci. Bantuan: Bantuan kawalan, dan Buku tetamu.',

  /* 房间右上角那一行，以及小屏的菜单抽屉 */
  'topLinks.label': 'Halaman laman',
  'topLinks.games': 'Senarai permainan',
  'menu.open': 'Buka menu',
  'menu.close': 'Tutup menu',
  'menu.theme': 'Tema',
  'menu.simple': 'Mod ringkas',

  /* 「离开房间」确认 */
  'leave.title': 'Tinggalkan halaman ini?',
  'leave.bodyGame': 'Permainan yang berjalan akan terganggu — kemajuan tidak disimpan.',
  'leave.bodyNetplay': 'Anda akan keluar dari bilik rangkaian, dan pasangan anda akan terputus.',
  'leave.stay': 'Kekal',
  'leave.confirm': 'Tinggalkan',

  /* 游戏列表页 */
  'gamesPage.heading': 'Semua permainan',
  'gamesPage.intro':
    '{count} permainan dalam pustaka dalam talian — NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade dan banyak lagi. Klik kulit untuk butiran, atau mula bermain terus.',
  'gamesPage.empty': 'Pustaka kosong sekarang.',
  'gamesPage.introConsole':
    '{count} permainan {console} dalam pustaka. Klik kulit untuk butiran, atau mula bermain terus.',
  'gamesPage.filterLabel': 'Tapis mengikut konsol',
  'gamesPage.filterAll': 'Semua',
  'gamesPage.consoleEmpty': 'Belum ada permainan {console} dalam pustaka.',
  /* 列表页的搜索框是服务端搜索，刻意和房间弹窗那组 `games.search*` 各写一份 */
  'gamesPage.searchLabel': 'Cari dalam pustaka permainan',
  'gamesPage.searchPlaceholder': 'Cari tajuk / pembangun / siri',
  'gamesPage.searchSubmit': 'Cari',
  'gamesPage.searchLoading': 'Mencari…',
  'gamesPage.searchClear': 'Kosongkan carian',
  'gamesPage.searchResults': '“{keyword}” — {count} permainan sepadan.',
  'gamesPage.searchEmpty':
    'Tiada permainan sepadan dengan “{keyword}”. Cuba perkataan lebih pendek, atau tajuk permainan.',
  'gamesPage.prev': 'Sebelum',
  'gamesPage.next': 'Seterusnya',
  'gamesPage.backHome': 'Kembali ke halaman utama',
  'gamesPage.backToGames': 'Semua permainan',
  /* 内容页左上角那条返回链接的通用文案：实际做的是浏览器回退 */
  'common.back': 'Kembali',
  'common.home': 'Utama',
  'gamesPage.play': 'Main sekarang',
  'gamesPage.download': 'Muat turun ROM',
  'gamesPage.share': 'Kongsi permainan ini',
  'gamesPage.shareCopied': 'Pautan disalin',
  'gamesPage.shareFailed': 'Gagal menyalin',
  'gamesPage.favorite': 'Tambah ke kegemaran',
  'gamesPage.unfavorite': 'Buang dari kegemaran',
  'gamesPage.favoriteSignIn': 'Log masuk untuk menyimpan kegemaran — guna butang log masuk di bar atas.',
  'gamesPage.favoriteFailed': 'Tidak dapat mengemas kini kegemaran — cuba lagi.',
  'gamesPage.favoriteCount': '{n} dalam senarai kegemaran',
  /* 详情页那颗「反馈问题」+ 它弹出的窗，提交不需要登录 */
  'gamesPage.report': 'Laporkan masalah',
  'gamesPage.reportTitle': 'Laporkan masalah',
  'gamesPage.reportSubject': 'Perihal: {name}',
  'gamesPage.reportPlaceholder':
    'Apa yang tidak kena? Contohnya: tidak boleh dimulakan, gambar rosak, tiada bunyi…',
  'gamesPage.reportSubmit': 'Hantar laporan',
  'gamesPage.reportSubmitting': 'Menghantar…',
  'gamesPage.reportOk': 'Terima kasih — kami akan menyemaknya.',
  'gamesPage.reportRequired': 'Sila terangkan masalahnya dahulu.',
  'gamesPage.reportFailed': 'Tidak dapat menghantar — cuba lagi.',
  'gamesPage.reportClose': 'Batal',

  /* 详情页的评论模块。和「反馈问题」最要紧的区别：发评论必须先登录 */
  'comments.heading': 'Komen',
  'comments.count': '{n} komen',
  'comments.empty': 'Belum ada komen — jadilah yang pertama.',
  'comments.placeholder': 'Apa pendapat anda tentang permainan ini?',
  'comments.ratingLabel': 'Penilaian anda',
  'comments.ratingStar': 'Beri {n} daripada 5',
  'comments.ratingValue': '{n} daripada 5 bintang',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Pilih penilaian bintang dahulu.',
  'comments.submit': 'Hantar komen',
  'comments.submitting': 'Menghantar…',
  'comments.ok': 'Dihantar — ia di atas senarai.',
  'comments.required': 'Tulis sesuatu dahulu.',
  'comments.failed': 'Tidak dapat menghantar — cuba lagi.',
  'comments.signInLead': 'Log masuk untuk menghantar komen.',
  'comments.signIn': 'Log masuk',
  'comments.signInRequired': 'Sila log masuk semula untuk menghantar.',
  'comments.loading': 'Memuatkan komen…',
  'comments.retry': 'Cuba lagi',
  'comments.loadFailed': 'Tidak dapat memuatkan komen.',
  'comments.loadMore': 'Muat lagi',
  /* 自己的那条上的删除：两步，先「删除」，再「确认」 */
  'comments.delete': 'Padam',
  'comments.deleteConfirm': 'Sahkan',
  'comments.cancel': 'Batal',
  'comments.deleted': 'Komen dipadam.',
  'comments.deleteFailed': 'Tidak dapat memadam — cuba lagi.',
  'gamesPage.field.console': 'Konsol',
  'gamesPage.field.year': 'Tahun',
  'gamesPage.field.developer': 'Pembangun',
  'gamesPage.field.series': 'Siri',
  'gamesPage.field.language': 'Bahasa',
  'gamesPage.controls': 'Kawalan',
  'gamesPage.selectLanguage': 'Pilih bahasa',

  /* 全站 404，和「这个游戏从库里没了」分开命名 */
  'notFound.title': 'Halaman tidak ditemui',
  'notFound.description':
    'Alamat itu tidak wujud di {site}. Semak pautan, atau kembali ke halaman utama.',
  'gamesPage.notFoundTitle': 'Permainan tidak ditemui',
  'gamesPage.notFound': 'Permainan ini tiada dalam pustaka (lagi).',
  'gamesPage.fallbackDescription': '{title} ialah permainan {console}.',

  /* 开发商两页 */
  'developersPage.heading': 'Pembangun',
  'developersPage.intro':
    '{count} pembangun di sebalik permainan dalam pustaka. Buka satu untuk melihat semua yang kami ada daripada studio itu.',
  'developersPage.empty': 'Belum ada pembangun disenaraikan.',
  'developersPage.gameCount': '{count} permainan',
  'developersPage.gamesHeading': 'Permainan daripada {name}',
  'developersPage.gamesEmpty': 'Belum ada permainan daripada pembangun ini dalam pustaka.',
  'developersPage.field.founded': 'Ditubuhkan',
  'developersPage.backToDevelopers': 'Semua pembangun',
  'developersPage.notFoundTitle': 'Pembangun tidak ditemui',
  'developersPage.notFound': 'Pembangun ini tiada dalam pustaka (lagi).',

  /* 机种两页 */
  'consolesPage.heading': 'Konsol',
  'consolesPage.intro':
    'Konsol dalam pustaka — {count} permainan kesemuanya. Buka satu untuk melihat setiap tajuk yang dijalankannya.',
  'consolesPage.gameCount': '{count} permainan',
  'consolesPage.gamesHeading': 'Permainan pada {name}',
  'consolesPage.gamesEmpty': 'Belum ada permainan untuk konsol ini dalam pustaka.',
  /* 筛了语种却一款都没有（`{lang}` 来自 lib/rom-lang.ts 的语言全称） */
  'consolesPage.gamesEmptyLang': 'Belum ada permainan {lang} untuk konsol ini.',
  /* 语种筛选条的 aria-label：可见标签本身就是语言名，不进文案表 */
  'consolesPage.filterLangLabel': 'Tapis mengikut bahasa',
  'consolesPage.field.released': 'Dikeluarkan',
  'consolesPage.backToConsoles': 'Semua konsol',
  'consolesPage.notFoundTitle': 'Konsol tidak ditemui',
  'consolesPage.notFound': 'Konsol ini bukan sebahagian daripada laman (lagi).',

  'download.heading': 'Muat turun ROM',
  'download.hint': 'Klik butang di bawah — muat turun bermula 6 saat kemudian.',
  'download.button': 'Mula muat turun',
  'download.waiting': 'Bermula dalam {seconds} saat…',
  'download.started': 'Muat turun bermula — semak muat turun pelayar anda.',
  'download.rights': 'Muat turun hanya fail ROM yang anda sah berhak gunakan.',
  'download.disclaimer':
    'Penafian: semua fail ROM di halaman ini dikumpulkan daripada pihak ketiga dan hanya untuk tujuan pembelajaran peribadi dan sandaran. Semua hak cipta milik penerbit asal masing-masing; jika ada kandungan yang melanggar hak anda, sila hubungi kami untuk pemadaman.',

  /* 房间页那条 `?id=` 深链 */
  'deepLink.notFound': 'Permainan itu tidak ditemui — ia mungkin telah dibuang.',
  'deepLink.title': 'Memuatkan permainan',
  'deepLink.loading': 'Memuat turun ROM…',
  'deepLink.hint': 'Bermula secara automatik setelah muat turun selesai.',
};

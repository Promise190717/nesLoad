/**
 * 泰语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再塞一张进来谁都翻不动。理由和 `lib/legal.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致**，`zh` / `ja` / `ko` 同理。
 *    改文案时先改 `en`，再回来对齐另外几份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的泰文在数据库里
 *    （`game_texts` 的 `th` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` /
 *    `{seconds}` …），它们由 `translate()` 在运行时替换；漏掉一个不会报错，
 *    只会在页面上少一段字。泰语语序和英语不同，占位符可以挪位置，但不能改名、不能填死。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → เครื่องเล่น；developer → ผู้พัฒนา；series → ซีรีส์
 *   · cartridge → ตลับ；room → ห้อง；host → โฮสต์；guest → เกสต์
 *   · netplay → เล่นผ่านเน็ต；save → เซฟ；key bindings → ตั้งค่าปุ่ม
 *   · game library → คลังเกม；guestbook → สมุดฝากข้อความ
 *
 * ⚠️ 机种名用**泰语玩家的通行写法**（一般直接用拉丁字母）：NES / SNES / Game Boy / GBC /
 *    GBA / NDS / Mega Drive / Game Gear / Master System / 32X / WonderSwan /
 *    Neo Geo Pocket / PlayStation / Arcade。标签位上取的是
 *    `lib/consoles.ts` 的 `consoleLabel(type, locale)`，和文案同源，别在这里另写一套。
 *
 * ⚠️ 泰语不空格分词，但**词与词之间的空格仍然要留**（尤其 `{count}` / `{name}` 这类
 *    占位符前后），否则替换成数字或游戏名之后会黏成一串。
 *
 * ⚠️ 泰语不用句末句号，所以 `user.consentAfter` 是**空串**（英文那边是 `.`）——
 *    那不是漏翻，别再补一个 `.` 上去。
 */

import type { MessageKey } from './i18n';

export const th: Record<MessageKey, string> = {
  'meta.title': '{site} — เล่นเกมย้อนยุคในเบราว์เซอร์: NES, SNES, GBA และ Arcade',
  'meta.description':
    'เล่นเกม NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive และเกม Arcade ได้ในเบราว์เซอร์ เลือกเกมจากคลังออนไลน์ หรือโหลดไฟล์ ROM ของคุณเอง',
  'meta.keywords':
    'เกมย้อนยุค, คลังเกมย้อนยุคออนไลน์, โปรแกรมจำลอง NES, โปรแกรมจำลอง SNES, โปรแกรมจำลอง SFC, โปรแกรมจำลอง GBA, โปรแกรมจำลอง Game Boy Advance, โปรแกรมจำลอง Game Boy, โปรแกรมจำลอง Game Boy Color, โปรแกรมจำลอง NDS, โปรแกรมจำลอง Nintendo DS, โปรแกรมจำลอง Sega Mega Drive, โปรแกรมจำลอง Sega Genesis, โปรแกรมจำลอง Game Gear, โปรแกรมจำลอง Master System, โปรแกรมจำลอง Sega 32X, โปรแกรมจำลอง WonderSwan, โปรแกรมจำลอง Neo Geo Pocket, โปรแกรมจำลอง PlayStation, โปรแกรมจำลอง PS1, โปรแกรมจำลอง PSX, โปรแกรมจำลอง Arcade, เล่น NES ในเบราว์เซอร์, โปรแกรมจำลองในเบราว์เซอร์, RetroArch WASM, {site}',
  'seo.room.title': 'ห้องพิกเซล — เล่นเกมย้อนยุคในเบราว์เซอร์',
  'seo.room.description':
    'เข้ามาในห้องพิกเซล: เกม NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive และ Arcade วิ่งอยู่บนจอ CRT เลือกเกมจากคลังออนไลน์ หรือลากไฟล์ ROM ของคุณเองมาวางบนหน้าจอ',
  'seo.login.title': 'เข้าสู่ระบบ',
  'seo.login.description':
    'เข้าสู่ระบบเพื่อซิงก์เซฟ ประวัติการเล่น และรายการโปรดข้ามอุปกรณ์',
  'home.hero.title': 'เล่นเกมย้อนยุคสุดคลาสสิกในเบราว์เซอร์',
  'home.hero.lead':
    '{site} มีเกม NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade และอื่น ๆ ให้เล่นออนไลน์ พร้อมเล่นสองคนผ่านเน็ต',
  'home.hero.play': 'โหลด ROM จากเครื่อง',
  'home.hero.browse': 'ดูเกมทั้งหมด',
  'home.join.title': 'เล่นกับเพื่อน',
  'home.join.hint': 'ใส่รหัสห้อง 4 ตัวอักษรที่เพื่อนส่งมาให้',
  'home.join.submit': 'เข้าห้อง',
  'home.hero.or': 'หรือ',
  'home.search.label': 'ค้นหาในคลังเกม',
  'home.search.placeholder': 'ค้นหาชื่อเกม / ผู้พัฒนา / ซีรีส์',
  'home.search.submit': 'ค้นหา',
  'home.consoles.title': 'เลือกตามเครื่องเล่น',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade และอื่น ๆ — เลือกเครื่องเพื่อดูเกมของเครื่องนั้น',
  'home.consoles.count': '{count} เกม',
  'home.consoles.all': 'ทุกเครื่อง',
  'home.latest.title': 'เกมใหม่ล่าสุด',
  'home.latest.lead': 'เกมที่เพิ่งเพิ่มเข้ามาล่าสุด',
  'home.latest.viewAll': 'เกมทั้งหมด',
  'home.developers.title': 'เลือกตามผู้พัฒนา',
  'home.developers.lead': 'สตูดิโอที่มีเกมในเว็บนี้มากที่สุด',
  'home.developers.viewAll': 'ผู้พัฒนาทั้งหมด',
  'home.empty':
    'ตอนนี้คลังยังว่างอยู่ — เปิดห้องแล้วลาก ROM มาวางบนจอ CRT เพื่อเริ่มเล่น',
  'home.faq.title': 'คำถามที่พบบ่อย',
  'home.faq.q1': 'เล่นฟรีไหม?',
  'home.faq.a1':
    'ฟรีทั้งหมด — ทุกเกมเล่นได้เลย เข้าสู่ระบบเพื่อเก็บประวัติการเล่นและไฟล์เซฟไว้บนคลาวด์',
  'home.faq.q2': 'ต้องติดตั้งอะไรไหม?',
  'home.faq.a2': 'ไม่ต้อง — คลิกที่เกมแล้วเล่นได้เลยในเบราว์เซอร์',
  'home.faq.q3': 'เล่นบนมือถือหรือแท็บเล็ตได้ไหม?',
  'home.faq.a3': 'ได้ — เล่นได้เลยในเบราว์เซอร์บนมือถือและแท็บเล็ต',
  'home.faq.q4': 'ดาวน์โหลดไฟล์ ROM ได้ไหม?',
  'home.faq.a4':
    'ได้ — ทุกหน้าเกมมีปุ่มดาวน์โหลด ดาวน์โหลดเฉพาะไฟล์ ROM ที่คุณมีสิทธิ์ใช้เท่านั้น',
  'home.faq.q5': 'เล่นกับเพื่อนได้ไหม?',
  'home.faq.a5': 'ได้แน่นอน! ชวนเพื่อนมาเปิดห้องแล้วเล่นด้วยกันได้เลย',
  'home.faq.q6': 'รองรับจอยเกมไหม?',
  'home.faq.a6':
    'รองรับ — เสียบจอย USB หรือ Bluetooth แล้วโปรแกรมจำลองจะมองเห็นผ่านเบราว์เซอร์ การตั้งค่าปุ่มใช้ค่าเริ่มต้นของแต่ละคอร์ บนมือถือใช้ปุ่มบนหน้าจอ',
  'seo.heading': 'เล่นเกมย้อนยุคในเบราว์เซอร์',
  'seo.intro':
    '{site} คือห้องเกมย้อนยุคออนไลน์ เกม NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive และ Arcade รันอยู่ตรงนี้ในเบราว์เซอร์ — จำลองบนเครื่องของคุณเอง ด้วย RetroArch ที่คอมไพล์เป็น WebAssembly',
  'seo.howTo':
    'เลือกเกมจากคลังออนไลน์ หรือลากไฟล์ ROM ของคุณเองมาวางบนโทรทัศน์ ไม่ต้องติดตั้งอะไร',
  'seo.games.title': 'เกมทั้งหมด — เล่น NES, SNES, GBA และ Arcade ออนไลน์',
  'seo.games.description':
    'มีเกมย้อนยุค {count} เกมในคลังออนไลน์ เล่นได้ทั้งหมดในเบราว์เซอร์: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade และอื่น ๆ เปิดเกมเพื่อดูรายละเอียด เล่นได้ทันที หรือดาวน์โหลดไฟล์ ROM',
  'seo.games.search.title': 'ผลการค้นหา “{keyword}”',
  'seo.games.search.description':
    'มีเกม {count} เกมในคลังออนไลน์ที่ตรงกับ “{keyword}” เล่นในเบราว์เซอร์หรือดาวน์โหลดไฟล์ ROM ได้',
  'seo.games.console.title': 'เกม {console} — เล่นออนไลน์ในเบราว์เซอร์',
  'seo.games.console.description':
    'มีเกม {console} {count} เกมในคลังออนไลน์ เล่นได้ทั้งหมดในเบราว์เซอร์ หรือดาวน์โหลดเป็นไฟล์ ROM',
  'seo.game.title': '{title} — เล่น {console} ออนไลน์',
  'seo.game.description':
    'เล่น {title} ({console}) ได้เลยในเบราว์เซอร์ — ฟรี ไม่ต้องติดตั้ง และดาวน์โหลดไฟล์ ROM ได้ด้วย',
  'seo.gameDownload.title': 'ดาวน์โหลด ROM ของ {title} ({console})',
  'seo.gameDownload.description':
    'ดาวน์โหลดไฟล์ ROM ของ {title} ({console}) ได้ในคลิกเดียว ไม่ต้องสมัครสมาชิก และยังเล่นในเบราว์เซอร์ได้ด้วย',
  'seo.developers.title': 'ผู้พัฒนาเกม — เล่นเกม NES, SNES, GBA และ Arcade ของพวกเขา',
  'seo.developers.description':
    'มีผู้พัฒนา {count} รายที่อยู่เบื้องหลังเกมในคลังออนไลน์ เปิดรายชื่อเพื่อดูเกมทั้งหมดจากสตูดิโอนั้น',
  'seo.developer.title': '{name} — เกมจากผู้พัฒนารายนี้',
  'seo.developer.description':
    'เกม {name} ทุกเกมในคลังออนไลน์ ({count}) เล่นได้ในเบราว์เซอร์หรือดาวน์โหลดเป็นไฟล์ ROM',
  'seo.consoles.title': 'เลือกตามเครื่องเล่น — เล่นเกม NES, SNES, GBA และ Arcade ออนไลน์',
  'seo.consoles.description':
    'ทุกเครื่องเล่นในคลังออนไลน์ (รวม {count} เกม) เลือกเครื่องเพื่อดูเกมทั้งหมด เล่นได้ในเบราว์เซอร์',
  'seo.console.title': 'เกม {name} — เล่นออนไลน์',
  'seo.console.description':
    'เกม {name} ทุกเกมในคลังออนไลน์ ({count}) เล่นได้ในเบราว์เซอร์หรือดาวน์โหลดเป็นไฟล์ ROM',

  'theme.toDark': 'สลับเป็นโหมดกลางคืน',
  'theme.toLight': 'สลับเป็นโหมดกลางวัน',
  'lamp.turnOn': 'เปิดโคมไฟ',
  'lamp.turnOff': 'ปิดโคมไฟ',
  'simple.enter': 'โหมดเรียบง่าย: เหลือไว้แค่ผนัง โทรทัศน์ โต๊ะ และพื้น',
  'simple.exit': 'ออกจากโหมดเรียบง่าย',
  'tvSize.open': 'ขนาดโทรทัศน์',
  'tvSize.opt.large': 'ใหญ่',
  'tvSize.opt.medium': 'กลาง',
  'tvSize.opt.small': 'เล็ก',
  'tvSize.pick': 'ตั้งขนาดโทรทัศน์เป็น {level}',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'ภาษา',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟**当前页面语言**，只有那颗钮跟**目标语言**（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'หน้านี้เป็นภาษาไทย',
  'localePrompt.body': 'เบราว์เซอร์ของคุณต้องการภาษาอื่น ต้องการสลับไหม?',
  'localePrompt.keep': 'อยู่ในภาษาไทยต่อ',
  'fullscreen.enter': 'ขยายหน้าจอเกมเป็นเต็มจอ',
  'fullscreen.exit': 'ออกจากโหมดเต็มจอ',

  /*
   * 屏幕上的提示。泰语没有大小写，所以英文那几条全大写的不跟；
   * 字数也压短 —— 屏幕本身不大，字越大越糊。
   */
  'screen.pick': 'คลิกเพื่อเลือกไฟล์ ROM หรือวางไฟล์ที่นี่',
  'screen.srLabel': 'เลือกไฟล์ ROM ที่จะรัน',
  'screen.tapLoad': 'คลิกเพื่อโหลด ROM จากเครื่อง',
  'screen.orLibrary': 'หรือเปิดจากคลังเกมออนไลน์',
  'screen.release': 'ปล่อยเพื่อโหลด',
  'screen.mobileLibrary': 'เปิดจากคลังเกม',
  'screen.mobileTap': 'แตะหน้าจอเพื่อเปิดคลังเกม',
  'screen.waitingHost': 'กำลังรอโฮสต์',
  'screen.paused': 'หยุดชั่วคราว',
  'screen.resumeOnPanel': 'กดเล่นต่อบนแผงเครื่อง',
  'screen.resumeInPanel': 'กดเล่นต่อในแผงด้านขวา',
  'screen.waitHostResume': 'กำลังรอโฮสต์เล่นต่อ',

  /* 机身面板那排钮 */
  'panel.resume': 'เล่นต่อ',
  'panel.pause': 'หยุด',
  'panel.save': 'เซฟ',
  'panel.load': 'โหลด',
  'panel.reset': 'รีเซ็ต',
  'panel.eject': 'ถอดตลับ',
  'volume.down': 'ลดเสียงหนึ่งระดับ',
  'volume.up': 'เพิ่มเสียงหนึ่งระดับ',
  'volume.set': 'ตั้งเสียงเป็นระดับ {level} จาก {max}',

  'saves.title': 'โหลดเซฟ',
  'saves.load': 'โหลด',
  'saves.close': 'ปิด',
  'saves.groupLocal': 'เครื่องนี้',
  'saves.groupCloud': 'คลาวด์ (บัญชี)',
  'saves.deleteCloud': 'ลบเซฟบนคลาวด์นี้',
  'saves.delete': 'ลบ',
  'saves.loginHint':
    'เข้าสู่ระบบเพื่อเก็บเซฟบนคลาวด์ แล้วเล่นต่อได้ทุกอุปกรณ์',
  'saves.login': 'เข้าสู่ระบบ',
  'saves.loading': 'กำลังโหลด…',
  'saves.downloading': 'กำลังดาวน์โหลดเซฟจากคลาวด์…',
  'saves.restoring': 'กำลังกู้คืนเกม…',
  'saves.empty': 'ยังไม่มีเซฟ',

  'library.removeLabel': 'ลบ {name}',

  'legend.moves': 'เคลื่อนที่',
  'legend.open': 'ปุ่มควบคุม',
  'legend.title': 'ปุ่มควบคุม',
  'legend.close': 'ปิด',
  'legend.needZip':
    'รูปแบบ  FBNeo อ่านได้แค่ .zip — ไฟล์นี้ดูเหมือน {ext} ให้แพ็กใหม่หรือหาเวอร์ชัน .zip มาใช้',
  'play.needZip':
    'รูปแบบ  ROM นี้เป็นไฟล์บีบอัด {ext} ที่แตกไม่ได้ — ลองใช้ .zip หรือ ROM ที่ไม่บีบอัด',
  'legend.needDisc':
    'รูปแบบ  อิมเมจแผ่นมักมีหลายไฟล์ (.cue + .bin) เว็บนี้รองรับเฉพาะไฟล์เดียว — หาเวอร์ชัน .pbp / .iso / .chd มาใช้',
  'play.needDisc':
    'รูปแบบ  นี่คืออิมเมจแผ่นแบบหลายไฟล์ (.cue + .bin) ที่นี่รองรับเฉพาะไฟล์เดียว — ลองเวอร์ชัน .pbp / .iso / .chd',
  'legend.needBios':
    'BIOS  เกมนี้ดูเหมือนเกม Neo Geo (KOF, Metal Slug…) ต้องใช้ neogeo.zip — ลากไฟล์นั้นมาวางบนหน้านี้แล้วระบบจะติดตั้งให้ เกม CPS1 / CPS2 ไม่ต้องใช้',
  'legend.gamepad':
    'จอยเกม  เสียบแล้วใช้ได้เลย — อยู่ในห้องด้วยกันทั้งสองฝ่ายก็ใช้ได้คนละจอย',

  'netplay.title': 'เล่นผ่านเน็ต',
  'netplay.open': 'เล่นผ่านเน็ต',
  'netplay.close': 'ปิด',
  'netplay.create': 'สร้างห้อง',
  'netplay.or': 'หรือ',
  'netplay.join': 'เข้าร่วม',
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    'ทั้งสองฝ่ายแค่ต้องเข้าถึงรีเลย์สาธารณะได้ — อยู่ใน LAN เดียวกันเสถียรที่สุด บอกรหัส 4 ตัวอักษรให้อีกฝ่าย โฮสต์เป็นคนรันโปรแกรมจำลองและส่งภาพออกไป เกสต์ไม่ต้องมี ROM',
  'netplay.roomCode': 'รหัสห้อง',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'อินเทอร์เน็ต',
  'netplay.wanDev': 'การเล่นผ่านอินเทอร์เน็ตยังอยู่ระหว่างพัฒนา',
  'netplay.quality': 'คุณภาพภาพ',
  'netplay.qualitySmooth': 'ลื่น',
  'netplay.qualityBalanced': 'สมดุล',
  'netplay.qualitySharp': 'คมชัด',
  'netplay.qualityHint':
    'โฮสต์รันทั้งโปรแกรมจำลองและการส่งภาพบนเครื่องเดียว ถ้าตามไม่ทันเกมทั้งเกมจะช้าลง (สโลว์โมชัน) ถ้าเจอแบบนั้นให้ลดลงหนึ่งระดับ — ค่านี้มีผลกับโฮสต์เท่านั้น',
  'netplay.copy': 'คัดลอก',
  'netplay.copied': 'คัดลอกแล้ว',
  'netplay.share': 'แชร์',
  'netplay.shareCopied': 'คัดลอกลิงก์แล้ว',
  'netplay.inviteTitle': 'คำเชิญเข้าห้อง',
  'netplay.inviteBody': 'เข้าร่วมห้อง {code} ไหม?',
  'netplay.inviteJoin': 'เข้าร่วม',
  'netplay.inviteCancel': 'ยกเลิก',
  'netplay.connected': 'เชื่อมต่อแล้ว',
  'netplay.waiting': 'กำลังรอผู้เล่นอีกคน',
  'netplay.joining': 'กำลังเข้าห้อง…',
  'netplay.waitingGame': 'เชื่อมต่อแล้ว — กำลังรอโฮสต์ใส่ตลับ',
  'netplay.hostPlaying': 'โฮสต์กำลังเล่น',
  'netplay.paused': 'หยุดชั่วคราว',
  'netplay.toastHost': 'เชื่อมต่อแล้ว · อีกฝ่ายเข้ามาแล้ว · คุณคือผู้เล่น 1',
  'netplay.toastGuest': 'เชื่อมต่อกับโฮสต์แล้ว · คุณคือผู้เล่น 2',
  'netplay.toastHostLeft': 'โฮสต์ออกไปแล้ว · ห้องถูกปิด',
  'netplay.toastGuestLeft': 'ผู้เล่น 2 ออกจากห้องแล้ว',
  'netplay.youAreHost':
    'คุณคือผู้เล่น 1 ใส่ตลับแล้วภาพจะถูกส่งให้เกสต์อัตโนมัติ คุณเล่นด้วยชุดปุ่มของตัวเอง — ดูการตั้งค่าปัจจุบันได้ที่ปุ่มควบคุม',
  'netplay.youAreGuest':
    'คุณคือผู้เล่น 2 ไม่ต้องมีตลับ — โฮสต์ส่งภาพมาให้ และอินพุตของคุณจะถูกส่งไปที่โฮสต์ เล่นด้วยชุดปุ่มของตัวเอง (ชุดผู้เล่น 1) หรือจอยเกม — ดูได้ที่ปุ่มควบคุม',
  'netplay.leave': 'ออกจากห้อง',
  'netplay.closeRoom': 'ปิดห้อง',
  'netplay.badCode': 'รหัสนี้ดูไม่ถูกต้อง — ต้องมี 4 ตัวอักษร',
  'netplay.errInsecure':
    'การเล่นผ่านเน็ตต้องใช้ HTTPS หรือ localhost หน้านี้เป็น http ธรรมดา เบราว์เซอร์จึงไม่ให้ใช้ API เข้ารหัสที่ต้องใช้',
  'netplay.errNoDirect':
    'ทั้งสองฝ่ายเข้าถึงรีเลย์ได้ แต่เปิดการเชื่อมต่อตรงไม่ได้ — มักเกิดจาก NAT หรือไฟร์วอลล์ อยู่ใน LAN เดียวกันมีโอกาสสำเร็จสูงสุด',
  'netplay.errPassword': 'รหัสห้องไม่ตรงกัน',
  'netplay.errHandshake': 'แฮนด์เชกหมดเวลา — อีกฝ่ายอาจออกไปแล้ว',
  'netplay.errHostLeft': 'โฮสต์ออกจากห้องแล้ว — ห้องถูกปิด',
  'netplay.errNoRoom':
    'ไม่มีการตอบกลับจากโฮสต์ รหัสห้องอาจไม่ถูกต้อง หรือโฮสต์ยังไม่เปิดห้อง',
  'netplay.errRoomFull': 'ห้องเต็มแล้ว — เกมนี้เล่นได้แบบ 1 ต่อ 1 เท่านั้น',
  'netplay.errUnknown':
    'เชื่อมต่อกับอีกฝ่ายไม่ได้ สาเหตุที่แน่ชัดอยู่ในคอนโซลของเบราว์เซอร์',

  'seo.play.title': 'ห้องเล่นเกม — โหลดเกมแล้วเล่นออนไลน์',
  'seo.play.description':
    'เริ่มเกมได้ในหน้าเดียว: เล่นคนเดียว หรือเปิดห้อง 1 ต่อ 1 แล้วแชร์รหัส รองรับ NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive และ Arcade',
  'play.modeSolo': 'คนเดียว',
  'play.start': 'เริ่ม',
  'play.confirmStart': 'ยืนยันแล้วเริ่ม',
  'play.confirm': 'ยืนยัน',
  'play.qualityIntro': 'เลือกคุณภาพภาพสำหรับเล่นออนไลน์ให้เหมาะกับเน็ตของคุณ',
  'play.qualityHint.smooth': '30 fps · ใช้แบนด์วิดท์น้อย เหมาะกับเน็ตช้า',
  'play.qualityHint.balanced': 'สูงสุด 720p / 60 fps · สมดุลระหว่างความคมชัดและความลื่น',
  'play.qualityHint.sharp':
    'สูงสุด 60 fps · เน้นรายละเอียดที่ความละเอียดดั้งเดิม ต้องใช้เน็ตเร็ว ถ้าเน็ตช้าอัตราเฟรมอาจตก',
  'play.qualityConfirmHint':
    'ยืนยันแล้วจะเชื่อมต่อเข้าห้อง โฮสต์เป็นคนโหลดเกม ส่วนเกสต์จะได้รับภาพจากโฮสต์',
  'play.connecting': 'กำลังเชื่อมต่อ…',
  'play.confirmJoin': 'ยืนยันแล้วเข้าร่วม',
  'play.cancel': 'ยกเลิก',
  'play.screenSize': 'ขนาดหน้าจอ',
  'play.controlsTitle': 'ปุ่มควบคุมเกม',
  'play.netplayKeysHint':
    'เวลาเล่นออนไลน์ แต่ละคนใช้ปุ่มผู้เล่น 1 ของตัวเอง',
  'play.cancelled': 'ยกเลิกการโหลดแล้ว',
  'play.retry': 'โหลดอีกครั้ง',
  'play.retryJoin': 'ลองเข้าร่วมอีกครั้ง',
  'play.saved': 'เซฟเกมแล้ว',
  'play.localSaving': 'กำลังเซฟ…',
  'play.uploading': 'กำลังอัปโหลด…',
  'play.cloudFailed': 'ซิงก์กับคลาวด์ไม่สำเร็จ',
  'play.saveNoLogin': 'เข้าสู่ระบบเพื่อซิงก์',
  'play.tooLarge': 'เซฟใหญ่เกินไป',
  'play.theme': 'ธีม',
  'play.saveFailed': 'เซฟเกมไม่ได้ กรุณาลองอีกครั้ง',
  'play.loadFailed': 'โหลดเซฟไม่ได้ กรุณาลองอีกครั้ง',
  'play.leftRoom': 'คุณออกจากห้องแล้ว',
  'play.latency': 'ความหน่วง',
  'play.measuringLatency': 'กำลังวัด…',
  'play.downloading': 'กำลังดาวน์โหลด ROM…',
  'play.booting': 'กำลังเริ่มคอร์…',
  'play.loadFail': 'ตลับนี้โหลดไม่สำเร็จ',
  'play.romIncomplete': 'ไฟล์ ROM ไม่สมบูรณ์ — กรุณาโหลดใหม่',
  'play.notFound': 'ไม่พบเกมนั้น',
  'play.fullscreen': 'เต็มจอ',
  'play.volume': 'เสียง',
  'play.edit': 'แก้ไข',
  'play.hideSidebar': 'ซ่อนแผง',
  'play.showSidebar': 'แสดงแผง',
  'play.hint': 'กด Esc เพื่อออกจากโหมดเต็มจอ นอกนั้นไม่มีอะไรใช้คีย์บอร์ด',
  'play.leaveTitle': 'กำลังเล่นเกมอยู่',
  'play.leaveBody': 'ถ้ากลับตอนนี้การเล่นจะจบลง — ระบบไม่เซฟความคืบหน้าอัตโนมัติ',
  'play.leaveStay': 'เล่นต่อ',
  'play.leaveGo': 'ออก',
  'gamesPage.playOnline': 'เล่นออนไลน์',

  'keybind.title': 'ตั้งค่าปุ่ม',
  'keybind.open': 'ตั้งค่าปุ่ม',
  'keybind.close': 'ปิด',
  'keybind.p1': 'ผู้เล่น 1',
  'keybind.p2': 'ผู้เล่น 2',
  'keybind.mine': 'ปุ่มของคุณ',
  'keybind.pressKey': 'กดปุ่มใหม่…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'คืนค่าเริ่มต้น',
  'keybind.reload': 'โหลดตลับใหม่',
  'keybind.reloading': 'กำลังโหลดใหม่…',
  'keybind.unsupported': 'ใช้ปุ่มนี้ไม่ได้ — ลองปุ่มอื่น',
  'keybind.conflictSame': '{pressed} ถูกตั้งเป็นปุ่ม {button} อยู่แล้ว — ลองปุ่มอื่น',
  'keybind.conflictOther':
    '{pressed} ถูกตั้งเป็นปุ่ม {button} ของผู้เล่น {player} อยู่แล้ว — ลองปุ่มอื่น',
  'keybind.hint':
    'ระบบอ่านผังคีย์บอร์ดครั้งเดียวตอนใส่ตลับ — ถ้าแก้แล้วต้องโหลดตลับใหม่ ผู้เล่นสองคนใช้ปุ่มเดียวกันไม่ได้',
  'keybind.soloHint':
    'ระบบอ่านผังคีย์บอร์ดครั้งเดียวตอนใส่ตลับ — ถ้าแก้แล้วต้องโหลดตลับใหม่',
  'keybind.hostHint':
    'คุณคือโฮสต์: ผู้เล่น 1 คือปุ่มของคุณ ผู้เล่น 2 คือช่องที่อินพุตของเกสต์ถูกส่งเข้ามา ทั้งสองฝ่ายใช้ปุ่มเดียวกันไม่ได้ ไม่งั้นอินพุตที่ส่งมาจะไปควบคุมผู้เล่น 1 ของคุณด้วย เปลี่ยนแล้วให้โหลดตลับใหม่',
  'keybind.guestHint':
    'คุณคือเกสต์และเล่นด้วยชุดปุ่มของตัวเอง (ชุดผู้เล่น 1) — ต่างคนต่างอยู่หน้าแป้นของตัวเอง จึงชนกันไม่ได้ การเปลี่ยนมีผลทันที ไม่ต้องโหลดตลับใหม่',
  'keybind.guestLocalHint':
    'คุณคือเกสต์ และเครื่องนี้ก็มีตลับของคุณรันอยู่ด้วย ปุ่มของคุณคือชุดผู้เล่น 1 ซึ่งใช้ควบคุมตลับในเครื่องนี้ ดังนั้นแก้แล้วต้องโหลดตลับใหม่ และชุดเดียวกันนี้ยังถูกส่งไปที่โฮสต์ด้วย ซึ่งมีผลทันที',

  'games.open': 'คลังเกม',
  'games.title': 'คลังเกม',
  'games.close': 'ปิด',
  'games.empty': 'คลังว่างอยู่ — ยังไม่มีใครอัปโหลดอะไรเข้ามา',
  'games.loading': 'กำลังโหลด…',
  'games.loadingRom': 'กำลังโหลด {name}…',
  'games.cancel': 'ยกเลิก',
  'games.failed': 'โหลดคลังเกมไม่ได้',
  'games.tabLibrary': 'คลังเกม',
  'games.tabHistory': 'ประวัติ',
  'games.historyEmpty': 'ยังไม่เคยเปิดเกมจากคลัง',
  'games.historyLoad': '{name}\nคลิกเพื่อโหลดอีกครั้ง',
  'games.tabFavorites': 'รายการโปรด',
  'games.favorite': 'เพิ่ม {name} ในรายการโปรด',
  'games.unfavorite': 'เอา {name} ออกจากรายการโปรด',
  'games.favoritesEmpty': 'ยังไม่มีรายการโปรด — แตะดาวบนปกเกมเพื่อเพิ่ม',
  'games.favoritesSignInBefore': 'เข้าสู่ระบบเพื่อเก็บรายการโปรด — ',
  'games.favoritesSignInLink': 'เข้าสู่ระบบ',
  'games.favoritesSignInAfter': ' ที่นี่ หรือใช้ปุ่มบัญชีมุมขวาบน',

  'user.title': 'บัญชี',
  'user.close': 'ปิด',
  'user.open': 'บัญชี — เข้าสู่ระบบ / สมัครสมาชิก',
  'user.openSignedIn': 'บัญชี: {name}',
  'user.tabLogin': 'เข้าสู่ระบบ',
  'user.tabRegister': 'สมัครสมาชิก',
  'user.username': 'ชื่อผู้ใช้',
  'user.password': 'รหัสผ่าน',
  'user.usernameHint': '3–20 ตัวอักษร: ตัวอักษร ตัวเลข _ - .',
  'user.emailLabel': 'อีเมล',
  'user.emailHint': 'ใช้อีเมลของคุณ ห้ามใช้อีเมลแบบ alias หรืออีเมลชั่วคราว',
  'user.passwordHint': 'อย่างน้อย 6 ตัวอักษร ห้ามมีช่องว่าง',
  'user.signIn': 'เข้าสู่ระบบ',
  'user.signUp': 'สมัครสมาชิก',
  'user.signingIn': 'กำลังเข้าสู่ระบบ…',
  'user.signingUp': 'กำลังสมัคร…',
  'user.signOut': 'ออกจากระบบ',
  'user.signedInAs': 'เข้าสู่ระบบในชื่อ {name}',
  'user.cloudHint':
    'ประวัติการเล่น เซฟ และรายการโปรดจะถูกเก็บไว้ในบัญชีของคุณ — เปิดเกมจากคลังออนไลน์แล้วจะซิงก์ให้อัตโนมัติ',
  'user.formLead':
    'เข้าสู่ระบบแล้วเซฟ ประวัติการเล่น และรายการโปรดจะถูกเก็บบนคลาวด์ — เล่นได้ทุกที่ทุกเวลา!',
  'user.consentLogin': 'การเข้าสู่ระบบถือว่าคุณยอมรับ ',
  'user.consentRegister': 'การสร้างบัญชีถือว่าคุณยอมรับ ',
  'user.consentMiddle': ' และ ',
  /* 泰语不用句末句号 —— 空串是刻意的（见文件头注释） */
  'user.consentAfter': '',
  'user.error.failed': 'เกิดข้อผิดพลาด — ลองอีกครั้ง',
  'user.error.missingCredentials': 'กรอกชื่อผู้ใช้และรหัสผ่าน',
  'user.error.usernameInvalid': 'ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษร ตัวเลข _ - และ .',
  'user.error.usernameTooShort': 'ชื่อผู้ใช้สั้นเกินไป (อย่างน้อย 3 ตัวอักษร)',
  'user.error.usernameTooLong': 'ชื่อผู้ใช้ยาวเกินไป (ไม่เกิน 20 ตัวอักษร)',
  'user.error.usernameTaken': 'ชื่อผู้ใช้นี้มีคนใช้แล้ว — เลือกชื่ออื่น',
  'user.error.emailInvalid': 'กรอกอีเมลที่ถูกต้อง',
  'user.error.emailAlias':
    'ไม่รองรับอีเมลแบบ alias (เช่น name+tag@… หรือ Gmail ที่มีจุด)',
  'user.error.emailTemp':
    'ไม่รองรับอีเมลชั่วคราว — กรุณาใช้อีเมลปกติของคุณ',
  'user.error.passwordInvalid': 'กรอกรหัสผ่าน',
  'user.error.passwordTooShort': 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)',
  'user.error.passwordTooLong': 'รหัสผ่านยาวเกินไป (ไม่เกิน 72 ตัวอักษร)',
  'user.error.passwordHasSpace': 'รหัสผ่านห้ามมีช่องว่าง',
  'user.error.invalidCredentials': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  'user.error.banned': 'บัญชีนี้ถูกระงับการใช้งาน',
  'user.error.captchaRequired': 'กรุณายืนยันว่าเป็นมนุษย์ก่อน',
  'user.error.captchaFailed': 'ยืนยันว่าเป็นมนุษย์ไม่สำเร็จ — ลองอีกครั้ง',
  'login.lead':
    'เข้าสู่ระบบแล้วเซฟ ประวัติการเล่น และรายการโปรดจะถูกเก็บบนคลาวด์ — เล่นได้ทุกที่ทุกเวลา ยังไม่มีบัญชี? สมัครได้เลย',

  'account.title': 'บัญชีของฉัน',
  'account.loading': 'กำลังโหลด…',
  'account.failed': 'เกิดข้อผิดพลาด — ลองอีกครั้ง',
  'account.since': 'สมาชิกตั้งแต่ {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'ทั่วไป',
  'account.vipUntil': 'VIP ถึง {time}',
  'account.vipExpired': 'VIP หมดอายุเมื่อ {time}',
  'account.tabFavorites': 'รายการโปรด',
  'account.tabHistory': 'ประวัติ',
  'account.tabSaves': 'เซฟเกม',
  'account.tabProfile': 'โปรไฟล์',
  'account.tabPassword': 'รหัสผ่าน',
  'account.favoritesLoading': 'กำลังโหลดรายการโปรด…',
  'account.historyLoading': 'กำลังโหลดประวัติ…',
  'account.savesLoading': 'กำลังโหลดเซฟ…',
  'account.favoritesEmpty':
    'ยังไม่มีรายการโปรด — เปิดคลังเกมในห้องแล้วแตะดาวบนปกเกม',
  'account.unfavorite': 'เอา {name} ออกจากรายการโปรด',
  'account.historyEmpty':
    'ยังไม่มีประวัติการเล่น — เกมที่เปิดจากคลังออนไลน์จะมาแสดงที่นี่',
  'account.historyCount': 'เล่นล่าสุด {count} เกม',
  'account.historyDeleted': 'ลบออกจากประวัติแล้ว',
  'account.clearHistory': 'ลบทั้งหมด',
  'account.confirmClearHistory': 'ลบทั้งหมดจริงหรือ?',
  'account.historyCleared': 'ลบประวัติแล้ว',
  'account.historyHint':
    'ประวัติจะเก็บ {max} เกมที่เล่นล่าสุด — เล่นเกมเก่าอีกครั้งจะถูกดันกลับขึ้นบนสุด',
  'account.savesEmpty': 'ยังไม่มีเซฟบนคลาวด์',
  'account.savesCount': 'เซฟทั้งหมด {count} รายการ',
  'account.savesGroupCount': '{count} เซฟ',
  'account.viewGame': 'ดู {name}',
  'account.savesHint':
    'หนึ่งเกมมีเซฟเดียว — เซฟอีกครั้งจะเขียนทับ ทั้งในเครื่องและบนคลาวด์เป็นแบบเดียวกัน',
  'account.saveDeleted': 'ลบเซฟแล้ว',
  'account.clearSaves': 'ลบทั้งหมด',
  'account.confirmClearSaves': 'ลบทั้งหมดจริงหรือ?',
  'account.savesCleared': 'ลบเซฟ {count} รายการแล้ว',
  'account.delete': 'ลบ',
  'account.confirmDelete': 'ลบจริงหรือ?',
  'account.avatar': 'รูปโปรไฟล์',
  'account.chooseImage': 'เลือกรูป',
  'account.clearAvatar': 'เอารูปออก',
  'account.uploading': 'กำลังอัปโหลด…',
  'account.avatarSaved': 'อัปเดตรูปโปรไฟล์แล้ว',
  'account.avatarCleared': 'เอารูปโปรไฟล์ออกแล้ว',
  'account.avatarHint': 'PNG / JPEG / WebP / GIF ไม่เกิน 2 MB',
  'account.gender': 'เพศ',
  'account.genderNone': 'ไม่ระบุ',
  'account.genderMale': 'ชาย',
  'account.genderFemale': 'หญิง',
  'account.genderSaved': 'บันทึกแล้ว',
  'account.genderHint': 'ไม่บังคับ — มีแค่คุณที่เห็น',
  'account.passwordTabHint': 'เปลี่ยนแล้วคุณยังอยู่ในระบบบนเครื่องนี้ — ไม่ต้องเข้าสู่ระบบใหม่',
  'account.password': 'รหัสผ่าน',
  'account.oldPassword': 'รหัสผ่านปัจจุบัน',
  'account.newPassword': 'รหัสผ่านใหม่',
  'account.confirmPassword': 'รหัสผ่านใหม่อีกครั้ง',
  'account.savePassword': 'เปลี่ยนรหัสผ่าน',
  'account.saving': 'กำลังบันทึก…',
  'account.passwordSaved': 'เปลี่ยนรหัสผ่านแล้ว',
  'account.passwordHint':
    'เปลี่ยนแล้วคุณยังอยู่ในระบบบนเครื่องนี้ ส่วนเครื่องอื่นที่ล็อกอินอยู่จะใช้ได้จนกว่าเซสชันจะหมดอายุ',
  'account.error.missingOld': 'กรอกรหัสผ่านปัจจุบัน',
  'account.error.wrongPassword': 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
  'account.error.passwordTooShort': 'รหัสผ่านใหม่สั้นเกินไป (อย่างน้อย 6 ตัวอักษร)',
  'account.error.passwordTooLong': 'รหัสผ่านใหม่ยาวเกินไป (ไม่เกิน 72 ตัวอักษร)',
  'account.error.passwordHasSpace': 'รหัสผ่านใหม่ห้ามมีช่องว่าง',
  'account.error.mismatch': 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน',
  'account.error.avatarMissing': 'เลือกรูปก่อน',
  'account.error.avatarTooLarge': 'รูปนี้ใหญ่เกินไป (ไม่เกิน 2 MB)',
  'account.error.avatarType': 'ไม่รองรับรูปแบบนี้ — ใช้ PNG / JPEG / WebP / GIF',

  'games.filterAll': 'ทั้งหมด',
  'games.searchPlaceholder': 'ค้นหาชื่อเกม / ผู้พัฒนา / ซีรีส์',
  'games.search': 'ค้นหา',
  'games.noMatch': 'ไม่พบเกมที่ตรงกัน',
  'games.prev': 'ก่อนหน้า',
  'games.next': 'ถัดไป',
  /*
   * 在线库的加载速度提示。**泰语同样是空串** —— 那句话是说给「文件在境外」的读者听的，
   * 泰语界面下的读者多半就在境外，这条既没用又显得莫名其妙（理由与英文那份相同）。
   */
  'games.remoteSlow': '',

  'note.text': 'ขอให้เราได้พบความสนุกแบบตอนเด็ก ๆ อีกครั้ง.. \n ยังมีของลับรออยู่นะ!',
  'note.open': 'อ่านกระดาษบนพื้น',
  'note.title': 'กระดาษแผ่นหนึ่ง',
  'note.close': 'ปิด',
  'window.cycle': 'เปลี่ยนฤดูกาลนอกหน้าต่าง',
  'painting.open': 'เข้าไปดูภาพวาดใกล้ ๆ',
  'painting.close': 'ปิด',
  'painting.title.sunflowers': 'ทานตะวัน',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'โมนาลิซา',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'ราตรีประดับดาว',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'เสียงกรีดร้อง',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'สาวใส่ต่างหูมุก',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'คลื่นยักษ์นอกฝั่งคานางาวะ',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'ภาพวาดไร้นามจากที่ไหนสักแห่ง',
  'painting.artist.unknown': 'ไม่ทราบผู้วาด',
  'mp4.play': 'เล่นเพลงบนเครื่องเล่น MP4',
  'mp4.pause': 'หยุดเครื่องเล่น MP4',
  'cat.wand': 'แกว่งไม้ตกแมวบนพื้น',
  'cat.ragdoll': 'แมวแร็กดอลล์โผล่พ้นหลังกองหนังสือ',
  'cat.siamese': 'แมวสยามโผล่พ้นหลังกองหนังสือ',
  'cat.tabby': 'แมวลายสลิดโผล่พ้นหลังกองหนังสือ',
  'cat.orange': 'แมวส้มโผล่พ้นหลังกองหนังสือ',
  'cat.american': 'แมวอเมริกันช็อตแฮร์โผล่พ้นหลังกองหนังสือ',
  'cat.tuxedo': 'แมวทักซิโดโผล่พ้นหลังกองหนังสือ',
  'cat.calico': 'แมวสามสีโผล่พ้นหลังกองหนังสือ',

  'feedback.open': 'เปิดสมุดฝากข้อความบนพื้น',
  'feedback.title': 'สมุดฝากข้อความ',
  'feedback.close': 'ปิด',
  'feedback.placeholder': 'ฝากอะไรไว้หน่อย — ข้อเสนอแนะ หรือเกมที่อยากให้เพิ่ม…',
  'feedback.submit': 'ส่ง',
  'feedback.submitting': 'กำลังส่ง…',
  'feedback.ok': 'ส่งแล้ว ขอบคุณมาก!',
  'feedback.required': 'เขียนอะไรก่อน',
  'feedback.failed': 'ส่งไม่ได้ — ลองอีกครั้ง',
  'feedback.loading': 'กำลังโหลด…',
  'feedback.empty': 'ยังไม่มีข้อความ — มาเป็นคนแรกกัน',
  'feedback.retry': 'ลองอีกครั้ง',
  'feedback.prev': 'ก่อนหน้า',
  'feedback.next': 'ถัดไป',
  'feedback.page': 'หน้า {n}',
  'feedback.resolved': 'จัดการแล้ว',
  'feedback.unresolved': 'ยังไม่จัดการ',

  'legal.privacy': 'นโยบายความเป็นส่วนตัว',
  'legal.terms': 'ข้อกำหนดการใช้งาน',
  'legal.updated': 'อัปเดตล่าสุด {date}',
  'legal.contact': 'ติดต่อเรา:',

  'tour.title': 'แนะนำการใช้งาน',
  'tour.skip': 'ข้าม',
  'tour.back': 'ย้อนกลับ',
  'tour.next': 'ถัดไป',
  'tour.done': 'เริ่มเล่น',
  'tour.replay': 'ดูคำแนะนำอีกครั้ง',
  'tour.screen.title': 'เริ่มจากเกมสักหนึ่งเกม',
  'tour.screen.body':
    'ลากไฟล์ ROM (.nes, .sfc, .gba, .md, .gb …) หรือไฟล์ .zip ของเกม Arcade มาวางบนโทรทัศน์ หรือคลิกที่หน้าจอเพื่อเลือกไฟล์',
  'tour.rail.title': 'แถวสวิตช์ด้านขวา',
  'tour.rail.body':
    'มีสามกลุ่มจากบนลงล่าง กลุ่มรูปลักษณ์: ธีม (กลางคืน / กลางวัน), ภาษา (中文 / English / 日本語 / 한국어 / ไทย), เต็มจอ (ตัวหน้าจอเองที่ขยายเต็มจอ), โหมดเรียบง่าย (เหลือแค่ผนัง โทรทัศน์ โต๊ะ และพื้น), ขนาดโทรทัศน์ (ใหญ่ / กลาง / เล็ก โต๊ะขยายตามไปด้วย) กลุ่มเกม: เล่นผ่านเน็ต, ตั้งค่าปุ่ม กลุ่มช่วยเหลือ: ปุ่มควบคุม และสมุดฝากข้อความ',

  'topLinks.label': 'หน้าในเว็บ',
  'topLinks.games': 'รายการเกม',
  'menu.open': 'เปิดเมนู',
  'menu.close': 'ปิดเมนู',
  'menu.theme': 'ธีม',
  'menu.simple': 'โหมดเรียบง่าย',

  'leave.title': 'ออกจากหน้านี้ไหม?',
  'leave.bodyGame': 'เกมที่กำลังเล่นจะถูกขัดจังหวะ — ความคืบหน้าจะไม่ถูกบันทึก',
  'leave.bodyNetplay': 'คุณจะออกจากห้องเล่นผ่านเน็ต และอีกฝ่ายจะถูกตัดการเชื่อมต่อ',
  'leave.stay': 'อยู่ต่อ',
  'leave.confirm': 'ออก',

  'gamesPage.heading': 'เกมทั้งหมด',
  'gamesPage.intro':
    'มีเกม {count} เกมในคลังออนไลน์ — NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade และอื่น ๆ คลิกที่ปกเพื่อดูรายละเอียด หรือเริ่มเล่นได้เลย',
  'gamesPage.empty': 'ตอนนี้คลังยังว่างอยู่',
  'gamesPage.introConsole':
    'มีเกม {console} {count} เกมในคลัง คลิกที่ปกเพื่อดูรายละเอียด หรือเริ่มเล่นได้เลย',
  'gamesPage.filterLabel': 'กรองตามเครื่องเล่น',
  'gamesPage.filterAll': 'ทั้งหมด',
  'gamesPage.consoleEmpty': 'ยังไม่มีเกม {console} ในคลัง',
  'gamesPage.searchLabel': 'ค้นหาในคลังเกม',
  'gamesPage.searchPlaceholder': 'ค้นหาชื่อเกม / ผู้พัฒนา / ซีรีส์',
  'gamesPage.searchSubmit': 'ค้นหา',
  'gamesPage.searchLoading': 'กำลังค้นหา…',
  'gamesPage.searchClear': 'ล้างการค้นหา',
  'gamesPage.searchResults': '“{keyword}” — พบเกมที่ตรงกัน {count} เกม',
  'gamesPage.searchEmpty':
    'ไม่พบเกมที่ตรงกับ “{keyword}” ลองใช้คำสั้นลง หรือใช้ชื่อเกม',
  'gamesPage.prev': 'ก่อนหน้า',
  'gamesPage.next': 'ถัดไป',
  'gamesPage.backHome': 'กลับไปที่หน้าแรก',
  'gamesPage.backToGames': 'เกมทั้งหมด',
  'common.back': 'ย้อนกลับ',
  'common.home': 'หน้าแรก',
  'gamesPage.play': 'เล่นเลย',
  'gamesPage.download': 'ดาวน์โหลด ROM',
  'gamesPage.share': 'แชร์เกมนี้',
  'gamesPage.shareCopied': 'คัดลอกลิงก์แล้ว',
  'gamesPage.shareFailed': 'คัดลอกไม่สำเร็จ',
  'gamesPage.favorite': 'เพิ่มในรายการโปรด',
  'gamesPage.unfavorite': 'นำออกจากรายการโปรด',
  'gamesPage.favoriteSignIn':
    'ต้องเข้าสู่ระบบเพื่อเก็บรายการโปรด — ใช้ปุ่มเข้าสู่ระบบบนแถบด้านบน',
  'gamesPage.favoriteFailed': 'อัปเดตรายการโปรดไม่ได้ — ลองอีกครั้ง',
  'gamesPage.favoriteCount': '{n} คนในรายการโปรด',
  'gamesPage.report': 'รายงานปัญหา',
  'gamesPage.reportTitle': 'รายงานปัญหา',
  'gamesPage.reportSubject': 'เกี่ยวกับ: {name}',
  'gamesPage.reportPlaceholder':
    'เจอปัญหาอะไร? เช่น เปิดไม่ติด ภาพเพี้ยน ไม่มีเสียง…',
  'gamesPage.reportSubmit': 'ส่งรายงาน',
  'gamesPage.reportSubmitting': 'กำลังส่ง…',
  'gamesPage.reportOk': 'ได้รับแล้ว ขอบคุณมาก!',
  'gamesPage.reportRequired': 'เขียนอธิบายปัญหาก่อน',
  'gamesPage.reportFailed': 'ส่งไม่ได้ — ลองอีกครั้ง',
  'gamesPage.reportClose': 'ยกเลิก',

  'comments.heading': 'ความคิดเห็น',
  'comments.count': '{n} ความคิดเห็น',
  'comments.empty': 'ยังไม่มีความคิดเห็น — มาเป็นคนแรกกัน',
  'comments.placeholder': 'คิดยังไงกับเกมนี้บ้าง?',
  'comments.ratingLabel': 'คะแนนของคุณ',
  'comments.ratingStar': 'ให้ {n} จาก 5 ดาว',
  'comments.ratingValue': '{n} จาก 5 ดาว',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'เลือกจำนวนดาวก่อน',
  'comments.submit': 'ส่งความคิดเห็น',
  'comments.submitting': 'กำลังส่ง…',
  'comments.ok': 'ส่งแล้ว — อยู่บนสุดของรายการ',
  'comments.required': 'เขียนอะไรก่อนแล้วค่อยส่ง',
  'comments.failed': 'ส่งไม่ได้ — ลองอีกครั้ง',
  'comments.signInLead': 'ต้องเข้าสู่ระบบก่อนจึงจะแสดงความคิดเห็นได้',
  'comments.signIn': 'เข้าสู่ระบบ',
  'comments.signInRequired': 'กรุณาเข้าสู่ระบบอีกครั้งเพื่อส่งความคิดเห็น',
  'comments.loading': 'กำลังโหลดความคิดเห็น…',
  'comments.retry': 'ลองอีกครั้ง',
  'comments.loadFailed': 'โหลดความคิดเห็นไม่ได้',
  'comments.loadMore': 'ดูเพิ่มเติม',
  'comments.delete': 'ลบ',
  'comments.deleteConfirm': 'ยืนยันลบ',
  'comments.cancel': 'ยกเลิก',
  'comments.deleted': 'ลบความคิดเห็นแล้ว',
  'comments.deleteFailed': 'ลบไม่ได้ — ลองอีกครั้ง',

  'gamesPage.field.console': 'เครื่องเล่น',
  'gamesPage.field.year': 'ปีที่ออก',
  'gamesPage.field.developer': 'ผู้พัฒนา',
  'gamesPage.field.series': 'ซีรีส์',
  'gamesPage.field.language': 'ภาษา',
  'gamesPage.controls': 'วิธีเล่น',
  'gamesPage.selectLanguage': 'เลือกภาษา',

  'notFound.title': 'ไม่พบหน้านี้',
  'notFound.description':
    'ที่อยู่นี้ไม่มีอยู่ใน {site} ตรวจสอบลิงก์หรือกลับไปที่หน้าแรก',
  'gamesPage.notFoundTitle': 'ไม่พบเกม',
  'gamesPage.notFound': 'เกมนี้ไม่อยู่ในคลังแล้ว (อาจถูกลบไปแล้ว)',
  'gamesPage.fallbackDescription': '{title} เป็นเกมของ {console}',

  'developersPage.heading': 'ผู้พัฒนา',
  'developersPage.intro':
    'มีผู้พัฒนา {count} รายที่อยู่เบื้องหลังเกมในคลัง เปิดรายชื่อเพื่อดูเกมทั้งหมดจากสตูดิโอนั้น',
  'developersPage.empty': 'ยังไม่มีผู้พัฒนาในระบบ',
  'developersPage.gameCount': '{count} เกม',
  'developersPage.gamesHeading': 'เกมจาก {name}',
  'developersPage.gamesEmpty': 'ยังไม่มีเกมจากผู้พัฒนารายนี้ในคลัง',
  'developersPage.field.founded': 'ก่อตั้งปี',
  'developersPage.backToDevelopers': 'ผู้พัฒนาทั้งหมด',
  'developersPage.notFoundTitle': 'ไม่พบผู้พัฒนา',
  'developersPage.notFound': 'ผู้พัฒนารายนี้ไม่อยู่ในคลังแล้ว (อาจถูกลบไปแล้ว)',

  'consolesPage.heading': 'เครื่องเล่น',
  'consolesPage.intro':
    'เครื่องเล่นทั้งหมดในคลัง — รวม {count} เกม เปิดเครื่องเพื่อดูเกมทั้งหมดของเครื่องนั้น',
  'consolesPage.gameCount': '{count} เกม',
  'consolesPage.gamesHeading': 'เกมบน {name}',
  'consolesPage.gamesEmpty': 'ยังไม่มีเกมของเครื่องนี้ในคลัง',
  /* 語言で絞ったのに 1 本も無いとき（`{lang}` は lib/rom-lang.ts の言語名） */
  'consolesPage.gamesEmptyLang': 'ยังไม่มีเกมภาษา{lang} ของเครื่องนี้',
  'consolesPage.filterLangLabel': 'กรองตามภาษา',
  'consolesPage.field.released': 'ปีที่ออก',
  'consolesPage.backToConsoles': 'ทุกเครื่อง',
  'consolesPage.notFoundTitle': 'ไม่พบเครื่องเล่น',
  'consolesPage.notFound': 'เว็บนี้ไม่รองรับเครื่องนี้ (หรือถูกลบไปแล้ว)',

  'download.heading': 'ดาวน์โหลด ROM',
  'download.hint': 'กดปุ่มด้านล่าง — การดาวน์โหลดจะเริ่มใน 6 วินาที',
  'download.button': 'เริ่มดาวน์โหลด',
  'download.waiting': 'จะเริ่มใน {seconds} วินาที…',
  'download.started': 'เริ่มดาวน์โหลดแล้ว — ดูรายการดาวน์โหลดของเบราว์เซอร์',
  'download.rights': 'ดาวน์โหลดเฉพาะไฟล์ ROM ที่คุณมีสิทธิ์ใช้เท่านั้น',
  'download.disclaimer':
    'ข้อจำกัดความรับผิด: ไฟล์ ROM ทั้งหมดในหน้านี้รวบรวมมาจากบุคคลที่สาม เพื่อการศึกษาส่วนตัวและการสำรองข้อมูลเท่านั้น ลิขสิทธิ์ทั้งหมดเป็นของผู้ถือสิทธิ์เดิม หากเนื้อหาใดละเมิดสิทธิ์ของคุณ กรุณาติดต่อเราเพื่อลบออก',

  'deepLink.notFound': 'ไม่พบเกมนั้น — อาจถูกลบไปแล้ว',
  'deepLink.title': 'กำลังโหลดเกม',
  'deepLink.loading': 'กำลังดาวน์โหลด ROM…',
  'deepLink.hint': 'จะเริ่มอัตโนมัติเมื่อดาวน์โหลดเสร็จ',
};

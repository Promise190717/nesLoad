/**
 * 印地语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再塞一张进来会把它冲得更长。理由和 `lib/legal.ts`、`i18n.ja.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序一致**（558 条），`zh` / `ja` / `ko` 同理。
 *    改文案时先改 `en`，再回来对齐其余各份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的印地语在数据库里
 *    （`game_texts` 的 `hi` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` /
 *    `{seconds}` …），它们由 `translate()` 在运行时替换；漏掉一个不会报错，
 *    只会在页面上少一段字。印地语语序可以把占位符挪位置，但不能丢、不能改名。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → कंसोल；developer → डेवलपर；series → सीरीज़
 *   · cartridge → कार्ट्रिज；room → रूम；host → होस्ट；guest → गेस्ट
 *   · netplay → नेटप्ले；save → सेव；key bindings → की बाइंडिंग
 *   · game library → गेम लाइब्रेरी；guestbook → गेस्टबुक
 *   · 印度玩家日常说的英语借词直接保留：download → डाउनलोड，online → ऑनलाइन，
 *     settings → सेटिंग्स，account → अकाउंट，sign in → साइन इन。
 *
 * ⚠️ 站点名统一写 `Retro Games Box`（天城文里直接写拉丁字母，不音译）；`{site}` 占位符照留。
 *    机种名用印度玩家的通行写法（拉丁字母）：NES / SNES / Game Boy / GBC / GBA / NDS /
 *    Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade。标签位上取的是 `lib/consoles.ts` 的 `consoleLabel(type, locale)`。
 *
 * ⚠️ 语气：界面短句，日常口语，不用过度梵语化的书面词；不要 emoji。
 */

import type { MessageKey } from './i18n';

export const hi: Record<MessageKey, string> = {
  /*
   * SEO 文案（<title> / description / og:* / JSON-LD）。
   * 只给爬虫和社交卡片看，不进界面，但跟着语言走。
   * 机种列举只列代表机型 + 「और बहुत कुछ」，不是漏字，别补全。
   */
  'meta.title':
    '{site} — ब्राउज़र में रेट्रो गेम खेलें: NES, SNES, GBA और Arcade',
  'meta.description':
    'NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive और Arcade गेम ब्राउज़र में खेलें। ऑनलाइन लाइब्रेरी से कोई गेम चुनें, या अपनी ROM फ़ाइल लोड करें।',
  'meta.keywords':
    'रेट्रो गेम, ऑनलाइन रेट्रो गेम लाइब्रेरी, NES एमुलेटर, SNES एमुलेटर, SFC एमुलेटर, GBA एमुलेटर, Game Boy Advance एमुलेटर, Game Boy एमुलेटर, Game Boy Color एमुलेटर, NDS एमुलेटर, Nintendo DS एमुलेटर, Sega Mega Drive एमुलेटर, Sega Genesis एमुलेटर, Game Gear एमुलेटर, Master System एमुलेटर, Sega 32X एमुलेटर, WonderSwan एमुलेटर, Neo Geo Pocket एमुलेटर, PlayStation एमुलेटर, PS1 एमुलेटर, PSX एमुलेटर, Arcade एमुलेटर, ब्राउज़र में NES खेलें, ब्राउज़र एमुलेटर, RetroArch WASM, {site}',

  /* 房间页自己的 meta（标题里不写 {site}，根布局的 template 会补）。 */
  'seo.room.title': 'Pixel Room — ब्राउज़र में रेट्रो गेम खेलें',
  'seo.room.description':
    'Pixel Room में आइए: CRT पर NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive और Arcade गेम चलते हैं। ऑनलाइन लाइब्रेरी से गेम चुनें, या अपनी ROM फ़ाइल स्क्रीन पर डालें।',

  /* 登录页（noindex, follow）。 */
  'seo.login.title': 'साइन इन करें',
  'seo.login.description':
    'अपने अकाउंट में साइन इन करें, ताकि सेव, गेम हिस्ट्री और पसंदीदा सभी डिवाइस पर सिंक रहें।',

  /* 首页落地页。 */
  'home.hero.title': 'क्लासिक रेट्रो गेम ब्राउज़र में खेलें',
  'home.hero.lead':
    '{site} पर NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade और बहुत कुछ ऑनलाइन खेलने के लिए है, दो-खिलाड़ी नेटप्ले के साथ।',
  'home.hero.play': 'अपनी ROM लोड करें',
  'home.hero.browse': 'सभी गेम देखें',
  'home.join.title': 'दोस्त के साथ खेलें',
  'home.join.hint': 'दोस्त से मिला 4 अक्षरों का रूम कोड डालें।',
  'home.join.submit': 'रूम जॉइन करें',
  'home.hero.or': 'या',
  'home.search.label': 'गेम लाइब्रेरी में खोजें',
  'home.search.placeholder': 'टाइटल / डेवलपर / सीरीज़ खोजें',
  'home.search.submit': 'खोजें',
  'home.consoles.title': 'कंसोल के हिसाब से देखें',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade और बहुत कुछ — किसी एक को चुनकर उसके गेम देखें।',
  'home.consoles.count': '{count} गेम',
  'home.consoles.all': 'सभी कंसोल',
  'home.latest.title': 'नए जुड़े गेम',
  'home.latest.lead': 'साइट पर सबसे नए गेम।',
  'home.latest.viewAll': 'सभी गेम',
  'home.developers.title': 'डेवलपर के हिसाब से देखें',
  'home.developers.lead': 'इन स्टूडियो के सबसे ज़्यादा गेम यहाँ हैं।',
  'home.developers.viewAll': 'सभी डेवलपर',
  'home.empty':
    'लाइब्रेरी अभी खाली है — रूम खोलें और CRT पर कोई ROM डालकर खेलना शुरू करें।',
  'home.faq.title': 'अक्सर पूछे जाने वाले सवाल',
  'home.faq.q1': 'क्या यह मुफ़्त है?',
  'home.faq.a1':
    'पूरी तरह मुफ़्त — हर गेम खुला है। साइन इन करने पर आपकी गेम हिस्ट्री और सेव फ़ाइलों के लिए क्लाउड सेव मिलते हैं।',
  'home.faq.q2': 'क्या कुछ इंस्टॉल करना पड़ेगा?',
  'home.faq.a2': 'नहीं — किसी गेम पर क्लिक करें और सीधे ब्राउज़र में खेलें।',
  'home.faq.q3': 'क्या यह फ़ोन और टैबलेट पर चलता है?',
  'home.faq.a3': 'हाँ — फ़ोन और टैबलेट के ब्राउज़र में सीधे चलता है।',
  'home.faq.q4': 'क्या मैं ROM फ़ाइलें डाउनलोड कर सकता हूँ?',
  'home.faq.a4':
    'हाँ — हर गेम पेज पर डाउनलोड बटन है। सिर्फ़ वही ROM डाउनलोड करें जिन्हें इस्तेमाल करने की आपको कानूनी अनुमति है।',
  'home.faq.q5': 'क्या मैं दोस्त के साथ खेल सकता हूँ?',
  'home.faq.a5': 'बिल्कुल! दोस्त को बुलाएँ और मैच के लिए रूम बनाएँ।',
  'home.faq.q6': 'क्या यह गेम कंट्रोलर सपोर्ट करता है?',
  'home.faq.a6':
    'हाँ — USB या Bluetooth कंट्रोलर लगाएँ, एमुलेटर ब्राउज़र के ज़रिए उसे पकड़ लेता है। बटन मैपिंग हर कोर के डिफ़ॉल्ट के हिसाब से होती है; फ़ोन पर स्क्रीन के बटन इस्तेमाल करें।',

  /* 首屏那段看不见的正文（sr-only）。 */
  'seo.heading': 'ब्राउज़र में रेट्रो गेम खेलें',
  'seo.intro':
    '{site} एक ऑनलाइन रेट्रो गेम रूम है। NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive और Arcade गेम यहीं ब्राउज़र में चलते हैं — आपकी ही मशीन पर एमुलेट होते हैं, RetroArch को WebAssembly में कंपाइल करके।',
  'seo.howTo':
    'ऑनलाइन लाइब्रेरी से गेम चुनें, या अपनी ROM फ़ाइल टीवी पर डालें। कुछ भी इंस्टॉल नहीं करना।',

  /* 游戏列表 / 详情 / 下载三页的 SEO 文案。 */
  'seo.games.title': 'सभी गेम — NES, SNES, GBA और Arcade ऑनलाइन खेलें',
  'seo.games.description':
    'ऑनलाइन लाइब्रेरी में {count} रेट्रो गेम, सब ब्राउज़र में खेलने योग्य: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade और बहुत कुछ। डिटेल के लिए गेम खोलें, तुरंत खेलें, या ROM फ़ाइल डाउनलोड करें।',
  'seo.games.search.title': '“{keyword}” के सर्च नतीजे',
  'seo.games.search.description':
    'ऑनलाइन लाइब्रेरी में “{keyword}” से मेल खाते {count} गेम हैं। ब्राउज़र में खेलें या ROM फ़ाइल डाउनलोड करें।',
  'seo.games.console.title': '{console} गेम — ब्राउज़र में ऑनलाइन खेलें',
  'seo.games.console.description':
    'ऑनलाइन लाइब्रेरी में {count} {console} गेम, सब ब्राउज़र में खेलने योग्य या ROM फ़ाइल के रूप में डाउनलोड करने योग्य।',
  'seo.game.title': '{title} — {console} ऑनलाइन खेलें',
  'seo.game.description':
    '{title} ({console}) सीधे ब्राउज़र में खेलें — मुफ़्त, कुछ इंस्टॉल नहीं करना। ROM फ़ाइल डाउनलोड के लिए भी उपलब्ध है।',
  'seo.gameDownload.title': '{title} की ROM डाउनलोड करें ({console})',
  'seo.gameDownload.description':
    '{title} ({console}) की ROM फ़ाइल एक क्लिक में डाउनलोड करें, साइन-अप की ज़रूरत नहीं। इसे ब्राउज़र में भी खेल सकते हैं।',
  'seo.developers.title':
    'गेम डेवलपर — उनके NES, SNES, GBA और Arcade गेम खेलें',
  'seo.developers.description':
    'ऑनलाइन लाइब्रेरी के गेमों के पीछे {count} डेवलपर। किसी एक को खोलकर उस स्टूडियो के सारे गेम देखें।',
  'seo.developer.title': '{name} — इस डेवलपर के गेम',
  'seo.developer.description':
    'ऑनलाइन लाइब्रेरी में {name} के सभी गेम ({count}), ब्राउज़र में खेलने योग्य या ROM फ़ाइल के रूप में डाउनलोड करने योग्य।',
  'seo.consoles.title':
    'कंसोल के हिसाब से देखें — NES, SNES, GBA और Arcade गेम ऑनलाइन खेलें',
  'seo.consoles.description':
    'ऑनलाइन लाइब्रेरी के सभी कंसोल (कुल {count} गेम)। किसी एक को चुनकर उसके सारे गेम देखें, ब्राउज़र में खेलने योग्य।',
  'seo.console.title': '{name} गेम — ऑनलाइन खेलें',
  'seo.console.description':
    'ऑनलाइन लाइब्रेरी में {name} के सभी गेम ({count}), ब्राउज़र में खेलने योग्य या ROM फ़ाइल के रूप में डाउनलोड करने योग्य।',

  /* 主题 / 吊灯 / 简洁模式 / 电视大小。 */
  'theme.toDark': 'नाइट मोड पर जाएँ',
  'theme.toLight': 'डे मोड पर जाएँ',
  'lamp.turnOn': 'लैंप जलाएँ',
  'lamp.turnOff': 'लैंप बुझाएँ',
  'simple.enter': 'सिंपल मोड: सिर्फ़ दीवार, टीवी, डेस्क और फ़र्श रखें',
  'simple.exit': 'सिंपल मोड से बाहर आएँ',
  'tvSize.open': 'टीवी साइज़',
  'tvSize.opt.large': 'बड़ा',
  'tvSize.opt.medium': 'मध्यम',
  'tvSize.opt.small': 'छोटा',
  'tvSize.pick': 'टीवी साइज़ {level} करें',

  /* 语言下拉的读屏名字 + 语言提示弹窗。 */
  'locale.label': 'भाषा',
  'localePrompt.title': 'यह पेज हिंदी में है',
  'localePrompt.body': 'आपका ब्राउज़र कोई और भाषा पसंद करता है। बदलें?',
  'localePrompt.keep': 'हिंदी में ही रहें',
  'fullscreen.enter': 'गेम स्क्रीन फ़ुलस्क्रीन करें',
  'fullscreen.exit': 'फ़ुलस्क्रीन से बाहर आएँ',

  /* 屏幕里那块提示（整块屏幕就是按钮）。 */
  'screen.pick': 'ROM फ़ाइल चुनने के लिए क्लिक करें, या यहाँ डालें',
  'screen.srLabel': 'चलाने के लिए ROM फ़ाइल चुनें',
  'screen.tapLoad': 'लोकल ROM लोड करने के लिए क्लिक करें',
  'screen.orLibrary': 'या ऑनलाइन लाइब्रेरी से शुरू करें',
  'screen.release': 'लोड करने के लिए छोड़ें',
  'screen.mobileLibrary': 'लाइब्रेरी से शुरू करें',
  'screen.mobileTap': 'लाइब्रेरी खोलने के लिए स्क्रीन टैप करें',
  'screen.waitingHost': 'होस्ट का इंतज़ार',
  'screen.paused': 'पॉज़ है',
  'screen.resumeOnPanel': 'पैनल पर रिज़्यूम दबाएँ',
  'screen.resumeInPanel': 'दाएँ पैनल में रिज़्यूम दबाएँ',
  'screen.waitHostResume': 'होस्ट के रिज़्यूम का इंतज़ार',

  /* 机身面板上的按钮。 */
  'panel.resume': 'रिज़्यूम',
  'panel.pause': 'पॉज़',
  'panel.save': 'सेव',
  'panel.load': 'लोड',
  'panel.reset': 'रीसेट',
  'panel.eject': 'निकालें',
  'volume.down': 'आवाज़ एक स्टेप कम करें',
  'volume.up': 'आवाज़ एक स्टेप बढ़ाएँ',
  'volume.set': 'आवाज़ {max} में से {level} करें',

  /* 存档列表。 */
  'saves.title': 'सेव लोड करें',
  'saves.load': 'लोड',
  'saves.close': 'बंद करें',
  'saves.groupLocal': 'इस डिवाइस पर',
  'saves.groupCloud': 'क्लाउड (अकाउंट)',
  'saves.deleteCloud': 'यह क्लाउड सेव हटाएँ',
  'saves.delete': 'हटाएँ',
  'saves.loginHint': 'क्लाउड सेव रखने और किसी भी डिवाइस पर खेलने के लिए साइन इन करें।',
  'saves.login': 'साइन इन',
  'saves.loading': 'लोड हो रहा है…',
  'saves.downloading': 'क्लाउड सेव डाउनलोड हो रहा है…',
  'saves.restoring': 'गेम बहाल हो रहा है…',
  'saves.empty': 'अभी कोई सेव नहीं',
  'library.removeLabel': '{name} हटाएँ',

  /* 按键说明。键名和钮名（W/A/S/D、A B C X Y Z）是丝印，不翻译。 */
  'legend.moves': 'चलाना',
  'legend.open': 'कंट्रोल्स',
  'legend.title': 'कंट्रोल्स',
  'legend.close': 'बंद करें',
  'legend.needZip':
    'फ़ॉर्मेट  FBNeo सिर्फ़ .zip पढ़ता है — यह {ext} जैसा लग रहा है। इसे दोबारा पैक करें, या .zip वर्ज़न लें',
  'play.needZip':
    'फ़ॉर्मेट  यह ROM {ext} आर्काइव है जो खुल नहीं सका — .zip या बिना कंप्रेस की ROM आज़माएँ',
  'legend.needDisc':
    'फ़ॉर्मेट  डिस्क इमेज आमतौर पर कई फ़ाइलों की होती हैं (.cue + .bin)। यह साइट सिर्फ़ सिंगल-फ़ाइल इमेज लेती है — .pbp, .iso या .chd वर्ज़न लें',
  'play.needDisc':
    'फ़ॉर्मेट  यह कई फ़ाइलों वाली डिस्क इमेज है (.cue + .bin)। यहाँ सिर्फ़ सिंगल-फ़ाइल इमेज चलती हैं — .pbp, .iso या .chd वर्ज़न आज़माएँ',
  'legend.needBios':
    'BIOS  यह Neo Geo गेम लगता है (KOF, Metal Slug…)। इसके लिए neogeo.zip चाहिए — वह फ़ाइल पेज पर डालें, इंस्टॉल हो जाएगी। CPS1 / CPS2 गेम को इसकी ज़रूरत नहीं।',
  'legend.gamepad': 'गेमपैड  लगाइए और चलने लगेगा — रूम में दोनों तरफ़।',

  /* 联机面板。`netplay.codePlaceholder` 保持 ASCII（输入框走 font-pixel）。 */
  'netplay.title': 'नेटप्ले',
  'netplay.open': 'नेटवर्क पर खेलें',
  'netplay.close': 'बंद करें',
  'netplay.create': 'रूम बनाएँ',
  'netplay.or': 'या',
  'netplay.join': 'जॉइन करें',
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    'दोनों तरफ़ को सिर्फ़ पब्लिक रिले तक पहुँचना है — एक ही LAN पर सबसे अच्छा चलता है। 4 अक्षरों का कोड दूसरे खिलाड़ी को बोलकर बताएँ। होस्ट एमुलेटर चलाता है और तस्वीर स्ट्रीम करता है; गेस्ट को ROM की ज़रूरत नहीं।',
  'netplay.roomCode': 'रूम कोड',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'पब्लिक इंटरनेट',
  'netplay.wanDev': 'पब्लिक इंटरनेट पर नेटप्ले अभी बन रहा है।',
  'netplay.quality': 'स्ट्रीम क्वालिटी',
  'netplay.qualitySmooth': 'स्मूद',
  'netplay.qualityBalanced': 'बैलेंस्ड',
  'netplay.qualitySharp': 'शार्प',
  'netplay.qualityHint':
    'होस्ट एक ही मशीन पर एमुलेटर और स्ट्रीम चलाता है। अगर वह संभाल न पाए, तो पूरा गेम धीमा पड़ जाएगा (स्लो मोशन)। ऐसा हो तो एक स्टेप कम करें — यह सिर्फ़ होस्ट पर लागू है।',
  'netplay.copy': 'कॉपी',
  'netplay.copied': 'कॉपी हो गया',
  'netplay.share': 'शेयर',
  'netplay.shareCopied': 'लिंक कॉपी हो गया',
  'netplay.inviteTitle': 'रूम का न्योता',
  'netplay.inviteBody': 'रूम {code} जॉइन करें?',
  'netplay.inviteJoin': 'जॉइन करें',
  'netplay.inviteCancel': 'रद्द करें',
  'netplay.connected': 'कनेक्ट हो गया',
  'netplay.waiting': 'दूसरे खिलाड़ी का इंतज़ार',
  'netplay.joining': 'रूम जॉइन हो रहा है…',
  'netplay.waitingGame': 'कनेक्ट हो गया — होस्ट के कार्ट्रिज लोड करने का इंतज़ार',
  'netplay.hostPlaying': 'होस्ट खेल रहा है',
  'netplay.paused': 'पॉज़ है',
  'netplay.toastHost': 'कनेक्ट हो गया · दूसरा खिलाड़ी आ गया · आप प्लेयर 1 हैं',
  'netplay.toastGuest': 'होस्ट से कनेक्ट हो गया · आप प्लेयर 2 हैं',
  'netplay.toastHostLeft': 'होस्ट चला गया — रूम बंद हो गया',
  'netplay.toastGuestLeft': 'प्लेयर 2 रूम से चला गया',
  'netplay.youAreHost':
    'आप प्लेयर 1 हैं। कार्ट्रिज लोड करें और तस्वीर अपने आप गेस्ट तक पहुँच जाएगी। आप अपने ही की-सेट से खेलते हैं — मौजूदा बाइंडिंग कंट्रोल्स में देखें।',
  'netplay.youAreGuest':
    'आप प्लेयर 2 हैं। कार्ट्रिज की ज़रूरत नहीं — होस्ट तस्वीर स्ट्रीम करता है, और आपका इनपुट होस्ट तक जाता है। अपने की-सेट (Player 1 ग्रुप) या गेमपैड से खेलें — कंट्रोल्स देखें।',
  'netplay.leave': 'रूम छोड़ें',
  'netplay.closeRoom': 'रूम बंद करें',
  'netplay.badCode': 'यह कोड सही नहीं लग रहा — 4 अक्षरों का होना चाहिए।',
  'netplay.errInsecure':
    'नेटप्ले के लिए HTTPS या localhost चाहिए। यह पेज सादे http पर है, इसलिए ब्राउज़र उस क्रिप्टो API को नहीं देता जिस पर यह निर्भर है।',
  'netplay.errNoDirect':
    'दोनों तरफ़ रिले तक पहुँच गए, पर सीधा कनेक्शन नहीं बना — आमतौर पर NAT या फ़ायरवॉल की वजह से। एक ही LAN पर सबसे अच्छा चलता है।',
  'netplay.errPassword': 'रूम कोड मेल नहीं खाता।',
  'netplay.errHandshake': 'हैंडशेक का टाइम आउट — दूसरा खिलाड़ी शायद चला गया।',
  'netplay.errHostLeft': 'होस्ट रूम छोड़ गया — रूम बंद कर दिया गया है।',
  'netplay.errNoRoom':
    'होस्ट से कोई जवाब नहीं आया। रूम कोड गलत हो सकता है, या होस्ट ने रूम अभी खोला नहीं है।',
  'netplay.errRoomFull': 'यह रूम भर चुका है — यह गेम सिर्फ़ एक-एक के बीच है।',
  'netplay.errUnknown':
    'दूसरे खिलाड़ी से कनेक्ट नहीं हो सका। ब्राउज़र कंसोल में पूरी वजह है।',

  /* `/play` 页。联机部分复用上面的 `netplay.*`。 */
  'seo.play.title': 'Play Room — गेम लोड करें और ऑनलाइन खेलें',
  'seo.play.description':
    'एक स्क्रीन में गेम शुरू करें: अकेले खेलें, या 1v1 रूम खोलकर कोड शेयर करें। NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive और Arcade गेम।',
  'play.modeSolo': 'अकेले',
  'play.start': 'शुरू करें',
  'play.confirmStart': 'कन्फ़र्म करें और शुरू करें',
  'play.confirm': 'कन्फ़र्म',
  'play.qualityIntro':
    'अपने कनेक्शन के हिसाब से ऑनलाइन खेलने की पिक्चर क्वालिटी चुनें।',
  'play.qualityHint.smooth': '30 fps · कम बैंडविड्थ लेता है, धीमे कनेक्शन के लिए ठीक।',
  'play.qualityHint.balanced': '720p / 60 fps तक · साफ़ी और स्मूद मोशन में संतुलन।',
  'play.qualityHint.sharp':
    '60 fps तक · ओरिजिनल रेज़ोल्यूशन की डिटेल को प्राथमिकता; तेज़ कनेक्शन चाहिए। धीमे नेटवर्क पर फ़्रेम रेट गिर सकता है।',
  'play.qualityConfirmHint':
    'रूम से कनेक्ट करने के लिए कन्फ़र्म करें। फिर होस्ट गेम लोड करता है; गेस्ट को होस्ट की तस्वीर मिलती है।',
  'play.connecting': 'कनेक्ट हो रहा है…',
  'play.confirmJoin': 'कन्फ़र्म करें और जॉइन करें',
  'play.cancel': 'रद्द करें',
  'play.screenSize': 'स्क्रीन साइज़',
  'play.controlsTitle': 'गेम कंट्रोल्स',
  'play.netplayKeysHint':
    'ऑनलाइन खेल में हर खिलाड़ी अपनी Player 1 कीज़ इस्तेमाल करता है।',
  'play.cancelled': 'लोडिंग रद्द हो गई।',
  'play.retry': 'फिर से लोड करें',
  'play.retryJoin': 'फिर से जॉइन करके देखें',
  'play.saved': 'गेम सेव हो गया।',
  'play.localSaving': 'सेव हो रहा है…',
  'play.uploading': 'अपलोड हो रहा है…',
  'play.cloudFailed': 'क्लाउड सिंक फ़ेल हो गया।',
  'play.saveNoLogin': 'सिंक के लिए साइन इन करें',
  'play.tooLarge': 'सेव बहुत बड़ा है',
  'play.theme': 'थीम',
  'play.saveFailed': 'गेम सेव नहीं हो सका। कृपया फिर कोशिश करें।',
  'play.loadFailed': 'सेव लोड नहीं हो सका। कृपया फिर कोशिश करें।',
  'play.leftRoom': 'आपने रूम छोड़ दिया।',
  'play.latency': 'लेटेंसी',
  'play.measuringLatency': 'मापा जा रहा है…',
  'play.downloading': 'ROM डाउनलोड हो रही है…',
  'play.booting': 'कोर शुरू हो रहा है…',
  'play.loadFail': 'यह कार्ट्रिज लोड नहीं हो सका।',
  'play.romIncomplete': 'ROM फ़ाइल अधूरी है — कृपया इसे फिर से लोड करें।',
  'play.notFound': 'वह गेम नहीं मिला।',
  'play.fullscreen': 'फ़ुलस्क्रीन',
  'play.volume': 'आवाज़',
  'play.edit': 'एडिट',
  'play.hideSidebar': 'पैनल छिपाएँ',
  'play.showSidebar': 'पैनल दिखाएँ',
  'play.hint': 'Esc से फ़ुलस्क्रीन बंद होती है। यहाँ और कुछ कीबोर्ड इस्तेमाल नहीं करता।',
  'play.leaveTitle': 'गेम चल रहा है',
  'play.leaveBody':
    'वापस जाने से यह सेशन ख़त्म हो जाएगा — प्रोग्रेस अपने आप सेव नहीं होती।',
  'play.leaveStay': 'खेलते रहें',
  'play.leaveGo': 'छोड़ें',
  'gamesPage.playOnline': 'ऑनलाइन खेलें',

  /* 自定义按键面板。按钮丝印（A B C X Y Z / L R …）不进表。 */
  'keybind.title': 'की बाइंडिंग',
  'keybind.open': 'की सेटिंग्स',
  'keybind.close': 'बंद करें',
  'keybind.p1': 'प्लेयर 1',
  'keybind.p2': 'प्लेयर 2',
  'keybind.mine': 'आपकी कीज़',
  'keybind.pressKey': 'दबाएँ…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'डिफ़ॉल्ट पर लौटाएँ',
  'keybind.reload': 'कार्ट्रिज फिर लोड करें',
  'keybind.reloading': 'फिर लोड हो रहा है…',
  'keybind.unsupported': 'यह की इस्तेमाल नहीं हो सकती — कोई और आज़माएँ।',
  'keybind.conflictSame': '{pressed} पहले से {button} बटन पर है — कोई और की आज़माएँ।',
  'keybind.conflictOther':
    '{pressed} पहले से प्लेयर {player} के {button} बटन पर है — कोई और की आज़माएँ।',
  'keybind.hint':
    'कीबोर्ड मैप सिर्फ़ एक बार पढ़ा जाता है, जब कार्ट्रिज लोड होती है — बदलाव लागू करने के लिए इसे फिर लोड करें। दोनों खिलाड़ी एक ही की शेयर नहीं कर सकते।',
  'keybind.soloHint':
    'कीबोर्ड मैप सिर्फ़ एक बार पढ़ा जाता है, जब कार्ट्रिज लोड होती है — बदलाव लागू करने के लिए इसे फिर लोड करें।',
  'keybind.hostHint':
    'आप होस्ट हैं: Player 1 आपकी अपनी कीज़ हैं, Player 2 वह है जिसके रूप में गेस्ट का इनपुट भेजा जाता है। दोनों एक ही की शेयर नहीं कर सकते, वरना भेजा गया इनपुट आपकी Player 1 भी चला देगा। बदलने के बाद कार्ट्रिज फिर लोड करें।',
  'keybind.guestHint':
    'आप गेस्ट हैं और अपने ही की-सेट (Player 1 ग्रुप) से खेलते हैं — हर तरफ़ अपना कीबोर्ड है, इसलिए टकराव नहीं होगा। बदलाव तुरंत लागू होते हैं — कार्ट्रिज फिर लोड करने की ज़रूरत नहीं।',
  'keybind.guestLocalHint':
    'आप गेस्ट हैं, और यहाँ आपकी अपनी कार्ट्रिज भी चल रही है। आपकी कीज़ Player 1 ग्रुप हैं: वे उस लोकल कार्ट्रिज को चलाती हैं, इसलिए बदलने के बाद उसे फिर लोड करें — और वही होस्ट तक भी भेजी जाती हैं, जहाँ तुरंत लागू होती हैं।',

  /* 在线游戏库。 */
  'games.open': 'गेम लाइब्रेरी',
  'games.title': 'गेम लाइब्रेरी',
  'games.close': 'बंद करें',
  'games.empty': 'लाइब्रेरी खाली है — अभी कुछ अपलोड नहीं हुआ',
  'games.loading': 'लोड हो रहा है…',
  'games.loadingRom': '{name} लोड हो रहा है…',
  'games.cancel': 'रद्द करें',
  'games.failed': 'गेम लाइब्रेरी लोड नहीं हो सकी',
  'games.tabLibrary': 'गेम लाइब्रेरी',
  'games.tabHistory': 'हिस्ट्री',
  'games.historyEmpty': 'अभी लाइब्रेरी से कुछ नहीं खोला',
  'games.historyLoad': '{name}\nदोबारा लोड करने के लिए क्लिक करें',
  'games.tabFavorites': 'पसंदीदा',
  'games.favorite': '{name} को पसंदीदा में जोड़ें',
  'games.unfavorite': '{name} को पसंदीदा से हटाएँ',
  'games.favoritesEmpty': 'अभी कोई पसंदीदा नहीं — किसी कवर पर स्टार टैप करें।',
  'games.favoritesSignInBefore': 'पसंदीदा रखने के लिए साइन इन करें — ',
  'games.favoritesSignInLink': 'साइन इन',
  'games.favoritesSignInAfter': ' यहीं, या ऊपर दाईं तरफ़ अकाउंट बटन इस्तेमाल करें।',

  /* 用户面板（注册 / 登录 / 退出）。 */
  'user.title': 'अकाउंट',
  'user.close': 'बंद करें',
  'user.open': 'अकाउंट — साइन इन या रजिस्टर करें',
  'user.openSignedIn': 'अकाउंट: {name}',
  'user.tabLogin': 'साइन इन',
  'user.tabRegister': 'अकाउंट बनाएँ',
  'user.username': 'यूज़रनेम',
  'user.password': 'पासवर्ड',
  'user.usernameHint': '3–20 अक्षर: अक्षर, अंक, _ - .',
  'user.emailLabel': 'ईमेल',
  'user.emailHint': 'आपका ईमेल। कोई + एलियस नहीं, कोई टेम्प मेल नहीं।',
  'user.passwordHint': 'कम से कम 6 अक्षर, कोई स्पेस नहीं।',
  'user.signIn': 'साइन इन',
  'user.signUp': 'अकाउंट बनाएँ',
  'user.signingIn': 'साइन इन हो रहा है…',
  'user.signingUp': 'बन रहा है…',
  'user.signOut': 'साइन आउट',
  'user.signedInAs': '{name} के रूप में साइन इन हैं।',
  'user.cloudHint':
    'आपकी गेम हिस्ट्री, सेव और पसंदीदा आपके अकाउंट में रहते हैं — ऑनलाइन लाइब्रेरी से कोई गेम खोलें, वे अपने आप सिंक हो जाते हैं।',
  'user.formLead':
    'साइन इन करें और आपकी सेव, गेम हिस्ट्री और पसंदीदा क्लाउड में रहेंगे — कभी भी, कहीं भी खेलें!',
  /* 四段法律声明：首尾空格有意义，别 trim。 */
  'user.consentLogin': 'साइन इन करके आप हमारी ',
  'user.consentRegister': 'अकाउंट बनाकर आप हमारी ',
  'user.consentMiddle': ' और ',
  'user.consentAfter': ' से सहमत होते हैं।',

  'user.error.failed': 'कुछ गड़बड़ हो गई — फिर कोशिश करें।',
  'user.error.missingCredentials': 'यूज़रनेम और पासवर्ड डालें।',
  'user.error.usernameInvalid': 'यूज़रनेम में सिर्फ़ अक्षर, अंक, _ - और . हो सकते हैं',
  'user.error.usernameTooShort': 'यूज़रनेम बहुत छोटा है (कम से कम 3 अक्षर)।',
  'user.error.usernameTooLong': 'यूज़रनेम बहुत लंबा है (ज़्यादा से ज़्यादा 20 अक्षर)।',
  'user.error.usernameTaken': 'यह यूज़रनेम लिया जा चुका है — कोई और चुनें।',
  'user.error.emailInvalid': 'सही ईमेल पता डालें।',
  'user.error.emailAlias':
    'एलियस ईमेल (जैसे name+tag@… या डॉट वाले Gmail) की अनुमति नहीं है।',
  'user.error.emailTemp':
    'टेम्प ईमेल सर्विस की अनुमति नहीं है — अपना सामान्य मेलबॉक्स इस्तेमाल करें।',
  'user.error.passwordInvalid': 'पासवर्ड डालें।',
  'user.error.passwordTooShort': 'पासवर्ड बहुत छोटा है (कम से कम 6 अक्षर)।',
  'user.error.passwordTooLong': 'पासवर्ड बहुत लंबा है (ज़्यादा से ज़्यादा 72 अक्षर)।',
  'user.error.passwordHasSpace': 'पासवर्ड में स्पेस नहीं हो सकता।',
  'user.error.invalidCredentials': 'यूज़रनेम या पासवर्ड ग़लत है।',
  'user.error.banned': 'यह अकाउंट सस्पेंड कर दिया गया है।',
  'user.error.captchaRequired': 'कृपया पहले ह्यूमन वेरिफ़िकेशन पूरा करें।',
  'user.error.captchaFailed': 'ह्यूमन वेरिफ़िकेशन फ़ेल हो गया — कृपया फिर कोशिश करें।',

  'login.lead':
    'साइन इन करें और आपकी सेव, गेम हिस्ट्री और पसंदीदा क्लाउड में रहेंगे — कभी भी, कहीं भी खेलें। अभी अकाउंट नहीं है? एक बनाएँ।',

  /* 个人中心。 */
  'account.title': 'आपका अकाउंट',
  'account.loading': 'लोड हो रहा है…',
  'account.failed': 'कुछ गड़बड़ हो गई — फिर कोशिश करें।',
  'account.since': '{time} से मेंबर',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'स्टैंडर्ड',
  'account.vipUntil': '{time} तक VIP',
  'account.vipExpired': 'VIP {time} को ख़त्म हुआ',
  'account.tabFavorites': 'पसंदीदा',
  'account.tabHistory': 'हिस्ट्री',
  'account.tabSaves': 'सेव',
  'account.tabProfile': 'प्रोफ़ाइल',
  'account.tabPassword': 'पासवर्ड',
  'account.favoritesLoading': 'पसंदीदा लोड हो रहे हैं…',
  'account.historyLoading': 'हिस्ट्री लोड हो रही है…',
  'account.savesLoading': 'सेव लोड हो रहे हैं…',
  'account.favoritesEmpty':
    'अभी कोई पसंदीदा नहीं — रूम में गेम लाइब्रेरी खोलें और किसी कवर पर स्टार टैप करें।',
  'account.unfavorite': '{name} को पसंदीदा से हटाएँ',

  /* ---- 历史 ---- */
  'account.historyEmpty':
    'अभी कोई हिस्ट्री नहीं — ऑनलाइन लाइब्रेरी से खोले गए गेम यहाँ दिखेंगे।',
  'account.historyCount': 'हाल में {count} गेम खेले',
  'account.historyDeleted': 'हिस्ट्री से हटा दिया।',
  'account.clearHistory': 'सब साफ़ करें',
  'account.confirmClearHistory': 'पक्का सब साफ़ करें?',
  'account.historyCleared': 'हिस्ट्री साफ़ हो गई।',
  'account.historyHint':
    'हिस्ट्री आपके सबसे हाल में खेले {max} गेम रखती है — कोई पुराना गेम फिर खेलें तो वह ऊपर आ जाता है।',

  'account.savesEmpty': 'अभी कोई क्लाउड सेव नहीं।',
  'account.savesCount': 'कुल {count} सेव',
  'account.savesGroupCount': '{count} सेव',
  'account.viewGame': '{name} देखें',
  'account.savesHint':
    'हर गेम के लिए एक ही सेव — फिर सेव करने पर वह ओवरराइट हो जाता है। यही लोकल और क्लाउड दोनों पर लागू है।',
  'account.saveDeleted': 'सेव हटा दिया।',
  'account.clearSaves': 'सब साफ़ करें',
  'account.confirmClearSaves': 'पक्का सब साफ़ करें?',
  'account.savesCleared': '{count} सेव साफ़ किए।',
  'account.delete': 'हटाएँ',
  'account.confirmDelete': 'पक्का हटाएँ?',

  /* ---- 资料 ---- */
  'account.avatar': 'अवतार',
  'account.chooseImage': 'इमेज चुनें',
  'account.clearAvatar': 'अवतार हटाएँ',
  'account.uploading': 'अपलोड हो रहा है…',
  'account.avatarSaved': 'अवतार अपडेट हो गया।',
  'account.avatarCleared': 'अवतार हटा दिया।',
  'account.avatarHint': 'PNG, JPEG, WebP या GIF, 2 MB तक।',
  'account.gender': 'जेंडर',
  'account.genderNone': 'नहीं बताया',
  'account.genderMale': 'पुरुष',
  'account.genderFemale': 'महिला',
  'account.genderSaved': 'सेव हो गया।',
  'account.genderHint': 'ऑप्शनल — आपके अलावा किसी को नहीं दिखता।',
  'account.passwordTabHint':
    'इसके बाद आप इस डिवाइस पर साइन इन रहेंगे — फिर से लॉग इन करने की ज़रूरत नहीं।',
  'account.password': 'पासवर्ड',
  'account.oldPassword': 'मौजूदा पासवर्ड',
  'account.newPassword': 'नया पासवर्ड',
  'account.confirmPassword': 'नया पासवर्ड दोहराएँ',
  'account.savePassword': 'पासवर्ड बदलें',
  'account.saving': 'सेव हो रहा है…',
  'account.passwordSaved': 'पासवर्ड बदल गया।',
  'account.passwordHint':
    'बदलने के बाद आप इस डिवाइस पर साइन इन रहेंगे। दूसरे साइन-इन डिवाइस तब तक चलते रहेंगे जब तक उनका सेशन ख़त्म न हो।',

  'account.error.missingOld': 'अपना मौजूदा पासवर्ड डालें।',
  'account.error.wrongPassword': 'मौजूदा पासवर्ड ग़लत है।',
  'account.error.passwordTooShort': 'नया पासवर्ड बहुत छोटा है (कम से कम 6 अक्षर)।',
  'account.error.passwordTooLong': 'नया पासवर्ड बहुत लंबा है (ज़्यादा से ज़्यादा 72 अक्षर)।',
  'account.error.passwordHasSpace': 'नए पासवर्ड में स्पेस नहीं हो सकता।',
  'account.error.mismatch': 'दोनों नए पासवर्ड मेल नहीं खाते।',
  'account.error.avatarMissing': 'पहले कोई इमेज चुनें।',
  'account.error.avatarTooLarge': 'यह इमेज बहुत बड़ी है (ज़्यादा से ज़्यादा 2 MB)।',
  'account.error.avatarType':
    'यह फ़ॉर्मेट सपोर्टेड नहीं — PNG, JPEG, WebP या GIF इस्तेमाल करें।',

  /* 在线库的筛选与翻页。 */
  'games.filterAll': 'सभी',
  'games.searchPlaceholder': 'टाइटल / डेवलपर / सीरीज़ खोजें',
  'games.search': 'खोजें',
  'games.noMatch': 'कोई मैचिंग गेम नहीं।',
  'games.prev': 'पिछला',
  'games.next': 'अगला',
  /* 英文是空串，组件按「空串不渲染」处理；印地语也不显示。 */
  'games.remoteSlow': '',

  /* 地板上的纸片。 */
  'note.text': 'काश हम सब बचपन की वह खुशी फिर पा सकें..',
  'note.open': 'फ़र्श पर रखा नोट पढ़ें',
  'note.title': 'एक नोट',
  'note.close': 'बंद करें',
  'window.cycle': 'बाहर का मौसम बदलें',

  /* 墙上的挂画。画名 / 作者只有这一个出处。 */
  'painting.open': 'पेंटिंग को पास से देखें',
  'painting.close': 'बंद करें',
  'painting.title.sunflowers': 'सूरजमुखी',
  'painting.artist.sunflowers': 'विंसेंट वैन गॉग',
  'painting.title.monaLisa': 'मोना लिसा',
  'painting.artist.monaLisa': 'लियोनार्डो दा विंची',
  'painting.title.starryNight': 'स्टारी नाइट',
  'painting.artist.starryNight': 'विंसेंट वैन गॉग',
  'painting.title.scream': 'द स्क्रीम',
  'painting.artist.scream': 'एडवर्ड मंच',
  'painting.title.pearl': 'गर्ल विद अ पर्ल ईयररिंग',
  'painting.artist.pearl': 'योहानेस वर्मीर',
  'painting.title.wave': 'द ग्रेट वेव ऑफ़ कानागावा',
  'painting.artist.wave': 'कात्सुशिका होकुसाई',
  'painting.title.unknown': 'कहीं से आई एक बेनाम पेंटिंग',
  'painting.artist.unknown': 'अज्ञात',

  /* 地板上那台 MP4（整台机器就是一个按钮）。 */
  'mp4.play': 'MP4 प्लेयर पर गाना चलाएँ',
  'mp4.pause': 'MP4 प्लेयर रोकें',

  /* 逗猫棒 + 猫的品种（只当无障碍名字用，画面上不写）。 */
  'cat.wand': 'फ़र्श पर रखी बिल्ली की छड़ी हिलाएँ',
  'cat.ragdoll': 'किताबों के पीछे से एक रैगडॉल बिल्ली झाँकती है',
  'cat.siamese': 'किताबों के पीछे से एक स्यामी बिल्ली झाँकती है',
  'cat.tabby': 'किताबों के पीछे से एक टैबी बिल्ली झाँकती है',
  'cat.orange': 'किताबों के पीछे से एक नारंगी टैबी झाँकती है',
  'cat.american': 'किताबों के पीछे से एक अमेरिकन शॉर्टहेयर झाँकती है',
  'cat.tuxedo': 'किताबों के पीछे से एक टक्सीडो बिल्ली झाँकती है',
  'cat.calico': 'किताबों के पीछे से एक कैलिको बिल्ली झाँकती है',

  /* 留言本。 */
  'feedback.open': 'फ़र्श पर रखी गेस्टबुक पढ़ें',
  'feedback.title': 'गेस्टबुक',
  'feedback.close': 'बंद करें',
  'feedback.placeholder': 'कुछ लिखें — कोई सुझाव, या कोई गेम जो आप यहाँ देखना चाहें…',
  'feedback.submit': 'पोस्ट करें',
  'feedback.submitting': 'पोस्ट हो रहा है…',
  'feedback.ok': 'पोस्ट हो गया — धन्यवाद!',
  'feedback.required': 'पहले कुछ लिखें।',
  'feedback.failed': 'पोस्ट नहीं हो सका — फिर कोशिश करें।',
  'feedback.loading': 'लोड हो रहा है…',
  'feedback.empty': 'अभी कोई मैसेज नहीं — पहला लिखने वाले आप बनें।',
  'feedback.retry': 'फिर कोशिश करें',
  'feedback.prev': 'पिछला',
  'feedback.next': 'अगला',
  'feedback.page': 'पेज {n}',
  'feedback.resolved': 'सुलझ गया',
  'feedback.unresolved': 'खुला है',

  /* 隐私政策 / 服务条款：正文在 lib/legal.ts，这里只有界面要用的几个词。 */
  'legal.privacy': 'प्राइवेसी पॉलिसी',
  'legal.terms': 'सेवा की शर्तें',
  'legal.updated': 'आख़िरी अपडेट {date}',
  'legal.contact': 'हमसे संपर्क करें:',

  /* 初次打开的操作指引。 */
  'tour.title': 'क्विक टूर',
  'tour.skip': 'स्किप करें',
  'tour.back': 'पीछे',
  'tour.next': 'आगे',
  'tour.done': 'खेलना शुरू करें',
  'tour.replay': 'टूर फिर दिखाएँ',
  'tour.screen.title': 'किसी गेम से शुरू करें',
  'tour.screen.body':
    'ROM फ़ाइल (.nes, .sfc, .gba, .md, .gb …) या Arcade .zip टीवी पर डालें, या सिर्फ़ स्क्रीन पर क्लिक करके फ़ाइल चुनें। इस रेपो के साथ कोई ROM नहीं आती — अपनी लाएँ।',
  'tour.rail.title': 'स्विच रेल',
  /* 语言那一项照 en 写四种语言的自称，不翻译。 */
  'tour.rail.body':
    'तीन ग्रुप, ऊपर से नीचे। देखें: थीम (नाइट / डे), भाषा (中文 / English / 日本語 / 한국어), फ़ुलस्क्रीन (पूरी स्क्रीन ही फ़ुलस्क्रीन होती है), सिंपल मोड (सिर्फ़ दीवार, टीवी, डेस्क और फ़र्श), टीवी साइज़ (बड़ा / मध्यम / छोटा चुनने वाला पिकर खोलता है — डेस्क भी साथ चौड़ा होता है)। गेम: नेटप्ले, की बाइंडिंग। मदद: कंट्रोल्स हेल्प, और गेस्टबुक।',

  'topLinks.label': 'साइट पेज',
  'topLinks.games': 'गेम लिस्ट',
  'menu.open': 'मेन्यू खोलें',
  'menu.close': 'मेन्यू बंद करें',
  'menu.theme': 'थीम',
  'menu.simple': 'सिंपल मोड',

  /* 离开房间确认。 */
  'leave.title': 'यह पेज छोड़ें?',
  'leave.bodyGame': 'चल रहा गेम बीच में रुक जाएगा — प्रोग्रेस सेव नहीं होगी।',
  'leave.bodyNetplay': 'आप नेटप्ले रूम छोड़ देंगे, और आपका साथी डिस्कनेक्ट हो जाएगा।',
  'leave.stay': 'रुकें',
  'leave.confirm': 'छोड़ें',

  /* 游戏列表页。 */
  'gamesPage.heading': 'सभी गेम',
  'gamesPage.intro':
    'ऑनलाइन लाइब्रेरी में {count} गेम — NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade और बहुत कुछ। डिटेल के लिए कवर पर क्लिक करें, या सीधे खेलना शुरू करें।',
  'gamesPage.empty': 'लाइब्रेरी अभी खाली है।',
  'gamesPage.introConsole':
    'लाइब्रेरी में {count} {console} गेम। डिटेल के लिए कवर पर क्लिक करें, या सीधे खेलना शुरू करें।',
  'gamesPage.filterLabel': 'कंसोल के हिसाब से फ़िल्टर करें',
  'gamesPage.filterAll': 'सभी',
  'gamesPage.consoleEmpty': 'लाइब्रेरी में अभी कोई {console} गेम नहीं है।',
  'gamesPage.searchLabel': 'गेम लाइब्रेरी में खोजें',
  'gamesPage.searchPlaceholder': 'टाइटल / डेवलपर / सीरीज़ खोजें',
  'gamesPage.searchSubmit': 'खोजें',
  'gamesPage.searchLoading': 'खोजा जा रहा है…',
  'gamesPage.searchClear': 'खोज साफ़ करें',
  'gamesPage.searchResults': '“{keyword}” — {count} गेम मिले।',
  'gamesPage.searchEmpty':
    '“{keyword}” से कोई गेम नहीं मिला। छोटा शब्द आज़माएँ, या गेम का टाइटल।',
  'gamesPage.prev': 'पिछला',
  'gamesPage.next': 'अगला',
  'gamesPage.backHome': 'होम पर वापस',
  'gamesPage.backToGames': 'सभी गेम',
  'common.back': 'वापस',
  'common.home': 'होम',
  'gamesPage.play': 'अभी खेलें',
  'gamesPage.download': 'ROM डाउनलोड करें',
  'gamesPage.share': 'यह गेम शेयर करें',
  'gamesPage.shareCopied': 'लिंक कॉपी हो गया',
  'gamesPage.shareFailed': 'कॉपी नहीं हो सका',
  'gamesPage.favorite': 'पसंदीदा में जोड़ें',
  'gamesPage.unfavorite': 'पसंदीदा से हटाएँ',
  'gamesPage.favoriteSignIn':
    'पसंदीदा सेव करने के लिए साइन इन करें — ऊपर की पट्टी में साइन-इन बटन दबाएँ।',
  'gamesPage.favoriteFailed': 'पसंदीदा अपडेट नहीं हो सके — फिर कोशिश करें।',
  'gamesPage.favoriteCount': 'पसंदीदा लिस्ट में {n} लोग',
  'gamesPage.report': 'समस्या बताएँ',
  'gamesPage.reportTitle': 'समस्या बताएँ',
  'gamesPage.reportSubject': 'बारे में: {name}',
  'gamesPage.reportPlaceholder':
    'क्या गड़बड़ हुई? जैसे: शुरू नहीं होता, तस्वीर खराब आती है, आवाज़ नहीं है…',
  'gamesPage.reportSubmit': 'रिपोर्ट भेजें',
  'gamesPage.reportSubmitting': 'भेजा जा रहा है…',
  'gamesPage.reportOk': 'धन्यवाद — हम देखेंगे।',
  'gamesPage.reportRequired': 'कृपया पहले समस्या लिखें।',
  'gamesPage.reportFailed': 'भेजा नहीं जा सका — फिर कोशिश करें।',
  'gamesPage.reportClose': 'रद्द करें',

  /* 评论模块（发评论必须先登录）。 */
  'comments.heading': 'कमेंट',
  'comments.count': '{n} कमेंट',
  'comments.empty': 'अभी कोई कमेंट नहीं — पहले आप बनें।',
  'comments.placeholder': 'इस गेम के बारे में क्या सोचते हैं?',
  'comments.ratingLabel': 'आपकी रेटिंग',
  'comments.ratingStar': '5 में से {n} रेट करें',
  'comments.ratingValue': '5 में से {n} स्टार',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'पहले स्टार रेटिंग चुनें।',
  'comments.submit': 'कमेंट पोस्ट करें',
  'comments.submitting': 'पोस्ट हो रहा है…',
  'comments.ok': 'पोस्ट हो गया — यह लिस्ट में सबसे ऊपर है।',
  'comments.required': 'पहले कुछ लिखें।',
  'comments.failed': 'पोस्ट नहीं हो सका — फिर कोशिश करें।',
  'comments.signInLead': 'कमेंट पोस्ट करने के लिए साइन इन करें।',
  'comments.signIn': 'साइन इन',
  'comments.signInRequired': 'पोस्ट करने के लिए कृपया फिर से साइन इन करें।',
  'comments.loading': 'कमेंट लोड हो रहे हैं…',
  'comments.retry': 'फिर कोशिश करें',
  'comments.loadFailed': 'कमेंट लोड नहीं हो सके।',
  'comments.loadMore': 'और दिखाएँ',
  'comments.delete': 'हटाएँ',
  'comments.deleteConfirm': 'कन्फ़र्म',
  'comments.cancel': 'रद्द करें',
  'comments.deleted': 'कमेंट हटा दिया।',
  'comments.deleteFailed': 'हटाया नहीं जा सका — फिर कोशिश करें।',

  'gamesPage.field.console': 'कंसोल',
  'gamesPage.field.year': 'साल',
  'gamesPage.field.developer': 'डेवलपर',
  'gamesPage.field.series': 'सीरीज़',
  'gamesPage.field.language': 'भाषा',
  'gamesPage.controls': 'कंट्रोल्स',
  'gamesPage.selectLanguage': 'भाषा चुनें',
  'notFound.title': 'पेज नहीं मिला',
  'notFound.description': '{site} पर यह पता नहीं है। लिंक जाँचें, या होम पेज पर वापस जाएँ।',
  'gamesPage.notFoundTitle': 'गेम नहीं मिला',
  'gamesPage.notFound': 'यह गेम लाइब्रेरी में (अब) नहीं है।',
  'gamesPage.fallbackDescription': '{title} एक {console} गेम है।',

  /* 开发商两页。 */
  'developersPage.heading': 'डेवलपर',
  'developersPage.intro':
    'लाइब्रेरी के गेमों के पीछे {count} डेवलपर। किसी एक को खोलकर उस स्टूडियो के सारे गेम देखें।',
  'developersPage.empty': 'अभी कोई डेवलपर लिस्टेड नहीं।',
  'developersPage.gameCount': '{count} गेम',
  'developersPage.gamesHeading': '{name} के गेम',
  'developersPage.gamesEmpty': 'इस डेवलपर का कोई गेम अभी लाइब्रेरी में नहीं है।',
  'developersPage.field.founded': 'स्थापित',
  'developersPage.backToDevelopers': 'सभी डेवलपर',
  'developersPage.notFoundTitle': 'डेवलपर नहीं मिला',
  'developersPage.notFound': 'यह डेवलपर लाइब्रेरी में (अब) नहीं है।',

  /* 机种两页。 */
  'consolesPage.heading': 'कंसोल',
  'consolesPage.intro':
    'लाइब्रेरी के कंसोल — कुल {count} गेम। किसी एक को खोलकर उसके सारे गेम देखें।',
  'consolesPage.gameCount': '{count} गेम',
  'consolesPage.gamesHeading': '{name} के गेम',
  'consolesPage.gamesEmpty': 'इस कंसोल के लिए अभी लाइब्रेरी में कोई गेम नहीं है।',
  'consolesPage.gamesEmptyLang': 'इस कंसोल के लिए अभी {lang} में कोई गेम नहीं है।',
  'consolesPage.filterLangLabel': 'भाषा के हिसाब से फ़िल्टर करें',
  'consolesPage.field.released': 'रिलीज़',
  'consolesPage.backToConsoles': 'सभी कंसोल',
  'consolesPage.notFoundTitle': 'कंसोल नहीं मिला',
  'consolesPage.notFound': 'यह कंसोल (अब) साइट का हिस्सा नहीं है।',

  /* 下载页。 */
  'download.heading': 'ROM डाउनलोड करें',
  'download.hint': 'नीचे बटन पर क्लिक करें — डाउनलोड 6 सेकंड बाद शुरू होगा।',
  'download.button': 'डाउनलोड शुरू करें',
  'download.waiting': '{seconds} सेकंड में शुरू…',
  'download.started': 'डाउनलोड शुरू हो गया — ब्राउज़र के डाउनलोड देखें।',
  'download.rights': 'सिर्फ़ वही ROM डाउनलोड करें जिन्हें इस्तेमाल करने की आपको कानूनी अनुमति है।',
  'download.disclaimer':
    'डिस्क्लेमर: इस पेज की सभी ROM फ़ाइलें तीसरे पक्ष से जुटाई गई हैं और सिर्फ़ निजी अध्ययन व बैकअप के लिए हैं। सारे कॉपीराइट उनके मूल प्रकाशकों के हैं; अगर कोई सामग्री आपके अधिकारों का उल्लंघन करती है, तो हटाने के लिए हमसे संपर्क करें।',

  /* 房间页的 ?id= 深链。 */
  'deepLink.notFound': 'वह गेम नहीं मिला — शायद हटा दिया गया है।',
  'deepLink.title': 'गेम लोड हो रहा है',
  'deepLink.loading': 'ROM डाउनलोड हो रही है…',
  'deepLink.hint': 'डाउनलोड पूरा होते ही अपने आप शुरू हो जाएगा।',
};

/**
 * 菲律宾语（fil / Tagalog）界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行，
 * 再往里塞一份谁都翻不动。理由和 `lib/i18n.ja.ts` 当初分出去的一样 ——
 * 代价同样是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序也照抄**。
 *    改文案时**先改 `en`**，再回来逐键对齐这一份（其余几份同理）。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的菲语在内容侧
 *    （数据库 / 源站数据），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` /
 *    `{seconds}` / `{max}` / `{n}` / `{avg}` / `{keyword}` / `{console}` / `{title}` /
 *    `{time}` / `{date}` / `{lang}` / `{ext}` / `{player}` / `{button}` / `{pressed}`）。
 *    菲语语序可以把它们挪位置，但**不能丢、不能改名、不能换成实际值**。
 *
 * ⚠️ **站点名一律写 `Game Hut`，不翻译**。带 `{site}` 的那几条照留占位符，
 *    由调用方替换成 `SITE_NAME[locale]`，别在这里手写站名。
 *
 * ⚠️ `games.remoteSlow` 在 `en` 表里就是**空串**（只有中文版有那句话），
 *    这里照抄空串，别顺手补一句。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → console；developer → developer；series → series
 *   · cartridge → cartridge；room → room；host → host；guest → guest
 *   · netplay → netplay；save → save；key bindings → key bindings
 *   · game library → game library；guestbook → guestbook
 *   · favorites → mga paborito；history → history（本地玩家日常就说 history）
 *
 * ⚠️ 菲律宾语 UI 里**大量英语借词是正常的**（download / save / settings / account /
 *    online / room / file），别硬造生僻的纯 Tagalog 词。动词按 Tagalog 词根 +
 *    常用词缀写：« Maglaro » « I-download » « I-save » « I-load » « I-post »
 *    « Kumpirmahin » « Burahin »。语气按界面短句，简洁直接，不用 emoji。
 *
 * ⚠️ 机种名用**菲律宾玩家的通行写法**（NES / SNES / Game Boy / GBC / GBA / NDS /
 *    Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade）。标签位上取的是 `lib/consoles.ts` 的
 *    `consoleLabel(type, locale)`，和文案同源，别在这里另写一套。
 */

import type { MessageKey } from './i18n';

export const fil: Record<MessageKey, string> = {
  'meta.title':
    '{site} — Maglaro ng Retro Games sa Browser: NES, SNES, GBA at Arcade',
  'meta.description':
    'Maglaro ng NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive at arcade games sa browser. Pumili mula sa online library, o mag-load ng sarili mong ROM file.',
  'meta.keywords':
    'retro games, online retro game library, NES emulator, SNES emulator, SFC emulator, GBA emulator, Game Boy Advance emulator, Game Boy emulator, Game Boy Color emulator, NDS emulator, Nintendo DS emulator, Sega Mega Drive emulator, Sega Genesis emulator, Game Gear emulator, Master System emulator, Sega 32X emulator, WonderSwan emulator, Neo Geo Pocket emulator, PlayStation emulator, PS1 emulator, PSX emulator, arcade emulator, maglaro ng NES sa browser, browser emulator, RetroArch WASM, {site}',
  'seo.room.title': 'Pixel Room — Maglaro ng Retro Games sa Browser',
  'seo.room.description':
    'Pumasok sa pixel room: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive at arcade games sa CRT. Pumili mula sa online library, o i-drop ang sarili mong ROM file sa screen.',
  'seo.login.title': 'Mag-sign in',
  'seo.login.description':
    'Mag-sign in sa account mo para manatiling naka-sync ang mga save, game history at paborito sa lahat ng device.',

  'home.hero.title': 'Maglaro ng classic retro games sa browser',
  'home.hero.lead':
    'May NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade at iba pa sa {site} na malalaro online, kasama ang two-player netplay.',
  'home.hero.play': 'Mag-load ng local ROM',
  'home.hero.browse': 'Tingnan lahat ng laro',
  'home.join.title': 'Maglaro kasama ang kaibigan',
  'home.join.hint': 'Ilagay ang 4-character room code na ibinahagi ng kaibigan mo.',
  'home.join.submit': 'Sumali sa room',
  'home.hero.or': 'O',
  'home.search.label': 'Maghanap sa game library',
  'home.search.placeholder': 'Maghanap ng title / developer / series',
  'home.search.submit': 'Maghanap',
  'home.consoles.title': 'Tingnan ayon sa console',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade at iba pa — pumili ng isa para makita ang mga laro nito.',
  'home.consoles.count': '{count} laro',
  'home.consoles.all': 'Lahat ng console',
  'home.latest.title': 'Mga bagong dagdag',
  'home.latest.lead': 'Ang pinakabagong mga laro sa site.',
  'home.latest.viewAll': 'Lahat ng laro',
  'home.developers.title': 'Tingnan ayon sa developer',
  'home.developers.lead': 'Ang mga studio na ito ang may pinakamaraming laro dito.',
  'home.developers.viewAll': 'Lahat ng developer',
  'home.empty':
    'Walang laman ang library ngayon — buksan ang room at i-drop ang ROM sa CRT para makapaglaro.',
  'home.faq.title': 'Mga madalas itanong',
  'home.faq.q1': 'Libre ba ito?',
  'home.faq.a1':
    'Libre nang buo — bukas lahat ng laro. Kapag nag-sign in ka, may cloud saves ang play history at save files mo.',
  'home.faq.q2': 'Kailangan bang mag-install ng kahit ano?',
  'home.faq.a2': 'Hindi — i-click lang ang isang laro at malalaro agad sa browser.',
  'home.faq.q3': 'Gumagana ba ito sa phone at tablet?',
  'home.faq.a3': 'Oo — gumagana ito sa browser ng phone at tablet.',
  'home.faq.q4': 'Mada-download ko ba ang mga ROM file?',
  'home.faq.a4':
    'Oo — may download button ang bawat page ng laro. I-download lang ang mga ROM file na legal mong gamitin.',
  'home.faq.q5': 'Makakapaglaro ba ako kasama ang kaibigan?',
  'home.faq.a5': 'Siyempre! Isama ang kaibigan at gumawa ng room para sa laban.',
  'home.faq.q6': 'Sinusuportahan ba nito ang game controller?',
  'home.faq.a6':
    'Oo — isaksak ang USB o Bluetooth controller at makikita agad ito ng emulator sa browser. Ang button mapping ay sumusunod sa default ng bawat core; sa phone, gamitin ang on-screen buttons.',

  'seo.heading': 'Maglaro ng retro games sa browser',
  'seo.intro':
    'Ang {site} ay online retro game room. NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive at arcade titles ang tumatakbo mismo sa browser — emulated sa sarili mong machine, gamit ang RetroArch na naka-compile sa WebAssembly.',
  'seo.howTo':
    'Pumili ng laro mula sa online library, o i-drop ang sarili mong ROM file sa television. Wala kang kailangang i-install.',

  'seo.games.title': 'Lahat ng laro — Maglaro ng NES, SNES, GBA at Arcade Online',
  'seo.games.description':
    '{count} retro games sa online library, lahat malalaro sa browser: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade at iba pa. Buksan ang title para sa detalye, maglaro agad, o i-download ang ROM file.',
  'seo.games.search.title': 'Mga resulta para sa “{keyword}”',
  'seo.games.search.description':
    '{count} laro sa online library ang tugma sa “{keyword}”. Malalaro sa browser o mada-download ang ROM file.',
  'seo.games.console.title': '{console} games — Maglaro Online sa Browser',
  'seo.games.console.description':
    '{count} {console} games sa online library, lahat malalaro sa browser o mada-download bilang ROM file.',
  'seo.game.title': '{title} — Maglaro ng {console} Online',
  'seo.game.description':
    'Maglaro ng {title} ({console}) mismo sa browser — libre, walang i-install. Available din ang ROM file para i-download.',
  'seo.gameDownload.title': 'I-download ang {title} ROM ({console})',
  'seo.gameDownload.description':
    'I-download ang ROM file ng {title} ({console}) sa isang click, walang sign-up. Malalaro rin agad sa browser.',
  'seo.developers.title': 'Mga game developer — Maglaro ng NES, SNES, GBA at Arcade games nila',
  'seo.developers.description':
    '{count} developer ng mga laro sa online library. Buksan ang isa para makita lahat ng title namin mula sa studio na iyon.',
  'seo.developer.title': '{name} — Mga laro ng developer na ito',
  'seo.developer.description':
    'Lahat ng {name} na laro sa online library ({count}), malalaro sa browser o mada-download bilang ROM file.',
  'seo.consoles.title': 'Tingnan ayon sa console — Maglaro ng NES, SNES, GBA at Arcade games online',
  'seo.consoles.description':
    'Lahat ng console sa online library ({count} laro sa kabuuan). Pumili ng isa para makita ang lahat ng laro nito, na malalaro sa browser.',
  'seo.console.title': '{name} games — Maglaro online',
  'seo.console.description':
    'Lahat ng {name} na laro sa online library ({count}), malalaro sa browser o mada-download bilang ROM file.',

  'theme.toDark': 'Lumipat sa night mode',
  'theme.toLight': 'Lumipat sa day mode',
  'lamp.turnOn': 'Buksan ang lamp',
  'lamp.turnOff': 'Patayin ang lamp',
  'simple.enter': 'Simple mode: wall, TV, desk at floor lang ang itira',
  'simple.exit': 'Lumabas sa simple mode',
  'tvSize.open': 'Laki ng TV',
  'tvSize.opt.large': 'Malaki',
  'tvSize.opt.medium': 'Katamtaman',
  'tvSize.opt.small': 'Maliit',
  'tvSize.pick': 'Itakda ang laki ng TV sa {level}',
  'locale.label': 'Wika',
  'localePrompt.title': 'Nasa Filipino ang page na ito',
  'localePrompt.body': 'Iba ang gustong wika ng browser mo. Lilipat ba?',
  'localePrompt.keep': 'Manatili sa Filipino',
  'fullscreen.enter': 'I-fullscreen ang game screen',
  'fullscreen.exit': 'Lumabas sa fullscreen',

  'screen.pick': 'I-click para pumili ng ROM file, o i-drop dito',
  'screen.srLabel': 'Pumili ng ROM file na patatakbuhin',
  'screen.tapLoad': 'I-click para mag-load ng local ROM',
  'screen.orLibrary': 'O mag-launch mula sa online library',
  'screen.release': 'Ibitaw para mag-load',
  'screen.mobileLibrary': 'Mag-launch mula sa library',
  'screen.mobileTap': 'I-tap ang screen para buksan ang library',
  'screen.waitingHost': 'Naghihintay sa host',
  'screen.paused': 'Naka-pause',
  'screen.resumeOnPanel': 'Pindutin ang resume sa panel',
  'screen.resumeInPanel': 'Pindutin ang resume sa kanang panel',
  'screen.waitHostResume': 'Naghihintay na i-resume ng host',

  'panel.resume': 'I-resume',
  'panel.pause': 'I-pause',
  'panel.save': 'I-save',
  'panel.load': 'I-load',
  'panel.reset': 'I-reset',
  'panel.eject': 'I-eject',

  'volume.down': 'Bawasan ng isang hakbang ang volume',
  'volume.up': 'Dagdagan ng isang hakbang ang volume',
  'volume.set': 'Itakda ang volume sa {level} ng {max}',

  'saves.title': 'I-load ang save',
  'saves.load': 'I-load',
  'saves.close': 'Isara',
  'saves.groupLocal': 'Sa device na ito',
  'saves.groupCloud': 'Cloud (account)',
  'saves.deleteCloud': 'Burahin ang cloud save na ito',
  'saves.delete': 'Burahin',
  'saves.loginHint':
    'Mag-sign in para may cloud saves at makapagpatuloy sa kahit anong device.',
  'saves.login': 'Mag-sign in',
  'saves.loading': 'Naglo-load…',
  'saves.downloading': 'Dinodownload ang cloud save…',
  'saves.restoring': 'Ibinabalik ang laro…',
  'saves.empty': 'Wala pang save',

  'library.removeLabel': 'Alisin ang {name}',

  'legend.moves': 'paggalaw',
  'legend.open': 'Controls',
  'legend.title': 'Controls',
  'legend.close': 'Isara',
  'legend.needZip':
    'Format  .zip lang ang binabasa ng FBNeo — mukhang {ext} ito. I-repack ito, o kumuha ng .zip na build',
  'play.needZip':
    'Format  Ang ROM na ito ay {ext} archive na hindi ma-unpack — subukan ang .zip o bare ROM',
  'legend.needDisc':
    'Format  Karaniwang multi-file ang disc images (.cue + .bin). Single-file images lang ang tinatanggap ng site na ito — kumuha ng .pbp, .iso o .chd na build',
  'play.needDisc':
    'Format  Multi-file disc image ito (.cue + .bin). Single-file images lang ang gumagana dito — subukan ang .pbp, .iso o .chd na build',
  'legend.needBios':
    'BIOS  Mukhang Neo Geo game ito (KOF, Metal Slug…). Kailangan nito ng neogeo.zip — i-drag ang file na iyon sa page at mai-install ito. Hindi ito kailangan ng CPS1 / CPS2 games.',
  'legend.gamepad':
    'Gamepad  Isaksak lang at gagana — sa magkabilang panig kapag nasa room ka.',

  'netplay.title': 'Netplay',
  'netplay.open': 'Maglaro online',
  'netplay.close': 'Isara',
  'netplay.create': 'Gumawa ng room',
  'netplay.or': 'o',
  'netplay.join': 'Sumali',
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    'Kailangan lang maabot ng magkabilang panig ang public relay — pinakamainam kung parehong LAN. Ipabasa ang 4-character code sa kalaro. Ang host ang nagpapatakbo ng emulator at nag-stream ng picture; hindi kailangan ng guest ang ROM.',
  'netplay.roomCode': 'Room code',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Public internet',
  'netplay.wanDev': 'Under development ang netplay sa public internet.',
  'netplay.quality': 'Kalidad ng stream',
  'netplay.qualitySmooth': 'Smooth',
  'netplay.qualityBalanced': 'Balanced',
  'netplay.qualitySharp': 'Sharp',
  'netplay.qualityHint':
    'Isang machine lang ang nagpapatakbo ng emulator at ng stream (ang host). Kapag hindi ito makasabay, bumabagal ang buong laro (slow motion). Ibaba ng isang level kapag nangyari iyon — sa host lang ito applicable.',
  'netplay.copy': 'Kopyahin',
  'netplay.copied': 'Nakopya',
  'netplay.share': 'I-share',
  'netplay.shareCopied': 'Nakopya ang link',
  'netplay.inviteTitle': 'Imbitasyon sa room',
  'netplay.inviteBody': 'Sumali sa room {code}?',
  'netplay.inviteJoin': 'Sumali',
  'netplay.inviteCancel': 'Kanselahin',
  'netplay.connected': 'Konektado',
  'netplay.waiting': 'Naghihintay sa kalaro',
  'netplay.joining': 'Sumasali sa room…',
  'netplay.waitingGame': 'Konektado — naghihintay sa host na mag-load ng cartridge',
  'netplay.hostPlaying': 'Naglalaro ang host',
  'netplay.paused': 'Naka-pause',
  'netplay.toastHost': 'Konektado · nasa loob na ang kalaro · player 1 ka',
  'netplay.toastGuest': 'Konektado sa host · player 2 ka',
  'netplay.toastHostLeft': 'Umalis ang host — sarado na ang room',
  'netplay.toastGuestLeft': 'Umalis ang player 2 sa room',
  'netplay.youAreHost':
    'Player 1 ka. Mag-load ng cartridge at awtomatikong ipapadala ang picture sa guest. Sarili mong key set ang gamit mo — tingnan ang Controls para sa kasalukuyang bindings.',
  'netplay.youAreGuest':
    'Player 2 ka. Walang kailangang cartridge — ang host ang nag-stream ng picture, at ang input mo ay ipinapadala sa host. Gumamit ng sarili mong key set (ang Player 1 group) o gamepad — tingnan ang Controls.',
  'netplay.leave': 'Umalis sa room',
  'netplay.closeRoom': 'Isara ang room',
  'netplay.badCode': 'Mukhang mali ang code — dapat 4 na character.',
  'netplay.errInsecure':
    'Kailangan ng netplay ang HTTPS o localhost. Nasa plain http ang page na ito, kaya hinaharang ng browser ang crypto API na kailangan nito.',
  'netplay.errNoDirect':
    'Naabot ng magkabilang panig ang relay, pero walang direktang connection na nabuksan — kadalasan NAT o firewall. Pinakamainam kung parehong LAN.',
  'netplay.errPassword': 'Hindi tugma ang room code.',
  'netplay.errHandshake': 'Nag-timeout ang handshake — baka umalis na ang kalaro.',
  'netplay.errHostLeft': 'Umalis ang host sa room — sarado na ito.',
  'netplay.errRoomFull': 'Puno na ang room na iyon — one-on-one lang ang larong ito.',
  'netplay.errUnknown':
    'Hindi makakonekta sa kalaro. Nasa browser console ang eksaktong dahilan.',

  'seo.play.title': 'Play Room — Mag-load ng Laro at Maglaro Online',
  'seo.play.description':
    'Isang screen para simulan ang laro: maglaro nang solo, o magbukas ng 1v1 room at ibahagi ang code. NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive at arcade titles.',
  'play.modeSolo': 'Solo',
  'play.start': 'Simulan',
  'play.confirmStart': 'Kumpirmahin at simulan',
  'play.confirm': 'Kumpirmahin',
  'play.qualityIntro': 'Pumili ng kalidad ng picture para sa online play ayon sa connection mo.',
  'play.qualityHint.smooth': '30 fps · Mas kaunting bandwidth, bagay sa mabagal na connection.',
  'play.qualityHint.balanced': 'Hanggang 720p / 60 fps · Balanse ang linaw at smooth na galaw.',
  'play.qualityHint.sharp': 'Hanggang 60 fps · Pinapahalagahan ang detalye sa orihinal na resolution; kailangan ng mabilis na connection. Baka bumaba ang frame rate sa mabagal na network.',
  'play.qualityConfirmHint': 'Kumpirmahin para kumonekta sa room. Pagkatapos, mag-load ng laro ang host; matatanggap ng guest ang picture ng host.',
  'play.connecting': 'Kumokonekta…',
  'play.confirmJoin': 'Kumpirmahin at sumali',
  'play.cancel': 'Kanselahin',
  'play.screenSize': 'Laki ng screen',
  'play.controlsTitle': 'Mga kontrol sa laro',
  'play.netplayKeysHint': 'Sa online play, sariling Player 1 keys ng bawat player ang gamit.',
  'play.cancelled': 'Kinansela ang pag-load.',
  'play.retry': 'I-load ulit',
  'play.retryJoin': 'Subukang sumali ulit',
  'play.saved': 'Nai-save ang laro.',
  'play.localSaving': 'Nagse-save…',
  'play.uploading': 'Nag-a-upload…',
  'play.cloudFailed': 'Nabigo ang cloud sync.',
  'play.saveNoLogin': 'Mag-sign in para mag-sync',
  'play.tooLarge': 'Masyadong malaki ang save',
  'play.theme': 'Theme',
  'play.saveFailed': 'Hindi mai-save ang laro. Subukan ulit.',
  'play.loadFailed': 'Hindi mai-load ang save. Subukan ulit.',
  'play.leftRoom': 'Umalis ka sa room.',
  'play.latency': 'Latency',
  'play.measuringLatency': 'Sinusukat…',
  'play.downloading': 'Dinodownload ang ROM…',
  'play.booting': 'Sinisimulan ang core…',
  'play.loadFail': 'Nabigo ang pag-load ng cartridge na ito.',
  'play.romIncomplete': 'Hindi kumpleto ang ROM file — i-load ito ulit.',
  'play.notFound': 'Hindi mahanap ang larong iyon.',
  'play.fullscreen': 'Fullscreen',
  'play.volume': 'Volume',
  'play.edit': 'I-edit',
  'play.hideSidebar': 'Itago ang panel',
  'play.showSidebar': 'Ipakita ang panel',
  'play.hint': 'Lalabas ka sa fullscreen kapag pinindot ang Esc. Wala nang ibang keyboard shortcut dito.',
  'play.leaveTitle': 'May larong tumatakbo',
  'play.leaveBody':
    'Kapag bumalik ka, matatapos ang session na ito — hindi awtomatikong nase-save ang progress.',
  'play.leaveStay': 'Magpatuloy sa paglaro',
  'play.leaveGo': 'Umalis',
  'gamesPage.playOnline': 'Maglaro online',

  'keybind.title': 'Key bindings',
  'keybind.open': 'Mga setting ng key',
  'keybind.close': 'Isara',
  'keybind.p1': 'Player 1',
  'keybind.p2': 'Player 2',
  'keybind.mine': 'Mga key mo',
  'keybind.pressKey': 'PINDUTIN…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Ibalik sa default',
  'keybind.reload': 'I-reload ang cartridge',
  'keybind.reloading': 'Nagre-reload…',
  'keybind.unsupported': 'Hindi magamit ang key na iyon — subukan ang iba.',
  'keybind.conflictSame': 'Naka-bind na ang {pressed} sa {button} button — subukan ang ibang key.',
  'keybind.conflictOther':
    'Naka-bind na ang {pressed} sa {button} button ni player {player} — subukan ang ibang key.',
  'keybind.hint':
    'Isang beses lang binabasa ang keyboard map, kapag nag-load ng cartridge — i-reload ito para magkabisa ang mga pagbabago. Hindi pwedeng magpareho ng key ang dalawang player.',
  'keybind.soloHint':
    'Isang beses lang binabasa ang keyboard map, kapag nag-load ng cartridge — i-reload ito para magkabisa ang mga pagbabago.',
  'keybind.hostHint':
    'Ikaw ang host: Player 1 ang sarili mong keys, Player 2 ang ginagawang label ng input ng guest. Hindi pwedeng magpareho sila ng key, kung hindi ay mapapatakbo rin ng injected input ang Player 1 mo. I-reload ang cartridge pagkatapos magbago.',
  'keybind.guestHint':
    'Guest ka at sarili mong key set (ang Player 1 group) ang gamit mo — bawat panig may sariling keyboard, kaya walang magbabangga. Agad na nagkakabisa ang mga pagbabago — hindi kailangang i-reload ang cartridge.',
  'keybind.guestLocalHint':
    'Guest ka, at may sarili kang cartridge na tumatakbo rin dito. Ang keys mo ay ang Player 1 group: sila ang nagpapatakbo ng local cartridge na iyon, kaya i-reload ito pagkatapos magbago — at sila rin ang ipinapadala sa host, na agad nagkakabisa.',

  'games.open': 'Game library',
  'games.title': 'Game library',
  'games.close': 'Isara',
  'games.empty': 'Walang laman ang library — wala pang na-upload',
  'games.loading': 'Naglo-load…',
  'games.loadingRom': 'Naglo-load ng {name}…',
  'games.cancel': 'Kanselahin',
  'games.failed': 'Hindi ma-load ang game library',
  'games.tabLibrary': 'Game library',
  'games.tabHistory': 'History',
  'games.historyEmpty': 'Wala pang nabuksan mula sa library',
  'games.historyLoad': '{name}\nI-click para i-load ulit',
  'games.tabFavorites': 'Mga paborito',
  'games.favorite': 'Idagdag ang {name} sa mga paborito',
  'games.unfavorite': 'Alisin ang {name} sa mga paborito',
  'games.favoritesEmpty': 'Wala pang paborito — i-tap ang star sa kahit anong cover.',
  'games.favoritesSignInBefore': 'Mag-sign in para may mga paborito — ',
  'games.favoritesSignInLink': 'Mag-sign in',
  'games.favoritesSignInAfter': ' dito lang, o gamitin ang account button sa kanang itaas.',

  'user.title': 'Account',
  'user.close': 'Isara',
  'user.open': 'Account — mag-sign in o gumawa ng account',
  'user.openSignedIn': 'Account: {name}',
  'user.tabLogin': 'Mag-sign in',
  'user.tabRegister': 'Gumawa ng account',
  'user.username': 'Username',
  'user.password': 'Password',
  'user.usernameHint': '3–20 character: letters, digits, _ - .',
  'user.emailLabel': 'Email',
  'user.emailHint': 'Ang email mo. Walang + alias, walang temp mail.',
  'user.passwordHint': 'Hindi bababa sa 6 na character, walang space.',
  'user.signIn': 'Mag-sign in',
  'user.signUp': 'Gumawa ng account',
  'user.signingIn': 'Nagsi-sign in…',
  'user.signingUp': 'Ginagawa…',
  'user.signOut': 'Mag-sign out',
  'user.signedInAs': 'Naka-sign in bilang {name}.',
  'user.cloudHint':
    'Naka-store sa account mo ang game history, mga save at paborito — buksan ang kahit anong laro mula sa online library at awtomatikong nag-sync.',
  'user.formLead':
    'Mag-sign in at mananatili sa cloud ang mga save, game history at paborito mo — maglaro kahit kailan, kahit saan!',
  'user.consentLogin': 'Sa pag-sign in, sumasang-ayon ka sa aming ',
  'user.consentRegister': 'Sa paggawa ng account, sumasang-ayon ka sa aming ',
  'user.consentMiddle': ' at ',
  'user.consentAfter': '.',

  'user.error.failed': 'May naging problema — subukan ulit.',
  'user.error.missingCredentials': 'Ilagay ang username at password.',
  'user.error.usernameInvalid': 'Letters, digits, _ - at . lang ang pwedeng gamitin sa username.',
  'user.error.usernameTooShort': 'Masyadong maikli ang username (hindi bababa sa 3 character).',
  'user.error.usernameTooLong': 'Masyadong mahaba ang username (hanggang 20 character).',
  'user.error.usernameTaken': 'Nakuha na ang username na iyon — pumili ng iba.',
  'user.error.emailInvalid': 'Maglagay ng valid na email address.',
  'user.error.emailAlias': 'Hindi pinapayagan ang alias emails (tulad ng name+tag@… o Gmail na may tuldok).',
  'user.error.emailTemp': 'Hindi pinapayagan ang disposable email provider — gamitin ang regular mong mailbox.',
  'user.error.passwordInvalid': 'Maglagay ng password.',
  'user.error.passwordTooShort': 'Masyadong maikli ang password (hindi bababa sa 6 character).',
  'user.error.passwordTooLong': 'Masyadong mahaba ang password (hanggang 72 character).',
  'user.error.passwordHasSpace': 'Walang pwedeng space sa password.',
  'user.error.invalidCredentials': 'Mali ang username o password.',
  'user.error.banned': 'Na-suspend ang account na ito.',
  'user.error.captchaRequired': 'Kumpletuhin muna ang human verification.',
  'user.error.captchaFailed': 'Nabigo ang human verification — subukan ulit.',

  'login.lead':
    'Mag-sign in at mananatili sa cloud ang mga save, game history at paborito mo — maglaro kahit kailan, kahit saan. Wala pang account? Gumawa ng isa.',

  'account.title': 'Ang account mo',
  'account.loading': 'Naglo-load…',
  'account.failed': 'May naging problema — subukan ulit.',
  'account.since': 'Miyembro mula {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Standard',
  'account.vipUntil': 'VIP hanggang {time}',
  'account.vipExpired': 'Nag-expire ang VIP noong {time}',
  'account.tabFavorites': 'Mga paborito',
  'account.tabHistory': 'History',
  'account.tabSaves': 'Mga save',
  'account.tabProfile': 'Profile',
  'account.tabPassword': 'Password',
  'account.favoritesLoading': 'Naglo-load ng mga paborito…',
  'account.historyLoading': 'Naglo-load ng history…',
  'account.savesLoading': 'Naglo-load ng mga save…',

  'account.favoritesEmpty':
    'Wala pang paborito — buksan ang game library sa room at i-tap ang star sa isang cover.',
  'account.unfavorite': 'Alisin ang {name} sa mga paborito',

  'account.historyEmpty': 'Wala pang play history — dito lumalabas ang mga larong binuksan mo mula sa online library.',
  'account.historyCount': '{count} laro ang nalaro kamakailan',
  'account.historyDeleted': 'Inalis sa history.',
  'account.clearHistory': 'Burahin lahat',
  'account.confirmClearHistory': 'Burahin talaga lahat?',
  'account.historyCleared': 'Nabura ang history.',
  'account.historyHint':
    'Tinatago ng history ang {max} pinakahuling nalaro mong laro — kapag nilaro mo ulit ang mas luma, babalik ito sa itaas.',

  'account.savesEmpty': 'Wala pang cloud save.',
  'account.savesCount': '{count} save sa kabuuan',
  'account.savesGroupCount': '{count} save',
  'account.viewGame': 'Tingnan ang {name}',
  'account.savesHint':
    'Isang save bawat laro — kapag nag-save ka ulit, napapalitan ito. Ganoon din sa local at sa cloud.',
  'account.saveDeleted': 'Nabura ang save.',
  'account.clearSaves': 'Burahin lahat',
  'account.confirmClearSaves': 'Burahin talaga lahat?',
  'account.savesCleared': 'Nabura ang {count} save.',
  'account.delete': 'Burahin',
  'account.confirmDelete': 'Burahin talaga?',

  'account.avatar': 'Avatar',
  'account.chooseImage': 'Pumili ng image',
  'account.clearAvatar': 'Alisin ang avatar',
  'account.uploading': 'Nag-a-upload…',
  'account.avatarSaved': 'Na-update ang avatar.',
  'account.avatarCleared': 'Naalis ang avatar.',
  'account.avatarHint': 'PNG, JPEG, WebP o GIF, hanggang 2 MB.',
  'account.gender': 'Kasarian',
  'account.genderNone': 'Hindi tinukoy',
  'account.genderMale': 'Lalaki',
  'account.genderFemale': 'Babae',
  'account.genderSaved': 'Na-save.',
  'account.genderHint': 'Opsyonal — ikaw lang ang nakakakita.',
  'account.passwordTabHint': 'Mananatili kang naka-sign in sa device na ito pagkatapos — hindi mo na kailangang mag-log in ulit.',
  'account.password': 'Password',
  'account.oldPassword': 'Kasalukuyang password',
  'account.newPassword': 'Bagong password',
  'account.confirmPassword': 'Ulitin ang bagong password',
  'account.savePassword': 'Palitan ang password',
  'account.saving': 'Nagse-save…',
  'account.passwordSaved': 'Napalitan ang password.',
  'account.passwordHint':
    'Mananatili kang naka-sign in sa device na ito pagkatapos palitan. Patuloy pa ring gagana ang ibang naka-sign in na device hanggang mag-expire ang session nila.',

  'account.error.missingOld': 'Ilagay ang kasalukuyang password.',
  'account.error.wrongPassword': 'Mali ang kasalukuyang password.',
  'account.error.passwordTooShort': 'Masyadong maikli ang bagong password (hindi bababa sa 6 character).',
  'account.error.passwordTooLong': 'Masyadong mahaba ang bagong password (hanggang 72 character).',
  'account.error.passwordHasSpace': 'Walang pwedeng space sa bagong password.',
  'account.error.mismatch': 'Hindi tugma ang dalawang bagong password.',
  'account.error.avatarMissing': 'Pumili muna ng image.',
  'account.error.avatarTooLarge': 'Masyadong malaki ang image (2 MB max).',
  'account.error.avatarType': 'Hindi sinusuportahang format — gamitin ang PNG, JPEG, WebP o GIF.',

  'games.filterAll': 'Lahat',
  'games.searchPlaceholder': 'Maghanap ng title / developer / series',
  'games.search': 'Maghanap',
  'games.noMatch': 'Walang tugmang laro.',
  'games.prev': 'Nauna',
  'games.next': 'Susunod',
  'games.remoteSlow': '',

  'note.text': 'Sana mahanap ulit nating lahat ang saya noong bata pa tayo..',
  'note.open': 'Basahin ang note sa sahig',
  'note.title': 'Isang note',
  'note.close': 'Isara',
  'window.cycle': 'Palitan ang season sa labas',
  'painting.open': 'Silipin nang malapitan ang painting',
  'painting.close': 'Isara',
  'painting.title.sunflowers': 'Sunflowers',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'Mona Lisa',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'The Starry Night',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'The Scream',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'Girl with a Pearl Earring',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'The Great Wave off Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Isang painting na walang pangalan mula sa kung saan',
  'painting.artist.unknown': 'Hindi kilala',
  'mp4.play': 'Magpatugtog ng kanta sa MP4 player',
  'mp4.pause': 'I-pause ang MP4 player',

  'cat.wand': 'Iwagayway ang cat wand sa sahig',
  'cat.ragdoll': 'May ragdoll na sumusilip mula sa likod ng mga libro',
  'cat.siamese': 'May Siamese na sumusilip mula sa likod ng mga libro',
  'cat.tabby': 'May tabby na sumusilip mula sa likod ng mga libro',
  'cat.orange': 'May orange tabby na sumusilip mula sa likod ng mga libro',
  'cat.american': 'May American shorthair na sumusilip mula sa likod ng mga libro',
  'cat.tuxedo': 'May tuxedo cat na sumusilip mula sa likod ng mga libro',
  'cat.calico': 'May calico na sumusilip mula sa likod ng mga libro',

  'feedback.open': 'Basahin ang guestbook sa sahig',
  'feedback.title': 'Guestbook',
  'feedback.close': 'Isara',
  'feedback.placeholder': 'Magsulat ng kahit ano — suggestion, o larong gusto mong makita dito…',
  'feedback.submit': 'I-post',
  'feedback.submitting': 'Nagpo-post…',
  'feedback.ok': 'Nai-post — salamat!',
  'feedback.required': 'Magsulat muna ng kahit ano.',
  'feedback.failed': 'Hindi mai-post — subukan ulit.',
  'feedback.loading': 'Naglo-load…',
  'feedback.empty': 'Wala pang mensahe — maging unang magsulat.',
  'feedback.retry': 'Subukan ulit',
  'feedback.prev': 'Nauna',
  'feedback.next': 'Susunod',
  'feedback.page': 'Pahina {n}',
  'feedback.resolved': 'Resolved',
  'feedback.unresolved': 'Open',

  'legal.privacy': 'Privacy Policy',
  'legal.terms': 'Terms of Service',
  'legal.updated': 'Huling na-update {date}',
  'legal.contact': 'Kontakin kami:',

  'tour.title': 'Mabilis na tour',
  'tour.skip': 'Laktawan',
  'tour.back': 'Bumalik',
  'tour.next': 'Susunod',
  'tour.done': 'Simulan ang paglaro',
  'tour.replay': 'Ipakita ulit ang tour',
  'tour.screen.title': 'Magsimula sa isang laro',
  'tour.screen.body':
    'I-drag ang ROM file (.nes, .sfc, .gba, .md, .gb …) o arcade .zip sa TV, o i-click lang ang screen para pumili ng file. Walang ROM na kasama sa repo na ito — gamitin ang sarili mo.',
  'tour.rail.title': 'Ang rail ng switch',
  'tour.rail.body':
    'Tatlong grupo, mula taas pababa. Tingnan: theme (night / day), wika (中文 / English / 日本語 / 한국어), Fullscreen (ang screen mismo ang nag-fullscreen), Simple mode (wall, TV, desk at floor lang ang itira), laki ng TV (nagbubukas ng malaki / katamtaman / maliit na picker — lumalapad ang desk kasabay nito). Mga laro: Netplay, Key bindings. Tulong: Controls, at ang Guestbook.',

  'topLinks.label': 'Mga page ng site',
  'topLinks.games': 'Listahan ng laro',
  'menu.open': 'Buksan ang menu',
  'menu.close': 'Isara ang menu',
  'menu.theme': 'Theme',
  'menu.simple': 'Simple mode',

  'leave.title': 'Lalabas sa page na ito?',
  'leave.bodyGame': 'Mapuputol ang tumatakbong laro — hindi nase-save ang progress.',
  'leave.bodyNetplay': 'Lalabas ka sa netplay room, at madidiskonekta ang kalaro mo.',
  'leave.stay': 'Manatili',
  'leave.confirm': 'Umalis',

  'gamesPage.heading': 'Lahat ng laro',
  'gamesPage.intro':
    '{count} laro sa online library — NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade at iba pa. I-click ang cover para sa detalye, o maglaro agad.',
  'gamesPage.empty': 'Walang laman ang library ngayon.',
  'gamesPage.introConsole':
    '{count} {console} na laro sa library. I-click ang cover para sa detalye, o maglaro agad.',
  'gamesPage.filterLabel': 'I-filter ayon sa console',
  'gamesPage.filterAll': 'Lahat',
  'gamesPage.consoleEmpty': 'Wala pang {console} na laro sa library.',
  'gamesPage.searchLabel': 'Maghanap sa game library',
  'gamesPage.searchPlaceholder': 'Maghanap ng title / developer / series',
  'gamesPage.searchSubmit': 'Maghanap',
  'gamesPage.searchLoading': 'Naghahanap…',
  'gamesPage.searchClear': 'Burahin ang search',
  'gamesPage.searchResults': '“{keyword}” — {count} tugmang laro.',
  'gamesPage.searchEmpty': 'Walang larong tugma sa “{keyword}”. Subukan ang mas maikling salita, o ang title ng laro.',
  'gamesPage.prev': 'Nauna',
  'gamesPage.next': 'Susunod',
  'gamesPage.backHome': 'Bumalik sa home',
  'gamesPage.backToGames': 'Lahat ng laro',
  'common.back': 'Bumalik',
  'common.home': 'Home',
  'gamesPage.play': 'Maglaro ngayon',
  'gamesPage.download': 'I-download ang ROM',
  'gamesPage.share': 'I-share ang larong ito',
  'gamesPage.shareCopied': 'Nakopya ang link',
  'gamesPage.shareFailed': 'Nabigo ang pagkopya',
  'gamesPage.favorite': 'Idagdag sa mga paborito',
  'gamesPage.unfavorite': 'Alisin sa mga paborito',
  'gamesPage.favoriteSignIn': 'Mag-sign in para i-save ang mga paborito — gamitin ang sign-in button sa itaas.',
  'gamesPage.favoriteFailed': 'Hindi ma-update ang mga paborito — subukan ulit.',
  'gamesPage.favoriteCount': '{n} ang nasa listahan ng paborito',
  'gamesPage.report': 'I-report ang problema',
  'gamesPage.reportTitle': 'I-report ang problema',
  'gamesPage.reportSubject': 'Tungkol sa: {name}',
  'gamesPage.reportPlaceholder':
    'Ano ang naging problema? Halimbawa: hindi ito mag-start, sira ang picture, walang tunog…',
  'gamesPage.reportSubmit': 'Ipadala ang report',
  'gamesPage.reportSubmitting': 'Ipinapadala…',
  'gamesPage.reportOk': 'Salamat — titingnan namin ito.',
  'gamesPage.reportRequired': 'Ilarawan muna ang problema.',
  'gamesPage.reportFailed': 'Hindi maipadala — subukan ulit.',
  'gamesPage.reportClose': 'Kanselahin',

  'comments.heading': 'Mga komento',
  'comments.count': '{n} komento',
  'comments.empty': 'Wala pang komento — maging una.',
  'comments.placeholder': 'Ano sa tingin mo sa larong ito?',
  'comments.ratingLabel': 'Rating mo',
  'comments.ratingStar': 'I-rate ng {n} sa 5',
  'comments.ratingValue': '{n} sa 5 stars',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Pumili muna ng star rating.',
  'comments.submit': 'I-post ang komento',
  'comments.submitting': 'Nagpo-post…',
  'comments.ok': 'Nai-post — nasa itaas ito ng listahan.',
  'comments.required': 'Magsulat muna ng kahit ano.',
  'comments.failed': 'Hindi mai-post — subukan ulit.',
  'comments.signInLead': 'Mag-sign in para makapag-post ng komento.',
  'comments.signIn': 'Mag-sign in',
  'comments.signInRequired': 'Mag-sign in ulit para makapag-post.',
  'comments.loading': 'Naglo-load ng mga komento…',
  'comments.retry': 'Subukan ulit',
  'comments.loadFailed': 'Hindi ma-load ang mga komento.',
  'comments.loadMore': 'Mag-load pa',
  'comments.delete': 'Burahin',
  'comments.deleteConfirm': 'Kumpirmahin',
  'comments.cancel': 'Kanselahin',
  'comments.deleted': 'Naalis ang komento.',
  'comments.deleteFailed': 'Hindi mabura — subukan ulit.',
  'gamesPage.field.console': 'Console',
  'gamesPage.field.year': 'Taon',
  'gamesPage.field.developer': 'Developer',
  'gamesPage.field.series': 'Series',
  'gamesPage.field.language': 'Wika',
  'gamesPage.controls': 'Controls',
  'gamesPage.selectLanguage': 'Pumili ng wika',
  'notFound.title': 'Hindi mahanap ang page',
  'notFound.description':
    'Wala ang address na iyon sa {site}. Tingnan ang link, o bumalik sa home page.',
  'gamesPage.notFoundTitle': 'Hindi mahanap ang laro',
  'gamesPage.notFound': 'Wala na (o wala pa) ang larong ito sa library.',
  'gamesPage.fallbackDescription': 'Ang {title} ay isang {console} na laro.',

  'developersPage.heading': 'Mga developer',
  'developersPage.intro':
    '{count} developer ng mga laro sa library. Buksan ang isa para makita lahat ng mayroon kami mula sa studio na iyon.',
  'developersPage.empty': 'Wala pang naka-listang developer.',
  'developersPage.gameCount': '{count} laro',
  'developersPage.gamesHeading': 'Mga laro mula sa {name}',
  'developersPage.gamesEmpty': 'Wala pang laro mula sa developer na ito sa library.',
  'developersPage.field.founded': 'Itinatag',
  'developersPage.backToDevelopers': 'Lahat ng developer',
  'developersPage.notFoundTitle': 'Hindi mahanap ang developer',
  'developersPage.notFound': 'Wala na (o wala pa) ang developer na ito sa library.',

  'consolesPage.heading': 'Mga console',
  'consolesPage.intro':
    'Ang mga console sa library — {count} laro sa kabuuan. Buksan ang isa para makita ang lahat ng title na kaya nitong patakbuhin.',
  'consolesPage.gameCount': '{count} laro',
  'consolesPage.gamesHeading': 'Mga laro sa {name}',
  'consolesPage.gamesEmpty': 'Wala pang laro para sa console na ito sa library.',
  'consolesPage.gamesEmptyLang': 'Wala pang {lang} na laro para sa console na ito.',
  'consolesPage.filterLangLabel': 'I-filter ayon sa wika',
  'consolesPage.field.released': 'Inilabas',
  'consolesPage.backToConsoles': 'Lahat ng console',
  'consolesPage.notFoundTitle': 'Hindi mahanap ang console',
  'consolesPage.notFound': 'Hindi na (o hindi pa) bahagi ng site ang console na ito.',

  'download.heading': 'I-download ang ROM',
  'download.hint': 'I-click ang button sa ibaba — magsisimula ang download pagkalipas ng 6 na segundo.',
  'download.button': 'Simulan ang download',
  'download.waiting': 'Magsisimula sa {seconds}s…',
  'download.started': 'Nagsimula ang download — tingnan ang downloads ng browser mo.',
  'download.rights': 'I-download lang ang mga ROM file na legal mong gamitin.',
  'download.disclaimer':
    'Disclaimer: ang lahat ng ROM file sa page na ito ay nakolekta mula sa third party at para sa personal na pag-aaral at backup lamang. Pag-aari ng orihinal na publisher ang lahat ng copyright; kung may content na lumalabag sa karapatan mo, kontakin kami para maalis ito.',
  'deepLink.notFound': 'Hindi mahanap ang larong iyon — baka naalis na ito.',
  'deepLink.title': 'Naglo-load ng laro',
  'deepLink.loading': 'Dinodownload ang ROM…',
  'deepLink.hint': 'Awtomatikong magsisimula kapag natapos ang download.',
};

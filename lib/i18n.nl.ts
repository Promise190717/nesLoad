/**
 * 荷兰语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再加一份进来只会更难翻。理由和 `lib/i18n.ja.ts` / `lib/i18n.ko.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致，顺序也照它排**（558 个，不多不少）。
 *    改文案时先改 `en`，再回来对齐 —— zh / ja / ko / nl 四份都一样。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的荷兰语在数据库里
 *    （`game_texts` 的行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` /
 *    `{seconds}` …），可以按荷兰语语序挪位置，但不能丢、不能改名、不能换成实际值 ——
 *    它们由 `translate()` 在运行时替换；漏掉一个不会报错，只会在页面上少一段字。
 *
 * ⚠️ 站名统一写 `Game Hut`（**不翻译**），`{site}` 占位符照留。站名的唯一出处是
 *    `lib/i18n.ts` 的 `SITE_NAME`，别在这里另写一种拼法。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → console；developer → ontwikkelaar；series → serie
 *   · cartridge → cartridge；room → kamer；host → host；guest → gast
 *   · netplay → netplay；save → save（动词 opslaan）；key bindings → toetsindeling
 *   · game library → gamebibliotheek；guestbook → gastenboek；screen → scherm
 *   · 语气：界面短句，按钮一律不定式（Spelen / Downloaden / Verwijderen），
 *     称呼用「je」不用「u」——这是游戏站，不是公文。
 *
 * ⚠️ 机种名用**荷兰语玩家的通行写法**（NES / SNES / Game Boy / GBC / GBA / NDS /
 *    Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade）。标签位上取的是 `lib/consoles.ts` 的
 *    `consoleLabel(type, locale)`，和文案同源，别在这儿另写一套。
 *
 * ⚠️ 这份表**还没挂进 `lib/i18n.ts`**（`LOCALES` / `messages` / `LOCALE_OPTIONS` 目前
 *    仍是四份）：本次只新建文件。真要开荷兰语站，除了在这里 import，还得给 `Locale`
 *    加 `'nl'`，并补 `LOCALE_PREFIX` / `SITE_NAME` / `LOCALE_OPTIONS` /
 *    `LOCALE_SWITCH_LABEL` / `HTML_LANG` / `OG_LOCALE` / `DATE_LOCALE`。
 */

import type { MessageKey } from './i18n';

export const nl: Record<MessageKey, string> = {
  'meta.title': '{site} — Retrospellen in je browser: NES, SNES, GBA en arcade',
  'meta.description':
    'Speel NES, SNES, Game Boy, GBA, Mega Drive en arcadegames in je browser. Kies een titel uit de online bibliotheek of laad je eigen ROM-bestand.',
  'meta.keywords':
    'retrospellen, online spellencollectie, NES-emulator, SNES-emulator, SFC-emulator, GBA-emulator, Game Boy Advance-emulator, Game Boy-emulator, Game Boy Color-emulator, NDS-emulator, Nintendo DS-emulator, Sega Mega Drive-emulator, Sega Genesis-emulator, Game Gear-emulator, Master System-emulator, Sega 32X-emulator, WonderSwan-emulator, Neo Geo Pocket-emulator, PlayStation-emulator, PS1-emulator, PSX-emulator, arcade-emulator, NES spelen in de browser, browser-emulator, RetroArch WASM, {site}',
  'seo.room.title': 'Pixelkamer — Retrospellen in je browser',
  'seo.room.description':
    'Stap de pixelkamer binnen: NES, SNES, Game Boy, GBA, Mega Drive en arcadegames draaien op de CRT. Kies een titel uit de online bibliotheek of sleep je eigen ROM-bestand naar het scherm.',
  'seo.login.title': 'Inloggen',
  'seo.login.description':
    'Log in op je account om saves, speelgeschiedenis en favorieten op al je apparaten synchroon te houden.',
  'home.hero.title': 'Speel klassieke retrospellen in je browser',
  'home.hero.lead':
    '{site} heeft NES, SNES, Game Boy, GBA, Mega Drive, arcade en meer om online te spelen, met netplay voor twee spelers.',
  'home.hero.play': 'Lokale ROM laden',
  'home.hero.browse': 'Alle games bekijken',
  'home.join.title': 'Speel met een vriend',
  'home.join.hint': 'Voer de kamercode van 4 tekens in die je vriend met je deelde.',
  'home.join.submit': 'Deelnemen',
  'home.hero.or': 'OF',
  'home.search.label': 'Zoek in de gamebibliotheek',
  'home.search.placeholder': 'Zoek op titel / ontwikkelaar / serie',
  'home.search.submit': 'Zoeken',
  'home.consoles.title': 'Blader per console',
  'home.consoles.lead':
    'NES, SNES, Game Boy, GBA, Mega Drive, arcade en meer — kies er een om de games te zien.',
  'home.consoles.count': '{count} games',
  'home.consoles.all': 'Alle consoles',
  'home.latest.title': 'Nieuw toegevoegd',
  'home.latest.lead': 'De nieuwste games op de site.',
  'home.latest.viewAll': 'Alle games',
  'home.developers.title': 'Blader per ontwikkelaar',
  'home.developers.lead': 'Deze studio’s hebben hier de meeste games.',
  'home.developers.viewAll': 'Alle ontwikkelaars',
  'home.empty':
    'De bibliotheek is nu leeg — open de kamer en sleep een ROM naar de CRT om te beginnen.',
  'home.faq.title': 'Veelgestelde vragen',
  'home.faq.q1': 'Is het gratis?',
  'home.faq.a1':
    'Helemaal gratis — elke game is vrij te spelen. Met een account krijg je cloudsaves voor je speelgeschiedenis en savebestanden.',
  'home.faq.q2': 'Moet ik iets installeren?',
  'home.faq.a2': 'Nee — klik op een game en speel hem meteen in je browser.',
  'home.faq.q3': 'Werkt het op telefoons en tablets?',
  'home.faq.a3': 'Ja — het werkt gewoon in de browser op telefoons en tablets.',
  'home.faq.q4': 'Kan ik de ROM-bestanden downloaden?',
  'home.faq.a4':
    'Ja — elke gamepagina heeft een downloadknop. Download alleen ROM-bestanden die je wettelijk mag gebruiken.',
  'home.faq.q5': 'Kan ik met een vriend spelen?',
  'home.faq.a5': 'Natuurlijk! Pak een vriend erbij en open een kamer voor een potje.',
  'home.faq.q6': 'Werkt het met gamecontrollers?',
  'home.faq.a6':
    'Ja — sluit een USB- of bluetoothcontroller aan en de emulator pikt hem via je browser op. De toetsen volgen de standaardwaarden van elke core; op een telefoon gebruik je de knoppen op het scherm.',
  'seo.heading': 'Speel retrospellen in je browser',
  'seo.intro':
    '{site} is een online retrogamekamer. NES, SNES, Game Boy, GBA, Mega Drive en arcadegames draaien gewoon in de browser — geëmuleerd op je eigen machine, met RetroArch gecompileerd naar WebAssembly.',
  'seo.howTo':
    'Kies een game uit de online bibliotheek, of sleep je eigen ROM-bestand naar de televisie. Niets te installeren.',
  'seo.games.title': 'Alle games — speel NES, SNES, GBA en arcade online',
  'seo.games.description':
    '{count} retrospellen in de online bibliotheek, allemaal speelbaar in je browser: NES, SNES, Game Boy, GBA, Mega Drive, arcade en meer. Open een titel voor details, speel meteen of download het ROM-bestand.',
  'seo.games.search.title': 'Zoekresultaten voor “{keyword}”',
  'seo.games.search.description':
    '{count} games in de online bibliotheek komen overeen met “{keyword}”. Speel ze in je browser of download het ROM-bestand.',
  'seo.games.console.title': '{console}-games — speel online in je browser',
  'seo.games.console.description':
    '{count} {console}-games in de online bibliotheek, allemaal speelbaar in je browser of te downloaden als ROM-bestand.',
  'seo.game.title': '{title} — speel {console} online',
  'seo.game.description':
    'Speel {title} ({console}) direct in je browser — gratis, niets te installeren. Het ROM-bestand is ook te downloaden.',
  'seo.gameDownload.title': 'Download de ROM van {title} ({console})',
  'seo.gameDownload.description':
    'Download het ROM-bestand van {title} ({console}) met één klik, zonder account. Je kunt het ook direct in je browser spelen.',
  'seo.developers.title': 'Gameontwikkelaars — speel hun NES-, SNES-, GBA- en arcadegames',
  'seo.developers.description':
    '{count} ontwikkelaars achter de games in de online bibliotheek. Open er een om alle titels van die studio te zien.',
  'seo.developer.title': '{name} — games van deze ontwikkelaar',
  'seo.developer.description':
    'Alle {name}-games in de online bibliotheek ({count}), speelbaar in je browser of te downloaden als ROM-bestand.',
  'seo.consoles.title': 'Blader per console — speel NES-, SNES-, GBA- en arcadegames online',
  'seo.consoles.description':
    'Elke console in de online bibliotheek ({count} games in totaal). Kies er een om alle games te zien, speelbaar in je browser.',
  'seo.console.title': '{name}-games — speel online',
  'seo.console.description':
    'Alle {name}-games in de online bibliotheek ({count}), speelbaar in je browser of te downloaden als ROM-bestand.',

  'theme.toDark': 'Naar nachtmodus',
  'theme.toLight': 'Naar dagmodus',
  'lamp.turnOn': 'Lamp aanzetten',
  'lamp.turnOff': 'Lamp uitzetten',
  'simple.enter': 'Eenvoudige modus: alleen muur, tv, bureau en vloer',
  'simple.exit': 'Eenvoudige modus verlaten',
  'tvSize.open': 'TV-grootte',
  'tvSize.opt.large': 'Groot',
  'tvSize.opt.medium': 'Middel',
  'tvSize.opt.small': 'Klein',
  'tvSize.pick': 'Zet de TV-grootte op {level}',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Taal',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟**当前页面语言**，只有那颗钮跟**目标语言**（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'Deze pagina is in het Nederlands',
  'localePrompt.body': 'Je browser heeft een andere taalvoorkeur. Wil je wisselen?',
  'localePrompt.keep': 'In het Nederlands blijven',
  'fullscreen.enter': 'Spelscherm op volledig scherm',
  'fullscreen.exit': 'Volledig scherm verlaten',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P）—— 英文那侧全大写，
   * 荷兰语沿用大写（拉丁字母有大小写，这一点和日语不同）。
   */
  'screen.pick': 'Klik om een ROM-bestand te kiezen, of sleep er een hierheen',
  'screen.srLabel': 'Kies een ROM-bestand om te starten',
  'screen.tapLoad': 'KLIK OM EEN LOKALE ROM TE LADEN',
  'screen.orLibrary': 'OF START UIT DE ONLINE BIBLIOTHEEK',
  'screen.release': 'LAAT LOS OM TE LADEN',
  'screen.mobileLibrary': 'START UIT DE BIBLIOTHEEK',
  'screen.mobileTap': 'TIK OP HET SCHERM OM DE BIBLIOTHEEK TE OPENEN',
  'screen.waitingHost': 'WACHTEN OP HOST',
  'screen.paused': 'GEPAUZEERD',
  'screen.resumeOnPanel': 'DRUK OP HERVATTEN OP HET PANEEL',
  'screen.resumeInPanel': 'DRUK OP HERVATTEN IN HET RECHTERPANEEL',
  'screen.waitHostResume': 'WACHTEN TOT DE HOST HERVAT',

  /* 机身面板那排钮 */
  'panel.resume': 'Hervatten',
  'panel.pause': 'Pauzeren',
  'panel.save': 'Opslaan',
  'panel.load': 'Laden',
  'panel.reset': 'Reset',
  'panel.eject': 'Uitwerpen',
  'volume.down': 'Volume een stap lager',
  'volume.up': 'Volume een stap hoger',
  'volume.set': 'Zet het volume op {level} van {max}',

  'saves.title': 'Save laden',
  'saves.load': 'Laden',
  'saves.close': 'Sluiten',
  'saves.groupLocal': 'Dit apparaat',
  'saves.groupCloud': 'Cloud (account)',
  'saves.deleteCloud': 'Deze cloudsave verwijderen',
  'saves.delete': 'Verwijderen',
  'saves.loginHint':
    'Log in om cloudsaves te bewaren en op elk apparaat verder te spelen.',
  'saves.login': 'Inloggen',
  'saves.loading': 'Laden…',
  'saves.downloading': 'Cloudsave downloaden…',
  'saves.restoring': 'Game herstellen…',
  'saves.empty': 'Nog geen save',

  'library.removeLabel': '{name} verwijderen',

  'legend.moves': 'bewegen',
  'legend.open': 'Besturing',
  'legend.title': 'Besturing',
  'legend.close': 'Sluiten',
  'legend.needZip':
    'Formaat  FBNeo leest alleen .zip — dit lijkt een {ext}. Pak het opnieuw in, of gebruik een .zip-versie',
  'play.needZip':
    'Formaat  Deze ROM is een {ext}-archief dat niet uitgepakt kon worden — probeer een .zip of een losse ROM',
  'legend.needDisc':
    'Formaat  Schijfimages bestaan meestal uit meerdere bestanden (.cue + .bin). Deze site neemt alleen single-file images — gebruik een .pbp-, .iso- of .chd-versie',
  'play.needDisc':
    'Formaat  Dit is een schijfimage met meerdere bestanden (.cue + .bin). Alleen single-file images werken hier — probeer een .pbp-, .iso- of .chd-versie',
  'legend.needBios':
    'BIOS  Dit lijkt een Neo Geo-game (KOF, Metal Slug…). Er is neogeo.zip nodig — sleep dat bestand naar de pagina en het wordt geïnstalleerd. CPS1- / CPS2-games hebben het niet nodig.',
  'legend.gamepad':
    'Controller  Aansluiten en het werkt — aan beide kanten als je in een kamer zit.',

  'netplay.title': 'Netplay',
  'netplay.open': 'Online spelen',
  'netplay.close': 'Sluiten',
  'netplay.create': 'Kamer aanmaken',
  'netplay.or': 'of',
  'netplay.join': 'Deelnemen',
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    'Beide kanten hoeven alleen de publieke relay te bereiken — hetzelfde LAN werkt het best. Lees de code van 4 tekens voor aan de andere speler. De host draait de emulator en streamt het beeld; de gast heeft de ROM niet nodig.',
  'netplay.roomCode': 'Kamercode',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Openbaar internet',
  'netplay.wanDev': 'Netplay via het openbare internet is in ontwikkeling.',
  'netplay.quality': 'Streamkwaliteit',
  'netplay.qualitySmooth': 'Vloeiend',
  'netplay.qualityBalanced': 'Gebalanceerd',
  'netplay.qualitySharp': 'Scherp',
  'netplay.qualityHint':
    'De host draait de emulator en de stream op één machine. Kan die het niet bijhouden, dan vertraagt het hele spel (slow motion). Zet dan een niveau lager — dit geldt alleen voor de host.',
  'netplay.copy': 'Kopiëren',
  'netplay.copied': 'Gekopieerd',
  'netplay.share': 'Delen',
  'netplay.shareCopied': 'Link gekopieerd',
  'netplay.inviteTitle': 'Kameruitnodiging',
  'netplay.inviteBody': 'Deelnemen aan kamer {code}?',
  'netplay.inviteJoin': 'Deelnemen',
  'netplay.inviteCancel': 'Annuleren',
  'netplay.connected': 'Verbonden',
  'netplay.waiting': 'Wachten op de andere speler',
  'netplay.joining': 'Bezig met deelnemen aan de kamer…',
  'netplay.waitingGame': 'Verbonden — wachten tot de host een cartridge laadt',
  'netplay.hostPlaying': 'Host speelt',
  'netplay.paused': 'Gepauzeerd',
  'netplay.toastHost': 'Verbonden · de andere speler is er · jij bent speler 1',
  'netplay.toastGuest': 'Verbonden met de host · jij bent speler 2',
  'netplay.toastHostLeft': 'De host is weg — de kamer is gesloten',
  'netplay.toastGuestLeft': 'Speler 2 heeft de kamer verlaten',
  'netplay.youAreHost':
    'Jij bent speler 1. Laad een cartridge en het beeld gaat automatisch naar de gast. Je speelt met je eigen toetsen — zie Besturing voor de huidige indeling.',
  'netplay.youAreGuest':
    'Jij bent speler 2. Geen cartridge nodig — de host streamt het beeld en jouw invoer gaat naar de host. Speel met je eigen toetsen (de groep van speler 1) of met een controller — zie Besturing.',
  'netplay.leave': 'Kamer verlaten',
  'netplay.closeRoom': 'Kamer sluiten',
  'netplay.badCode': 'Die code klopt niet — hij moet 4 tekens lang zijn.',
  'netplay.errInsecure':
    'Netplay vereist HTTPS of localhost. Deze pagina draait op gewone http, dus de browser geeft de crypto-API die ervoor nodig is niet vrij.',
  'netplay.errNoDirect':
    'Beide kanten bereikten de relay, maar er kon geen directe verbinding worden opgezet — meestal door NAT of een firewall. Hetzelfde LAN werkt het best.',
  'netplay.errPassword': 'Kamercode komt niet overeen.',
  'netplay.errHandshake': 'Handshake verlopen — de andere speler is misschien weggegaan.',
  'netplay.errHostLeft': 'De host heeft de kamer verlaten — de kamer is gesloten.',
  'netplay.errRoomFull': 'Die kamer is al vol — dit spel is alleen één tegen één.',
  'netplay.errUnknown':
    'Kon geen verbinding maken met de andere speler. De exacte reden staat in de browserconsole.',

  'seo.play.title': 'Speelkamer — laad een game en speel online',
  'seo.play.description':
    'Eén scherm om een game te starten: speel solo, of open een 1v1-kamer en deel de code. NES, SNES, Game Boy, GBA, Mega Drive en arcadegames.',
  'play.modeSolo': 'Solo',
  'play.start': 'Starten',
  'play.confirmStart': 'Bevestigen en starten',
  'play.confirm': 'Bevestigen',
  'play.qualityIntro': 'Kies de beeldkwaliteit voor online spelen op basis van je verbinding.',
  'play.qualityHint.smooth': '30 fps · Gebruikt minder bandbreedte, geschikt voor tragere verbindingen.',
  'play.qualityHint.balanced': 'Tot 720p / 60 fps · Balans tussen scherpte en vloeiende beweging.',
  'play.qualityHint.sharp':
    'Tot 60 fps · Geeft voorrang aan detail op de originele resolutie; vraagt een snelle verbinding. Op tragere netwerken kan de framerate dalen.',
  'play.qualityConfirmHint':
    'Bevestig om verbinding te maken met de kamer. De host laadt daarna de game; gasten krijgen het beeld van de host.',
  'play.connecting': 'Verbinden…',
  'play.confirmJoin': 'Bevestigen en deelnemen',
  'play.cancel': 'Annuleren',
  'play.screenSize': 'Schermgrootte',
  'play.controlsTitle': 'Spelbesturing',
  'play.netplayKeysHint':
    'Bij online spelen gebruikt elke speler zijn eigen toetsen van speler 1.',
  'play.cancelled': 'Laden geannuleerd.',
  'play.retry': 'Opnieuw laden',
  'play.retryJoin': 'Opnieuw deelnemen',
  'play.saved': 'Game opgeslagen.',
  'play.localSaving': 'Opslaan…',
  'play.uploading': 'Uploaden…',
  'play.cloudFailed': 'Cloudsynchronisatie mislukt.',
  'play.saveNoLogin': 'Log in om te synchroniseren',
  'play.tooLarge': 'Save te groot',
  'play.theme': 'Thema',
  'play.saveFailed': 'Kon de game niet opslaan. Probeer het opnieuw.',
  'play.loadFailed': 'Kon de save niet laden. Probeer het opnieuw.',
  'play.leftRoom': 'Je hebt de kamer verlaten.',
  'play.latency': 'Latentie',
  'play.measuringLatency': 'Meten…',
  'play.downloading': 'ROM downloaden…',
  'play.booting': 'Core starten…',
  'play.loadFail': 'Deze cartridge kon niet worden geladen.',
  'play.romIncomplete': 'Het ROM-bestand is onvolledig — laad het opnieuw.',
  'play.notFound': 'Die game kon niet worden gevonden.',
  'play.fullscreen': 'Volledig scherm',
  'play.volume': 'Volume',
  'play.edit': 'Bewerken',
  'play.hideSidebar': 'Paneel verbergen',
  'play.showSidebar': 'Paneel tonen',
  'play.hint': 'Esc verlaat volledig scherm. Verder gebruikt niets hier het toetsenbord.',
  'play.leaveTitle': 'Game bezig',
  'play.leaveBody':
    'Teruggaan beëindigt deze sessie — voortgang wordt niet automatisch opgeslagen.',
  'play.leaveStay': 'Doorspelen',
  'play.leaveGo': 'Verlaten',
  'gamesPage.playOnline': 'Online spelen',

  'keybind.title': 'Toetsindeling',
  'keybind.open': 'Toetsen instellen',
  'keybind.close': 'Sluiten',
  'keybind.p1': 'Speler 1',
  'keybind.p2': 'Speler 2',
  'keybind.mine': 'Jouw toetsen',
  'keybind.pressKey': 'DRUK…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Standaardwaarden herstellen',
  'keybind.reload': 'Cartridge herladen',
  'keybind.reloading': 'Herladen…',
  'keybind.unsupported': 'Die toets kan niet gebruikt worden — probeer een andere.',
  'keybind.conflictSame':
    '{pressed} is al toegewezen aan de knop {button} — probeer een andere toets.',
  'keybind.conflictOther':
    '{pressed} is al toegewezen aan de knop {button} van speler {player} — probeer een andere toets.',
  'keybind.hint':
    'De toetsenindeling wordt één keer gelezen, bij het laden van een cartridge — herlaad hem om wijzigingen toe te passen. De twee spelers kunnen geen toets delen.',
  'keybind.soloHint':
    'De toetsenindeling wordt één keer gelezen, bij het laden van een cartridge — herlaad hem om wijzigingen toe te passen.',
  'keybind.hostHint':
    'Jij bent de host: speler 1 gebruikt jouw eigen toetsen, speler 2 is waar de invoer van de gast naartoe gaat. Ze kunnen geen toets delen, anders zou die invoer ook jouw speler 1 aansturen. Herlaad een cartridge na het wijzigen.',
  'keybind.guestHint':
    'Jij bent de gast en speelt met je eigen toetsen (de groep van speler 1) — elke kant zit achter een eigen toetsenbord, dus niets kan botsen. Wijzigingen werken meteen — herladen is niet nodig.',
  'keybind.guestLocalHint':
    'Jij bent de gast en hier draait ook een eigen cartridge. Jouw toetsen zijn de groep van speler 1: die sturen die lokale cartridge aan, dus herlaad hem na het wijzigen — en ze worden ook naar de host gestuurd, waar ze meteen gelden.',

  'games.open': 'Gamebibliotheek',
  'games.title': 'Gamebibliotheek',
  'games.close': 'Sluiten',
  'games.empty': 'De bibliotheek is leeg — er is nog niets geüpload',
  'games.loading': 'Laden…',
  'games.loadingRom': '{name} laden…',
  'games.cancel': 'Annuleren',
  'games.failed': 'Kon de gamebibliotheek niet laden',
  'games.tabLibrary': 'Gamebibliotheek',
  'games.tabHistory': 'Geschiedenis',
  'games.historyEmpty': 'Nog niets uit de bibliotheek geopend',
  'games.historyLoad': '{name}\nKlik om opnieuw te laden',
  'games.tabFavorites': 'Favorieten',
  'games.favorite': '{name} aan favorieten toevoegen',
  'games.unfavorite': '{name} uit favorieten verwijderen',
  'games.favoritesEmpty': 'Nog geen favorieten — tik op de ster op een cover.',
  'games.favoritesSignInBefore': 'Log in om favorieten te bewaren — ',
  'games.favoritesSignInLink': 'Inloggen',
  'games.favoritesSignInAfter': ' hier, of gebruik de accountknop rechtsboven.',

  'user.title': 'Account',
  'user.close': 'Sluiten',
  'user.open': 'Account — inloggen of registreren',
  'user.openSignedIn': 'Account: {name}',
  'user.tabLogin': 'Inloggen',
  'user.tabRegister': 'Account aanmaken',
  'user.username': 'Gebruikersnaam',
  'user.password': 'Wachtwoord',
  'user.usernameHint': '3–20 tekens: letters, cijfers, _ - .',
  'user.emailLabel': 'E-mail',
  'user.emailHint': 'Je e-mailadres. Geen +-aliassen, geen tijdelijke mail.',
  'user.passwordHint': 'Minstens 6 tekens, geen spaties.',
  'user.signIn': 'Inloggen',
  'user.signUp': 'Account aanmaken',
  'user.signingIn': 'Inloggen…',
  'user.signingUp': 'Aanmaken…',
  'user.signOut': 'Uitloggen',
  'user.signedInAs': 'Ingelogd als {name}.',
  'user.cloudHint':
    'Je speelgeschiedenis, saves en favorieten staan in je account — open een game uit de online bibliotheek en ze synchroniseren automatisch.',
  'user.formLead':
    'Log in en je saves, speelgeschiedenis en favorieten staan in de cloud — speel altijd en overal!',
  /* 拆四段夹两个链接：荷兰语用「akkoord met: … en …」避开 privacybeleid / voorwaarden 的冠词冲突 */
  'user.consentLogin': 'Door in te loggen ga je akkoord met: ',
  'user.consentRegister': 'Door een account aan te maken ga je akkoord met: ',
  'user.consentMiddle': ' en ',
  'user.consentAfter': '.',
  'user.error.failed': 'Er ging iets mis — probeer het opnieuw.',
  'user.error.missingCredentials': 'Vul een gebruikersnaam en wachtwoord in.',
  'user.error.usernameInvalid': 'Een gebruikersnaam mag alleen letters, cijfers, _ - en . bevatten',
  'user.error.usernameTooShort': 'Gebruikersnaam is te kort (minstens 3 tekens).',
  'user.error.usernameTooLong': 'Gebruikersnaam is te lang (maximaal 20 tekens).',
  'user.error.usernameTaken': 'Die gebruikersnaam is al bezet — kies een andere.',
  'user.error.emailInvalid': 'Vul een geldig e-mailadres in.',
  'user.error.emailAlias':
    'Alias-e-mails (zoals naam+tag@… of Gmail met punten) zijn niet toegestaan.',
  'user.error.emailTemp':
    'Tijdelijke e-maildiensten zijn niet toegestaan — gebruik je gewone mailbox.',
  'user.error.passwordInvalid': 'Vul een wachtwoord in.',
  'user.error.passwordTooShort': 'Wachtwoord is te kort (minstens 6 tekens).',
  'user.error.passwordTooLong': 'Wachtwoord is te lang (maximaal 72 tekens).',
  'user.error.passwordHasSpace': 'Een wachtwoord mag geen spaties bevatten.',
  'user.error.invalidCredentials': 'Gebruikersnaam of wachtwoord is onjuist.',
  'user.error.banned': 'Dit account is opgeschort.',
  'user.error.captchaRequired': 'Voltooi eerst de menselijke verificatie.',
  'user.error.captchaFailed': 'Menselijke verificatie mislukt — probeer het opnieuw.',
  'login.lead':
    'Log in en je saves, speelgeschiedenis en favorieten staan in de cloud — speel altijd en overal. Nog geen account? Maak er een aan.',

  'account.title': 'Je account',
  'account.loading': 'Laden…',
  'account.failed': 'Er ging iets mis — probeer het opnieuw.',
  'account.since': 'Lid sinds {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Standaard',
  'account.vipUntil': 'VIP tot {time}',
  'account.vipExpired': 'VIP verlopen op {time}',
  'account.tabFavorites': 'Favorieten',
  'account.tabHistory': 'Geschiedenis',
  'account.tabSaves': 'Saves',
  'account.tabProfile': 'Profiel',
  'account.tabPassword': 'Wachtwoord',
  'account.favoritesLoading': 'Favorieten laden…',
  'account.historyLoading': 'Geschiedenis laden…',
  'account.savesLoading': 'Saves laden…',
  'account.favoritesEmpty':
    'Nog geen favorieten — open de gamebibliotheek in de kamer en tik op de ster op een cover.',
  'account.unfavorite': '{name} uit favorieten verwijderen',
  'account.historyEmpty':
    'Nog geen speelgeschiedenis — games die je uit de online bibliotheek opent, verschijnen hier.',
  'account.historyCount': '{count} games onlangs gespeeld',
  'account.historyDeleted': 'Uit de geschiedenis verwijderd.',
  'account.clearHistory': 'Alles wissen',
  'account.confirmClearHistory': 'Echt alles wissen?',
  'account.historyCleared': 'Geschiedenis gewist.',
  'account.historyHint':
    'De geschiedenis bewaart je {max} laatst gespeelde games — speel je een oudere opnieuw, dan gaat die weer naar boven.',
  'account.savesEmpty': 'Nog geen cloudsave.',
  'account.savesCount': '{count} saves in totaal',
  'account.savesGroupCount': '{count} save',
  'account.viewGame': '{name} bekijken',
  'account.savesHint':
    'Eén save per game — opnieuw opslaan overschrijft hem. Lokaal en in de cloud geldt hetzelfde.',
  'account.saveDeleted': 'Save verwijderd.',
  'account.clearSaves': 'Alles wissen',
  'account.confirmClearSaves': 'Echt alles wissen?',
  'account.savesCleared': '{count} saves gewist.',
  'account.delete': 'Verwijderen',
  'account.confirmDelete': 'Echt verwijderen?',
  'account.avatar': 'Avatar',
  'account.chooseImage': 'Afbeelding kiezen',
  'account.clearAvatar': 'Avatar verwijderen',
  'account.uploading': 'Uploaden…',
  'account.avatarSaved': 'Avatar bijgewerkt.',
  'account.avatarCleared': 'Avatar verwijderd.',
  'account.avatarHint': 'PNG, JPEG, WebP of GIF, tot 2 MB.',
  'account.gender': 'Geslacht',
  'account.genderNone': 'Niet opgegeven',
  'account.genderMale': 'Man',
  'account.genderFemale': 'Vrouw',
  'account.genderSaved': 'Opgeslagen.',
  'account.genderHint': 'Optioneel — alleen jij ziet dit.',
  'account.passwordTabHint':
    'Je blijft daarna ingelogd op dit apparaat — opnieuw inloggen is niet nodig.',
  'account.password': 'Wachtwoord',
  'account.oldPassword': 'Huidig wachtwoord',
  'account.newPassword': 'Nieuw wachtwoord',
  'account.confirmPassword': 'Nieuw wachtwoord herhalen',
  'account.savePassword': 'Wachtwoord wijzigen',
  'account.saving': 'Opslaan…',
  'account.passwordSaved': 'Wachtwoord gewijzigd.',
  'account.passwordHint':
    'Je blijft na het wijzigen ingelogd op dit apparaat. Andere ingelogde apparaten blijven werken tot hun sessie verloopt.',
  'account.error.missingOld': 'Vul je huidige wachtwoord in.',
  'account.error.wrongPassword': 'Huidig wachtwoord is onjuist.',
  'account.error.passwordTooShort': 'Nieuw wachtwoord is te kort (minstens 6 tekens).',
  'account.error.passwordTooLong': 'Nieuw wachtwoord is te lang (maximaal 72 tekens).',
  'account.error.passwordHasSpace': 'Een nieuw wachtwoord mag geen spaties bevatten.',
  'account.error.mismatch': 'De twee nieuwe wachtwoorden komen niet overeen.',
  'account.error.avatarMissing': 'Kies eerst een afbeelding.',
  'account.error.avatarTooLarge': 'Die afbeelding is te groot (maximaal 2 MB).',
  'account.error.avatarType': 'Niet-ondersteund formaat — gebruik PNG, JPEG, WebP of GIF.',

  'games.filterAll': 'Alle',
  'games.searchPlaceholder': 'Zoek op titel / ontwikkelaar / serie',
  'games.search': 'Zoeken',
  'games.noMatch': 'Geen games gevonden.',
  'games.prev': 'Vorige',
  'games.next': 'Volgende',
  /*
   * 在线库的加载速度提示。**荷兰语同样是空串** —— 那句话是说给「文件在境外」的读者听的，
   * 荷兰语界面下的读者多半就在境外，这条既没用又显得莫名其妙（理由与英文那份相同）。
   */
  'games.remoteSlow': '',

  'note.text': 'Mogen we allemaal het plezier van vroeger terugvinden..',
  'note.open': 'Lees het briefje op de vloer',
  'note.title': 'Een briefje',
  'note.close': 'Sluiten',
  'window.cycle': 'Verander het seizoen buiten',
  'painting.open': 'Bekijk het schilderij van dichtbij',
  'painting.close': 'Sluiten',
  'painting.title.sunflowers': 'Zonnebloemen',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'Mona Lisa',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'De sterrennacht',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'De schreeuw',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'Meisje met de parel',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'De grote golf bij Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Een naamloos schilderij van onbekende herkomst',
  'painting.artist.unknown': 'Anoniem',
  'mp4.play': 'Speel een liedje op de MP4-speler',
  'mp4.pause': 'Pauzeer de MP4-speler',
  'cat.wand': 'Zwaai met de kattenhengel op de vloer',
  'cat.ragdoll': 'Achter de boeken gluurt een ragdoll',
  'cat.siamese': 'Achter de boeken gluurt een Siamees',
  'cat.tabby': 'Achter de boeken gluurt een tabby',
  'cat.orange': 'Achter de boeken gluurt een rode tabby',
  'cat.american': 'Achter de boeken gluurt een Amerikaanse korthaar',
  'cat.tuxedo': 'Achter de boeken gluurt een smokingkat',
  'cat.calico': 'Achter de boeken gluurt een lapjeskat',

  'feedback.open': 'Lees het gastenboek op de vloer',
  'feedback.title': 'Gastenboek',
  'feedback.close': 'Sluiten',
  'feedback.placeholder': 'Zeg iets — een suggestie, of een game die je hier graag ziet…',
  'feedback.submit': 'Plaatsen',
  'feedback.submitting': 'Plaatsen…',
  'feedback.ok': 'Geplaatst — bedankt!',
  'feedback.required': 'Schrijf eerst iets.',
  'feedback.failed': 'Kon niet plaatsen — probeer het opnieuw.',
  'feedback.loading': 'Laden…',
  'feedback.empty': 'Nog geen berichten — wees de eerste.',
  'feedback.retry': 'Opnieuw proberen',
  'feedback.prev': 'Vorige',
  'feedback.next': 'Volgende',
  'feedback.page': 'Pagina {n}',
  'feedback.resolved': 'Opgelost',
  'feedback.unresolved': 'Open',

  'legal.privacy': 'Privacybeleid',
  'legal.terms': 'Servicevoorwaarden',
  'legal.updated': 'Laatst bijgewerkt {date}',
  'legal.contact': 'Contact:',

  'tour.title': 'Rondleiding',
  'tour.skip': 'Overslaan',
  'tour.back': 'Terug',
  'tour.next': 'Volgende',
  'tour.done': 'Begin met spelen',
  'tour.replay': 'Rondleiding opnieuw tonen',
  'tour.screen.title': 'Begin met een game',
  'tour.screen.body':
    'Sleep een ROM-bestand (.nes, .sfc, .gba, .md, .gb …) of een arcade-.zip naar de tv, of klik gewoon op het scherm om een bestand te kiezen. Er zitten geen ROMs bij deze site — neem je eigen bestanden mee.',
  'tour.rail.title': 'De schakelaarrij',
  /*
   * ⚠️ 这一句里列的是**那一列开关的当前项**：语言那一项写四种语言的全名、
   *    TV-grootte 那项把三档念出来 —— 和 en / ja 同一套写法，改开关就得回来改这句。
   */
  'tour.rail.body':
    'Drie groepen, van boven naar beneden. Uiterlijk: thema (nacht / dag), taal (中文 / English / 日本語 / 한국어), volledig scherm (het scherm zelf gaat naar volledig scherm), eenvoudige modus (alleen muur, tv, bureau en vloer), TV-grootte (opent een keuze groot / middel / klein — het bureau groeit mee). Games: netplay, toetsindeling. Hulp: besturing, en het gastenboek.',

  'topLinks.label': 'Sitepagina’s',
  'topLinks.games': 'Gamelijst',
  'menu.open': 'Menu openen',
  'menu.close': 'Menu sluiten',
  'menu.theme': 'Thema',
  'menu.simple': 'Eenvoudige modus',

  'leave.title': 'Deze pagina verlaten?',
  'leave.bodyGame': 'De lopende game wordt onderbroken — voortgang wordt niet opgeslagen.',
  'leave.bodyNetplay': 'Je verlaat de netplaykamer en je partner wordt losgekoppeld.',
  'leave.stay': 'Blijven',
  'leave.confirm': 'Verlaten',

  'gamesPage.heading': 'Alle games',
  'gamesPage.intro':
    '{count} games in de online bibliotheek — NES, SNES, Game Boy, GBA, Mega Drive, arcade en meer. Klik op een cover voor details, of begin meteen te spelen.',
  'gamesPage.empty': 'De bibliotheek is nu leeg.',
  'gamesPage.introConsole':
    '{count} {console}-games in de bibliotheek. Klik op een cover voor details, of begin meteen te spelen.',
  'gamesPage.filterLabel': 'Filter op console',
  'gamesPage.filterAll': 'Alle',
  'gamesPage.consoleEmpty': 'Nog geen {console}-games in de bibliotheek.',
  'gamesPage.searchLabel': 'Zoek in de gamebibliotheek',
  'gamesPage.searchPlaceholder': 'Zoek op titel / ontwikkelaar / serie',
  'gamesPage.searchSubmit': 'Zoeken',
  'gamesPage.searchLoading': 'Zoeken…',
  'gamesPage.searchClear': 'Zoekopdracht wissen',
  'gamesPage.searchResults': '“{keyword}” — {count} games gevonden.',
  'gamesPage.searchEmpty':
    'Geen games gevonden voor “{keyword}”. Probeer een korter woord, of de titel van de game.',
  'gamesPage.prev': 'Vorige',
  'gamesPage.next': 'Volgende',
  'gamesPage.backHome': 'Terug naar startpagina',
  'gamesPage.backToGames': 'Alle games',
  'common.back': 'Terug',
  'common.home': 'Home',
  'gamesPage.play': 'Nu spelen',
  'gamesPage.download': 'ROM downloaden',
  'gamesPage.share': 'Deze game delen',
  'gamesPage.shareCopied': 'Link gekopieerd',
  'gamesPage.shareFailed': 'Kopiëren mislukt',
  'gamesPage.favorite': 'Aan favorieten toevoegen',
  'gamesPage.unfavorite': 'Uit favorieten verwijderen',
  'gamesPage.favoriteSignIn':
    'Log in om favorieten te bewaren — gebruik de inlogknop in de bovenbalk.',
  'gamesPage.favoriteFailed': 'Kon favorieten niet bijwerken — probeer het opnieuw.',
  'gamesPage.favoriteCount': '{n} keer favoriet',
  'gamesPage.report': 'Probleem melden',
  'gamesPage.reportTitle': 'Probleem melden',
  'gamesPage.reportSubject': 'Over: {name}',
  'gamesPage.reportPlaceholder':
    'Wat ging er mis? Bijvoorbeeld: hij start niet, het beeld is verstoord, er is geen geluid…',
  'gamesPage.reportSubmit': 'Melding versturen',
  'gamesPage.reportSubmitting': 'Versturen…',
  'gamesPage.reportOk': 'Bedankt — we kijken ernaar.',
  'gamesPage.reportRequired': 'Beschrijf eerst het probleem.',
  'gamesPage.reportFailed': 'Kon niet versturen — probeer het opnieuw.',
  'gamesPage.reportClose': 'Annuleren',

  'comments.heading': 'Reacties',
  'comments.count': '{n} reacties',
  'comments.empty': 'Nog geen reacties — wees de eerste.',
  'comments.placeholder': 'Wat vind je van deze game?',
  'comments.ratingLabel': 'Jouw beoordeling',
  'comments.ratingStar': 'Geef {n} van de 5 sterren',
  'comments.ratingValue': '{n} van de 5 sterren',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Kies eerst een sterrenbeoordeling.',
  'comments.submit': 'Reactie plaatsen',
  'comments.submitting': 'Plaatsen…',
  'comments.ok': 'Geplaatst — hij staat bovenaan de lijst.',
  'comments.required': 'Schrijf eerst iets.',
  'comments.failed': 'Kon niet plaatsen — probeer het opnieuw.',
  'comments.signInLead': 'Log in om een reactie te plaatsen.',
  'comments.signIn': 'Inloggen',
  'comments.signInRequired': 'Log opnieuw in om te kunnen plaatsen.',
  'comments.loading': 'Reacties laden…',
  'comments.retry': 'Opnieuw proberen',
  'comments.loadFailed': 'Kon reacties niet laden.',
  'comments.loadMore': 'Meer laden',
  'comments.delete': 'Verwijderen',
  'comments.deleteConfirm': 'Bevestigen',
  'comments.cancel': 'Annuleren',
  'comments.deleted': 'Reactie verwijderd.',
  'comments.deleteFailed': 'Kon niet verwijderen — probeer het opnieuw.',

  'gamesPage.field.console': 'Console',
  'gamesPage.field.year': 'Jaar',
  'gamesPage.field.developer': 'Ontwikkelaar',
  'gamesPage.field.series': 'Serie',
  'gamesPage.field.language': 'Taal',
  'gamesPage.controls': 'Besturing',
  'gamesPage.selectLanguage': 'Kies taal',

  'notFound.title': 'Pagina niet gevonden',
  'notFound.description':
    'Dat adres bestaat niet op {site}. Controleer de link of ga terug naar de startpagina.',
  'gamesPage.notFoundTitle': 'Game niet gevonden',
  'gamesPage.notFound': 'Deze game zit niet (meer) in de bibliotheek.',
  'gamesPage.fallbackDescription': '{title} is een {console}-game.',

  'developersPage.heading': 'Ontwikkelaars',
  'developersPage.intro':
    '{count} ontwikkelaars achter de games in de bibliotheek. Open er een om alles van die studio te zien.',
  'developersPage.empty': 'Nog geen ontwikkelaars vermeld.',
  'developersPage.gameCount': '{count} games',
  'developersPage.gamesHeading': 'Games van {name}',
  'developersPage.gamesEmpty': 'Er zit nog geen game van deze ontwikkelaar in de bibliotheek.',
  'developersPage.field.founded': 'Opgericht',
  'developersPage.backToDevelopers': 'Alle ontwikkelaars',
  'developersPage.notFoundTitle': 'Ontwikkelaar niet gevonden',
  'developersPage.notFound': 'Deze ontwikkelaar zit niet (meer) in de bibliotheek.',

  'consolesPage.heading': 'Consoles',
  'consolesPage.intro':
    'De consoles in de bibliotheek — {count} games in totaal. Open er een om alle titels te zien.',
  'consolesPage.gameCount': '{count} games',
  'consolesPage.gamesHeading': 'Games op {name}',
  'consolesPage.gamesEmpty': 'Er zit nog geen game voor deze console in de bibliotheek.',
  /* 筛了语种却一款都没有（`{lang}` 来自 lib/rom-lang.ts 的语言全称，如 Nederlands） */
  'consolesPage.gamesEmptyLang': 'Er is nog geen {lang} game voor deze console.',
  'consolesPage.filterLangLabel': 'Filter op taal',
  'consolesPage.field.released': 'Uitgebracht',
  'consolesPage.backToConsoles': 'Alle consoles',
  'consolesPage.notFoundTitle': 'Console niet gevonden',
  'consolesPage.notFound': 'Deze console hoort niet (meer) bij de site.',

  'download.heading': 'Download de ROM',
  'download.hint': 'Klik op de knop hieronder — de download start 6 seconden later.',
  'download.button': 'Download starten',
  'download.waiting': 'Start over {seconds}s…',
  'download.started': 'Download gestart — kijk bij je browserdownloads.',
  'download.rights': 'Download alleen ROM-bestanden die je wettelijk mag gebruiken.',
  'download.disclaimer':
    'Disclaimer: alle ROM-bestanden op deze pagina zijn verzameld bij derden en alleen bedoeld voor persoonlijke studie en back-up. Alle auteursrechten berusten bij de oorspronkelijke uitgevers; als inhoud je rechten schendt, neem dan contact met ons op voor verwijdering.',

  'deepLink.notFound': 'Die game kon niet worden gevonden — misschien is hij verwijderd.',
  'deepLink.title': 'Game laden',
  'deepLink.loading': 'ROM downloaden…',
  'deepLink.hint': 'Start automatisch zodra de download klaar is.',
};

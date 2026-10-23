/**
 * 德语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表，加上 `ja` / `ko`
 * 各自独立文件；德语再塞回主文件只会让那张表继续膨胀。理由和 `lib/legal.ts` 当初
 * 分出去的一样 —— 一个语言一个文件。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序一致**（558 条），`zh` / `ja` / `ko` 同理。
 *    改文案时**先改 `en`**，再回来对齐其余几份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的德语在数据库里
 *    （`game_texts` 的 `de` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` /
 *    `{seconds}` …），它们由 `translate()` 在运行时替换；漏掉一个不会报错，
 *    只会在页面上少一段字。可以按德语语序挪位置，但不能改名、不能填成实际值。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → Konsole；developer → Entwickler；series → Reihe
 *   · cartridge → Modul；room → Raum；host → Host；guest → Gast
 *   · netplay → Netplay；save → Spielstand；key bindings → Tastenbelegung
 *   · game library → Spielebibliothek；guestbook → Gästebuch
 *
 * ⚠️ 机种名用**德语玩家的通行写法**（NES / SNES / Game Boy / GBC / GBA / NDS /
 *    Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade），不译。标签位上取的是 `lib/consoles.ts` 的
 *    `consoleLabel(type, locale)`，和文案同源。
 *
 * ⚠️ 站名统一写 `Game Hut`（不译）；标题 / 说明里一律用 `{site}` 占位，别手写。
 * ⚠️ 排版：引号用 „…“；名词首字母大写；按钮用不定式（„Spielen“ / „Herunterladen“）。
 */

import type { MessageKey } from './i18n';

export const de: Record<MessageKey, string> = {
  'meta.title': '{site} — Retro-Games im Browser spielen: NES, SNES, GBA & Arcade',
  'meta.description':
    'Spiele NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive und Arcade-Spiele direkt im Browser. Wähle einen Titel aus der Online-Bibliothek oder lade deine eigene ROM-Datei.',
  'meta.keywords':
    'Retro-Spiele, Online-Retro-Bibliothek, NES-Emulator, SNES-Emulator, SFC-Emulator, GBA-Emulator, Game-Boy-Advance-Emulator, Game-Boy-Emulator, Game-Boy-Color-Emulator, NDS-Emulator, Nintendo-DS-Emulator, Sega-Mega-Drive-Emulator, Sega-Genesis-Emulator, Game-Gear-Emulator, Master-System-Emulator, Sega-32X-Emulator, WonderSwan-Emulator, Neo-Geo-Pocket-Emulator, PlayStation-Emulator, PS1-Emulator, PSX-Emulator, Arcade-Emulator, NES im Browser spielen, Browser-Emulator, RetroArch WASM, {site}',
  'seo.room.title': 'Pixelzimmer — Retro-Games im Browser spielen',
  'seo.room.description':
    'Willkommen im Pixelzimmer: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive und Arcade-Spiele laufen auf der Röhre. Wähle einen Titel aus der Online-Bibliothek oder zieh deine eigene ROM-Datei auf den Bildschirm.',
  'seo.login.title': 'Anmelden',
  'seo.login.description':
    'Melde dich an, damit Spielstände, Spielverlauf und Favoriten auf allen Geräten synchron bleiben.',
  'home.hero.title': 'Klassische Retro-Games im Browser spielen',
  'home.hero.lead':
    '{site} bietet NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade und mehr zum Online-Spielen, inklusive Netplay für zwei Spieler.',
  'home.hero.play': 'Lokale ROM laden',
  'home.hero.browse': 'Alle Spiele ansehen',
  'home.join.title': 'Mit einem Freund spielen',
  'home.join.hint': 'Gib den 4-stelligen Raumcode ein, den dein Freund geteilt hat.',
  'home.join.submit': 'Raum beitreten',
  'home.hero.or': 'ODER',
  'home.search.label': 'Spielebibliothek durchsuchen',
  'home.search.placeholder': 'Titel / Entwickler / Reihe suchen',
  'home.search.submit': 'Suchen',
  'home.consoles.title': 'Nach Konsole stöbern',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade und mehr — wähle eine Konsole und sieh ihre Spiele.',
  'home.consoles.count': '{count} Spiele',
  'home.consoles.all': 'Alle Konsolen',
  'home.latest.title': 'Neu hinzugefügt',
  'home.latest.lead': 'Die neuesten Spiele auf der Seite.',
  'home.latest.viewAll': 'Alle Spiele',
  'home.developers.title': 'Nach Entwickler stöbern',
  'home.developers.lead': 'Diese Studios haben hier die meisten Spiele.',
  'home.developers.viewAll': 'Alle Entwickler',
  'home.empty':
    'Die Bibliothek ist derzeit leer — öffne das Zimmer und zieh eine ROM auf die Röhre, um zu spielen.',
  'home.faq.title': 'Häufige Fragen',
  'home.faq.q1': 'Ist es kostenlos?',
  'home.faq.a1':
    'Völlig kostenlos — jedes Spiel steht offen. Mit einer Anmeldung kommen Cloud-Spielstände für Verlauf und Speicherdateien dazu.',
  'home.faq.q2': 'Muss ich etwas installieren?',
  'home.faq.a2': 'Nein — klicke ein Spiel an und spiele direkt im Browser.',
  'home.faq.q3': 'Funktioniert es auf Handys und Tablets?',
  'home.faq.a3': 'Ja — es läuft direkt im Browser auf Handys und Tablets.',
  'home.faq.q4': 'Kann ich die ROM-Dateien herunterladen?',
  'home.faq.a4':
    'Ja — jede Spielseite hat einen Download-Button. Lade nur ROM-Dateien herunter, die du rechtlich nutzen darfst.',
  'home.faq.q5': 'Kann ich mit einem Freund spielen?',
  'home.faq.a5': 'Natürlich! Schnapp dir einen Freund und eröffne einen Raum für eine Partie.',
  'home.faq.q6': 'Werden Gamepads unterstützt?',
  'home.faq.a6':
    'Ja — schließ ein USB- oder Bluetooth-Gamepad an, der Emulator erkennt es über den Browser. Die Tastenbelegung folgt den Standardwerten des jeweiligen Cores; auf dem Handy nutzt du die Tasten auf dem Bildschirm.',
  'seo.heading': 'Retro-Games im Browser spielen',
  'seo.intro':
    '{site} ist ein Online-Retrospielzimmer. NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive und Arcade-Titel laufen direkt hier im Browser — emuliert auf deinem eigenen Gerät, mit RetroArch, kompiliert zu WebAssembly.',
  'seo.howTo':
    'Wähle ein Spiel aus der Online-Bibliothek oder zieh deine eigene ROM-Datei auf den Fernseher. Nichts zu installieren.',
  'seo.games.title': 'Alle Spiele — NES, SNES, GBA & Arcade online spielen',
  'seo.games.description':
    '{count} Retro-Spiele in der Online-Bibliothek, alle im Browser spielbar: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade und mehr. Öffne einen Titel für Details, spiele sofort los oder lade die ROM-Datei herunter.',
  'seo.games.search.title': 'Suchergebnisse für „{keyword}“',
  'seo.games.search.description':
    '{count} Spiele in der Online-Bibliothek passen zu „{keyword}“. Spiele sie im Browser oder lade die ROM-Datei herunter.',
  'seo.games.console.title': '{console}-Spiele — online im Browser spielen',
  'seo.games.console.description':
    '{count} {console}-Spiele in der Online-Bibliothek, alle im Browser spielbar oder als ROM-Datei herunterladbar.',
  'seo.game.title': '{title} — {console} online spielen',
  'seo.game.description':
    'Spiele {title} ({console}) direkt im Browser — kostenlos, nichts zu installieren. Die ROM-Datei steht ebenfalls zum Download bereit.',
  'seo.gameDownload.title': '{title}-ROM herunterladen ({console})',
  'seo.gameDownload.description':
    'Lade die ROM-Datei zu {title} ({console}) mit einem Klick herunter, ohne Registrierung. Du kannst das Spiel auch direkt im Browser spielen.',
  'seo.developers.title': 'Spieleentwickler — ihre NES-, SNES-, GBA- & Arcade-Spiele spielen',
  'seo.developers.description':
    '{count} Entwickler hinter den Spielen der Online-Bibliothek. Öffne einen, um alle Titel dieses Studios zu sehen.',
  'seo.developer.title': '{name} — Spiele dieses Entwicklers',
  'seo.developer.description':
    'Alle {name}-Spiele der Online-Bibliothek ({count}), im Browser spielbar oder als ROM-Datei herunterladbar.',
  'seo.consoles.title': 'Nach Konsole stöbern — NES, SNES, GBA & Arcade online spielen',
  'seo.consoles.description':
    'Jede Konsole der Online-Bibliothek ({count} Spiele insgesamt). Wähle eine, um alle ihre Spiele zu sehen — direkt im Browser spielbar.',
  'seo.console.title': '{name}-Spiele — online spielen',
  'seo.console.description':
    'Alle {name}-Spiele der Online-Bibliothek ({count}), im Browser spielbar oder als ROM-Datei herunterladbar.',

  'theme.toDark': 'Zum Nachtmodus wechseln',
  'theme.toLight': 'Zum Tagmodus wechseln',
  'lamp.turnOn': 'Lampe einschalten',
  'lamp.turnOff': 'Lampe ausschalten',
  'simple.enter': 'Einfacher Modus: nur Wand, Fernseher, Tisch und Boden',
  'simple.exit': 'Einfachen Modus beenden',
  'tvSize.open': 'TV-Größe',
  'tvSize.opt.large': 'Groß',
  'tvSize.opt.medium': 'Mittel',
  'tvSize.opt.small': 'Klein',
  'tvSize.pick': 'TV-Größe auf „{level}“ setzen',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Sprache',
  /* 语言提示弹窗：正文跟当前页面语言，只有那颗钮跟目标语言（LOCALE_SWITCH_LABEL） */
  'localePrompt.title': 'Diese Seite ist auf Deutsch',
  'localePrompt.body': 'Dein Browser bevorzugt eine andere Sprache. Wechseln?',
  'localePrompt.keep': 'Auf Deutsch bleiben',
  'fullscreen.enter': 'Spielfeld im Vollbild anzeigen',
  'fullscreen.exit': 'Vollbild beenden',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P）—— 那套字模没有变音符号，
   * 德语会落到系统字体上（globals.css 的 `.screen-hint-*` 补偿字号）。
   * 大写那几条照英文那侧的排版风格全大写。
   */
  'screen.pick': 'Klicken, um eine ROM-Datei zu wählen, oder hierher ziehen',
  'screen.srLabel': 'ROM-Datei zum Starten wählen',
  'screen.tapLoad': 'KLICKEN, UM EINE LOKALE ROM ZU LADEN',
  'screen.orLibrary': 'ODER AUS DER ONLINE-BIBLIOTHEK STARTEN',
  'screen.release': 'LOSLASSEN ZUM LADEN',
  'screen.mobileLibrary': 'AUS DER BIBLIOTHEK STARTEN',
  'screen.mobileTap': 'BILDSCHIRM ANTIPPEN, UM DIE BIBLIOTHEK ZU ÖFFNEN',
  'screen.waitingHost': 'WARTE AUF DEN HOST',
  'screen.paused': 'PAUSIERT',
  'screen.resumeOnPanel': 'AM GERÄT AUF FORTFAHREN DRÜCKEN',
  'screen.resumeInPanel': 'IM RECHTEN BEREICH AUF FORTFAHREN DRÜCKEN',
  'screen.waitHostResume': 'WARTE, BIS DER HOST FORTFAHRT',

  /* 机身面板那排钮 */
  'panel.resume': 'Fortfahren',
  'panel.pause': 'Pause',
  'panel.save': 'Speichern',
  'panel.load': 'Laden',
  'panel.reset': 'Zurücksetzen',
  'panel.eject': 'Auswerfen',
  'volume.down': 'Lautstärke eine Stufe leiser',
  'volume.up': 'Lautstärke eine Stufe lauter',
  'volume.set': 'Lautstärke auf {level} von {max} setzen',

  'saves.title': 'Spielstand laden',
  'saves.load': 'Laden',
  'saves.close': 'Schließen',
  'saves.groupLocal': 'Dieses Gerät',
  'saves.groupCloud': 'Cloud (Konto)',
  'saves.deleteCloud': 'Diesen Cloud-Spielstand löschen',
  'saves.delete': 'Löschen',
  'saves.loginHint':
    'Melde dich an, um Cloud-Spielstände zu behalten und auf jedem Gerät weiterzuspielen.',
  'saves.login': 'Anmelden',
  'saves.loading': 'Lädt…',
  'saves.downloading': 'Cloud-Spielstand wird geladen…',
  'saves.restoring': 'Spiel wird wiederhergestellt…',
  'saves.empty': 'Noch kein Spielstand',

  'library.removeLabel': '{name} entfernen',

  'legend.moves': 'bewegen',
  'legend.open': 'Steuerung',
  'legend.title': 'Steuerung',
  'legend.close': 'Schließen',
  'legend.needZip':
    'Format  FBNeo liest nur .zip — diese Datei sieht nach {ext} aus. Pack sie neu, oder nimm eine .zip-Version',
  'play.needZip':
    'Format  Diese ROM ist ein {ext}-Archiv, das nicht entpackt werden konnte — versuch es mit .zip oder einer ungepackten ROM',
  'legend.needDisc':
    'Format  Disc-Images bestehen meist aus mehreren Dateien (.cue + .bin). Diese Seite nimmt nur Einzeldateien — nimm eine .pbp-, .iso- oder .chd-Version',
  'play.needDisc':
    'Format  Das ist ein Disc-Image aus mehreren Dateien (.cue + .bin). Hier funktionieren nur Einzeldateien — versuch .pbp, .iso oder .chd',
  'legend.needBios':
    'BIOS  Das sieht nach einem Neo-Geo-Spiel aus (KOF, Metal Slug…). Es braucht neogeo.zip — zieh die Datei auf die Seite, dann wird sie installiert. CPS1-/CPS2-Spiele brauchen sie nicht.',
  'legend.gamepad':
    'Gamepad  Anschließen und losspielen — in einem Raum auf beiden Seiten.',

  'netplay.title': 'Netplay',
  'netplay.open': 'Über das Netzwerk spielen',
  'netplay.close': 'Schließen',
  'netplay.create': 'Raum erstellen',
  'netplay.or': 'oder',
  'netplay.join': 'Beitreten',
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    'Beide Seiten müssen nur den öffentlichen Relay erreichen — gleiches LAN funktioniert am besten. Lies den 4-stelligen Code laut vor. Der Host betreibt den Emulator und überträgt das Bild; der Gast braucht keine ROM.',
  'netplay.roomCode': 'Raumcode',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Öffentliches Internet',
  'netplay.wanDev': 'Netplay über das öffentliche Internet ist in Entwicklung.',
  'netplay.quality': 'Streamqualität',
  'netplay.qualitySmooth': 'Flüssig',
  'netplay.qualityBalanced': 'Ausgewogen',
  'netplay.qualitySharp': 'Scharf',
  'netplay.qualityHint':
    'Der Host betreibt Emulator und Stream auf einer Maschine. Kommt er nicht mit, wird das ganze Spiel langsamer (Zeitlupe). Wähle dann eine Stufe niedriger — das gilt nur beim Host.',
  'netplay.copy': 'Kopieren',
  'netplay.copied': 'Kopiert',
  'netplay.share': 'Teilen',
  'netplay.shareCopied': 'Link kopiert',
  'netplay.inviteTitle': 'Raumeinladung',
  'netplay.inviteBody': 'Raum {code} beitreten?',
  'netplay.inviteJoin': 'Beitreten',
  'netplay.inviteCancel': 'Abbrechen',
  'netplay.connected': 'Verbunden',
  'netplay.waiting': 'Warte auf den anderen Spieler',
  'netplay.joining': 'Raum wird betreten…',
  'netplay.waitingGame': 'Verbunden — warte, bis der Host ein Modul lädt',
  'netplay.hostPlaying': 'Host spielt',
  'netplay.paused': 'Pausiert',
  'netplay.toastHost': 'Verbunden · der andere Spieler ist da · du bist Spieler 1',
  'netplay.toastGuest': 'Mit dem Host verbunden · du bist Spieler 2',
  'netplay.toastHostLeft': 'Der Host hat den Raum verlassen — er ist geschlossen',
  'netplay.toastGuestLeft': 'Spieler 2 hat den Raum verlassen',
  'netplay.youAreHost':
    'Du bist Spieler 1. Lade ein Modul, dann wird das Bild automatisch an den Gast übertragen. Du spielst mit deiner eigenen Tastenbelegung — die aktuellen Belegungen stehen unter Steuerung.',
  'netplay.youAreGuest':
    'Du bist Spieler 2. Kein Modul nötig — der Host überträgt das Bild, deine Eingaben gehen an den Host. Spiele mit deiner eigenen Tastenbelegung (Gruppe Spieler 1) oder einem Gamepad — die aktuellen Belegungen stehen unter Steuerung.',
  'netplay.leave': 'Raum verlassen',
  'netplay.closeRoom': 'Raum schließen',
  'netplay.badCode': 'Der Code sieht nicht richtig aus — er sollte 4 Zeichen haben.',
  'netplay.errInsecure':
    'Netplay braucht HTTPS oder localhost. Diese Seite läuft über einfaches HTTP, deshalb verweigert der Browser die nötige Crypto-API.',
  'netplay.errNoDirect':
    'Beide Seiten haben den Relay erreicht, aber keine direkte Verbindung kam zustande — meist NAT oder eine Firewall. Gleiches LAN funktioniert am besten.',
  'netplay.errPassword': 'Raumcode stimmt nicht überein.',
  'netplay.errHandshake':
    'Handshake-Zeitüberschreitung — der andere Spieler ist vielleicht gegangen.',
  'netplay.errHostLeft': 'Der Host hat den Raum verlassen — er wurde geschlossen.',
  'netplay.errNoRoom':
    'Keine Antwort vom Host. Der Raumcode stimmt vielleicht nicht, oder der Host hat den Raum noch nicht geöffnet.',
  'netplay.errRoomFull': 'Der Raum ist schon voll — dieses Spiel ist nur 1 gegen 1.',
  'netplay.errUnknown':
    'Verbindung zum anderen Spieler fehlgeschlagen. Der genaue Grund steht in der Browser-Konsole.',

  'seo.play.title': 'Spielraum — Spiel laden und online spielen',
  'seo.play.description':
    'Ein Bildschirm zum Loslegen: allein spielen oder einen 1-gegen-1-Raum öffnen und den Code teilen. NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive und Arcade-Titel.',
  'play.modeSolo': 'Allein',
  'play.start': 'Starten',
  'play.confirmStart': 'Bestätigen und starten',
  'play.confirm': 'Bestätigen',
  'play.qualityIntro': 'Wähle die Bildqualität fürs Online-Spiel passend zu deiner Verbindung.',
  'play.qualityHint.smooth': '30 fps · Weniger Datenverbrauch, passend für langsame Verbindungen.',
  'play.qualityHint.balanced': 'Bis 720p / 60 fps · Guter Kompromiss aus Schärfe und flüssiger Bewegung.',
  'play.qualityHint.sharp':
    'Bis 60 fps · Priorisiert die Detailtreue der Originalauflösung; braucht eine schnelle Verbindung. In langsamen Netzen kann die Bildrate sinken.',
  'play.qualityConfirmHint':
    'Mit Bestätigen wird die Verbindung zum Raum hergestellt. Der Host lädt dann das Spiel, Gäste erhalten das Bild des Hosts.',
  'play.connecting': 'Verbinden…',
  'play.confirmJoin': 'Bestätigen und beitreten',
  'play.cancel': 'Abbrechen',
  'play.screenSize': 'Bildschirmgröße',
  'play.controlsTitle': 'Spielsteuerung',
  'play.netplayKeysHint': 'Beim Online-Spiel nutzt jeder Spieler seine eigenen Spieler-1-Tasten.',
  'play.cancelled': 'Laden abgebrochen.',
  'play.retry': 'Erneut laden',
  'play.retryJoin': 'Erneut beitreten',
  'play.saved': 'Spiel gespeichert.',
  'play.localSaving': 'Wird gespeichert…',
  'play.uploading': 'Wird hochgeladen…',
  'play.cloudFailed': 'Cloud-Synchronisierung fehlgeschlagen.',
  'play.saveNoLogin': 'Anmelden zum Synchronisieren',
  'play.tooLarge': 'Spielstand zu groß',
  'play.theme': 'Design',
  'play.saveFailed': 'Spiel konnte nicht gespeichert werden. Bitte erneut versuchen.',
  'play.loadFailed': 'Spielstand konnte nicht geladen werden. Bitte erneut versuchen.',
  'play.leftRoom': 'Du hast den Raum verlassen.',
  'play.latency': 'Latenz',
  'play.measuringLatency': 'Wird gemessen…',
  'play.downloading': 'ROM wird heruntergeladen…',
  'play.booting': 'Core wird gestartet…',
  'play.loadFail': 'Dieses Modul konnte nicht geladen werden.',
  'play.romIncomplete': 'Die ROM-Datei ist unvollständig — bitte erneut laden.',
  'play.notFound': 'Dieses Spiel wurde nicht gefunden.',
  'play.fullscreen': 'Vollbild',
  'play.volume': 'Lautstärke',
  'play.edit': 'Bearbeiten',
  'play.hideSidebar': 'Leiste ausblenden',
  'play.showSidebar': 'Leiste einblenden',
  'play.hint': 'Esc beendet das Vollbild. Weitere Tastenkürzel gibt es hier nicht.',
  'play.leaveTitle': 'Spiel läuft',
  'play.leaveBody':
    'Zurückgehen beendet diese Sitzung — der Fortschritt wird nicht automatisch gespeichert.',
  'play.leaveStay': 'Weiterspielen',
  'play.leaveGo': 'Verlassen',
  'gamesPage.playOnline': 'Online spielen',

  'keybind.title': 'Tastenbelegung',
  'keybind.open': 'Tasteneinstellungen',
  'keybind.close': 'Schließen',
  'keybind.p1': 'Spieler 1',
  'keybind.p2': 'Spieler 2',
  'keybind.mine': 'Deine Tasten',
  'keybind.pressKey': 'DRÜCKEN…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Standard wiederherstellen',
  'keybind.reload': 'Modul neu laden',
  'keybind.reloading': 'Wird neu geladen…',
  'keybind.unsupported': 'Diese Taste geht nicht — versuch eine andere.',
  'keybind.conflictSame':
    '{pressed} ist bereits der Taste {button} zugewiesen — versuch eine andere Taste.',
  'keybind.conflictOther':
    '{pressed} ist bereits der Taste {button} von Spieler {player} zugewiesen — versuch eine andere Taste.',
  'keybind.hint':
    'Die Tastaturbelegung wird beim Laden eines Moduls einmal eingelesen — lade es neu, damit Änderungen wirken. Beide Spieler können nicht dieselbe Taste nutzen.',
  'keybind.soloHint':
    'Die Tastaturbelegung wird beim Laden eines Moduls einmal eingelesen — lade es neu, damit Änderungen wirken.',
  'keybind.hostHint':
    'Du bist der Host: Spieler 1 sind deine eigenen Tasten, Spieler 2 ist das Ziel, in das die Eingaben des Gasts fließen. Sie dürfen nicht dieselbe Taste haben, sonst würde die eingespeiste Eingabe auch deinen Spieler 1 bewegen. Lade nach Änderungen das Modul neu.',
  'keybind.guestHint':
    'Du bist der Gast und spielst mit deiner eigenen Tastenbelegung (Gruppe Spieler 1) — jede Seite sitzt an einer eigenen Tastatur, da kollidiert nichts. Änderungen wirken sofort, ein Neuladen des Moduls ist nicht nötig.',
  'keybind.guestLocalHint':
    'Du bist der Gast, und auf diesem Gerät läuft zusätzlich ein eigenes Modul. Deine Tasten sind die Gruppe Spieler 1: Sie steuern das lokale Modul, lade es nach Änderungen also neu — und sie sind zugleich das, was an den Host geht, wo es sofort wirkt.',

  'games.open': 'Spielebibliothek',
  'games.title': 'Spielebibliothek',
  'games.close': 'Schließen',
  'games.empty': 'Die Bibliothek ist leer — noch nichts hochgeladen',
  'games.loading': 'Lädt…',
  'games.loadingRom': '{name} wird geladen…',
  'games.cancel': 'Abbrechen',
  'games.failed': 'Spielebibliothek konnte nicht geladen werden',
  'games.tabLibrary': 'Spielebibliothek',
  'games.tabHistory': 'Verlauf',
  'games.historyEmpty': 'Noch nichts aus der Bibliothek geöffnet',
  'games.historyLoad': '{name}\nKlicken, um erneut zu laden',
  'games.tabFavorites': 'Favoriten',
  'games.favorite': '{name} zu Favoriten hinzufügen',
  'games.unfavorite': '{name} aus Favoriten entfernen',
  'games.favoritesEmpty': 'Noch keine Favoriten — tippe auf den Stern auf einem Cover.',
  'games.favoritesSignInBefore': 'Melde dich an, um Favoriten zu behalten — ',
  'games.favoritesSignInLink': 'Anmelden',
  'games.favoritesSignInAfter': ' direkt hier, oder nutze den Konto-Button oben rechts.',

  'user.title': 'Konto',
  'user.close': 'Schließen',
  'user.open': 'Konto — anmelden oder registrieren',
  'user.openSignedIn': 'Konto: {name}',
  'user.tabLogin': 'Anmelden',
  'user.tabRegister': 'Konto erstellen',
  'user.username': 'Benutzername',
  'user.password': 'Passwort',
  'user.usernameHint': '3–20 Zeichen: Buchstaben, Ziffern, _ - .',
  'user.emailLabel': 'E-Mail',
  'user.emailHint': 'Deine E-Mail. Keine +-Aliase, keine Wegwerf-Adressen.',
  'user.passwordHint': 'Mindestens 6 Zeichen, keine Leerzeichen.',
  'user.signIn': 'Anmelden',
  'user.signUp': 'Konto erstellen',
  'user.signingIn': 'Anmeldung läuft…',
  'user.signingUp': 'Wird erstellt…',
  'user.signOut': 'Abmelden',
  'user.signedInAs': 'Angemeldet als {name}.',
  'user.cloudHint':
    'Spielverlauf, Spielstände und Favoriten liegen in deinem Konto — öffne ein Spiel aus der Online-Bibliothek, dann wird automatisch synchronisiert.',
  'user.formLead':
    'Melde dich an, und Spielstände, Spielverlauf und Favoriten liegen in der Cloud — spiele jederzeit und überall!',
  'user.consentLogin': 'Mit der Anmeldung stimmst du unseren ',
  'user.consentRegister': 'Mit dem Erstellen eines Kontos stimmst du unseren ',
  'user.consentMiddle': ' und ',
  'user.consentAfter': ' zu.',

  'user.error.failed': 'Etwas ist schiefgelaufen — bitte erneut versuchen.',
  'user.error.missingCredentials': 'Gib Benutzername und Passwort ein.',
  'user.error.usernameInvalid':
    'Der Benutzername darf nur Buchstaben, Ziffern, _ - und . enthalten',
  'user.error.usernameTooShort': 'Benutzername ist zu kurz (mindestens 3 Zeichen).',
  'user.error.usernameTooLong': 'Benutzername ist zu lang (höchstens 20 Zeichen).',
  'user.error.usernameTaken': 'Dieser Benutzername ist vergeben — nimm einen anderen.',
  'user.error.emailInvalid': 'Gib eine gültige E-Mail-Adresse ein.',
  'user.error.emailAlias':
    'Alias-Adressen (wie name+tag@… oder Gmail mit Punkten) sind nicht erlaubt.',
  'user.error.emailTemp':
    'Wegwerf-Adressen sind nicht erlaubt — nutze dein normales Postfach.',
  'user.error.passwordInvalid': 'Gib ein Passwort ein.',
  'user.error.passwordTooShort': 'Passwort ist zu kurz (mindestens 6 Zeichen).',
  'user.error.passwordTooLong': 'Passwort ist zu lang (höchstens 72 Zeichen).',
  'user.error.passwordHasSpace': 'Das Passwort darf keine Leerzeichen enthalten.',
  'user.error.invalidCredentials': 'Benutzername oder Passwort ist falsch.',
  'user.error.banned': 'Dieses Konto wurde gesperrt.',
  'user.error.captchaRequired': 'Bitte schließe zuerst die Verifizierung ab.',
  'user.error.captchaFailed': 'Verifizierung fehlgeschlagen — bitte erneut versuchen.',
  'login.lead':
    'Melde dich an, dann liegen Spielstände, Spielverlauf und Favoriten in der Cloud — spiele jederzeit und überall. Noch kein Konto? Jetzt erstellen.',

  'account.title': 'Dein Konto',
  'account.loading': 'Lädt…',
  'account.failed': 'Etwas ist schiefgelaufen — bitte erneut versuchen.',
  'account.since': 'Mitglied seit {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Standard',
  'account.vipUntil': 'VIP bis {time}',
  'account.vipExpired': 'VIP abgelaufen am {time}',
  'account.tabFavorites': 'Favoriten',
  'account.tabHistory': 'Verlauf',
  'account.tabSaves': 'Spielstände',
  'account.tabProfile': 'Profil',
  'account.tabPassword': 'Passwort',
  'account.favoritesLoading': 'Favoriten werden geladen…',
  'account.historyLoading': 'Verlauf wird geladen…',
  'account.savesLoading': 'Spielstände werden geladen…',
  'account.favoritesEmpty':
    'Noch keine Favoriten — öffne die Spielebibliothek im Zimmer und tippe auf den Stern auf einem Cover.',
  'account.unfavorite': '{name} aus Favoriten entfernen',
  'account.historyEmpty':
    'Noch kein Spielverlauf — Spiele, die du aus der Online-Bibliothek öffnest, erscheinen hier.',
  'account.historyCount': '{count} kürzlich gespielte Spiele',
  'account.historyDeleted': 'Aus dem Verlauf entfernt.',
  'account.clearHistory': 'Alles löschen',
  'account.confirmClearHistory': 'Wirklich alles löschen?',
  'account.historyCleared': 'Verlauf gelöscht.',
  'account.historyHint':
    'Der Verlauf behält deine {max} zuletzt gespielten Spiele — spielst du ein älteres erneut, rückt es wieder nach oben.',
  'account.savesEmpty': 'Noch kein Cloud-Spielstand.',
  'account.savesCount': '{count} Spielstände insgesamt',
  'account.savesGroupCount': '{count} Spielstand',
  'account.viewGame': '{name} ansehen',
  'account.savesHint':
    'Ein Spielstand pro Spiel — erneutes Speichern überschreibt ihn. Lokal und in der Cloud gilt dasselbe.',
  'account.saveDeleted': 'Spielstand gelöscht.',
  'account.clearSaves': 'Alles löschen',
  'account.confirmClearSaves': 'Wirklich alles löschen?',
  'account.savesCleared': '{count} Spielstände gelöscht.',
  'account.delete': 'Löschen',
  'account.confirmDelete': 'Wirklich löschen?',
  'account.avatar': 'Avatar',
  'account.chooseImage': 'Bild wählen',
  'account.clearAvatar': 'Avatar entfernen',
  'account.uploading': 'Wird hochgeladen…',
  'account.avatarSaved': 'Avatar aktualisiert.',
  'account.avatarCleared': 'Avatar entfernt.',
  'account.avatarHint': 'PNG, JPEG, WebP oder GIF, bis 2 MB.',
  'account.gender': 'Geschlecht',
  'account.genderNone': 'Nicht angegeben',
  'account.genderMale': 'Männlich',
  'account.genderFemale': 'Weiblich',
  'account.genderSaved': 'Gespeichert.',
  'account.genderHint': 'Optional — sieht nur du selbst.',
  'account.passwordTabHint':
    'Du bleibst danach auf diesem Gerät angemeldet — keine erneute Anmeldung nötig.',
  'account.password': 'Passwort',
  'account.oldPassword': 'Aktuelles Passwort',
  'account.newPassword': 'Neues Passwort',
  'account.confirmPassword': 'Neues Passwort wiederholen',
  'account.savePassword': 'Passwort ändern',
  'account.saving': 'Wird gespeichert…',
  'account.passwordSaved': 'Passwort geändert.',
  'account.passwordHint':
    'Du bleibst auf diesem Gerät nach der Änderung angemeldet. Andere angemeldete Geräte bleiben aktiv, bis ihre Sitzung abläuft.',
  'account.error.missingOld': 'Gib dein aktuelles Passwort ein.',
  'account.error.wrongPassword': 'Das aktuelle Passwort ist falsch.',
  'account.error.passwordTooShort': 'Das neue Passwort ist zu kurz (mindestens 6 Zeichen).',
  'account.error.passwordTooLong': 'Das neue Passwort ist zu lang (höchstens 72 Zeichen).',
  'account.error.passwordHasSpace': 'Das neue Passwort darf keine Leerzeichen enthalten.',
  'account.error.mismatch': 'Die beiden neuen Passwörter stimmen nicht überein.',
  'account.error.avatarMissing': 'Wähle zuerst ein Bild.',
  'account.error.avatarTooLarge': 'Dieses Bild ist zu groß (maximal 2 MB).',
  'account.error.avatarType': 'Nicht unterstütztes Format — nutze PNG, JPEG, WebP oder GIF.',

  'games.filterAll': 'Alle',
  'games.searchPlaceholder': 'Titel / Entwickler / Reihe suchen',
  'games.search': 'Suchen',
  'games.noMatch': 'Keine passenden Spiele.',
  'games.prev': 'Zurück',
  'games.next': 'Weiter',
  /* 在线库的加载速度提示：英文是空串，德语同样留空（理由见 en 那份的注释） */
  'games.remoteSlow': '',

  'note.text': 'Mögen wir alle die Freude unserer Kindheit wiederfinden..',
  'note.open': 'Den Zettel auf dem Boden lesen',
  'note.title': 'Ein Zettel',
  'note.close': 'Schließen',
  'window.cycle': 'Die Jahreszeit draußen wechseln',
  'painting.open': 'Das Gemälde näher ansehen',
  'painting.close': 'Schließen',
  'painting.title.sunflowers': 'Sonnenblumen',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'Mona Lisa',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'Die Sternennacht',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'Der Schrei',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'Das Mädchen mit dem Perlenohrring',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'Die große Welle vor Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Ein namenloses Bild von irgendwoher',
  'painting.artist.unknown': 'Unbekannt',
  'mp4.play': 'Ein Lied auf dem MP4-Player abspielen',
  'mp4.pause': 'Den MP4-Player pausieren',
  'cat.wand': 'Die Katzenangel auf dem Boden schütteln',
  'cat.ragdoll': 'Eine Ragdoll lugt hinter den Büchern hervor',
  'cat.siamese': 'Eine Siamkatze lugt hinter den Büchern hervor',
  'cat.tabby': 'Eine getigerte Katze lugt hinter den Büchern hervor',
  'cat.orange': 'Eine rote Tigerkatze lugt hinter den Büchern hervor',
  'cat.american': 'Eine Amerikanisch Kurzhaar lugt hinter den Büchern hervor',
  'cat.tuxedo': 'Eine Tuxedo-Katze lugt hinter den Büchern hervor',
  'cat.calico': 'Eine Glückskatze lugt hinter den Büchern hervor',

  'feedback.open': 'Das Gästebuch auf dem Boden aufschlagen',
  'feedback.title': 'Gästebuch',
  'feedback.close': 'Schließen',
  'feedback.placeholder':
    'Sag etwas — eine Anregung oder ein Spiel, das du hier sehen möchtest…',
  'feedback.submit': 'Absenden',
  'feedback.submitting': 'Wird gesendet…',
  'feedback.ok': 'Abgeschickt — danke!',
  'feedback.required': 'Schreib zuerst etwas.',
  'feedback.failed': 'Konnte nicht gesendet werden — bitte erneut versuchen.',
  'feedback.loading': 'Lädt…',
  'feedback.empty': 'Noch keine Beiträge — schreib den ersten.',
  'feedback.retry': 'Erneut versuchen',
  'feedback.prev': 'Zurück',
  'feedback.next': 'Weiter',
  'feedback.page': 'Seite {n}',
  'feedback.resolved': 'Erledigt',
  'feedback.unresolved': 'Offen',

  'legal.privacy': 'Datenschutzerklärung',
  'legal.terms': 'Nutzungsbedingungen',
  'legal.updated': 'Zuletzt aktualisiert am {date}',
  'legal.contact': 'Kontakt:',

  'tour.title': 'Kurze Tour',
  'tour.skip': 'Überspringen',
  'tour.back': 'Zurück',
  'tour.next': 'Weiter',
  'tour.done': 'Losspielen',
  'tour.replay': 'Tour erneut anzeigen',
  'tour.screen.title': 'Zuerst ein Spiel',
  'tour.screen.body':
    'Zieh eine ROM-Datei (.nes, .sfc, .gba, .md, .gb …) oder ein Arcade-.zip auf den Fernseher, oder klicke auf den Bildschirm, um eine Datei zu wählen. In diesem Repository sind keine ROMs enthalten — bring deine eigenen mit.',
  'tour.rail.title': 'Die Schalterleiste',
  'tour.rail.body':
    'Drei Gruppen von oben nach unten. Aussehen: Design (Nacht / Tag), Sprache (中文 / English / 日本語 / 한국어), Vollbild (der Bildschirm selbst geht ins Vollbild), Einfacher Modus (nur Wand, Fernseher, Tisch und Boden), TV-Größe (öffnet eine Auswahl Groß / Mittel / Klein — der Tisch wächst mit). Spiele: Netplay, Tastenbelegung. Hilfe: Steuerung, und das Gästebuch.',

  'topLinks.label': 'Seiten',
  'topLinks.games': 'Spieleliste',
  'menu.open': 'Menü öffnen',
  'menu.close': 'Menü schließen',
  'menu.theme': 'Design',
  'menu.simple': 'Einfacher Modus',

  'leave.title': 'Diese Seite verlassen?',
  'leave.bodyGame': 'Das laufende Spiel wird unterbrochen — der Fortschritt wird nicht gespeichert.',
  'leave.bodyNetplay': 'Du verlässt den Netplay-Raum, dein Partner wird getrennt.',
  'leave.stay': 'Bleiben',
  'leave.confirm': 'Verlassen',

  'gamesPage.heading': 'Alle Spiele',
  'gamesPage.intro':
    '{count} Spiele in der Online-Bibliothek — NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, Arcade und mehr. Klicke ein Cover für Details an, oder spiel direkt los.',
  'gamesPage.empty': 'Die Bibliothek ist derzeit leer.',
  'gamesPage.introConsole':
    '{count} {console}-Spiele in der Bibliothek. Klicke ein Cover für Details an, oder spiel direkt los.',
  'gamesPage.filterLabel': 'Nach Konsole filtern',
  'gamesPage.filterAll': 'Alle',
  'gamesPage.consoleEmpty': 'Noch keine {console}-Spiele in der Bibliothek.',
  'gamesPage.searchLabel': 'Spielebibliothek durchsuchen',
  'gamesPage.searchPlaceholder': 'Titel / Entwickler / Reihe suchen',
  'gamesPage.searchSubmit': 'Suchen',
  'gamesPage.searchLoading': 'Suche läuft…',
  'gamesPage.searchClear': 'Suche löschen',
  'gamesPage.searchResults': '„{keyword}“ — {count} passende Spiele.',
  'gamesPage.searchEmpty':
    'Keine Spiele passen zu „{keyword}“. Versuch es mit einem kürzeren Wort oder dem Spieltitel.',
  'gamesPage.prev': 'Zurück',
  'gamesPage.next': 'Weiter',
  'gamesPage.backHome': 'Zurück zur Startseite',
  'gamesPage.backToGames': 'Alle Spiele',
  'common.back': 'Zurück',
  'common.home': 'Startseite',
  'gamesPage.play': 'Jetzt spielen',
  'gamesPage.download': 'ROM herunterladen',
  'gamesPage.share': 'Dieses Spiel teilen',
  'gamesPage.shareCopied': 'Link kopiert',
  'gamesPage.shareFailed': 'Kopieren fehlgeschlagen',
  'gamesPage.favorite': 'Zu Favoriten hinzufügen',
  'gamesPage.unfavorite': 'Aus Favoriten entfernen',
  'gamesPage.favoriteSignIn':
    'Melde dich an, um Favoriten zu speichern — nutze den Anmelde-Button in der oberen Leiste.',
  'gamesPage.favoriteFailed': 'Favoriten konnten nicht aktualisiert werden — bitte erneut versuchen.',
  'gamesPage.favoriteCount': '{n} auf der Favoritenliste',
  'gamesPage.report': 'Problem melden',
  'gamesPage.reportTitle': 'Problem melden',
  'gamesPage.reportSubject': 'Betrifft: {name}',
  'gamesPage.reportPlaceholder':
    'Was ist schiefgelaufen? Zum Beispiel: startet nicht, Bild ist verzerrt, kein Ton…',
  'gamesPage.reportSubmit': 'Meldung senden',
  'gamesPage.reportSubmitting': 'Wird gesendet…',
  'gamesPage.reportOk': 'Danke — wir sehen es uns an.',
  'gamesPage.reportRequired': 'Beschreib zuerst das Problem.',
  'gamesPage.reportFailed': 'Konnte nicht gesendet werden — bitte erneut versuchen.',
  'gamesPage.reportClose': 'Abbrechen',

  'comments.heading': 'Kommentare',
  'comments.count': '{n} Kommentare',
  'comments.empty': 'Noch keine Kommentare — mach den Anfang.',
  'comments.placeholder': 'Was hältst du von diesem Spiel?',
  'comments.ratingLabel': 'Deine Bewertung',
  'comments.ratingStar': '{n} von 5 vergeben',
  'comments.ratingValue': '{n} von 5 Sternen',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Wähle zuerst eine Bewertung.',
  'comments.submit': 'Kommentar absenden',
  'comments.submitting': 'Wird gesendet…',
  'comments.ok': 'Abgeschickt — er steht oben in der Liste.',
  'comments.required': 'Schreib zuerst etwas.',
  'comments.failed': 'Konnte nicht gesendet werden — bitte erneut versuchen.',
  'comments.signInLead': 'Melde dich an, um einen Kommentar zu schreiben.',
  'comments.signIn': 'Anmelden',
  'comments.signInRequired': 'Bitte melde dich erneut an, um zu schreiben.',
  'comments.loading': 'Kommentare werden geladen…',
  'comments.retry': 'Erneut versuchen',
  'comments.loadFailed': 'Kommentare konnten nicht geladen werden.',
  'comments.loadMore': 'Mehr laden',
  'comments.delete': 'Löschen',
  'comments.deleteConfirm': 'Bestätigen',
  'comments.cancel': 'Abbrechen',
  'comments.deleted': 'Kommentar entfernt.',
  'comments.deleteFailed': 'Konnte nicht gelöscht werden — bitte erneut versuchen.',

  'gamesPage.field.console': 'Konsole',
  'gamesPage.field.year': 'Jahr',
  'gamesPage.field.developer': 'Entwickler',
  'gamesPage.field.series': 'Reihe',
  'gamesPage.field.language': 'Sprache',
  'gamesPage.controls': 'Steuerung',
  'gamesPage.selectLanguage': 'Sprache wählen',

  'notFound.title': 'Seite nicht gefunden',
  'notFound.description':
    'Diese Adresse gibt es auf {site} nicht. Prüfe den Link oder geh zurück zur Startseite.',
  'gamesPage.notFoundTitle': 'Spiel nicht gefunden',
  'gamesPage.notFound': 'Dieses Spiel ist nicht (mehr) in der Bibliothek.',
  'gamesPage.fallbackDescription': '{title} ist ein {console}-Spiel.',

  'developersPage.heading': 'Entwickler',
  'developersPage.intro':
    '{count} Entwickler hinter den Spielen der Bibliothek. Öffne einen, um alles von diesem Studio zu sehen.',
  'developersPage.empty': 'Noch keine Entwickler eingetragen.',
  'developersPage.gameCount': '{count} Spiele',
  'developersPage.gamesHeading': 'Spiele von {name}',
  'developersPage.gamesEmpty': 'Von diesem Entwickler ist noch kein Spiel in der Bibliothek.',
  'developersPage.field.founded': 'Gegründet',
  'developersPage.backToDevelopers': 'Alle Entwickler',
  'developersPage.notFoundTitle': 'Entwickler nicht gefunden',
  'developersPage.notFound': 'Dieser Entwickler ist nicht (mehr) in der Bibliothek.',

  'consolesPage.heading': 'Konsolen',
  'consolesPage.intro':
    'Die Konsolen der Bibliothek — {count} Spiele insgesamt. Öffne eine, um alle ihre Titel zu sehen.',
  'consolesPage.gameCount': '{count} Spiele',
  'consolesPage.gamesHeading': 'Spiele auf {name}',
  'consolesPage.gamesEmpty': 'Für diese Konsole ist noch kein Spiel in der Bibliothek.',
  /* 按语种筛完一款都没有时（`{lang}` 来自 lib/rom-lang.ts 的语言全称，如 English） */
  'consolesPage.gamesEmptyLang': 'Für diese Konsole gibt es noch kein Spiel auf {lang}.',
  'consolesPage.filterLangLabel': 'Nach Sprache filtern',
  'consolesPage.field.released': 'Erschienen',
  'consolesPage.backToConsoles': 'Alle Konsolen',
  'consolesPage.notFoundTitle': 'Konsole nicht gefunden',
  'consolesPage.notFound': 'Diese Konsole gehört nicht (mehr) zum Angebot.',

  'download.heading': 'ROM herunterladen',
  'download.hint': 'Klicke auf die Schaltfläche unten — der Download startet nach 6 Sekunden.',
  'download.button': 'Download starten',
  'download.waiting': 'Startet in {seconds} s…',
  'download.started': 'Download gestartet — sieh in den Downloads deines Browsers nach.',
  'download.rights': 'Lade nur ROM-Dateien herunter, die du rechtlich nutzen darfst.',
  'download.disclaimer':
    'Haftungsausschluss: Alle ROM-Dateien auf dieser Seite sind von Dritten zusammengetragen und dienen ausschließlich privatem Studium und Backup-Zwecken. Alle Urheberrechte liegen bei den jeweiligen Rechteinhabern. Sollte Inhalt deine Rechte verletzen, kontaktiere uns bitte, wir entfernen ihn.',

  'deepLink.notFound': 'Dieses Spiel wurde nicht gefunden — es wurde möglicherweise entfernt.',
  'deepLink.title': 'Spiel wird geladen',
  'deepLink.loading': 'ROM wird heruntergeladen…',
  'deepLink.hint': 'Startet automatisch, sobald der Download fertig ist.',
};

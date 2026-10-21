/**
 * 意大利语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行，
 * 日韩又各占一个文件（`i18n.ja.ts` / `i18n.ko.ts`）。理由和 `lib/legal.ts` 当初分出去的一样：
 * 全塞进去谁都翻不动。代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序也一致**（558 个），`zh` / `ja` / `ko` 同理。
 *    改文案时**先改 `en`**，再回来对齐这一份（顺序也跟着 `en` 走，方便并排核对）。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` / `{max}` /
 *    `{seconds}` / `{ext}` / `{keyword}` / `{console}` / `{title}` / `{code}` / `{n}` / `{avg}` …），
 *    它们由 `translate()` 在运行时替换。意大利语语序和英语不同，占位符可以挪位置，
 *    但**不能丢、不能改名、不能换成实际值** —— 漏一个不会报错，只会在页面上少一段字。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的意大利语在数据库里
 *    （`game_texts` 的 `it` 行，见 lib/game-text.ts），不在这张表里。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → console；developer → sviluppatore；series → serie
 *   · cartridge → cartuccia；room → stanza；host → host；guest → ospite
 *   · netplay → gioco in rete；save → salvataggio；key bindings → assegnazione tasti
 *   · game library → libreria dei giochi；guestbook → libro degli ospiti；favorites → preferiti
 *   · 按钮一律用**不定式**（Gioca / Scarica / Carica / Chiudi），不用 « Si prega di… » 那种客套
 *   · 站名统一写 `Game Hut`，**不翻译**；`{site}` 占位符照留
 *
 * ⚠️ 机种名用**意大利语玩家的通行写法**：NES / Super Nintendo (SNES) / Game Boy / GBC / GBA /
 *    NDS / Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade。标题那类要压长度的位置写 `SNES`，正文里首次出现写全称。
 *    标签位上取的是 `lib/consoles.ts` 的 `consoleLabel(type, locale)`，和文案同源，别在这里另写一套。
 */

import type { MessageKey } from './i18n';

export const it: Record<MessageKey, string> = {
  'meta.title': '{site} — Giochi retrò nel browser: NES, SNES, GBA e arcade',
  'meta.description':
    'Gioca a NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive e giochi arcade nel browser. Scegli un titolo dalla libreria online oppure carica il tuo file ROM.',
  'meta.keywords':
    'giochi retrò, libreria di giochi retrò online, emulatore NES, emulatore SNES, emulatore SFC, emulatore GBA, emulatore Game Boy Advance, emulatore Game Boy, emulatore Game Boy Color, emulatore NDS, emulatore Nintendo DS, emulatore Sega Mega Drive, emulatore Sega Genesis, emulatore Game Gear, emulatore Master System, emulatore Sega 32X, emulatore WonderSwan, emulatore Neo Geo Pocket, emulatore PlayStation, emulatore PS1, emulatore PSX, emulatore arcade, giocare a NES nel browser, emulatore nel browser, RetroArch WASM, {site}',
  'seo.room.title': 'Stanza dei pixel — Giochi retrò nel browser',
  'seo.room.description':
    'Entra nella stanza dei pixel: NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive e giochi arcade girano sul tubo catodico. Scegli un titolo dalla libreria online o trascina il tuo file ROM sullo schermo.',
  'seo.login.title': 'Accedi',
  'seo.login.description':
    'Accedi al tuo account per tenere salvataggi, cronologia e preferiti sincronizzati su tutti i dispositivi.',
  'home.hero.title': 'Gioca ai classici retrò nel browser',
  'home.hero.lead':
    '{site} ha NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive, arcade e altro da giocare online, con gioco in rete a due.',
  'home.hero.play': 'Carica una ROM locale',
  'home.hero.browse': 'Sfoglia tutti i giochi',
  'home.join.title': 'Gioca con un amico',
  'home.join.hint':
    'Inserisci il codice stanza di 4 caratteri condiviso dal tuo amico.',
  'home.join.submit': 'Entra nella stanza',
  'home.hero.or': 'OPPURE',
  'home.search.label': 'Cerca nella libreria dei giochi',
  'home.search.placeholder': 'Cerca titolo / sviluppatore / serie',
  'home.search.submit': 'Cerca',
  'home.consoles.title': 'Sfoglia per console',
  'home.consoles.lead':
    'NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive, arcade e altro — scegline una per vedere i suoi giochi.',
  'home.consoles.count': '{count} giochi',
  'home.consoles.all': 'Tutte le console',
  'home.latest.title': 'Ultimi arrivi',
  'home.latest.lead': 'I giochi più recenti del sito.',
  'home.latest.viewAll': 'Tutti i giochi',
  'home.developers.title': 'Sfoglia per sviluppatore',
  'home.developers.lead': 'Questi studi hanno più giochi qui.',
  'home.developers.viewAll': 'Tutti gli sviluppatori',
  'home.empty':
    'La libreria è vuota — apri la stanza e trascina una ROM sul tubo catodico per iniziare.',
  'home.faq.title': 'Domande frequenti',
  'home.faq.q1': 'È gratis?',
  'home.faq.a1':
    'Del tutto gratis — ogni gioco è libero. Accedendo aggiungi i salvataggi cloud per cronologia e file di salvataggio.',
  'home.faq.q2': 'Devo installare qualcosa?',
  'home.faq.a2': 'No — clicca un gioco e gioca direttamente nel browser.',
  'home.faq.q3': 'Funziona su telefoni e tablet?',
  'home.faq.a3': 'Sì — funziona direttamente nel browser di telefoni e tablet.',
  'home.faq.q4': 'Posso scaricare i file ROM?',
  'home.faq.a4':
    'Sì — ogni pagina di gioco ha un pulsante di download. Scarica solo file ROM che hai il diritto legale di usare.',
  'home.faq.q5': 'Posso giocare con un amico?',
  'home.faq.a5': 'Certo! Chiama un amico e apri una stanza per una sfida.',
  'home.faq.q6': 'Supporta i controller?',
  'home.faq.a6':
    'Sì — collega un controller USB o Bluetooth e l\'emulatore lo rileva tramite il browser. La mappatura segue i valori predefiniti di ogni core; sul telefono usi i pulsanti a schermo.',
  'seo.heading': 'Gioca ai giochi retrò nel browser',
  'seo.intro':
    '{site} è una stanza di giochi retrò online. Titoli NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive e arcade girano qui nel browser — emulati sulla tua macchina, con RetroArch compilato in WebAssembly.',
  'seo.howTo':
    'Scegli un gioco dalla libreria online oppure trascina il tuo file ROM sulla televisione. Niente da installare.',
  'seo.games.title': 'Tutti i giochi — Gioca a NES, SNES, GBA e arcade online',
  'seo.games.description':
    '{count} giochi retrò nella libreria online, tutti giocabili nel browser: NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive, arcade e altro. Apri un titolo per i dettagli, gioca subito o scarica il file ROM.',
  'seo.games.search.title': 'Risultati per «{keyword}»',
  'seo.games.search.description':
    '{count} giochi nella libreria online corrispondono a «{keyword}». Giocali nel browser o scarica il file ROM.',
  'seo.games.console.title': 'Giochi {console} — Gioca online nel browser',
  'seo.games.console.description':
    '{count} giochi {console} nella libreria online, tutti giocabili nel browser o scaricabili come file ROM.',
  'seo.game.title': '{title} — Gioca a {console} online',
  'seo.game.description':
    'Gioca a {title} ({console}) direttamente nel browser — gratis e senza installare nulla. Il file ROM è disponibile anche per il download.',
  'seo.gameDownload.title': 'Scarica la ROM di {title} ({console})',
  'seo.gameDownload.description':
    'Scarica il file ROM di {title} ({console}) con un clic, senza registrazione. Puoi anche giocarci direttamente nel browser.',
  'seo.developers.title':
    'Sviluppatori — Gioca ai loro giochi NES, SNES, GBA e arcade',
  'seo.developers.description':
    '{count} sviluppatori dietro ai giochi della libreria online. Aprine uno per vedere tutti i titoli che abbiamo di quello studio.',
  'seo.developer.title': '{name} — Giochi di questo sviluppatore',
  'seo.developer.description':
    'Tutti i {count} giochi di {name} nella libreria online, giocabili nel browser o scaricabili come file ROM.',
  'seo.consoles.title':
    'Sfoglia per console — Gioca online a NES, SNES, GBA e arcade',
  'seo.consoles.description':
    'Tutte le console della libreria online ({count} giochi in tutto). Scegline una per vedere tutti i suoi giochi, giocabili nel browser.',
  'seo.console.title': 'Giochi {name} — Gioca online',
  'seo.console.description':
    'Tutti i {count} giochi {name} nella libreria online, giocabili nel browser o scaricabili come file ROM.',

  'theme.toDark': 'Passa alla modalità notte',
  'theme.toLight': 'Passa alla modalità giorno',
  'lamp.turnOn': 'Accendi la lampada',
  'lamp.turnOff': 'Spegni la lampada',
  'simple.enter':
    'Modalità semplice: lascia solo muro, TV, scrivania e pavimento',
  'simple.exit': 'Esci dalla modalità semplice',
  'tvSize.open': 'Dimensione TV',
  'tvSize.opt.large': 'Grande',
  'tvSize.opt.medium': 'Media',
  'tvSize.opt.small': 'Piccola',
  'tvSize.pick': 'Imposta la dimensione TV su {level}',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Lingua',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟**当前页面语言**，只有那颗钮跟**目标语言**（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'Questa pagina è in italiano',
  'localePrompt.body':
    'Il tuo browser preferisce un\'altra lingua. Vuoi cambiare?',
  'localePrompt.keep': 'Resta in italiano',
  'fullscreen.enter': 'Schermo intero per il gioco',
  'fullscreen.exit': 'Esci dallo schermo intero',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P）—— 这套字模没有重音字形，
   * 意大利语里带重音的字母会落到系统字体上（globals.css 的 `.screen-hint-*` 补偿字号）。
   */
  'screen.pick': 'Clicca per scegliere un file ROM, o trascinalo qui',
  'screen.srLabel': 'Scegli un file ROM da avviare',
  'screen.tapLoad': 'CLICCA PER CARICARE UNA ROM LOCALE',
  'screen.orLibrary': 'OPPURE AVVIA DALLA LIBRERIA ONLINE',
  'screen.release': 'RILASCIA PER CARICARE',
  'screen.mobileLibrary': 'AVVIA DALLA LIBRERIA',
  'screen.mobileTap': 'TOCCA LO SCHERMO PER APRIRE LA LIBRERIA',
  'screen.waitingHost': 'IN ATTESA DELL\'HOST',
  'screen.paused': 'IN PAUSA',
  'screen.resumeOnPanel': 'PREMI RIPRENDI SUL PANNELLO',
  'screen.resumeInPanel': 'PREMI RIPRENDI NEL PANNELLO A DESTRA',
  'screen.waitHostResume': 'IN ATTESA CHE L\'HOST RIPRENDA',

  /* 机身面板那排钮 */
  'panel.resume': 'Riprendi',
  'panel.pause': 'Pausa',
  'panel.save': 'Salva',
  'panel.load': 'Carica',
  'panel.reset': 'Reset',
  'panel.eject': 'Espelli',

  'volume.down': 'Abbassa il volume di un livello',
  'volume.up': 'Alza il volume di un livello',
  'volume.set': 'Imposta il volume a {level} su {max}',

  'saves.title': 'Carica salvataggio',
  'saves.load': 'Carica',
  'saves.close': 'Chiudi',
  'saves.groupLocal': 'Questo dispositivo',
  'saves.groupCloud': 'Cloud (account)',
  'saves.deleteCloud': 'Elimina questo salvataggio cloud',
  'saves.delete': 'Elimina',
  'saves.loginHint':
    'Accedi per conservare i salvataggi cloud e riprendere su qualsiasi dispositivo.',
  'saves.login': 'Accedi',
  'saves.loading': 'Caricamento…',
  'saves.downloading': 'Download del salvataggio cloud…',
  'saves.restoring': 'Ripristino del gioco…',
  'saves.empty': 'Nessun salvataggio',

  'library.removeLabel': 'Rimuovi {name}',

  'legend.moves': 'movimento',
  'legend.open': 'Comandi',
  'legend.title': 'Comandi',
  'legend.close': 'Chiudi',
  'legend.needZip':
    'Formato  FBNeo legge solo .zip — questo sembra un {ext}. Ripacchettalo oppure prendi una versione .zip',
  'play.needZip':
    'Formato  Questa ROM è un archivio {ext} che non è stato possibile estrarre — prova un .zip o una ROM non compressa',
  'legend.needDisc':
    'Formato  Le immagini disco sono di solito su più file (.cue + .bin). Questo sito accetta solo immagini in un unico file — prendi una versione .pbp, .iso o .chd',
  'play.needDisc':
    'Formato  Questa è un\'immagine disco su più file (.cue + .bin). Qui funzionano solo le immagini in un unico file — prova una versione .pbp, .iso o .chd',
  'legend.needBios':
    'BIOS  Sembra un gioco Neo Geo (KOF, Metal Slug…). Serve neogeo.zip — trascina quel file sulla pagina e viene installato. I giochi CPS1 / CPS2 non ne hanno bisogno.',
  'legend.gamepad':
    'Controller  Collegalo e funziona — su entrambi i lati quando sei in una stanza.',

  'netplay.title': 'Gioco in rete',
  'netplay.open': 'Gioca in rete',
  'netplay.close': 'Chiudi',
  'netplay.create': 'Crea una stanza',
  'netplay.or': 'oppure',
  'netplay.join': 'Entra',
  'netplay.codePlaceholder': 'CODICE',
  'netplay.hint':
    'Entrambi i lati devono solo raggiungere il relay pubblico — sulla stessa LAN funziona meglio. Detta il codice di 4 caratteri all\'altro giocatore. L\'host esegue l\'emulatore e trasmette l\'immagine; l\'ospite non ha bisogno della ROM.',
  'netplay.roomCode': 'Codice stanza',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Internet pubblico',
  'netplay.wanDev': 'Il gioco in rete su internet pubblico è in sviluppo.',
  'netplay.quality': 'Qualità streaming',
  'netplay.qualitySmooth': 'Fluido',
  'netplay.qualityBalanced': 'Bilanciato',
  'netplay.qualitySharp': 'Nitido',
  'netplay.qualityHint':
    'L\'host esegue emulatore e streaming sulla stessa macchina. Se non riesce a stare al passo, tutto il gioco rallenta (slow motion). In quel caso abbassa di un livello — vale solo per l\'host.',
  'netplay.copy': 'Copia',
  'netplay.copied': 'Copiato',
  'netplay.share': 'Condividi',
  'netplay.shareCopied': 'Link copiato',
  'netplay.inviteTitle': 'Invito alla stanza',
  'netplay.inviteBody': 'Entrare nella stanza {code}?',
  'netplay.inviteJoin': 'Entra',
  'netplay.inviteCancel': 'Annulla',
  'netplay.connected': 'Connesso',
  'netplay.waiting': 'In attesa dell\'altro giocatore',
  'netplay.joining': 'Ingresso nella stanza…',
  'netplay.waitingGame':
    'Connesso — in attesa che l\'host carichi una cartuccia',
  'netplay.hostPlaying': 'L\'host sta giocando',
  'netplay.paused': 'In pausa',
  'netplay.toastHost':
    'Connesso · l\'altro giocatore è dentro · sei il giocatore 1',
  'netplay.toastGuest': 'Connesso all\'host · sei il giocatore 2',
  'netplay.toastHostLeft': 'L\'host è uscito — la stanza è chiusa',
  'netplay.toastGuestLeft': 'Il giocatore 2 ha lasciato la stanza',
  'netplay.youAreHost':
    'Sei il giocatore 1. Carica una cartuccia e l\'immagine viene inviata automaticamente all\'ospite. Giochi con il tuo set di tasti — vedi Comandi per l\'assegnazione attuale.',
  'netplay.youAreGuest':
    'Sei il giocatore 2. Non serve la cartuccia — l\'host trasmette l\'immagine e i tuoi input vengono inviati all\'host. Gioca con il tuo set di tasti (gruppo Giocatore 1) o con un controller — vedi Comandi.',
  'netplay.leave': 'Esci dalla stanza',
  'netplay.closeRoom': 'Chiudi la stanza',
  'netplay.badCode':
    'Il codice non sembra giusto — dovrebbe avere 4 caratteri.',
  'netplay.errInsecure':
    'Il gioco in rete richiede HTTPS o localhost. Questa pagina è in http semplice, quindi il browser non espone l\'API crittografica necessaria.',
  'netplay.errNoDirect':
    'Entrambi i lati hanno raggiunto il relay, ma non è stata aperta una connessione diretta — di solito è il NAT o un firewall. Sulla stessa LAN funziona meglio.',
  'netplay.errPassword': 'Codice stanza errato.',
  'netplay.errHandshake':
    'Handshake scaduto — l\'altro giocatore potrebbe essere uscito.',
  'netplay.errHostLeft': 'L\'host ha lasciato la stanza — è stata chiusa.',
  'netplay.errRoomFull':
    'La stanza è già piena — questo gioco è solo uno contro uno.',
  'netplay.errUnknown':
    'Impossibile connettersi all\'altro giocatore. La console del browser riporta il motivo esatto.',

  'seo.play.title': 'Sala di gioco — Carica un gioco e gioca online',
  'seo.play.description':
    'Una sola schermata per iniziare: gioca da solo oppure apri una stanza 1 contro 1 e condividi il codice. Titoli NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive e arcade.',
  'play.modeSolo': 'Da solo',
  'play.start': 'Avvia',
  'play.confirmStart': 'Conferma e avvia',
  'play.confirm': 'Conferma',
  'play.qualityIntro':
    'Scegli la qualità dell\'immagine per il gioco online in base alla connessione.',
  'play.qualityHint.smooth':
    '30 fps · Usa meno banda, adatta alle connessioni lente.',
  'play.qualityHint.balanced':
    'Fino a 720p / 60 fps · Bilancia nitidezza e fluidità.',
  'play.qualityHint.sharp':
    'Fino a 60 fps · Privilegia il dettaglio della risoluzione originale; richiede una connessione veloce. Su reti lente il frame rate può calare.',
  'play.qualityConfirmHint':
    'Conferma per connetterti alla stanza. Poi l\'host carica il gioco; l\'ospite riceve l\'immagine dell\'host.',
  'play.connecting': 'Connessione…',
  'play.confirmJoin': 'Conferma ed entra',
  'play.cancel': 'Annulla',
  'play.screenSize': 'Dimensione schermo',
  'play.controlsTitle': 'Comandi di gioco',
  'play.netplayKeysHint':
    'Nel gioco in rete ogni giocatore usa i propri tasti del Giocatore 1.',
  'play.cancelled': 'Caricamento annullato.',
  'play.retry': 'Carica di nuovo',
  'play.retryJoin': 'Prova a entrare di nuovo',
  'play.saved': 'Gioco salvato.',
  'play.localSaving': 'Salvataggio…',
  'play.uploading': 'Invio…',
  'play.cloudFailed': 'Sincronizzazione cloud non riuscita.',
  'play.saveNoLogin': 'Accedi per sincronizzare',
  'play.tooLarge': 'Salvataggio troppo grande',
  'play.theme': 'Tema',
  'play.saveFailed': 'Impossibile salvare il gioco. Riprova.',
  'play.loadFailed': 'Impossibile caricare il salvataggio. Riprova.',
  'play.leftRoom': 'Hai lasciato la stanza.',
  'play.latency': 'Latenza',
  'play.measuringLatency': 'Misurazione…',
  'play.downloading': 'Download della ROM…',
  'play.booting': 'Avvio del core…',
  'play.loadFail': 'Questa cartuccia non si è caricata.',
  'play.romIncomplete': 'Il file ROM è incompleto — caricalo di nuovo.',
  'play.notFound': 'Gioco non trovato.',
  'play.fullscreen': 'Schermo intero',
  'play.volume': 'Volume',
  'play.edit': 'Modifica',
  'play.hideSidebar': 'Nascondi pannello',
  'play.showSidebar': 'Mostra pannello',
  'play.hint':
    'Esc esce dallo schermo intero. Nient\'altro qui usa la tastiera.',
  'play.leaveTitle': 'Partita in corso',
  'play.leaveBody':
    'Tornando indietro la sessione finisce — i progressi non vengono salvati automaticamente.',
  'play.leaveStay': 'Continua a giocare',
  'play.leaveGo': 'Esci',
  'gamesPage.playOnline': 'Gioca in rete',

  'keybind.title': 'Assegnazione tasti',
  'keybind.open': 'Impostazioni tasti',
  'keybind.close': 'Chiudi',
  'keybind.p1': 'Giocatore 1',
  'keybind.p2': 'Giocatore 2',
  'keybind.mine': 'I tuoi tasti',
  'keybind.pressKey': 'PREMI…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Ripristina predefiniti',
  'keybind.reload': 'Ricarica cartuccia',
  'keybind.reloading': 'Ricaricamento…',
  'keybind.unsupported': 'Questo tasto non si può usare — provane un altro.',
  'keybind.conflictSame':
    '{pressed} è già assegnato al pulsante {button} — prova un altro tasto.',
  'keybind.conflictOther':
    '{pressed} è già assegnato al pulsante {button} del giocatore {player} — prova un altro tasto.',
  'keybind.hint':
    'La mappa della tastiera viene letta una volta sola, al caricamento della cartuccia — ricaricala per applicare le modifiche. I due giocatori non possono condividere un tasto.',
  'keybind.soloHint':
    'La mappa della tastiera viene letta una volta sola, al caricamento della cartuccia — ricaricala per applicare le modifiche.',
  'keybind.hostHint':
    'Sei l\'host: il Giocatore 1 è la tua tastiera, il Giocatore 2 è dove viene iniettato l\'input dell\'ospite. Non possono condividere un tasto, altrimenti l\'input iniettato muoverebbe anche il tuo Giocatore 1. Ricarica la cartuccia dopo la modifica.',
  'keybind.guestHint':
    'Sei l\'ospite e giochi con il tuo set di tasti (gruppo Giocatore 1) — ognuno sta alla propria tastiera, quindi non si sovrappongono. Le modifiche hanno effetto subito, senza ricaricare la cartuccia.',
  'keybind.guestLocalHint':
    'Sei l\'ospite e qui gira anche una tua cartuccia. I tuoi tasti sono il gruppo Giocatore 1: comandano quella cartuccia locale, quindi ricaricala dopo la modifica — e sono anche quelli inviati all\'host, dove valgono subito.',

  'games.open': 'Libreria dei giochi',
  'games.title': 'Libreria dei giochi',
  'games.close': 'Chiudi',
  'games.empty': 'La libreria è vuota — non è ancora stato caricato nulla',
  'games.loading': 'Caricamento…',
  'games.loadingRom': 'Caricamento di {name}…',
  'games.cancel': 'Annulla',
  'games.failed': 'Impossibile caricare la libreria dei giochi',
  'games.tabLibrary': 'Libreria dei giochi',
  'games.tabHistory': 'Cronologia',
  'games.historyEmpty': 'Non hai ancora aperto nulla dalla libreria',
  'games.historyLoad': '{name}\nClicca per caricare di nuovo',
  'games.tabFavorites': 'Preferiti',
  'games.favorite': 'Aggiungi {name} ai preferiti',
  'games.unfavorite': 'Rimuovi {name} dai preferiti',
  'games.favoritesEmpty':
    'Nessun preferito — tocca la stella su una copertina.',
  'games.favoritesSignInBefore': 'Accedi per conservare i preferiti — ',
  'games.favoritesSignInLink': 'Accedi',
  'games.favoritesSignInAfter':
    ' qui, oppure usa il pulsante account in alto a destra.',

  'user.title': 'Account',
  'user.close': 'Chiudi',
  'user.open': 'Account — accedi o registrati',
  'user.openSignedIn': 'Account: {name}',
  'user.tabLogin': 'Accedi',
  'user.tabRegister': 'Crea account',
  'user.username': 'Nome utente',
  'user.password': 'Password',
  'user.usernameHint': '3–20 caratteri: lettere, cifre, _ - .',
  'user.emailLabel': 'Email',
  'user.emailHint':
    'La tua email. Niente alias con +, niente email temporanee.',
  'user.passwordHint': 'Almeno 6 caratteri, senza spazi.',
  'user.signIn': 'Accedi',
  'user.signUp': 'Crea account',
  'user.signingIn': 'Accesso…',
  'user.signingUp': 'Creazione…',
  'user.signOut': 'Esci',
  'user.signedInAs': 'Hai effettuato l\'accesso come {name}.',
  'user.cloudHint':
    'Cronologia, salvataggi e preferiti sono nel tuo account — apri un gioco dalla libreria online e si sincronizzano automaticamente.',
  'user.formLead':
    'Accedi e salvataggi, cronologia e preferiti restano nel cloud — gioca quando vuoi, dove vuoi!',
  'user.consentLogin': 'Accedendo accetti i nostri ',
  'user.consentRegister': 'Creando un account accetti i nostri ',
  'user.consentMiddle': ' e ',
  'user.consentAfter': '.',

  'user.error.failed': 'Qualcosa è andato storto — riprova.',
  'user.error.missingCredentials': 'Inserisci nome utente e password.',
  'user.error.usernameInvalid':
    'Il nome utente può contenere solo lettere, cifre, _ - e .',
  'user.error.usernameTooShort':
    'Il nome utente è troppo corto (almeno 3 caratteri).',
  'user.error.usernameTooLong':
    'Il nome utente è troppo lungo (massimo 20 caratteri).',
  'user.error.usernameTaken': 'Nome utente già in uso — scegline un altro.',
  'user.error.emailInvalid': 'Inserisci un indirizzo email valido.',
  'user.error.emailAlias':
    'Gli alias email (come nome+tag@… o Gmail con i punti) non sono ammessi.',
  'user.error.emailTemp':
    'I provider di email usa e getta non sono ammessi — usa la tua casella abituale.',
  'user.error.passwordInvalid': 'Inserisci una password.',
  'user.error.passwordTooShort':
    'La password è troppo corta (almeno 6 caratteri).',
  'user.error.passwordTooLong':
    'La password è troppo lunga (massimo 72 caratteri).',
  'user.error.passwordHasSpace': 'La password non può contenere spazi.',
  'user.error.invalidCredentials': 'Nome utente o password errati.',
  'user.error.banned': 'Questo account è stato sospeso.',
  'user.error.captchaRequired': 'Completa prima la verifica umana.',
  'user.error.captchaFailed': 'Verifica umana non riuscita — riprova.',
  'login.lead':
    'Accedi e salvataggi, cronologia e preferiti restano nel cloud — gioca quando vuoi, dove vuoi. Non hai un account? Creane uno.',

  'account.title': 'Il tuo account',
  'account.loading': 'Caricamento…',
  'account.failed': 'Qualcosa è andato storto — riprova.',
  'account.since': 'Iscritto dal {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Standard',
  'account.vipUntil': 'VIP fino al {time}',
  'account.vipExpired': 'VIP scaduto il {time}',
  'account.tabFavorites': 'Preferiti',
  'account.tabHistory': 'Cronologia',
  'account.tabSaves': 'Salvataggi',
  'account.tabProfile': 'Profilo',
  'account.tabPassword': 'Password',
  'account.favoritesLoading': 'Caricamento preferiti…',
  'account.historyLoading': 'Caricamento cronologia…',
  'account.savesLoading': 'Caricamento salvataggi…',
  'account.favoritesEmpty':
    'Nessun preferito — apri la libreria dei giochi nella stanza e tocca la stella su una copertina.',
  'account.unfavorite': 'Rimuovi {name} dai preferiti',
  'account.historyEmpty':
    'Nessuna cronologia — i giochi aperti dalla libreria online compaiono qui.',
  'account.historyCount': '{count} giochi giocati di recente',
  'account.historyDeleted': 'Rimosso dalla cronologia.',
  'account.clearHistory': 'Cancella tutto',
  'account.confirmClearHistory': 'Cancellare davvero tutto?',
  'account.historyCleared': 'Cronologia cancellata.',
  'account.historyHint':
    'La cronologia conserva i {max} giochi giocati più di recente — rigiocando a uno più vecchio torna in cima.',
  'account.savesEmpty': 'Nessun salvataggio cloud.',
  'account.savesCount': '{count} salvataggi in tutto',
  'account.savesGroupCount': '{count} salvataggio',
  'account.viewGame': 'Vedi {name}',
  'account.savesHint':
    'Un salvataggio per gioco — salvando di nuovo lo sovrascrivi. Vale sia in locale sia nel cloud.',
  'account.saveDeleted': 'Salvataggio eliminato.',
  'account.clearSaves': 'Cancella tutto',
  'account.confirmClearSaves': 'Cancellare davvero tutto?',
  'account.savesCleared': 'Cancellati {count} salvataggi.',
  'account.delete': 'Elimina',
  'account.confirmDelete': 'Eliminare davvero?',

  'account.avatar': 'Avatar',
  'account.chooseImage': 'Scegli immagine',
  'account.clearAvatar': 'Rimuovi avatar',
  'account.uploading': 'Caricamento…',
  'account.avatarSaved': 'Avatar aggiornato.',
  'account.avatarCleared': 'Avatar rimosso.',
  'account.avatarHint': 'PNG, JPEG, WebP o GIF, fino a 2 MB.',
  'account.gender': 'Genere',
  'account.genderNone': 'Non specificato',
  'account.genderMale': 'Maschile',
  'account.genderFemale': 'Femminile',
  'account.genderSaved': 'Salvato.',
  'account.genderHint': 'Facoltativo — non lo vede nessuno tranne te.',
  'account.passwordTabHint':
    'Dopo la modifica resti connesso su questo dispositivo — non devi rientrare.',
  'account.password': 'Password',
  'account.oldPassword': 'Password attuale',
  'account.newPassword': 'Nuova password',
  'account.confirmPassword': 'Ripeti la nuova password',
  'account.savePassword': 'Cambia password',
  'account.saving': 'Salvataggio…',
  'account.passwordSaved': 'Password cambiata.',
  'account.passwordHint':
    'Dopo la modifica resti connesso su questo dispositivo. Gli altri dispositivi connessi continuano a funzionare finché la sessione non scade.',

  'account.error.missingOld': 'Inserisci la password attuale.',
  'account.error.wrongPassword': 'La password attuale non è corretta.',
  'account.error.passwordTooShort':
    'La nuova password è troppo corta (almeno 6 caratteri).',
  'account.error.passwordTooLong':
    'La nuova password è troppo lunga (massimo 72 caratteri).',
  'account.error.passwordHasSpace':
    'La nuova password non può contenere spazi.',
  'account.error.mismatch': 'Le due nuove password non coincidono.',
  'account.error.avatarMissing': 'Scegli prima un\'immagine.',
  'account.error.avatarTooLarge': 'L\'immagine è troppo grande (massimo 2 MB).',
  'account.error.avatarType':
    'Formato non supportato — usa PNG, JPEG, WebP o GIF.',

  'games.filterAll': 'Tutti',
  'games.searchPlaceholder': 'Cerca titolo / sviluppatore / serie',
  'games.search': 'Cerca',
  'games.noMatch': 'Nessun gioco corrispondente.',
  'games.prev': 'Prec.',
  'games.next': 'Succ.',
  /*
   * 在线库的加载速度提示。**意语同样是空串** —— 那句话是说给「文件在境外」的读者听的，
   * 意语界面下的读者多半就在境外，这条既没用又显得莫名其妙（理由与英文那份相同）。
   */
  'games.remoteSlow': '',

  'note.text': 'Che possiamo tutti ritrovare la gioia che avevamo da bambini..',
  'note.open': 'Leggi il biglietto sul pavimento',
  'note.title': 'Un biglietto',
  'note.close': 'Chiudi',
  'window.cycle': 'Cambia la stagione fuori dalla finestra',
  'painting.open': 'Guarda il quadro da vicino',
  'painting.close': 'Chiudi',
  'painting.title.sunflowers': 'Girasoli',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'Monna Lisa',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'Notte stellata',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'L\'urlo',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'Ragazza con l\'orecchino di perla',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'La grande onda di Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Un dipinto senza nome, chissà da dove',
  'painting.artist.unknown': 'Anonimo',
  'mp4.play': 'Riproduci un brano sul lettore MP4',
  'mp4.pause': 'Metti in pausa il lettore MP4',
  'cat.wand': 'Scuoti la bacchetta per gatti sul pavimento',
  'cat.ragdoll': 'Un ragdoll sbuca da dietro i libri',
  'cat.siamese': 'Un siamese sbuca da dietro i libri',
  'cat.tabby': 'Un soriano sbuca da dietro i libri',
  'cat.orange': 'Un soriano rosso sbuca da dietro i libri',
  'cat.american': 'Un american shorthair sbuca da dietro i libri',
  'cat.tuxedo': 'Un gatto tuxedo sbuca da dietro i libri',
  'cat.calico': 'Una gatta calico sbuca da dietro i libri',

  'feedback.open': 'Leggi il libro degli ospiti sul pavimento',
  'feedback.title': 'Libro degli ospiti',
  'feedback.close': 'Chiudi',
  'feedback.placeholder':
    'Scrivi qualcosa — un suggerimento o un gioco che vorresti vedere qui…',
  'feedback.submit': 'Pubblica',
  'feedback.submitting': 'Invio…',
  'feedback.ok': 'Pubblicato — grazie!',
  'feedback.required': 'Scrivi prima qualcosa.',
  'feedback.failed': 'Invio non riuscito — riprova.',
  'feedback.loading': 'Caricamento…',
  'feedback.empty': 'Nessun messaggio — scrivi il primo.',
  'feedback.retry': 'Riprova',
  'feedback.prev': 'Precedente',
  'feedback.next': 'Successiva',
  'feedback.page': 'Pagina {n}',
  'feedback.resolved': 'Risolto',
  'feedback.unresolved': 'Aperto',

  'legal.privacy': 'Informativa sulla privacy',
  'legal.terms': 'Termini di servizio',
  'legal.updated': 'Ultimo aggiornamento {date}',
  'legal.contact': 'Contattaci:',

  'tour.title': 'Guida rapida',
  'tour.skip': 'Salta',
  'tour.back': 'Indietro',
  'tour.next': 'Avanti',
  'tour.done': 'Inizia a giocare',
  'tour.replay': 'Mostra di nuovo la guida',
  'tour.screen.title': 'Inizia con un gioco',
  'tour.screen.body':
    'Trascina un file ROM (.nes, .sfc, .gba, .md, .gb …) o uno .zip arcade sulla TV, oppure clicca lo schermo per scegliere un file. Nessuna ROM è inclusa nel sito — porta la tua.',
  'tour.rail.title': 'La colonna degli interruttori',
  'tour.rail.body':
    'Tre gruppi, dall\'alto in basso. Aspetto: tema (notte / giorno), lingua (Italiano / English / 中文 / 日本語 / 한국어), schermo intero (va a schermo intero lo schermo stesso), modalità semplice (lascia solo muro, TV, scrivania e pavimento), dimensione TV (apre un selettore grande / media / piccola — la scrivania si allarga con essa). Giochi: gioco in rete, assegnazione tasti. Aiuto: comandi, libro degli ospiti.',

  'topLinks.label': 'Pagine del sito',
  'topLinks.games': 'Elenco giochi',
  'menu.open': 'Apri menu',
  'menu.close': 'Chiudi menu',
  'menu.theme': 'Tema',
  'menu.simple': 'Modalità semplice',

  'leave.title': 'Vuoi lasciare questa pagina?',
  'leave.bodyGame':
    'Il gioco in corso verrà interrotto — i progressi non vengono salvati.',
  'leave.bodyNetplay':
    'Uscirà dalla stanza in rete e il tuo avversario verrà disconnesso.',
  'leave.stay': 'Resta',
  'leave.confirm': 'Esci',

  'gamesPage.heading': 'Tutti i giochi',
  'gamesPage.intro':
    '{count} giochi nella libreria online — NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive, arcade e altro. Clicca una copertina per i dettagli oppure inizia subito a giocare.',
  'gamesPage.empty': 'La libreria è vuota.',
  'gamesPage.introConsole':
    '{count} giochi {console} nella libreria. Clicca una copertina per i dettagli oppure inizia subito a giocare.',
  'gamesPage.filterLabel': 'Filtra per console',
  'gamesPage.filterAll': 'Tutti',
  'gamesPage.consoleEmpty':
    'Non ci sono ancora giochi {console} nella libreria.',
  'gamesPage.searchLabel': 'Cerca nella libreria dei giochi',
  'gamesPage.searchPlaceholder': 'Cerca titolo / sviluppatore / serie',
  'gamesPage.searchSubmit': 'Cerca',
  'gamesPage.searchLoading': 'Ricerca in corso…',
  'gamesPage.searchClear': 'Cancella la ricerca',
  'gamesPage.searchResults': '«{keyword}» — {count} giochi trovati.',
  'gamesPage.searchEmpty':
    'Nessun gioco corrisponde a «{keyword}». Prova con una parola più corta o con il titolo.',
  'gamesPage.prev': 'Prec.',
  'gamesPage.next': 'Succ.',
  'gamesPage.backHome': 'Torna alla pagina iniziale',
  'gamesPage.backToGames': 'Tutti i giochi',
  'common.back': 'Indietro',
  'common.home': 'Home',
  'gamesPage.play': 'Gioca ora',
  'gamesPage.download': 'Scarica la ROM',
  'gamesPage.share': 'Condividi questo gioco',
  'gamesPage.shareCopied': 'Link copiato',
  'gamesPage.shareFailed': 'Copia non riuscita',
  'gamesPage.favorite': 'Aggiungi ai preferiti',
  'gamesPage.unfavorite': 'Rimuovi dai preferiti',
  'gamesPage.favoriteSignIn':
    'Accedi per salvare i preferiti — usa il pulsante di accesso nella barra superiore.',
  'gamesPage.favoriteFailed': 'Impossibile aggiornare i preferiti — riprova.',
  'gamesPage.favoriteCount': '{n} nella lista dei preferiti',
  'gamesPage.report': 'Segnala un problema',
  'gamesPage.reportTitle': 'Segnala un problema',
  'gamesPage.reportSubject': 'Oggetto: {name}',
  'gamesPage.reportPlaceholder':
    'Cosa non va? Per esempio: non si avvia, l\'immagine è corrotta, manca l\'audio…',
  'gamesPage.reportSubmit': 'Invia segnalazione',
  'gamesPage.reportSubmitting': 'Invio…',
  'gamesPage.reportOk': 'Grazie — daremo un\'occhiata.',
  'gamesPage.reportRequired': 'Descrivi prima il problema.',
  'gamesPage.reportFailed': 'Invio non riuscito — riprova.',
  'gamesPage.reportClose': 'Annulla',

  'comments.heading': 'Commenti',
  'comments.count': '{n} commenti',
  'comments.empty': 'Nessun commento — puoi essere il primo.',
  'comments.placeholder': 'Cosa ne pensi di questo gioco?',
  'comments.ratingLabel': 'Il tuo voto',
  'comments.ratingStar': 'Vota {n} su 5',
  'comments.ratingValue': '{n} su 5 stelle',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Scegli prima un voto.',
  'comments.submit': 'Pubblica commento',
  'comments.submitting': 'Invio…',
  'comments.ok': 'Pubblicato — è in cima alla lista.',
  'comments.required': 'Scrivi qualcosa prima.',
  'comments.failed': 'Invio non riuscito — riprova.',
  'comments.signInLead': 'Accedi per pubblicare un commento.',
  'comments.signIn': 'Accedi',
  'comments.signInRequired': 'Accedi di nuovo per pubblicare.',
  'comments.loading': 'Caricamento commenti…',
  'comments.retry': 'Riprova',
  'comments.loadFailed': 'Impossibile caricare i commenti.',
  'comments.loadMore': 'Carica altri',
  'comments.delete': 'Elimina',
  'comments.deleteConfirm': 'Conferma',
  'comments.cancel': 'Annulla',
  'comments.deleted': 'Commento eliminato.',
  'comments.deleteFailed': 'Eliminazione non riuscita — riprova.',

  'gamesPage.field.console': 'Console',
  'gamesPage.field.year': 'Anno',
  'gamesPage.field.developer': 'Sviluppatore',
  'gamesPage.field.series': 'Serie',
  'gamesPage.field.language': 'Lingua',
  'gamesPage.controls': 'Comandi',
  'gamesPage.selectLanguage': 'Scegli la lingua',

  'notFound.title': 'Pagina non trovata',
  'notFound.description':
    'Questo indirizzo non esiste su {site}. Controlla il link oppure torna alla pagina iniziale.',
  'gamesPage.notFoundTitle': 'Gioco non trovato',
  'gamesPage.notFound': 'Questo gioco non è (più) nella libreria.',
  'gamesPage.fallbackDescription': '{title} è un gioco {console}.',

  'developersPage.heading': 'Sviluppatori',
  'developersPage.intro':
    '{count} sviluppatori dietro ai giochi della libreria. Aprine uno per vedere tutto quello che abbiamo di quello studio.',
  'developersPage.empty': 'Nessuno sviluppatore in elenco.',
  'developersPage.gameCount': '{count} giochi',
  'developersPage.gamesHeading': 'Giochi di {name}',
  'developersPage.gamesEmpty':
    'Non c\'è ancora nessun gioco di questo sviluppatore nella libreria.',
  'developersPage.field.founded': 'Fondazione',
  'developersPage.backToDevelopers': 'Tutti gli sviluppatori',
  'developersPage.notFoundTitle': 'Sviluppatore non trovato',
  'developersPage.notFound': 'Questo sviluppatore non è (più) nella libreria.',

  'consolesPage.heading': 'Console',
  'consolesPage.intro':
    'Le console della libreria — {count} giochi in tutto. Aprine una per vedere tutti i titoli disponibili.',
  'consolesPage.gameCount': '{count} giochi',
  'consolesPage.gamesHeading': 'Giochi per {name}',
  'consolesPage.gamesEmpty':
    'Non c\'è ancora nessun gioco per questa console nella libreria.',
  /* 筛了语种却一款都没有（`{lang}` 来自 lib/rom-lang.ts 的语言全称，如 Italiano） */
  'consolesPage.gamesEmptyLang':
    'Non c\'è ancora nessun gioco in {lang} per questa console.',
  'consolesPage.filterLangLabel': 'Filtra per lingua',
  'consolesPage.field.released': 'Uscita',
  'consolesPage.backToConsoles': 'Tutte le console',
  'consolesPage.notFoundTitle': 'Console non trovata',
  'consolesPage.notFound': 'Questa console non fa (più) parte del sito.',

  'download.heading': 'Scarica la ROM',
  'download.hint':
    'Clicca il pulsante qui sotto — il download parte dopo 6 secondi.',
  'download.button': 'Avvia il download',
  'download.waiting': 'Avvio tra {seconds}s…',
  'download.started': 'Download avviato — controlla i download del browser.',
  'download.rights':
    'Scarica solo file ROM che hai il diritto legale di usare.',
  'download.disclaimer':
    'Avvertenza: tutti i file ROM di questa pagina provengono da terzi e sono destinati esclusivamente allo studio personale e al backup. Tutti i diritti d\'autore appartengono ai rispettivi editori; se qualche contenuto lede i tuoi diritti, contattaci per la rimozione.',

  'deepLink.notFound': 'Gioco non trovato — potrebbe essere stato rimosso.',
  'deepLink.title': 'Caricamento gioco',
  'deepLink.loading': 'Download della ROM…',
  'deepLink.hint': 'Parte automaticamente al termine del download.',
};

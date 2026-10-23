/**
 * 法语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行，
 * 日韩又各占一个文件（`i18n.ja.ts` / `i18n.ko.ts`）。理由和 `lib/legal.ts` 当初分出去的一样：
 * 五份表全塞进去谁都翻不动。代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序也一致**（558 个），`zh` / `ja` / `ko` 同理。
 *    改文案时**先改 `en`**，再回来对齐这一份（顺序也跟着 `en` 走，方便并排核对）。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` / `{max}` /
 *    `{seconds}` / `{ext}` / `{keyword}` / `{console}` / `{title}` / `{code}` / `{n}` / `{avg}` …），
 *    它们由 `translate()` 在运行时替换。法语语序和英语不同，占位符可以挪位置，
 *    但**不能丢、不能改名、不能换成实际值** —— 漏一个不会报错，只会在页面上少一段字。
 *
 * ⚠️ **这是界面语言，不是内容语言**。内容语言目前仍是 zh / en / ja / ko
 *    （`lib/game-text.ts` 的 `CONTENT_LOCALES`）—— 这次只开了界面法语，
 *    游戏标题 / 简介没有 fr 那一行，所以这款游戏叫什么仍然走内容语言那套。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → console；developer → développeur；series → série
 *   · cartridge → cartouche；room → salle；host → hôte；guest → invité
 *   · netplay → jeu en réseau；save → sauvegarde；key bindings → affectation des touches
 *   · game library → bibliothèque de jeux；guestbook → livre d’or；favorites → favoris
 *   · 按钮一律用**不定式**（Jouer / Télécharger / Charger / Fermer），不用 « Veuillez… » 那种客套
 *   · 站名统一写 `Game Hut`，**不翻译**；`{site}` 占位符照留
 *
 * ⚠️ 机种名用**法语玩家的通行写法**：NES / Super Nintendo (SNES) / Game Boy / GBC / GBA /
 *    NDS / Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade。标题那类要压长度的位置写 `SNES`，正文里首次出现写全称。
 *    （标签位上取的是 `lib/consoles.ts` 的 `consoleLabel(type, locale)`，和文案同源。）
 *
 * ⚠️ 法语排版：冒号、问号、感叹号、分号前留**一个普通空格**（这里不用不换行空格，
 *    免得在等宽 / 像素字体下对不齐）；引号用 « »（里面也留空格）；撇号用 ’。
 *    不要 emoji。
 */

import type { MessageKey } from './i18n';

export const fr: Record<MessageKey, string> = {
  /* SEO 文案（<title> / description / keywords）。不进界面，只给爬虫和社交卡片看 */
  'meta.title':
    '{site} — Jouez aux jeux rétro dans votre navigateur : NES, SNES, GBA et arcade',
  'meta.description':
    'Jouez à des jeux NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive et arcade dans votre navigateur. Choisissez un titre dans la bibliothèque en ligne ou chargez votre propre fichier ROM.',
  'meta.keywords':
    'jeux rétro, bibliothèque de jeux rétro en ligne, émulateur NES, émulateur Super Nintendo, émulateur SNES, émulateur GBA, émulateur Game Boy Advance, émulateur Game Boy, émulateur Game Boy Color, émulateur NDS, émulateur Nintendo DS, émulateur Sega Mega Drive, émulateur Sega Genesis, émulateur Game Gear, émulateur Master System, émulateur Sega 32X, émulateur WonderSwan, émulateur Neo Geo Pocket, émulateur PlayStation, émulateur PS1, émulateur PSX, émulateur arcade, jouer à la NES dans le navigateur, émulateur dans le navigateur, RetroArch WASM, {site}',
  'seo.room.title': 'La pièce en pixels — Jouez aux jeux rétro dans votre navigateur',
  'seo.room.description':
    'Entrez dans la pièce en pixels : les jeux NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive et arcade tournent sur le téléviseur cathodique. Choisissez un titre dans la bibliothèque en ligne ou déposez votre propre fichier ROM sur l’écran.',
  'seo.login.title': 'Connexion',
  'seo.login.description':
    'Connectez-vous pour synchroniser vos sauvegardes, votre historique de jeu et vos favoris sur tous vos appareils.',

  /* 首页落地页 */
  'home.hero.title': 'Jouez aux grands classiques du jeu rétro dans votre navigateur',
  'home.hero.lead':
    '{site} réunit des jeux NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive, arcade et bien d’autres, jouables en ligne, avec un mode deux joueurs en réseau.',
  'home.hero.play': 'Charger une ROM locale',
  'home.hero.browse': 'Voir tous les jeux',
  'home.join.title': 'Jouer avec un ami',
  'home.join.hint': 'Saisissez le code de salle à 4 caractères partagé par votre ami.',
  'home.join.submit': 'Rejoindre la salle',
  'home.hero.or': 'OU',
  'home.search.label': 'Rechercher dans la bibliothèque de jeux',
  'home.search.placeholder': 'Titre / développeur / série',
  'home.search.submit': 'Rechercher',
  'home.consoles.title': 'Parcourir par console',
  'home.consoles.lead':
    'NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive, arcade et bien d’autres — choisissez une console pour voir ses jeux.',
  'home.consoles.count': '{count} jeux',
  'home.consoles.all': 'Toutes les consoles',
  'home.latest.title': 'Derniers ajouts',
  'home.latest.lead': 'Les jeux les plus récents du site.',
  'home.latest.viewAll': 'Tous les jeux',
  'home.developers.title': 'Parcourir par développeur',
  'home.developers.lead': 'Ces studios ont le plus de jeux ici.',
  'home.developers.viewAll': 'Tous les développeurs',
  'home.empty':
    'La bibliothèque est vide pour le moment — ouvrez la pièce et déposez une ROM sur le téléviseur pour commencer à jouer.',
  'home.faq.title': 'Questions fréquentes',
  'home.faq.q1': 'Est-ce gratuit ?',
  'home.faq.a1':
    'Entièrement gratuit — tous les jeux sont accessibles. La connexion ajoute des sauvegardes cloud pour votre historique et vos fichiers de sauvegarde.',
  'home.faq.q2': 'Faut-il installer quelque chose ?',
  'home.faq.a2': 'Non — cliquez sur un jeu et jouez directement dans votre navigateur.',
  'home.faq.q3': 'Ça fonctionne sur téléphone et sur tablette ?',
  'home.faq.a3': 'Oui — tout se passe dans le navigateur, sur téléphone comme sur tablette.',
  'home.faq.q4': 'Peut-on télécharger les fichiers ROM ?',
  'home.faq.a4':
    'Oui — chaque page de jeu a un bouton de téléchargement. Ne téléchargez que des fichiers ROM que vous êtes en droit d’utiliser.',
  'home.faq.q5': 'Peut-on jouer avec un ami ?',
  'home.faq.a5': 'Bien sûr ! Invitez un ami et créez une salle pour faire une partie.',
  'home.faq.q6': 'Les manettes sont-elles prises en charge ?',
  'home.faq.a6':
    'Oui — branchez une manette USB ou Bluetooth et l’émulateur la détecte via votre navigateur. Les boutons suivent les réglages par défaut de chaque cœur ; sur téléphone, utilisez les boutons à l’écran.',

  /* 首屏那段看不见的正文（sr-only） */
  'seo.heading': 'Jouez aux jeux rétro dans votre navigateur',
  'seo.intro':
    '{site} est une salle de jeu rétro en ligne. Les titres NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive et arcade tournent ici même dans le navigateur — émulés sur votre machine, avec RetroArch compilé en WebAssembly.',
  'seo.howTo':
    'Choisissez un jeu dans la bibliothèque en ligne ou déposez votre propre fichier ROM sur le téléviseur. Rien à installer.',

  /* 列表 / 详情 / 下载 / 开发商 / 机种各页的 SEO */
  'seo.games.title': 'Tous les jeux — Jouez en ligne à la NES, la SNES, la GBA et l’arcade',
  'seo.games.description':
    '{count} jeux rétro dans la bibliothèque en ligne, tous jouables dans votre navigateur : NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive, arcade et bien d’autres. Ouvrez un titre pour les détails, jouez tout de suite ou téléchargez le fichier ROM.',
  'seo.games.search.title': 'Résultats de recherche pour « {keyword} »',
  'seo.games.search.description':
    '{count} jeux de la bibliothèque en ligne correspondent à « {keyword} ». Jouez-y dans votre navigateur ou téléchargez le fichier ROM.',
  'seo.games.console.title': 'Jeux {console} — Jouez en ligne dans votre navigateur',
  'seo.games.console.description':
    '{count} jeux {console} dans la bibliothèque en ligne, tous jouables dans votre navigateur ou téléchargeables au format ROM.',
  'seo.game.title': '{title} — Jouez à {console} en ligne',
  'seo.game.description':
    'Jouez à {title} ({console}) directement dans le navigateur — gratuit, rien à installer. Le fichier ROM est aussi disponible au téléchargement.',
  'seo.gameDownload.title': 'Télécharger la ROM de {title} ({console})',
  'seo.gameDownload.description':
    'Téléchargez le fichier ROM de {title} ({console}) en un clic, sans inscription. Vous pouvez aussi y jouer directement dans le navigateur.',
  'seo.developers.title':
    'Développeurs de jeux — Jouez à leurs jeux NES, SNES, GBA et arcade',
  'seo.developers.description':
    '{count} développeurs derrière les jeux de la bibliothèque en ligne. Ouvrez-en un pour voir tous les titres de ce studio.',
  'seo.developer.title': '{name} — Les jeux de ce développeur',
  'seo.developer.description':
    'Tous les jeux {name} de la bibliothèque en ligne ({count}), jouables dans votre navigateur ou téléchargeables au format ROM.',
  'seo.consoles.title':
    'Parcourir par console — Jouez en ligne à la NES, la SNES, la GBA et l’arcade',
  'seo.consoles.description':
    'Toutes les consoles de la bibliothèque en ligne ({count} jeux au total). Choisissez-en une pour voir tous ses jeux, jouables dans votre navigateur.',
  'seo.console.title': 'Jeux {name} — Jouer en ligne',
  'seo.console.description':
    'Tous les jeux {name} de la bibliothèque en ligne ({count}), jouables dans votre navigateur ou téléchargeables au format ROM.',

  /* 主题 / 吊灯 / 简洁模式 / 电视机大小 */
  'theme.toDark': 'Passer en mode nuit',
  'theme.toLight': 'Passer en mode jour',
  'lamp.turnOn': 'Allumer la lampe',
  'lamp.turnOff': 'Éteindre la lampe',
  'simple.enter': 'Mode simple : ne garder que le mur, le téléviseur, le bureau et le sol',
  'simple.exit': 'Quitter le mode simple',
  'tvSize.open': 'Taille du téléviseur',
  'tvSize.opt.large': 'Grande',
  'tvSize.opt.medium': 'Moyenne',
  'tvSize.opt.small': 'Petite',
  'tvSize.pick': 'Régler la taille du téléviseur sur {level}',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Langue',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟**当前页面语言**，只有那颗钮跟**目标语言**（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'Cette page est en français',
  'localePrompt.body': 'Votre navigateur préfère une autre langue. Changer ?',
  'localePrompt.keep': 'Rester en français',
  'fullscreen.enter': 'Passer l’écran de jeu en plein écran',
  'fullscreen.exit': 'Quitter le plein écran',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P）—— 法语是拉丁字母，继续用这套字模
   * （globals.css 里给 `zh` / `ja` / `ko` 的那几条字号补偿不涉及 fr）。
   * 全大写照英文那份的排版走：短、居中、一眼能读完。
   */
  'screen.pick': 'Cliquez pour choisir un fichier ROM, ou déposez-en un ici',
  'screen.srLabel': 'Choisir un fichier ROM à exécuter',
  'screen.tapLoad': 'CLIQUEZ POUR CHARGER UNE ROM LOCALE',
  'screen.orLibrary': 'OU LANCER DEPUIS LA BIBLIOTHÈQUE EN LIGNE',
  'screen.release': 'RELÂCHEZ POUR CHARGER',
  'screen.mobileLibrary': 'LANCER DEPUIS LA BIBLIOTHÈQUE',
  'screen.mobileTap': 'TOUCHEZ L’ÉCRAN POUR OUVRIR LA BIBLIOTHÈQUE',
  'screen.waitingHost': 'EN ATTENTE DE L’HÔTE',
  'screen.paused': 'EN PAUSE',
  'screen.resumeOnPanel': 'APPUYEZ SUR REPRENDRE SUR LE PANNEAU DE LA CONSOLE',
  'screen.resumeInPanel': 'APPUYEZ SUR REPRENDRE DANS LE PANNEAU À DROITE',
  'screen.waitHostResume': 'EN ATTENTE DE LA REPRISE PAR L’HÔTE',

  /* 机身面板那排钮 */
  'panel.resume': 'Reprendre',
  'panel.pause': 'Pause',
  'panel.save': 'Sauvegarder',
  'panel.load': 'Charger',
  'panel.reset': 'Réinitialiser',
  'panel.eject': 'Éjecter',
  'volume.down': 'Baisser le volume d’un cran',
  'volume.up': 'Monter le volume d’un cran',
  'volume.set': 'Régler le volume au niveau {level} sur {max}',

  /* 存档列表（电池存档，一款一份） */
  'saves.title': 'Charger une sauvegarde',
  'saves.load': 'Charger',
  'saves.close': 'Fermer',
  'saves.groupLocal': 'Cet appareil',
  'saves.groupCloud': 'Cloud (compte)',
  'saves.deleteCloud': 'Supprimer cette sauvegarde cloud',
  'saves.delete': 'Supprimer',
  'saves.loginHint':
    'Connectez-vous pour conserver vos sauvegardes cloud et reprendre sur n’importe quel appareil.',
  'saves.login': 'Se connecter',
  'saves.loading': 'Chargement…',
  'saves.downloading': 'Téléchargement de la sauvegarde cloud…',
  'saves.restoring': 'Restauration du jeu…',
  'saves.empty': 'Aucune sauvegarde',
  'library.removeLabel': 'Retirer {name}',

  /* 按键说明。1P / 2P 那两行由 playerLegend() 现算，这里只有「移动」这个词要翻译 */
  'legend.moves': 'déplace',
  'legend.open': 'Commandes',
  'legend.title': 'Commandes',
  'legend.close': 'Fermer',
  'legend.needZip':
    'Format  FBNeo ne lit que les .zip — celui-ci ressemble à un {ext}. Convertissez-le en .zip ou procurez-vous une version .zip',
  'play.needZip':
    'Format  Cette ROM est une archive {ext} qui n’a pas pu être décompressée — essayez un .zip ou une ROM non compressée',
  'legend.needDisc':
    'Format  Les images disque sont souvent en plusieurs fichiers (.cue + .bin). Ce site n’accepte que les images en un seul fichier — prenez une version .pbp, .iso ou .chd',
  'play.needDisc':
    'Format  Ceci est une image disque en plusieurs fichiers (.cue + .bin). Seules les images en un seul fichier fonctionnent ici — essayez une version .pbp, .iso ou .chd',
  'legend.needBios':
    'BIOS  On dirait un jeu Neo Geo (KOF, Metal Slug…). Il lui faut neogeo.zip — glissez ce fichier sur la page pour l’installer. Les jeux CPS1 / CPS2 n’en ont pas besoin.',
  'legend.gamepad':
    'Manette  Branchez-en une et ça marche — des deux côtés quand vous êtes en salle.',

  /* 联机面板。房间码输入框走 font-pixel，所以 codePlaceholder 保持 ASCII */
  'netplay.title': 'Jeu en réseau',
  'netplay.open': 'Jouer en réseau',
  'netplay.close': 'Fermer',
  'netplay.create': 'Créer une salle',
  'netplay.or': 'ou',
  'netplay.join': 'Rejoindre',
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    'Les deux côtés n’ont besoin que d’atteindre le relais public — le même réseau local reste le plus fiable. Dictez le code à 4 caractères à l’autre joueur. L’hôte fait tourner l’émulateur et diffuse l’image ; l’invité n’a pas besoin de la ROM.',
  'netplay.roomCode': 'Code de la salle',
  'netplay.modeLan': 'Réseau local',
  'netplay.modeWan': 'Internet public',
  'netplay.wanDev': 'Le jeu en réseau sur Internet public est en cours de développement.',
  'netplay.quality': 'Qualité du flux',
  'netplay.qualitySmooth': 'Fluide',
  'netplay.qualityBalanced': 'Équilibrée',
  'netplay.qualitySharp': 'Nette',
  'netplay.qualityHint':
    'L’hôte fait tourner l’émulateur et le flux sur une seule machine. S’il n’arrive pas à suivre, tout le jeu ralentit (ralenti). Descendez d’un cran dans ce cas — cela ne concerne que l’hôte.',
  'netplay.copy': 'Copier',
  'netplay.copied': 'Copié',
  'netplay.share': 'Partager',
  'netplay.shareCopied': 'Lien copié',
  'netplay.inviteTitle': 'Invitation à une salle',
  'netplay.inviteBody': 'Rejoindre la salle {code} ?',
  'netplay.inviteJoin': 'Rejoindre',
  'netplay.inviteCancel': 'Annuler',
  'netplay.connected': 'Connecté',
  'netplay.waiting': 'En attente de l’autre joueur',
  'netplay.joining': 'Connexion à la salle…',
  'netplay.waitingGame': 'Connecté — en attente du chargement d’une cartouche par l’hôte',
  'netplay.hostPlaying': 'L’hôte joue',
  'netplay.paused': 'En pause',
  'netplay.toastHost': 'Connecté · l’autre joueur est là · vous êtes le joueur 1',
  'netplay.toastGuest': 'Connecté à l’hôte · vous êtes le joueur 2',
  'netplay.toastHostLeft': 'L’hôte est parti — la salle est fermée',
  'netplay.toastGuestLeft': 'Le joueur 2 a quitté la salle',
  'netplay.youAreHost':
    'Vous êtes le joueur 1. Chargez une cartouche et l’image est envoyée automatiquement à l’invité. Vous jouez avec votre propre jeu de touches — voir Commandes pour les affectations actuelles.',
  'netplay.youAreGuest':
    'Vous êtes le joueur 2. Pas de cartouche à charger — l’hôte diffuse l’image et vos entrées lui sont transmises. Jouez avec votre propre jeu de touches (groupe Joueur 1) ou une manette — voir Commandes.',
  'netplay.leave': 'Quitter la salle',
  'netplay.closeRoom': 'Fermer la salle',
  'netplay.badCode': 'Ce code ne semble pas valide — il doit comporter 4 caractères.',
  'netplay.errInsecure':
    'Le jeu en réseau exige HTTPS ou localhost. Cette page est en http simple, le navigateur bloque donc l’API cryptographique dont il dépend.',
  'netplay.errNoDirect':
    'Les deux côtés ont atteint le relais, mais aucune connexion directe n’a pu s’ouvrir — en général le NAT ou un pare-feu. Le même réseau local reste le plus fiable.',
  'netplay.errPassword': 'Code de salle incorrect.',
  'netplay.errHandshake': 'Délai de poignée de main dépassé — l’autre joueur est peut-être parti.',
  'netplay.errHostLeft': 'L’hôte a quitté la salle — elle a été fermée.',
  'netplay.errNoRoom':
    "Aucune réponse de l'hôte. Le code de salle est peut-être faux, ou l'hôte n'a pas encore ouvert la salle.",
  'netplay.errRoomFull': 'Cette salle est déjà complète — ce jeu se joue uniquement en un contre un.',
  'netplay.errUnknown':
    'Impossible de joindre l’autre joueur. La console du navigateur indique la raison exacte.',

  /* `/play` —— 左边黑屏 + 右边控件那一页 */
  'seo.play.title': 'Salle de jeu — Chargez un jeu et jouez en ligne',
  'seo.play.description':
    'Un seul écran pour lancer une partie : jouez en solo ou ouvrez une salle 1 contre 1 et partagez le code. Titres NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive et arcade.',
  'play.modeSolo': 'Solo',
  'play.start': 'Démarrer',
  'play.confirmStart': 'Confirmer et démarrer',
  'play.confirm': 'Confirmer',
  'play.qualityIntro':
    'Choisissez la qualité d’image pour le jeu en ligne selon votre connexion.',
  'play.qualityHint.smooth': '30 fps · Moins de bande passante, adapté aux connexions lentes.',
  'play.qualityHint.balanced': 'Jusqu’à 720p / 60 fps · Compromis entre netteté et fluidité.',
  'play.qualityHint.sharp':
    'Jusqu’à 60 fps · Privilégie le détail en résolution d’origine ; connexion rapide requise. Le taux de rafraîchissement peut baisser sur les réseaux lents.',
  'play.qualityConfirmHint':
    'Confirmez pour rejoindre la salle. L’hôte charge ensuite le jeu ; les invités reçoivent l’image de l’hôte.',
  'play.connecting': 'Connexion…',
  'play.confirmJoin': 'Confirmer et rejoindre',
  'play.cancel': 'Annuler',
  'play.screenSize': 'Taille de l’écran',
  'play.controlsTitle': 'Commandes du jeu',
  'play.netplayKeysHint': 'En jeu en ligne, chaque joueur utilise ses propres touches Joueur 1.',
  'play.cancelled': 'Chargement annulé.',
  'play.retry': 'Recharger',
  'play.retryJoin': 'Réessayer de rejoindre',
  'play.saved': 'Jeu sauvegardé.',
  'play.localSaving': 'Sauvegarde…',
  'play.uploading': 'Envoi…',
  'play.cloudFailed': 'Échec de la synchronisation cloud.',
  'play.saveNoLogin': 'Se connecter pour synchroniser',
  'play.tooLarge': 'Sauvegarde trop volumineuse',
  'play.theme': 'Thème',
  'play.saveFailed': 'Impossible de sauvegarder le jeu. Veuillez réessayer.',
  'play.loadFailed': 'Impossible de charger la sauvegarde. Veuillez réessayer.',
  'play.leftRoom': 'Vous avez quitté la salle.',
  'play.latency': 'Latence',
  'play.measuringLatency': 'Mesure…',
  'play.downloading': 'Téléchargement de la ROM…',
  'play.booting': 'Démarrage du cœur…',
  'play.loadFail': 'Échec du chargement de cette cartouche.',
  'play.romIncomplete': 'Le fichier ROM est incomplet — rechargez-le.',
  'play.notFound': 'Ce jeu est introuvable.',
  'play.fullscreen': 'Plein écran',
  'play.volume': 'Volume',
  'play.edit': 'Modifier',
  'play.hideSidebar': 'Masquer le panneau',
  'play.showSidebar': 'Afficher le panneau',
  'play.hint': 'Échap quitte le plein écran. Rien d’autre ici n’utilise le clavier.',
  'play.leaveTitle': 'Partie en cours',
  'play.leaveBody':
    'Revenir en arrière met fin à cette session — la progression n’est pas sauvegardée automatiquement.',
  'play.leaveStay': 'Continuer à jouer',
  'play.leaveGo': 'Quitter',
  'gamesPage.playOnline': 'Jouer en ligne',

  /* 自定义按键面板 */
  'keybind.title': 'Affectation des touches',
  'keybind.open': 'Réglages des touches',
  'keybind.close': 'Fermer',
  'keybind.p1': 'Joueur 1',
  'keybind.p2': 'Joueur 2',
  'keybind.mine': 'Vos touches',
  'keybind.pressKey': 'APPUYEZ…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Rétablir les valeurs par défaut',
  'keybind.reload': 'Recharger la cartouche',
  'keybind.reloading': 'Rechargement…',
  'keybind.unsupported': 'Cette touche ne peut pas être utilisée — essayez-en une autre.',
  'keybind.conflictSame':
    '{pressed} est déjà affectée au bouton {button} — essayez une autre touche.',
  'keybind.conflictOther':
    '{pressed} est déjà affectée au bouton {button} du joueur {player} — essayez une autre touche.',
  'keybind.hint':
    'La correspondance clavier est lue une seule fois, au chargement d’une cartouche — rechargez-la pour appliquer les changements. Les deux joueurs ne peuvent pas partager une touche.',
  'keybind.soloHint':
    'La correspondance clavier est lue une seule fois, au chargement d’une cartouche — rechargez-la pour appliquer les changements.',
  'keybind.hostHint':
    'Vous êtes l’hôte : le joueur 1 correspond à vos touches, le joueur 2 à ce dans quoi les entrées de l’invité sont injectées. Ils ne peuvent pas partager une touche, sinon les entrées injectées piloteraient aussi votre joueur 1. Rechargez une cartouche après modification.',
  'keybind.guestHint':
    'Vous êtes l’invité et jouez avec votre propre jeu de touches (groupe Joueur 1) — chacun est à son clavier, rien ne peut entrer en conflit. Les changements prennent effet immédiatement, sans recharger la cartouche.',
  'keybind.guestLocalHint':
    'Vous êtes l’invité et une cartouche tourne aussi chez vous. Vos touches sont le groupe Joueur 1 : elles pilotent cette cartouche locale, donc rechargez-la après modification — et ce sont aussi celles envoyées à l’hôte, qui s’appliquent immédiatement.',

  /* 在线游戏库（服务端上传的那批） */
  'games.open': 'Bibliothèque de jeux',
  'games.title': 'Bibliothèque de jeux',
  'games.close': 'Fermer',
  'games.empty': 'La bibliothèque est vide — rien n’a encore été mis en ligne',
  'games.loading': 'Chargement…',
  'games.loadingRom': 'Chargement de {name}…',
  'games.cancel': 'Annuler',
  'games.failed': 'Impossible de charger la bibliothèque de jeux',
  'games.tabLibrary': 'Bibliothèque',
  'games.tabHistory': 'Historique',
  'games.historyEmpty': 'Aucun jeu ouvert depuis la bibliothèque',
  'games.historyLoad': '{name}\nCliquer pour recharger',
  'games.tabFavorites': 'Favoris',
  'games.favorite': 'Ajouter {name} aux favoris',
  'games.unfavorite': 'Retirer {name} des favoris',
  'games.favoritesEmpty': 'Aucun favori — touchez l’étoile sur une jaquette.',
  'games.favoritesSignInBefore': 'Connectez-vous pour conserver vos favoris — ',
  'games.favoritesSignInLink': 'Se connecter',
  'games.favoritesSignInAfter':
    ' ici même, ou utilisez le bouton de compte en haut à droite.',

  /* 用户面板（注册 / 登录 / 退出） */
  'user.title': 'Compte',
  'user.close': 'Fermer',
  'user.open': 'Compte — se connecter ou s’inscrire',
  'user.openSignedIn': 'Compte : {name}',
  'user.tabLogin': 'Se connecter',
  'user.tabRegister': 'Créer un compte',
  'user.username': 'Nom d’utilisateur',
  'user.password': 'Mot de passe',
  'user.usernameHint': '3 à 20 caractères : lettres, chiffres, _ - .',
  'user.emailLabel': 'E-mail',
  'user.emailHint': 'Votre e-mail. Pas d’alias avec +, pas de messagerie temporaire.',
  'user.passwordHint': 'Au moins 6 caractères, sans espaces.',
  'user.signIn': 'Se connecter',
  'user.signUp': 'Créer un compte',
  'user.signingIn': 'Connexion…',
  'user.signingUp': 'Création…',
  'user.signOut': 'Se déconnecter',
  'user.signedInAs': 'Connecté en tant que {name}.',
  'user.cloudHint':
    'Votre historique de jeu, vos sauvegardes et vos favoris sont stockés dans votre compte — ouvrez n’importe quel jeu de la bibliothèque en ligne et tout se synchronise automatiquement.',
  'user.formLead':
    'Connectez-vous et vos sauvegardes, votre historique et vos favoris sont conservés dans le cloud — jouez quand vous voulez, où vous voulez !',
  /* ⚠️ 首尾空格是有意义的（把链接和正文分开），别顺手 trim 掉 */
  'user.consentLogin': 'En vous connectant, vous acceptez nos ',
  'user.consentRegister': 'En créant un compte, vous acceptez nos ',
  'user.consentMiddle': ' et ',
  'user.consentAfter': '.',

  'user.error.failed': 'Une erreur est survenue — réessayez.',
  'user.error.missingCredentials': 'Saisissez un nom d’utilisateur et un mot de passe.',
  'user.error.usernameInvalid':
    'Le nom d’utilisateur ne peut contenir que des lettres, des chiffres, _ - et .',
  'user.error.usernameTooShort': 'Nom d’utilisateur trop court (3 caractères minimum).',
  'user.error.usernameTooLong': 'Nom d’utilisateur trop long (20 caractères maximum).',
  'user.error.usernameTaken': 'Ce nom d’utilisateur est déjà pris — choisissez-en un autre.',
  'user.error.emailInvalid': 'Saisissez une adresse e-mail valide.',
  'user.error.emailAlias':
    'Les adresses avec alias (du type nom+tag@… ou Gmail avec des points) ne sont pas autorisées.',
  'user.error.emailTemp':
    'Les messageries jetables ne sont pas autorisées — utilisez votre boîte habituelle.',
  'user.error.passwordInvalid': 'Saisissez un mot de passe.',
  'user.error.passwordTooShort': 'Mot de passe trop court (6 caractères minimum).',
  'user.error.passwordTooLong': 'Mot de passe trop long (72 caractères maximum).',
  'user.error.passwordHasSpace': 'Le mot de passe ne peut pas contenir d’espaces.',
  'user.error.invalidCredentials': 'Nom d’utilisateur ou mot de passe incorrect.',
  'user.error.banned': 'Ce compte a été suspendu.',
  'user.error.captchaRequired': 'Veuillez d’abord valider la vérification humaine.',
  'user.error.captchaFailed': 'Échec de la vérification humaine — veuillez réessayer.',

  /* 独立登录页 */
  'login.lead':
    'Connectez-vous et vos sauvegardes, votre historique et vos favoris sont conservés dans le cloud — jouez quand vous voulez, où vous voulez. Pas encore de compte ? Créez-en un.',

  /* 个人中心（收藏 / 历史 / 存档 / 资料 / 密码） */
  'account.title': 'Votre compte',
  'account.loading': 'Chargement…',
  'account.failed': 'Une erreur est survenue — réessayez.',
  'account.since': 'Membre depuis {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Standard',
  'account.vipUntil': 'VIP jusqu’au {time}',
  'account.vipExpired': 'VIP expiré le {time}',
  'account.tabFavorites': 'Favoris',
  'account.tabHistory': 'Historique',
  'account.tabSaves': 'Sauvegardes',
  'account.tabProfile': 'Profil',
  'account.tabPassword': 'Mot de passe',
  'account.favoritesLoading': 'Chargement des favoris…',
  'account.historyLoading': 'Chargement de l’historique…',
  'account.savesLoading': 'Chargement des sauvegardes…',
  'account.favoritesEmpty':
    'Aucun favori — ouvrez la bibliothèque de jeux dans la pièce et touchez l’étoile d’une jaquette.',
  'account.unfavorite': 'Retirer {name} des favoris',

  /* ---- 历史 ---- */
  'account.historyEmpty':
    'Aucun historique — les jeux ouverts depuis la bibliothèque en ligne apparaissent ici.',
  'account.historyCount': '{count} jeux joués récemment',
  'account.historyDeleted': 'Retiré de l’historique.',
  'account.clearHistory': 'Tout effacer',
  'account.confirmClearHistory': 'Vraiment tout effacer ?',
  'account.historyCleared': 'Historique effacé.',
  'account.historyHint':
    'L’historique conserve vos {max} jeux les plus récents — rejouer à un jeu plus ancien le replace en tête.',

  'account.savesEmpty': 'Aucune sauvegarde cloud.',
  'account.savesCount': '{count} sauvegardes au total',
  'account.savesGroupCount': '{count} sauvegarde',
  'account.viewGame': 'Voir {name}',
  'account.savesHint':
    'Une sauvegarde par jeu — sauvegarder à nouveau l’écrase. Idem en local et dans le cloud.',
  'account.saveDeleted': 'Sauvegarde supprimée.',
  'account.clearSaves': 'Tout effacer',
  'account.confirmClearSaves': 'Vraiment tout effacer ?',
  'account.savesCleared': '{count} sauvegarde(s) effacée(s).',
  'account.delete': 'Supprimer',
  'account.confirmDelete': 'Vraiment supprimer ?',

  /* ---- 资料 ---- */
  'account.avatar': 'Avatar',
  'account.chooseImage': 'Choisir une image',
  'account.clearAvatar': 'Retirer l’avatar',
  'account.uploading': 'Envoi…',
  'account.avatarSaved': 'Avatar mis à jour.',
  'account.avatarCleared': 'Avatar retiré.',
  'account.avatarHint': 'PNG, JPEG, WebP ou GIF, jusqu’à 2 Mo.',
  'account.gender': 'Genre',
  'account.genderNone': 'Non précisé',
  'account.genderMale': 'Homme',
  'account.genderFemale': 'Femme',
  'account.genderSaved': 'Enregistré.',
  'account.genderHint': 'Facultatif — visible par vous seul.',
  'account.passwordTabHint':
    'Vous restez connecté sur cet appareil ensuite — inutile de vous reconnecter.',
  'account.password': 'Mot de passe',
  'account.oldPassword': 'Mot de passe actuel',
  'account.newPassword': 'Nouveau mot de passe',
  'account.confirmPassword': 'Répéter le nouveau mot de passe',
  'account.savePassword': 'Changer le mot de passe',
  'account.saving': 'Enregistrement…',
  'account.passwordSaved': 'Mot de passe modifié.',
  'account.passwordHint':
    'Vous restez connecté sur cet appareil après la modification. Les autres appareils connectés continuent de fonctionner jusqu’à l’expiration de leur session.',

  'account.error.missingOld': 'Saisissez votre mot de passe actuel.',
  'account.error.wrongPassword': 'Le mot de passe actuel est incorrect.',
  'account.error.passwordTooShort':
    'Le nouveau mot de passe est trop court (6 caractères minimum).',
  'account.error.passwordTooLong':
    'Le nouveau mot de passe est trop long (72 caractères maximum).',
  'account.error.passwordHasSpace': 'Le nouveau mot de passe ne peut pas contenir d’espaces.',
  'account.error.mismatch': 'Les deux nouveaux mots de passe ne correspondent pas.',
  'account.error.avatarMissing': 'Choisissez d’abord une image.',
  'account.error.avatarTooLarge': 'Cette image est trop volumineuse (2 Mo maximum).',
  'account.error.avatarType': 'Format non pris en charge — utilisez PNG, JPEG, WebP ou GIF.',

  /* 在线库列表上的筛选与翻页 */
  'games.filterAll': 'Toutes',
  'games.searchPlaceholder': 'Titre / développeur / série',
  'games.search': 'Rechercher',
  'games.noMatch': 'Aucun jeu correspondant.',
  'games.prev': 'Précédent',
  'games.next': 'Suivant',
  /*
   * 在线库的加载速度提示。**法语同样是空串** —— 那句话是说给「文件在境外」的读者听的，
   * 法语界面下的读者多半就在境外，这条既没用又显得莫名其妙（理由与英文那份相同）。
   */
  'games.remoteSlow': '',

  /* 房间里那几件小东西：纸片、窗外季节、挂画、MP4、逗猫棒 */
  'note.text': 'Puissions-nous retrouver la joie de notre enfance..',
  'note.open': 'Lire le papier sur le sol',
  'note.title': 'Un mot',
  'note.close': 'Fermer',
  'window.cycle': 'Changer la saison dehors',
  'painting.open': 'Regarder le tableau de plus près',
  'painting.close': 'Fermer',
  'painting.title.sunflowers': 'Les Tournesols',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'La Joconde',
  'painting.artist.monaLisa': 'Léonard de Vinci',
  'painting.title.starryNight': 'La Nuit étoilée',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'Le Cri',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'La Jeune Fille à la perle',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'La Grande Vague de Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Un tableau sans nom venu d’on ne sait où',
  'painting.artist.unknown': 'Anonyme',
  'mp4.play': 'Lire une chanson sur le lecteur MP4',
  'mp4.pause': 'Mettre le lecteur MP4 en pause',
  'cat.wand': 'Agiter le plumeau à chat sur le sol',
  'cat.ragdoll': 'Un ragdoll pointe le bout de son nez derrière les livres',
  'cat.siamese': 'Un siamois pointe le bout de son nez derrière les livres',
  'cat.tabby': 'Un tabby pointe le bout de son nez derrière les livres',
  'cat.orange': 'Un tabby roux pointe le bout de son nez derrière les livres',
  'cat.american': 'Un shorthair américain pointe le bout de son nez derrière les livres',
  'cat.tuxedo': 'Un chat tuxedo pointe le bout de son nez derrière les livres',
  'cat.calico': 'Un calico pointe le bout de son nez derrière les livres',

  /* 留言本 */
  'feedback.open': 'Lire le livre d’or sur le sol',
  'feedback.title': 'Livre d’or',
  'feedback.close': 'Fermer',
  'feedback.placeholder':
    'Dites-nous quelque chose — une suggestion, ou un jeu que vous aimeriez voir ici…',
  'feedback.submit': 'Publier',
  'feedback.submitting': 'Publication…',
  'feedback.ok': 'Publié — merci !',
  'feedback.required': 'Écrivez d’abord un message.',
  'feedback.failed': 'Publication impossible — réessayez.',
  'feedback.loading': 'Chargement…',
  'feedback.empty': 'Aucun message — soyez le premier à en écrire un.',
  'feedback.retry': 'Réessayer',
  'feedback.prev': 'Précédent',
  'feedback.next': 'Suivant',
  'feedback.page': 'Page {n}',
  'feedback.resolved': 'Résolu',
  'feedback.unresolved': 'Ouvert',

  /* 法务两页只有界面上的几个词，正文在 lib/legal.ts */
  'legal.privacy': 'Politique de confidentialité',
  'legal.terms': 'Conditions d’utilisation',
  'legal.updated': 'Dernière mise à jour : {date}',
  'legal.contact': 'Nous contacter :',

  /* 初次打开的操作指引（两步） */
  'tour.title': 'Visite rapide',
  'tour.skip': 'Passer',
  'tour.back': 'Retour',
  'tour.next': 'Suivant',
  'tour.done': 'Commencer à jouer',
  'tour.replay': 'Revoir la visite',
  'tour.screen.title': 'Commencer avec un jeu',
  'tour.screen.body':
    'Glissez un fichier ROM (.nes, .sfc, .gba, .md, .gb …) ou une archive .zip d’arcade sur le téléviseur, ou cliquez simplement sur l’écran pour choisir un fichier. Aucune ROM n’est fournie avec ce dépôt — apportez la vôtre.',
  'tour.rail.title': 'La colonne d’interrupteurs',
  'tour.rail.body':
    'Trois groupes, de haut en bas. Voyez : thème (nuit / jour), langue (中文 / English / 日本語 / 한국어), plein écran (c’est bien l’écran qui passe en plein écran), mode simple (ne garder que le mur, le téléviseur, le bureau et le sol), taille du téléviseur (ouvre un sélecteur grande / moyenne / petite — le bureau s’élargit d’autant). Jeux : jeu en réseau, affectation des touches. Aide : aide sur les commandes, et le livre d’or.',

  /* 内容页顶栏 / 小屏抽屉 / 离开确认 */
  'topLinks.label': 'Pages du site',
  'topLinks.games': 'Liste des jeux',
  'menu.open': 'Ouvrir le menu',
  'menu.close': 'Fermer le menu',
  'menu.theme': 'Thème',
  'menu.simple': 'Mode simple',
  'leave.title': 'Quitter cette page ?',
  'leave.bodyGame': 'Le jeu en cours sera interrompu — la progression n’est pas sauvegardée.',
  'leave.bodyNetplay':
    'Vous allez quitter la salle de jeu en réseau et votre partenaire sera déconnecté.',
  'leave.stay': 'Rester',
  'leave.confirm': 'Quitter',

  /* 游戏列表页 */
  'gamesPage.heading': 'Tous les jeux',
  'gamesPage.intro':
    '{count} jeux dans la bibliothèque en ligne — NES, Super Nintendo (SNES), Game Boy, GBA, Mega Drive, arcade et bien d’autres. Cliquez sur une jaquette pour les détails, ou commencez à jouer tout de suite.',
  'gamesPage.empty': 'La bibliothèque est vide pour le moment.',
  'gamesPage.introConsole':
    '{count} jeux {console} dans la bibliothèque. Cliquez sur une jaquette pour les détails, ou commencez à jouer tout de suite.',
  'gamesPage.filterLabel': 'Filtrer par console',
  'gamesPage.filterAll': 'Toutes',
  'gamesPage.consoleEmpty': 'Aucun jeu {console} dans la bibliothèque pour l’instant.',
  'gamesPage.searchLabel': 'Rechercher dans la bibliothèque de jeux',
  'gamesPage.searchPlaceholder': 'Titre / développeur / série',
  'gamesPage.searchSubmit': 'Rechercher',
  'gamesPage.searchLoading': 'Recherche…',
  'gamesPage.searchClear': 'Effacer la recherche',
  'gamesPage.searchResults': '« {keyword} » — {count} jeux correspondants.',
  'gamesPage.searchEmpty':
    'Aucun jeu ne correspond à « {keyword} ». Essayez un mot plus court, ou le titre du jeu.',
  'gamesPage.prev': 'Précédent',
  'gamesPage.next': 'Suivant',
  'gamesPage.backHome': 'Retour à l’accueil',
  'gamesPage.backToGames': 'Tous les jeux',
  'common.back': 'Retour',
  'common.home': 'Accueil',
  'gamesPage.play': 'Jouer maintenant',
  'gamesPage.download': 'Télécharger la ROM',
  'gamesPage.share': 'Partager ce jeu',
  'gamesPage.shareCopied': 'Lien copié',
  'gamesPage.shareFailed': 'Échec de la copie',
  'gamesPage.favorite': 'Ajouter aux favoris',
  'gamesPage.unfavorite': 'Retirer des favoris',
  'gamesPage.favoriteSignIn':
    'Connectez-vous pour enregistrer vos favoris — utilisez le bouton de connexion dans la barre supérieure.',
  'gamesPage.favoriteFailed': 'Impossible de mettre à jour les favoris — réessayez.',
  'gamesPage.favoriteCount': '{n} personnes l’ont en favori',
  'gamesPage.report': 'Signaler un problème',
  'gamesPage.reportTitle': 'Signaler un problème',
  'gamesPage.reportSubject': 'À propos de : {name}',
  'gamesPage.reportPlaceholder':
    'Quel est le problème ? Par exemple : le jeu ne démarre pas, l’image est brouillée, le son est absent…',
  'gamesPage.reportSubmit': 'Envoyer le signalement',
  'gamesPage.reportSubmitting': 'Envoi…',
  'gamesPage.reportOk': 'Merci — nous allons regarder cela.',
  'gamesPage.reportRequired': 'Décrivez d’abord le problème.',
  'gamesPage.reportFailed': 'Envoi impossible — réessayez.',
  'gamesPage.reportClose': 'Annuler',

  /* 详情页的评论模块 */
  'comments.heading': 'Commentaires',
  'comments.count': '{n} commentaires',
  'comments.empty': 'Aucun commentaire — soyez le premier.',
  'comments.placeholder': 'Que pensez-vous de ce jeu ?',
  'comments.ratingLabel': 'Votre note',
  'comments.ratingStar': 'Noter {n} sur 5',
  'comments.ratingValue': '{n} étoiles sur 5',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Choisissez d’abord une note.',
  'comments.submit': 'Publier le commentaire',
  'comments.submitting': 'Publication…',
  'comments.ok': 'Publié — il est en tête de liste.',
  'comments.required': 'Écrivez d’abord un message.',
  'comments.failed': 'Publication impossible — réessayez.',
  'comments.signInLead': 'Connectez-vous pour publier un commentaire.',
  'comments.signIn': 'Se connecter',
  'comments.signInRequired': 'Reconnectez-vous pour publier.',
  'comments.loading': 'Chargement des commentaires…',
  'comments.retry': 'Réessayer',
  'comments.loadFailed': 'Impossible de charger les commentaires.',
  'comments.loadMore': 'Voir plus',
  'comments.delete': 'Supprimer',
  'comments.deleteConfirm': 'Confirmer',
  'comments.cancel': 'Annuler',
  'comments.deleted': 'Commentaire supprimé.',
  'comments.deleteFailed': 'Suppression impossible — réessayez.',

  'gamesPage.field.console': 'Console',
  'gamesPage.field.year': 'Année',
  'gamesPage.field.developer': 'Développeur',
  'gamesPage.field.series': 'Série',
  'gamesPage.field.language': 'Langue',
  'gamesPage.controls': 'Commandes',
  'gamesPage.selectLanguage': 'Choisir la langue',
  'notFound.title': 'Page introuvable',
  'notFound.description':
    'Cette adresse n’existe pas sur {site}. Vérifiez le lien, ou retournez à la page d’accueil.',
  'gamesPage.notFoundTitle': 'Jeu introuvable',
  'gamesPage.notFound': 'Ce jeu n’est plus dans la bibliothèque.',
  'gamesPage.fallbackDescription': '{title} est un jeu {console}.',

  /* 开发商两页 */
  'developersPage.heading': 'Développeurs',
  'developersPage.intro':
    '{count} développeurs derrière les jeux de la bibliothèque. Ouvrez-en un pour voir tout ce que nous avons de ce studio.',
  'developersPage.empty': 'Aucun développeur pour le moment.',
  'developersPage.gameCount': '{count} jeux',
  'developersPage.gamesHeading': 'Jeux de {name}',
  'developersPage.gamesEmpty': 'Ce développeur n’a encore aucun jeu dans la bibliothèque.',
  'developersPage.field.founded': 'Fondation',
  'developersPage.backToDevelopers': 'Tous les développeurs',
  'developersPage.notFoundTitle': 'Développeur introuvable',
  'developersPage.notFound': 'Ce développeur n’est plus dans la bibliothèque.',

  /* 机种两页 */
  'consolesPage.heading': 'Consoles',
  'consolesPage.intro':
    'Les consoles de la bibliothèque — {count} jeux au total. Ouvrez-en une pour voir tous ses titres.',
  'consolesPage.gameCount': '{count} jeux',
  'consolesPage.gamesHeading': 'Jeux sur {name}',
  'consolesPage.gamesEmpty': 'Cette console n’a encore aucun jeu dans la bibliothèque.',
  'consolesPage.gamesEmptyLang': 'Cette console n’a encore aucun jeu en {lang}.',
  'consolesPage.filterLangLabel': 'Filtrer par langue',
  'consolesPage.field.released': 'Sortie',
  'consolesPage.backToConsoles': 'Toutes les consoles',
  'consolesPage.notFoundTitle': 'Console introuvable',
  'consolesPage.notFound': 'Cette console ne fait plus partie du site.',

  'download.heading': 'Télécharger la ROM',
  'download.hint':
    'Cliquez sur le bouton ci-dessous — le téléchargement démarre 6 secondes plus tard.',
  'download.button': 'Lancer le téléchargement',
  'download.waiting': 'Démarrage dans {seconds} s…',
  'download.started':
    'Téléchargement lancé — consultez les téléchargements de votre navigateur.',
  'download.rights': 'Ne téléchargez que des fichiers ROM que vous êtes en droit d’utiliser.',
  'download.disclaimer':
    'Avertissement : tous les fichiers ROM de cette page proviennent de tiers et sont destinés uniquement à l’étude personnelle et à la sauvegarde. Les droits d’auteur appartiennent à leurs éditeurs d’origine ; si un contenu porte atteinte à vos droits, contactez-nous pour son retrait.',

  /* 房间页那条 `?id=` 深链 */
  'deepLink.notFound': 'Ce jeu est introuvable — il a peut-être été retiré.',
  'deepLink.title': 'Chargement du jeu',
  'deepLink.loading': 'Téléchargement de la ROM…',
  'deepLink.hint': 'Démarre automatiquement une fois le téléchargement terminé.',
};

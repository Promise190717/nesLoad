/**
 * 站务说明页的文案（关于我们 / 联系我们）+ 全站页脚那句免责声明。
 *
 * **为什么单独开一个文件，而不是塞进 `lib/i18n.ts` 或 `lib/legal.ts`**：
 *   · 不进 i18n 表 —— 那张表只放「常驻在界面上的短文案」，这里是有标题和章节的**长文**，
 *     塞进去要给 `MessageKey` 加几十个键，而且页面得手动拼版式；
 *   · 不进 legal.ts —— 那个文件是**合规文本**（隐私政策 / 服务条款），文体是法务陈述；
 *     这两页是站务说明，语气偏介绍，写在一起会把两套文风混成一份，谁都不敢改。
 *   但**版式壳是共用的**（`components/DocPage.tsx`），所以结构类型仍按 legal.ts 那套
 *   （`LegalSection`）来 —— 壳只认「标题 + 段落 + 列表」，不认文案属于哪一类。
 *
 * ⚠️ **文体（2026-11-03 用户退回过一版，别再犯）**：第一版写得太细、太口语 ——
 *    逐条解释存档怎么同步、18 种语言各自回退到哪份。用户的要求是
 *    「说明得太具体了和口语化了，不够简洁，直接抄参考站（retrogamesnexus.com）
 *    稍微改一下就行」。所以这一版是**介绍页**的量级：
 *    一段话讲清是什么 → 一段话讲目标 → 六条要点 → 机种清单；
 *    联系页只有「邮件支持 / 能帮什么 / 回复时间」三节。
 *    **别把实现细节写回来**（怎么存档、怎么联机、缓存多久），那些在 README 和代码注释里。
 *
 * ⚠️⚠️ **18 种语言全覆盖（2026-11-03 用户要求）**。原来这四份长文只写中 / 英 / 日 / 韩、
 *    其余 14 种落英文（照抄 `lib/legal.ts` 的策略）。用户看过之后要求「国际化的 18 种语言」，
 *    所以这里改成**按 `Locale` 一张表**（`ABOUT` / `CONTACT` / `DISCLAIMER_*`），
 *    `Record<Locale, …>` 会在编译期盯着 18 个键是否齐全 —— 加语言时少写一份就报错，
 *    不会再出现「路由有了、页面还是英文」。
 *    ⚠️ 也正因为要 18 份，**别再改成 `if (locale === 'xx')` 分支**：那种写法铺到 18 种
 *    就是十几个三百行的分支函数，谁都翻不动。文案必须是数据，不是代码。
 *
 * ⚠️ **法务两页（隐私政策 / 服务条款）仍然是四语言 + 英文兜底**，这次没动：那是合规文本，
 *    翻错一句的代价比看到英文大得多。别顺手把那边也铺成 18 份。
 *
 * ⚠️ **免责声明不在这个文件里**（2026-11-03 搬走）：它已经独立成 `lib/disclaimer.ts`，
 *    因为 `components/Disclaimer.tsx` 是客户端组件，而这里的关于 / 联系两篇长文
 *    一旦被客户端 import，整份十几语言的正文都会进 bundle。别把它挪回来。
 *
 * ⚠️ **机种清单不手抄**：走 `CONSOLE_TYPES` / `consoleLabel()` 现算。加一台机种时
 *    这一页自动跟着变（`lib/consoles.ts` 是纯数据模块，可以安全 import）。
 *    `consoleLabel()` 只给中 / 日 / 韩换了 FC / SFC，其余语言本来就是英文丝印词。
 */

import { SITE_NAME, type Locale } from './i18n';
import { SUPPORT_EMAIL } from './legal';
import { CONSOLE_TYPES, consoleLabel } from './consoles';

export type SiteDocKind = 'about' | 'contact';

export interface SiteDoc {
  /** 页面上那行 font-pixel 小标签。**全语言都是英文** —— Press Start 2P 没有中日韩字形。 */
  label: string;
  /** <h1> 与 <title>（<title> 会被根布局的模板补上站名后缀）。 */
  title: string;
  /** <meta name="description">。 */
  summary: string;
  /** h1 下面那句。 */
  intro: string;
  sections: { heading: string; body?: string[]; bullets?: string[] }[];
}

/**
 * 一页「关于我们」的文案。
 *
 * 拆成固定字段而不是「一个段落数组」：页面是照着这四个小节渲染的，
 * 字段名让漏句在编译期就暴露（`aboutBody` 是三元组，少一段直接报错）。
 *
 * 占位符只有两个：`{site}`（站名，走 `SITE_NAME`）和 `{list}`（机种清单，现算）。
 */
interface AboutCopy {
  title: string;
  summary: string;
  intro: string;
  aboutHeading: string;
  aboutBody: [string, string, string];
  aimHeading: string;
  aimBody: [string, string];
  featureHeading: string;
  features: string[];
  platformsHeading: string;
  platformsBody: string;
}

interface ContactCopy {
  title: string;
  summary: string;
  intro: string;
  emailHeading: string;
  emailIntro: string;
  /** 含 `{mail}` —— 渲染成 `mailto:` 链接（DocPage 的 `[文字](地址)` 标记）。 */
  emailLabel: string;
  helpHeading: string;
  helpItems: string[];
  timeHeading: string;
  timeBody: string;
}

/** 占位符替换。认不出的原样留下，比渲染成 undefined 好排查。 */
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? vars[name] : match
  );
}

/**
 * 机种清单字符串 —— 「NES · SNES · GB …」。
 *
 * 用 ` · ` 连接而不是逗号：中日英三种标点里它是唯一不需要考虑全角半角的，
 * 而且和站内其它「一排短标签」的写法一致。
 *
 * **不含街机**：ARC 是丝印词，摆在「以及街机 / plus arcade」那句话里读起来才通顺，
 * 混在列表尾巴上还得再解释一遍缩写。
 */
function consoleList(locale: Locale): string {
  return CONSOLE_TYPES.filter((type) => type !== 'arcade')
    .map((type) => consoleLabel(type, locale))
    .join(' · ');
}

const ABOUT: Record<Locale, AboutCopy> = {
  en: {
    title: 'About us',
    summary: '{site} is a place to play classic retro games free in the browser.',
    intro: 'Classic retro games, free in your browser.',
    aboutHeading: 'About this site',
    aboutBody: [
      '{site} is a collection of classic retro games, from the NES, SNES and Game Boy to PlayStation and the arcade.',
      'Every game runs directly in the browser, with no downloads, installations or extra software.',
      'Whether you are reliving childhood memories or meeting these games for the first time, start here.',
    ],
    aimHeading: 'Our aim',
    aimBody: [
      'Classic games are part of gaming history and should stay available to players of any age, anywhere.',
      '{site} aims to be a free, easy-to-use place to play them, with dependable emulation.',
    ],
    featureHeading: 'What sets it apart',
    features: [
      'Free, with no hidden costs, subscriptions or in-app purchases.',
      'Many consoles, from 8-bit machines to disc-based systems and arcade.',
      'No downloads: open a page and play.',
      '18 interface languages.',
      'Works on desktop, tablet and phone.',
      'A curated selection of the best-known titles for each console.',
    ],
    platformsHeading: 'Supported consoles',
    platformsBody: '{list}, plus arcade.',
  },

  zh: {
    title: '关于我们',
    summary: '{site}是一个在浏览器里免费畅玩经典复古游戏的站点。',
    intro: '在浏览器里免费畅玩经典复古游戏。',
    aboutHeading: '关于本站',
    aboutBody: [
      '{site}提供从 NES、SNES、Game Boy 到 PlayStation 与街机等经典机种的复古游戏合集。',
      '所有游戏都能在浏览器里直接运行，不需要下载、安装或额外软件。',
      '无论是重温童年，还是第一次接触这些作品，都可以从这里开始。',
    ],
    aimHeading: '我们的目标',
    aimBody: [
      '经典游戏是游戏史的一部分，应当被保存下来，让任何地区、任何年龄的玩家都能接触到。',
      '{site}希望提供一个免费、易用的平台，并保持稳定的模拟效果。',
    ],
    featureHeading: '本站的特色',
    features: [
      '完全免费，没有隐藏费用、订阅或内购。',
      '机种齐全，从 8 位机到光盘机种与街机。',
      '无需下载，打开网页即可游玩。',
      '多语言，界面提供 18 种语言。',
      '桌面、平板与手机都能玩。',
      '精选合集，收录各机种最值得玩的作品。',
    ],
    platformsHeading: '支持的机种',
    platformsBody: '{list}，以及街机。',
  },

  'zh-TW': {
    title: '關於我們',
    summary: '{site}是一個在瀏覽器裡免費暢玩經典復古遊戲的網站。',
    intro: '在瀏覽器裡免費暢玩經典復古遊戲。',
    aboutHeading: '關於本站',
    aboutBody: [
      '{site}提供從 NES、SNES、Game Boy 到 PlayStation 與街機等經典機種的復古遊戲合集。',
      '所有遊戲都能在瀏覽器裡直接執行，不需要下載、安裝或額外軟體。',
      '無論是重溫童年，還是第一次接觸這些作品，都可以從這裡開始。',
    ],
    aimHeading: '我們的目標',
    aimBody: [
      '經典遊戲是遊戲史的一部分，應當被保存下來，讓任何地區、任何年齡的玩家都能接觸到。',
      '{site}希望提供一個免費、易用的平台，並保持穩定的模擬效果。',
    ],
    featureHeading: '本站的特色',
    features: [
      '完全免費，沒有隱藏費用、訂閱或內購。',
      '機種齊全，從 8 位元機到光碟機種與街機。',
      '無需下載，打開網頁即可遊玩。',
      '多語言，介面提供 18 種語言。',
      '桌上型、平板與手機都能玩。',
      '精選合集，收錄各機種最值得玩的作品。',
    ],
    platformsHeading: '支援的機種',
    platformsBody: '{list}，以及街機。',
  },

  ja: {
    title: '私たちについて',
    summary: '{site}は、ブラウザで名作レトロゲームを無料で遊べるサイトです。',
    intro: 'ブラウザで名作レトロゲームを無料で。',
    aboutHeading: '当サイトについて',
    aboutBody: [
      '{site}は、NES・SNES・ゲームボーイから PlayStation、アーケードまで、名作レトロゲームを集めたサイトです。',
      'どのゲームもブラウザで直接動くため、ダウンロードやインストール、追加のソフトは要りません。',
      '子どもの頃の記憶をたどるのも、初めて触れるのも、ここから始められます。',
    ],
    aimHeading: '私たちの目標',
    aimBody: [
      'クラシックゲームはゲーム史の一部であり、地域や年齢を問わず遊べる形で残されるべきものです。',
      '{site}は、無料で使いやすく、安定して動く遊びの場を目指しています。',
    ],
    featureHeading: '当サイトの特徴',
    features: [
      '完全無料。隠れた費用も、サブスクリプションも、課金もありません。',
      '8 ビット機からディスク機種、アーケードまで幅広く対応します。',
      'ダウンロード不要。ページを開けばそのまま遊べます。',
      '表示言語は 18 言語です。',
      'パソコン、タブレット、スマートフォンで遊べます。',
      '各機種の代表作を選んで収録しています。',
    ],
    platformsHeading: '対応機種',
    platformsBody: '{list}、およびアーケード。',
  },

  ko: {
    title: '사이트 소개',
    summary: '{site}는 브라우저에서 명작 레트로 게임을 무료로 즐기는 사이트입니다.',
    intro: '브라우저에서 명작 레트로 게임을 무료로.',
    aboutHeading: '사이트 소개',
    aboutBody: [
      '{site}는 NES, SNES, 게임보이부터 PlayStation과 아케이드까지 명작 레트로 게임을 모은 곳입니다.',
      '모든 게임이 브라우저에서 바로 실행되므로 내려받기나 설치, 추가 프로그램이 필요 없습니다.',
      '어린 시절의 기억을 되살리든 처음 접하든, 여기서 시작할 수 있습니다.',
    ],
    aimHeading: '우리의 목표',
    aimBody: [
      '클래식 게임은 게임의 역사 일부이며, 지역과 나이를 막론하고 즐길 수 있는 형태로 남아야 합니다.',
      '{site}는 무료이고 쓰기 쉬우며 안정적으로 동작하는 놀이터를 만들고자 합니다.',
    ],
    featureHeading: '사이트의 특징',
    features: [
      '완전 무료. 숨은 비용도, 구독도, 결제도 없습니다.',
      '8비트 기기부터 디스크 기종과 아케이드까지 폭넓게 지원합니다.',
      '내려받기 없이 페이지만 열면 바로 즐길 수 있습니다.',
      '표시 언어는 18개입니다.',
      '컴퓨터, 태블릿, 스마트폰에서 모두 즐길 수 있습니다.',
      '기종별 대표작을 골라 담았습니다.',
    ],
    platformsHeading: '지원 기종',
    platformsBody: '{list}, 그리고 아케이드.',
  },

  es: {
    title: 'Sobre nosotros',
    summary: '{site} es un sitio para jugar gratis a clásicos retro en el navegador.',
    intro: 'Clásicos retro gratis en tu navegador.',
    aboutHeading: 'Sobre este sitio',
    aboutBody: [
      '{site} reúne clásicos retro, desde NES, SNES y Game Boy hasta PlayStation y los arcades.',
      'Todos los juegos se ejecutan directamente en el navegador, sin descargas, instalaciones ni software adicional.',
      'Tanto si revives recuerdos de la infancia como si los descubres por primera vez, empieza aquí.',
    ],
    aimHeading: 'Nuestro objetivo',
    aimBody: [
      'Los juegos clásicos forman parte de la historia del medio y deben seguir al alcance de jugadores de cualquier edad y lugar.',
      '{site} quiere ser un lugar gratuito y sencillo para jugarlos, con una emulación fiable.',
    ],
    featureHeading: 'Qué nos distingue',
    features: [
      'Gratis, sin costes ocultos, suscripciones ni compras dentro de la aplicación.',
      'Muchas consolas, desde las de 8 bits hasta las de disco y los arcades.',
      'Sin descargas: abre la página y juega.',
      '18 idiomas de interfaz.',
      'Funciona en ordenador, tableta y móvil.',
      'Una selección de los títulos más conocidos de cada consola.',
    ],
    platformsHeading: 'Consolas compatibles',
    platformsBody: '{list} y arcades.',
  },

  hi: {
    title: 'हमारे बारे में',
    summary: '{site} एक साइट है जहाँ ब्राउज़र में क्लासिक रेट्रो गेम मुफ़्त खेले जा सकते हैं।',
    intro: 'ब्राउज़र में क्लासिक रेट्रो गेम, मुफ़्त।',
    aboutHeading: 'इस साइट के बारे में',
    aboutBody: [
      '{site} में NES, SNES और Game Boy से लेकर PlayStation और आर्केड तक क्लासिक रेट्रो गेम का संग्रह है।',
      'सभी गेम सीधे ब्राउज़र में चलते हैं, किसी डाउनलोड, इंस्टॉल या अतिरिक्त सॉफ़्टवेयर की ज़रूरत नहीं।',
      'चाहे आप बचपन की यादें ताज़ा कर रहे हों या इन गेम्स से पहली बार मिल रहे हों, यहीं से शुरू करें।',
    ],
    aimHeading: 'हमारा उद्देश्य',
    aimBody: [
      'क्लासिक गेम उद्योग के इतिहास का हिस्सा हैं और हर उम्र के खिलाड़ियों के लिए, हर जगह उपलब्ध रहने चाहिए।',
      '{site} इन्हें खेलने के लिए एक मुफ़्त और आसान जगह बनना चाहता है, भरोसेमंद एमुलेशन के साथ।',
    ],
    featureHeading: 'हमारी खासियत',
    features: [
      'मुफ़्त, कोई छिपा शुल्क, सदस्यता या इन-ऐप खरीदारी नहीं।',
      'कई कंसोल, 8-बिट मशीनों से लेकर डिस्क सिस्टम और आर्केड तक।',
      'कोई डाउनलोड नहीं: पेज खोलें और खेलें।',
      '18 इंटरफ़ेस भाषाएँ।',
      'कंप्यूटर, टैबलेट और फ़ोन पर चलता है।',
      'हर कंसोल के सबसे प्रसिद्ध शीर्षकों का चयन।',
    ],
    platformsHeading: 'समर्थित कंसोल',
    platformsBody: '{list} और आर्केड।',
  },

  pt: {
    title: 'Sobre nós',
    summary: '{site} é um site para jogar clássicos retrô de graça no navegador.',
    intro: 'Clássicos retrô grátis no seu navegador.',
    aboutHeading: 'Sobre este site',
    aboutBody: [
      '{site} reúne clássicos retrô, do NES, SNES e Game Boy ao PlayStation e aos fliperamas.',
      'Todos os jogos rodam direto no navegador, sem downloads, instalações ou software extra.',
      'Quer você esteja revivendo memórias de infância ou conhecendo esses jogos agora, comece por aqui.',
    ],
    aimHeading: 'Nosso objetivo',
    aimBody: [
      'Jogos clássicos fazem parte da história do meio e devem continuar acessíveis a jogadores de qualquer idade e lugar.',
      '{site} quer ser um lugar gratuito e fácil para jogá-los, com emulação confiável.',
    ],
    featureHeading: 'O que nos diferencia',
    features: [
      'Grátis, sem custos ocultos, assinaturas ou compras dentro do aplicativo.',
      'Muitos consoles, das máquinas de 8 bits aos sistemas em disco e fliperamas.',
      'Sem downloads: abra a página e jogue.',
      '18 idiomas de interface.',
      'Funciona em computador, tablet e celular.',
      'Uma seleção dos títulos mais conhecidos de cada console.',
    ],
    platformsHeading: 'Consoles compatíveis',
    platformsBody: '{list} e fliperamas.',
  },

  fr: {
    title: 'À propos',
    summary: '{site} est un site pour jouer gratuitement aux classiques du rétro dans le navigateur.',
    intro: 'Les classiques du rétro, gratuits dans votre navigateur.',
    aboutHeading: 'À propos du site',
    aboutBody: [
      '{site} réunit des classiques du rétro, de la NES, la SNES et la Game Boy à la PlayStation et aux bornes d’arcade.',
      'Tous les jeux s’exécutent directement dans le navigateur, sans téléchargement, installation ni logiciel supplémentaire.',
      'Que vous replongiez dans vos souvenirs d’enfance ou que vous les découvriez pour la première fois, commencez ici.',
    ],
    aimHeading: 'Notre objectif',
    aimBody: [
      'Les jeux classiques font partie de l’histoire du jeu vidéo et doivent rester accessibles aux joueurs de tout âge et de tout pays.',
      '{site} veut être un endroit gratuit et simple pour y jouer, avec une émulation fiable.',
    ],
    featureHeading: 'Ce qui nous distingue',
    features: [
      'Gratuit, sans frais cachés, abonnement ni achat intégré.',
      'De nombreuses consoles, des machines 8 bits aux supports optiques et aux bornes d’arcade.',
      'Aucun téléchargement : ouvrez la page et jouez.',
      '18 langues d’interface.',
      'Fonctionne sur ordinateur, tablette et téléphone.',
      'Une sélection des titres les plus connus de chaque console.',
    ],
    platformsHeading: 'Consoles prises en charge',
    platformsBody: '{list}, ainsi que les bornes d’arcade.',
  },

  de: {
    title: 'Über uns',
    summary: '{site} ist eine Seite, um Retro-Klassiker kostenlos im Browser zu spielen.',
    intro: 'Retro-Klassiker kostenlos im Browser.',
    aboutHeading: 'Über diese Seite',
    aboutBody: [
      '{site} versammelt Retro-Klassiker, vom NES, SNES und Game Boy bis zur PlayStation und zum Automaten.',
      'Alle Spiele laufen direkt im Browser, ohne Download, Installation oder zusätzliche Software.',
      'Ob Sie Kindheitserinnerungen auffrischen oder diese Spiele zum ersten Mal entdecken: Hier können Sie anfangen.',
    ],
    aimHeading: 'Unser Ziel',
    aimBody: [
      'Klassische Spiele gehören zur Geschichte des Mediums und sollten Spielern jeden Alters und überall zugänglich bleiben.',
      '{site} möchte ein kostenloser, einfacher Ort dafür sein, mit verlässlicher Emulation.',
    ],
    featureHeading: 'Was uns ausmacht',
    features: [
      'Kostenlos, ohne versteckte Kosten, Abos oder In-App-Käufe.',
      'Viele Konsolen, von 8-Bit-Geräten über Disc-Systeme bis zu Automaten.',
      'Kein Download: Seite öffnen und spielen.',
      '18 Oberflächensprachen.',
      'Läuft auf Computer, Tablet und Smartphone.',
      'Eine Auswahl der bekanntesten Titel jeder Konsole.',
    ],
    platformsHeading: 'Unterstützte Konsolen',
    platformsBody: '{list} sowie Automaten.',
  },

  it: {
    title: 'Chi siamo',
    summary: '{site} è un sito per giocare gratis ai classici retrò nel browser.',
    intro: 'Classici retrò gratis nel tuo browser.',
    aboutHeading: 'Informazioni sul sito',
    aboutBody: [
      '{site} raccoglie classici retrò, dal NES, SNES e Game Boy fino a PlayStation e ai cabinati.',
      'Tutti i giochi girano direttamente nel browser, senza download, installazioni o software aggiuntivo.',
      'Che stiate rivivendo ricordi d’infanzia o scoprendo questi giochi per la prima volta, partite da qui.',
    ],
    aimHeading: 'Il nostro obiettivo',
    aimBody: [
      'I giochi classici fanno parte della storia del medium e devono restare accessibili a giocatori di ogni età e luogo.',
      '{site} vuole essere un posto gratuito e semplice per giocarli, con un’emulazione affidabile.',
    ],
    featureHeading: 'Cosa ci distingue',
    features: [
      'Gratis, senza costi nascosti, abbonamenti o acquisti in-app.',
      'Molte console, dalle macchine a 8 bit ai supporti ottici e ai cabinati.',
      'Nessun download: apri la pagina e gioca.',
      '18 lingue dell’interfaccia.',
      'Funziona su computer, tablet e telefono.',
      'Una selezione dei titoli più noti di ogni console.',
    ],
    platformsHeading: 'Console supportate',
    platformsBody: '{list} e cabinati.',
  },

  ru: {
    title: 'О нас',
    summary: '{site} — сайт, где можно бесплатно играть в классику ретро в браузере.',
    intro: 'Классика ретро бесплатно в браузере.',
    aboutHeading: 'Об этом сайте',
    aboutBody: [
      '{site} собирает классические ретро-игры — от NES, SNES и Game Boy до PlayStation и аркад.',
      'Все игры запускаются прямо в браузере, без загрузок, установки и дополнительных программ.',
      'Вспоминаете детство или впервые знакомитесь с этими играми — начинайте здесь.',
    ],
    aimHeading: 'Наша цель',
    aimBody: [
      'Классические игры — часть истории индустрии, и они должны оставаться доступными игрокам любого возраста и из любой страны.',
      '{site} стремится быть бесплатным и простым местом для игры в них, с надёжной эмуляцией.',
    ],
    featureHeading: 'Что нас отличает',
    features: [
      'Бесплатно: без скрытых платежей, подписок и покупок в приложении.',
      'Много платформ: от 8-битных машин до дисковых систем и аркад.',
      'Без загрузок: открыли страницу и играете.',
      '18 языков интерфейса.',
      'Работает на компьютере, планшете и телефоне.',
      'Отобранные самые известные игры каждой платформы.',
    ],
    platformsHeading: 'Поддерживаемые платформы',
    platformsBody: '{list}, а также аркады.',
  },

  fil: {
    title: 'Tungkol sa amin',
    summary: 'Ang {site} ay site para sa libreng paglalaro ng klasikong retro sa browser.',
    intro: 'Klasikong retro, libre sa iyong browser.',
    aboutHeading: 'Tungkol sa site na ito',
    aboutBody: [
      'Ang {site} ay koleksyon ng klasikong retro, mula NES, SNES at Game Boy hanggang PlayStation at arcade.',
      'Lahat ng laro ay tumatakbo nang direkta sa browser, walang download, install o karagdagang software.',
      'Kung inaalala mo ang iyong pagkabata o unang beses mong makita ang mga larong ito, magsimula rito.',
    ],
    aimHeading: 'Ang aming layunin',
    aimBody: [
      'Bahagi ng kasaysayan ng industriya ang mga klasikong laro at dapat manatiling abot-kamay ng manlalaro saan man at anumang edad.',
      'Layunin ng {site} na maging libre at madaling gamiting lugar upang malaro ang mga ito, na may matatag na emulation.',
    ],
    featureHeading: 'Ano ang kaiba namin',
    features: [
      'Libre, walang nakatagong bayad, subscription o in-app purchase.',
      'Maraming console, mula 8-bit na makina hanggang disc system at arcade.',
      'Walang download: buksan ang pahina at maglaro.',
      '18 wika ng interface.',
      'Gumagana sa computer, tablet at telepono.',
      'Piling mga pinakasikat na titulo ng bawat console.',
    ],
    platformsHeading: 'Mga sinusuportahang console',
    platformsBody: '{list} at arcade.',
  },

  nl: {
    title: 'Over ons',
    summary: '{site} is een site om gratis retroklassiekers in de browser te spelen.',
    intro: 'Retroklassiekers gratis in je browser.',
    aboutHeading: 'Over deze site',
    aboutBody: [
      '{site} verzamelt retroklassiekers, van NES, SNES en Game Boy tot PlayStation en arcade.',
      'Alle spellen draaien direct in de browser, zonder downloads, installatie of extra software.',
      'Of je nu jeugdherinneringen ophaalt of deze spellen voor het eerst ziet: begin hier.',
    ],
    aimHeading: 'Ons doel',
    aimBody: [
      'Klassieke spellen horen bij de geschiedenis van het medium en moeten bereikbaar blijven voor spelers van elke leeftijd en overal.',
      '{site} wil een gratis en eenvoudige plek zijn om ze te spelen, met betrouwbare emulatie.',
    ],
    featureHeading: 'Wat ons bijzonder maakt',
    features: [
      'Gratis, zonder verborgen kosten, abonnementen of aankopen in de app.',
      'Veel consoles, van 8-bitmachines tot discsytemen en arcade.',
      'Geen downloads: pagina openen en spelen.',
      '18 interfacetalen.',
      'Werkt op computer, tablet en telefoon.',
      'Een selectie van de bekendste titels per console.',
    ],
    platformsHeading: 'Ondersteunde consoles',
    platformsBody: '{list} en arcade.',
  },

  vi: {
    title: 'Về chúng tôi',
    summary: '{site} là nơi chơi miễn phí các game retro kinh điển ngay trên trình duyệt.',
    intro: 'Game retro kinh điển, miễn phí trên trình duyệt.',
    aboutHeading: 'Về trang này',
    aboutBody: [
      '{site} tập hợp các game retro kinh điển, từ NES, SNES, Game Boy đến PlayStation và game thùng.',
      'Mọi game chạy trực tiếp trên trình duyệt, không cần tải về, cài đặt hay phần mềm thêm.',
      'Dù bạn đang sống lại ký ức tuổi thơ hay lần đầu gặp những tựa game này, hãy bắt đầu từ đây.',
    ],
    aimHeading: 'Mục tiêu của chúng tôi',
    aimBody: [
      'Game kinh điển là một phần lịch sử của ngành, và cần tiếp tục đến được với người chơi ở mọi lứa tuổi, mọi nơi.',
      '{site} mong là một nơi miễn phí, dễ dùng để chơi những game đó, với khả năng giả lập ổn định.',
    ],
    featureHeading: 'Điểm khác biệt',
    features: [
      'Miễn phí, không chi phí ẩn, không đăng ký trả phí, không mua trong ứng dụng.',
      'Nhiều hệ máy, từ máy 8-bit đến hệ đĩa và game thùng.',
      'Không cần tải: mở trang là chơi.',
      '18 ngôn ngữ giao diện.',
      'Chơi được trên máy tính, máy tính bảng và điện thoại.',
      'Tuyển chọn những tựa nổi tiếng nhất của từng hệ máy.',
    ],
    platformsHeading: 'Hệ máy hỗ trợ',
    platformsBody: '{list} và game thùng.',
  },

  th: {
    title: 'เกี่ยวกับเรา',
    summary: '{site} เป็นเว็บไซต์สำหรับเล่นเกมย้อนยุคสุดคลาสสิกฟรีในเบราว์เซอร์',
    intro: 'เกมย้อนยุคสุดคลาสสิก ฟรีในเบราว์เซอร์',
    aboutHeading: 'เกี่ยวกับเว็บไซต์นี้',
    aboutBody: [
      '{site} รวมเกมย้อนยุคสุดคลาสสิก ตั้งแต่ NES, SNES, Game Boy ไปจนถึง PlayStation และเกมอาร์เคด',
      'ทุกเกมทำงานบนเบราว์เซอร์โดยตรง ไม่ต้องดาวน์โหลด ติดตั้ง หรือใช้ซอฟต์แวร์เพิ่ม',
      'ไม่ว่าคุณจะย้อนความทรงจำในวัยเด็กหรือเพิ่งรู้จักเกมเหล่านี้เป็นครั้งแรก เริ่มได้ที่นี่',
    ],
    aimHeading: 'เป้าหมายของเรา',
    aimBody: [
      'เกมคลาสสิกเป็นส่วนหนึ่งของประวัติศาสตร์วงการเกม และควรเข้าถึงได้สำหรับผู้เล่นทุกวัยทุกที่',
      '{site} อยากเป็นที่เล่นฟรี ใช้งานง่าย พร้อมการจำลองที่เสถียร',
    ],
    featureHeading: 'จุดที่แตกต่าง',
    features: [
      'ฟรี ไม่มีค่าใช้จ่ายแอบแฝง ไม่มีระบบสมาชิกรายเดือน และไม่มีการซื้อในแอป',
      'รองรับหลายเครื่อง ตั้งแต่เครื่อง 8 บิต ไปจนถึงเครื่องแผ่นดิสก์และอาร์เคด',
      'ไม่ต้องดาวน์โหลด เปิดหน้าเว็บแล้วเล่นได้เลย',
      'อินเทอร์เฟซ 18 ภาษา',
      'เล่นได้บนคอมพิวเตอร์ แท็บเล็ต และมือถือ',
      'คัดสรรเกมที่โด่งดังที่สุดของแต่ละเครื่อง',
    ],
    platformsHeading: 'เครื่องที่รองรับ',
    platformsBody: '{list} และอาร์เคด',
  },

  ms: {
    title: 'Tentang kami',
    summary: '{site} ialah laman untuk bermain klasik retro secara percuma dalam pelayar.',
    intro: 'Klasik retro percuma dalam pelayar anda.',
    aboutHeading: 'Tentang laman ini',
    aboutBody: [
      '{site} mengumpulkan klasik retro, daripada NES, SNES dan Game Boy hingga PlayStation dan arked.',
      'Semua permainan berjalan terus dalam pelayar, tanpa muat turun, pemasangan atau perisian tambahan.',
      'Sama ada anda mengimbau kenangan zaman kanak-kanak atau baru mengenali permainan ini, mulakan di sini.',
    ],
    aimHeading: 'Matlamat kami',
    aimBody: [
      'Permainan klasik ialah sebahagian sejarah industri dan harus kekal boleh dicapai oleh pemain semua peringkat umur, di mana-mana.',
      '{site} mahu menjadi tempat percuma dan mudah untuk memainkannya, dengan emulasi yang stabil.',
    ],
    featureHeading: 'Apa yang membezakan kami',
    features: [
      'Percuma, tanpa kos tersembunyi, langganan atau pembelian dalam aplikasi.',
      'Banyak konsol, daripada mesin 8-bit hingga sistem cakera dan arked.',
      'Tiada muat turun: buka halaman dan main.',
      '18 bahasa antara muka.',
      'Berfungsi pada komputer, tablet dan telefon.',
      'Pilihan tajuk paling terkenal bagi setiap konsol.',
    ],
    platformsHeading: 'Konsol yang disokong',
    platformsBody: '{list} serta arked.',
  },

  id: {
    title: 'Tentang kami',
    summary: '{site} adalah situs untuk memainkan game retro klasik gratis di browser.',
    intro: 'Game retro klasik gratis di browser Anda.',
    aboutHeading: 'Tentang situs ini',
    aboutBody: [
      '{site} mengumpulkan game retro klasik, dari NES, SNES, dan Game Boy hingga PlayStation dan arkade.',
      'Semua game berjalan langsung di browser, tanpa unduhan, pemasangan, atau perangkat lunak tambahan.',
      'Entah Anda mengenang masa kecil atau baru mengenal game ini, mulailah dari sini.',
    ],
    aimHeading: 'Tujuan kami',
    aimBody: [
      'Game klasik adalah bagian dari sejarah industri dan harus tetap bisa diakses pemain segala usia, di mana pun.',
      '{site} ingin menjadi tempat gratis dan mudah untuk memainkannya, dengan emulasi yang stabil.',
    ],
    featureHeading: 'Yang membedakan kami',
    features: [
      'Gratis, tanpa biaya tersembunyi, langganan, atau pembelian dalam aplikasi.',
      'Banyak konsol, dari mesin 8-bit hingga sistem cakram dan arkade.',
      'Tanpa unduhan: buka halaman dan main.',
      '18 bahasa antarmuka.',
      'Berjalan di komputer, tablet, dan ponsel.',
      'Pilihan judul paling terkenal untuk setiap konsol.',
    ],
    platformsHeading: 'Konsol yang didukung',
    platformsBody: '{list} serta arkade.',
  },
};

const CONTACT: Record<Locale, ContactCopy> = {
  en: {
    title: 'Contact us',
    summary: 'How to reach {site}, and what you can ask about.',
    intro: 'Technical support, feedback on content and copyright matters are all handled by email.',
    emailHeading: 'Email support',
    emailIntro:
      'For any enquiry, technical support, copyright matter or general question, please email us. We are always happy to help!',
    emailLabel: 'Email: {mail}',
    helpHeading: 'How we can help',
    helpItems: [
      'Technical problems with a game or the site.',
      'Copyright questions and takedown requests.',
      'General questions about the site and its services.',
      'Feature suggestions and improvements.',
    ],
    timeHeading: 'Response time',
    timeBody: 'Replies usually arrive within one to three working days. Mark urgent matters in the subject line.',
  },

  zh: {
    title: '联系我们',
    summary: '联系{site}：邮箱与可以咨询的问题。',
    intro: '技术支持、内容反馈与版权事宜，都欢迎来信。',
    emailHeading: '邮件支持',
    emailIntro:
      '如有任何咨询、技术支持、版权事宜或一般问题，请通过邮件联系我们。我们随时为您提供帮助！',
    emailLabel: '邮箱：{mail}',
    helpHeading: '可以帮到你',
    helpItems: [
      '游戏或网站功能出现技术问题。',
      '版权咨询与下架请求。',
      '关于本站与服务的普通问题。',
      '功能建议与改进意见。',
    ],
    timeHeading: '回复时间',
    timeBody: '通常在 1 至 3 个工作日内回复。如需加急，请在邮件主题中标明。',
  },

  'zh-TW': {
    title: '聯絡我們',
    summary: '聯絡{site}：電子郵件與可以詢問的問題。',
    intro: '技術支援、內容回報與版權事宜，都歡迎來信。',
    emailHeading: '電子郵件支援',
    emailIntro:
      '如有任何詢問、技術支援、版權事宜或一般問題，請透過電子郵件與我們聯絡。我們隨時樂意協助！',
    emailLabel: '電子郵件：{mail}',
    helpHeading: '可以幫上忙的地方',
    helpItems: [
      '遊戲或網站功能出現技術問題。',
      '版權詢問與下架請求。',
      '關於本站與服務的一般問題。',
      '功能建議與改進意見。',
    ],
    timeHeading: '回覆時間',
    timeBody: '通常在 1 至 3 個工作天內回覆。如需加急，請在郵件主旨中註明。',
  },

  ja: {
    title: 'お問い合わせ',
    summary: '{site}への連絡先と、相談できる内容。',
    intro: '技術的な問題、掲載内容のご指摘、権利に関するご連絡はメールでお願いします。',
    emailHeading: 'メールでのサポート',
    emailIntro:
      'ご相談、技術的なサポート、著作権に関する件、その他のご質問は、メールでご連絡ください。いつでもお手伝いします。',
    emailLabel: 'メール：{mail}',
    helpHeading: '対応できる内容',
    helpItems: [
      'ゲームやサイトの動作に関する技術的な問題。',
      '著作権に関するご質問と削除のご依頼。',
      '当サイトとサービスについての一般的なご質問。',
      '機能のご提案や改善のご意見。',
    ],
    timeHeading: '返信について',
    timeBody: '通常 1〜3 営業日以内に返信します。お急ぎの場合は件名にその旨をご記入ください。',
  },

  ko: {
    title: '문의하기',
    summary: '{site}에 연락하는 방법과 상담할 수 있는 내용.',
    intro: '기술적인 문제, 내용 정정, 권리 관련 문의는 메일로 보내 주세요.',
    emailHeading: '메일 지원',
    emailIntro:
      '문의, 기술 지원, 저작권 관련 사항, 일반적인 질문은 모두 메일로 보내 주세요. 언제든 도와드리겠습니다.',
    emailLabel: '메일: {mail}',
    helpHeading: '도움을 드릴 수 있는 일',
    helpItems: [
      '게임이나 사이트 동작에 관한 기술적인 문제.',
      '저작권 문의와 삭제 요청.',
      '사이트와 서비스에 관한 일반적인 질문.',
      '기능 제안과 개선 의견.',
    ],
    timeHeading: '답변 시간',
    timeBody: '보통 영업일 기준 1~3일 안에 답변합니다. 급한 일은 메일 제목에 적어 주세요.',
  },

  es: {
    title: 'Contacto',
    summary: 'Cómo contactar con {site} y qué puedes consultar.',
    intro: 'El soporte técnico, los comentarios sobre el contenido y los asuntos de derechos se atienden por correo.',
    emailHeading: 'Soporte por correo',
    emailIntro:
      'Si tienes cualquier consulta, necesitas soporte técnico o quieres tratar un asunto de derechos o una pregunta general, escríbenos por correo. ¡Estaremos encantados de ayudarte!',
    emailLabel: 'Correo: {mail}',
    helpHeading: 'En qué podemos ayudarte',
    helpItems: [
      'Problemas técnicos con un juego o con el sitio.',
      'Consultas sobre derechos de autor y solicitudes de retirada.',
      'Preguntas generales sobre el sitio y sus servicios.',
      'Sugerencias de funciones y mejoras.',
    ],
    timeHeading: 'Tiempo de respuesta',
    timeBody: 'Solemos responder en uno a tres días laborables. Indica los asuntos urgentes en el asunto del mensaje.',
  },

  hi: {
    title: 'संपर्क करें',
    summary: '{site} से संपर्क कैसे करें और क्या पूछ सकते हैं।',
    intro: 'तकनीकी सहायता, सामग्री पर सुझाव और कॉपीराइट से जुड़े मामले ईमेल से देखे जाते हैं।',
    emailHeading: 'ईमेल सहायता',
    emailIntro:
      'किसी भी पूछताछ, तकनीकी सहायता, कॉपीराइट मामले या सामान्य प्रश्न के लिए हमें ईमेल करें। हम मदद के लिए हमेशा तैयार हैं!',
    emailLabel: 'ईमेल: {mail}',
    helpHeading: 'हम कैसे मदद कर सकते हैं',
    helpItems: [
      'किसी गेम या साइट में तकनीकी समस्या।',
      'कॉपीराइट संबंधी प्रश्न और हटाने के अनुरोध।',
      'साइट और उसकी सेवाओं के बारे में सामान्य प्रश्न।',
      'फ़ीचर सुझाव और सुधार।',
    ],
    timeHeading: 'जवाब का समय',
    timeBody: 'सामान्यतः एक से तीन कार्यदिवसों में उत्तर देते हैं। अत्यावश्यक बात विषय में लिखें।',
  },

  pt: {
    title: 'Fale conosco',
    summary: 'Como falar com {site} e o que você pode perguntar.',
    intro: 'Suporte técnico, comentários sobre o conteúdo e questões de direitos são tratados por e-mail.',
    emailHeading: 'Suporte por e-mail',
    emailIntro:
      'Para qualquer dúvida, suporte técnico, questão de direitos ou pergunta geral, escreva para nós por e-mail. Teremos prazer em ajudar!',
    emailLabel: 'E-mail: {mail}',
    helpHeading: 'Como podemos ajudar',
    helpItems: [
      'Problemas técnicos com um jogo ou com o site.',
      'Dúvidas sobre direitos autorais e pedidos de remoção.',
      'Perguntas gerais sobre o site e seus serviços.',
      'Sugestões de recursos e melhorias.',
    ],
    timeHeading: 'Prazo de resposta',
    timeBody: 'Costumamos responder em um a três dias úteis. Marque assuntos urgentes no título.',
  },

  fr: {
    title: 'Contact',
    summary: 'Comment joindre {site} et ce que vous pouvez nous demander.',
    intro: 'Le support technique, les remarques sur le contenu et les questions de droits passent par courriel.',
    emailHeading: 'Support par courriel',
    emailIntro:
      'Pour toute question, demande d’assistance technique, question de droits ou question générale, écrivez-nous par courriel. Nous sommes toujours heureux de vous aider !',
    emailLabel: 'Courriel : {mail}',
    helpHeading: 'Comment nous pouvons vous aider',
    helpItems: [
      'Problèmes techniques avec un jeu ou le site.',
      'Questions de droits d’auteur et demandes de retrait.',
      'Questions générales sur le site et ses services.',
      'Suggestions de fonctionnalités et d’améliorations.',
    ],
    timeHeading: 'Délai de réponse',
    timeBody: 'Nous répondons généralement sous un à trois jours ouvrés. Signalez les urgences dans l’objet du message.',
  },

  de: {
    title: 'Kontakt',
    summary: 'So erreichen Sie {site} und was Sie fragen können.',
    intro: 'Technischer Support, Hinweise zum Inhalt und Urheberrechtsfragen laufen über E-Mail.',
    emailHeading: 'Support per E-Mail',
    emailIntro:
      'Bei Fragen, technischem Support, Urheberrechtsangelegenheiten oder allgemeinen Anliegen schreiben Sie uns bitte eine E-Mail. Wir helfen gerne!',
    emailLabel: 'E-Mail: {mail}',
    helpHeading: 'Wobei wir helfen können',
    helpItems: [
      'Technische Probleme mit einem Spiel oder der Seite.',
      'Urheberrechtsfragen und Löschanfragen.',
      'Allgemeine Fragen zur Seite und ihren Diensten.',
      'Vorschläge für Funktionen und Verbesserungen.',
    ],
    timeHeading: 'Antwortzeit',
    timeBody: 'Wir antworten in der Regel innerhalb von ein bis drei Werktagen. Dringendes bitte im Betreff kennzeichnen.',
  },

  it: {
    title: 'Contatti',
    summary: 'Come contattare {site} e cosa puoi chiedere.',
    intro: 'Supporto tecnico, segnalazioni sui contenuti e questioni di diritti si gestiscono via email.',
    emailHeading: 'Supporto via email',
    emailIntro:
      'Per qualsiasi richiesta, supporto tecnico, questione di diritti o domanda generale, scrivici via email. Siamo sempre felici di aiutarti!',
    emailLabel: 'Email: {mail}',
    helpHeading: 'Come possiamo aiutarti',
    helpItems: [
      'Problemi tecnici con un gioco o con il sito.',
      'Domande sul diritto d’autore e richieste di rimozione.',
      'Domande generali sul sito e sui suoi servizi.',
      'Suggerimenti su funzioni e miglioramenti.',
    ],
    timeHeading: 'Tempi di risposta',
    timeBody: 'Di solito rispondiamo entro uno o tre giorni lavorativi. Segnala le urgenze nell’oggetto.',
  },

  ru: {
    title: 'Связаться',
    summary: 'Как связаться с {site} и о чём можно спросить.',
    intro: 'Техподдержка, замечания к содержимому и вопросы по правам — по электронной почте.',
    emailHeading: 'Поддержка по почте',
    emailIntro:
      'По любым вопросам, за технической поддержкой, по вопросам прав или с общим вопросом пишите нам по электронной почте. Мы всегда рады помочь!',
    emailLabel: 'Почта: {mail}',
    helpHeading: 'Чем мы можем помочь',
    helpItems: [
      'Технические проблемы с игрой или сайтом.',
      'Вопросы авторского права и запросы на удаление.',
      'Общие вопросы о сайте и его сервисах.',
      'Предложения по функциям и улучшениям.',
    ],
    timeHeading: 'Время ответа',
    timeBody: 'Обычно отвечаем в течение одного-трёх рабочих дней. Срочное помечайте в теме письма.',
  },

  fil: {
    title: 'Makipag-ugnayan',
    summary: 'Paano maabot ang {site} at ano ang maaaring itanong.',
    intro: 'Ang teknikal na suporta, puna sa nilalaman at usapin sa karapatang-ari ay sa email.',
    emailHeading: 'Suporta sa email',
    emailIntro:
      'Para sa anumang katanungan, teknikal na suporta, usapin sa karapatang-ari o pangkalahatang tanong, mag-email lang sa amin. Handa kaming tumulong!',
    emailLabel: 'Email: {mail}',
    helpHeading: 'Paano kami makakatulong',
    helpItems: [
      'Teknikal na problema sa isang laro o sa site.',
      'Tanong sa karapatang-ari at kahilingang alisin ang nilalaman.',
      'Pangkalahatang tanong tungkol sa site at mga serbisyo.',
      'Suhestiyon sa feature at pagpapabuti.',
    ],
    timeHeading: 'Oras ng pagtugon',
    timeBody: 'Karaniwang sumasagot kami sa loob ng isa hanggang tatlong araw ng trabaho. Markahan ang apurahan sa subject.',
  },

  nl: {
    title: 'Contact',
    summary: 'Hoe je {site} bereikt en wat je kunt vragen.',
    intro: 'Technische support, opmerkingen over de inhoud en auteursrechten lopen via e-mail.',
    emailHeading: 'E-mailsupport',
    emailIntro:
      'Voor vragen, technische support, auteursrechten of een algemene vraag kun je ons mailen. We helpen je graag!',
    emailLabel: 'E-mail: {mail}',
    helpHeading: 'Waarmee we kunnen helpen',
    helpItems: [
      'Technische problemen met een spel of de site.',
      'Vragen over auteursrecht en verzoeken tot verwijdering.',
      'Algemene vragen over de site en de diensten.',
      'Suggesties voor functies en verbeteringen.',
    ],
    timeHeading: 'Reactietijd',
    timeBody: 'Meestal antwoorden we binnen één tot drie werkdagen. Zet spoed in het onderwerp.',
  },

  vi: {
    title: 'Liên hệ',
    summary: 'Cách liên hệ {site} và những gì bạn có thể hỏi.',
    intro: 'Hỗ trợ kỹ thuật, góp ý nội dung và các vấn đề bản quyền đều xử lý qua email.',
    emailHeading: 'Hỗ trợ qua email',
    emailIntro:
      'Mọi thắc mắc, yêu cầu hỗ trợ kỹ thuật, vấn đề bản quyền hay câu hỏi chung, vui lòng gửi email cho chúng tôi. Chúng tôi luôn sẵn lòng hỗ trợ!',
    emailLabel: 'Email: {mail}',
    helpHeading: 'Chúng tôi có thể giúp gì',
    helpItems: [
      'Sự cố kỹ thuật với một game hoặc với trang.',
      'Câu hỏi về bản quyền và yêu cầu gỡ bỏ.',
      'Câu hỏi chung về trang và dịch vụ.',
      'Góp ý tính năng và cải tiến.',
    ],
    timeHeading: 'Thời gian phản hồi',
    timeBody: 'Thường trả lời trong một đến ba ngày làm việc. Việc gấp xin ghi rõ ở tiêu đề.',
  },

  th: {
    title: 'ติดต่อเรา',
    summary: 'วิธีติดต่อ {site} และสิ่งที่คุณสอบถามได้',
    intro: 'การสนับสนุนทางเทคนิค ความคิดเห็นเกี่ยวกับเนื้อหา และเรื่องลิขสิทธิ์ ดำเนินการทางอีเมล',
    emailHeading: 'สนับสนุนทางอีเมล',
    emailIntro:
      'หากมีข้อสอบถาม การสนับสนุนทางเทคนิค เรื่องลิขสิทธิ์ หรือคำถามทั่วไป โปรดอีเมลมาหาเรา เรายินดีช่วยเสมอ!',
    emailLabel: 'อีเมล: {mail}',
    helpHeading: 'เราช่วยอะไรได้บ้าง',
    helpItems: [
      'ปัญหาทางเทคนิคกับเกมหรือเว็บไซต์',
      'คำถามเรื่องลิขสิทธิ์และคำขอให้ลบเนื้อหา',
      'คำถามทั่วไปเกี่ยวกับเว็บไซต์และบริการ',
      'ข้อเสนอแนะฟีเจอร์และการปรับปรุง',
    ],
    timeHeading: 'เวลาตอบกลับ',
    timeBody: 'โดยปกติตอบภายใน 1-3 วันทำการ หากเร่งด่วนโปรดระบุในหัวข้ออีเมล',
  },

  ms: {
    title: 'Hubungi kami',
    summary: 'Cara menghubungi {site} dan apa yang boleh ditanya.',
    intro: 'Sokongan teknikal, maklum balas kandungan dan hal hak cipta diuruskan melalui e-mel.',
    emailHeading: 'Sokongan e-mel',
    emailIntro:
      'Untuk sebarang pertanyaan, sokongan teknikal, hal hak cipta atau soalan umum, sila e-mel kami. Kami sentiasa sedia membantu!',
    emailLabel: 'E-mel: {mail}',
    helpHeading: 'Bagaimana kami boleh membantu',
    helpItems: [
      'Masalah teknikal dengan permainan atau laman.',
      'Soalan hak cipta dan permintaan penyingkiran.',
      'Soalan umum tentang laman dan perkhidmatannya.',
      'Cadangan ciri dan penambahbaikan.',
    ],
    timeHeading: 'Masa balasan',
    timeBody: 'Biasanya kami membalas dalam satu hingga tiga hari bekerja. Tandakan hal mendesak pada subjek.',
  },

  id: {
    title: 'Hubungi kami',
    summary: 'Cara menghubungi {site} dan hal yang bisa ditanyakan.',
    intro: 'Dukungan teknis, masukan konten, dan urusan hak cipta ditangani lewat email.',
    emailHeading: 'Dukungan email',
    emailIntro:
      'Untuk pertanyaan apa pun, dukungan teknis, urusan hak cipta, atau pertanyaan umum, silakan kirim email kepada kami. Kami siap membantu!',
    emailLabel: 'Email: {mail}',
    helpHeading: 'Yang bisa kami bantu',
    helpItems: [
      'Masalah teknis dengan game atau situs.',
      'Pertanyaan hak cipta dan permintaan penghapusan.',
      'Pertanyaan umum tentang situs dan layanannya.',
      'Saran fitur dan perbaikan.',
    ],
    timeHeading: 'Waktu balasan',
    timeBody: 'Biasanya kami membalas dalam satu sampai tiga hari kerja. Tandai hal mendesak di subjek.',
  },
};

/** 取某一篇站务说明（按语言）。 */
export function siteDoc(kind: SiteDocKind, locale: Locale): SiteDoc {
  const site = SITE_NAME[locale];
  const list = consoleList(locale);

  if (kind === 'about') {
    const copy = ABOUT[locale];
    const vars = { site, list };

    return {
      label: 'ABOUT US',
      title: copy.title,
      summary: fill(copy.summary, vars),
      intro: fill(copy.intro, vars),
      sections: [
        {
          heading: copy.aboutHeading,
          body: copy.aboutBody.map((paragraph) => fill(paragraph, vars)),
        },
        {
          heading: copy.aimHeading,
          body: copy.aimBody.map((paragraph) => fill(paragraph, vars)),
        },
        {
          heading: copy.featureHeading,
          bullets: copy.features.map((item) => fill(item, vars)),
        },
        {
          heading: copy.platformsHeading,
          body: [fill(copy.platformsBody, vars)],
        },
      ],
    };
  }

  const copy = CONTACT[locale];
  const vars = {
    site,
    /* 邮箱做成 `mailto:` 链接 —— DocPage 的 `[文字](地址)` 行内标记认这个写法 */
    mail: `[${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})`,
  };

  return {
    label: 'CONTACT',
    title: copy.title,
    summary: fill(copy.summary, vars),
    intro: fill(copy.intro, vars),
    sections: [
      {
        heading: copy.emailHeading,
        body: [fill(copy.emailIntro, vars), fill(copy.emailLabel, vars)],
      },
      {
        heading: copy.helpHeading,
        bullets: copy.helpItems.map((item) => fill(item, vars)),
      },
      {
        heading: copy.timeHeading,
        body: [fill(copy.timeBody, vars)],
      },
    ],
  };
}

import { SITE_NAME, type Locale } from './i18n';

/**
 * 免责声明 —— **全站唯一出处**（2026-11-03 从 `lib/site-doc.ts` 拆出来）。
 *
 * 为什么单独一个文件：渲染它的 `components/Disclaimer.tsx` 是**客户端组件**
 * （`DocPage` 与 `RomDownloadGate` 都是 `'use client'`，它在里面被 import）。
 * 文案留在 `site-doc.ts` 里的话，客户端会连带把关于页 / 联系页那两篇十几语言的
 * 长文整份打进 bundle —— 这里只有 18 条短句，差了一个数量级。
 *
 * 渲染它的地方是**三处页脚**（首页、`GamesShell` 内容页外壳、`DocPage` 文档页外壳），
 * 都渲染 `components/Disclaimer.tsx`。
 *
 * ⚠️ **下载页（`RomDownloadGate`）不出这句**（2026-11-03 用户看了截图后要求）：那里原先
 * 自己写了一句（i18n 的 `download.disclaimer`，与这里口径不一致），统一成这份之后
 * **同一页出现两遍**（下载块一遍、页脚一遍），所以上面那块直接删掉，只留下
 * `download.rights`（「请只下载你有权使用的 ROM 文件」）。那个 i18n 键连同 18 份
 * 翻译已经删干净，**别再手写第二份**。
 *
 * `label` 自带冒号：中文用全角「：」，日韩用半角「:」，各写各的，别在组件里拼。
 *
 * 四句话的结构固定：不在自有服务器托管 ISO/ROM → 索引自第三方 → 尊重知识产权 →
 * 独立网站、与任何组织无关联。加语言时照这个骨架翻，别各写各的。
 *
 * ⚠️ 口径与 `lib/legal.ts` 条款第 3 节是一套，改一处要回去看另一处。
 */
const DISCLAIMER: Record<Locale, { label: string; text: string }> = {
  en: {
    label: 'Disclaimer:',
    text: '{site} does not host any ISO or ROM files on its own servers. All games are indexed from third-party sources. We respect the intellectual property rights of others. {site} is an independent website and is not affiliated with any organization.',
  },
  zh: {
    label: '免责声明：',
    text: '{site}不在自有服务器上托管任何 ISO/ROM 文件。所有游戏均索引自第三方来源。我们尊重他人的知识产权。{site}是独立网站，与任何组织机构无关联。',
  },
  'zh-TW': {
    label: '免責聲明：',
    text: '{site}不在自有伺服器上託管任何 ISO/ROM 檔案。所有遊戲均索引自第三方來源。我們尊重他人的智慧財產權。{site}是獨立網站，與任何組織機構無關。',
  },
  ja: {
    label: '免責事項：',
    text: '{site}は自社サーバー上に ISO/ROM ファイルを一切置いていません。すべてのゲームは第三者の情報源からインデックスしたものです。当サイトは他者の知的財産権を尊重します。{site}は独立したウェブサイトであり、いかなる組織とも関係ありません。',
  },
  ko: {
    label: '면책 조항:',
    text: '{site}는 자체 서버에 ISO/ROM 파일을 호스팅하지 않습니다. 모든 게임은 제3자 출처에서 색인한 것입니다. 저희는 타인의 지식 재산권을 존중합니다. {site}는 독립적인 웹사이트이며 어떤 단체와도 관련이 없습니다.',
  },
  es: {
    label: 'Aviso legal:',
    text: '{site} no aloja ningún archivo ISO o ROM en sus propios servidores. Todos los juegos están indexados desde fuentes de terceros. Respetamos los derechos de propiedad intelectual de otros. {site} es un sitio web independiente y no está afiliado a ninguna organización.',
  },
  hi: {
    label: 'अस्वीकरण:',
    text: '{site} अपने सर्वर पर कोई ISO/ROM फ़ाइल होस्ट नहीं करता। सभी गेम तीसरे पक्ष के स्रोतों से इंडेक्स किए गए हैं। हम दूसरों के बौद्धिक संपदा अधिकारों का सम्मान करते हैं। {site} एक स्वतंत्र वेबसाइट है और किसी भी संगठन से संबद्ध नहीं है।',
  },
  pt: {
    label: 'Aviso:',
    text: '{site} não hospeda nenhum arquivo ISO ou ROM em servidores próprios. Todos os jogos são indexados de fontes de terceiros. Respeitamos os direitos de propriedade intelectual de terceiros. {site} é um site independente e não é afiliado a nenhuma organização.',
  },
  fr: {
    label: 'Avis :',
    text: '{site} n’héberge aucun fichier ISO ou ROM sur ses propres serveurs. Tous les jeux sont indexés depuis des sources tierces. Nous respectons la propriété intellectuelle d’autrui. {site} est un site indépendant, sans affiliation avec aucune organisation.',
  },
  de: {
    label: 'Haftungsausschluss:',
    text: '{site} hostet keine ISO- oder ROM-Dateien auf eigenen Servern. Alle Spiele sind aus Quellen Dritter indexiert. Wir respektieren die geistigen Eigentumsrechte anderer. {site} ist eine unabhängige Website und steht in keiner Verbindung zu einer Organisation.',
  },
  it: {
    label: 'Avviso:',
    text: '{site} non ospita alcun file ISO o ROM sui propri server. Tutti i giochi sono indicizzati da fonti di terze parti. Rispettiamo i diritti di proprietà intellettuale altrui. {site} è un sito indipendente e non è affiliato ad alcuna organizzazione.',
  },
  ru: {
    label: 'Отказ от ответственности:',
    text: '{site} не размещает файлы ISO или ROM на собственных серверах. Все игры проиндексированы из сторонних источников. Мы уважаем права интеллектуальной собственности других лиц. {site} — независимый сайт, не связанный ни с одной организацией.',
  },
  fil: {
    label: 'Paunawa:',
    text: 'Hindi nagho-host ang {site} ng anumang ISO o ROM na file sa sariling server. Lahat ng laro ay ini-index mula sa mga source ng third party. Nirerespeto namin ang karapatang intelektwal ng iba. Ang {site} ay isang malayang website at walang kaugnayan sa anumang organisasyon.',
  },
  nl: {
    label: 'Disclaimer:',
    text: '{site} host geen ISO- of ROM-bestanden op eigen servers. Alle spellen zijn geïndexeerd uit bronnen van derden. Wij respecteren de intellectuele eigendomsrechten van anderen. {site} is een onafhankelijke website en is niet verbonden aan een organisatie.',
  },
  vi: {
    label: 'Miễn trừ trách nhiệm:',
    text: '{site} không lưu trữ bất kỳ tệp ISO hay ROM nào trên máy chủ của mình. Mọi trò chơi đều được lập chỉ mục từ nguồn của bên thứ ba. Chúng tôi tôn trọng quyền sở hữu trí tuệ của người khác. {site} là một trang web độc lập và không liên kết với bất kỳ tổ chức nào.',
  },
  th: {
    label: 'ข้อจำกัดความรับผิด:',
    text: '{site} ไม่ได้โฮสต์ไฟล์ ISO หรือ ROM ใด ๆ บนเซิร์ฟเวอร์ของตนเอง เกมทั้งหมดดึงดัชนีจากแหล่งของบุคคลที่สาม เราเคารพสิทธิในทรัพย์สินทางปัญญาของผู้อื่น {site} เป็นเว็บไซต์อิสระและไม่มีความเกี่ยวข้องกับองค์กรใด',
  },
  ms: {
    label: 'Penafian:',
    text: '{site} tidak mengehos mana-mana fail ISO atau ROM pada pelayan sendiri. Semua permainan diindeks daripada sumber pihak ketiga. Kami menghormati hak harta intelek orang lain. {site} ialah laman web bebas dan tidak bergabung dengan mana-mana organisasi.',
  },
  id: {
    label: 'Penafian:',
    text: '{site} tidak menghoskan berkas ISO atau ROM apa pun di server sendiri. Semua game diindeks dari sumber pihak ketiga. Kami menghormati hak kekayaan intelektual orang lain. {site} adalah situs web independen dan tidak berafiliasi dengan organisasi mana pun.',
  },
};

export function disclaimer(locale: Locale): { label: string; text: string } {
  const item = DISCLAIMER[locale];
  return { label: item.label, text: item.text.replace(/\{site\}/g, SITE_NAME[locale]) };
}

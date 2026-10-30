/**
 * 法务文案（隐私政策 / 服务条款）。
 *
 * **为什么不进 lib/i18n.ts**：那张表自己的注释写着「只放常驻在界面上的文案」——
 * 法务文档是**长文**，房间界面里一个字都不出现，只在 /privacy 和 /terms 两页上渲染。
 * 塞进去会给 MessageKey 加几十个键，把那张表（本来就 800 多行）冲得更难查；
 * 而且它们是**结构化**的（标题 + 章节 + 段落 + 列表），不是一句一个键的扁平文案，
 * 按结构存才能让页面直接 map 出来。
 *
 * 代价是这里**自成一套 i18n**（中 / 英 / 日 / 韩各写一份，不靠 MessageKey 做编译期对齐）。
 * 所以规矩是：**加一节、改一节，四份都要动** —— 页面上的目录是逐节渲染的，
 * 漏译不会报错，只会让另一种语言少一段。
 *
 * ⚠️ **2026-10-16 加日韩**：两份文档各多了一个 `if (locale === 'ja')` 和
 *    `if (locale === 'ko')` 分支（原来只有 zh 一个分支 + 兜底英文）。
 *    分支式而不是「四份并排的数据表」，是为了**不重排已有的中英两份** ——
 *    那两份的段落结构是逐条核对过代码写出来的，挪动只会引入无谓的 diff。
 *
 * ⚠️⚠️ **2026-10-20 界面语言扩到 18 种，但法务文档只翻到 4 种** —— 这是**刻意的**。
 *    新增的 14 种（es / hi / pt / fr / de / it / ru / fil / nl / vi / th / ms / id / zh-TW）
 *    一律落到下面那个**兜底英文**分支。理由：
 *    ① 法务长文是「最低频、最贵」的一类文案，14 份 × 2 篇 ≈ 上千句；翻错的风险比
 *       不翻大得多（合规文本出错比看到英文糟糕）；
 *    ② 英文版是**有法律含义的原文**，「只有原文、其余语言回退原文」是多语言站点的
 *       常规做法，比机翻一份更站得住；
 *    ③ 真要翻的时候按语言加一个 `if (locale === 'xx')` 分支即可，结构已经铺好了 ——
 *       别改成数据表，那会把现有四份的段落顺序全部打乱。
 *    `zh-TW` 也回退英文：简体那份是独立写的中文原文，法务文本做简繁转换会改掉用词
 *    习惯，看起来像另一份合同。
 *
 * ⚠️⚠️ **文体：法务陈述，不是说明文，更不是博客。三条不能犯的毛病**（用户 2026-10-13 /
 *    10-14 连着两次就同一件事提要求，别再犯第三次）：
 *   ① **不口语化**。判据：把句子念出来像不像在跟人聊天。
 *      不写「你还可以在个人中心选填性别」「我们看不到你的密码」「请只和信任的人联机」
 *      「但本站自己做的部分」这类；改写成「性别与头像为选填项」「本站无法读取原始密码」
 *      「请仅与信任的人联机」「本站自行创作的部分」。
 *   ② **不用破折号 / 括号做补充说明**。`X —— 也就是 Y` 压成一句陈述；
 *      括号注释也不要，法务句子里塞注释就显得散。
 *   ③ **尽量短**（用户 2026-10-14「最小化合规」）。形容、铺垫、重复的主语都删。
 *      `界面偏好：主题、吊灯、简洁模式、电视机大小，以及自定义按键` 这类逐项罗列要
 *      概括成「界面偏好设置与自定义按键」—— 读者不需要知道有哪些开关。
 *
 * ⚠️ 顺带：**技术架构细节一律不写** —— 存储介质（cookie 叫什么名字、localStorage 还是
 *    IndexedDB）、hash 算法、数据库与对象存储是什么产品、令牌怎么签，全不写；
 *    「为什么这么实现」也不写（那是代码里的事）。
 * 但第三方资源的具体域名 / 协议名（`fonts.googleapis.com`、`broker.emqx.io`、
 *    STUN、MQTT）同样不写，**只留服务商的名字**（Google Fonts / Google Analytics /
 *    Cloudflare）—— 那是隐私政策必须披露的「数据接收方」，去掉反而不合规；联机那条也要留，
 *    因为「对方能看到你的 IP」是真会影响读者决定的事。
 * 判断标准：**这句话对读者的决定有没有用**。
 *
 * ⚠️ **内容必须与本站实际行为一致**，别照抄别的站的模板：
 * 本站**没有广告、没有服务端记录游玩行为** ——
 * 抄一段「我们使用 cookie 分析你的浏览行为」就是不实陈述。
 * 但**访问统计是真的接了**（`components/Analytics.tsx` 的 GA4，2026-10-30 起全站生效），
 * 所以 2026-10-30 把原来那句「未接入第三方统计分析工具」改成了正面披露 —— 这条别再删，
 * 删了就是隐私政策与实现相反。涉及第三方的那一节（Google Fonts / Google Analytics /
 * Cloudflare / 联机中继）是**逐条核对过代码**才写的：字体在 SiteDocument 的 <link>、
 * 统计在 components/Analytics.tsx、人机验证在 lib/server/turnstile.ts、
 * 联机链路在 lib/netplay.ts。改那几处要回来同步。
 * （jsDelivr 那条 2026-10-30 删掉了：2026-10-19 起 14 台机种的核心全在本站 `/cores/`。）
 *
 * ⚠️ **账号系统（2026-10-14 加，用户要求）**：现在**支持登录**了，所以隐私政策多了
 *    「账号信息」和「与账号关联的云端数据」两节，条款多了「账号」一节。
 *    事实来源（写之前核过代码，改这几处要回来同步）：
 *      · 注册收邮箱 + 密码，邮箱就是登录名（lib/email.ts / app/api/user/register），
 *        密码经 scrypt 加盐哈希后入库、**不可逆**（lib/server/app-users.ts）；
 *      · 个人中心可**选填**性别、可上传头像（头像存云端、地址公开，lib/server/user-data.ts）；
 *      · 登录后才有：云端存档 / 游戏历史 / 收藏 / 评论（db/schema.sql 的 user_* 与
 *        game_comments 表）；
 *      · **没有**自助注销入口 —— 删号走邮箱（这就是「你的选择与权利」里那条的由来）。
 *
 * 站名一律走 `SITE_NAME[locale]` 拼（和 i18n.ts 里 `{site}` 占位同一个理由：
 * 改名只改一处）。邮箱只在这里定义一次，文案里用模板串进去。
 */

import { SITE_NAME, type Locale } from './i18n';

/**
 * 版权 / 隐私相关的联系邮箱。
 *
 * 只在这一处定义 —— 两份文档的「联系我们」节都由它拼出来。
 * 改邮箱只改这里（页脚那个 mailto 也读它）。
 */
export const SUPPORT_EMAIL = 'support@retrogamesbox.com';

export type LegalKind = 'privacy' | 'terms';

export interface LegalSection {
  heading: string;
  /** 段落。按顺序渲染。 */
  body?: string[];
  /** 段落之后的列表项（前面自动加一个圆点）。 */
  bullets?: string[];
}

export interface LegalDoc {
  /** 页面上那行 font-pixel 小标签。**四语言都是英文** —— Press Start 2P 没有汉字 / 假名 / 谚文字形。 */
  label: string;
  /** <h1> 与 <title>（<title> 会被根布局的模板补上站名后缀）。 */
  title: string;
  /** <meta name="description">。 */
  summary: string;
  /** ISO 日期，页面按语言格式化。 */
  updated: string;
  /** h1 下面那句。 */
  intro: string;
  sections: LegalSection[];
}

/**
 * 两份文档同一天改的，日期一起走。
 *
 * 2026-10-30：换域名/站名的那一版已经动过联系方式；同一天又修正了三处与事实不符的
 * 旧陈述 —— 统计口径（实际接了 GA4，原文写着「未接入第三方统计分析」）、
 * 第三方清单（jsDelivr 早就不再加载，14 台机种的核心全在本站 `/cores/`）、
 * 以及条款里漏掉的「按用户要求下载」。改正文就必须改这个日期（页面第 10 节承诺过）。
 */
const UPDATED = '2026-10-30';

function privacy(locale: Locale): LegalDoc {
  const site = SITE_NAME[locale];

  if (locale === 'zh') {
    return {
      label: 'PRIVACY POLICY',
      title: '隐私政策',
      summary: `${site}对个人信息的处理方式：浏览器本地保存的内容、账号与云端数据、cookie，以及页面加载的第三方服务。`,
      updated: UPDATED,
      intro: `${site}在运行过程中对个人信息的收集与使用。`,
      sections: [
        {
          heading: '1. 概述',
          body: [
            `${site}（下称「本站」）是在浏览器中运行复古游戏的免费站点。无需注册即可游玩；注册后可保存云端存档、收藏游戏并发表评论。`,
            '使用本站即表示已阅读并理解本政策。',
          ],
        },
        {
          heading: '2. 浏览器本地保存的信息',
          body: ['以下内容仅保存于浏览器本地，不会上传至服务器：'],
          bullets: [
            '界面偏好设置与自定义按键。',
            '本机存档、街机 BIOS 文件与游戏库载入记录。',
            '清除浏览器数据或使用无痕窗口即可删除，且无法恢复。',
          ],
        },
        {
          heading: '3. 账号信息',
          body: [
            '注册需提供邮箱与密码。邮箱即登录名；密码经不可逆加密后保存，本站无法读取原始密码。',
            '性别与头像为选填项，可在个人中心修改；头像会公开显示于发表的评论旁。',
          ],
        },
        {
          heading: '4. 与账号关联的云端数据',
          body: [
            '登录后使用以下功能时，相关数据保存于本站服务器，其他用户不可见；本站管理员为维护服务可在必要时访问：',
          ],
          bullets: [
            '云端存档。',
            '游戏历史：在在线游戏库中的游玩记录。',
            '收藏的游戏。',
            '发表的评论及星级评分。',
          ],
        },
        {
          heading: '5. 提交或公开的内容',
          body: [
            '留言本：匿名提交，内容**公开可见**。请勿填写个人信息。',
            '游戏评论：需登录后发表，连同用户名与头像公开显示。',
            '游戏反馈：匿名提交，仅用于改进服务。',
            '邮件：通过邮件联系本站时，本站会收到你的邮箱地址与邮件内容，仅用于回复。',
          ],
        },
        {
          heading: '6. Cookie',
          body: [
            '本站自己的 cookie 只记录界面语言与登录状态，不影响其他网站，也不向第三方开放；访问统计用的 cookie 见下一条与第 7 节。',
            '本站**不使用广告 cookie**。访问统计使用 Google Analytics，只用于了解访问量与常用页面，不用于广告投放；它会在你的浏览器里设置统计 cookie，并把访问数据传给 Google。',
          ],
        },
        {
          heading: '7. 第三方服务',
          body: [
            '本站不向第三方出售或出租任何信息。页面运行所需的部分资源由浏览器**直接**向第三方加载，对方因而可获取你的 IP 地址：',
          ],
          bullets: [
            'Google Fonts：页面使用的像素字体。',
            'Google Analytics：访问统计，会设置统计 cookie 并获取你的 IP 地址。',
            'Cloudflare：本站的托管与存储服务，以及注册、登录时的人机验证。',
            '联机功能：通过公共中继服务器建立点对点连接，**对方可获取你的 IP 地址**。请仅与信任的人联机。',
            '上述第三方的隐私做法不受本站控制，建议查阅其各自的隐私政策。',
          ],
        },
        {
          heading: '8. 你的选择与权利',
          bullets: [
            '清除浏览器数据即可删除仅存于本机的内容。',
            '云端存档、游戏历史与收藏可在个人中心自行删除。',
            '评论可自行删除；留言如需删除，请联系本站。',
            '注销账号：请通过下方邮箱联系本站，我们将删除账号及其关联的云端数据。',
          ],
        },
        {
          heading: '9. 儿童隐私',
          body: [
            '本站不面向 13 岁以下儿童。如发现儿童向本站提交个人信息，请联系本站删除。',
          ],
        },
        {
          heading: '10. 本政策的变更',
          body: [
            '本政策可能随服务变化而更新，届时将改动本页顶部的「最后更新」日期。继续使用本站即视为接受更新后的版本。',
          ],
        },
        {
          heading: '11. 联系我们',
          body: [`对本政策或个人信息有疑问，请联系：${SUPPORT_EMAIL}`],
        },
      ],
    };
  }

  /*
   * ⚠️ **日语 / 韩语两份（2026-10-16 加）**：文体规矩与中文那份完全一致
   *    （法务陈述、不口语化、不用破折号或括号做补充说明、尽量短、不写技术架构细节、
   *    第三方只留服务商名字）。见文件头那三条「不能犯的毛病」。
   *    `**…**` 是页面渲染用的加粗标记，**别删**（LegalPage 认它）。
   */
  if (locale === 'ja') {
    return {
      label: 'PRIVACY POLICY',
      title: 'プライバシーポリシー',
      summary: `${site}における個人情報の取り扱い：ブラウザ内に保存される情報、アカウントとクラウドデータ、cookie、およびページが読み込む第三者サービス。`,
      updated: UPDATED,
      intro: `${site}の利用中における個人情報の収集と利用について。`,
      sections: [
        {
          heading: '1. 概要',
          body: [
            `${site}（以下「本サービス」）は、ブラウザ上でレトロゲームを動かす無料のサイトです。登録なしで遊べます。登録するとクラウドセーブ、お気に入り、コメントが利用できます。`,
            '本サービスを利用した時点で、本ポリシーを理解したものとみなします。',
          ],
        },
        {
          heading: '2. ブラウザ内に保存される情報',
          body: ['以下はブラウザ内にのみ保存され、サーバーへ送信されません：'],
          bullets: [
            'インターフェースの設定とカスタムキー割り当て。',
            '本体のセーブ、アーケードの BIOS ファイル、ライブラリの読み込み履歴。',
            'ブラウザのデータを消去するかプライベートウィンドウを使うと削除され、復元できません。',
          ],
        },
        {
          heading: '3. アカウント情報',
          body: [
            '登録にはメールアドレスとパスワードが必要です。メールアドレスはログイン名を兼ねます。パスワードは不可逆な形式で保存され、本サービスは元のパスワードを読み取れません。',
            '性別とアイコンは任意で、マイページから変更できます。アイコンは投稿したコメントの横に公開表示されます。',
          ],
        },
        {
          heading: '4. アカウントに紐づくクラウドデータ',
          body: [
            'ログイン中に以下の機能を使うと、データは本サービスのサーバーに保存され、他の利用者からは見えません。運営上必要な場合、管理者がアクセスすることがあります：',
          ],
          bullets: [
            'クラウドセーブ。',
            'プレイ履歴：オンラインライブラリでのプレイ記録。',
            'お気に入りのゲーム。',
            '投稿したコメントと星評価。',
          ],
        },
        {
          heading: '5. 送信または公開される内容',
          body: [
            '伝言板：匿名で投稿でき、内容は**公開**されます。個人情報を書かないでください。',
            'ゲームのコメント：ログインが必要で、ユーザー名とアイコンとともに公開表示されます。',
            'ゲームのフィードバック：匿名で送信され、サービスの改善にのみ使用します。',
            'メール：メールで連絡いただいた場合、メールアドレスと本文を受け取り、返信にのみ使用します。',
          ],
        },
        {
          heading: '6. Cookie',
          body: [
            'cookie はインターフェースの言語とログイン状態の記録に使用します。他のサイトには影響せず、第三者にも提供しません。アクセス解析用の cookie は次の項目と第 7 節に記載します。',
            '**広告 cookie は使用しません**。アクセス解析には Google Analytics を使用し、訪問数とよく見られるページの把握だけに用い、広告配信には使いません。同サービスはブラウザに統計用 cookie を設定し、アクセスデータを Google に送信します。',
          ],
        },
        {
          heading: '7. 第三者サービス',
          body: [
            '本サービスはいかなる情報も第三者へ販売または貸与しません。ページの動作に必要な一部のリソースはブラウザが第三者から**直接**読み込むため、相手は IP アドレスを取得し得ます：',
          ],
          bullets: [
            'Google Fonts：ページが使用するピクセルフォント。',
            'Google Analytics：アクセス解析。統計用 cookie を設定し、IP アドレスを取得します。',
            'Cloudflare：本サービスのホスティングとストレージ、および登録・ログイン時の人間確認。',
            '通信対戦：公共の中継サーバーを介して端末間を直接接続するため、**相手はあなたの IP アドレスを取得できます**。信頼できる相手とのみ対戦してください。',
            'これらの第三者の取り扱いは本サービスの管理外です。各社のポリシーを確認してください。',
          ],
        },
        {
          heading: '8. あなたの選択と権利',
          bullets: [
            'ブラウザのデータを消去すると、本機にのみ保存された内容を削除できます。',
            'クラウドセーブ、プレイ履歴、お気に入りはマイページから削除できます。',
            'コメントは投稿者が削除できます。伝言板の削除は本サービスへご連絡ください。',
            'アカウントの削除：下記のメールアドレスへご連絡ください。アカウントと紐づくクラウドデータを削除します。',
          ],
        },
        {
          heading: '9. 子どものプライバシー',
          body: [
            '本サービスは 13 歳未満の子どもを対象としていません。子どもが個人情報を送信したと思われる場合は、本サービスへご連絡ください。削除します。',
          ],
        },
        {
          heading: '10. 本ポリシーの変更',
          body: [
            '本ポリシーはサービスに合わせて更新されることがあり、その際は本ページ上部の「最終更新」の日付を変更します。その後の利用は更新後の内容への同意とみなします。',
          ],
        },
        {
          heading: '11. お問い合わせ',
          body: [`本ポリシーまたは個人情報についてのご質問：${SUPPORT_EMAIL}`],
        },
      ],
    };
  }

  if (locale === 'ko') {
    return {
      label: 'PRIVACY POLICY',
      title: '개인정보 처리방침',
      summary: `${site}의 개인정보 처리 방식: 브라우저에 남는 정보, 계정과 클라우드 데이터, cookie, 페이지가 불러오는 제3자 서비스.`,
      updated: UPDATED,
      intro: `${site} 이용 중 개인정보를 수집하고 사용하는 방식.`,
      sections: [
        {
          heading: '1. 개요',
          body: [
            `${site}(이하 "이 서비스")는 브라우저에서 레트로 게임을 실행하는 무료 사이트입니다. 가입 없이 즐길 수 있으며, 가입하면 클라우드 세이브, 즐겨찾기, 댓글을 쓸 수 있습니다.`,
            '이 서비스를 이용하면 본 방침을 이해한 것으로 봅니다.',
          ],
        },
        {
          heading: '2. 브라우저에 저장되는 정보',
          body: ['다음 정보는 브라우저에만 저장되며 서버로 전송되지 않습니다:'],
          bullets: [
            '인터페이스 설정과 사용자 지정 키 배치.',
            '본체 세이브, 아케이드 BIOS 파일, 라이브러리 불러오기 기록.',
            '브라우저 데이터를 지우거나 시크릿 창을 쓰면 삭제되며 복구할 수 없습니다.',
          ],
        },
        {
          heading: '3. 계정 정보',
          body: [
            '가입에는 이메일 주소와 비밀번호가 필요합니다. 이메일 주소가 로그인 이름이 됩니다. 비밀번호는 되돌릴 수 없는 형태로 저장되며, 이 서비스는 원래 비밀번호를 읽을 수 없습니다.',
            '성별과 프로필 이미지는 선택 사항이며 내 계정에서 바꿀 수 있습니다. 프로필 이미지는 작성한 댓글 옆에 공개됩니다.',
          ],
        },
        {
          heading: '4. 계정에 연결된 클라우드 데이터',
          body: [
            '로그인한 상태에서 아래 기능을 쓰면 데이터는 이 서비스의 서버에 저장되며 다른 사용자에게는 보이지 않습니다. 운영상 필요하면 관리자가 접근할 수 있습니다:',
          ],
          bullets: [
            '클라우드 세이브.',
            '플레이 기록: 온라인 라이브러리에서의 플레이 기록.',
            '즐겨찾기한 게임.',
            '작성한 댓글과 별점.',
          ],
        },
        {
          heading: '5. 제출하거나 공개되는 내용',
          body: [
            '방명록: 익명으로 등록되며 내용은 **공개**됩니다. 개인정보를 적지 마세요.',
            '게임 댓글: 로그인이 필요하며 사용자 이름과 프로필 이미지와 함께 공개됩니다.',
            '게임 의견: 익명으로 접수되며 서비스 개선에만 사용합니다.',
            '이메일: 이메일로 연락하시면 주소와 내용을 받으며, 답변에만 사용합니다.',
          ],
        },
        {
          heading: '6. Cookie',
          body: [
            'cookie는 인터페이스 언어와 로그인 상태를 기록하는 데 사용합니다. 다른 사이트에 영향을 주지 않으며 제3자에게 제공하지 않습니다. 접속 분석용 cookie는 다음 항목과 제7조에 적습니다.',
            '**광고 cookie는 쓰지 않습니다**. 접속 분석에는 Google Analytics를 사용하며, 방문 수와 자주 보는 페이지를 파악하는 데만 쓰고 광고 집행에는 쓰지 않습니다. 이 서비스는 브라우저에 통계용 cookie를 설정하고 접속 데이터를 Google로 보냅니다.',
          ],
        },
        {
          heading: '7. 제3자 서비스',
          body: [
            '이 서비스는 어떤 정보도 제3자에게 팔거나 빌려주지 않습니다. 페이지 동작에 필요한 일부 리소스는 브라우저가 제3자로부터 **직접** 불러오며, 그쪽은 IP 주소를 얻을 수 있습니다:',
          ],
          bullets: [
            'Google Fonts: 페이지가 쓰는 픽셀 글꼴.',
            'Google Analytics: 접속 분석. 통계용 cookie를 설정하고 IP 주소를 얻습니다.',
            'Cloudflare: 이 서비스의 호스팅과 저장, 그리고 가입·로그인 시의 사람 확인.',
            '온라인 대전: 공용 중계 서버를 거쳐 기기 간 직접 연결을 맺으므로 **상대가 여러분의 IP 주소를 얻을 수 있습니다**. 신뢰하는 상대와만 대전하세요.',
            '이들 제3자의 처리 방식은 이 서비스의 통제 밖입니다. 각자의 방침을 확인하세요.',
          ],
        },
        {
          heading: '8. 여러분의 선택과 권리',
          bullets: [
            '브라우저 데이터를 지우면 이 기기에만 저장된 내용을 삭제할 수 있습니다.',
            '클라우드 세이브, 플레이 기록, 즐겨찾기는 내 계정에서 삭제할 수 있습니다.',
            '댓글은 작성자가 삭제할 수 있습니다. 방명록 글은 이 서비스로 연락 주시면 삭제합니다.',
            '계정 삭제: 아래 이메일로 연락 주시면 계정과 연결된 클라우드 데이터를 삭제합니다.',
          ],
        },
        {
          heading: '9. 아동의 개인정보',
          body: [
            '이 서비스는 만 13세 미만 아동을 대상으로 하지 않습니다. 아동이 개인정보를 제출했다고 판단되면 이 서비스로 연락해 주세요. 삭제합니다.',
          ],
        },
        {
          heading: '10. 본 방침의 변경',
          body: [
            '본 방침은 서비스 변화에 따라 갱신될 수 있으며, 그때는 이 페이지 위쪽의 "최종 수정" 날짜를 바꿉니다. 이후의 이용은 갱신된 내용에 동의한 것으로 봅니다.',
          ],
        },
        {
          heading: '11. 문의',
          body: [`본 방침 또는 개인정보에 대한 문의: ${SUPPORT_EMAIL}`],
        },
      ],
    };
  }

  return {
    label: 'PRIVACY POLICY',
    title: 'Privacy Policy',
    summary: `How ${site} handles personal information: what stays in your browser, account and cloud data, cookies, and the third-party services the page loads.`,
    updated: UPDATED,
    intro: `How ${site} collects and uses personal information while you play.`,
    sections: [
      {
        heading: '1. Overview',
        body: [
          `${site} ("the Service") is a free retro game room running in your browser. An account is optional; registering enables cloud saves, favourites and comments.`,
          'Use of the Service constitutes acknowledgement of this policy.',
        ],
      },
      {
        heading: '2. Information stored in your browser',
        body: ['The following is kept only in your browser and is not uploaded to our servers:'],
        bullets: [
          'Interface preferences and custom key bindings.',
          'Local save states, an arcade BIOS file, and the library load history.',
          'Removed by clearing browser data or using a private window; deleted data cannot be recovered.',
        ],
      },
      {
        heading: '3. Account information',
        body: [
          'Registration requires an email address and a password. The email is the sign-in name; the password is stored in an irreversible encrypted form and cannot be read by us.',
          'Gender and avatar are optional and may be changed in the account area; avatars are shown publicly beside the comments they belong to.',
        ],
      },
      {
        heading: '4. Cloud data linked to your account',
        body: [
          'When the features below are used while signed in, the data is stored on our servers and is not visible to other users; our administrators may access it where necessary to operate the Service:',
        ],
        bullets: [
          'Cloud save states.',
          'Play history: games played from the online library.',
          'Favourite games.',
          'Comments posted and their star ratings.',
        ],
      },
      {
        heading: '5. What you submit or make public',
        body: [
          'Guestbook: submitted anonymously and **publicly visible**. Do not include personal information.',
          'Game comments: require signing in; shown publicly with your username and avatar.',
          'Game feedback: submitted anonymously and used only to improve the Service.',
          'Email: messages sent to us are received together with your address and used only to reply.',
        ],
      },
      {
        heading: '6. Cookies',
        body: [
          'Cookies are used to remember the interface language and to keep you signed in. They do not affect other sites and are not shared with third parties. The analytics cookie is described in the next item and in section 7.',
          'We run **no advertising cookies**. For traffic statistics we use Google Analytics, solely to see visitor numbers and which pages are read, never for ad targeting; it sets a statistics cookie in your browser and sends usage data to Google.',
        ],
      },
      {
        heading: '7. Third-party services',
        body: [
          'We do not sell or rent information to anyone. Some resources the page needs are loaded by your browser **directly** from third parties, which can therefore obtain your IP address:',
        ],
        bullets: [
          'Google Fonts: the pixel typeface used by the page.',
          'Google Analytics: traffic statistics; it sets a statistics cookie and obtains your IP address.',
          'Cloudflare: hosting and storage, and the human check at registration and sign-in.',
          'Netplay: a public relay server sets up a peer-to-peer connection, and the other player **can obtain your IP address**. Play only with people you trust.',
          'Those third parties’ privacy practices are outside our control; consult their own policies.',
        ],
      },
      {
        heading: '8. Your choices and rights',
        bullets: [
          'Clearing browser data removes everything kept on your own machine.',
          'Cloud saves, play history and favourites can be deleted from your account area.',
          'Comments can be deleted by their author; guestbook posts may be removed on request.',
          'Closing an account: contact us by email and the account and its cloud data will be deleted.',
        ],
      },
      {
        heading: '9. Children’s privacy',
        body: [
          'The Service is not intended for children under 13. If you believe a child has submitted personal information, contact us and it will be deleted.',
        ],
      },
      {
        heading: '10. Changes to this policy',
        body: [
          'This policy may change as the Service changes; the "Last updated" date at the top of this page will then be revised. Continued use of the Service constitutes acceptance of the revised version.',
        ],
      },
      {
        heading: '11. Contact us',
        body: [`Questions about this policy or personal information: ${SUPPORT_EMAIL}`],
      },
    ],
  };
}

function terms(locale: Locale): LegalDoc {
  const site = SITE_NAME[locale];

  if (locale === 'zh') {
    return {
      label: 'TERMS OF SERVICE',
      title: '服务条款',
      summary: `使用${site}需遵守的规则，包括账号责任、游戏 ROM 的版权声明与侵权通知方式。`,
      updated: UPDATED,
      intro: `使用${site}之前，请先读完本条款。`,
      sections: [
        {
          heading: '1. 条款的接受',
          body: [
            `访问或使用${site}（下称「本服务」）即表示同意受本条款约束。如不同意，请勿使用本服务。`,
          ],
        },
        {
          heading: '2. 账号',
          body: [
            '注册需提供邮箱与密码。请使用本人有权使用的邮箱，并妥善保管密码。',
            '账号下发生的活动由你负责，请勿共用或转让账号。',
            '账号用于违规行为（如刷屏、发布违法或侵权内容）时，本站可限制或封禁该账号。',
          ],
        },
        {
          heading: '3. 知识产权与版权声明',
          body: [
            '**重要版权声明**：所有游戏 ROM 及其程序、图形、音乐、音效、角色与商标，均为各自版权持有者的知识产权。本站**不拥有、也不主张拥有**任何游戏内容的任何权利。',
            '本站不制作、不出售任何 ROM。站内可访问的 ROM 与游戏内容**来自第三方**；本站仅提供使其在浏览器中运行、以及在用户要求时下载的技术条件。',
            '相关内容仅供**学习、研究与怀旧**之用。你需自行确认有权访问和使用，并自行承担相应责任。',
            '版权持有者如认为本站内容侵犯其权利，请立即联系本站。对每一份有效通知，本站将在核实后**及时移除相关内容**。',
            '本站保留在收到版权持有者请求、或知悉可能存在侵权时移除任何内容的权利。',
          ],
        },
        {
          heading: '4. 本站的原创内容',
          body: [
            '本站不拥有游戏内容。本站自行创作的界面设计、程序代码、文字说明、数据组织、站名与标识归本站所有，受著作权及其他法律保护；未经书面许可，不得复制、分发、修改或用于衍生作品。',
          ],
        },
        {
          heading: '5. 用户责任与合规',
          bullets: [
            '自行确保有权访问和使用任何游戏内容。',
            '不得将本服务用于任何违法或未经授权的用途。',
            '不得转售、再分发或商业利用通过本站访问到的内容。',
            '不得在留言本或评论中提交违法、侵权、辱骂性内容，或他人的隐私信息。',
            '遵守所在地区适用的法律法规。',
          ],
        },
        {
          heading: '6. 版权侵权通知',
          body: [
            '本站尊重他人的知识产权，并期望用户同样如此。',
            '如你的作品被以构成侵权的方式复制并可于本站访问，请通过邮件通知本站，并尽量提供：所主张权利的说明、涉嫌侵权内容的名称或地址、你的联系方式，以及一份善意声明。',
            '本站将调查每一份有效主张，并采取包括移除内容在内的适当措施。',
            `联系邮箱：${SUPPORT_EMAIL}`,
          ],
        },
        {
          heading: '7. 服务可用性与变更',
          body: [
            '本站尽力维持服务可用，但不保证不间断。维护、技术故障或不可控情形可能导致服务暂时不可用。',
            '本站保留随时修改、暂停、终止本服务任何部分或限制某些功能的权利，且不另行通知。',
          ],
        },
        {
          heading: '8. 免责声明与责任限制',
          body: [
            '本服务按「现状」及「可用」状态提供，本站对其运行、可用性或内容不作任何明示或默示的保证。',
            '在法律允许的最大范围内，本站不对因使用本服务（包括其中访问到的任何内容）而产生的任何直接、间接、附带、惩罚性或后果性损害承担责任。',
            '使用本服务及其中内容的风险由你自行承担。',
          ],
        },
        {
          heading: '9. 适用法律与争议',
          body: [
            '本条款的解释与适用，以本站服务器所在地法律为准，并参照适用的国际版权法律。',
            '因本条款或使用本服务产生的争议应先协商解决；协商不成的，提交有管辖权的法院处理。',
          ],
        },
        {
          heading: '10. 条款的变更',
          body: [
            '本站保留随时修改本条款的权利，修改后更新本页顶部的「最后更新」日期。继续使用本服务即视为接受修改后的条款；如不同意，请停止使用。',
          ],
        },
        {
          heading: '11. 联系我们',
          body: [`邮箱：${SUPPORT_EMAIL}`],
        },
      ],
    };
  }

  /* 日语 / 韩语两份（2026-10-16 加）—— 文体规矩与上面中文那份一致，见 privacy() 里那段说明 */
  if (locale === 'ja') {
    return {
      label: 'TERMS OF SERVICE',
      title: '利用規約',
      summary: `${site}の利用にあたっての規則。アカウントの責任、ゲーム ROM の著作権表示、権利侵害の通知方法を含みます。`,
      updated: UPDATED,
      intro: `${site}をご利用になる前に、本規約をお読みください。`,
      sections: [
        {
          heading: '1. 規約への同意',
          body: [
            `${site}（以下「本サービス」）にアクセスまたは利用した時点で、本規約に同意したものとみなします。同意できない場合は本サービスを利用しないでください。`,
          ],
        },
        {
          heading: '2. アカウント',
          body: [
            '登録にはメールアドレスとパスワードが必要です。ご自身が使用する権利を持つメールアドレスを使い、パスワードは適切に管理してください。',
            'アカウント上で行われる行為はご自身の責任です。アカウントを共用または譲渡しないでください。',
            'アカウントが規約違反（連投、違法または権利侵害となる内容の投稿など）に使われた場合、本サービスはそのアカウントを制限または停止できます。',
          ],
        },
        {
          heading: '3. 知的財産と著作権表示',
          body: [
            '**重要な著作権表示**：すべてのゲーム ROM とそのプログラム、グラフィック、音楽、効果音、キャラクター、商標は、それぞれの権利者の知的財産です。本サービスは、いかなるゲーム内容についても権利を**所有せず、主張もしません**。',
            '本サービスは ROM を制作も販売もしません。ここで閲覧できる ROM とゲーム内容は**第三者から提供されたもの**であり、本サービスはブラウザで動作させ、利用者の求めに応じてダウンロードさせる技術的な手段を提供するだけです。',
            '当該内容は**学習、研究、懐かしむこと**のみを目的とします。アクセスと利用の権利があることはご自身で確認し、その責任を負ってください。',
            '権利者が本サービスの内容が自らの権利を侵害すると考える場合は、直ちにご連絡ください。有効な通知については確認のうえ**速やかに関連内容を削除します**。',
            '本サービスは、権利者からの要請があった場合、または権利侵害の可能性を認識した場合に、いかなる内容も削除する権利を留保します。',
          ],
        },
        {
          heading: '4. 本サービスの独自コンテンツ',
          body: [
            '本サービスはゲーム内容を所有しません。本サービスが自ら制作したインターフェースデザイン、プログラムコード、文章、データ構成、サイト名と標識は本サービスに帰属し、著作権その他の法律で保護されます。書面による許可なく、複製、配布、改変、二次的著作物への利用はできません。',
          ],
        },
        {
          heading: '5. 利用者の責任と遵守事項',
          bullets: [
            'いかなるゲーム内容についても、アクセスと利用の権利があることをご自身で確認すること。',
            '本サービスを違法または無断の目的で利用しないこと。',
            '本サービスを通じて閲覧した内容を転売、再配布、商業利用しないこと。',
            '伝言板やコメントに、違法、権利侵害、侮辱的な内容や他人の個人情報を投稿しないこと。',
            'お住まいの地域で適用される法令を守ること。',
          ],
        },
        {
          heading: '6. 著作権侵害の通知',
          body: [
            '本サービスは他者の知的財産権を尊重し、利用者にも同様を求めます。',
            'あなたの作品が権利侵害となる形で複製され、本サービスで閲覧できる場合は、メールでご連絡ください。可能な範囲で、主張する権利の説明、該当内容の名称または場所、連絡先、善意による申告を含めてください。',
            '本サービスは有効な主張ごとに調査し、内容の削除を含む適切な措置を取ります。',
            `連絡先メール：${SUPPORT_EMAIL}`,
          ],
        },
        {
          heading: '7. サービスの可用性と変更',
          body: [
            '本サービスは可用性の維持に努めますが、無停止を保証しません。保守、技術的障害、制御できない状況により一時的に利用できないことがあります。',
            '本サービスは、いつでも予告なく、本サービスの一部を変更、停止、終了し、または一部機能を制限する権利を留保します。',
          ],
        },
        {
          heading: '8. 免責事項と責任の制限',
          body: [
            '本サービスは「現状」かつ「提供可能な状態」で提供され、その動作、可用性、内容について明示または黙示の保証を行いません。',
            '法律で認められる最大の範囲において、本サービスは、本サービスの利用（そこから閲覧した内容を含む）により生じたいかなる直接的、間接的、付随的、懲罰的または結果的損害についても責任を負いません。',
            '本サービスとその内容の利用はご自身の責任で行ってください。',
          ],
        },
        {
          heading: '9. 準拠法と紛争',
          body: [
            '本規約の解釈と適用は、本サービスのサーバーが所在する地域の法律を準拠法とし、適用される国際著作権法を参照します。',
            '本規約または本サービスの利用から生じる紛争は、まず協議により解決するものとします。協議が調わない場合は、管轄権を有する裁判所に付託します。',
          ],
        },
        {
          heading: '10. 規約の変更',
          body: [
            '本サービスはいつでも本規約を変更する権利を留保し、変更後は本ページ上部の「最終更新」の日付を更新します。その後の利用は変更後の規約への同意とみなします。同意できない場合は利用を中止してください。',
          ],
        },
        {
          heading: '11. お問い合わせ',
          body: [`メール：${SUPPORT_EMAIL}`],
        },
      ],
    };
  }

  if (locale === 'ko') {
    return {
      label: 'TERMS OF SERVICE',
      title: '이용약관',
      summary: `${site} 이용에 관한 규칙. 계정 책임, 게임 ROM의 저작권 고지, 권리 침해 신고 방법을 포함합니다.`,
      updated: UPDATED,
      intro: `${site}을(를) 이용하기 전에 본 약관을 읽어 주세요.`,
      sections: [
        {
          heading: '1. 약관의 수락',
          body: [
            `${site}(이하 "이 서비스")에 접속하거나 이용하면 본 약관에 동의한 것으로 봅니다. 동의하지 않으면 이 서비스를 이용하지 마세요.`,
          ],
        },
        {
          heading: '2. 계정',
          body: [
            '가입에는 이메일 주소와 비밀번호가 필요합니다. 본인이 사용할 권리가 있는 이메일 주소를 쓰고 비밀번호를 잘 관리하세요.',
            '계정에서 일어나는 활동은 본인의 책임입니다. 계정을 함께 쓰거나 양도하지 마세요.',
            '계정이 약관 위반(도배, 불법 또는 권리 침해 내용 게시 등)에 쓰이면 이 서비스는 해당 계정을 제한하거나 정지할 수 있습니다.',
          ],
        },
        {
          heading: '3. 지식재산권과 저작권 고지',
          body: [
            '**중요한 저작권 고지**: 모든 게임 ROM과 그 프로그램, 그래픽, 음악, 효과음, 캐릭터, 상표는 각 권리자의 지식재산입니다. 이 서비스는 어떤 게임 내용에 대해서도 권리를 **소유하지 않고 주장하지도 않습니다**.',
            '이 서비스는 ROM을 만들거나 판매하지 않습니다. 여기서 볼 수 있는 ROM과 게임 내용은 **제3자로부터 온 것**이며, 이 서비스는 브라우저에서 실행하고 이용자가 요청할 때 내려받게 하는 기술적 수단만 제공합니다.',
            '해당 내용은 **학습, 연구, 추억** 목적으로만 제공됩니다. 접속하고 이용할 권리가 있는지는 본인이 확인하고 그 책임을 지세요.',
            '권리자가 이 서비스의 내용이 자신의 권리를 침해한다고 판단하면 즉시 연락해 주세요. 유효한 신고는 확인 후 **지체 없이 해당 내용을 삭제합니다**.',
            '이 서비스는 권리자의 요청이 있거나 침해 가능성을 알게 된 경우 어떤 내용이든 삭제할 권리를 보유합니다.',
          ],
        },
        {
          heading: '4. 이 서비스의 자체 콘텐츠',
          body: [
            '이 서비스는 게임 내용을 소유하지 않습니다. 이 서비스가 직접 만든 인터페이스 디자인, 프로그램 코드, 문구, 데이터 구성, 사이트 이름과 표지는 이 서비스에 속하며 저작권과 그 밖의 법으로 보호됩니다. 서면 허락 없이 복제, 배포, 수정하거나 2차적 저작물에 이용할 수 없습니다.',
          ],
        },
        {
          heading: '5. 이용자의 책임과 준수 사항',
          bullets: [
            '어떤 게임 내용이든 접속하고 이용할 권리가 있는지 스스로 확인할 것.',
            '이 서비스를 불법 또는 무단 목적으로 이용하지 말 것.',
            '이 서비스를 통해 본 내용을 재판매, 재배포, 상업적으로 이용하지 말 것.',
            '방명록이나 댓글에 불법, 권리 침해, 모욕적인 내용이나 다른 사람의 개인정보를 올리지 말 것.',
            '거주 지역에서 적용되는 법률을 지킬 것.',
          ],
        },
        {
          heading: '6. 저작권 침해 신고',
          body: [
            '이 서비스는 다른 사람의 지식재산권을 존중하며 이용자에게도 같은 태도를 요구합니다.',
            '여러분의 저작물이 권리 침해에 해당하는 방식으로 복제되어 이 서비스에서 볼 수 있다면 이메일로 알려 주세요. 가능한 범위에서 주장하는 권리의 설명, 해당 내용의 이름이나 위치, 연락처, 선의의 진술을 포함해 주세요.',
            '이 서비스는 유효한 주장마다 조사하고 내용 삭제를 포함한 적절한 조치를 취합니다.',
            `연락 이메일: ${SUPPORT_EMAIL}`,
          ],
        },
        {
          heading: '7. 서비스 가용성과 변경',
          body: [
            '이 서비스는 가용성 유지에 힘쓰지만 중단 없는 운영을 보장하지 않습니다. 점검, 기술적 장애, 통제할 수 없는 상황으로 일시적으로 이용할 수 없을 수 있습니다.',
            '이 서비스는 언제든 예고 없이 서비스의 일부를 변경, 중단, 종료하거나 일부 기능을 제한할 권리를 보유합니다.',
          ],
        },
        {
          heading: '8. 면책과 책임 제한',
          body: [
            '이 서비스는 "있는 그대로" 그리고 "제공 가능한 상태"로 제공되며, 그 동작, 가용성, 내용에 대해 명시적이든 묵시적이든 어떤 보증도 하지 않습니다.',
            '법이 허용하는 최대 범위에서, 이 서비스는 이 서비스의 이용(그를 통해 본 내용 포함)으로 생긴 어떤 직접적, 간접적, 부수적, 징벌적 또는 결과적 손해에 대해서도 책임지지 않습니다.',
            '이 서비스와 그 내용의 이용은 본인의 책임으로 하세요.',
          ],
        },
        {
          heading: '9. 준거법과 분쟁',
          body: [
            '본 약관의 해석과 적용에는 이 서비스의 서버가 있는 지역의 법률을 준거법으로 하고, 적용되는 국제 저작권법을 참조합니다.',
            '본 약관이나 이 서비스의 이용에서 생긴 분쟁은 먼저 협의로 해결합니다. 협의가 되지 않으면 관할 법원에 제기합니다.',
          ],
        },
        {
          heading: '10. 약관의 변경',
          body: [
            '이 서비스는 언제든 본 약관을 바꿀 권리를 보유하며, 변경 후에는 이 페이지 위쪽의 "최종 수정" 날짜를 갱신합니다. 이후의 이용은 변경된 약관에 동의한 것으로 봅니다. 동의하지 않으면 이용을 중단하세요.',
          ],
        },
        {
          heading: '11. 문의',
          body: [`이메일: ${SUPPORT_EMAIL}`],
        },
      ],
    };
  }

  return {
    label: 'TERMS OF SERVICE',
    title: 'Terms of Service',
    summary: `The rules for using ${site}, including account responsibilities, the copyright notice for game ROMs, and how to send a takedown request.`,
    updated: UPDATED,
    intro: `Please read these terms before using ${site}.`,
    sections: [
      {
        heading: '1. Acceptance of terms',
        body: [
          `Accessing or using ${site} ("the Service") constitutes agreement to these terms. If you do not agree, do not use the Service.`,
        ],
      },
      {
        heading: '2. Accounts',
        body: [
          'Registration requires an email address and a password. Use an email you are entitled to use, and keep your password secure.',
          'Activity under your account is your responsibility; do not share or transfer the account.',
          'Where an account is used to break these terms (spamming, or posting unlawful or infringing material), we may restrict or ban it.',
        ],
      },
      {
        heading: '3. Intellectual property and copyright notice',
        body: [
          '**Important copyright notice.** All game ROMs and their programs, graphics, music, sound, characters and trademarks are the intellectual property of their respective copyright holders. We do not own, and do not claim to own, any rights in any game content.',
          'We do not create or sell ROMs. The ROMs and game content reachable here **come from third parties**; the Service only provides the technical means to run them in a browser, and to download them at the user\u2019s request.',
          'That content is provided for **study, preservation and nostalgia** only. You are responsible for confirming that you have the right to access and use it.',
          'If you are a rights holder and believe content here infringes your rights, contact us at once. Every valid notice is taken seriously and the content will be removed promptly once verified.',
          'We reserve the right to remove any content on request from a rights holder or upon becoming aware of a possible infringement.',
        ],
      },
      {
        heading: '4. Our own content',
        body: [
          'We do not own the games. The interface design, program code, written copy, data organisation, site name and marks created by us belong to us and are protected by copyright and other laws; they may not be copied, redistributed, modified or used to create derivative works without written permission.',
        ],
      },
      {
        heading: '5. User responsibilities',
        bullets: [
          'Confirm that you have the right to access and use any game content.',
          'Do not use the Service for any unlawful or unauthorised purpose.',
          'Do not resell, redistribute or commercially exploit content reached through the Service.',
          'Do not post unlawful, infringing or abusive material, or other people’s private information, to the guestbook or comments.',
          'Comply with the laws applicable where you are.',
        ],
      },
      {
        heading: '6. Copyright infringement notices',
        body: [
          'We respect the intellectual property rights of others and expect our users to do the same.',
          'If your work has been copied in a way constituting copyright infringement and is reachable here, notify us by email and include, where possible: a description of the rights you hold, the name or location of the material, your contact details, and a good-faith statement.',
          'Every valid claim is investigated and appropriate action, including removal of content, is taken.',
          `Email: ${SUPPORT_EMAIL}`,
        ],
      },
      {
        heading: '7. Availability and changes to the Service',
        body: [
          'We aim to keep the Service available but do not guarantee uninterrupted operation. Maintenance, technical faults or circumstances beyond our control may make it temporarily unavailable.',
          'We reserve the right to modify, suspend or discontinue any part of the Service, or to limit features, at any time and without notice.',
        ],
      },
      {
        heading: '8. Disclaimer and limitation of liability',
        body: [
          'The Service is provided "as is" and "as available", without warranties, express or implied, as to its operation, availability or content.',
          'To the fullest extent permitted by law, we are not liable for any direct, indirect, incidental, punitive or consequential damages arising from use of the Service, including any content reached through it.',
          'Use of the Service and its content is at your own risk.',
        ],
      },
      {
        heading: '9. Governing law and disputes',
        body: [
          'These terms are governed by the laws of the jurisdiction in which our servers are located, together with applicable international copyright law.',
          'Disputes arising from these terms or from use of the Service should first be settled by negotiation; failing that, they shall be submitted to a court of competent jurisdiction.',
        ],
      },
      {
        heading: '10. Changes to these terms',
        body: [
          'We may revise these terms at any time, and will then update the "Last updated" date at the top of this page. Continued use of the Service constitutes acceptance of the revised terms; if you do not agree, cease using the Service.',
        ],
      },
      {
        heading: '11. Contact',
        body: [`Email: ${SUPPORT_EMAIL}`],
      },
    ],
  };
}

/** 取某一篇法务文档（按语言）。 */
export function legalDoc(kind: LegalKind, locale: Locale): LegalDoc {
  return kind === 'privacy' ? privacy(locale) : terms(locale);
}

/** 另一篇 —— 两页之间互链用。 */
export function otherLegalKind(kind: LegalKind): LegalKind {
  return kind === 'privacy' ? 'terms' : 'privacy';
}

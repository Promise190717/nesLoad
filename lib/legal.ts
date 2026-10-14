/**
 * 法务文案（隐私政策 / 服务条款）。
 *
 * **为什么不进 lib/i18n.ts**：那张表自己的注释写着「只放常驻在界面上的文案」——
 * 法务文档是**长文**，房间界面里一个字都不出现，只在 /privacy 和 /terms 两页上渲染。
 * 塞进去会给 MessageKey 加几十个键，把那张表（本来就 800 多行）冲得更难查；
 * 而且它们是**结构化**的（标题 + 章节 + 段落 + 列表），不是一句一个键的扁平文案，
 * 按结构存才能让页面直接 map 出来。
 *
 * 代价是这里**自成一套 i18n**（中英各写一份，不靠 MessageKey 做编译期对齐）。
 * 所以规矩是：**加一节、改一节，两份都要动** —— 页面上的目录是逐节渲染的，
 * 漏译不会报错，只会让另一种语言少一段。
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
 *    但第三方资源的具体域名 / 协议名（`fonts.googleapis.com`、`broker.emqx.io`、
 *    STUN、MQTT）同样不写，**只留服务商的名字**（Google Fonts / jsDelivr / Cloudflare）——
 *    那是隐私政策必须披露的「数据接收方」，去掉反而不合规；联机那条也要留，
 *    因为「对方能看到你的 IP」是真会影响读者决定的事。
 * 判断标准：**这句话对读者的决定有没有用**。
 *
 * ⚠️ **内容必须与本站实际行为一致**，别照抄别的站的模板：
 * 本站**没有广告、没有接第三方统计（GA 之类）、没有服务端记录游玩行为** ——
 * 抄一段「我们使用 cookie 分析你的浏览行为」就是不实陈述。
 * 涉及第三方的那一节（Google Fonts / jsDelivr / Cloudflare / 联机中继）是**逐条核对过
 * 代码**才写的：字体在 app/layout.tsx 的 <link>，内核在 lib/emulator.ts，
 * 人机验证在 lib/server/turnstile.ts，联机链路在 lib/netplay.ts。改那几处要回来同步。
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
export const SUPPORT_EMAIL = 'support@retrogamesonline.fun';

export type LegalKind = 'privacy' | 'terms';

export interface LegalSection {
  heading: string;
  /** 段落。按顺序渲染。 */
  body?: string[];
  /** 段落之后的列表项（前面自动加一个圆点）。 */
  bullets?: string[];
}

export interface LegalDoc {
  /** 页面上那行 font-pixel 小标签。**两语言都是英文** —— Press Start 2P 没有汉字字形。 */
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

/** 两份文档同一天改的（加账号系统的这一版），日期一起走。 */
const UPDATED = '2026-10-14';

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
            '本站使用 cookie 记录界面语言与登录状态，不影响其他网站，也不向第三方开放。',
            '本站**不使用广告 cookie，也未接入第三方统计分析工具**。',
          ],
        },
        {
          heading: '7. 第三方服务',
          body: [
            '本站不向第三方出售或出租任何信息。页面运行所需的部分资源由浏览器**直接**向第三方加载，对方因而可获取你的 IP 地址：',
          ],
          bullets: [
            'Google Fonts：页面使用的像素字体。',
            'jsDelivr：模拟器内核文件。',
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
          'Cookies are used to remember the interface language and to keep you signed in. They do not affect other sites and are not shared with third parties.',
          'We run **no advertising cookies and no third-party analytics**.',
        ],
      },
      {
        heading: '7. Third-party services',
        body: [
          'We do not sell or rent information to anyone. Some resources the page needs are loaded by your browser **directly** from third parties, which can therefore obtain your IP address:',
        ],
        bullets: [
          'Google Fonts: the pixel typeface used by the page.',
          'jsDelivr: the emulator core files.',
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
            '本站不制作、不出售任何 ROM。站内可访问的 ROM 与游戏内容**来自第三方**；本站仅提供使其在浏览器中运行的技术条件。',
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
          'We do not create or sell ROMs. The ROMs and game content reachable here **come from third parties**; the Service only provides the technical means to run them in a browser.',
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

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
 * ⚠️ **写给人看，不写给工程师看**（用户 2026-10-12 明确要求：「技术架构不要说得那么详细，
 * 什么 cookie 名称 D1 数据库那种」）。所以**不写**：
 *   · 我们自己那点实现细节 —— cookie 叫什么名字、用 localStorage 还是 IndexedDB、
 *     数据库和对象存储是什么产品、服务器上跑的是什么；
 *   · 第三方资源的具体域名 / 协议名 —— `fonts.googleapis.com`、`broker.emqx.io`、
 *     STUN、MQTT 这类。第三方**服务商的名字**（Google Fonts / jsDelivr / Cloudflare）
 *     要留 —— 那是隐私政策必须披露的「数据接收方」，去掉反而不合规；
 *     联机那条也留着，因为「对方能看到你的 IP」是用户真正需要知道的事。
 * 判断标准：**这句话对读者的决定有没有用**。「你的浏览器会保存这些内容」有用，
 * 「这些内容存在 localStorage 里」没用。
 *
 * ⚠️ **内容必须与本站实际行为一致**，别照抄别的站的模板：
 * 本站没有账号系统、没有广告、没有接第三方统计（GA 之类），也没有服务端记录
 * 用户游玩行为 —— 抄一段「我们使用 cookie 分析你的浏览行为」就是不实陈述。
 * 涉及第三方的那一节（Google Fonts / jsDelivr / Cloudflare / 联机中继）是**逐条核对过
 * 代码**才写的：字体在 app/layout.tsx 的 <link>，内核在 lib/emulator.ts，
 * 联机链路在 lib/netplay.ts。改那几处要回来同步。
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

const PRIVACY_UPDATED = '2026-10-12';
const TERMS_UPDATED = '2026-10-12';

function privacy(locale: Locale): LegalDoc {
  const site = SITE_NAME[locale];

  if (locale === 'zh') {
    return {
      label: 'PRIVACY POLICY',
      title: '隐私政策',
      summary: `${site}如何处理与你有关的信息：保存在浏览器里的内容、cookie、留言本，以及页面会加载的第三方服务。`,
      updated: PRIVACY_UPDATED,
      intro: `你在${site}玩游戏时，这里会（以及不会）如何处理你的信息。`,
      sections: [
        {
          heading: '1. 概述',
          body: [
            `${site}（下称「本站」）是一个在浏览器里运行复古游戏的免费站点。这里没有账号、不需要登录、不用填邮箱就能玩，我们也尽量少碰你的信息。`,
            '使用本站即表示你已阅读并理解本政策。',
          ],
        },
        {
          heading: '2. 我们接触到的信息',
          body: ['**只保存在你浏览器里的** —— 这些内容不会上传，我们看不到，也收不到：'],
          bullets: [
            '界面偏好：主题、吊灯、简洁模式、电视机大小，以及你自己改过的按键。',
            '存档、你自己拖进来的街机 BIOS 文件，以及从游戏库载入过的记录。',
            '清除浏览器数据（或使用无痕窗口）就能删掉它们，删掉之后无法恢复。',
          ],
        },
        {
          heading: '3. 你主动发给我们的',
          body: [
            '留言本：你写的内容会连同提交时间一起发到我们的服务器，并且**对所有人公开可见**。请不要在留言本里写个人信息。',
            '邮件：如果你给我们发邮件，我们会看到你的邮箱地址和邮件内容，只用于回复你。',
          ],
        },
        {
          heading: '4. 服务器可能记录的信息',
          body: [
            '和任何网站一样，承载本站的服务器（以及前面的防护服务）在处理请求时可能自动记录访问信息，例如 IP 地址和访问时间。这些记录由托管服务商按其自身政策处理；我们只在排查故障或阻止滥用时查看。',
          ],
        },
        {
          heading: '5. Cookie 与浏览器存储',
          body: [
            '本站只用一个 cookie 记住你选择的界面语言。它不是跟踪 cookie，也没有第三方读取它。',
            '登录后台时会另外收到一个会话 cookie（仅限管理员，与普通访客无关）。',
            '本站**不使用任何广告 cookie，也没有接入第三方统计分析工具**。',
          ],
        },
        {
          heading: '6. 我们如何使用这些信息',
          bullets: [
            '让界面保持你上次选择的样子（语言、主题、尺寸、按键）。',
            '显示并保存你提交的留言。',
            '排查故障、阻止滥用、维持服务基本可用。',
          ],
        },
        {
          heading: '7. 第三方服务',
          body: [
            '本站不向第三方出售或出租任何信息。但页面在运行时需要从第三方加载资源，这些请求由你的浏览器**直接**发出，对方因此能看到你的 IP 地址：',
          ],
          bullets: [
            'Google Fonts —— 页面使用的像素字体。',
            'jsDelivr —— NES / SFC 的模拟器内核文件。',
            'Cloudflare —— 本站的托管与存储，游戏文件和留言都存在这里。',
            '联机功能：使用「联机」时，你的浏览器会通过公共中继服务器与对方建立点对点连接。**这意味着对方能看到你的 IP 地址，你也能看到对方的** —— 这是点对点直连的固有特性，请只和你信任的人联机。',
            '我们无法控制上述第三方的隐私做法，建议阅读它们各自的隐私政策。',
          ],
        },
        {
          heading: '8. 数据安全',
          body: [
            '我们对服务器上的数据采取合理的技术保护措施。但请注意：互联网上没有任何一种传输或存储方式是绝对安全的，我们不能承诺「绝对安全」。',
            '留言本按设计就是公开的，请不要在其中提交任何敏感信息。',
          ],
        },
        {
          heading: '9. 你的选择与权利',
          bullets: [
            '清除浏览器数据即可删掉上面那些只存在本机的内容（偏好、按键、存档、BIOS、历史记录）。',
            '删除留言：如果你希望删除自己提交的留言，请用下面的邮箱联系我们，说明留言内容与大致时间。',
            '拦截第三方服务：用浏览器扩展或网络设置挡掉上面那几家，可以进一步减少对外请求，代价是字体、内核下载和联机功能可能受影响。',
          ],
        },
        {
          heading: '10. 儿童隐私',
          body: [
            '本站不面向 13 岁以下的儿童，也不会主动收集儿童的个人信息。如果你认为有儿童向我们提交了个人信息，请联系我们删除。',
          ],
        },
        {
          heading: '11. 第三方链接',
          body: [
            '本站可能包含指向第三方网站的链接。我们不对这些站点的内容或其隐私做法负责。',
          ],
        },
        {
          heading: '12. 本政策的变更',
          body: [
            '本政策可能随服务的变化而更新，更新后我们会改动本页顶部的「最后更新」日期。继续使用本站即视为接受更新后的版本。',
          ],
        },
        {
          heading: '13. 联系我们',
          body: [`对本政策或你的信息有任何疑问，请联系：${SUPPORT_EMAIL}`],
        },
      ],
    };
  }

  return {
    label: 'PRIVACY POLICY',
    title: 'Privacy Policy',
    summary: `How ${site} handles the little information it touches: what stays in your browser, cookies, the guestbook, and the third-party services the page loads.`,
    updated: PRIVACY_UPDATED,
    intro: `What ${site} does — and does not do — with information while you play.`,
    sections: [
      {
        heading: '1. Overview',
        body: [
          `${site} ("the Service") is a free retro game room that runs in your browser. There are no accounts, no sign-in and no email needed to play, and we try to touch as little of your information as possible.`,
          'By using the Service you acknowledge this policy.',
        ],
      },
      {
        heading: '2. Information we touch',
        body: ['**Kept in your own browser** — none of this is uploaded; we cannot see it or receive it:'],
        bullets: [
          'Preferences: theme, lamp, simple mode, TV size, and any key bindings you changed.',
          'Save states, an arcade BIOS file you dropped in, and the list of games you opened from the library.',
          'Clearing your browser data (or using a private window) deletes them for good.',
        ],
      },
      {
        heading: '3. Information you choose to send us',
        body: [
          'Guestbook: what you write is sent to our server together with the time you posted it, and it is **publicly visible to everyone**. Please do not put personal information in it.',
          'Email: if you email us, we see your address and your message, and use them only to reply.',
        ],
      },
      {
        heading: '4. Information the server may log',
        body: [
          'As with any website, the servers that deliver this one (and any protection service in front of them) may automatically log access information such as IP address and request time. That logging is handled by the hosting provider under its own policy; we look at it only to diagnose faults or stop abuse.',
        ],
      },
      {
        heading: '5. Cookies and browser storage',
        body: [
          'We use a single cookie to remember the interface language you picked. It is not a tracking cookie, and no third party reads it.',
          'Signing in to the admin area sets a separate session cookie (administrators only — irrelevant to visitors).',
          'We run **no advertising cookies and no third-party analytics**.',
        ],
      },
      {
        heading: '6. How we use this information',
        bullets: [
          'Keep the room looking the way you left it (language, theme, size, key bindings).',
          'Show and store the guestbook messages you post.',
          'Diagnose faults, prevent abuse and keep the Service running.',
        ],
      },
      {
        heading: '7. Third-party services',
        body: [
          'We do not sell or rent information to anyone. The page does, however, load resources from third parties — those requests come straight from your browser, so the recipient can see your IP address:',
        ],
        bullets: [
          'Google Fonts — the pixel typeface the page uses.',
          'jsDelivr — the NES / SNES emulator core files.',
          'Cloudflare — hosting and storage; game files and guestbook messages live here.',
          'Netplay: using "Netplay" connects your browser to a public relay server to set up a peer-to-peer connection with the other player. **This means they can see your IP address, and you can see theirs** — it is inherent to a direct connection between two players. Only play with people you trust.',
          'We do not control those third parties’ privacy practices; please read their own policies.',
        ],
      },
      {
        heading: '8. Data security',
        body: [
          'We apply reasonable technical measures to protect what is on our servers. But note that no method of transmission or storage over the internet is completely secure, and we cannot promise "absolute security".',
          'The guestbook is public by design — please do not post anything sensitive there.',
        ],
      },
      {
        heading: '9. Your choices and rights',
        bullets: [
          'Clearing your browser data removes everything that was kept on your own machine (preferences, keys, saves, BIOS, history).',
          'Remove a guestbook post: email us with the text and roughly when you posted it.',
          'Block third-party services: blocking the providers above (with an extension or your network settings) cuts the external requests down further, at the cost of fonts, core downloads and netplay.',
        ],
      },
      {
        heading: '10. Children’s privacy',
        body: [
          'The Service is not aimed at children under 13, and we do not knowingly collect their personal information. If you believe a child has sent us personal information, contact us and we will delete it.',
        ],
      },
      {
        heading: '11. Third-party links',
        body: [
          'The Service may link to third-party sites. We are not responsible for their content or their privacy practices.',
        ],
      },
      {
        heading: '12. Changes to this policy',
        body: [
          'This policy may change as the Service changes; when it does, we update the "Last updated" date at the top of this page. Continuing to use the Service means you accept the updated version.',
        ],
      },
      {
        heading: '13. Contact us',
        body: [`Questions about this policy or your information: ${SUPPORT_EMAIL}`],
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
      summary: `使用${site}需要遵守的规则，包括游戏 ROM 的版权声明与侵权通知方式。`,
      updated: TERMS_UPDATED,
      intro: `使用${site}之前，请先读完这份条款。`,
      sections: [
        {
          heading: '1. 条款的接受',
          body: [
            `访问或使用${site}（下称「本服务」）即表示你同意受本条款约束。如果你不同意，请不要使用本服务。`,
          ],
        },
        {
          heading: '2. 知识产权与版权声明',
          body: [
            '**重要版权声明**：所有游戏 ROM 及相关内容 —— 包括游戏程序、图形、音乐、音效、角色与商标 —— 均为其各自版权持有者的知识产权。本站**不拥有、也不主张拥有**任何游戏内容的任何权利。',
            '本站不制作、也不出售任何 ROM。站内可以访问到的 ROM 与游戏内容**来自第三方**（包括互联网上公开流传的资源，以及第三方提供的文件）；本站只是提供让它们在浏览器里跑起来的技术手段。',
            '这些内容仅供**学习、研究与怀旧**之用。你需要自行确认自己有权访问和使用相关游戏内容，并自行承担相应责任。',
            '如果你是版权持有者，认为本站上的内容侵犯了你的权利，请立即联系我们。我们会认真对待每一份有效的通知，并在核实后**及时移除相关内容**。',
            '我们保留在收到版权持有者请求、或意识到可能存在侵权时移除任何内容的权利。',
          ],
        },
        {
          heading: '3. 本站的原创内容',
          body: [
            '本站不拥有游戏内容，但本站自己做的部分 —— 界面设计、页面结构、原创文字说明、程序代码、数据组织方式、站名与标识 —— 归本站所有，受著作权及其他法律保护。未经书面许可，不得复制、分发、修改或用于衍生作品。',
          ],
        },
        {
          heading: '4. 用户责任与合规',
          bullets: [
            '你需自行确保有权访问和使用任何游戏内容。',
            '不得将本服务用于任何违法或未经授权的用途。',
            '不得转售、再分发或商业利用通过本站访问到的内容。',
            '不得向留言本提交违法、侵权、辱骂性的内容，或他人的隐私信息。',
            '应遵守你所在地区适用的法律法规。',
          ],
        },
        {
          heading: '5. 版权侵权通知',
          body: [
            '我们尊重他人的知识产权，也期望用户同样如此。',
            '如果你的作品被以构成侵权的方式复制，并可以在本站访问到，请通过邮件通知我们，并尽量提供：你所主张的权利说明、涉嫌侵权内容的名称或地址、你的联系方式，以及一份善意声明。',
            '我们会调查每一份有效的主张，并采取包括移除内容在内的适当措施。',
            `联系邮箱：${SUPPORT_EMAIL}`,
          ],
        },
        {
          heading: '6. 服务可用性与变更',
          body: [
            '我们会尽力维持服务可用，但不保证不间断。维护、技术故障，或我们无法控制的情况，都可能让服务暂时不可用。',
            '我们保留随时修改、暂停或终止本服务任何部分、以及限制某些功能的权利，且不另行通知。',
          ],
        },
        {
          heading: '7. 免责声明与责任限制',
          body: [
            '本服务按「现状」和「可用」状态提供，我们不对其运行、可用性或内容作出任何明示或默示的保证。',
            '在法律允许的最大范围内，本站不对因使用本服务（包括通过本服务访问到的任何内容）而产生的任何直接、间接、附带、惩罚性或后果性损害承担责任。',
            '使用本服务及其中内容的风险，由你自行承担。',
          ],
        },
        {
          heading: '8. 适用法律与争议',
          body: [
            '本条款的解释与适用，以本站服务器所在地法律为准，并参照适用的国际版权法律。',
            '因本条款或使用本服务产生的争议，应先通过协商解决；协商不成的，提交有管辖权的法院处理。',
          ],
        },
        {
          heading: '9. 条款的变更',
          body: [
            '我们保留随时修改本条款的权利。修改后我们会更新本页顶部的「最后更新」日期。继续使用本服务即表示你接受修改后的条款；如果你不同意，请停止使用。',
          ],
        },
        {
          heading: '10. 联系我们',
          body: [`邮箱：${SUPPORT_EMAIL}`],
        },
      ],
    };
  }

  return {
    label: 'TERMS OF SERVICE',
    title: 'Terms of Service',
    summary: `The rules for using ${site}, including the copyright notice for game ROMs and how to send a takedown request.`,
    updated: TERMS_UPDATED,
    intro: `Please read these terms before using ${site}.`,
    sections: [
      {
        heading: '1. Acceptance of terms',
        body: [
          `By accessing or using ${site} ("the Service") you agree to be bound by these terms. If you do not agree, please do not use the Service.`,
        ],
      },
      {
        heading: '2. Intellectual property and copyright notice',
        body: [
          '**Important copyright notice.** All game ROMs and related content — game programs, graphics, music, sound, characters and trademarks — are the intellectual property of their respective copyright holders. We do not own, and do not claim to own, any rights in any game content.',
          'We do not create or sell ROMs. The ROMs and game content reachable here **come from third parties** (material circulating publicly on the internet, and files supplied by third parties); the Service only provides the technical means to run them in a browser.',
          'That content is provided for **study, preservation and nostalgia** only. You are responsible for making sure you have the right to access and use it.',
          'If you are a copyright holder and believe content here infringes your rights, contact us right away. We treat every valid notice seriously and will remove the content promptly once verified.',
          'We reserve the right to remove any content on request from a rights holder, or when we become aware of a possible infringement.',
        ],
      },
      {
        heading: '3. Our own content',
        body: [
          'We do not own the games, but everything we made ourselves — interface design, page structure, original written copy, program code, data organisation, the site name and its marks — belongs to us and is protected by copyright and other laws. It may not be copied, redistributed, modified or used to create derivative works without written permission.',
        ],
      },
      {
        heading: '4. User responsibilities',
        bullets: [
          'Make sure you have the legal right to access and use any game content.',
          'Do not use the Service for any unlawful or unauthorised purpose.',
          'Do not resell, redistribute or commercially exploit content reached through the Service.',
          'Do not post unlawful, infringing or abusive material, or other people’s private information, to the guestbook.',
          'Comply with the laws that apply where you are.',
        ],
      },
      {
        heading: '5. Copyright infringement notices',
        body: [
          'We respect the intellectual property rights of others and expect our users to do the same.',
          'If your work has been copied in a way that constitutes copyright infringement and is reachable here, notify us by email, and include where possible: a description of the rights you hold, the location or name of the material, your contact details, and a good-faith statement.',
          'We investigate every valid claim and take appropriate action, including removing content.',
          `Email: ${SUPPORT_EMAIL}`,
        ],
      },
      {
        heading: '6. Availability and changes to the Service',
        body: [
          'We try to keep the Service available but do not guarantee it will be uninterrupted. Maintenance, technical faults, or circumstances beyond our control may take it down temporarily.',
          'We may modify, suspend or discontinue any part of the Service, or limit certain features, at any time and without notice.',
        ],
      },
      {
        heading: '7. Disclaimer and limitation of liability',
        body: [
          'The Service is provided "as is" and "as available", with no warranties, express or implied, as to its operation, availability or content.',
          'To the fullest extent permitted by law, we are not liable for any direct, indirect, incidental, punitive or consequential damages arising from use of the Service, including any content reached through it.',
          'You use the Service and its content at your own risk.',
        ],
      },
      {
        heading: '8. Governing law and disputes',
        body: [
          'These terms are governed by the laws of the jurisdiction where our servers are located, read together with applicable international copyright law.',
          'Disputes arising from these terms or from use of the Service should first be settled by negotiation; failing that, they belong before a court of competent jurisdiction.',
        ],
      },
      {
        heading: '9. Changes to these terms',
        body: [
          'We may revise these terms at any time. When we do, we update the "Last updated" date at the top of this page. Continuing to use the Service means you accept the revised terms; if you do not agree, please stop using it.',
        ],
      },
      {
        heading: '10. Contact',
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

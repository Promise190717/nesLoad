/**
 * 繁体中文（台湾）界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再塞一张进来会把它冲得更长。理由和 `lib/i18n.ja.ts` / `lib/i18n.ko.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `zh` 表逐键一致、顺序也一致**（558 个）。
 *    改文案时先改 `zh`，再回来对齐这一份；`en` 只用来对照意思不清的条目。
 *
 * ⚠️ **这是台湾用语，不是把简体逐字转成繁体**。机器转出来的「文件 / 网络 / 登录 / 视频 /
 *    设置 / 搜索 / 默认 / 菜单 / 支持」在台湾都不这样说，对应的是
 *    「檔案 / 網路 / 登入 / 影片 / 設定 / 搜尋 / 預設 / 選單 / 支援」。
 *    语感也照台湾走：少用「您」，多用「你」或干脆省略主语；「立即」写成「馬上」。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的繁体在数据库里
 *    （`game_texts` 的 `zh-TW` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` …），
 *    它们由 `translate()` 在运行时替换；漏掉一个不会报错，只会在页面上少一段字。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · 站点名 → 遊戲小屋（对应简体那份的「游戏小屋」）
 *   · console → 機種；developer → 開發商；series → 系列；game library → 遊戲庫
 *   · cartridge → 卡帶；room → 房間；host → 房主；guest → 加入者
 *   · netplay → 連線對戰；save → 存檔；key bindings → 按鍵設定
 *   · gamepad → 手把；guestbook → 留言板；account → 帳號
 *
 * ⚠️ 机种名用**台湾通行的写法**：FC（紅白機）/ SFC（超任）/ Game Boy / GBA / NDS /
 *    Mega Drive / 街機。简体那份的「世嘉 MD」在这边一律写 Mega Drive；
 *    标签位上取的是 `lib/consoles.ts` 的 `consoleLabel(type, locale)`，和文案同源。
 */

import type { MessageKey } from './i18n';

export const zhTW: Record<MessageKey, string> = {
  'meta.title': '{site} — 用瀏覽器線上玩復古遊戲：FC / SFC / GBA / 街機',
  'meta.description':
    '在瀏覽器裡直接玩復古遊戲：FC（紅白機）、SFC（超任）、GBA、Game Boy、Mega Drive、街機等十幾種機種都能跑。從線上遊戲庫挑一款，或載入自己的 ROM 檔案，打開就能玩、免安裝。',
  'meta.keywords':
    '復古遊戲, 線上遊戲庫, 線上玩 FC, FC 模擬器, 紅白機, NES 模擬器, SFC 模擬器, 超任, GBA 模擬器, GBA 遊戲, Game Boy Advance, Game Boy 模擬器, GBC 模擬器, NDS 模擬器, NDS 遊戲, 任天堂 DS, Mega Drive 模擬器, MD 遊戲, Game Gear, Master System, 32X, WonderSwan, Neo Geo Pocket, PlayStation 模擬器, PS1 模擬器, PSX 模擬器, 街機模擬器, 瀏覽器模擬器, 網頁模擬器, 免安裝, {site}',
  /* 下線頁面的 meta，標題不寫 {site}，模板會補 */
  'seo.room.title': '像素小屋 —— 用瀏覽器玩復古遊戲',
  'seo.room.description':
    '走進像素小屋：FC（紅白機）、SFC（超任）、GBA、Game Boy、Mega Drive 和街機遊戲都跑在電視上。從線上遊戲庫挑一款，或把自己的 ROM 檔案拖到螢幕上。',

  /* 登入頁（`/login`） */
  'seo.login.title': '登入',
  'seo.login.description': '登入帳號，在多台裝置之間同步存檔、遊戲歷史和收藏。',

  /* 首頁落地頁 */
  'home.hero.title': '用瀏覽器線上玩經典復古遊戲',
  /*
   * ⚠️「支援連線對戰」這半句和下面的 `home.faq.a6`、連線面板那顆 `netplay.open`
   *    （「連線對戰」）說的是同一件事，**措辭對齊** —— 三處都只說「能一起對戰」。
   */
  'home.hero.lead':
    '{site} 上可以線上玩 FC（紅白機）、SFC（超任）、GBA、Mega Drive、Game Boy 和街機等十幾種機種的遊戲，支援連線對戰。',
  'home.hero.play': '載入本機 ROM',
  'home.hero.browse': '瀏覽全部遊戲',
  'home.join.title': '和朋友一起玩',
  'home.join.hint': '輸入朋友分享的 4 位數房間代碼，就能加入連線。',
  'home.join.submit': '加入房間',
  'home.hero.or': '或',
  'home.search.label': '搜尋遊戲庫',
  'home.search.placeholder': '搜尋標題 / 開發商 / 系列',
  'home.search.submit': '搜尋',
  'home.consoles.title': '依機種瀏覽',
  'home.consoles.lead':
    'FC、SFC、GBA、Mega Drive、Game Boy、街機等十幾種機種 —— 點一個看看它有哪些遊戲。',
  'home.consoles.count': '{count} 款遊戲',
  'home.consoles.all': '全部機種',
  'home.latest.title': '最新收錄',
  'home.latest.lead': '最近新上架的幾款。',
  'home.latest.viewAll': '全部遊戲',
  'home.developers.title': '依開發商瀏覽',
  'home.developers.lead': '這幾家開發商在遊戲庫裡的遊戲最多。',
  'home.developers.viewAll': '全部開發商',
  'home.empty': '遊戲庫現在還是空的 —— 進小屋把 ROM 拖到電視上就能開玩。',
  /* 折疊問答六條（只寫真的做到了的事） */
  'home.faq.title': '常見問題',
  'home.faq.q1': '免費嗎？',
  'home.faq.a1':
    '完全免費，任何遊戲都可以隨便玩。登入之後可以雲端儲存遊戲紀錄和存檔。',
  'home.faq.q2': '要裝什麼東西嗎？',
  'home.faq.a2': '不用，點一下遊戲就能在網頁上線上玩。',
  'home.faq.q3': '手機上能玩嗎？',
  'home.faq.a3': '支援，手機和平板上直接在瀏覽器裡玩。',
  'home.faq.q4': '能下載 ROM 嗎？',
  'home.faq.a4': '能，每個遊戲頁上都有下載按鈕。請只下載你有權使用的 ROM 檔案。',
  'home.faq.q5': '能和朋友一起玩嗎？',
  'home.faq.a5': '當然！快找朋友一起，開個房間連線對戰吧。',
  'home.faq.q6': '支援手把嗎？',
  'home.faq.a6':
    '支援。用 USB 或藍牙接上手把，瀏覽器辨識到之後模擬器核心就會直接讀到；按鍵對應以各核心的預設值為準。手機上用螢幕上的虛擬按鍵。',

  'seo.heading': '用瀏覽器玩復古遊戲',
  'seo.intro':
    '{site} 是一個線上復古遊戲廳。FC（紅白機）、SFC（超任）、GBA、Game Boy、Mega Drive 和街機等十幾種機種的遊戲直接跑在瀏覽器裡 —— 由本機模擬，核心是編譯成 WebAssembly 的 RetroArch。',
  'seo.howTo': '從線上遊戲庫挑一款，或把自己的 ROM 檔案拖到電視上。不需安裝。',

  /* 遊戲列表 / 詳情 / 下載三頁的 SEO 文案 */
  'seo.games.title': '全部遊戲 —— 線上玩 FC / SFC / GBA / 街機',
  'seo.games.description':
    '線上遊戲庫共 {count} 款復古遊戲，全部都可以直接在瀏覽器裡玩：FC（紅白機）、SFC（超任）、GBA、Game Boy、Mega Drive、街機等十幾種機種。點開任何一款看詳情、直接開玩，或下載 ROM 檔案。',
  'seo.games.search.title': '「{keyword}」的搜尋結果',
  'seo.games.search.description':
    '線上遊戲庫裡符合「{keyword}」的遊戲共 {count} 款。可以直接在瀏覽器裡玩，也可以下載 ROM 檔案。',
  'seo.games.console.title': '{console} 遊戲 —— 線上玩',
  'seo.games.console.description':
    '線上遊戲庫裡的 {count} 款 {console} 遊戲，全部都可以直接在瀏覽器裡玩，也可以下載 ROM 檔案。',
  'seo.game.title': '{title} —— 線上玩 {console} 遊戲',
  'seo.game.description':
    '直接在瀏覽器裡玩《{title}》（{console}）—— 免費、免安裝，也可以下載 ROM 檔案。',
  'seo.gameDownload.title': '下載《{title}》ROM（{console}）',
  'seo.gameDownload.description':
    '一鍵下載《{title}》（{console}）的 ROM 檔案，不需註冊。也可以直接在瀏覽器裡玩。',
  'seo.developers.title': '遊戲開發商 —— 線上玩他們做的 FC / SFC / GBA / 街機遊戲',
  'seo.developers.description':
    '線上遊戲庫背後的 {count} 家開發商。點進去看看這家公司在我們庫裡的全部遊戲。',
  'seo.developer.title': '{name} —— 這家開發商的遊戲',
  'seo.developer.description':
    '{name} 在線上遊戲庫裡的全部遊戲（{count} 款），可以直接在瀏覽器裡玩，也可以下載 ROM 檔案。',

  /* 機種兩頁：`consoles` 是列表頁、`console` 是單頁 */
  'seo.consoles.title': '依機種瀏覽 —— 線上玩 FC / SFC / GBA / 街機遊戲',
  'seo.consoles.description':
    '線上遊戲庫裡的每個機種（共 {count} 款遊戲）。挑一個機種，看看它名下的全部遊戲，直接在瀏覽器裡開玩。',
  'seo.console.title': '{name} 遊戲 —— 線上玩',
  'seo.console.description':
    '{name} 在線上遊戲庫裡的全部遊戲（{count} 款），可以直接在瀏覽器裡玩，也可以下載 ROM 檔案。',

  'theme.toDark': '切換到夜間模式',
  'theme.toLight': '切換到日間模式',
  'lamp.turnOn': '開燈',
  'lamp.turnOff': '關燈',
  'simple.enter': '簡潔模式：只保留背景牆、電視機、桌子和地板',
  'simple.exit': '退出簡潔模式',
  'tvSize.open': '電視大小',
  'tvSize.opt.large': '大',
  'tvSize.opt.medium': '中',
  'tvSize.opt.small': '小',
  'tvSize.pick': '把電視大小設為「{level}」',
  'locale.label': '語言',
  /* 語言提示彈窗：正文跟當前頁面語言，按鈕跟目標語言 */
  'localePrompt.title': '目前頁面是繁體中文',
  'localePrompt.body': '你的瀏覽器比較習慣另一種語言，要切換過去嗎？',
  'localePrompt.keep': '保持繁體中文',
  'fullscreen.enter': '遊戲畫面全螢幕',
  'fullscreen.exit': '退出全螢幕',

  'screen.pick': '點一下選擇 ROM 檔案，或把檔案拖到這裡',
  'screen.srLabel': '選擇要執行的 ROM 檔案',
  'screen.tapLoad': '點一下從本機載入',
  'screen.orLibrary': '或從線上遊戲庫啟動',
  'screen.release': '放開就載入',
  'screen.mobileLibrary': '從遊戲庫載入遊戲',
  'screen.mobileTap': '點螢幕開啟遊戲庫',
  'screen.waitingHost': '等待房主畫面',
  'screen.paused': '已暫停',
  'screen.resumeOnPanel': '按機身面板的繼續鍵',
  'screen.resumeInPanel': '點右側面板的「繼續」',
  'screen.waitHostResume': '等待房主繼續',

  'panel.resume': '繼續',
  'panel.pause': '暫停',
  'panel.save': '存檔',
  'panel.load': '讀檔',
  'panel.reset': '重新載入',
  'panel.eject': '退出',

  'volume.down': '音量降低一級',
  'volume.up': '音量提高一級',
  'volume.set': '把音量設為第 {level} 級（共 {max} 級）',

  /* 存檔換成電池存檔（一款一份），文案不提「狀態 / 份數」 */
  'saves.title': '讀檔',
  'saves.load': '載入',
  'saves.close': '關閉',
  'saves.groupLocal': '本機',
  'saves.groupCloud': '雲端（帳號）',
  'saves.deleteCloud': '刪除這份雲端存檔',
  'saves.delete': '刪除',
  'saves.loginHint': '登入後就能用雲端存檔，換一台裝置也能接著玩。',
  'saves.login': '去登入',
  'saves.loading': '讀取中…',
  'saves.downloading': '正在下載雲端存檔…',
  'saves.restoring': '正在還原遊戲進度…',
  'saves.empty': '還沒有存檔',
  'library.removeLabel': '移除 {name}',

  'legend.moves': '移動',
  'legend.open': '按鍵說明',
  'legend.title': '按鍵說明',
  'legend.close': '關閉',
  'legend.needZip': '格式  FBNeo 只吃 .zip —— 這個是 {ext}，重新打包一下（或換一個 .zip 版）',
  'play.needZip': '格式  這個 ROM 是 {ext} 壓縮檔，解不開 —— 換成 .zip 或未壓縮的 ROM 再試',
  'legend.needDisc':
    '格式  光碟映像檔是多個檔案的（.cue + .bin），本站只吃單一檔案 —— 換 .pbp / .iso / .chd 的版本',
  'play.needDisc':
    '格式  這是一張多檔案光碟映像（.cue + .bin），本站只吃單一檔案 —— 換成 .pbp / .iso / .chd 再試',
  'legend.needBios':
    'BIOS  這款看起來像 Neo Geo 遊戲（格鬥天王 / 越南大戰 / 侍魂…），需要 neogeo.zip —— 把它拖進頁面就裝上了。CPS1 / CPS2 那類不需要。',
  'legend.gamepad': '手把  插上就能用；連線時房主和加入者各插一支也可以。',

  'netplay.title': '連線',
  'netplay.open': '連線對戰',
  'netplay.close': '關閉',
  'netplay.create': '建立房間',
  'netplay.or': '或',
  'netplay.join': '加入',
  // 保持 ASCII：輸入框走 font-pixel，該字模沒有中日韓字形
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint': '雙方都能連到公共中繼即可，請確保在同一個區域網路。',
  'netplay.roomCode': '房間代碼',
  /* 鏈路選擇器：「區域網路」= 只 STUN；「網際網路」= 額外帶 TURN 兜底（仍是直連優先） */
  'netplay.modeLan': '區域網路',
  'netplay.modeWan': '網際網路',
  'netplay.wanDev': '網際網路連線對戰正在開發中。',
  'netplay.quality': '輸出畫質',
  'netplay.qualitySmooth': '流暢',
  'netplay.qualityBalanced': '均衡',
  'netplay.qualitySharp': '清晰',
  'netplay.qualityHint': '輸出畫質會影響流暢度，建議使用均衡。',
  'netplay.copy': '複製',
  'netplay.copied': '已複製',
  'netplay.share': '分享',
  'netplay.shareCopied': '連結已複製',
  'netplay.inviteTitle': '房間邀請',
  'netplay.inviteBody': '加入房間 {code}？',
  'netplay.inviteJoin': '加入',
  'netplay.inviteCancel': '取消',
  'netplay.connected': '已連線',
  'netplay.waiting': '等待對方加入',
  'netplay.joining': '正在加入房間…',
  'netplay.waitingGame': '已連線，等房主插上卡帶',
  'netplay.hostPlaying': '房主正在玩',
  'netplay.paused': '已暫停',
  'netplay.toastHost': '已連上 · 對方進來了 · 你是 1P',
  'netplay.toastGuest': '已連上房主 · 你是 2P',
  'netplay.toastHostLeft': '房主已離開 · 房間已關閉',
  'netplay.toastGuestLeft': '玩家二已離開房間',
  'netplay.youAreHost':
    '你是 1P。插上卡帶後畫面會自動推送給對方。鍵位就是你自己的那一套，目前的值請看「按鍵說明」。',
  'netplay.youAreGuest':
    '你是 2P。不需要卡帶，房主會把畫面推送過來；你的鍵盤和手把都會送到房主那邊。鍵盤用的是你自己那套鍵（玩家 1 組），手把插上就能直接用 —— 目前的值請看「按鍵說明」。',
  'netplay.leave': '離開房間',
  'netplay.closeRoom': '關閉房間',
  'netplay.badCode': '房間代碼不對，應該是 4 位。',
  'netplay.errInsecure':
    '連線需要 HTTPS 或 localhost。目前頁面是一般的 http，瀏覽器不提供它依賴的加密介面。',
  'netplay.errNoDirect':
    '雙方都連上中繼了，但建立不起直連 —— 通常是 NAT 或防火牆。同一個區域網路成功率最高。',
  'netplay.errPassword': '房間代碼不符。',
  'netplay.errHandshake': '握手逾時，對方可能已經離開了。',
  'netplay.errHostLeft': '房主已離開房間，房間已關閉。',
  'netplay.errNoRoom': '沒等到房主的回應。房間碼可能不對，或者房主還沒開房。',
  'netplay.errRoomFull': '房間已滿，這個遊戲只支援 1 對 1。',
  'netplay.errUnknown': '連不上對方。詳細原因在瀏覽器主控台裡。',

  // `/play`（連線遊戲頁）。短，連線詞彙一律復用上面的 netplay.*
  'seo.play.title': '開玩 —— 載入遊戲、線上連線',
  'seo.play.description':
    '一個螢幕就能開局：一個人直接玩，也可以開一間 1v1 房間把房間代碼分享出去。支援 FC、SFC、GB、GBA、MD 與街機。',
  'play.modeSolo': '單人',
  'play.start': '開始',
  'play.confirmStart': '確定並開始',
  'play.confirm': '確定',
  'play.qualityIntro': '依網路狀況選擇連線畫面的輸出畫質。',
  'play.qualityHint.smooth': '30 fps · 頻寬佔用較低，適合網路較慢時使用。',
  'play.qualityHint.balanced': '最高 720p / 60 fps · 兼顧畫面清晰度與流暢度。',
  'play.qualityHint.sharp':
    '最高 60 fps · 優先保留原始解析度與像素細節，適合高速網路；網路不夠時可能會降低影格率。',
  'play.qualityConfirmHint': '確定後就連線到房間。房主會自動載入遊戲，加入者接收房主的畫面。',
  'play.connecting': '正在連線…',
  'play.confirmJoin': '確定並加入',
  'play.cancel': '取消',
  'play.screenSize': '螢幕大小',
  'play.controlsTitle': '遊戲控制',
  'play.netplayKeysHint': '連線時，兩位玩家各自使用自己裝置上的玩家 1 鍵位。',
  'play.cancelled': '已取消載入',
  'play.retry': '重新載入',
  'play.retryJoin': '重新加入',
  'play.saved': '儲存成功',
  'play.localSaving': '本機儲存…',
  'play.uploading': '上傳雲端…',
  'play.cloudFailed': '雲端同步失敗',
  /* 401 專用：本機那份是好的，登入之後雲端同步就正常 */
  'play.saveNoLogin': '未登入，未上傳雲端',
  'play.tooLarge': '存檔過大',
  'play.theme': '模式',
  'play.saveFailed': '存檔失敗，請重試',
  'play.loadFailed': '讀檔失敗，請重試',
  'play.leftRoom': '你已離開房間',
  'play.latency': '延遲',
  'play.measuringLatency': '測量中…',
  'play.downloading': '正在下載遊戲檔案…',
  'play.booting': '正在啟動核心…',
  'play.loadFail': '這款遊戲載入失敗。',
  'play.romIncomplete': '遊戲檔案不完整，請重新載入。',
  'play.notFound': '找不到這個遊戲。',
  'play.fullscreen': '全螢幕',
  'play.volume': '音量',
  'play.edit': '編輯',
  /* 收起後只有 40px 寬、直排，必須短 */
  'play.hideSidebar': '收合',
  'play.showSidebar': '展開',
  'play.hint': 'Esc 退出全螢幕，其餘操作都在右側。',
  'play.leaveTitle': '遊戲正在進行中',
  'play.leaveBody': '返回會結束目前這一局，進度不會自動儲存。',
  'play.leaveStay': '繼續遊戲',
  'play.leaveGo': '離開並返回',
  'gamesPage.playOnline': '連線遊戲',

  // 按鈕 tooltip 叫「按鍵設定」，面板標題仍叫「自訂按鍵」—— 刻意不同名
  'keybind.title': '自訂按鍵',
  'keybind.open': '按鍵設定',
  'keybind.close': '關閉',
  'keybind.p1': '玩家 1',
  'keybind.p2': '玩家 2',
  'keybind.mine': '你的鍵位',
  'keybind.pressKey': '按下新按鍵…',
  'keybind.btnStart': '開始',
  'keybind.btnCoin': '投幣',
  'keybind.reset': '恢復預設',
  'keybind.reload': '重新載入卡帶',
  'keybind.reloading': '重新載入中…',
  'keybind.unsupported': '這個按鍵不能用，換一個。',
  'keybind.conflictSame': '「{pressed}」已經綁給「{button}」鈕了，換一個鍵。',
  'keybind.conflictOther': '「{pressed}」已經綁給玩家 {player} 的「{button}」鈕了，換一個鍵。',
  'keybind.hint': '鍵盤對應只在插卡帶時讀一次，改完要重新載入卡帶才會生效。兩位玩家不能共用同一個鍵。',
  'keybind.soloHint': '鍵盤對應只在插卡帶時讀一次，改完要重新載入卡帶才會生效。',
  'keybind.hostHint':
    '你是房主：玩家 1 是你自己的鍵，玩家 2 是用來把加入者的輸入注入本機的。兩組不能共用同一個鍵，否則注入會連帶驅動你的玩家 1。改完要重新載入卡帶。',
  'keybind.guestHint':
    '你是加入者，用你自己那一套（玩家 1 組）—— 連線時兩人在各自的鍵盤前，不會搶鍵。改完立刻生效，不用重新載入卡帶。',
  'keybind.guestLocalHint':
    '你是加入者，本機還跑著一款自己的卡帶。你按的就是「玩家 1」那一組：本機那款照它讀鍵盤，改完要重新載入卡帶；送到房主的也是它，那部分立刻生效。',

  'games.open': '遊戲庫',
  'games.title': '遊戲庫',
  'games.close': '關閉',
  'games.empty': '遊戲庫還是空的 —— 還沒上傳過遊戲',
  'games.loading': '載入中…',
  'games.loadingRom': '正在載入 {name}…',
  'games.cancel': '取消',
  'games.failed': '遊戲庫讀取失敗',
  'games.tabLibrary': '遊戲庫',
  'games.tabHistory': '歷史',
  'games.historyEmpty': '還沒從遊戲庫載入過遊戲',
  'games.historyLoad': '{name}\n點一下重新載入',
  'games.tabFavorites': '收藏',
  'games.favorite': '收藏「{name}」',
  'games.unfavorite': '取消收藏「{name}」',
  'games.favoritesEmpty': '還沒有收藏 —— 點封面左上角那顆星就能收藏。',
  'games.favoritesSignInBefore': '登入後就能把喜歡的遊戲收進收藏 —— 點這裡',
  'games.favoritesSignInLink': '登入',
  'games.favoritesSignInAfter': '，或在右上角點那顆帳號鈕。',

  /* 使用者面板 */
  'user.title': '帳號',
  'user.close': '關閉',
  'user.open': '帳號 —— 登入 / 註冊',
  'user.openSignedIn': '帳號：{name}',
  'user.tabLogin': '登入',
  'user.tabRegister': '註冊',
  'user.username': '使用者名稱',
  'user.password': '密碼',
  'user.usernameHint': '3–20 個字元：字母、數字、_ - .',
  'user.emailLabel': '電子郵件',
  'user.emailHint': '用電子郵件註冊，不支援別名和臨時信箱。',
  'user.passwordHint': '至少 6 個字元，不能有空格。',
  'user.signIn': '登入',
  'user.signUp': '註冊',
  'user.signingIn': '登入中…',
  'user.signingUp': '註冊中…',
  'user.signOut': '登出',
  'user.signedInAs': '已登入：{name}',
  'user.cloudHint':
    '你的遊戲歷史、存檔和收藏都存在帳號裡 —— 從線上遊戲庫打開任何一款，都會自動同步。',
  'user.formLead': '登入之後，存檔、遊戲歷史和收藏都存到雲端，隨時隨地馬上開玩！',
  'user.consentLogin': '登入即表示你同意我們的',
  'user.consentRegister': '註冊即表示你同意我們的',
  'user.consentMiddle': '和',
  'user.consentAfter': '。',

  'user.error.failed': '發生錯誤，請重試。',
  'user.error.missingCredentials': '請填寫使用者名稱和密碼。',
  'user.error.usernameInvalid': '使用者名稱只能用字母、數字和 _ - .',
  'user.error.usernameTooShort': '使用者名稱太短了（至少 3 個字元）。',
  'user.error.usernameTooLong': '使用者名稱太長了（最多 20 個字元）。',
  'user.error.usernameTaken': '這個使用者名稱已經被用掉了，換一個。',
  'user.error.emailInvalid': '電子郵件格式不對，請檢查一下。',
  'user.error.emailAlias': '不支援別名信箱（例如 name+tag@… 或 Gmail 加點那種）。',
  'user.error.emailTemp': '不支援臨時信箱註冊，請用你常用的電子郵件。',
  'user.error.passwordInvalid': '請填寫密碼。',
  'user.error.passwordTooShort': '密碼太短了（至少 6 個字元）。',
  'user.error.passwordTooLong': '密碼太長了（最多 72 個字元）。',
  'user.error.passwordHasSpace': '密碼不能包含空格。',
  'user.error.invalidCredentials': '使用者名稱或密碼不對。',
  'user.error.banned': '這個帳號已被停權。',
  'user.error.captchaRequired': '請先完成人機驗證。',
  'user.error.captchaFailed': '人機驗證沒通過，請重試。',

  'login.lead':
    '登入之後，存檔、遊戲歷史和收藏都存到雲端，隨時隨地馬上開玩！還沒有帳號？去註冊。',

  /* 會員中心。注意 `account.error.*` 和 `user.error.*` 是兩套 */
  'account.title': '會員中心',
  'account.loading': '載入中…',
  'account.failed': '發生錯誤，請重試。',
  'account.since': '註冊於 {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': '一般會員',
  'account.vipUntil': '會員效期至 {time}',
  'account.vipExpired': '會員已於 {time} 到期',
  'account.tabFavorites': '收藏',
  'account.tabHistory': '歷史',
  'account.tabSaves': '存檔',
  'account.tabProfile': '資料',
  'account.tabPassword': '密碼',
  'account.favoritesLoading': '正在取得收藏…',
  'account.historyLoading': '正在取得歷史…',
  'account.savesLoading': '正在取得存檔…',

  'account.favoritesEmpty': '還沒有收藏 —— 在房間的遊戲庫裡點封面左上角那顆星就能收藏。',
  'account.unfavorite': '取消收藏「{name}」',

  /* ---- 歷史 ---- */
  'account.historyEmpty': '還沒有遊玩紀錄 —— 從線上遊戲庫點開過的遊戲會出現在這裡。',
  'account.historyCount': '最近玩過 {count} 款',
  'account.historyDeleted': '已從歷史中移除。',
  'account.clearHistory': '全部清空',
  'account.confirmClearHistory': '確定清空？',
  'account.historyCleared': '歷史已清空。',
  'account.historyHint': '歷史保留最近玩過的 {max} 款，重玩較早的一款會把它推回最前面。',

  'account.savesEmpty': '還沒有雲端存檔。',
  'account.savesCount': '共 {count} 份存檔',
  'account.savesGroupCount': '{count} 份存檔',
  'account.viewGame': '查看《{name}》',
  'account.savesHint': '每款遊戲只保留一份存檔，再存會覆蓋前一份。本機和雲端一致。',
  'account.saveDeleted': '存檔已刪除。',
  'account.clearSaves': '全部清空',
  'account.confirmClearSaves': '確定清空？',
  'account.savesCleared': '已清空 {count} 份存檔。',
  'account.delete': '刪除',
  'account.confirmDelete': '確定刪除？',

  /* ---- 資料 ---- */
  'account.avatar': '大頭貼',
  'account.chooseImage': '選擇圖片',
  'account.clearAvatar': '移除大頭貼',
  'account.uploading': '上傳中…',
  'account.avatarSaved': '大頭貼已更新。',
  'account.avatarCleared': '大頭貼已移除。',
  'account.avatarHint': 'PNG / JPEG / WebP / GIF，不超過 2 MB。',
  'account.gender': '性別',
  'account.genderNone': '未知',
  'account.genderMale': '男',
  'account.genderFemale': '女',
  'account.genderSaved': '已儲存。',
  'account.genderHint': '選填 —— 只有你自己看得到。',
  'account.passwordTabHint': '改完之後這台裝置仍然保持登入，不用重新登入。',
  'account.password': '密碼',
  'account.oldPassword': '目前密碼',
  'account.newPassword': '新密碼',
  'account.confirmPassword': '再次輸入新密碼',
  'account.savePassword': '變更密碼',
  'account.saving': '儲存中…',
  'account.passwordSaved': '密碼已變更。',
  'account.passwordHint':
    '改完之後這台裝置仍然保持登入。其他裝置要等它自己的登入狀態過期才會失效。',

  'account.error.missingOld': '請填寫目前密碼。',
  'account.error.wrongPassword': '目前密碼不對。',
  'account.error.passwordTooShort': '新密碼太短了（至少 6 個字元）。',
  'account.error.passwordTooLong': '新密碼太長了（最多 72 個字元）。',
  'account.error.passwordHasSpace': '新密碼不能包含空格。',
  'account.error.mismatch': '兩次輸入的新密碼不一樣。',
  'account.error.avatarMissing': '請先選一張圖片。',
  'account.error.avatarTooLarge': '這張圖太大了（最多 2 MB）。',
  'account.error.avatarType': '不支援的格式 —— 請用 PNG / JPEG / WebP / GIF。',

  'games.filterAll': '全部',
  'games.searchPlaceholder': '搜尋標題 / 開發商 / 系列',
  'games.search': '搜尋',
  'games.noMatch': '沒有符合的遊戲。',
  'games.prev': '上一頁',
  'games.next': '下一頁',
  'games.remoteSlow': '提示：線上遊戲庫的檔案放在境外伺服器，載入可能會慢一點。',

  'note.text': '願我們都能找回童年時的開心.. \n 更多彩蛋等你發現哦!',
  'note.open': '讀一讀地上那張紙',
  'note.title': '一張紙',
  'note.close': '關閉',
  'window.cycle': '換一換窗外的季節',
  /* 牆上那幅掛畫：點開按鈕 + 每幅的畫名與作者 */
  'painting.open': '靠近看看這幅畫',
  'painting.close': '關閉',
  'painting.title.sunflowers': '向日葵',
  'painting.artist.sunflowers': '文森·梵谷',
  'painting.title.monaLisa': '蒙娜麗莎',
  'painting.artist.monaLisa': '李奧納多·達文西',
  'painting.title.starryNight': '星夜',
  'painting.artist.starryNight': '文森·梵谷',
  'painting.title.scream': '吶喊',
  'painting.artist.scream': '愛德華·孟克',
  'painting.title.pearl': '戴珍珠耳環的少女',
  'painting.artist.pearl': '約翰尼斯·維梅爾',
  'painting.title.wave': '神奈川沖浪裏',
  'painting.artist.wave': '葛飾北齋',
  /* 第七幅是使用者自己的照片，說法由他指定 —— 別改 */
  'painting.title.unknown': '不知從哪來的不知名畫作',
  'painting.artist.unknown': '佚名',
  'mp4.play': '在 MP4 上放首歌',
  'mp4.pause': '暫停 MP4',

  /* 逗貓棒（彩蛋的開關）和七隻貓的品種名 */
  'cat.wand': '搖一搖逗貓棒',
  'cat.ragdoll': '書後面探出一隻布偶貓',
  'cat.siamese': '書後面探出一隻暹羅貓',
  'cat.tabby': '書後面探出一隻虎斑貓',
  'cat.orange': '書後面探出一隻橘貓',
  'cat.american': '書後面探出一隻美國短毛貓',
  'cat.tuxedo': '書後面探出一隻乳牛貓',
  'cat.calico': '書後面探出一隻三花貓',

  'feedback.open': '翻一翻地上那本留言板',
  'feedback.title': '留言板',
  'feedback.close': '關閉',
  'feedback.placeholder': '寫句留言 —— 建議、想加的遊戲，都可以…',
  'feedback.submit': '發布',
  'feedback.submitting': '送出中…',
  'feedback.ok': '已發布，謝謝！',
  'feedback.required': '先寫點什麼吧。',
  'feedback.failed': '送出失敗，再試一次。',
  'feedback.loading': '載入中…',
  'feedback.empty': '還沒有留言 —— 第一個寫點什麼吧。',
  'feedback.retry': '重試',
  'feedback.prev': '上一頁',
  'feedback.next': '下一頁',
  'feedback.page': '第 {n} 頁',
  'feedback.resolved': '已解決',
  'feedback.unresolved': '未解決',

  /* 隱私權政策 / 服務條款，正文在 lib/legal.ts */
  'legal.privacy': '隱私權政策',
  'legal.terms': '服務條款',
  'legal.updated': '最後更新 {date}',
  'legal.contact': '聯絡我們：',

  'tour.title': '操作導覽',
  'tour.skip': '跳過',
  'tour.back': '上一步',
  'tour.next': '下一步',
  'tour.done': '開始玩',
  'tour.replay': '重看操作導覽',
  'tour.screen.title': '先來玩一款遊戲',
  'tour.screen.body':
    '把 ROM 檔案（.nes / .sfc / .gba / .md / .gb 等）或街機 .zip 拖到電視上就能玩，也可以直接點螢幕挑檔案。',
  'tour.rail.title': '右邊這一排開關',
  'tour.rail.body':
    '分成三組，從上到下。外觀：主題（夜間 / 日間）、語言（中文 / English / 日本語 / 한국어）、全螢幕（全螢幕的是螢幕本身）、簡潔模式（只留背景牆、電視機、桌子和地板）、電視大小（點開是大 / 中 / 小三級，桌子會跟著變長）。遊戲：連線、自訂按鍵。說明：按鍵說明、留言板。',

  'topLinks.label': '站台頁面',
  'topLinks.games': '遊戲列表',

  'menu.open': '開啟選單',
  'menu.close': '關閉選單',
  'menu.theme': '主題',
  'menu.simple': '簡潔模式',

  // 「離開房間」確認：房間那條「遊戲列表」在房間裡有活時先彈這層
  'leave.title': '確定要離開嗎？',
  'leave.bodyGame': '正在進行的遊戲會中斷，進度不會儲存。',
  'leave.bodyNetplay': '會離開目前的連線房間，對方會斷線。',
  'leave.stay': '留下',
  'leave.confirm': '離開',

  'gamesPage.heading': '全部遊戲',
  'gamesPage.intro':
    '線上遊戲庫共 {count} 款：FC（紅白機）、SFC（超任）、GBA、Game Boy、Mega Drive、街機等十幾種機種。點封面看詳情，也可以直接開玩。',
  'gamesPage.empty': '遊戲庫現在還是空的。',
  'gamesPage.introConsole': '遊戲庫裡共 {count} 款 {console} 遊戲。點封面看詳情，也可以直接開玩。',
  'gamesPage.filterLabel': '依機種篩選',
  'gamesPage.filterAll': '全部',
  'gamesPage.consoleEmpty': '遊戲庫裡還沒有 {console} 遊戲。',
  'gamesPage.searchLabel': '搜尋遊戲庫',
  'gamesPage.searchPlaceholder': '搜尋標題 / 開發商 / 系列',
  'gamesPage.searchSubmit': '搜尋',
  'gamesPage.searchLoading': '搜尋中…',
  'gamesPage.searchClear': '清除搜尋',
  'gamesPage.searchResults': '「{keyword}」共 {count} 個結果。',
  'gamesPage.searchEmpty': '找不到符合「{keyword}」的遊戲，換個短一點的詞，或直接搜尋遊戲名稱。',
  'gamesPage.prev': '上一頁',
  'gamesPage.next': '下一頁',
  'gamesPage.backHome': '回到首頁',
  'gamesPage.backToGames': '全部遊戲',
  'common.back': '返回',
  'common.home': '首頁',
  'gamesPage.play': '開始遊戲',
  'gamesPage.download': '下載 ROM',
  'gamesPage.share': '分享遊戲',
  'gamesPage.shareCopied': '已複製',
  'gamesPage.shareFailed': '複製失敗',
  'gamesPage.favorite': '收藏',
  'gamesPage.unfavorite': '已收藏',
  'gamesPage.favoriteSignIn': '登入後才能收藏 —— 點右上角頂欄那顆登入鈕。',
  'gamesPage.favoriteFailed': '收藏沒能更新，請重試。',
  'gamesPage.favoriteCount': '{n} 人收藏',
  'gamesPage.report': '回報問題',
  'gamesPage.reportTitle': '回報問題',
  'gamesPage.reportSubject': '關於：{name}',
  'gamesPage.reportPlaceholder': '遇到什麼問題？例如：打不開、畫面花掉、沒有聲音…',
  'gamesPage.reportSubmit': '送出回報',
  'gamesPage.reportSubmitting': '送出中…',
  'gamesPage.reportOk': '已收到，謝謝！',
  'gamesPage.reportRequired': '先說說遇到什麼問題吧。',
  'gamesPage.reportFailed': '送出失敗，再試一次。',
  'gamesPage.reportClose': '取消',
  /* 詳情頁的評論模組 —— 發評論必須先登入 */
  'comments.heading': '評論',
  'comments.count': '{n} 則評論',
  'comments.empty': '還沒有評論，來當第一個吧。',
  'comments.placeholder': '說說你對這款遊戲的看法…',
  'comments.ratingLabel': '打個分',
  'comments.ratingStar': '打 {n} 顆星',
  'comments.ratingValue': '{n} 顆星',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': '先給個星數吧。',
  'comments.submit': '發表評論',
  'comments.submitting': '發表當中…',
  'comments.ok': '已發表，就在上面第一則。',
  'comments.required': '寫點什麼再發表吧。',
  'comments.failed': '發表失敗，再試一次。',
  'comments.signInLead': '登入後才能發表評論。',
  'comments.signIn': '去登入',
  'comments.signInRequired': '請重新登入後再發表。',
  'comments.loading': '正在載入評論…',
  'comments.retry': '重試',
  'comments.loadFailed': '評論載入失敗。',
  'comments.loadMore': '載入更多',
  'comments.delete': '刪除',
  'comments.deleteConfirm': '確定刪除',
  'comments.cancel': '取消',
  'comments.deleted': '評論已刪除。',
  'comments.deleteFailed': '刪除失敗，再試一次。',
  'gamesPage.field.console': '類型',
  'gamesPage.field.year': '年份',
  'gamesPage.field.developer': '開發商',
  'gamesPage.field.series': '系列',
  'gamesPage.field.language': '語言',
  'gamesPage.controls': '操作說明',
  'gamesPage.selectLanguage': '選擇語言',
  'notFound.title': '這個頁面不存在',
  'notFound.description': '這個網址在 {site} 上不存在。檢查一下連結，或回首頁看看。',
  'gamesPage.notFoundTitle': '找不到這個遊戲',
  'gamesPage.notFound': '這個遊戲不在遊戲庫裡（可能已經被移除）。',
  'gamesPage.fallbackDescription': '《{title}》是一款 {console} 遊戲。',

  /* 開發商兩頁 */
  'developersPage.heading': '開發商',
  'developersPage.intro':
    '線上遊戲庫背後的 {count} 家開發商。點進去看看這家公司在我們庫裡的全部遊戲。',
  'developersPage.empty': '還沒有登記任何開發商。',
  'developersPage.gameCount': '{count} 款遊戲',
  'developersPage.gamesHeading': '{name} 的遊戲',
  'developersPage.gamesEmpty': '遊戲庫裡還沒有這家公司的遊戲。',
  'developersPage.field.founded': '成立年份',
  'developersPage.backToDevelopers': '全部開發商',
  'developersPage.notFoundTitle': '找不到這個開發商',
  'developersPage.notFound': '這個開發商已經不在遊戲庫裡了。',

  /* 機種兩頁。機種清單是固定的，不存在「一款都沒有」的空態 */
  'consolesPage.heading': '機種',
  'consolesPage.intro': '遊戲庫裡的機種 —— 共收錄 {count} 款遊戲。點一個看看它名下的全部遊戲。',
  'consolesPage.gameCount': '{count} 款遊戲',
  'consolesPage.gamesHeading': '{name} 上的遊戲',
  'consolesPage.gamesEmpty': '遊戲庫裡還沒有這個機種的遊戲。',
  'consolesPage.gamesEmptyLang': '這個機種下還沒有 {lang} 的遊戲。',
  'consolesPage.filterLangLabel': '依語言篩選',
  'consolesPage.field.released': '發售年份',
  'consolesPage.backToConsoles': '全部機種',
  'consolesPage.notFoundTitle': '找不到這個機種',
  'consolesPage.notFound': '這個機種不屬於本站（或已被移除）。',

  'download.heading': '下載 ROM',
  'download.hint': '點下面的按鈕，6 秒後開始下載。',
  'download.button': '開始下載',
  'download.waiting': '{seconds} 秒後開始…',
  'download.started': '已開始下載，請查看瀏覽器的下載資料夾。',
  'download.rights': '請只下載你有權使用的 ROM 檔案。',
  'download.disclaimer':
    '免責聲明：本頁所有 ROM 檔案皆蒐集自第三方，僅供個人學習與備份研究使用，請於下載後 24 小時內自行刪除；相關著作權歸原權利人所有，如有侵權請聯絡我們刪除。',

  'deepLink.notFound': '找不到這個遊戲，可能已經被移除。',
  /* 深鏈載入中那顆獨立彈窗 */
  'deepLink.title': '正在載入遊戲',
  'deepLink.loading': '正在下載 ROM…',
  'deepLink.hint': '下載完成後自動開始',
};

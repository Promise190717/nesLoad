/**
 * 越南语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再塞一张进来会把它冲得更长，谁都翻不动。理由和 `lib/i18n.ja.ts` / `i18n.ko.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的 558 个键必须与 `en` 表逐键一致、顺序也一致**，`zh` / `ja` / `ko` 同理。
 *    改文案时先改 `en`，再回来对齐另外几份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的越南语在数据库里
 *    （`game_texts` 的 `vi` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` / `{seconds}` /
 *    `{ext}` / `{max}` / `{n}` / `{avg}` / `{player}` / `{pressed}` / `{button}` / `{console}` /
 *    `{title}` / `{keyword}` / `{lang}` / `{date}` / `{code}`），它们由 `translate()` 在运行时替换；
 *    漏掉一个不会报错，只会在页面上少一段字。越南语语序和英语不同，占位符**可以挪位置**，
 *    但不能丢、不能改名、不能替换成实际值。
 *
 * ⚠️ **站点名统一写 `Retro Games Box`，不翻译**（品牌名照写，不音译成「Túp Lều Game」之类）；
 *    凡是有 `{site}` 的地方照留占位符，别在这里手写站名 —— 那份在 `SITE_NAME` 里，和这张表同源。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → hệ máy；developer → nhà phát triển；series → dòng game
 *   · cartridge → băng game；room → phòng；host → chủ phòng；guest → khách
 *   · netplay → chơi qua mạng；save（名词）→ bản lưu，（动词）→ lưu
 *   · load（把 ROM / 存档装进模拟器）→ **nạp**；download → **tải** —— 这两个词全表不混用，
 *     混了「Nạp ROM」和「Tải ROM」就分不清是读本地文件还是下载
 *   · key bindings → gán phím / cài đặt phím；game library → thư viện game
 *   · guestbook → sổ lưu bút
 *
 * 语气：界面短句，按钮用动词原形（Chơi / Tải xuống / Đóng），**保留完整的声调符号**
 * （不写 khong / ban 这种去 dấu 的写法），不写 emoji。屏幕里那几句（`screen.*`）
 * 沿用英文那侧的全大写排版。
 *
 * ⚠️ 机种名用**越南语玩家的通行写法**：直接沿用原厂 / 海外名，不音译 ——
 *    NES / SNES / Game Boy / GBC / GBA / NDS / Mega Drive / Game Gear / Master System /
 *    32X / WonderSwan / Neo Geo Pocket / PlayStation / Arcade。
 *    标签位上取的是 `lib/consoles.ts` 的 `consoleLabel(type, locale)`，和文案同源。
 */

import type { MessageKey } from './i18n';

export const vi: Record<MessageKey, string> = {
  /* SEO 文案（<title> / description / og:* / JSON-LD），不进界面，只给爬虫和社交卡片看。
     机种那串刻意只列代表机型 + « và nhiều hơn nữa »，别当漏字补全（理由见 en 那份的注释）。 */
  'meta.title': '{site} — Chơi game retro trên trình duyệt: NES, SNES, GBA & Arcade',
  'meta.description':
    'Chơi NES, SNES / SFC, Game Boy, GBA, Mega Drive và game arcade ngay trên trình duyệt. Chọn một tựa game trong thư viện trực tuyến, hoặc nạp file ROM của chính bạn.',
  'meta.keywords':
    'game retro, thư viện game retro trực tuyến, giả lập NES, giả lập SNES, giả lập SFC, giả lập GBA, giả lập Game Boy Advance, giả lập Game Boy, giả lập Game Boy Color, giả lập NDS, giả lập Nintendo DS, giả lập Sega Mega Drive, giả lập Sega Genesis, giả lập Game Gear, giả lập Master System, giả lập Sega 32X, giả lập WonderSwan, giả lập Neo Geo Pocket, giả lập PlayStation, giả lập PS1, giả lập PSX, giả lập arcade, chơi NES trên trình duyệt, giả lập trên trình duyệt, RetroArch WASM, {site}',
  'seo.room.title': 'Phòng Pixel — Chơi game retro trên trình duyệt',
  'seo.room.description':
    'Bước vào căn phòng pixel: NES, SNES / SFC, Game Boy, GBA, Mega Drive và game arcade chạy trên màn hình CRT. Chọn một tựa game trong thư viện trực tuyến, hoặc thả file ROM của bạn lên màn hình.',
  'seo.login.title': 'Đăng nhập',
  'seo.login.description':
    'Đăng nhập để bản lưu, lịch sử chơi và game yêu thích được đồng bộ trên mọi thiết bị.',

  /* 首页落地页：Hero + 按机种 / 最新 / 开发商浏览 + FAQ */
  'home.hero.title': 'Chơi game retro kinh điển trên trình duyệt',
  'home.hero.lead':
    '{site} có NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade và nhiều hệ máy khác để chơi trực tuyến, kèm chế độ chơi mạng hai người.',
  /* 首屏两颗钮：左「挑一挑」，右「进屋子加载自己的 ROM」。顺序按 DOM：browse 在左、play 在右 */
  'home.hero.play': 'Nạp ROM từ máy',
  'home.hero.browse': 'Xem tất cả game',
  'home.join.title': 'Chơi cùng bạn bè',
  'home.join.hint': 'Nhập mã phòng 4 ký tự mà bạn của bạn chia sẻ.',
  'home.join.submit': 'Vào phòng',
  'home.hero.or': 'HOẶC',
  'home.search.label': 'Tìm trong thư viện game',
  'home.search.placeholder': 'Tìm theo tên / nhà phát triển / dòng game',
  'home.search.submit': 'Tìm kiếm',
  'home.consoles.title': 'Tìm theo hệ máy',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade và nhiều hệ máy khác — chọn một hệ để xem game của hệ đó.',
  'home.consoles.count': '{count} game',
  'home.consoles.all': 'Tất cả hệ máy',
  'home.latest.title': 'Game mới thêm',
  'home.latest.lead': 'Những game vừa được thêm gần đây.',
  'home.latest.viewAll': 'Tất cả game',
  'home.developers.title': 'Tìm theo nhà phát triển',
  'home.developers.lead': 'Những studio có nhiều game nhất ở đây.',
  'home.developers.viewAll': 'Tất cả nhà phát triển',
  'home.empty':
    'Thư viện đang trống — mở phòng và thả một file ROM lên màn hình CRT để bắt đầu chơi.',
  'home.faq.title': 'Câu hỏi thường gặp',
  'home.faq.q1': 'Có miễn phí không?',
  'home.faq.a1':
    'Hoàn toàn miễn phí — mọi game đều chơi được. Đăng nhập để có thêm bản lưu đám mây cho lịch sử chơi và file lưu.',
  'home.faq.q2': 'Tôi có phải cài đặt gì không?',
  'home.faq.a2': 'Không — chỉ cần bấm vào một game là chơi được ngay trên trình duyệt.',
  'home.faq.q3': 'Có chơi được trên điện thoại và máy tính bảng không?',
  'home.faq.a3': 'Có — chơi được ngay trên trình duyệt của điện thoại và máy tính bảng.',
  'home.faq.q4': 'Tôi có tải file ROM về được không?',
  'home.faq.a4':
    'Có — trang của mỗi game đều có nút tải xuống. Chỉ tải những file ROM mà bạn có quyền sử dụng.',
  'home.faq.q5': 'Có chơi cùng bạn bè được không?',
  'home.faq.a5': 'Tất nhiên! Rủ một người bạn rồi mở phòng để đấu với nhau.',
  'home.faq.q6': 'Có hỗ trợ tay cầm không?',
  'home.faq.a6':
    'Có — cắm tay cầm USB hoặc Bluetooth là trình giả lập nhận ngay qua trình duyệt. Việc gán nút theo mặc định của từng core; trên điện thoại bạn dùng các nút trên màn hình.',

  /* 首屏那段看不见的正文（sr-only）：简短、且与页面真实功能一致 */
  'seo.heading': 'Chơi game retro trên trình duyệt',
  'seo.intro':
    '{site} là một phòng chơi game retro trực tuyến. NES, SNES / SFC, Game Boy, GBA, Mega Drive và arcade chạy ngay trong trình duyệt — giả lập trên chính máy của bạn, với RetroArch biên dịch sang WebAssembly.',
  'seo.howTo':
    'Chọn một game trong thư viện trực tuyến, hoặc thả file ROM của bạn lên màn hình. Không cần cài đặt gì.',

  /* 列表 / 详情 / 下载三页的 SEO */
  'seo.games.title': 'Tất cả game — Chơi NES, SNES, GBA & Arcade trực tuyến',
  'seo.games.description':
    '{count} game retro trong thư viện trực tuyến, tất cả đều chơi được trên trình duyệt: NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade và nhiều hơn nữa. Mở một tựa game để xem chi tiết, chơi ngay, hoặc tải file ROM về.',
  'seo.games.search.title': 'Kết quả tìm kiếm cho “{keyword}”',
  'seo.games.search.description':
    'Có {count} game trong thư viện trực tuyến khớp với “{keyword}”. Chơi trên trình duyệt hoặc tải file ROM về.',
  'seo.games.console.title': 'Game {console} — Chơi trực tuyến trên trình duyệt',
  'seo.games.console.description':
    '{count} game {console} trong thư viện trực tuyến, tất cả đều chơi được trên trình duyệt hoặc tải về dưới dạng file ROM.',
  'seo.game.title': '{title} — Chơi {console} trực tuyến',
  'seo.game.description':
    'Chơi {title} ({console}) ngay trên trình duyệt — miễn phí, không cần cài đặt. File ROM cũng có thể tải về.',
  'seo.gameDownload.title': 'Tải ROM {title} ({console})',
  'seo.gameDownload.description':
    'Tải file ROM của {title} ({console}) chỉ với một cú bấm, không cần đăng ký. Bạn cũng có thể chơi ngay trên trình duyệt.',
  'seo.developers.title': 'Nhà phát triển game — Chơi game NES, SNES, GBA & Arcade của họ',
  'seo.developers.description':
    '{count} nhà phát triển đứng sau các game trong thư viện trực tuyến. Mở một nhà phát triển để xem mọi tựa game của studio đó.',
  'seo.developer.title': '{name} — Game của nhà phát triển này',
  'seo.developer.description':
    'Toàn bộ game {name} trong thư viện trực tuyến ({count}), chơi được trên trình duyệt hoặc tải về dưới dạng file ROM.',
  'seo.consoles.title': 'Tìm theo hệ máy — Chơi game NES, SNES, GBA & Arcade trực tuyến',
  'seo.consoles.description':
    'Mọi hệ máy trong thư viện trực tuyến (tổng cộng {count} game). Chọn một hệ để xem toàn bộ game của hệ đó, chơi được ngay trên trình duyệt.',
  'seo.console.title': 'Game {name} — Chơi trực tuyến',
  'seo.console.description':
    'Toàn bộ game {name} trong thư viện trực tuyến ({count}), chơi được trên trình duyệt hoặc tải về dưới dạng file ROM.',

  'theme.toDark': 'Chuyển sang chế độ ban đêm',
  'theme.toLight': 'Chuyển sang chế độ ban ngày',
  'lamp.turnOn': 'Bật đèn',
  'lamp.turnOff': 'Tắt đèn',
  'simple.enter': 'Chế độ tối giản: chỉ giữ lại tường, TV, bàn và sàn',
  'simple.exit': 'Thoát chế độ tối giản',
  'tvSize.open': 'Cỡ TV',
  'tvSize.opt.large': 'Lớn',
  'tvSize.opt.medium': 'Vừa',
  'tvSize.opt.small': 'Nhỏ',
  'tvSize.pick': 'Đặt cỡ TV thành {level}',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Ngôn ngữ',
  /* 语言提示弹窗：三条都提到「当前页面是哪种语言」，所以每种语言各写一份 */
  'localePrompt.title': 'Trang này đang dùng tiếng Việt',
  'localePrompt.body': 'Trình duyệt của bạn muốn dùng ngôn ngữ khác. Chuyển không?',
  'localePrompt.keep': 'Giữ tiếng Việt',
  'fullscreen.enter': 'Bật toàn màn hình cho màn hình game',
  'fullscreen.exit': 'Thoát toàn màn hình',

  /* 屏幕里那块提示。走 `font-pixel`（Press Start 2P）—— 那套字模没有越南语声调符号，
     所以会落到系统字体上（globals.css 的 `.screen-hint-*` 补偿字号）。全大写沿用英文那侧的排版。 */
  'screen.pick': 'Bấm để chọn file ROM, hoặc thả file vào đây',
  'screen.srLabel': 'Chọn file ROM để chạy',
  'screen.tapLoad': 'BẤM ĐỂ NẠP ROM TỪ MÁY',
  'screen.orLibrary': 'HOẶC KHỞI CHẠY TỪ THƯ VIỆN TRỰC TUYẾN',
  'screen.release': 'THẢ RA ĐỂ NẠP',
  'screen.mobileLibrary': 'KHỞI CHẠY TỪ THƯ VIỆN',
  'screen.mobileTap': 'CHẠM VÀO MÀN HÌNH ĐỂ MỞ THƯ VIỆN',
  'screen.waitingHost': 'ĐANG CHỜ CHỦ PHÒNG',
  'screen.paused': 'TẠM DỪNG',
  'screen.resumeOnPanel': 'BẤM TIẾP TỤC TRÊN BẢNG ĐIỀU KHIỂN',
  'screen.resumeInPanel': 'BẤM TIẾP TỤC Ở BẢNG BÊN PHẢI',
  'screen.waitHostResume': 'ĐANG CHỜ CHỦ PHÒNG TIẾP TỤC',

  /* 机身面板那排钮 */
  'panel.resume': 'Tiếp tục',
  'panel.pause': 'Tạm dừng',
  'panel.save': 'Lưu',
  'panel.load': 'Nạp',
  'panel.reset': 'Khởi động lại',
  'panel.eject': 'Tháo băng',
  'volume.down': 'Giảm âm lượng một mức',
  'volume.up': 'Tăng âm lượng một mức',
  'volume.set': 'Đặt âm lượng mức {level} trên {max}',

  'saves.title': 'Nạp bản lưu',
  'saves.load': 'Nạp',
  'saves.close': 'Đóng',
  'saves.groupLocal': 'Thiết bị này',
  'saves.groupCloud': 'Đám mây (tài khoản)',
  'saves.deleteCloud': 'Xóa bản lưu đám mây này',
  'saves.delete': 'Xóa',
  'saves.loginHint': 'Đăng nhập để giữ bản lưu trên đám mây và chơi tiếp trên mọi thiết bị.',
  'saves.login': 'Đăng nhập',
  'saves.loading': 'Đang tải…',
  'saves.downloading': 'Đang tải bản lưu đám mây…',
  'saves.restoring': 'Đang khôi phục game…',
  'saves.empty': 'Chưa có bản lưu',

  'library.removeLabel': 'Xóa {name}',

  /* 键位表。刻意不用 font-pixel：那套字模没有越南语字形，而这几条是给人读懂的说明。
     1P / 2P 那两行由 `playerLegend()` 现算，这里只有「移动」这个词要翻译。 */
  'legend.moves': 'di chuyển',
  'legend.open': 'Hướng dẫn phím',
  'legend.title': 'Hướng dẫn phím',
  'legend.close': 'Đóng',
  'legend.needZip':
    'Định dạng  FBNeo chỉ đọc được .zip — file này có vẻ là {ext}. Hãy nén lại, hoặc dùng bản .zip',
  'play.needZip':
    'Định dạng  ROM này là file nén {ext} và không giải nén được — hãy thử .zip hoặc ROM không nén',
  'legend.needDisc':
    'Định dạng  Ảnh đĩa thường gồm nhiều file (.cue + .bin). Trang này chỉ nhận ảnh đĩa một file — hãy dùng bản .pbp, .iso hoặc .chd',
  'play.needDisc':
    'Định dạng  Đây là ảnh đĩa nhiều file (.cue + .bin). Ở đây chỉ chạy được ảnh đĩa một file — hãy thử bản .pbp, .iso hoặc .chd',
  'legend.needBios':
    'BIOS  Có vẻ đây là game Neo Geo (KOF, Metal Slug…). Game cần neogeo.zip — thả file đó lên trang là nó được cài. Game CPS1 / CPS2 không cần file này.',
  'legend.gamepad':
    'Tay cầm  Cắm vào là dùng được — khi vào phòng chơi mạng thì cả hai bên đều dùng được.',

  /* 联机面板。`netplay.codePlaceholder` 保持 ASCII：房间码输入框走 font-pixel，
     该字模没有越南语字形，写「MÃ」会掉到等宽字体上，所以仍写 CODE。 */
  'netplay.title': 'Chơi qua mạng',
  'netplay.open': 'Chơi qua mạng',
  'netplay.close': 'Đóng',
  'netplay.create': 'Tạo phòng',
  'netplay.or': 'hoặc',
  'netplay.join': 'Tham gia',
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    'Hai bên chỉ cần kết nối được tới máy chủ trung chuyển công cộng — cùng một mạng LAN là chắc nhất. Đọc mã 4 ký tự cho người kia. Chủ phòng chạy trình giả lập và truyền hình ảnh; khách không cần ROM.',
  'netplay.roomCode': 'Mã phòng',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Internet',
  'netplay.wanDev': 'Chơi qua mạng Internet đang được phát triển.',
  'netplay.quality': 'Chất lượng hình ảnh',
  'netplay.qualitySmooth': 'Mượt',
  'netplay.qualityBalanced': 'Cân bằng',
  'netplay.qualitySharp': 'Nét',
  'netplay.qualityHint':
    'Chất lượng hình ảnh ảnh hưởng trực tiếp tới tải của chủ phòng. Nên chọn Cân bằng. Nếu máy chủ phòng không theo kịp, cả game sẽ chạy chậm; khi đó hãy hạ một mức. Thiết lập này chỉ áp dụng cho chủ phòng.',
  'netplay.copy': 'Sao chép',
  'netplay.copied': 'Đã sao chép',
  'netplay.share': 'Chia sẻ',
  'netplay.shareCopied': 'Đã sao chép liên kết',
  'netplay.inviteTitle': 'Lời mời vào phòng',
  'netplay.inviteBody': 'Tham gia phòng {code}?',
  'netplay.inviteJoin': 'Tham gia',
  'netplay.inviteCancel': 'Hủy',
  'netplay.connected': 'Đã kết nối',
  'netplay.waiting': 'Đang chờ người chơi kia',
  'netplay.joining': 'Đang vào phòng…',
  'netplay.waitingGame': 'Đã kết nối — đang chờ chủ phòng nạp băng game',
  'netplay.hostPlaying': 'Chủ phòng đang chơi',
  'netplay.paused': 'Tạm dừng',
  'netplay.toastHost': 'Đã kết nối · người kia đã vào · bạn là người chơi 1',
  'netplay.toastGuest': 'Đã kết nối với chủ phòng · bạn là người chơi 2',
  'netplay.toastHostLeft': 'Chủ phòng đã rời đi · phòng đã đóng',
  'netplay.toastGuestLeft': 'Người chơi 2 đã rời phòng',
  'netplay.youAreHost':
    'Bạn là người chơi 1. Nạp băng game là hình ảnh tự động được truyền cho khách. Bạn chơi bằng bộ phím của mình — xem Hướng dẫn phím để biết các phím hiện tại.',
  'netplay.youAreGuest':
    'Bạn là người chơi 2. Không cần băng game — chủ phòng truyền hình ảnh, còn thao tác của bạn được gửi tới chủ phòng. Bạn chơi bằng bộ phím của mình (nhóm Người chơi 1) hoặc tay cầm — xem Hướng dẫn phím.',
  'netplay.leave': 'Rời phòng',
  'netplay.closeRoom': 'Đóng phòng',
  'netplay.badCode': 'Mã này có vẻ không đúng — phải là 4 ký tự.',
  'netplay.errInsecure':
    'Chơi qua mạng cần HTTPS hoặc localhost. Trang này đang chạy http thường, nên trình duyệt không cấp API mã hóa mà nó cần.',
  'netplay.errNoDirect':
    'Cả hai bên đều tới được máy chủ trung chuyển nhưng không mở được kết nối trực tiếp — thường là do NAT hoặc tường lửa. Cùng một mạng LAN cho tỉ lệ thành công cao nhất.',
  'netplay.errPassword': 'Mã phòng không khớp.',
  'netplay.errHandshake': 'Quá thời gian bắt tay — có thể người kia đã rời đi.',
  'netplay.errHostLeft': 'Chủ phòng đã rời phòng — phòng đã bị đóng.',
  'netplay.errNoRoom':
    'Không có phản hồi từ chủ phòng. Mã phòng có thể sai, hoặc chủ phòng chưa mở phòng.',
  'netplay.errRoomFull': 'Phòng đã đầy — game này chỉ chơi 1 đấu 1.',
  'netplay.errUnknown':
    'Không kết nối được với người kia. Console của trình duyệt có ghi lý do cụ thể.',

  /* `/play`：左边一块黑屏 + 右边一列控件。联机那部分的词一个都没抄在这里，全部复用 `netplay.*` */
  'seo.play.title': 'Phòng chơi — Nạp game và chơi trực tuyến',
  'seo.play.description':
    'Một màn hình để bắt đầu: chơi một mình, hoặc mở phòng 1 đấu 1 và chia sẻ mã. NES, SNES / SFC, Game Boy, GBA, Mega Drive và arcade.',
  'play.modeSolo': 'Một mình',
  'play.start': 'Bắt đầu',
  'play.confirmStart': 'Xác nhận và bắt đầu',
  'play.confirm': 'Xác nhận',
  'play.qualityIntro': 'Chọn chất lượng hình ảnh cho chế độ chơi qua mạng theo đường truyền của bạn.',
  'play.qualityHint.smooth': '30 fps · Tốn ít băng thông, phù hợp với đường truyền chậm.',
  'play.qualityHint.balanced': 'Tối đa 720p / 60 fps · Cân bằng giữa độ nét và độ mượt.',
  'play.qualityHint.sharp':
    'Tối đa 60 fps · Ưu tiên độ phân giải gốc và độ chi tiết của điểm ảnh; cần đường truyền nhanh. Mạng chậm có thể bị tụt khung hình.',
  'play.qualityConfirmHint':
    'Xác nhận là kết nối vào phòng. Chủ phòng nạp game, khách nhận hình ảnh từ chủ phòng.',
  'play.connecting': 'Đang kết nối…',
  'play.confirmJoin': 'Xác nhận và tham gia',
  'play.cancel': 'Hủy',
  'play.screenSize': 'Cỡ màn hình',
  'play.controlsTitle': 'Điều khiển game',
  'play.netplayKeysHint':
    'Khi chơi qua mạng, mỗi người dùng bộ phím Người chơi 1 của thiết bị mình.',
  'play.cancelled': 'Đã hủy việc nạp.',
  'play.retry': 'Nạp lại',
  'play.retryJoin': 'Thử tham gia lại',
  'play.saved': 'Đã lưu game.',
  'play.localSaving': 'Đang lưu…',
  'play.uploading': 'Đang tải lên đám mây…',
  'play.cloudFailed': 'Đồng bộ đám mây thất bại.',
  'play.saveNoLogin': 'Đăng nhập để đồng bộ',
  'play.tooLarge': 'Bản lưu quá lớn',
  'play.theme': 'Chế độ',
  'play.saveFailed': 'Không lưu được. Vui lòng thử lại.',
  'play.loadFailed': 'Không nạp được bản lưu. Vui lòng thử lại.',
  'play.leftRoom': 'Bạn đã rời phòng.',
  'play.latency': 'Độ trễ',
  'play.measuringLatency': 'Đang đo…',
  'play.downloading': 'Đang tải ROM…',
  'play.booting': 'Đang khởi động core…',
  'play.loadFail': 'Không nạp được băng game này.',
  'play.romIncomplete': 'File ROM bị thiếu — vui lòng nạp lại.',
  'play.notFound': 'Không tìm thấy game đó.',
  'play.fullscreen': 'Toàn màn hình',
  'play.volume': 'Âm lượng',
  'play.edit': 'Sửa',
  'play.hideSidebar': 'Ẩn bảng',
  'play.showSidebar': 'Hiện bảng',
  'play.hint': 'Esc để thoát toàn màn hình. Các thao tác khác nằm ở bên phải.',
  'play.leaveTitle': 'Đang chơi game',
  'play.leaveBody':
    'Quay lại sẽ kết thúc phiên chơi này — tiến trình không được tự động lưu.',
  'play.leaveStay': 'Chơi tiếp',
  'play.leaveGo': 'Rời đi',
  'gamesPage.playOnline': 'Chơi qua mạng',

  /* 自定义按键面板。钮名（A B C X Y Z）是丝印、不进文案表；只有「开始 / 投币」跟着语言走 */
  'keybind.title': 'Gán phím',
  'keybind.open': 'Cài đặt phím',
  'keybind.close': 'Đóng',
  'keybind.p1': 'Người chơi 1',
  'keybind.p2': 'Người chơi 2',
  'keybind.mine': 'Phím của bạn',
  'keybind.pressKey': 'NHẤN PHÍM…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Khôi phục mặc định',
  'keybind.reload': 'Nạp lại băng game',
  'keybind.reloading': 'Đang nạp lại…',
  'keybind.unsupported': 'Không dùng được phím này — hãy thử phím khác.',
  'keybind.conflictSame':
    '{pressed} đã được gán cho nút {button} — hãy thử phím khác.',
  'keybind.conflictOther':
    '{pressed} đã được gán cho nút {button} của người chơi {player} — hãy thử phím khác.',
  'keybind.hint':
    'Bảng phím chỉ được đọc một lần khi nạp băng game — hãy nạp lại để thay đổi có hiệu lực. Hai người chơi không thể dùng chung một phím.',
  'keybind.soloHint':
    'Bảng phím chỉ được đọc một lần khi nạp băng game — hãy nạp lại để thay đổi có hiệu lực.',
  'keybind.hostHint':
    'Bạn là chủ phòng: Người chơi 1 là phím của bạn, Người chơi 2 là đích để thao tác của khách được đưa vào. Hai bên không thể trùng phím, nếu không thao tác đưa vào sẽ điều khiển luôn Người chơi 1 của bạn. Hãy nạp lại băng game sau khi đổi.',
  'keybind.guestHint':
    'Bạn là khách và chơi bằng bộ phím của mình (nhóm Người chơi 1) — mỗi bên ngồi trước bàn phím riêng nên không thể giẫm phím nhau. Thay đổi có hiệu lực ngay, không cần nạp lại băng game.',
  'keybind.guestLocalHint':
    'Bạn là khách và trên máy này cũng đang chạy một băng game của bạn. Phím của bạn là nhóm Người chơi 1: băng game ở máy này đọc nhóm đó nên sau khi đổi phải nạp lại. Nhóm đó cũng chính là thứ được gửi tới chủ phòng, và phần đó có hiệu lực ngay.',

  /* 在线游戏库（服务端上传的那批）。「历史」只记「这台机器从游戏库点开过哪几盘」 */
  'games.open': 'Thư viện game',
  'games.title': 'Thư viện game',
  'games.close': 'Đóng',
  'games.empty': 'Thư viện đang trống — chưa có gì được tải lên',
  'games.loading': 'Đang tải…',
  'games.loadingRom': 'Đang nạp {name}…',
  'games.cancel': 'Hủy',
  'games.failed': 'Không tải được thư viện game',
  'games.tabLibrary': 'Thư viện game',
  'games.tabHistory': 'Lịch sử',
  'games.historyEmpty': 'Chưa nạp game nào từ thư viện',
  'games.historyLoad': '{name}\nBấm để nạp lại',
  'games.tabFavorites': 'Yêu thích',
  'games.favorite': 'Thêm {name} vào yêu thích',
  'games.unfavorite': 'Bỏ {name} khỏi yêu thích',
  'games.favoritesEmpty': 'Chưa có game yêu thích — bấm ngôi sao trên bìa game để thêm.',
  'games.favoritesSignInBefore': 'Đăng nhập để giữ game yêu thích — ',
  'games.favoritesSignInLink': 'Đăng nhập',
  'games.favoritesSignInAfter': ' ngay tại đây, hoặc dùng nút tài khoản ở góc trên bên phải.',

  /* 用户面板（注册 / 登录 / 退出 + 云端三件套） */
  'user.title': 'Tài khoản',
  'user.close': 'Đóng',
  'user.open': 'Tài khoản — đăng nhập hoặc đăng ký',
  'user.openSignedIn': 'Tài khoản: {name}',
  'user.tabLogin': 'Đăng nhập',
  'user.tabRegister': 'Tạo tài khoản',
  'user.username': 'Tên đăng nhập',
  'user.password': 'Mật khẩu',
  /* 两条规则提示现在当 placeholder 用，越短越好（太长会被输入框宽度截断） */
  'user.usernameHint': '3–20 ký tự: chữ, số, _ - .',
  'user.emailLabel': 'Email',
  'user.emailHint': 'Email của bạn. Không dùng địa chỉ alias, không dùng mail tạm.',
  'user.passwordHint': 'Ít nhất 6 ký tự, không có dấu cách.',
  'user.signIn': 'Đăng nhập',
  'user.signUp': 'Tạo tài khoản',
  'user.signingIn': 'Đang đăng nhập…',
  'user.signingUp': 'Đang tạo…',
  'user.signOut': 'Đăng xuất',
  'user.signedInAs': 'Đang đăng nhập với tên {name}.',
  'user.cloudHint':
    'Lịch sử chơi, bản lưu và game yêu thích được lưu trong tài khoản — mở bất kỳ game nào từ thư viện trực tuyến là chúng tự đồng bộ.',
  'user.formLead':
    'Đăng nhập để bản lưu, lịch sử chơi và game yêu thích được giữ trên đám mây — chơi bất cứ lúc nào, ở bất cứ đâu!',
  /* 表单下面那句法律声明：拆成四段，中间夹两个真链接。⚠️ 值首尾的空格是有意义的，别 trim */
  'user.consentLogin': 'Khi đăng nhập, bạn đồng ý với ',
  'user.consentRegister': 'Khi tạo tài khoản, bạn đồng ý với ',
  'user.consentMiddle': ' và ',
  'user.consentAfter': '.',

  'user.error.failed': 'Có lỗi xảy ra — hãy thử lại.',
  'user.error.missingCredentials': 'Hãy nhập tên đăng nhập và mật khẩu.',
  'user.error.usernameInvalid': 'Tên đăng nhập chỉ được chứa chữ, số, _ - và .',
  'user.error.usernameTooShort': 'Tên đăng nhập quá ngắn (ít nhất 3 ký tự).',
  'user.error.usernameTooLong': 'Tên đăng nhập quá dài (tối đa 20 ký tự).',
  'user.error.usernameTaken': 'Tên đăng nhập này đã có người dùng — hãy chọn tên khác.',
  'user.error.emailInvalid': 'Hãy nhập một địa chỉ email hợp lệ.',
  'user.error.emailAlias':
    'Không cho phép email alias (như name+tag@… hay Gmail có dấu chấm).',
  'user.error.emailTemp':
    'Không cho phép email dùng một lần — hãy dùng hộp thư thường ngày của bạn.',
  'user.error.passwordInvalid': 'Hãy nhập mật khẩu.',
  'user.error.passwordTooShort': 'Mật khẩu quá ngắn (ít nhất 6 ký tự).',
  'user.error.passwordTooLong': 'Mật khẩu quá dài (tối đa 72 ký tự).',
  'user.error.passwordHasSpace': 'Mật khẩu không được chứa dấu cách.',
  'user.error.invalidCredentials': 'Sai tên đăng nhập hoặc mật khẩu.',
  'user.error.banned': 'Tài khoản này đã bị khóa.',
  'user.error.captchaRequired': 'Hãy hoàn tất bước xác minh người thật trước.',
  'user.error.captchaFailed': 'Xác minh người thật thất bại — hãy thử lại.',

  'login.lead':
    'Đăng nhập để bản lưu, lịch sử chơi và game yêu thích được giữ trên đám mây — chơi bất cứ lúc nào, ở bất cứ đâu. Chưa có tài khoản? Tạo một cái.',

  /* 个人中心（/account）：收藏 / 历史 / 存档 / 资料 / 密码 */
  'account.title': 'Tài khoản của bạn',
  'account.loading': 'Đang tải…',
  'account.failed': 'Có lỗi xảy ra — hãy thử lại.',
  'account.since': 'Thành viên từ {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Thường',
  'account.vipUntil': 'VIP đến {time}',
  'account.vipExpired': 'VIP đã hết hạn {time}',
  'account.tabFavorites': 'Yêu thích',
  'account.tabHistory': 'Lịch sử',
  'account.tabSaves': 'Bản lưu',
  'account.tabProfile': 'Hồ sơ',
  'account.tabPassword': 'Mật khẩu',
  'account.favoritesLoading': 'Đang tải game yêu thích…',
  'account.historyLoading': 'Đang tải lịch sử…',
  'account.savesLoading': 'Đang tải bản lưu…',
  'account.favoritesEmpty':
    'Chưa có game yêu thích — mở thư viện game trong phòng và bấm ngôi sao trên bìa game.',
  'account.unfavorite': 'Bỏ {name} khỏi yêu thích',
  'account.historyEmpty':
    'Chưa có lịch sử chơi — những game bạn mở từ thư viện trực tuyến sẽ hiện ở đây.',
  'account.historyCount': '{count} game chơi gần đây',
  'account.historyDeleted': 'Đã xóa khỏi lịch sử.',
  'account.clearHistory': 'Xóa tất cả',
  'account.confirmClearHistory': 'Xóa hết thật không?',
  'account.historyCleared': 'Đã xóa lịch sử.',
  'account.historyHint':
    'Lịch sử giữ {max} game chơi gần nhất — chơi lại một game cũ sẽ đưa nó lên đầu.',
  'account.savesEmpty': 'Chưa có bản lưu đám mây.',
  'account.savesCount': 'Tổng cộng {count} bản lưu',
  'account.savesGroupCount': '{count} bản lưu',
  'account.viewGame': 'Xem {name}',
  'account.savesHint':
    'Mỗi game một bản lưu — lưu lại sẽ ghi đè bản cũ. Trên máy và trên đám mây đều như vậy.',
  'account.saveDeleted': 'Đã xóa bản lưu.',
  'account.clearSaves': 'Xóa tất cả',
  'account.confirmClearSaves': 'Xóa hết thật không?',
  'account.savesCleared': 'Đã xóa {count} bản lưu.',
  'account.delete': 'Xóa',
  'account.confirmDelete': 'Xóa thật không?',
  'account.avatar': 'Ảnh đại diện',
  'account.chooseImage': 'Chọn ảnh',
  'account.clearAvatar': 'Bỏ ảnh đại diện',
  'account.uploading': 'Đang tải lên…',
  'account.avatarSaved': 'Đã cập nhật ảnh đại diện.',
  'account.avatarCleared': 'Đã bỏ ảnh đại diện.',
  'account.avatarHint': 'PNG, JPEG, WebP hoặc GIF, tối đa 2 MB.',
  'account.gender': 'Giới tính',
  'account.genderNone': 'Chưa đặt',
  'account.genderMale': 'Nam',
  'account.genderFemale': 'Nữ',
  'account.genderSaved': 'Đã lưu.',
  'account.genderHint': 'Không bắt buộc — chỉ bạn thấy.',
  'account.passwordTabHint':
    'Sau khi đổi, bạn vẫn đăng nhập trên thiết bị này — không cần đăng nhập lại.',
  'account.password': 'Mật khẩu',
  'account.oldPassword': 'Mật khẩu hiện tại',
  'account.newPassword': 'Mật khẩu mới',
  'account.confirmPassword': 'Nhập lại mật khẩu mới',
  'account.savePassword': 'Đổi mật khẩu',
  'account.saving': 'Đang lưu…',
  'account.passwordSaved': 'Đã đổi mật khẩu.',
  'account.passwordHint':
    'Sau khi đổi, bạn vẫn đăng nhập trên thiết bị này. Các thiết bị khác vẫn dùng được cho tới khi phiên đăng nhập của chúng hết hạn.',
  'account.error.missingOld': 'Hãy nhập mật khẩu hiện tại.',
  'account.error.wrongPassword': 'Mật khẩu hiện tại không đúng.',
  'account.error.passwordTooShort': 'Mật khẩu mới quá ngắn (ít nhất 6 ký tự).',
  'account.error.passwordTooLong': 'Mật khẩu mới quá dài (tối đa 72 ký tự).',
  'account.error.passwordHasSpace': 'Mật khẩu mới không được chứa dấu cách.',
  'account.error.mismatch': 'Hai mật khẩu mới không khớp nhau.',
  'account.error.avatarMissing': 'Hãy chọn ảnh trước.',
  'account.error.avatarTooLarge': 'Ảnh này quá lớn (tối đa 2 MB).',
  'account.error.avatarType': 'Định dạng không hỗ trợ — hãy dùng PNG, JPEG, WebP hoặc GIF.',

  /* 在线库列表上那排筛选：机种 + 搜索（客户端过滤，不再打接口） */
  'games.filterAll': 'Tất cả',
  'games.searchPlaceholder': 'Tìm theo tên / nhà phát triển / dòng game',
  'games.search': 'Tìm kiếm',
  'games.noMatch': 'Không có game nào khớp.',
  'games.prev': 'Trước',
  'games.next': 'Sau',
  /* 加载速度提示：和英文 / 日语一样**留空串** —— 那句话是说给「文件在境外」的读者听的，
     越南语界面下的读者多半就在境外，这条既没用又显得莫名其妙（组件按「空串不渲染」处理）。 */
  'games.remoteSlow': '',

  /* 地板上那张纸片 */
  'note.text': 'Mong ta tìm lại được niềm vui của tuổi thơ..',
  'note.open': 'Đọc mẩu giấy trên sàn',
  'note.title': 'Một mẩu giấy',
  'note.close': 'Đóng',
  'window.cycle': 'Đổi mùa bên ngoài cửa sổ',
  /* 墙上那幅挂画：画名和作者只有这一个出处，第七幅照原文写「不知从哪来的无名画作」 */
  'painting.open': 'Nhìn gần bức tranh',
  'painting.close': 'Đóng',
  'painting.title.sunflowers': 'Hoa hướng dương',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'Mona Lisa',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'Đêm đầy sao',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'Tiếng thét',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'Thiếu nữ đeo hoa tai ngọc trai',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'Sóng lớn ngoài khơi Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Bức tranh vô danh chẳng rõ từ đâu',
  'painting.artist.unknown': 'Vô danh',
  /* 地板上那台 MP4：整台机器就是一个按钮，这两条是它的无障碍名字 */
  'mp4.play': 'Phát một bài trên máy MP4',
  'mp4.pause': 'Dừng máy MP4',
  /* 逗猫棒（彩蛋开关）+ 七条猫的品种名，只当那只猫的无障碍名字用 */
  'cat.wand': 'Lắc cần câu mèo trên sàn',
  'cat.ragdoll': 'Một chú mèo Ragdoll thò đầu ra từ sau đống sách',
  'cat.siamese': 'Một chú mèo Xiêm thò đầu ra từ sau đống sách',
  'cat.tabby': 'Một chú mèo mướp thò đầu ra từ sau đống sách',
  'cat.orange': 'Một chú mèo mướp vàng thò đầu ra từ sau đống sách',
  'cat.american': 'Một chú mèo lông ngắn Mỹ thò đầu ra từ sau đống sách',
  'cat.tuxedo': 'Một chú mèo tuxedo thò đầu ra từ sau đống sách',
  'cat.calico': 'Một chú mèo tam thể thò đầu ra từ sau đống sách',

  /* 地上那本留言本（列表正文是用户写的，一律走系统字体） */
  'feedback.open': 'Mở sổ lưu bút trên sàn',
  'feedback.title': 'Sổ lưu bút',
  'feedback.close': 'Đóng',
  'feedback.placeholder': 'Viết gì đó đi — một góp ý, hay một game bạn muốn thấy ở đây…',
  'feedback.submit': 'Gửi',
  'feedback.submitting': 'Đang gửi…',
  'feedback.ok': 'Đã đăng — cảm ơn bạn!',
  'feedback.required': 'Hãy viết gì đó trước.',
  'feedback.failed': 'Không gửi được — hãy thử lại.',
  'feedback.loading': 'Đang tải…',
  'feedback.empty': 'Chưa có lời nhắn nào — hãy là người đầu tiên.',
  'feedback.retry': 'Thử lại',
  'feedback.prev': 'Trước',
  'feedback.next': 'Sau',
  'feedback.page': 'Trang {n}',
  'feedback.resolved': 'Đã xử lý',
  'feedback.unresolved': 'Chưa xử lý',

  /* 隐私政策 / 服务条款：正文在 lib/legal.ts，这里只有房间界面要用的几个词 */
  'legal.privacy': 'Chính sách quyền riêng tư',
  'legal.terms': 'Điều khoản dịch vụ',
  'legal.updated': 'Cập nhật lần cuối {date}',
  'legal.contact': 'Liên hệ:',

  /* 初次打开的操作指引（两步）。刻意不剧透彩蛋 */
  'tour.title': 'Hướng dẫn nhanh',
  'tour.skip': 'Bỏ qua',
  'tour.back': 'Quay lại',
  'tour.next': 'Tiếp',
  'tour.done': 'Bắt đầu chơi',
  'tour.replay': 'Xem lại hướng dẫn',
  'tour.screen.title': 'Bắt đầu với một game',
  'tour.screen.body':
    'Kéo một file ROM (.nes, .sfc, .gba, .md, .gb …) hoặc file .zip arcade lên TV, hoặc bấm vào màn hình để chọn file. Repo này không kèm ROM — hãy dùng ROM của bạn.',
  'tour.rail.title': 'Dãy công tắc bên phải',
  /* 语言那一项照 `theme` / `tvSize` 的写法把选项念出来 —— 现在多了一档 Tiếng Việt */
  'tour.rail.body':
    'Ba nhóm, từ trên xuống. Hiển thị: chế độ (ban đêm / ban ngày), ngôn ngữ (中文 / English / 日本語 / 한국어 / Tiếng Việt), toàn màn hình (chỉ màn hình game vào toàn màn hình), chế độ tối giản (chỉ giữ tường, TV, bàn và sàn), cỡ TV (mở bảng chọn lớn / vừa / nhỏ — bàn cũng rộng ra theo). Game: chơi qua mạng, gán phím. Trợ giúp: hướng dẫn phím, sổ lưu bút.',

  'topLinks.label': 'Các trang của site',
  'topLinks.games': 'Danh sách game',
  'menu.open': 'Mở menu',
  'menu.close': 'Đóng menu',
  'menu.theme': 'Chế độ',
  'menu.simple': 'Chế độ tối giản',

  /* 「离开房间」确认 */
  'leave.title': 'Rời trang này?',
  'leave.bodyGame': 'Game đang chạy sẽ bị ngắt — tiến trình không được lưu.',
  'leave.bodyNetplay': 'Bạn sẽ rời phòng chơi mạng, và người chơi cùng sẽ bị ngắt kết nối.',
  'leave.stay': 'Ở lại',
  'leave.confirm': 'Rời đi',

  'gamesPage.heading': 'Tất cả game',
  'gamesPage.intro':
    'Thư viện trực tuyến có {count} game — NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade và nhiều hơn nữa. Bấm vào bìa để xem chi tiết, hoặc chơi ngay.',
  'gamesPage.empty': 'Thư viện đang trống.',
  'gamesPage.introConsole':
    'Thư viện có {count} game {console}. Bấm vào bìa để xem chi tiết, hoặc chơi ngay.',
  'gamesPage.filterLabel': 'Lọc theo hệ máy',
  'gamesPage.filterAll': 'Tất cả',
  'gamesPage.consoleEmpty': 'Thư viện chưa có game {console} nào.',
  'gamesPage.searchLabel': 'Tìm trong thư viện game',
  'gamesPage.searchPlaceholder': 'Tìm theo tên / nhà phát triển / dòng game',
  'gamesPage.searchSubmit': 'Tìm kiếm',
  'gamesPage.searchLoading': 'Đang tìm…',
  'gamesPage.searchClear': 'Xóa tìm kiếm',
  'gamesPage.searchResults': '“{keyword}” — {count} game khớp.',
  'gamesPage.searchEmpty': 'Không có game nào khớp “{keyword}”. Hãy thử từ ngắn hơn, hoặc tên game.',
  'gamesPage.prev': 'Trước',
  'gamesPage.next': 'Sau',
  'gamesPage.backHome': 'Về trang chủ',
  'gamesPage.backToGames': 'Tất cả game',
  'common.back': 'Quay lại',
  'common.home': 'Trang chủ',
  'gamesPage.play': 'Chơi ngay',
  'gamesPage.download': 'Tải ROM',
  'gamesPage.share': 'Chia sẻ game này',
  'gamesPage.shareCopied': 'Đã sao chép liên kết',
  'gamesPage.shareFailed': 'Sao chép thất bại',
  'gamesPage.favorite': 'Thêm vào yêu thích',
  'gamesPage.unfavorite': 'Bỏ khỏi yêu thích',
  'gamesPage.favoriteSignIn':
    'Đăng nhập để lưu game yêu thích — dùng nút đăng nhập trên thanh trên cùng.',
  'gamesPage.favoriteFailed': 'Không cập nhật được yêu thích — hãy thử lại.',
  'gamesPage.favoriteCount': '{n} người yêu thích',
  'gamesPage.report': 'Báo lỗi',
  'gamesPage.reportTitle': 'Báo lỗi',
  'gamesPage.reportSubject': 'Về: {name}',
  'gamesPage.reportPlaceholder':
    'Lỗi gì vậy? Ví dụ: không khởi động, hình bị vỡ, không có tiếng…',
  'gamesPage.reportSubmit': 'Gửi báo cáo',
  'gamesPage.reportSubmitting': 'Đang gửi…',
  'gamesPage.reportOk': 'Đã nhận — cảm ơn bạn.',
  'gamesPage.reportRequired': 'Hãy mô tả lỗi trước.',
  'gamesPage.reportFailed': 'Không gửi được — hãy thử lại.',
  'gamesPage.reportClose': 'Hủy',

  /* 详情页的评论模块。发评论必须先登录，所以这里多出一组登录相关文案 */
  'comments.heading': 'Bình luận',
  'comments.count': '{n} bình luận',
  'comments.empty': 'Chưa có bình luận nào — hãy là người đầu tiên.',
  'comments.placeholder': 'Bạn nghĩ gì về game này?',
  'comments.ratingLabel': 'Đánh giá của bạn',
  'comments.ratingStar': 'Chấm {n} trên 5',
  'comments.ratingValue': '{n} trên 5 sao',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Hãy chọn số sao trước.',
  'comments.submit': 'Gửi bình luận',
  'comments.submitting': 'Đang gửi…',
  'comments.ok': 'Đã đăng — bình luận nằm ở đầu danh sách.',
  'comments.required': 'Hãy viết gì đó trước khi gửi.',
  'comments.failed': 'Không gửi được — hãy thử lại.',
  'comments.signInLead': 'Đăng nhập để gửi bình luận.',
  'comments.signIn': 'Đăng nhập',
  'comments.signInRequired': 'Hãy đăng nhập lại để gửi.',
  'comments.loading': 'Đang tải bình luận…',
  'comments.retry': 'Thử lại',
  'comments.loadFailed': 'Không tải được bình luận.',
  'comments.loadMore': 'Xem thêm',
  'comments.delete': 'Xóa',
  'comments.deleteConfirm': 'Xác nhận',
  'comments.cancel': 'Hủy',
  'comments.deleted': 'Đã xóa bình luận.',
  'comments.deleteFailed': 'Không xóa được — hãy thử lại.',

  'gamesPage.field.console': 'Hệ máy',
  'gamesPage.field.year': 'Năm phát hành',
  'gamesPage.field.developer': 'Nhà phát triển',
  'gamesPage.field.series': 'Dòng game',
  'gamesPage.field.language': 'Ngôn ngữ',
  'gamesPage.controls': 'Cách điều khiển',
  'gamesPage.selectLanguage': 'Chọn ngôn ngữ',

  'notFound.title': 'Không tìm thấy trang',
  'notFound.description':
    'Địa chỉ đó không tồn tại trên {site}. Hãy kiểm tra lại liên kết, hoặc về trang chủ.',
  'gamesPage.notFoundTitle': 'Không tìm thấy game',
  'gamesPage.notFound': 'Game này không có trong thư viện (nữa).',
  'gamesPage.fallbackDescription': '{title} là một game {console}.',

  'developersPage.heading': 'Nhà phát triển',
  'developersPage.intro':
    '{count} nhà phát triển đứng sau các game trong thư viện. Mở một nhà phát triển để xem mọi tựa game của studio đó.',
  'developersPage.empty': 'Chưa có nhà phát triển nào.',
  'developersPage.gameCount': '{count} game',
  'developersPage.gamesHeading': 'Game của {name}',
  'developersPage.gamesEmpty': 'Thư viện chưa có game nào của nhà phát triển này.',
  'developersPage.field.founded': 'Thành lập',
  'developersPage.backToDevelopers': 'Tất cả nhà phát triển',
  'developersPage.notFoundTitle': 'Không tìm thấy nhà phát triển',
  'developersPage.notFound': 'Nhà phát triển này không có trong thư viện (nữa).',

  'consolesPage.heading': 'Hệ máy',
  'consolesPage.intro':
    'Các hệ máy trong thư viện — tổng cộng {count} game. Mở một hệ để xem toàn bộ game của hệ đó.',
  'consolesPage.gameCount': '{count} game',
  'consolesPage.gamesHeading': 'Game trên {name}',
  'consolesPage.gamesEmpty': 'Thư viện chưa có game nào cho hệ máy này.',
  /* 按语种筛了却一款都没有（`{lang}` 来自 lib/rom-lang.ts 的语言全称，如 English） */
  'consolesPage.gamesEmptyLang': 'Hệ máy này chưa có game {lang} nào.',
  'consolesPage.filterLangLabel': 'Lọc theo ngôn ngữ',
  'consolesPage.field.released': 'Năm phát hành',
  'consolesPage.backToConsoles': 'Tất cả hệ máy',
  'consolesPage.notFoundTitle': 'Không tìm thấy hệ máy',
  'consolesPage.notFound': 'Hệ máy này không thuộc site (nữa).',

  'download.heading': 'Tải ROM',
  'download.hint': 'Bấm nút bên dưới — sau 6 giây quá trình tải sẽ bắt đầu.',
  'download.button': 'Bắt đầu tải',
  'download.waiting': 'Bắt đầu sau {seconds} giây…',
  'download.started': 'Đã bắt đầu tải — hãy kiểm tra mục tải xuống của trình duyệt.',
  'download.rights': 'Chỉ tải những file ROM mà bạn có quyền sử dụng.',
  'download.disclaimer':
    'Miễn trừ trách nhiệm: mọi file ROM trên trang này đều được thu thập từ bên thứ ba, chỉ dành cho mục đích học tập cá nhân và nghiên cứu sao lưu. Bản quyền thuộc về chủ sở hữu gốc; nếu có nội dung xâm phạm quyền của bạn, vui lòng liên hệ để chúng tôi gỡ bỏ.',

  /* 房间页那条 `?id=` 深链：从详情页点「开始游戏」过来，但库里已经没有这条了 */
  'deepLink.notFound': 'Không tìm thấy game đó — có thể nó đã bị xóa.',
  'deepLink.title': 'Đang nạp game',
  'deepLink.loading': 'Đang tải ROM…',
  'deepLink.hint': 'Tự động bắt đầu khi tải xong.',
};

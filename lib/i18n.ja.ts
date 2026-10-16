/**
 * 日语界面文案（2026-10-16 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再塞两张进来会把它冲到七千行，谁都翻不动。理由和 `lib/legal.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致**，`zh` / `ko` 同理。
 *    改文案时先改 `en`，再回来对齐另外三份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的日文在数据库里
 *    （`game_texts` 的 `ja` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` …），
 *    它们由 `translate()` 在运行时替换；漏掉一个不会报错，只会在页面上少一段字。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → 機種；developer → 開発元；series → シリーズ
 *   · cartridge → カセット；room → ルーム；host → ホスト；guest → ゲスト
 *   · netplay → 通信対戦；save → セーブ；key bindings → キー設定
 *   · game library → ゲームライブラリ；guestbook → 伝言板
 *
 * ⚠️ 机种名用**日语里通行的写法**（SFC / ゲームボーイ / メガドライブ / アーケード），
 *    只有 NES / GBA / NDS 这类缩写保持原样 —— 和站内机种列表（`consoles` 表，
 *    目前只有中英两份，日语界面回退英文名）能对得上。
 */

import type { MessageKey } from './i18n';

export const ja: Record<MessageKey, string> = {
  'meta.title': '{site} — ブラウザで遊ぶレトロゲーム：NES・SFC・GBA・アーケード',
  'meta.description':
    'NES、SFC、ゲームボーイ、GBA、メガドライブ、アーケードなどのレトロゲームをブラウザでそのまま遊べます。オンラインライブラリから選ぶか、手持ちの ROM ファイルを読み込んでください。',
  'meta.keywords':
    'レトロゲーム, オンラインレトロゲームライブラリ, NES エミュレータ, ファミコン エミュレータ, SFC エミュレータ, スーパーファミコン エミュレータ, GBA エミュレータ, ゲームボーイアドバンス, ゲームボーイ エミュレータ, ゲームボーイカラー エミュレータ, NDS エミュレータ, ニンテンドーDS エミュレータ, メガドライブ エミュレータ, ジェネシス エミュレータ, ゲームギア エミュレータ, マスターシステム エミュレータ, 32X エミュレータ, ワンダースワン エミュレータ, ネオジオポケット エミュレータ, プレイステーション エミュレータ, PS1 エミュレータ, PSX エミュレータ, アーケード エミュレータ, ブラウザで遊ぶ, ブラウザ エミュレータ, RetroArch WASM, {site}',
  'seo.room.title': 'ピクセルの部屋 — ブラウザで遊ぶレトロゲーム',
  'seo.room.description':
    'ピクセルの部屋へようこそ。NES、SFC、ゲームボーイ、GBA、メガドライブ、アーケードのゲームがブラウン管で動きます。オンラインライブラリから選ぶか、手持ちの ROM ファイルを画面にドロップしてください。',
  'seo.login.title': 'ログイン',
  'seo.login.description':
    'ログインすると、セーブデータ・プレイ履歴・お気に入りが端末をまたいで同期されます。',
  'home.hero.title': 'ブラウザで遊ぶ名作レトロゲーム',
  'home.hero.lead':
    '{site}では NES、SFC、ゲームボーイ、GBA、メガドライブ、アーケードなど十数機種のゲームをオンラインで遊べます。2人での通信対戦にも対応。',
  'home.hero.play': 'ローカルの ROM を読み込む',
  'home.hero.browse': 'すべてのゲームを見る',
  'home.join.title': '友だちと一緒に遊ぶ',
  'home.join.hint': '友だちが共有した4文字のルームコードを入力すると、通信対戦に参加できます。',
  'home.join.submit': 'ルームに参加',
  'home.hero.or': 'または',
  'home.search.label': 'ゲームライブラリを検索',
  'home.search.placeholder': 'タイトル / 開発元 / シリーズで検索',
  'home.search.submit': '検索',
  'home.consoles.title': '機種から探す',
  'home.consoles.lead':
    'NES、SFC、ゲームボーイ、GBA、メガドライブ、アーケードなど十数機種 — 選ぶとその機種のゲームが並びます。',
  'home.consoles.count': '{count} 本のゲーム',
  'home.consoles.all': 'すべての機種',
  'home.latest.title': '新着ゲーム',
  'home.latest.lead': '最近追加されたゲームです。',
  'home.latest.viewAll': 'すべてのゲーム',
  'home.developers.title': '開発元から探す',
  'home.developers.lead': 'ここに登録されているゲームが多い開発元です。',
  'home.developers.viewAll': 'すべての開発元',
  'home.empty':
    'ライブラリはまだ空です — 部屋を開いて ROM をブラウン管にドロップすると遊べます。',
  'home.faq.title': 'よくある質問',
  'home.faq.q1': '無料ですか？',
  'home.faq.a1':
    'すべて無料で遊べます。ログインすると、プレイ履歴とセーブデータをクラウドに保存できます。',
  'home.faq.q2': '何かインストールが必要ですか？',
  'home.faq.a2': '不要です。ゲームをクリックすれば、そのままブラウザで遊べます。',
  'home.faq.q3': 'スマホやタブレットでも遊べますか？',
  'home.faq.a3': 'はい。スマホやタブレットのブラウザでもそのまま遊べます。',
  'home.faq.q4': 'ROM ファイルはダウンロードできますか？',
  'home.faq.a4':
    'はい。各ゲームのページにダウンロードボタンがあります。利用する権利のある ROM だけをダウンロードしてください。',
  'home.faq.q5': '友だちと一緒に遊べますか？',
  'home.faq.a5': 'もちろんです。友だちを誘ってルームを立てれば、そのまま対戦できます。',
  'home.faq.q6': 'ゲームパッドに対応していますか？',
  'home.faq.a6':
    '対応しています。USB か Bluetooth のパッドを接続すると、ブラウザ経由でエミュレータがそのまま認識します。ボタンの割り当ては各コアの初期値に従います。スマホでは画面上のボタンを使います。',
  'seo.heading': 'ブラウザでレトロゲームを遊ぶ',
  'seo.intro':
    '{site}はオンラインのレトロゲーム部屋です。NES、SFC、ゲームボーイ、GBA、メガドライブ、アーケードなどのゲームがブラウザ上でそのまま動きます — 実行はあなたの端末で、コアは WebAssembly にコンパイルされた RetroArch です。',
  'seo.howTo':
    'オンラインライブラリから選ぶか、手持ちの ROM ファイルをテレビにドロップしてください。インストールは不要です。',
  'seo.games.title': 'すべてのゲーム — NES・SFC・GBA・アーケードをオンラインで',
  'seo.games.description':
    'オンラインライブラリには {count} 本のレトロゲームがあり、すべてブラウザで遊べます：NES、SFC、ゲームボーイ、GBA、メガドライブ、アーケードなど。タイトルを開けば詳細が見られ、すぐに遊べます。ROM ファイルのダウンロードもできます。',
  'seo.games.search.title': '「{keyword}」の検索結果',
  'seo.games.search.description':
    'オンラインライブラリで「{keyword}」に一致するゲームは {count} 本です。ブラウザで遊ぶことも、ROM ファイルをダウンロードすることもできます。',
  'seo.games.console.title': '{console} のゲーム — ブラウザでオンラインプレイ',
  'seo.games.console.description':
    'オンラインライブラリにある {count} 本の {console} ゲーム。すべてブラウザで遊べ、ROM ファイルとしてダウンロードもできます。',
  'seo.game.title': '{title} — {console} をオンラインで遊ぶ',
  'seo.game.description':
    'ブラウザで『{title}』（{console}）をそのまま遊べます — 無料・インストール不要。ROM ファイルのダウンロードもできます。',
  'seo.gameDownload.title': '『{title}』の ROM をダウンロード（{console}）',
  'seo.gameDownload.description':
    '『{title}』（{console}）の ROM ファイルをワンクリックでダウンロード。登録は不要です。ブラウザでそのまま遊ぶこともできます。',
  'seo.developers.title': 'ゲーム開発元 — その NES・SFC・GBA・アーケード作品を遊ぶ',
  'seo.developers.description':
    'オンラインライブラリのゲームを手がけた {count} の開発元。開くとその会社の作品がすべて並びます。',
  'seo.developer.title': '{name} — この開発元のゲーム',
  'seo.developer.description':
    'オンラインライブラリにある {name} のゲーム全 {count} 本。ブラウザで遊ぶことも、ROM ファイルとしてダウンロードすることもできます。',
  'seo.consoles.title': '機種から探す — NES・SFC・GBA・アーケードをオンラインで',
  'seo.consoles.description':
    'オンラインライブラリの全機種（合計 {count} 本）。機種を選ぶとそのゲームがすべて並び、ブラウザでそのまま遊べます。',
  'seo.console.title': '{name} のゲーム — オンラインで遊ぶ',
  'seo.console.description':
    'オンラインライブラリにある {name} のゲーム全 {count} 本。ブラウザで遊ぶことも、ROM ファイルとしてダウンロードすることもできます。',

  'theme.toDark': 'ナイトモードに切り替える',
  'theme.toLight': 'デイモードに切り替える',
  'lamp.turnOn': '電気をつける',
  'lamp.turnOff': '電気を消す',
  'simple.enter': 'シンプルモード：壁・テレビ・机・床だけを残す',
  'simple.exit': 'シンプルモードを終了',
  'tvSize.open': 'テレビの大きさ',
  'tvSize.opt.large': '大',
  'tvSize.opt.medium': '中',
  'tvSize.opt.small': '小',
  'tvSize.pick': 'テレビの大きさを「{level}」にする',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': '言語',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟**当前页面语言**，只有那颗钮跟**目标语言**（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'このページは日本語です',
  'localePrompt.body': 'お使いのブラウザは別の言語を希望しています。切り替えますか？',
  'localePrompt.keep': '日本語のまま',
  'fullscreen.enter': 'ゲーム画面を全画面にする',
  'fullscreen.exit': '全画面を終了',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P）—— 那套字模没有假名，
   * 所以日语会落到系统字体上（globals.css 的 `.screen-hint-*` 补偿字号）。
   * 大写英文那几条（screen.tapLoad 等）在日语里同样改成本语言。
   */
  'screen.pick': 'クリックして ROM ファイルを選ぶか、ここにドロップ',
  'screen.srLabel': '実行する ROM ファイルを選ぶ',
  'screen.tapLoad': 'ローカルの ROM を読み込むにはクリック',
  'screen.orLibrary': 'またはオンラインライブラリから起動',
  'screen.release': '離すと読み込みます',
  'screen.mobileLibrary': 'ライブラリから起動',
  'screen.mobileTap': '画面をタップしてライブラリを開く',
  'screen.waitingHost': 'ホストの画面を待っています',
  'screen.paused': '一時停止中',
  'screen.resumeOnPanel': '本体パネルの再開ボタンを押してください',
  'screen.waitHostResume': 'ホストの再開を待っています',

  /* 机身面板那排钮 */
  'panel.resume': '再開',
  'panel.pause': '一時停止',
  'panel.save': 'セーブ',
  'panel.load': 'ロード',
  'panel.reset': 'リセット',
  'panel.eject': '取り出し',
  'volume.down': '音量を1段下げる',
  'volume.up': '音量を1段上げる',
  'volume.set': '音量を {max} 段中の {level} 段にする',

  'saves.title': 'セーブを読み込む',
  'saves.load': '読み込む',
  'saves.close': '閉じる',
  'saves.groupLocal': 'この端末',
  'saves.groupCloud': 'クラウド（アカウント）',
  'saves.deleteCloud': 'このクラウドセーブを削除',
  'saves.delete': '削除',
  'saves.loginHint':
    'ログインするとクラウドセーブが使え、別の端末でも続きから遊べます。',
  'saves.login': 'ログイン',
  'saves.loading': '読み込み中…',
  'saves.downloading': 'クラウドセーブをダウンロード中…',
  'saves.restoring': 'ゲームを復元中…',
  'saves.empty': 'セーブはまだありません',

  'library.removeLabel': '{name} を削除',

  'legend.moves': '移動',
  'legend.open': 'キー説明',
  'legend.title': 'キー説明',
  'legend.close': '閉じる',
  'legend.needZip':
    '形式  FBNeo が読めるのは .zip だけです — これは {ext} のようです。パックし直すか、.zip 版を用意してください',
  'play.needZip':
    '形式  この ROM は {ext} 形式のアーカイブで、展開できませんでした — .zip か非圧縮の ROM で試してください',
  'legend.needDisc':
    '形式  ディスクイメージは複数ファイル（.cue + .bin）です。当サイトは単一ファイルのみ対応 — .pbp か .iso のものを用意してください',
  'play.needDisc':
    '形式  これは複数ファイルのディスクイメージ（.cue + .bin）です。当サイトは単一ファイルのみ対応 — .pbp か .iso で試してください',
  'legend.needBios':
    'BIOS  これは Neo Geo のゲーム（KOF、メタルスラッグ…）のようです。neogeo.zip が必要です — そのファイルをページにドロップすると入ります。CPS1 / CPS2 のゲームには不要です。',
  'legend.gamepad':
    'ゲームパッド  つなげばそのまま使えます。通信対戦ではホストとゲストがそれぞれ1つずつ使えます。',

  'netplay.title': '通信対戦',
  'netplay.open': '通信対戦で遊ぶ',
  'netplay.close': '閉じる',
  'netplay.create': 'ルームを作る',
  'netplay.or': 'または',
  'netplay.join': '参加',
  'netplay.codePlaceholder': 'コード',
  'netplay.hint':
    '双方が公共の中継サーバーに到達できれば接続できます。同じ LAN が最も確実です。4文字のコードを相手に伝えてください。エミュレータを動かして画面を配信するのはホスト側で、ゲストは ROM がなくても遊べます。',
  'netplay.roomCode': 'ルームコード',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'インターネット',
  'netplay.wanDev': 'インターネット経由の通信対戦は開発中です。',
  'netplay.quality': '配信画質',
  'netplay.qualitySmooth': 'なめらか',
  'netplay.qualityBalanced': 'バランス',
  'netplay.qualitySharp': 'くっきり',
  'netplay.qualityHint':
    '画質はホスト側の負荷に直結します。バランスを推奨します。ホストのマシンが追いつかないとゲーム全体がスローになります。その場合は一段下げてください。この設定はホストにだけ効きます。',
  'netplay.copy': 'コピー',
  'netplay.copied': 'コピーしました',
  'netplay.share': '共有',
  'netplay.shareCopied': 'リンクをコピーしました',
  'netplay.inviteTitle': 'ルームへの招待',
  'netplay.inviteBody': 'ルーム {code} に参加しますか？',
  'netplay.inviteJoin': '参加',
  'netplay.inviteCancel': 'キャンセル',
  'netplay.connected': '接続しました',
  'netplay.waiting': '相手の参加を待っています',
  'netplay.joining': 'ルームに参加しています…',
  'netplay.waitingGame': '接続しました — ホストがカセットを挿すのを待っています',
  'netplay.hostPlaying': 'ホストがプレイ中',
  'netplay.paused': '一時停止中',
  'netplay.toastHost': '接続しました · 相手が入りました · あなたは 1P',
  'netplay.toastGuest': 'ホストに接続しました · あなたは 2P',
  'netplay.toastHostLeft': 'ホストが退出しました · ルームは閉じられました',
  'netplay.toastGuestLeft': '2P がルームを退出しました',
  'netplay.youAreHost':
    'あなたは 1P です。カセットを挿すと画面が相手に自動で配信されます。キーはご自身の設定がそのまま使われます — 現在の割り当ては「キー説明」で確認できます。',
  'netplay.youAreGuest':
    'あなたは 2P です。カセットは不要です — ホストが画面を配信し、あなたの入力はホストへ送られます。ご自身のキー設定（プレイヤー1 の組）かゲームパッドで遊べます — 現在の割り当ては「キー説明」で確認できます。',
  'netplay.leave': 'ルームを出る',
  'netplay.closeRoom': 'ルームを閉じる',
  'netplay.badCode': 'コードが正しくないようです — 4文字のはずです。',
  'netplay.errInsecure':
    '通信対戦には HTTPS か localhost が必要です。このページは http なので、ブラウザが依存している暗号化 API を提供しません。',
  'netplay.errNoDirect':
    '双方とも中継サーバーには到達しましたが、直接接続を確立できませんでした — 多くの場合 NAT かファイアウォールが原因です。同じ LAN が最も成功率が高いです。',
  'netplay.errPassword': 'ルームコードが一致しません。',
  'netplay.errHandshake': 'ハンドシェイクがタイムアウトしました — 相手が退出した可能性があります。',
  'netplay.errHostLeft': 'ホストがルームを出ました — ルームは閉じられました。',
  'netplay.errRoomFull': 'ルームは満員です — このゲームは1対1のみです。',
  'netplay.errUnknown':
    '相手に接続できませんでした。詳しい理由はブラウザのコンソールに出ています。',

  'seo.play.title': 'プレイルーム — ゲームを読み込んでオンラインで遊ぶ',
  'seo.play.description':
    '1画面でゲームを始められます。ひとりでそのまま遊ぶか、1対1のルームを立ててコードを共有してください。NES、SFC、ゲームボーイ、GBA、メガドライブ、アーケードに対応。',
  'play.modeSolo': 'ひとりで',
  'play.start': 'スタート',
  'play.confirmStart': '確定してスタート',
  'play.confirm': '確定',
  'play.qualityIntro': '回線に合わせて、通信対戦の配信画質を選んでください。',
  'play.qualityHint.smooth': '30 fps · 通信量が少なめ。回線が遅いときに向きます。',
  'play.qualityHint.balanced': '最大 720p / 60 fps · 画質と動きのなめらかさの両立。',
  'play.qualityHint.sharp':
    '最大 60 fps · 元の解像度とドットの細かさを優先。高速な回線向けで、回線が細いとフレームレートが落ちることがあります。',
  'play.qualityConfirmHint':
    '確定するとルームに接続します。ホストがゲームを読み込み、ゲストにはホストの画面が届きます。',
  'play.connecting': '接続中…',
  'play.confirmJoin': '確定して参加',
  'play.cancel': 'キャンセル',
  'play.screenSize': '画面サイズ',
  'play.controlsTitle': 'ゲーム操作',
  'play.netplayKeysHint':
    '通信対戦では、それぞれの端末のプレイヤー1 のキーを使います。',
  'play.cancelled': '読み込みをキャンセルしました。',
  'play.retry': 'もう一度読み込む',
  'play.retryJoin': 'もう一度参加する',
  'play.saved': 'セーブしました。',
  'play.localSaving': 'セーブ中…',
  'play.uploading': 'クラウドへアップロード中…',
  'play.cloudFailed': 'クラウド同期に失敗しました。',
  'play.tooLarge': 'セーブが大きすぎます',
  'play.theme': 'モード',
  'play.saveFailed': 'セーブできませんでした。もう一度お試しください。',
  'play.loadFailed': 'セーブを読み込めませんでした。もう一度お試しください。',
  'play.leftRoom': 'ルームを退出しました。',
  'play.latency': '遅延',
  'play.measuringLatency': '計測中…',
  'play.downloading': 'ROM をダウンロード中…',
  'play.booting': 'コアを起動中…',
  'play.loadFail': 'このカセットは読み込めませんでした。',
  'play.notFound': 'そのゲームは見つかりませんでした。',
  'play.fullscreen': '全画面',
  'play.volume': '音量',
  'play.edit': '編集',
  'play.hint': 'Esc で全画面を終了します。ほかの操作は右側にあります。',
  'play.leaveTitle': 'ゲームプレイ中',
  'play.leaveBody': '戻るとこのプレイは終了します — 進行状況は自動保存されません。',
  'play.leaveStay': '続ける',
  'play.leaveGo': '退出して戻る',
  'gamesPage.playOnline': '通信対戦',

  'keybind.title': 'キー設定',
  'keybind.open': 'キー設定',
  'keybind.close': '閉じる',
  'keybind.p1': 'プレイヤー1',
  'keybind.p2': 'プレイヤー2',
  'keybind.mine': 'あなたのキー',
  'keybind.pressKey': '新しいキーを押す…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': '初期値に戻す',
  'keybind.reload': 'カセットを再読み込み',
  'keybind.reloading': '再読み込み中…',
  'keybind.unsupported': 'このキーは使えません — 別のキーを試してください。',
  'keybind.conflictSame':
    '{pressed} はすでに {button} ボタンに割り当てられています — 別のキーを試してください。',
  'keybind.conflictOther':
    '{pressed} はすでにプレイヤー{player} の {button} ボタンに割り当てられています — 別のキーを試してください。',
  'keybind.hint':
    'キーボードの割り当てはカセットを挿したときに一度だけ読み込まれます — 変更を反映するにはカセットを再読み込みしてください。2人のプレイヤーが同じキーを共有することはできません。',
  'keybind.soloHint':
    'キーボードの割り当てはカセットを挿したときに一度だけ読み込まれます — 変更を反映するにはカセットを再読み込みしてください。',
  'keybind.hostHint':
    'あなたはホストです。プレイヤー1 がご自身のキー、プレイヤー2 はゲストの入力を注入する先です。同じキーにすると、注入があなたのプレイヤー1 まで動かしてしまいます。変更後はカセットを再読み込みしてください。',
  'keybind.guestHint':
    'あなたはゲストで、ご自身のキー設定（プレイヤー1 の組）で遊びます — 2人はそれぞれ別のキーボードの前にいるので、取り合いにはなりません。変更はすぐ反映され、カセットの再読み込みは不要です。',
  'keybind.guestLocalHint':
    'あなたはゲストで、この端末でも自分のカセットが動いています。あなたのキーはプレイヤー1 の組です。この端末のカセットはその組を読むので、変更後は再読み込みが必要です。ホストへ送られる入力も同じ組で、そちらはすぐ反映されます。',

  'games.open': 'ゲームライブラリ',
  'games.title': 'ゲームライブラリ',
  'games.close': '閉じる',
  'games.empty': 'ライブラリは空です — まだ何もアップロードされていません',
  'games.loading': '読み込み中…',
  'games.loadingRom': '{name} を読み込み中…',
  'games.cancel': 'キャンセル',
  'games.failed': 'ゲームライブラリを読み込めませんでした',
  'games.tabLibrary': 'ゲームライブラリ',
  'games.tabHistory': '履歴',
  'games.historyEmpty': 'まだゲームライブラリから読み込んだことはありません',
  'games.historyLoad': '{name}\nクリックで再読み込み',
  'games.tabFavorites': 'お気に入り',
  'games.favorite': '「{name}」をお気に入りに追加',
  'games.unfavorite': '「{name}」をお気に入りから外す',
  'games.favoritesEmpty': 'お気に入りはまだありません — カバー左上の星を押すと追加できます。',
  'games.favoritesSignInBefore': 'ログインするとお気に入りを保存できます — ',
  'games.favoritesSignInLink': 'ログイン',
  'games.favoritesSignInAfter': ' するか、右上のアカウントボタンからどうぞ。',

  'user.title': 'アカウント',
  'user.close': '閉じる',
  'user.open': 'アカウント — ログイン / 新規登録',
  'user.openSignedIn': 'アカウント：{name}',
  'user.tabLogin': 'ログイン',
  'user.tabRegister': '新規登録',
  'user.username': 'ユーザー名',
  'user.password': 'パスワード',
  'user.usernameHint': '3〜20文字：英数字と _ - . が使えます',
  'user.emailLabel': 'メールアドレス',
  'user.emailHint': 'メールアドレスで登録します。エイリアスや一時メールは使えません。',
  'user.passwordHint': '6文字以上、空白は使えません。',
  'user.signIn': 'ログイン',
  'user.signUp': '新規登録',
  'user.signingIn': 'ログイン中…',
  'user.signingUp': '登録中…',
  'user.signOut': 'ログアウト',
  'user.signedInAs': 'ログイン中：{name}',
  'user.cloudHint':
    'プレイ履歴・セーブデータ・お気に入りはアカウントに保存されます — オンラインライブラリからゲームを開けば自動で同期されます。',
  'user.formLead':
    'ログインすると、セーブデータ・プレイ履歴・お気に入りがクラウドに保存され、いつでもどこでもすぐ遊べます！',
  'user.consentLogin': 'ログインすると、次に同意したものとみなされます：',
  'user.consentRegister': 'アカウントを作成すると、次に同意したものとみなされます：',
  'user.consentMiddle': ' および ',
  'user.consentAfter': '。',
  'user.error.failed': '問題が発生しました — もう一度お試しください。',
  'user.error.missingCredentials': 'ユーザー名とパスワードを入力してください。',
  'user.error.usernameInvalid': 'ユーザー名に使えるのは英数字と _ - . だけです',
  'user.error.usernameTooShort': 'ユーザー名が短すぎます（3文字以上）。',
  'user.error.usernameTooLong': 'ユーザー名が長すぎます（20文字以内）。',
  'user.error.usernameTaken': 'そのユーザー名は使われています — 別の名前をどうぞ。',
  'user.error.emailInvalid': '有効なメールアドレスを入力してください。',
  'user.error.emailAlias':
    'エイリアスメール（name+tag@… や Gmail のドット付きなど）は使えません。',
  'user.error.emailTemp':
    '使い捨てメールは使えません — 普段お使いのメールアドレスをご利用ください。',
  'user.error.passwordInvalid': 'パスワードを入力してください。',
  'user.error.passwordTooShort': 'パスワードが短すぎます（6文字以上）。',
  'user.error.passwordTooLong': 'パスワードが長すぎます（72文字以内）。',
  'user.error.passwordHasSpace': 'パスワードに空白は使えません。',
  'user.error.invalidCredentials': 'ユーザー名かパスワードが違います。',
  'user.error.banned': 'このアカウントは停止されています。',
  'user.error.captchaRequired': '先に人間確認を完了してください。',
  'user.error.captchaFailed': '人間確認に失敗しました — もう一度お試しください。',
  'login.lead':
    'ログインすると、セーブデータ・プレイ履歴・お気に入りがクラウドに保存され、いつでもどこでもすぐ遊べます！アカウントをお持ちでない方は新規登録。',

  'account.title': 'マイページ',
  'account.loading': '読み込み中…',
  'account.failed': '問題が発生しました — もう一度お試しください。',
  'account.since': '{time} から利用',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': '一般',
  'account.vipUntil': 'VIP 有効期限 {time}',
  'account.vipExpired': 'VIP は {time} に失効しました',
  'account.tabFavorites': 'お気に入り',
  'account.tabHistory': '履歴',
  'account.tabSaves': 'セーブデータ',
  'account.tabProfile': 'プロフィール',
  'account.tabPassword': 'パスワード',
  'account.favoritesLoading': 'お気に入りを取得中…',
  'account.historyLoading': '履歴を取得中…',
  'account.savesLoading': 'セーブデータを取得中…',
  'account.favoritesEmpty':
    'お気に入りはまだありません — 部屋のゲームライブラリでカバー左上の星を押すと追加できます。',
  'account.unfavorite': '「{name}」をお気に入りから外す',
  'account.historyEmpty':
    'プレイ履歴はまだありません — オンラインライブラリから開いたゲームがここに並びます。',
  'account.historyCount': '最近遊んだ {count} 本',
  'account.historyDeleted': '履歴から削除しました。',
  'account.clearHistory': 'すべて消す',
  'account.confirmClearHistory': '本当に消しますか？',
  'account.historyCleared': '履歴を消しました。',
  'account.historyHint':
    '履歴は最近遊んだ {max} 本を保持します — 古いものを遊び直すと先頭に戻ります。',
  'account.savesEmpty': 'クラウドセーブはまだありません。',
  'account.savesCount': '合計 {count} 件のセーブ',
  'account.savesGroupCount': '{count} 件のセーブ',
  'account.viewGame': '『{name}』を見る',
  'account.savesHint':
    'セーブは1ゲームにつき1件です — もう一度セーブすると上書きされます。端末とクラウドで同じ扱いです。',
  'account.saveDeleted': 'セーブを削除しました。',
  'account.clearSaves': 'すべて消す',
  'account.confirmClearSaves': '本当に消しますか？',
  'account.savesCleared': '{count} 件のセーブを消しました。',
  'account.delete': '削除',
  'account.confirmDelete': '本当に削除しますか？',
  'account.avatar': 'アイコン',
  'account.chooseImage': '画像を選ぶ',
  'account.clearAvatar': 'アイコンを外す',
  'account.uploading': 'アップロード中…',
  'account.avatarSaved': 'アイコンを更新しました。',
  'account.avatarCleared': 'アイコンを外しました。',
  'account.avatarHint': 'PNG / JPEG / WebP / GIF、2 MB まで。',
  'account.gender': '性別',
  'account.genderNone': '未設定',
  'account.genderMale': '男性',
  'account.genderFemale': '女性',
  'account.genderSaved': '保存しました。',
  'account.genderHint': '任意 — ご本人にしか表示されません。',
  'account.passwordTabHint': '変更後もこの端末のログインは維持されます — 入り直す必要はありません。',
  'account.password': 'パスワード',
  'account.oldPassword': '現在のパスワード',
  'account.newPassword': '新しいパスワード',
  'account.confirmPassword': '新しいパスワード（確認）',
  'account.savePassword': 'パスワードを変更',
  'account.saving': '保存中…',
  'account.passwordSaved': 'パスワードを変更しました。',
  'account.passwordHint':
    '変更後もこの端末のログインは維持されます。ほかの端末は、それぞれのログイン状態が切れるまで有効です。',
  'account.error.missingOld': '現在のパスワードを入力してください。',
  'account.error.wrongPassword': '現在のパスワードが違います。',
  'account.error.passwordTooShort': '新しいパスワードが短すぎます（6文字以上）。',
  'account.error.passwordTooLong': '新しいパスワードが長すぎます（72文字以内）。',
  'account.error.passwordHasSpace': '新しいパスワードに空白は使えません。',
  'account.error.mismatch': '2つの新しいパスワードが一致しません。',
  'account.error.avatarMissing': '先に画像を選んでください。',
  'account.error.avatarTooLarge': 'この画像は大きすぎます（2 MB まで）。',
  'account.error.avatarType': '対応していない形式です — PNG / JPEG / WebP / GIF をお使いください。',

  'games.filterAll': 'すべて',
  'games.searchPlaceholder': 'タイトル / 開発元 / シリーズで検索',
  'games.search': '検索',
  'games.noMatch': '一致するゲームがありません。',
  'games.prev': '前へ',
  'games.next': '次へ',
  /*
   * 在线库的加载速度提示。**日语同样是空串** —— 那句话是说给「文件在境外」的读者听的，
   * 日语界面下的读者多半就在境外，这条既没用又显得莫名其妙（理由与英文那份相同）。
   */
  'games.remoteSlow': '',

  'note.text': '子どものころの楽しさを、もう一度.. \n ほかにも隠し要素が待ってるよ!',
  'note.open': '床に落ちている紙を読む',
  'note.title': '一枚の紙',
  'note.close': '閉じる',
  'window.cycle': '窓の外の季節を変える',
  'painting.open': '絵に近づいて見る',
  'painting.close': '閉じる',
  'painting.title.sunflowers': 'ひまわり',
  'painting.artist.sunflowers': 'フィンセント・ファン・ゴッホ',
  'painting.title.monaLisa': 'モナ・リザ',
  'painting.artist.monaLisa': 'レオナルド・ダ・ヴィンチ',
  'painting.title.starryNight': '星月夜',
  'painting.artist.starryNight': 'フィンセント・ファン・ゴッホ',
  'painting.title.scream': '叫び',
  'painting.artist.scream': 'エドヴァルド・ムンク',
  'painting.title.pearl': '真珠の耳飾りの少女',
  'painting.artist.pearl': 'ヨハネス・フェルメール',
  'painting.title.wave': '神奈川沖浪裏',
  'painting.artist.wave': '葛飾北斎',
  'painting.title.unknown': 'どこから来たのか分からない無名の絵',
  'painting.artist.unknown': '作者不詳',
  'mp4.play': 'MP4 プレイヤーで曲をかける',
  'mp4.pause': 'MP4 プレイヤーを止める',
  'cat.wand': '床の猫じゃらしを振る',
  'cat.ragdoll': '本の後ろからラグドールが覗いている',
  'cat.siamese': '本の後ろからシャムが覗いている',
  'cat.tabby': '本の後ろからトラ猫が覗いている',
  'cat.orange': '本の後ろから茶トラが覗いている',
  'cat.american': '本の後ろからアメリカンショートヘアが覗いている',
  'cat.tuxedo': '本の後ろからタキシード猫が覗いている',
  'cat.calico': '本の後ろから三毛猫が覗いている',

  'feedback.open': '床の伝言板をめくる',
  'feedback.title': '伝言板',
  'feedback.close': '閉じる',
  'feedback.placeholder': 'ひとことどうぞ — ご意見や、追加してほしいゲームなど…',
  'feedback.submit': '投稿',
  'feedback.submitting': '投稿中…',
  'feedback.ok': '投稿しました。ありがとうございます！',
  'feedback.required': 'まず何か書いてください。',
  'feedback.failed': '投稿できませんでした — もう一度お試しください。',
  'feedback.loading': '読み込み中…',
  'feedback.empty': 'まだ書き込みがありません — 最初のひとことどうぞ。',
  'feedback.retry': '再試行',
  'feedback.prev': '前へ',
  'feedback.next': '次へ',
  'feedback.page': '{n} ページ',
  'feedback.resolved': '対応済み',
  'feedback.unresolved': '未対応',

  'legal.privacy': 'プライバシーポリシー',
  'legal.terms': '利用規約',
  'legal.updated': '最終更新 {date}',
  'legal.contact': 'お問い合わせ：',

  'tour.title': '操作ガイド',
  'tour.skip': 'スキップ',
  'tour.back': '戻る',
  'tour.next': '次へ',
  'tour.done': '遊びはじめる',
  'tour.replay': '操作ガイドをもう一度見る',
  'tour.screen.title': 'まずはゲームを1本',
  'tour.screen.body':
    'ROM ファイル（.nes / .sfc / .gba / .md / .gb など）かアーケードの .zip をテレビにドロップすると遊べます。画面をクリックしてファイルを選ぶこともできます。',
  'tour.rail.title': '右側のスイッチ列',
  'tour.rail.body':
    '上から3つのグループです。見た目：テーマ（ナイト / デイ）、言語（中文 / English / 日本語 / 한국어）、全画面（全画面になるのは画面そのもの）、シンプルモード（壁・テレビ・机・床だけを残す）、テレビの大きさ（大 / 中 / 小 の3段、机も一緒に伸びます）。ゲーム：通信対戦、キー設定。ヘルプ：キー説明、伝言板。',

  'topLinks.label': 'サイトのページ',
  'topLinks.games': 'ゲーム一覧',
  'menu.open': 'メニューを開く',
  'menu.close': 'メニューを閉じる',
  'menu.theme': 'テーマ',
  'menu.simple': 'シンプルモード',

  'leave.title': 'このページを離れますか？',
  'leave.bodyGame': '実行中のゲームは中断されます — 進行状況は保存されません。',
  'leave.bodyNetplay': '通信対戦のルームから退出し、相手は切断されます。',
  'leave.stay': 'とどまる',
  'leave.confirm': '離れる',

  'gamesPage.heading': 'すべてのゲーム',
  'gamesPage.intro':
    'オンラインライブラリには {count} 本のゲームがあります — NES、SFC、ゲームボーイ、GBA、メガドライブ、アーケードなど。カバーをクリックすると詳細が見られ、そのまま遊ぶこともできます。',
  'gamesPage.empty': 'ライブラリはまだ空です。',
  'gamesPage.introConsole':
    'ライブラリには {count} 本の {console} ゲームがあります。カバーをクリックすると詳細が見られ、そのまま遊ぶこともできます。',
  'gamesPage.filterLabel': '機種で絞り込む',
  'gamesPage.filterAll': 'すべて',
  'gamesPage.consoleEmpty': 'ライブラリにはまだ {console} のゲームがありません。',
  'gamesPage.searchLabel': 'ゲームライブラリを検索',
  'gamesPage.searchPlaceholder': 'タイトル / 開発元 / シリーズで検索',
  'gamesPage.searchSubmit': '検索',
  'gamesPage.searchLoading': '検索中…',
  'gamesPage.searchClear': '検索をクリア',
  'gamesPage.searchResults': '「{keyword}」に一致するゲームは {count} 本です。',
  'gamesPage.searchEmpty':
    '「{keyword}」に一致するゲームがありません。短い言葉か、ゲームのタイトルで検索してみてください。',
  'gamesPage.prev': '前へ',
  'gamesPage.next': '次へ',
  'gamesPage.backHome': '部屋に戻る',
  'gamesPage.backToGames': 'すべてのゲーム',
  'common.back': '戻る',
  'common.home': 'ホーム',
  'gamesPage.play': 'いますぐ遊ぶ',
  'gamesPage.download': 'ROM をダウンロード',
  'gamesPage.share': 'このゲームを共有',
  'gamesPage.shareCopied': 'コピーしました',
  'gamesPage.shareFailed': 'コピーできませんでした',
  'gamesPage.favorite': 'お気に入りに追加',
  'gamesPage.unfavorite': 'お気に入り済み',
  'gamesPage.favoriteSignIn':
    'お気に入りの保存にはログインが必要です — 部屋の右上にあるアカウントボタンからどうぞ。',
  'gamesPage.favoriteFailed': 'お気に入りを更新できませんでした — もう一度お試しください。',
  'gamesPage.favoriteCount': 'お気に入り {n} 人',
  'gamesPage.report': '問題を報告',
  'gamesPage.reportTitle': '問題を報告',
  'gamesPage.reportSubject': '対象：{name}',
  'gamesPage.reportPlaceholder':
    'どんな問題ですか？ 例：起動しない、画面が崩れる、音が出ない…',
  'gamesPage.reportSubmit': '報告を送る',
  'gamesPage.reportSubmitting': '送信中…',
  'gamesPage.reportOk': '受け取りました。ありがとうございます！',
  'gamesPage.reportRequired': 'まず問題の内容を書いてください。',
  'gamesPage.reportFailed': '送信できませんでした — もう一度お試しください。',
  'gamesPage.reportClose': 'キャンセル',

  'comments.heading': 'コメント',
  'comments.count': '{n} 件のコメント',
  'comments.empty': 'まだコメントがありません — 最初のひとりになりませんか。',
  'comments.placeholder': 'このゲームの感想をどうぞ…',
  'comments.ratingLabel': '評価',
  'comments.ratingStar': '5 段階中 {n} を付ける',
  'comments.ratingValue': '5 段階中 {n}',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'まず星の数を選んでください。',
  'comments.submit': 'コメントを投稿',
  'comments.submitting': '投稿中…',
  'comments.ok': '投稿しました。いちばん上に表示されます。',
  'comments.required': '何か書いてから投稿してください。',
  'comments.failed': '投稿できませんでした — もう一度お試しください。',
  'comments.signInLead': 'コメントの投稿にはログインが必要です。',
  'comments.signIn': 'ログイン',
  'comments.signInRequired': '投稿するにはもう一度ログインしてください。',
  'comments.loading': 'コメントを読み込み中…',
  'comments.retry': '再試行',
  'comments.loadFailed': 'コメントを読み込めませんでした。',
  'comments.loadMore': 'もっと見る',
  'comments.delete': '削除',
  'comments.deleteConfirm': '削除する',
  'comments.cancel': 'キャンセル',
  'comments.deleted': 'コメントを削除しました。',
  'comments.deleteFailed': '削除できませんでした — もう一度お試しください。',

  'gamesPage.field.console': '機種',
  'gamesPage.field.year': '発売年',
  'gamesPage.field.developer': '開発元',
  'gamesPage.field.series': 'シリーズ',
  'gamesPage.field.language': '言語',

  'notFound.title': 'ページが見つかりません',
  'notFound.description':
    'そのアドレスは {site} に存在しません。リンクを確認するか、部屋に戻ってみてください。',
  'gamesPage.notFoundTitle': 'ゲームが見つかりません',
  'gamesPage.notFound': 'このゲームはライブラリにありません（削除された可能性があります）。',
  'gamesPage.fallbackDescription': '『{title}』は {console} のゲームです。',

  'developersPage.heading': '開発元',
  'developersPage.intro':
    'ライブラリのゲームを手がけた {count} の開発元。開くとその会社の作品がすべて並びます。',
  'developersPage.empty': 'まだ開発元が登録されていません。',
  'developersPage.gameCount': '{count} 本のゲーム',
  'developersPage.gamesHeading': '{name} のゲーム',
  'developersPage.gamesEmpty': 'ライブラリにはまだこの開発元のゲームがありません。',
  'developersPage.field.founded': '設立年',
  'developersPage.backToDevelopers': 'すべての開発元',
  'developersPage.notFoundTitle': '開発元が見つかりません',
  'developersPage.notFound': 'この開発元はライブラリにありません（削除された可能性があります）。',

  'consolesPage.heading': '機種',
  'consolesPage.intro':
    'ライブラリにある機種 — 合計 {count} 本のゲーム。開くとその機種のゲームがすべて並びます。',
  'consolesPage.gameCount': '{count} 本のゲーム',
  'consolesPage.gamesHeading': '{name} のゲーム',
  'consolesPage.gamesEmpty': 'ライブラリにはまだこの機種のゲームがありません。',
  /* 言語で絞ったのに 1 本も無いとき（`{lang}` は lib/rom-lang.ts の言語名、例: 日本語） */
  'consolesPage.gamesEmptyLang': 'この機種にはまだ {lang} のゲームがありません。',
  'consolesPage.filterLangLabel': '言語で絞り込む',
  'consolesPage.field.released': '発売年',
  'consolesPage.backToConsoles': 'すべての機種',
  'consolesPage.notFoundTitle': '機種が見つかりません',
  'consolesPage.notFound': 'この機種は当サイトの対象外です（または削除されました）。',

  'download.heading': 'ROM をダウンロード',
  'download.hint': '下のボタンを押すと、6秒後にダウンロードが始まります。',
  'download.button': 'ダウンロードを開始',
  'download.waiting': '{seconds} 秒後に開始…',
  'download.started': 'ダウンロードを開始しました — ブラウザのダウンロードをご確認ください。',
  'download.rights': '利用する権利のある ROM ファイルだけをダウンロードしてください。',
  'download.disclaimer':
    '免責事項：本ページの ROM ファイルはすべて第三者から収集したもので、個人の学習およびバックアップ研究目的に限られます。著作権はすべて元の権利者に帰属します。権利を侵害する内容がある場合は、お問い合わせいただければ削除いたします。',

  'deepLink.notFound': 'そのゲームは見つかりませんでした — 削除された可能性があります。',
  'deepLink.title': 'ゲームを読み込み中',
  'deepLink.loading': 'ROM をダウンロード中…',
  'deepLink.hint': 'ダウンロードが終わると自動で始まります',
};

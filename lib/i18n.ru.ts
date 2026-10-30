/**
 * 俄语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表，`ja` / `ko` 也各自
 * 独立成文件；再往主文件里塞一张只会让它更难翻。理由和 `lib/legal.ts` 当初分出去的一样。
 * 代价是「加语言」= 「加一个文件 + 在 `messages` 里挂上」，不再是纯改一处。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序也照它排**，`zh` / `ja` / `ko` 同理。
 *    改文案时先改 `en`，再回来对齐另外四份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的俄文在数据库里
 *    （`game_texts` 的 `ru` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` …），
 *    它们由 `translate()` 在运行时替换；漏掉一个不会报错，只会在页面上少一段字。
 *    俄语语序可以把占位符往前挪，但**不许改名、不许换成实际值**。
 *
 * ⚠️ **站名一律写 `Retro Games Box`**（不音译、不变格）；`{site}` 占位符照留 —— 它在运行时
 *    被替换成 `SITE_NAME[locale]`，这里写字面站名就等于把品牌写死两份。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → платформа；developer → разработчик；series → серия
 *   · cartridge → картридж；room → комната；host → хост；guest → гость
 *   · netplay → сетевая игра；save → сохранение；key bindings → привязка клавиш
 *   · game library → библиотека игр；guestbook → гостевая книга
 *
 * ⚠️ 机种名用**俄语玩家通行的写法**：NES / SNES / Game Boy / GBC / GBA / NDS /
 *    Mega Drive / Game Gear / Master System / 32X / WonderSwan / Neo Geo Pocket /
 *    PlayStation / Arcade。**不用 Dendy** —— 那是另一台机器的名字，不是这台。
 *
 * ⚠️ 复数：`{count}` 后面的名词按常见 UI 习惯取**复数属格**（«{count} игр»），
 *    不为了语法完美去改占位符结构（`translate()` 不做复数规则）。
 */

import type { MessageKey } from './i18n';

export const ru: Record<MessageKey, string> = {
  'meta.title':
    '{site} — ретро-игры в браузере: NES, SNES, GBA и аркады',
  'meta.description':
    'Играйте в NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive и аркадные игры прямо в браузере. Выберите игру в онлайн-библиотеке или загрузите свой ROM-файл.',
  'meta.keywords':
    'ретро-игры, онлайн-библиотека ретро-игр, эмулятор NES, эмулятор SNES, эмулятор SFC, эмулятор GBA, эмулятор Game Boy Advance, эмулятор Game Boy, эмулятор Game Boy Color, эмулятор NDS, эмулятор Nintendo DS, эмулятор Sega Mega Drive, эмулятор Sega Genesis, эмулятор Game Gear, эмулятор Master System, эмулятор Sega 32X, эмулятор WonderSwan, эмулятор Neo Geo Pocket, эмулятор PlayStation, эмулятор PS1, эмулятор PSX, эмулятор аркадных автоматов, играть в NES в браузере, браузерный эмулятор, RetroArch WASM, {site}',
  'seo.room.title': 'Пиксельная комната — ретро-игры в браузере',
  'seo.room.description':
    'Заходите в пиксельную комнату: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive и аркады запускаются на ЭЛТ-телевизоре. Выберите игру в онлайн-библиотеке или перетащите свой ROM-файл на экран.',
  'seo.login.title': 'Вход',
  'seo.login.description':
    'Войдите в аккаунт, чтобы сохранения, история игр и избранное синхронизировались между устройствами.',
  'home.hero.title': 'Играйте в классические ретро-игры в браузере',
  'home.hero.lead':
    'В {site} можно играть онлайн в NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, аркады и многое другое — есть сетевой режим на двоих.',
  'home.hero.play': 'Загрузить свой ROM',
  'home.hero.browse': 'Все игры',
  'home.join.title': 'Играйте с другом',
  'home.join.hint': 'Введите 4-значный код комнаты, который прислал друг.',
  'home.join.submit': 'Войти в комнату',
  'home.hero.or': 'ИЛИ',
  'home.search.label': 'Поиск по библиотеке игр',
  'home.search.placeholder': 'Название / разработчик / серия',
  'home.search.submit': 'Найти',
  'home.consoles.title': 'Выбор по платформе',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, аркады и другое — выберите платформу, чтобы увидеть её игры.',
  'home.consoles.count': '{count} игр',
  'home.consoles.all': 'Все платформы',
  'home.latest.title': 'Новинки',
  'home.latest.lead': 'Самые свежие игры на сайте.',
  'home.latest.viewAll': 'Все игры',
  'home.developers.title': 'Выбор по разработчику',
  'home.developers.lead': 'У этих студий здесь больше всего игр.',
  'home.developers.viewAll': 'Все разработчики',
  'home.empty':
    'Библиотека пока пуста — откройте комнату и перетащите ROM на экран телевизора, чтобы начать играть.',
  'home.faq.title': 'Частые вопросы',
  'home.faq.q1': 'Это бесплатно?',
  'home.faq.a1':
    'Полностью бесплатно — все игры открыты. Вход в аккаунт добавляет облачные сохранения истории и файлов.',
  'home.faq.q2': 'Нужно что-то устанавливать?',
  'home.faq.a2':
    'Нет — просто нажмите на игру и играйте прямо в браузере.',
  'home.faq.q3': 'Работает на телефонах и планшетах?',
  'home.faq.a3':
    'Да — всё работает прямо в браузере на телефонах и планшетах.',
  'home.faq.q4': 'Можно скачать ROM-файлы?',
  'home.faq.a4':
    'Да — на странице каждой игры есть кнопка скачивания. Скачивайте только те ROM, на которые у вас есть право.',
  'home.faq.q5': 'Можно играть с другом?',
  'home.faq.a5':
    'Конечно! Позовите друга и создайте комнату для матча.',
  'home.faq.q6': 'Поддерживаются геймпады?',
  'home.faq.a6':
    'Да — подключите USB- или Bluetooth-геймпад, и эмулятор подхватит его через браузер. Раскладка кнопок — по умолчанию у каждого ядра; на телефоне есть экранные кнопки.',

  'seo.heading': 'Играйте в ретро-игры в браузере',
  'seo.intro':
    '{site} — онлайн-комната ретро-игр. NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive и аркады запускаются прямо здесь, в браузере — эмуляция идёт на вашей машине, RetroArch собран в WebAssembly.',
  'seo.howTo':
    'Выберите игру в онлайн-библиотеке или перетащите свой ROM-файл на телевизор. Устанавливать ничего не нужно.',

  'seo.games.title': 'Все игры — NES, SNES, GBA и аркады онлайн',
  'seo.games.description':
    '{count} ретро-игр в онлайн-библиотеке, все играются в браузере: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, аркады и другое. Откройте игру для подробностей, играйте сразу или скачайте ROM-файл.',
  'seo.games.search.title': 'Результаты поиска «{keyword}»',
  'seo.games.search.description':
    'В онлайн-библиотеке {count} игр по запросу «{keyword}». Играйте в браузере или скачайте ROM-файл.',
  'seo.games.console.title': 'Игры {console} — играть онлайн в браузере',
  'seo.games.console.description':
    '{count} игр {console} в онлайн-библиотеке — играйте в браузере или скачивайте ROM-файлы.',
  'seo.game.title': '{title} — играть в {console} онлайн',
  'seo.game.description':
    'Играйте в {title} ({console}) прямо в браузере — бесплатно, без установки. ROM-файл тоже можно скачать.',
  'seo.gameDownload.title': 'Скачать ROM {title} ({console})',
  'seo.gameDownload.description':
    'Скачайте ROM-файл {title} ({console}) в один клик, без регистрации. Можно играть и прямо в браузере.',
  'seo.developers.title': 'Разработчики игр — их игры для NES, SNES, GBA и аркад',
  'seo.developers.description':
    '{count} разработчиков, чьи игры есть в онлайн-библиотеке. Откройте одного, чтобы увидеть все его игры у нас.',
  'seo.developer.title': '{name} — игры этого разработчика',
  'seo.developer.description':
    'Все игры {name} в онлайн-библиотеке ({count}) — играйте в браузере или скачивайте ROM-файл.',

  'seo.consoles.title': 'Выбор по платформе — NES, SNES, GBA и аркады онлайн',
  'seo.consoles.description':
    'Все платформы онлайн-библиотеки (всего {count} игр). Выберите платформу, чтобы увидеть все её игры — они играются в браузере.',
  'seo.console.title': 'Игры {name} — играть онлайн',
  'seo.console.description':
    'Все игры {name} в онлайн-библиотеке ({count}) — играйте в браузере или скачивайте ROM-файл.',

  'theme.toDark': 'Включить ночной режим',
  'theme.toLight': 'Включить дневной режим',
  'lamp.turnOn': 'Включить лампу',
  'lamp.turnOff': 'Выключить лампу',
  'simple.enter': 'Простой режим: оставить только стену, телевизор, стол и пол',
  'simple.exit': 'Выйти из простого режима',
  'tvSize.open': 'Размер телевизора',
  'tvSize.opt.large': 'Большой',
  'tvSize.opt.medium': 'Средний',
  'tvSize.opt.small': 'Маленький',
  'tvSize.pick': 'Размер телевизора: {level}',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Язык',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟**当前页面语言**，只有那颗钮跟**目标语言**（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'Эта страница на русском',
  'localePrompt.body': 'Ваш браузер предпочитает другой язык. Переключить?',
  'localePrompt.keep': 'Остаться на русском',
  'fullscreen.enter': 'Развернуть экран игры на весь экран',
  'fullscreen.exit': 'Выйти из полноэкранного режима',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P）—— 那套字模没有西里尔字形，
   * 所以俄语会落到系统字体上（globals.css 的 `.screen-hint-*` 补偿字号）。
   * 大写是英文那一侧的排版风格，俄语跟着大写，和原文对位。
   */
  'screen.pick': 'Нажмите, чтобы выбрать ROM-файл, или перетащите его сюда',
  'screen.srLabel': 'Выбрать ROM-файл для запуска',
  'screen.tapLoad': 'НАЖМИТЕ, ЧТОБЫ ЗАГРУЗИТЬ СВОЙ ROM',
  'screen.orLibrary': 'ИЛИ ЗАПУСТИТЕ ИЗ ОНЛАЙН-БИБЛИОТЕКИ',
  'screen.release': 'ОТПУСТИТЕ, ЧТОБЫ ЗАГРУЗИТЬ',
  'screen.mobileLibrary': 'ЗАПУСК ИЗ БИБЛИОТЕКИ',
  'screen.mobileTap': 'КОСНИТЕСЬ ЭКРАНА, ЧТОБЫ ОТКРЫТЬ БИБЛИОТЕКУ',
  'screen.waitingHost': 'ОЖИДАНИЕ ХОСТА',
  'screen.paused': 'ПАУЗА',
  'screen.resumeOnPanel': 'НАЖМИТЕ «ПРОДОЛЖИТЬ» НА ПАНЕЛИ',
  'screen.resumeInPanel': 'НАЖМИТЕ «ПРОДОЛЖИТЬ» НА ПАНЕЛИ СПРАВА',
  'screen.waitHostResume': 'ХОСТ ПРИОСТАНОВИЛ ИГРУ',

  /* 机身面板那排钮 */
  'panel.resume': 'Продолжить',
  'panel.pause': 'Пауза',
  'panel.save': 'Сохранить',
  'panel.load': 'Загрузить',
  'panel.reset': 'Сброс',
  'panel.eject': 'Извлечь',

  'volume.down': 'Тише на шаг',
  'volume.up': 'Громче на шаг',
  'volume.set': 'Громкость: {level} из {max}',

  'saves.title': 'Загрузить сохранение',
  'saves.load': 'Загрузить',
  'saves.close': 'Закрыть',
  'saves.groupLocal': 'Это устройство',
  'saves.groupCloud': 'Облако (аккаунт)',
  'saves.deleteCloud': 'Удалить это облачное сохранение',
  'saves.delete': 'Удалить',
  'saves.loginHint':
    'Войдите, чтобы облачные сохранения были доступны на любом устройстве.',
  'saves.login': 'Войти',
  'saves.loading': 'Загрузка…',
  'saves.downloading': 'Скачивание облачного сохранения…',
  'saves.restoring': 'Восстановление игры…',
  'saves.empty': 'Сохранений пока нет',

  'library.removeLabel': 'Удалить {name}',

  'legend.moves': 'движение',
  'legend.open': 'Управление',
  'legend.title': 'Управление',
  'legend.close': 'Закрыть',
  'legend.needZip':
    'Формат  FBNeo читает только .zip — здесь, похоже, {ext}. Перепакуйте файл или возьмите .zip-версию',
  'play.needZip':
    'Формат  Этот ROM — архив {ext}, который не удалось распаковать. Попробуйте .zip или чистый ROM',
  'legend.needDisc':
    'Формат  Образы дисков обычно состоят из нескольких файлов (.cue + .bin). Здесь принимаются только однофайловые образы — возьмите .pbp, .iso или .chd',
  'play.needDisc':
    'Формат  Это многофайловый образ диска (.cue + .bin). Здесь работают только однофайловые — попробуйте .pbp, .iso или .chd',
  'legend.needBios':
    'BIOS  Похоже на игру Neo Geo (KOF, Metal Slug…). Для неё нужен neogeo.zip — перетащите этот файл на страницу, и он установится. Играм CPS1 / CPS2 он не нужен.',
  'legend.gamepad':
    'Геймпад  Подключите — и он работает; в комнате это действует для обеих сторон.',

  /*
   * 联机面板。`netplay.codePlaceholder` 走 font-pixel —— 那套字模没有西里尔字形，
   * 所以这里刻意保持 ASCII（房间码本来就是四个拉丁字母 / 数字）。
   */
  'netplay.title': 'Сетевая игра',
  'netplay.open': 'Играть по сети',
  'netplay.close': 'Закрыть',
  'netplay.create': 'Создать комнату',
  'netplay.or': 'или',
  'netplay.join': 'Войти',
  'netplay.codePlaceholder': 'КОД',
  'netplay.hint':
    'Обеим сторонам достаточно достучаться до публичного релея — лучше всего в одной локальной сети. Продиктуйте другому игроку 4-значный код. Хост запускает эмулятор и передаёт картинку; гостю ROM не нужен.',
  'netplay.roomCode': 'Код комнаты',
  'netplay.modeLan': 'Локальная сеть',
  'netplay.modeWan': 'Интернет',
  'netplay.wanDev': 'Сетевая игра через интернет в разработке.',
  'netplay.quality': 'Качество потока',
  'netplay.qualitySmooth': 'Плавно',
  'netplay.qualityBalanced': 'Баланс',
  'netplay.qualitySharp': 'Чётко',
  'netplay.qualityHint':
    'Хост запускает и эмулятор, и поток на одной машине. Если она не справляется, вся игра замедляется. В таком случае снизьте уровень — это касается только хоста.',
  'netplay.copy': 'Копировать',
  'netplay.copied': 'Скопировано',
  'netplay.share': 'Поделиться',
  'netplay.shareCopied': 'Ссылка скопирована',
  'netplay.inviteTitle': 'Приглашение в комнату',
  'netplay.inviteBody': 'Войти в комнату {code}?',
  'netplay.inviteJoin': 'Войти',
  'netplay.inviteCancel': 'Отмена',
  'netplay.connected': 'Подключено',
  'netplay.waiting': 'Ожидание второго игрока',
  'netplay.joining': 'Подключение к комнате…',
  'netplay.waitingGame': 'Подключено — ждём, пока хост загрузит картридж',
  'netplay.hostPlaying': 'Хост играет',
  'netplay.paused': 'Пауза',
  'netplay.toastHost': 'Подключено · второй игрок в комнате · вы игрок 1',
  'netplay.toastGuest': 'Подключено к хосту · вы игрок 2',
  'netplay.toastHostLeft': 'Хост вышел — комната закрыта',
  'netplay.toastGuestLeft': 'Игрок 2 вышел из комнаты',
  'netplay.youAreHost':
    'Вы игрок 1. Загрузите картридж — картинка автоматически уйдёт гостю. Играете своей раскладкой; текущие привязки — в разделе «Управление».',
  'netplay.youAreGuest':
    'Вы игрок 2. Картридж не нужен — хост передаёт картинку, а ваш ввод отправляется хосту. Играйте своей раскладкой (группа «Игрок 1») или геймпадом — см. «Управление».',
  'netplay.leave': 'Выйти из комнаты',
  'netplay.closeRoom': 'Закрыть комнату',
  'netplay.badCode': 'Код выглядит неверно — должно быть 4 символа.',
  'netplay.errInsecure':
    'Для сетевой игры нужен HTTPS или localhost. Эта страница открыта по обычному http, поэтому браузер не даёт доступ к нужному крипто-API.',
  'netplay.errNoDirect':
    'Обе стороны дошли до релея, но прямое соединение не открылось — обычно это NAT или фаервол. Лучше всего работает одна локальная сеть.',
  'netplay.errPassword': 'Код комнаты не совпадает.',
  'netplay.errHandshake': 'Рукопожатие не завершилось — возможно, второй игрок уже вышел.',
  'netplay.errHostLeft': 'Хост вышел из комнаты — она закрыта.',
  'netplay.errNoRoom':
    'Хост не отвечает. Возможно, код комнаты неверный или хост ещё не открыл комнату.',
  'netplay.errRoomFull': 'Комната уже занята — здесь играют только один на один.',
  'netplay.errUnknown':
    'Не удалось подключиться ко второму игроку. Точная причина — в консоли браузера.',

  'seo.play.title': 'Игровая комната — загрузите игру и играйте онлайн',
  'seo.play.description':
    'Один экран для старта: играйте один или откройте комнату 1 на 1 и поделитесь кодом. NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive и аркады.',
  'play.modeSolo': 'Один',
  'play.start': 'Начать',
  'play.confirmStart': 'Подтвердить и начать',
  'play.confirm': 'Подтвердить',
  'play.qualityIntro': 'Выберите качество картинки для сетевой игры с учётом вашего соединения.',
  'play.qualityHint.smooth': '30 fps · Меньше трафика, подходит для медленных соединений.',
  'play.qualityHint.balanced': 'До 720p / 60 fps · Баланс чёткости и плавности.',
  'play.qualityHint.sharp': 'До 60 fps · Приоритет детализации в исходном разрешении; нужен быстрый интернет. На медленной сети частота кадров может упасть.',
  'play.qualityConfirmHint': 'Подтвердите, чтобы подключиться к комнате. Затем хост загружает игру, а гости получают его картинку.',
  'play.connecting': 'Подключение…',
  'play.confirmJoin': 'Подтвердить и войти',
  'play.cancel': 'Отмена',
  'play.screenSize': 'Размер экрана',
  'play.controlsTitle': 'Управление в игре',
  'play.netplayKeysHint': 'В сетевой игре каждый использует свою раскладку «Игрок 1».',
  'play.cancelled': 'Загрузка отменена.',
  'play.retry': 'Загрузить снова',
  'play.retryJoin': 'Попробовать войти снова',
  'play.saved': 'Игра сохранена.',
  'play.localSaving': 'Сохранение…',
  'play.uploading': 'Отправка…',
  'play.cloudFailed': 'Не удалось синхронизировать с облаком.',
  'play.saveNoLogin': 'Войдите для синхронизации',
  'play.tooLarge': 'Сохранение слишком большое',
  'play.theme': 'Тема',
  'play.saveFailed': 'Не удалось сохранить игру. Попробуйте ещё раз.',
  'play.loadFailed': 'Не удалось загрузить сохранение. Попробуйте ещё раз.',
  'play.leftRoom': 'Вы вышли из комнаты.',
  'play.latency': 'Задержка',
  'play.measuringLatency': 'Измерение…',
  'play.downloading': 'Скачивание ROM…',
  'play.booting': 'Запуск ядра…',
  'play.loadFail': 'Этот картридж не удалось загрузить.',
  'play.romIncomplete': 'ROM-файл неполный — загрузите его снова.',
  'play.notFound': 'Эту игру не удалось найти.',
  'play.fullscreen': 'На весь экран',
  'play.volume': 'Громкость',
  'play.edit': 'Изменить',
  'play.hideSidebar': 'Скрыть панель',
  'play.showSidebar': 'Показать панель',
  'play.hint': 'Esc выходит из полноэкранного режима. Больше клавиатура здесь ни для чего не нужна.',
  'play.leaveTitle': 'Игра идёт',
  'play.leaveBody':
    'Возврат завершит этот сеанс — прогресс не сохраняется автоматически.',
  'play.leaveStay': 'Продолжить игру',
  'play.leaveGo': 'Выйти',
  'gamesPage.playOnline': 'Играть онлайн',

  'keybind.title': 'Привязка клавиш',
  'keybind.open': 'Настройки клавиш',
  'keybind.close': 'Закрыть',
  'keybind.p1': 'Игрок 1',
  'keybind.p2': 'Игрок 2',
  'keybind.mine': 'Ваши клавиши',
  'keybind.pressKey': 'НАЖМИТЕ…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Сбросить по умолчанию',
  'keybind.reload': 'Перезагрузить картридж',
  'keybind.reloading': 'Перезагрузка…',
  'keybind.unsupported': 'Эту клавишу использовать нельзя — попробуйте другую.',
  'keybind.conflictSame': '{pressed} уже назначена на кнопку {button} — попробуйте другую клавишу.',
  'keybind.conflictOther':
    '{pressed} уже назначена на кнопку {button} у игрока {player} — попробуйте другую клавишу.',
  'keybind.hint':
    'Раскладка читается один раз, при загрузке картриджа — перезагрузите его, чтобы изменения вступили в силу. Два игрока не могут делить одну клавишу.',
  'keybind.soloHint':
    'Раскладка читается один раз, при загрузке картриджа — перезагрузите его, чтобы изменения вступили в силу.',
  'keybind.hostHint':
    'Вы хост: «Игрок 1» — ваши клавиши, «Игрок 2» — то, чем инжектируется ввод гостя. Общая клавиша недопустима, иначе ввод гостя будет управлять и вашим первым игроком. После изменений перезагрузите картридж.',
  'keybind.guestHint':
    'Вы гость и играете своей раскладкой (группа «Игрок 1») — у каждой стороны своя клавиатура, так что пересечений не бывает. Изменения применяются сразу, картридж перезагружать не нужно.',
  'keybind.guestLocalHint':
    'Вы гость, и здесь же запущен ваш картридж. Ваши клавиши — группа «Игрок 1»: они управляют этим локальным картриджем, поэтому после изменений перезагрузите его; они же отправляются хосту, и там применяются сразу.',

  'games.open': 'Библиотека игр',
  'games.title': 'Библиотека игр',
  'games.close': 'Закрыть',
  'games.empty': 'Библиотека пуста — пока ничего не загружено',
  'games.loading': 'Загрузка…',
  'games.loadingRom': 'Загрузка {name}…',
  'games.cancel': 'Отмена',
  'games.failed': 'Не удалось загрузить библиотеку игр',
  'games.tabLibrary': 'Библиотека игр',
  'games.tabHistory': 'История',
  'games.historyEmpty': 'Из библиотеки пока ничего не открывали',
  'games.historyLoad': '{name}\nНажмите, чтобы загрузить снова',
  'games.tabFavorites': 'Избранное',
  'games.favorite': 'Добавить {name} в избранное',
  'games.unfavorite': 'Убрать {name} из избранного',
  'games.favoritesEmpty': 'В избранном пусто — нажмите на звёздочку на любой обложке.',
  'games.favoritesSignInBefore': 'Войдите, чтобы сохранять избранное — ',
  'games.favoritesSignInLink': 'Войти',
  'games.favoritesSignInAfter': ' прямо здесь или через кнопку аккаунта в правом верхнем углу.',

  'user.title': 'Аккаунт',
  'user.close': 'Закрыть',
  'user.open': 'Аккаунт — вход или регистрация',
  'user.openSignedIn': 'Аккаунт: {name}',
  'user.tabLogin': 'Вход',
  'user.tabRegister': 'Регистрация',
  'user.username': 'Имя пользователя',
  'user.password': 'Пароль',
  'user.usernameHint': '3–20 символов: буквы, цифры, _ - .',
  'user.emailLabel': 'Эл. почта',
  'user.emailHint': 'Ваша почта. Без +-алиасов и временных ящиков.',
  'user.passwordHint': 'Не менее 6 символов, без пробелов.',
  'user.signIn': 'Войти',
  'user.signUp': 'Создать аккаунт',
  'user.signingIn': 'Вход…',
  'user.signingUp': 'Создание…',
  'user.signOut': 'Выйти',
  'user.signedInAs': 'Вы вошли как {name}.',
  'user.cloudHint':
    'История игр, сохранения и избранное хранятся в вашем аккаунте — откройте любую игру из онлайн-библиотеки, и они синхронизируются сами.',
  'user.formLead':
    'Войдите — и сохранения, история игр и избранное будут в облаке: играйте когда и где угодно!',
  /* ⚠️ 值首尾的空格是有意义的（链接和正文要靠它分开），别顺手 trim 掉 */
  'user.consentLogin': 'Входя, вы принимаете ',
  'user.consentRegister': 'Создавая аккаунт, вы принимаете ',
  'user.consentMiddle': ' и ',
  'user.consentAfter': '.',

  'user.error.failed': 'Что-то пошло не так — попробуйте ещё раз.',
  'user.error.missingCredentials': 'Введите имя пользователя и пароль.',
  'user.error.usernameInvalid': 'В имени пользователя допустимы только буквы, цифры, _ - и .',
  'user.error.usernameTooShort': 'Имя пользователя слишком короткое (минимум 3 символа).',
  'user.error.usernameTooLong': 'Имя пользователя слишком длинное (максимум 20 символов).',
  'user.error.usernameTaken': 'Это имя занято — выберите другое.',
  'user.error.emailInvalid': 'Введите корректный адрес эл. почты.',
  'user.error.emailAlias': 'Алиасы почты (вроде name+tag@… или Gmail с точками) не разрешены.',
  'user.error.emailTemp': 'Одноразовые почтовые сервисы не разрешены — используйте свой обычный ящик.',
  'user.error.passwordInvalid': 'Введите пароль.',
  'user.error.passwordTooShort': 'Пароль слишком короткий (минимум 6 символов).',
  'user.error.passwordTooLong': 'Пароль слишком длинный (максимум 72 символа).',
  'user.error.passwordHasSpace': 'Пароль не может содержать пробелы.',
  'user.error.invalidCredentials': 'Неверное имя пользователя или пароль.',
  'user.error.banned': 'Этот аккаунт заблокирован.',
  'user.error.captchaRequired': 'Сначала пройдите проверку, что вы человек.',
  'user.error.captchaFailed': 'Проверка не пройдена — попробуйте ещё раз.',

  'login.lead':
    'Войдите — и сохранения, история игр и избранное будут в облаке: играйте когда и где угодно. Ещё нет аккаунта? Создайте его.',

  'account.title': 'Ваш аккаунт',
  'account.loading': 'Загрузка…',
  'account.failed': 'Что-то пошло не так — попробуйте ещё раз.',
  'account.since': 'С нами с {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Обычный',
  'account.vipUntil': 'VIP до {time}',
  'account.vipExpired': 'VIP истёк {time}',
  'account.tabFavorites': 'Избранное',
  'account.tabHistory': 'История',
  'account.tabSaves': 'Сохранения',
  'account.tabProfile': 'Профиль',
  'account.tabPassword': 'Пароль',
  'account.favoritesLoading': 'Загрузка избранного…',
  'account.historyLoading': 'Загрузка истории…',
  'account.savesLoading': 'Загрузка сохранений…',

  'account.favoritesEmpty':
    'В избранном пусто — откройте библиотеку игр в комнате и нажмите на звёздочку на обложке.',
  'account.unfavorite': 'Убрать {name} из избранного',

  /* ---- 历史 ---- */
  'account.historyEmpty': 'История пуста — игры, открытые из онлайн-библиотеки, появятся здесь.',
  'account.historyCount': 'Недавно сыграно игр: {count}',
  'account.historyDeleted': 'Удалено из истории.',
  'account.clearHistory': 'Очистить всё',
  'account.confirmClearHistory': 'Точно очистить всё?',
  'account.historyCleared': 'История очищена.',
  'account.historyHint':
    'В истории хранятся {max} последних игр — если сыграть в старую снова, она вернётся наверх.',

  'account.savesEmpty': 'Облачных сохранений пока нет.',
  'account.savesCount': 'Всего сохранений: {count}',
  'account.savesGroupCount': 'Сохранений: {count}',
  'account.viewGame': 'Открыть {name}',
  'account.savesHint':
    'Одно сохранение на игру — новое перезаписывает старое. Это касается и локальных, и облачных.',
  'account.saveDeleted': 'Сохранение удалено.',
  'account.clearSaves': 'Очистить всё',
  'account.confirmClearSaves': 'Точно очистить всё?',
  'account.savesCleared': 'Удалено сохранений: {count}.',
  'account.delete': 'Удалить',
  'account.confirmDelete': 'Точно удалить?',

  /* ---- 资料 ---- */
  'account.avatar': 'Аватар',
  'account.chooseImage': 'Выбрать изображение',
  'account.clearAvatar': 'Удалить аватар',
  'account.uploading': 'Отправка…',
  'account.avatarSaved': 'Аватар обновлён.',
  'account.avatarCleared': 'Аватар удалён.',
  'account.avatarHint': 'PNG, JPEG, WebP или GIF, до 2 МБ.',
  'account.gender': 'Пол',
  'account.genderNone': 'Не указан',
  'account.genderMale': 'Мужской',
  'account.genderFemale': 'Женский',
  'account.genderSaved': 'Сохранено.',
  'account.genderHint': 'Необязательно — видите только вы.',
  'account.passwordTabHint': 'После смены вы останетесь в аккаунте на этом устройстве — заново входить не нужно.',
  'account.password': 'Пароль',
  'account.oldPassword': 'Текущий пароль',
  'account.newPassword': 'Новый пароль',
  'account.confirmPassword': 'Повторите новый пароль',
  'account.savePassword': 'Изменить пароль',
  'account.saving': 'Сохранение…',
  'account.passwordSaved': 'Пароль изменён.',
  'account.passwordHint':
    'После смены вы останетесь в аккаунте на этом устройстве. На других устройствах сеансы продолжат работать до истечения срока.',

  'account.error.missingOld': 'Введите текущий пароль.',
  'account.error.wrongPassword': 'Текущий пароль неверен.',
  'account.error.passwordTooShort': 'Новый пароль слишком короткий (минимум 6 символов).',
  'account.error.passwordTooLong': 'Новый пароль слишком длинный (максимум 72 символа).',
  'account.error.passwordHasSpace': 'Новый пароль не может содержать пробелы.',
  'account.error.mismatch': 'Новые пароли не совпадают.',
  'account.error.avatarMissing': 'Сначала выберите изображение.',
  'account.error.avatarTooLarge': 'Изображение слишком большое (максимум 2 МБ).',
  'account.error.avatarType': 'Формат не поддерживается — используйте PNG, JPEG, WebP или GIF.',

  'games.filterAll': 'Все',
  'games.searchPlaceholder': 'Название / разработчик / серия',
  'games.search': 'Найти',
  'games.noMatch': 'Ничего не найдено.',
  'games.prev': 'Назад',
  'games.next': 'Вперёд',
  /* 只有中文版有内容（英文是空串），俄语站读者多半在境外，这条同样留空 */
  'games.remoteSlow': '',

  'note.text': 'Пусть мы снова найдём ту радость, что была в детстве..',
  'note.open': 'Прочитать записку на полу',
  'note.title': 'Записка',
  'note.close': 'Закрыть',
  'window.cycle': 'Сменить время года за окном',
  'painting.open': 'Рассмотреть картину',
  'painting.close': 'Закрыть',
  'painting.title.sunflowers': 'Подсолнухи',
  'painting.artist.sunflowers': 'Винсент ван Гог',
  'painting.title.monaLisa': 'Мона Лиза',
  'painting.artist.monaLisa': 'Леонардо да Винчи',
  'painting.title.starryNight': 'Звёздная ночь',
  'painting.artist.starryNight': 'Винсент ван Гог',
  'painting.title.scream': 'Крик',
  'painting.artist.scream': 'Эдвард Мунк',
  'painting.title.pearl': 'Девушка с жемчужной серёжкой',
  'painting.artist.pearl': 'Ян Вермеер',
  'painting.title.wave': 'Большая волна в Канагаве',
  'painting.artist.wave': 'Кацусика Хокусай',
  'painting.title.unknown': 'Безымянная картина неизвестно откуда',
  'painting.artist.unknown': 'Неизвестный автор',
  'mp4.play': 'Включить песню на MP4-плеере',
  'mp4.pause': 'Поставить MP4-плеер на паузу',

  'cat.wand': 'Помахать кошачьей удочкой на полу',
  'cat.ragdoll': 'Из-за книг выглядывает рэгдолл',
  'cat.siamese': 'Из-за книг выглядывает сиамская кошка',
  'cat.tabby': 'Из-за книг выглядывает полосатая кошка',
  'cat.orange': 'Из-за книг выглядывает рыжий кот',
  'cat.american': 'Из-за книг выглядывает американская короткошёрстная',
  'cat.tuxedo': 'Из-за книг выглядывает кошка-«смокинг»',
  'cat.calico': 'Из-за книг выглядывает трёхцветная кошка',

  'feedback.open': 'Прочитать гостевую книгу на полу',
  'feedback.title': 'Гостевая книга',
  'feedback.close': 'Закрыть',
  'feedback.placeholder': 'Напишите что-нибудь — предложение или игру, которую хотите здесь увидеть…',
  'feedback.submit': 'Отправить',
  'feedback.submitting': 'Отправка…',
  'feedback.ok': 'Отправлено — спасибо!',
  'feedback.required': 'Сначала напишите что-нибудь.',
  'feedback.failed': 'Не удалось отправить — попробуйте ещё раз.',
  'feedback.loading': 'Загрузка…',
  'feedback.empty': 'Сообщений пока нет — напишите первым.',
  'feedback.retry': 'Попробовать снова',
  'feedback.prev': 'Назад',
  'feedback.next': 'Вперёд',
  'feedback.page': 'Страница {n}',
  'feedback.resolved': 'Решено',
  'feedback.unresolved': 'Открыто',

  'legal.privacy': 'Политика конфиденциальности',
  'legal.terms': 'Условия использования',
  'legal.updated': 'Обновлено {date}',
  'legal.contact': 'Связаться с нами:',

  'tour.title': 'Короткий тур',
  'tour.skip': 'Пропустить',
  'tour.back': 'Назад',
  'tour.next': 'Далее',
  'tour.done': 'Начать играть',
  'tour.replay': 'Показать тур снова',
  'tour.screen.title': 'Начните с игры',
  'tour.screen.body':
    'Перетащите ROM-файл (.nes, .sfc, .gba, .md, .gb …) или аркадный .zip на телевизор либо просто нажмите на экран, чтобы выбрать файл. В этом репозитории нет ROM — используйте свои.',
  'tour.rail.title': 'Колонка переключателей',
  /* 语言那一项照原文把四种语言的名字列出来（各用本语言写，不翻译） */
  'tour.rail.body':
    'Три группы сверху вниз. Вид: тема (ночь / день), язык (中文 / English / 日本語 / 한국어), полный экран (на весь экран разворачивается сам экран), простой режим (оставить только стену, телевизор, стол и пол), размер телевизора (открывает выбор большой / средний / маленький — стол расширяется вместе с ним). Игры: сетевая игра, привязка клавиш. Помощь: управление и гостевая книга.',

  'topLinks.label': 'Страницы сайта',
  'topLinks.games': 'Список игр',

  'menu.open': 'Открыть меню',
  'menu.close': 'Закрыть меню',
  'menu.theme': 'Тема',
  'menu.simple': 'Простой режим',

  'leave.title': 'Выйти со страницы?',
  'leave.bodyGame': 'Запущенная игра прервётся — прогресс не сохранится.',
  'leave.bodyNetplay': 'Вы выйдете из сетевой комнаты, и напарник отключится.',
  'leave.stay': 'Остаться',
  'leave.confirm': 'Выйти',

  'gamesPage.heading': 'Все игры',
  'gamesPage.intro':
    '{count} игр в онлайн-библиотеке — NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, аркады и другое. Нажмите на обложку для подробностей или начинайте играть сразу.',
  'gamesPage.empty': 'Библиотека сейчас пуста.',
  'gamesPage.introConsole':
    '{count} игр {console} в библиотеке. Нажмите на обложку для подробностей или начинайте играть сразу.',
  'gamesPage.filterLabel': 'Фильтр по платформе',
  'gamesPage.filterAll': 'Все',
  'gamesPage.consoleEmpty': 'Игр {console} в библиотеке пока нет.',
  'gamesPage.searchLabel': 'Поиск по библиотеке игр',
  'gamesPage.searchPlaceholder': 'Название / разработчик / серия',
  'gamesPage.searchSubmit': 'Найти',
  'gamesPage.searchLoading': 'Поиск…',
  'gamesPage.searchClear': 'Сбросить поиск',
  'gamesPage.searchResults': '«{keyword}» — найдено игр: {count}.',
  'gamesPage.searchEmpty': 'По запросу «{keyword}» ничего не найдено. Попробуйте слово короче или точное название.',
  'gamesPage.prev': 'Назад',
  'gamesPage.next': 'Вперёд',
  'gamesPage.backHome': 'На главную',
  'gamesPage.backToGames': 'Все игры',
  'common.back': 'Назад',
  'common.home': 'Главная',
  'gamesPage.play': 'Играть',
  'gamesPage.download': 'Скачать ROM',
  'gamesPage.share': 'Поделиться игрой',
  'gamesPage.shareCopied': 'Ссылка скопирована',
  'gamesPage.shareFailed': 'Не удалось скопировать',
  'gamesPage.favorite': 'В избранное',
  'gamesPage.unfavorite': 'Убрать из избранного',
  'gamesPage.favoriteSignIn': 'Войдите, чтобы сохранять избранное — нажмите кнопку входа в верхней панели.',
  'gamesPage.favoriteFailed': 'Не удалось обновить избранное — попробуйте ещё раз.',
  'gamesPage.favoriteCount': 'В избранном: {n}',
  'gamesPage.report': 'Сообщить о проблеме',
  'gamesPage.reportTitle': 'Сообщить о проблеме',
  'gamesPage.reportSubject': 'Об игре: {name}',
  'gamesPage.reportPlaceholder':
    'Что пошло не так? Например: не запускается, картинка искажена, нет звука…',
  'gamesPage.reportSubmit': 'Отправить',
  'gamesPage.reportSubmitting': 'Отправка…',
  'gamesPage.reportOk': 'Спасибо — мы разберёмся.',
  'gamesPage.reportRequired': 'Сначала опишите проблему.',
  'gamesPage.reportFailed': 'Не удалось отправить — попробуйте ещё раз.',
  'gamesPage.reportClose': 'Отмена',
  'comments.heading': 'Комментарии',
  'comments.count': 'Комментариев: {n}',
  'comments.empty': 'Комментариев пока нет — будьте первым.',
  'comments.placeholder': 'Что думаете об этой игре?',
  'comments.ratingLabel': 'Ваша оценка',
  'comments.ratingStar': 'Оценить на {n} из 5',
  'comments.ratingValue': '{n} из 5 звёзд',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Сначала выберите оценку.',
  'comments.submit': 'Отправить комментарий',
  'comments.submitting': 'Отправка…',
  'comments.ok': 'Отправлено — комментарий в начале списка.',
  'comments.required': 'Сначала напишите что-нибудь.',
  'comments.failed': 'Не удалось отправить — попробуйте ещё раз.',
  'comments.signInLead': 'Войдите, чтобы оставить комментарий.',
  'comments.signIn': 'Войти',
  'comments.signInRequired': 'Войдите заново, чтобы отправить комментарий.',
  'comments.loading': 'Загрузка комментариев…',
  'comments.retry': 'Повторить',
  'comments.loadFailed': 'Не удалось загрузить комментарии.',
  'comments.loadMore': 'Показать ещё',
  'comments.delete': 'Удалить',
  'comments.deleteConfirm': 'Подтвердить',
  'comments.cancel': 'Отмена',
  'comments.deleted': 'Комментарий удалён.',
  'comments.deleteFailed': 'Не удалось удалить — попробуйте ещё раз.',
  'gamesPage.field.console': 'Платформа',
  'gamesPage.field.year': 'Год',
  'gamesPage.field.developer': 'Разработчик',
  'gamesPage.field.series': 'Серия',
  'gamesPage.field.language': 'Язык',
  'gamesPage.controls': 'Управление',
  'gamesPage.selectLanguage': 'Выберите язык',
  'notFound.title': 'Страница не найдена',
  'notFound.description':
    'Такого адреса на {site} нет. Проверьте ссылку или вернитесь на главную страницу.',
  'gamesPage.notFoundTitle': 'Игра не найдена',
  'gamesPage.notFound': 'Этой игры в библиотеке (больше) нет.',
  'gamesPage.fallbackDescription': '{title} — игра для {console}.',

  'developersPage.heading': 'Разработчики',
  'developersPage.intro':
    '{count} разработчиков, чьи игры есть в библиотеке. Откройте одного, чтобы увидеть всё, что у нас есть от этой студии.',
  'developersPage.empty': 'Разработчиков пока нет.',
  'developersPage.gameCount': '{count} игр',
  'developersPage.gamesHeading': 'Игры {name}',
  'developersPage.gamesEmpty': 'Игр этого разработчика в библиотеке пока нет.',
  'developersPage.field.founded': 'Основана',
  'developersPage.backToDevelopers': 'Все разработчики',
  'developersPage.notFoundTitle': 'Разработчик не найден',
  'developersPage.notFound': 'Этого разработчика в библиотеке (больше) нет.',

  'consolesPage.heading': 'Платформы',
  'consolesPage.intro':
    'Платформы библиотеки — всего {count} игр. Откройте платформу, чтобы увидеть все её игры.',
  'consolesPage.gameCount': '{count} игр',
  'consolesPage.gamesHeading': 'Игры на {name}',
  'consolesPage.gamesEmpty': 'Игр для этой платформы в библиотеке пока нет.',
  'consolesPage.gamesEmptyLang': 'Для этой платформы пока нет игр на языке {lang}.',
  'consolesPage.filterLangLabel': 'Фильтр по языку',
  'consolesPage.field.released': 'Выпуск',
  'consolesPage.backToConsoles': 'Все платформы',
  'consolesPage.notFoundTitle': 'Платформа не найдена',
  'consolesPage.notFound': 'Этой платформы на сайте (больше) нет.',

  'download.heading': 'Скачать ROM',
  'download.hint': 'Нажмите кнопку ниже — скачивание начнётся через 6 секунд.',
  'download.button': 'Начать скачивание',
  'download.waiting': 'Начнётся через {seconds} с…',
  'download.started': 'Скачивание началось — проверьте загрузки браузера.',
  'download.rights': 'Скачивайте только те ROM-файлы, на которые у вас есть право.',
  'download.disclaimer':
    'Отказ от ответственности: все ROM-файлы на этой странице собраны из третьих источников и предназначены только для личного изучения и резервного копирования. Все авторские права принадлежат их правообладателям; если какой-либо материал нарушает ваши права, свяжитесь с нами для удаления.',
  'deepLink.notFound': 'Эту игру не удалось найти — возможно, её удалили.',
  'deepLink.title': 'Загрузка игры',
  'deepLink.loading': 'Скачивание ROM…',
  'deepLink.hint': 'Начнётся автоматически после завершения скачивания.',
};

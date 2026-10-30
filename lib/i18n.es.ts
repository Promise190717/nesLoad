/**
 * 西班牙语界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再塞一张进来只会更难翻。理由和 `lib/legal.ts`、`i18n.ja.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序也照抄**（558 条），
 *    `zh` / `ja` / `ko` 同理。改文案时先改 `en`，再回来对齐其余几份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的西语在数据库里
 *    （`game_texts` 的 `es` 行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` /
 *    `{seconds}` / `{code}` …），它们由 `translate()` 在运行时替换；漏掉一个不会报错，
 *    只会在页面上少一段字。西语语序和英语不同，占位符**可以挪位置**，但不能丢、不能改名。
 *
 * ⚠️ 站名统一写 `Retro Games Box`，`{site}` 由调用方替换成 `SITE_NAME[locale]`，别在值里手写站名。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → consola；developer → desarrollador；series → serie
 *   · cartridge → cartucho；room → sala；host → anfitrión；guest → invitado
 *   · netplay → juego en red；save → partida guardada（动词用 guardar / cargar）
 *   · key bindings → configuración de teclas；game library → biblioteca de juegos
 *   · guestbook → libro de visitas；stream quality → calidad de la transmisión
 *
 * 语气：按钮用不定式或名词（Jugar / Descargar / Cerrar），提示句走无人称或 `tú`
 *   —— 西语界面里 `tú` 是常规，别混用 `usted`。标点用西语习惯：`¿…?` / `¡…!`
 *   开头的符号要写出来（这几条读屏会念，别省）。
 *
 * ⚠️ 机种名用**西语玩家的通行写法**，全表统一：
 *    NES / SNES / Game Boy / GBC / GBA / NDS / Mega Drive / Game Gear / Master System /
 *    32X / WonderSwan / Neo Geo Pocket / PlayStation / Arcade。
 *    西语区也有人写 Genesis，但**界面里一律 Mega Drive**（`meta.keywords` 例外：
 *    那里是搜索词，两个都留着才搜得到）。标签位上取的是 `lib/consoles.ts` 的
 *    `consoleLabel(type, locale)`，和文案同源。
 *
 * ⚠️ `games.remoteSlow` 与 en / ja 一样是**空串**：那句话是说给「文件在境外」的读者听的，
 *    西语读者多半也在境外，写了既没用又莫名其妙。
 */

import type { MessageKey } from './i18n';

export const es: Record<MessageKey, string> = {
  /* SEO 文案（<title> / description / og:* / JSON-LD）。不进界面，只给爬虫和社交卡片看 */
  'meta.title': '{site} — Juega a juegos retro en tu navegador: NES, SNES, GBA y arcade',
  'meta.description':
    'Juega en tu navegador a NES, SNES, Game Boy, GBA, Mega Drive y juegos de arcade. Elige un título de la biblioteca en línea o carga tu propio archivo ROM.',
  /* keywords：机种在这里写全（界面里只列代表机型 + «y más»，别当漏字补全） */
  'meta.keywords':
    'juegos retro, biblioteca de juegos retro en línea, emulador de NES, emulador de SNES, emulador de SFC, emulador de GBA, emulador de Game Boy Advance, emulador de Game Boy, emulador de Game Boy Color, emulador de NDS, emulador de Nintendo DS, emulador de Mega Drive, emulador de Genesis, emulador de Game Gear, emulador de Master System, emulador de 32X, emulador de WonderSwan, emulador de Neo Geo Pocket, emulador de PlayStation, emulador de PS1, emulador de PSX, emulador de arcade, jugar a NES en el navegador, emulador en el navegador, RetroArch WASM, {site}',
  'seo.room.title': 'La sala pixel — Juega a juegos retro en tu navegador',
  'seo.room.description':
    'Entra en la sala pixel: NES, SNES, Game Boy, GBA, Mega Drive y juegos de arcade funcionando en el televisor de tubo. Elige un título de la biblioteca en línea o suelta tu propio archivo ROM en la pantalla.',
  /* 登录页（noindex, follow）—— 标题里不写站名，根布局的 template 会补 */
  'seo.login.title': 'Iniciar sesión',
  'seo.login.description':
    'Inicia sesión para mantener tus partidas guardadas, tu historial y tus favoritos sincronizados entre dispositivos.',

  /* 首页落地页 */
  'home.hero.title': 'Juega a los clásicos retro en tu navegador',
  'home.hero.lead':
    '{site} tiene NES, SNES, Game Boy, GBA, Mega Drive, arcade y mucho más para jugar en línea, con partidas en red para dos jugadores.',
  'home.hero.play': 'Cargar una ROM local',
  'home.hero.browse': 'Ver todos los juegos',
  'home.join.title': 'Juega con un amigo',
  'home.join.hint': 'Escribe el código de sala de 4 caracteres que te haya pasado tu amigo.',
  'home.join.submit': 'Entrar en la sala',
  'home.hero.or': 'O',
  'home.search.label': 'Buscar en la biblioteca de juegos',
  'home.search.placeholder': 'Buscar por título / desarrollador / serie',
  'home.search.submit': 'Buscar',
  'home.consoles.title': 'Explorar por consola',
  'home.consoles.lead':
    'NES, SNES, Game Boy, GBA, Mega Drive, arcade y más: elige una consola para ver sus juegos.',
  'home.consoles.count': '{count} juegos',
  'home.consoles.all': 'Todas las consolas',
  'home.latest.title': 'Novedades',
  'home.latest.lead': 'Los juegos más recientes del sitio.',
  'home.latest.viewAll': 'Todos los juegos',
  'home.developers.title': 'Explorar por desarrollador',
  'home.developers.lead': 'Estos estudios son los que más juegos tienen aquí.',
  'home.developers.viewAll': 'Todos los desarrolladores',
  'home.empty':
    'La biblioteca está vacía ahora mismo: abre la sala y suelta una ROM en el televisor para empezar a jugar.',
  'home.faq.title': 'Preguntas frecuentes',
  'home.faq.q1': '¿Es gratis?',
  'home.faq.a1':
    'Totalmente gratis: todos los juegos están disponibles. Al iniciar sesión añades guardado en la nube para tu historial y tus partidas.',
  'home.faq.q2': '¿Hay que instalar algo?',
  'home.faq.a2': 'No: haz clic en un juego y juégalo directamente en el navegador.',
  'home.faq.q3': '¿Funciona en móviles y tablets?',
  'home.faq.a3': 'Sí: funciona directamente en el navegador del móvil o la tablet.',
  'home.faq.q4': '¿Puedo descargar los archivos ROM?',
  'home.faq.a4':
    'Sí: cada juego tiene un botón de descarga. Descarga solo archivos ROM que tengas derecho a usar.',
  'home.faq.q5': '¿Puedo jugar con un amigo?',
  'home.faq.a5': '¡Claro! Llama a un amigo y abrid una sala para echar una partida.',
  'home.faq.q6': '¿Admite mandos de juego?',
  'home.faq.a6':
    'Sí: conecta un mando USB o Bluetooth y el emulador lo detecta a través del navegador. La asignación de botones sigue los valores por defecto de cada núcleo; en el móvil se usan los botones en pantalla.',

  /* 首屏那段看不见的正文（sr-only），给爬虫和读屏用 */
  'seo.heading': 'Juega a juegos retro en tu navegador',
  'seo.intro':
    '{site} es una sala de juegos retro en línea. NES, SNES, Game Boy, GBA, Mega Drive y títulos de arcade se ejecutan aquí mismo, en el navegador: la emulación corre en tu equipo, con RetroArch compilado a WebAssembly.',
  'seo.howTo':
    'Elige un juego de la biblioteca en línea o suelta tu propio archivo ROM en el televisor. No hay nada que instalar.',

  /* 游戏列表 / 详情 / 下载三页的 SEO */
  'seo.games.title': 'Todos los juegos: NES, SNES, GBA y arcade en línea',
  'seo.games.description':
    '{count} juegos retro en la biblioteca en línea, todos jugables en el navegador: NES, SNES, Game Boy, GBA, Mega Drive, arcade y más. Abre un título para ver los detalles, juégalo al instante o descarga el archivo ROM.',
  'seo.games.search.title': 'Resultados de «{keyword}»',
  'seo.games.search.description':
    '{count} juegos de la biblioteca en línea coinciden con «{keyword}». Juégalos en el navegador o descarga el archivo ROM.',
  'seo.games.console.title': 'Juegos de {console}: juega en línea en tu navegador',
  'seo.games.console.description':
    '{count} juegos de {console} en la biblioteca en línea, todos jugables en el navegador o descargables como archivos ROM.',
  'seo.game.title': '{title}: juega a {console} en línea',
  'seo.game.description':
    'Juega a {title} ({console}) directamente en el navegador: gratis y sin instalar nada. El archivo ROM también está disponible para descargar.',
  'seo.gameDownload.title': 'Descargar la ROM de {title} ({console})',
  'seo.gameDownload.description':
    'Descarga el archivo ROM de {title} ({console}) con un clic, sin registro. También puedes jugarlo directamente en el navegador.',
  'seo.developers.title': 'Desarrolladores: juega a sus títulos de NES, SNES, GBA y arcade',
  'seo.developers.description':
    '{count} desarrolladores detrás de los juegos de la biblioteca en línea. Abre uno para ver todos sus títulos disponibles.',
  'seo.developer.title': '{name}: juegos de este desarrollador',
  'seo.developer.description':
    'Todos los juegos de {name} en la biblioteca en línea ({count}), jugables en el navegador o descargables como archivo ROM.',
  'seo.consoles.title': 'Explorar por consola: NES, SNES, GBA y arcade en línea',
  'seo.consoles.description':
    'Todas las consolas de la biblioteca en línea ({count} juegos en total). Elige una para ver todos sus juegos, jugables en el navegador.',
  'seo.console.title': 'Juegos de {name}: juega en línea',
  'seo.console.description':
    'Todos los juegos de {name} en la biblioteca en línea ({count}), jugables en el navegador o descargables como archivo ROM.',

  /* 屋里那排开关：主题 / 灯 / 简洁模式 / 电视大小 / 语言 / 全屏 */
  'theme.toDark': 'Cambiar al modo noche',
  'theme.toLight': 'Cambiar al modo día',
  'lamp.turnOn': 'Encender la lámpara',
  'lamp.turnOff': 'Apagar la lámpara',
  'simple.enter': 'Modo simple: deja solo la pared, el televisor, la mesa y el suelo',
  'simple.exit': 'Salir del modo simple',
  'tvSize.open': 'Tamaño del televisor',
  'tvSize.opt.large': 'Grande',
  'tvSize.opt.medium': 'Mediano',
  'tvSize.opt.small': 'Pequeño',
  'tvSize.pick': 'Poner el televisor en tamaño {level}',
  /* 语言下拉的读屏名字。语言名本身**不翻译**（各语言用本语言写，见 LOCALE_OPTIONS） */
  'locale.label': 'Idioma',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟**当前页面语言**，只有那颗钮跟**目标语言**（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'Esta página está en español',
  'localePrompt.body': 'Tu navegador prefiere otro idioma. ¿Quieres cambiarlo?',
  'localePrompt.keep': 'Seguir en español',
  'fullscreen.enter': 'Poner la pantalla del juego a pantalla completa',
  'fullscreen.exit': 'Salir de pantalla completa',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P），en 那几条是大写，
   * 这里照同样的排版走大写 —— 西语的大写重音符号（Ó / Í）依赖字体回退，
   * 和 `.screen-hint-*` 那套字号补偿是同一个路子。
   */
  'screen.pick': 'Haz clic para elegir un archivo ROM o suéltalo aquí',
  'screen.srLabel': 'Elegir un archivo ROM para ejecutar',
  'screen.tapLoad': 'HAZ CLIC PARA CARGAR UNA ROM LOCAL',
  'screen.orLibrary': 'O INICIA DESDE LA BIBLIOTECA EN LÍNEA',
  'screen.release': 'SUELTA PARA CARGAR',
  'screen.mobileLibrary': 'INICIAR DESDE LA BIBLIOTECA',
  'screen.mobileTap': 'TOCA LA PANTALLA PARA ABRIR LA BIBLIOTECA',
  'screen.waitingHost': 'ESPERANDO AL ANFITRIÓN',
  'screen.paused': 'EN PAUSA',
  'screen.resumeOnPanel': 'PULSA CONTINUAR EN EL PANEL',
  'screen.resumeInPanel': 'PULSA CONTINUAR EN EL PANEL DERECHO',
  'screen.waitHostResume': 'ESPERANDO A QUE EL ANFITRIÓN CONTINÚE',

  /* 机身面板那排钮 */
  'panel.resume': 'Continuar',
  'panel.pause': 'Pausa',
  'panel.save': 'Guardar',
  'panel.load': 'Cargar',
  'panel.reset': 'Reiniciar',
  'panel.eject': 'Expulsar',
  'volume.down': 'Bajar el volumen un nivel',
  'volume.up': 'Subir el volumen un nivel',
  'volume.set': 'Poner el volumen en {level} de {max}',

  /* 存档列表（电池存档，一款一份） */
  'saves.title': 'Cargar partida',
  'saves.load': 'Cargar',
  'saves.close': 'Cerrar',
  'saves.groupLocal': 'Este dispositivo',
  'saves.groupCloud': 'Nube (cuenta)',
  'saves.deleteCloud': 'Borrar esta partida en la nube',
  'saves.delete': 'Borrar',
  'saves.loginHint': 'Inicia sesión para guardar en la nube y seguir en cualquier dispositivo.',
  'saves.login': 'Iniciar sesión',
  'saves.loading': 'Cargando…',
  'saves.downloading': 'Descargando la partida en la nube…',
  'saves.restoring': 'Restaurando el juego…',
  'saves.empty': 'Aún no hay partidas guardadas',

  'library.removeLabel': 'Quitar {name}',

  /* 键位表：键名和钮名是丝印，不翻译；这里只有「移动」这个词 */
  'legend.moves': 'movimientos',
  'legend.open': 'Controles',
  'legend.title': 'Controles',
  'legend.close': 'Cerrar',
  'legend.needZip':
    'Formato  FBNeo solo lee .zip; este parece {ext}. Vuelve a empaquetarlo o consigue una versión .zip',
  'play.needZip':
    'Formato  Esta ROM es un archivo {ext} que no se pudo descomprimir; prueba con un .zip o con la ROM sin comprimir',
  'legend.needDisc':
    'Formato  Las imágenes de disco suelen tener varios archivos (.cue + .bin). Este sitio solo admite imágenes de un archivo: consigue una versión .pbp, .iso o .chd',
  'play.needDisc':
    'Formato  Es una imagen de disco de varios archivos (.cue + .bin). Aquí solo funcionan las imágenes de un archivo: prueba con .pbp, .iso o .chd',
  'legend.needBios':
    'BIOS  Esto parece un juego de Neo Geo (KOF, Metal Slug…). Necesita neogeo.zip: arrastra ese archivo a la página y se instalará. Los juegos de CPS1 / CPS2 no lo necesitan.',
  'legend.gamepad': 'Mando  Conéctalo y funciona; en una sala, en ambos lados.',

  /* 联机面板。房间码输入框走 font-pixel，所以 placeholder 保持全大写 */
  'netplay.title': 'Juego en red',
  'netplay.open': 'Jugar en red',
  'netplay.close': 'Cerrar',
  'netplay.create': 'Crear una sala',
  'netplay.or': 'o',
  'netplay.join': 'Entrar',
  'netplay.codePlaceholder': 'CÓDIGO',
  'netplay.hint':
    'Basta con que ambos lados lleguen al repetidor público; lo más fiable es estar en la misma red local. Dicta el código de 4 caracteres al otro jugador. El anfitrión ejecuta el emulador y transmite la imagen; el invitado no necesita la ROM.',
  'netplay.roomCode': 'Código de sala',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Internet pública',
  'netplay.wanDev': 'El juego en red por internet está en desarrollo.',
  'netplay.quality': 'Calidad de la transmisión',
  'netplay.qualitySmooth': 'Suave',
  'netplay.qualityBalanced': 'Equilibrada',
  'netplay.qualitySharp': 'Nítida',
  'netplay.qualityHint':
    'El anfitrión ejecuta el emulador y la transmisión en un mismo equipo. Si no da abasto, todo el juego va a cámara lenta. Si pasa, baja un nivel: esto solo afecta al anfitrión.',
  'netplay.copy': 'Copiar',
  'netplay.copied': 'Copiado',
  'netplay.share': 'Compartir',
  'netplay.shareCopied': 'Enlace copiado',
  'netplay.inviteTitle': 'Invitación a una sala',
  'netplay.inviteBody': '¿Entrar en la sala {code}?',
  'netplay.inviteJoin': 'Entrar',
  'netplay.inviteCancel': 'Cancelar',
  'netplay.connected': 'Conectado',
  'netplay.waiting': 'Esperando al otro jugador',
  'netplay.joining': 'Entrando en la sala…',
  'netplay.waitingGame': 'Conectado: esperando a que el anfitrión cargue un cartucho',
  'netplay.hostPlaying': 'El anfitrión está jugando',
  'netplay.paused': 'En pausa',
  'netplay.toastHost': 'Conectado · el otro jugador ha entrado · eres el jugador 1',
  'netplay.toastGuest': 'Conectado al anfitrión · eres el jugador 2',
  'netplay.toastHostLeft': 'El anfitrión ha salido: la sala está cerrada',
  'netplay.toastGuestLeft': 'El jugador 2 ha salido de la sala',
  'netplay.youAreHost':
    'Eres el jugador 1. Carga un cartucho y la imagen se envía sola al invitado. Juegas con tu propia configuración de teclas: consulta los controles para ver la asignación actual.',
  'netplay.youAreGuest':
    'Eres el jugador 2. No necesitas cartucho: el anfitrión transmite la imagen y tu entrada se le envía a él. Juega con tu propia configuración de teclas (el grupo del jugador 1) o con un mando: consulta los controles.',
  'netplay.leave': 'Salir de la sala',
  'netplay.closeRoom': 'Cerrar la sala',
  'netplay.badCode': 'Ese código no parece correcto: deben ser 4 caracteres.',
  'netplay.errInsecure':
    'El juego en red necesita HTTPS o localhost. Esta página va por http simple, así que el navegador no ofrece la API criptográfica necesaria.',
  'netplay.errNoDirect':
    'Ambos lados llegaron al repetidor, pero no se pudo abrir una conexión directa: normalmente es cosa del NAT o del cortafuegos. Lo más fiable es estar en la misma red local.',
  'netplay.errPassword': 'El código de sala no coincide.',
  'netplay.errHandshake':
    'Se agotó el tiempo de conexión: puede que el otro jugador se haya ido.',
  'netplay.errHostLeft': 'El anfitrión ha salido de la sala: se ha cerrado.',
  'netplay.errNoRoom':
    'El anfitrión no responde. Puede que el código de sala no sea correcto o que aún no haya abierto la sala.',
  'netplay.errRoomFull': 'La sala está llena: este juego es solo de uno contra uno.',
  'netplay.errUnknown':
    'No se pudo conectar con el otro jugador. La consola del navegador indica el motivo exacto.',

  /* `/play` 那一页（左屏 + 右栏）。联机那部分复用上面的 `netplay.*`，别在这里另抄一份 */
  'seo.play.title': 'Sala de juego: carga un juego y juega en línea',
  'seo.play.description':
    'Una sola pantalla para empezar: juega solo o abre una sala 1 contra 1 y comparte el código. NES, SNES, Game Boy, GBA, Mega Drive y arcade.',
  'play.modeSolo': 'Solo',
  'play.start': 'Empezar',
  'play.confirmStart': 'Confirmar y empezar',
  'play.confirm': 'Confirmar',
  'play.qualityIntro': 'Elige la calidad de imagen del juego en red según tu conexión.',
  'play.qualityHint.smooth': '30 fps · Consume menos ancho de banda; ideal para conexiones lentas.',
  'play.qualityHint.balanced': 'Hasta 720p / 60 fps · Equilibrio entre nitidez y movimiento fluido.',
  'play.qualityHint.sharp':
    'Hasta 60 fps · Prioriza el detalle a resolución original; requiere una conexión rápida. En redes lentas puede bajar la tasa de fotogramas.',
  'play.qualityConfirmHint':
    'Al confirmar se conecta a la sala. El anfitrión carga el juego y el invitado recibe su imagen.',
  'play.connecting': 'Conectando…',
  'play.confirmJoin': 'Confirmar y entrar',
  'play.cancel': 'Cancelar',
  'play.screenSize': 'Tamaño de pantalla',
  'play.controlsTitle': 'Controles del juego',
  'play.netplayKeysHint': 'En el juego en red, cada jugador usa sus propias teclas del jugador 1.',
  'play.cancelled': 'Carga cancelada.',
  'play.retry': 'Volver a cargar',
  'play.retryJoin': 'Volver a intentar entrar',
  'play.saved': 'Partida guardada.',
  'play.localSaving': 'Guardando…',
  'play.uploading': 'Subiendo…',
  'play.cloudFailed': 'Error al sincronizar con la nube.',
  'play.saveNoLogin': 'Inicia sesión para sincronizar',
  'play.tooLarge': 'Partida demasiado grande',
  'play.theme': 'Tema',
  'play.saveFailed': 'No se pudo guardar la partida. Inténtalo de nuevo.',
  'play.loadFailed': 'No se pudo cargar la partida. Inténtalo de nuevo.',
  'play.leftRoom': 'Has salido de la sala.',
  'play.latency': 'Latencia',
  'play.measuringLatency': 'Midiendo…',
  'play.downloading': 'Descargando la ROM…',
  'play.booting': 'Iniciando el núcleo…',
  'play.loadFail': 'No se pudo cargar este cartucho.',
  'play.romIncomplete': 'El archivo ROM está incompleto: vuelve a cargarlo.',
  'play.notFound': 'No se encontró ese juego.',
  'play.fullscreen': 'Pantalla completa',
  'play.volume': 'Volumen',
  'play.edit': 'Editar',
  'play.hideSidebar': 'Ocultar panel',
  'play.showSidebar': 'Mostrar panel',
  'play.hint': 'Esc sale de pantalla completa. El resto de controles están a la derecha.',
  'play.leaveTitle': 'Partida en curso',
  'play.leaveBody':
    'Si vuelves atrás, esta sesión termina: el progreso no se guarda automáticamente.',
  'play.leaveStay': 'Seguir jugando',
  'play.leaveGo': 'Salir',
  'gamesPage.playOnline': 'Jugar en línea',

  /* 自定义按键面板。钮名（A B C X Y Z）是丝印，不进这张表 */
  'keybind.title': 'Configuración de teclas',
  'keybind.open': 'Ajustes de teclas',
  'keybind.close': 'Cerrar',
  'keybind.p1': 'Jugador 1',
  'keybind.p2': 'Jugador 2',
  'keybind.mine': 'Tus teclas',
  'keybind.pressKey': 'PULSA…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Restaurar valores por defecto',
  'keybind.reload': 'Recargar el cartucho',
  'keybind.reloading': 'Recargando…',
  'keybind.unsupported': 'Esa tecla no se puede usar: prueba con otra.',
  'keybind.conflictSame': '{pressed} ya está asignada al botón {button}: prueba con otra tecla.',
  'keybind.conflictOther':
    '{pressed} ya está asignada al botón {button} del jugador {player}: prueba con otra tecla.',
  'keybind.hint':
    'La configuración del teclado se lee una sola vez, al cargar el cartucho: recárgalo para aplicar los cambios. Los dos jugadores no pueden compartir una tecla.',
  'keybind.soloHint':
    'La configuración del teclado se lee una sola vez, al cargar el cartucho: recárgalo para aplicar los cambios.',
  'keybind.hostHint':
    'Eres el anfitrión: el jugador 1 son tus teclas y el jugador 2 es donde se inyecta la entrada del invitado. No pueden compartir tecla, o la entrada inyectada movería también a tu jugador 1. Recarga el cartucho después de cambiar.',
  'keybind.guestHint':
    'Eres el invitado y juegas con tu propia configuración (el grupo del jugador 1): cada uno está en su teclado, así que no hay conflictos. Los cambios se aplican al momento, sin recargar el cartucho.',
  'keybind.guestLocalHint':
    'Eres el invitado y aquí también corre un cartucho tuyo. Tus teclas son el grupo del jugador 1: mueven ese cartucho local, así que recárgalo tras cambiarlas; además son las que se envían al anfitrión, y allí se aplican al momento.',

  /* 在线游戏库 */
  'games.open': 'Biblioteca de juegos',
  'games.title': 'Biblioteca de juegos',
  'games.close': 'Cerrar',
  'games.empty': 'La biblioteca está vacía: todavía no se ha subido nada',
  'games.loading': 'Cargando…',
  'games.loadingRom': 'Cargando {name}…',
  'games.cancel': 'Cancelar',
  'games.failed': 'No se pudo cargar la biblioteca de juegos',
  'games.tabLibrary': 'Biblioteca',
  'games.tabHistory': 'Historial',
  'games.historyEmpty': 'Aún no has abierto nada de la biblioteca',
  'games.historyLoad': '{name}\nHaz clic para volver a cargar',
  'games.tabFavorites': 'Favoritos',
  'games.favorite': 'Añadir {name} a favoritos',
  'games.unfavorite': 'Quitar {name} de favoritos',
  'games.favoritesEmpty': 'Aún no hay favoritos: toca la estrella de cualquier portada.',
  /* 未登录时那句提示：中间那颗 <button> 的文字借 `games.favoritesSignInLink` */
  'games.favoritesSignInBefore': 'Para guardar tus favoritos necesitas una cuenta: ',
  'games.favoritesSignInLink': 'Iniciar sesión',
  'games.favoritesSignInAfter': ' aquí mismo, o usa el botón de cuenta de arriba a la derecha.',

  /* 账号面板 */
  'user.title': 'Cuenta',
  'user.close': 'Cerrar',
  'user.open': 'Cuenta: iniciar sesión o registrarse',
  'user.openSignedIn': 'Cuenta: {name}',
  'user.tabLogin': 'Iniciar sesión',
  'user.tabRegister': 'Crear cuenta',
  'user.username': 'Nombre de usuario',
  'user.password': 'Contraseña',
  'user.usernameHint': '3–20 caracteres: letras, dígitos, _ - .',
  'user.emailLabel': 'Correo electrónico',
  'user.emailHint': 'Tu correo. Sin alias ni correo temporal.',
  'user.passwordHint': 'Mínimo 6 caracteres, sin espacios.',
  'user.signIn': 'Iniciar sesión',
  'user.signUp': 'Crear cuenta',
  'user.signingIn': 'Iniciando sesión…',
  'user.signingUp': 'Creando…',
  'user.signOut': 'Cerrar sesión',
  'user.signedInAs': 'Sesión iniciada como {name}.',
  'user.cloudHint':
    'Tu historial, tus partidas y tus favoritos se guardan en tu cuenta: abre cualquier juego de la biblioteca en línea y se sincronizan solos.',
  'user.formLead':
    'Inicia sesión y tus partidas, tu historial y tus favoritos se guardan en la nube: ¡juega cuando quieras, donde quieras!',
  /*
   * 表单下面那句法律声明，拆成四段、中间夹两个真链接。
   * 西语里「aceptas nuestros + 阳性/阴性名词」配不上（Términos 是阳性、Política 是阴性），
   * 所以这里用「aceptas:」把两个链接并列，别改成 nuestros / nuestras。
   * ⚠️ 值首尾的空格是有意义的，别 trim。
   */
  'user.consentLogin': 'Al iniciar sesión aceptas: ',
  'user.consentRegister': 'Al crear una cuenta aceptas: ',
  'user.consentMiddle': ' y ',
  'user.consentAfter': '.',
  'user.error.failed': 'Algo ha fallado: inténtalo de nuevo.',
  'user.error.missingCredentials': 'Escribe un nombre de usuario y una contraseña.',
  'user.error.usernameInvalid': 'El nombre de usuario solo puede tener letras, dígitos, _ - y .',
  'user.error.usernameTooShort': 'El nombre de usuario es demasiado corto (mínimo 3 caracteres).',
  'user.error.usernameTooLong': 'El nombre de usuario es demasiado largo (máximo 20 caracteres).',
  'user.error.usernameTaken': 'Ese nombre de usuario ya está ocupado: elige otro.',
  'user.error.emailInvalid': 'Escribe una dirección de correo válida.',
  'user.error.emailAlias':
    'No se permiten correos con alias (como nombre+etiqueta@… o Gmail con puntos).',
  'user.error.emailTemp': 'No se permiten correos desechables: usa tu buzón habitual.',
  'user.error.passwordInvalid': 'Escribe una contraseña.',
  'user.error.passwordTooShort': 'La contraseña es demasiado corta (mínimo 6 caracteres).',
  'user.error.passwordTooLong': 'La contraseña es demasiado larga (máximo 72 caracteres).',
  'user.error.passwordHasSpace': 'La contraseña no puede contener espacios.',
  'user.error.invalidCredentials': 'Nombre de usuario o contraseña incorrectos.',
  'user.error.banned': 'Esta cuenta está suspendida.',
  'user.error.captchaRequired': 'Completa primero la verificación humana.',
  'user.error.captchaFailed': 'La verificación humana ha fallado: inténtalo de nuevo.',
  'login.lead':
    'Inicia sesión y tus partidas, tu historial y tus favoritos se guardan en la nube: juega cuando quieras, donde quieras. ¿Aún no tienes cuenta? Crea una.',

  /* 个人中心 */
  'account.title': 'Tu cuenta',
  'account.loading': 'Cargando…',
  'account.failed': 'Algo ha fallado: inténtalo de nuevo.',
  'account.since': 'Miembro desde {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Estándar',
  'account.vipUntil': 'VIP hasta {time}',
  'account.vipExpired': 'VIP caducado el {time}',
  'account.tabFavorites': 'Favoritos',
  'account.tabHistory': 'Historial',
  'account.tabSaves': 'Partidas guardadas',
  'account.tabProfile': 'Perfil',
  'account.tabPassword': 'Contraseña',
  'account.favoritesLoading': 'Cargando favoritos…',
  'account.historyLoading': 'Cargando historial…',
  'account.savesLoading': 'Cargando partidas…',
  'account.favoritesEmpty':
    'Aún no hay favoritos: abre la biblioteca en la sala y toca la estrella de una portada.',
  'account.unfavorite': 'Quitar {name} de favoritos',
  'account.historyEmpty':
    'Aún no hay historial: aquí aparecen los juegos que abras desde la biblioteca en línea.',
  'account.historyCount': '{count} juegos jugados recientemente',
  'account.historyDeleted': 'Eliminado del historial.',
  'account.clearHistory': 'Borrar todo',
  'account.confirmClearHistory': '¿Seguro que quieres borrarlo todo?',
  'account.historyCleared': 'Historial borrado.',
  'account.historyHint':
    'El historial guarda tus {max} juegos más recientes: si vuelves a jugar uno antiguo, pasa otra vez al principio.',
  'account.savesEmpty': 'Aún no hay partidas en la nube.',
  'account.savesCount': '{count} partidas en total',
  'account.savesGroupCount': '{count} partidas',
  'account.viewGame': 'Ver {name}',
  'account.savesHint':
    'Una partida por juego: si vuelves a guardar, se sobrescribe. Igual en el dispositivo y en la nube.',
  'account.saveDeleted': 'Partida borrada.',
  'account.clearSaves': 'Borrar todo',
  'account.confirmClearSaves': '¿Seguro que quieres borrarlo todo?',
  'account.savesCleared': 'Se han borrado {count} partidas.',
  'account.delete': 'Borrar',
  'account.confirmDelete': '¿Seguro que quieres borrarla?',
  'account.avatar': 'Avatar',
  'account.chooseImage': 'Elegir imagen',
  'account.clearAvatar': 'Quitar avatar',
  'account.uploading': 'Subiendo…',
  'account.avatarSaved': 'Avatar actualizado.',
  'account.avatarCleared': 'Avatar eliminado.',
  'account.avatarHint': 'PNG, JPEG, WebP o GIF, hasta 2 MB.',
  'account.gender': 'Género',
  'account.genderNone': 'Sin especificar',
  'account.genderMale': 'Hombre',
  'account.genderFemale': 'Mujer',
  'account.genderSaved': 'Guardado.',
  'account.genderHint': 'Opcional: solo lo ves tú.',
  'account.passwordTabHint':
    'Después del cambio sigues con la sesión iniciada en este dispositivo: no hace falta volver a entrar.',
  'account.password': 'Contraseña',
  'account.oldPassword': 'Contraseña actual',
  'account.newPassword': 'Nueva contraseña',
  'account.confirmPassword': 'Repite la nueva contraseña',
  'account.savePassword': 'Cambiar contraseña',
  'account.saving': 'Guardando…',
  'account.passwordSaved': 'Contraseña cambiada.',
  'account.passwordHint':
    'Después del cambio sigues con la sesión iniciada en este dispositivo. Los demás dispositivos conectados seguirán funcionando hasta que caduque su sesión.',
  'account.error.missingOld': 'Escribe tu contraseña actual.',
  'account.error.wrongPassword': 'La contraseña actual no es correcta.',
  'account.error.passwordTooShort': 'La nueva contraseña es demasiado corta (mínimo 6 caracteres).',
  'account.error.passwordTooLong': 'La nueva contraseña es demasiado larga (máximo 72 caracteres).',
  'account.error.passwordHasSpace': 'La nueva contraseña no puede contener espacios.',
  'account.error.mismatch': 'Las dos contraseñas nuevas no coinciden.',
  'account.error.avatarMissing': 'Elige primero una imagen.',
  'account.error.avatarTooLarge': 'Esa imagen es demasiado grande (máximo 2 MB).',
  'account.error.avatarType': 'Formato no compatible: usa PNG, JPEG, WebP o GIF.',

  /* 在线库列表上的筛选 + 搜索 */
  'games.filterAll': 'Todas',
  'games.searchPlaceholder': 'Buscar por título / desarrollador / serie',
  'games.search': 'Buscar',
  'games.noMatch': 'No hay juegos que coincidan.',
  'games.prev': 'Anterior',
  'games.next': 'Siguiente',
  /* 与 en / ja 一样是空串：那条提示只说给「文件在境外」的读者，西语读者多半也在境外 */
  'games.remoteSlow': '',

  /* 屋里那些小东西：纸片 / 窗外的季节 / 挂画 / MP4 / 逗猫棒 */
  'note.text': 'Ojalá recuperemos la alegría que teníamos de niños..',
  'note.open': 'Leer la nota del suelo',
  'note.title': 'Una nota',
  'note.close': 'Cerrar',
  'window.cycle': 'Cambiar la estación del exterior',
  'painting.open': 'Ver el cuadro de cerca',
  'painting.close': 'Cerrar',
  'painting.title.sunflowers': 'Los girasoles',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'La Gioconda',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'La noche estrellada',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'El grito',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'La joven de la perla',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'La gran ola de Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  /* 第七幅是站主自己的照片，说法照 en 的「不知从哪来的无名画作」，别改成正经画名 */
  'painting.title.unknown': 'Un cuadro sin nombre de quién sabe dónde',
  'painting.artist.unknown': 'Anónimo',
  'mp4.play': 'Reproducir una canción en el reproductor MP4',
  'mp4.pause': 'Pausar el reproductor MP4',
  'cat.wand': 'Agitar el juguete de gato del suelo',
  'cat.ragdoll': 'Un ragdoll asoma detrás de los libros',
  'cat.siamese': 'Un siamés asoma detrás de los libros',
  'cat.tabby': 'Un atigrado asoma detrás de los libros',
  'cat.orange': 'Un atigrado naranja asoma detrás de los libros',
  'cat.american': 'Un americano de pelo corto asoma detrás de los libros',
  'cat.tuxedo': 'Un gato esmoquin asoma detrás de los libros',
  'cat.calico': 'Un gato calicó asoma detrás de los libros',

  /* 地板上那本留言本 */
  'feedback.open': 'Leer el libro de visitas del suelo',
  'feedback.title': 'Libro de visitas',
  'feedback.close': 'Cerrar',
  'feedback.placeholder': 'Escribe algo: una sugerencia o un juego que te gustaría ver aquí…',
  'feedback.submit': 'Publicar',
  'feedback.submitting': 'Publicando…',
  'feedback.ok': '¡Publicado! Gracias.',
  'feedback.required': 'Escribe algo primero.',
  'feedback.failed': 'No se pudo publicar: inténtalo de nuevo.',
  'feedback.loading': 'Cargando…',
  'feedback.empty': 'Aún no hay mensajes: sé el primero en escribir.',
  'feedback.retry': 'Reintentar',
  'feedback.prev': 'Anterior',
  'feedback.next': 'Siguiente',
  'feedback.page': 'Página {n}',
  'feedback.resolved': 'Resuelto',
  'feedback.unresolved': 'Pendiente',

  /* 隐私 / 条款：只有房间界面要用的几个词，正文在 lib/legal.ts */
  'legal.privacy': 'Política de privacidad',
  'legal.terms': 'Términos del servicio',
  'legal.updated': 'Última actualización: {date}',
  'legal.contact': 'Contacto:',

  /* 初次打开的操作指引 */
  'tour.title': 'Guía rápida',
  'tour.skip': 'Saltar',
  'tour.back': 'Atrás',
  'tour.next': 'Siguiente',
  'tour.done': 'Empezar a jugar',
  'tour.replay': 'Ver la guía otra vez',
  'tour.screen.title': 'Empieza con un juego',
  'tour.screen.body':
    'Arrastra un archivo ROM (.nes, .sfc, .gba, .md, .gb…) o un .zip de arcade al televisor, o haz clic en la pantalla para elegir un archivo. Este repositorio no incluye ROMs: trae las tuyas.',
  'tour.rail.title': 'La columna de interruptores',
  /* 语言那一项照 en 列全名（语言名用各自的语言写，不翻译） */
  'tour.rail.body':
    'Tres grupos, de arriba abajo. Aspecto: tema (noche / día), idioma (18 idiomas), pantalla completa (lo que se pone a pantalla completa es la pantalla), modo simple (deja solo la pared, el televisor, la mesa y el suelo), tamaño del televisor (abre un selector grande / mediano / pequeño; la mesa se ensancha con él). Juegos: juego en red, configuración de teclas. Ayuda: controles y libro de visitas.',

  /* 内容页顶栏 / 小屏菜单抽屉 */
  'topLinks.label': 'Páginas del sitio',
  'topLinks.games': 'Lista de juegos',
  'menu.open': 'Abrir el menú',
  'menu.close': 'Cerrar el menú',
  'menu.theme': 'Tema',
  'menu.simple': 'Modo simple',

  /* 「离开房间」确认 */
  'leave.title': '¿Salir de esta página?',
  'leave.bodyGame': 'La partida en curso se interrumpirá: el progreso no se guarda.',
  'leave.bodyNetplay': 'Saldrás de la sala de juego en red y tu compañero se desconectará.',
  'leave.stay': 'Quedarme',
  'leave.confirm': 'Salir',

  /* 游戏列表页 */
  'gamesPage.heading': 'Todos los juegos',
  'gamesPage.intro':
    '{count} juegos en la biblioteca en línea: NES, SNES, Game Boy, GBA, Mega Drive, arcade y más. Haz clic en una portada para ver los detalles o empieza a jugar directamente.',
  'gamesPage.empty': 'La biblioteca está vacía ahora mismo.',
  'gamesPage.introConsole':
    '{count} juegos de {console} en la biblioteca. Haz clic en una portada para ver los detalles o empieza a jugar directamente.',
  'gamesPage.filterLabel': 'Filtrar por consola',
  'gamesPage.filterAll': 'Todas',
  'gamesPage.consoleEmpty': 'Aún no hay juegos de {console} en la biblioteca.',
  'gamesPage.searchLabel': 'Buscar en la biblioteca de juegos',
  'gamesPage.searchPlaceholder': 'Buscar por título / desarrollador / serie',
  'gamesPage.searchSubmit': 'Buscar',
  'gamesPage.searchLoading': 'Buscando…',
  'gamesPage.searchClear': 'Borrar la búsqueda',
  'gamesPage.searchResults': '«{keyword}»: {count} juegos coinciden.',
  'gamesPage.searchEmpty':
    'Ningún juego coincide con «{keyword}». Prueba con una palabra más corta o con el título.',
  'gamesPage.prev': 'Anterior',
  'gamesPage.next': 'Siguiente',
  'gamesPage.backHome': 'Volver al inicio',
  'gamesPage.backToGames': 'Todos los juegos',
  /* 左上角那颗是浏览器回退，所以写「返回」，不写「全部游戏」 */
  'common.back': 'Volver',
  'common.home': 'Inicio',
  'gamesPage.play': 'Jugar ahora',
  'gamesPage.download': 'Descargar ROM',
  'gamesPage.share': 'Compartir este juego',
  'gamesPage.shareCopied': 'Enlace copiado',
  'gamesPage.shareFailed': 'No se pudo copiar',
  'gamesPage.shareCopy': 'Copiar enlace',
  'gamesPage.shareText': '{name} — juégalo en el navegador en {site}',
  'gamesPage.shareEmail': 'Correo',
  'gamesPage.shareClose': 'Cerrar',
  'gamesPage.favorite': 'Añadir a favoritos',
  'gamesPage.unfavorite': 'Quitar de favoritos',
  'gamesPage.favoriteSignIn':
    'Inicia sesión para guardar favoritos: usa el botón de inicio de sesión de la barra superior.',
  'gamesPage.favoriteFailed': 'No se pudieron actualizar los favoritos: inténtalo de nuevo.',
  'gamesPage.favoriteCount': '{n} personas lo tienen en favoritos',
  'gamesPage.report': 'Informar de un problema',
  'gamesPage.reportTitle': 'Informar de un problema',
  'gamesPage.reportSubject': 'Sobre: {name}',
  'gamesPage.reportPlaceholder':
    '¿Qué ha fallado? Por ejemplo: no arranca, la imagen se ve mal, no hay sonido…',
  'gamesPage.reportSubmit': 'Enviar informe',
  'gamesPage.reportSubmitting': 'Enviando…',
  'gamesPage.reportOk': 'Gracias, lo revisaremos.',
  'gamesPage.reportRequired': 'Describe primero el problema.',
  'gamesPage.reportFailed': 'No se pudo enviar: inténtalo de nuevo.',
  'gamesPage.reportClose': 'Cancelar',

  /* 详情页的评论模块（发评论必须先登录，列表公开） */
  'comments.heading': 'Comentarios',
  'comments.count': '{n} comentarios',
  'comments.empty': 'Aún no hay comentarios: sé el primero.',
  'comments.placeholder': '¿Qué te parece este juego?',
  'comments.ratingLabel': 'Tu valoración',
  'comments.ratingStar': 'Valorar con {n} de 5',
  'comments.ratingValue': '{n} de 5 estrellas',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Elige primero una puntuación.',
  'comments.submit': 'Publicar comentario',
  'comments.submitting': 'Publicando…',
  'comments.ok': 'Publicado: aparece al principio de la lista.',
  'comments.required': 'Escribe algo antes de publicar.',
  'comments.failed': 'No se pudo publicar: inténtalo de nuevo.',
  'comments.signInLead': 'Inicia sesión para publicar un comentario.',
  'comments.signIn': 'Iniciar sesión',
  'comments.signInRequired': 'Vuelve a iniciar sesión para publicar.',
  'comments.loading': 'Cargando comentarios…',
  'comments.retry': 'Reintentar',
  'comments.loadFailed': 'No se pudieron cargar los comentarios.',
  'comments.loadMore': 'Ver más',
  'comments.delete': 'Borrar',
  'comments.deleteConfirm': 'Confirmar',
  'comments.cancel': 'Cancelar',
  'comments.deleted': 'Comentario eliminado.',
  'comments.deleteFailed': 'No se pudo borrar: inténtalo de nuevo.',

  'gamesPage.field.console': 'Consola',
  'gamesPage.field.year': 'Año',
  'gamesPage.field.developer': 'Desarrollador',
  'gamesPage.field.series': 'Serie',
  'gamesPage.field.language': 'Idioma',
  'gamesPage.controls': 'Controles',
  'gamesPage.selectLanguage': 'Elegir idioma',

  'notFound.title': 'Página no encontrada',
  'notFound.description':
    'Esa dirección no existe en {site}. Comprueba el enlace o vuelve a la página de inicio.',
  'gamesPage.notFoundTitle': 'Juego no encontrado',
  'gamesPage.notFound': 'Este juego no está en la biblioteca (o ya no lo está).',
  'gamesPage.fallbackDescription': '{title} es un juego de {console}.',

  /* 开发商两页 */
  'developersPage.heading': 'Desarrolladores',
  'developersPage.intro':
    '{count} desarrolladores detrás de los juegos de la biblioteca. Abre uno para ver todo lo que tenemos de ese estudio.',
  'developersPage.empty': 'Aún no hay desarrolladores.',
  'developersPage.gameCount': '{count} juegos',
  'developersPage.gamesHeading': 'Juegos de {name}',
  'developersPage.gamesEmpty': 'Aún no hay ningún juego de este desarrollador en la biblioteca.',
  'developersPage.field.founded': 'Fundación',
  'developersPage.backToDevelopers': 'Todos los desarrolladores',
  'developersPage.notFoundTitle': 'Desarrollador no encontrado',
  'developersPage.notFound': 'Este desarrollador no está en la biblioteca (o ya no lo está).',

  /* 机种两页 */
  'consolesPage.heading': 'Consolas',
  'consolesPage.intro':
    'Las consolas de la biblioteca: {count} juegos en total. Abre una para ver todos sus títulos.',
  'consolesPage.gameCount': '{count} juegos',
  'consolesPage.gamesHeading': 'Juegos de {name}',
  'consolesPage.gamesEmpty': 'Aún no hay juegos de esta consola en la biblioteca.',
  /* `{lang}` 是 lib/rom-lang.ts 的语言全称（如 English / 日本語），不翻译 */
  'consolesPage.gamesEmptyLang': 'Aún no hay juegos en {lang} para esta consola.',
  'consolesPage.filterLangLabel': 'Filtrar por idioma',
  'consolesPage.field.released': 'Lanzamiento',
  'consolesPage.backToConsoles': 'Todas las consolas',
  'consolesPage.notFoundTitle': 'Consola no encontrada',
  'consolesPage.notFound': 'Esta consola ya no forma parte del sitio (o nunca lo estuvo).',

  'download.heading': 'Descargar la ROM',
  'download.hint': 'Haz clic en el botón de abajo: la descarga empieza a los 6 segundos.',
  'download.button': 'Empezar la descarga',
  'download.waiting': 'Empieza en {seconds} s…',
  'download.started': 'Descarga iniciada: revisa las descargas del navegador.',
  'download.rights': 'Descarga solo archivos ROM que tengas derecho a usar.',
  'download.disclaimer':
    'Aviso legal: todos los archivos ROM de esta página se han recopilado de terceros y se ofrecen únicamente para estudio personal y copia de seguridad. Todos los derechos de autor pertenecen a sus titulares originales; si algún contenido vulnera tus derechos, contáctanos y lo retiraremos.',

  /* 房间页那条 `?id=` 深链 */
  'deepLink.notFound': 'No se encontró ese juego: puede que se haya eliminado.',
  'deepLink.title': 'Cargando juego',
  'deepLink.loading': 'Descargando la ROM…',
  'deepLink.hint': 'Empieza solo cuando termine la descarga.',
};

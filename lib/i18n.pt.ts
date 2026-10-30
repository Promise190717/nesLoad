/**
 * 葡萄牙语（巴西）界面文案（2026-10-20 加）。
 *
 * **为什么不写在 `lib/i18n.ts` 里**：那边已经有 `en` / `zh` 两张表、加起来两千多行；
 * 再塞一张进来只会让它更难翻。理由和 `lib/legal.ts` 当初分出去的一样。
 * 代价是「加语言」从「改一处」变成「加一个文件 + 在 `messages` 里挂上」。
 *
 * ⚠️ **`MessageKey` 从 `lib/i18n.ts` 的 `en` 表推导**，这里是 `Record<MessageKey, string>`：
 *    · 少一个键 → 编译报错（缺属性）；
 *    · 多一个键 / 拼错键名 → 编译报错（多余属性）。
 *    所以**这份文件的键必须与 `en` 表逐键一致、顺序也一致**，`zh` / `ja` / `ko` 同理。
 *    改文案时先改 `en`，再回来对齐另外几份。
 *
 * ⚠️ **这是界面语言，不是内容语言**。游戏标题 / 简介的葡语在数据库里
 *    （`game_texts` 的行，见 lib/game-text.ts），不在这张表里。
 *
 * ⚠️ **占位符 `{xxx}` 必须原样保留**（`{site}` / `{count}` / `{name}` / `{level}` …），
 *    它们由 `translate()` 在运行时替换；漏掉一个不会报错，只会在页面上少一段字。
 *    葡语语序可以把占位符挪位置，但**不能改名、不能丢**。
 *
 * ⚠️ **站点名一律写 `Retro Games Box`，不翻译**；`{site}` 占位符照留（由 `SITE_NAME` 替换）。
 *
 * 术语口径（全表统一，改的时候一起改）：
 *   · console → console；developer → desenvolvedor；series → série
 *   · cartridge → cartucho；room → sala；host → anfitrião；guest → convidado
 *   · netplay → jogo online；save → save（巴西玩家的通行说法，不译成「jogo salvo」）
 *   · key bindings → configuração de teclas；game library → biblioteca de jogos
 *   · guestbook → livro de visitas；screen → tela；file → arquivo
 *
 * ⚠️ 机种名用**巴西玩家的通行写法**（NES / Super Nintendo (SNES) / Game Boy / GBC /
 *    GBA / NDS / Mega Drive / Game Gear / Master System / 32X / WonderSwan /
 *    Neo Geo Pocket / PlayStation / Arcade）。巴西也叫 Mega Drive，不写 Genesis；
 *    标签位上取的是 `lib/consoles.ts` 的 `consoleLabel(type, locale)`，和文案同源。
 *
 * ⚠️ 语气：界面短句、简洁直接，按钮用不定式（Jogar / Baixar / Carregar）。
 *    词汇走**巴西口径**（arquivo / tela / salvar / configurações），不用欧洲葡语写法。
 */

import type { MessageKey } from './i18n';

export const pt: Record<MessageKey, string> = {
  'meta.title':
    '{site} — Jogue jogos retrô no navegador: NES, SNES, GBA e Arcade',
  'meta.description':
    'Jogue NES, SNES / SFC, Game Boy, GBA, Mega Drive e jogos de arcade no navegador. Escolha um título da biblioteca online ou carregue seu próprio arquivo ROM.',
  'meta.keywords':
    'jogos retrô, biblioteca de jogos retrô online, emulador de NES, emulador de SNES, emulador de SFC, emulador de GBA, emulador de Game Boy Advance, emulador de Game Boy, emulador de Game Boy Color, emulador de NDS, emulador de Nintendo DS, emulador de Mega Drive, emulador de Sega Genesis, emulador de Game Gear, emulador de Master System, emulador de Sega 32X, emulador de WonderSwan, emulador de Neo Geo Pocket, emulador de PlayStation, emulador de PS1, emulador de PSX, emulador de arcade, jogar NES no navegador, emulador no navegador, RetroArch WASM, {site}',
  'seo.room.title': 'Sala Pixel — Jogue jogos retrô no navegador',
  'seo.room.description':
    'Entre na sala pixel: NES, SNES / SFC, Game Boy, GBA, Mega Drive e jogos de arcade rodam na TV de tubo. Escolha um título da biblioteca online ou arraste seu próprio arquivo ROM para a tela.',
  'seo.login.title': 'Entrar',
  'seo.login.description':
    'Entre na sua conta para manter saves, histórico de jogos e favoritos sincronizados entre dispositivos.',

  'home.hero.title': 'Jogue clássicos retrô no navegador',
  'home.hero.lead':
    '{site} tem NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade e mais para jogar online, com partidas online para dois jogadores.',
  'home.hero.play': 'Carregar uma ROM local',
  'home.hero.browse': 'Ver todos os jogos',
  'home.join.title': 'Jogar com um amigo',
  'home.join.hint': 'Digite o código de 4 caracteres que seu amigo compartilhou.',
  'home.join.submit': 'Entrar na sala',
  'home.hero.or': 'OU',
  'home.search.label': 'Buscar na biblioteca de jogos',
  'home.search.placeholder': 'Buscar título / desenvolvedor / série',
  'home.search.submit': 'Buscar',
  'home.consoles.title': 'Navegar por console',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade e mais — escolha um para ver os jogos dele.',
  'home.consoles.count': '{count} jogos',
  'home.consoles.all': 'Todos os consoles',
  'home.latest.title': 'Adições recentes',
  'home.latest.lead': 'Os jogos mais novos do site.',
  'home.latest.viewAll': 'Todos os jogos',
  'home.developers.title': 'Navegar por desenvolvedor',
  'home.developers.lead': 'Estes estúdios têm mais jogos aqui.',
  'home.developers.viewAll': 'Todos os desenvolvedores',
  'home.empty':
    'A biblioteca está vazia agora — abra a sala e arraste uma ROM para a TV para começar a jogar.',
  'home.faq.title': 'Perguntas frequentes',
  'home.faq.q1': 'É grátis?',
  'home.faq.a1':
    'Totalmente grátis — todos os jogos estão liberados. Ao entrar, você ganha saves na nuvem para o histórico e os arquivos de save.',
  'home.faq.q2': 'Preciso instalar alguma coisa?',
  'home.faq.a2': 'Não — basta clicar em um jogo e jogar direto no navegador.',
  'home.faq.q3': 'Funciona em celulares e tablets?',
  'home.faq.a3': 'Sim — funciona direto no navegador do celular e do tablet.',
  'home.faq.q4': 'Posso baixar os arquivos ROM?',
  'home.faq.a4':
    'Sim — toda página de jogo tem um botão de download. Baixe apenas arquivos ROM que você tem direito legal de usar.',
  'home.faq.q5': 'Posso jogar com um amigo?',
  'home.faq.a5': 'Claro! Chame um amigo e abra uma sala para a partida.',
  'home.faq.q6': 'Suporta controle?',
  'home.faq.a6':
    'Sim — conecte um controle USB ou Bluetooth e o emulador o reconhece pelo navegador. O mapeamento dos botões segue o padrão de cada core; no celular, use os botões na tela.',

  'seo.heading': 'Jogue jogos retrô no navegador',
  'seo.intro':
    '{site} é uma sala de jogos retrô online. Títulos de NES, SNES / SFC, Game Boy, GBA, Mega Drive e arcade rodam aqui mesmo no navegador — emulados na sua própria máquina, com o RetroArch compilado em WebAssembly.',
  'seo.howTo':
    'Escolha um jogo da biblioteca online ou arraste seu próprio arquivo ROM para a TV. Nada para instalar.',

  'seo.games.title': 'Todos os jogos — Jogue NES, SNES, GBA e Arcade online',
  'seo.games.description':
    '{count} jogos retrô na biblioteca online, todos jogáveis no navegador: NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade e mais. Abra um título para ver os detalhes, jogue na hora ou baixe o arquivo ROM.',
  'seo.games.search.title': 'Resultados da busca por “{keyword}”',
  'seo.games.search.description':
    '{count} jogos da biblioteca online correspondem a “{keyword}”. Jogue no navegador ou baixe o arquivo ROM.',
  'seo.games.console.title': 'Jogos de {console} — Jogue online no navegador',
  'seo.games.console.description':
    '{count} jogos de {console} na biblioteca online, todos jogáveis no navegador ou baixáveis como arquivos ROM.',
  'seo.game.title': '{title} — Jogue {console} online',
  'seo.game.description':
    'Jogue {title} ({console}) direto no navegador — grátis e sem instalar nada. O arquivo ROM também está disponível para download.',
  'seo.gameDownload.title': 'Baixar a ROM de {title} ({console})',
  'seo.gameDownload.description':
    'Baixe o arquivo ROM de {title} ({console}) em um clique, sem cadastro. Você também pode jogar direto no navegador.',
  'seo.developers.title':
    'Desenvolvedores — Jogue os jogos de NES, SNES, GBA e Arcade deles',
  'seo.developers.description':
    '{count} desenvolvedores por trás dos jogos da biblioteca online. Abra um para ver todos os títulos que temos daquele estúdio.',
  'seo.developer.title': '{name} — Jogos deste desenvolvedor',
  'seo.developer.description':
    'Todos os jogos de {name} na biblioteca online ({count}), jogáveis no navegador ou baixáveis como arquivo ROM.',
  'seo.consoles.title':
    'Navegar por console — Jogue NES, SNES, GBA e Arcade online',
  'seo.consoles.description':
    'Todos os consoles da biblioteca online ({count} jogos no total). Escolha um para ver todos os jogos dele, jogáveis no navegador.',
  'seo.console.title': 'Jogos de {name} — Jogue online',
  'seo.console.description':
    'Todos os jogos de {name} na biblioteca online ({count}), jogáveis no navegador ou baixáveis como arquivo ROM.',

  'theme.toDark': 'Mudar para o modo noturno',
  'theme.toLight': 'Mudar para o modo diurno',
  'lamp.turnOn': 'Acender o abajur',
  'lamp.turnOff': 'Apagar o abajur',
  'simple.enter': 'Modo simples: deixe só a parede, a TV, a mesa e o chão',
  'simple.exit': 'Sair do modo simples',
  'tvSize.open': 'Tamanho da TV',
  'tvSize.opt.large': 'Grande',
  'tvSize.opt.medium': 'Média',
  'tvSize.opt.small': 'Pequena',
  'tvSize.pick': 'Definir o tamanho da TV como {level}',
  'locale.label': 'Idioma',
  /*
   * 语言提示弹窗。三条都提到「当前页面是哪种语言」，所以每种语言各写一份 ——
   * 弹窗正文跟**当前页面语言**，只有那颗钮跟**目标语言**（LOCALE_SWITCH_LABEL）。
   */
  'localePrompt.title': 'Esta página está em português',
  'localePrompt.body': 'Seu navegador prefere outro idioma. Trocar?',
  'localePrompt.keep': 'Continuar em português',
  'fullscreen.enter': 'Tela cheia no jogo',
  'fullscreen.exit': 'Sair da tela cheia',

  /*
   * 屏幕上的提示。走 `font-pixel`（Press Start 2P）—— 全大写是英文那一侧的排版风格，
   * 葡语沿用（字模有拉丁字母；重音符号在这套字模里不稳，所以这几条一律不带重音）。
   */
  'screen.pick': 'Clique para escolher um arquivo ROM, ou arraste um aqui',
  'screen.srLabel': 'Escolher um arquivo ROM para executar',
  'screen.tapLoad': 'CLIQUE PARA CARREGAR UMA ROM LOCAL',
  'screen.orLibrary': 'OU INICIE PELA BIBLIOTECA ONLINE',
  'screen.release': 'SOLTE PARA CARREGAR',
  'screen.mobileLibrary': 'INICIAR PELA BIBLIOTECA',
  'screen.mobileTap': 'TOQUE NA TELA PARA ABRIR A BIBLIOTECA',
  'screen.waitingHost': 'AGUARDANDO O ANFITRIAO',
  'screen.paused': 'PAUSADO',
  'screen.resumeOnPanel': 'APERTE CONTINUAR NO PAINEL',
  'screen.resumeInPanel': 'APERTE CONTINUAR NO PAINEL DA DIREITA',
  'screen.waitHostResume': 'AGUARDANDO O ANFITRIAO CONTINUAR',

  /* 机身面板那排钮 */
  'panel.resume': 'Continuar',
  'panel.pause': 'Pausar',
  'panel.save': 'Salvar',
  'panel.load': 'Carregar',
  'panel.reset': 'Reiniciar',
  'panel.eject': 'Ejetar',
  'volume.down': 'Diminuir o volume um nível',
  'volume.up': 'Aumentar o volume um nível',
  'volume.set': 'Definir o volume em {level} de {max}',

  'saves.title': 'Carregar save',
  'saves.load': 'Carregar',
  'saves.close': 'Fechar',
  'saves.groupLocal': 'Neste dispositivo',
  'saves.groupCloud': 'Nuvem (conta)',
  'saves.deleteCloud': 'Excluir este save da nuvem',
  'saves.delete': 'Excluir',
  'saves.loginHint':
    'Entre para guardar saves na nuvem e continuar de onde parou em qualquer dispositivo.',
  'saves.login': 'Entrar',
  'saves.loading': 'Carregando…',
  'saves.downloading': 'Baixando o save da nuvem…',
  'saves.restoring': 'Restaurando o jogo…',
  'saves.empty': 'Nenhum save ainda',

  'library.removeLabel': 'Remover {name}',

  'legend.moves': 'move',
  'legend.open': 'Controles',
  'legend.title': 'Controles',
  'legend.close': 'Fechar',
  'legend.needZip':
    'Formato  O FBNeo só lê .zip — este parece ser {ext}. Reempacote ou use uma versão .zip',
  'play.needZip':
    'Formato  Esta ROM é um arquivo {ext} que não pôde ser descompactado — tente um .zip ou uma ROM sem compactação',
  'legend.needDisc':
    'Formato  Imagens de disco costumam ter vários arquivos (.cue + .bin). Este site só aceita imagens de arquivo único — use uma versão .pbp, .iso ou .chd',
  'play.needDisc':
    'Formato  Esta é uma imagem de disco com vários arquivos (.cue + .bin). Aqui só funcionam imagens de arquivo único — tente uma versão .pbp, .iso ou .chd',
  'legend.needBios':
    'BIOS  Este jogo parece ser de Neo Geo (KOF, Metal Slug…). Ele precisa do neogeo.zip — arraste esse arquivo para a página e ele será instalado. Jogos de CPS1 / CPS2 não precisam.',
  'legend.gamepad':
    'Controle  Conecte um e ele funciona — dos dois lados quando você está em uma sala.',

  'netplay.title': 'Jogo online',
  'netplay.open': 'Jogar online',
  'netplay.close': 'Fechar',
  'netplay.create': 'Criar uma sala',
  'netplay.or': 'ou',
  'netplay.join': 'Entrar',
  /* 保持 ASCII 无重音：输入框走 font-pixel，该字模的重音字形不可靠 */
  'netplay.codePlaceholder': 'CODIGO',
  'netplay.hint':
    'Os dois lados só precisam alcançar o relay público — na mesma rede local funciona melhor. Fale o código de 4 caracteres para o outro jogador. O anfitrião roda o emulador e transmite a imagem; o convidado não precisa da ROM.',
  'netplay.roomCode': 'Código da sala',
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Internet',
  'netplay.wanDev': 'O jogo online pela internet está em desenvolvimento.',
  'netplay.quality': 'Qualidade da transmissão',
  'netplay.qualitySmooth': 'Fluida',
  'netplay.qualityBalanced': 'Equilibrada',
  'netplay.qualitySharp': 'Nítida',
  'netplay.qualityHint':
    'O anfitrião roda o emulador e a transmissão na mesma máquina. Se ela não der conta, o jogo inteiro desacelera (câmera lenta). Nesse caso, baixe um nível — isso vale só para o anfitrião.',
  'netplay.copy': 'Copiar',
  'netplay.copied': 'Copiado',
  'netplay.share': 'Compartilhar',
  'netplay.shareCopied': 'Link copiado',
  'netplay.inviteTitle': 'Convite para a sala',
  'netplay.inviteBody': 'Entrar na sala {code}?',
  'netplay.inviteJoin': 'Entrar',
  'netplay.inviteCancel': 'Cancelar',
  'netplay.connected': 'Conectado',
  'netplay.waiting': 'Aguardando o outro jogador',
  'netplay.joining': 'Entrando na sala…',
  'netplay.waitingGame': 'Conectado — aguardando o anfitrião carregar um cartucho',
  'netplay.hostPlaying': 'O anfitrião está jogando',
  'netplay.paused': 'Pausado',
  'netplay.toastHost': 'Conectado · o outro jogador entrou · você é o jogador 1',
  'netplay.toastGuest': 'Conectado ao anfitrião · você é o jogador 2',
  'netplay.toastHostLeft': 'O anfitrião saiu — a sala foi fechada',
  'netplay.toastGuestLeft': 'O jogador 2 saiu da sala',
  'netplay.youAreHost':
    'Você é o jogador 1. Carregue um cartucho e a imagem é enviada ao convidado automaticamente. Você joga com o seu próprio conjunto de teclas — veja os Controles para o mapeamento atual.',
  'netplay.youAreGuest':
    'Você é o jogador 2. Não precisa de cartucho — o anfitrião transmite a imagem e a sua entrada é enviada a ele. Jogue com o seu próprio conjunto de teclas (o grupo do jogador 1) ou com um controle — veja os Controles.',
  'netplay.leave': 'Sair da sala',
  'netplay.closeRoom': 'Fechar sala',
  'netplay.badCode': 'Esse código não parece certo — deve ter 4 caracteres.',
  'netplay.errInsecure':
    'O jogo online exige HTTPS ou localhost. Esta página está em http simples, então o navegador bloqueia a API de criptografia de que ele depende.',
  'netplay.errNoDirect':
    'Os dois lados chegaram ao relay, mas não foi possível abrir uma conexão direta — geralmente é NAT ou firewall. Na mesma rede local funciona melhor.',
  'netplay.errPassword': 'O código da sala não confere.',
  'netplay.errHandshake': 'O handshake expirou — o outro jogador pode ter saído.',
  'netplay.errHostLeft': 'O anfitrião saiu da sala — ela foi fechada.',
  'netplay.errNoRoom':
    'Sem resposta do anfitrião. O código da sala pode estar errado ou o anfitrião ainda não abriu a sala.',
  'netplay.errRoomFull': 'Essa sala já está cheia — este jogo é só um contra um.',
  'netplay.errUnknown':
    'Não foi possível conectar ao outro jogador. O console do navegador mostra o motivo exato.',

  'seo.play.title': 'Sala de jogo — Carregue um jogo e jogue online',
  'seo.play.description':
    'Uma tela para começar: jogue sozinho ou abra uma sala 1v1 e compartilhe o código. Títulos de NES, SNES / SFC, Game Boy, GBA, Mega Drive e arcade.',
  'play.modeSolo': 'Sozinho',
  'play.start': 'Começar',
  'play.confirmStart': 'Confirmar e começar',
  'play.confirm': 'Confirmar',
  'play.qualityIntro':
    'Escolha a qualidade da imagem do jogo online conforme a sua conexão.',
  'play.qualityHint.smooth':
    '30 fps · Usa menos banda, indicada para conexões mais lentas.',
  'play.qualityHint.balanced':
    'Até 720p / 60 fps · Equilibra nitidez e movimento fluido.',
  'play.qualityHint.sharp':
    'Até 60 fps · Prioriza o detalhe na resolução original; exige conexão rápida. A taxa de quadros pode cair em redes lentas.',
  'play.qualityConfirmHint':
    'Confirme para entrar na sala. O anfitrião carrega o jogo; o convidado recebe a imagem dele.',
  'play.connecting': 'Conectando…',
  'play.confirmJoin': 'Confirmar e entrar',
  'play.cancel': 'Cancelar',
  'play.screenSize': 'Tamanho da tela',
  'play.controlsTitle': 'Controles do jogo',
  'play.netplayKeysHint':
    'No jogo online, cada jogador usa as próprias teclas do jogador 1.',
  'play.cancelled': 'Carregamento cancelado.',
  'play.retry': 'Carregar de novo',
  'play.retryJoin': 'Tentar entrar de novo',
  'play.saved': 'Jogo salvo.',
  'play.localSaving': 'Salvando…',
  'play.uploading': 'Enviando…',
  'play.cloudFailed': 'Falha na sincronização com a nuvem.',
  'play.saveNoLogin': 'Entre para sincronizar',
  'play.tooLarge': 'Save muito grande',
  'play.theme': 'Tema',
  'play.saveFailed': 'Não foi possível salvar o jogo. Tente de novo.',
  'play.loadFailed': 'Não foi possível carregar o save. Tente de novo.',
  'play.leftRoom': 'Você saiu da sala.',
  'play.latency': 'Latência',
  'play.measuringLatency': 'Medindo…',
  'play.downloading': 'Baixando a ROM…',
  'play.booting': 'Iniciando o core…',
  'play.loadFail': 'Este cartucho não carregou.',
  'play.romIncomplete': 'O arquivo ROM está incompleto — carregue de novo.',
  'play.notFound': 'Esse jogo não foi encontrado.',
  'play.fullscreen': 'Tela cheia',
  'play.volume': 'Volume',
  'play.edit': 'Editar',
  /* 收起后只有 40px 宽、竖排，必须短 */
  'play.hideSidebar': 'Ocultar painel',
  'play.showSidebar': 'Mostrar painel',
  'play.hint': 'Esc sai da tela cheia. Nada mais aqui usa o teclado.',
  'play.leaveTitle': 'Jogo em andamento',
  'play.leaveBody':
    'Voltar encerra esta sessão — o progresso não é salvo automaticamente.',
  'play.leaveStay': 'Continuar jogando',
  'play.leaveGo': 'Sair',
  'gamesPage.playOnline': 'Jogar online',

  'keybind.title': 'Configuração de teclas',
  'keybind.open': 'Ajustar teclas',
  'keybind.close': 'Fechar',
  'keybind.p1': 'Jogador 1',
  'keybind.p2': 'Jogador 2',
  'keybind.mine': 'Suas teclas',
  'keybind.pressKey': 'APERTE…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'FICHA',
  'keybind.reset': 'Restaurar padrões',
  'keybind.reload': 'Recarregar cartucho',
  'keybind.reloading': 'Recarregando…',
  'keybind.unsupported': 'Essa tecla não pode ser usada — tente outra.',
  'keybind.conflictSame':
    '{pressed} já está no botão {button} — tente outra tecla.',
  'keybind.conflictOther':
    '{pressed} já está no botão {button} do jogador {player} — tente outra tecla.',
  'keybind.hint':
    'O mapa do teclado é lido uma vez, quando um cartucho carrega — recarregue para aplicar as mudanças. Os dois jogadores não podem usar a mesma tecla.',
  'keybind.soloHint':
    'O mapa do teclado é lido uma vez, quando um cartucho carrega — recarregue para aplicar as mudanças.',
  'keybind.hostHint':
    'Você é o anfitrião: o jogador 1 são as suas teclas, o jogador 2 é onde a entrada do convidado é injetada. Eles não podem usar a mesma tecla, senão a entrada injetada também moveria o seu jogador 1. Recarregue o cartucho depois de mudar.',
  'keybind.guestHint':
    'Você é o convidado e joga com o seu próprio conjunto de teclas (o grupo do jogador 1) — cada lado fica no seu teclado, então nada se choca. As mudanças valem na hora — não precisa recarregar o cartucho.',
  'keybind.guestLocalHint':
    'Você é o convidado e um cartucho seu também está rodando aqui. Suas teclas são o grupo do jogador 1: elas controlam esse cartucho local, então recarregue depois de mudar — e também são o que vai para o anfitrião, o que vale na hora.',

  'games.open': 'Biblioteca de jogos',
  'games.title': 'Biblioteca de jogos',
  'games.close': 'Fechar',
  'games.empty': 'A biblioteca está vazia — nada foi enviado ainda',
  'games.loading': 'Carregando…',
  'games.loadingRom': 'Carregando {name}…',
  'games.cancel': 'Cancelar',
  'games.failed': 'Não foi possível carregar a biblioteca de jogos',
  'games.tabLibrary': 'Biblioteca',
  'games.tabHistory': 'Histórico',
  'games.historyEmpty': 'Nada aberto da biblioteca ainda',
  'games.historyLoad': '{name}\nClique para carregar de novo',
  'games.tabFavorites': 'Favoritos',
  'games.favorite': 'Adicionar {name} aos favoritos',
  'games.unfavorite': 'Remover {name} dos favoritos',
  'games.favoritesEmpty': 'Nenhum favorito ainda — toque na estrela de qualquer capa.',
  'games.favoritesSignInBefore': 'Entre para guardar favoritos — ',
  'games.favoritesSignInLink': 'Entrar',
  'games.favoritesSignInAfter':
    ' aqui mesmo, ou use o botão de conta no canto superior direito.',

  'user.title': 'Conta',
  'user.close': 'Fechar',
  'user.open': 'Conta — entrar ou criar conta',
  'user.openSignedIn': 'Conta: {name}',
  'user.tabLogin': 'Entrar',
  'user.tabRegister': 'Criar conta',
  'user.username': 'Nome de usuário',
  'user.password': 'Senha',
  'user.usernameHint': '3–20 caracteres: letras, números, _ - .',
  'user.emailLabel': 'E-mail',
  'user.emailHint': 'Seu e-mail. Sem aliases com +, sem e-mail temporário.',
  'user.passwordHint': 'Pelo menos 6 caracteres, sem espaços.',
  'user.signIn': 'Entrar',
  'user.signUp': 'Criar conta',
  'user.signingIn': 'Entrando…',
  'user.signingUp': 'Criando…',
  'user.signOut': 'Sair',
  'user.signedInAs': 'Conectado como {name}.',
  'user.cloudHint':
    'Seu histórico, saves e favoritos ficam na sua conta — abra qualquer jogo da biblioteca online e eles sincronizam automaticamente.',
  'user.formLead':
    'Entre e seus saves, histórico de jogos e favoritos ficam na nuvem — jogue quando e onde quiser!',
  /* 首尾空格有意义（链接两侧要留空），别 trim */
  'user.consentLogin': 'Ao entrar, você concorda com a nossa ',
  'user.consentRegister': 'Ao criar uma conta, você concorda com a nossa ',
  'user.consentMiddle': ' e a ',
  'user.consentAfter': '.',

  'user.error.failed': 'Algo deu errado — tente de novo.',
  'user.error.missingCredentials': 'Digite um nome de usuário e uma senha.',
  'user.error.usernameInvalid':
    'O nome de usuário só pode ter letras, números, _ - e .',
  'user.error.usernameTooShort':
    'O nome de usuário é curto demais (mínimo de 3 caracteres).',
  'user.error.usernameTooLong':
    'O nome de usuário é longo demais (máximo de 20 caracteres).',
  'user.error.usernameTaken':
    'Esse nome de usuário já está em uso — escolha outro.',
  'user.error.emailInvalid': 'Digite um e-mail válido.',
  'user.error.emailAlias':
    'E-mails com alias (como nome+tag@… ou Gmail com pontos) não são aceitos.',
  'user.error.emailTemp':
    'E-mails descartáveis não são aceitos — use sua caixa de entrada normal.',
  'user.error.passwordInvalid': 'Digite uma senha.',
  'user.error.passwordTooShort': 'A senha é curta demais (mínimo de 6 caracteres).',
  'user.error.passwordTooLong': 'A senha é longa demais (máximo de 72 caracteres).',
  'user.error.passwordHasSpace': 'A senha não pode conter espaços.',
  'user.error.invalidCredentials': 'Nome de usuário ou senha incorretos.',
  'user.error.banned': 'Esta conta foi suspensa.',
  'user.error.captchaRequired': 'Conclua a verificação humana primeiro.',
  'user.error.captchaFailed': 'A verificação humana falhou — tente de novo.',

  'login.lead':
    'Entre e seus saves, histórico de jogos e favoritos ficam na nuvem — jogue quando e onde quiser. Ainda não tem conta? Crie uma.',

  'account.title': 'Sua conta',
  'account.loading': 'Carregando…',
  'account.failed': 'Algo deu errado — tente de novo.',
  'account.since': 'Membro desde {time}',
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Padrão',
  'account.vipUntil': 'VIP até {time}',
  'account.vipExpired': 'VIP expirou em {time}',
  'account.tabFavorites': 'Favoritos',
  'account.tabHistory': 'Histórico',
  'account.tabSaves': 'Saves',
  'account.tabProfile': 'Perfil',
  'account.tabPassword': 'Senha',
  'account.favoritesLoading': 'Carregando favoritos…',
  'account.historyLoading': 'Carregando histórico…',
  'account.savesLoading': 'Carregando saves…',

  'account.favoritesEmpty':
    'Nenhum favorito ainda — abra a biblioteca de jogos na sala e toque na estrela de uma capa.',
  'account.unfavorite': 'Remover {name} dos favoritos',

  /* ---- 历史 ---- */
  'account.historyEmpty':
    'Nenhum histórico ainda — os jogos que você abre na biblioteca online aparecem aqui.',
  'account.historyCount': '{count} jogos jogados recentemente',
  'account.historyDeleted': 'Removido do histórico.',
  'account.clearHistory': 'Limpar tudo',
  'account.confirmClearHistory': 'Limpar tudo mesmo?',
  'account.historyCleared': 'Histórico limpo.',
  'account.historyHint':
    'O histórico guarda os {max} jogos jogados mais recentemente — jogar um antigo de novo o traz de volta ao topo.',

  'account.savesEmpty': 'Nenhum save na nuvem ainda.',
  'account.savesCount': '{count} saves no total',
  'account.savesGroupCount': '{count} save',
  'account.viewGame': 'Ver {name}',
  'account.savesHint':
    'Um save por jogo — salvar de novo sobrescreve. Vale tanto no dispositivo quanto na nuvem.',
  'account.saveDeleted': 'Save excluído.',
  'account.clearSaves': 'Limpar tudo',
  'account.confirmClearSaves': 'Limpar tudo mesmo?',
  'account.savesCleared': '{count} save(s) excluído(s).',
  'account.delete': 'Excluir',
  'account.confirmDelete': 'Excluir mesmo?',

  /* ---- 资料 ---- */
  'account.avatar': 'Avatar',
  'account.chooseImage': 'Escolher imagem',
  'account.clearAvatar': 'Remover avatar',
  'account.uploading': 'Enviando…',
  'account.avatarSaved': 'Avatar atualizado.',
  'account.avatarCleared': 'Avatar removido.',
  'account.avatarHint': 'PNG, JPEG, WebP ou GIF, até 2 MB.',
  'account.gender': 'Gênero',
  'account.genderNone': 'Não informado',
  'account.genderMale': 'Masculino',
  'account.genderFemale': 'Feminino',
  'account.genderSaved': 'Salvo.',
  'account.genderHint': 'Opcional — não é mostrado a ninguém além de você.',
  'account.passwordTabHint':
    'Você continua conectado neste dispositivo depois — não precisa entrar de novo.',
  'account.password': 'Senha',
  'account.oldPassword': 'Senha atual',
  'account.newPassword': 'Nova senha',
  'account.confirmPassword': 'Repita a nova senha',
  'account.savePassword': 'Alterar senha',
  'account.saving': 'Salvando…',
  'account.passwordSaved': 'Senha alterada.',
  'account.passwordHint':
    'Você continua conectado neste dispositivo depois de alterar. Os outros dispositivos conectados seguem funcionando até a sessão expirar.',

  'account.error.missingOld': 'Digite a sua senha atual.',
  'account.error.wrongPassword': 'A senha atual está incorreta.',
  'account.error.passwordTooShort':
    'A nova senha é curta demais (mínimo de 6 caracteres).',
  'account.error.passwordTooLong':
    'A nova senha é longa demais (máximo de 72 caracteres).',
  'account.error.passwordHasSpace': 'A nova senha não pode conter espaços.',
  'account.error.mismatch': 'As duas novas senhas não coincidem.',
  'account.error.avatarMissing': 'Escolha uma imagem primeiro.',
  'account.error.avatarTooLarge': 'Essa imagem é grande demais (máximo de 2 MB).',
  'account.error.avatarType':
    'Formato não suportado — use PNG, JPEG, WebP ou GIF.',

  'games.filterAll': 'Todos',
  'games.searchPlaceholder': 'Buscar título / desenvolvedor / série',
  'games.search': 'Buscar',
  'games.noMatch': 'Nenhum jogo encontrado.',
  'games.prev': 'Anterior',
  'games.next': 'Próximo',
  /* 和 en / ja 一样留空串：这句话是说给「文件在境外」的读者听的，葡语界面用不上 */
  'games.remoteSlow': '',

  'note.text': 'Que todos nós encontremos de novo a alegria que tivemos quando crianças..',
  'note.open': 'Ler o bilhete no chão',
  'note.title': 'Um bilhete',
  'note.close': 'Fechar',
  'window.cycle': 'Mudar a estação lá fora',
  'painting.open': 'Ver o quadro de perto',
  'painting.close': 'Fechar',
  'painting.title.sunflowers': 'Girassóis',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'Mona Lisa',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'A Noite Estrelada',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'O Grito',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'Moça com Brinco de Pérola',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'A Grande Onda de Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'Um quadro sem nome de não se sabe onde',
  'painting.artist.unknown': 'Anônimo',
  'mp4.play': 'Tocar uma música no player MP4',
  'mp4.pause': 'Pausar o player MP4',

  'cat.wand': 'Sacudir o brinquedo de gato no chão',
  'cat.ragdoll': 'Um ragdoll espia por trás dos livros',
  'cat.siamese': 'Um siamês espia por trás dos livros',
  'cat.tabby': 'Um gato malhado espia por trás dos livros',
  'cat.orange': 'Um gato malhado laranja espia por trás dos livros',
  'cat.american': 'Um pelo curto americano espia por trás dos livros',
  'cat.tuxedo': 'Um gato tuxedo espia por trás dos livros',
  'cat.calico': 'Uma gata tricolor espia por trás dos livros',

  'feedback.open': 'Ler o livro de visitas no chão',
  'feedback.title': 'Livro de visitas',
  'feedback.close': 'Fechar',
  'feedback.placeholder':
    'Diga algo — uma sugestão ou um jogo que você gostaria de ver aqui…',
  'feedback.submit': 'Publicar',
  'feedback.submitting': 'Publicando…',
  'feedback.ok': 'Publicado — obrigado!',
  'feedback.required': 'Escreva algo primeiro.',
  'feedback.failed': 'Não foi possível publicar — tente de novo.',
  'feedback.loading': 'Carregando…',
  'feedback.empty': 'Nenhuma mensagem ainda — seja o primeiro a escrever.',
  'feedback.retry': 'Tentar de novo',
  'feedback.prev': 'Anterior',
  'feedback.next': 'Próxima',
  'feedback.page': 'Página {n}',
  'feedback.resolved': 'Resolvido',
  'feedback.unresolved': 'Aberto',

  'legal.privacy': 'Política de Privacidade',
  'legal.terms': 'Termos de Serviço',
  'legal.updated': 'Última atualização {date}',
  'legal.contact': 'Fale com a gente:',

  'tour.title': 'Tour rápido',
  'tour.skip': 'Pular',
  'tour.back': 'Voltar',
  'tour.next': 'Próximo',
  'tour.done': 'Começar a jogar',
  'tour.replay': 'Ver o tour de novo',
  'tour.screen.title': 'Comece com um jogo',
  'tour.screen.body':
    'Arraste um arquivo ROM (.nes, .sfc, .gba, .md, .gb …) ou um .zip de arcade para a TV, ou clique na tela para escolher um arquivo. Nenhuma ROM vem com este site — traga a sua.',
  'tour.rail.title': 'A coluna de interruptores',
  'tour.rail.body':
    'Três grupos, de cima para baixo. Aparência: tema (noite / dia), idioma (中文 / English / 日本語 / 한국어), tela cheia (é a própria tela que fica em tela cheia), modo simples (deixe só a parede, a TV, a mesa e o chão), tamanho da TV (abre um seletor grande / média / pequena — a mesa acompanha). Jogos: jogo online, configuração de teclas. Ajuda: controles e livro de visitas.',

  'topLinks.label': 'Páginas do site',
  'topLinks.games': 'Lista de jogos',
  'menu.open': 'Abrir menu',
  'menu.close': 'Fechar menu',
  'menu.theme': 'Tema',
  'menu.simple': 'Modo simples',

  'leave.title': 'Sair desta página?',
  'leave.bodyGame': 'O jogo em andamento será interrompido — o progresso não é salvo.',
  'leave.bodyNetplay':
    'Você vai sair da sala de jogo online e seu parceiro será desconectado.',
  'leave.stay': 'Ficar',
  'leave.confirm': 'Sair',

  'gamesPage.heading': 'Todos os jogos',
  'gamesPage.intro':
    '{count} jogos na biblioteca online — NES, SNES / SFC, Game Boy, GBA, Mega Drive, arcade e mais. Clique numa capa para ver os detalhes, ou comece a jogar agora.',
  'gamesPage.empty': 'A biblioteca está vazia agora.',
  'gamesPage.introConsole':
    '{count} jogos de {console} na biblioteca. Clique numa capa para ver os detalhes, ou comece a jogar agora.',
  'gamesPage.filterLabel': 'Filtrar por console',
  'gamesPage.filterAll': 'Todos',
  'gamesPage.consoleEmpty': 'Ainda não há jogos de {console} na biblioteca.',
  'gamesPage.searchLabel': 'Buscar na biblioteca de jogos',
  'gamesPage.searchPlaceholder': 'Buscar título / desenvolvedor / série',
  'gamesPage.searchSubmit': 'Buscar',
  'gamesPage.searchLoading': 'Buscando…',
  'gamesPage.searchClear': 'Limpar busca',
  'gamesPage.searchResults': '“{keyword}” — {count} jogos encontrados.',
  'gamesPage.searchEmpty':
    'Nenhum jogo corresponde a “{keyword}”. Tente uma palavra mais curta ou o título do jogo.',
  'gamesPage.prev': 'Anterior',
  'gamesPage.next': 'Próximo',
  'gamesPage.backHome': 'Voltar ao início',
  'gamesPage.backToGames': 'Todos os jogos',
  'common.back': 'Voltar',
  'common.home': 'Início',
  'gamesPage.play': 'Jogar agora',
  'gamesPage.download': 'Baixar ROM',
  'gamesPage.share': 'Compartilhar este jogo',
  'gamesPage.shareCopied': 'Link copiado',
  'gamesPage.shareFailed': 'Falha ao copiar',
  'gamesPage.favorite': 'Adicionar aos favoritos',
  'gamesPage.unfavorite': 'Remover dos favoritos',
  'gamesPage.favoriteSignIn':
    'Entre para guardar favoritos — use o botão de entrar na barra superior.',
  'gamesPage.favoriteFailed':
    'Não foi possível atualizar os favoritos — tente de novo.',
  'gamesPage.favoriteCount': '{n} na lista de favoritos',
  'gamesPage.report': 'Relatar um problema',
  'gamesPage.reportTitle': 'Relatar um problema',
  'gamesPage.reportSubject': 'Sobre: {name}',
  'gamesPage.reportPlaceholder':
    'O que deu errado? Por exemplo: não inicia, a imagem fica corrompida, o som está mudo…',
  'gamesPage.reportSubmit': 'Enviar relato',
  'gamesPage.reportSubmitting': 'Enviando…',
  'gamesPage.reportOk': 'Obrigado — vamos verificar.',
  'gamesPage.reportRequired': 'Descreva o problema primeiro.',
  'gamesPage.reportFailed': 'Não foi possível enviar — tente de novo.',
  'gamesPage.reportClose': 'Cancelar',

  'comments.heading': 'Comentários',
  'comments.count': '{n} comentários',
  'comments.empty': 'Nenhum comentário ainda — seja o primeiro.',
  'comments.placeholder': 'O que você achou deste jogo?',
  'comments.ratingLabel': 'Sua nota',
  'comments.ratingStar': 'Dar {n} de 5',
  'comments.ratingValue': '{n} de 5 estrelas',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Escolha uma nota em estrelas primeiro.',
  'comments.submit': 'Publicar comentário',
  'comments.submitting': 'Publicando…',
  'comments.ok': 'Publicado — está no topo da lista.',
  'comments.required': 'Escreva algo primeiro.',
  'comments.failed': 'Não foi possível publicar — tente de novo.',
  'comments.signInLead': 'Entre para publicar um comentário.',
  'comments.signIn': 'Entrar',
  'comments.signInRequired': 'Entre de novo para publicar.',
  'comments.loading': 'Carregando comentários…',
  'comments.retry': 'Tentar de novo',
  'comments.loadFailed': 'Não foi possível carregar os comentários.',
  'comments.loadMore': 'Carregar mais',
  'comments.delete': 'Excluir',
  'comments.deleteConfirm': 'Confirmar',
  'comments.cancel': 'Cancelar',
  'comments.deleted': 'Comentário removido.',
  'comments.deleteFailed': 'Não foi possível excluir — tente de novo.',

  'gamesPage.field.console': 'Console',
  'gamesPage.field.year': 'Ano',
  'gamesPage.field.developer': 'Desenvolvedor',
  'gamesPage.field.series': 'Série',
  'gamesPage.field.language': 'Idioma',
  'gamesPage.controls': 'Controles',
  'gamesPage.selectLanguage': 'Escolher idioma',

  'notFound.title': 'Página não encontrada',
  'notFound.description':
    'Esse endereço não existe em {site}. Confira o link ou volte para a página inicial.',
  'gamesPage.notFoundTitle': 'Jogo não encontrado',
  'gamesPage.notFound': 'Este jogo não está (mais) na biblioteca.',
  'gamesPage.fallbackDescription': '{title} é um jogo de {console}.',

  'developersPage.heading': 'Desenvolvedores',
  'developersPage.intro':
    '{count} desenvolvedores por trás dos jogos da biblioteca. Abra um para ver tudo o que temos daquele estúdio.',
  'developersPage.empty': 'Nenhum desenvolvedor cadastrado ainda.',
  'developersPage.gameCount': '{count} jogos',
  'developersPage.gamesHeading': 'Jogos de {name}',
  'developersPage.gamesEmpty':
    'Ainda não há nenhum jogo deste desenvolvedor na biblioteca.',
  'developersPage.field.founded': 'Fundação',
  'developersPage.backToDevelopers': 'Todos os desenvolvedores',
  'developersPage.notFoundTitle': 'Desenvolvedor não encontrado',
  'developersPage.notFound': 'Este desenvolvedor não está (mais) na biblioteca.',

  'consolesPage.heading': 'Consoles',
  'consolesPage.intro':
    'Os consoles da biblioteca — {count} jogos no total. Abra um para ver todos os títulos que ele roda.',
  'consolesPage.gameCount': '{count} jogos',
  'consolesPage.gamesHeading': 'Jogos de {name}',
  'consolesPage.gamesEmpty': 'Ainda não há nenhum jogo deste console na biblioteca.',
  /* 筛了语种却一款都没有（`{lang}` 来自 lib/rom-lang.ts 的语言全称） */
  'consolesPage.gamesEmptyLang': 'Ainda não há jogos em {lang} para este console.',
  'consolesPage.filterLangLabel': 'Filtrar por idioma',
  'consolesPage.field.released': 'Lançamento',
  'consolesPage.backToConsoles': 'Todos os consoles',
  'consolesPage.notFoundTitle': 'Console não encontrado',
  'consolesPage.notFound': 'Este console não faz (mais) parte do site.',

  'download.heading': 'Baixar a ROM',
  'download.hint': 'Clique no botão abaixo — o download começa em 6 segundos.',
  'download.button': 'Iniciar download',
  'download.waiting': 'Começando em {seconds}s…',
  'download.started': 'Download iniciado — confira os downloads do navegador.',
  'download.rights': 'Baixe apenas arquivos ROM que você tem direito legal de usar.',
  'download.disclaimer':
    'Aviso: todos os arquivos ROM desta página são coletados de terceiros e destinam-se apenas a estudo pessoal e backup. Todos os direitos autorais pertencem aos seus editores originais; se algum conteúdo violar os seus direitos, entre em contato para remoção.',

  'deepLink.notFound': 'Esse jogo não foi encontrado — ele pode ter sido removido.',
  'deepLink.title': 'Carregando jogo',
  'deepLink.loading': 'Baixando a ROM…',
  'deepLink.hint': 'Começa automaticamente quando o download terminar.',
};

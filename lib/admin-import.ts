/*
 * 后台「把一款游戏导进库」的公共管道 —— 「从列表导入」（AdminBulkImport）与
 * 「自动爬取」（AdminAutoCrawl）共用这一份。
 *
 * 一条的完整链路**和手动添加完全相同**（这里不重写解析，也不碰 R2 / D1）：
 *   POST /api/admin/scrape-game            → 元数据 + 封面 / ROM 的地址 + 每个语言版本
 *   POST /api/admin/fetch-image / fetch-rom → 经服务端代理取字节（跨域 + CORS）
 *   POST /api/admin/games                  → 上传入库（判重在那里兜底）
 *
 * ⚠️ **两个入口必须共用这一份**：表单字段名（`texts` / `title` / `title_en` /
 *    `console_type` / `language` / `series` / `developer_id` / `description` /
 *    `image` / `rom`）漏一个就是静默丢数据 —— 抄出第二份迟早会漂。
 *
 * ⚠️ 文案走 **`texts`**（一个 JSON 字符串，**四个语言**，2026-10-16 加）：上游 `/ja/…`
 *    `/ko/…` 是真日韩文，爬取时四个语言各抓一份、原样带下去（见 scrape-game 的 `texts`）。
 *    后面那几栏扁平字段是中英投影，留着当退路（服务端收不到 `texts` 时用）。
 *
 * ⚠️ 一款游戏可能回**好几条**（2026-10-15 起「多语言各导一条」）：上游 `fileName`
 *    是「一份语言一个地址」，最多四份（中 / 英 / 日 / 韩）。
 *    · 只认站内支持的四种（`GAME_LANGUAGE_VALUES`，见 lib/rom-lang.ts）；
 *    · 一个都不认时**退回「挑出来的那一份」**，照旧导一条 —— 不因为语言不在白名单整款丢；
 *    · **封面一款只取一次**（几个版本只有 ROM 不同）；
 *    · 单个语言版本失败**不带走**这款的其它语言。
 */

import type { ConsoleType } from '@/lib/emulator';
import { GAME_LANGUAGE_LABEL, GAME_LANGUAGE_VALUES, romLangToFormValue } from '@/lib/rom-lang';

/** `/api/admin/scrape-list` 回的一条。 */
export interface ListGame {
  slug: string;
  title: string | null;
}

/** `/api/admin/scrape-list` 的响应。 */
export interface ListResult {
  path: string;
  page: number;
  consoleType: ConsoleType | null;
  total: number;
  games: ListGame[];
}

/**
 * `/api/admin/scrape-game` 回的**一份语言文案**（2026-10-16 加）。
 *
 * ⚠️ 只有三个字段 —— **`developer` 不在里面**：厂名由数据层按 `developerId` 反查后写
 * （见 lib/server/games.ts 的 withDeveloper）。上游的厂名是**按页面语言翻译的**
 * （实测韩文页给「HAL 연구소」，与库里存的名字对不上），照搬会让快照失真、
 * 也会让「名字 → developers.id」那张映射表失配。
 */
export interface ScrapedText {
  title: string | null;
  series: string | null;
  description: string | null;
}

/**
 * 四语言文案，按**上游语言前缀**索引（zh / en / ja / ko）。
 * 某个语言那页没抓到，就是那份全 `null`（写入时不建空行）。
 */
export type ScrapedTexts = Record<string, ScrapedText>;

/** 一条的结局：成功 / 跳过（库里已有同名同语言）/ 失败。 */
export type ImportStatus = 'ok' | 'duplicate' | 'failed';

export interface ImportOutcome {
  /** 那一行的名字 —— 多语言时带语言后缀（`Kirby · 日本語`），所以**一款可能好几条** */
  title: string;
  /** 这一条是哪种语言（站内短码）；认不出 / 兜底那一份就是 null */
  language: string | null;
  status: ImportStatus;
  /** 跳过或失败时的说明，直接来自服务端的 detail */
  reason?: string;
}

/**
 * `/api/admin/scrape-game` 回的**一份语言版本**。
 *
 * 上游 `fileName` 是「一份语言一个地址」，同一款游戏最多能给四份 —— 中 / 英 / 日 / 韩。
 * 一款有几种语言就导几条记录（`games.language` 不同，判重是「同名 + 同机种 + 同语言」，
 * 所以它们互不冲突，见 lib/server/games.ts 的 findGameDuplicate）。
 */
export interface RomVariant {
  /** 上游那个 key（en / zh / cn / ja / ko…） */
  lang: string;
  /** 站内短码（zh / en / ja / ko）；上游给了我们不认的语言就是 null */
  language: string | null;
  url: string;
  /** 原始文件名 —— FBNeo 认它当驱动名，改不得 */
  name: string;
  /** 库里已有同名同机种同语言的一条 —— 据此**跳过下载**（那一步最慢） */
  duplicate: boolean;
}

/**
 * 进度事件 —— 「自动爬取」那个控制台照着它打日志，「从列表导入」不订阅。
 * 每一条语言版本**开始**与**结束**各回调一次（跳过的那份只有 `done`）。
 */
export interface ImportEvent {
  phase: 'start' | 'done';
  title: string;
  language: string | null;
  /** 只有 `phase === 'done'` 才有 */
  status?: ImportStatus;
  reason?: string;
}

export interface ImportOptions {
  /** 详情页认不出机种时退到列表页那一档（`/zh/snes-games` → snes） */
  fallbackConsole: ConsoleType | null;
  /** 开发商「名字 → id」映射，整批只拉一次（见 fetchDeveloperOptions） */
  developerIds: Map<string, string>;
  /**
   * 要不要把 ROM 存进本站 R2（2026-10-16）。
   *
   * `false` 时**不下载 ROM**，只把上游地址入库（服务端收敛成 `site:/…` / `files:/…`），
   * 前台按它回源取 —— 省 R2 存储，也省掉整条链路里最慢的那一段。
   * ⚠️ **不传 = `true`**（保持「从列表导入」那条路的老行为，别改它的默认）。
   */
  saveRom?: boolean;
  /** 每一条语言版本的开始 / 结束都会回调一次 */
  onEvent?: (event: ImportEvent) => void;
  /** 「停止」标志：每次真要下载前看一眼，返回 true 就不再往下做 */
  shouldStop?: () => boolean;
}

/**
 * 从失败响应里挖出**机器码**与说明。
 *
 * 和 AdminGames 那个 readError 不同：那边只关心给人看的 detail，这里还要靠 `error`
 * 分辨「同名同语言，已经导过了」（跳过，不算失败）与「真失败」（要报出来）。
 */
export async function readFailure(
  res: Response,
  fallback: string
): Promise<{ code: string; detail: string }> {
  try {
    const data = (await res.json()) as { error?: string; detail?: string };
    return { code: data.error ?? 'unknown', detail: data.detail ?? fallback };
  } catch {
    return { code: 'unknown', detail: fallback };
  }
}

/**
 * 经服务端代理把一个外链资源取回来（跨域 + CORS，见 /api/admin/fetch-image 与 fetch-rom）。
 * `fallbackName` 是拿不到响应头 `x-file-name` 时的兜底文件名。
 */
export async function fetchAsset(
  endpoint: string,
  url: string,
  fallbackName: string
): Promise<File> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error((await readFailure(res, endpoint)).detail);

  const blob = await res.blob();
  // ROM 的原始文件名在响应头里 —— FBNeo 认 zip 文件名当驱动名，改不得
  const header = res.headers.get('x-file-name');
  const fromUrl = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  const name = (header ? decodeURIComponent(header) : '') || fallbackName || fromUrl || 'file';
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

/**
 * 读一个列表页：只问「这一页有哪几个 slug」，每个游戏的详情稍后逐个抓。
 *
 * `page` 给了就**盖掉地址里那个 `page=`**（自动爬取翻页靠它，见那个路由的注释）。
 * 失败抛 Error（detail 已挖出来，可直接显示）。
 */
export async function fetchList(
  url: string,
  page: number | undefined
): Promise<ListResult> {
  const res = await fetch('/api/admin/scrape-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(page === undefined ? { url } : { url, page }),
  });
  if (!res.ok) throw new Error((await readFailure(res, '读取该列表页失败。')).detail);
  return (await res.json()) as ListResult;
}

/** 开发商「名字 → id」映射：整批只拉一次。拉失败就当没有（那几栏留空），不拦住整批导入。 */
export async function fetchDeveloperOptions(): Promise<Map<string, string>> {
  try {
    const res = await fetch('/api/admin/developers/options');
    const data = res.ok ? ((await res.json()) as { developers?: { id: string; name: string }[] }) : {};
    return new Map((data.developers ?? []).map((item) => [item.name, item.id]));
  } catch {
    return new Map();
  }
}

/** 日志 / 失败清单上那一行的名字：`Kirby · 日本語`（语言认不出就只写标题）。 */
export function variantTitle(title: string, language: string | null): string {
  if (!language) return title;
  return `${title} · ${GAME_LANGUAGE_LABEL[language] ?? language}`;
}

/**
 * 导入**一款**游戏：抓详情 → 逐语言取 ROM → 上传（封面一款只取一次）。
 *
 * **返回结局数组而不是抛错** —— 一款有几种语言就是几条，调用方要接着跑下一款，
 * 不能一条失败就整批中断；抓详情这一步整个失败时回一条 `failed`（标题用列表页那个）。
 */
export async function importGame(
  game: ListGame,
  options: ImportOptions
): Promise<ImportOutcome[]> {
  const { fallbackConsole, developerIds, saveRom = true, onEvent, shouldStop } = options;
  const label = game.title ?? game.slug;

  try {
    const metaRes = await fetch('/api/admin/scrape-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: game.slug }),
    });
    if (!metaRes.ok) {
      throw new Error((await readFailure(metaRes, '读取该页面失败。')).detail);
    }

    const meta = (await metaRes.json()) as {
      /**
       * **四个语言的文案**（2026-10-16 加）—— 下面原样转给 POST /api/admin/games
       * 的 `texts` 字段，那边写进 `game_texts`。这就是「爬取补齐日韩」落地的那一步。
       */
      texts?: ScrapedTexts;
      /* 下面是中英投影，只为手动添加那条路留着（见 scrape-game 返回体的注释） */
      title?: string | null;
      titleEn?: string | null;
      consoleType?: ConsoleType | null;
      year?: number | null;
      developer?: string | null;
      series?: string | null;
      seriesEn?: string | null;
      description?: string | null;
      descriptionEn?: string | null;
      imageUrl?: string | null;
      /** `fileName` 里每一个语言版本 —— 一款多语言全导靠它 */
      roms?: RomVariant[];
      romUrl?: string | null;
      romName?: string | null;
      romLang?: string | null;
      /** 挑出来的那一份是否已在库里（老字段，走下面兜底那条路） */
      duplicate?: boolean;
    };

    const title = (meta.title ?? game.title ?? '').trim();
    if (!title) throw new Error('该页面没有标题');

    /*
     * 要入库的语言版本：只认站内支持的四种（中 / 英 / 日 / 韩，见 lib/rom-lang.ts）。
     * 上游还会挂 `fr` / `es` 这类我们没登记的语言 —— 直接不要，别往库里灌一堆
     * `language` 认不出来的记录。
     *
     * ⚠️ 一个都不认时**退回「挑出来的那一份」**（服务端按 英→中→日 挑好的）：
     *    宁可照旧导一条，也不要因为语言不在白名单里就整款丢掉。
     */
    const supported = (meta.roms ?? []).filter(
      (variant) => variant.language !== null && GAME_LANGUAGE_VALUES.includes(variant.language)
    );
    const targets: RomVariant[] = supported.length
      ? supported
      : [
          {
            lang: meta.romLang ?? '',
            language: romLangToFormValue(meta.romLang),
            url: meta.romUrl ?? '',
            name: meta.romName ?? '',
            duplicate: meta.duplicate === true,
          },
        ];

    const outcomes: ImportOutcome[] = [];
    /** 封面**一款只取一次**：几个语言版本只有 ROM 不同（第一次真要用到时才去取）。 */
    let cover: File | null = null;

    for (const variant of targets) {
      // 「停止」按了就收手 —— 款与款之间、一款的几种语言之间都看一眼
      if (shouldStop?.()) break;

      const rowTitle = variantTitle(title, variant.language);
      /** 只有失败 / 跳过才带原因，成功那条不带 */
      const emit = (status: ImportStatus, reason?: string) =>
        onEvent?.({ phase: 'done', title, language: variant.language, status, reason });

      /*
       * **先查重、再下载**：封面 + ROM 加起来几 MB，是整条链路里最慢的一段。
       * 库里已有同名同机种同语言的直接跳过，不白下载一遍再被上传那一步拒掉。
       * 判据来自服务端（抓取时**逐份**做的，和上传那一步是同一个 findGameDuplicate）。
       *
       * ⚠️ 机种这一维不能省（判重三个维度）：同名跨机种是合法的，服务端也是按三维算的
       *    —— 这里只负责转述结论，别自己再判一次。
       */
      if (variant.duplicate) {
        const reason = '库里已有同机种、同名、同语言的游戏。';
        outcomes.push({ title: rowTitle, language: variant.language, status: 'duplicate', reason });
        emit('duplicate', reason);
        continue;
      }

      if (!meta.imageUrl) {
        const reason = '该页面没有封面图';
        outcomes.push({ title: rowTitle, language: variant.language, status: 'failed', reason });
        emit('failed', reason);
        continue;
      }
      if (!variant.url) {
        const reason = '该页面没有游戏文件';
        outcomes.push({ title: rowTitle, language: variant.language, status: 'failed', reason });
        emit('failed', reason);
        continue;
      }

      onEvent?.({ phase: 'start', title, language: variant.language });

      /*
       * 「取封面 / ROM + 上传」这一段**单独包一层 try** —— 一份语言版本失败
       * 不该带走这款的其它语言（外面那个 catch 管的是「整款连详情都没抓到」）。
       */
      try {
        // 这一份的封面（一款共用，第一次真要用到时才取）
        if (!cover) cover = await fetchAsset('/api/admin/fetch-image', meta.imageUrl, '');
        /*
         * ROM：勾了「保存 ROM」就下载字节走老路；没勾就**只带上游地址**（2026-10-16），
         * 字节一个都不取 —— 这是整条链路里最慢的一段（几 MB × 语言数）。
         * 地址**原样**交给服务端收敛（`site:/…` / `files:/…`），客户端不 import 服务端模块
         * （收敛在 app/api/admin/games 里用 toStoredSource 做，转换即校验）。
         */
        const rom = saveRom
          ? await fetchAsset('/api/admin/fetch-rom', variant.url, variant.name)
          : null;

        /*
         * 字段名与手动添加那条**必须一致**（见 app/api/admin/games 的 POST）。
         * 机种：详情页认不出来时退到列表页那一档（`/zh/snes-games` → snes）。
         * 语言：用**这一份**的短码（认不出的语言那一支兜底时可能为空）。
         */
        const form = new FormData();
        /*
         * 文案走 `texts`（**四个语言**，2026-10-16 加）—— 服务端优先认它，写进 `game_texts`。
         *
         * 下面那几栏扁平字段**照旧带着**，两个理由：
         *   ① 服务端万一收不到 `texts`（老版本 / 手工构造的请求），还有退路；
         *   ② `title` 那一栏服务端还要拿去判重（`findGameDuplicate` 比的是中文标题）——
         *      与 `texts.zh.title` 同源，重复带上不冲突。
         */
        if (meta.texts) form.set('texts', JSON.stringify(meta.texts));
        form.set('title', title);
        form.set('title_en', meta.titleEn ?? '');
        form.set('console_type', meta.consoleType ?? fallbackConsole ?? 'nes');
        form.set('language', variant.language ?? '');
        form.set('series', meta.series ?? '');
        form.set('series_en', meta.seriesEn ?? '');
        form.set('year', meta.year == null ? '' : String(meta.year));
        // 下拉框认的是 developers.id，而接口回的是**名字** —— 查一次映射，查不到就留空
        form.set('developer_id', (meta.developer && developerIds.get(meta.developer)) || '');
        form.set('description', meta.description ?? '');
        form.set('description_en', meta.descriptionEn ?? '');
        form.set('image', cover);
        if (rom) {
          form.set('rom', rom);
        } else {
          // 不存 ROM：把上游地址与原始文件名带上（后者 FBNeo 认它当驱动名，改不得）
          form.set('source_url', variant.url);
          form.set('rom_name', variant.name);
        }

        const res = await fetch('/api/admin/games', { method: 'POST', body: form });
        if (!res.ok) {
          const failure = await readFailure(res, '上传失败。');
          // 同名 + 同语言 = 库里已经有了，算「跳过」不算失败（判重见 /api/admin/games）
          const status: ImportStatus =
            failure.code === 'duplicate-title' ? 'duplicate' : 'failed';
          outcomes.push({
            title: rowTitle,
            language: variant.language,
            status,
            reason: failure.detail,
          });
          emit(status, failure.detail);
        } else {
          outcomes.push({ title: rowTitle, language: variant.language, status: 'ok' });
          emit('ok');
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        outcomes.push({ title: rowTitle, language: variant.language, status: 'failed', reason });
        emit('failed', reason);
      }
    }

    return outcomes;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    /*
     * 整款连详情都没抓到（比如上游 502）。**照样吐一条事件** —— 不然在「自动爬取」
     * 那个控制台上这一款会**静默消失**：没进库、也没人报出来。
     */
    onEvent?.({ phase: 'done', title: label, language: null, status: 'failed', reason });
    return [{ title: label, language: null, status: 'failed', reason }];
  }
}

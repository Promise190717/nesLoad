'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n';
import {
  DURATION_OPTIONS,
  END_MODE_OPTIONS,
  KILL_OPTIONS,
  TEAM_SIZE_OPTIONS,
  type Difficulty,
  type EndMode,
  type TeamSize,
} from '@/lib/h5/types';
import { CODE_LENGTH, normalizeRoomCode } from '@/lib/h5/net/protocol';
import type { LobbyEntry } from '@/lib/h5/net/session';
import { h5Text, type H5TextKey } from '@/lib/h5/ui-text';
import { GameButton, Segmented, Tabs } from './ui';

/**
 * **进游戏的第一道门，也是唯一的准备页**：模式、人机强度、房间全在这一页选完。
 *
 * 为什么要有这一页（而不是把两个入口塞进开始界面）：加载一局游戏要建 WebGL
 * 上下文、烘地图贴图、拉五个枪模；以前这些在页面一挂载就发生，访客看到的
 * 是一个已经能点的开始界面，却不知道「单人」和「联机」是两条完全不同的路。
 * 现在把选择提到最前面，两种模式各自带着自己的说明，加载也挪到选择之后
 * （进度条见 `ShipLoading`）—— 点按钮之前，一个字节的资源都不用下。
 *
 * 2026-11-13 的两次收口，目标都是**去掉「点完还有一页要选」**：
 *
 *   · 人机强度长进单人卡 —— 「开始战斗」按下去就是枪响；
 *   · 建房 / 加房整块搬进联机卡，再拆成两个子页签，页签放**最上方**（比房规和
 *     名字都靠前）：「创建房间」页 = 房规四行 + 一句说明，点页脚主按钮直接开局；
 *     「加入房间」页 = 名字 + 附近的房间（房间码输入框撤了，链接带来的码走横幅），
 *     页签上带房间数角标，列表头上有手动刷新。
 *     建房直接开局，加房直接进阵营选择。房间面板只剩「连接中 / 选阵营 / 出错 / 房主走了」。
 *
 * 设置挂在页面右上角，跟模式选择平级 —— 它是整页的入口，不属于任何模式。
 *
 * 视觉是 CF 客户端的模式选择：近黑底 + 橙金页签 + 直角面板，背景用细网格 +
 * 一角暖色辉光提供质感（**不压插画** —— 原因见下面背景那段的注释）。
 *
 * 🔴 2026-11-13 收窄 + 上框：整列 `max-w-[720px]`（原 980），页签 / 正文 /
 * 开始按钮**合成一张硬边卡片**。以前三段各缩各的（页签一条、面板一块、按钮
 * 挂在面板外），窄屏下轮廓断成三截、边界全靠一条 1px 线跟甲板图抢注意力；
 * 合起来之后整块有一个完整的外框 + 阴影 + 橙金顶条，跟背景界限分明。
 * 页头（eyebrow / 标题 / 副标题）留在卡片外面，它属于页面不属于面板。
 */

export type GameMode = 'solo' | 'net';

/** 联机卡内的子页签：建房 / 加房各占一页，附近的房间只住在「加入房间」里。 */
type NetTab = 'create' | 'join';

/**
 * 两个模式各自的文案键。写成映射而不是拼字符串：`h5Text` 的 key 是字面量联合。
 *
 * 只有「标题 / 人数标签 / 一句说明」—— 页面副标题、卡内提示行都删了（2026-11-13）：
 * 模式名和人数标签已经说完了这张卡是什么，再补一句「两条路都从这扇门进」只是
 * 把读者已经看明白的事重复一遍，还把卡片往下推。
 */
const COPY: Record<GameMode, { title: H5TextKey; tag: H5TextKey; desc: H5TextKey }> = {
  solo: { title: 'mode.solo', tag: 'mode.soloTag', desc: 'mode.soloDesc' },
  net: { title: 'mode.net', tag: 'mode.netTag', desc: 'mode.netDesc' },
};

const DIFFICULTIES: readonly { value: Difficulty; label: H5TextKey }[] = [
  { value: 'easy', label: 'setup.difficulty.easy' },
  { value: 'normal', label: 'setup.difficulty.normal' },
  { value: 'hard', label: 'setup.difficulty.hard' },
];

export default function ShipModeSelect({
  locale,
  mode,
  onMode,
  difficulty,
  onDifficulty,
  teamSize,
  onTeamSize,
  endMode,
  onEndMode,
  durationSec,
  onDuration,
  killTarget,
  onKillTarget,
  onEnter,
  name,
  onName,
  code,
  onCode,
  onCreate,
  onJoin,
  rooms,
  scanning,
  onRefreshRooms,
  onSettings,
  backHref,
}: {
  locale: Locale;
  mode: GameMode;
  onMode: (mode: GameMode) => void;
  /** 人机强度（只对单人局有意义，跟 `rules` 同一份状态） */
  difficulty: Difficulty;
  onDifficulty: (value: Difficulty) => void;
  /** 对局规模：每队人数（含自己）。1v1 ~ 6v6 */
  teamSize: TeamSize;
  onTeamSize: (value: TeamSize) => void;
  /** 结束方式：时长到点 / 人头打满。**二选一**，另一个数值行不渲染 */
  endMode: EndMode;
  onEndMode: (value: EndMode) => void;
  /** 对局时长（秒）。只在「按时长」时出现，同样只对单人局有意义 —— 联机跟房主走 */
  durationSec: number;
  onDuration: (value: number) => void;
  /** 目标人头。只在「按人头」时出现，同上 */
  killTarget: number;
  onKillTarget: (value: number) => void;
  /** 单人的「开始战斗」：载入 → 开局 */
  onEnter: () => void;
  /** 本机玩家名（受控；空串用默认名） */
  name: string;
  onName: (next: string) => void;
  /** 邀请链接带来的房间码（受控，宿主持有；加房页的输入框也走它） */
  code: string;
  onCode: (next: string) => void;
  /** 建房：载入 → 立刻开局（房主不等别人） */
  onCreate: () => void;
  /** 加房：载入 → 阵营选择 */
  onJoin: (code: string) => void;
  /** 附近的房间（大厅广播） */
  rooms: readonly LobbyEntry[];
  /** 正在等房间列表（大厅刚连上 / 刚切到联机页签） */
  scanning: boolean;
  /** 手动刷新附近的房间（清掉当前列表重新等下一轮公告） */
  onRefreshRooms: () => void;
  onSettings: () => void;
  backHref: string;
}) {
  const text = (key: H5TextKey) => h5Text(locale, key);
  const copy = COPY[mode];
  const solo = mode === 'solo';

  // 子页签是本组件的本地状态：模式页每次回到 phase='mode' 都重挂载，
  // 但「点过哪一页」这种 UI 偏好不值得抬进宿主。唯一例外是邀请链接 ——
  // 带着房间码进来的人九成是要加房，初值直接落「加入房间」
  const [netTab, setNetTab] = useState<NetTab>(() => (normalizeRoomCode(code) !== null ? 'join' : 'create'));

  // 房间码由宿主持有：邀请链接（`?shiproom=`）到达时会直接把它填好，
  // 放在这里当本地草稿的话挂载之后就到不了了
  const normalized = normalizeRoomCode(code);
  const canJoin = normalized !== null;

  return (
    // touch-auto：父层是 touch-none（对局里不让浏览器抢手势），这里是普通页面，
    // 矮屏 / 横屏手机上得能滚 —— 那条 touch-none 会一路继承下来。
    <div className="absolute inset-0 z-30 touch-auto overflow-y-auto bg-[#080b0f]">
      {/* 背景只有「质感」，没有「图」。
          🔴 以前这里压了一张 `H5Cover`（运输船甲板）在右下角，`opacity-25`：
          那个 SVG 第一笔就是一块**不透明的天空矩形**（320×180 画满），所以它
          永远以「一个矩形」的形状出现 —— 压到 25% 之后被看见的不是甲板，而是
          那块矩形本身，右下角就多出一小块明显比周围亮的图。除非给它加遮罩
          把四边磨掉（那就只剩一团糊），否则它在这个位置只能是个补丁。
          所以换成一整屏的细网格 + 暖色辉光：铺满、无边界、和载入页(`ShipLoading`)
          同一套质感，模式页 → 载入页的过渡也更连贯。 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.022)_0_1px,transparent_1px_56px)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_74%_14%,rgba(240,160,32,.13),transparent_62%)]" />
      </div>

      {/* justify-center：整块内容在视口里上下居中（CF 客户端也是这一套，页头不留孤零零的顶栏）。
          min-h-full 保证矮屏时区块还能长高、由外层 overflow-y-auto 滚动；内容比视口高时
          居中不生效，区块自然从顶上排下来，不会被裁掉 */}
      <div className="relative mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center px-5 py-6 sm:px-6 sm:py-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-[3px] w-7 bg-[#f0a020]" />
              <p className="text-[10px] tracking-[0.36em] text-[#f0a020] uppercase">{text('mode.eyebrow')}</p>
            </div>
            <h1 className="mt-3 text-[28px] leading-none font-black tracking-tight text-white sm:text-[34px]">
              {text('mode.title')}
            </h1>
          </div>

          {/* 设置和「返回专栏」并列挂在右上角：它不属于任何模式，是整页的入口。
              设置给边框 + 齿轮图标（2026-11-13）：纯灰字压在甲板图上几乎看不见，
              而它是这一页唯一的常驻操作 —— 描边能让它在任何背景上都读得出来 */}
          <div className="mt-1 flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onSettings}
              className="flex items-center gap-1.5 border border-[#3a4149] bg-black/35 px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white/70 transition-colors hover:border-[#f0a020]/70 hover:text-white"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor">
                {/* 实心齿轮轮廓（8 齿 + 中心孔）。上一版是「中心圆 + 八条放射短线」，
                    齿和轮盘之间有空隙、线又是等宽的，缩到 12px 就成了一个太阳 ——
                    齿轮必须是一条闭合轮廓，齿和轮体连在一起才读得出来 */}
                <path
                  fillRule="evenodd"
                  d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                />
              </svg>
              {text('mode.settings')}
            </button>
            <Link
              href={backHref}
              prefetch={false}
              className="text-[11px] whitespace-nowrap text-white/35 transition-colors hover:text-white/70"
            >
              {text('menu.back')}
            </Link>
          </div>
        </div>

        {/* 一整块卡片：橙金顶条 + 页签 + 正文 + 开始按钮。
            外框 1px 亮一档的灰（#3a4149）+ 外面再套一圈 1px 纯黑描边，
            压在甲板图上边缘依然清晰；阴影负责把它从背景里「抬」起来。 */}
        <div className="relative mt-6 border border-[#3a4149] bg-[#0a0e13]/95 shadow-[0_0_0_1px_rgba(0,0,0,.55),0_30px_90px_rgba(0,0,0,.88)] backdrop-blur-sm">
          <div className="h-[2px] w-full bg-gradient-to-r from-[#f0a020] via-[#f0a020]/45 to-transparent" />

          <Tabs<GameMode>
            className="px-5"
            value={mode}
            onChange={onMode}
            options={[
              { value: 'solo', label: text('mode.solo'), hint: text('mode.soloTag') },
              { value: 'net', label: text('mode.net'), hint: text('mode.netTag') },
            ]}
          />

          <div className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-[20px] leading-none font-bold tracking-wide text-white">{text(copy.title)}</h2>
              <span className="border border-[#f0a020]/35 bg-[#f0a020]/8 px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-[#f0a020]">
                {text(copy.tag)}
              </span>
            </div>

            <p className="mt-3.5 text-[12px] leading-6 text-white/50">{text(copy.desc)}</p>

            {/* 子页签放最上方：建房 / 加房是这页的第一个选择，比房规和名字都靠前。
                「加入房间」上的角标是附近房间数，有房才画 */}
            {solo ? null : (
              <Segmented<NetTab>
                className="mt-4"
                value={netTab}
                onChange={setNetTab}
                options={[
                  { value: 'create', label: text('net.create') },
                  { value: 'join', label: text('net.join'), badge: rooms.length },
                ]}
              />
            )}

            {/* 名字两个子页都要（建房要报名，加房也要），紧跟页签 */}
            {solo ? null : (
              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] tracking-wide text-white/45">{text('net.name')}</span>
                <input
                  value={name}
                  onChange={(event) => onName(event.target.value.slice(0, 16))}
                  placeholder={text('net.namePlaceholder')}
                  maxLength={16}
                  className="w-full border border-[#343a42] bg-black/45 px-3 py-2 text-[13px] text-white outline-none focus:border-[#f0a020]/70"
                />
              </label>
            )}

            {/* 对局参数：单人直接生效；联机只在「创建房间」页出现 —— 加房页听房主的，
                把这四行画出来只会让人以为是自己选的规模和人头。
                以前这些是写死的（5v5 / 10 分钟 / 40 头），想打一小局的人只能中途退出。

                🔴 「结束方式」两档互斥：按时长 / 按人头。**只渲染选中的那一个数值行** ——
                两行同时出现时玩家会读到「5 分钟内打满 40 头才结束」，而引擎其实是
                先到先算；选「按人头」却因为时间先到被结算，看着就像 bug */}
            {solo || netTab === 'create' ? (
            <div className="mt-4 space-y-2.5 border-t border-white/8 pt-4">
              <RuleRow label={text('start.mode')}>
                <Segmented<TeamSize>
                  value={teamSize}
                  onChange={onTeamSize}
                  options={TEAM_SIZE_OPTIONS.map((size) => ({ value: size, label: `${size}v${size}` }))}
                />
              </RuleRow>
              <RuleRow label={text('start.endMode')}>
                <Segmented<EndMode>
                  value={endMode}
                  onChange={onEndMode}
                  options={END_MODE_OPTIONS.map((value) => ({
                    value,
                    label: text(value === 'time' ? 'start.endTime' : 'start.endKills'),
                  }))}
                />
              </RuleRow>
              {endMode === 'time' ? (
                <RuleRow label={text('start.duration')}>
                  <Segmented<number>
                    value={durationSec}
                    onChange={onDuration}
                    options={DURATION_OPTIONS.map((sec) => ({
                      value: sec,
                      label: `${sec / 60} ${text('unit.minute')}`,
                    }))}
                  />
                </RuleRow>
              ) : (
                <RuleRow label={text('start.kills')}>
                  <Segmented<number>
                    value={killTarget}
                    onChange={onKillTarget}
                    options={KILL_OPTIONS.map((count) => ({ value: count, label: String(count) }))}
                  />
                </RuleRow>
              )}
              <RuleRow label={text('start.difficulty')}>
                <Segmented<Difficulty>
                  value={difficulty}
                  onChange={onDifficulty}
                  options={DIFFICULTIES.map((item) => ({ value: item.value, label: text(item.label) }))}
                />
              </RuleRow>
            </div>
            ) : null}

            {/* 子页签内容：建房页只补一句房规说明；加房页 = 房间码 + 附近的房间。
                名字在上面两页共用，这里不再重复 */}
            {solo ? null : netTab === 'create' ? (
              <p className="mt-3 border border-dashed border-white/12 px-3 py-3 text-[11px] leading-5 text-white/40">
                {text('net.createHint')}
              </p>
            ) : (
              <>
                <label className="mt-3 block">
                  <span className="mb-1 block text-[11px] tracking-wide text-white/45">{text('net.code')}</span>
                  <input
                    value={code}
                    onChange={(event) => onCode(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && normalized) onJoin(normalized);
                    }}
                    placeholder={text('net.codePlaceholder')}
                    maxLength={CODE_LENGTH + 2}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full border border-[#343a42] bg-black/45 px-3 py-2 font-mono text-[15px] tracking-[0.3em] text-white uppercase outline-none focus:border-[#f0a020]/70"
                  />
                </label>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] tracking-wide text-white/45">{text('net.rooms')}</span>
                    {/* 手动刷新：大厅没有「查询」动作（列表靠房主每 2 秒广播喂），
                        所以刷新 = 清列表重新等下一轮公告。搜索中禁用 —— 转圈本身就是
                        「正在刷新」，再点只会把计时器越排越长 */}
                    <button
                      type="button"
                      onClick={onRefreshRooms}
                      disabled={scanning}
                      title={text('net.refresh')}
                      aria-label={text('net.refresh')}
                      className="flex items-center gap-1.5 border border-[#343a42] bg-black/45 px-2 py-1 font-mono text-[10px] tabular-nums text-white/55 transition-colors hover:border-[#f0a020]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className={`h-3 w-3 shrink-0 ${scanning ? 'animate-spin' : ''}`}
                        fill="currentColor"
                      >
                        {/* 环形箭头：圆弧 + 三角头。两段 3/4 圆弧拼不圆，
                            直接用一条 path 画 300° 弧再补箭头最稳 */}
                        <path d="M12 4a8 8 0 1 0 8 8h-2.4a5.6 5.6 0 1 1-5.6-5.6c1.55 0 2.94.63 3.95 1.65L13.6 10.4H20V4l-2.24 2.24A7.96 7.96 0 0 0 12 4z" />
                      </svg>
                      {rooms.length}
                    </button>
                  </div>

                  {rooms.length === 0 ? (
                    scanning ? (
                      // 搜索中：一条橙金扫描线 + 呼吸圆点。高度和下面那块「没发现」对齐，
                      // 真搜完（大概率是空的）时不会整块跳一下
                      <div className="relative overflow-hidden border border-[#343a42] bg-black/30 px-3 py-3">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(240,160,32,.42),transparent)]"
                          style={{ animation: 'ship-scan 1.5s ease-in-out infinite' }}
                        />
                        <div className="relative flex items-center gap-2">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f0a020]" />
                          <span className="text-[11px] leading-5 text-white/45">{text('net.roomsScan')}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="border border-dashed border-white/12 px-3 py-3 text-[11px] leading-5 text-white/30">
                        {text('net.roomsEmpty')}
                      </p>
                    )
                  ) : (
                    <div className="max-h-[144px] overflow-y-auto border border-[#343a42]">
                      {rooms.map((room) => (
                        <button
                          key={room.code}
                          type="button"
                          onClick={() => onJoin(room.code)}
                          className="flex w-full items-center gap-2 border-b border-white/6 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-white/6"
                        >
                          <span className="font-mono text-[13px] font-bold tracking-[0.18em] text-[#f0a020]">
                            {room.code}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-white/50">{room.host}</span>
                          <span className="font-mono text-[10px] tabular-nums text-white/35">
                            {h5Text(locale, 'net.humans', { count: room.humans })} ·{' '}
                            {h5Text(locale, 'net.bots', { count: room.bots })}
                          </span>
                          <span
                            className={`shrink-0 text-[10px] font-bold ${room.open ? 'text-[#7f9a6b]' : 'text-white/25'}`}
                          >
                            {room.open ? text('net.canJoin') : text('net.full')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 不再 mt-auto：父层是 justify-center，mt-auto 会把这块又顶回屏幕最底，
              刚好抵消掉居中。现在它是卡片自己的页脚（一条内分隔线），跟正文同宽 */}
          <div className="flex items-center justify-between gap-4 border-t border-[#2b323a] px-5 py-4">
            {/* 左侧小字跟子页签走：加房页那行「输房间码或点列表」已经写在输入框下面了，
                页脚再重复一遍只是噪声，所以加房页页脚不画小字 */}
            {solo || netTab === 'create' ? (
              <span className="hidden text-[10px] leading-4 tracking-wide text-white/22 sm:block">
                {text(solo ? 'start.hint' : 'net.startHint')}
              </span>
            ) : null}
            {/* 单人：直接开局。联机：主按钮跟子页签走 —— 建房页就是「创建房间」，
                加房页变成「加入房间」（没填合法房间码时禁用）。房间列表里点某条
                是直达的，页脚这个按钮只负责把「这一页的主动作」补齐 */}
            <GameButton
              onClick={
                solo
                  ? onEnter
                  : netTab === 'create'
                    ? onCreate
                    : () => {
                        if (normalized) onJoin(normalized);
                      }
              }
              disabled={!solo && netTab === 'join' && !canJoin}
              className="ml-auto shrink-0 px-8 py-3 text-[14px]"
            >
              {text(solo ? 'start.begin' : netTab === 'create' ? 'net.create' : 'net.join')}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 一行「标签 + 段选」。四条规则（规模 / 结束方式 / 数值 / 人机强度）共用它，
 * 标签宽度写死才能让四组按钮左边缘对齐。
 */
function RuleRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-[60px] shrink-0 text-[11px] tracking-wide text-white/45">{label}</span>
      {children}
    </div>
  );
}

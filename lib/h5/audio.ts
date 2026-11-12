/**
 * 音效层 —— **枪声 / 脚步 / 机械音全部由 WebAudio 程序合成；唯一的例外是击杀
 * 惨叫采样**（`public/h5/audio/scream-*.mp3`，CC0，来源 sfxmint.com）——
 * 合成人声六版迭代（滴滴/破锣/短叮/低频重击/哨声 formant）全被用户否掉，
 * 2026-11-12 拍板换真实录音，见 `loadKillSamples`。
 *
 * ## 枪声的五代史（别走回头路）
 *
 *   ① CC0 采样（只有 4 把枪，M870 硬凑）→ ② 同一配方实时调参（区分度不够）→
 *   ③ The Free Firearm Sound Library 裁片 → 用户否掉采样源（2026-11-12
 *   「枪声源都是不对的」）→ ④ 实时七层分频段噪声 → **⑤ 现行：预烘焙合成**。
 *
 *   ④ 的反馈是「嘟嘟嘟、像装了消音器」。当时把低频正弦删掉换成低通噪声，
 *   闷好了大半，但整声还是「软」—— 因为**实时节点版天生做不了两件事**：
 *   - **全带瞬态**：再宽的 biquad 也有斜率，头 1ms 的宽频脉冲总会被削掉一截；
 *     枪声的「脆」恰恰是那一下全带的「啪」。
 *   - **加谐波**：`DynamicsCompressor` 只压电平，不添密度；噪声过完滤波还是
 *     噪声，缺「炸」的那层 grit。
 *
 * ## 第五版（2026-11-12）：每把枪**预烘焙**成 AudioBuffer
 *
 * `bakeGun()` 在某把枪第一次开火前，用逐样本 DSP 把整声枪响离线算出来缓存进
 * `gunBuffers`（进程内每把枪只算一次，<3ms）；此后每声枪响只是
 * `BufferSource → (距离低通 → 声像) → gunBus` —— **每发 1 个源节点**，
 * 交火时节点数比④少一个数量级，也彻底告别「几层噪声糊在一起」。
 *
 * 合成流水线（对应需求文档的六层结构，全部逐样本写进同一个缓冲）：
 *
 *   crack   全带噪声脉冲，首样本即满幅 + τ 秒指数衰减 —— 起音瞬态，**零淡入**
 *   blast   白噪过低通、截止从 ~7kHz 指数滑到几百 Hz —— 主体爆响（武器重量感）
 *   boom    扫频正弦，30ms 内滑到目标音高、峰值压在瞬态一半以下 —— 低频冲击
 *   sizzle  高通噪声 ~12-20ms —— 高频裂响 / 空气感
 *   tail    低通噪声长衰减 + 两记早反射（30/56ms）—— 环境尾音，仅 AWM / 霰弹
 *   mech    击发后 22ms 双击「哐当」+ 2.1kHz 金属泛音 —— 枪机后坐复位
 *
 * 全部叠完后过一道 **tanh 软削波**（`drive`）—— 这是「冲击力」的主力：它把
 * 峰值压成谐波密度，等于把瞬态推到饱和边缘而不破音（压限器做不到这件事）。
 * 最后整声归一化到 0.9，枪与枪的响度差全交给 `gain` 一个数。
 *
 * **为什么不落盘成 wav**：本项目零静态资源原则（贴图、模型、音效全部运行时
 * 生成）——烘焙结果缓存于内存，效果等价于离线音频文件，体积为零、无加载延迟。
 *
 * **低频正弦为什么回来了**：④ 删它是因为一条 0.42s 的大音量正弦把所有噪声层
 * 盖住（「嘟嘟嘟」的真身）。现在它只是垫底：30ms 内完成滑音（听不出音高）、
 * 峰值不到瞬态一半、τ 最长 0.28s —— 它提供「咚」的重量，「脆」由 crack/sizzle 负责。
 *
 * ## 每把枪的声音为什么不一样（`GUN_RECIPE` 表）
 *
 * 靠**结构差异 + 频谱重心 + 时长**三件事，不是同一声音调音量：
 *
 *   AK-47   ~240ms  主体最厚、blast 滑到 480Hz 偏暗，双击枪机「哐当」
 *   M4A1    ~150ms  全表最短最脆，crack τ 最小、blast 上限 8.5kHz 最亮
 *   AWM     ~850ms  boom 最深（34Hz）最长，独有 0.30s 余响 + 早反射
 *   M870    ~550ms  blast 扫到 260Hz 最「宽」最炸，带尾音
 *   USP     ~180ms  每层都短、drive 最大（.45 手枪的「啪啪」感），滑套双击更响
 *
 * ## 播放侧三条（沿自④，仍然有效）
 *
 *   - 自己的枪**不过距离低通**（`output()`）；远处的枪按距离衰减高频但下限
 *     夹 2.6kHz —— 保住「是什么枪」的辨识度（枪声是定位敌人的主要线索）。
 *   - `gunBus → gunLimiter`（0dB/10:1/2ms）只兜交火峰值，瞬态头 2ms 原样通过；
 *     master 上的全局压缩器只是安全网（-4dB 阈值，平时不触发）。
 *   - `MAX_GUN_VOICES`：别人的枪声并发上限，超出的直接不播（压低每一发会让
 *     听感变成「忽大忽小」）。自己的枪永远放 ——「点了左键没响」最难查。
 *
 * ## 懒创建
 *
 * AudioContext 在用户第一次交互之前创建会停在 suspended，之后所有音效静音。
 * 所以 `ctx` 在 `unlock()`（点开始那一下）里才建，每次播放前兜一次 `resume()`。
 *
 * ## 空间化
 *
 * 按距离做 `1/(1+d·0.075)` 衰减，按左右声道做 StereoPanner 声像，并按距离加
 * 一道低通模拟空气吸收。距离衰减用反比而不是平方反比 —— 平方反比在 10 米外
 * 就基本听不见了，而这张图最长 52 米。
 */

import { clamp, rand } from './math';
import type { Surface } from './types';
import type { SwitchSound } from './weapons';

export type GunSoundId = 'ak47' | 'm4a1' | 'awm' | 'shotgun' | 'usp';

/**
 * 混音总线。**这是「声音优先级」的落点**，不是三个随便分的组：
 *
 *   gun       自己的 / 别人的枪声。永远不压低 —— 枪声是定位敌人的主要线索
 *   world     弹着、脚步、机械、爆炸、环境。命中/击杀响起时**被压到 0.5**，
 *             0.18 秒内回来。连续交火时它是最容易糊成一片的一层
 *   feedback  命中 / 击杀 / 致命一击 / 心跳。**不参与压低**，永远在最上层
 *
 * 上一版所有声音都直接挂 master，靠调 gain 拉开差距 —— 结果是一交火，
 * 命中提示音就被五个人的枪声和弹着声埋掉，玩家「听不出自己打中了」。
 */
type Bus = 'gun' | 'world' | 'feedback';

interface SpatialOptions {
  /** 声源世界坐标；不传 = 不空间化（自己的枪、界面音） */
  x?: number;
  y?: number;
  z?: number;
  /** 额外音量倍率 */
  gain?: number;
  /** 走哪条总线，默认 `world` */
  bus?: Bus;
  /**
   * 是不是「玩家自己」触发的。
   *
   * 枪声、肉搏命中和**自己的脚步**用它，三件事都靠它：
   *   ① 自己的那一声**不跟别人共享节流**。上一版是一个全局 35ms 闸，Bot 在你
   *      前一发之后 20ms 开枪，你自己那一声就被吞掉了 —— 表现是「点了左键没响」，
   *      而且极难复现。脚步同理：别人齐步走会吞掉你自己的步子。
   *   ② 自己的那一声**不受 `MAX_GUN_VOICES` 限制**，也**不过距离低通**。
   */
  own?: boolean;
}

interface Listener {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * 一把枪的烘焙配方 —— `bakeGun()` 按它逐样本算出整声枪响。
 *
 * ⚠️ 各层 peak 不需要人为「留余量」：叠完统一 tanh 软削波 + 归一化到 0.9，
 * 真正控制响度平衡的是表尾的 `gain`。层与层的关系只有一条铁律 ——
 * **boom 峰值不得超过 crack 的一半**（否则回到「嘟嘟嘟」）。
 */
interface GunRecipe {
  /** 相对响度（缓冲已各自归一化，枪与枪的差异全靠它） */
  gain: number;
  /** 起音瞬态：全带噪声脉冲，τ 秒指数衰减。τ 越小越「脆」 */
  crackTau: number;
  crackPeak: number;
  /** 主体爆响：白噪过低通，截止从 F0 指数滑到 F1（滑程 ≈ 2.2×τ） */
  blastF0: number;
  blastF1: number;
  blastTau: number;
  blastPeak: number;
  /** 低频冲击：扫频正弦，30ms 内滑到目标音高后按 τ 衰减 */
  boomF0: number;
  boomF1: number;
  boomTau: number;
  boomPeak: number;
  /** 高频裂响：高通（5.2kHz 固定）噪声，τ 秒衰减 —— 空气感 */
  sizzleTau: number;
  sizzlePeak: number;
  /** 环境尾音：低通 800Hz 噪声长衰减 + 两记早反射；null = 无 */
  tailTau: number | null;
  tailPeak: number;
  /** 机械「哐当」延时（秒，null = 无） */
  mechDelay: number | null;
  /** tanh 软削波强度 —— 越大越「炸」，也越快压扁动态 */
  drive: number;
  /** 缓冲时长（秒），也是并发计数用的发声时长 */
  life: number;
}

const GUN_RECIPE: Record<GunSoundId, GunRecipe> = {
  // 7.62：主体最厚、blast 滑到 480Hz 偏暗 —— 大口径 ≠ 闷，脆由 crack 兜底
  ak47: {
    gain: 0.82,
    crackTau: 0.0055,
    crackPeak: 1.0,
    blastF0: 7000,
    blastF1: 480,
    blastTau: 0.05,
    blastPeak: 0.9,
    boomF0: 140,
    boomF1: 48,
    boomTau: 0.12,
    boomPeak: 0.34,
    sizzleTau: 0.018,
    sizzlePeak: 0.38,
    tailTau: null,
    tailPeak: 0,
    // 无消音器的枪在击发后 ~35ms 必有枪机后坐复位的一声「哐当」
    mechDelay: 0.035,
    drive: 2.5,
    life: 0.24,
  },
  // 5.56：全表最短最脆。685 RPM 只隔 88ms，所以每层都压到最短
  m4a1: {
    gain: 0.76,
    crackTau: 0.0038,
    crackPeak: 1.0,
    blastF0: 8500,
    blastF1: 700,
    blastTau: 0.03,
    blastPeak: 0.85,
    boomF0: 175,
    boomF1: 62,
    boomTau: 0.07,
    boomPeak: 0.22,
    sizzleTau: 0.013,
    sizzlePeak: 0.42,
    tailTau: null,
    tailPeak: 0,
    // 5.56 的枪机比 7.62 更轻更快，「哐当」来得更早
    mechDelay: 0.028,
    drive: 2.8,
    life: 0.15,
  },
  // .338：boom 最深最长，独有 0.30s 余响 + 早反射。拉栓 1.43s 不会叠
  awm: {
    gain: 0.95,
    crackTau: 0.008,
    crackPeak: 1.0,
    blastF0: 6000,
    blastF1: 320,
    blastTau: 0.09,
    blastPeak: 1.0,
    boomF0: 110,
    boomF1: 34,
    boomTau: 0.28,
    boomPeak: 0.45,
    sizzleTau: 0.02,
    sizzlePeak: 0.3,
    tailTau: 0.3,
    tailPeak: 0.5,
    mechDelay: null,
    drive: 2.2,
    life: 0.85,
  },
  // 12 号：blast 扫到 260Hz —— 最「宽」最炸，带尾音
  shotgun: {
    gain: 0.9,
    crackTau: 0.007,
    crackPeak: 0.95,
    blastF0: 5000,
    blastF1: 260,
    blastTau: 0.085,
    blastPeak: 1.0,
    boomF0: 130,
    boomF1: 38,
    boomTau: 0.19,
    boomPeak: 0.4,
    sizzleTau: 0.019,
    sizzlePeak: 0.32,
    tailTau: 0.18,
    tailPeak: 0.42,
    mechDelay: null,
    drive: 2.0,
    life: 0.55,
  },
  // .45：每层都短、drive 最大（手枪弹的「啪」最干最脆），滑套双击更响
  usp: {
    gain: 0.7,
    crackTau: 0.0035,
    crackPeak: 1.0,
    blastF0: 9000,
    blastF1: 900,
    blastTau: 0.022,
    blastPeak: 0.8,
    boomF0: 220,
    boomF1: 85,
    boomTau: 0.05,
    boomPeak: 0.18,
    sizzleTau: 0.011,
    sizzlePeak: 0.36,
    tailTau: null,
    tailPeak: 0,
    // 滑套后坐 + 复位两声分得比步枪开（22ms 间隔），听感是「咔啦」不是「哐」
    mechDelay: 0.055,
    drive: 3.0,
    life: 0.18,
  },
};

/**
 * 主输出固定衰减。
 *
 * 旧版主压缩器是 `-14dB / 6:1` —— 阈值低到每一枪都在压，等于给整条混音垫了
 * 约 9dB 的自动衰减。这一版把它换成只兜底的 `-4dB / 6:1` 之后，**同样的增益
 * 设置会凭空响 5~9dB**。这个常数就是把这 5~9dB 垫回去的补偿：
 *
 *   有了它，玩家听到的响度和改之前基本一致，差异全在**音色和瞬态**上 ——
 *   而不是「你把音量推大了」（需求第 10 条明确禁止那种做法）。
 *
 * 想整体更响就抬它，但先确认 `gunLimiter` 没在常驻压（听感是「糊、没有尖」）。
 *
 * ⚠️ 2026-11-12 第二版把它从 0.72 提到 0.82：枪声从「正弦 + 扫频噪声」改成
 * **全噪声分频段**之后，同峰值下的听感响度低了约 2dB（噪声的 RMS/峰值比纯音低）。
 * 这不是在补音质，纯粹是把响度拉回原位，免得「变闷」的错觉来自「变小声」。
 */
const MASTER_TRIM = 0.82;

/**
 * 同时「在响」的枪声上限（不含自己的）。
 *
 * 五人交火 + 自动武器，1 秒能开出 50 发。全部照播的结果不是更响，而是**更糊**
 * —— 40 个噪声源叠在一起就是一层白噪，还平白吃掉 CPU。超出的直接不播：
 * 少听一发远处的枪，比听不清整片交火好。
 */
const MAX_GUN_VOICES = 6;

/**
 * 脚步声每个表面预烘几个变体。
 *
 * 真人左右脚、步态轻重每一步都不同 —— 同一份波形连播两步就能听出是循环。
 * 5 个变体（触地强度 / 摩擦长度 / 板腔音高各自随机）× 播放时 ±8% 变速失谐，
 * 相邻两步基本不重样。
 */
const STEP_VARIANTS = 5;

/**
 * 脚步声的出口响度（缓冲归一化到 0.9 之后统一乘它）。
 *
 * 自己跑步全响约 0.55 —— 比弹着声略轻、比 UI 音重得多；跑步的脚步声应该
 * 是「我在移动」的存在感，不是背景音。步态（蹲 / 静步）的再衰减在 player.ts
 * 的调用点做，那里才知道这一步是什么姿态。
 */
const STEP_BASE = 0.55;

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private gunBus: GainNode | null = null;
  private worldBus: GainNode | null = null;
  private feedbackBus: GainNode | null = null;
  /** 枪声专用压限器 —— 别和 master 上那个全局压缩混为一谈（见 `unlock()`） */
  private gunLimiter: DynamicsCompressorNode | null = null;
  /** 枪声混响的送出增益。想关掉环境尾音，把这个数改成 0 即可 */
  private reverbSend: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.6;
  private listener: Listener = { x: 0, y: 0, z: 0, yaw: 0 };
  /** 别人的枪声节流（自己的走 `lastOwnShotAt`，两者互不影响） */
  private lastShotAt = 0;
  private lastOwnShotAt = 0;
  private lastImpactAt = 0;
  private lastRicochetAt = 0;
  private lastHitMarkAt = 0;
  private ambience: { gain: GainNode } | null = null;
  /** 还「在响」的枪声，`at + life` 过了就自动出列（并发上限用，见 `MAX_GUN_VOICES`） */
  private voices: { at: number; life: number }[] = [];
  /** 预烘焙的枪声缓冲（每把枪首次开火时算一次，进程内复用 —— 见 `bakeGun`） */
  private gunBuffers = new Map<GunSoundId, AudioBuffer>();
  /** 击杀惨叫（CC0 采样，普通/爆头两版；加载失败时回退 `bakeKill` 合成版） */
  private killBuffers = new Map<boolean, AudioBuffer>();
  /** 惨叫采样加载状态：`loading` 期间击杀不响（宁缺毋滥），`failed` 才走合成兜底 */
  private killSampleState: 'loading' | 'ready' | 'failed' = 'loading';
  /** 预烘焙的脚步声（每个表面 5 个变体，第一步落下时算一次 —— 见 `bakeStep`） */
  private stepBuffers = new Map<Surface, AudioBuffer[]>();
  /** 别人的脚步节流（自己的不节流 —— 同枪声「点了没响」的纪律） */
  private lastStepAt = 0;

  /** 第一次用户交互时调用。重复调用无副作用。 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }

    const master = this.ctx.createGain();
    master.gain.value = this.volume * MASTER_TRIM;
    // 32Hz 高通：低频砰最低到 30Hz，留着只占动态余量 —— 而且压限器会先被它触发，
    // 一触发就把整声的瞬态一起压平（「闷」的又一个来源）
    const rumbleCut = this.ctx.createBiquadFilter();
    rumbleCut.type = 'highpass';
    rumbleCut.frequency.value = 32;
    rumbleCut.Q.value = 0.5;
    // 全局压限：**只当安全网**，阈值 -4dB / 6:1 —— 正常播放时它根本不该动。
    // 上一版是 -14dB / 6:1，阈值低到每一枪都在压：五个人的枪声一进主压缩器，
    // 整条混音（连命中提示音）都被压下去再弹回来，听感就是「忽大忽小」；
    // 而且它压掉的正是瞬态的尖，本身就在制造「闷」。枪声的峰值交给 gunLimiter。
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -4;
    comp.knee.value = 4;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    master.connect(rumbleCut);
    rumbleCut.connect(comp);
    comp.connect(this.ctx.destination);
    this.master = master;

    // 三条总线（见 `Bus` 的注释）。world 是唯一会被 `duckWorld()` 压低的一条
    this.gunBus = this.ctx.createGain();
    this.gunBus.gain.value = 1;
    // 枪声总线自己的压限：阈值 0dB、10:1、2ms 攻击。
    //
    // 它**只负责把「五发同时到峰值」削到不破音**。单发理论峰值约 1.7（七个频段的
    // 算术和，实际因为相位不同只有 1.0~1.3），只在最尖的那一下轻碰阈值 ——
    // 而 2ms 的攻击时间让头 1~2ms 的瞬态原样通过，被压的是后面那段「砰」。
    // 压完之后**瞬态与延续段的比例反而更大**，听感更冲。
    // 上一版把这件事交给 master 上那个 -14dB/6:1 的压缩器，压的是整条混音，
    // 所以只会更糊、更忽大忽小。
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = 0;
    limiter.knee.value = 3;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    this.gunBus.connect(limiter);
    limiter.connect(master);
    this.gunLimiter = limiter;

    // 枪声的环境尾音：程序生成的一段 0.2s 脉冲响应（不引音频文件）。
    // 只留 600Hz 以上 —— 低频尾音在连发时会累积成一层「嗡嗡的糊」，那正是
    // 「尾音盖住主枪声」。送出只有 0.1，听感是「开阔甲板上有一点反射」，
    // 不是「进了山洞」；主要尾音仍由 AWM / 霰弹那层 `tail` 提供。
    // 送出点取在**压限器之后**：交火时混响跟着被压过的干声走，不会出现
    // 「干声被压、混响没被压」那种越打越糊的叠加
    const reverbHp = this.ctx.createBiquadFilter();
    reverbHp.type = 'highpass';
    reverbHp.frequency.value = 600;
    reverbHp.Q.value = 0.6;
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this.buildImpulse(0.2, 3.4);
    const reverbSend = this.ctx.createGain();
    reverbSend.gain.value = 0.1;
    limiter.connect(reverbHp);
    reverbHp.connect(convolver);
    convolver.connect(reverbSend);
    reverbSend.connect(master);
    this.reverbSend = reverbSend;

    this.worldBus = this.ctx.createGain();
    this.worldBus.gain.value = 1;
    this.worldBus.connect(master);
    this.feedbackBus = this.ctx.createGain();
    // 反馈音整体抬一点：命中/击杀提示必须在任何枪声之上
    this.feedbackBus.gain.value = 1.15;
    this.feedbackBus.connect(master);

    // 2 秒白噪声，所有爆炸/枪声都从它派生
    const length = Math.floor(this.ctx.sampleRate * 2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;

    // 惨叫采样异步加载：不阻塞 unlock，加载完成前击杀暂时无声（见 killConfirm）。
    // 重复 unlock / dispose 后重进都要重置 —— killBuffers 已被 dispose 清空
    this.killSampleState = 'loading';
    void this.loadKillSamples();

    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /**
   * 击杀惨叫采样（**唯一的真实音频素材**，CC0，来源 sfxmint.com）：
   *
   *   false → scream-short.mp3  普通击杀：Nonverbal Male Pain Scream 02（0.7s）
   *   true  → scream-long.mp3   爆头击杀：Brief Male Pain Scream 01（2.3s）
   *
   * 源文件统一被站点垫静音到 ~2.56s（三个不同音效的 mp3 字节数完全一致），
   * 所以解码后必须按峰值阈值裁掉静音（`prepareKillSample`）。合成版 `bakeKill`
   * 只在这两个文件 404 / 解码失败时兜底 —— 合成人声已被用户连续否掉六版，
   * 别再把合成版当主路径。
   */
  private static readonly KILL_SAMPLE_URLS = {
    false: '/h5/audio/scream-short.mp3',
    true: '/h5/audio/scream-long.mp3',
  } as const;

  private async loadKillSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const entries = await Promise.all(
        ([false, true] as const).map(async (head) => {
          const res = await fetch(head ? GameAudio.KILL_SAMPLE_URLS.true : GameAudio.KILL_SAMPLE_URLS.false);
          if (!res.ok) throw new Error(`kill sample HTTP ${res.status}`);
          const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
          return [head, this.prepareKillSample(decoded)] as const;
        }),
      );
      // 加载期间可能已 dispose（退出游戏）：ctx 没了就别回填
      if (!this.ctx) return;
      for (const [head, buffer] of entries) this.killBuffers.set(head, buffer);
      this.killSampleState = 'ready';
    } catch {
      this.killSampleState = 'failed';
    }
  }

  /**
   * 采样清洗：裁掉头尾静音（源文件统一垫到 2.56s）+ 5ms/60ms 防爆音淡入淡出
   * + 峰值归一化到 0.9（和烘焙枪声同一量级，出口增益负责压过它）。
   */
  private prepareKillSample(decoded: AudioBuffer): AudioBuffer {
    const sr = decoded.sampleRate;
    const ch = decoded.numberOfChannels;
    const channels: Float32Array[] = [];
    let peak = 0;
    for (let c = 0; c < ch; c += 1) {
      const d = decoded.getChannelData(c);
      channels.push(d);
      for (let i = 0; i < d.length; i += 1) peak = Math.max(peak, Math.abs(d[i]!));
    }
    if (peak < 1e-4 || !this.ctx) return decoded;

    // 内容边界：所有声道联合找「最后一个 >2% 峰值」的样本
    const threshold = peak * 0.02;
    let first = decoded.length;
    let last = 0;
    for (const d of channels) {
      for (let i = 0; i < d.length; i += 1) {
        if (Math.abs(d[i]!) > threshold) {
          if (i < first) first = i;
          last = i;
        }
      }
    }
    const start = Math.max(0, first - Math.floor(sr * 0.01));
    const end = Math.min(decoded.length, last + Math.floor(sr * 0.05));
    const len = Math.max(1, end - start);
    const out = this.ctx.createBuffer(ch, len, sr);
    const fadeIn = Math.floor(sr * 0.005);
    const fadeOut = Math.min(Math.floor(sr * 0.06), len - 1);
    for (let c = 0; c < ch; c += 1) {
      const src = channels[c]!;
      const dst = out.getChannelData(c);
      for (let i = 0; i < len; i += 1) dst[i] = src[start + i]!;
      for (let i = 0; i < fadeIn; i += 1) dst[i]! *= i / fadeIn;
      for (let i = 0; i < fadeOut; i += 1) dst[len - 1 - i]! *= i / fadeOut;
    }
    // 归一化到 0.9
    let outPeak = 0;
    for (let c = 0; c < ch; c += 1) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i += 1) outPeak = Math.max(outPeak, Math.abs(d[i]!));
    }
    if (outPeak > 0) {
      const norm = 0.9 / outPeak;
      for (let c = 0; c < ch; c += 1) {
        const d = out.getChannelData(c);
        for (let i = 0; i < d.length; i += 1) d[i]! *= norm;
      }
    }
    return out;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    // 乘 `MASTER_TRIM` 的理由见那个常数上方 —— 设置页的 0~100% 语义不变，
    // 只是内部先垫一档，让「100%」和改版之前的响度对齐
    if (this.master) this.master.gain.value = volume * MASTER_TRIM;
  }

  /** 引擎每帧把相机位置和朝向喂进来，空间化才有意义。 */
  setListener(x: number, y: number, z: number, yaw: number): void {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  /* ============================================================
     内部工具
     ============================================================ */

  /** 程序生成一段脉冲响应：指数衰减的白噪声。**不引任何音频文件**。 */
  private buildImpulse(seconds: number, decay: number): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  /**
   * 建一条「距离衰减 → 空气吸收低通 → 声像」的输出链。
   *
   * 低通那一段是这一版新增的：真枪的高频在空气里衰减得比低频快得多，所以远处的
   * 枪声本来就应该更闷、更「噗」。**玩家自己的枪不传坐标**，因此完全不过这道滤波
   * —— 近处交火必须清晰有力（验收标准 5）。
   *
   * 公式 `20000/(1+0.10d)`：5m 时 13.3kHz（基本没影响）、20m 时 6.7kHz（能听出
   * 变暗但不闷）、52m 时 3.2kHz（远处就是一记闷响）。下限夹 2.6kHz —— 再低连
   * 「是什么枪」都听不出来了，而枪声是这张图上定位敌人的主要线索。
   */
  private output(options: SpatialOptions = {}): GainNode | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;

    const gain = ctx.createGain();
    let volume = options.gain ?? 1;
    let pan = 0;
    let cutoff = 0;

    if (options.x !== undefined && options.z !== undefined) {
      const dx = options.x - this.listener.x;
      const dy = (options.y ?? 0) - this.listener.y;
      const dz = options.z - this.listener.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      volume *= 1 / (1 + distance * 0.075);
      cutoff = clamp(20000 / (1 + distance * 0.1), 2600, 20000);
      if (distance > 0.6) {
        const rx = Math.cos(this.listener.yaw);
        const rz = -Math.sin(this.listener.yaw);
        const horizontal = Math.hypot(dx, dz) || 1;
        pan = Math.max(-1, Math.min(1, ((dx / horizontal) * rx + (dz / horizontal) * rz) * 0.85));
      }
    }

    gain.gain.value = Math.max(0.0001, volume);

    // Q 压到 0.4：低通在截止点附近不共振，否则 2.6kHz 那一段会出「哨音」
    let tail: AudioNode = gain;
    if (cutoff > 0 && cutoff < 19000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      lp.Q.value = 0.4;
      gain.connect(lp);
      tail = lp;
    }

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    tail.connect(panner);
    const bus =
      options.bus === 'gun'
        ? this.gunBus
        : options.bus === 'feedback'
          ? this.feedbackBus
          : this.worldBus;
    panner.connect(bus ?? master);
    return gain;
  }

  /**
   * 把 `world` 总线压低 0.18 秒。
   *
   * 命中 / 击杀 / 致命一击时调 —— 这不是「音效本身变响」，而是**把底下那一层
   * 让开**。连续交火时最直接的效果是：枪声还在，但弹着声和脚步不会盖住
   * 「叮」的那一下。
   *
   * 用 `setTargetAtTime` 而不是 `linearRamp`：增益突变会「咔」一声（波形不连续），
   * 10ms 的指数逼近听不出来。
   */
  private duckWorld(): void {
    const ctx = this.ctx;
    const bus = this.worldBus;
    if (!ctx || !bus) return;
    const t = ctx.currentTime;
    const gain = bus.gain;
    gain.cancelScheduledValues(t);
    gain.setTargetAtTime(0.5, t, 0.012);
    gain.setTargetAtTime(1, t + 0.09, 0.08);
  }

  /**
   * 一条包络。
   *
   * ⚠️ **`attack === 0` 时是硬起（台阶）**，不是 ramp —— 枪声烘焙进 `bakeGun`
   * 之前，这一行曾是修「发闷」的核心（指数曲线前段极慢，等于给每一声加淡入，
   * 枪声的「脆」全在那头 1ms 里）。现在这条纪律由烘焙 DSP 的「首样本即满幅」
   * 继承；`env` 本身服务机械/撞击类声音。
   *
   * 台阶不会「咔」出破音：源本来就是噪声，噪声的波形本身就是不连续的。
   * 非零 attack 用**线性** ramp（不是指数）—— 线性在起点就是满斜率，
   * 指数在起点是 0 斜率，同样 1ms 到峰值，听感完全不同。
   */
  private env(t0: number, peak: number, attack: number, decay: number): GainNode {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const level = Math.max(peak, 0.0003);
    if (attack <= 0) {
      gain.gain.setValueAtTime(level, t0);
    } else {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(level, t0 + attack);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack, 0) + decay);
    return gain;
  }

  /**
   * 一段带滤波扫频的噪声爆发 —— 机械音、弹着、脚步、爆炸的骨架。
   *
   * （第三版起枪声不再走这里 —— 那些预烘焙进 `bakeGun` 了。本方法服务的都是
   * 「软起音」的声音，`attack` 默认 2ms。）
   * `q` 对 `highpass` 也有效：小于 0.707 是缓坡（不刺），大于 1 会在截止点隆起。
   *
   * `offset` 是**噪声缓冲区里的起点**。同一声音的多个频段传同一个值时，
   * 叠加结果是**同一次冲击**被不同滤波器切开的层次；不传则各自随机。
   */
  private burst(
    t0: number,
    duration: number,
    dest: AudioNode,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    peak: number,
    q = 0.8,
    attack = 0.002,
    offset?: number,
  ): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), t0 + duration);
    filter.Q.value = q;
    const gain = this.env(t0, peak, attack, duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    // **起点必须夹住** —— 2 秒的缓冲区里从 1.4s 起播一个 0.85s 的爆炸会被无声截断
    const maxOffset = Math.max(0, (this.noise?.duration ?? 2) - duration - 0.06);
    const start = offset === undefined ? Math.random() * maxOffset : Math.min(offset, maxOffset);
    source.start(t0, start, duration + 0.05);
  }

  /**
   * 一个扫频振荡器。
   *
   * ⚠️ **枪声一次都不用 `tone`** —— 枪声的低频冲击在 `bakeGun` 里逐样本合成
   * （扫频正弦，30ms 内滑完，峰值受控）。往实时枪声里加振荡器就会回到
   * 「嘟嘟嘟」：纯音在同等峰值下比噪声响得多，会把整声压成一个音高。
   * 本方法只服务机械音、命中提示、心跳、环境音这些「本来就有音高」的声音。
   */
  private tone(
    t0: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    duration: number,
    peak: number,
    dest: AudioNode,
    attack = 0.003,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t0 + duration);
    const gain = this.env(t0, peak, attack, duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  private get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /* ============================================================
     枪声
     ============================================================ */

  /**
   * 把一把枪的整声枪响**逐样本烘焙**成一个 AudioBuffer。
   *
   * 为什么从「实时节点」改成「预烘焙」（第三版根因，详见文件头）：
   *   - biquad 的斜率会削掉头 1ms 的宽频脉冲，瞬态天生缺一口；
   *   - `DynamicsCompressor` 只压电平不加谐波，噪声过完滤波还是「软」的；
   *   - 一次击发 7 个 source + 7 个 filter + 7 个 gain ≈ 21 个节点，交火时白吃 CPU。
   *
   * 烘焙流水线（自上而下 = 频率从高到低，全部 t=0 硬起，只有 tail/mech 有结构）：
   *
   *   crack   全带噪声 × exp(-t/τ) —— 首样本即满幅，**零淡入**，负责「冲」
   *   blast   白噪 → 一阶低通（截止从 F0 指数滑到 F1）× exp(-t/τ) —— 「有多大」
   *   boom    扫频正弦，30ms 内滑到 F1 —— 「重量」。⚠️ 30ms 的滑音窗口是刻意的：
   *           更长就听得出音高（「嘟」），更短就只是「嗒」。峰值压在瞬态一半以下
   *   sizzle  白噪 → 一阶高通(5.2kHz) × exp(-t/τ) —— 「空气感」
   *   tail    白噪 → 低通(800Hz) 长衰减 + 30/56ms 两记早反射 —— 开阔甲板的回声
   *   mech    22ms 间隔双击（枪机后坐 / 复位），一阶高通(1.8kHz) + 2.1kHz
   *           阻尼正弦的金属泛音 —— 「哐当」
   *
   * 混完过 **tanh 软削波**（`drive`）：把峰值压成谐波密度 —— 这是实时节点版
   * 做不出「冲击力」的根因，也是这一版听起来「炸」的主力。最后归一化到 0.9。
   */
  private bakeGun(r: GunRecipe): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.ceil(sr * r.life));
    const buffer = ctx.createBuffer(1, n, sr);
    const data = buffer.getChannelData(0);

    const TWO_PI = Math.PI * 2;
    // 一阶滤波系数（截止固定的两个，循环外算好）
    const sizA = 1 - Math.exp((-TWO_PI * 5200) / sr);
    const mechA = 1 - Math.exp((-TWO_PI * 1800) / sr);
    const tailA = 1 - Math.exp((-TWO_PI * 800) / sr);

    // 主体爆响：低通状态量 + 扫频行程
    let blastLp = 0;
    const blastSweep = r.blastTau * 2.2;
    // 高频裂响 / 机械音的高通状态量
    let sizLp = 0;
    let mechLp = 0;
    // 低频冲击：相位累加（扫频不能直接 sin(2πf·t)，频率在变）
    let boomPhase = 0;

    for (let i = 0; i < n; i += 1) {
      const t = i / sr;
      const noise = Math.random() * 2 - 1;

      // ① 起音瞬态：全带、硬起、指数衰减
      const crack = noise * Math.exp(-t / r.crackTau) * r.crackPeak;

      // ② 主体爆响：截止按指数律下扫，约 2.2τ 滑到位（滑太快出「啾」声）
      const fc = r.blastF0 * Math.pow(r.blastF1 / r.blastF0, Math.min(1, t / blastSweep));
      blastLp += (1 - Math.exp((-TWO_PI * fc) / sr)) * (noise - blastLp);
      const blast = blastLp * Math.exp(-t / r.blastTau) * r.blastPeak;

      // ③ 低频冲击：音高在 30ms 内指数滑到 F1，幅度按 τ 衰减
      const boomF = r.boomF1 + (r.boomF0 - r.boomF1) * Math.exp(-t / 0.02);
      boomPhase += (TWO_PI * boomF) / sr;
      const boom = Math.sin(boomPhase) * Math.exp(-t / r.boomTau) * r.boomPeak;

      // ④ 高频裂响
      sizLp += sizA * (noise - sizLp);
      const sizzle = (noise - sizLp) * Math.exp(-t / r.sizzleTau) * r.sizzlePeak;

      // ⑤ 机械「哐当」：22ms 双击 + 金属泛音
      let mech = 0;
      if (r.mechDelay !== null && t >= r.mechDelay) {
        const tm = t - r.mechDelay;
        const hit1 = tm < 0.03 ? Math.exp(-tm / 0.009) : 0;
        const tm2 = tm - 0.022;
        const hit2 = tm2 > 0 && tm2 < 0.03 ? Math.exp(-tm2 / 0.007) : 0;
        mechLp += mechA * (noise - mechLp);
        const click = (noise - mechLp) * (hit1 * 0.3 + hit2 * 0.22);
        const ring = hit1 > 0 ? Math.sin(tm * TWO_PI * 2100) * Math.exp(-tm / 0.012) * 0.05 : 0;
        mech = click + ring;
      }

      let v = crack + blast + boom + sizzle + mech;
      // tanh 软削波：对称压峰值、添谐波 —— 「炸」与「脆」的主力，且不破音
      v = Math.tanh(v * r.drive) / Math.tanh(r.drive);
      data[i] = v;
    }

    // ⑥ 环境尾音（仅 AWM / 霰弹）：独立一遍算好再叠进去，
    //    这样早反射能引用「干净的」尾音样本（主混音已被软削波压过）
    if (r.tailTau !== null && r.tailPeak > 0) {
      const tail = new Float32Array(n);
      let tailLp = 0;
      for (let i = 0; i < n; i += 1) {
        tailLp += tailA * (Math.random() * 2 - 1 - tailLp);
        tail[i] = tailLp * Math.exp(-i / sr / r.tailTau) * r.tailPeak;
      }
      // 两记早反射：30ms / 56ms。倒序遍历，读到的都是未加反射的原样本
      const ref1 = Math.min(n - 1, Math.floor(sr * 0.03));
      const ref2 = Math.min(n - 1, Math.floor(sr * 0.056));
      for (let i = n - 1; i >= ref2; i -= 1) {
        tail[i] += tail[i - ref1] * 0.3 + tail[i - ref2] * 0.18;
      }
      for (let i = 0; i < n; i += 1) data[i] += tail[i];
    }

    // 归一化到 0.9：枪与枪的响度差全交给 `gain`，峰值余量留给总线路
    let peak = 0;
    for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(data[i]));
    const norm = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < n; i += 1) data[i] *= norm;
    return buffer;
  }

  /**
   * 把击杀确认音逐样本烘焙成 AudioBuffer —— **现在是惨叫采样 404/解码失败时
   * 的兜底**（主路径见 `loadKillSamples`）。
   *
   * 合成人声迭代史（都停在「别回头」）：二版纯振荡器「滴滴」、三版金属盘
   * 「破锣」、四版短「叮」、五版低频重击、六版 formant 惨叫「像吹口哨」——
   * 全被用户否掉，2026-11-12 拍板换真实录音。这台微型 formant 合成器留着，
   * 只是断网时的保底：
   *
   *   glottal  锯齿波声源；f0 包络 = 70ms 内从 500Hz 冲到 680Hz 的起音
   *            「啊！」，再按 τ 0.32 落到 230Hz（痛到脱力的下坠）——
   *            音高轮廓就是「惨叫」的本体
   *   formant  三个 Klatt 式两极点共振器（F1/F2/F3），频率随「张嘴→合嘴」
   *            下滑（F1 720→380、F2 1220→900、F3 2600 不动）—— 元音从
   *            「啊」滑到「呃」全靠它
   *   strain   27Hz 振幅粗糙感（喉咙绷紧的抖）+ f0 抖动 + 渐入的 5.5Hz 颤音
   *   breath   1.8kHz 共振的气声垫底，没它就是「管风琴唱歌」
   *   混完过 tanh（drive 1.4）添失真密度，归一化 0.9
   *
   * 爆头版更高更久（640→880→300Hz，τ 0.55，1.05s），死得更「透」。
   */
  private bakeKill(head: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const TWO_PI = Math.PI * 2;
    const life = head ? 1.05 : 0.8;
    const n = Math.ceil(sr * life);
    const buffer = ctx.createBuffer(1, n, sr);
    const data = buffer.getChannelData(0);

    const f0Start = head ? 640 : 500;
    const f0Top = head ? 880 : 680;
    const f0End = head ? 300 : 230;
    const fallTau = head ? 0.4 : 0.32;
    const riseT = 0.07;
    const envTau = head ? 0.55 : 0.4;

    const F1a = 720;
    const F1b = 380;
    const F2a = 1220;
    const F2b = 900;
    const F3 = 2600;

    // 三个共振器 + 气声共振器的两极点状态（Klatt：b1 = 2r·cosθ，b2 = -r²）
    let y11 = 0;
    let y12 = 0;
    let y21 = 0;
    let y22 = 0;
    let y31 = 0;
    let y32 = 0;
    let yb1 = 0;
    let yb2 = 0;
    let phase = 0;

    const bw = [80, 100, 140];

    for (let i = 0; i < n; i += 1) {
      const t = i / sr;
      const noise = Math.random() * 2 - 1;

      // ① f0 包络：冲顶 → 指数下坠；颤音 5.5Hz 渐入，±1.2% 抖动去机器感
      let f0: number;
      if (t < riseT) f0 = f0Start + ((f0Top - f0Start) * t) / riseT;
      else f0 = f0End + (f0Top - f0End) * Math.exp(-(t - riseT) / fallTau);
      f0 *= 1 + Math.min(1, t / 0.35) * 0.02 * Math.sin(TWO_PI * 5.5 * t);
      f0 *= 1 + (Math.random() * 2 - 1) * 0.012;
      phase += (TWO_PI * f0) / sr;
      const glottal = 2 * (phase - Math.floor(phase)) - 1;

      // ② 共振峰随「合嘴」下滑：k=1 张大嘴「啊」→ 0 痛到合嘴「呃」
      const k = Math.exp(-Math.max(0, t - 0.1) / 0.35);
      const forms: [number, number][] = [
        [F1b + (F1a - F1b) * k, bw[0]!],
        [F2b + (F2a - F2b) * k, bw[1]!],
        [F3, bw[2]!],
      ];

      let voiced = 0;
      for (let p = 0; p < 3; p += 1) {
        const [F, B] = forms[p]!;
        const r = Math.exp((-Math.PI * B) / sr);
        const b1 = 2 * r * Math.cos((TWO_PI * F) / sr);
        const b2 = -r * r;
        const c = 1 - b1 - b2;
        let y1: number;
        let y2: number;
        let y: number;
        if (p === 0) {
          y1 = y11;
          y2 = y12;
          y = c * glottal + b1 * y1 + b2 * y2;
          y12 = y1;
          y11 = y;
        } else if (p === 1) {
          y1 = y21;
          y2 = y22;
          y = c * glottal + b1 * y1 + b2 * y2;
          y22 = y1;
          y21 = y;
        } else {
          y1 = y31;
          y2 = y32;
          y = c * glottal + b1 * y1 + b2 * y2;
          y32 = y1;
          y31 = y;
        }
        voiced += y * [1, 0.55, 0.3][p]!;
      }

      // ③ 气声：1.8kHz 共振的噪声垫底（走同一个共振器公式）
      {
        const F = 1800;
        const B = 400;
        const r = Math.exp((-Math.PI * B) / sr);
        const b1 = 2 * r * Math.cos((TWO_PI * F) / sr);
        const b2 = -r * r;
        const c = 1 - b1 - b2;
        const y = c * noise + b1 * yb1 + b2 * yb2;
        yb2 = yb1;
        yb1 = y;
        voiced += y * 0.12;
      }

      // ④ 包络 + 喉部粗糙感（27Hz 振幅抖 = 声带绷紧的「惨」）
      const env = Math.min(1, t / 0.035) * Math.exp(-t / envTau);
      const strain = 1 + 0.22 * Math.sin(TWO_PI * 27 * t);
      data[i] = Math.tanh(voiced * env * strain * 1.4) / Math.tanh(1.4);
    }

    // 归一化到 0.9：响度和枪声同一量级，出口增益负责压过它
    let peak = 0;
    for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(data[i]));
    const norm = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < n; i += 1) data[i] *= norm;
    return buffer;
  }

  /**
   * 开一枪：把预烘焙的缓冲按「每发 ±4.5% 变速失谐」推出去。
   *
   * 节流是「整声」级别的（30ms），自动武器最快 88ms 一发（M4 685 RPM），撞不到它。
   * **自己的枪单独计时**，否则会被别人的枪声连累（「点了左键没响」最难查）。
   */
  shot(id: GunSoundId, options: SpatialOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = this.now;
    if (options.own) {
      if (t - this.lastOwnShotAt < 0.03) return;
      this.lastOwnShotAt = t;
    } else {
      if (t - this.lastShotAt < 0.03) return;
      this.lastShotAt = t;
    }

    const recipe = GUN_RECIPE[id];

    // 并发上限：超出的**别人的**枪声直接不播（见 `MAX_GUN_VOICES`）。
    // 自己的枪永远放。
    this.pruneVoices(t);
    if (!options.own && this.voices.length >= MAX_GUN_VOICES) return;

    // 首次开火才烘焙（<3ms，玩家感知不到）；之后每发只是 1 个源节点
    let buffer = this.gunBuffers.get(id);
    if (!buffer) {
      buffer = this.bakeGun(recipe);
      this.gunBuffers.set(id, buffer);
    }

    const out = this.output({ ...options, bus: 'gun', gain: (options.gain ?? 1) * recipe.gain });
    if (!out) return;
    this.voices.push({ at: t, life: recipe.life });

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // 每发 ±4.5% 变速失谐：真枪每发的膛压都有细微差异。**整段变速**，频谱
    // 包络的形状不变 —— 变的是「这一发比上一发高一点点」，不是换了一把枪
    source.playbackRate.value = 1 + rand(-0.045, 0.045);
    source.connect(out);
    source.start(t);
  }

  /** 把已经响完的枪声出列（`at + life` 过了就算完）。数组最多 6 个元素，很便宜。 */
  private pruneVoices(now: number): void {
    if (this.voices.length === 0) return;
    this.voices = this.voices.filter((v) => v.at + v.life > now);
  }

  /**
   * 空枪「咔」一声。
   *
   * ⚠️ 备弹改成无限之后，玩家再也打不出空枪（弹匣空就自动换弹），
   * 所以**目前没有任何调用点**。留着是因为它是这套合成音里唯一一个
   * 「机械空转」的音色，将来做「换弹被打断」之类的状态还会用到。
   */
  dryFire(): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ gain: 0.4 });
    if (!out) return;
    this.burst(t, 0.03, out, 'highpass', 2600, 2600, 0.25, 1.2);
    this.tone(t, 'square', 320, 180, 0.03, 0.06, out);
  }

  /* ============================================================
     机械 / 移动
     ============================================================ */

  reload(stage: 'out' | 'in' | 'bolt'): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ gain: 0.5 });
    if (!out) return;
    if (stage === 'out') {
      this.burst(t, 0.05, out, 'bandpass', 1800, 900, 0.3, 1.4);
      this.tone(t + 0.04, 'square', 220, 140, 0.05, 0.05, out);
    } else if (stage === 'in') {
      this.burst(t, 0.04, out, 'bandpass', 2400, 1200, 0.35, 1.6);
      this.burst(t + 0.09, 0.05, out, 'bandpass', 1400, 700, 0.28, 1.2);
      this.tone(t + 0.09, 'square', 300, 160, 0.05, 0.06, out);
    } else {
      this.burst(t, 0.06, out, 'bandpass', 3000, 1400, 0.3, 2);
      this.burst(t + 0.1, 0.05, out, 'bandpass', 2000, 1000, 0.26, 1.6);
    }
  }

  /**
   * AWM 拉栓，两段各响一次（时间点由 `player.ts` 的 `advanceBolt` 给）：
   *
   *   open  —— 提栓 + 后拉：金属摩擦往上滑一截，收尾「咔嗒」一声到位
   *   close —— 推回 + 压倒拉机柄：先一记短促的推入，再补一记更高的「咔」
   *
   * 不复用 `reload('bolt')`：那个是换弹动作里顺手带过的一下，两声只隔 0.1s；
   * 拉栓是整整 1.4s 的主角动作，两声之间隔着完整的推拉行程，必须分开给。
   */
  boltAction(stage: 'open' | 'close'): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ gain: 0.55 });
    if (!out) return;
    if (stage === 'open') {
      this.burst(t, 0.09, out, 'bandpass', 2600, 1100, 0.3, 2.2);
      this.tone(t + 0.02, 'square', 420, 240, 0.05, 0.07, out);
      this.burst(t + 0.09, 0.06, out, 'bandpass', 1800, 800, 0.26, 1.6);
    } else {
      this.burst(t, 0.05, out, 'bandpass', 2200, 1000, 0.28, 1.8);
      this.burst(t + 0.08, 0.04, out, 'highpass', 3400, 3400, 0.3, 1.4);
      this.tone(t + 0.08, 'square', 360, 200, 0.04, 0.08, out);
    }
  }

  /**
   * 一步脚步声：把预烘焙的变体随机挑一个、±8% 变速失谐后推出去。
   *
   * 第三版（2026-11-12「真实的脚步声」）：旧实时版是「一段带通噪声 + 一个正弦」，
   * 听感是电子游戏里那种没有重量的「嗒」。真实脚步是三层结构 + 表面余响
   * （见 `bakeStep`），和枪声同一个结论 —— 只能逐样本烘焙，实时节点拼不出。
   *
   * `options` 带坐标时按距离衰减 + 声像空间化（别人的脚步 —— 听声辨位就靠它）；
   * 自己的脚步传 `own: true` 不带坐标，也不节流。别人的脚步做一道 45ms 的轻节流：
   * 五个人机同时走，不节流一秒能叠出二三十个源节点，糊成一片沙沙声。
   */
  step(surface: Surface = 'metal', options: SpatialOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = this.now;
    if (!options.own) {
      if (t - this.lastStepAt < 0.045) return;
      this.lastStepAt = t;
    }

    // 第一步才烘焙（5 个变体 <2ms，玩家感知不到）；之后每步只是 1 个源节点
    let variants = this.stepBuffers.get(surface);
    if (!variants) {
      variants = [];
      for (let i = 0; i < STEP_VARIANTS; i += 1) variants.push(this.bakeStep(surface));
      this.stepBuffers.set(surface, variants);
    }

    const out = this.output({ ...options, bus: 'world', gain: (options.gain ?? 1) * STEP_BASE });
    if (!out) return;

    const source = ctx.createBufferSource();
    source.buffer = variants[Math.floor(Math.random() * variants.length)]!;
    source.playbackRate.value = 1 + rand(-0.08, 0.08);
    source.connect(out);
    source.start(t);
  }

  /**
   * 把一步脚步声逐样本烘焙成 AudioBuffer（同 `bakeGun` 的思路）。
   *
   * 真实脚步 = **三层结构 + 表面响应**，缺任何一层都是「游戏脚步」：
   *
   *   contact  全带噪声硬起（鞋底拍上钢板的「啪」，τ≈5ms，零淡入 —— 同枪声纪律）
   *   thump    扫频正弦 ~100→52Hz（身体的重量踩进钢板；30ms 滑完，同 bakeGun
   *            的 boom 纪律 —— 滑太快出「啾」，太慢听得出音高）
   *   scuff    低通噪声、4ms 起音 + τ 30~50ms 衰减（鞋底蹭钢板的「沙」——
   *            远处有人走过来时最先听到的一层就是它，音色识别全靠这层）
   *   ring     金属甲板独有：钢板受击后的阻尼振荡（三条**非泛音列**分音，
   *            τ 40~100ms，压得很低）—— 军舰甲板和水泥地的区别全在这一层；
   *            木箱换成一只 400→180Hz 的短促空腔「咚」
   *
   * 每个变体随机触地强度（0.75~1.0）、重量音高（±12%）、摩擦长度、余响失谐 ——
   * 加上播放时的变速失谐，脚步和脚步之间不会是同一个声音。
   */
  private bakeStep(surface: Surface): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const TWO_PI = Math.PI * 2;
    const metal = surface === 'metal';
    const life = metal ? 0.34 : 0.26;
    const n = Math.ceil(sr * life);
    const buffer = ctx.createBuffer(1, n, sr);
    const data = buffer.getChannelData(0);

    const contactPeak = rand(0.75, 1.0);
    const thumpF0 = rand(88, 112);
    const scuffTau = rand(0.03, 0.05);
    const ringDetune = rand(0.94, 1.06);

    // 鞋底摩擦的低通截止：钢板上更亮，木箱上发闷
    const scuffA = 1 - Math.exp((-TWO_PI * (metal ? 1100 : 650)) / sr);
    let scuffLp = 0;
    let thumpPhase = 0;
    let knockPhase = 0;

    // 甲板余响：非泛音列（整数倍泛音叠出来是音叉，不是钢板）
    const RING = metal
      ? [
          { f: 168 * ringDetune, tau: 0.1, peak: 0.09 },
          { f: 254 * ringDetune, tau: 0.062, peak: 0.055 },
          { f: 431 * ringDetune, tau: 0.038, peak: 0.03 },
        ]
      : [];
    const ringPhase = new Float64Array(RING.length);
    const ringOmega = RING.map((r) => (TWO_PI * r.f) / sr);

    for (let i = 0; i < n; i += 1) {
      const t = i / sr;
      const noise = Math.random() * 2 - 1;

      // ① 触地瞬态：全带、硬起
      const contact = noise * Math.exp(-t / 0.005) * contactPeak;

      // ② 重量：扫频正弦，30ms 内滑到 52Hz
      const thumpF = 52 + (thumpF0 - 52) * Math.exp(-t / 0.012);
      thumpPhase += (TWO_PI * thumpF) / sr;
      const thump = Math.sin(thumpPhase) * Math.exp(-t / 0.055) * 0.42;

      // ③ 鞋底摩擦：4ms 起音 —— 脚步不是零 attack，「沙」要有蹭上去的过程
      scuffLp += scuffA * (noise - scuffLp);
      const scuff = scuffLp * Math.min(1, t / 0.004) * Math.exp(-t / scuffTau) * 0.3;

      let v = contact + thump + scuff;

      for (let r = 0; r < RING.length; r += 1) {
        ringPhase[r] += ringOmega[r];
        v += Math.sin(ringPhase[r]) * Math.exp(-t / RING[r].tau) * RING[r].peak;
      }
      if (!metal) {
        // 木箱空腔：400→180Hz 的短「咚」（中空板材受击的腔体共鸣）
        const knockF = 180 + (400 - 180) * Math.exp(-t / 0.008);
        knockPhase += (TWO_PI * knockF) / sr;
        v += Math.sin(knockPhase) * Math.exp(-t / 0.032) * 0.16;
      }

      data[i] = v;
    }

    // 归一化到 0.9：与枪声同一量纲，响度差全交给出口增益
    let peak = 0;
    for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(data[i]));
    const norm = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < n; i += 1) data[i] *= norm;
    return buffer;
  }

  land(): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ gain: 0.5 });
    if (!out) return;
    this.burst(t, 0.1, out, 'lowpass', 700, 200, 0.4, 0.8);
    this.tone(t, 'sine', 120, 60, 0.09, 0.14, out);
  }

  /* ============================================================
     命中 / 撞击
     ============================================================ */

  /** 自己打中人的确认音。爆头音更高更亮。 */
  hitMark(head: boolean): void {
    if (!this.ctx) return;
    const t = this.now;
    // 引擎已经把同一帧的多颗弹丸合并成一次了（见 `engine.flushFeedback`），
    // 这里再兜一道 40ms：霰弹贴脸 8 颗全中也不会有 8 声「叮」叠成一片
    if (t - this.lastHitMarkAt < 0.04) return;
    this.lastHitMarkAt = t;

    const out = this.output({ bus: 'feedback', gain: 0.5 });
    if (!out) return;
    // ⚠️ 命中**不压低环境**：自动武器一秒能命中十次，每次压一下会让世界层变成
    // 10Hz 的颤音（听起来像压缩器在抽气）。命中靠的是「高频短音 + 反馈总线」
    // 本身穿出来，压低留给击杀那一下（低频、稀有、值得让开）
    if (head) {
      this.tone(t, 'sine', 2100, 1500, 0.05, 0.22, out);
      this.tone(t + 0.02, 'sine', 2900, 2400, 0.06, 0.16, out);
    } else {
      this.tone(t, 'sine', 1250, 900, 0.045, 0.16, out);
    }
  }

  /**
   * 击杀确认音。**和击杀图标、hitmarker 的红色严格对应**。
   *
   * 现行：**真实惨叫采样**（CC0，见 `loadKillSamples`）—— 合成人声六版迭代
   * 全被否（滴滴/破锣/短叮/低频重击/像吹口哨的 formant），2026-11-12 用户
   * 拍板「去网上搜现成的」。采样没加载完时这一杀不响（宁缺毋滥）；加载失败
   * 才回退 `bakeKill` 合成版。
   *
   * 出口增益 1.05 × feedback 总线 1.15：采样已归一化 0.9（`prepareKillSample`），
   * 实响高于致命那一枪自己的枪声，且 `duckWorld` 把底噪让开 0.18 秒。
   *
   * 每次播放 ±4% 变速失谐（同 `shot()` 每发失谐的路子）—— 同一段惨叫不会
   * 连着两次一模一样。`streak` 升调收敛到每杀半个音（第 5 杀封顶）：人声
   * 抬调太狠会变花栗鼠。
   */
  killConfirm(head: boolean, streak = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;

    if (this.killSampleState === 'loading') return; // 宁缺毋滥，等采样到位
    let buffer = this.killBuffers.get(head);
    if (!buffer) {
      if (this.killSampleState !== 'failed') return;
      // 采样加载失败：烘焙合成版兜底（每版只算一次，<2ms）
      buffer = this.bakeKill(head);
      this.killBuffers.set(head, buffer);
    }

    this.duckWorld();
    const out = this.output({ bus: 'feedback', gain: 1.05 });
    if (!out) return;

    const steps = Math.min(4, Math.max(0, streak - 1));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (1 + rand(-0.04, 0.04)) * Math.pow(2, steps / 24);
    source.connect(out);
    source.start(this.now);
  }

  /**
   * 弹着声。
   *
   * `own` 为真时**不节流**（玩家自己打中/被打，这一声必须落地）；否则走 30ms
   * 节流 —— 霰弹一枪 8 颗弹丸打墙就是 8 次回调，不节流一秒能叠出上百个噪声源，
   * 听感是糊成一片白噪，还平白吃掉一条 CPU 线程。
   *
   * `ground` 表示打在甲板 / 地面上：换成低频「噗」而不是脆的金属「叮」——
   * 方向感和材质感都要对得上。
   */
  impact(
    x: number,
    y: number,
    z: number,
    surface: 'flesh' | 'metal' | 'wood',
    opts: { own?: boolean; ground?: boolean } = {},
  ): void {
    if (!this.ctx) return;
    const t = this.now;
    if (!opts.own) {
      if (t - this.lastImpactAt < 0.03) return;
      this.lastImpactAt = t;
    }

    const out = this.output({ x, y, z, gain: 0.32 });
    if (!out) return;
    if (surface === 'flesh') {
      this.burst(t, 0.06, out, 'lowpass', 700, 260, 0.45, 0.9);
    } else if (opts.ground) {
      // 地面：闷、短、没有高频尾巴。和墙面那一声的区别比材质之间的区别更大
      this.burst(t, 0.055, out, 'lowpass', 900, 300, 0.34, 0.7);
    } else if (surface === 'wood') {
      this.burst(t, 0.05, out, 'bandpass', 1100, 500, 0.4, 1.2);
    } else {
      this.burst(t, 0.045, out, 'highpass', 3000, 1800, 0.3, 1);
      this.tone(t, 'sine', 2600, 1600, 0.03, 0.05, out);
    }
  }

  ricochet(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const t = this.now;
    // 跳弹是「锦上添花」的一层，最容易被连发叠成噪音，节流得比弹着更狠
    if (t - this.lastRicochetAt < 0.08) return;
    this.lastRicochetAt = t;

    const out = this.output({ x, y, z, gain: 0.2 });
    if (!out) return;
    this.tone(t, 'sine', 3400, 900, 0.16, 0.1, out);
  }

  /**
   * 挥空的**破空声**（whoosh）。
   *
   * 只有刀划过空气才有这个声音 —— 打中了会被 `knifeHit` 盖过去，所以
   * 调用方是「挥出去的瞬间」无条件播一次，而不是「确认挥空才播」。
   */
  knife(heavy: boolean): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ gain: heavy ? 0.55 : 0.4 });
    if (!out) return;
    this.burst(t, heavy ? 0.16 : 0.1, out, 'bandpass', 2600, 700, 0.35, 1.6);
    if (heavy) this.tone(t + 0.02, 'sine', 160, 70, 0.12, 0.12, out);
  }

  /**
   * 刀砍进人身上。
   *
   * 和 `impact(..., 'flesh')` 的区别：那个是子弹的「噗」，这个是**刀**的。
   * 声音是**两层叠出来的**，对应需求里「金属 / 肉体区分」：
   *
   *   低频钝击  —— 刀砍进肉体
   *   窄带脆响  —— 刀刃刮过硬物（护甲、装具、骨头）
   *
   * `armored` 为真时把脆响那一层抬起来、钝击压下去，听感就是「砍在钢板上」。
   * `kill` 再加一记更长的低频尾巴 —— 「这一刀把人砍死了」必须在耳朵上和
   * 普通命中分开。
   */
  knifeHit(kill: boolean, armored: boolean): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ bus: 'feedback', gain: kill ? 0.85 : 0.62 });
    if (!out) return;
    this.duckWorld();

    // 肉体那一层
    this.burst(t, 0.09, out, 'lowpass', 820, 220, armored ? 0.32 : 0.55, 0.8);
    this.tone(t, 'sine', kill ? 120 : 165, 44, kill ? 0.26 : 0.16, kill ? 0.34 : 0.2, out);
    // 金属那一层
    this.burst(t + 0.008, 0.055, out, 'bandpass', armored ? 4200 : 3200, armored ? 2200 : 1400, armored ? 0.4 : 0.18, 2.4);

    if (kill) this.burst(t + 0.04, 0.12, out, 'lowpass', 460, 120, 0.35, 0.7);
  }

  /** 转刀：低频的「呼」一声，比挥空的破空声闷，收尾带一下刀柄落进掌心。 */
  knifeSpin(): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ gain: 0.3 });
    if (!out) return;
    this.burst(t, 0.26, out, 'bandpass', 700, 1500, 0.22, 1.1);
    this.burst(t + 0.22, 0.04, out, 'highpass', 3200, 3200, 0.12, 1.6);
  }

  /**
   * 切枪。`stage` 是**收起**和**掏出**两段，各响一次 —— 中间隔着模型替换，
   * 所以这两声在听感上必须是两件事。
   *
   * 掏出那一声的结尾固定补一记「咔」：它是「现在可以开枪了」的听觉信号，
   * 所有武器共用，玩家不用记每种枪什么时候落位。
   */
  weaponSwitch(stage: 'out' | 'in', sound: SwitchSound): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ gain: 0.5 });
    if (!out) return;

    if (stage === 'out') {
      // 收起：一声闷响，像把枪往背后一甩
      this.burst(t, 0.07, out, 'bandpass', 1400, 600, 0.26, 1.3);
      this.tone(t, 'sine', 200, 120, 0.06, 0.06, out);
      return;
    }

    // 掏出：先按武器给一段「过程音」，最后统一补落位
    switch (sound) {
      case 'rifle':
        this.burst(t, 0.1, out, 'bandpass', 2200, 900, 0.24, 1.5);
        this.burst(t + 0.07, 0.05, out, 'bandpass', 3000, 1500, 0.2, 2);
        break;
      case 'sniper':
        // 金属摩擦：长、窄带、往上滑 —— AWM 是这七把里唯一「抬起来」的
        this.burst(t, 0.24, out, 'bandpass', 900, 2600, 0.22, 3.5);
        break;
      case 'shotgun':
        // 护木在滑轨上走一趟
        this.burst(t, 0.16, out, 'bandpass', 1200, 1800, 0.26, 2.4);
        this.burst(t + 0.13, 0.06, out, 'bandpass', 2400, 1100, 0.22, 1.6);
        break;
      case 'pistol':
        this.burst(t, 0.05, out, 'highpass', 2800, 2800, 0.2, 1.2);
        break;
      case 'knife':
        this.burst(t, 0.09, out, 'bandpass', 3200, 1600, 0.16, 2.2);
        break;
      default:
        // 手雷：布料 / 金属件摩擦，最轻
        this.burst(t, 0.08, out, 'lowpass', 900, 400, 0.2, 0.9);
        break;
    }

    const land = t + 0.12;
    this.burst(land, 0.035, out, 'highpass', 3600, 3600, 0.3, 1.4);
    this.tone(land, 'square', 380, 210, 0.035, 0.07, out);
  }

  explosion(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ x, y, z, gain: 1 });
    if (!out) return;
    this.burst(t, 0.85, out, 'lowpass', 2400, 130, 0.95, 0.8);
    this.burst(t, 0.18, out, 'highpass', 2000, 700, 0.45, 0.6);
    this.tone(t, 'sine', 130, 32, 0.55, 0.85, out);
    this.tone(t + 0.05, 'triangle', 70, 28, 0.7, 0.55, out);
  }

  death(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ x, y, z, gain: 0.45 });
    if (!out) return;
    this.tone(t, 'sawtooth', 260, 90, 0.35, 0.14, out);
  }

  /**
   * 致命一击。比 `hitMark` 低沉一个八度、尾巴长三倍。
   *
   * 为什么要单独一个：普通命中和「这一枪把我打死了」在耳朵上必须是两件事。
   * 前者是「叮」，后者应该是胸口被砸了一下。
   */
  fatalHit(): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ bus: 'feedback', gain: 0.75 });
    if (!out) return;
    this.duckWorld();
    this.tone(t, 'sine', 180, 46, 0.34, 0.34, out);
    this.tone(t + 0.01, 'triangle', 96, 38, 0.5, 0.22, out);
    this.burst(t, 0.16, out, 'lowpass', 520, 140, 0.4, 0.7);
  }

  /**
   * 心跳。`intensity` 0..1，血量越低越重。
   *
   * 两声（lub-dub）而不是一声：单声听着像「滴答」，两声才像心跳。
   */
  heartbeat(intensity: number): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ bus: 'feedback', gain: 0.45 + intensity * 0.55 });
    if (!out) return;
    const beat = (at: number, peak: number) => {
      this.tone(at, 'sine', 64, 36, 0.14, peak, out);
      this.burst(at, 0.1, out, 'lowpass', 190, 70, peak * 0.55, 0.9);
    };
    beat(t, 0.34);
    beat(t + 0.17, 0.22);
  }

  /** 装备落地。比枪声闷、比脚步脆 —— 是「钢件砸在甲板上」的那种声音。 */
  gearDrop(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ x, y, z, gain: 0.5 });
    if (!out) return;
    this.burst(t, 0.09, out, 'bandpass', 2400, 700, 0.4, 1.6);
    this.tone(t, 'triangle', 300, 120, 0.1, 0.12, out);
    this.burst(t + 0.06, 0.06, out, 'bandpass', 1500, 600, 0.2, 1.4);
  }

  uiClick(): void {
    if (!this.ctx) return;
    const t = this.now;
    const out = this.output({ gain: 0.32 });
    if (!out) return;
    this.tone(t, 'square', 900, 700, 0.03, 0.08, out);
  }

  /* ============================================================
     环境音
     ============================================================ */

  /** 船体低频嗡鸣。只建一次，之后不再动。 */
  startAmbience(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.ambience) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);

    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 52;
    const high = ctx.createOscillator();
    high.type = 'sine';
    high.frequency.value = 78.5;

    // 0.12Hz 的缓慢起伏，听感上是「船在水上」而不是「冰箱在响」
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    low.connect(gain);
    high.connect(gain);
    low.start();
    high.start();
    lfo.start();
    gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 3);

    this.ambience = { gain };
  }

  dispose(): void {
    if (!this.ctx) return;
    void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.gunBus = null;
    this.worldBus = null;
    this.feedbackBus = null;
    this.gunLimiter = null;
    this.reverbSend = null;
    this.noise = null;
    this.ambience = null;
    this.voices = [];
    this.gunBuffers.clear();
    this.killBuffers.clear();
    this.killSampleState = 'loading';
    this.stepBuffers.clear();
  }
}

/** 全场唯一的音效实例。引擎和界面共用，音量由设置页统一调。 */
export const gameAudio = new GameAudio();

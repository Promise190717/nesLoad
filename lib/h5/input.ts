/**
 * 输入层 —— 把键盘、鼠标、触屏统一成「引擎能直接读的抽象指令」。
 *
 * 分两类：
 *
 *   **持续量**（每帧读）：前后左右、蹲、走、开火、开镜。
 *   **离散事件**（一次性）：跳、换弹、换枪、扔雷、开关换枪菜单。
 *
 * 离散事件用队列而不是布尔标志：`firePressed` 那种「按下就置 true、用完手动
 * 清掉」的写法，一旦某一帧忘了清就会出现「点一下打了两枪」或者「再也没反应」。
 * 这里 `flush()` 一次性取走并清空，谁取谁负责。
 *
 * 触屏不单独写一套逻辑：HUD 上的按钮直接调 `setVirtual(...)`，走的还是同一份
 * 状态，所以「按住触屏开火」和「按住鼠标左键」在引擎看来完全一样。
 *
 * ## 指针锁定是必须的
 *
 * FPS 要无限转视角，鼠标一旦顶到屏幕边缘就转不动了。`requestPointerLock()` 之后
 * `movementX/Y` 是无限累加的增量。代价是浏览器要求「用户手势」才能请求锁定，
 * 所以这一步绑在「点开始游戏」上，而不是自动执行。
 *
 * Esc 会由浏览器**强制**退出锁定（规范行为，拦不住），所以「离开锁定」就等价于
 * 「暂停」—— 这一点由引擎接 `onLockChange` 处理。
 */

export type InputAction =
  | 'jump'
  | 'reload'
  | 'buy'
  | 'quickGrenade'
  | 'slotPrimary'
  | 'slotSecondary'
  | 'slotMelee'
  | 'slotThrowable'
  | 'cycleNext'
  | 'cyclePrev'
  /**
   * Q —— 切回**上一把**武器（CF 标配）。
   *
   * 和 `slotPrimary` 的区别很关键：Q 不认槽位，它只是把「刚才手里那把」换回来，
   * 所以「刀 → 步枪 → Q」回到刀、「步枪 → 手枪 → Q」回到步枪，来回按 Q 就
   * 在两把之间反复横跳。上一把由 `player.ts` 的 `previousWeapon` 记着。
   */
  | 'quickSwitch'
  | 'escape';

/** 一帧的输入快照。 */
export interface InputFrame {
  /** 前后，-1..1（正 = 前进） */
  forward: number;
  /** 左右，-1..1（正 = 右移） */
  right: number;
  crouch: boolean;
  /** 走路（静步，速度更慢但没脚步声） */
  walk: boolean;
  fire: boolean;
  /** 这一帧刚按下开火（半自动、近战、捏雷用） */
  firePressed: boolean;
  /** 开镜 / 刀的右键是重击 */
  aim: boolean;
  /** 这一帧刚按下右键 */
  aimPressed: boolean;
  /** 计分板（Tab 按住） */
  scoreboard: boolean;
  actions: ReadonlySet<InputAction>;
  /** 这一帧的视角增量（弧度，已经乘过灵敏度） */
  lookYaw: number;
  lookPitch: number;
}

/** 鼠标灵敏度基准。乘上设置里的 `sensitivity` 之后才是最终值。 */
const BASE_SENSITIVITY = 0.0022;

/**
 * 触屏转视角的额外倍率。
 *
 * 鼠标的 `movementX` 是「鼠标垫上的位移」，一英寸能推上千像素；手指在玻璃上
 * 一次最多拖 300px 左右。用同一套系数的话，手机上转 90° 要划两次全屏，根本没法瞄。
 */
const TOUCH_LOOK_GAIN = 2.6;

export class InputController {
  private readonly canvas: HTMLCanvasElement;
  /**
   * 锁定状态回调。
   *
   * 第二个参数 `lostFocus` 只在**解锁**时有意义：`true` 表示这次解锁不是玩家按
   * Esc 主动放锁，而是标签页隐藏 / 窗口失焦被浏览器顺手收回的。引擎据此决定
   * 要不要弹菜单 —— 切标签页和按 Esc 都走同一套 pointerlockchange，分不开就会
   * 「切个 tab 回来菜单开着」。
   */
  private readonly onLockChange: (locked: boolean, lostFocus: boolean) => void;

  /** 关掉之后所有输入都被丢弃（菜单、暂停、结算期间）。 */
  enabled = false;

  private readonly keys = new Set<string>();
  private readonly actions = new Set<InputAction>();

  private mouseFire = false;
  private mouseAim = false;
  /** 上一帧的开火/开镜状态，用来算「刚按下」的边沿 */
  private previousFire = false;
  private previousAim = false;

  private lookX = 0;
  private lookY = 0;

  /** 触屏虚拟摇杆的轴（-1..1） */
  private virtualX = 0;
  private virtualY = 0;
  private virtualCrouch = false;

  private locked = false;

  /**
   * 最近一次失焦（`blur`）的时间戳。
   *
   * 用途只有一个：给 `onPointerLockChange` 判断「这次解锁是不是被失焦带走的」。
   * 事件顺序在浏览器之间并不严格一致，`document.hasFocus()` 又可能在 blur 处理
   * 完之前还返回 true，所以再留一个时间窗兜底 —— 只要刚失焦过，就一律不认成
   * 「玩家按了 Esc」。
   */
  private lastFocusLostAt = Number.NEGATIVE_INFINITY;

  /** 鼠标灵敏度倍率，由引擎在设置变化时写入。 */
  sensitivity = 1;

  constructor(canvas: HTMLCanvasElement, onLockChange: (locked: boolean, lostFocus: boolean) => void) {
    this.canvas = canvas;
    this.onLockChange = onLockChange;
    this.bind();
  }

  /* ------------------------------------------------------------
     指针锁定
     ------------------------------------------------------------ */

  get isLocked(): boolean {
    return this.locked;
  }

  requestLock(): void {
    // `requestPointerLock` 在新版浏览器里返回 Promise，被非用户手势调用时会 reject。
    // 不 catch 的话控制台每次暂停都会多一条 unhandled rejection，纯噪音。
    const result = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /* ------------------------------------------------------------
     触屏接口（HUD 调用）
     ------------------------------------------------------------ */

  /** 触屏按钮 → 离散动作。 */
  setVirtual(action: InputAction, down: boolean): void {
    if (!this.enabled || !down) return;
    this.actions.add(action);
  }

  setFire(down: boolean): void {
    if (!this.enabled && down) return;
    this.mouseFire = down;
  }

  setAim(down: boolean): void {
    if (!this.enabled && down) return;
    this.mouseAim = down;
  }

  /** 触屏蹲下是「按住」而不是「点一下」，所以走持续量。 */
  setCrouch(down: boolean): void {
    if (!this.enabled && down) return;
    this.virtualCrouch = down;
  }

  /** 虚拟摇杆。`x` 右正、`y` 前正。 */
  setMoveAxis(x: number, y: number): void {
    this.virtualX = Math.max(-1, Math.min(1, x));
    this.virtualY = Math.max(-1, Math.min(1, y));
  }

  /** 触屏拖拽转视角（像素）。 */
  addLookDelta(dx: number, dy: number): void {
    if (!this.enabled) return;
    this.lookX += dx * TOUCH_LOOK_GAIN;
    this.lookY += dy * TOUCH_LOOK_GAIN;
  }

  /* ------------------------------------------------------------
     取帧
     ------------------------------------------------------------ */

  /** 取走这一帧的输入并清空离散事件。 */
  flush(): InputFrame {
    const actions = new Set(this.actions);
    this.actions.clear();

    const firePressed = this.mouseFire && !this.previousFire;
    const aimPressed = this.mouseAim && !this.previousAim;
    this.previousFire = this.mouseFire;
    this.previousAim = this.mouseAim;

    // 兜底下限：设置层已经夹过一次（`sanitizeSettings`），但 `sensitivity = 0`
    // 的表现是「鼠标完全不能转、看起来像引擎卡死」，这种状态绝不能出现
    const scale = BASE_SENSITIVITY * Math.max(0.2, this.sensitivity);
    const frame: InputFrame = {
      forward: 0,
      right: 0,
      crouch: false,
      walk: false,
      fire: this.mouseFire,
      firePressed,
      aim: this.mouseAim,
      aimPressed,
      scoreboard: false,
      actions,
      // yaw 正 = 左转：鼠标右移（lookX > 0）应该右转，所以取负
      lookYaw: -this.lookX * scale,
      lookPitch: -this.lookY * scale,
    };
    this.lookX = 0;
    this.lookY = 0;

    if (!this.enabled) return frame;

    const keyboardForward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const keyboardRight = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);

    // 键盘和摇杆取「绝对值大的那个」，不是相加 —— 相加会让两者同时推时速度翻倍
    frame.forward = Math.abs(this.virtualY) > Math.abs(keyboardForward) ? this.virtualY : keyboardForward;
    frame.right = Math.abs(this.virtualX) > Math.abs(keyboardRight) ? this.virtualX : keyboardRight;

    frame.crouch =
      this.virtualCrouch || this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('KeyC');
    frame.walk = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    frame.scoreboard = this.keys.has('Tab');

    return frame;
  }

  /* ------------------------------------------------------------
     事件绑定
     ------------------------------------------------------------ */

  private readonly onKeyDown = (event: KeyboardEvent) => {
    // Tab 会切焦点、Space 会滚页面 —— 全部拦掉，不管当前是否在游戏中
    if (event.code === 'Tab' || event.code === 'Space' || event.code.startsWith('Arrow')) {
      event.preventDefault();
    }

    if (!this.enabled) return;

    // 蹲下键是 Ctrl：按住 Ctrl 再按 D/S/R（右移/后退/换弹）会被浏览器抢成
    // 「收藏 / 保存 / 刷新」。游戏中对带修饰键的按键一律 preventDefault ——
    // Ctrl+D/S/R/P/A 都能拦掉；Ctrl+W/T/N 是浏览器保留键拦不住，只能靠玩家少误触。
    if (event.ctrlKey || event.metaKey || event.altKey) event.preventDefault();

    this.keys.add(event.code);

    // 长按的重复事件不该重复触发「换弹」「扔雷」
    if (event.repeat) return;

    switch (event.code) {
      case 'Space':
        this.actions.add('jump');
        break;
      case 'KeyR':
        this.actions.add('reload');
        break;
      case 'KeyB':
        this.actions.add('buy');
        break;
      case 'KeyG':
        this.actions.add('quickGrenade');
        break;
      case 'Digit1':
        this.actions.add('slotPrimary');
        break;
      case 'Digit2':
        this.actions.add('slotSecondary');
        break;
      case 'Digit3':
        this.actions.add('slotMelee');
        break;
      case 'Digit4':
        this.actions.add('slotThrowable');
        break;
      case 'KeyQ':
        // 切回上一把（不是「切到主武器」—— 那是 Digit1）
        this.actions.add('quickSwitch');
        break;
      case 'Escape':
        this.actions.add('escape');
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readonly onMouseDown = (event: MouseEvent) => {
    if (!this.enabled) return;
    // 没锁定的时候点画面 = 「重新要锁定」。`requestPointerLock` 必须由用户手势
    // 触发，这是唯一一个可靠的时机 —— 界面上的「点击画面继续」提示就靠它兑现。
    if (!this.locked) {
      this.requestLock();
      return;
    }
    if (event.button === 0) this.mouseFire = true;
    else if (event.button === 2) this.mouseAim = true;
  };

  private readonly onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) this.mouseFire = false;
    else if (event.button === 2) this.mouseAim = false;
  };

  private readonly onMouseMove = (event: MouseEvent) => {
    // 只在锁定状态下累加：没锁定时鼠标是自由的，不该转视角
    if (!this.enabled || !this.locked) return;
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (!this.enabled) return;
    event.preventDefault();
    this.actions.add(event.deltaY > 0 ? 'cycleNext' : 'cyclePrev');
  };

  private readonly onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private readonly onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.canvas;
    // 解锁有三条来路：玩家按 Esc（浏览器强制放锁，规范如此）、本模块主动
    // `exitLock()`（换枪菜单要鼠标）、以及**标签页隐藏 / 窗口失焦时浏览器顺手
    // 收回**。前两条是玩家意图，第三条不是 —— 只有它不该被当成「开菜单」。
    // 判据三选一：页面已隐藏、文档已失焦、刚刚失焦过（时间窗见 lastFocusLostAt）。
    const lostFocus =
      !locked &&
      (document.hidden ||
        !document.hasFocus() ||
        performance.now() - this.lastFocusLostAt < 500);

    this.locked = locked;
    if (!locked) {
      // 放掉锁 = 松开所有键，否则「按着 W 按 Esc」回来后人还在往前走
      this.keys.clear();
      this.mouseFire = false;
      this.mouseAim = false;
      this.virtualX = 0;
      this.virtualY = 0;
      this.virtualCrouch = false;
    }
    this.onLockChange(locked, lostFocus);
  };

  private readonly onBlur = () => {
    // 切标签页 / 切窗口回来时按键状态会卡在「按下」，这里清一遍
    this.lastFocusLostAt = performance.now();
    this.keys.clear();
    this.mouseFire = false;
    this.mouseAim = false;
    this.virtualCrouch = false;
  };

  private bind(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}

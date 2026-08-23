/* ============================================================
 * nsos - state-machine.js (P0.2)
 * 全局系统状态机：系统生命周期的唯一权威。
 * 一切"现在是哪个界面 / 正在发生什么"都由此决定，
 * 禁止散落的布尔变量自行管理状态。
 *
 * 状态：
 *   poweroff 关机（初始）
 *   boot     启动中（bootloader -> 开机动画）
 *   locked   锁屏
 *   home     桌面
 *   app      应用内
 *   fastboot 工程模式（刷机/重启入口）
 *   recovery 恢复模式
 *
 * 合法转换表（transitions）：
 *   poweroff -> boot
 *   boot     -> locked | fastboot | recovery
 *   locked   -> home | poweroff          （长按电源键关机）
 *   home     -> app | locked | poweroff
 *   app      -> home | locked | poweroff
 *   fastboot -> poweroff | boot
 *   recovery -> poweroff | boot
 * ============================================================ */
(function (global) {
  'use strict';

  const STATES = [
    'poweroff', 'boot', 'locked',
    'home', 'app', 'fastboot', 'recovery'
  ];

  const TRANSITIONS = {
    poweroff: { boot: {} },
    boot:     { locked: {}, fastboot: {}, recovery: {} },
    locked:   { home: {}, poweroff: {}, boot: {} },
    home:     { app: {}, locked: {}, poweroff: {}, boot: {}, fastboot: {}, recovery: {} },
    app:      { home: {}, locked: {}, poweroff: {}, boot: {}, fastboot: {}, recovery: {} },
    fastboot: { recovery: {}, poweroff: {}, boot: {} },
    recovery: { fastboot: {}, poweroff: {}, boot: {} }
  };

  class StateMachine {
    /**
     * @param {EventBus} bus    全局事件总线
     * @param {string}   initial 初始状态（默认 poweroff）
     */
    constructor(bus, initial = 'poweroff') {
      this.bus = bus;
      this.states = new Set(STATES);
      this.transitions = TRANSITIONS;
      this.current = initial;
      this._enterHooks = new Map(); // state -> Set<fn({from,to,payload})>
      this._leaveHooks = new Map(); // state -> Set<fn({from,to,payload})>
    }

    /** 是否允许当前状态 -> to 的转换 */
    can(to) {
      return !!(this.transitions[this.current] && this.transitions[this.current][to]);
    }

    /** 执行状态转换 */
    transition(to, payload) {
      if (to === this.current) return;            // 幂等，重复触发无害
      if (!this.states.has(to)) {
        throw new Error(`[StateMachine] unknown target state: "${to}"`);
      }
      if (!this.can(to)) {
        throw new Error(`[StateMachine] illegal transition: ${this.current} -> ${to}`);
      }

      const from = this.current;
      this._run(this._leaveHooks, from, { from, to, payload });

      this.current = to;

      // 广播：全局变化 + 定向进入
      this.bus.emit('state:change', { from, to, payload });
      this.bus.emit(`state:enter:${to}`, { from, to, payload });

      this._run(this._enterHooks, to, { from, to, payload });
    }

    /** 注册进入某状态时的钩子 */
    onEnter(state, fn) {
      this._hook(this._enterHooks, state, fn);
    }

    /** 注册离开某状态时的钩子 */
    onLeave(state, fn) {
      this._hook(this._leaveHooks, state, fn);
    }

    _hook(map, state, fn) {
      if (!this.states.has(state)) throw new Error(`[StateMachine] unknown state: "${state}"`);
      if (!map.has(state)) map.set(state, new Set());
      map.get(state).add(fn);
    }

    _run(map, state, info) {
      const set = map.get(state);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(info); } catch (e) { console.error(`[StateMachine] hook error on "${state}":`, e); }
      }
    }
  }

  global.OSStateMachine = StateMachine;
  global.OS_STATES = STATES;
})(window);

/* ============================================================
 * nsos - main.js (P0.6)
 * 入口：装配内核 + LayerManager（依据状态机控制各 layer 显隐）
 * ============================================================ */
(function () {
  'use strict';

  const OS = window.OS;

  /* ---------- 装配状态机 ---------- */
  OS.state = new window.OSStateMachine(OS.bus, 'poweroff');
  OS.reg('state', OS.state); // 标记为 core（占用原名，实际引用同一对象）

  /* ---------- LayerManager：状态 -> layer 显隐 ---------- */
  const LayerManager = {
    layers: new Map(), // state -> HTMLElement

    /** 注册一个 layer 元素与其对应的状态 */
    register(el) {
      const states = (el.dataset.state || '').split(',').map(s => s.trim()).filter(Boolean);
      states.forEach(s => {
        if (!this.layers.has(s)) this.layers.set(s, new Set());
        this.layers.get(s).add(el);
      });
    },

    /** 根据状态机当前状态，显示对应 layer，隐藏其余 */
    apply(state) {
      for (const el of document.querySelectorAll('.os-layer')) {
        const shouldShow = this.layers.has(state) && this.layers.get(state).has(el);
        el.hidden = !shouldShow;
        el.classList.toggle('os-active', shouldShow);
      }
    },

    init() {
      document.querySelectorAll('.os-layer').forEach(el => this.register(el));
      OS.bus.on('state:change', ({ to }) => this.apply(to));
      // 初始应用
      this.apply(OS.state.current);
    }
  };
  OS.reg('layers', LayerManager);

  /* ---------- 系统启动入口 ---------- */
  OS.power = {
    /** 上电：进入 boot 流程（P1 在此接入 Logo / 开机动画） */
    on() {
      OS.state.transition('boot', { source: 'power-button' });
    },
    /** 关机 */
    off() {
      OS.state.transition('poweroff', { source: 'power-button' });
    }
  };
  OS.reg('power', OS.power);

  /* ---------- 调试钩子 ---------- */
  OS.debug = {
    state: () => OS.state.current,
    /** 跳转到任意状态（仅调试用） */
    jump: (s) => OS.state.transition(s, { source: 'debug' })
  };

  /* ---------- 桌面交互（P2.4） ---------- */
  // 点击图标 -> 进入应用层（P5 占位）
  OS.bus.on('launcher:launch', ({ app }) => {
    const nameEl = document.getElementById('app-name');
    if (nameEl) nameEl.textContent = app.name;
    OS.state.transition('app', { source: 'launcher', app: app.id });
  });

  // 双击状态栏 -> 锁定回锁屏（演示用，后续换手势）
  let lastTap = 0;
  const sbEl = document.getElementById('os-sysui');
  if (sbEl) {
    sbEl.addEventListener('pointerdown', () => {
      const now = Date.now();
      if (now - lastTap < 350) {
        lastTap = 0;
        OS.state.transition('locked', { source: 'statusbar-lock' });
      } else {
        lastTap = now;
      }
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    LayerManager.init();

    /* 状态栏显隐：仅锁屏/桌面/应用显示；开机、工程模式、关机均隐藏且不可用 */
    const sysui = document.getElementById('os-sysui');
    const SYS_UI_STATES = ['locked', 'home', 'app'];
    function applySysUi(state) {
      if (!sysui) return;
      const show = SYS_UI_STATES.includes(state);
      sysui.hidden = !show;
    }
    OS.bus.on('state:change', ({ to }) => applySysUi(to));
    applySysUi(OS.state.current);

    if (OS.input && OS.input.start) OS.input.start();   // 输入层
    if (OS.modes && OS.modes.init) OS.modes.init();     // Fastboot/Recovery
    if (OS.locked && OS.locked.init) OS.locked.init();  // 真锁屏
    if (OS.statusbar && OS.statusbar.init) OS.statusbar.init();  // 状态栏常驻
    if (OS.launcher && OS.launcher.init) OS.launcher.init();      // 桌面 Launcher
    if (OS.notify && OS.notify.init) OS.notify.init();            // 通知服务（P3）
    if (OS.controlcenter && OS.controlcenter.init) OS.controlcenter.init(); // 控制中心（P3）
    if (OS.gesture && OS.gesture.init) OS.gesture.init();         // 手势导航（P3）
    OS.bootReady();
    // 上电演示：默认直接进入 boot（后续可改为由开机键触发）
    OS.state.transition('boot', { source: 'auto-power-on' });
    console.info(`[nsos] kernel ready @ v${OS.version.major}.${OS.version.minor}.${OS.version.build}`);
    console.info('[nsos] try: NSOS.debug.state() / NSOS.debug.jump("fastboot")');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

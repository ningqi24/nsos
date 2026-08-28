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

  /* ---------- 桌面交互（P2.4 · P4 导航化） ---------- */
  // 点击图标 -> 进入应用任务栈（窗口 / 标题栏 / 挂载由 OS.nav 统一处理，
  // 应用定义见 js/apps/builtin-apps.js 的 manifest，与内核零耦合）
  OS.bus.on('launcher:launch', ({ app, x, y }) => {
    // 设置应用层的变换原点为图标位置（iOS 风格缩放动画）
    const appLayer = document.getElementById('layer-app');
    if (appLayer && x !== undefined && y !== undefined) {
      appLayer.style.transformOrigin = `${x}px ${y}px`;
    }
    if (OS.nav && OS.nav.push) {
      OS.nav.push(app.id);
      return;
    }
    console.warn('[main] OS.nav 未就绪，忽略启动', app.id);
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
    if (OS.tasks && OS.tasks.init) OS.tasks.init();               // 多任务视图（P5）
    if (OS.spotlight && OS.spotlight.init) OS.spotlight.init();   // 全局搜索 Spotlight
    if (OS.island && OS.island.init) OS.island.init();            // 灵动岛 Dynamic Island
    if (OS.powermenu && OS.powermenu.init) OS.powermenu.init();    // 电源菜单
    // share-sheet 不需要 init，直接挂载到 OS.share

    /* ---------- 全局涟漪效果 ---------- */
    // 为所有按钮和可交互元素添加 Material-style 涟漪动画
    document.addEventListener('pointerdown', (e) => {
      const target = e.target.closest('button, .clickable, .app-icon, .cc-tog, .cc-shortcut, [role="button"]');
      if (!target) return;
      if (getComputedStyle(target).position === 'static') return; // 仅在定位元素上
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 500);
    });

    // Home Indicator（底部手势条）：点击回桌面 / 双击打开抽屉 / 长按多任务
    const hi = document.createElement('div');
    hi.id = 'sys-home-indicator';
    let hiLastTap = 0;
    let hiHoldTimer = null;
    hi.addEventListener('pointerdown', (e) => {
      // 长按 -> 多任务视图
      hiHoldTimer = setTimeout(() => {
        if (OS.tasks && OS.tasks.open) OS.tasks.open();
      }, 500);
    });
    hi.addEventListener('pointermove', () => {
      if (hiHoldTimer) { clearTimeout(hiHoldTimer); hiHoldTimer = null; }
    });
    hi.addEventListener('pointerup', (e) => {
      if (hiHoldTimer) { clearTimeout(hiHoldTimer); hiHoldTimer = null; }
      const now = Date.now();
      // 双击 -> 打开应用抽屉
      if (now - hiLastTap < 350) {
        hiLastTap = 0;
        if (OS.launcher && OS.launcher.openDrawer) OS.launcher.openDrawer();
      } else {
        hiLastTap = now;
        // 单击 -> 回桌面
        setTimeout(() => {
          if (hiLastTap === 0) return;
          if (now === hiLastTap) {
            if (OS.state.current === 'app' || OS.state.current === 'home') {
              OS.state.transition('home', { source: 'home-indicator' });
            }
          }
        }, 350);
      }
    });
    const sysuiEl = document.getElementById('os-sysui');
    if (sysuiEl) sysuiEl.appendChild(hi);

    // 点击状态栏时间区域 -> 滚动桌面到顶部
    const sbTime = document.querySelector('#sys-statusbar .sb-time');
    if (sbTime) {
      sbTime.style.cursor = 'pointer';
      sbTime.addEventListener('click', () => {
        const grid = document.querySelector('.launcher-grid');
        if (grid) grid.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    /* ---------- 屏幕自动锁屏定时器 ---------- */
    // 默认 60 秒无操作自动锁屏（可通过设置修改）
    OS.autoLock = {
      _timer: null,
      _timeout: 0, // 0 = 禁用
      _init() {
        this._timeout = parseInt(OS.storage.get('settings:autolock', '60'), 10);
        this._reset();
        // 监听用户操作重置计时
        ['pointerdown', 'keydown', 'pointermove'].forEach(ev => {
          document.addEventListener(ev, () => this._reset(), { passive: true });
        });
      },
      _reset() {
        if (this._timer) clearTimeout(this._timer);
        if (this._timeout <= 0) return; // 禁用
        this._timer = setTimeout(() => {
          // 仅在桌面或应用状态自动锁屏
          const s = OS.state.current;
          if (s === 'home' || s === 'app') {
            OS.state.transition('locked', { source: 'auto-lock' });
          }
        }, this._timeout * 1000);
      },
      setTimeout(sec) {
        this._timeout = sec;
        OS.storage.set('settings:autolock', sec);
        this._reset();
      },
      getTimeout() { return this._timeout; }
    };
    OS.autoLock._init();

    /* ---------- 首次使用引导页 ---------- */
    OS.onboarding = {
      _init() {
        const done = OS.storage.get('onboarding:done', false);
        if (done) return;
        // 延迟到桌面层可见后显示
        OS.bus.on('state:enter:home', () => {
          if (OS.storage.get('onboarding:done', false)) return;
          this._show();
        });
      },

      _show() {
        const sysui = document.getElementById('os-sysui');
        if (!sysui) return;
        const overlay = document.createElement('div');
        overlay.className = 'onboarding-overlay';
        overlay.innerHTML = `
          <div class="ob-card">
            <div class="ob-header">
              <div class="ob-logo">nsos</div>
              <div class="ob-version">b0.2.1 Aurora</div>
            </div>
            <div class="ob-pages">
              <div class="ob-page active" data-step="1">
                <div class="ob-step-num">01</div>
                <h2>欢迎来到 nsos</h2>
                <p>基于 Web 技术构建的现代移动操作系统。流畅手势、精致界面、强大功能。</p>
              </div>
              <div class="ob-page" data-step="2">
                <div class="ob-step-num">02</div>
                <h2>手势导航</h2>
                <p>底部上滑回桌面 · 底部长按多任务 · 状态栏下划控制中心 · 桌面上划全部应用</p>
              </div>
              <div class="ob-page" data-step="3">
                <div class="ob-step-num">03</div>
                <h2>个性化</h2>
                <p>控制中心切换深色/亮色模式，长按桌面更换壁纸，右键图标打开菜单。</p>
              </div>
              <div class="ob-page" data-step="4">
                <div class="ob-step-num">04</div>
                <h2>键盘快捷键</h2>
                <p>Ctrl+Shift+S 截屏 · Ctrl+Shift+T 切换主题 · Ctrl+Shift+W 切换壁纸</p>
              </div>
            </div>
            <div class="ob-dots">
              <span class="ob-dot active" data-step="1"></span>
              <span class="ob-dot" data-step="2"></span>
              <span class="ob-dot" data-step="3"></span>
              <span class="ob-dot" data-step="4"></span>
            </div>
            <div class="ob-actions">
              <button class="ob-skip">跳过</button>
              <button class="ob-next">下一步</button>
            </div>
          </div>`;
        sysui.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        let step = 1;
        const pages = overlay.querySelectorAll('.ob-page');
        const dots = overlay.querySelectorAll('.ob-dot');
        const nextBtn = overlay.querySelector('.ob-next');
        const skipBtn = overlay.querySelector('.ob-skip');

        const goTo = (n) => {
          pages.forEach(p => p.classList.toggle('active', parseInt(p.dataset.step, 10) === n));
          dots.forEach(d => d.classList.toggle('active', parseInt(d.dataset.step, 10) === n));
          step = n;
          if (n === 4) nextBtn.textContent = '开始使用';
          else nextBtn.textContent = '下一步';
        };

        nextBtn.addEventListener('click', () => {
          if (step < 4) { goTo(step + 1); return; }
          this._finish(overlay);
        });
        skipBtn.addEventListener('click', () => this._finish(overlay));
        dots.forEach(d => d.addEventListener('click', () => goTo(parseInt(d.dataset.step, 10))));
      },

      _finish(overlay) {
        overlay.classList.remove('show');
        overlay.classList.add('hide');
        setTimeout(() => overlay.remove(), 400);
        OS.storage.set('onboarding:done', true);
      }
    };
    OS.onboarding._init();

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

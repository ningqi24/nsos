/* ============================================================
 * nsos - modes.js (P1.4 ~ P1.6 / 扩展)
 * 工程模式控制器：Fastboot / Recovery 菜单逻辑
 *   方向键/数字键选择，Enter 确认
 *   Recovery 的"清除数据"带二次确认
 *   扩展：设备信息 / 解锁Bootloader / 日志 / ADB更新 / 挂载 / 测试
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const CONFIG = {
    fastboot: {
      layer: 'layer-fastboot',
      menuId: 'ft-menu',
      items: [
        { label: '正常启动系统',           action: 'reboot-system' },
        { label: '重启到 Bootloader',     action: 'restart-bootloader' },
        { label: '启动 Recovery',         action: 'enter-recovery' },
        { label: '解锁 Bootloader',       action: 'unlock-bootloader' },
        { label: '查看设备信息',          action: 'device-info' },
        { label: '关机',                 action: 'power-off' }
      ]
    },
    recovery: {
      layer: 'layer-recovery',
      menuId: 'rc-menu',
      items: [
        { label: '重启系统',               action: 'reboot-system' },
        { label: '重启到 Bootloader',     action: 'restart-bootloader' },
        { label: '进入 Fastboot',         action: 'enter-fastboot' },
        { label: '通过 ADB 应用更新',     action: 'sideload' },
        { label: '从内部存储应用更新',     action: 'apply-from-storage' },
        { label: '清除数据（恢复出厂）',   action: 'factory-reset' },
        { label: '清除缓存分区',          action: 'wipe-cache' },
        { label: '挂载 /system',         action: 'mount-system' },
        { label: '查看恢复日志',          action: 'show-log' },
        { label: '运行图形测试',          action: 'graphics-test' },
        { label: '关机',                 action: 'power-off' }
      ]
    }
  };

  const MODES = {
    mode: null,           // 'fastboot' | 'recovery' | null
    index: 0,
    confirmPending: false,
    menu: null,
    mounted: false,       // /system 是否已挂载（模拟）
    panel: null,          // 当前打开的信息面板 DOM
    updateWrap: null,     // 更新进度弹层 DOM
    updateTimer: null,

    init() {
      OS.bus.on('input:key', (e) => this._handleKey(e));
      OS.state.onEnter('fastboot', () => this._open('fastboot'));
      OS.state.onEnter('recovery', () => this._open('recovery'));
      OS.state.onLeave('fastboot', () => { this._teardown(); this.mode = null; });
      OS.state.onLeave('recovery', () => { this._teardown(); this.mode = null; });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.panel) { this._closePanel(); e.preventDefault(); }
      });
    },

    _teardown() {
      this._closePanel();
      this._cleanupUpdate();
      this.confirmPending = false;
    },

    _open(mode) {
      this.mode = mode;
      this.confirmPending = false;
      this.mounted = false;
      this.menu = document.getElementById(CONFIG[mode].menuId);
      this._render();
      this.move(0);
    },

    _render() {
      if (!this.menu) return;
      this.menu.innerHTML = '';
      CONFIG[this.mode].items.forEach((item, i) => {
        const li = document.createElement('li');
        li.textContent = (item.action === 'mount-system' && this.mounted) ? '卸载 /system' : item.label;
        li.dataset.action = item.action;
        li.addEventListener('click', () => { this.move(i); this.choose(); });
        this.menu.appendChild(li);
      });
    },

    move(i) {
      if (!this.menu || this.menu.children.length === 0) return;
      this.index = Math.max(0, Math.min(this.menu.children.length - 1, i));
      Array.from(this.menu.children).forEach((li, idx) => {
        li.classList.toggle('sel', idx === this.index);
      });
    },

    _handleKey(e) {
      const st = OS.state.current;
      if (st !== 'fastboot' && st !== 'recovery') return;
      if (e.type === 'back') { this._closePanel(); return; }
      if (e.type === 'nav') this.move(this.index + (e.dir === 'down' ? 1 : -1));
      else if (e.type === 'select') this.choose();
      else if (e.type === 'digit') { this.move(e.digit - 1); this.choose(); }
    },

    choose() {
      const item = this.menu && this.menu.children[this.index];
      if (!item) return;

      const action = item.dataset.action;
      // 清除出厂 / 解锁 Bootloader 的二次确认
      if ((this.mode === 'recovery' && action === 'factory-reset') ||
          (this.mode === 'fastboot' && action === 'unlock-bootloader')) {
        if (!this.confirmPending) {
          this.confirmPending = true;
          item.textContent = action === 'factory-reset'
            ? '再次确认：立即清除数据？(Enter)'
            : '再次确认：解锁会清空数据？(Enter)';
          return;
        }
        this.confirmPending = false;
      }
      this.exec(action);
    },

    exec(action) {
      switch (action) {
        case 'reboot-system':
          OS.state.transition('boot', { source: action });
          break;
        case 'restart-bootloader':
          OS.state.transition('boot', { source: action, stayBootloader: true });
          break;
        case 'enter-recovery':
          OS.state.transition('recovery', { source: action });
          break;
        case 'enter-fastboot':
          OS.state.transition('fastboot', { source: action });
          break;
        case 'unlock-bootloader':
          this._toast('Bootloader 已解锁（模拟）· 数据已清除', 'success');
          break;
        case 'device-info':
          this._openPanel('设备信息', this._deviceInfoHTML());
          break;
        case 'sideload':
          this._startUpdate('adb sideload', this._sideloadHTML());
          break;
        case 'apply-from-storage':
          this._openPanel('选择更新包（内部存储）', this._storageListHTML());
          this._bindStorageList(this.panel);
          break;
        case 'wipe-cache':
          this._toast('缓存分区已清除（模拟）', 'success');
          break;
        case 'mount-system':
          this.mounted = !this.mounted;
          this._toast(this.mounted ? '已挂载 /system（模拟）' : '已卸载 /system（模拟）', 'success');
          this._render();
          break;
        case 'show-log':
          this._openPanel('恢复日志', this._logHTML());
          break;
        case 'graphics-test':
          this._openPanel('图形测试', this._graphicsHTML());
          break;
        case 'power-off':
          OS.state.transition('poweroff', { source: action });
          break;
        case 'factory-reset':
          this._resetDone();
          break;
        default:
          console.warn('[modes] unknown action:', action);
      }
    },

    /* ---- 信息面板 ---- */
    _openPanel(title, bodyHTML) {
      this._closePanel();
      const layer = document.getElementById(CONFIG[this.mode].layer);
      const panel = document.createElement('div');
      panel.className = 'ft-panel';
      panel.innerHTML =
        '<div class="ft-panel-head"><span>' + title + '</span>' +
        '<button class="ft-panel-close" type="button">✕ 返回</button></div>' +
        '<div class="ft-panel-body">' + bodyHTML + '</div>';
      panel.querySelector('.ft-panel-close').addEventListener('click', () => this._closePanel());
      panel.addEventListener('click', (e) => { if (e.target === panel) this._closePanel(); });
      layer.appendChild(panel);
      this.panel = panel;
      if (this.menu) this.menu.style.display = 'none';
    },

    _closePanel() {
      if (this.panel) {
        this.panel.remove();
        this.panel = null;
        if (this.menu) this.menu.style.display = '';
      }
    },

    _toast(msg, type) {
      if (OS.ui && OS.ui.toast) OS.ui.toast(msg, { type: type || 'success' });
    },

    _deviceInfoHTML() {
      const rows = [
        ['型号', 'NSOS Simulator 1.0'],
        ['序列号', 'NSOS' + Math.random().toString(36).slice(2, 8).toUpperCase()],
        ['Bootloader 版本', 'nsos-bl-0.1.0'],
        ['电量', '100 %'],
        ['解锁状态', 'unlocked（模拟）'],
        ['存储', '256 GB / 已用 38 GB'],
        ['显示', '1080 x 2340 @ 420dpi']
      ];
      return rows.map(r => '<div class="ft-panel-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
    },

    _logHTML() {
      const lines = [
        '[I] nsos recovery v0.1.0',
        '[I] 读取分区表... OK',
        '[I] 校验 /system 挂载: no',
        '[I] 未发现异常日志',
        '[I] 上次会话: ' + new Date().toISOString(),
        '[I] 设备健康状态: 良好'
      ];
      return '<pre class="ft-panel-log">' + lines.join('\n') + '</pre>';
    },

    _graphicsHTML() {
      return '<div class="ft-panel-gfx"><div class="gfx-bar g0"></div><div class="gfx-bar g1"></div>' +
             '<div class="gfx-bar g2"></div><div class="gfx-bar g3"></div>' +
             '<p class="gfx-msg">图形渲染自检中… 正常</p></div>';
    },

    /* 内部存储更新：虚拟文件列表，点击即应用 */
    _storageListHTML() {
      const files = [
        'nsos-ota-2026-08-23.zip',
        'nsos-ota-2026-08-16.zip',
        'nsos-ota-bugfix.zip'
      ];
      return files.map((f, i) =>
        '<button class="ft-file" type="button" data-file="' + i + '">' + f +
        ' ›</button>').join('');
    },

    /* 面板内的存储文件点击 -> 进入更新流程 */
    _bindStorageList(panel) {
      const that = this;
      panel.querySelectorAll('.ft-file').forEach((btn) => {
        btn.addEventListener('click', () => {
          that._closePanel();
          that._startUpdate('update.zip', that._progressHTML(btn.textContent.trim()));
        });
      });
    },

    /* ---- 更新进度弹层 ---- */
    _startUpdate(cmdLabel, bodyHTML) {
      this._cleanupUpdate();
      const layer = document.getElementById(CONFIG[this.mode].layer);
      const wrap = document.createElement('div');
      wrap.className = 'ft-update';
      wrap.innerHTML = bodyHTML;
      wrap.querySelector('.ft-update-cmd').textContent = cmdLabel;
      layer.appendChild(wrap);
      this.updateWrap = wrap;
      if (this.menu) this.menu.style.display = 'none';

      const bar = wrap.querySelector('.ft-update-bar');
      const pct = wrap.querySelector('.ft-update-pct');
      let p = 0;
      this.updateTimer = setInterval(() => {
        p += 3 + Math.floor(Math.random() * 6);
        if (p >= 100) {
          p = 100;
          clearInterval(this.updateTimer);
          this.updateTimer = null;
          wrap.querySelector('.ft-update-title').textContent = '更新完成';
          wrap.querySelector('.ft-update-cmd').textContent = '正在重启系统…';
          setTimeout(() => OS.state.transition('boot', { source: 'update-done' }), 1200);
        }
        bar.style.width = p + '%';
        pct.textContent = p + '%';
      }, 180);
    },

    _progressHTML(fileName) {
      return '<div class="ft-update-title">正在应用更新</div>' +
             '<div class="ft-update-cmd"></div>' +
             '<div class="ft-update-file">' + fileName + '</div>' +
             '<div class="ft-update-track"><i class="ft-update-bar"></i></div>' +
             '<div class="ft-update-pct">0%</div>';
    },

    _sideloadHTML() {
      return this._progressHTML('等待主机推送 update.zip …');
    },

    _cleanupUpdate() {
      if (this.updateTimer) { clearInterval(this.updateTimer); this.updateTimer = null; }
      if (this.updateWrap) {
        this.updateWrap.remove();
        this.updateWrap = null;
        if (this.menu) this.menu.style.display = '';
      }
    },

    /* 模拟清除数据 -> 提示完成 -> 自动重启 */
    _resetDone() {
      if (!this.menu) return;
      this.menu.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'sel';
      li.textContent = '数据已清除，正在重启…';
      this.menu.appendChild(li);
      setTimeout(() => OS.state.transition('boot', { source: 'factory-reset-done' }), 1800);
    }
  };

  OS.reg('modes', MODES);
})(window);

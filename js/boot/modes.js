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
        { label: '查看设备信息',          action: 'device-info' },
        { label: '解锁 / 锁定 Bootloader', action: 'lock-bootloader' },
        { label: '命令行 (Shell)',        action: 'shell-cli' },
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
        { label: '命令行 (Shell)',        action: 'shell-cli' },
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
      // 取消可能仍在进行的传输会话（统一进度源的强制清理）
      if (OS.shell && OS.shell.updater) OS.shell.updater.cancel();
    },

    _open(mode) {
      this.mode = mode;
      this.confirmPending = false;
      this.mounted = false;
      this.menu = document.getElementById(CONFIG[mode].menuId);
      this._render();
      this.move(0);
    },

    /* 动态菜单文案：随状态更新（挂载 /system、Bootloader 锁定） */
    _itemLabel(item) {
      if (item.action === 'mount-system') {
        return this.mounted ? '卸载 /system' : '挂载 /system';
      }
      if (item.action === 'lock-bootloader') {
        if (OS.shell && OS.shell.locked) {
          return OS.shell.locked() ? '解锁 Bootloader' : '锁定 Bootloader';
        }
      }
      return item.label;
    },

    _render() {
      if (!this.menu) return;
      this.menu.innerHTML = '';
      CONFIG[this.mode].items.forEach((item, i) => {
        const li = document.createElement('li');
        li.textContent = this._itemLabel(item);
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
      // 信息面板 / 更新弹层 / 内嵌终端打开时，菜单操作全部忽略，
      // 否则终端里敲 Enter 会误触隐藏菜单（终端底层交互的守卫）
      if (this.panel || this.updateWrap) return;
      if (e.type === 'nav') this.move(this.index + (e.dir === 'down' ? 1 : -1));
      else if (e.type === 'select') this.choose();
      else if (e.type === 'digit') { this.move(e.digit - 1); this.choose(); }
    },

    choose() {
      const item = this.menu && this.menu.children[this.index];
      if (!item) return;

      const action = item.dataset.action;
      // 清除出厂的二次确认
      if (this.mode === 'recovery' && action === 'factory-reset') {
        if (!this.confirmPending) {
          this.confirmPending = true;
          item.textContent = '再次确认：立即清除数据？(Enter)';
          return;
        }
        this.confirmPending = false;
      }
      this.exec(action);
    },

    exec(action) {
      switch (action) {
        /* 以下动作统一由 OS.shell 命令引擎驱动（终端底层） */
        case 'reboot-system':
          OS.shell.exec('reboot');
          break;
        case 'restart-bootloader':
          OS.shell.exec('reboot bootloader');
          break;
        case 'enter-recovery':
          OS.shell.exec('reboot recovery');
          break;
        case 'enter-fastboot':
          OS.shell.exec('reboot fastboot');
          break;
        case 'power-off':
          OS.shell.exec('poweroff');
          break;
        case 'device-info':
          this._openPanel('设备信息', '<div class="ft-panel-log" data-devrows></div>');
          OS.shell.exec('devinfo', {
            onLine: (l) => {
              const box = this.panel && this.panel.querySelector('[data-devrows]');
              if (!box) return;
              const row = document.createElement('div');
              row.className = 'ft-panel-row';
              const idx = l.text.indexOf(':');
              if (idx > -1) {
                row.innerHTML = '<span>' + l.text.slice(0, idx).trim() + '</span><b>' +
                  l.text.slice(idx + 1).trim() + '</b>';
              } else {
                row.textContent = l.text;
              }
              box.appendChild(row);
            }
          });
          break;
        case 'lock-bootloader':
          this._toggleLock();
          break;
        case 'shell-cli':
          this._openShell();
          break;
        case 'sideload':
          this._startUpdate('adb sideload update.zip', this._sideloadHTML());
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
        case 'factory-reset':
          this._resetDone();
          break;
        default:
          console.warn('[modes] unknown action:', action);
      }
    },

    /* 解锁 / 锁定 Bootloader：由 shell 命令真实持久化状态 */
    _toggleLock() {
      const shell = OS.shell;
      if (!shell) return;
      const wasLocked = shell.locked();
      // 执行对应命令（unlock 走 fastboot flashing unlock，确保命令上下文一致）
      const cmd = wasLocked ? 'fastboot flashing unlock' : 'fastboot flashing lock';
      shell.exec(cmd, {
        onLine: (l) => this._toast(l.text, l.kind === 'err' ? 'error' : (l.kind === 'warn' ? 'warning' : 'info'))
      }).then(() => {
        this._render(); // 刷新菜单文案（解锁/锁定状态已变）
        this._toast(wasLocked ? 'Bootloader 已解锁，可刷写任意镜像' : 'Bootloader 已锁定', 'success');
      });
    },

    /* 内嵌命令终端：工程模式里的底层命令行交互 */
    _openShell() {
      this._openPanel('命令行 (Shell)', '<os-terminal></os-terminal>');
      setTimeout(() => {
        const t = this.panel && this.panel.querySelector('os-terminal');
        if (t) { try { t.focus(); } catch (e) {} }
      }, 60);
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
      const d = (OS.device && OS.device.info) || {};
      const rows = [
        ['型号', d.model || '不可用'],
        ['平台', d.platform || '不可用'],
        ['浏览器/系统', d.osBrowser || '不可用'],
        ['电量', d.battery || '不可用'],
        ['充电状态', d.charging || '不可用'],
        ['屏幕', d.screen || '不可用'],
        ['DPI', d.dpr || '不可用'],
        ['内存', d.memory || '不可用'],
        ['CPU 核心数', d.cores || '不可用'],
        ['网络类型', d.network || '不可用'],
        ['网络状态', d.online || '不可用'],
        ['触屏', d.touch || '不可用'],
        ['语言', d.language || '不可用'],
        ['存储使用', d.storage || '不可用']
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
    /* 进度源来自 OS.shell.updater（全局唯一），终端 sideload 与菜单更新共用同一计时器 */
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
      const u = OS.shell.updater.start(cmdLabel);
      if (u.error) {
        this._toast(u.error, 'error');
        this._cleanupUpdate();
        return;
      }
      u.onTick((p) => {
        bar.style.width = p + '%';
        pct.textContent = p + '%';
      });
      u.onDone(() => {
        bar.style.width = '100%';
        pct.textContent = '100%';
        wrap.querySelector('.ft-update-title').textContent = '更新完成';
        wrap.querySelector('.ft-update-cmd').textContent = '正在重启系统…';
        setTimeout(() => OS.state.transition('boot', { source: 'update-done' }), 1200);
      });
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

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
        { label: '挂载 /system 或 /cache', action: 'mount-system' },
        { label: '清除缓存分区',          action: 'wipe-cache' },
        { label: '清除数据（恢复出厂）',   action: 'factory-reset' },
        { label: '从 /sdcard 应用更新',    action: 'ota-gui' },
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
    panel: null,          // 当前打开的信息面板 DOM

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
      this.confirmPending = false;
      // 取消可能仍在进行的传输会话（统一进度源的强制清理）
      if (OS.shell && OS.shell.updater) OS.shell.updater.cancel();
    },

    _open(mode) {
      this.mode = mode;
      this.confirmPending = false;
      this.menu = document.getElementById(CONFIG[mode].menuId);
      // 进入 recovery：按真实分区状态初始化 /cache 占用并入会话日志
      if (mode === 'recovery' && OS.shell && OS.shell.VFS) {
        OS.shell.VFS.primeCache();
        OS.shell.rec.add('I', 'recovery mode started, waiting for action');
      }
      this._render();
      this.move(0);
    },

    /* 动态菜单文案：随状态更新（分区挂载、Bootloader 锁定） */
    _itemLabel(item) {
      if (item.action === 'mount-system') {
        return '挂载 /system 或 /cache';
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
      // 信息面板 / 内嵌终端打开时，菜单操作全部忽略，
      // 否则终端里敲 Enter 会误触隐藏菜单（终端底层交互的守卫）
      if (this.panel) return;
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
        case 'mount-system':
          this._openMountPanel();
          break;
        case 'wipe-cache':
          this._execWithOutput('wipe cache');
          break;
        case 'show-log':
          this._openLogPanel();
          break;
        case 'graphics-test':
          this._openGraphicsTest();
          break;
        case 'factory-reset':
          this._execWithOutput('wipe data');
          break;
        case 'ota-gui':
          this._openOtaPanel();
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

    /* 内嵌命令终端：工程模式里的底层命令行交互（全屏布局） */
    _openShell() {
      this._closePanel();
      const layer = document.getElementById(CONFIG[this.mode].layer);
      const panel = document.createElement('div');
      panel.className = 'ft-panel ft-shell';
      panel.innerHTML =
        '<div class="ft-shell-head"><span>nsos 工程终端</span>' +
        '<button class="ft-panel-close" type="button">✕ 返回</button></div>' +
        '<os-terminal class="ft-shell-term"></os-terminal>';
      panel.querySelector('.ft-panel-close').addEventListener('click', () => this._closePanel());
      panel.addEventListener('click', (e) => { if (e.target === panel) this._closePanel(); });
      layer.appendChild(panel);
      this.panel = panel;
      if (this.menu) this.menu.style.display = 'none';
      this._term = panel.querySelector('os-terminal');
      setTimeout(() => {
        if (this._term) { try { this._term.focus(); } catch (e) {} }
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

    /* ---- 挂载面板：真实分区状态 + 挂载/卸载动作 ---- */
    _mountRowHTML(part, display, sector) {
      const vm = (OS.shell && OS.shell.VFS) || {};
      const mnt = !!(vm.mount && vm.mount['/' + part]);
      return '<div class="ft-panel-row" data-part="' + part + '">' +
             '<span>' + display + (mnt ? ' <b class="ok">[已挂载]</b>' : ' <b class="warn">[未挂载]</b>') + '</span>' +
             '<button type="button" class="ft-mount-btn" data-op="' + (mnt ? 'umount' : 'mount') + '">' +
             (mnt ? '卸载' : '挂载') + '</button></div>';
    },

    _openMountPanel() {
      if (!OS.shell || !OS.shell.VFS) { this._toast('shell 不可用', 'error'); return; }
      const body = '<div class="ft-panel-log" style="font-size:13px">' +
        '<div class="kbd-hint">提示：/system 只读挂载，/cache 可写。挂载后才能 ls / cat 访问。</div>' +
        this._mountRowHTML('system', '/system (system)', 'system') +
        this._mountRowHTML('cache', '/cache (cache)', 'cache') +
        '<div class="ft-mnt-out"></div></div>';
      this._openPanel('挂载分区', body);
      const out = this.panel.querySelector('.ft-mnt-out');
      this.panel.querySelectorAll('.ft-mount-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const part = btn.closest('.ft-panel-row').dataset.part;
          const op = btn.dataset.op;
          const cmd = op + ' ' + part;
          OS.shell.exec(cmd, {
            onLine: (l) => {
              const line = document.createElement('div');
              line.textContent = '> ' + l.text;
              line.style.color = l.kind === 'err' ? '#ff8a80' : (l.kind === 'ok' ? '#9be79b' : '#cfd8cf');
              out.appendChild(line);
            }
          }).then(() => {
            // 刷新挂载状态行
            this.panel.querySelectorAll('.ft-panel-row[data-part]').forEach((row) => {
              const p = row.dataset.part;
              const vm = OS.shell.VFS;
              const mnt = !!(vm.mount && vm.mount['/' + p]);
              row.querySelector('span').innerHTML = (p === 'system' ? '/system (system)' : '/cache (cache)') +
                (mnt ? ' <b class="ok">[已挂载]</b>' : ' <b class="warn">[未挂载]</b>');
              row.querySelector('.ft-mount-btn').dataset.op = mnt ? 'umount' : 'mount';
              row.querySelector('.ft-mount-btn').textContent = mnt ? '卸载' : '挂载';
            });
          });
        });
      });
    },

    /* ---- 命令输出面板：真实执行并渲染输出行 ---- */
    _execWithOutput(cmd) {
      const box = document.createElement('div');
      box.className = 'ft-panel-log';
      this._openPanel('执行 ' + cmd.split(' ')[0], box.outerHTML);
      const body = this.panel.querySelector('.ft-panel-log');
      body.textContent = '> ' + cmd + '\n';
      OS.shell.exec(cmd, {
        onLine: (l) => {
          const line = document.createElement('div');
          line.textContent = l.text;
          line.style.color = l.kind === 'err' ? '#ff8a80' : (l.kind === 'ok' ? '#9be79b' : '#cfd8cf');
          body.appendChild(line);
        }
      });
    },

    /* ---- OTA 应用面板（GUI 更新）：真实扫描 /sdcard 包，调 ota apply 同一命令引擎 ---- */
    _openOtaPanel() {
      const shell = OS.shell;
      if (!shell || !shell.VFS) { this._toast('shell 不可用', 'error'); return; }
      const v = OS.version || {};
      const curS = (v.major != null) ? 'b' + v.major + '.' + v.minor + '.' + v.build : '?';
      const parseV = (name) => {
        const m = /^nsos-ota-[vb]?(\d+)\.(\d+)\.(\d+)\.zip$/.exec(name);
        return m ? { major: +m[1], minor: +m[2], build: +m[3], s: name } : null;
      };
      const newer = (a, b) => a.major > b.major ||
        (a.major === b.major && a.minor > b.minor) ||
        (a.major === b.major && a.minor === b.minor && a.build > b.build);
      const pkgs = (shell.VFS.tree['/sdcard'] || []).map(parseV).filter(Boolean)
        .sort((a, b) => a.major - b.major || a.minor - b.minor || a.build - b.build);

      const rows = pkgs.length ? pkgs.map((p) => {
        const up = newer(p, v);
        return '<div class="ft-ota-row">' +
          '<span><b class="ft-ota-fn">' + p.s + '</b> <i>v' + p.major + '.' + p.minor + '.' + p.build + '</i>' +
          ' <b class="' + (up ? 'ok' : 'warn') + '">' + (up ? '可更新' : '非新版本') + '</b></span>' +
          (up ? '<button type="button" class="ft-mount-btn" data-apply="' + p.s + '">应用更新</button>' : '') +
          '</div>';
      }).join('') : '<div class="kbd-hint">/sdcard 无更新包</div>';

      const bodyHTML =
        '<div class="kbd-hint">当前 ' + curS + ' · 仅版本更高的包可应用（不可降级）</div>' + rows +
        '<div class="ft-ota-progress" hidden>' +
        '<div class="ft-ota-bar"></div><span class="ft-ota-pct">0%</span></div>' +
        '<div class="ft-ota-done" hidden>' +
        '<button type="button" class="ft-mount-btn" data-reboot>重启系统（应用生效）</button>' +
        '<button type="button" class="ft-mount-btn" data-again>返回重新选择</button></div>';
      this._openPanel('从 /sdcard 应用更新', bodyHTML);

      const panel = this.panel;
      if (!panel) return;
      panel.querySelectorAll('[data-apply]').forEach((btn) => {
        btn.addEventListener('click', () => this._otaApply(btn.dataset.apply));
      });
      const rb = panel.querySelector('[data-reboot]');
      if (rb) rb.addEventListener('click', () => shell.exec('reboot'));
      const ag = panel.querySelector('[data-again]');
      if (ag) ag.addEventListener('click', () => { this._closePanel(); this._openOtaPanel(); });
    },

    _otaApply(file) {
      const shell = OS.shell;
      if (!shell || !shell.updater) { this._toast('更新器不可用', 'error'); return; }
      const u = shell.updater.start('OTA apply ' + file);
      if (u.error) { this._toast(u.error, 'error'); return; }
      const panel = this.panel;
      if (!panel) return;
      const prog = panel.querySelector('.ft-ota-progress');
      const bar = panel.querySelector('.ft-ota-bar');
      const pct = panel.querySelector('.ft-ota-pct');
      if (prog) prog.hidden = false;
      this._toast('正在应用 ' + file + ' ...', 'info');
      u.onTick((p) => { if (bar) bar.style.width = p + '%'; if (pct) pct.textContent = p + '%'; });
      u.onDone(() => {
        if (pct) pct.textContent = '100%';
        if (OS.shell && OS.shell.rec) OS.shell.rec.add('I', 'OTA applied ' + file + ' (GUI)');
        const done = panel.querySelector('.ft-ota-done');
        if (done) done.hidden = false;
        this._toast(file + ' 应用完成，请重启系统生效', 'success');
      });
    },

    /* 恢复日志：真实读取 Recovery 会话日志（REC 事件记录） */
    _openLogPanel() {
      const rec = (OS.shell && OS.shell.rec) || { lines: [] };
      const last = rec.lines.slice(-60);
      const html = '<pre class="ft-panel-log">' +
        (last.length ? last.join('\n') : '(empty)') + '</pre>';
      this._openPanel('恢复日志（真实会话）', html);
    },

    /* 图形测试：真实 canvas 渲染并回读像素校验 */
    _openGraphicsTest() {
      const c = document.createElement('canvas');
      c.width = 240; c.height = 120;
      c.className = 'ft-gfx-canvas';
      const ctx = c.getContext && c.getContext('2d');
      if (!ctx) {
        this._openPanel('图形测试', '<pre class="ft-panel-log">FAIL: Canvas 2D 不可用</pre>');
        return;
      }
      // 真实绘制四色渐变条 + 圆
      const grad = ctx.createLinearGradient(0, 0, c.width, 0);
      grad.addColorStop(0, '#1b2a3a'); grad.addColorStop(1, '#5b6b7a');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#ef9f37'; ctx.beginPath(); ctx.arc(60, 60, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8efe8'; ctx.fillRect(180, 40, 36, 36);
      // 回读像素校验是否为纯黑（确保 GPU/渲染管线真跑起来）
      let sample;
      try { const d = ctx.getImageData(60, 60, 1, 1).data; sample = d[0] + ',' + d[1] + ',' + d[2]; } catch (e) { sample = (e && e.message) || 'read error'; }
      const ok = /^238,159,55,/.test(String(sample)) || /^238/.test(String(sample));
      const verdict = ok ? 'PASS: 渲染管线正常（采样色值 ' + sample + '）' : 'WARN: 渲染像素回读异常（' + sample + '）';
      this._openPanel('图形测试（真实渲染）',
        '<div style="text-align:center"><canvas class="ft-gfx-canvas" width="240" height="120" style="border:1px solid #3a444a;border-radius:8px;background:#0b0e12"></canvas></div>' +
        '<pre class="ft-panel-log" style="margin-top:12px">' + verdict + '\n* 渐变矩形 240×120\n* 圆 (r=34, #ef9f37)\n* 方块 36×36</pre>');
      // 真正把绘制画上去
      setTimeout(() => {
        const cv = this.panel && this.panel.querySelector('canvas');
        if (cv) { const g = cv.getContext('2d'); g.drawImage(c, 0, 0); }
      }, 20);
    }
  };

  OS.reg('modes', MODES);
})(window);

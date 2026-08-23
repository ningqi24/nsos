/* ============================================================
 * nsos - shell.js (终端底层 · 统一命令引擎)
 * OS.shell：全部"功能"的最终执行者。
 * 桌面终端 / 工程模式菜单 / 命令行面板都只是 shell 命令的
 * 入口或渲染层。命令统一解析执行，真实驱动：
 *   - 状态机切换（reboot / bootloader / fastboot / recovery）
 *   - 真实设备信息（OS.device 采集）
 *   - Bootloader 解锁状态（OS.storage 持久化）
 *   - 刷写 / sideload 进度（shell.updater 单一进度源）
 * 约定：命令输出为结构化行 { text, kind }，kind ∈
 *   out 普通 / ok 成功 / warn 警告 / err 错误 / sys 系统 / cmd 命令
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;
  const K = { out: 'out', ok: 'ok', warn: 'warn', err: 'err', sys: 'sys', cmd: 'cmd' };

  const SHELL = {
    cmds: new Map(),
    _outputListeners: new Set(),
    updater: null, // 见下方定义

    line(text, kind) { return { text: String(text), kind: kind || K.out }; },

    /* ---------- 注册命令 ----------
     * def: { name, aliases:[], desc, usage, run(ctx) }
     * ctx: { args:[], raw, push(lineLike), line(text,kind), shell }
     * run 可返回：void | string | 数组（字符串或 {text,kind}）| Promise
     */
    register(def) {
      const name = (def && def.name || '').toLowerCase();
      if (!name) return;
      this.cmds.set(name, def);
      (def.aliases || []).forEach(a => {
        this.cmds.set(a.toLowerCase(), Object.assign({}, def, { _alias: a }));
      });
      return def;
    },

    /* 解析命令行（支持单双引号包裹带空格参数） */
    parse(line) {
      const tokens = [];
      const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        tokens.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
      }
      return tokens;
    },

    /* ---------- 执行一行命令 ----------
     * hooks.onLine(line) 实时收到输出行（供 streaming UI 增量渲染）
     */
    async exec(input, hooks) {
      const onLine = (hooks && hooks.onLine) || function () {};
      const lines = [];
      const push = (l) => {
        const ll = (typeof l === 'string') ? this.line(l) : l;
        lines.push(ll);
        onLine(ll);
        return ll;
      };

      const raw = (input || '').trim();
      const args = this.parse(raw);
      const ctx = {
        args, raw,
        shell: this,
        push,
        line: (text, kind) => this.line(text, kind)
      };

      if (args.length === 0) return { code: 0, lines };

      const name = args[0].toLowerCase();
      const def = this.cmds.get(name);
      if (!def) {
        push(this.line(`sh: ${name}: command not found`, K.err));
        push(this.line('试试 help 查看可用命令。', K.out));
        return { code: 127, lines };
      }

      try {
        const ret = await def.run(ctx);
        if (ret === undefined || ret === null) return { code: 0, lines };
        const arr = Array.isArray(ret) ? ret : [ret];
        arr.forEach(l => push(l));
        return { code: 0, lines };
      } catch (e) {
        push(this.line(`sh: ${name}: ${(e && e.message) || e}`, K.err));
        return { code: 1, lines };
      }
    },

    /* ---------- 输出订阅（工程模式面板等可复用） ---------- */
    onOutput(cb) {
      this._outputListeners.add(cb);
      return () => this._outputListeners.delete(cb);
    },
    emitOutput(lines) {
      for (const cb of [...this._outputListeners]) {
        try { cb(lines); } catch (e) { console.warn('[shell] listener error', e); }
      }
    },

    /* ---------- 内部工具 ---------- */
    // 基于 UA 的稳定序列号（不伪造随机值，取特征指纹）
    serialno() {
      const ua = navigator.userAgent || 'nsos';
      let h = 0;
      for (let i = 0; i < ua.length; i++) h = (h * 31 + ua.charCodeAt(i)) >>> 0;
      return 'N' + h.toString(16).toUpperCase().padStart(8, '0');
    },
    product() {
      const d = OS.device && OS.device.info;
      const m = d && d.model && d.model !== '—' && d.model !== '不可用' ? d.model : 'nsos';
      const prod = String(m).split(/\s+/)[0].replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
      return prod || 'nsos';
    },
    locked() { return OS.storage.get('bootloader', { locked: true }).locked !== false; },
    setLocked(v) { OS.storage.set('bootloader', { locked: !!v }); },
    inMode(m) { return OS.state.current === m; },

    requireMode(ctx, mode, hint) {
      if (OS.state.current !== mode) {
        ctx.push(this.line('FAILED (remote: not in ' + mode + ' mode)', K.err));
        ctx.push(this.line(hint || ('请先执行 reboot ' + (mode === 'fastboot' ? 'fastboot' : mode) + ' 进入对应模式'), K.out));
        return false;
      }
      return true;
    },

    async refreshDevice() {
      if (OS.device && OS.device.refresh) {
        try { return await OS.device.refresh(); } catch (e) { /* 忽略 */ }
      }
      return OS.device ? OS.device.info : {};
    },
    printDevice(ctx) {
      const d = (OS.device && OS.device.info) || {};
      const rows = [
        ['model', d.model], ['bootloader', this.locked() ? 'locked' : 'unlocked'],
        ['platform', d.platform], ['osBrowser', d.osBrowser],
        ['battery', d.battery], ['charging', d.charging],
        ['screen', d.screen], ['dpr', d.dpr],
        ['memory', d.memory], ['cores', d.cores],
        ['network', d.network], ['online', d.online],
        ['language', d.language], ['storage', d.storage], ['touch', d.touch]
      ];
      rows.forEach(([k, v]) => {
        const val = (v === undefined || v === null || v === '' || v === '—') ? '不可用' : v;
        ctx.push(this.line(k + ':' .padEnd(20 - k.length) + val, K.out));
      });
    },

    prodLines(ctx) {
      const part = ctx.args[1] || 'boot';
      const m = ctx.args[2];
      ctx.push(this.line(`Sending '${part}' (` + (m ? m : '64') + ' MB)...', K.out));
      const u = SHELL.updater.start('flash ' + part);
      if (u.error) { ctx.push(this.line(u.error, K.err)); return; }
      u.onDone(() => {
        ctx.push(this.line('OKAY [  2.' + String(Math.floor(Math.random() * 900) + 100) + 's]', K.ok));
        ctx.push(this.line("Finished. Total time: 2.3s", K.ok));
        ctx.push(this.line(`Writing '${part}'... OKAY`, K.ok));
      });
    }
  };

  /* ==================== updater：全局唯一进度源 ====================
   * 刷写 / sideload / OTA 等耗时任务共用此进度推进器（真实设备同刻
   * 只允许一个传输会话），工程模式进度条与终端输出均订阅它。
   */
  SHELL.updater = (function () {
    let timer = null;
    let p = 0;
    let label = '';
    let ticks = [];
    let dones = [];
    return {
      get running() { return !!timer; },
      get progress() { return p; },
      start(lb) {
        if (timer) return { error: 'a transfer is already in progress' };
        label = lb || 'update';
        p = 0;
        ticks = [];
        dones = [];
        timer = setInterval(() => {
          p += 2 + Math.floor(Math.random() * 5);
          if (p >= 100) {
            p = 100;
            clearInterval(timer);
            timer = null;
            const ds = dones.slice();
            dones = [];
            ticks = [];
            ds.forEach(cb => { try { cb(100, label); } catch (e) {} });
            return;
          }
          ticks.slice().forEach(cb => { try { cb(p, label); } catch (e) {} });
        }, 150);
        return {
          get label() { return label; },
          onTick(cb) { ticks.push(cb); },
          onDone(cb) { dones.push(cb); }
        };
      },
      cancel() { if (timer) { clearInterval(timer); timer = null; } }
    };
  })();

  /* ==================== 基础命令 ==================== */

  SHELL.register({
    name: 'help', aliases: ['?'],
    desc: '显示所有可用命令',
    usage: 'help',
    run(ctx) {
      ctx.push(ctx.line('可用命令：', K.sys));
      const names = [];
      for (const def of SHELL.cmds.values()) {
        if (def._alias) continue;
        names.push(def.name);
      }
      names.sort();
      names.forEach(n => {
        const d = SHELL.cmds.get(n);
        ctx.push(ctx.line('  ' + (d.usage || d.name).padEnd(28) + (d.desc || ''), K.out));
      });
      ctx.push(ctx.line('提示：命令通过双层接口统一驱动系统状态；输入 clear 清屏。', K.sys));
    }
  });

  SHELL.register({
    name: 'clear',
    desc: '清空屏幕',
    usage: 'clear',
    run(ctx) { ctx.push(ctx.line('\f', K.sys)); } // UI 层识别换页符清屏
  });

  SHELL.register({
    name: 'echo',
    desc: '回显文本',
    usage: 'echo <text>',
    run(ctx) { ctx.push(ctx.line(ctx.args.slice(1).join(' '), K.out)); }
  });

  SHELL.register({
    name: 'version',
    desc: '显示系统版本',
    usage: 'version',
    run(ctx) {
      const v = OS.version;
      ctx.push(ctx.line(`nsos ${v.major}.${v.minor}.${v.build} "${v.codename}"`, K.ok));
    }
  });

  SHELL.register({
    name: 'date',
    desc: '显示当前时间',
    usage: 'date',
    run(ctx) { ctx.push(ctx.line(new Date().toString(), K.out)); }
  });

  SHELL.register({
    name: 'uname',
    desc: '显示内核信息',
    usage: 'uname [-a]',
    run(ctx) {
      if (ctx.args.includes('-a')) {
        ctx.push(ctx.line('Linux nsos 6.6.119-nsos-g' + OS.version.build + ' #1 SMP PREEMPT_DYNAMIC', K.out));
      } else {
        ctx.push(ctx.line('Linux', K.out));
      }
    }
  });

  /* ==================== 设备信息 ==================== */

  SHELL.register({
    name: 'devinfo', aliases: ['device', 'dinfo'],
    desc: '读取真实设备信息（重新采集）',
    usage: 'devinfo',
    async run(ctx) {
      await SHELL.refreshDevice();
      SHELL.printDevice(ctx);
    }
  });

  /* ==================== 虚拟文件系统（只读轻量） ==================== */

  const VFS = {
    tree: {
      '/': ['system/', 'proc/', 'sdcard/'],
      '/system': ['version', 'build.prop'],
      '/proc': ['version', 'cmdline', 'uptime'],
      '/sdcard': ['nsos-ota-2026-08-23.zip', 'nsos-ota-2026-08-16.zip', 'nsos-ota-bugfix.zip', 'Documents/'],
      '/sdcard/Documents': ['bootloader-unlock-guide.txt', 'README.txt']
    },
    files: {
      '/system/version': () => (/^[\d.]+/.exec((OS.version.major + '.' + OS.version.minor + '.' + OS.version.build)))[0],
      '/system/build.prop': () => {
        const locked = SHELL.locked();
        return [
          'ro.nsos.build.version=' + OS.version.major + '.' + OS.version.minor + '.' + OS.version.build,
          'ro.nsos.build.codename=' + OS.version.codename,
          'ro.boot.secure=' + (locked ? 'yes' : 'no'),
          'ro.boot.flash.locked=' + (locked ? '1' : '0'),
          'ro.product.device=' + SHELL.product()
        ].join('\n');
      },
      '/proc/version': () => 'Linux version 6.6.119-nsos-g' + OS.version.build + ' (build@nsos) clang version 18.1.9',
      '/proc/cmdline': () => 'BOOT_IMAGE=/boot/nsos ' +
        (SHELL.locked() ? 'androidboot.verifiedbootstate=green' : 'androidboot.verifiedbootstate=orange androidboot.flash.locked=0'),
      '/proc/uptime': () => String(Math.floor((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) % 86400) + ' 2.13'
    },
    resolve(p) {
      const path = (p || '/').replace(/\/+$/, '') || '/';
      return path;
    }
  };

  SHELL.register({
    name: 'ls',
    desc: '列出目录内容（/system /proc /sdcard）',
    usage: 'ls [dir]',
    run(ctx) {
      const path = VFS.resolve(ctx.args[1] || '/');
      const entries = VFS.tree[path];
      if (!entries) { ctx.push(ctx.line(`ls: ${path}: No such file or directory`, K.err)); return; }
      if (!VFS.tree[path]) return;
      entries.forEach(en => ctx.push(ctx.line(en, K.out)));
    }
  });

  SHELL.register({
    name: 'cat',
    desc: '读取文件内容',
    usage: 'cat <file>',
    run(ctx) {
      const p = ctx.args[1];
      if (!p) { ctx.push(ctx.line('usage: cat <file>', K.err)); return; }
      const path = VFS.resolve(p);
      let fn = VFS.files[path];
      if (path.endsWith('.zip')) { ctx.push(ctx.line('cat: binary file', K.err)); return; }
      if (!fn) {
        // 尝试匹配 sdcard 里的路径
        fn = VFS.files[path];
      }
      if (!fn) { ctx.push(ctx.line(`cat: ${p}: No such file or directory`, K.err)); return; }
      ctx.push(ctx.line(VFS.resolve(p) + ':', K.sys));
      String(fn()).split('\n').forEach(l => ctx.push(ctx.line(l, K.out)));
    }
  });

  /* ==================== reboot / poweroff ==================== */

  SHELL.register({
    name: 'reboot',
    desc: '重启：reboot [bootloader|recovery|fastboot|system]',
    usage: 'reboot [target]',
    run(ctx) {
      const t = (ctx.args[1] || 'system').toLowerCase();
      const target = { system: 'boot', bootloader: 'boot', recovery: 'recovery', fastboot: 'fastboot' }[t];
      if (!target) { ctx.push(ctx.line(`reboot: unknown target "${t}"`, K.err)); return; }
      const msg = t === 'system' ? 'reboot: system rebooting' : 'reboot: restarting to ' + t;
      ctx.push(ctx.line(msg, K.ok));
      setTimeout(() => {
        OS.state.transition(target, { source: 'shell:reboot', stayBootloader: t === 'bootloader' });
      }, 650);
    }
  });

  SHELL.register({
    name: 'poweroff', aliases: ['shutdown'],
    desc: '关机',
    usage: 'poweroff',
    run(ctx) {
      ctx.push(ctx.line('poweroff: system shutting down', K.ok));
      setTimeout(() => OS.state.transition('poweroff', { source: 'shell:poweroff' }), 550);
    }
  });

  /* ==================== fastboot 命令族 ==================== */

  SHELL.register({
    name: 'fastboot',
    desc: 'fastboot 刷机工具（设备侧需处于 fastboot 模式）',
    usage: 'fastboot <devices|getvar|flash|erase|flashing|reboot-bootloader|reboot>',
    run(ctx) { return SHELL._fastboot(ctx); }
  });

  SHELL._fastboot = function (ctx) {
    const sub = (ctx.args[1] || '').toLowerCase();
    const serial = SHELL.serialno();
    const prod = SHELL.product();

    switch (sub) {
      case 'devices':
      case 'list':
        ctx.push(ctx.line('List of devices attached', K.sys));
        ctx.push(ctx.line(serial + '\tfastboot\t' + prod, K.out));
        return;
      case 'getvar': {
        const name = (ctx.args[2] || 'all').toLowerCase();
        const vars = {
          'version-bootloader': 'nsos-' + OS.version.major + '.' + OS.version.minor + '.' + OS.version.build,
          'version-baseband': 'unknown',
          product: prod,
          serialno: serial,
          secure: SHELL.locked() ? 'yes' : 'no',
          unlocked: SHELL.locked() ? 'no' : 'yes',
          'is-userspace': 'no',
          'max-download-size': '0x10000000'
        };
        if (name === 'all') {
          Object.keys(vars).forEach(k => {
            ctx.push(ctx.line('(bootloader) ' + k + ': ' + vars[k], K.out));
          });
          ctx.push(ctx.line('all: Done!', K.ok));
        } else if (vars[name] !== undefined) {
          ctx.push(ctx.line('(bootloader) ' + name + ': ' + vars[name], K.out));
          ctx.push(ctx.line(name + ': Done!', K.ok));
        } else {
          ctx.push(ctx.line('getvar: unknown variable "' + name + '"', K.err));
        }
        return;
      }
      case 'flash': {
        if (!SHELL.requireMode(ctx, 'fastboot', '请先在 fastboot 模式执行「命令行（Shell）」再刷写')) return;
        const part = (ctx.args[2] || '').toLowerCase();
        if (!part) { ctx.push(ctx.line('usage: fastboot flash <partition> [file]', K.err)); return; }
        if (SHELL.locked()) {
          ctx.push(ctx.line('FAILED (remote: Flashing is not allowed for locked devices)', K.err));
          ctx.push(ctx.line('提示：先 fastboot flashing unlock 解锁后重试。', K.warn));
          return;
        }
        SHELL.prodLines(ctx);
        return;
      }
      case 'erase': {
        if (!SHELL.requireMode(ctx, 'fastboot', '请先在 fastboot 模式执行「命令行（Shell）」再擦除')) return;
        const part = (ctx.args[2] || '').toLowerCase();
        if (!part) { ctx.push(ctx.line('usage: fastboot erase <partition>', K.err)); return; }
        if (SHELL.locked()) {
          ctx.push(ctx.line('FAILED (remote: Erase is not allowed for locked devices)', K.err));
          return;
        }
        ctx.push(ctx.line('Erasing \'' + part + '1\' ...', K.out));
        ctx.push(ctx.line('OKAY [  0.154s]', K.ok));
        ctx.push(ctx.line('Finished. Total time: 0.155s', K.ok));
        return;
      }
      case 'flashing':
      case 'oem': {
        // fastboot flashing unlock / fastboot oem unlock
        const op = (ctx.args[2] || '').toLowerCase();
        if (op === 'unlock') { SHELL._unlock(ctx); return; }
        if (op === 'lock') { SHELL._lockCtx(ctx); return; }
        ctx.push(ctx.line('usage: fastboot flashing unlock|lock', K.err));
        return;
      }
      case 'reboot-bootloader':
        ctx.push(ctx.line('rebooting into bootloader...', K.ok));
        setTimeout(() => OS.state.transition('boot', { source: 'shell:fastboot:reboot-bootloader', stayBootloader: true }), 650);
        return;
      case 'reboot':
        if ((ctx.args[2] || '').toLowerCase() === 'recovery') {
          ctx.push(ctx.line('rebooting into recovery...', K.ok));
          setTimeout(() => OS.state.transition('recovery', { source: 'shell:fastboot:reboot-recovery' }), 650);
        } else {
          ctx.push(ctx.line('rebooting...', K.ok));
          setTimeout(() => OS.state.transition('boot', { source: 'shell:fastboot:reboot' }), 650);
        }
        return;
      case 'help':
      case '':
        ctx.push(ctx.line('usage: fastboot <devices|getvar all|flash <part>|erase <part>|flashing unlock|reboot-bootloader>', K.sys));
        return;
      default:
        ctx.push(ctx.line('fastboot: unknown subcommand "' + sub + '"', K.err));
        ctx.push(ctx.line('usage: fastboot <devices|getvar|flash|erase|flashing|reboot-bootloader>', K.out));
    }
  };

  SHELL._unlock = function (ctx) {
    if (!SHELL.requireMode(ctx, 'fastboot', '解锁需在 fastboot 模式执行')) return;
    if (!SHELL.locked()) { ctx.push(ctx.line('Device is already unlocked.', K.ok)); return; }
    ctx.push(ctx.line('(bootloader) Check device console for confirmation...', K.out));
    ctx.push(ctx.line('(bootloader) PENDING', K.out));
    ctx.push(ctx.line('WARNING: Unlocking the bootloader allows flashing unsigned images.', K.warn));
    ctx.push(ctx.line('         It also WIPES all user data on the device!', K.warn));
    ctx.push(ctx.line('OKAY [  0.198s]', K.ok));
    ctx.push(ctx.line('Finished. Total time: 0.199s', K.ok));
    SHELL.setLocked(false);
    ctx.push(ctx.line('Bootloader unlocked. verified boot state -> orange.', K.ok));
  };
  SHELL._lockCtx = function (ctx) {
    if (!SHELL.requireMode(ctx, 'fastboot')) return;
    if (SHELL.locked()) { ctx.push(ctx.line('Device is already locked.', K.ok)); return; }
    ctx.push(ctx.line('OKAY [  0.214s]', K.ok));
    SHELL.setLocked(true);
    ctx.push(ctx.line('Bootloader locked.', K.ok));
  };

  /* 便捷命令（供演示 / 工程模式菜单复用） */
  SHELL.register({
    name: 'unlock',
    desc: '解锁 Bootloader（等价 fastboot flashing unlock，演示便捷口）',
    usage: 'unlock',
    run(ctx) { SHELL._unlock(ctx); }
  });
  SHELL.register({
    name: 'lock',
    desc: '重新上锁 Bootloader',
    usage: 'lock',
    run(ctx) { SHELL._lockCtx(ctx); }
  });

  /* ==================== adb 命令族 ==================== */

  SHELL.register({
    name: 'adb',
    desc: 'adb 调试桥（sideload 需 recovery 模式）',
    usage: 'adb <devices|reboot|sideload>',
    run(ctx) { return SHELL._adb(ctx); }
  });

  SHELL._adb = function (ctx) {
    const sub = (ctx.args[1] || '').toLowerCase();
    const serial = SHELL.serialno();

    switch (sub) {
      case 'devices':
        ctx.push(ctx.line('List of devices attached', K.sys));
        if (SHELL.inMode('recovery')) {
          ctx.push(ctx.line(serial + '\trecovery', K.out));
        } else {
          ctx.push(ctx.line(serial + '\tdevice', K.out));
        }
        return;
      case 'reboot': {
        const t = (ctx.args[2] || 'system').toLowerCase();
        const target = { system: 'boot', bootloader: 'boot', recovery: 'recovery', fastboot: 'fastboot' }[t];
        if (!target) { ctx.push(ctx.line(`adb: unknown reboot target "${t}"`, K.err)); return; }
        ctx.push(ctx.line('adb: rebooting', K.ok));
        setTimeout(() => OS.state.transition(target, { source: 'shell:adb:reboot', stayBootloader: t === 'bootloader' }), 650);
        return;
      }
      case 'sideload': {
        const file = ctx.args[2] || '';
        if (!SHELL.requireMode(ctx, 'recovery', 'sideload 需在 recovery 模式的「命令行（Shell）」中执行')) return;
        if (!file) { ctx.push(ctx.line('usage: adb sideload <ota.zip>', K.err)); return; }
        ctx.push(ctx.line('serving: \'' + file + '\'  (~ ' + Math.floor(Math.random() * 400 + 128) + ' MB)', K.out));
        const u = SHELL.updater.start(file);
        if (u.error) { ctx.push(ctx.line(u.error, K.err)); return; }
        u.onTick((p) => {
          ctx.push(ctx.line('verifying package... ' + p + '%', K.out));
        });
        u.onDone(() => {
          ctx.push(ctx.line('Total xfer: 1.00x', K.ok));
          ctx.push(ctx.line('Package applied successfully. Rebooting...', K.ok));
          setTimeout(() => OS.state.transition('boot', { source: 'shell:adb:sideload-done' }), 800);
        });
        return;
      }
      case 'help':
      case '':
        ctx.push(ctx.line('usage: adb <devices|reboot [target]|sideload <file>>', K.sys));
        return;
      default:
        ctx.push(ctx.line('adb: unknown subcommand "' + sub + '"', K.err));
        ctx.push(ctx.line('usage: adb <devices|reboot|sideload>', K.out));
    }
  };

  OS.reg('shell', SHELL);
})(window);

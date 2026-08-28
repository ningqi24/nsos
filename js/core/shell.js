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

    // OTA 更新源：线上 ota 目录地址，相对「当前页面路径」动态推导
    // （如页面部署在 https://<host>/nsos/ 则源为 https://<host>/nsos/ota/）。
    // 不使用写死的服务器 /ota/，子路径 / 根路径部署均可自适应。
    otaSource() {
      try {
        if (typeof location !== 'undefined' && location.href) {
          const dir = location.href.slice(0, location.href.lastIndexOf('/') + 1);
          const u = new URL('ota/', dir);
          return u.href.endsWith('/') ? u.href : u.href + '/';
        }
      } catch (e) { /* 非浏览器环境回退相对路径 */ }
      return 'ota/';
    },

    // 环境变量（真实持久化到 OS.storage，export/unset 可改）
    env: Object.assign({
      PATH: '/bin:/sbin',
      HOME: '/sdcard/Documents',
      USER: 'root',
      SHELL: '/bin/sh',
      TERM: 'xterm-256color'
    }, (function () {
      try { return (OS.storage && OS.storage.get('env', {})) || {}; } catch (e) { return {}; }
    })()),
    _saveEnv() {
      try { if (OS.storage) OS.storage.set('env', this.env); } catch (e) { /* 忽略 */ }
    },
    _hist: [], // 会话命令历史（history 命令读取）

    // 命令别名（持久化到 OS.storage，alias/unalias 可改）
    _alias: Object.assign({}, (function () {
      try { return (OS.storage && OS.storage.get('alias', {})) || {}; } catch (e) { return {}; }
    })()),
    _saveAlias() {
      try { if (OS.storage) OS.storage.set('alias', this._alias); } catch (e) { /* 忽略 */ }
    },
    // 递归展开行首别名（防环，深度上限 16）
    _expandAlias(line) {
      let cur = String(line || '').trim();
      const seen = new Set();
      for (let i = 0; i < 16; i++) {
        const m = /^(\S+)([\s\S]*)$/.exec(cur);
        if (!m) break;
        const head = m[1];
        if (!this._alias[head] || seen.has(head)) break;
        seen.add(head);
        cur = String(this._alias[head] + ' ' + m[2]).trim();
      }
      return cur;
    },

    /* ---------- Tab 补全 ---------- */
    _pathEntities() {
      const set = new Set();
      const V = this.VFS || (typeof VFS !== 'undefined' ? VFS : null);
      if (V) {
        Object.keys(V.tree).forEach(d => {
          set.add(d);
          (V.tree[d] || []).forEach(ent => {
            if (!/\/$/.test(ent)) set.add((d.endsWith('/') ? d : d + '/') + ent);
          });
        });
        Object.keys(V.userFiles).forEach(p => set.add(p));
        Object.keys(V.userDirs).forEach(p => set.add(p));
      }
      return [...set];
    },
    // 命令位补全命令/别名；参数位补全 VFS 路径（目录 / 文件 / 动态虚拟节点）
    complete(prefix) {
      const p = (prefix || '').trimEnd();
      const words = p.split(/\s+/);
      const last = words[words.length - 1] || '';
      const isCmdPos = words.length <= 1 && p.indexOf(' ') < 0 && p.indexOf('/') < 0;
      if (isCmdPos) return [...this.cmds.keys()].filter(n => n.startsWith(last)).sort();
      const known = this._pathEntities();
      const direct = known.filter(x => x.startsWith(last) && x !== last).sort();
      if (direct.length) return direct;
      const dir = /\/$/.test(last) ? last : last + '/';
      if (known.includes(dir)) {
        const kids = known
          .filter(x => x.startsWith(dir) && x !== dir.replace(/\/$/, ''))
          .sort();
        if (kids.length) return kids;
      }
      return [];
    },

    line(text, kind) {
      const o = { text: String(text), kind: kind || K.out };
      o.toString = () => o.text;
      return o;
    },

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

    /* 解析命令行（支持单双引号包裹带空格参数；引号对合并进当前 token，如 k='v with space'） */
    parse(line) {
      const tokens = [];
      let buf = '';
      let q = null; // 当前引号类型：' 或 "
      const flush = () => { if (buf) { tokens.push(buf); buf = ''; } };
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
          if (c === q) q = null;
          else buf += c;
          continue;
        }
        if (c === "'" || c === '"') { q = c; continue; }
        if (/\s/.test(c)) { flush(); continue; }
        buf += c;
      }
      flush();
      return tokens;
    },

    /* ---------- 执行一行命令 ----------
     * 支持：管道 | 重定向 > >> 后台 & 环境变量 $VAR 展开 相对路径(cwd)
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

      const rawIn = (input || '').trim();
      if (!rawIn) return { code: 0, lines };
      this._hist.push(rawIn);
      if (this._hist.length > 200) this._hist.shift();
      let raw = this._expandAlias(rawIn);

      // 后台任务（& 结尾）
      if (/&+\s*$/.test(raw)) {
        const body = raw.replace(/&+\s*$/, '').trim();
        if (body) {
          this._runBackground(body, (l) => { push(l); onLine(l); });
          return { code: 0, lines };
        }
      }

      // 管道分段
      const segs = this._splitPipe(raw);
      let stdin = null;
      let exitCode = 0;

      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si];
        if (!seg) continue;
        const isLast = si === segs.length - 1;
        const args = this.parse(this._expandEnv(seg));
        if (args.length === 0) continue;
        const redir = this._extractRedirect(args);
        if (redir.args.length === 0) continue;

        const segLines = [];
        const pctx = {
          args: redir.args, raw: seg, shell: this, stdin,
          job: (hooks && hooks.job) || null,
          cwd: () => this._cwd,
          push: (l) => {
            const ll = (typeof l === 'string') ? this.line(l) : l;
            String(ll.text).split('\n').forEach((p, i, arr) => {
              if (p === '' && i === arr.length - 1) return; // 末尾换行不产生空行
              segLines.push(this.line(p, ll.kind || K.out));
            });
            return ll;
          },
          line: (t, k) => this.line(t, k)
        };

        const name = redir.args[0].toLowerCase();
        const def = this.cmds.get(name);
        if (!def) {
          const ll = this.line(`sh: ${name}: command not found`, K.err);
          if (isLast && !redir.out.length && !redir.app.length) push(ll);
          exitCode = 127;
          continue;
        }

        try {
          const ret = await def.run(pctx);
          if (ret !== undefined && ret !== null) {
            const arr = Array.isArray(ret) ? ret : [ret];
            arr.forEach(l => pctx.push(l));
          }
        } catch (e) {
          const ll = this.line(`sh: ${name}: ${(e && e.message) || e}`, K.err);
          if (isLast) push(ll);
          exitCode = 1;
          continue;
        }

        // 重定向写文件（不显示到 stdout）
        if (redir.out.length || redir.app.length) {
          const text = segLines.map(l => l.text).join('\n') + (segLines.length ? '\n' : '');
          redir.out.forEach(t => this.VFS._writeFile(this._resolvePath(t), text, false));
          redir.app.forEach(t => this.VFS._writeFile(this._resolvePath(t), text, true));
        } else if (isLast) {
          segLines.forEach(l => push(l));
        }

        // stdout 传递给下段（stdin）
        stdin = segLines.map(l => l.text);
      }

      if (!lines.length && stdin !== null && stdin.length && !segs.length) { /* noop */ }
      return { code: exitCode, lines };
    },

    /* 按管道符分割（忽略引号内） */
    _splitPipe(line) {
      const parts = [];
      let cur = '', quote = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
          cur += ch;
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch; cur += ch;
        } else if (ch === '|') {
          parts.push(cur); cur = '';
        } else {
          cur += ch;
        }
      }
      parts.push(cur);
      return parts.map(s => s.trim()).filter(Boolean);
    },

    /* 展开 $VAR / ${VAR}（环境变量） */
    _expandEnv(text) {
      return text.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (m, name) => {
        if (this.env[name] !== undefined) return this.env[name];
        if (name === 'PWD') return this._cwd;
        return ''; // 未定义变量展开为空串（符合 POSIX）
      });
    },

    /* 提取重定向 > >> （从 args 尾部/任意处剥离目标） */
    _extractRedirect(args) {
      const rest = [];
      const out = [], app = [];
      let i = 0;
      while (i < args.length) {
        const t = args[i];
        if (t === '>' || t === '>>') {
          const target = args[i + 1];
          if (target === undefined) { rest.push(t); i++; break; }
          (t === '>' ? out : app).push(target);
          i += 2;
        } else {
          rest.push(t);
          i += 1;
        }
      }
      return { args: rest, out, app };
    },

    /* 当前工作目录 */
    _cwd: '/',

    /* 绝对路径化 + 规范化（支持 .. . ~） */
    _resolvePath(p) {
      let path = (p || '/').trim() || '/';
      if (path === '~') path = this.env.HOME || '/sdcard/Documents';
      if (path[0] !== '/') path = (this._cwd === '/' ? '' : this._cwd) + '/' + path;
      const parts = [];
      path.split('/').forEach(seg => {
        if (!seg || seg === '.') return;
        if (seg === '..') parts.pop();
        else parts.push(seg);
      });
      return '/' + parts.join('/');
    },

    /* ---------- 后台任务（& / jobs / kill / wait / ps） ---------- */
    _bgNext: 1,
    _bgJobs: new Map(),

    _runBackground(command, onLine) {
      const job = {
        pid: this._bgNext++,
        cmd: command,
        state: 'running',       // running | done | killed | stopped
        ts: Date.now(),
        output: [],
        _sleepTimers: new Set()
      };
      job._done = new Promise(r => { job._finish = r; });
      job._resume = new Promise(r => { job._go = r; });
      this._bgJobs.set(job.pid, job);
      if (onLine) onLine(this.line(`[${job.pid}] ${command} &`, K.sys));
      (async () => {
        try {
          const ctx2 = {
            job,
            consumeSleep(t) { job._sleepTimers.add(t); return job; }
          };
          const res = await this.exec(command, {
            job,
            onLine: (l) => {
              job.output.push(l);
              if (job.killed || job.state === 'killed' || job.state === 'stopped') return;
              if (onLine && onLine._bg !== false) onLine(l);
            }
          });
          if (job.state === 'killed') { job._finish(); return; }
          job.state = 'done';
          job._finish();
          if (onLine) onLine(this.line(`[${job.pid}] done (exit ${res.code})`, K.sys));
        } catch (e) {
          job.state = 'done';
          job._finish();
          if (onLine) onLine(this.line(`[${job.pid}] finished with error`, K.err));
        }
      })();
      return job;
    },

    /* 作业信号派发：TERM/KILL → killed，STOP/TSTP → stopped，CONT → running */
    _signalJob(pid, sig) {
      const job = this._bgJobs.get(pid);
      if (!job) return null;
      const s = String(sig || 'TERM').replace(/^SIG/, '').replace(/^-/, '').toUpperCase();
      if (s === 'STOP' || s === 'TSTP' || s === '19') {
        if (job.state !== 'running') return { job, action: 'noop', state: job.state };
        job.state = 'stopped';
        job._sleepTimers.forEach(t => clearTimeout(t));
        job._sleepTimers.clear();
        return { job, action: 'stopped' };
      }
      if (s === 'CONT' || s === '18') {
        if (job.state !== 'stopped') return { job, action: 'noop', state: job.state };
        job.state = 'running';
        if (job._go) job._go();
        return { job, action: 'resumed' };
      }
      /* KILL / TERM / 9 / 默认：终止 */
      job.state = 'killed';
      job._sleepTimers.forEach(t => clearTimeout(t));
      job._sleepTimers.clear();
      if (job._finish) job._finish();
      return { job, action: 'killed' };
    },

    _killJob(pid, sig) {
      return !!this._signalJob(pid, sig);
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
        ['battery', d.battery], ['charging', d.charging], ['batteryAPI', d.batteryAPI],
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
    desc: '回显文本（-n 不换行）',
    usage: 'echo [-n] <text>',
    run(ctx) {
      const noNl = ctx.args[1] === '-n';
      const body = ctx.args.slice(noNl ? 2 : 1).join(' ');
      ctx.push(ctx.line(noNl ? body : body, K.out));
    }
  });

  SHELL.register({
    name: 'version',
    desc: '显示系统版本',
    usage: 'version',
    run(ctx) {
      const v = OS.version;
      ctx.push(ctx.line(`nsos b${v.major}.${v.minor}.${v.build} "${v.codename}"`, K.ok));
    }
  });

  SHELL.register({
    name: 'ota',
    desc: '系统更新（check / list / apply / cache，更新源为线上 https://当前路径/ota/；cache 为浏览器本地缓存更新）',
    usage: 'ota check | ota list | ota source | ota apply <package.zip> | ota cache [apply <url>]',
    run(ctx) {
      const sub = (ctx.args[1] || 'check').toLowerCase();
      const source = SHELL.otaSource();
      const parseV = (name) => {
        const m = /^nsos-ota-[vb]?(\d+)\.(\d+)\.(\d+)\.zip$/.exec(name);
        return m ? { major: +m[1], minor: +m[2], build: +m[3], s: name } : null;
      };
      const newerThan = (a, b) => a.major > b.major ||
        (a.major === b.major && a.minor > b.minor) ||
        (a.major === b.major && a.minor === b.minor && a.build > b.build);
      const sdcard = VFS.tree['/sdcard'] || [];
      const pkgs = sdcard.map(parseV).filter(Boolean).sort((a, b) => a.major - b.major || a.minor - b.minor || a.build - b.build);

      if (sub === 'list') {
        ctx.push(ctx.line('OTA 源: ' + source + '  （线上 https://当前路径/ota/）', K.sys));
        if (!pkgs.length) { ctx.push(ctx.line('ota: /sdcard 无更新包', K.out)); return; }
        pkgs.forEach(p => ctx.push(ctx.line(p.s + '   v' + p.major + '.' + p.minor + '.' + p.build + '  →  ' + source + p.s, K.out)));
        return;
      }
      if (sub === 'source') {
        ctx.push(ctx.line('OTA 源（线上）: ' + source, K.ok));
        ctx.push(ctx.line('说明: 更新包从线上 ota 目录选取，非服务器 /ota/ 固定路径。', K.out));
        return;
      }
      if (sub === 'check') {
        ctx.push(ctx.line('OTA 源: ' + source + '  （线上 https://当前路径/ota/）', K.sys));
        if (!pkgs.length) { ctx.push(ctx.line('ota: 线上 ota 源无更新包 / /sdcard 无更新包', K.out)); return; }
        const latest = pkgs[pkgs.length - 1];
        const cur = OS.version;
        if (newerThan(latest, cur)) {
          ctx.push(ctx.line(`可更新: v${latest.major}.${latest.minor}.${latest.build}（当前 v${cur.major}.${cur.minor}.${cur.build}）`, K.warn));
          ctx.push(ctx.line('可下载: ' + source + latest.s, K.out));
          ctx.push(ctx.line('可执行: ota apply ' + latest.s + '  （刷写需先 reboot recovery）', K.out));
        } else {
          ctx.push(ctx.line(`已是最新版本 v${cur.major}.${cur.minor}.${cur.build}`, K.ok));
        }
        return;
      }
      if (sub === 'cache') {
        const local = OS.ota && OS.ota.local;
        if (!local) { ctx.push(ctx.line('ota cache: 当前环境不支持 Service Worker / Cache API', K.err)); return; }
        if (ctx.args[2] === 'apply') {
          const url = ctx.args[3];
          if (!url) { ctx.push(ctx.line('usage: ota cache apply <http.../xxx.zip>', K.err)); return; }
          ctx.push(ctx.line('从线上获取 OTA 包并替换本地缓存（可升级 / 降级）...', K.out));
          local.applyFromUrl(url).then((r) => {
            ctx.push(ctx.line('已应用 ' + r.ver + '（' + r.fileCount + ' 个文件），刷新页面生效', K.ok));
          }).catch((e) => {
            ctx.push(ctx.line('应用失败: ' + (e && e.message ? e.message : e), K.err));
          });
          return;
        }
        ctx.push(ctx.line('本地缓存版本: ' + (local.cachedVersion() || '未初始化'), K.out));
        ctx.push(ctx.line('支持: ' + (local.supported() ? '是（Service Worker 可用）' : '否（需 HTTPS）'), K.out));
        local.precacheReady().then((ready) => {
          ctx.push(ctx.line('离线缓存就绪: ' + (ready ? '是（cache-first 只读缓存）' : '否（首次全量缓存进行中）'), K.ok));
        });
        return;
      }
      if (sub === 'apply') {
        const f = ctx.args[2];
        if (!f) { ctx.push(ctx.line('usage: ota apply <package.zip>', K.err)); return; }
        if (OS.state.current !== 'recovery') {
          ctx.push(ctx.line('ota: apply 仅在 recovery 模式可用，请先执行 reboot recovery', K.err));
          return;
        }
        if (!sdcard.includes(f)) { ctx.push(ctx.line('ota: /sdcard 上不存在该更新包: ' + f, K.err)); return; }
        const p = parseV(f);
        if (!p) { ctx.push(ctx.line('ota: 无效的更新包名: ' + f, K.err)); return; }
        const cur = OS.version;
        if (!newerThan(p, cur)) { ctx.push(ctx.line('ota: 更新包版本（v' + p.major + '.' + p.minor + '.' + p.build + '）不高于当前版本，已拒绝', K.err)); return; }
        const u = SHELL.updater.start('OTA apply ' + p.s);
        if (u.error) { ctx.push(ctx.line(u.error, K.err)); return; }
        u.onDone(() => {
          ctx.push(ctx.line('Payload verified. Applying...', K.out));
          ctx.push(ctx.line('OTA ' + p.s + ' -> v' + p.major + '.' + p.minor + '.' + p.build + ' applied OK', K.ok));
          REC.add('I', 'OTA applied ' + p.s + ' (v' + p.major + '.' + p.minor + '.' + p.build + ')');
          ctx.push(ctx.line('Rebooting...', K.out));
        });
        return;
      }
      ctx.push(ctx.line('usage: ota check|list|apply <file.zip>', K.err));
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

  /* ==================== 虚拟文件系统（轻量，挂载状态真实可验证） ====================
   * 分区挂载状态是真实状态：/system /cache 可由 mount / wipe cache 驱动，
   * ls / cat / df 均按当前挂载与内容输出，不写死。 */

  // Recovery 会话日志（真实事件记录，show-log / cat /cache/recovery.log 共用）
  const REC = {
    lines: [],
    add(kind, text) {
      const ts = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = '[' + pad(ts.getHours()) + ':' + pad(ts.getMinutes()) + ':' + pad(ts.getSeconds()) + ']';
      this.lines.push(stamp + ' ' + (kind ? '[' + kind + '] ' : '') + text);
      if (this.lines.length > 200) this.lines.shift();
      return text;
    }
  };
  SHELL.rec = REC;

  const VFS = {
    mount: { '/': true, '/proc': true, '/sdcard': true, '/system': false, '/cache': false },

    // 用户可写文件（路径 → { content, mode, mtime }），touch/echo>/cp/mv 真实落此
    userFiles: Object.create(null),
    // 用户新建目录（路径 → true），mkdir 真实创建
    userDirs: Object.create(null),
    _loads: 0, // 本次会话已从持久化恢复的次数

    _loadPersisted() {
      if (this._loads) return;
      this._loads = 1;
      try {
        const snap = OS.storage && OS.storage.get('vfs', null);
        if (snap && snap.files) {
          this.userFiles = Object.create(null);
          Object.keys(snap.files).forEach(k => { this.userFiles[k] = snap.files[k]; });
          if (snap.dirs) { this.userDirs = Object.create(null); snap.dirs.forEach(d => { this.userDirs[d] = true; }); }
        }
      } catch (e) { /* 忽略 */ }
    },
    _persist() {
      try {
        if (!OS.storage) return;
        const files = {};
        Object.keys(this.userFiles).forEach(k => { files[k] = this.userFiles[k]; });
        OS.storage.set('vfs', { files, dirs: Object.keys(this.userDirs) });
      } catch (e) { /* 忽略 */ }
    },

    cache: { used: 0, entries: 0, primed: false }, // /cache 占用（可被 wipe cache 真实清空）
    // 进入 recovery 时给 /cache 注入真实存在的缓存数据（来自系统运行期累积）
    primeCache() {
      if (this.cache.primed) return;
      this.cache.primed = true;
      // 模拟系统运行产生的缓存文件（打包缓存/临时文件/OTA stub）
      this.cache.entries = 3;
      this.cache.used = 24; // MB
      REC.add('I', 'cache partition contains ' + this.cache.entries + ' cached files (' + this.cache.used + ' MB)');
    },
    tree: {
      '/': ['system/', 'proc/', 'sdcard/', 'cache/'],
      '/system': ['version', 'build.prop'],
      '/proc': ['version', 'cmdline', 'uptime', 'filesystems', 'mounts'],
      '/sdcard': ['nsos-ota-b0.1.9.zip', 'Documents/'],
      '/sdcard/Documents': ['bootloader-unlock-guide.txt', 'README.txt'],
      '/cache': ['recovery.log']
    },
    mountTouched: false, // 本次会话是否发生过 mount 动作（供日志）
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
      '/proc/uptime': () => String(Math.floor((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) % 86400) + ' 2.13',
      '/proc/filesystems': () => 'ext4\nsquashfs\noverlay\nf2fs',
      '/proc/mounts': () => {
        const lines = [
          '/dev/root / ext4 ro,seclabel,relatime 0 0',
          'tmpfs /dev tmpfs rw,seclabel,nosuid 0 0',
          'devpts /dev/pts devpts rw 0 0'
        ];
        if (VFS.mount['/proc']) lines.push('/proc /proc proc rw,relatime 0 0'.replace('/proc ', 'procfs /proc '));
        if (VFS.mount['/system']) lines.push('/dev/block/mmcblk0p26 /system ext4 ro,seclabel 0 0');
        if (VFS.mount['/cache']) lines.push('/dev/block/mmcblk0p27 /cache ext4 rw,seclabel 0 0');
        if (VFS.mount['/sdcard']) lines.push('/dev/block/mmcblk0p28 /sdcard vfat rw 0 0');
        return lines.join('\n');
      },
      '/cache/recovery.log': () => (REC.lines.length ? REC.lines.join('\n') : '(empty)')
    },

    // 目录项（合并静态 tree + 用户文件 + 用户目录）
    _listDir(path) {
      const names = {};
      (this.tree[path] || []).forEach(en => { names[en] = (en.endsWith('/') ? 'dir' : 'static'); });
      const prefix = path === '/' ? '/' : path + '/';
      Object.keys(this.userFiles).forEach(p => {
        if (p.indexOf(prefix) !== 0) return;
        const rest = p.slice(prefix.length);
        const seg = rest.split('/')[0];
        if (rest.indexOf('/') === -1) names[seg] = 'file';
        else names[seg + '/'] = 'dir';
      });
      Object.keys(this.userDirs).forEach(p => {
        if (p.indexOf(prefix) !== 0) return;
        const rest = p.slice(prefix.length);
        const seg = rest.split('/')[0];
        if (rest.indexOf('/') === -1) names[seg + '/'] = 'dir';
      });
      return Object.keys(names).sort();
    },

    /* 写文件（真实写入 userFiles，:: 追加用 append） */
    _writeFile(path, content, append) {
      path = SHELL._resolvePath(path);
      const mp = this.mountPoint(path);
      if (mp !== '/' && mp !== '/sdcard') {
        return { ok: false, err: path + ': Read-only file system' };
      }
      if (this.files[path] || this.tree[path]) {
        return { ok: false, err: path + ': Read-only file system' };
      }
      if (this.userDirs[path]) {
        return { ok: false, err: path + ': Is a directory' };
      }
      const prev = this.userFiles[path];
      this.userFiles[path] = {
        content: append && prev ? prev.content + String(content) : String(content),
        mode: prev ? prev.mode : 'rw-r--r--',
        mtime: Date.now()
      };
      // 保证父目录存在（用户文件系统的父目录自动建立）
      const parts = path.split('/');
      parts.pop();
      let cur = '';
      parts.forEach(seg => {
        if (!seg) return;
        cur += '/' + seg;
        if (cur !== path && cur !== '/' && this.mountPoint(cur) !== '/sdcard') this.userDirs[cur] = true;
      });
      this._persist();
      return { ok: true, path };
    },

    _mkdir(path) {
      path = SHELL._resolvePath(path);
      const mp = this.mountPoint(path);
      if (mp !== '/' && mp !== '/sdcard') return { ok: false, err: path + ': Read-only file system' };
      if (this.tree[path] || this.files[path]) return { ok: false, err: `mkdir: ${path}: File exists` };
      if (this.userFiles[path]) return { ok: false, err: `mkdir: ${path}: File exists` };
      this.userDirs[path] = true;
      this._persist();
      return { ok: true, path };
    },

    _rmdir(path) {
      path = SHELL._resolvePath(path);
      if (this.tree[path]) return { ok: false, err: `rmdir: ${path}: Permission denied` };
      if (!this.userDirs[path]) return { ok: false, err: `rmdir: ${path}: No such file or directory` };
      const kids = this._listDir(path);
      if (kids.length) return { ok: false, err: `rmdir: ${path}: Directory not empty` };
      delete this.userDirs[path];
      this._persist();
      return { ok: true, path };
    },

    _rm(path, recursive) {
      path = SHELL._resolvePath(path);
      if (path === '/' || path === '/sdcard' || path === '/proc' || path === '/cache' || path === '/system') {
        return { ok: false, err: `rm: ${path}: cannot remove (system mount)` };
      }
      if (this.tree[path] || this.files[path]) return { ok: false, err: `rm: ${path}: Read-only file system` };
      const locked = this.userFiles[path];
      const isDir = !!this.userDirs[path];
      if (!locked && !isDir) return { ok: false, err: `rm: ${path}: No such file or directory` };
      if (isDir && !recursive) {
        const kids = this._listDir(path);
        if (kids.length) return { ok: false, err: `rm: ${path}: Is a directory (use -r)` };
      }
      delete this.userFiles[path];
      delete this.userDirs[path];
      if (recursive) {
        const prefix = path === '/' ? '/' : path + '/';
        Object.keys(this.userFiles).forEach(p => { if (p.indexOf(prefix) === 0) delete this.userFiles[p]; });
        Object.keys(this.userDirs).forEach(p => { if (p.indexOf(prefix) === 0) delete this.userDirs[p]; });
      }
      this._persist();
      return { ok: true, path };
    },

    _readFile(path) {
      path = SHELL._resolvePath(path);
      const fn = this.files[path];
      if (fn) return { ok: true, content: String(fn()) };
      const uf = this.userFiles[path];
      if (uf) return { ok: true, content: uf.content, mode: uf.mode, mtime: uf.mtime };
      if (this.userDirs[path]) return { ok: false, err: path + ': Is a directory' };
      return { ok: false, err: `cat: ${path}: No such file or directory` };
    },

    _stat(path) {
      path = SHELL._resolvePath(path);
      if (this.tree[path] || this.userDirs[path]) return { dir: true };
      if (this.files[path]) return { dir: false, mode: 'r--r--r--' };
      const uf = this.userFiles[path];
      if (uf) return { dir: false, mode: uf.mode, size: uf.content.length, mtime: uf.mtime };
      return null;
    },

    resolve(p) { return SHELL._resolvePath(p || '/'); },
    mountPoint(path) {
      if (path === '/system' || path.indexOf('/system/') === 0) return '/system';
      if (path === '/cache' || path.indexOf('/cache/') === 0) return '/cache';
      if (path === '/proc' || path.indexOf('/proc/') === 0) return '/proc';
      if (path === '/sdcard' || path.indexOf('/sdcard/') === 0) return '/sdcard';
      return '/';
    }
  };
  VFS._loadPersisted();
  SHELL.VFS = VFS;

  // 分区大小表（真实计算 cache 占用，其余固定）
  const PART_SIZE = {
    root: 64, system: 3072, cache: 128, userdata: 32768, sdcard: 30720
  };

  SHELL.register({
    name: 'ls',
    desc: '列出目录内容（含 -l 长格式：权限/大小/时间）',
    usage: 'ls [-l] [dir]',
    run(ctx) {
      const long = ctx.args.includes('-l');
      const target = ctx.args.slice(1).find(a => a !== '-l');
      const path = VFS.resolve(target || '.');
      const mp = VFS.mountPoint(path);
      if (mp !== '/' && !VFS.mount[mp]) {
        ctx.push(ctx.line(`ls: ${path}: ${mp} is not mounted`, K.err));
        return;
      }
      const st = VFS._stat(path);
      if (!st) { ctx.push(ctx.line(`ls: ${path}: No such file or directory`, K.err)); return; }
      if (!st.dir) {
        const r = VFS._readFile(path);
        ctx.push(ctx.line((long ? st.mode + '  ' + path + '\n' : '') + (r.ok ? '  ' + path : ''), K.out));
        return;
      }
      const entries = VFS._listDir(path);
      if (long) {
        entries.forEach(en => {
          const full = (path === '/' ? '/' : path + '/') + en.replace(/\/$/, '');
          const s = VFS._stat(full);
          if (s && s.dir) { ctx.push(ctx.line('drwxr-xr-x  root     root        0  ' + en, K.out)); return; }
          const size = s && s.size !== undefined ? s.size : 0;
          const mode = s ? s.mode : 'rw-r--r--';
          const mt = s && s.mtime ? new Date(s.mtime).toISOString().replace('T', ' ').slice(0, 19) : '2026-08-23 00:00:00';
          ctx.push(ctx.line(mode + '  root     root  ' + String(size).padStart(9) + '  ' + mt + '  ' + en, K.out));
        });
      } else {
        entries.forEach(en => ctx.push(ctx.line(en.replace(/\/$/, '/'), K.out)));
      }
    }
  });

  SHELL.register({
    name: 'cat',
    desc: '读取文件内容（可带 -n 行号）',
    usage: 'cat [-n] <file>',
    run(ctx) {
      const num = ctx.args.includes('-n');
      const p = ctx.args.slice(1).find(a => a !== '-n');
      if (!p) { ctx.push(ctx.line('usage: cat <file>', K.err)); return; }
      const path = VFS.resolve(p);
      const mp = VFS.mountPoint(path);
      if (mp !== '/' && !VFS.mount[mp]) {
        ctx.push(ctx.line(`cat: ${p}: ${mp} is not mounted`, K.err));
        return;
      }
      if (path.endsWith('.zip')) { ctx.push(ctx.line('cat: binary file', K.err)); return; }
      const r = VFS._readFile(path);
      if (!r.ok) { ctx.push(ctx.line(r.err, K.err)); return; }
      const body = String(r.content).split('\n');
      body.forEach((l, i) => {
        ctx.push(ctx.line(num ? String(i + 1).padStart(4) + '\t' + l : l, K.out));
      });
    }
  });

  SHELL.register({
    name: 'df',
    desc: '查看分区挂载与占用（含 /cache 真实占用）',
    usage: 'df [-h]',
    run(ctx) {
      const MB = [['/', 'root', 'squashfs', 0, PART_SIZE.root], ['/system', 'system', 'ext4', 0, PART_SIZE.system], ['/cache', 'cache', 'ext4', VFS.cache.used, PART_SIZE.cache], ['/sdcard', 'sdcard', 'vfat', 120, PART_SIZE.sdcard]];
      ctx.push(ctx.line('Filesystem      Mounted    Used   Size  Mounted on', K.sys));
      MB.forEach(([name, dev, fs, used, size]) => {
        const mnt = VFS.mount[name] ? '' : ' (unmounted)';
        ctx.push(ctx.line(String(dev).padEnd(9) + String(fs).padEnd(7) + String(used).padEnd(6) + 'MB' + String(size) + 'MB' + mnt, K.out));
      });
    }
  });

  /* ==================== mount / umount / wipe（Recovery 真实操作） ==================== */

  SHELL.register({
    name: 'mount',
    desc: '挂载分区：mount <system|cache>',
    usage: 'mount <system|cache>',
    run(ctx) {
      const part = (ctx.args[1] || '').toLowerCase();
      if (part !== 'system' && part !== 'cache') { ctx.push(ctx.line('usage: mount <system|cache>', K.err)); return; }
      if (VFS.mount['/' + part]) { ctx.push(ctx.line(part + ' is already mounted', K.out)); return; }
      VFS.mount['/' + part] = true;
      VFS.mountTouched = true;
      if (part === 'system') { REC.add('I', 'mounted /system (read-only)'); OS.bus.emit('vfs:mount', '/system'); }
      else { REC.add('I', 'mounted /cache (read-write)'); OS.bus.emit('vfs:mount', '/cache'); }
      ctx.push(ctx.line(part + ': mounted', K.ok));
      if (part === 'system') ctx.push(ctx.line('hit: enabling read-write? no, ro for now', K.sys));
    }
  });

  SHELL.register({
    name: 'umount',
    desc: '卸载分区：umount <system|cache>',
    usage: 'umount <system|cache>',
    run(ctx) {
      const part = (ctx.args[1] || '').toLowerCase();
      if (part !== 'system' && part !== 'cache') { ctx.push(ctx.line('usage: umount <system|cache>', K.err)); return; }
      if (!VFS.mount['/' + part]) { ctx.push(ctx.line(part + ' is not mounted', K.out)); return; }
      VFS.mount['/' + part] = false;
      VFS.mountTouched = true;
      REC.add('I', 'unmounted /' + part);
      OS.bus.emit('vfs:umount', '/' + part);
      ctx.push(ctx.line(part + ': unmounted', K.ok));
    }
  });

  SHELL.register({
    name: 'wipe',
    desc: '清除分区：wipe cache | wipe data（真实清除 /cache 占用 / 设备数据）',
    usage: 'wipe <cache|data>',
    run(ctx) {
      const what = (ctx.args[1] || '').toLowerCase();
      if (what === 'cache') {
        if (VFS.cache.used === 0 && VFS.cache.entries === 0) { ctx.push(ctx.line('cache already empty', K.out)); return; }
        const freed = VFS.cache.used;
        VFS.cache.used = 0;
        VFS.cache.entries = 0;
        ctx.push(ctx.line('Clearing cache partition...', K.out));
        ctx.push(ctx.line('Cache cleared (' + freed + ' MB freed)', K.ok));
        REC.add('I', 'wipe cache: 已释放 ' + freed + ' MB 缓存');
        return;
      }
      if (what === 'data') {
        return SHELL._wipeData(ctx);
      }
      ctx.push(ctx.line('usage: wipe <cache|data>', K.err));
    }
  });

  SHELL._wipeData = function (ctx) {
    // 真实清空设备持久化数据（OS.storage 用户数据），bootloader 硬件状态保留
    const keys = (OS.storage && OS.storage.keys) ? OS.storage.keys() : [];
    const wiped = [];
    keys.forEach(k => {
      if (k === 'bootloader') return; // 硬件级锁定状态不被恢复出厂清除
      wiped.push(k);
      OS.storage.remove(k);
    });
    REC.add('I', 'wipe data: 清除用户数据分区 (erased ' + wiped.length + ' keys)');
    ctx.push(ctx.line('Wiping data partition...', K.out));
    ctx.push(ctx.line(wiped.length ? 'Erased: ' + wiped.join(', ') : 'No user data found', K.out));
    ctx.push(ctx.line('Data wipe complete', K.ok));
    ctx.push(ctx.line('Rebooting into system...', K.sys));
    setTimeout(() => OS.state.transition('boot', { source: 'wipe-data-done' }), 1500);
  };

  /* ==================== Recovery 命令（show-log 数据源） ==================== */
  SHELL.register({
    name: 'logcat',
    desc: '查看 Recovery 会话日志（真实事件记录）',
    usage: 'logcat [-n 行数]',
    run(ctx) {
      const n = ctx.args.indexOf('-n') > -1 ? parseInt(ctx.args[ctx.args.indexOf('-n') + 1], 10) : 0;
      const lines = n ? REC.lines.slice(-n) : REC.lines;
      if (!lines.length) { ctx.push(ctx.line('(no log entries)', K.out)); return; }
      lines.forEach(l => ctx.push(ctx.line(l, K.out)));
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

  /* ==================== 通用工具 ==================== */
  // 取输入文本行：优先文件参数（cat 语义），否则 stdin（管道）
  // skipFlags 存在时忽略开关参数，取剩余第一个作为文件
  function readLines(ctx, fileIndex, skipFlags) {
    let rel = ctx.args[fileIndex];
    if (skipFlags && Array.isArray(skipFlags)) {
      rel = ctx.args.slice(1).find(a => a && !skipFlags.includes(a));
    }
    if (rel && rel !== '-') {
      const r = VFS._readFile(rel);
      if (r.ok) return { lines: String(r.content).split('\n'), source: rel };
      ctx.push(ctx.line(r.err, K.err));
      return { lines: null, source: null };
    }
    if (ctx.stdin && ctx.stdin.length) return { lines: ctx.stdin, source: null };
    return { lines: [], source: null };
  }

  /* ==================== 目录 / 工作目录 ==================== */

  SHELL.register({
    name: 'pwd',
    desc: '显示当前工作目录',
    usage: 'pwd',
    run(ctx) { ctx.push(ctx.line(SHELL._cwd, K.out)); }
  });

  SHELL.register({
    name: 'cd',
    desc: '切换工作目录（支持相对路径 / .. / ~）',
    usage: 'cd [dir]',
    run(ctx) {
      const target = ctx.args[1] || SHELL.env.HOME || '/';
      const path = SHELL._resolvePath(target);
      const st = VFS._stat(path);
      if (!st || !st.dir) { ctx.push(ctx.line(`cd: ${target}: No such file or directory`, K.err)); return; }
      SHELL._cwd = path;
      SHELL.env.PWD = path;
    }
  });

  SHELL.register({
    name: 'mkdir',
    desc: '创建目录（-p 级联创建）',
    usage: 'mkdir [-p] <dir>',
    run(ctx) {
      const rec = ctx.args.includes('-p');
      const d = ctx.args.slice(1).find(a => a !== '-p');
      if (!d) { ctx.push(ctx.line('usage: mkdir [-p] <dir>', K.err)); return; }
      const path = SHELL._resolvePath(d);
      if (rec) {
        let cur = '/';
        const segs = path.split('/').filter(Boolean);
        for (const s of segs) {
          cur += '/' + s;
          const st = VFS._stat(cur);
          if (st && st.dir) continue;
          if (st) { ctx.push(ctx.line(`mkdir: ${cur}: File exists`, K.err)); return; }
          VFS._mkdir(cur);
        }
      } else {
        const r = VFS._mkdir(path);
        if (!r.ok) { ctx.push(ctx.line(r.err, K.err)); return; }
      }
      ctx.push(ctx.line('mkdir: created ' + path, K.ok));
    }
  });

  SHELL.register({
    name: 'rmdir',
    desc: '删除空目录',
    usage: 'rmdir <dir>',
    run(ctx) {
      const d = ctx.args[1];
      if (!d) { ctx.push(ctx.line('usage: rmdir <dir>', K.err)); return; }
      const r = VFS._rmdir(SHELL._resolvePath(d));
      if (!r.ok) { ctx.push(ctx.line(r.err, K.err)); return; }
      ctx.push(ctx.line('rmdir: removed ' + r.path, K.ok));
    }
  });

  SHELL.register({
    name: 'rm',
    desc: '删除文件（-r 递归删除目录；真实清空用户文件区）',
    usage: 'rm [-r] [-f] <path>',
    run(ctx) {
      const rec = ctx.args.includes('-r');
      const force = ctx.args.includes('-f');
      const targets = ctx.args.slice(1).filter(a => a !== '-r' && a !== '-f' && a !== '--');
      if (!targets.length) { ctx.push(ctx.line('usage: rm [-r] <path>', K.err)); return; }
      targets.forEach(t => {
        const r = VFS._rm(t, rec);
        if (!r.ok) { if (!force) ctx.push(ctx.line(r.err, K.err)); }
      });
    }
  });

  SHELL.register({
    name: 'touch',
    desc: '创建空文件 / 更新时间戳',
    usage: 'touch <file>',
    run(ctx) {
      const p = ctx.args[1];
      if (!p) { ctx.push(ctx.line('usage: touch <file>', K.err)); return; }
      const path = SHELL._resolvePath(p);
      const st = VFS._stat(path);
      if (st) {
        if (st.dir) { ctx.push(ctx.line(`touch: ${p}: Is a directory`, K.err)); return; }
        if (VFS.userFiles[path]) VFS.userFiles[path].mtime = Date.now();
        else ctx.push(ctx.line(`touch: ${p}: Read-only file system`, K.err));
        return;
      }
      const r = VFS._writeFile(path, '');
      if (!r.ok) ctx.push(ctx.line(r.err, K.err));
    }
  });

  SHELL.register({
    name: 'cp',
    desc: '复制文件（-r 递归复制目录）',
    usage: 'cp [-r] <src> <dst>',
    run(ctx) {
      const rec = ctx.args.includes('-r');
      const names = ctx.args.slice(1).filter(a => a !== '-r');
      const [src, dst] = names;
      if (!src || !dst) { ctx.push(ctx.line('usage: cp [-r] <src> <dst>', K.err)); return; }
      const sp = SHELL._resolvePath(src);
      const dp = SHELL._resolvePath(dst);
      const sst = VFS._stat(sp);
      if (!sst) { ctx.push(ctx.line(`cp: ${src}: No such file or directory`, K.err)); return; }
      if (sst.dir && !rec) { ctx.push(ctx.line(`cp: ${src}: omitting directory (use -r)`, K.warn)); return; }
      if (sst.dir) {
        // 递归复制 userFiles 子树
        const prefix = sp === '/' ? '/' : sp + '/';
        Object.keys(VFS.userFiles).forEach(p => {
          if (p.indexOf(prefix) !== 0) return;
          const rel2 = p.slice(prefix.length);
          VFS._writeFile((dp === '/' ? '/' : dp + '/') + rel2, VFS.userFiles[p].content, false);
          VFS.userFiles[(dp === '/' ? '/' : dp + '/') + rel2].mode = VFS.userFiles[p].mode;
        });
        VFS._persist();
        ctx.push(ctx.line('cp: copied ' + src + ' -> ' + dst, K.ok));
        return;
      }
      const r = VFS._readFile(sp);
      if (!r.ok) { ctx.push(ctx.line(r.err, K.err)); return; }
      const w = VFS._writeFile(dp, r.content, false);
      if (!w.ok) { ctx.push(ctx.line(w.err, K.err)); return; }
      if (r.mode) VFS.userFiles[w.path].mode = r.mode;
      ctx.push(ctx.line('cp: copied ' + src + ' -> ' + dst, K.ok));
    }
  });

  SHELL.register({
    name: 'mv',
    desc: '移动 / 重命名文件',
    usage: 'mv <src> <dst>',
    run(ctx) {
      const [src, dst] = ctx.args.slice(1);
      if (!src || !dst) { ctx.push(ctx.line('usage: mv <src> <dst>', K.err)); return; }
      const sp = SHELL._resolvePath(src);
      const dp = SHELL._resolvePath(dst);
      const sst = VFS._stat(sp);
      if (!sst) { ctx.push(ctx.line(`mv: ${src}: No such file or directory`, K.err)); return; }
      if (sp === '/') { ctx.push(ctx.line('mv: cannot move /', K.err)); return; }
      if (sst.dir) {
        const prefix = sp === '/' ? '/' : sp + '/';
        const moves = [];
        Object.keys(VFS.userFiles).forEach(p => {
          if (p.indexOf(prefix) === 0) moves.push([p, (dp === '/' ? '/' : dp + '/') + p.slice(prefix.length)]);
        });
        if (!moves.length && !VFS.userDirs[sp]) { ctx.push(ctx.line(`mv: ${src}: Nothing to move`, K.err)); return; }
        moves.forEach(([f, t]) => {
          VFS._writeFile(t, VFS.userFiles[f].content, false);
          VFS.userFiles[t].mode = VFS.userFiles[f].mode;
          delete VFS.userFiles[f];
        });
        delete VFS.userDirs[sp];
        VFS._persist();
        ctx.push(ctx.line('mv: moved ' + src + ' -> ' + dst, K.ok));
        return;
      }
      delete VFS.userFiles[dp];
      VFS.userFiles[dp] = Object.assign({}, VFS.userFiles[sp]);
      delete VFS.userFiles[sp];
      VFS._persist();
      ctx.push(ctx.line('mv: moved ' + src + ' -> ' + dst, K.ok));
    }
  });

  SHELL.register({
    name: 'chmod',
    desc: '修改文件权限位（如 644 / 755）',
    usage: 'chmod <mode> <file>',
    run(ctx) {
      const mode = ctx.args[1];
      const p = ctx.args[2];
      if (!mode || !p) { ctx.push(ctx.line('usage: chmod <mode> <file>', K.err)); return; }
      const path = SHELL._resolvePath(p);
      if (!VFS.userFiles[path]) { ctx.push(ctx.line(`chmod: ${p}: No such file (or read-only)`, K.err)); return; }
      const m = String(mode).replace(/^0+/, '');
      const bits = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
      const mk = (n) => (bits[n >> 6] || '---') + (bits[(n >> 3) & 7] || '---') + (bits[n & 7] || '---');
      if (/^[0-7]{3,4}$/.test(m)) VFS.userFiles[path].mode = mk(parseInt(m.slice(-3), 8));
      else ctx.push(ctx.line(`chmod: invalid mode: ${mode}`, K.err));
    }
  });

  SHELL.register({
    name: 'sync',
    desc: '将用户文件系统快照刷入持久化存储',
    usage: 'sync',
    run(ctx) {
      VFS._persist();
      ctx.push(ctx.line('sync: user file system flushed to persistent storage.', K.ok));
    }
  });

  SHELL.register({
    name: 'file',
    desc: '识别文件类型',
    usage: 'file <path>',
    run(ctx) {
      const p = ctx.args[1];
      if (!p) { ctx.push(ctx.line('usage: file <path>', K.err)); return; }
      const path = SHELL._resolvePath(p);
      const st = VFS._stat(path);
      if (!st) { ctx.push(ctx.line(`file: ${p}: No such file or directory`, K.err)); return; }
      if (st.dir) { ctx.push(ctx.line(path + ': directory', K.out)); return; }
      const r = VFS._readFile(path);
      const text = r.ok ? String(r.content) : '';
      const isBin = /[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 512));
      ctx.push(ctx.line(path + ': ' + (isBin ? 'binary data' : 'ASCII text'), K.out));
    }
  });

  /* ==================== 文本处理（支持 stdin 管道） ==================== */

  SHELL.register({
    name: 'grep',
    desc: '按模式过滤行（支持正则；管道输入）',
    usage: 'grep [-i] [-n] <pattern> [file]',
    run(ctx) {
      const ign = ctx.args.includes('-i');
      const num = ctx.args.includes('-n');
      const rest = ctx.args.slice(1).filter(a => a !== '-i' && a !== '-n');
      const pat = rest[0];
      if (!pat) { ctx.push(ctx.line('usage: grep [-i] [-n] <pattern> [file]', K.err)); return; }
      let re;
      try { re = new RegExp(pat, ign ? 'i' : ''); } catch (e) { ctx.push(ctx.line('grep: invalid pattern', K.err)); return; }
      const fileArg = rest[1];
      let lines;
      if (fileArg) {
        const r = VFS._readFile(fileArg);
        if (!r.ok) { ctx.push(ctx.line(r.err, K.err)); return; }
        lines = String(r.content).split('\n');
      } else if (ctx.stdin && ctx.stdin.length) {
        lines = ctx.stdin;
      } else {
        lines = [];
      }
      lines.forEach((l, i) => {
        if (re.test(l)) ctx.push(ctx.line(num ? String(i + 1) + ':' + l : l, K.out));
      });
    }
  });

  SHELL.register({
    name: 'head',
    desc: '输出前 N 行（默认 10）',
    usage: 'head [-n N] [file]',
    run(ctx) {
      let n = 10;
      const ni = ctx.args.indexOf('-n');
      if (ni > -1) n = parseInt(ctx.args[ni + 1], 10);
      else { const m = ctx.args.slice(1).find(a => /^-\d+$/.test(a)); if (m) n = Math.abs(parseInt(m, 10)); }
      const fileArg = ctx.args.slice(1).find(a => a !== '-n' && !/^-\d+$/.test(a));
      let lines;
      if (fileArg) {
        const r = VFS._readFile(fileArg);
        if (!r.ok) { ctx.push(ctx.line(r.err, K.err)); return; }
        lines = String(r.content).split('\n');
      } else {
        lines = ctx.stdin && ctx.stdin.length ? ctx.stdin : [];
      }
      lines.slice(0, n).forEach(l => ctx.push(ctx.line(l, K.out)));
    }
  });

  SHELL.register({
    name: 'tail',
    desc: '输出末尾 N 行（默认 10）',
    usage: 'tail [-n N] [file]',
    run(ctx) {
      let n = 10;
      const ni = ctx.args.indexOf('-n');
      if (ni > -1) n = parseInt(ctx.args[ni + 1], 10);
      else { const m = ctx.args.slice(1).find(a => /^-\d+$/.test(a)); if (m) n = Math.abs(parseInt(m, 10)); }
      const fileArg = ctx.args.slice(1).find(a => a !== '-n' && !/^-\d+$/.test(a));
      let lines;
      if (fileArg) {
        const r = VFS._readFile(fileArg);
        if (!r.ok) { ctx.push(ctx.line(r.err, K.err)); return; }
        lines = String(r.content).split('\n');
      } else {
        lines = ctx.stdin && ctx.stdin.length ? ctx.stdin : [];
      }
      lines.slice(-n).forEach(l => ctx.push(ctx.line(l, K.out)));
    }
  });

  SHELL.register({
    name: 'tac',
    desc: '反向输出每一行',
    usage: 'tac [file]',
    run(ctx) {
      const { lines } = readLines(ctx, 1);
      if (!lines) return;
      lines.slice().reverse().forEach(l => ctx.push(ctx.line(l, K.out)));
    }
  });

  SHELL.register({
    name: 'wc',
    desc: '统计行/词/字节数',
    usage: 'wc [-l|-w|-c] [file]',
    run(ctx) {
      const { lines } = readLines(ctx, 1, ['-l', '-w', '-c']);
      if (!lines) return;
      let lc = 0, wc2 = 0, cc = 0;
      lines.forEach(l => { lc++; wc2 += l.trim() ? l.trim().split(/\s+/).length : 0; cc += l.length + 1; });
      const parts = [];
      if (ctx.args.includes('-l')) parts.push(lc + ' lines');
      else if (ctx.args.includes('-w')) parts.push(wc2 + ' words');
      else if (ctx.args.includes('-c')) parts.push(cc + ' bytes');
      else parts.push(lc + ' lines  ' + wc2 + ' words  ' + cc + ' bytes');
      ctx.push(ctx.line(parts.join('  '), K.out));
    }
  });

  SHELL.register({
    name: 'sort',
    desc: '按字典序排序行',
    usage: 'sort [file]',
    run(ctx) {
      const { lines } = readLines(ctx, 1);
      if (!lines) return;
      lines.slice().sort().forEach(l => ctx.push(ctx.line(l, K.out)));
    }
  });

  SHELL.register({
    name: 'uniq',
    desc: '消除相邻重复行',
    usage: 'uniq [file]',
    run(ctx) {
      const { lines } = readLines(ctx, 1);
      if (!lines) return;
      let prev = null;
      lines.forEach(l => { if (l !== prev) { ctx.push(ctx.line(l, K.out)); prev = l; } });
    }
  });

  SHELL.register({
    name: 'find',
    desc: '查找文件（-name 支持 * ? 通配）',
    usage: 'find <dir> -name <pattern>',
    run(ctx) {
      const d = ctx.args[1];
      const ni = ctx.args.indexOf('-name');
      const pat = ni > -1 ? ctx.args[ni + 1] : '*';
      if (!d) { ctx.push(ctx.line('usage: find <dir> -name <pattern>', K.err)); return; }
      const base = SHELL._resolvePath(d);
      const re = new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*').replace(/\\\?/g, '.') + '$');
      const hits = [];
      const walk = (dir) => {
        // 静态只读 tree（ROM 内置目录/文件）
        (VFS.tree[dir] || []).forEach(en => {
          const isDir = en.endsWith('/');
          const nm = isDir ? en.slice(0, -1) : en;
          const full = dir === '/' ? '/' + nm : dir + '/' + nm;
          if (re.test(nm)) hits.push(full);
          if (isDir) walk(full);
        });
      };
      walk(base === '/' ? '/' : base.replace(/\/+$/, ''));
      // 用户可写文件
      Object.keys(VFS.userFiles).forEach(p => {
        if (p.indexOf(base) === 0 && re.test(p.split('/').pop())) hits.push(p);
      });
      if (!hits.length) ctx.push(ctx.line('find: no matches', K.out));
      hits.sort().forEach(h => ctx.push(ctx.line(h, K.out)));
    }
  });

  /* ==================== 会话 / 用户 / 历史 ==================== */

  SHELL.register({
    name: 'whoami',
    desc: '显示当前用户',
    usage: 'whoami',
    run(ctx) { ctx.push(ctx.line(SHELL.env.USER || 'root', K.out)); }
  });

  SHELL.register({
    name: 'id',
    desc: '显示用户身份',
    usage: 'id',
    run(ctx) {
      const u = SHELL.env.USER || 'root';
      ctx.push(ctx.line('uid=0(root) gid=0(root) groups=0(root),1007(uucp)' + (u === 'root' ? '' : ' user=' + u), K.out));
    }
  });

  SHELL.register({
    name: 'history',
    desc: '显示本次会话命令历史',
    usage: 'history',
    run(ctx) {
      if (!SHELL._hist.length) { ctx.push(ctx.line('(no commands yet)', K.out)); return; }
      SHELL._hist.forEach((c, i) => ctx.push(ctx.line(String(i + 1).padStart(4) + '  ' + c, K.out)));
    }
  });

  /* ==================== 命令别名 ==================== */

  SHELL.register({
    name: 'alias',
    desc: '定义/查看命令别名：alias name=cmd（无参列出全部）',
    usage: 'alias [name[=value] ...]',
    run(ctx) {
      const rest = ctx.args.slice(1);
      if (!rest.length) {
        const ks = Object.keys(SHELL._alias).sort();
        if (!ks.length) { ctx.push(ctx.line('no aliases defined', K.out)); return; }
        ks.forEach(k => ctx.push(ctx.line('alias ' + k + "='" + SHELL._alias[k] + "'", K.out)));
        return;
      }
      rest.forEach(a => {
        const eq = a.indexOf('=');
        if (eq < 1) {
          const v = SHELL._alias[a];
          ctx.push(v !== undefined
            ? ctx.line('alias ' + a + "='" + v + "'", K.out)
            : ctx.line('alias: ' + a + ': not found', K.err));
          return;
        }
        const k = a.slice(0, eq);
        const v = a.slice(eq + 1).replace(/^['"]|['"]$/g, '');
        SHELL._alias[k] = v;
        SHELL._saveAlias();
        ctx.push(ctx.line('alias ' + k + "='" + v + "'", K.ok));
      });
    }
  });

  SHELL.register({
    name: 'unalias',
    desc: '删除命令别名',
    usage: 'unalias <name>',
    run(ctx) {
      const k = ctx.args[1];
      if (!k) { ctx.push(ctx.line('usage: unalias <name>', K.err)); return; }
      if (SHELL._alias[k] !== undefined) {
        delete SHELL._alias[k];
        SHELL._saveAlias();
        ctx.push(ctx.line('unalias ' + k, K.ok));
      } else {
        ctx.push(ctx.line('unalias: ' + k + ': not found', K.err));
      }
    }
  });

  /* ==================== 进程 / 任务 ==================== */

  SHELL.register({
    name: 'jobs',
    desc: '列出后台任务',
    usage: 'jobs',
    run(ctx) {
      if (!SHELL._bgJobs.size) { ctx.push(ctx.line('(no background jobs)', K.out)); return; }
      for (const j of SHELL._bgJobs.values()) {
        const mark = j.state === 'running' ? '+' : '-';
        ctx.push(ctx.line('[' + String(j.pid).padStart(2) + '] ' + mark + '  ' + j.state.padEnd(8) + j.cmd, K.out));
      }
    }
  });

  SHELL.register({
    name: 'ps',
    desc: '显示进程表（内核任务）',
    usage: 'ps',
    run(ctx) {
      ctx.push(ctx.line('PID  STATE   COMMAND', K.sys));
      ctx.push(ctx.line(String(1).padStart(4) + '  running  init (nsos)', K.out));
      ctx.push(ctx.line(String(2).padStart(4) + '  running  kthreadd', K.out));
      for (const j of SHELL._bgJobs.values()) {
        ctx.push(ctx.line(String(j.pid + 100).padStart(4) + '  ' + j.state.padEnd(7) + ' ' + j.cmd, K.out));
      }
    }
  });

  SHELL.register({
    name: 'sleep',
    desc: '休眠 N 秒（支持作业信号控制：kill / suspend / bg / fg）',
    usage: 'sleep <seconds>',
    async run(ctx) {
      const n = parseFloat(ctx.args[1], 10);
      if (isNaN(n)) { ctx.push(ctx.line('usage: sleep <seconds>', K.err)); return; }
      const job = (ctx && ctx.job) || null;
      const total = Math.min(n, 30) * 1000;
      let t0 = Date.now();
      let elapsed = 0;
      while (elapsed < total) {
        if (job && job.state === 'killed') return;
        if (job && job.state === 'stopped') {
          await job._resume;
          if (job.state === 'killed') return;
          t0 = Date.now() - elapsed; // 挂起时段从计时中剔除，恢复后续跑
          continue;
        }
        await new Promise((res) => {
          const t = setTimeout(res, Math.max(40, Math.min(200, total - elapsed)));
          if (job && job._sleepTimers) job._sleepTimers.add(t);
        });
        elapsed = Date.now() - t0;
      }
    }
  });

  SHELL.register({
    name: 'kill',
    desc: '向作业发信号：kill [-9|-KILL|-TERM|-STOP|-CONT] <%job>|<pid>，默认 TERM',
    usage: 'kill [-<signal>] <%job> | <pid>',
    run(ctx) {
      let sig = 'TERM';
      let t = ctx.args[1];
      if (t && /^-/.test(t)) { sig = t.slice(1); t = ctx.args[2]; }
      if (!t) { ctx.push(ctx.line('usage: ' + this.usage, K.err)); return; }
      const pid = parseInt(String(t).replace(/^%/, ''), 10);
      const r = SHELL._signalJob(pid, sig);
      if (!r) { ctx.push(ctx.line(`kill: ${t}: no such job`, K.err)); return; }
      if (r.action === 'killed') ctx.push(ctx.line('killed job ' + pid, K.ok));
      else if (r.action === 'stopped') ctx.push(ctx.line(`job ${pid} suspended (SIGSTOP)`, K.warn));
      else if (r.action === 'resumed') ctx.push(ctx.line(`job ${pid} continued (SIGCONT)`, K.ok));
      else ctx.push(ctx.line(`kill: ${t}: job is ${r.state} (signal ignored)`, K.out));
    }
  });

  SHELL.register({
    name: 'suspend', aliases: ['stop'],
    desc: '挂起后台作业（SIGTSTP）',
    usage: 'suspend <%job> | <pid>',
    run(ctx) {
      const t = ctx.args[1];
      if (!t) { ctx.push(ctx.line('usage: suspend <%job>', K.err)); return; }
      const pid = parseInt(String(t).replace(/^%/, ''), 10);
      const r = SHELL._signalJob(pid, 'STOP');
      if (!r) { ctx.push(ctx.line(`suspend: ${t}: no such job`, K.err)); return; }
      if (r.action === 'stopped') ctx.push(ctx.line(`job ${pid} suspended`, K.warn));
      else ctx.push(ctx.line(`suspend: ${t}: job is ${r.state} (no-op)`, K.out));
    }
  });

  SHELL.register({
    name: 'bg',
    desc: '继续后台被挂起的作业（SIGCONT）',
    usage: 'bg <%job> | <pid>',
    run(ctx) {
      const t = ctx.args[1];
      if (!t) { ctx.push(ctx.line('usage: bg <%job>', K.err)); return; }
      const pid = parseInt(String(t).replace(/^%/, ''), 10);
      const j = SHELL._bgJobs.get(pid);
      const r = SHELL._signalJob(pid, 'CONT');
      if (!r) { ctx.push(ctx.line(`bg: ${t}: no such job`, K.err)); return; }
      if (r.action === 'resumed') ctx.push(ctx.line(`[${pid}] ${j.cmd} &`, K.ok));
      else ctx.push(ctx.line(`bg: ${t}: job is ${r.state} (no-op)`, K.out));
    }
  });

  SHELL.register({
    name: 'fg',
    desc: '把后台作业带到前台并等待结束（自动继续被挂起的作业）',
    usage: 'fg <%job> | <pid>',
    async run(ctx) {
      const t = ctx.args[1];
      if (!t) { ctx.push(ctx.line('usage: fg <%job>', K.err)); return; }
      const pid = parseInt(String(t).replace(/^%/, ''), 10);
      const j = SHELL._bgJobs.get(pid);
      if (!j) { ctx.push(ctx.line(`fg: ${t}: no such job`, K.err)); return; }
      if (j.state === 'stopped') SHELL._signalJob(pid, 'CONT');
      ctx.push(ctx.line(`[${pid}] ${j.cmd} (fg)`, K.sys));
      if (j._done) await j._done;
      ctx.push(ctx.line(`[${pid}] finished (${j.state})`, K.out));
    }
  });

  SHELL.register({
    name: 'wait',
    desc: '等待后台任务结束（不带参数等全部）',
    usage: 'wait [pid]',
    async run(ctx) {
      const pid = ctx.args[1] ? parseInt(ctx.args[1], 10) : null;
      if (pid) {
        const j = SHELL._bgJobs.get(pid);
        if (!j) { ctx.push(ctx.line(`wait: ${pid}: no such job`, K.err)); return; }
        if (j._done) await j._done;
        else {
          while (j.state === 'running' || j.state === 'stopped') {
            await new Promise(r => setTimeout(r, 120));
          }
        }
        ctx.push(ctx.line('job ' + pid + ' finished (' + (SHELL._bgJobs.get(pid) || j).state + ')', K.out));
        return;
      }
      while ([...SHELL._bgJobs.values()].some(j => j.state === 'running' || j.state === 'stopped')) {
        await new Promise(r => setTimeout(r, 120));
      }
      ctx.push(ctx.line('all background jobs finished', K.out));
    }
  });

  /* ==================== 环境变量 ==================== */

  SHELL.register({
    name: 'env',
    desc: '显示所有环境变量',
    usage: 'env',
    run(ctx) {
      Object.keys(SHELL.env).sort().forEach(k => ctx.push(ctx.line(k + '=' + SHELL.env[k], K.out)));
    }
  });

  SHELL.register({
    name: 'export',
    desc: '设置环境变量：export KEY=VALUE（无参显示全部）',
    usage: 'export [KEY=VALUE ...]',
    run(ctx) {
      const assigns = ctx.args.slice(1).filter(a => a.indexOf('=') > 0);
      if (!ctx.args.slice(1).length || !assigns.length) {
        Object.keys(SHELL.env).sort().forEach(k => ctx.push(ctx.line('export ' + k + '="' + SHELL.env[k] + '"', K.out)));
        return;
      }
      assigns.forEach(as => {
        const eq = as.indexOf('=');
        const k = as.slice(0, eq);
        const v = as.slice(eq + 1);
        SHELL.env[k] = v;
      });
      SHELL._saveEnv();
      ctx.push(ctx.line('environment updated', K.ok));
    }
  });

  SHELL.register({
    name: 'unset',
    desc: '删除环境变量',
    usage: 'unset <KEY>',
    run(ctx) {
      const k = ctx.args[1];
      if (!k) { ctx.push(ctx.line('usage: unset <KEY>', K.err)); return; }
      if (k === 'PATH' || k === 'HOME' || k === 'USER') { ctx.push(ctx.line('unset: cannot unset reserved variable ' + k, K.err)); return; }
      if (SHELL.env[k] === undefined) { ctx.push(ctx.line('unset: ' + k + ': not set', K.err)); return; }
      delete SHELL.env[k];
      SHELL._saveEnv();
      ctx.push(ctx.line('unset ' + k, K.ok));
    }
  });

  SHELL.register({
    name: 'set',
    desc: '显示 shell 变量（含系统状态）',
    usage: 'set',
    run(ctx) {
      ctx.push(ctx.line('CWD=' + SHELL._cwd, K.out));
      ctx.push(ctx.line('MODE=' + OS.state.current, K.out));
      ctx.push(ctx.line('LOCKED=' + (SHELL.locked() ? 'yes' : 'no'), K.out));
      ctx.push(ctx.line('SERIAL=' + SHELL.serialno(), K.out));
      Object.keys(SHELL.env).sort().forEach(k => ctx.push(ctx.line(k + '=' + SHELL.env[k], K.out)));
    }
  });

  /* ==================== 其它常用 ==================== */

  SHELL.register({
    name: 'printf',
    desc: '格式化输出（%s %d 与 \\n \\t）',
    usage: 'printf <fmt> [args...]',
    run(ctx) {
      const fmt = ctx.args[1];
      if (!fmt) { ctx.push(ctx.line('usage: printf <fmt> [args...]', K.err)); return; }
      const vals = ctx.args.slice(2);
      let vali = 0;
      let out = fmt.replace(/%([sdif])/g, (m, kind) => {
        const v = (vali < vals.length) ? vals[vali++] : '';
        if (kind === 's') return v;
        return String(parseInt(v, 10) || 0);
      });
      out = out.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
      ctx.push(ctx.line(out, K.out));
    }
  });

  SHELL.register({
    name: 'seq',
    desc: '输出数字序列',
    usage: 'seq [start] <end>',
    run(ctx) {
      let start = 1, end;
      if (ctx.args[2]) { start = parseInt(ctx.args[1], 10); end = parseInt(ctx.args[2], 10); }
      else end = parseInt(ctx.args[1], 10);
      if (isNaN(end)) { ctx.push(ctx.line('usage: seq [start] <end>', K.err)); return; }
      for (let i = start; i <= end; i++) ctx.push(ctx.line(String(i), K.out));
    }
  });

  SHELL.register({
    name: 'which',
    desc: '显示命令所在位置',
    usage: 'which <cmd>',
    run(ctx) {
      const c = ctx.args[1];
      if (!c) { ctx.push(ctx.line('usage: which <cmd>', K.err)); return; }
      const def = SHELL.cmds.get(c.toLowerCase());
      if (def) ctx.push(ctx.line('/bin/' + def.name, K.out));
      else { ctx.push(ctx.line('which: ' + c + ': not found', K.err)); }
    }
  });

  SHELL.register({
    name: 'man',
    desc: '查看命令帮助',
    usage: 'man <cmd>',
    run(ctx) {
      const c = ctx.args[1];
      const def = c && SHELL.cmds.get(c.toLowerCase());
      if (!def) { ctx.push(ctx.line('man: ' + (c || '') + ': no manual entry', K.err)); return; }
      ctx.push(ctx.line('NAME', K.sys));
      ctx.push(ctx.line('    ' + def.name + ' - ' + (def.desc || ''), K.out));
      ctx.push(ctx.line('SYNOPSIS', K.sys));
      ctx.push(ctx.line('    ' + (def.usage || def.name), K.out));
    }
  });

  OS.reg('shell', SHELL);
})(window);

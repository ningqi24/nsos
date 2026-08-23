/* ============================================================
 * nsos - os-terminal (Web Component) · v1
 * 终端 UI：统一命令引擎 OS.shell 的渲染层。
 * 结构：输出滚动区 + 底部输入行（提示符 + 输入框）。
 * 能力：命令历史(↑/↓)、流式增量输出、clear 清屏、自动滚动、
 *       点击任意处聚焦、失焦占位。
 * 可在桌面应用窗口与工程模式面板中复用（shadow 内样式隔离）。
 * 用法：<os-terminal></os-terminal>
 * ============================================================ */
(function () {
  'use strict';

  class OsTerminal extends HTMLElement {
    constructor() {
      super();
      this._history = [];      // 本次挂载内的命令历史（挂载历史也可从 shell 读）
      this._hIdx = -1;
      this._lineN = 0;
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      this._build();
      this._printBanner();
      this._focusInput();
    }

    disconnectedCallback() {
      if (this._syncBus) this._syncBus();
    }

    /* ---------- 构建 shadow DOM ---------- */
    _build() {
      const sh = this.shadowRoot;
      sh.innerHTML = `
        <style>
          :host {
            display: flex;
            flex-direction: column;
            background: #0a0e13;
            color: #c7d0da;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
            font-size: 13px;
            line-height: 1.55;
            overflow: hidden;
            box-sizing: border-box;
          }
          * { box-sizing: border-box; }
          .t-scroll {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            padding: 12px 14px;
            scrollbar-width: thin;
            scrollbar-color: #2a3644 transparent;
          }
          .t-line { white-space: pre-wrap; word-break: break-word; }
          .t-line + .t-line { margin-top: 1px; }
          .k-out  { color: #c7d0da; }
          .k-ok   { color: #4ade80; }
          .k-warn { color: #fbbf24; }
          .k-err  { color: #f87171; }
          .k-sys  { color: #60a5fa; }
          .k-cmd  { color: #22d3ee; }
          .t-input {
            flex: none;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-top: 1px solid #1d2731;
          }
          .t-prompt { color: #4ade80; white-space: nowrap; user-select: none; }
          .t-caret { width: 8px; height: 14px; background: #4ade80; animation: blink 1s steps(1) infinite; flex: none; }
          .t-field {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: #e5edf5;
            font: inherit;
            caret-color: transparent;
            padding: 0;
          }
          .t-field::placeholder { color: #46525f; }
          @keyframes blink { 50% { opacity: 0; } }
          ::selection { background: #26445f; }
        </style>
        <div class="t-scroll" data-role="scroll"></div>
        <div class="t-input">
          <span class="t-prompt" data-role="prompt">nsos:/ $</span>
          <span class="t-field" contenteditable="true" spellcheck="false" data-role="field"></span>
          <span class="t-caret" data-role="caret"></span>
        </div>
      `;
      this._scroll = sh.querySelector('[data-role="scroll"]');
      this._field = sh.querySelector('[data-role="field"]');
      this._prompt = sh.querySelector('[data-role="prompt"]');

      // contenteditable 供触屏唤起输入法；桌面键盘事件统一走 keydown
      this._field.addEventListener('keydown', (e) => this._onKeydown(e));
      this._field.addEventListener('paste', (e) => e.preventDefault());

      // 点击组件任意处聚焦输入（保留选区）
      sh.host.addEventListener('pointerdown', () => this._focusInput());
    }

    _updatePrompt() {
      if (!this._prompt) return;
      const st = window.OS && window.OS.state ? window.OS.state.current : '?';
      const p = st === 'recovery' ? 'nsos-recovery:/ #'
        : st === 'fastboot' ? 'nsos-fastboot:/ #'
        : 'nsos:/ $';
      if (this._prompt.textContent !== p) this._prompt.textContent = p;
    }

    focus() { this._focusInput(); }
    _focusInput() {
      if (!this._field) return;
      // contenteditable 聚焦：光标移到文本末尾
      this._field.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(this._field);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    /* ---------- 输出 ---------- */
    _addLine(l) {
      const line = l && l.text !== undefined ? l : { text: String(l), kind: 'out' };
      const div = document.createElement('div');
      div.className = 't-line k-' + (line.kind || 'out');
      div.textContent = line.text;
      this._scroll.appendChild(div);
      this._lineN++;
      this._autoScroll();
    }

    _autoScroll() {
      this._scroll.scrollTop = this._scroll.scrollHeight;
    }

    _clear() {
      if (!this._scroll) return;
      this._scroll.innerHTML = '';
      this._lineN = 0;
    }

    _printBanner() {
      const v = window.OS && window.OS.version;
      const ver = v ? v.major + '.' + v.minor + '.' + v.build : '0.1.0';
      const lines = [
        { text: 'nsos Kernel Shell v' + ver, kind: 'ok' },
        { text: '终端底层已就绪：命令统一驱动系统状态与设备仿真。', kind: 'sys' },
        { text: '输入 help 查看命令；示例：devinfo · fastboot getvar all · reboot bootloader', kind: 'out' },
        { text: '', kind: 'out' }
      ];
      lines.forEach(l => this._addLine(l));
    }

    /* ---------- 输入处理 ---------- */
    _inputText() {
      return this._field.textContent.replace(/\s+$/, '');
    }
    _setInput(t) {
      this._field.textContent = t || '';
      this._focusInput();
    }

    _onKeydown(e) {
      // 冲突键（Enter/方向/空格/数字）：阻止继续冒泡，避免被系统的
      // 硬件按键映射层（input.js）拦截成导航/确认并 preventDefault，
      // 否则终端里空格与数字将无法输入。
      // 注意：Enter/方向在这里已 preventDefault 并自行处理；空格/数字
      //      只 stopPropagation，保留原生文本插入。
      if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === ' ' || /^[1-9]$/.test(e.key)) {
        e.stopPropagation();
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        this._exec();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._navHistory(-1);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._navHistory(1);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this._complete();
      }
    }

    _complete() {
      const cur = this._inputText();
      const sh = window.OS && window.OS.shell;
      if (!sh || !sh.complete) return;
      const cands = sh.complete(cur);
      if (!cands.length) return;
      if (cands.length === 1) {
        const isCmd = cur.split(/\s+/).length <= 1 && cur.indexOf('/') < 0 && cur.indexOf(' ') < 0;
        if (isCmd) {
          this._setInput(cands[0] + ' ');
        } else {
          const words = cur.trimEnd().split(/\s+/);
          words[words.length - 1] = cands[0];
          this._setInput(words.join(' '));
        }
        return;
      }
      this._addLine({ text: cands.join('    '), kind: 'sys' });
    }

    _navHistory(dir) {
      if (!this._history.length) return;
      this._hIdx = Math.max(-1, Math.min(this._history.length - 1, this._hIdx + dir));
      this._setInput(this._hIdx >= 0 ? this._history[this._hIdx] : '');
    }

    _exec() {
      const raw = this._inputText();
      if (!raw) { this._setInput(''); return; }
      this._setInput('');
      if (raw.trim() === 'clear') {
        this._clear();
        return;
      }
      this._history.push(raw);
      if (this._history.length > 100) this._history.shift();
      this._hIdx = -1;

      this._addLine({ text: this._prompt.textContent + ' ' + raw, kind: 'cmd' });

      if (window.OS && window.OS.shell) {
        window.OS.shell.exec(raw, { onLine: (l) => this._addLine(l) });
      } else {
        this._addLine({ text: 'shell 未就绪', kind: 'err' });
      }
    }
  }

  if (!customElements.get('os-terminal')) customElements.define('os-terminal', OsTerminal);
})();

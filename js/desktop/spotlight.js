/* ============================================================
 * nsos - spotlight.js
 * 全局搜索 (Spotlight)：从屏幕顶部中间下拉触发
 *   搜索应用、设置、计算器快捷计算、Web 建议
 *   键盘快捷键：Ctrl+Space 打开/关闭
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const SP = {
    overlay: null,
    input: null,
    results: null,
    _open: false,

    init() {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;

      const overlay = document.createElement('div');
      overlay.className = 'spotlight-overlay';
      overlay.innerHTML = `
        <div class="sp-card">
          <div class="sp-search-bar">
            <span class="sp-ic"><os-icon name="search" size="18"></os-icon></span>
            <input type="text" class="sp-input" placeholder="搜索应用、设置、计算…" autocomplete="off" spellcheck="false">
            <button class="sp-cancel">取消</button>
          </div>
          <div class="sp-results" id="sp-results"></div>
        </div>`;
      sysui.appendChild(overlay);
      this.overlay = overlay;
      this.input = overlay.querySelector('.sp-input');
      this.results = overlay.querySelector('#sp-results');

      // 输入事件
      this.input.addEventListener('input', () => this._search(this.input.value.trim()));

      // 取消按钮
      overlay.querySelector('.sp-cancel').addEventListener('click', () => this.close());

      // 点击外部关闭
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) this.close();
      });

      // 键盘快捷键：Ctrl+Space
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.code === 'Space') {
          e.preventDefault();
          this.toggle();
        }
        if (e.key === 'Escape' && this._open) {
          this.close();
        }
      });

      // 桌面下拉触发：监听 home 层顶部中间区域的下拉
      const homeLayer = document.getElementById('layer-home');
      if (homeLayer) {
        let startY = 0, startMid = false;
        homeLayer.addEventListener('pointerdown', (e) => {
          // 仅在屏幕顶部 60px 范围且中间 50% 区域触发
          if (e.clientY < 60 && e.clientX > window.innerWidth * 0.25 && e.clientX < window.innerWidth * 0.75) {
            startY = e.clientY;
            startMid = true;
          } else {
            startMid = false;
          }
        });
        homeLayer.addEventListener('pointermove', (e) => {
          if (startMid && e.clientY - startY > 30) {
            startMid = false;
            this.open();
          }
        });
      }
    },

    open() {
      if (this._open) return;
      this._open = true;
      this.overlay.classList.add('show');
      this.input.value = '';
      this._renderDefault();
      setTimeout(() => this.input.focus(), 200);
    },

    close() {
      if (!this._open) return;
      this._open = false;
      this.overlay.classList.remove('show');
      this.input.blur();
    },

    toggle() {
      if (this._open) this.close();
      else this.open();
    },

    _search(query) {
      if (!query) { this._renderDefault(); return; }

      const results = [];

      // 1. 应用搜索
      if (OS.apps) {
        OS.apps.forEach((manifest, id) => {
          if (manifest.name && (manifest.name.toLowerCase().includes(query.toLowerCase()) ||
              id.toLowerCase().includes(query.toLowerCase()))) {
            results.push({ type: 'app', id, name: manifest.name, icon: manifest.icon || 'app', cls: manifest.cls });
          }
        });
      }

      // 2. 设置项搜索（预定义）
      const settingsItems = [
        { name: '深色模式', icon: 'dark', action: () => this._toggleSetting('dark') },
        { name: 'Wi-Fi', icon: 'wifi', action: () => this._toggleSetting('wifi') },
        { name: '蓝牙', icon: 'bluetooth', action: () => this._toggleSetting('bluetooth') },
        { name: '飞行模式', icon: 'airplane', action: () => this._toggleSetting('airplane') },
        { name: '免打扰', icon: 'doze', action: () => this._toggleSetting('doze') },
        { name: '亮度', icon: 'brightness', action: () => this._openControlCenter() },
        { name: '音量', icon: 'volume', action: () => this._openControlCenter() },
        { name: '更换壁纸', icon: 'image', action: () => { if (OS.launcher && OS.launcher._cycleWallpaper) OS.launcher._cycleWallpaper(); } },
        { name: '锁屏', icon: 'lock', action: () => OS.state.transition('locked', { source: 'spotlight' }) },
        { name: '关机', icon: 'power', action: () => OS.state.transition('poweroff', { source: 'spotlight' }) },
      ];
      settingsItems.forEach(s => {
        if (s.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({ type: 'setting', ...s });
        }
      });

      // 3. 计算器快捷计算
      if (/^[\d\s+\-*/.()]+$/.test(query)) {
        try {
          const expr = query.replace(/\s/g, '');
          // 安全的 eval：仅允许数字和运算符
          if (/^[\d+\-*/.()]+$/.test(expr)) {
            const result = Function('"use strict";return (' + expr + ')')();
            if (typeof result === 'number' && isFinite(result)) {
              results.unshift({ type: 'calc', name: `${query} = ${result}`, icon: 'calculator' });
            }
          }
        } catch (e) { /* 忽略计算错误 */ }
      }

      // 4. Web 搜索建议
      results.push({ type: 'web', name: `在网页中搜索"${query}"`, icon: 'search', query });

      this._renderResults(results, query);
    },

    _renderDefault() {
      const suggestions = [
        { name: '计算器', icon: 'calculator', type: 'app', id: 'calculator' },
        { name: '天气', icon: 'weather', type: 'app', id: 'weather' },
        { name: '备忘录', icon: 'notes', type: 'app', id: 'notes' },
        { name: '设置', icon: 'settings', type: 'app', id: 'settings' },
      ];

      this.results.innerHTML = '<div class="sp-section-title">Siri 建议</div>';
      suggestions.forEach(s => this._renderResult(s));
    },

    _renderResults(results, query) {
      this.results.innerHTML = '';
      if (results.length === 0) {
        this.results.innerHTML = '<div class="sp-empty">无搜索结果</div>';
        return;
      }
      results.slice(0, 12).forEach(r => this._renderResult(r));
    },

    _renderResult(r) {
      const el = document.createElement('div');
      el.className = 'sp-result';
      const iconCls = r.cls ? ' ' + r.cls : '';
      el.innerHTML = `
        <span class="sp-r-ic ic${iconCls}"><os-icon name="${r.icon || 'app'}" size="16"></os-icon></span>
        <span class="sp-r-name">${r.name}</span>
        ${r.type === 'app' ? '<span class="sp-r-tag">应用</span>' : ''}
        ${r.type === 'setting' ? '<span class="sp-r-tag">设置</span>' : ''}
        ${r.type === 'calc' ? '<span class="sp-r-tag">计算</span>' : ''}
        ${r.type === 'web' ? '<span class="sp-r-tag">网页</span>' : ''}`;
      el.addEventListener('click', () => this._activate(r));
      this.results.appendChild(el);
    },

    _activate(r) {
      this.close();
      setTimeout(() => {
        if (r.type === 'app' && OS.apps.has(r.id)) {
          OS.nav.push(r.id);
        } else if (r.type === 'setting' && r.action) {
          r.action();
        } else if (r.type === 'calc') {
          // 无额外操作，结果已显示
        } else if (r.type === 'web') {
          // 打开浏览器搜索
          if (OS.apps.has('browser')) {
            OS.nav.push('browser', { url: 'https://www.google.com/search?q=' + encodeURIComponent(r.query) });
          }
        }
      }, 200);
    },

    _toggleSetting(id) {
      const key = 'cc:' + id;
      const current = OS.storage.get(key, false);
      OS.storage.set(key, !current);
      OS.bus.emit('cc:toggle', { id, on: !current });
      const toast = OS.ui && OS.ui.toast;
      if (toast) toast((!current ? '已开启' : '已关闭'), { ms: 1000 });
    },

    _openControlCenter() {
      if (OS.controlcenter && OS.controlcenter.open) OS.controlcenter.open();
    }
  };

  OS.reg('spotlight', SP);
})(window);

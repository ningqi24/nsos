/* ============================================================
 * nsos - task-switcher.js (P5 · 多任务视图)
 * 应用切换器：展示最近使用的应用卡片
 *   OS.tasks.open()   打开多任务视图
 *   OS.tasks.close()  关闭多任务视图
 *   OS.tasks.switchTo(id)  切换到指定应用
 *   OS.tasks.dismiss(id)   关闭指定应用
 * 触发方式：底部上滑并停顿 / 下滑关闭
 * 交互：上滑卡片关闭应用，点击卡片切换应用
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const recentApps = []; // 最近使用的应用 ID 列表
  let overlay = null;

  const TS = {
    init() {
      // 监听应用启动，记录最近使用
      OS.bus.on('state:enter:app', () => {
        const frame = OS.nav && OS.nav.current;
        if (frame && frame.id) {
          // 移到队首（去重）
          const idx = recentApps.indexOf(frame.id);
          if (idx >= 0) recentApps.splice(idx, 1);
          recentApps.unshift(frame.id);
          if (recentApps.length > 8) recentApps.pop();
        }
      });

      // 创建 overlay
      overlay = document.createElement('div');
      overlay.id = 'sys-taskswitcher';
      overlay.innerHTML = `
        <div class="ts-header">
          <span class="ts-title">最近使用</span>
          <button class="ts-clear-all" id="ts-clear-all">全部清除</button>
        </div>
        <div class="ts-container" id="ts-container"></div>
        <div class="ts-hint">上滑关闭 · 点击切换 · 下滑退出</div>
      `;
      // 点击空白处关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('ts-hint')) this.close();
      });
      // 下滑关闭后台
      this._bindSwipeDown(overlay);

      // 全部清除
      overlay.querySelector('#ts-clear-all').addEventListener('click', (e) => {
        e.stopPropagation();
        recentApps.length = 0;
        this._render();
      });

      const sysui = document.getElementById('os-sysui');
      if (sysui) sysui.appendChild(overlay);
    },

    _bindSwipeDown(el) {
      let sx = null, sy = null, fired = false;
      el.addEventListener('pointerdown', (e) => {
        // 只在点击空白区域/标题时允许下滑关闭
        if (e.target.closest('.ts-card')) return;
        sx = e.clientX;
        sy = e.clientY;
        fired = false;
      });
      el.addEventListener('pointermove', (e) => {
        if (sy === null || fired) return;
        const dy = e.clientY - sy;
        const dx = e.clientX - sx;
        if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
          fired = true;
          this.close();
        }
      });
      el.addEventListener('pointerup', () => { sx = null; sy = null; fired = false; });
      el.addEventListener('pointercancel', () => { sx = null; sy = null; fired = false; });
    },

    _render() {
      if (!overlay) return;
      const container = overlay.querySelector('#ts-container');
      container.innerHTML = '';

      if (recentApps.length === 0) {
        container.innerHTML = '<div class="ts-empty">没有最近使用的应用</div>';
        return;
      }

      recentApps.forEach(id => {
        const m = OS.apps.get(id);
        if (!m) return;
        const card = document.createElement('div');
        card.className = 'ts-card';
        card.dataset.appId = id;
        card.innerHTML = `
          <div class="ts-card-header">
            <div class="ts-card-icon ic ${m.cls}"><os-icon name="${m.icon}"></os-icon></div>
            <span class="ts-card-name">${m.name}</span>
          </div>
          <button class="ts-card-close" data-id="${id}" title="上滑关闭">
            <os-icon name="chevron-up" size="14"></os-icon>
          </button>
          <div class="ts-card-preview"><os-icon name="${m.icon}" size="48"></os-icon></div>`;

        // 点击卡片切换应用
        card.addEventListener('click', (e) => {
          if (e.target.closest('.ts-card-close')) return;
          this.switchTo(id);
        });

        // 点击关闭按钮
        card.querySelector('.ts-card-close').addEventListener('click', (e) => {
          e.stopPropagation();
          this._dismissCard(card, id);
        });

        // 上滑关闭卡片
        this._bindSwipeDismiss(card, id);

        container.appendChild(card);
      });
    },

    _bindSwipeDismiss(card, id) {
      let sx = null, sy = null, fired = false;
      card.addEventListener('pointerdown', (e) => {
        // 忽略点击在关闭按钮上的情况
        if (e.target.closest('.ts-card-close')) return;
        sx = e.clientX;
        sy = e.clientY;
        fired = false;
        card.style.transition = 'none';
      });
      card.addEventListener('pointermove', (e) => {
        if (sy === null || fired) return;
        const dy = e.clientY - sy;
        const dx = e.clientX - sx;
        // 只处理上滑（dy < 0）且垂直方向为主
        if (dy < 0 && Math.abs(dy) > Math.abs(dx)) {
          // 跟随手指移动（上滑）
          card.style.transform = `translateY(${dy}px) scale(${1 + dy * 0.001})`;
          card.style.opacity = `${1 + dy * 0.005}`;
        }
      });
      card.addEventListener('pointerup', (e) => {
        if (sy === null) return;
        const dy = e.clientY - sy;
        const dx = e.clientX - sx;
        card.style.transition = '';
        // 上滑超过 80px 且垂直方向为主则关闭
        if (dy < -80 && Math.abs(dy) > Math.abs(dx)) {
          fired = true;
          this._dismissCard(card, id);
        } else {
          // 回弹
          card.style.transform = '';
          card.style.opacity = '';
        }
        sx = null; sy = null;
      });
      card.addEventListener('pointercancel', () => {
        if (sy === null) return;
        card.style.transition = '';
        card.style.transform = '';
        card.style.opacity = '';
        sx = null; sy = null;
      });
    },

    _dismissCard(card, id) {
      // 动画移除
      card.style.transition = 'all .3s var(--os-ease-ios)';
      card.style.transform = 'translateY(-120px) scale(.8)';
      card.style.opacity = '0';
      setTimeout(() => {
        const idx = recentApps.indexOf(id);
        if (idx >= 0) recentApps.splice(idx, 1);
        this._render();
      }, 250);
    },

    open() {
      if (!overlay) return;
      this._render();
      overlay.classList.add('open');
    },

    close() {
      if (overlay) overlay.classList.remove('open');
    },

    toggle() {
      if (overlay && overlay.classList.contains('open')) this.close();
      else this.open();
    },

    switchTo(id) {
      this.close();
      setTimeout(() => {
        if (OS.nav && OS.nav.current && OS.nav.current.id === id) return;
        OS.nav.home();
        setTimeout(() => OS.nav.push(id), 100);
      }, 200);
    },

    dismiss(id) {
      const idx = recentApps.indexOf(id);
      if (idx >= 0) recentApps.splice(idx, 1);
      this._render();
    },
  };

  OS.reg('tasks', TS);
})(window);

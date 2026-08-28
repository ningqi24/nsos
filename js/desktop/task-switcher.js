/* ============================================================
 * nsos - task-switcher.js (P5 · 多任务视图)
 * 应用切换器：展示最近使用的应用卡片
 *   OS.tasks.open()   打开多任务视图
 *   OS.tasks.close()  关闭多任务视图
 *   OS.tasks.switchTo(id)  切换到指定应用
 *   OS.tasks.dismiss(id)   关闭指定应用
 * 触发方式：底部上滑并停顿 / 状态栏双击
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
      overlay.innerHTML = '<div class="ts-container" id="ts-container"></div>';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
      const sysui = document.getElementById('os-sysui');
      if (sysui) sysui.appendChild(overlay);
    },

    open() {
      if (!overlay) return;
      const container = overlay.querySelector('#ts-container');
      container.innerHTML = '';

      if (recentApps.length === 0) {
        container.innerHTML = '<div class="ts-empty">没有最近使用的应用</div>';
      } else {
        recentApps.forEach(id => {
          const m = OS.apps.get(id);
          if (!m) return;
          const card = document.createElement('div');
          card.className = 'ts-card';
          card.innerHTML = `
            <div class="ts-card-header">
              <div class="ts-card-icon ic ${m.cls}"><os-icon name="${m.icon}"></os-icon></div>
              <span class="ts-card-name">${m.name}</span>
            </div>
            <button class="ts-card-close" data-id="${id}">×</button>
            <div class="ts-card-preview"><os-icon name="${m.icon}" size="48"></os-icon></div>`;
          card.addEventListener('click', (e) => {
            if (e.target.classList.contains('ts-card-close')) return;
            this.switchTo(id);
          });
          card.querySelector('.ts-card-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.dismiss(id);
          });
          container.appendChild(card);
        });
      }

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
      // 重新渲染
      this.open();
    },
  };

  OS.reg('tasks', TS);
})(window);

/* ============================================================
 * nsos - launcher.js (P2.3 / P2.4 · P4.1 manifest 化 · P5 增强化 · P6 文件夹+抽屉)
 * 桌面 Launcher：渲染壁纸上的图标网格 + Dock + 桌面小组件 + 文件夹 + 全部应用抽屉。
 * 数据完全来自 OS.apps 应用注册表（app-registry.js），
 * 与具体应用零耦合——注册一个 manifest 即自动上桌。
 * 点击图标 → OS.nav.push 进入应用任务栈。
 * P5 增强：桌面小组件（时钟 + 天气）+ 页面指示器 + 搜索栏
 * P6 增强：应用文件夹（长按进入编辑模式，拖拽创建）+ 全部应用抽屉
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const LAUNCHER = {
    editMode: false,
    folders: null,       // 文件夹数据 { id: { name, apps: [] } }
    folderOverlay: null,
    drawerOverlay: null,
    draggedIcon: null,
    dragTargetFolder: null,

    init() {
      this.folders = OS.storage.get('launcher:folders', {});
      this._buildWidgets();
      this._buildSearch();
      this._buildGrid();
      this._buildDock();
      this._buildPageIndicator();
      this._bindEditMode();
      this._buildDrawer();
    },

    /* 桌面小组件：时钟 */
    _buildWidgets() {
      const grid = document.querySelector('.launcher-grid');
      if (!grid) return;

      // 时钟小组件
      const clockWidget = document.createElement('div');
      clockWidget.className = 'hw-widget hw-clock';
      clockWidget.innerHTML = `
        <div class="hw-cw-time" id="hw-cw-time">--:--</div>
        <div class="hw-cw-date" id="hw-cw-date">----</div>`;
      clockWidget.addEventListener('click', () => OS.nav.push('clock'));
      grid.appendChild(clockWidget);

      // 更新时钟
      const pad = n => String(n).padStart(2, '0');
      const tick = () => {
        const now = new Date();
        const tEl = clockWidget.querySelector('#hw-cw-time');
        const dEl = clockWidget.querySelector('#hw-cw-date');
        if (tEl) tEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
        if (dEl) dEl.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + ['日','一','二','三','四','五','六'][now.getDay()];
      };
      tick();
      setInterval(tick, 1000);
    },

    /* 搜索栏 */
    _buildSearch() {
      const grid = document.querySelector('.launcher-grid');
      if (!grid) return;

      const search = document.createElement('div');
      search.className = 'hw-search-bar';
      search.innerHTML = `<span class="hw-search-icon"><os-icon name="search" size="14"></os-icon></span><span class="hw-search-placeholder">搜索</span>`;
      grid.appendChild(search);

      // 点击搜索栏 -> 打开 Spotlight 全局搜索
      search.addEventListener('click', () => {
        if (OS.spotlight && OS.spotlight.open) OS.spotlight.open();
      });
    },

    _buildGrid() {
      const grid = document.querySelector('.launcher-grid');
      if (!grid) return;
      const hidden = OS.storage.get('launcher:hidden', []);
      // 渲染文件夹
      Object.values(this.folders || {}).forEach(folder => {
        grid.appendChild(this._makeFolderIcon(folder));
      });
      // 渲染独立应用（不在任何文件夹中的，且未被隐藏的）
      const folderAppIds = new Set();
      Object.values(this.folders || {}).forEach(f => f.apps.forEach(id => folderAppIds.add(id)));
      OS.apps.list().forEach((app) => {
        if (!folderAppIds.has(app.id) && !hidden.includes(app.id)) {
          grid.appendChild(this._makeIcon(app));
        }
      });
    },

    _buildDock() {
      const dock = document.querySelector('.launcher-dock');
      if (!dock) return;
      OS.apps.dock().forEach((app) => dock.appendChild(this._makeIcon(app)));
    },

    /* 所有应用入口按钮 - 点击打开全部应用抽屉 */
    _buildPageIndicator() {
      const launcher = document.querySelector('.launcher');
      if (!launcher) return;
      const indicator = document.createElement('div');
      indicator.className = 'hw-all-apps-btn';
      indicator.innerHTML = '<os-icon name="apps" size="16"></os-icon><span>所有应用</span><os-icon name="search" size="14"></os-icon>';
      indicator.style.cursor = 'pointer';
      indicator.addEventListener('click', () => this.openDrawer());
      launcher.insertBefore(indicator, launcher.querySelector('.launcher-dock'));
    },

    _makeIcon(app) {
      const el = document.createElement('div');
      el.className = 'app-icon';
      el.dataset.appId = app.id;
      el.innerHTML = `<div class="ic ${app.cls}"><os-icon name="${app.icon}"></os-icon></div><span class="nm">${app.name}</span>`;
      el.addEventListener('click', (e) => {
        if (this.editMode) return;
        const rect = el.querySelector('.ic').getBoundingClientRect();
        OS.bus.emit('launcher:launch', { app, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      });
      // 右键上下文菜单（桌面端）
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._showContextMenu(app, e.clientX, e.clientY);
      });
      // 长按进入编辑模式（短按拖动在编辑模式下直接触发）
      let pressTimer = null;
      let longPressFired = false;
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        longPressFired = false;
        if (this.editMode) {
          // 编辑模式下：直接开始拖动
          this._startDrag(el, e.clientX, e.clientY);
          e.preventDefault();
        } else {
          // 非编辑模式：长按进入编辑模式
          pressTimer = setTimeout(() => {
            longPressFired = true;
            this.enterEditMode();
            this._startDrag(el, e.clientX, e.clientY);
          }, 500);
        }
      });
      const cancelPress = () => { clearTimeout(pressTimer); };
      el.addEventListener('pointerup', () => {
        cancelPress();
        if (longPressFired) {
          // 长按后松手，停止拖动
          this._endDrag();
        }
      });
      el.addEventListener('pointerleave', cancelPress);
      el.addEventListener('pointercancel', cancelPress);
      return el;
    },

    /* Pointer-based drag and drop (works on touch and mouse) */
    _startDrag(el, startX, startY) {
      if (this._dragGhost) return;
      this.draggedIcon = el;
      el.classList.add('dragging');

      // Create drag ghost
      const ghost = el.cloneNode(true);
      ghost.className = 'app-icon drag-ghost';
      ghost.style.position = 'fixed';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '9999';
      ghost.style.opacity = '0.9';
      ghost.style.transform = 'scale(1.1)';
      ghost.style.transition = 'transform .15s ease';
      const rect = el.getBoundingClientRect();
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.width = rect.width + 'px';
      document.body.appendChild(ghost);
      this._dragGhost = ghost;
      this._dragOffsetX = startX - rect.left;
      this._dragOffsetY = startY - rect.top;

      // Global move/up handlers
      this._dragMoveHandler = (e) => this._onDragMove(e);
      this._dragEndHandler = (e) => this._onDragEnd(e);
      document.addEventListener('pointermove', this._dragMoveHandler);
      document.addEventListener('pointerup', this._dragEndHandler);
      document.addEventListener('pointercancel', this._dragEndHandler);
    },

    _onDragMove(e) {
      if (!this._dragGhost) return;
      this._dragGhost.style.left = (e.clientX - this._dragOffsetX) + 'px';
      this._dragGhost.style.top = (e.clientY - this._dragOffsetY) + 'px';

      // Find drop target
      const ghostRect = this._dragGhost.getBoundingClientRect();
      const centerX = ghostRect.left + ghostRect.width / 2;
      const centerY = ghostRect.top + ghostRect.height / 2;

      // Clear previous highlights
      document.querySelectorAll('.drop-target').forEach(t => t.classList.remove('drop-target'));

      // Find icon under pointer
      const elements = document.elementsFromPoint(centerX, centerY);
      for (const elem of elements) {
        const icon = elem.closest('.app-icon');
        if (icon && icon !== this.draggedIcon && icon.closest('.launcher-grid')) {
          icon.classList.add('drop-target');
          break;
        }
      }
    },

    _onDragEnd(e) {
      if (!this._dragGhost) return;

      // Check drop target
      const ghostRect = this._dragGhost.getBoundingClientRect();
      const centerX = ghostRect.left + ghostRect.width / 2;
      const centerY = ghostRect.top + ghostRect.height / 2;
      const elements = document.elementsFromPoint(centerX, centerY);
      let targetIcon = null;
      for (const elem of elements) {
        const icon = elem.closest('.app-icon');
        if (icon && icon !== this.draggedIcon && icon.closest('.launcher-grid')) {
          targetIcon = icon;
          break;
        }
      }

      if (targetIcon && this.draggedIcon) {
        const draggedId = this.draggedIcon.dataset.appId;
        const targetId = targetIcon.dataset.appId;
        if (draggedId && targetId) {
          this._createFolder(draggedId, targetId);
        }
      }

      this._endDrag();
    },

    _endDrag() {
      document.querySelectorAll('.drop-target').forEach(t => t.classList.remove('drop-target'));
      if (this._dragGhost) {
        this._dragGhost.remove();
        this._dragGhost = null;
      }
      if (this.draggedIcon) {
        this.draggedIcon.classList.remove('dragging');
        this.draggedIcon = null;
      }
      if (this._dragMoveHandler) {
        document.removeEventListener('pointermove', this._dragMoveHandler);
        this._dragMoveHandler = null;
      }
      if (this._dragEndHandler) {
        document.removeEventListener('pointerup', this._dragEndHandler);
        document.removeEventListener('pointercancel', this._dragEndHandler);
        this._dragEndHandler = null;
      }
    },

    /* 右键上下文菜单 */
    _showContextMenu(app, x, y) {
      this._closeContextMenu();
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      const menu = document.createElement('div');
      menu.className = 'ctx-menu';
      menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
      menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
      const items = [
        { label: '打开', icon: 'play', action: () => {
          const rect = { left: x, top: y, width: 0, height: 0 };
          OS.bus.emit('launcher:launch', { app, x, y });
        }},
        { label: '分享', icon: 'share', action: () => {
          const toast = OS.ui && OS.ui.toast;
          if (toast) toast('分享：' + app.name, { ms: 1200 });
        }},
        { label: '添加到文件夹', icon: 'folder', action: () => {
          this.enterEditMode();
          const toast = OS.ui && OS.ui.toast;
          if (toast) toast('拖拽到其他图标创建文件夹', { ms: 2000 });
        }},
        { label: '应用信息', icon: 'info', action: () => {
          const toast = OS.ui && OS.ui.toast;
          if (toast) toast(`${app.name} v${app.version} - ${app.description}`, { ms: 3000 });
        }},
      ];
      items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'ctx-item';
        btn.innerHTML = `<span class="ctx-ic"><os-icon name="${item.icon}" size="16"></os-icon></span><span>${item.label}</span>`;
        btn.addEventListener('click', () => {
          this._closeContextMenu();
          item.action();
        });
        menu.appendChild(btn);
      });
      sysui.appendChild(menu);
      this._ctxMenu = menu;
      // 点击外部关闭
      setTimeout(() => {
        const handler = (e) => {
          if (!menu.contains(e.target)) {
            this._closeContextMenu();
            document.removeEventListener('pointerdown', handler);
          }
        };
        document.addEventListener('pointerdown', handler);
      }, 0);
    },

    _closeContextMenu() {
      if (this._ctxMenu) {
        this._ctxMenu.remove();
        this._ctxMenu = null;
      }
    },

    /* 创建文件夹图标 */
    _makeFolderIcon(folder) {
      const el = document.createElement('div');
      el.className = 'app-folder';
      el.dataset.folderId = folder.id;
      const appsInFolder = folder.apps.map(id => OS.apps.get(id)).filter(Boolean);
      const previewIcons = appsInFolder.slice(0, 4).map(a =>
        `<div class="ic ${a.cls}" style="width:28px;height:28px;border-radius:8px;"><os-icon name="${a.icon}" size="14"></os-icon></div>`
      ).join('');
      el.innerHTML = `
        <div class="folder-ic">${previewIcons}</div>
        <span class="nm">${folder.name || '文件夹'}</span>`;
      el.addEventListener('click', () => {
        if (this.editMode) return;
        this._openFolder(folder.id);
      });
      // 长按进入编辑模式
      let pressTimer = null;
      el.addEventListener('pointerdown', () => {
        pressTimer = setTimeout(() => this.enterEditMode(), 500);
      });
      el.addEventListener('pointerup', () => clearTimeout(pressTimer));
      el.addEventListener('pointerleave', () => clearTimeout(pressTimer));
      // 编辑模式拖拽
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        if (!this.editMode) { e.preventDefault(); return; }
        this.draggedIcon = el;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        this.draggedIcon = null;
      });
      el.addEventListener('dragover', (e) => {
        if (!this.editMode || !this.draggedIcon) return;
        e.preventDefault();
        el.classList.add('drop-target');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop-target');
        if (!this.editMode || !this.draggedIcon) return;
        const draggedId = this.draggedIcon.dataset.appId;
        if (draggedId) {
          this._addToFolder(folder.id, draggedId);
        }
      });
      return el;
    },

    /* 创建新文件夹 */
    _createFolder(appId1, appId2) {
      const folderId = 'f' + Date.now();
      const app1 = OS.apps.get(appId1);
      const app2 = OS.apps.get(appId2);
      if (!app1 || !app2) return;
      this.folders[folderId] = {
        id: folderId,
        name: '新建文件夹',
        apps: [appId1, appId2]
      };
      this._saveFolders();
      this._rebuildGrid();
      const toast = OS.ui && OS.ui.toast;
      if (toast) toast('已创建文件夹', { ms: 1200 });
      // 打开新文件夹让用户命名
      setTimeout(() => this._openFolder(folderId), 300);
    },

    /* 向现有文件夹添加应用 */
    _addToFolder(folderId, appId) {
      const folder = this.folders[folderId];
      if (!folder) return;
      if (folder.apps.includes(appId)) return;
      // 如果应用在另一个文件夹中，先移出
      Object.values(this.folders).forEach(f => {
        if (f.id !== folderId) {
          f.apps = f.apps.filter(id => id !== appId);
          if (f.apps.length === 0) delete this.folders[f.id];
        }
      });
      folder.apps.push(appId);
      this._saveFolders();
      this._rebuildGrid();
      const toast = OS.ui && OS.ui.toast;
      if (toast) toast('已移入文件夹', { ms: 1000 });
    },

    /* 打开文件夹 */
    _openFolder(folderId) {
      const folder = this.folders[folderId];
      if (!folder) return;
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      // 移除已存在的
      if (this.folderOverlay) this.folderOverlay.remove();
      const overlay = document.createElement('div');
      overlay.className = 'folder-overlay';
      const apps = folder.apps.map(id => OS.apps.get(id)).filter(Boolean);
      overlay.innerHTML = `
        <div class="folder-view">
          <div class="folder-bar">
            <input class="folder-name-input" value="${folder.name || '文件夹'}" placeholder="文件夹名称">
            <button class="folder-close-btn">×</button>
          </div>
          <div class="folder-grid"></div>
        </div>`;
      const grid = overlay.querySelector('.folder-grid');
      apps.forEach(app => {
        const icon = document.createElement('div');
        icon.className = 'app-icon';
        icon.innerHTML = `<div class="ic ${app.cls}"><os-icon name="${app.icon}"></os-icon></div><span class="nm">${app.name}</span>`;
        icon.addEventListener('click', () => {
          if (this.editMode) return;
          this._closeFolder();
          setTimeout(() => OS.bus.emit('launcher:launch', { app }), 200);
        });
        grid.appendChild(icon);
      });
      // 命名
      const nameInput = overlay.querySelector('.folder-name-input');
      nameInput.addEventListener('input', () => {
        folder.name = nameInput.value;
        this._saveFolders();
      });
      nameInput.addEventListener('blur', () => {
        this._rebuildGrid();
      });
      // 关闭
      overlay.querySelector('.folder-close-btn').addEventListener('click', () => this._closeFolder());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this._closeFolder();
      });
      sysui.appendChild(overlay);
      this.folderOverlay = overlay;
      requestAnimationFrame(() => overlay.classList.add('open'));
    },

    _closeFolder() {
      if (!this.folderOverlay) return;
      this.folderOverlay.classList.remove('open');
      setTimeout(() => {
        if (this.folderOverlay) {
          this.folderOverlay.remove();
          this.folderOverlay = null;
        }
      }, 300);
    },

    _saveFolders() {
      OS.storage.set('launcher:folders', this.folders);
    },

    _rebuildGrid() {
      const grid = document.querySelector('.launcher-grid');
      if (!grid) return;
      const hidden = OS.storage.get('launcher:hidden', []);
      // 清除非 widget 元素
      Array.from(grid.children).forEach(child => {
        if (!child.classList.contains('hw-widget') && !child.classList.contains('hw-search-bar')) {
          child.remove();
        }
      });
      // 重新渲染
      Object.values(this.folders || {}).forEach(folder => {
        grid.appendChild(this._makeFolderIcon(folder));
      });
      const folderAppIds = new Set();
      Object.values(this.folders || {}).forEach(f => f.apps.forEach(id => folderAppIds.add(id)));
      OS.apps.list().forEach((app) => {
        if (!folderAppIds.has(app.id) && !hidden.includes(app.id)) {
          grid.appendChild(this._makeIcon(app));
        }
      });
    },

    /* 进入编辑模式（抖动） */
    enterEditMode() {
      this.editMode = true;
      document.querySelector('.launcher')?.classList.add('edit-mode');
      const toast = OS.ui && OS.ui.toast;
      if (toast) toast('编辑模式：拖拽图标创建文件夹', { ms: 2000 });
    },

    exitEditMode() {
      this.editMode = false;
      document.querySelector('.launcher')?.classList.remove('edit-mode');
    },

    _bindEditMode() {
      // 点击空白区域退出编辑模式
      document.addEventListener('pointerdown', (e) => {
        if (!this.editMode) return;
        if (e.target.closest('.app-icon') || e.target.closest('.app-folder') ||
            e.target.closest('.folder-overlay')) return;
        this.exitEditMode();
      });
      // 编辑模式：点击删除徽章
      document.addEventListener('click', (e) => {
        if (!this.editMode) return;
        // 检查是否点击了 ::after 伪元素区域（左上角红色按钮）
        const icon = e.target.closest('.app-icon, .app-folder');
        if (icon) {
          const rect = icon.getBoundingClientRect();
          const relX = e.clientX - rect.left;
          const relY = e.clientY - rect.top;
          if (relX < 26 && relY < 26) {
            // 点击了删除按钮
            e.stopPropagation();
            e.preventDefault();
            if (icon.dataset.folderId) {
              // 删除文件夹
              delete this.folders[icon.dataset.folderId];
              this._saveFolders();
              this._rebuildGrid();
              const toast = OS.ui && OS.ui.toast;
              if (toast) toast('文件夹已删除', { ms: 1200 });
            } else if (icon.dataset.appId) {
              // 从桌面移除应用（加入隐藏列表）
              const hidden = OS.storage.get('launcher:hidden', []);
              if (!hidden.includes(icon.dataset.appId)) {
                hidden.push(icon.dataset.appId);
                OS.storage.set('launcher:hidden', hidden);
              }
              this._rebuildGrid();
              const toast = OS.ui && OS.ui.toast;
              if (toast) toast('应用已从桌面移除', { ms: 1200 });
            }
          }
        }
      });
      // 桌面右键菜单
      const homeLayer = document.getElementById('layer-home');
      if (homeLayer) {
        homeLayer.addEventListener('contextmenu', (e) => {
          // 只在壁纸区域右键时触发
          if (e.target.closest('.app-icon') || e.target.closest('.app-folder') ||
              e.target.closest('.hw-widget') || e.target.closest('.hw-search-bar')) return;
          e.preventDefault();
          this._showDesktopMenu(e.clientX, e.clientY);
        });
      }
    },

    /* 桌面右键菜单（壁纸切换等） */
    _showDesktopMenu(x, y) {
      this._closeContextMenu();
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      const menu = document.createElement('div');
      menu.className = 'ctx-menu';
      menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
      menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
      const currentWp = parseInt(OS.storage.get('wallpaper', '0'), 10);
      const items = [
        { label: '更换壁纸', icon: 'image', action: () => this._cycleWallpaper() },
        { label: '编辑主屏幕', icon: 'edit', action: () => this.enterEditMode() },
        { label: '全部应用', icon: 'apps', action: () => this.openDrawer() },
        { label: currentWp === 0 ? '深色模式 ✓' : '深色模式', icon: 'dark', action: () => this._toggleTheme() },
      ];
      items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'ctx-item';
        btn.innerHTML = `<span class="ctx-ic"><os-icon name="${item.icon}" size="16"></os-icon></span><span>${item.label}</span>`;
        btn.addEventListener('click', () => {
          this._closeContextMenu();
          item.action();
        });
        menu.appendChild(btn);
      });
      sysui.appendChild(menu);
      this._ctxMenu = menu;
      setTimeout(() => {
        const handler = (e) => {
          if (!menu.contains(e.target)) {
            this._closeContextMenu();
            document.removeEventListener('pointerdown', handler);
          }
        };
        document.addEventListener('pointerdown', handler);
      }, 0);
    },

    /* 切换壁纸 */
    _cycleWallpaper() {
      const current = parseInt(OS.storage.get('wallpaper', '0'), 10);
      const next = (current + 1) % 5;
      OS.storage.set('wallpaper', String(next));
      this._applyWallpaper();
      const names = ['深空', '琥珀之夜', '极光', '暮光', '深海'];
      const toast = OS.ui && OS.ui.toast;
      if (toast) toast('壁纸：' + names[next], { ms: 1500 });
    },

    /* 切换主题 */
    _toggleTheme() {
      const darkOn = OS.storage.get('cc:dark', true);
      const next = !darkOn;
      OS.storage.set('cc:dark', next);
      const root = document.getElementById('os-root');
      if (root) root.classList.toggle('os-theme-light', !next);
      OS.bus.emit('cc:toggle', { id: 'dark', on: next });
      const toast = OS.ui && OS.ui.toast;
      if (toast) toast(next ? '深色模式' : '浅色模式', { ms: 1000 });
    },

    /* ---------- 全部应用抽屉 ---------- */
    _buildDrawer() {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      const overlay = document.createElement('div');
      overlay.className = 'app-drawer';
      overlay.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-search">
            <span class="hw-search-icon"><os-icon name="brightness" size="14"></os-icon></span>
            <input class="hw-search-input drawer-search-input" placeholder="搜索全部应用…" id="drawer-search">
          </div>
          <button class="drawer-close">关闭</button>
        </div>
        <div class="drawer-grid" id="drawer-grid"></div>`;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeDrawer();
      });
      overlay.querySelector('.drawer-close').addEventListener('click', () => this.closeDrawer());
      // 搜索
      const searchInput = overlay.querySelector('#drawer-search');
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        const icons = overlay.querySelectorAll('.drawer-grid .app-icon');
        icons.forEach(ic => {
          const name = ic.querySelector('.nm')?.textContent.toLowerCase() || '';
          ic.style.display = name.includes(q) ? '' : 'none';
        });
      });
      sysui.appendChild(overlay);
      this.drawerOverlay = overlay;
    },

    openDrawer() {
      if (!this.drawerOverlay) return;
      const grid = this.drawerOverlay.querySelector('#drawer-grid');
      grid.innerHTML = '';
      OS.apps.all().forEach(app => {
        const el = document.createElement('div');
        el.className = 'app-icon';
        el.innerHTML = `<div class="ic ${app.cls}"><os-icon name="${app.icon}"></os-icon></div><span class="nm">${app.name}</span>`;
        el.addEventListener('click', () => {
          this.closeDrawer();
          setTimeout(() => OS.bus.emit('launcher:launch', { app }), 200);
        });
        grid.appendChild(el);
      });
      this.drawerOverlay.classList.add('open');
    },

    closeDrawer() {
      if (this.drawerOverlay) this.drawerOverlay.classList.remove('open');
    },

    /* 应用保存的壁纸设置 */
    _applyWallpaper() {
      const wallpapers = [
        { name: '深空', css: 'radial-gradient(ellipse at 30% 20%, #1a2a5e, #050608 70%)' },
        { name: '琥珀之夜', css: 'radial-gradient(ellipse at 50% 40%, #2a1a08, #050608 70%)' },
        { name: '极光', css: 'linear-gradient(180deg, #0a0e2e, #1a4a3e, #0a0e2e)' },
        { name: '暮光', css: 'linear-gradient(180deg, #1a0830, #2a1050, #050608)' },
        { name: '深海', css: 'radial-gradient(ellipse at 60% 60%, #0a2a4e, #050608 70%)' },
      ];
      const idx = parseInt(OS.storage.get('wallpaper', '0'), 10);
      const wp = wallpapers[idx] || wallpapers[0];
      const launcher = document.querySelector('.launcher');
      if (launcher) launcher.style.background = wp.css;
      this._spawnParticles();
    },

    /* 生成动态壁纸粒子 */
    _spawnParticles() {
      const layer = document.getElementById('layer-home');
      if (!layer) return;
      // 移除已有粒子层
      const existing = layer.querySelector('.wp-particles');
      if (existing) existing.remove();
      // 创建粒子层
      const container = document.createElement('div');
      container.className = 'wp-particles';
      // 粒子颜色池
      const colors = [
        'rgba(91,141,239,.6)',
        'rgba(239,159,55,.5)',
        'rgba(53,196,162,.4)',
        'rgba(164,82,255,.5)',
        'rgba(255,255,255,.3)',
      ];
      // 生成 15 个粒子
      for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        p.className = 'wp-particle';
        const size = 3 + Math.random() * 8;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const startX = Math.random() * 100;
        const startY = 50 + Math.random() * 50;
        const tx = (Math.random() - 0.5) * 200;
        const ty = -(100 + Math.random() * 200);
        const dur = 15 + Math.random() * 20;
        const delay = Math.random() * 20;
        const opacity = .15 + Math.random() * .25;
        p.style.cssText = `
          width: ${size}px; height: ${size}px;
          left: ${startX}%; top: ${startY}%;
          background: ${color};
          box-shadow: 0 0 ${size * 2}px ${color};
          --wp-dur: ${dur}s;
          --wp-delay: ${delay}s;
          --wp-tx: ${tx}px;
          --wp-ty: ${ty}px;
          --wp-opacity: ${opacity};
          animation-delay: ${delay}s;
        `;
        container.appendChild(p);
      }
      layer.insertBefore(container, layer.firstChild);
    }
  };

  // 在 Launcher init 后应用壁纸
  const _origInit = LAUNCHER.init;
  LAUNCHER.init = function() {
    _origInit.call(this);
    this._applyWallpaper();
  };

  OS.reg('launcher', LAUNCHER);
})(window);

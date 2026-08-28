/* ============================================================
 * nsos - navigation.js (P4.2 · 借鉴 MobileGym 声明式导航 / 任务栈)
 * OS.nav：应用任务栈 + 应用宿主渲染。
 *   push(id, route, params)  入栈并渲染该帧
 *   back()                   返回上一帧；栈空回桌面
 *   popTo(id, route)         回退到指定应用帧；不存在则回桌面
 *   home()                   清空栈回桌面
 *
 * 渲染规则（对标 MobileGym EFSM / reducer 的收敛点）：
 *   1) manifest.routes[route].enter(host, ctx) —— 应用内声明式路由
 *   2) manifest.mount(host, ctx)                —— 默认挂载
 *   3) P5 占位兜底
 * mount/enter 返回的 cleanup 函数会在帧离开时被调用。
 * 本模块依赖 OS.apps（注册表）与 OS.state（状态机），
 * 因此必须在 main.js 之后加载。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;
  const stack = [];
  let currentCleanup = null;

  const nav = {
    /** 当前栈帧 { id, route, params } */
    get current() { return stack.length ? stack[stack.length - 1] : null; },
    get length() { return stack.length; },

    /** 打开 / 推入一个应用（或应用内路由） */
    push(id, route, params) {
      const m = OS.apps.get(id);
      if (!m) {
        console.error(`[nav] 未知应用 "${id}"`);
        return;
      }
      stack.push({ id, route: route || 'home', params: params || {} });
      this._render(stack[stack.length - 1]);
      OS.state.transition('app', { source: 'nav:push', app: id });
    },

    /** 返回上一帧；栈空回桌面 */
    back() {
      if (stack.length <= 1) {
        this.home();
        return;
      }
      stack.pop();
      this._render(stack[stack.length - 1]);
    },

    /** 回退到指定应用帧（可带路由）；找不到则回桌面 */
    popTo(id, route) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].id === id && (!route || stack[i].route === route)) {
          stack.length = i + 1;
          this._render(stack[i]);
          return;
        }
      }
      this.home();
    },

    /** 清空栈回桌面 */
    home() {
      // 添加关闭动画
      const appLayer = document.getElementById('layer-app');
      if (appLayer && !appLayer.hasAttribute('hidden')) {
        appLayer.classList.add('closing');
        setTimeout(() => {
          stack.length = 0;
          this._unmount();
          const host = this._host();
          if (host) host.innerHTML = '';
          OS.state.transition('home', { source: 'nav:home' });
          if (appLayer) {
            appLayer.classList.remove('closing');
          }
        }, 200);
      } else {
        stack.length = 0;
        this._unmount();
        const host = this._host();
        if (host) host.innerHTML = '';
        OS.state.transition('home', { source: 'nav:home' });
      }
    },

    /* ---------- 内部 ---------- */
    _host() { return document.getElementById('app-host'); },

    _unmount() {
      if (typeof currentCleanup === 'function') {
        try { currentCleanup(); } catch (e) { console.error('[nav] cleanup err', e); }
        currentCleanup = null;
      }
    },

    _render(frame) {
      const host = this._host();
      if (!host) return;
      this._unmount();
      host.innerHTML = '';

      const m = OS.apps.get(frame.id);
      if (!m) return;

      const win = document.createElement('div');
      win.className = 'app-window';
      win.innerHTML =
        '<div class="app-titlebar">' +
        '<button class="app-back" type="button" aria-label="返回">‹</button>' +
        '<span class="app-title"></span>' +
        '</div><div class="app-body"></div>';
      win.querySelector('.app-title').textContent = m.name;
      win.querySelector('.app-back').addEventListener('click', () => nav.back());

      const body = win.querySelector('.app-body');
      const ctx = {
        frame,
        route: frame.route,
        params: frame.params,
        manifest: m,
        nav: {
          push: (r, p) => nav.push(frame.id, r, p),
          open: (id, r, p) => nav.push(id, r, p),
          back: () => nav.back(),
          popTo: (r) => nav.popTo(frame.id, r),
        },
      };

      let cleanup = null;
      if (m.routes && m.routes[frame.route] && typeof m.routes[frame.route].enter === 'function') {
        cleanup = m.routes[frame.route].enter(body, ctx) || null;   // ① 应用内路由
      } else if (typeof m.mount === 'function') {
        cleanup = m.mount(body, ctx) || null;                        // ② 默认挂载
      } else {
        body.innerHTML = '<div class="app-placeholder"><div class="ap-name">' + m.name +
          '</div><p>应用容器建设中（P5）</p></div>';                 // ③ 占位兜底
      }
      currentCleanup = cleanup;
      host.appendChild(win);
    },
  };

  OS.reg('nav', nav);
})(window);

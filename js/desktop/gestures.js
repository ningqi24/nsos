/* ============================================================
 * nsos - gestures.js (P3.3 / P5 增强 / P6 应用抽屉手势)
 * 手势导航：模拟 Android / iOS 全屏手势
 *   状态栏下拉        -> 打开控制中心
 *   应用内底部上滑    -> 返回桌面
 *   桌面底部上滑      -> 打开全部应用抽屉（P6）
 *   应用内左/右边缘滑动 -> 返回桌面（back）
 *   底部上滑并停顿    -> 打开多任务视图（P5）
 * 锁屏上滑解锁由 locked.js 负责，此处不重复处理。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  OS.reg('gesture', {
    init() {
      const sb = document.getElementById('sys-statusbar');
      if (sb) this._bindPullDown(sb);
      this._bindGlobal();
    },

    /* 状态栏下拉 -> 控制中心 */
    _bindPullDown(sb) {
      let sy = null;
      sb.addEventListener('pointerdown', (e) => { sy = e.clientY; });
      sb.addEventListener('pointermove', (e) => {
        if (sy === null) return;
        const dy = e.clientY - sy;
        if (dy > 16 && OS.controlcenter && !OS.controlcenter.panel.classList.contains('open')) {
          OS.controlcenter.open();
        }
      });
      sb.addEventListener('pointerup', () => { sy = null; });
      sb.addEventListener('pointercancel', () => { sy = null; });
    },

    /* 全屏手势：底部上滑 / 边缘滑动 / 多任务 / 应用抽屉 */
    _bindGlobal() {
      const root = document.getElementById('os-root');
      let sx = null, sy = null, fired = false, holdTimer = null;

      root.addEventListener('pointerdown', (e) => {
        sx = e.clientX; sy = e.clientY; fired = false;
        // 底部长按 -> 多任务视图
        const H = window.innerHeight;
        if (e.clientY > H * 0.84) {
          holdTimer = setTimeout(() => {
            if (OS.tasks && OS.tasks.open) {
              OS.tasks.open();
            }
          }, 400);
        }
      });

      root.addEventListener('pointermove', (e) => {
        if (sx === null || sy === null || fired) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        const W = window.innerWidth, H = window.innerHeight;

        // 取消长按定时器（如果手指移动了）
        if (holdTimer && Math.abs(dy) > 20) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }

        // 底部上滑
        if (sy > H * 0.84 && dy < -56 && Math.abs(dy) > Math.abs(dx)) {
          fired = true;

          if (OS.state.current === 'app') {
            // 应用中上滑 -> 返回桌面
            OS.state.transition('home', { source: 'gesture-home' });
          } else if (OS.state.current === 'home') {
            // 桌面上滑 -> 打开应用抽屉
            if (OS.launcher && OS.launcher.openDrawer) {
              OS.launcher.openDrawer();
            }
          }
          return;
        }

        // 边缘滑动返回（左缘右滑 / 右缘左滑，仅应用内）
        if (OS.state.current === 'app') {
          const fromLeftEdge  = sx < 26 && dx > 64;
          const fromRightEdge = sx > W - 26 && dx < -64;
          if ((fromLeftEdge || fromRightEdge) && Math.abs(dx) > Math.abs(dy)) {
            fired = true;
            OS.state.transition('home', { source: 'gesture-back' });
          }
        }
      });

      root.addEventListener('pointerup', () => {
        sx = null; sy = null; fired = false;
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      });
      root.addEventListener('pointercancel', () => {
        sx = null; sy = null; fired = false;
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      });
    }
  });
})(window);

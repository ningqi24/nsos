/* ============================================================
 * nsos - gestures.js (P3.3 / P5 增强 / P6 应用抽屉手势)
 * 手势导航：模拟 Android / iOS 全屏手势
 *   顶部下滑          -> 打开/关闭控制中心
 *   应用内底部上滑    -> 返回桌面
 *   桌面底部上滑      -> 打开全部应用抽屉（P6）
 *   应用内左/右边缘滑动 -> 返回桌面（back）
 *   底部上滑并停顿    -> 打开多任务视图（P5）
 * 锁屏上滑解锁由 locked.js 负责，此处不重复处理。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const TOP_ZONE = 70;       // 顶部触发区域高度
  const PULL_THRESHOLD = 24; // 下滑触发阈值

  OS.reg('gesture', {
    init() {
      this._bindGlobal();
    },

    /* 全屏手势统一处理 */
    _bindGlobal() {
      const root = document.getElementById('os-root');
      if (!root) return;

      let sx = null, sy = null, fired = false, holdTimer = null;
      let pulldownFired = false;

      root.addEventListener('pointerdown', (e) => {
        sx = e.clientX; sy = e.clientY; fired = false;
        pulldownFired = false;

        // 底部长按 -> 多任务视图
        const H = window.innerHeight;
        if (e.clientY > H * 0.84) {
          holdTimer = setTimeout(() => {
            if (OS.tasks && OS.tasks.open) {
              OS.tasks.open();
              fired = true;
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

        // 顶部下滑 -> 控制中心（锁屏状态下不触发）
        if (!pulldownFired && sy < TOP_ZONE && dy > PULL_THRESHOLD &&
            Math.abs(dy) > Math.abs(dx) &&
            OS.state.current !== 'locked') {
          pulldownFired = true;
          if (OS.controlcenter) {
            if (OS.controlcenter.panel.classList.contains('open')) {
              OS.controlcenter.close();
            } else {
              OS.controlcenter.open();
            }
          }
          return;
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
        sx = null; sy = null; fired = false; pulldownFired = false;
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      });
      root.addEventListener('pointercancel', () => {
        sx = null; sy = null; fired = false; pulldownFired = false;
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      });
    }
  });
})(window);

/* ============================================================
 * nsos - gestures.js (P3.3)
 * 手势导航：模拟 Android 全屏手势
 *   状态栏下拉        -> 打开控制中心
 *   应用内底部上滑    -> 返回桌面
 *   应用内左/右边缘滑动 -> 返回桌面（back）
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

    /* 全屏手势：底部上滑 / 边缘滑动 */
    _bindGlobal() {
      const root = document.getElementById('os-root');
      let sx = null, sy = null, fired = false;

      root.addEventListener('pointerdown', (e) => {
        sx = e.clientX; sy = e.clientY; fired = false;
      });

      root.addEventListener('pointermove', (e) => {
        if (sx === null || sy === null || fired) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        const W = window.innerWidth, H = window.innerHeight;

        // 底部上滑 -> 返回桌面（仅应用内）
        if (OS.state.current === 'app' && sy > H * 0.84 && dy < -56 && Math.abs(dy) > Math.abs(dx)) {
          fired = true;
          OS.state.transition('home', { source: 'gesture-home' });
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

      root.addEventListener('pointerup', () => { sx = null; sy = null; fired = false; });
      root.addEventListener('pointercancel', () => { sx = null; sy = null; fired = false; });
    }
  });
})(window);

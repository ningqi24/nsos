/* ============================================================
 * nsos - locked.js (P1.7 / P2 占位)
 * 锁屏占位 + Home 占位交互：解锁进桌面、桌面可锁定
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  OS.reg('locked', {
    init() {
      // 锁屏 -> 解锁进桌面
      const unlock = document.getElementById('lock-unlock');
      if (unlock) {
        unlock.addEventListener('click', () =>
          OS.state.transition('home', { source: 'unlock' }));
      }

      // 桌面 -> 锁定回锁屏
      const homeLock = document.getElementById('home-lock');
      if (homeLock) {
        homeLock.addEventListener('click', () =>
          OS.state.transition('locked', { source: 'lock' }));
      }

      // 锁屏时钟（每 30s 刷新一次即可）
      const timeEl = document.querySelector('#layer-locked .lock-time');
      if (timeEl) {
        const tick = () => {
          const d = new Date();
          timeEl.textContent =
            `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        tick();
        setInterval(tick, 30000);
      }
    }
  });
})(window);

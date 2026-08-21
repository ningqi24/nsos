/* ============================================================
 * nsos - locked.js (P2.1)
 * 真锁屏：大字时钟 + 日期 + 上滑/点击解锁。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  OS.reg('locked', {
    timeEl: null,
    dateEl: null,

    init() {
      const layer = document.getElementById('layer-locked');
      this.timeEl = layer.querySelector('.lock-time');
      this.dateEl = layer.querySelector('#lock-date');

      this._render();
      setInterval(() => this._render(), 30000);

      // 上滑手势解锁
      let startY = null;
      layer.addEventListener('pointerdown', (e) => { startY = e.clientY; });
      layer.addEventListener('pointerup', (e) => {
        const dy = (startY === null ? 0 : startY - e.clientY);
        if (dy > 50) { this._unlock(); return; }
        // 位移不足视为点击，也解锁（演示友好）
        if (startY !== null) this._unlock();
        startY = null;
      });
      layer.addEventListener('pointercancel', () => { startY = null; });
    },

    _render() {
      if (!this.timeEl || !this.dateEl) return;
      const d = new Date();
      this.timeEl.textContent =
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      this.dateEl.textContent =
        `nsos · 周${WEEK[d.getDay()]} ${d.getMonth() + 1}月${d.getDate()}日`;
    },

    _unlock() {
      OS.state.transition('home', { source: 'unlock' });
    }
  });
})(window);

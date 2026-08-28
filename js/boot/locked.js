/* ============================================================
 * nsos - locked.js (P2.1)
 * 真锁屏：大字时钟 + 日期 + 上滑手势解锁。
 *   - 仅上滑可解锁（阈值 THRESHOLD），点击/点按不触发任何跳转；
 *   - 拖拽跟手 + 未达阈值自动回弹；
 *   - 解锁带整层上移淡出过渡，避免"点击即进桌面"无间隔。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const THRESHOLD = 96;      // 上滑解锁阈值（px）
  const RUBBER = 0.55;       // 拖拽阻尼系数（跟手感）
  const ANIM_MS = 460;       // 解锁过渡时长（ms）

  OS.reg('locked', {
    layer: null,
    content: null,
    timeEl: null,
    dateEl: null,
    _startY: null,
    _tracking: false,
    _unlocking: false,

    init() {
      this.layer = document.getElementById('layer-locked');
      if (!this.layer) return;
      this.content = this.layer.querySelector('.lock-content');
      this.timeEl = this.layer.querySelector('.lock-time');
      this.dateEl = this.layer.querySelector('#lock-date');
      this.notifsEl = this.layer.querySelector('#lock-notifs');

      this._buildShortcuts();
      this._render();
      this._renderNotifs();
      this._scheduleTick();
      this._bind();

      // 进入锁屏时刷新通知
      OS.bus.on('state:enter:locked', () => this._renderNotifs());
      OS.bus.on('notify:post', () => { if (OS.state.current === 'locked') this._renderNotifs(); });
      OS.bus.on('notify:change', () => { if (OS.state.current === 'locked') this._renderNotifs(); });
    },

    /* 锁屏底部快捷按钮：手电筒 + 相机（iOS 风格） */
    _buildShortcuts() {
      if (this.layer.querySelector('.lock-shortcuts')) return;
      const bar = document.createElement('div');
      bar.className = 'lock-shortcuts';
      bar.innerHTML = `
        <button class="lock-sc-btn lock-sc-torch" id="lock-torch">
          <os-icon name="torch" size="20"></os-icon>
        </button>
        <button class="lock-sc-btn lock-sc-camera" id="lock-cam">
          <os-icon name="camera" size="20"></os-icon>
        </button>`;
      this.layer.appendChild(bar);
      bar.querySelector('#lock-torch').addEventListener('click', () => {
        const toast = OS.ui && OS.ui.toast;
        if (toast) toast('手电筒已开启', { ms: 1200 });
      });
      bar.querySelector('#lock-cam').addEventListener('click', () => {
        this._unlockToApp('camera2');
      });
    },

    /* 快捷解锁并进入指定应用 */
    _unlockToApp(appId) {
      this._unlock();
      setTimeout(() => {
        if (OS.apps.has(appId)) OS.nav.push(appId);
      }, ANIM_MS + 100);
    },

    /* 对齐到下一分钟整点再刷新，避免分钟显示滞后最多 30s */
    _scheduleTick() {
      const now = new Date();
      const next = new Date(now);
      next.setSeconds(0, 0);
      next.setMinutes(next.getMinutes() + 1);
      setTimeout(() => {
        this._render();
        this._scheduleTick();
      }, next.getTime() - now.getTime() + 60);
    },

    _render() {
      if (!this.timeEl || !this.dateEl) return;
      const d = new Date();
      this.timeEl.textContent =
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      this.dateEl.textContent =
        `nsos · 周${WEEK[d.getDay()]} ${d.getMonth() + 1}月${d.getDate()}日`;
    },

    /* 渲染锁屏通知 */
    _renderNotifs() {
      if (!this.notifsEl) return;
      const items = (OS.notify && OS.notify.items) || [];
      if (items.length === 0) {
        this.notifsEl.innerHTML = '';
        this.notifsEl.style.display = 'none';
        return;
      }
      this.notifsEl.style.display = 'flex';
      this.notifsEl.innerHTML = '';
      items.slice(0, 3).forEach(n => {
        const el = document.createElement('div');
        el.className = 'lock-notif';
        el.innerHTML = `<span class="ln-ic"><os-icon name="${n.icon || 'bell'}" size="14"></os-icon></span><div class="ln-body"><div class="ln-title">${n.title}</div><div class="ln-text">${n.text}</div></div>`;
        this.notifsEl.appendChild(el);
      });
    },

    _bind() {
      const layer = this.layer;

      layer.addEventListener('pointerdown', (e) => {
        if (this._unlocking || OS.state.current !== 'locked') return;
        this._startY = e.clientY;
        this._lastY = e.clientY;
        this._tracking = true;
        try { layer.setPointerCapture(e.pointerId); } catch (err) { /* 非关键 */ }
      });

      layer.addEventListener('pointermove', (e) => {
        if (!this._tracking || this._startY === null) return;
        if (this._unlocking || OS.state.current !== 'locked') return;
        const dy = this._startY - e.clientY;      // 向上为正
        if (dy > this._maxPull) this._maxPull = dy;
        const pull = dy > 0 ? dy * RUBBER : 0;    // 仅上滑跟手，下滑忽略
        this._lastY = e.clientY;
        if (this.content) this.content.style.transform = `translateY(${-pull}px)`;
      });

      layer.addEventListener('pointerup', () => {
        if (!this._tracking) return;
        this._tracking = false;
        const dy = this._startY === null ? 0 : this._startY - (this._lastY || 0);
        const maxPull = this._maxPull || dy;
        this._startY = null;
        this._maxPull = 0;
        if (maxPull > THRESHOLD) { this._unlock(); return; }
        this._bounceBack();      // 未达阈值：回弹，不解锁
      });

      layer.addEventListener('pointercancel', () => {
        this._tracking = false;
        this._startY = null;
        this._maxPull = 0;
        this._bounceBack();
      });
    },

    /* 未达阈值：内容回弹到原位 */
    _bounceBack() {
      if (this.content) {
        this.content.style.transition = 'transform .3s cubic-bezier(.2,.9,.3,1.12)';
        this.content.style.transform = 'translateY(0)';
        clearTimeout(this._bounceTimer);
        this._bounceTimer = setTimeout(() => {
          if (this.content) this.content.style.transition = '';
        }, 340);
      }
    },

    /* 解锁：整层上移淡出过渡后进入桌面 */
    _unlock() {
      if (this._unlocking) return;
      this._unlocking = true;

      if (this.content) {
        this.content.style.transition = 'transform ' + ANIM_MS + 'ms cubic-bezier(.35,.7,.2,1)';
        this.content.style.transform = 'translateY(-120%)';
      }
      this.layer.style.transition = 'opacity ' + ANIM_MS + 'ms ease';
      this.layer.style.opacity = '0';

      setTimeout(() => {
        this._reset();
        OS.state.transition('home', { source: 'unlock' });
      }, ANIM_MS);
    },

    /* 复位样式，供下次进入锁屏复用 */
    _reset() {
      this._unlocking = false;
      this.layer.style.transition = '';
      this.layer.style.opacity = '';
      if (this.content) {
        this.content.style.transition = '';
        this.content.style.transform = '';
      }
    }
  });
})(window);

/* ============================================================
 * nsos - locked.js (P2.1 · P6 增强)
 * 真锁屏：大字时钟 + 日期 + 上滑手势解锁。
 *   - 上滑解锁（阈值 THRESHOLD），拖拽跟手 + 未达阈值自动回弹；
 *   - 键盘解锁：Enter / Space / 任意方向上键
 *   - 双击底部快捷区也可解锁（辅助）
 *   - 解锁带整层上移淡出过渡
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const THRESHOLD = 60;      // 上滑解锁阈值（px），降低让解锁更容易
  const RUBBER = 0.65;       // 拖拽阻尼系数（跟手感），提高让跟手感更强
  const ANIM_MS = 380;       // 解锁过渡时长（ms）

  OS.reg('locked', {
    layer: null,
    content: null,
    timeEl: null,
    dateEl: null,
    _startY: null,
    _startX: null,
    _lastY: null,
    _tracking: false,
    _unlocking: false,
    _maxPull: 0,

    init() {
      this.layer = document.getElementById('layer-locked');
      if (!this.layer) return;
      this.content = this.layer.querySelector('.lock-content');
      this.timeEl = this.layer.querySelector('.lock-time');
      this.dateEl = this.layer.querySelector('#lock-date');
      this.notifsEl = this.layer.querySelector('#lock-notifs');

      // 确保锁屏层高优先级接收事件
      this.layer.style.zIndex = '500';
      this.layer.style.touchAction = 'none';
      this.layer.style.userSelect = 'none';
      this.layer.style.webkitUserSelect = 'none';

      this._buildShortcuts();
      this._render();
      this._renderNotifs();
      this._scheduleTick();
      this._bind();

      // 进入锁屏时刷新通知 + 重置状态
      OS.bus.on('state:enter:locked', () => {
        this._renderNotifs();
        this._reset();
      });
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
      const self = this;

      // 指针按下
      layer.addEventListener('pointerdown', (e) => {
        if (self._unlocking || OS.state.current !== 'locked') return;
        self._startY = e.clientY;
        self._startX = e.clientX;
        self._lastY = e.clientY;
        self._tracking = true;
        self._maxPull = 0;
        try { layer.setPointerCapture(e.pointerId); } catch (err) { /* 非关键 */ }
      });

      // 指针移动
      layer.addEventListener('pointermove', (e) => {
        if (!self._tracking || self._startY === null) return;
        if (self._unlocking || OS.state.current !== 'locked') return;
        const dy = self._startY - e.clientY;      // 向上为正
        const dx = Math.abs(e.clientX - self._startX);
        // 水平移动超过垂直移动，可能是左右滑动，忽略
        if (dx > Math.abs(dy) * 1.5 && self._maxPull < 20) return;
        if (dy > self._maxPull) self._maxPull = dy;
        const pull = dy > 0 ? dy * RUBBER : 0;    // 仅上滑跟手，下滑忽略
        self._lastY = e.clientY;
        if (self.content) self.content.style.transform = `translateY(${-pull}px)`;
      });

      // 指针抬起
      layer.addEventListener('pointerup', (e) => {
        if (!self._tracking) return;
        self._tracking = false;
        const dy = self._startY === null ? 0 : self._startY - (self._lastY || 0);
        const maxPull = self._maxPull || dy;
        self._startY = null;
        self._startX = null;
        self._maxPull = 0;
        if (maxPull > THRESHOLD) { self._unlock(); return; }
        self._bounceBack();      // 未达阈值：回弹，不解锁
      });

      layer.addEventListener('pointercancel', () => {
        self._tracking = false;
        self._startY = null;
        self._startX = null;
        self._maxPull = 0;
        self._bounceBack();
      });

      // 键盘解锁：Enter / Space / ArrowUp
      document.addEventListener('keydown', (e) => {
        if (OS.state.current !== 'locked') return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          self._unlock();
        }
      });

      // 点击时间区域也可解锁（辅助方式，避免用户困惑）
      const timeEl = layer.querySelector('.lock-time');
      if (timeEl) {
        let lastTap = 0;
        timeEl.style.cursor = 'pointer';
        timeEl.addEventListener('click', () => {
          const now = Date.now();
          if (now - lastTap < 400) {
            // 双击时间解锁
            self._unlock();
          }
          lastTap = now;
        });
      }

      // 底部小横条上滑提示增强：点击小横条也可解锁
      const grip = layer.querySelector('.lock-grip');
      if (grip) {
        grip.style.cursor = 'pointer';
        grip.addEventListener('click', () => self._unlock());
      }

      // 在 document 级别也监听上滑手势（capture 阶段，防止被 sysui 子元素阻挡）
      let docStartY = null, docStartX = null, docTracking = false, docMaxPull = 0;
      document.addEventListener('pointerdown', (e) => {
        if (OS.state.current !== 'locked' || self._unlocking) return;
        // 从屏幕下半部分开始的滑动才触发（符合上滑解锁直觉）
        if (e.clientY < window.innerHeight * 0.25) return;
        docStartY = e.clientY;
        docStartX = e.clientX;
        docTracking = true;
        docMaxPull = 0;
      }, true); // capture 阶段捕获
      document.addEventListener('pointermove', (e) => {
        if (!docTracking || docStartY === null) return;
        if (OS.state.current !== 'locked' || self._unlocking) return;
        const dy = docStartY - e.clientY;
        const dx = Math.abs(e.clientX - docStartX);
        // 放宽水平移动限制，只要主要方向是上滑即可
        if (dx > Math.abs(dy) * 2 && docMaxPull < 30) return;
        if (dy > docMaxPull) docMaxPull = dy;
        const pull = dy > 0 ? dy * RUBBER : 0;
        if (self.content) self.content.style.transform = `translateY(${-pull}px)`;
      }, true);
      document.addEventListener('pointerup', () => {
        if (!docTracking) return;
        docTracking = false;
        const maxPull = docMaxPull;
        docStartY = null;
        docStartX = null;
        docMaxPull = 0;
        if (maxPull > THRESHOLD) { self._unlock(); return; }
        self._bounceBack();
      }, true);
      document.addEventListener('pointercancel', () => {
        docTracking = false;
        docStartY = null;
        docStartX = null;
        docMaxPull = 0;
        self._bounceBack();
      }, true);
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
      const self = this;
      if (self._unlocking) return;
      self._unlocking = true;

      // 强制 reflow，确保 transition 生效
      if (self.content) {
        self.content.style.transition = 'none';
        void self.content.offsetHeight; // reflow
        self.content.style.transition = 'transform ' + ANIM_MS + 'ms cubic-bezier(.35,.7,.2,1)';
        requestAnimationFrame(() => {
          if (self.content) self.content.style.transform = 'translateY(-120%)';
        });
      }
      self.layer.style.transition = 'none';
      void self.layer.offsetHeight;
      self.layer.style.transition = 'opacity ' + ANIM_MS + 'ms ease';
      requestAnimationFrame(() => {
        self.layer.style.opacity = '0';
      });

      setTimeout(() => {
        // 先转换状态（LayerManager 会隐藏锁屏层），再重置样式
        OS.state.transition('home', { source: 'unlock' });
        requestAnimationFrame(() => self._reset());
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

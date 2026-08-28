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
  const THRESHOLD = 40;      // 上滑解锁阈值（px），进一步降低更容易触发
  const RUBBER = 0.7;        // 拖拽阻尼系数，提高跟手感
  const ANIM_MS = 320;       // 解锁过渡时长（ms），更利落

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

      // 锁屏层本身就是全屏的，直接在上面监听手势
      // 配合 sysui-lockmode 禁用 sysui 子元素事件，确保手势畅通
      this.layer.style.touchAction = 'none';
      this.layer.style.userSelect = 'none';
      this.layer.style.webkitUserSelect = 'none';

      this._buildShortcuts();
      this._render();
      this._renderNotifs();
      this._scheduleTick();
      this._bind();

      // 进入锁屏时：刷新通知、重置状态、禁用 sysui 事件拦截
      OS.bus.on('state:enter:locked', () => {
        this._renderNotifs();
        this._reset();
        const sysui = document.getElementById('os-sysui');
        if (sysui) sysui.classList.add('sysui-lockmode');
      });
      // 离开锁屏时：恢复 sysui 事件
      OS.bus.on('state:change', ({ from }) => {
        if (from === 'locked') {
          const sysui = document.getElementById('os-sysui');
          if (sysui) sysui.classList.remove('sysui-lockmode');
        }
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
      const self = this;
      const layer = this.layer;
      if (!layer) return;

      // ---- 手势状态 ----
      let startY = 0, startX = 0;
      let tracking = false;
      let maxPull = 0;

      function onStart(y, x) {
        if (self._unlocking || OS.state.current !== 'locked') return;
        startY = y;
        startX = x;
        tracking = true;
        maxPull = 0;
        if (self.content) {
          self.content.style.transition = 'none';
        }
      }

      function onMove(y, x) {
        if (!tracking) return;
        if (self._unlocking || OS.state.current !== 'locked') return;
        const dy = startY - y;      // 向上为正
        const dx = Math.abs(x - startX);
        // 水平移动过大且还没怎么拉动时，忽略（可能是左右滑）
        if (dx > Math.abs(dy) * 2.5 && maxPull < 30) return;
        if (dy > maxPull) maxPull = dy;
        const pull = dy > 0 ? dy * RUBBER : 0;
        if (self.content) self.content.style.transform = `translateY(${-pull}px)`;
      }

      function onEnd() {
        if (!tracking) return;
        tracking = false;
        if (self._unlocking) return;
        if (maxPull > THRESHOLD) {
          self._unlock();
        } else {
          self._bounceBack();
        }
      }

      // ---- Pointer 事件（桌面 + 移动端现代浏览器）----
      layer.addEventListener('pointerdown', (e) => {
        onStart(e.clientY, e.clientX);
        try { layer.setPointerCapture(e.pointerId); } catch (err) {}
      });
      layer.addEventListener('pointermove', (e) => {
        onMove(e.clientY, e.clientX);
      });
      layer.addEventListener('pointerup', () => onEnd());
      layer.addEventListener('pointercancel', () => {
        tracking = false;
        self._bounceBack();
      });

      // ---- Touch 事件（兼容部分不支持 pointer 的环境）----
      layer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          onStart(e.touches[0].clientY, e.touches[0].clientX);
        }
      }, { passive: true });
      layer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
          onMove(e.touches[0].clientY, e.touches[0].clientX);
          // 阻止页面滚动
          if (e.cancelable) e.preventDefault();
        }
      }, { passive: false });
      layer.addEventListener('touchend', () => onEnd());
      layer.addEventListener('touchcancel', () => {
        tracking = false;
        self._bounceBack();
      });

      // ---- 键盘解锁 ----
      document.addEventListener('keydown', (e) => {
        if (OS.state.current !== 'locked') return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          self._unlock();
        }
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
      const self = this;
      if (self._unlocking) return;
      self._unlocking = true;

      // 播放解锁动画：内容上移 + 整层淡出
      if (self.content) {
        self.content.style.transition = 'transform ' + ANIM_MS + 'ms cubic-bezier(.35,.7,.2,1)';
        self.content.style.transform = 'translateY(-100%)';
      }
      self.layer.style.transition = 'opacity ' + ANIM_MS + 'ms ease';
      self.layer.style.opacity = '0';

      // 动画结束后进入桌面
      setTimeout(() => {
        try {
          OS.state.transition('home', { source: 'unlock' });
        } catch (e) {
          // 状态转换失败时的兜底：强制隐藏锁屏层
          console.error('[locked] unlock transition failed:', e);
          if (self.layer) self.layer.hidden = true;
        }
        // 延迟一帧再重置样式，避免闪回
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

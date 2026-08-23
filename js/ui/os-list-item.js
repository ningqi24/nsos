/* ============================================================
 * nsos - os-list-item (Web Component)
 * 列表项（通知/设置通用）：
 *   <os-list-item icon="wifi" title="系统更新完成" text="nsos 0.1.0 已就绪" time="09:12" unread></os-list-item>
 * 点击回调：监听事件 "os-click"；可用 el.dismiss() 删除自身（带动画）。
 * ============================================================ */
(function () {
  'use strict';

  const TEMPLATE = `
    <style>
      :host {
        display: flex;
        gap: var(--os-space-3, 12px);
        align-items: flex-start;
        padding: var(--os-space-3, 12px) var(--os-space-4, 16px);
        border-radius: var(--os-radius-md, 16px);
        background: var(--os-glass, rgba(255,255,255,.07));
        border: 1px solid var(--os-border, rgba(255,255,255,.08));
        cursor: pointer;
        transition: background var(--os-dur-fast, .15s) var(--os-ease-out);
        -webkit-tap-highlight-color: transparent;
      }
      :host(:active) { background: rgba(255,255,255,.12); }
      .ic { font-size: var(--os-icon-lg, 22px); line-height: 1; }
      .body { flex: 1; min-width: 0; }
      .row { display: flex; align-items: baseline; gap: var(--os-space-2, 8px); }
      .title {
        font-size: var(--os-font-md, 13px);
        font-weight: var(--os-font-weight-mid, 600);
        color: var(--os-fg-0, #fff);
      }
      .time { font-size: var(--os-font-xs, 10px); color: var(--os-fg-2, rgba(255,255,255,.45)); margin-left: auto; }
      .text {
        font-size: var(--os-font-sm, 12px);
        color: var(--os-fg-1, rgba(255,255,255,.7));
        margin-top: 2px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      :host([unread]) .title::after {
        content: '';
        display: inline-block;
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--os-accent, #ef9f37);
        margin-left: 6px;
        vertical-align: middle;
      }
      :host([read]) { opacity: .6; }
      .x {
        border: none; background: transparent;
        color: var(--os-fg-2, rgba(255,255,255,.45));
        font-size: var(--os-font-sm, 12px); cursor: pointer; padding: 4px;
      }
      .x:hover { color: #fff; }
    </style>
    <span class="ic"></span>
    <div class="body">
      <div class="row"><span class="title"></span><span class="time"></span></div>
      <div class="text"></div>
    </div>
    <button class="x" part="dismiss" title="移除">✕</button>
  `;

  class OsListItem extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE;
      this._ic = this.shadowRoot.querySelector('.ic');
      this._title = this.shadowRoot.querySelector('.title');
      this._time = this.shadowRoot.querySelector('.time');
      this._text = this.shadowRoot.querySelector('.text');
      this._x = this.shadowRoot.querySelector('.x');
      this._render();
    }

    static get observedAttributes() { return ['icon', 'title', 'text', 'time', 'read']; }

    attributeChangedCallback() { this._render(); }

    connectedCallback() {
      this.addEventListener('click', (e) => {
        if (e.composedPath().includes(this._x)) return;
        this.dispatchEvent(new CustomEvent('os-click', { bubbles: false, composed: true }));
      });
      this._x.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('os-dismiss', { bubbles: false, composed: true }));
      });
    }

    _render() {
      if (!this._title) return;
      const icon = this.getAttribute('icon') || '';
      /* icon 视为 os-icon 图标名（如 wifi），渲染为矢量图标 */
      this._ic.innerHTML = '';
      if (icon) {
        const oi = document.createElement('os-icon');
        oi.setAttribute('name', icon);
        oi.setAttribute('size', '22');
        this._ic.appendChild(oi);
      }
      this._title.textContent = this.getAttribute('title') || '';
      this._time.textContent = this.getAttribute('time') || '';
      this._text.textContent = this.getAttribute('text') || '';
      /* read 态由 CSS :host([read]) 纯标记处理，禁止在此修改自身 attribute */
    }

    /* 移除自己（带动画，供通知列表复用） */
    dismiss() {
      this.style.transition = 'opacity .2s, transform .2s';
      this.style.opacity = '0';
      this.style.transform = 'translateX(20px)';
      setTimeout(() => this.remove(), 200);
    }
  }

  if (!customElements.get('os-list-item')) customElements.define('os-list-item', OsListItem);
})();

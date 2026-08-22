/* ============================================================
 * nsos - os-badge (Web Component)
 * 消息角标：<os-badge count="6"></os-badge>
 * 注意：constructor 只 attachShadow，禁止渲染自身内容（W3C 规范），
 *       动态内容必须放在 attributeChangedCallback / connected 处理。
 * ============================================================ */
(function () {
  'use strict';

  const TEMPLATE = `
    <style>
      :host {
        position: relative;
        display: inline-flex;
        min-width: 16px; height: 16px;
        padding: 0 4px;
        border-radius: var(--os-radius-full, 8px);
        background: var(--os-accent, #3b82f6);
        color: #fff;
        font-size: var(--os-font-xs, 9px);
        font-weight: var(--os-font-weight-bold, 700);
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 6px rgba(59,130,246,.6);
      }
      :host([hidden]) { display: none; }
      :host([dot]) { min-width: 8px; width: 8px; height: 8px; padding: 0; }
    </style>
    <span class="num"></span>
  `;

  class OsBadge extends HTMLElement {
    static get observedAttributes() { return ['count', 'dot']; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE;
    }

    connectedCallback() { this._render(); }

    attributeChangedCallback() { this._render(); }

    _render() {
      if (!this.shadowRoot) return;
      const num = this.shadowRoot.querySelector('.num');
      if (!num) return;
      const count = Number(this.getAttribute('count') || 0);
      if (this.hasAttribute('dot')) {
        this.hidden = false;
        num.textContent = '';
        return;
      }
      this.hidden = count <= 0;
      num.textContent = count > 99 ? '99+' : (count > 0 ? String(count) : '');
    }

    /** 便捷：设置未读数（0 隐藏，>0 显示数字） */
    set count(n) {
      if (n > 0) this.setAttribute('count', String(n));
      else this.removeAttribute('count');
      this._render();
    }
    get count() { return Number(this.getAttribute('count') || 0); }
  }

  if (!customElements.get('os-badge')) customElements.define('os-badge', OsBadge);
})();

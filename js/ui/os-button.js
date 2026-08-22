/* ============================================================
 * nsos - os-button (Web Component)
 * 按钮：<os-button variant="primary|ghost|danger|glass" size="sm|md|lg" block>文本</os-button>
 * 用法：document.querySelector('os-button').addEventListener('click', fn)
 * 纯标准 Custom Element + Shadow DOM，无任何依赖，可被任意框架包装。
 * ============================================================ */
(function () {
  'use strict';

  const TEMPLATE = `
    <style>
      :host { display: inline-block; }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--os-space-2, 8px);
        border: none;
        border-radius: var(--os-radius-md, 12px);
        font-size: var(--os-font-md, 14px);
        font-weight: var(--os-font-weight-mid, 600);
        cursor: pointer;
        transition: transform var(--os-dur-fast, .15s) var(--os-ease-out),
                    background var(--os-dur-fast, .15s),
                    opacity var(--os-dur-fast, .15s);
        color: var(--os-fg-0, #fff);
        background: var(--os-glass, rgba(255,255,255,.06));
        padding: 10px 20px;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .btn:active { transform: scale(.96); }
      .btn.block { width: 100%; }

      /* sizes */
      .btn.sm { padding: 6px 12px; font-size: var(--os-font-sm, 12px); border-radius: var(--os-radius-sm, 8px); }
      .btn.lg { padding: 14px 26px; font-size: var(--os-font-lg, 16px); border-radius: var(--os-radius-lg, 18px); }

      /* variants */
      .btn.v-primary { background: var(--os-accent, #3b82f6); color: #fff; }
      .btn.v-danger  { background: var(--os-danger, #ef4444); color: #fff; }
      .btn.v-success { background: var(--os-success, #22c55e); color: #fff; }
      .btn.v-ghost   { background: transparent; border: 1px solid var(--os-border, rgba(255,255,255,.1)); color: var(--os-fg-1, rgba(255,255,255,.7)); }
      .btn.v-glass   { background: var(--os-glass, rgba(255,255,255,.06)); border: 1px solid var(--os-border, rgba(255,255,255,.1)); }
      .btn.disabled { opacity: .4; pointer-events: none; }

      ::slotted(*) { color: inherit; }
    </style>
    <button class="btn" part="btn"><slot></slot></button>
  `;

  class OsButton extends HTMLElement {
    static get observedAttributes() { return ['variant', 'size', 'block', 'disabled']; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = TEMPLATE;
      this._btn = root.querySelector('.btn');
      this._sync();
    }

    connectedCallback() {
      this._btn.addEventListener('click', (e) => {
        if (this.hasAttribute('disabled')) { e.stopPropagation(); return; }
        this.dispatchEvent(new CustomEvent('os-click', { bubbles: false, composed: true }));
      });
    }

    attributeChangedCallback() { this._sync(); }

    _sync() {
      const b = this._btn;
      if (!b) return;
      b.className = 'btn';
      const v = this.getAttribute('variant') || 'glass';
      const s = this.getAttribute('size') || 'md';
      b.classList.add('v-' + v, s);
      if (this.hasAttribute('block')) b.classList.add('block');
      if (this.hasAttribute('disabled')) b.classList.add('disabled');
    }

    get clickable() { return !this.hasAttribute('disabled'); }
  }

  if (!customElements.get('os-button')) customElements.define('os-button', OsButton);
})();

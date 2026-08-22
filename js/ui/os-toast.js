/* ============================================================
 * nsos - os-toast (Web Component)
 * 轻提示：OS.ui.toast('已保存', { type:'success', ms:2000 })
 * 或 <os-toast> 由脚本注入 body，自动淡入淡出。
 * ============================================================ */
(function (global) {
  'use strict';
  const OS = global.OS = global.OS || {};

  const TEMPLATE = `
    <style>
      :host {
        position: fixed;
        left: 50%; bottom: 15%;
        z-index: 9999;
        transform: translate(-50%, 20px);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--os-dur-norm, .3s) var(--os-ease-out),
                    transform var(--os-dur-norm, .3s) var(--os-ease-out);
        background: var(--os-bg-3, #26262e);
        border: 1px solid var(--os-border, rgba(255,255,255,.1));
        color: var(--os-fg-0, #fff);
        border-radius: var(--os-radius-lg, 18px);
        padding: 10px 18px;
        font-size: var(--os-font-md, 14px);
        box-shadow: var(--os-shadow-2, 0 8px 24px rgba(0,0,0,.35));
        max-width: 80vw;
      }
      :host([type=success]) { border-color: var(--os-success, #22c55e); }
      :host([type=danger])  { border-color: var(--os-danger, #ef4444); }
      :host([show]) {
        opacity: 1;
        transform: translate(-50%, 0);
      }
    </style>
    <slot></slot>
  `;

  class OsToast extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE; }
  }
  if (!customElements.get('os-toast')) customElements.define('os-toast', OsToast);

  /* 静态入口：OS.ui.toast(text, opts) */
  OS.ui = OS.ui || {};
  OS.ui.toast = function (text, opts) {
    opts = opts || {};
    const el = document.createElement('os-toast');
    el.textContent = text;
    if (opts.type) el.setAttribute('type', opts.type);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.setAttribute('show', ''));
    setTimeout(() => {
      el.removeAttribute('show');
      setTimeout(() => el.remove(), 320);
    }, opts.ms || 2000);
    return el;
  };
})(window);

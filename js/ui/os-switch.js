/* ============================================================
 * nsos - os-switch (Web Component)
 * 开关：<os-switch checked></os-switch>
 * 属性 .checked / 属性 checked；变化时触发 "change" 事件（composed）。
 * ============================================================ */
(function () {
  'use strict';

  const TEMPLATE = `
    <style>
      :host { display: inline-block; }
      .track {
        position: relative;
        width: 50px; height: 30px;
        border-radius: var(--os-radius-full, 999px);
        background: var(--os-bg-3, #26262e);
        border: 1px solid var(--os-border, rgba(255,255,255,.1));
        cursor: pointer;
        transition: background var(--os-dur-fast, .15s) var(--os-ease-out);
        -webkit-tap-highlight-color: transparent;
      }
      .track.on { background: var(--os-accent, #ef9f37); border-color: transparent; }
      .knob {
        position: absolute;
        top: 3px; left: 3px;
        width: 24px; height: 24px;
        border-radius: 50%;
        background: #fff;
        box-shadow: var(--os-shadow-1, 0 2px 8px rgba(0,0,0,.25));
        transition: transform var(--os-dur-fast, .15s) var(--os-ease-out);
      }
      .track.on .knob { transform: translateX(20px); }
    </style>
    <div class="track" part="track"><div class="knob"></div></div>
  `;

  class OsSwitch extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE;
      this._track = this.shadowRoot.querySelector('.track');
      this._sync();
    }

    static get observedAttributes() { return ['checked', 'disabled']; }

    connectedCallback() {
      this._track.addEventListener('click', () => { this.checked = !this.checked; });
    }

    attributeChangedCallback() { this._sync(); }

    _sync() {
      if (!this._track) return;
      this._track.classList.toggle('on', this.hasAttribute('checked'));
      this._track.style.opacity = this.hasAttribute('disabled') ? '.4' : '1';
      this._track.style.pointerEvents = this.hasAttribute('disabled') ? 'none' : 'auto';
    }

    get checked() { return this.hasAttribute('checked'); }
    set checked(v) {
      const on = !!v;
      this.toggleAttribute('checked', on);
      this._sync();
      this.dispatchEvent(new CustomEvent('change', { detail: { checked: on }, bubbles: true, composed: true }));
    }
  }

  if (!customElements.get('os-switch')) customElements.define('os-switch', OsSwitch);
})();

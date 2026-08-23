/* ============================================================
 * nsos - os-slider (Web Component)
 * 滑杆：<os-slider value="60" min="0" max="100" step="1"></os-slider>
 * 属性 .value；实时触发 "input"，松手触发 "change"（均 composed）。
 * ============================================================ */
(function () {
  'use strict';

  const TEMPLATE = `
    <style>
      :host { display: flex; align-items: center; width: 100%; }
      input[type=range] {
        flex: 1;
        -webkit-appearance: none;
        appearance: none;
        height: 4px;
        border-radius: 2px;
        background: linear-gradient(90deg,
          var(--os-accent, #ef9f37) var(--fill, 0%),
          var(--os-border, rgba(255,255,255,.2)) var(--fill, 0%));
        outline: none;
        cursor: pointer;
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px; height: 18px;
        border-radius: 50%;
        background: #fff;
        border: 3px solid var(--os-accent, #ef9f37);
        box-shadow: var(--os-shadow-1, 0 1px 6px rgba(0,0,0,.4));
        cursor: pointer;
      }
      input[type=range]::-moz-range-thumb {
        width: 18px; height: 18px;
        border-radius: 50%;
        background: #fff;
        border: 3px solid var(--os-accent, #ef9f37);
        cursor: pointer;
      }
    </style>
    <input type="range" part="input">
  `;

  class OsSlider extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE;
      this._input = this.shadowRoot.querySelector('input');
      this._readAttrs();
    }

    static get observedAttributes() { return ['value', 'min', 'max', 'step', 'disabled']; }

    connectedCallback() {
      this._input.addEventListener('input', () => {
        this._paint();
        this.dispatchEvent(new CustomEvent('input', { detail: { value: this.value }, bubbles: true, composed: true }));
      });
      this._input.addEventListener('change', () => {
        this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value }, bubbles: true, composed: true }));
      });
    }

    attributeChangedCallback() {
      this._readAttrs();
      this._paint();
    }

    _readAttrs() {
      this._min = Number(this.getAttribute('min') ?? 0);
      this._max = Number(this.getAttribute('max') ?? 100);
      this._step = Number(this.getAttribute('step') ?? 1);
      this._val = Number(this.getAttribute('value') ?? this._min);
      if (this._input) this._input.min = this._min;
      if (this._input) this._input.max = this._max;
      if (this._input) this._input.step = this._step;
      if (this._input) this._input.value = this._val;
    }

    _paint() {
      if (!this._input) return;
      const pct = ((this._input.value - this._min) / (this._max - this._min)) * 100;
      this._input.style.setProperty('--fill', pct + '%');
    }

    get value() { return this._input ? Number(this._input.value) : this._val; }
    set value(v) { this._input.value = v; this._paint(); }

    get disabled() { return this.hasAttribute('disabled'); }
  }

  if (!customElements.get('os-slider')) customElements.define('os-slider', OsSlider);
})();

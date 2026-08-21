/* ============================================================
 * nsos - event-bus.js (P0.3)
 * 事件总线：系统内一切通信的唯一通道。
 * 层与层之间禁止直接引用，只允许 emit / on。
 * ============================================================ */
(function (global) {
  'use strict';

  class EventBus {
    constructor() {
      this._handlers = new Map(); // event -> Set<fn>
    }

    /** 订阅事件，返回取消订阅函数 */
    on(event, handler) {
      if (typeof handler !== 'function') throw new TypeError('handler must be a function');
      if (!this._handlers.has(event)) this._handlers.set(event, new Set());
      this._handlers.get(event).add(handler);
      return () => this.off(event, handler);
    }

    /** 只触发一次的订阅 */
    once(event, handler) {
      const wrapper = (payload) => {
        this.off(event, wrapper);
        handler(payload);
      };
      return this.on(event, wrapper);
    }

    /** 取消订阅 */
    off(event, handler) {
      const set = this._handlers.get(event);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) this._handlers.delete(event);
    }

    /** 发布事件，逐个派发，单 handler 异常不阻断后续 */
    emit(event, payload) {
      const set = this._handlers.get(event);
      if (!set || set.size === 0) return;
      for (const h of [...set]) {
        try {
          h(payload);
        } catch (e) {
          console.error(`[EventBus] handler error on "${event}":`, e);
        }
      }
    }

    /** 清空全部订阅（通常用于系统重置） */
    clear() {
      this._handlers.clear();
    }

    /** 调试：列出某事件的所有订阅数 */
    listenerCount(event) {
      return this._handlers.has(event) ? this._handlers.get(event).size : 0;
    }
  }

  global.OSEventBus = EventBus;
})(window);

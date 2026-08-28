/* ============================================================
 * nsos - app-registry.js (P4.1 · 借鉴 MobileGym App 模块契约)
 * 应用注册表：每应用一份 manifest，桌面渲染 / 启动 / 导航零耦合。
 * 对标 MobileGym apps/<Name>/manifest.ts 的"文件夹+manifest 自动发现"，
 * nsos 以轻量注册制落地：OS.apps.register(manifest)。
 *
 * manifest 字段：
 *   id          唯一标识（桌面 / 启动 / 导航交叉引用）
 *   name        显示名
 *   icon        os-icon name
 *   cls         图标主题类（沿用 nsos Design Token：ic-blue 等）
 *   dock        是否进 Dock（默认 false 进网格）
 *   version     App 版本
 *   description 描述
 *   placeholder 尚未有真实实现（渲染时走 P5 占位兜底）
 *   mount       (host, ctx) => cleanupFn  挂载真实应用
 *   routes      { routeName: { enter(host, ctx) } }  声明式导航（应用内路由）
 *   meta        其它元数据
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;
  const registry = new Map();

  const app = {
    /** 注册一个应用 manifest（同名覆盖） */
    register(m) {
      if (!m || typeof m.id !== 'string' || !m.id) {
        throw new Error('[apps] manifest.id 必填');
      }
      const entry = {
        id: m.id,
        name: m.name || m.id,
        icon: m.icon || 'apps',
        cls: m.cls || 'ic-blue',
        dock: !!m.dock,
        version: m.version || '0.0.0',
        description: m.description || '',
        placeholder: !!m.placeholder,
        mount: typeof m.mount === 'function' ? m.mount : null,
        routes: m.routes || null,
        meta: m.meta || {},
      };
      registry.set(m.id, entry);
      OS.bus.emit('apps:register', { manifest: entry });
      return entry;
    },

    /** 取单个应用 */
    get(id) { return registry.get(id) || null; },
    has(id) { return registry.has(id); },

    /** 桌面网格清单（排除 Dock 应用） */
    list() { return [...registry.values()].filter(a => !a.dock); },

    /** 全部应用（含 Dock） */
    all() { return [...registry.values()]; },

    /** Dock 清单 */
    dock() { return [...registry.values()].filter(a => a.dock); },

    /** 全部 id（含 Dock） */
    ids() { return [...registry.keys()]; },
  };

  OS.reg('apps', app);
})(window);

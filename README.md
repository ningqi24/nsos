# nsos

一个运行在浏览器里的迷你操作系统（Web-based OS），采用分层架构渲染。

## 结构

```
nsos/
├── index.html         # 系统渲染根，挂载所有 Layer
├── css/
│   ├── base.css       # 基础样式
│   ├── layers.css     # 各 Layer 布局
│   └── boot.css       # 引导/开机动画
└── js/
    ├── main.js        # 入口
    ├── boot/          # 引导链：boot / input / locked / modes
    └── core/          # 内核：core / event-bus / state-machine / storage
```

## 特性

- 多层 Layer 渲染架构，由状态机驱动（poweroff / boot / 工程模式等）
- 事件总线解耦模块通信
- 本地持久化存储
- 支持 Fastboot / Recovery 引导模式（音量键操作）

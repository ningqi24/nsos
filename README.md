# nsos

一个运行在浏览器里的迷你操作系统（Web-based OS），采用分层架构渲染。

## 结构

```
nsos/
├── index.html         # 系统渲染根，挂载所有 Layer
├── css/
│   ├── base.css       # 基础样式
│   ├── layers.css     # 各 Layer 布局
│   ├── boot.css       # 引导/开机动画
│   └── desktop.css    # 桌面层：状态栏 / 锁屏 / Launcher
└── js/
    ├── main.js        # 入口
    ├── boot/          # 引导链：boot / input / locked / modes
    ├── desktop/       # 桌面层：statusbar / launcher
    └── core/          # 内核：core / event-bus / state-machine / storage
```

## 特性

- 多层 Layer 渲染架构，由状态机驱动（poweroff / boot / locked / home / app / 工程模式等）
- 事件总线解耦模块通信
- 本地持久化存储
- 支持 Fastboot / Recovery 引导模式（音量键操作）
- 真锁屏：大字时钟 + 日期，上滑/点击解锁
- 桌面 Launcher：图标网格 + Dock，点击图标进应用（P5 占位）
- 状态栏常驻：时间 / 信号 / 电量；双击状态栏锁定回锁屏

## 交互速览

| 场景 | 操作 |
|------|------|
| 开机动画 | `-` = Fastboot，`=` = Recovery |
| 工程模式 | ↑/↓ 选择，Enter 确认 |
| 锁屏 | 上滑 或 点击任意处 解锁 |
| 桌面 | 点击图标进入应用；双击状态栏返回锁屏 |
| 关机 | 任意键开机；状态机支持 poweroff |

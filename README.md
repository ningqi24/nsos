# nsos

一个运行在浏览器里的迷你操作系统（Web-based OS），采用分层架构渲染，**以统一命令引擎（终端底层）驱动系统功能**。

## 结构

```
nsos/
├── index.html         # 系统渲染根，挂载所有 Layer
├── css/
│   ├── base.css       # 基础样式
│   ├── layers.css     # 各 Layer 布局
│   ├── boot.css       # 引导/开机动画
│   ├── desktop.css    # 桌面层：状态栏 / 锁屏 / Launcher
│   └── terminal.css   # 终端应用窗口 / 工程模式内嵌终端
└── js/
    ├── main.js        # 入口（应用窗口渲染）
    ├── boot/          # 引导链：boot / input / locked / modes
    ├── desktop/       # 桌面层：statusbar / launcher
    ├── core/          # 内核：core / event-bus / state-machine / storage /
    │                  #       device（真实设备信息）/ shell（统一命令引擎）
    └── ui/            # Web Components：os-icon / os-terminal 等
```

## 终端底层（统一命令引擎）

`js/core/shell.js` 提供 `OS.shell`——系统全部"功能"的最终执行者。桌面终端、工程模式菜单、命令行面板都是它的入口或渲染层：

- **命令统一执行**：`reboot` / `poweroff` 真实驱动状态机切换；`fastboot` / `adb` 命令族驱动刷写 / 解锁 / sideload
- **真实设备信息**：`devinfo` 通过 `OS.device`（Battery Status API / 屏幕 / UA / 网络 / 内存 / 触屏等）实时采集，取不到显示"不可用"，不造假
- **Bootloader 锁定状态**：`fastboot flashing unlock/lock` 结果经 `OS.storage` 持久化，`getvar` / `cat /proc/cmdline` 均反映真实锁定状态；解锁后刷写才被允许
- **统一进度源**：`shell.updater` 是全局唯一传输会话计时器，刷写 / sideload / OTA 共用，工程模式界面与终端输出同步订阅
- **轻量 VFS**：`ls` / `cat` 只读 `/system` `/proc` `/sdcard`
- **终端 UI**：`os-terminal` Web Component（阴影 DOM），支持命令历史（↑/↓）、流式输出、`clear` 清屏；桌面「终端」应用与工程模式「命令行（Shell）」复用同一组件

## 特性

- 多层 Layer 渲染架构，由状态机驱动（poweroff / boot / locked / home / app / 工程模式等）
- 事件总线解耦模块通信；本地持久化存储
- Fastboot / Recovery 引导（音量键）；工程模式菜单动作统一走 shell 命令，含解锁 Bootloader、内嵌命令行
- 真锁屏：大字时钟 + 日期，上滑/点击解锁
- 桌面 Launcher：图标网格 + Dock，点击进入应用；「终端」为真实应用，其余 P5 占位
- 状态栏常驻：时间 / 信号 / 真实电量（实时监听充电/电量变化）；双击状态栏锁定回锁屏

## 终端命令速览

| 命令 | 作用 |
|------|------|
| `help` / `clear` / `echo` / `version` / `date` / `uname -a` | 基础命令 |
| `devinfo` | 真实设备信息 |
| `ls <dir>` / `cat <file>` | 只读虚拟文件系统 |
| `reboot [system\|recovery\|fastboot]` | 重启到目标模式 |
| `fastboot devices` / `getvar all` | 设备 / 变量 |
| `fastboot flash <part>` / `erase <part>` | 刷写 / 擦除（需解锁） |
| `fastboot flashing unlock\|lock` | 解锁 / 上锁（持久化） |
| `adb devices` / `adb reboot <t>` / `adb sideload <zip>` | ADB（sideload 需 recovery） |
| `unlock` / `lock` | 便捷解锁 / 上锁 |

## 交互速览

| 场景 | 操作 |
|------|------|
| 开机动画 | `-` = Fastboot，`=` = Recovery |
| 工程模式 | ↑/↓ 选择，Enter 确认 |
| 应用 / 终端 | 点击桌面图标进入；左上角 ‹ 返回 |
| 锁屏 | 上滑 或 点击任意处 解锁 |
| 桌面 | 点击图标进入应用；双击状态栏返回锁屏 |

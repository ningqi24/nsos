# nsos

**一个把终端当内核的网页操作系统（Web-based OS）。**

别的项目是「网页桌面 + 一个终端应用」。nsos 是「终端 + 一张桌面」：

桌面、开机引导、Fastboot 工程模式、Recovery 恢复模式、OTA 系统更新——**全部是 `OS.shell` 这条命令引擎的不同渲染层**。系统里没有任何一个功能可以绕开 shell 直接改状态。

> **`js/core/shell.js`**：2151 行、**61 个内建命令 + 5 个别名**、零依赖的 POSIX 风格 shell（管道 / 重定向 / 后台作业 / 别名 / 环境变量 / 完整 VFS）。
> 工程模式菜单里点「解锁 Bootloader」，执行的就是 `OS.shell.exec('fastboot flashing unlock')`（`js/boot/modes.js:219`）——**没有第二条路径**。

<!-- 建议在这里放一段 20 秒录屏 GIF：终端里粘贴下面那段脚本 -->

## 30 秒自证：在终端里操作整个系统

桌面点开「终端」（或开机动画时按 `-` 进 Fastboot、`=` 进 Recovery），逐行粘贴：

```sh
# ① 系统状态就是命令的返回值
version
devinfo                       # 电量/屏幕/网络/内存，全部来自浏览器真实 API

# ② 分区是真实状态：没挂载就拒绝访问
ls /system                     # → ls: /system: /system is not mounted
mount system
ls /system                     # → version  build.prop
cat /system/build.prop         # → ro.boot.flash.locked=1

# ③ 刷机流程完全由命令驱动 —— 工程模式菜单点的是同一条命令
fastboot devices
fastboot flash system          # → FAILED (remote: Flashing is not allowed for locked devices)
fastboot flashing unlock
cat /proc/cmdline              # → androidboot.verifiedbootstate=orange
fastboot flash system          # → OKAY

# ④ 管道 / 重定向 / 后台作业：它是个真的 shell
cat /proc/mounts | grep system
echo hello > /sdcard/a.txt && cat /sdcard/a.txt
sleep 30 &
jobs

# ⑤ 让它给自己升级
ota check
ota list
ota update
```

## 为什么值得一看

**1. 一个执行者（核心设计）**
`OS.shell` 是系统全部"功能"的最终执行者。`reboot` / `poweroff` 驱动状态机切换，`fastboot` / `adb` 命令族驱动刷写、解锁、sideload，`wipe` / `mount` 驱动分区，`ota` 驱动系统更新。桌面终端、工程模式内嵌终端、设置里的更新界面，都只是它的订阅者——`shell.updater` 是全局唯一的传输会话计时器，刷写 / sideload / OTA 共用。

**2. 系统能给自己 OTA 升级（少见）**
`js/boot/ota-local.js` 手写 ZIP 解析（EOCD + 中央目录，store/deflate 走 `DecompressionStream`，无第三方库），解包后**整体原子替换 Service Worker 缓存**并持久化版本号，升级降级都可以。配合 `sw.js` 的 cache-first 预缓存，整套系统离线可用、且能自我迭代。

**3. UI 与状态的一致性有硬约束**
`js/core/state-machine.js` 用显式转换表（合法转换才允许，非法直接抛错）+ onEnter/onLeave 钩子管理生命周期，`event-bus` 做模块解耦，`app-registry` + `navigation` 让应用以 manifest 插拔、任务栈管理路由。加一个应用只需 `OS.apps.register()`，与内核零耦合。

**4. 不造假的设备信息**
`js/core/device.js` 通过 Battery Status API / screen / UA-CH / Network Information API / `storage.estimate()` 实时采集。**取不到就显示「不可用」，不编数值**——连"支持但被隐私策略拒绝"这种中间状态都单独暴露（`batteryAPI` 字段），便于排查。

## 术语说明（避免误解）

nsos 是**纯前端模拟系统**，只有一处是真的"真"：设备信息与摄像头/麦克风走浏览器真实 API。

其余部分（Fastboot 刷写、Recovery 分区、`/proc`、Bootloader 锁定）的**状态机与持久化是真实的**——解锁状态经 `OS.storage` 持久化后，`getvar` 和 `cat /proc/cmdline` 会一致地反映它，未挂载的分区真的拒绝访问，`wipe data` 真的清空用户数据。**但硬件当然是虚构的**，它不会碰你的手机。

换句话说：**状态一致、行为可验证；硬件是演的。**

## 结构

```
nsos/
├── index.html         # 系统渲染根，挂载所有 Layer
├── sw.js              # Service Worker：全量预缓存 + OTA 缓存替换
├── css/               # tokens / base / layers / boot / desktop / terminal / apps
├── docs/              # UI 设计原则 · 演示脚本
├── ota/               # OTA 包 + manifest.json（更新清单）
└── js/
    ├── main.js        # 入口（装配内核 + LayerManager）
    ├── boot/          # 引导链：boot / input / locked / modes / ota-local
    ├── core/          # 内核：core / event-bus / state-machine / storage /
    │                  #       device（真实设备信息）/ shell（统一命令引擎）/
    │                  #       app-registry（应用注册表）/ navigation（应用任务栈）
    ├── desktop/       # 桌面层：statusbar / launcher / 通知 / 控制中心 / 多任务 / 灵动岛
    ├── apps/          # 内置应用 manifest（builtin-apps.js）
    └── ui/            # Web Components：os-icon / os-terminal / os-settings 等
```

## 特性

- 多层 Layer 渲染架构，由状态机驱动（poweroff / boot / locked / home / app / 工程模式等）
- 事件总线解耦模块通信；本地持久化存储
- Fastboot / Recovery 引导（音量键）；工程模式菜单动作统一走 shell 命令，含解锁 Bootloader、内嵌命令行
- 真锁屏：大字时钟 + 日期，上滑/点击解锁
- 桌面 Launcher：图标网格 + Dock，完全由应用注册表（`OS.apps`）数据驱动——注册一个 manifest 即自动上桌，与内核零耦合
- **应用体系（manifest 插拔式）**：每应用一份 manifest（`id/name/icon/mount/routes`），`js/apps/builtin-apps.js` 统一注册；`OS.nav` 维护应用任务栈，支持应用内路由、跨应用入栈、返回回退（栈空回桌面）。已真实实现：设置 / 终端 / 时钟 / 计算器 / 备忘录 / 浏览器 / 音乐 / 相机 / 日历 等；其余走统一占位兜底
- 状态栏常驻：时间 / 信号 / 真实电量（实时监听充电/电量变化）；双击状态栏锁定回锁屏

## 终端命令速览（61 个 + 5 个别名）

| 命令 | 作用 |
|------|------|
| `help` / `clear` / `echo` / `version` / `date` / `uname` / `man` / `which` | 基础命令 |
| `devinfo` | 真实设备信息 |
| `ls` / `cat` / `df` / `cd` / `mkdir` / `rm` / `cp` / `mv` / `chmod` / `touch` / `find` | 虚拟文件系统（挂载状态真实） |
| `grep` / `head` / `tail` / `tac` / `wc` / `sort` / `uniq` / `seq` / `printf` | 文本处理（可接管道） |
| `mount <system\|cache>` / `umount` | 挂载 / 卸载分区（未挂载拒绝访问） |
| `wipe cache` / `wipe data` | 清空缓存 / 用户数据（含二次确认走菜单） |
| `logcat [-n N]` | 查看 Recovery 会话日志 |
| `reboot [system\|recovery\|fastboot]` / `poweroff` | 重启到目标模式 / 关机 |
| `fastboot devices` / `getvar all` / `flash` / `erase` / `flashing unlock\|lock` | 工程模式（刷写需解锁） |
| `adb devices` / `adb reboot` / `adb sideload <zip>` | ADB（sideload 需 recovery） |
| `ota check` / `ota list` / `ota update [-r]` / `ota apply <zip>` | 系统更新与降级 |
| `jobs` / `ps` / `bg` / `fg` / `kill` / `suspend` / `wait` / `sleep` | 后台作业与作业控制 |
| `alias` / `history` / `env` / `export` / `set` / `unset` / `whoami` / `id` | 会话与环境 |
| `unlock` / `lock` | 便捷解锁 / 上锁 |

## 交互速览

| 场景 | 操作 |
|------|------|
| 开机动画 | `-` = Fastboot，`=` = Recovery |
| 工程模式 | ↑/↓ 选择，Enter 确认 |
| 应用 / 终端 | 点击桌面图标进入；左上角 ‹ 返回 |
| 锁屏 | 上滑 或 点击任意处 解锁 |
| 桌面 | 点击图标进入应用；双击状态栏返回锁屏 |

## 项目状态

功能开发已暂停，进入维护状态。已知欠缺：无自动化测试、无许可证文件、`sw.js` 采用 cache-first（升级依赖 OTA 通道）。

详见 [`docs/DEMO.md`](docs/DEMO.md) 的完整演示脚本。

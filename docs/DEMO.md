# nsos 演示脚本

把这篇当作"人肉 E2E 测试"+ 录屏脚本。全部逐行粘贴即可，每步都有可验证的输出。
**目标：让"终端是内核"这件事在 60 秒内被看见。**

---

## A. 内核即终端（30 秒）

在桌面点开「终端」。

```sh
version
# → nsos b0.2.1 "Aurora"

devinfo
# → 电量 / 充电状态 / 屏幕 / DPR / 网络 / 内存 / 核心数 / 存储 / 触屏
#   全部来自浏览器真实 API；不支持的一律显示「不可用」，不编数值

help
# → 61 个内建命令清单
```

---

## B. 分区是真实状态（Recovery 场景）

开机动画按 `=` 进 Recovery，工程模式菜单选「命令行 (Shell)」。

```sh
ls /system
# → ls: /system: /system is not mounted      ← 未挂载，直接拒绝

mount system
ls /system
# → version  build.prop
cat /system/build.prop
# → ro.nsos.build.version=0.2.1
#   ro.boot.flash.locked=1

cat /proc/mounts | grep system
# → /dev/block/mmcblk0p26 /system ext4 ro,seclabel 0 0

umount system
ls /system
# → ls: /system: /system is not mounted
```

**这一段的看点**：`mount` / `/proc/mounts` / `ls` 三者状态始终自洽——不是一个假 ls 在念稿子。

---

## C. 刷机全流程由命令驱动（Fastboot 场景）

开机动画按 `-` 进 Fastboot，菜单选「命令行 (Shell)」。

```sh
fastboot devices
fastboot getvar secure
# → (bootloader) secure: yes

fastboot flash system
# → FAILED (remote: Flashing is not allowed for locked devices)
#   提示：先 fastboot flashing unlock 解锁后重试。

fastboot flashing unlock
cat /proc/cmdline
# → androidboot.verifiedbootstate=orange androidboot.flash.locked=0
#   解锁状态被持久化，重启后依然有效

fastboot flash system
# → 开始刷写，进度条与终端输出来自同一个 shell.updater 会话

fastboot flashing lock
```

**对照验看**：同样这几步，在工程模式菜单里点「解锁 Bootloader」——执行的是**同一条命令**（`js/boot/modes.js:219`），没有第二套逻辑。

---

## D. 它是个真的 shell（管道 / 重定向 / 作业控制）

```sh
cat /proc/mounts | grep -i ext4
history | tail -5
echo hello > /sdcard/a.txt && cat /sdcard/a.txt
seq 1 10 | tac
sleep 30 &
jobs                              # → 后台作业在跑
fg                                # → 拉回前台
alias ll='ls -l /sdcard'
ll
which ota
man ota
```

---

## E. 让它给自己升级（最不像网页玩具的一步）

```sh
ota check
# → 连接线上 ota/manifest.json，列出比当前版本新的包

ota list
ota update
# → 下载 OTA zip → 手写 ZIP 解析 → 整体替换 Service Worker 缓存 → 记录版本

cat /sdcard/Documents/bootloader-unlock-guide.txt
```

**这一段的看点**：升级不是"改个 JS 变量"，而是**真的把自己缓存里的整个系统换成新版本**，且可降级（`ota apply` 指定旧包）。

---

## F. 危险动作（可选，展示二次确认）

工程模式菜单 →「清除数据 / 恢复出厂」→ 二次确认后执行 `wipe data`：
真实清空 `OS.storage` 用户数据并重启，**Bootloader 锁定状态被特意保留**（模拟硬件级状态不受恢复出厂影响）。

---

## 已核实的输出对照表

| 命令 | 预期输出 | 依据 |
|---|---|---|
| `ls /system`（未挂载） | `ls: /system: /system is not mounted` | `js/core/shell.js:1023` |
| `mount system` | `system: mounted` | `js/core/shell.js:1100` |
| `ls /system`（已挂载） | `version  build.prop` | `VFS.tree['/system']` |
| `cat /proc/cmdline`（已解锁） | 含 `androidboot.verifiedbootstate=orange` | `VFS.files['/proc/cmdline']` |
| `cat /system/build.prop`（锁定） | 含 `ro.boot.flash.locked=1` | `VFS.files['/system/build.prop']` |
| `jobs` | 列出后台作业表 | `js/core/shell.js:1882` |
| `fastboot flash`（锁定态） | `FAILED (remote: Flashing is not allowed for locked devices)` | `js/core/shell.js:1262` |

> 注：`wipe cache` 在 Recovery 里才有可清除的占用（进入 Recovery 时注入 24 MB 缓存），在桌面执行会返回 `cache already empty`。

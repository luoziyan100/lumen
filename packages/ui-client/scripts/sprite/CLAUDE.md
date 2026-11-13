# sprite/ — 一体两形验收
> L2 | 父级: ../CLAUDE.md

- `sprite-fixture.ts`：显式临时根上的真实服务，仅替换 provider 网络；逐段推进文字与提问，按资源统计真正 GET SSE。
- `sprite-move-assert.mjs`：两档视口的全部拖放、开合、层级与减弱动效回归，横纵按60×92分别计算。
- `ui-assert-panels.mjs`：上一任务全部面板回归，形象尺寸改为60×92。
- `sprite-native.swift`：CGWindowList 量窗口，AX/合成事件驱动原生用户路径与 Dock 退出菜单；不需要屏幕录制，拖动需要辅助功能权限。
- `sprite-native-assert.mjs`：默认验证H1–H4：只创建主WebView、开关隐藏、关窗/最小化不浮出；恢复两端常量后可加--desktop-enabled跑原完整桌面路径。
- `trace/`：仅调试构建编译的原生取证模块，观察主窗原生投影与桌面真实 DOM 状态及跨窗口时延，不改变产品协议。
- `naming.mjs`：浏览器和原生共用的命名审计，检查变更源码、生产网页与原生可打印字符串。

运行于仓库根：先编译 Swift 驱动到 `/tmp/lumen-sprite-native`，启动 fixture 和5183，再依次执行原生与浏览器断言，避免受控模型流互相覆盖。输出目录从参数传入，证据不进入产品。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

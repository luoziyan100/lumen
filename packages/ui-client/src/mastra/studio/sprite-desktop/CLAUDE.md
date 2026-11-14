# sprite-desktop/ — 精灵桌面窗口与原生桥
> L2 | 父级: ../CLAUDE.md

当前桌面形态隐藏。恢复时将 preference.ts 的 DESKTOP_SPRITE_ENABLED 与 src-tauri/src/sprite.rs 的 DESKTOP_ENABLED 同时改为 true 并重建；设置开关、状态桥与入口才启用，运行时偏好不能越过功能常量。

- `App.tsx`: consumes native state/visibility and owns one shared A04 expression snapshot; its desktop-sized SpriteFigure selects the 452px derivatives for the 226 CSS-pixel image area at DPR2. Invisible windows schedule no expression timers. Native drag, 4px click threshold, menu and open actions stay native; no research connection is created.
- `bridge.ts`：主窗口将唯一会话订阅的状态发布到原生缓存；原生打开事件直接进入 Sprite 的开合交互，可见性仅返回给该精灵避免淡出重叠；本机开关在根入口应用，服务未连接也生效。
- `state.ts`：只接受四态字符串；App 注册实时事件后才取快照，有实时状态就忽略迟到快照。
- `preference.ts`：集中功能常量默认false；保留的外观开关在本机持久化，关闭时不渲染用户入口。
- `motion.ts`：桌面出入关键帧与时长；只改变 transform/opacity，减弱动效只淡入淡出。
- `desktop.css`：透明宿主、原生拖动命中区与桌面隐藏时的绘制暂停；形象样式随上级 SpriteFigure。

依赖方向：Sprite/useSession → bridge → 原生缓存 → App → ../SpriteFigure。窗口生命周期、位置与显示器夹取都归 Rust；此目录不拥有服务连接。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

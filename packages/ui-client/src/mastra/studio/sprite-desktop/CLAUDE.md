# sprite-desktop/ — 精灵桌面窗口与原生桥
> L2 | 父级: ../CLAUDE.md

- `App.tsx`：桌面窗口只消费原生投影与可见性；按下即交原生拖动，松手用实际位移区分4px内点击与拖动，点击和菜单交原生层，不连接研究服务。
- `bridge.ts`：主窗口将唯一会话订阅的状态发布到原生缓存；原生打开事件直接进入 Sprite 的开合交互，可见性仅返回给该精灵避免淡出重叠；本机开关在根入口应用，服务未连接也生效。
- `state.ts`：只接受四态字符串；App 注册实时事件后才取快照，有实时状态就忽略迟到快照。
- `preference.ts`：外观开关在本机持久化，设置页与主窗口共享订阅。
- `motion.ts`：桌面出入关键帧与时长；只改变 transform/opacity，减弱动效只淡入淡出。
- `desktop.css`：透明宿主、原生拖动命中区与桌面隐藏时的绘制暂停；形象样式随上级 SpriteFigure。

依赖方向：Sprite/useSession → bridge → 原生缓存 → App → ../SpriteFigure。窗口生命周期、位置与显示器夹取都归 Rust；此目录不拥有服务连接。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

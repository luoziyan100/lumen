# sprite-desktop/ — 精灵的共享显示层与桌面窗口入口
> L2 | 父级: ../CLAUDE.md

- `Visual.tsx`：SpriteFigure 只消费四态、尺寸和减弱动效；两种形态共享，窗口与交互不依赖内部绘制，替换 VRM 时只换这里。
- `App.tsx`：桌面窗口只消费原生投影与可见性；按下即交原生拖动，松手用实际位移区分4px内点击与拖动，点击和菜单交原生层，不连接研究服务。
- `bridge.ts`：主窗口将唯一会话订阅的状态发布到原生缓存；原生打开事件进入既有开合交互；本机开关在根入口应用，服务未连接也生效。
- `state.ts`：校验跨窗口负载及单调序号，丢弃旧快照，状态没有第二份业务推导。
- `preference.ts`：外观开关在本机持久化，设置页与主窗口共享订阅。
- `motion.ts`：桌面出入关键帧与时长；只改变 transform/opacity，减弱动效只淡入淡出。
- `figure.css`：全身形象、四态光晕与透明窗口；隐藏时暂停循环动画。

依赖方向：Sprite/useSession → bridge → 原生缓存 → App → SpriteFigure。窗口生命周期、位置与显示器夹取都归 Rust；此目录不拥有服务连接。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

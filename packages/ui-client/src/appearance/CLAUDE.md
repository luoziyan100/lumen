# appearance/ — 客户端外观偏好

> L2 | 父级: ../../CLAUDE.md

用户偏好先经纯函数归一和主题解析，再由单一 DOM 出口应用；服务配置与 Agent 生命周期不参与主题状态。

```text
index.ts → store.ts / systemMode.ts → resolve.ts → apply.ts
                                      ↓
                                registry.ts(← skins/) / types.ts
```

- `index.ts`：整合启动恢复和 React 订阅，给应用提供唯一外观入口；Mastra 工作台挂载 useAppearance，恢复系统主题变更订阅与设置即时应用。
- `types.ts`：偏好、明暗配色与玻璃/纸面材质合同；颜色、反光、模糊与阴影共用白名单，别名仍不可覆盖。
- `registry.ts`：十二套内置皮肤的汇总注册表与未知皮肤回退(回退到默认「清透」`yan-clear`)；旧默认青瓷保留 id `default`。
- `skins/`：皮肤配色真源。`define.ts` 放共用构造(`fromDesignSystem` 直接读 `yan-design-system/themes`，不在本地复制取值)，`light.ts` 四套浅色(清透、冰川、暖白纸面、海盐)，`dark.ts` 八套暗色。新增皮肤进对应文件，单文件逼近 800 行再按主题族拆。
- `store.ts`：读取、归一并持久化本地偏好(`lumen:appearance.v2`)，损坏值退回确定的默认状态；首次读取 v1 时，停留在旧默认青瓷的偏好迁到清透，其余选择保留。
- `systemMode.ts`：隔离系统明暗媒体查询与订阅，不直接更改 DOM。
- `resolve.ts`：mode/system 选择真实明暗基线，再按皮肤推荐模式选择主/另一模式补丁；纯函数输出配色、材质与背景效果。
- `apply.ts`：唯一外观写入端，清理旧 token，应用实际 color-scheme/data-material，并同步原生窗口明暗；不写模型或服务配置。

2026-09-19：补齐保留外观模块地图；Mastra 迁移继续复用同一客户端偏好入口。
2026-10-05：补齐真实浅色基线与三套明亮材质预设，深浅控件、玻璃反光、阴影和桌面边框贯通；外观仍通过本机偏好与单一出口切换。

2026-11-11：默认外观改为浅色「清透」(近白实色内容面、半透明侧栏/标题栏、单一蓝强调)，取值来自 yan-design-system。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

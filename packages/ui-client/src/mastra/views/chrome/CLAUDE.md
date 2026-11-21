# chrome/
> L2 | 父级: ../CLAUDE.md

- `Appearance.tsx`：皮肤点选同步推荐明暗并即时应用配色与玻璃/纸面材质，明暗可手动或跟随系统；选中标记复用 16px Phosphor 勾选；遮罩/背景模糊仍写入本机 appearance，不进入模型配置；桌面精灵功能常量默认关闭，开关代码保留但不渲染；恢复需与Rust常量同时开启。
- `Appearance.tsx` (desk objects): the Desk objects group picks the kit (Instruments default, Music) like the mode row; the Instrument sounds check is disabled and reads off unless Music is picked. Both write the local appearance preference and switch every visible object at once.
- `Appearance.tsx` (i18n): the first row is Language, a Kumo Select listing each locale by its native name; picking one calls `setLocale` and the window changes in place. Skin and font names come from the catalog (`skins.*`, `fonts.*`); the two font rows share one grid column so labels of any language line up.
- `useResizable.ts`：阅读器与右栏共用的宽度拖拽、复位与本机记忆；卸载释放指针期间的文档样式。


[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

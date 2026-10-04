# migration/
> L2 | 父级: ../CLAUDE.md

只在合成旧目录中验证，不读取正式用户根。fixture 以已核对的 v14 表结构构造主事件、JSONL 阅读投影与材料；导入器必须通过真实 SQLite/Memory 存储。

- `fixture.ts`：构造静止 WAL 数据库和旧工作区、设置、证据样本，不引用旧运行时。
- `import.test.ts`：验证原始封存、正文空白/字面标记和工具结果来源、材料复制、幂等、阻塞报告和源目录不变。
- `sources.test.ts`：显式旧源复制/只读重绑定、拒绝任意外部路径和目标碰撞；延迟 ask_user 的真实结果跨轮次正确配对，活动源不能伪装成一致快照。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

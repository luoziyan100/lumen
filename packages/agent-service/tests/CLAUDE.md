# tests/ — 防自欺纪律(宪法 §9 的落地)

> [PROTOCOL] 新增源码目录 ⇒ 镜像新增测试目录;新特性 ⇒ 先列与已有特性的交叉矩阵,再写用例,后写实现。

old_lumen 的教训:50 个绿测试没拦住致命 bug,因为全用替身绕过真实内核。这里的规则:

1. **禁全 mock 充数**:替身只允许出现在两条缝——ModelPort(录制-重放)与 HttpClient(罐装响应)。内核、runtime、存储、工作区一律走真实路径。
2. **不变式测试**(`invariants/`):铁律钉成断言——第 N 轮 tool_result 出现在第 N+1 轮 forModel() 里;压缩不丢存在事实;**同一组断言对 main 和 spawn 出的 worker 各跑一遍**。
3. **录制-重放**(`replay/`):fixture 为真实线格式,重放进默认内核路径跑端到端;详见 `replay/README.md`。
4. **协议契约**(`service/`):断开→重连→subscribe 回放,事件不丢不重;token 鉴权 4401。
5. **交叉矩阵**:spawn×resume、cancel/crash×resume、ask_user×cancel、长任务×上下文折叠……特性两两交叉显式钉测试。
6. **密闭性**:测试不许触达真实用户目录。生产代码里凡是默认指向 `~/` 的路径(skills 的 `userSkillsDir` 等)必须留注入缝,测试一律注入 `mkdtemp` 临时根——本机 `~/.lumen` 状态渗进断言 = 换台机器就红。
7. **辅助模型轮**:标题回填与对话共用同一 ModelPort,且**异步竞跑**——脚本化测试的下一条答复会被标题轮吃掉。凡给 runtime 喂 ScriptedModel,先套 `helpers.withIgnoredTitleChats`;识别标记 `TITLE_PROMPT_MARKER` 从 `src/runtime/task-title.ts` **同源导入,禁止复制字面量**(隐形合同必同源,宪章·可维护性宪章第 5 条)。日后新增共用 ModelPort 的旁路调用(摘要、修图等),落地时同规格配同源标记 + 测试挡板。
8. **资源必收口**:测试里 start 的服务/WS/DB,必须在 `after`/`finally` 里 await close。`protocol/server.ts` 的 `close()` 先 terminate 残留 WS 客户端再关 HTTP(2026-08-17 挂死修复);新起任何常驻资源,先写"怎么死"再写"怎么活"。挂死的套件 = 红的套件,禁用超时掩盖。

目录镜像 src:`adapters/ agents/ client/ invariants/ replay/ research/ runtime/ service/ skills/ storage/ subagent/ workspace/`;共享脚手架在 `helpers/`(scripted-model 仅限单元级,禁入端到端)。

跑法:`npm test` = `tsc --noEmit` 先行,再 `node --experimental-strip-types --test`。验收底线:每个里程碑至少一条真实/重放路径的端到端用例。

9. **类型闸门**:test 链含 tsc;为过闸放宽类型(`any` / 无根据的 `as`) = 打回。夹具缺字段就补字段;泛型该标就标。`dto-compat.ts` 只在 tsc 下生效,删它或让 Store 不再可赋给 Wire = 红。

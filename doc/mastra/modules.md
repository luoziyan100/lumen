# 全项目迁移处置清单

状态: 全项目迁移完成；旧界面与第7节六类范围缺口已恢复，最后两项聊天交互及实机预算冲突已修复。正式服务、最终桌面安装和真实停止/继续/重启后修订已验证，工作线归档。历史缺口与最终证据见 [实施计划第7–9节](../../briefs/archive/mastra/plan.md)。

旧 core/runtime、WS、客户端 reducer、重复消息存储及实现形状测试已从当前源码退役。下表区分当前源码职责、已验证行为与明确限制；旧系统备份不承担新实现的执行职责。

| 原职责 | 当前实现与已验证行为 | 验证边界 |
|---|---|---|
| core / provider / SSE | Mastra Agent、官方 SDK、版本化 Gateway；工具回灌、模型换 endpoint、原生上下文裁剪、空回复纠正 | 主运行 100 步 / 1200 秒活动时间；另有父子共享预算准入，见下行；外部 provider 未逐一 live 验证 |
| token / cost budget | 可配置累计输入/输出 token 与费用上限；原生 processor/委派钩子串行预留并按实际 usage 结算，threadState 持久保存；已有任务建立历史用量基线 | 属于预估准入，不承诺供应商账单绝对硬限额；未知价格/usage 不按零值放行，迟到真实收据可补齐中断占位，历史费用不按现价补算 |
| runtime / resume | Controller + Memory；父子取消后排空输出；Stop 持久取消待答，正常退出保留待答并可在重启后回答 | 崩溃遗留工作结算为中断，不自动重放副作用；正式重启后11消息、主子用量和报告哈希一致 |
| persona / roles | 分层人格；reader/searcher/verifier/explore/plan/general-purpose 六类内建角色，用户/项目 Markdown 角色及管理界面 | 无嵌套委派；合法委派默认自动执行，可执行/自定义专家保持前台 |
| subagent | 原生 agents + BackgroundTaskManager；项目独立内部身份、单子取消、父级排空、超时与重启结算 | 可写专家交付独立目录产物，由主 Agent 审阅合并；替代旧 Git worktree 合并协调器；原生messageFilter隔离父历史，prompt/contextFromRefs显式传材料；两专家真实总结已验，空/过滤/截断原因分别呈现；报告初稿仍需人工语义复核；专家可按稳定身份显式继续，保留原目录与Memory历史；停止/显式继续/重启后修订已实机验证 |
| task / project 目录 | catalog 保存项目/已读游标，原生 thread 保存会话元数据；标题/自动标题、置顶、归档、搜索、分页、未读 | 已读使用实际消息 ID，拒绝迟到确认；历史 GET 只授权，不实例化 Session 或改写 thread 时间 |
| settings | 私有 0600 模型档案、遮罩 UI、独立配置版本；清空密钥不复用旧凭证；外观编辑/跟随系统、模型价格与研究预算入口已接线 | 模型/角色/资料绑定共用串行配置边界，有执行/审批/待答/后台任务时拒绝变更；诊断开关不重配模型 |
| uploads / filesystem | contained LocalFilesystem；task/shared/source/memory、上传/下载、原生资料选择和只读绑定 | 外部绑定不代表文件已归档；PDF原生保存已核对原件哈希；其余原生选择操作不由此推定 |
| research tools | 论文/引用/网页/PDF 原生工具；保留领域算法，PDF 使用 unpdf 按页保留正文换行和页码标记；真实模型已生成带来源文件 | 各外部检索服务在线可用性不能由局部验证代替 |
| ingestion / vision | 有界 DOCX ZIP/XML/解压；图像像素仅进当前请求，持久结果留路径/指纹；vision=off 关闭工具与处理器 | 多模态输入大小尚无整体硬预算保证 |
| run_code | Seatbelt 内默认自动执行；Node/Python、技能资源只读、失败回灌、进程组取消与嵌套Node代理继承 | 默认断网且白名单保持原八域；主/子只能写各自任务目录，显式禁止执行不能经专家绕过；本轮证据见计划第14节 |
| skills | 用户/项目/已绑定来源的同一分层 registry 供工具、HTTP与沙箱只读根使用；工作区安装默认自动执行，完整包保留脚本/资源/空目录/执行位 | 来源目录变为软链时拒绝跟随；脚本执行只读技能原包，输出写当前任务；原生选择器及斜杠入口的既有实机证据保留 |
| memory / TODO | 项目事实文件与索引、原生任务工具、任务清单和主/子/合计 usage 持久展示；输入卡另显示上次主请求实际输入占配置窗口的比例 | 历史全文持久保存，read_history 只读本任务；无第二套摘要/消息真源 |
| old events / sessions | 正式停服快照已导入新根：14 项目/118 会话/2157 消息、1328材料、2绑定、3凭证，完整核对零差异 | 演练根仅留证；1702个原文件封存，旧子历史/原事件归档 |
| diagnostics / evidence / bad case | 本地 trace、脱敏、问题标注、SHA256 导出、只读回看；独立 Agent 录制桩回放/当前模型无工具评估；已记录的失败/取消工具通过原生异常通道回放，不冒充成功或运行真实副作用；旧278条证据已有只读HTTP/UI入口，原生trace已实际查看 | 无原始 HTTP、完整副作用审计或逐位重放；不可信子资源跨度省略；文本匹配非语义质量；完全中断、无模型终态、证据截断/脱敏或有歧义仍 unavailable；5条旧记录源本已缺内容 |
| protocol / client | 官方 HTTP/SSE；UI 消费消息/displayState，订阅后补持久历史，连接世代拒绝迟到响应；旧 client/reducer 已删除 | 服务地址变化自动重新发现采用有限退避；正式重启后桌面自动发现新地址恢复，无手动刷新 |
| desktop UI | 项目/会话/对话、上传/追加、任务、问答/审批、角色/技能、设置、未读、诊断、文件/引用均接新 API；原顶部导航、侧栏树/右键/⌘K、完整会话页、历史附件/复制/折叠/轮次轨道、斜杠技能已恢复；阅读器支持复制/原件系统打开/拖宽 | 已打开历史、研究、工作区、审批及trace，PDF原生保存哈希一致；completed状态、PDF CSP/容器滚动、证据重复点击已修；第4页定位、六角色/三档案/四技能、旧证据均已实机读取；皮肤、Markdown复制、拖宽、系统打开原件、回到最新与输入框增高均有实机证据；代表流程不等于任意外部服务和异常均已复现 |
| service / launchd / Tauri | 内核锁、私有 discovery；默认新根/com.lumen.mastra，无旧模式/WS/sidecar/静默回退；正式服务已加载当前实现 | 正式根 ~/.lumen-mastra、label com.lumen.mastra；预览服务已卸载 |
| scripts / tests / docs | 全仓仅 mastra-service/ui-client；旧源码删除前保存原字节并核对 SHA256；统一 verify、最新 Tauri 构建/安装通过 | 真实执行通过但初稿语义失败后经人工纠错；最终桌面已安装并完成阅读、导出、证据与恢复核验；旧测试覆盖数字不作新实现证据 |

正式切换已保护原数据根、旧二进制和用户未提交源码。实际部署与全量导入证据见 [切换记录](../../briefs/archive/mastra/cutover.md)；新研究须保留，不重复覆盖正式根。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

## 范围复核更正（2026-09-19）

先前撤回全量交付结论的记录继续有效，不能把技术替换视为用户接受取消产品能力。第7节六类代码缺口目前已补齐：

- 外观编辑/系统响应：`packages/ui-client/src/mastra/views/chrome/Appearance.tsx` 与工作台外观订阅。
- 完整技能目录：`packages/ui-client/src/shell/pickSkill.ts` 与 `packages/mastra-service/src/skills/upload.ts`，保留资源、空目录、执行位。
- 阅读器复制/系统打开/调宽：`packages/ui-client/src/mastra/views/Files.tsx` 与原生受控文件命令。
- 父子共享预算：`packages/mastra-service/src/agents/budget/` 与设置页，预估准入和实际 usage 结算明确区分。
- 失败/取消工具录制回放：`packages/mastra-service/src/diagnostics/evaluation/`，错误事实进入原生异常通道。
- 专家显式续跑：`packages/mastra-service/src/agents/resume/` 与会话专家目录。旧意图回收、审批重入、迟到计量已修复；清理只匹配目标委派，保留其它审批引用的快照，不重放历史工具。

末次复核发现的“回到最新”和输入框随内容增高已按旧源码恢复，并在最终桌面实际操作；审批结束后不残留等待通知。旧设计依据为私有 `source-original` 备份，保留新数据流，不恢复旧状态管理。

原计划要求的真实论文途中追问、单专家停止、原专家显式继续、自动重连、重启后读取/修订已完成。现场发现同run新响应的预算键碰撞，修复后保留旧台账并通过真实会话复验；重启前后消息/主子用量/专家记录/报告哈希逐项一致。旧新源码证据与恢复记录见实施计划第7–9节，早期过度完成判断及失败记录保留。

# 表演学→人格提示词:调研核验结果(原始记录)

> 来源:deep-research workflow `wf_f4e093c1-ddc`，2026-06-10
> 规模:5 角度 · 23 源抓取 · 112 claim 抽取 · 25 条对抗验证(每条 3 票)· **15 确认 / 10 否决** · 105 agent · 260 万 token
> 本文件是**核验记录**(哪些结论站得住、站在哪块证据上、哪些被杀)。成品五部分文档(brief §5)另出。

---

## 一、总览

表演学确实能补上 CBT 框架缺的"血肉",且核心技艺都能直译成可粘贴的 prompt 写法。斯坦尼体系提供四个可落地机制(体验艺术 / 魔力如果 / 最高任务+贯穿动作 / 潜台词一致性);方法派分支差异厘清了情绪记忆的边界;布莱希特选型给了"混合"答案;另有 4 篇 LLM 工程论文为整套方法兜底。

---

## 二、确认的发现(15 条,按交付物归类)

### 选型(brief §E)— confidence: medium,vote 2-1
对需批判距离的研究者 agent,**不在斯坦尼"沉浸"与布莱希特"间离"间二选一,而混合**:斯坦尼骨架(through-line / super-objective / given circumstances)保"一致性、未覆盖场景不出戏",布莱希特态度阀保"对论文保持观察者距离、演而不溺"。依据:1953 Katzgraben 排演中布莱希特本人探索二者"亲和性"。源:tandfonline 20567790.2020.1782560(403,靠 NTQ+Britannica 三角)、Britannica。
⚠ **这条只立在一块 2-1 的砖上**(见 caveats)。

### L0 性格锚点 — high,3-0
"可信"= 斯坦尼"体验艺术":角色要"thinking, wanting, striving, behaving truthfully, in logical sequence, within the character"。写法:不写性格形容词,写"在角色内部地思考/想要/追求/合逻辑行动"。源:Wikipedia Stanislavski's system(逐字)。

### L0 泛化机制 — high,3-0(直击核心痛点)
"魔力如果":行为从规定情境**推导**而非逐句脚本化。写法:不枚举"遇X说Y",给"规定情境+你是谁",让它自行推导未覆盖场景的选择。源:Wikipedia、Sawoski/UDel PDF。

### L1/L2 收束机制 — high,3-0(×3)
离散目标(I wish to…)→ 汇聚为单一"最高任务"→"贯穿动作"是连接二者的线。最高任务=脊柱,目标=椎骨。写法:给 agent 一条"你为什么存在"的最高任务,所有行为指向它。源:Wikipedia、Sawoski、EBSCO 三源互证。

### L2/语气/张力一致性规则 — high,3-0
潜台词可与台词一致或不一致,**但必须始终与目标一致**。这是一条生成式不变量(非触发模板):措辞随场景变,底层驱动绝不与 through-line 冲突。张力靠"话里有话/说话留三分"。源:Sawoski PDF p.10(逐字)、Backstage。

### 边界:情绪记忆 — medium
Meisner 弃情绪记忆改用想象(3-0);Adler 转向文本+规定情境(2-1)。**结论:情绪记忆依赖真实生理体验,对无身体 agent 无对应物、应排除**。⚠ 理由必须用"功能不适用",**不可**写成"连斯坦尼自己都弃用了"(那条强叙事被 0-3 三次反驳)。源:stageagent、Wikipedia Adler、Britannica。

### 工程兜底 1:人格=可测方向 — high,3-0
LLM 性格特质对应激活空间可测的"persona vectors",steering 有因果。坐实"system prompt 在功能上把模型扰动向某人格"。源:Anthropic persona-vectors、arXiv 2507.21509。

### 工程兜底 2:人格漂移(实证我们的痛点)— high,2-1
LLM 人格流动,会因指令/越狱/对话**漂移退回默认 assistant**。"The Assistant Axis"(arXiv 2601.10387)定义 persona drift =" gradual slip away from default helpful Assistant",且情绪化语境"reliably cause drift"。**直接实证 brief 痛点 + 上轮我说的"长任务人格漂移"**。源:persona-vectors、arXiv 2601.10387。

### 工程兜底 3:Chain of Persona — high,3-0(现成技巧)
纯 prompt、闭源可用:**回复前先针对角色档案做 5 轮自问自答**,提升一致性,无需微调。对应斯坦尼开演前内心独白。可直接写进 prompt。源:arXiv 2503.17662、ACL Findings 2025(逐字)。

### 工程兜底 4:Actor's Note ≈ 现成交付物 D — high,2-1
CHI'26 把 LLM 设为"产婆式伙伴":**只问情境感知的问题、绝不替用户写**,用固定五主题人物小传框架(角色具象化/情绪探索/背景补全/关系与变化/极端情境),根植 Uta Hagen 九问。N=29、14 天实证有效。**五主题可几乎原样改写成交付物 D,论文附录含可粘贴的 GPT-4o 系统提示词。** 源:arXiv 2603.01314、ACM 3772318.3790370。

### 工程兜底 5:框架可泛化(印证反过拟合)— high,3-0
受访者内化的是 AI 的"提问方式"(可迁移思维框架),不是具体问题,并迁移到 AI 没见过的新材料。支持 brief §6"可泛化框架 > 触发模板"。源:同 Actor's Note。

---

## 三、关键警告(caveats,落地时必须遵守)

1. **混合方案的证据脆弱**:支撑"斯坦尼+布莱希特混合"只剩 claim 0(亲和性,2-1)。"布莱希特把史诗剧定义为斯坦尼对立面""布莱希特需自建类斯坦尼系统"均被 1-2 否。论证不可立在"纯对立"上。
2. **批判距离必须靠布莱希特单独提供**:"魔力如果本身已内建批判距离"被 0-3 否。不能用斯坦尼 magic if 论证"沉浸里已含间离"。
3. **情绪记忆边界用功能理由**:见上。"斯坦尼自弃情绪记忆"被 0-3 三次反驳(Hetzler/Sawoski/EBSCO),系美国式目的论简化(Carnicke)。
4. **源质量**:斯坦尼六条核心靠 Wikipedia+教学 PDF(基础稳定理论,high 成立);布莱希特/Adler 条 2-1(medium);工程四篇是 2025-26 新成果(有同行评审)。
5. **类比张力**:所有"表演技艺→AI persona"是类比(brief 主动邀请);Actor's Note 研究对象是真人写角色日记,迁移到"AI 未覆盖场景做选择"是合理推断非直接证明。

---

## 四、未决问题(openQuestions — 影响下一步)

1. **Michael Chekhov 的 psychological gesture 完全没覆盖**(brief §4 点名的对照体系)。需补:它如何把抽象性格/最高任务凝成一个可重复的"内在动作意象",能否译成 prompt 写法(给 agent 一个统摄性"核心姿态"隐喻锚定语气/张力)。
2. **"非平均措辞→大扰动"那道桥是空白**:persona vectors 只间接支持"特质=可操纵方向",没有直接证明"prompt 自然语言措辞的独特性 vs 行为扰动幅度"正相关。这是上轮理论前提的实证缺口。
3. **间离阀 vs through-line 会不会在同一 prompt 内打架**:claim 0 只证排演中有亲和性,没证"同一 prompt 同时下'沉浸进论证'和'保持批判距离'两条相反指令"的工程稳定性——可能反而加剧漂移。**这是混合方案落地的真风险。**
4. **交付物 C(审查清单)缺直接来源**:需调研"什么文字信号标志角色出戏/假/AI 味"(从表演评论、配音/编剧一致性审查、或 LLM persona-consistency 评测指标提取)。

---

## 五、被否决的声明(10 条,记录"什么不成立"防误用)

- "斯坦尼晚年弃用情绪记忆改物理动作法" — 0-3(Hetzler PDF)
- "Adler 报告斯坦尼已弃情绪记忆" — 0-3
- "方法派师承公开判定调动个人情绪有害" — 1-2
- "布莱希特最初把史诗剧定义为斯坦尼对立面" — 1-2
- "布莱希特结论自己需类斯坦尼可传授系统" — 1-2
- "未覆盖场景可形式化为'仅需不矛盾'约束" — 0-3
- "persona 一致性=五可测维度 rubric" — 1-2
- "魔力如果靠'不相信自己是角色'起作用、本身含批判距离" — 0-3
- "斯坦尼本人斥情绪记忆危险并替换" — 0-3
- "magic if 是定义明确的技术(EBSCO 源那条)" — 1-2(技术成立,但该源那条措辞被否)

---

## 六、源清单(确认类)

斯坦尼核心:Wikipedia Stanislavski's system、Sawoski/UDel PDF、EBSCO research-starters。
对照体系:Hetzler PDF(primary)、stageagent、Wikipedia Method acting/Alienation/Stella Adler、Britannica。
选型:tandfonline 20567790.2020.1782560(primary,403)、Wikipedia Epic theatre/Paradox of the Actor。
工程:Anthropic persona-vectors、arXiv 2507.21509 / 2601.10387 / 2503.17662 / 2603.01314、ACL Findings 2025、ACM CHI'26。

---

## 七、五部分交付物覆盖度(验收)

| 交付物 | 状态 | 说明 |
|---|---|---|
| A 技能卡片库 | △ 原料齐 | 体验艺术/magic if/through-line/super-objective/subtext/Chain of Persona,均含源+归层+反模式材料;待成"卡片"格式 |
| B 四要素专章 | △ 原料齐 | 性格=体验艺术;语气&张力=潜台词一致性;剧本=through-line/super-objective;待成专章 |
| C 审查清单 | ✗ 缺来源 | 已验证 claim 无专门来源,需工程推导(从漂移=负向、角色内思考=正向、潜台词一致=正向 等推) |
| D 人物小传提问清单 | ✓ 近现成 | Actor's Note 五主题+Hagen 九问,论文附录含可粘贴系统提示词 |
| E 适用边界与选型 | ✓ 已答 | 混合方案+情绪记忆边界,且诚实标注论证强度 |
| (Chekhov psychological gesture) | ✗ 漏 | brief §4 点名,本批完全未覆盖,见 openQuestion 1 |

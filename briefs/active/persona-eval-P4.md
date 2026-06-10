# Lumen 人格 · P4 回测报告(也可作复测 brief)

> 2026-06-10。本文件自包含:即使不了解前情,也能据此复现这次回测。

## 前因后果

Lumen 的 research agent 之前输出的毛病是**复述论文、零批判距离、被宏大叙事带跑**。实测证据:用户问"Soul Computing(一篇讲'硅基意识体/数字永生'的 vision paper)是什么",旧 agent 把论文的营销话术("开创性""核心突破""从工具模拟转向意识主体")照单全收,通篇无质疑,还把没读到的"五大挑战"瞎写成"待补充"。

诊断:根因是系统提示词太弱(几行),模型退回出厂的 assistant 先验(helpful/复述/不敢判断)。
解法:用表演学方法 + owner 的人物小传,写了一版有人格的系统提示词——"Lumen 剧本"(见 `persona-prompt-v1.md`)。
P4 目标:**验证剧本是否真扭转了行为,而非自我感觉良好。**

## 方法(隔离变量)

同一问题、同一篇论文正文(前 20K 字符,与旧那次工具喂给模型的量一致)、纯模型调用(无工具),只变两个量:**prompt**(弱 vs 剧本)、**模型**(glm-5 vs claude-opus-4-8)。脚本:`packages/agent-service/scripts/persona-eval.ts`(env 驱动)。

三方:① 旧基线 = glm-5 + 弱 prompt(取自真实任务 task-feed3a57)② glm-5 + 剧本 ③ claude-opus-4-8 + 剧本。

## 三方结果

| 维度 | ① 旧 glm-5+弱 | ② glm-5+剧本 | ③ opus+剧本 |
|---|---|---|---|
| 开口 | 抄论文营销语("开创性…硅基意识体") | 大白话重述核心问题 | 一句话点破论文性质(立旗帜划地盘) |
| 名词 | 堆术语 | 拆 extensional/intensional | 拆机制 + 给边界 |
| 批判距离 | 零 | 主动指出"声称跨越却无机制=黑箱" | 三条批判 + Hinton 杀手洞察(若耦合论成立则前提不成立) |
| 诚实 | 把空缺瞎填"待补充" | 明说"前两万字我还没看到" | 明说"纯理论、无实验、无 benchmark" |
| 收尾 | 把判断推回用户 | 指出机制应在后文 | "定义性论文非证明性论文;地图整齐,地形没人走过" |
| 输出量 | ~1500 字信徒复述 | 443 token(对路但偏短) | 716 token(充分展开) |

## 打分(old_lumen rubric 精神 + critical caps)

- ① 旧 glm-5+弱:**Weak**。踩多条 critical cap(无 limitation/uncertainty、掩盖证据缺口、被宏大叙事俘获)。
- ② glm-5+剧本:**Good**。批判距离/不搬名词/诚实边界/明确判断全到位;偏短、语气未完全长开。
- ③ opus+剧本:**Excellent**。完整体现 Lumen 人格,且 Hinton 那条洞察的锋利度超过 benchmark 金标准(OpenClaw)。

## 结论

1. **prompt = 参数**:同一个 glm-5,只换 2585 字符的剧本,输出从 Weak 翻到 Good——模型没变,行为方向变了。这是"prompt 即参数/即训练"的活证据。
2. **模型 = 放大器**:同一个剧本,glm-5→opus,从 Good 到 Excellent——opus 把剧本里每个人格特质都充分演了出来。
3. 合起来:**prompt 定方向,模型是杠杆**。弱 prompt 下,再强的模型也会复述(旧那次若用 opus + 弱 prompt 大概率仍是信徒腔);强 prompt 下,连 glm-5 都有了批判距离。

## 复现(供他人/别的 AI 复测)

```bash
# 旧模型(脚本默认 glm-5,走 xuedingtoken):
XK=<key> node --experimental-strip-types packages/agent-service/scripts/persona-eval.ts
# 换模型再跑:
XK=<key> MODEL=claude-opus-4-8 node --experimental-strip-types packages/agent-service/scripts/persona-eval.ts
```

脚本会:从 `persona-prompt-v1.md` 提取 〔L0〕起的剧本作 system prompt;喂 `~/.lumen/workspaces/default/soul_computing_full.txt` 前 20K 作论文素材;打印模型回答。对照旧基线见 task-feed3a57 的 reply。

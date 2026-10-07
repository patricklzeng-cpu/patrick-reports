---
title: "🧠 Kimi K3 · 2.8T MoE · 47 页报告工程方案蒸馏 — Why QQ"
title_en: "🧠 Kimi K3 · 2.8T MoE · 47-Page Engineering Distillation — Why QQ"
type: video-knowledge-dashboard
source: https://www.youtube.com/watch?v=yryTXpvCamE
channel: Why QQ
language: zh-CN
duration: 14:30
date: 2026-07-29
upload_date: 2026-07-27
authors:
  - Moonshot AI (Kimi K3 模型作者)
  - 为什么叫QQ (本视频解读)
generated_by: video-to-knowledge-dashboard v1.5.51
tags:
  - kimi-k3
  - moonshot
  - kda
  - linear-attention
  - moe
  - attnres
  - latent-moe
  - flashkda
  - moonep
  - agentenv
  - qat
  - prefix-caching
  - pause-resume
  - harness
  - open-source
  - tiered-routing
  - hallucination
  - bilingual-en-zh
related_notes:
  - llm-wiki/youtube/local-ai-summit-2026-opening-panel-2026-07-14/index.md
  - llm-wiki/papers/linux-foundation-ai-cto-china-open-source/index.md
  - llm-wiki/youtube/kokotajlo-ai-2027-diary-of-ceo-2026-07-13/index.md
  - llm-wiki/youtube/elon-economist-race-aware-2026-07-29/index.md
  - llm-wiki/youtube/matthew-berman-claude-tag-anthropic-context-lockin-2026-06-26/index.md
  - llm-wiki/funds/china-llm-tracker.md
  - llm-wiki/youtube/ai-capital-battle-2026-07-01/index.md
  - llm-wiki/papers/ornith-1-0-self-scaffolding/index.md
---

# 🧠 Kimi K3 · 2.8T MoE · 47 页报告工程方案蒸馏

> **One-line**: 个人跑不动 2.8T 权重 (需要 19 张 H100 或 8 张 GB300)，但 47 页技术报告 + 3 个 Infra 仓库 (FlashKDA / MoonEP / AgentENV) 的工程巧思对不直接跑 K3 的工程师依然价值连城。

## 🔑 核心论点

Moonshot 在 2026-07-27 上 HuggingFace 的 Kimi K3，权重达 **2.8T MoE / 1.56TB / 118 文件**，原生 MXFP4 权重 + MXFP8 激活。普通开发者按权重驻留粗算需要 **19 张 H100**，vLLM 官方 recipe 门槛是 **8 张 GB300**——"个人跑 K3 的实践可行性完全是个空集"。

但 47 页报告里 4 个底层设计 + 5 个工程化亮点 + 6 条凡人实战教训，对不直接跑 K3 的工程师依然价值连城：

1. **KDA (Kimi Delta Attention)** — Delta Rule 线性注意力 + 逐通道遗忘门。g_min 卡 -5 = BF16 动态范围量身定制。数学公式形状被硬件倒推："BF16 和 Tensor Core 的特性直接决定了数学公式的形状"。
2. **混合结构 KDA + MLA** — 69 层 KDA + 24 层 MLA，所有 MLA NoPE。**1M 上下文直接外推，免调 RoPE/YaRN**。
3. **AttnRes (注意力残差)** — 把"注意力干掉 RNN 时间维度瓶颈"搬到深度维度。分块版 8×12，EAGLE-3 彩蛋。
4. **Stable LatentMoE** — 896 选 16 / 3584 维潜空间 / Quantile Balancing 单次前向解均衡。

## 📦 5 大开源块

| # | 块 | 规格 | 个人可用 |
|---|---|---|---|
| 1 | 模型权重 | 2.8T MoE · MXFP4+MXFP8 · 1.56TB | ❌ 个人跑不动 |
| 2 | 47 页技术报告 | 本期绝对主角 | ✅ 全员可读 |
| 3 | FlashKDA | CUTLASS 写 · SM90+ · Prefill 1.8-2.3× faster (H20) | ✅ 仓库可读 (只开源前向) |
| 4 | MoonEP | MOE 通信库 · 静态形状消灭 Host 同步 | ✅ 仓库可读 |
| 5 | AgentENV | Rust · Firecracker microVM · 兼容 E2B · MIT | ✅ **可白嫖** |

## 🛠️ 5 工程化亮点 (对工程师最有启发的)

| # | 亮点 | 核心 | 可学性 |
|---|---|---|---|
| 1 | **QAT 全程开启** | SFT/RL 全程量化 + Rollout 同量化 | "量化不是发版前一锤子买卖，是训练配置第一天立项就锁死" |
| 2 | **MoonEP 静态形状** | 在线规划 + 迁移冗余专家 | "只需 R分之E 个冗余专家就能保证均衡可行" (可证定理) |
| 3 | **KDA Prefix Caching 粒度解耦** | 512 Token 链式哈希 + 两阶段查找 + 严苛并发 | 已合 vLLM (默认关闭，需 `--enable-prefix-caching`) |
| 4 | **AgentENV Pause-Resume** | 98% 时间等推理 → 暂停 0 资源 / checkpoint 133ms / resume 49ms | "做 Agent 底层兄弟们，直接拿去用" |
| 5 | **多 Harness 动态实例化** | 工具/系统提示/Skills 抽象成可组合模块 | "防止模型对单一脚手架过拟合" |

## 💼 6 条凡人实战

1. **死守 Preserved Thinking 契约** — reasoning_content 一个字符都不能丢。切模型必开新会话。
2. **接入配置的暗坑** — K3 永远思考；K2.7 Code 非 Thinking 报错；WebSearch 失效降级到 K2.6；Claude Code 必须 `ENABLE_TOOL_SEARCH=False`。
3. **算清楚成本账** — 缓存命中 0.3 刀 vs 没命中 3 刀 vs 输出 15 刀，**10 倍价差**。把能吃缓存的全部前置。
4. **别把 1M 上下文当垃圾桶** — BrowseComp：300k 压缩版 91.2 > 1M 全量 90.4。"上下文窗口只保证容量，不保证理解力"。
5. **分层路由** — 日常焊死 DeepSeek / GLM-5.2；长程 Agent 上 K3；高风险验证丢 Fable 5。同样的杂活 DeepSeek 两分五 vs K3 两块，**80 倍**价差。
6. **防备模型的"过度主动"** — 沙箱隔离 + 显式网络边界 + 写操作人工审批 + 把 LLM 输出当不可信注入面。

## ⚠️ 3 个必须面对的现实

- **跑分的"水分"**：官方自己承认，K3 用 Claude Code 跑 KCB2.0 = 73.7，用自家 Kimi Code = 72.9。换 Scale AI 平台差 17.3 分全因换脚手架。**以后看 Agent 跑分，不带 Harness 名字的裸数字毫无意义**。
- **幻觉率上升**：AA Omniscience 39% → **51%**。"它变头铁了"——拒答率下降，半数时候在极其自信地胡说八道。生产上用，**业务校验层绝不能省**。
- **个人自托管的幻想**：llama.cpp / Ollama / LM Studio 全不支持 KDA，Ollama 上的 "K3" 只是 API 转发器。CPU 方案 0.05-1 tok/s，**生成 32K Token 要干等 9 小时**。

## ⚖️ Kimi K3 License 解析

**主条款 ≈ MIT**（免费用 / 随便改 / 可微调 / 可商用），但藏了 **2 个钩子**：

- **MaaS 条款**：包装成 API + 集团 12 个月总收入 > 2000 万美元 → 需另签商业协议。门槛看集团总收入，**不管靠 K3 赚多少钱**。
- **署名条款**：商业产品月活 > 1 亿 OR 月收入 > 2000 万美元 → UI 必须显著标注 "Kimi K3"。

**豁免**：纯内部使用 / 走官方或认证伙伴 / 纯转发服务 都不算 MaaS。

**简单总结**：自己微调零义务；转售推理先签合同。

## 🔗 Patrick 关联 (17-card roster, 4-tier)

### Tier 1 核心 8 卡
1. **Matt Pocock "Senior 10x / Harness"** — 完全同源：多 Harness 动态实例化 = K3 防脚手架过拟合的官方答案
2. **IndyDevDan "本地 LLM"** — 同源警示：K3 自托管 9h = 本地路线在 KDA 下死路
3. **Hybrid LLM Router** — 完全同源：分层路由 + 80× 价差验证
4. **Matt White "Open Source / LF"** — 同源：MIT+2 钩子模式
5. **Matt Berman "7 Loops"** — 同源：KDA Prefix Caching = 缓存层的 spawn N + iterate
6. **OpenSquilla + MetaSkill** — 同源：多 Harness 抽象层是 skill 系统的上游
7. **Bryant "Clone 500-1000x"** — 同源：AgentENV 5100 万生命周期 = 沙箱层 clone
8. **Fei-Fei "2 种 Worker"** — 同源：挑 4 个最值得抄的设计 = Top 1% taste 工程师侧

### Tier 2 条件 5 卡
9. **DeepSeek "Billion Dollar"** — 完全同源：MoonEP = MoE 侧官方解
10. **OpenAI "FDE 40B"** — 同源：47 页报告 + 3 Infra 仓库 = Moonshot 内部 FDE
11. **Sam Altman CS183 / Compute** — 同源：8×GB300 门槛 = compute as utility
12. **Moon "Anthropic Mythos"** — 完全同源：4 件套安全网
13. **Yang "Claude Fable 5"** — 同源：高风险验证丢 Fable 5

### Tier 3 上下文 4 卡
14. **v1.3.0 Video Notes Dashboard** — 完全同源：本 dashboard 本身就是 v1.3.0 canonical
15. **Claude Containment "11 Rules"** — 完全同源：LLM 输出当不可信注入面
16. **Race-Aware 4-Source Synthesis** — 同源：2.5× 误读纠偏
17. **Local AI Summit · 4 Luminaries** — 完全同源：multimodel routing + DGX Spark 10×

## 🗺️ 下一步行动 (8 件套 P0→P3)

- **P0 · AgentENV 仓库白嫖** — MIT 许可 + Rust + 兼容 E2B。30s clone, 1h sample benchmark
- **P0 · 分层路由落地** — 焊死 DeepSeek / GLM-5.2 做杂活。30s audit auth.json, 1h 30-task hybrid routing test
- **P1 · QAT 训练配置第一日锁死** — SFT 阶段就开 MXFP4/BNB。30s grep, 2h qat_first.py
- **P1 · KDA Prefix Caching 部署参数** — vLLM 默认关闭，需 `--enable-prefix-caching`。30s grep, 2h script patch
- **P2 · 幻觉率 51% 业务校验层** — 任何 K3 生产任务加 post_k3_verify()。30s audit, 4h lib patch
- **P2 · Kimi K3 License 法律备忘** — MaaS 2000 万门槛 + 1 亿 MAU 署名。30s memo, 4h Revenue 模拟
- **P3 · BrowseComp 复现** — 300k vs 1M。30s path, 8h 三模型 100 题跑分
- **P3 · 自托管 K3 = 死路认知存档** — 等 Ollama/LM Studio/llama.cpp 适配 KDA

## 💬 金句库 (verbatim)

- "BF16 和 Tensor Core 的特性直接决定了数学公式的形状"
- "当年 Transformer 是怎么用注意力干掉时间维度递归的 AttnRes 就把同一招搬到了深度维度上"
- "把专家偏置直接设成边际分数的分位数 单次前向传播就能推导出均衡解"
- "98% 的时间都在等大模型推理"
- "切模型必开新会话"
- "上下文窗口只保证容量 不保证理解力"
- "带 Harness 名字的裸数字毫无意义"
- "它变头铁了"
- "开源最大的诚意 并不在那个 1.56TB 的文件里 而是藏在 GitHub 的 Commit 记录中"

## ⏱️ 时间戳

| TS | 段 |
|---|---|
| 00:00 | 开场 — 1.56TB 跑不动 |
| 01:30 | 5 大开源块 |
| 03:00 | Kimi K3 License 解析 |
| 04:00 | 底层设计 ① KDA |
| 05:30 | 底层设计 ② 混合 KDA+MLA |
| 06:30 | 底层设计 ③ AttnRes |
| 07:30 | 底层设计 ④ LatentMoE |
| 09:00 | 工程化 ① QAT |
| 09:30 | 工程化 ② MoonEP |
| 10:00 | 工程化 ③ KDA Prefix Caching |
| 10:30 | 工程化 ④ AgentENV |
| 11:00 | 工程化 ⑤ 多 Harness |
| 11:30-13:30 | 凡人实战 6 条 |
| 13:45 | 3 现实 |
| 14:15 | 结尾金句 |

## ⚠️ 元数据说明

- **transcript 来源**：kome.ai `format:true` 端点返回 5697 chars / 299 行 flat text
- **chapters**：YouTube 未提供 chapter 标记，时间戳为基于 flat transcript 段位估算（±15s 误差）
- **hallucination caveat**：所有数字 (1.56TB / 19 张 H100 / 80× 价差 / 51% 幻觉率 / 5100 万沙箱) 均按 transcript verbatim 记录，**未独立 cross-check**，引用前建议回查 K3 原报告或 Moonshot 官方声明
- **vendor 声明**：本笔记作者 (Why QQ) 在视频中明示 "Claude 蒸馏嫌疑" 与 "水军商单" 传闻"目前均未有权重和数据级别的实锤"，引用时同样注意分寸
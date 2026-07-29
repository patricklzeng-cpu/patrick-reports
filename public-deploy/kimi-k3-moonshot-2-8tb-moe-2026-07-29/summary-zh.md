# 🧠 Kimi K3 中文摘要 · 工程方案蒸馏版

> **15 秒结论**：Moonshot 在 2026-07-27 开源的 2.8T MoE Kimi K3，个人跑不动 (19 张 H100 / 8 张 GB300)，但 47 页报告 + 3 个 Infra 仓库的工程巧思人人能学。

## 📦 5 大开源块速览

| 块 | 个人可用性 | 工程师侧核心 |
|---|---|---|
| 2.8T 权重 / 1.56TB / 118 文件 | ❌ | — |
| 47 页技术报告 | ✅ | 4 大设计 + 5 工程亮点 + 6 实战 |
| FlashKDA (CUTLASS 写) | ✅ | Prefill 1.8-2.3× faster (H20) |
| MoonEP (MOE 通信库) | ✅ | 静态形状消灭 Host 同步 |
| AgentENV (Rust + Firecracker) | ✅ MIT | Pause-Resume 0 资源 / 5100 万沙箱 |

## 🧠 4 个底层设计

1. **KDA (Kimi Delta Attention)** — Delta Rule 线性注意力 + 逐通道遗忘门。g_min 卡 -5 = BF16 动态范围量身定制。"数学公式形状被硬件倒推"。
2. **混合 KDA + MLA** — 69 层 KDA + 24 层 MLA，所有 MLA NoPE。**1M 上下文免调 RoPE/YaRN**。
3. **AttnRes (注意力残差)** — 把"注意力干掉 RNN 时间维度瓶颈"搬到深度维度。分块 8×12。EAGLE-3 彩蛋。
4. **Stable LatentMoE** — 896 选 16 / 3584 维潜空间 / Quantile Balancing 单次前向解均衡。

## 🛠️ 5 工程亮点 (对打工写代码最有启发)

1. **QAT 全程开启** — 量化是训练配置第一天立项就锁，不是发版前一锤子买卖
2. **MoonEP 静态形状** — "R分之E 个冗余专家保证均衡可行" (可证数学定理)
3. **KDA Prefix Caching 粒度解耦** — 512 token 链式哈希 + 两阶段查找 (vLLM 默认关闭)
4. **AgentENV Pause-Resume** — Agent 98% 在等推理 → 暂停 0 资源 / 133ms checkpoint / 49ms resume
5. **多 Harness 动态实例化** — 防脚手架过拟合，K3 换套皮依然稳

## 💼 6 条凡人实战

1. **Preserved Thinking 契约** — reasoning_content 一个字符都不能丢，切模型必开新会话
2. **接入暗坑** — K3 永远思考 / WebSearch 失效降级 K2.6 / Claude Code ENABLE_TOOL_SEARCH=False
3. **算账** — 0.3 / 3 / 15 刀，10 倍缓存价差，前置一切可缓存
4. **1M 不是垃圾桶** — BrowseComp 300k = 91.2 > 1M 全量 = 90.4
5. **分层路由** — DeepSeek/GLM-5.2 焊死杂活，K3 长程 Agent，Fable 5 高风险。**80 倍价差**
6. **防备过度主动** — 沙箱 + 网络边界 + 写操作人工审批

## ⚠️ 3 个现实

- **跑分有水分** — KCB2.0 上 Claude Code = 73.7 vs Kimi Code = 72.9。换平台差 17.3 全因换脚手架。
- **幻觉率 51%** — 比 K2 的 39% 升。**业务校验层绝不能省**。
- **自托管幻想** — llama.cpp/Ollama/LM Studio 全不支持 KDA。CPU 方案 0.05-1 tok/s，32K token = **9 小时**。

## ⚖️ License 速读

**主条款 MIT + 2 个钩子**：

- **MaaS**：包装成 API + 集团年收入 > 2000 万美元 → 需另签商业协议
- **署名**：商业产品月活 > 1 亿 OR 月收入 > 2000 万美元 → UI 必须显著标 "Kimi K3"

**豁免**：纯内部使用 / 走官方或认证伙伴 / 纯转发服务 都不算 MaaS

## 🗺️ Patrick 下一步行动 (P0→P3)

| 优先级 | 行动 | 30s | 1-8h |
|---|---|---|---|
| **P0** | AgentENV 仓库白嫖 | clone | 1h sample + Pause/Resume bench |
| **P0** | 分层路由落地 | audit auth.json | 1h 30-task hybrid test |
| **P1** | QAT 训练配置第一日锁死 | grep LoRA 脚本 | 2h qat_first.py |
| **P1** | KDA Prefix Caching 部署参数 | grep vLLM | 2h script patch |
| **P2** | 幻觉率 51% 业务校验层 | list K2.6/K3 任务 | 4h post_k3_verify() |
| **P2** | Kimi K3 License 法律备忘 | memo path | 4h Revenue 模拟 |
| **P3** | BrowseComp 复现 (300k vs 1M) | reproduction path | 8h 三模型 100 题 |
| **P3** | 自托管 K3 = 死路认知存档 | knowledge note | 持续等适配 |

## 💬 Why QQ 结尾金句

> **"开源最大的诚意 并不在那个 1.56TB 的文件里 而是藏在 GitHub 的 Commit 记录中"**

## 📂 文件路径

- 完整 dashboard (bilingual EN⇄ZH + TOC v1.4.4): https://2017zyl.xyz/daily-reports/kimi-k3-moonshot-2-8tb-moe-2026-07-29/
- 源视频: https://www.youtube.com/watch?v=yryTXpvCamE

---

**字数**: ~750 字 · **生成**: 2026-07-30 · **作者**: hermes-agent · **来源**: kome.ai flat transcript 5697 chars
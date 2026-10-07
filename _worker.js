// Custom Worker for patrick-reports (CF Workers + Assets mode).
// 07-04 EXTEND: 加上 /api/ticker + /api/jobs 两个 endpoint (从 agent-tasks.jsonl 派生)
//               用于 mission-control.html 的 LIVE mode
// 07-06 EXTEND: 加 /api/design endpoint (从 state/html-design-library.json 派生)
//               用于 design-library-dashboard + mission-control stat card
// 07-09 EXTEND: 加 /api/salon endpoint (LLM-driven 3-round philosophy debate)
//               用于 philosophy-salon 圆桌辩论 — 接收 topic + persona payloads,
//               调 Claude API 生成 3 轮对话,返回 JSON
const CANONICAL_REDIRECTS = {
  '/200k-ai-job-in-house-consultant-nate-herk.html':'/200k-ai-job-in-house-consultant-nate-herk',
  '/2017zyl-daily-reports-1-day-with-hermes-agent-2026-07-12.html':'/2017zyl-daily-reports-1-day-with-hermes-agent-2026-07-12',
  '/2026-06-13-neo-labs-top-20.html':'/2026-06-13-neo-labs-top-20',
  '/2026-06-14-neo-labs-top-25-v2-v3':'/2026-06-14-neo-labs-top-25-v2',
  '/2026-06-14-neo-labs-top-25-v2-v3.html':'/2026-06-14-neo-labs-top-25-v2',
  '/2026-06-14-neo-labs-top-25-v2.html':'/2026-06-14-neo-labs-top-25-v2',
  '/2026-07-03-neo-labs-h1-update.html':'/2026-07-03-neo-labs-h1-update',
  '/2026-07-03-neo-labs-h2-update.html':'/2026-07-03-neo-labs-h2-update',
  '/2026-07-03-neo-labs-h3-update':'/2026-07-03-neo-labs-h2-update',
  '/2026-07-03-neo-labs-h3-update.html':'/2026-07-03-neo-labs-h2-update',
  '/2026-07-03-neo-labs-h4-update':'/2026-07-03-neo-labs-h2-update',
  '/2026-07-03-neo-labs-h4-update.html':'/2026-07-03-neo-labs-h2-update',
  '/2026-07-03-neo-labs-h5-update':'/2026-07-03-neo-labs-h2-update',
  '/2026-07-03-neo-labs-h5-update.html':'/2026-07-03-neo-labs-h2-update',
  '/2026-07-03-neo-labs-h6-update.html':'/2026-07-03-neo-labs-h6-update',
  '/2026-07-03-neo-labs-top-25-h1-update.html':'/2026-07-03-neo-labs-top-25-h1-update',
  '/2026-07-12-daily.html':'/2026-07-12-daily',
  '/2026-07-13-daily.html':'/2026-07-13-daily',
  '/2026-07-14-daily':'/2026-07-13-daily',
  '/2026-07-14-daily.html':'/2026-07-13-daily',
  '/2026-07-15-daily':'/2026-07-13-daily',
  '/2026-07-15-daily.html':'/2026-07-13-daily',
  '/2026-07-16-daily':'/2026-07-13-daily',
  '/2026-07-16-daily.html':'/2026-07-13-daily',
  '/2026-07-17-daily':'/2026-07-13-daily',
  '/2026-07-17-daily.html':'/2026-07-13-daily',
  '/2026-07-18-daily':'/2026-07-13-daily',
  '/2026-07-18-daily.html':'/2026-07-13-daily',
  '/2026-07-19-daily':'/2026-07-13-daily',
  '/2026-07-19-daily.html':'/2026-07-13-daily',
  '/2026-07-20-daily':'/2026-07-13-daily',
  '/2026-07-20-daily.html':'/2026-07-13-daily',
  '/2026-07-21-daily':'/2026-07-13-daily',
  '/2026-07-21-daily.html':'/2026-07-13-daily',
  '/2026-07-22-daily':'/2026-07-13-daily',
  '/2026-07-22-daily.html':'/2026-07-13-daily',
  '/2026-07-23-daily':'/2026-07-13-daily',
  '/2026-07-23-daily.html':'/2026-07-13-daily',
  '/2026-07-24-daily':'/2026-07-13-daily',
  '/2026-07-24-daily.html':'/2026-07-13-daily',
  '/2026-07-26-daily':'/2026-07-13-daily',
  '/2026-07-26-daily.html':'/2026-07-13-daily',
  '/2026-07-27-daily':'/2026-07-13-daily',
  '/2026-07-27-daily.html':'/2026-07-13-daily',
  '/2026-07-28-daily':'/2026-07-13-daily',
  '/2026-07-28-daily.html':'/2026-07-13-daily',
  '/2026-07-29-daily':'/2026-07-13-daily',
  '/2026-07-29-daily.html':'/2026-07-13-daily',
  '/2026-07-30-daily':'/2026-07-13-daily',
  '/2026-07-30-daily.html':'/2026-07-13-daily',
  '/2026-07-31-daily':'/2026-07-13-daily',
  '/2026-07-31-daily.html':'/2026-07-13-daily',
  '/2026-08-01-daily':'/2026-07-13-daily',
  '/2026-08-01-daily.html':'/2026-07-13-daily',
  '/2026-08-03-daily':'/2026-07-13-daily',
  '/2026-08-03-daily.html':'/2026-07-13-daily',
  '/2026-08-05-daily':'/2026-07-13-daily',
  '/2026-08-05-daily.html':'/2026-07-13-daily',
  '/2026-08-07-daily':'/2026-07-13-daily',
  '/2026-08-07-daily.html':'/2026-07-13-daily',
  '/2026-08-08-daily':'/2026-07-13-daily',
  '/2026-08-08-daily.html':'/2026-07-13-daily',
  '/2026-08-11-daily.html':'/2026-08-11-daily',
  '/2026-08-12-daily.html':'/2026-08-12-daily',
  '/2026-08-13-daily.html':'/2026-08-13-daily',
  '/22-hacks-implementation-voice-commit-skill.html':'/22-hacks-implementation-voice-commit-skill',
  '/2605-27817-video-models-robot-policies.html':'/2605-27817-video-models-robot-policies',
  '/2605-28317-hybrid-neural-world-models.html':'/2605-28317-hybrid-neural-world-models',
  '/2605-28544-drivewam.html':'/2605-28544-drivewam',
  '/2605-28816-gamma-world.html':'/2605-28816-gamma-world',
  '/2605-29360-mira-bench.html':'/2605-29360-mira-bench',
  '/2605-29585-world-models-in-words.html':'/2605-29585-world-models-in-words',
  '/2605-30263-minwm.html':'/2605-30263-minwm',
  '/2605-30280-qwen-vla.html':'/2605-30280-qwen-vla',
  '/2605-30338-rest3d.html':'/2605-30338-rest3d',
  '/2605-30346-yocausal.html':'/2605-30346-yocausal',
  '/2605-30347-neurok.html':'/2605-30347-neurok',
  '/2605-31033-slotmemory.html':'/2605-31033-slotmemory',
  '/2605-31111-sd-jepa.html':'/2605-31111-sd-jepa',
  '/2605-31158-light-interaction.html':'/2605-31158-light-interaction',
  '/2606-00267-stressdream.html':'/2606-00267-stressdream',
  '/2606-01027-tau0-wm.html':'/2606-01027-tau0-wm',
  '/2606-04264-unicanvas.html':'/2606-04264-unicanvas',
  '/2606-04291-3d-vision-cookbook.html':'/2606-04291-3d-vision-cookbook',
  '/2606-04968-foresightflow.html':'/2606-04968-foresightflow',
  '/2606-05773-pil-world.html':'/2606-05773-pil-world',
  '/2606-05979-wla.html':'/2606-05979-wla',
  '/2606-06014-plan-s.html':'/2606-06014-plan-s',
  '/2606-07967-disco.html':'/2606-07967-disco',
  '/2606-07974-prism.html':'/2606-07974-prism',
  '/2606-08242-light-wam.html':'/2606-08242-light-wam',
  '/2606-08555-fawam.html':'/2606-08555-fawam',
  '/2606-09828-latent-spatial-memory-mirage.html':'/2606-09828-latent-spatial-memory-mirage',
  '/2606-10135-biwm-bidirectional-autoregression.html':'/2606-10135-biwm-bidirectional-autoregression',
  '/2606-10359-reflectichain-supply-chain.html':'/2606-10359-reflectichain-supply-chain',
  '/2606-10620-imagetime-benchmark.html':'/2606-10620-imagetime-benchmark',
  '/2606-10934-worldkernel-coupling-kernel.html':'/2606-10934-worldkernel-coupling-kernel',
  '/40ikbH0Ba-g-dashboard.html':'/40ikbH0Ba-g-dashboard',
  '/7-lessons-cheatsheet-2026-06-11.html':'/7-lessons-cheatsheet-2026-06-11',
  '/agent-os-claude-julian-goldie-2026-07-04.html':'/agent-os-claude-julian-goldie-2026-07-04',
  '/agentic-os':'/agentic-os/',
  '/agentic-os-dashboard':'/agentic-os-dashboard/',
  '/agentic-os-dashboard.html':'/agentic-os-dashboard',
  '/agentic-os-dashboard/index.html':'/agentic-os-dashboard/',
  '/agentic-os-hub.html':'/agentic-os-hub',
  '/agentic-os.html':'/agentic-os',
  '/agentic-os/index.html':'/agentic-os/',
  '/ai-era-elite-education-reconstruction.html':'/ai-era-elite-education-reconstruction',
  '/ai-gurus-ranked-worst-to-best-2026-05-19.html':'/ai-gurus-ranked-worst-to-best-2026-05-19',
  '/ai-native-org-transformation-v4':'/daily-reports/ai-native-org-transformation-v4',
  '/ai-native-org-transformation-v4.html':'/daily-reports/ai-native-org-transformation-v4',
  '/ai-search-gpt56-mythos-ban-2026-06-28.html':'/ai-search-gpt56-mythos-ban-2026-06-28',
  '/ai-search-jul-2026-dashboard.html':'/ai-search-jul-2026-dashboard',
  '/ai-trending':'/ai-trending/2026-09-25',
  '/ai-trending/':'/ai-trending/2026-09-25',
  '/ai-trending/2026-06-16.html':'/ai-trending/2026-06-16',
  '/ai-trending/2026-06-17.html':'/ai-trending/2026-06-17',
  '/ai-trending/2026-06-18.html':'/ai-trending/2026-06-18',
  '/ai-trending/2026-06-19':'/daily-reports/ai-trending-2026-06-19',
  '/ai-trending/2026-06-19.html':'/daily-reports/ai-trending-2026-06-19',
  '/ai-trending/2026-06-20':'/daily-reports/ai-trending-2026-06-20',
  '/ai-trending/2026-06-20.html':'/daily-reports/ai-trending-2026-06-20',
  '/ai-trending/2026-06-21':'/daily-reports/ai-trending-2026-06-21',
  '/ai-trending/2026-06-21.html':'/daily-reports/ai-trending-2026-06-21',
  '/ai-trending/2026-06-22':'/daily-reports/ai-trending-2026-06-22',
  '/ai-trending/2026-06-22.html':'/daily-reports/ai-trending-2026-06-22',
  '/ai-trending/2026-06-23.html':'/ai-trending/2026-06-23',
  '/ai-trending/2026-06-24.html':'/ai-trending/2026-06-24',
  '/ai-trending/2026-06-25.html':'/ai-trending/2026-06-25',
  '/ai-trending/2026-06-26.html':'/ai-trending/2026-06-26',
  '/ai-trending/2026-06-27.html':'/ai-trending/2026-06-27',
  '/ai-trending/2026-06-28.html':'/ai-trending/2026-06-28',
  '/ai-trending/2026-06-29.html':'/ai-trending/2026-06-29',
  '/ai-trending/2026-06-30.html':'/ai-trending/2026-06-30',
  '/ai-trending/2026-07-01.html':'/ai-trending/2026-07-01',
  '/ai-trending/2026-07-02.html':'/ai-trending/2026-07-02',
  '/ai-trending/2026-07-03.html':'/ai-trending/2026-07-03',
  '/ai-trending/2026-07-04.html':'/ai-trending/2026-07-04',
  '/ai-trending/2026-07-05.html':'/ai-trending/2026-07-05',
  '/ai-trending/2026-07-06.html':'/ai-trending/2026-07-06',
  '/ai-trending/2026-07-07.html':'/ai-trending/2026-07-07',
  '/ai-trending/2026-07-08.html':'/ai-trending/2026-07-08',
  '/ai-trending/2026-07-09-zh.html':'/ai-trending/2026-07-09-zh',
  '/ai-trending/2026-07-09.html':'/ai-trending/2026-07-09',
  '/ai-trending/2026-07-10.html':'/ai-trending/2026-07-10',
  '/ai-trending/2026-07-11.html':'/ai-trending/2026-07-11',
  '/ai-trending/2026-07-12.html':'/ai-trending/2026-07-12',
  '/ai-trending/2026-07-13.html':'/ai-trending/2026-07-13',
  '/ai-trending/2026-07-14.html':'/ai-trending/2026-07-14',
  '/ai-trending/2026-07-15.html':'/ai-trending/2026-07-15',
  '/ai-trending/2026-07-16.html':'/ai-trending/2026-07-16',
  '/ai-trending/2026-07-17.html':'/ai-trending/2026-07-17',
  '/ai-trending/2026-07-18.html':'/ai-trending/2026-07-18',
  '/ai-trending/2026-07-19.html':'/ai-trending/2026-07-19',
  '/ai-trending/2026-07-20.html':'/ai-trending/2026-07-20',
  '/ai-trending/2026-07-21.html':'/ai-trending/2026-07-21',
  '/ai-trending/2026-07-22.html':'/ai-trending/2026-07-22',
  '/ai-trending/2026-07-23.html':'/ai-trending/2026-07-23',
  '/ai-trending/2026-07-24.html':'/ai-trending/2026-07-24',
  '/ai-trending/2026-07-25.html':'/ai-trending/2026-07-25',
  '/ai-trending/2026-07-26.html':'/ai-trending/2026-07-26',
  '/ai-trending/2026-07-27.html':'/ai-trending/2026-07-27',
  '/ai-trending/2026-07-28.html':'/ai-trending/2026-07-28',
  '/ai-trending/2026-07-29.html':'/ai-trending/2026-07-29',
  '/ai-trending/2026-07-30.html':'/ai-trending/2026-07-30',
  '/ai-trending/2026-07-31.html':'/ai-trending/2026-07-31',
  '/ai-trending/2026-08-01.html':'/ai-trending/2026-08-01',
  '/ai-trending/2026-08-02.html':'/ai-trending/2026-08-02',
  '/ai-trending/2026-08-03.html':'/ai-trending/2026-08-03',
  '/ai-trending/2026-08-04.html':'/ai-trending/2026-08-04',
  '/ai-trending/2026-08-05.html':'/ai-trending/2026-08-05',
  '/ai-trending/2026-08-06.html':'/ai-trending/2026-08-06',
  '/ai-trending/2026-08-07.html':'/ai-trending/2026-08-07',
  '/ai-trending/2026-08-08.html':'/ai-trending/2026-08-08',
  '/ai-trending/2026-08-09.html':'/ai-trending/2026-08-09',
  '/ai-trending/2026-08-10.html':'/ai-trending/2026-08-10',
  '/ai-trending/2026-08-11.html':'/ai-trending/2026-08-11',
  '/ai-trending/2026-08-12.html':'/ai-trending/2026-08-12',
  '/ai-trending/2026-08-13.html':'/ai-trending/2026-08-13',
  '/ai-trending/2026-08-14.html':'/ai-trending/2026-08-14',
  '/ai-trending/2026-08-15.html':'/ai-trending/2026-08-15',
  '/ai-trending/2026-08-16.html':'/ai-trending/2026-08-16',
  '/ai-trending/2026-08-17.html':'/ai-trending/2026-08-17',
  '/ai-trending/2026-08-18.html':'/ai-trending/2026-08-18',
  '/ai-trending/2026-08-19.html':'/ai-trending/2026-08-19',
  '/ai-trending/2026-08-20.html':'/ai-trending/2026-08-20',
  '/ai-trending/2026-08-21.html':'/ai-trending/2026-08-21',
  '/ai-trending/2026-08-22.html':'/ai-trending/2026-08-22',
  '/ai-trending/2026-08-23.html':'/ai-trending/2026-08-23',
  '/ai-trending/2026-08-24.html':'/ai-trending/2026-08-24',
  '/ai-trending/2026-08-25.html':'/ai-trending/2026-08-25',
  '/ai-trending/2026-08-26.html':'/ai-trending/2026-08-26',
  '/ai-trending/2026-08-27.html':'/ai-trending/2026-08-27',
  '/ai-trending/2026-08-28.html':'/ai-trending/2026-08-28',
  '/ai-trending/2026-08-29.html':'/ai-trending/2026-08-29',
  '/ai-trending/2026-08-30.html':'/ai-trending/2026-08-30',
  '/ai-trending/2026-08-31.html':'/ai-trending/2026-08-31',
  '/ai-trending/2026-09-01.html':'/ai-trending/2026-09-01',
  '/ai-trending/2026-09-02.html':'/ai-trending/2026-09-02',
  '/ai-trending/2026-09-03.html':'/ai-trending/2026-09-03',
  '/ai-trending/2026-09-04.html':'/ai-trending/2026-09-04',
  '/ai-trending/2026-09-05.html':'/ai-trending/2026-09-05',
  '/ai-trending/2026-09-06.html':'/ai-trending/2026-09-06',
  '/ai-trending/2026-09-07.html':'/ai-trending/2026-09-07',
  '/ai-trending/2026-09-11.html':'/ai-trending/2026-09-11',
  '/ai-trending/2026-09-12.html':'/ai-trending/2026-09-12',
  '/ai-trending/2026-09-13.html':'/ai-trending/2026-09-13',
  '/ai-trending/2026-09-14.html':'/ai-trending/2026-09-14',
  '/ai-trending/2026-09-15.html':'/ai-trending/2026-09-15',
  '/ai-trending/2026-09-16.html':'/ai-trending/2026-09-16',
  '/ai-trending/2026-09-17.html':'/ai-trending/2026-09-17',
  '/ai-trending/2026-09-18.html':'/ai-trending/2026-09-18',
  '/ai-trending/2026-09-19.html':'/ai-trending/2026-09-19',
  '/ai-trending/2026-09-20.html':'/ai-trending/2026-09-20',
  '/ai-trending/2026-09-21.html':'/ai-trending/2026-09-21',
  '/ai-trending/2026-09-22.html':'/ai-trending/2026-09-22',
  '/ai-trending/2026-09-23.html':'/ai-trending/2026-09-23',
  '/ai-trending/2026-09-24.html':'/ai-trending/2026-09-24',
  '/ai-trending/2026-09-25.html':'/ai-trending/2026-09-25',
  '/ai-trending/index.html':'/ai-trending/2026-09-25',
  '/ai-trending/weekly/2026-06-16':'/daily-reports/ai-trending-weekly-2026-06-16',
  '/ai-trending/weekly/2026-06-16.html':'/daily-reports/ai-trending-weekly-2026-06-16',
  '/ai-trending/weekly/2026-06-21':'/daily-reports/ai-trending-weekly-2026-06-21',
  '/ai-trending/weekly/2026-06-21.html':'/daily-reports/ai-trending-weekly-2026-06-21',
  '/ai-trending/weekly/2026-06-28.html':'/ai-trending/weekly/2026-06-28',
  '/ai-trending/weekly/2026-07-05.html':'/ai-trending/weekly/2026-07-05',
  '/ai-trending/weekly/2026-07-06.html':'/ai-trending/weekly/2026-07-06',
  '/ai-trending/weekly/2026-07-12.html':'/ai-trending/weekly/2026-07-12',
  '/ai-trending/weekly/2026-07-26.html':'/ai-trending/weekly/2026-07-26',
  '/ai-trending/weekly/2026-08-02.html':'/ai-trending/weekly/2026-08-02',
  '/ai-trending/weekly/2026-08-09.html':'/ai-trending/weekly/2026-08-09',
  '/ai-trending/weekly/2026-08-16.html':'/ai-trending/weekly/2026-08-16',
  '/ai-trending/weekly/2026-08-23.html':'/ai-trending/weekly/2026-08-23',
  '/ai-trending/weekly/2026-08-30.html':'/ai-trending/weekly/2026-08-30',
  '/ai-trending/weekly/2026-09-06.html':'/ai-trending/weekly/2026-09-06',
  '/ai-trending/weekly/2026-09-13.html':'/ai-trending/weekly/2026-09-13',
  '/ai-trending/weekly/2026-09-20.html':'/ai-trending/weekly/2026-09-20',
  '/all-in-2026-06-13.html':'/all-in-2026-06-13',
  '/all-in-fable-nationalizing-ai-2026-06-13.html':'/all-in-fable-nationalizing-ai-2026-06-13',
  '/all-in-podcast-ep274-nvidia-ai-crisis-spacex.html':'/all-in-podcast-ep274-nvidia-ai-crisis-spacex',
  '/annas-archive-research.html':'/annas-archive-research',
  '/anthropic-playbook-ai-startup-4stage.html':'/anthropic-playbook-ai-startup-4stage',
  '/apple-developer-wwdc26-24h.html':'/apple-developer-wwdc26-24h',
  '/apple-wwdc26-mlx-local-agentic-ai-v2':'/wwdc26_mlx_summary',
  '/apple-wwdc26-mlx-local-agentic-ai-v2.html':'/wwdc26_mlx_summary',
  '/apple-wwdc26-mlx-local-agentic-ai.html':'/apple-wwdc26-mlx-local-agentic-ai',
  '/astra-thinking-with-imagination.html':'/astra-thinking-with-imagination',
  '/astrophysicist-warns-black-holes-space-2026-07-20':'/daily-reports/astrophysicist-warns-black-holes-space-2026-07-20-dashboard',
  '/astrophysicist-warns-black-holes-space-2026-07-20.html':'/daily-reports/astrophysicist-warns-black-holes-space-2026-07-20-dashboard',
  '/bench-dashboard-2026-06-12.html':'/bench-dashboard-2026-06-12',
  '/bench-dashboard-2026-07-15.html':'/bench-dashboard-2026-07-15',
  '/chatgpt-voice-2-zero':'/chatgpt-voice-2-zero/',
  '/chatgpt-voice-2-zero/index.html':'/chatgpt-voice-2-zero/',
  '/claude-code-22-hacks-evaluation-for-hermes.html':'/claude-code-22-hacks-evaluation-for-hermes',
  '/claude-code-22-hacks-june-founder-mat.html':'/claude-code-22-hacks-june-founder-mat',
  '/claude-code-rate-limits-2026-06-13.html':'/claude-code-rate-limits-2026-06-13',
  '/claude-code-ue5-stefan-3d-ai.html':'/claude-code-ue5-stefan-3d-ai',
  '/claude-fable5-use-cases-jay-e-brutalist.html':'/claude-fable5-use-cases-jay-e-brutalist',
  '/claude-fable5-use-cases-jay-e.html':'/claude-fable5-use-cases-jay-e',
  '/claude-millionaires-2026-07-03.html':'/claude-millionaires-2026-07-03',
  '/claude_fable_usecases.html':'/claude_fable_usecases',
  '/continual-harness-princeton-ai-self-improvement.html':'/continual-harness-princeton-ai-self-improvement',
  '/cronos-counterfactual-physical-consistency.html':'/cronos-counterfactual-physical-consistency',
  '/cyberpunk2077_summary.html':'/cyberpunk2077_summary',
  '/daily-reports-ecc-deep-read-2026-07-15':'/daily-reports/ecc-deep-read-2026-07-15',
  '/daily-reports-ecc-deep-read-2026-07-15/':'/daily-reports/ecc-deep-read-2026-07-15',
  '/daily-reports-ecc-deep-read-2026-07-15/index.html':'/daily-reports/ecc-deep-read-2026-07-15',
  '/daily-reports.html':'/daily-reports',
  '/daily-reports/200k-ai-job-in-house-consultant-nate-herk.html':'/daily-reports/200k-ai-job-in-house-consultant-nate-herk',
  '/daily-reports/2017zyl-daily-reports-1-day-with-hermes-agent-2026-07-12.html':'/daily-reports/2017zyl-daily-reports-1-day-with-hermes-agent-2026-07-12',
  '/daily-reports/2017zyl-daily-reports-ai-era-growth-blueprint-2026-09-17.html':'/daily-reports/2017zyl-daily-reports-ai-era-growth-blueprint-2026-09-17',
  '/daily-reports/2017zyl-daily-reports-stem-cell-industry-2026-09-17.html':'/daily-reports/2017zyl-daily-reports-stem-cell-industry-2026-09-17',
  '/daily-reports/2017zyl-site-atlas-2026-09-16.html':'/daily-reports/2017zyl-site-atlas-2026-09-16',
  '/daily-reports/2026-06-13-neo-labs-top-20.html':'/daily-reports/2026-06-13-neo-labs-top-20',
  '/daily-reports/2026-07-15-ultraworkers-claw-code-deep-dive.html':'/daily-reports/2026-07-15-ultraworkers-claw-code-deep-dive',
  '/daily-reports/2026-07-16-ai-capital-battle-2026-07-01.html':'/daily-reports/2026-07-16-ai-capital-battle-2026-07-01',
  '/daily-reports/2026-07-16-worldofai-meta-muse-spark-1-1-2026-07-14.html':'/daily-reports/2026-07-16-worldofai-meta-muse-spark-1-1-2026-07-14',
  '/daily-reports/2026-07-19-3blue1brown-quantum-computing-dashboard.html':'/daily-reports/2026-07-19-3blue1brown-quantum-computing-dashboard',
  '/daily-reports/2026-07-19-space-data-centers-real-engineering-dashboard.html':'/daily-reports/2026-07-19-space-data-centers-real-engineering-dashboard',
  '/daily-reports/2026-07-21-china-nuclear-statrys-c8uF2LD728Q-dashboard.html':'/daily-reports/2026-07-21-china-nuclear-statrys-c8uF2LD728Q-dashboard',
  '/daily-reports/2026-07-21-yc-ebufar-conductor-vbqaL-eHhKY-dashboard.html':'/daily-reports/2026-07-21-yc-ebufar-conductor-vbqaL-eHhKY-dashboard',
  '/daily-reports/2026-07-22-google-deepmind-ceo-agi-rollout-xJplWSRHvBg-2026-07-20-dashboard.html':'/daily-reports/2026-07-22-google-deepmind-ceo-agi-rollout-xJplWSRHvBg-2026-07-20-dashboard',
  '/daily-reports/2026-07-22-hermes-agent-fundamentals-2026-07-20-dashboard.html':'/daily-reports/2026-07-22-hermes-agent-fundamentals-2026-07-20-dashboard',
  '/daily-reports/2026-07-25-claude-code-mobile-app-full-course-dashboard.html':'/daily-reports/2026-07-25-claude-code-mobile-app-full-course-dashboard',
  '/daily-reports/2026-07-25-deepmind-deception-agi-safety-dashboard.html':'/daily-reports/2026-07-25-deepmind-deception-agi-safety-dashboard',
  '/daily-reports/2026-07-25-demis-hassabis-agi-5-year-HA4_2rqrP70-dashboard.html':'/daily-reports/2026-07-25-demis-hassabis-agi-5-year-HA4_2rqrP70-dashboard',
  '/daily-reports/2026-07-27-gpt-provider-comparison-4-paths.html':'/daily-reports/2026-07-27-gpt-provider-comparison-4-paths',
  '/daily-reports/2026-07-28-laozhai-ai-company-survey-publisher-restricted-dashboard.html':'/daily-reports/2026-07-28-laozhai-ai-company-survey-publisher-restricted-dashboard',
  '/daily-reports/2026-07-28-value-maxing-with-gpt-5-6-openai-build-hour-dashboard.html':'/daily-reports/2026-07-28-value-maxing-with-gpt-5-6-openai-build-hour-dashboard',
  '/daily-reports/2026-07-29-elon-economist-race-aware-5-source-dashboard.html':'/daily-reports/2026-07-29-elon-economist-race-aware-5-source-dashboard',
  '/daily-reports/2026-07-29-ilya-ssi-nvidia-race-aware-6-source-dashboard.html':'/daily-reports/2026-07-29-ilya-ssi-nvidia-race-aware-6-source-dashboard',
  '/daily-reports/2026-07-31-ai-agents-most-valuable-skill-open-residency-2026-07-29-dashboard.html':'/daily-reports/2026-07-31-ai-agents-most-valuable-skill-open-residency-2026-07-29-dashboard',
  '/daily-reports/2026-07-31-buzz-riley-brown-jack-dorsey-block-2026-07-30-dashboard.html':'/daily-reports/2026-07-31-buzz-riley-brown-jack-dorsey-block-2026-07-30-dashboard',
  '/daily-reports/2026-08-01-matthew-berman-claude-tag-anthropic-context-lockin-dashboard.html':'/daily-reports/2026-08-01-matthew-berman-claude-tag-anthropic-context-lockin-dashboard',
  '/daily-reports/3XIGcM7VICc-nate-herk-6-ai-skills.html':'/daily-reports/3XIGcM7VICc-nate-herk-6-ai-skills',
  '/daily-reports/40ikbH0Ba-g-dashboard':'/40ikbH0Ba-g-dashboard',
  '/daily-reports/40ikbH0Ba-g-dashboard.html':'/40ikbH0Ba-g-dashboard',
  '/daily-reports/7-loops-matthew-berman-dashboard.html':'/daily-reports/7-loops-matthew-berman-dashboard',
  '/daily-reports/Qifsxitq_q4-brian-greene-cosmos-consciousness-ai-2026-08-18.html':'/daily-reports/Qifsxitq_q4-brian-greene-cosmos-consciousness-ai-2026-08-18',
  '/daily-reports/Slle5_AxBzs-china-ai-endgame-2026-08-23.html':'/daily-reports/Slle5_AxBzs-china-ai-endgame-2026-08-23',
  '/daily-reports/TP73_austin_claude_6_power_phrases.html':'/daily-reports/TP73_austin_claude_6_power_phrases',
  '/daily-reports/a16z-new-media-2026-round-9-dashboard.html':'/daily-reports/a16z-new-media-2026-round-9-dashboard',
  '/daily-reports/a16z-new-media-jun-2026-dashboard':'/daily-reports/a16z-new-media-2026-round-9-dashboard',
  '/daily-reports/a16z-new-media-jun-2026-dashboard.html':'/daily-reports/a16z-new-media-2026-round-9-dashboard',
  '/daily-reports/abhigya-predicts-emerging-new-world-order-wars-lea.html':'/daily-reports/abhigya-predicts-emerging-new-world-order-wars-lea',
  '/daily-reports/agent-os-claude-julian-goldie-2026-07-04.html':'/daily-reports/agent-os-claude-julian-goldie-2026-07-04',
  '/daily-reports/agentic-os-dashboard.html':'/daily-reports/agentic-os-dashboard',
  '/daily-reports/agentic-os-hub.html':'/daily-reports/agentic-os-hub',
  '/daily-reports/ai-2040-plan-a.html':'/daily-reports/ai-2040-plan-a',
  '/daily-reports/ai-first-playbook-peter-yang-dashboard.html':'/daily-reports/ai-first-playbook-peter-yang-dashboard',
  '/daily-reports/ai-frontier-radar-live.html':'/daily-reports/ai-frontier-radar-live',
  '/daily-reports/ai-fund-builder-50-expert-deep-briefs-2026.html':'/daily-reports/ai-fund-builder-50-expert-deep-briefs-2026',
  '/daily-reports/ai-future-form-symbiosis-deep-research-2026-07-03.html':'/daily-reports/ai-future-form-symbiosis-deep-research-2026-07-03',
  '/daily-reports/ai-guardrails-learning-bastani-pnas-2025.html':'/daily-reports/ai-guardrails-learning-bastani-pnas-2025',
  '/daily-reports/ai-native-org-structure-2026-07-14-dashboard.html':'/daily-reports/ai-native-org-structure-2026-07-14-dashboard',
  '/daily-reports/ai-native-org-transformation-v4.html':'/daily-reports/ai-native-org-transformation-v4',
  '/daily-reports/ai-news-sxiRANj0xLs.html':'/daily-reports/ai-news-sxiRANj0xLs',
  '/daily-reports/ai-quantum-frenemies-2026-08-17':'/daily-reports/ai-quantum-frenemies-2026-08-17/',
  '/daily-reports/ai-quantum-frenemies-2026-08-17/index.html':'/daily-reports/ai-quantum-frenemies-2026-08-17/',
  '/daily-reports/ai-search-gpt56-mythos-ban-2026-06-28.html':'/daily-reports/ai-search-gpt56-mythos-ban-2026-06-28',
  '/daily-reports/ai-search-jul-2026-dashboard':'/ai-search-jul-2026-dashboard',
  '/daily-reports/ai-search-jul-2026-dashboard.html':'/ai-search-jul-2026-dashboard',
  '/daily-reports/ai-search-practical-tricks-round-7-dashboard':'/ai-search-jul-2026-dashboard',
  '/daily-reports/ai-search-practical-tricks-round-7-dashboard.html':'/ai-search-jul-2026-dashboard',
  '/daily-reports/ai-symbiosis-critical-review-2026-07-03.html':'/daily-reports/ai-symbiosis-critical-review-2026-07-03',
  '/daily-reports/ai-symbiosis-round-2-defense-2026-07-03.html':'/daily-reports/ai-symbiosis-round-2-defense-2026-07-03',
  '/daily-reports/ai-three-reports-critique-red-pen-2026-07-03.html':'/daily-reports/ai-three-reports-critique-red-pen-2026-07-03',
  '/daily-reports/ai-three-reports-debate-archive-2026-07-03.html':'/daily-reports/ai-three-reports-debate-archive-2026-07-03',
  '/daily-reports/ai-three-reports-final-archive-2026-07-03.html':'/daily-reports/ai-three-reports-final-archive-2026-07-03',
  '/daily-reports/ai-three-reports-final-protocol-clean-2026-07-03.html':'/daily-reports/ai-three-reports-final-protocol-clean-2026-07-03',
  '/daily-reports/ai-three-reports-integrated-review-2026-07-03.html':'/daily-reports/ai-three-reports-integrated-review-2026-07-03',
  '/daily-reports/ai-three-reports-round-3-retrospective-2026-07-03.html':'/daily-reports/ai-three-reports-round-3-retrospective-2026-07-03',
  '/daily-reports/ai-three-reports-round-4-meta-check-2026-07-03.html':'/daily-reports/ai-three-reports-round-4-meta-check-2026-07-03',
  '/daily-reports/ai-three-reports-summary-2026-07-03.html':'/daily-reports/ai-three-reports-summary-2026-07-03',
  '/daily-reports/ai-trending-2026-06-19.html':'/daily-reports/ai-trending-2026-06-19',
  '/daily-reports/ai-trending-2026-06-20.html':'/daily-reports/ai-trending-2026-06-20',
  '/daily-reports/ai-trending-2026-06-21.html':'/daily-reports/ai-trending-2026-06-21',
  '/daily-reports/ai-trending-2026-06-22.html':'/daily-reports/ai-trending-2026-06-22',
  '/daily-reports/ai-trending-weekly-2026-06-16.html':'/daily-reports/ai-trending-weekly-2026-06-16',
  '/daily-reports/ai-trending-weekly-2026-06-21.html':'/daily-reports/ai-trending-weekly-2026-06-21',
  '/daily-reports/airtable-ceo-top-1-percent-ai-howie-liu-dashboard.html':'/daily-reports/airtable-ceo-top-1-percent-ai-howie-liu-dashboard',
  '/daily-reports/all-in-mamdani-china-ai-2026-06-27-dashboard.html':'/daily-reports/all-in-mamdani-china-ai-2026-06-27-dashboard',
  '/daily-reports/allin-sro-data-center-moratorium-2026-07-18.html':'/daily-reports/allin-sro-data-center-moratorium-2026-07-18',
  '/daily-reports/anthropic-completely-fcked-moon-dashboard.html':'/daily-reports/anthropic-completely-fcked-moon-dashboard',
  '/daily-reports/astrophysicist-warns-black-holes-space-2026-07-20-dashboard.html':'/daily-reports/astrophysicist-warns-black-holes-space-2026-07-20-dashboard',
  '/daily-reports/axiome-human-values-agi-2026.html':'/daily-reports/axiome-human-values-agi-2026',
  '/daily-reports/bilibili-ai-industry-insights-2026-06-dashboard.html':'/daily-reports/bilibili-ai-industry-insights-2026-06-dashboard',
  '/daily-reports/building-great-agent-skills-the-missing-manual-2026-07-06.html':'/daily-reports/building-great-agent-skills-the-missing-manual-2026-07-06',
  '/daily-reports/business-loop-studio-2026-09-10.html':'/daily-reports/business-loop-studio-2026-09-10',
  '/daily-reports/china-collection-bilingual-100.html':'/daily-reports/china-collection-bilingual-100',
  '/daily-reports/china-ev-grand-tour-700km-2026.html':'/daily-reports/china-ev-grand-tour-700km-2026',
  '/daily-reports/china-ipo-compass-2026-08-05.html':'/daily-reports/china-ipo-compass-2026-08-05',
  '/daily-reports/china-product-atlas-100-2026.html':'/daily-reports/china-product-atlas-100-2026',
  '/daily-reports/claude-code-nate-herk-2026-07-12-dashboard.html':'/daily-reports/claude-code-nate-herk-2026-07-12-dashboard',
  '/daily-reports/claude-code-ue5-stefan-3d-ai-dashboard.html':'/daily-reports/claude-code-ue5-stefan-3d-ai-dashboard',
  '/daily-reports/claude-containment-stack-11-rules-dashboard.html':'/daily-reports/claude-containment-stack-11-rules-dashboard',
  '/daily-reports/claude-fable5-peter-yang-2026-07-04':'/daily-reports/fable5-peter-yang-2026-07-04',
  '/daily-reports/claude-fable5-peter-yang-2026-07-04.html':'/daily-reports/fable5-peter-yang-2026-07-04',
  '/daily-reports/claude-fable5-use-cases-jay-e':'/claude-fable5-use-cases-jay-e',
  '/daily-reports/claude-fable5-use-cases-jay-e-brutalist':'/claude-fable5-use-cases-jay-e-brutalist',
  '/daily-reports/claude-fable5-use-cases-jay-e-brutalist.html':'/claude-fable5-use-cases-jay-e-brutalist',
  '/daily-reports/claude-fable5-use-cases-jay-e.html':'/claude-fable5-use-cases-jay-e',
  '/daily-reports/claude-j-space-introspection-2026-07-07.html':'/daily-reports/claude-j-space-introspection-2026-07-07',
  '/daily-reports/claude-millionaires-2026-07-03.html':'/daily-reports/claude-millionaires-2026-07-03',
  '/daily-reports/dashboard':'/dashboard',
  '/daily-reports/dashboard.html':'/dashboard',
  '/daily-reports/datacamp-ai-engineer-review-dashboard.html':'/daily-reports/datacamp-ai-engineer-review-dashboard',
  '/daily-reports/deepseek-harness-extreme-guide-2026-09-04.html':'/daily-reports/deepseek-harness-extreme-guide-2026-09-04',
  '/daily-reports/demis-hassabis-2030-agi-tool-to-agency-2026-07-18.html':'/daily-reports/demis-hassabis-2030-agi-tool-to-agency-2026-07-18',
  '/daily-reports/domain-experts-winning-yc-lightcone-dashboard.html':'/daily-reports/domain-experts-winning-yc-lightcone-dashboard',
  '/daily-reports/eRrc1pUY5oU/dashboard.html':'/daily-reports/eRrc1pUY5oU/dashboard',
  '/daily-reports/ebufar-yc-head-design-conductor-2026-07-15.html':'/daily-reports/ebufar-yc-head-design-conductor-2026-07-15',
  '/daily-reports/ecc-deep-read-2026-07-15.html':'/daily-reports/ecc-deep-read-2026-07-15',
  '/daily-reports/efficient-engineer-build-a-satellite-dashboard':'/daily-reports/efficient-engineer-build-a-satellite-round-10-dashboard',
  '/daily-reports/efficient-engineer-build-a-satellite-dashboard.html':'/daily-reports/efficient-engineer-build-a-satellite-round-10-dashboard',
  '/daily-reports/efficient-engineer-build-a-satellite-round-10-dashboard.html':'/daily-reports/efficient-engineer-build-a-satellite-round-10-dashboard',
  '/daily-reports/extraction-shooter-map-design-dashboard':'/extraction-shooter-map-design-dashboard',
  '/daily-reports/extraction-shooter-map-design-dashboard.html':'/extraction-shooter-map-design-dashboard',
  '/daily-reports/fable5-5-tips-action-loop-2026-07-06.html':'/daily-reports/fable5-5-tips-action-loop-2026-07-06',
  '/daily-reports/fable5-jack-roberts-websites-levels-2026-07-06.html':'/daily-reports/fable5-jack-roberts-websites-levels-2026-07-06',
  '/daily-reports/fable5-peter-yang-2026-07-04.html':'/daily-reports/fable5-peter-yang-2026-07-04',
  '/daily-reports/family-travel-memory-demo-2026-07-20.html':'/daily-reports/family-travel-memory-demo-2026-07-20',
  '/daily-reports/fei-fei-li-godmother-ai-10-years-dashboard.html':'/daily-reports/fei-fei-li-godmother-ai-10-years-dashboard',
  '/daily-reports/fltrp-grade4-word-odyssey.html':'/daily-reports/fltrp-grade4-word-odyssey',
  '/daily-reports/g7AxxkywiFI-seth-godin-the-knot-patrick-2026-08-10.html':'/daily-reports/g7AxxkywiFI-seth-godin-the-knot-patrick-2026-08-10',
  '/daily-reports/global-cruise-compass-2026-27.html':'/daily-reports/global-cruise-compass-2026-27',
  '/daily-reports/google-deepmind-ceo-scariest-part-yet-to-come-neuralnutshell-2026-06-28.html':'/daily-reports/google-deepmind-ceo-scariest-part-yet-to-come-neuralnutshell-2026-06-28',
  '/daily-reports/google-io-2026-the-line-dashboard.html':'/daily-reports/google-io-2026-the-line-dashboard',
  '/daily-reports/gpt-5-6-sol-bilingual-2026-07-15.html':'/daily-reports/gpt-5-6-sol-bilingual-2026-07-15',
  '/daily-reports/greg-isenberg-6-skills-agentic-era.html':'/daily-reports/greg-isenberg-6-skills-agentic-era',
  '/daily-reports/greg-isenberg-agent-loop-ros-mike-2026-06.html':'/daily-reports/greg-isenberg-agent-loop-ros-mike-2026-06',
  '/daily-reports/hardtech-2026-06-22.html':'/daily-reports/hardtech-2026-06-22',
  '/daily-reports/hardtech-weekly-2026-06-17.html':'/daily-reports/hardtech-weekly-2026-06-17',
  '/daily-reports/hardtech-weekly-2026-06-21.html':'/daily-reports/hardtech-weekly-2026-06-21',
  '/daily-reports/herdr-multi-agent-control-plane-3ZVWhFI5bpw.html':'/daily-reports/herdr-multi-agent-control-plane-3ZVWhFI5bpw',
  '/daily-reports/hermes-agent-mixture-of-agents-davidondrej-2026-06-29.html':'/daily-reports/hermes-agent-mixture-of-agents-davidondrej-2026-06-29',
  '/daily-reports/html-design-library-viewer-2026-07-06.html':'/daily-reports/html-design-library-viewer-2026-07-06',
  '/daily-reports/hybrid-llm-routing-dashboard.html':'/daily-reports/hybrid-llm-routing-dashboard',
  '/daily-reports/iea-energy-and-ai-dashboard-2026-07-03.html':'/daily-reports/iea-energy-and-ai-dashboard-2026-07-03',
  '/daily-reports/index.html':'/daily-reports',
  '/daily-reports/indydevdan-m5-mlx-local-stack-dashboard.html':'/daily-reports/indydevdan-m5-mlx-local-stack-dashboard',
  '/daily-reports/jason-lee-coinsnap-vibe-coded-400k-2026-07-07.html':'/daily-reports/jason-lee-coinsnap-vibe-coded-400k-2026-07-07',
  '/daily-reports/jiang-geopolitical-forecast-audit-2026-09-14.html':'/daily-reports/jiang-geopolitical-forecast-audit-2026-09-14',
  '/daily-reports/jkkr8czmg4u-hermes-voice-patrick-v2-2026-08-10.html':'/daily-reports/jkkr8czmg4u-hermes-voice-patrick-v2-2026-08-10',
  '/daily-reports/julian-agentic-os-distilled':'/julian-agentic-os-distilled',
  '/daily-reports/julian-agentic-os-distilled-v2-2026-07-06':'/julian-agentic-os-distilled-v2-2026-07-06',
  '/daily-reports/julian-agentic-os-distilled-v2-2026-07-06.html':'/julian-agentic-os-distilled-v2-2026-07-06',
  '/daily-reports/julian-agentic-os-distilled.html':'/julian-agentic-os-distilled',
  '/daily-reports/k1-agent-native-knowledge-orchestration-dashboard.html':'/daily-reports/k1-agent-native-knowledge-orchestration-dashboard',
  '/daily-reports/karpathy-auto-research-3file-system.html':'/daily-reports/karpathy-auto-research-3file-system',
  '/daily-reports/kokotajlo-ai-2027-diary-of-ceo-2026-07-13-dashboard.html':'/daily-reports/kokotajlo-ai-2027-diary-of-ceo-2026-07-13-dashboard',
  '/daily-reports/l8-principal-agentic-engineering-workflow-dashboard.html':'/daily-reports/l8-principal-agentic-engineering-workflow-dashboard',
  '/daily-reports/liang-wenfeng-deepseek-restraint-patrick-2026-07-27.html':'/daily-reports/liang-wenfeng-deepseek-restraint-patrick-2026-07-27',
  '/daily-reports/liang-wenfeng-investor-exchange-2026-dashboard.html':'/daily-reports/liang-wenfeng-investor-exchange-2026-dashboard',
  '/daily-reports/linux-foundation-ai-cto-china-open-source-dashboard.html':'/daily-reports/linux-foundation-ai-cto-china-open-source-dashboard',
  '/daily-reports/little-english-explorer-starters-speaking-2026.html':'/daily-reports/little-english-explorer-starters-speaking-2026',
  '/daily-reports/livermore-brothers-silicon-valley-girl-2026-07-18.html':'/daily-reports/livermore-brothers-silicon-valley-girl-2026-07-18',
  '/daily-reports/local-ai-summit-2026-opening-panel-2026-07-14.html':'/daily-reports/local-ai-summit-2026-opening-panel-2026-07-14',
  '/daily-reports/loop-engineering-01coder-wumlsfkeWhc.html':'/daily-reports/loop-engineering-01coder-wumlsfkeWhc',
  '/daily-reports/looped-world-model-1b-ai-discover-dashboard.html':'/daily-reports/looped-world-model-1b-ai-discover-dashboard',
  '/daily-reports/mac-gaming-2026-dashboard.html':'/daily-reports/mac-gaming-2026-dashboard',
  '/daily-reports/mark-kashef-fable5-save-2026-07-06.html':'/daily-reports/mark-kashef-fable5-save-2026-07-06',
  '/daily-reports/math-olympiad-playbook-9yo.html':'/daily-reports/math-olympiad-playbook-9yo',
  '/daily-reports/matt-pocock-skills-130k-stars-dashboard.html':'/daily-reports/matt-pocock-skills-130k-stars-dashboard',
  '/daily-reports/matt-van-horn-agentic-engineering-2026-06-14.html':'/daily-reports/matt-van-horn-agentic-engineering-2026-06-14',
  '/daily-reports/matt-wolfe-chatgpt-5-6-guide-2026-07-17.html':'/daily-reports/matt-wolfe-chatgpt-5-6-guide-2026-07-17',
  '/daily-reports/matt-wolfe-selling-knowledge-bases-2026-07-20':'/matt-wolfe-selling-knowledge-bases-2026-07-20',
  '/daily-reports/matt-wolfe-selling-knowledge-bases-2026-07-20-dashboard.html':'/daily-reports/matt-wolfe-selling-knowledge-bases-2026-07-20-dashboard',
  '/daily-reports/matt-wolfe-selling-knowledge-bases-2026-07-20.html':'/matt-wolfe-selling-knowledge-bases-2026-07-20',
  '/daily-reports/meitou-electric-revolution-2026-07-14-dashboard.html':'/daily-reports/meitou-electric-revolution-2026-07-14-dashboard',
  '/daily-reports/michael-saylor-ai-abundance-scarcity-2026-08-07.html':'/daily-reports/michael-saylor-ai-abundance-scarcity-2026-08-07',
  '/daily-reports/moyo-living-museum.html':'/daily-reports/moyo-living-museum',
  '/daily-reports/nasa-starliner-cft-investigation-2026-02-05-dashboard.html':'/daily-reports/nasa-starliner-cft-investigation-2026-02-05-dashboard',
  '/daily-reports/nate-herk-stop-ai-dashboard.html':'/daily-reports/nate-herk-stop-ai-dashboard',
  '/daily-reports/nick-nisi-95pct-agent-skills-deleted.html':'/daily-reports/nick-nisi-95pct-agent-skills-deleted',
  '/daily-reports/notebooklm-2-0-dashboard.html':'/daily-reports/notebooklm-2-0-dashboard',
  '/daily-reports/notebooklm-google-feature-update.html':'/daily-reports/notebooklm-google-feature-update',
  '/daily-reports/o-wv_szZ0V0-andrew-ng-ai-opportunities-2026-08-30.html':'/daily-reports/o-wv_szZ0V0-andrew-ng-ai-opportunities-2026-08-30',
  '/daily-reports/ocr.html':'/daily-reports/ocr',
  '/daily-reports/ooda-loop-infinite-brain-ai-impact-dashboard.html':'/daily-reports/ooda-loop-infinite-brain-ai-impact-dashboard',
  '/daily-reports/openai-fde-40-billion-silicon-valley-101-dashboard.html':'/daily-reports/openai-fde-40-billion-silicon-valley-101-dashboard',
  '/daily-reports/openai-vs-anthropic-subscription-war-2026-07-16.html':'/daily-reports/openai-vs-anthropic-subscription-war-2026-07-16',
  '/daily-reports/openclaw-on-steroids-multi-agent-latent-dashboard.html':'/daily-reports/openclaw-on-steroids-multi-agent-latent-dashboard',
  '/daily-reports/openclaw-wic-vincent-cotch-2026-07-21-dashboard.html':'/daily-reports/openclaw-wic-vincent-cotch-2026-07-21-dashboard',
  '/daily-reports/opensquilla-metaskill-skill-2-0-dashboard.html':'/daily-reports/opensquilla-metaskill-skill-2-0-dashboard',
  '/daily-reports/orbital-console':'/orbital-console',
  '/daily-reports/orbital-console.html':'/orbital-console',
  '/daily-reports/ornith-1-0-self-scaffolding-dashboard.html':'/daily-reports/ornith-1-0-self-scaffolding-dashboard',
  '/daily-reports/private-equity-alpha-operating-system.html':'/daily-reports/private-equity-alpha-operating-system',
  '/daily-reports/qwen-agentworld-dashboard.html':'/daily-reports/qwen-agentworld-dashboard',
  '/daily-reports/reform-12-week-indoor-body-transformation.html':'/daily-reports/reform-12-week-indoor-body-transformation',
  '/daily-reports/sam-altman-stanford-cs183-dashboard.html':'/daily-reports/sam-altman-stanford-cs183-dashboard',
  '/daily-reports/sandeep-swadia-the-mitmonk.html':'/daily-reports/sandeep-swadia-the-mitmonk',
  '/daily-reports/self-harness-optimization-dashboard.html':'/daily-reports/self-harness-optimization-dashboard',
  '/daily-reports/sensor-tower-state-of-ai-2026-dashboard':'/youtube/2026-06-25-sensor-tower-state-of-ai-2026',
  '/daily-reports/sensor-tower-state-of-ai-2026-dashboard.html':'/youtube/2026-06-25-sensor-tower-state-of-ai-2026',
  '/daily-reports/shanhe-grand-loop-china-roadtrip-2026.html':'/daily-reports/shanhe-grand-loop-china-roadtrip-2026',
  '/daily-reports/sierra-zack-stratechery-ai-bubble-round-8-dashboard':'/zack-sierra-jun-2026-dashboard',
  '/daily-reports/sierra-zack-stratechery-ai-bubble-round-8-dashboard.html':'/zack-sierra-jun-2026-dashboard',
  '/daily-reports/silicon-valley-girl-brynjolfsson-2026-07-22.html':'/daily-reports/silicon-valley-girl-brynjolfsson-2026-07-22',
  '/daily-reports/stanford-cs329a-self-improving-agents-part1-2026-08-07.html':'/daily-reports/stanford-cs329a-self-improving-agents-part1-2026-08-07',
  '/daily-reports/stanford-hai-ai-index-2026-dashboard-2026-07-03.html':'/daily-reports/stanford-hai-ai-index-2026-dashboard-2026-07-03',
  '/daily-reports/starship-critical-path-2026-07-14-dashboard-v2-bilingual':'/daily-reports/starship-critical-path-2026-07-14-dashboard',
  '/daily-reports/starship-critical-path-2026-07-14-dashboard-v2-bilingual.html':'/daily-reports/starship-critical-path-2026-07-14-dashboard',
  '/daily-reports/starship-critical-path-2026-07-14-dashboard.html':'/daily-reports/starship-critical-path-2026-07-14-dashboard',
  '/daily-reports/superpowers-audit-2026-07-15.html':'/daily-reports/superpowers-audit-2026-07-15',
  '/daily-reports/sw3hzrv2ztg-dashboard.html':'/daily-reports/sw3hzrv2ztg-dashboard',
  '/daily-reports/systems-thinking-4-systems-dashboard.html':'/daily-reports/systems-thinking-4-systems-dashboard',
  '/daily-reports/task-decomposition-agentic-workflow-dashboard.html':'/daily-reports/task-decomposition-agentic-workflow-dashboard',
  '/daily-reports/techwithtim-local-agentic-coding-dashboard.html':'/daily-reports/techwithtim-local-agentic-coding-dashboard',
  '/daily-reports/theaigrid-google-deepmind-agi-asi-timeline-2026-07-14-dashboard.html':'/daily-reports/theaigrid-google-deepmind-agi-asi-timeline-2026-07-14-dashboard',
  '/daily-reports/tristan-harris-agi-existential-risk-neural-nutshell-dashboard.html':'/daily-reports/tristan-harris-agi-existential-risk-neural-nutshell-dashboard',
  '/daily-reports/ui-design-2026-trends-dashboard.html':'/daily-reports/ui-design-2026-trends-dashboard',
  '/daily-reports/vercel-company-agent-guillermo-rauch-2026-08-06-v2.html':'/daily-reports/vercel-company-agent-guillermo-rauch-2026-08-06-v2',
  '/daily-reports/wh-cea-great-divergence-dashboard-2026-07-03.html':'/daily-reports/wh-cea-great-divergence-dashboard-2026-07-03',
  '/daily-reports/when-millions-of-ai-agents-meet-deepmind-tomasev-dashboard.html':'/daily-reports/when-millions-of-ai-agents-meet-deepmind-tomasev-dashboard',
  '/daily-reports/world-model-core-team':'/daily-reports/world-model-core-team/',
  '/daily-reports/world-model-core-team/index.html':'/daily-reports/world-model-core-team/',
  '/daily-reports/wwdc26-apple-developer-24h-dashboard.html':'/daily-reports/wwdc26-apple-developer-24h-dashboard',
  '/daily-reports/xgkjtF89-44/dashboard.html':'/daily-reports/xgkjtF89-44/dashboard',
  '/daily-reports/xr-signals-2026':'/daily-reports/xr-signals-2026/',
  '/daily-reports/xr-signals-2026/index.html':'/daily-reports/xr-signals-2026/',
  '/daily-reports/yc-ai-native-service-companies-2026-07-15.html':'/daily-reports/yc-ai-native-service-companies-2026-07-15',
  '/daily-reports/zack-sierra-jun-2026-dashboard':'/zack-sierra-jun-2026-dashboard',
  '/daily-reports/zack-sierra-jun-2026-dashboard.html':'/zack-sierra-jun-2026-dashboard',
  '/daily-reports/zai-glm-5-2-open-source-1-dashboard.html':'/daily-reports/zai-glm-5-2-open-source-1-dashboard',
  '/daily-reports/zhangliang-discovery-mit-language-thought-2026-07-20-dashboard.html':'/daily-reports/zhangliang-discovery-mit-language-thought-2026-07-20-dashboard',
  '/dashboard.html':'/dashboard',
  '/datacamp-ai-engineer-review.html':'/datacamp-ai-engineer-review',
  '/db':'/db/',
  '/db/index.html':'/db/',
  '/design-library-dashboard-2026-07-06.html':'/design-library-dashboard-2026-07-06',
  '/designcourse-claude-code-framework-2026-06-10.html':'/designcourse-claude-code-framework-2026-06-10',
  '/dystopian-authors/dystopian-authors.html':'/dystopian-authors/dystopian-authors',
  '/e3c-egocentric-video-world-model.html':'/e3c-egocentric-video-world-model',
  '/education_summary.html':'/education_summary',
  '/emai-closeday-2026-06-11-eod.html':'/emai-closeday-2026-06-11-eod',
  '/emai-closeday-2026-06-12-eod.html':'/emai-closeday-2026-06-12-eod',
  '/emai-closeday-2026-06-15-eod.html':'/emai-closeday-2026-06-15-eod',
  '/enterprise-local-ai-blueprint':'/enterprise-local-ai-blueprint/',
  '/enterprise-local-ai-blueprint/index.html':'/enterprise-local-ai-blueprint/',
  '/eod-2026-06-12-summary.html':'/eod-2026-06-12-summary',
  '/exercise-library':'/exercise-library/',
  '/exercise-library/index.html':'/exercise-library/',
  '/exp14-regime-dashboard-v2':'/exp14-regime-dashboard',
  '/exp14-regime-dashboard-v2.html':'/exp14-regime-dashboard',
  '/exp14-regime-dashboard.html':'/exp14-regime-dashboard',
  '/exp15-lightgbm-dashboard.html':'/exp15-lightgbm-dashboard',
  '/exp16-regime-dashboard.html':'/exp16-regime-dashboard',
  '/exp17-quarterly-dashboard.html':'/exp17-quarterly-dashboard',
  '/extraction-shooter-map-design-dashboard.html':'/extraction-shooter-map-design-dashboard',
  '/fable-5-onredej-workflow-2026-06-11.html':'/fable-5-onredej-workflow-2026-06-11',
  '/fable5-karpathy-llm-wiki-dashboard.html':'/fable5-karpathy-llm-wiki-dashboard',
  '/fantasy-authors/fantasy-authors.html':'/fantasy-authors/fantasy-authors',
  '/fantasy-media/fantasy-media.html':'/fantasy-media/fantasy-media',
  '/ffmpeg-lex-496-2026-06-13.html':'/ffmpeg-lex-496-2026-06-13',
  '/future-atlas.html':'/future-atlas',
  '/gary-chen-ai-agent-goal-function-tutorial.html':'/gary-chen-ai-agent-goal-function-tutorial',
  '/gcp-1.2.0-launch-digest-v2-2026-06-12.html':'/gcp-1.2.0-launch-digest-v2-2026-06-12',
  '/gem-4d-geometry-enhanced-video-world-models-2605.html':'/gem-4d-geometry-enhanced-video-world-models-2605',
  '/gem-4d-video-world-model.html':'/gem-4d-video-world-model',
  '/geovr-geometric-representations-videos-spatial-intelligent-mllms.html':'/geovr-geometric-representations-videos-spatial-intelligent-mllms',
  '/google-io-2026-ai-news-matt-wolfe.html':'/google-io-2026-ai-news-matt-wolfe',
  '/gotrace-v01/gotrace-v01-final.html':'/gotrace-v01/gotrace-v01-final',
  '/gotrace-v01/gotrace-v01-l4.html':'/gotrace-v01/gotrace-v01-l4',
  '/gotrace-v01/gotrace-v01.html':'/gotrace-v01/gotrace-v01',
  '/gotrace-v01/snippet-mock-extra.html':'/gotrace-v01/snippet-mock-extra',
  '/gotrace-v01/snippet-view-home.html':'/gotrace-v01/snippet-view-home',
  '/gotrace-v01/snippet-view-me.html':'/gotrace-v01/snippet-view-me',
  '/gotrace-v01/snippet-view-plan.html':'/gotrace-v01/snippet-view-plan',
  '/gotrace-v01/snippet-view-trip.html':'/gotrace-v01/snippet-view-trip',
  '/greg-isenberg-6-skills-agentic-era.html':'/greg-isenberg-6-skills-agentic-era',
  '/groundtruth-knowledge-ops':'/groundtruth-knowledge-ops/',
  '/groundtruth-knowledge-ops/index.html':'/groundtruth-knowledge-ops/',
  '/hackernews-top5-2026-06-12.html':'/hackernews-top5-2026-06-12',
  '/hackernews-top5-2026-06-14.html':'/hackernews-top5-2026-06-14',
  '/hackernews-top5-2026-06-15.html':'/hackernews-top5-2026-06-15',
  '/hardtech':'/hardtech/2026-09-25',
  '/hardtech-weekly-2026-06-21-zh':'/hardtech-weekly-2026-06-21-zh/',
  '/hardtech-weekly-2026-06-21-zh/index.html':'/hardtech-weekly-2026-06-21-zh/',
  '/hardtech-weekly-2026-06-21-zh/items/01-uss-big-bet-on-quantum-computi.html':'/hardtech-weekly-2026-06-21-zh/items/01-uss-big-bet-on-quantum-computi',
  '/hardtech-weekly-2026-06-21-zh/items/02-2-billion-chips-act-investment.html':'/hardtech-weekly-2026-06-21-zh/items/02-2-billion-chips-act-investment',
  '/hardtech-weekly-2026-06-21-zh/items/03-doubling-down-controversial-cl.html':'/hardtech-weekly-2026-06-21-zh/items/03-doubling-down-controversial-cl',
  '/hardtech-weekly-2026-06-21-zh/items/25-world-first-imec-presents-quan.html':'/hardtech-weekly-2026-06-21-zh/items/25-world-first-imec-presents-quan',
  '/hardtech-weekly-2026-06-21-zh/items/26-key-chemistry-question-answere.html':'/hardtech-weekly-2026-06-21-zh/items/26-key-chemistry-question-answere',
  '/hardtech-weekly-2026-06-21-zh/items/27-99c1c1e7-1a1c-479c-9fc8-e21aea.html':'/hardtech-weekly-2026-06-21-zh/items/27-99c1c1e7-1a1c-479c-9fc8-e21aea',
  '/hardtech-weekly-2026-06-21-zh/items/28-pnas-2523350123.html':'/hardtech-weekly-2026-06-21-zh/items/28-pnas-2523350123',
  '/hardtech-weekly-2026-06-21-zh/items/29-www-fusionsimulator-io.html':'/hardtech-weekly-2026-06-21-zh/items/29-www-fusionsimulator-io',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-16363.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-16363',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-16434.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-16434',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-16764.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-16764',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17195.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17195',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17237.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17237',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17375.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17375',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17565.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17565',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17656.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17656',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17733.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17733',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17741.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17741',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17807.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-17807',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18028.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18028',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18029.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18029',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18140.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18140',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18145.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18145',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18161.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18161',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18167.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18167',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18169.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18169',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18188.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18188',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18202.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18202',
  '/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18240.html':'/hardtech-weekly-2026-06-21-zh/items/arxiv-2606-18240',
  '/hardtech/':'/hardtech/2026-09-25',
  '/hardtech/2026-06-17.html':'/hardtech/2026-06-17',
  '/hardtech/2026-06-22.html':'/hardtech/2026-06-22',
  '/hardtech/2026-06-24.html':'/hardtech/2026-06-24',
  '/hardtech/2026-06-26.html':'/hardtech/2026-06-26',
  '/hardtech/2026-06-27.html':'/hardtech/2026-06-27',
  '/hardtech/2026-06-28.html':'/hardtech/2026-06-28',
  '/hardtech/2026-07-01.html':'/hardtech/2026-07-01',
  '/hardtech/2026-07-02.html':'/hardtech/2026-07-02',
  '/hardtech/2026-07-04.html':'/hardtech/2026-07-04',
  '/hardtech/2026-07-05.html':'/hardtech/2026-07-05',
  '/hardtech/2026-07-06.html':'/hardtech/2026-07-06',
  '/hardtech/2026-07-07.html':'/hardtech/2026-07-07',
  '/hardtech/2026-07-08.html':'/hardtech/2026-07-08',
  '/hardtech/2026-07-09-zh.html':'/hardtech/2026-07-09-zh',
  '/hardtech/2026-07-09.html':'/hardtech/2026-07-09',
  '/hardtech/2026-07-10.html':'/hardtech/2026-07-10',
  '/hardtech/2026-07-11.html':'/hardtech/2026-07-11',
  '/hardtech/2026-07-12.html':'/hardtech/2026-07-12',
  '/hardtech/2026-07-13.html':'/hardtech/2026-07-13',
  '/hardtech/2026-07-14.html':'/hardtech/2026-07-14',
  '/hardtech/2026-07-15.html':'/hardtech/2026-07-15',
  '/hardtech/2026-07-16.html':'/hardtech/2026-07-16',
  '/hardtech/2026-07-17.html':'/hardtech/2026-07-17',
  '/hardtech/2026-07-18.html':'/hardtech/2026-07-18',
  '/hardtech/2026-07-19.html':'/hardtech/2026-07-19',
  '/hardtech/2026-07-20.html':'/hardtech/2026-07-20',
  '/hardtech/2026-07-21.html':'/hardtech/2026-07-21',
  '/hardtech/2026-07-22.html':'/hardtech/2026-07-22',
  '/hardtech/2026-07-23.html':'/hardtech/2026-07-23',
  '/hardtech/2026-07-24.html':'/hardtech/2026-07-24',
  '/hardtech/2026-07-25.html':'/hardtech/2026-07-25',
  '/hardtech/2026-07-26.html':'/hardtech/2026-07-26',
  '/hardtech/2026-07-27.html':'/hardtech/2026-07-27',
  '/hardtech/2026-07-28.html':'/hardtech/2026-07-28',
  '/hardtech/2026-07-29.html':'/hardtech/2026-07-29',
  '/hardtech/2026-07-30.html':'/hardtech/2026-07-30',
  '/hardtech/2026-07-31.html':'/hardtech/2026-07-31',
  '/hardtech/2026-08-01.html':'/hardtech/2026-08-01',
  '/hardtech/2026-08-02.html':'/hardtech/2026-08-02',
  '/hardtech/2026-08-04.html':'/hardtech/2026-08-04',
  '/hardtech/2026-08-05.html':'/hardtech/2026-08-05',
  '/hardtech/2026-08-06.html':'/hardtech/2026-08-06',
  '/hardtech/2026-08-07.html':'/hardtech/2026-08-07',
  '/hardtech/2026-08-08.html':'/hardtech/2026-08-08',
  '/hardtech/2026-08-09.html':'/hardtech/2026-08-09',
  '/hardtech/2026-08-10.html':'/hardtech/2026-08-10',
  '/hardtech/2026-08-11.html':'/hardtech/2026-08-11',
  '/hardtech/2026-08-12.html':'/hardtech/2026-08-12',
  '/hardtech/2026-08-13.html':'/hardtech/2026-08-13',
  '/hardtech/2026-08-14.html':'/hardtech/2026-08-14',
  '/hardtech/2026-08-15.html':'/hardtech/2026-08-15',
  '/hardtech/2026-08-16.html':'/hardtech/2026-08-16',
  '/hardtech/2026-08-17.html':'/hardtech/2026-08-17',
  '/hardtech/2026-08-18.html':'/hardtech/2026-08-18',
  '/hardtech/2026-08-19.html':'/hardtech/2026-08-19',
  '/hardtech/2026-08-21.html':'/hardtech/2026-08-21',
  '/hardtech/2026-08-22.html':'/hardtech/2026-08-22',
  '/hardtech/2026-08-23.html':'/hardtech/2026-08-23',
  '/hardtech/2026-08-24.html':'/hardtech/2026-08-24',
  '/hardtech/2026-08-26.html':'/hardtech/2026-08-26',
  '/hardtech/2026-08-29.html':'/hardtech/2026-08-29',
  '/hardtech/2026-08-30.html':'/hardtech/2026-08-30',
  '/hardtech/2026-08-31.html':'/hardtech/2026-08-31',
  '/hardtech/2026-09-01.html':'/hardtech/2026-09-01',
  '/hardtech/2026-09-02.html':'/hardtech/2026-09-02',
  '/hardtech/2026-09-03.html':'/hardtech/2026-09-03',
  '/hardtech/2026-09-04.html':'/hardtech/2026-09-04',
  '/hardtech/2026-09-05.html':'/hardtech/2026-09-05',
  '/hardtech/2026-09-06.html':'/hardtech/2026-09-06',
  '/hardtech/2026-09-07.html':'/hardtech/2026-09-07',
  '/hardtech/2026-09-11.html':'/hardtech/2026-09-11',
  '/hardtech/2026-09-12.html':'/hardtech/2026-09-12',
  '/hardtech/2026-09-13.html':'/hardtech/2026-09-13',
  '/hardtech/2026-09-14.html':'/hardtech/2026-09-14',
  '/hardtech/2026-09-15.html':'/hardtech/2026-09-15',
  '/hardtech/2026-09-16.html':'/hardtech/2026-09-16',
  '/hardtech/2026-09-17.html':'/hardtech/2026-09-17',
  '/hardtech/2026-09-19.html':'/hardtech/2026-09-19',
  '/hardtech/2026-09-20.html':'/hardtech/2026-09-20',
  '/hardtech/2026-09-21.html':'/hardtech/2026-09-21',
  '/hardtech/2026-09-22.html':'/hardtech/2026-09-22',
  '/hardtech/2026-09-23.html':'/hardtech/2026-09-23',
  '/hardtech/2026-09-24.html':'/hardtech/2026-09-24',
  '/hardtech/2026-09-25.html':'/hardtech/2026-09-25',
  '/hardtech/index.html':'/hardtech/2026-09-25',
  '/hardtech/weekly/2026-06-17.html':'/hardtech/weekly/2026-06-17',
  '/hardtech/weekly/2026-06-21.html':'/hardtech/weekly/2026-06-21',
  '/hardtech/weekly/2026-06-28.html':'/hardtech/weekly/2026-06-28',
  '/hardtech/weekly/2026-07-05.html':'/hardtech/weekly/2026-07-05',
  '/hardtech/weekly/2026-07-12.html':'/hardtech/weekly/2026-07-12',
  '/hardtech/weekly/2026-07-26.html':'/hardtech/weekly/2026-07-26',
  '/hardtech/weekly/2026-08-02.html':'/hardtech/weekly/2026-08-02',
  '/hardtech/weekly/2026-08-09.html':'/hardtech/weekly/2026-08-09',
  '/hardtech/weekly/2026-08-16.html':'/hardtech/weekly/2026-08-16',
  '/hardtech/weekly/2026-08-23.html':'/hardtech/weekly/2026-08-23',
  '/hardtech/weekly/2026-08-30.html':'/hardtech/weekly/2026-08-30',
  '/hardtech/weekly/2026-09-06.html':'/hardtech/weekly/2026-09-06',
  '/hardtech/weekly/2026-09-13.html':'/hardtech/weekly/2026-09-13',
  '/hardtech/weekly/2026-09-20.html':'/hardtech/weekly/2026-09-20',
  '/hermes-agent-mixture-of-agents-davidondrej-2026-06-29.html':'/hermes-agent-mixture-of-agents-davidondrej-2026-06-29',
  '/hermes-skill-catalog.html':'/hermes-skill-catalog',
  '/horror-authors/horror-authors.html':'/horror-authors/horror-authors',
  '/horror-media/horror-media.html':'/horror-media/horror-media',
  '/human-curated-content-landscape-2026-07-13.html':'/human-curated-content-landscape-2026-07-13',
  '/hybrid-llm-routing.html':'/hybrid-llm-routing',
  '/index.html':'/',
  '/indydevdan-m5-mlx-local-stack.html':'/indydevdan-m5-mlx-local-stack',
  '/insect-learning-platforms-2026.html':'/insect-learning-platforms-2026',
  '/investor':'/',
  '/investor.html':'/',
  '/jensen-huang-lex-fridman-494.html':'/jensen-huang-lex-fridman-494',
  '/julian-agentic-os-distilled-v2-2026-07-06.html':'/julian-agentic-os-distilled-v2-2026-07-06',
  '/julian-agentic-os-distilled.html':'/julian-agentic-os-distilled',
  '/k1-agent-native-knowledge-orchestration.html':'/k1-agent-native-knowledge-orchestration',
  '/kimi-k3-moonshot-2-8tb-moe-2026-07-29.html':'/kimi-k3-moonshot-2-8tb-moe-2026-07-29',
  '/kimi-k3-moonshot-2-8tb-moe-2026-07-29/dashboard':'/kimi-k3-moonshot-2-8tb-moe-2026-07-29',
  '/kimi-k3-moonshot-2-8tb-moe-2026-07-29/dashboard.html':'/kimi-k3-moonshot-2-8tb-moe-2026-07-29',
  '/kimi-k3-moonshot-2-8tb-moe-2026-07-29/dead-end-note-self-host.html':'/kimi-k3-moonshot-2-8tb-moe-2026-07-29/dead-end-note-self-host',
  '/latin-american-authors/latin-american-authors.html':'/latin-american-authors/latin-american-authors',
  '/lighthouse-history.html':'/lighthouse-history',
  '/literary-bridge':'/literary-bridge/',
  '/literary-bridge/index.html':'/literary-bridge/',
  '/livermore-brothers-silicon-valley-girl-2026-07-18':'/daily-reports/livermore-brothers-silicon-valley-girl-2026-07-18',
  '/livermore-brothers-silicon-valley-girl-2026-07-18.html':'/daily-reports/livermore-brothers-silicon-valley-girl-2026-07-18',
  '/llm-salon':'/llm-salon/',
  '/llm-salon/index.html':'/llm-salon/',
  '/llm-wiki/daily-reports/gpt56-sol-vs-fable5-nate-herk-2026-07-10.html':'/llm-wiki/daily-reports/gpt56-sol-vs-fable5-nate-herk-2026-07-10',
  '/local-ai-summit-2026-opening-panel-2026-07-14.html':'/local-ai-summit-2026-opening-panel-2026-07-14',
  '/marketing-2026-07-14':'/patrick-marketing-plan-2026-07-14',
  '/marketing-2026-07-14.html':'/patrick-marketing-plan-2026-07-14',
  '/matt-pocock-skills.html':'/matt-pocock-skills',
  '/matt-wolfe-selling-knowledge-bases-2026-07-20.html':'/matt-wolfe-selling-knowledge-bases-2026-07-20',
  '/memgraph-rag-outperforms-every-rag-2026-06-03.html':'/memgraph-rag-outperforms-every-rag-2026-06-03',
  '/microsoft-build-2025-keynote.html':'/microsoft-build-2025-keynote',
  '/mo-gawdat-ai-future-warning-cn.html':'/mo-gawdat-ai-future-warning-cn',
  '/mo-gawdat-ai-future-warning.html':'/mo-gawdat-ai-future-warning',
  '/model-routing.html':'/model-routing',
  '/mystery-authors/mystery-authors.html':'/mystery-authors/mystery-authors',
  '/mystery-media/mystery-media.html':'/mystery-media/mystery-media',
  '/nate-herk-stop-ai.html':'/nate-herk-stop-ai',
  '/neo-labs':'/neo-labs/',
  '/neo-labs-divergence-archive.html':'/neo-labs-divergence-archive',
  '/neo-labs-divergence-trend.html':'/neo-labs-divergence-trend',
  '/neo-labs-papers-latest.html':'/neo-labs-papers-latest',
  '/neo-labs-rss-weekly.html':'/neo-labs-rss-weekly',
  '/neo-labs/compare':'/neo-labs/compare/',
  '/neo-labs/compare/index.html':'/neo-labs/compare/',
  '/neo-labs/download':'/neo-labs/download/',
  '/neo-labs/download/index.html':'/neo-labs/download/',
  '/neo-labs/index.html':'/neo-labs/',
  '/neo-labs/investors':'/neo-labs/investors/',
  '/neo-labs/investors/index.html':'/neo-labs/investors/',
  '/neo-labs/labs':'/neo-labs/labs/',
  '/neo-labs/labs/ami-labs':'/neo-labs/labs/ami-labs/',
  '/neo-labs/labs/ami-labs/index.html':'/neo-labs/labs/ami-labs/',
  '/neo-labs/labs/apptronik':'/neo-labs/labs/apptronik/',
  '/neo-labs/labs/apptronik/index.html':'/neo-labs/labs/apptronik/',
  '/neo-labs/labs/boltz':'/neo-labs/labs/boltz/',
  '/neo-labs/labs/boltz/index.html':'/neo-labs/labs/boltz/',
  '/neo-labs/labs/dmodel-ai':'/neo-labs/labs/dmodel-ai/',
  '/neo-labs/labs/dmodel-ai/index.html':'/neo-labs/labs/dmodel-ai/',
  '/neo-labs/labs/earendil-labs':'/neo-labs/labs/earendil-labs/',
  '/neo-labs/labs/earendil-labs/index.html':'/neo-labs/labs/earendil-labs/',
  '/neo-labs/labs/edison-scientific':'/neo-labs/labs/edison-scientific/',
  '/neo-labs/labs/edison-scientific/index.html':'/neo-labs/labs/edison-scientific/',
  '/neo-labs/labs/figure-ai':'/neo-labs/labs/figure-ai/',
  '/neo-labs/labs/figure-ai/index.html':'/neo-labs/labs/figure-ai/',
  '/neo-labs/labs/general-intuition':'/neo-labs/labs/general-intuition/',
  '/neo-labs/labs/general-intuition/index.html':'/neo-labs/labs/general-intuition/',
  '/neo-labs/labs/google-deepmind':'/neo-labs/labs/google-deepmind/',
  '/neo-labs/labs/google-deepmind/index.html':'/neo-labs/labs/google-deepmind/',
  '/neo-labs/labs/inception-labs':'/neo-labs/labs/inception-labs/',
  '/neo-labs/labs/inception-labs/index.html':'/neo-labs/labs/inception-labs/',
  '/neo-labs/labs/index.html':'/neo-labs/labs/',
  '/neo-labs/labs/latent-labs':'/neo-labs/labs/latent-labs/',
  '/neo-labs/labs/latent-labs/index.html':'/neo-labs/labs/latent-labs/',
  '/neo-labs/labs/lila-sciences':'/neo-labs/labs/lila-sciences/',
  '/neo-labs/labs/lila-sciences/index.html':'/neo-labs/labs/lila-sciences/',
  '/neo-labs/labs/living-models':'/neo-labs/labs/living-models/',
  '/neo-labs/labs/living-models/index.html':'/neo-labs/labs/living-models/',
  '/neo-labs/labs/merge-labs':'/neo-labs/labs/merge-labs/',
  '/neo-labs/labs/merge-labs/index.html':'/neo-labs/labs/merge-labs/',
  '/neo-labs/labs/mirendil':'/neo-labs/labs/mirendil/',
  '/neo-labs/labs/mirendil/index.html':'/neo-labs/labs/mirendil/',
  '/neo-labs/labs/modal-labs':'/neo-labs/labs/modal-labs/',
  '/neo-labs/labs/modal-labs/index.html':'/neo-labs/labs/modal-labs/',
  '/neo-labs/labs/openai':'/neo-labs/labs/openai/',
  '/neo-labs/labs/openai/index.html':'/neo-labs/labs/openai/',
  '/neo-labs/labs/periodic-labs':'/neo-labs/labs/periodic-labs/',
  '/neo-labs/labs/periodic-labs/index.html':'/neo-labs/labs/periodic-labs/',
  '/neo-labs/labs/physical-intelligence':'/neo-labs/labs/physical-intelligence/',
  '/neo-labs/labs/physical-intelligence/index.html':'/neo-labs/labs/physical-intelligence/',
  '/neo-labs/labs/project-prometheus':'/neo-labs/labs/project-prometheus/',
  '/neo-labs/labs/project-prometheus/index.html':'/neo-labs/labs/project-prometheus/',
  '/neo-labs/labs/ricursive-intelligence':'/neo-labs/labs/ricursive-intelligence/',
  '/neo-labs/labs/ricursive-intelligence/index.html':'/neo-labs/labs/ricursive-intelligence/',
  '/neo-labs/labs/skild-ai':'/neo-labs/labs/skild-ai/',
  '/neo-labs/labs/skild-ai/index.html':'/neo-labs/labs/skild-ai/',
  '/neo-labs/labs/ssi':'/neo-labs/labs/ssi/',
  '/neo-labs/labs/ssi/index.html':'/neo-labs/labs/ssi/',
  '/neo-labs/labs/thinking-machines':'/neo-labs/labs/thinking-machines/',
  '/neo-labs/labs/thinking-machines/index.html':'/neo-labs/labs/thinking-machines/',
  '/neo-labs/labs/world-labs':'/neo-labs/labs/world-labs/',
  '/neo-labs/labs/world-labs/index.html':'/neo-labs/labs/world-labs/',
  '/neo-labs/portfolio':'/neo-labs/portfolio/',
  '/neo-labs/portfolio-heatmap':'/neo-labs/portfolio-heatmap/',
  '/neo-labs/portfolio-heatmap/index.html':'/neo-labs/portfolio-heatmap/',
  '/neo-labs/portfolio/index.html':'/neo-labs/portfolio/',
  '/neo-labs/quarterly':'/neo-labs/quarterly/',
  '/neo-labs/quarterly/index.html':'/neo-labs/quarterly/',
  '/neo-labs/team':'/neo-labs/team/',
  '/neo-labs/team/index.html':'/neo-labs/team/',
  '/neo-labs/watchlist':'/neo-labs/watchlist/',
  '/neo-labs/watchlist/index.html':'/neo-labs/watchlist/',
  '/nick-saraev-3-months-dashboard.html':'/nick-saraev-3-months-dashboard',
  '/nick-saraev-3-videos-deep-dive-2026-06-13.html':'/nick-saraev-3-videos-deep-dive-2026-06-13',
  '/nonfiction-authors/nonfiction-authors.html':'/nonfiction-authors/nonfiction-authors',
  '/notebooklm-ai-agent-2026-06-09.html':'/notebooklm-ai-agent-2026-06-09',
  '/notebooklm-update-crosslink-dashboard-2026-06-29.html':'/notebooklm-update-crosslink-dashboard-2026-06-29',
  '/notebooklm-update-dashboard-2026-06-29.html':'/notebooklm-update-dashboard-2026-06-29',
  '/notebooklm-update-summary-2026-06-29.html':'/notebooklm-update-summary-2026-06-29',
  '/notes':'/notes/',
  '/notes/001.html':'/notes/001',
  '/notes/index.html':'/notes/',
  '/nq100-backtest-dashboard-v2':'/nq100-backtest-dashboard',
  '/nq100-backtest-dashboard-v2.html':'/nq100-backtest-dashboard',
  '/nq100-backtest-dashboard.html':'/nq100-backtest-dashboard',
  '/nq100-dashboard-v2':'/nq100-dashboard',
  '/nq100-dashboard-v2.html':'/nq100-dashboard',
  '/nq100-dashboard.html':'/nq100-dashboard',
  '/nq100-top10-dashboard-v2':'/nq100-top10-dashboard',
  '/nq100-top10-dashboard-v2.html':'/nq100-top10-dashboard',
  '/nq100-top10-dashboard.html':'/nq100-top10-dashboard',
  '/nq100-top30-dashboard-v2':'/nq100-top30-dashboard',
  '/nq100-top30-dashboard-v2.html':'/nq100-top30-dashboard',
  '/nq100-top30-dashboard.html':'/nq100-top30-dashboard',
  '/nq100-ultimate-dashboard-v3.html':'/nq100-ultimate-dashboard-v3',
  '/nvidia-not-loser-abandoning-personal-computer-gamers-nexus.html':'/nvidia-not-loser-abandoning-personal-computer-gamers-nexus',
  '/og-agentic-os.html':'/og-agentic-os',
  '/open-design-yihui-2026-06-11.html':'/open-design-yihui-2026-06-11',
  '/open-notebooklm':'/open-notebooklm/',
  '/open-notebooklm/index.html':'/open-notebooklm/',
  '/open-notebooklm/l4_dashboard.html':'/open-notebooklm/l4_dashboard',
  '/openclaw-wic-vincent-cotch-2026-07-21':'/daily-reports/openclaw-wic-vincent-cotch-2026-07-21-dashboard',
  '/openclaw-wic-vincent-cotch-2026-07-21.html':'/daily-reports/openclaw-wic-vincent-cotch-2026-07-21-dashboard',
  '/openswarm':'/openswarm/_old_root_index',
  '/openswarm/':'/openswarm/_old_root_index',
  '/openswarm/_old_root_index.html':'/openswarm/_old_root_index',
  '/openswarm/index.html':'/openswarm/_old_root_index',
  '/orbital-console':'/orbital-console/',
  '/orbital-console-v2.html':'/orbital-console-v2',
  '/orbital-console.html':'/orbital-console',
  '/orbital-console/index.html':'/orbital-console/',
  '/papers-claude-code-dynamic-workflows.html':'/papers-claude-code-dynamic-workflows',
  '/papers-enactive-ai.html':'/papers-enactive-ai',
  '/papers-hermes-agent-6-use-cases':'/dashboard',
  '/papers-hermes-agent-6-use-cases.html':'/dashboard',
  '/papers-task-decomposition.html':'/papers-task-decomposition',
  '/papers-wwdc26-24h-dashboard':'/apple-developer-wwdc26-24h',
  '/papers-wwdc26-24h-dashboard.html':'/apple-developer-wwdc26-24h',
  '/particle-dynamics-model-real-world.html':'/particle-dynamics-model-real-world',
  '/pat-investment-thesis-2026-06-13.html':'/pat-investment-thesis-2026-06-13',
  '/patrick-marketing-plan-2026-07-14.html':'/patrick-marketing-plan-2026-07-14',
  '/personal-opportunity-decoder':'/personal-opportunity-decoder/',
  '/personal-opportunity-decoder/index.html':'/personal-opportunity-decoder/',
  '/personal-opportunity-decoder/inspect-data.html':'/personal-opportunity-decoder/inspect-data',
  '/personal-opportunity-decoder/recruit.html':'/personal-opportunity-decoder/recruit',
  '/personal-opportunity-decoder/try.html':'/personal-opportunity-decoder/try',
  '/philosophy-salon':'/philosophy-salon/',
  '/philosophy-salon/index.html':'/philosophy-salon/',
  '/pil-world-chunk-wise-world-model-vla-evaluation.html':'/pil-world-chunk-wise-world-model-vla-evaluation',
  '/pitch.html':'/pitch',
  '/plan-e-deep-dive-v2':'/plan-e-deep-dive',
  '/plan-e-deep-dive-v2.html':'/plan-e-deep-dive',
  '/plan-e-deep-dive.html':'/plan-e-deep-dive',
  '/race-aware-4-source-synthesis-2026-07-14':'/race-aware-4-source-synthesis-2026-07-14/',
  '/race-aware-4-source-synthesis-2026-07-14/index.html':'/race-aware-4-source-synthesis-2026-07-14/',
  '/race-aware-5-source-synthesis-2026-07-29':'/race-aware-5-source-synthesis-2026-07-29/',
  '/race-aware-5-source-synthesis-2026-07-29/index.html':'/race-aware-5-source-synthesis-2026-07-29/',
  '/recursive-self-improvement-companies.html':'/recursive-self-improvement-companies',
  '/robots-need-more-than-vla-and-world-models-2606.html':'/robots-need-more-than-vla-and-world-models-2606',
  '/rocket-launch-db':'/rocket-launch-db/',
  '/rocket-launch-db-live':'/rocket-launch-db-live/',
  '/rocket-launch-db-live/index.html':'/rocket-launch-db-live/',
  '/rocket-launch-db/diagnose.html':'/rocket-launch-db/diagnose',
  '/rocket-launch-db/index.html':'/rocket-launch-db/',
  '/rocket-launch-db/space-access':'/rocket-launch-db/space-access/',
  '/rocket-launch-db/space-access/index.html':'/rocket-launch-db/space-access/',
  '/rocket-launch-db/upcoming.html':'/rocket-launch-db/upcoming',
  '/rockets':'/rocket-launch-db/',
  '/rockets/index.html':'/rocket-launch-db/',
  '/router-bench-2026-06-11-v2':'/router-bench-2026-06-11',
  '/router-bench-2026-06-11-v2.html':'/router-bench-2026-06-11',
  '/router-bench-2026-06-11.html':'/router-bench-2026-06-11',
  '/router-bench-2026-06-12.html':'/router-bench-2026-06-12',
  '/router-bench-2026-06-14.html':'/router-bench-2026-06-14',
  '/sam-altman-stanford-cs183.html':'/sam-altman-stanford-cs183',
  '/sandeep-swadia-the-mitmonk.html':'/sandeep-swadia-the-mitmonk',
  '/satellite-education-app/dashboard.html':'/satellite-education-app/dashboard',
  '/satellite-education-app/mvp.html':'/satellite-education-app/mvp',
  '/satellites':'/satellites/',
  '/satellites/index.html':'/satellites/',
  '/sci-fi-authors/sci-fi-authors.html':'/sci-fi-authors/sci-fi-authors',
  '/sci-fi-media/sci-fi-media.html':'/sci-fi-media/sci-fi-media',
  '/self-harness-optimization.html':'/self-harness-optimization',
  '/sequoia-ai-ascent-2026-keynote.html':'/sequoia-ai-ascent-2026-keynote',
  '/skill-goldmine-dashboard-2026-06-11.html':'/skill-goldmine-dashboard-2026-06-11',
  '/spacex-ipo-analysis-2026-06-12.html':'/spacex-ipo-analysis-2026-06-12',
  '/spacex-ipo-investor-guide-2026-06-12.html':'/spacex-ipo-investor-guide-2026-06-12',
  '/steelseries-arctis-nova-pro-vs-omni-vs-elite.html':'/steelseries-arctis-nova-pro-vs-omni-vs-elite',
  '/steelseries-nova-pro-omni-elite-2review.html':'/steelseries-nova-pro-omni-elite-2review',
  '/steelseries-nova-pro-omni-elite-3review-zh.html':'/steelseries-nova-pro-omni-elite-3review-zh',
  '/steelseries-nova-pro-omni-elite-3review.html':'/steelseries-nova-pro-omni-elite-3review',
  '/steelseries-nova-pro-omni-elite-4review-zh.html':'/steelseries-nova-pro-omni-elite-4review-zh',
  '/systems-thinking-4-systems.html':'/systems-thinking-4-systems',
  '/techwithtim-local-agentic-coding.html':'/techwithtim-local-agentic-coding',
  '/think-quest.html':'/think-quest',
  '/trip-planner-template.html':'/trip-planner-template',
  '/trust.html':'/trust',
  '/video-dashboard.html':'/video-dashboard',
  '/video-nathan-lambert-china-2026-07-03.html':'/video-nathan-lambert-china-2026-07-03',
  '/war-authors/war-authors.html':'/war-authors/war-authors',
  '/weekly-router-bench-2026-06-12.html':'/weekly-router-bench-2026-06-12',
  '/weekly-router-bench-2026-06-14.html':'/weekly-router-bench-2026-06-14',
  '/wla-world-language-action-model-2606.html':'/wla-world-language-action-model-2606',
  '/world-model-2026-06-12.html':'/world-model-2026-06-12',
  '/world-models-meet-language-models-2606.html':'/world-models-meet-language-models-2606',
  '/worldmonitor/live-channels.html':'/worldmonitor/live-channels',
  '/worldmonitor/satellite-ops':'/worldmonitor/satellite-ops/',
  '/worldmonitor/satellite-ops/index.html':'/worldmonitor/satellite-ops/',
  '/worldmonitor/settings.html':'/worldmonitor/settings',
  '/worldmonitor/wm-widget-sandbox.html':'/worldmonitor/wm-widget-sandbox',
  '/wwdc2026-debate-ak-peng-lin-yunfei-laodai.html':'/wwdc2026-debate-ak-peng-lin-yunfei-laodai',
  '/wwdc26-keynote-summary':'/wwdc26-summary',
  '/wwdc26-keynote-summary.html':'/wwdc26-summary',
  '/wwdc26-meet-with-apple':'/wwdc26-meet-with-apple/',
  '/wwdc26-meet-with-apple/index.html':'/wwdc26-meet-with-apple/',
  '/wwdc26-summary.html':'/wwdc26-summary',
  '/wwdc26_ml_group_lab_cn.html':'/wwdc26_ml_group_lab_cn',
  '/wwdc26_mlx_summary.html':'/wwdc26_mlx_summary',
  '/xjb-gear.html':'/xjb-gear',
  '/xjb-public.html':'/xjb-public',
  '/xreal-eye-field-guide':'/xreal-eye-field-guide/',
  '/xreal-eye-field-guide/index.html':'/xreal-eye-field-guide/',
  '/yc-ai-native-company.html':'/yc-ai-native-company',
  '/youtube':'/youtube/',
  '/youtube/2026-06-23-7-loops-matthew-berman.html':'/youtube/2026-06-23-7-loops-matthew-berman',
  '/youtube/2026-06-23-ai-first-playbook-do-teams-work-2026-peter-yang':'/daily-reports/ai-first-playbook-peter-yang-dashboard',
  '/youtube/2026-06-23-ai-first-playbook-do-teams-work-2026-peter-yang.html':'/daily-reports/ai-first-playbook-peter-yang-dashboard',
  '/youtube/2026-06-23-airtable-ceo-top-1-percent-ai-howie-liu':'/daily-reports/airtable-ceo-top-1-percent-ai-howie-liu-dashboard',
  '/youtube/2026-06-23-airtable-ceo-top-1-percent-ai-howie-liu.html':'/daily-reports/airtable-ceo-top-1-percent-ai-howie-liu-dashboard',
  '/youtube/2026-06-23-anthropic-completely-fcked-moon.html':'/youtube/2026-06-23-anthropic-completely-fcked-moon',
  '/youtube/2026-06-23-claude-code-ue5-stefan-3d-ai.html':'/youtube/2026-06-23-claude-code-ue5-stefan-3d-ai',
  '/youtube/2026-06-23-claude-containment-stack-11-rules.html':'/youtube/2026-06-23-claude-containment-stack-11-rules',
  '/youtube/2026-06-23-datacamp-ai-engineer-review.html':'/youtube/2026-06-23-datacamp-ai-engineer-review',
  '/youtube/2026-06-23-deepseek-solved-billion-dollar-problem-2mp.html':'/youtube/2026-06-23-deepseek-solved-billion-dollar-problem-2mp',
  '/youtube/2026-06-23-domain-experts-winning-yc-lightcone.html':'/youtube/2026-06-23-domain-experts-winning-yc-lightcone',
  '/youtube/2026-06-23-fei-fei-li-godmother-ai-10-years.html':'/youtube/2026-06-23-fei-fei-li-godmother-ai-10-years',
  '/youtube/2026-06-23-glm-5-2-vs-opus-4-8-vs-gpt-5-5.html':'/youtube/2026-06-23-glm-5-2-vs-opus-4-8-vs-gpt-5-5',
  '/youtube/2026-06-23-google-io-2026-the-line.html':'/youtube/2026-06-23-google-io-2026-the-line',
  '/youtube/2026-06-23-hybrid-llm-routing.html':'/youtube/2026-06-23-hybrid-llm-routing',
  '/youtube/2026-06-23-indydevdan-m5-mlx-local-stack.html':'/youtube/2026-06-23-indydevdan-m5-mlx-local-stack',
  '/youtube/2026-06-23-k1-agent-native-knowledge-orchestration.html':'/youtube/2026-06-23-k1-agent-native-knowledge-orchestration',
  '/youtube/2026-06-23-l8-principal-agentic-engineering-workflow':'/daily-reports/l8-principal-agentic-engineering-workflow-dashboard',
  '/youtube/2026-06-23-l8-principal-agentic-engineering-workflow.html':'/daily-reports/l8-principal-agentic-engineering-workflow-dashboard',
  '/youtube/2026-06-23-linux-foundation-ai-cto-china-open-source.html':'/youtube/2026-06-23-linux-foundation-ai-cto-china-open-source',
  '/youtube/2026-06-23-looped-world-model-1b-ai-discover':'/daily-reports/looped-world-model-1b-ai-discover-dashboard',
  '/youtube/2026-06-23-looped-world-model-1b-ai-discover.html':'/daily-reports/looped-world-model-1b-ai-discover-dashboard',
  '/youtube/2026-06-23-matt-pocock-skills-130k-stars.html':'/youtube/2026-06-23-matt-pocock-skills-130k-stars',
  '/youtube/2026-06-23-nate-herk-stop-ai.html':'/youtube/2026-06-23-nate-herk-stop-ai',
  '/youtube/2026-06-23-notebooklm-2-0.html':'/youtube/2026-06-23-notebooklm-2-0',
  '/youtube/2026-06-23-openai-fde-40-billion-silicon-valley-101':'/daily-reports/openai-fde-40-billion-silicon-valley-101-dashboard',
  '/youtube/2026-06-23-openai-fde-40-billion-silicon-valley-101.html':'/daily-reports/openai-fde-40-billion-silicon-valley-101-dashboard',
  '/youtube/2026-06-23-openclaw-on-steroids-multi-agent-latent.html':'/youtube/2026-06-23-openclaw-on-steroids-multi-agent-latent',
  '/youtube/2026-06-23-opensquilla-metaskill-skill-2-0.html':'/youtube/2026-06-23-opensquilla-metaskill-skill-2-0',
  '/youtube/2026-06-23-sam-altman-stanford-cs183.html':'/youtube/2026-06-23-sam-altman-stanford-cs183',
  '/youtube/2026-06-23-self-harness-optimization.html':'/youtube/2026-06-23-self-harness-optimization',
  '/youtube/2026-06-23-stop-prompting-start-looping-julian-goldie.html':'/youtube/2026-06-23-stop-prompting-start-looping-julian-goldie',
  '/youtube/2026-06-23-systems-thinking-4-systems.html':'/youtube/2026-06-23-systems-thinking-4-systems',
  '/youtube/2026-06-25-ooda-loop-infinite-brain-ai-impact':'/daily-reports/ooda-loop-infinite-brain-ai-impact-dashboard',
  '/youtube/2026-06-25-ooda-loop-infinite-brain-ai-impact.html':'/daily-reports/ooda-loop-infinite-brain-ai-impact-dashboard',
  '/youtube/2026-06-25-sensor-tower-state-of-ai-2026.html':'/youtube/2026-06-25-sensor-tower-state-of-ai-2026',
  '/youtube/2026-06-25-task-decomposition-agentic-workflow':'/daily-reports/task-decomposition-agentic-workflow-dashboard',
  '/youtube/2026-06-25-task-decomposition-agentic-workflow.html':'/daily-reports/task-decomposition-agentic-workflow-dashboard',
  '/youtube/2026-06-25-techwithtim-local-agentic-coding.html':'/youtube/2026-06-25-techwithtim-local-agentic-coding',
  '/youtube/2026-06-25-ui-design-2026-trends.html':'/youtube/2026-06-25-ui-design-2026-trends',
  '/youtube/2026-06-25-wwdc26-apple-developer-24h':'/daily-reports/wwdc26-apple-developer-24h-dashboard',
  '/youtube/2026-06-25-wwdc26-apple-developer-24h.html':'/daily-reports/wwdc26-apple-developer-24h-dashboard',
  '/youtube/2026-06-25-zai-glm-5-2-open-source-1':'/daily-reports/zai-glm-5-2-open-source-1-dashboard',
  '/youtube/2026-06-25-zai-glm-5-2-open-source-1.html':'/daily-reports/zai-glm-5-2-open-source-1-dashboard',
  '/youtube/2026-06-26-7-loops-matthew-berman':'/youtube/2026-06-23-7-loops-matthew-berman',
  '/youtube/2026-06-26-7-loops-matthew-berman.html':'/youtube/2026-06-23-7-loops-matthew-berman',
  '/youtube/2026-06-26-mac-gaming-2026':'/daily-reports/mac-gaming-2026-dashboard',
  '/youtube/2026-06-26-mac-gaming-2026.html':'/daily-reports/mac-gaming-2026-dashboard',
  '/youtube/2026-06-26-tristan-harris-agi.html':'/youtube/2026-06-26-tristan-harris-agi',
  '/youtube/2026-06-27-all-in-2026-06-27':'/daily-reports/all-in-mamdani-china-ai-2026-06-27-dashboard',
  '/youtube/2026-06-27-all-in-2026-06-27.html':'/daily-reports/all-in-mamdani-china-ai-2026-06-27-dashboard',
  '/youtube/2026-06-27-extraction-shooter-map-design.html':'/youtube/2026-06-27-extraction-shooter-map-design',
  '/youtube/2026-06-27-ornith-1-0-self-scaffolding':'/daily-reports/ornith-1-0-self-scaffolding-dashboard',
  '/youtube/2026-06-27-ornith-1-0-self-scaffolding.html':'/daily-reports/ornith-1-0-self-scaffolding-dashboard',
  '/youtube/2026-06-27-time100-ai-scientist-the-next-era-of-ai-has-alread.html':'/youtube/2026-06-27-time100-ai-scientist-the-next-era-of-ai-has-alread',
  '/youtube/2026-06-29-a16z-new-media-jun-2026':'/daily-reports/a16z-new-media-2026-round-9-dashboard',
  '/youtube/2026-06-29-a16z-new-media-jun-2026.html':'/daily-reports/a16z-new-media-2026-round-9-dashboard',
  '/youtube/2026-06-29-ai-search-jul-2026':'/ai-search-jul-2026-dashboard',
  '/youtube/2026-06-29-ai-search-jul-2026.html':'/ai-search-jul-2026-dashboard',
  '/youtube/2026-06-29-zack-sierra-jun-2026':'/zack-sierra-jun-2026-dashboard',
  '/youtube/2026-06-29-zack-sierra-jun-2026.html':'/zack-sierra-jun-2026-dashboard',
  '/youtube/2026-07-01-40ikbH0Ba-g':'/40ikbH0Ba-g-dashboard',
  '/youtube/2026-07-01-40ikbH0Ba-g.html':'/40ikbH0Ba-g-dashboard',
  '/youtube/2026-07-01-SW3HzRV2Ztg':'/daily-reports/sw3hzrv2ztg-dashboard',
  '/youtube/2026-07-01-SW3HzRV2Ztg.html':'/daily-reports/sw3hzrv2ztg-dashboard',
  '/youtube/2026-07-02-extraction-shooter-map-design':'/extraction-shooter-map-design-dashboard',
  '/youtube/2026-07-02-extraction-shooter-map-design.html':'/extraction-shooter-map-design-dashboard',
  '/youtube/2026-07-12-claude-code-nate-herk-2026-07-12':'/daily-reports/claude-code-nate-herk-2026-07-12-dashboard',
  '/youtube/2026-07-12-claude-code-nate-herk-2026-07-12.html':'/daily-reports/claude-code-nate-herk-2026-07-12-dashboard',
  '/youtube/2026-07-13-kokotajlo-ai-2027-diary-of-ceo-2026-07-13.html':'/youtube/2026-07-13-kokotajlo-ai-2027-diary-of-ceo-2026-07-13',
  '/youtube/2026-07-14-starship-critical-path-2026-07-14.html':'/youtube/2026-07-14-starship-critical-path-2026-07-14',
  '/youtube/2026-07-14-theaigrid-google-deepmind-agi-asi-timeline-2026-07-14':'/daily-reports/theaigrid-google-deepmind-agi-asi-timeline-2026-07-14-dashboard',
  '/youtube/2026-07-14-theaigrid-google-deepmind-agi-asi-timeline-2026-07-14.html':'/daily-reports/theaigrid-google-deepmind-agi-asi-timeline-2026-07-14-dashboard',
  '/youtube/2026-07-14-tristan-harris-agi-existential-risk-neural-nutshell':'/daily-reports/tristan-harris-agi-existential-risk-neural-nutshell-dashboard',
  '/youtube/2026-07-14-tristan-harris-agi-existential-risk-neural-nutshell.html':'/daily-reports/tristan-harris-agi-existential-risk-neural-nutshell-dashboard',
  '/youtube/2026-07-14-when-millions-of-ai-agents-meet-deepmind-tomasev':'/daily-reports/when-millions-of-ai-agents-meet-deepmind-tomasev-dashboard',
  '/youtube/2026-07-14-when-millions-of-ai-agents-meet-deepmind-tomasev.html':'/daily-reports/when-millions-of-ai-agents-meet-deepmind-tomasev-dashboard',
  '/youtube/2026-07-19-paste-this-into-claude-token-limit.html':'/youtube/2026-07-19-paste-this-into-claude-token-limit',
  '/youtube/2026-07-29-elon-economist':'/daily-reports/2026-07-29-elon-economist-race-aware-5-source-dashboard',
  '/youtube/2026-07-29-elon-economist.html':'/daily-reports/2026-07-29-elon-economist-race-aware-5-source-dashboard',
  '/youtube/2026-07-29-ilya-ssi-nvidia':'/daily-reports/2026-07-29-ilya-ssi-nvidia-race-aware-6-source-dashboard',
  '/youtube/2026-07-29-ilya-ssi-nvidia.html':'/daily-reports/2026-07-29-ilya-ssi-nvidia-race-aware-6-source-dashboard',
  '/youtube/index.html':'/youtube/',
  '/zack-sierra-jun-2026-dashboard.html':'/zack-sierra-jun-2026-dashboard',
  '/数学练习-题目与图形.html':'/数学练习-题目与图形',
  '/新疆自驾环线-全攻略-公开版.html':'/新疆自驾环线-全攻略-公开版',
  '/视频库':'/视频库/',
  '/视频库/day_recommend.html':'/视频库/day_recommend',
  '/视频库/index.html':'/视频库/',
  '/视频库/live_info.html':'/视频库/live_info',
  '/视频库/obsidian-index.html':'/视频库/obsidian-index',
  '/视频库/video_01.html':'/视频库/video_01',
  '/视频库/video_02.html':'/视频库/video_02',
  '/视频库/video_03.html':'/视频库/video_03',
  '/视频库/video_04.html':'/视频库/video_04',
  '/视频库/video_05.html':'/视频库/video_05',
  '/视频库/video_06.html':'/视频库/video_06',
  '/视频库/video_07.html':'/视频库/video_07',
  '/视频库/video_08.html':'/视频库/video_08',
  '/视频库/video_09.html':'/视频库/video_09',
  '/视频库/video_10.html':'/视频库/video_10',
  '/视频库/video_11.html':'/视频库/video_11',
  '/视频库/video_12.html':'/视频库/video_12',
  '/视频库/video_13.html':'/视频库/video_13',
  '/视频库/video_14.html':'/视频库/video_14',
  '/视频库/video_15.html':'/视频库/video_15',
  '/视频库/video_16.html':'/视频库/video_16',
  '/视频库/video_17.html':'/视频库/video_17',
  '/视频库/video_18.html':'/视频库/video_18',
  '/视频库/video_19.html':'/视频库/video_19',
  '/视频库/video_20.html':'/视频库/video_20',
  '/视频库/video_21.html':'/视频库/video_21',
  '/视频库/video_22.html':'/视频库/video_22',
  '/视频库/video_23.html':'/视频库/video_23',
  '/视频库/video_24.html':'/视频库/video_24',
  '/视频库/video_25.html':'/视频库/video_25',
  '/视频库/video_26.html':'/视频库/video_26',
  '/视频库/video_27.html':'/视频库/video_27',
  '/视频库/video_28.html':'/视频库/video_28',
  '/视频库/video_29.html':'/视频库/video_29',
  '/视频库/video_30.html':'/视频库/video_30',
  '/视频库/video_31.html':'/视频库/video_31',
  '/视频库/xjb_overview_map.html':'/视频库/xjb_overview_map'
};

// THU-5: Explicit route redirects for rocket launch and daily-reports canonicalization
const EXPLICIT_REDIRECTS = {
  '/rockets': '/rocket-launch-db/',
  '/rockets/': '/rocket-launch-db/',
  '/rockets/index': '/rocket-launch-db/',
  '/rockets/index.html': '/rocket-launch-db/',
  '/rocket-launch-db': '/rocket-launch-db/',
  '/rocket-launch-db/index': '/rocket-launch-db/',
  '/rocket-launch-db/index.html': '/rocket-launch-db/',
  '/daily-reports/': '/daily-reports',
  '/daily-reports/index': '/daily-reports',
  '/daily-reports/index.html': '/daily-reports',
};

// THU-5: Helper to build redirect URL preserving query strings
function buildRedirectUrl(target, url) {
  const dest = new URL(target, url);
  dest.search = url.search;
  return dest.toString();
}


import { handleAiFrontierLive } from "./ai-frontier-live.js";

const PRIVATE_TOP_LEVEL_PATHS = new Set([
  "2017zyl-staging",
  "agent-tasks",
  "archive",
  "d1-migrations",
  "diag2",
  "diag3",
  "handoff",
  "research-log",
  "scripts",
  "state",
  "workers-push",
]);

const PRIVATE_PATH_SEGMENTS = new Set([
  ".git",
  ".github",
  ".idea",
  ".vscode",
  ".wrangler",
  "__pycache__",
  "node_modules",
  "scripts",
  "tests",
  "_build",
]);

const PRIVATE_FILENAMES = new Set([
  "_worker.js",
  "_headers",
  "_redirects",
  "_routes.json",
  "ai-frontier-live.js",
  "umami-reverse-proxy.js",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
  "tsconfig.json",
  "jsconfig.json",
  "dockerfile",
  "makefile",
]);

const PRIVATE_EXACT_PATHS = new Set([
  "2017zyl-daily-reports-1-day-with-hermes-agent-2026-07-12.pdf",
  "diary-dashboard-2026-06-10",
  "diary-dashboard-2026-06-10.html",
  "exp18_ibkr_setup",
  "exp18_ibkr_setup.html",
  "exp18_ibkr_setup.md",
  "gcp2-roadmap-dashboard",
  "gcp2-roadmap-dashboard.html",
  "patrick-handbook-2026-06-11",
  "patrick-handbook-2026-06-11.html",
  "patrick-timeline-2026-06-13",
  "patrick-timeline-2026-06-13.html",
  "quarterly",
  "quarterly.html",
  "research-log-dashboard-2026-06-09",
  "research-log-dashboard-2026-06-09.html",
]);

const PAUSED_WRITE_API_PATHS = new Set([
  "/api/salon",
  "/api/salon/agent",
  "/api/llm-salon/v1/chat",
  "/api/llm-salon/v1/chat/batch",
  "/api/llm-salon/v1/chat/diss",
  "/api/feedback",
]);

const PAUSED_INTERNAL_READ_API_PATHS = new Set([
  "/api/ticker",
  "/api/jobs",
  "/api/design",
]);

const PUBLIC_DOCUMENT_PATHS = new Set([
  "worldmonitor/openapi.yaml",
  "worldmonitor/pricing.md",
  "worldmonitor/.well-known/agent-skills/fetch-country-brief/skill.md",
  "worldmonitor/.well-known/agent-skills/fetch-resilience-score/skill.md",
]);

const SOURCE_FILE_RE = /\.(?:py|pyc|pyo|sh|bash|zsh|fish|rb|pl|php|sql|ts|tsx|jsx|mjs|cjs|map|md|markdown|ya?ml)$/i;
const LOG_FILE_RE = /\.(?:log|out|err|trace)(?:[.-].*)?$/i;
const BACKUP_FILE_RE = /(?:~|(?:\.|_)(?:bak\d*|backup|old|orig|rej|save|swp|swo|tmp|temp)(?:[.-].*)?)$/i;
const BUILD_CONFIG_RE = /^(?:vite|next|eslint|postcss|tailwind)\.config\.(?:js|cjs|mjs|ts)$/i;
const OPERATIONS_PAGE_RE = /^(?:mission-control(?:-ticker|-v5-public)?|system-status|system-health-archive|cron-(?:config|snapshot)-.+|status-.+|hermesmac-status-.+|push-test|skills-audit-report)(?:\.html)?$/i;

function shouldDenyPublicPath(rawPath) {
  let decoded = rawPath;
  try {
    for (let i = 0; i < 3; i += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return true;
  }

  if (/%[0-9a-f]{2}/i.test(decoded) || /[\\\0]/.test(decoded)) return true;

  const parts = decoded
    .normalize("NFKC")
    .replace(/\/{2,}/g, "/")
    .split("/")
    .filter(Boolean)
    .map((part) => part.toLowerCase());

  if (parts.some((part) => part === "." || part === "..")) return true;
  if (parts.some((part) => part.startsWith(".") && part !== ".well-known")) return true;
  if (PRIVATE_TOP_LEVEL_PATHS.has(parts[0])) return true;
  if (parts.some((part) => PRIVATE_PATH_SEGMENTS.has(part))) return true;
  if (parts[0] === "open-notebooklm" && parts[1] === "data") return true;
  if (parts[0] === "dashboard-v3" && parts[1] === "pets") return true;
  if (parts[0] === "neo-labs" && parts[1] === "v3-snapshot") return true;
  if (parts[0] === "neo-labs" && parts[1] === "_next" && parts[2] !== "static") return true;
  if (parts.some((part, index) => part === "_next" && ["cache", "server", "types"].includes(parts[index + 1]))) return true;

  const file = parts[parts.length - 1] || "";
  const pathWithoutLeadingSlash = parts.join("/");
  return PRIVATE_EXACT_PATHS.has(pathWithoutLeadingSlash)
    || PRIVATE_FILENAMES.has(file)
    || OPERATIONS_PAGE_RE.test(file)
    || BUILD_CONFIG_RE.test(file)
    || (SOURCE_FILE_RE.test(file) && !PUBLIC_DOCUMENT_PATHS.has(pathWithoutLeadingSlash))
    || LOG_FILE_RE.test(file)
    || BACKUP_FILE_RE.test(file);
}

function privateNotFound(method) {
  return new Response(method === "HEAD" ? null : "Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function temporarilyUnavailable() {
  return new Response(JSON.stringify({
    error: "temporarily_unavailable",
    message: "This write endpoint is paused while abuse protection is being upgraded.",
  }), {
    status: 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "86400",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    let path = url.pathname;

    if (shouldDenyPublicPath(path)) return privateNotFound(request.method);

    if (request.method === "POST" && PAUSED_WRITE_API_PATHS.has(path)) {
      return temporarilyUnavailable();
    }

    if (request.method !== "OPTIONS" && PAUSED_INTERNAL_READ_API_PATHS.has(path)) {
      return temporarilyUnavailable();
    }

    // === CORS preflight (POST /api/salon) ===
    if (request.method === "OPTIONS" && path.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    if (path === "/api/ai-frontier-live" && request.method === "GET") {
      return handleAiFrontierLive(request, env, context);
    }

    // === API routes (07-04 + 07-06 + 07-09 NEW) ===
    if (path === "/api/ticker" || path === "/api/jobs" || path === "/api/design") {
      return handleApi(path, url, env, request);
    }

    // === POST /api/salon — Grad 2: 1-shot LLM JSON output (legacy) ===
    if (path === "/api/salon" && request.method === "POST") {
      return handleSalonApi(request, env);
    }

    // === POST /api/salon/agent — Grad 3: multi-turn multi-agent debate ===
    if (path === "/api/salon/agent" && request.method === "POST") {
      return handleSalonAgentApi(request, env);
    }

    // === /api/llm-salon/* — Mirror local proxy at 127.0.0.1:9876 (07-12 NEW) ===
    // Lets /llm-salon/ page reach the API same-origin instead of trying to call localhost.
    if (path.startsWith("/api/llm-salon")) {
      return handleLlmSalonApi(request, env);
    }

    // === POST /api/feedback — daily-reports chip → email (07-14 NEW) ===
    // Sends chip score (+ optional text from modal) to patrick.l.zeng@outlook.com
    // via the Cloudflare Email Service REST API.
    // Required env secrets: CF_API_TOKEN (Account level, Email Sending:Edit + Email Sending:Read).
    // Required zone setup: `wrangler email sending enable 2017zyl.xyz` (one-shot terminal).
    if (path === "/api/feedback" && request.method === "POST") {
      return handleFeedbackApi(request, env);
    }

    const archiveRepair = await repairDailyReportArchivePath(path, url, env, request);
    if (archiveRepair) return archiveRepair;

    // THU-5: Explicit route redirects (rocket launch, daily-reports canonical)
    const explicitTarget = EXPLICIT_REDIRECTS[path];
    if (explicitTarget) {
      return Response.redirect(buildRedirectUrl(explicitTarget, url), 308);
    }

    // THU-5: Canonical alias redirects from canonical-aliases.json
    const aliasTarget = CANONICAL_REDIRECTS[path];
    if (aliasTarget) {
      return Response.redirect(buildRedirectUrl(aliasTarget, url), 308);
    }

    // /<name>.html → /<name>  (308 Permanent Redirect)
    if (path.endsWith('.html') && path !== '/index.html') {
      return Response.redirect(new URL(path.slice(0, -5), url).toString(), 308);
    }
    // 路径无 .html → 尝试加 .html 找 ASSETS (如 /day_recommend → day_recommend.html)
    let resp = await env.ASSETS.fetch(request);
    if (resp.status === 404) {
      const tryHtml = path.endsWith('/') ? path + 'index.html' : path + '.html';
      const tryReq = new Request(new URL(tryHtml, url).toString(), request);
      const tryResp = await env.ASSETS.fetch(tryReq);
      if (tryResp.ok) {
        // Serve the matching HTML asset at the clean extensionless URL.
        return tryResp;
      }
    }
    return resp;
  },
};

async function repairDailyReportArchivePath(path, url, env, request) {
  if (!path.startsWith("/daily-reports/")) return null;

  const original = await env.ASSETS.fetch(request);
  if (original.ok) return null;

  const suffix = path.slice("/daily-reports/".length);
  const candidates = [];

  if (suffix.startsWith("daily-reports/")) {
    candidates.push("/" + suffix);
  }
  candidates.push("/" + suffix);

  for (const candidate of candidates) {
    if (!candidate || candidate === path) continue;
    const candidateUrl = new URL(candidate, url);
    const candidateReq = new Request(candidateUrl.toString(), request);
    const candidateResp = await env.ASSETS.fetch(candidateReq);
    if (candidateResp.ok) {
      const cleanPath = candidate.endsWith("/index.html")
        ? candidate.slice(0, -"index.html".length)
        : candidate;

      return Response.redirect(buildRedirectUrl(cleanPath || "/", url), 308);
    }
  }

  return null;
}


// === POST /api/salon/agent implementation (07-09 NEW, Grad 3) ===
// Multi-turn multi-agent philosophy debate.
// Each persona = 1 independent LLM agent with its own system prompt and history.
// Server runs a 4-round dialogue loop:
//   Round 0: 1 moderator LLM call (Socrates preferred) opens the discussion.
//   Round 1: 6 persona LLM calls in parallel (Promise.all), each sees Round 0 + the topic.
//   Round 2: 5 persona LLM calls in parallel (moderator excluded), each sees Rounds 0+1 + their own Round 1.
//   Round 3: 1 moderator summary + 1 closing speaker LLM call.
//
// Frontend POSTs {topic, persona_ids?: [...]} (default = top 6 scored by quick local heuristic).
// Returns the full structured debate JSON.
async function handleSalonAgentApi(request, env) {
  const cors = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: `invalid JSON body: ${e.message}` }), { status: 400, headers: cors });
  }
  const topic = (body.topic || "").trim();
  let personaIds = Array.isArray(body.persona_ids) ? body.persona_ids.slice(0, 6) : null;
  if (!topic) return new Response(JSON.stringify({ error: "topic is required" }), { status: 400, headers: cors });
  if (personaIds && (personaIds.length < 2 || personaIds.length > 6)) {
    return new Response(JSON.stringify({ error: "persona_ids length must be 2-6" }), { status: 400, headers: cors });
  }

  const apiKey = env.MINIMAX_TOKEN || env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "no LLM key" }), { status: 500, headers: cors });
  const isMinimax = apiKey.startsWith("sk-cp-") || !!env.MINIMAX_TOKEN;
  const apiUrl = isMinimax ? "https://api.minimax.io/anthropic/v1/messages" : "https://api.anthropic.com/v1/messages";
  const authHeaders = isMinimax ? { "authorization": `Bearer ${apiKey}` } : { "x-api-key": apiKey };

  // Load agent profiles from ASSETS
  let allProfiles = [];
  try {
    const r = await env.ASSETS.fetch(new URL("/philosophy-salon/agent-profiles.json", new URL(request.url)));
    if (!r.ok) throw new Error(`ASSETS ${r.status}`);
    allProfiles = await r.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: `cannot load agent-profiles.json: ${e.message}` }), { status: 502, headers: cors });
  }
  const byId = new Map(allProfiles.map(p => [p.id, p]));

  // Pick panel
  let panel = [];
  if (personaIds) {
    panel = personaIds.map(id => byId.get(id)).filter(Boolean);
  }
  if (panel.length < 3) {
    // Default: top 6 of a curated "famous philosophers" starter set
    const defaultIds = ["socrates", "plato", "aristotle", "confucius", "laozi", "kant"];
    panel = defaultIds.map(id => byId.get(id)).filter(Boolean);
  }
  if (panel.length < 3) {
    return new Response(JSON.stringify({ error: "not enough agents available" }), { status: 500, headers: cors });
  }
  // Moderator: prefer Socrates, else first panelist
  let moderator = panel.find(p => p.id === "socrates") || panel[0];
  let speakers = panel.filter(p => p.id !== moderator.id);

  // === One LLM call helper ===
  async function llmCall(systemPrompt, userMsg, maxTokens = 350) {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", ...authHeaders },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "(no body)");
      throw new Error(`llm ${resp.status}: ${errText.slice(0, 300)}`);
    }
    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    return text;
  }

  // === Round 0: moderator opens ===
  // Moderator system prompt: a tight 3-line system for the moderator role
  const modSystemPrompt = `你是一位 2500 年哲学史的资深主持人。你的工作是简短地为圆桌辩论定调:提出核心张力、设定讨论边界、并明确 3-4 位需要被追问的发言者。不要总结、不要讲大道理,只点燃话题。

风格:开场白应像一位召集学者聚会的长者,具体而克制,150-250 字。`;
  const modUser = `议题:"${topic}"\n圆桌 panel(${panel.length} 位,按以下顺序):${panel.map(p => `${p.id}(${(p.identity || '').split('(')[0].trim()})`).join('、')}\n请生成一段开场白,1 段,150-250 字。`;

  let modText;
  try {
    modText = await llmCall(modSystemPrompt, modUser, 400);
  } catch (e) {
    return new Response(JSON.stringify({ error: `round 0 (moderator) failed: ${e.message}` }), { status: 502, headers: cors });
  }

  // === Round 1: 6 personas respond in parallel ===
  // Each agent's user msg = topic + Round 0 moderator text
  const round1UserFor = (p) => `议题:"${topic}"\n\n主持人开场:\n${modText}\n\n请发表你自己的第一轮立场(1-3 段,150-300 字,中文优先)。记住你是 ${p.id},请用你自己的声音。`;

  // === Round 2: 5 personas respond to Round 1 in parallel ===
  // Each agent's user msg = topic + Round 0 + Round 1 (all 6) + their own Round 1
  const round2UserFor = (p, r1All, r1Mine) => {
    const others = r1All.filter(s => s.id !== p.id);
    const r1Block = others.map(s => `【${s.name}】\n${s.text}`).join("\n\n");
    return `议题:"${topic}"\n\n你上轮说:\n${r1Mine.text}\n\n其他人上轮说:\n${r1Block}\n\n现在请回应(反驳/追问/补充)上面至少一位发言者。1-3 段,150-300 字,中文优先,语气你自己的。`;
  };

  // === Round 3: moderator summary + closing speaker ===
  const closingSpeaker = speakers[0];  // first non-moderator

  // === Run the loop ===
  // Round 1: parallel calls
  let r1Results;
  try {
    r1Results = await Promise.all(speakers.map(async (p) => {
      try {
        const text = await llmCall(p.voice_system_prompt, round1UserFor(p), 350);
        return { id: p.id, name: p.identity.split('(')[0].trim(), text, error: null };
      } catch (e) {
        return { id: p.id, name: p.identity.split('(')[0].trim(), text: `(本轮失败: ${e.message.slice(0, 80)})`, error: e.message };
      }
    }));
  } catch (e) {
    return new Response(JSON.stringify({ error: `round 1 parallel failed: ${e.message}` }), { status: 502, headers: cors });
  }

  // Round 2: parallel calls (skip moderator)
  let r2Results;
  try {
    r2Results = await Promise.all(speakers.map(async (p) => {
      const r1Mine = r1Results.find(s => s.id === p.id);
      if (!r1Mine || r1Mine.error) {
        return { id: p.id, name: p.identity.split('(')[0].trim(), text: `(跳过: Round 1 失败)`, error: r1Mine ? r1Mine.error : 'no r1' };
      }
      try {
        const text = await llmCall(p.voice_system_prompt, round2UserFor(p, r1Results, r1Mine), 350);
        return { id: p.id, name: p.identity.split('(')[0].trim(), text, error: null };
      } catch (e) {
        return { id: p.id, name: p.identity.split('(')[0].trim(), text: `(本轮失败: ${e.message.slice(0, 80)})`, error: e.message };
      }
    }));
  } catch (e) {
    return new Response(JSON.stringify({ error: `round 2 parallel failed: ${e.message}` }), { status: 502, headers: cors });
  }

  // Round 3: moderator summary + closing speaker
  const r1Block = r1Results.map(s => `【${s.name}】\n${s.text}`).join("\n\n");
  const r2Block = r2Results.map(s => `【${s.name}】\n${s.text}`).join("\n\n");
  const r3SummaryUser = `议题:"${topic}"\n\n第 1 轮发言:\n${r1Block}\n\n第 2 轮发言:\n${r2Block}\n\n现在请做 1 段总结,200-350 字,指出最尖锐的分歧(指明 1-2 位具体人物名字)+ 共识范围 + 仍有待回答的问题。`;

  const r3ClosingUser = `议题:"${topic}"\n\n前两轮你已经说了:\n${r1Results.find(s => s.id === closingSpeaker.id)?.text || ''}\n\n其他人也回应了。请做收束性的终辩发言(1 段,150-300 字),用你自己的声音,说说你现在认为什么是最重要且最被忽视的。`;

  let modSummary, closingText;
  try {
    [modSummary, closingText] = await Promise.all([
      llmCall(modSystemPrompt, r3SummaryUser, 450),
      llmCall(closingSpeaker.voice_system_prompt, r3ClosingUser, 350),
    ]);
  } catch (e) {
    return new Response(JSON.stringify({ error: `round 3 failed: ${e.message}` }), { status: 502, headers: cors });
  }

  // Build the debate script in front-end's expected shape
  const rounds = [
    {
      title: "第 0 轮 · 主持人开场",
      speeches: [{ type: "moderator", speaker_idx: 0, text: modText }],
    },
    {
      title: "第 1 轮 · 立场陈述",
      speeches: r1Results.map((r, i) => ({
        type: "speech",
        speaker_idx: i + 1,  // +1 because moderator is 0
        text: r.text,
        // Embed speaker info for the front-end post-processor
        speaker: { id: r.id, name_zh: r.name, name_en: r.name },
        // No quote; just free text
      })),
    },
    {
      title: "第 2 轮 · 交叉质询",
      speeches: r2Results.map((r, i) => ({
        type: "speech",
        speaker_idx: i + 1,
        text: r.text,
        speaker: { id: r.id, name_zh: r.name, name_en: r.name },
      })),
    },
    {
      title: "第 3 轮 · 总结与终辩",
      speeches: [
        { type: "moderator_close", speaker_idx: 0, text: modSummary, speaker: { id: moderator.id, name_zh: moderator.identity.split('(')[0].trim() } },
        { type: "final", speaker_idx: panel.findIndex(p => p.id === closingSpeaker.id), text: closingText, speaker: { id: closingSpeaker.id, name_zh: closingSpeaker.identity.split('(')[0].trim() }, is_closing: true },
      ],
    },
  ];

  return new Response(JSON.stringify({
    rounds,
    panel: panel.map(p => ({ id: p.id, name_zh: p.identity.split('(')[0].trim() })),
    moderator: { id: moderator.id, name_zh: moderator.identity.split('(')[0].trim() },
    model: "claude-sonnet-4-5",
    provider: isMinimax ? "minimax (Anthropic-compatible)" : "anthropic",
    grad: 3,
    fetched_at: new Date().toISOString(),
  }), { headers: cors });
}


// === POST /api/salon implementation (07-09 NEW, Grad 2 legacy) ===
// LLM-driven 3-round philosophy debate.
// Frontend POSTs {topic, personas:[{id, name_zh, name_en, era, tradition, school,
//   core_theses[], counter_patterns[], quotes:[{zh, en, source_zh, source_en}]}],
// worker calls Claude API to generate moderator opening + 6 opening positions
// + 5 cross-examinations + closing summary + final word. Returns JSON.
async function handleSalonApi(request, env) {
  const cors = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: `invalid JSON body: ${e.message}` }), {
      status: 400, headers: cors,
    });
  }
  const topic = (body.topic || "").trim();
  const personas = Array.isArray(body.personas) ? body.personas : [];
  if (!topic) {
    return new Response(JSON.stringify({ error: "topic is required" }), {
      status: 400, headers: cors,
    });
  }
  if (personas.length < 2 || personas.length > 8) {
    return new Response(JSON.stringify({ error: "personas length must be 2-8" }), {
      status: 400, headers: cors,
    });
  }

  // Check secret
  const apiKey = env.MINIMAX_TOKEN || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "MINIMAX_TOKEN not configured" }), {
      status: 500, headers: cors,
    });
  }

  // Use minimax (Anthropic-compatible) endpoint if token looks like OAuth bearer
  // (sk-cp-...); otherwise default to api.anthropic.com
  const isMinimax = apiKey.startsWith("sk-cp-") || !!env.MINIMAX_TOKEN;
  const apiUrl = isMinimax
    ? "https://api.minimax.io/anthropic/v1/messages"
    : "https://api.anthropic.com/v1/messages";
  const authHeaders = isMinimax
    ? { "authorization": `Bearer ${apiKey}` }
    : { "x-api-key": apiKey };

  // Build the prompt
  const personasBlock = personas.map((p, i) => {
    const theses = (p.core_theses || []).slice(0, 5).join(" / ");
    const counter = (p.counter_patterns || []).slice(0, 3).join(" / ");
    const sampleQuote = (p.quotes && p.quotes[0]) ? `${p.quotes[0].zh} — ${p.quotes[0].source_zh}` : "(无 quote 样本)";
    // CRITICAL: bind idx to persona name explicitly so model doesn't swap them
    return `【persona_idx=${i}】 姓名: ${p.name_zh} (${p.name_en})
    朝代/学派: ${p.era} · ${p.tradition} / ${p.school}
    核心立场: ${theses || "(无)"}
    常见反驳: ${counter || "(无)"}
    代表语录: ${sampleQuote}`;
  }).join("\n\n");

  const systemPrompt = `你是一位 2500 年哲学史的圆桌辩论主持人。任务:组织以下 ${personas.length} 位思想家就用户提出的议题进行 **3 轮对话**(实际是 4 轮包括 0 轮主持人开场 + 3 轮发言)。

## 关键约束 (FAIL = 无效输出):
1. **persona_idx 是绝对身份**:每个发言的 speaker_idx 必须填对应该说话的人的下标。绝不允许混淆 — 0 号位的人说 0 号位的立场,绝不能用 0 号位的 quote 套到 1 号位的 thesis 上。
2. **每段 quote 必须从该 speaker_idx 对应 persona 的 quotes 列表中选一条真实的 quote**,把 quote_zh / quote_en / source_zh / source_en 都填上(若 quotes 列表为空,方可生成符合该人物风格的 quote 并在 source 字段标注 [合成语录])。
3. **不要把 quote 错配人物**。如果 persona_idx=0 是苏格拉底,他的 quote 必须是苏格拉底的 quote,不能是康德的。
4. **counter 字段(Round 2)必须真有锋芒**,不是客套,要能引发实际辩论。

## 输出 Schema (严格 JSON,不要任何 markdown 包裹):
{
  "rounds": [
    {
      "title": "第 0 轮 · 主持人开场",
      "speeches": [
        { "type": "moderator", "speaker_idx": <int>, "text": "<string>" }
      ]
    },
    {
      "title": "第 1 轮 · 立场陈述",
      "speeches": [
        { "type": "speech", "speaker_idx": <int>, "thesis": "<string 1 句,直接陈述自己的核心立场,不'回应他人'>", "quote_zh": "<从该 persona quotes 选>", "quote_en": "<英译>", "source_zh": "<出处>", "source_en": "<英译出处>" }
      ]
    },
    {
      "title": "第 2 轮 · 交叉质询",
      "speeches": [
        { "type": "speech", "speaker_idx": <int>, "target_idx": <int 不同人!>, "counter": "<真锋芒的反方论调>", "thesis": "<自己的立场重申/延伸>", "quote_zh": "<从该 speaker quotes 选>", "quote_en": "<英译>", "source_zh": "<出处>", "source_en": "<英译出处>" }
      ]
    },
    {
      "title": "第 3 轮 · 总结与终辩",
      "speeches": [
        { "type": "moderator_close", "speaker_idx": <int 同 0 轮主持人>, "text": "<总结前 3 轮,指出最尖锐分歧 + 共识范围,引用 1-2 位具体 speaker 名字>" },
        { "type": "final", "speaker_idx": <int 不同于主持人>, "thesis": "<收束立场>", "quote_zh": "<从该 persona quotes 选>", "quote_en": "<英译>", "source_zh": "<出处>", "source_en": "<英译出处>" }
      ]
    }
  ]
}

## Round 数量 + speech 数量:
- Round 0: 1 个 moderator speech。
- Round 1: ${personas.length} 个 speech,每人 1 个。
- Round 2: ${personas.length - 1} 个 speech,主持人除外。target_idx 不能 speaker_idx == target_idx。
- Round 3: 1 个 moderator_close + 1 个 final。

## 风格要求:
- 中文表达自然有锋芒,不要 AI 八股。
- 反方发言 (counter) 必须有锋芒,要能引发实际辩论,不能是客套。
- 整段输出一次成型,不要解释,不要 markdown 包裹,只输出 JSON。`;

  const userPrompt = `议题: "${topic}"

圆桌 panel (${personas.length} 位,按以下顺序):
${personasBlock}

请生成 3 轮辩论 JSON。`;

  // Call Claude API (or minimax Anthropic-compatible endpoint)
  let apiResp;
  try {
    apiResp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        ...authHeaders,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `anthropic fetch failed: ${e.message}` }), {
      status: 502, headers: cors,
    });
  }

  if (!apiResp.ok) {
    const errText = await apiResp.text().catch(() => "(no body)");
    return new Response(JSON.stringify({ error: `anthropic ${apiResp.status}: ${errText.slice(0, 500)}` }), {
      status: apiResp.status, headers: cors,
    });
  }

  const apiData = await apiResp.json();
  // Extract text from content blocks
  const text = (apiData.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
  if (!text) {
    return new Response(JSON.stringify({ error: "anthropic returned no text" }), {
      status: 502, headers: cors,
    });
  }

  // Parse Claude's JSON response — strip any markdown fencing
  let debateScript;
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/```\s*$/, "");
    }
    debateScript = JSON.parse(cleaned);
  } catch (e) {
    return new Response(JSON.stringify({
      error: `LLM did not return valid JSON: ${e.message}`,
      raw: text.slice(0, 2000),
    }), {
      status: 502, headers: cors,
    });
  }

  // Map speaker_idx back to persona id + augment with front-end fields
  try {
    for (const round of (debateScript.rounds || [])) {
      for (const sp of (round.speeches || [])) {
        if (typeof sp.speaker_idx === "number" && personas[sp.speaker_idx]) {
          sp.speaker = personas[sp.speaker_idx];
        }
        if (typeof sp.target_idx === "number" && personas[sp.target_idx]) {
          sp.target = personas[sp.target_idx];
        }
        // Normalize quote shape: front-end expects {zh, en, source_zh, source_en}
        if (sp.quote_zh) {
          sp.quote = {
            zh: sp.quote_zh,
            en: sp.quote_en || "",
            source_zh: sp.source_zh || "",
            source_en: sp.source_en || "",
            tags: [],
          };
        }
        if (sp.is_closing === undefined && sp.type === "final") sp.is_closing = true;
      }
    }
  } catch (e) {
    // non-fatal
  }

  return new Response(JSON.stringify({
    rounds: debateScript.rounds || [],
    model: "claude-sonnet-4-5",
    provider: isMinimax ? "minimax (Anthropic-compatible)" : "anthropic",
    fetched_at: new Date().toISOString(),
  }), { headers: cors });
}


// === /api/ticker + /api/jobs implementation ===
async function handleApi(path, url, env, request) {
  const cors = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };
  // Read jsonl via ASSETS binding
  let text;
  try {
    const r = await env.ASSETS.fetch(new URL("/agent-tasks/agent-tasks.jsonl", url));
    if (!r.ok) throw new Error(`ASSETS fetch ${r.status}`);
    text = await r.text();
  } catch (e) {
    return new Response(JSON.stringify({ error: `cannot read jsonl: ${e.message}` }), {
      status: 502,
      headers: cors,
    });
  }

  if (path === "/api/ticker") {
    const sinceParam = url.searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam).getTime() : 0;
    const events = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const t = new Date(row.started_at).getTime();
      if (t <= since) continue;
      const isErr = row.status !== "done" || (row.error && row.error.length > 0);
      let msg = "";
      if (row.metrics) {
        const parts = [];
        for (const [k, v] of Object.entries(row.metrics)) {
          if (typeof v === "number" && v > 0) parts.push(`${k}=${v}`);
        }
        if (parts.length) msg = parts.join(" · ");
      }
      if (row.error) {
        const errShort = String(row.error).split("\n")[0].slice(0, 80);
        msg = msg ? `${msg} · ${errShort}` : errShort;
      }
      if (!msg) msg = `${row.status} · ${row.latency_ms}ms`;
      events.push({ t: row.started_at, src: row.task_name, st: isErr ? "error" : "ok", msg });
    }
    events.sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime());
    return new Response(JSON.stringify({ events, fetched_at: new Date().toISOString() }), { headers: cors });
  }

  if (path === "/api/jobs") {
    const byName = new Map();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const cur = byName.get(row.task_name) || {
        task_name: row.task_name,
        runs: 0,
        errors: 0,
        last_run_at: null,
        last_status: null,
      };
      cur.runs += 1;
      if (row.status !== "done" || (row.error && row.error.length > 0)) cur.errors += 1;
      if (!cur.last_run_at || row.started_at > cur.last_run_at) {
        cur.last_run_at = row.started_at;
        cur.last_status = row.status;
      }
      byName.set(row.task_name, cur);
    }
    const jobs = Array.from(byName.values()).sort(
      (a, b) => new Date(b.last_run_at).getTime() - new Date(a.last_run_at).getTime(),
    );
    return new Response(
      JSON.stringify({
        jobs,
        source: "agent-tasks.jsonl",
        note: "subset of full cron registry — only publish-tasks captured here",
        fetched_at: new Date().toISOString(),
      }),
      { headers: cors },
    );
  }

  // === /api/design implementation (07-06 NEW) ===
  // Reads state/html-design-library.json from ASSETS, computes aggregate stats + lists fails.
  if (path === "/api/design") {
    let designText;
    try {
      const r = await env.ASSETS.fetch(new URL("/state/html-design-library.json", url));
      if (!r.ok) throw new Error(`ASSETS fetch ${r.status}`);
      designText = await r.text();
    } catch (e) {
      return new Response(JSON.stringify({ error: `cannot read design state: ${e.message}` }), {
        status: 502,
        headers: cors,
      });
    }
    let state;
    try { state = JSON.parse(designText); } catch (e) {
      return new Response(JSON.stringify({ error: `design state parse: ${e.message}` }), {
        status: 502,
        headers: cors,
      });
    }
    const sites = state.sites || {};
    const stats = { pass: 0, shell: 0, wall: 0, tld: 0, network: 0, fail: 0 };
    const fails = [];
    const networkBlocked = [];
    for (const [name, s] of Object.entries(sites)) {
      const st = s.status || "UNKNOWN";
      if (st === "PASS") stats.pass++;
      else if (st === "PASS-SHELL") stats.shell++;
      else if (st === "CF-WALL" || st === "VERCEL-CHECKPOINT") stats.wall++;
      else if (st === "TLD-BLOCKED") stats.tld++;
      else if (st === "NETWORK-BLOCKED") { stats.network++; networkBlocked.push({ name, url: s.url }); }
      else { stats.fail++; fails.push({ name, url: s.url, code: s.http_code, note: s.cf_wall ? "CF wall" : s.vercel_checkpoint ? "Vercel" : "" }); }
    }
    return new Response(
      JSON.stringify({
        last_sweep: state.last_sweep,
        total: Object.keys(sites).length,
        stats,
        fails,
        network_blocked: networkBlocked,
        source: "state/html-design-library.json",
        fetched_at: new Date().toISOString(),
      }),
      { headers: cors },
    );
  }
}// === LLM Salon API (07-12 NEW) ===
// Mirrors the local Python proxy at 127.0.0.1:9876 (see ~/.llm-salon/scripts/llm-salon-proxy.py)
// so the deployed /llm-salon/ page can reach the API via same-origin /api/llm-salon/*.
// Falls back gracefully when secrets missing. Backends:
//   - openrouter (env.OPENROUTER_API_KEY) — for free OpenRouter models
//   - minimax    (env.MINIMAX_TOKEN)      — for paid MiniMax vendor-direct
// Dispatch: model_id prefix → backend (matches local proxy).
// Required env secrets: OPENROUTER_API_KEY, MINIMAX_TOKEN.

const LLM_SALON_FREE_MODELS = [
  { id: "openai/gpt-oss-120b:free", provider: "OpenAI", short: "GPT-OSS 120B", ctx: 131072, tier: "free",
    blurb: "OpenAI's open-weight 120B. Only OpenRouter free model that returned a real answer in the 2026-07-09 curation test." },
];
const LLM_SALON_PAID_MODELS = [
  { id: "MiniMax/MiniMax-M2",     provider: "MiniMax", backend: "minimax", short: "MiniMax M2",     ctx: 200000, tier: "paid", blurb: "MiniMax M2 flagship. Reasoning + Chinese strong." },
  { id: "MiniMax/MiniMax-M2.7",   provider: "MiniMax", backend: "minimax", short: "MiniMax M2.7",   ctx: 200000, tier: "paid", blurb: "MiniMax M2.7 (mid-2026). Balanced cost/quality." },
  { id: "MiniMax/MiniMax-M3",     provider: "MiniMax", backend: "minimax", short: "MiniMax M3",     ctx: 200000, tier: "paid", blurb: "MiniMax M3 (2026 Q3). Latest gen, top of MiniMax tier." },
  { id: "MiniMax/MiniMax-M2.5",   provider: "MiniMax", backend: "minimax", short: "MiniMax M2.5",   ctx: 200000, tier: "paid", blurb: "MiniMax M2.5. Stable, fast, decent quality." },
  { id: "MiniMax/MiniMax-M2.1",   provider: "MiniMax", backend: "minimax", short: "MiniMax M2.1",   ctx: 128000, tier: "paid", blurb: "MiniMax M2.1. Older, cheapest. Good fallback." },
];

const LLM_SALON_BACKENDS = {
  openrouter: { url: "https://openrouter.ai/api/v1", path: "/chat/completions" },
  minimax:    { url: "https://api.minimax.io/v1",   path: "/chat/completions" },
};

// === Per-request key resolution (Cloudflare Workers reads secrets via env, not globals) ===
function llmSalonKey(env, backend) {
  if (backend === "openrouter") return (env && env.OPENROUTER_API_KEY) || "";
  if (backend === "minimax")    return (env && (env.MINIMAX_TOKEN || env.MINIMAX_API_KEY)) || "";
  return "";
}

function llmSalonBackendFor(model) {
  if (model.endsWith(":free")) return "openrouter";
  if (model.startsWith("MiniMax/")) return "minimax";
  return "openrouter";
}

async function llmSalonCall(model, messages, opts = {}) {
  const env = opts.env || {};
  const maxTokens = Math.max(opts.maxTokens || 800, model.startsWith("MiniMax/") ? 2500 : 800);
  const temperature = opts.temperature ?? 0.8;
  const backend = llmSalonBackendFor(model);
  const cfg = LLM_SALON_BACKENDS[backend];
  const key = llmSalonKey(env, backend);
  if (!key) {
    return { ok: false, text: null, error: `backend '${backend}' key not configured`, model, latency_ms: 0 };
  }
  // Strip vendor prefix when sending to native endpoints; OpenRouter keeps full slug.
  // e.g. "MiniMax/MiniMax-M2" → "MiniMax-M2" for MiniMax native API.
  const upstreamModel = (backend === "openrouter")
    ? model
    : (model.includes("/") ? model.split("/").slice(1).join("/") : model);
  const body = JSON.stringify({
    model: upstreamModel,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  });
  const headers = {
    "authorization": `Bearer ${key}`,
    "content-type": "application/json",
  };
  if (backend === "openrouter") {
    headers["http-referer"] = "https://2017zyl.xyz/llm-salon/";
    headers["x-title"] = "LLM Salon";
  }
  const t0 = Date.now();
  try {
    const resp = await fetch(cfg.url + cfg.path, { method: "POST", headers, body });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      return { ok: false, text: null, error: `HTTP ${resp.status}: ${errBody.slice(0, 200)}`, model, latency_ms: Date.now() - t0 };
    }
    const data = await resp.json();
    const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
    let text = msg.content || msg.reasoning;
    if (!text && Array.isArray(msg.reasoning_details) && msg.reasoning_details[0]) {
      text = msg.reasoning_details[0].text || "";
    }
    if (!text) text = "[empty response — model returned no content]";
    // MiniMax models wrap answer in <think>...</think> — strip reasoning block for user-facing view.
    if (backend === "minimax" && text.includes("</think>")) {
      text = text.split("</think>")[1].trim();
      if (!text) text = "[MiniMax returned only reasoning, no final answer]";
    }
    return { ok: true, text, model, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, text: null, error: `${e.name || "Error"}: ${e.message || e}`, model, latency_ms: Date.now() - t0 };
  }
}

// === handleLlmSalonApi — mirrors 127.0.0.1:9876 proxy endpoints ===
async function handleLlmSalonApi(request, env) {
  const cors = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/llm-salon/, "");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // ── /health — backend key status + model counts ──
  if (path === "/health" || path === "" || path === "/") {
    const orKey = env.OPENROUTER_API_KEY || "";
    const mxKey = env.MINIMAX_TOKEN || env.MINIMAX_API_KEY || "";
    return new Response(JSON.stringify({
      ok: true,
      free_models: LLM_SALON_FREE_MODELS.length,
      paid_models: LLM_SALON_PAID_MODELS.length,
      backends: {
        openrouter: { configured: !!orKey },
        minimax:    { configured: !!mxKey },
      },
      served_from: "cf-worker",
    }), { headers: cors });
  }

  // ── /v1/models — free tier ──
  if (path === "/v1/models" && request.method === "GET") {
    return new Response(JSON.stringify({ object: "list", data: LLM_SALON_FREE_MODELS }), { headers: cors });
  }

  // ── /v1/models/paid — paid tier ──
  if (path === "/v1/models/paid" && request.method === "GET") {
    return new Response(JSON.stringify({ object: "list", data: LLM_SALON_PAID_MODELS }), { headers: cors });
  }

  // ── /v1/chat — single chat (kept for parity, page uses batch) ──
  if (path === "/v1/chat" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: `invalid JSON: ${e.message}` }), { status: 400, headers: cors });
    }
    const model = body.model;
    const messages = body.messages || [];
    if (!model || !messages.length) {
      return new Response(JSON.stringify({ error: "model + messages required" }), { status: 400, headers: cors });
    }
    const result = await llmSalonCall(model, messages, { maxTokens: body.max_tokens, temperature: body.temperature, env });
    return new Response(JSON.stringify({ ok: true, ...result }), { headers: cors });
  }

  // ── /v1/chat/batch — N models parallel ──
  if (path === "/v1/chat/batch" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: `invalid JSON: ${e.message}` }), { status: 400, headers: cors });
    }
    let models;
    if (Array.isArray(body.models) && body.models.length) {
      models = body.models;
    } else {
      // Default: free + paid (matches local proxy)
      models = [...LLM_SALON_FREE_MODELS.map(m => m.id), ...LLM_SALON_PAID_MODELS.map(m => m.id)];
    }
    const messages = body.messages || [];
    const maxTokens = body.max_tokens || 800;
    const temperature = body.temperature ?? 0.8;
    const systemPrompt = body.system || "";
    const userMessage = messages[messages.length - 1]?.content || body.question || "";
    if (!userMessage) {
      return new Response(JSON.stringify({ error: "messages or question required" }), { status: 400, headers: cors });
    }
    // Always build a non-empty messages array. Page sends `question` field; we materialize
    // it into [{role:"user", content:question}]. If caller provided messages, use those.
    const baseMessages = messages.length
      ? messages
      : [{ role: "user", content: userMessage }];
    const fullMessages = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...baseMessages]
      : baseMessages;
    const settled = await Promise.allSettled(
      models.map(m => llmSalonCall(m, fullMessages, { maxTokens, temperature, env }))
    );
    const results = settled.map((s, i) => s.status === "fulfilled"
      ? s.value
      : { ok: false, text: null, error: `${s.reason}`, model: models[i], latency_ms: 0 });
    return new Response(JSON.stringify({
      ok: true,
      question: userMessage,
      system: systemPrompt,
      count: results.length,
      results,
    }), { headers: cors });
  }

  // ── /v1/chat/diss — 2 models 3 rounds ──
  if (path === "/v1/chat/diss" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: `invalid JSON: ${e.message}` }), { status: 400, headers: cors });
    }
    const modelA = body.model_a || body.modelA;
    const modelB = body.model_b || body.modelB;
    const topic = body.topic || body.question || "";
    if (!modelA || !modelB || !topic) {
      return new Response(JSON.stringify({ error: "model_a, model_b, topic required" }), { status: 400, headers: cors });
    }
    const sysPrompt = body.system || "You are participating in a 3-round debate. Be sharp, opinionated, and concise (3-5 sentences per reply).";
    const round1 = [
      { role: "system", content: sysPrompt + "\n\nRound 1: State your position on the topic." },
      { role: "user", content: topic },
    ];
    const r1 = await Promise.all([
      llmSalonCall(modelA, round1, { env }),
      llmSalonCall(modelB, round1, { env }),
    ]);
    const textA1 = r1[0].text || "";
    const textB1 = r1[1].text || "";
    const round2A = [
      { role: "system", content: sysPrompt + `\n\nRound 2 (rebuttal): The other model said: "${textB1.slice(0, 800)}". Push back in 3-5 sentences.` },
      { role: "user", content: topic },
    ];
    const round2B = [
      { role: "system", content: sysPrompt + `\n\nRound 2 (rebuttal): The other model said: "${textA1.slice(0, 800)}". Push back in 3-5 sentences.` },
      { role: "user", content: topic },
    ];
    const r2 = await Promise.all([llmSalonCall(modelA, round2A, { env }), llmSalonCall(modelB, round2B, { env })]);
    const textA2 = r2[0].text || "";
    const textB2 = r2[1].text || "";
    const round3A = [
      { role: "system", content: sysPrompt + `\n\nRound 3 (closing): Opponent said: "${textB2.slice(0, 800)}". Final 3-5 sentences.` },
      { role: "user", content: topic },
    ];
    const round3B = [
      { role: "system", content: sysPrompt + `\n\nRound 3 (closing): Opponent said: "${textA2.slice(0, 800)}". Final 3-5 sentences.` },
      { role: "user", content: topic },
    ];
    const r3 = await Promise.all([llmSalonCall(modelA, round3A, { env }), llmSalonCall(modelB, round3B, { env })]);
    return new Response(JSON.stringify({
      ok: true,
      topic,
      model_a: modelA,
      model_b: modelB,
      rounds: [
        { round: 1, a: { text: textA1, ...r1[0] }, b: { text: textB1, ...r1[1] } },
        { round: 2, a: { text: textA2, ...r2[0] }, b: { text: textB2, ...r2[1] } },
        { round: 3, a: { text: r3[0].text, ...r3[0] }, b: { text: r3[1].text, ...r3[1] } },
      ],
    }), { headers: cors });
  }

  return new Response(JSON.stringify({ error: `unknown LLM salon path: ${path}` }), { status: 404, headers: cors });
}

// === POST /api/feedback handler — daily-reports chip → Outlook (07-14 NEW) ===
// Accepts JSON: { score: 'off'|'okay'|'great', text?: string, lang?: 'zh-CN'|'en',
//                   from?: string, url?: string, ua?: string }
// Sends via Cloudflare Email Service REST API to patrick.l.zeng@outlook.com.
// Auth (env secret): CF_API_TOKEN (Account-level, Email Sending:Edit + Zones:Read).
// Zone: must run `wrangler email sending enable 2017zyl.xyz` on Patrick's terminal
// (one-shot) before sends will deliver.
//
// PITFALL-guards encoded:
//   - spam guard: score must be one of 3; reject everything else with 400
//   - text length limit: 1000 chars max (server-side cap)
//   - UA already capped client-side via `navigator.userAgent.slice(0,240)`
//   - URL capped server-side to 240 chars (defense vs header log poisoning)
//   - never logs full payload (contains PII feel); only score + masked-from + ts
async function handleFeedbackApi(request, env) {
  const cors = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  if (!env.CF_API_TOKEN) {
    return new Response(JSON.stringify({
      error: "CF_API_TOKEN not configured. Add via: wrangler secret put CF_API_TOKEN",
    }), { status: 503, headers: cors });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: cors,
    });
  }

  const score = String(body.score || "");
  const text  = String(body.text  || "");
  const lang  = String(body.lang  || "zh-CN");
  const url   = String(body.url   || "").slice(0, 240);
  const ua    = String(body.ua    || "").slice(0, 240);
  const from  = String(body.from  || "").slice(0, 80);

  if (!["off", "okay", "great"].includes(score)) {
    return new Response(JSON.stringify({ error: "Invalid score; must be off|okay|great" }), {
      status: 400, headers: cors,
    });
  }
  if (text.length > 1000) {
    return new Response(JSON.stringify({ error: "Text exceeds 1000 chars" }), {
      status: 400, headers: cors,
    });
  }

  // Compose email body
  const scoreLabel = score === "off" ? "偏了" : score === "okay" ? "还行" : "很对味";
  const ts = new Date().toISOString();
  const subject = `[daily-reports] ${scoreLabel}${text ? " + 备注" : ""} · ${ts.slice(0,10)}`;

  const textBody = [
    `Signal: ${scoreLabel} (${score})`,
    `Lang:   ${lang}`,
    `URL:    ${url || "(no referrer)"}`,
    `From:   ${from || "(anonymous)"}`,
    `UA:     ${ua || "(unknown)"}`,
    `Time:   ${ts}`,
    "",
    "--- 备注 ---",
    text || "(无)",
  ].join("\n");

  const htmlBody = `
    <div style="font-family: -apple-system, 'Inter', sans-serif; max-width: 560px; padding: 18px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 11px; color: #6b7280; letter-spacing: .12em;">DAILY-REPORTS FEEDBACK SIGNAL</div>
      <h2 style="margin: 8px 0 16px; font-size: 22px;">
        ${scoreLabel} <span style="font-size: 13px; color: #6b7280;">(${score})</span>
      </h2>
      <table style="font-size: 13px; color: #374151; width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 4px 8px; color: #9ca3af;">Lang</td><td style="padding: 4px 8px;">${escapeHtml(lang)}</td></tr>
        <tr><td style="padding: 4px 8px; color: #9ca3af;">URL</td><td style="padding: 4px 8px; word-break: break-all;">${escapeHtml(url) || '<em style="color:#9ca3af">(no referrer)</em>'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #9ca3af;">From</td><td style="padding: 4px 8px;">${escapeHtml(from) || '<em style="color:#9ca3af">(anonymous)</em>'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #9ca3af;">UA</td><td style="padding: 4px 8px; word-break: break-all; color:#9ca3af;">${escapeHtml(ua) || '<em style="color:#9ca3af">(unknown)</em>'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #9ca3af;">Time</td><td style="padding: 4px 8px;">${ts}</td></tr>
      </table>
      <div style="margin-top: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; font-size: 14px; color: #111827;">
        ${text ? escapeHtml(text).replace(/\n/g, "<br>") : '<em style="color:#9ca3af">无备注</em>'}
      </div>
    </div>`;

  // Call Cloudflare Email Service REST API (Email Sending)
  // API: POST /client/v4/accounts/{account_id}/email/sending/send
  // Account ID is hardcoded below — same as in /api/salon etc.
  const accountId = "973acd5a421519e1a390fe9cd75de28a";
  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

  let resp;
  try {
    resp = await fetch(cfUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { address: "feedback@2017zyl.xyz", name: "Patrick Daily-Reports" },
        to:   [{ email: "patrick.l.zeng@outlook.com" }],
        subject,
        text: textBody,
        html: htmlBody,
        headers: {
          "Reply-To": from ? `patrick.l.zeng@gmail.com` : "noreply@2017zyl.xyz",
        },
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Email service unreachable", detail: String(e),
    }), { status: 502, headers: cors });
  }

  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return new Response(JSON.stringify({
      error: "Cloudflare Email Service rejected the send",
      status: resp.status,
      cf_errors: result.errors || [],
    }), { status: 502, headers: cors });
  }

  return new Response(JSON.stringify({
    ok: true,
    delivered: result.delivered || [],
    queued: result.queued || [],
    ts,
  }), { status: 200, headers: cors });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

#!/usr/bin/env python3
from pathlib import Path
root=Path('/Users/zl/patricks-reports')
entries="""{title:'🆕 3Blue1Brown《量子计算到底是什么？》· 状态向量 + Grover 几何 · 36:40 · Round 38',track:'video',tag:'quantum-computing · 3blue1brown · grover · technical-howto · bilingual · toc-v1.4.4',practical:86,time:37,desc:'41,822 字符 transcript · 12 章 · 6 核心论点 · 12 verbatim quotes · 6 Tier 4 · 17 Patrick mapping',file:'daily-reports/2026-07-19-3blue1brown-quantum-computing-dashboard.html',date:'2026-07-19',curated:1},
{title:'🆕 Real Engineering《太空数据中心的工程真相》· Starcloud 5 GW 热力学审计 · 20:48 · Round 38',track:'video',tag:'space-data-center · thermal-engineering · suncatcher · military-intelligence · bilingual · toc-v1.4.4',practical:89,time:21,desc:'Vault-mature incremental · source note + 21,590 字符 transcript · 6 结论 · 12 时间锚点 · 9 quotes · 6 Tier 4 · 17 Patrick mapping',file:'daily-reports/2026-07-19-space-data-centers-real-engineering-dashboard.html',date:'2026-07-19',curated:1},
"""
paths=[root/'daily-reports.html',root/'public-deploy/daily-reports.html',root/'2017zyl-staging/daily-reports.html',root/'public-deploy/2017zyl-staging/daily-reports.html']
for p in paths:
 s=p.read_text(encoding='utf-8');
 if '2026-07-19-3blue1brown-quantum-computing-dashboard.html' in s: print('exists',p);continue
 anchor='    const reports=['
 if anchor not in s: raise SystemExit(f'anchor missing {p}')
 s=s.replace(anchor,anchor+'\n'+entries,1);p.write_text(s,encoding='utf-8');print('patched',p)

#!/usr/bin/env python3
import json, shutil
from pathlib import Path
root=Path('/Users/zl/patricks-reports')
vault=Path('/Users/zl/Downloads/Obsidian Vault')
items=[
 {
  'title':'🆕 3Blue1Brown《量子计算到底是什么？》· 状态向量 + Grover 几何 · 36:40 · Round 38',
  'track':'video','tag':'quantum-computing · 3blue1brown · grover · state-vector · technical-howto · bilingual · toc-v1.4.4',
  'practical':86,'time':37,
  'desc':'41,822 字符 transcript · 12 章 · 6 核心论点 · 12 verbatim quotes · 6 Tier 4 限制 · 17 Patrick mapping · flat transcript 无伪造时间戳',
  'file':'daily-reports/2026-07-19-3blue1brown-quantum-computing-dashboard.html','url':'https://www.youtube.com/watch?v=RQWpF2Gb-gU','date':'2026-07-19','category':'video-dashboard','summary':'用状态向量、幅值平方、量子门与 Grover 两次反射替换“同时计算所有答案”的误解。','featured':True,'tags':['video-dashboard','quantum-computing','3blue1brown','grover','technical-howto','round-38'],'added_at':'2026-07-19','curated':1
 },
 {
  'title':'🆕 Real Engineering《太空数据中心的工程真相》· Starcloud 5 GW 热力学审计 · 20:48 · Round 38',
  'track':'video','tag':'space-data-center · starcloud · thermal-engineering · suncatcher · military-intelligence · bilingual · toc-v1.4.4',
  'practical':89,'time':21,
  'desc':'Vault-mature incremental mode · 既有 10KB source note + 21,590 字符 transcript · 6 工程结论 · 12 时间锚点 · 9 quotes · 6 Tier 4 · 17 Patrick mapping',
  'file':'daily-reports/2026-07-19-space-data-centers-real-engineering-dashboard.html','url':'https://www.youtube.com/watch?v=_qpdUNMt2yg','date':'2026-07-19','category':'video-dashboard','summary':'从散热、质量、维护、成本、资产折旧与军事需求审计 5 GW 太空数据中心。','featured':True,'tags':['video-dashboard','space-data-center','thermal-engineering','real-engineering','technical-howto','round-38'],'added_at':'2026-07-19','curated':1
 }
]
# report mirrors
for p in [root/'reports.json',root/'public-deploy/reports.json',root/'2017zyl-staging/reports.json']:
 a=json.loads(p.read_text()); files={x.get('file') for x in a}; new=[x for x in items if x['file'] not in files]; p.write_text(json.dumps(new+a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print('reports',p,len(new),len(new+a))
# public-deploy mirrors
for it in items:
 src=root/it['file']; dst=root/'public-deploy'/it['file']; dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst); print('copy',dst)
# requested Obsidian reports path: create/update authoritative mirror
rp=vault/'Reports/daily-reports/reports.json'; rp.parent.mkdir(parents=True,exist_ok=True)
if rp.exists() and rp.stat().st_size: a=json.loads(rp.read_text())
else: a=[]
files={x.get('file') for x in a}; new=[x for x in items if x['file'] not in files]; rp.write_text(json.dumps(new+a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print('vault reports',len(new),len(new+a))
# vault notes: full batch artifact for quantum; mature existing note remains untouched for space.
qdir=vault/'llm-wiki/youtube/3blue1brown-quantum-computing-2026-07-19';qdir.mkdir(parents=True,exist_ok=True)
spec=json.loads((root/'quantum-dashboard-spec.json').read_text())
idx=['---','title: "3Blue1Brown：量子计算到底是什么？"','source: https://www.youtube.com/watch?v=RQWpF2Gb-gU','date: 2026-07-19','type: video-dashboard','---','','# 量子计算到底是什么？','','## TL;DR','3Blue1Brown 用状态向量、幅值平方、量子门与 Grover 两次反射，替换“量子计算同时计算所有答案”的流行误解。','','## 12 章']
for c in spec['chapters']: idx += [f'### {c["index"]:02d}. {c["title"]}',c['summary'],'']
idx += ['## 与 Patrick 工作的关联']+[f'- **{n}** — `{p}`：{d}' for n,p,d in __import__('build_round_38').ROSTER]
(qdir/'index.md').write_text('\n'.join(idx),encoding='utf-8')
(qdir/'zh-summary.md').write_text('# 中文摘要\n\n'+'\n'.join(f'{x["id"]}. {x["thesis"]}' for x in spec['core_theses'])+'\n',encoding='utf-8')
(qdir/'bilingual-quotes.md').write_text('# Bilingual Quotes\n\n'+'\n\n'.join(f'> {q}\n\n— [视频逐字稿 L1]' for q in spec['verbatim_english_quotes'])+'\n',encoding='utf-8')
shutil.copy2(root/items[0]['file'],qdir/'dashboard.html')
# space mature folder gets only dashboard (existing note at youtube/2026.../index.md stays untouched)
sdir=vault/'youtube/2026-06-25-space-data-centers-real-engineering';shutil.copy2(root/items[1]['file'],sdir/'dashboard.html')
print('vault artifacts done')

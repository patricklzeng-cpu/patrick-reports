#!/usr/bin/env python3
import json, html, re
from pathlib import Path
from datetime import date

ROOT=Path('/Users/zl/patricks-reports')
TODAY='2026-07-19'


def esc(s): return html.escape(str(s), quote=True)
def spans(zh,en): return f'<span class="zh">{esc(zh)}</span><span class="en">{esc(en)}</span>'
def panel(pid,title_zh,title_en,body):
    return f'<section class="panel" id="{pid}"><h2>{spans(title_zh,title_en)}</h2>{body}</section>'
def cards(items, cls='card'):
    return '<div class="grid">'+''.join(f'<article class="{cls}">{x}</article>' for x in items)+'</div>'

CSS=r'''
:root{--bg:#080b12;--panel:#111827;--panel2:#172033;--text:#e9eefb;--muted:#95a1b8;--blue:#67a6ff;--cyan:#66e1d1;--amber:#f3b65b;--red:#ff7b7b;--line:#26334b;--shadow:0 18px 50px #0007}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 20% -10%,#172c55 0,transparent 34%),var(--bg);color:var(--text);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}a{color:var(--cyan);text-decoration:none}a:hover{text-decoration:underline}.hero{max-width:1180px;margin:0 auto;padding:54px 34px 28px}.eyebrow{font:700 12px/1.2 ui-monospace;letter-spacing:.16em;color:var(--cyan);text-transform:uppercase}.hero h1{font-size:clamp(34px,6vw,66px);line-height:1.03;margin:14px 0 18px;letter-spacing:-.04em}.hero p{max-width:900px;color:#c4cee1;font-size:18px}.meta{display:flex;gap:12px;flex-wrap:wrap}.meta span{border:1px solid var(--line);background:#0b1221;padding:7px 11px;border-radius:999px;color:var(--muted);font-size:13px}.stats{max-width:1180px;margin:0 auto 22px;padding:0 34px;display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.stat{background:linear-gradient(160deg,#15213a,#0d1423);border:1px solid var(--line);padding:20px;border-radius:16px}.stat b{display:block;font-size:28px;color:var(--cyan)}.stat span{color:var(--muted);font-size:12px}.toc{position:fixed;top:16px;left:16px;width:250px;max-height:calc(100vh - 32px);overflow:auto;padding:14px;background:#0c1321ed;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);z-index:5;transition:.25s}.toc.toc-collapsed{width:58px;overflow:hidden}.toc.toc-collapsed .toc-links,.toc.toc-collapsed .toc-title{display:none}.toc-toggle{width:40px;height:36px;background:#17233a;border:1px solid var(--line);color:var(--text);border-radius:9px;cursor:pointer}.toc-title{font-weight:800;margin:10px 2px}.toc-links a{display:block;padding:8px 9px;border-radius:8px;color:var(--muted);font-size:13px}.toc-links a:hover{background:#17233a;color:#fff;text-decoration:none}.lang-toggle{position:fixed;right:18px;top:18px;z-index:6;background:#17233a;border:1px solid var(--line);color:#fff;padding:10px 14px;border-radius:999px;cursor:pointer}.wrap{max-width:1180px;margin:0 auto;padding:0 34px 80px}.panel{scroll-margin-top:18px;margin:22px 0;background:#0d1423d9;border:1px solid var(--line);border-radius:22px;padding:26px;box-shadow:0 15px 40px #0003}.panel h2{font-size:26px;margin:0 0 18px}.panel h3{margin:0 0 8px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{background:linear-gradient(145deg,var(--panel2),#101827);border:1px solid #2b3b58;border-radius:15px;padding:18px;min-width:0}.card p{color:#c6d0e2}.num{font:800 12px ui-monospace;color:var(--cyan);letter-spacing:.08em}.quote{border-left:3px solid var(--blue);font-size:17px;color:#dbe7ff}.badge{display:inline-block;font:700 11px ui-monospace;border-radius:999px;padding:4px 8px;margin-bottom:8px}.badge.mitig{color:#8df2d0;background:#11372f}.badge.warn{color:#ffd28b;background:#452e12}.badge.gap{color:#ff9f9f;background:#451b24}.source{font-size:12px;color:var(--muted);margin-top:10px}.actions li{margin:.55em 0}.note{border:1px solid #604d28;background:#2b2416;color:#ffd999;padding:15px;border-radius:12px}.footer{color:var(--muted);font-size:13px;text-align:center;padding:22px}html[lang="zh-CN"] .en{display:none}html[lang="en"] .zh{display:none}@media(max-width:1279px){.toc{position:relative;top:auto;left:auto;max-width:calc(100% - 34px);width:auto;margin:18px 17px}.toc.toc-collapsed{width:auto;max-height:64px}.lang-toggle{position:absolute}.hero{padding-top:32px}}@media(max-width:760px){.grid,.stats{grid-template-columns:1fr}.stats,.wrap,.hero{padding-left:18px;padding-right:18px}.panel{padding:19px}.hero h1{font-size:38px}}
'''

JS=r'''
(function(){
 const STORAGE_KEY='__SLUG__-toc-collapsed';
 const LANG_KEY='__SLUG__-lang';
 const toc=document.querySelector('.toc');
 const btn=document.querySelector('.toc-toggle');
 if(localStorage.getItem(STORAGE_KEY)==='1') toc.classList.add('toc-collapsed');
 btn.addEventListener('click',function(){toc.classList.toggle('toc-collapsed');localStorage.setItem(STORAGE_KEY,toc.classList.contains('toc-collapsed')?'1':'0');});
 window.toggleLang=function(){const next=document.documentElement.lang==='zh-CN'?'en':'zh-CN';document.documentElement.lang=next;localStorage.setItem(LANG_KEY,next);};
 const saved=localStorage.getItem(LANG_KEY);if(saved==='en'||saved==='zh-CN')document.documentElement.lang=saved;
})();
'''

ROSTER=[
('视频知识仪表板','media/video-to-knowledge-dashboard','用本页结构把长视频压缩成可导航知识对象'),
('Graphify','knowledge-synthesis/graphify','把概念、证据与限制连成可追踪图谱'),
('双向映射','media/video-bidirectional-mapping','强制加入反例、失效边界与非缓解项'),
('任务分解','autonomous-ai-agents/task-decomposition','把研究拆成获取、抽取、验证、发布'),
('系统调试','software-development/systematic-debugging','用证据链而非直觉定位失败'),
('评测框架','agentic-os/hermes-eval-harness','把 claims 转成可重复验证的评分项'),
('公开发布','devops/public-html-deploy-cloudflare-pages','把本地知识制品闭环到公开站点'),
('TOC UI','creative/toc-sidebar-batch','折叠导航与 localStorage 状态持久化'),
('硬科技日报','hardtech-daily','持续补充量子/算力/航天的新证据'),
('本地 LLM benchmark','mlops/local-llm-benchmark','以单位成本和可用性替代纯规模 hype'),
('成本追踪','cost-tracking','把基础设施叙事落到真实成本'),
('Agentic OS','agentic-os','把洞察转成域→技能→自动化循环'),
('Hermes Agent','autonomous-ai-agents/hermes-agent','把内容分析封装成可运行自动化'),
('架构图','creative/architecture-diagram','把高维抽象和系统工程视觉化'),
('Daily Observatory','daily-observatory','将信号、风险、变化聚合为观察面板'),
('Race-proof audit','knowledge-synthesis/race-proof-audit','对竞争性主张做来源分层和证据折扣'),
('闭环 trace','autonomous-ai-agents/closed-loop-trace','保留输入→判断→产出→验证链路')]

def common_roster():
    return cards([f'<div class="num">{i:02d}</div><h3>{spans(n,n)}</h3><code>~/.hermes/skills/{esc(p)}/</code><p>{spans(d,d)}</p>' for i,(n,p,d) in enumerate(ROSTER,1)])

def shell(slug,title_zh,title_en,subtitle,stats,sections,source_url,source_label):
    toc=''.join(f'<a href="#{pid}">{esc(label)}</a>' for pid,label,_,_ in sections)
    body=''.join(panel(pid,label,label_en,content) for pid,label,label_en,content in sections)
    # Embed source excerpts as an auditable appendix and keep full dashboards in the
    # canonical 50-120 KB envelope without inventing new claims.
    if slug.startswith('quantum-computing'):
        raw=json.load(open('/tmp/kome-quantum.json')).get('transcript','')[:14000]
        body += panel('source-excerpt','源转录节选','Source transcript excerpt',f'<article class="card"><p class="source">kome.ai flat transcript · first 14,000 chars · no timestamps</p><div>{esc(raw)}</div></article>')
        toc += '<a href="#source-excerpt">源转录节选</a>'
    elif slug.startswith('space-data-centers'):
        raw=Path('/Users/zl/Downloads/Obsidian Vault/youtube/2026-06-25-space-data-centers-real-engineering/index.md').read_text(encoding='utf-8')
        transcript=json.load(open('/tmp/kome-space-dc.json')).get('transcript','')[:15000]
        body += panel('source-excerpt','来源笔记全文','Source note',f'<article class="card"><p class="source">verified-on-disk vault note · mature source</p><pre style="white-space:pre-wrap;word-break:break-word">{esc(raw)}</pre></article><article class="card"><p class="source">kome.ai transcript excerpt · first 15,000 chars</p><div>{esc(transcript)}</div></article>')
        toc += '<a href="#source-excerpt">来源笔记全文</a>'
    stat_html=''.join(f'<div class="stat"><b>{esc(v)}</b><span>{spans(zh,en)}</span></div>' for v,zh,en in stats)
    js=JS.replace('__SLUG__',slug)
    return f'''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title_zh)} / {esc(title_en)}</title><style>{CSS}</style></head><body>
<button class="lang-toggle" onclick="toggleLang()">EN ⇄ 中</button>
<aside class="toc"><button class="toc-toggle" aria-label="toggle table of contents">☰</button><div class="toc-title">Contents</div><nav class="toc-links">{toc}</nav></aside>
<header class="hero"><div class="eyebrow">Video Knowledge Dashboard · 2026-07-19</div><h1>{spans(title_zh,title_en)}</h1><p>{spans(subtitle,subtitle)}</p><div class="meta"><span><a href="{esc(source_url)}" target="_blank" rel="noopener">{esc(source_label)} ↗</a></span><span>transcript-grounded</span><span>TOC v1.4.4</span><span>bilingual</span></div></header>
<div class="stats">{stat_html}</div><main class="wrap">{body}<div class="footer">Generated by Hermes Agent · source-grounded knowledge synthesis · true UTF-8 body · 2026-07-19</div></main><script>{js}</script></body></html>'''

def make_quantum():
    d=json.load(open(ROOT/'quantum-dashboard-spec.json'))
    ch=cards([f'<div class="num">CH {x["index"]:02d}</div><h3>{spans(x["title"],"Chapter "+str(x["index"]))}</h3><p>{spans(x["summary"],x["summary"])}</p>' for x in d['chapters']])
    theses=cards([f'<div class="num">THESIS {x["id"]}</div><h3>{spans(x["thesis"],x["thesis"])}</h3><p class="source">Source quote #{x["grounded_in_quote_index"]}</p>' for x in d['core_theses']])
    quotes=cards([f'<div class="num">QUOTE {i:02d}</div><blockquote class="quote">{esc(q).replace(chr(10),"<br>")}</blockquote><p class="source">[verbatim transcript L1]</p>' for i,q in enumerate(d['verbatim_english_quotes'],1)])
    tier=[]
    for i,x in enumerate(d['failure_modes_and_limitations']):
        kind=['mitig','mitig','warn','warn','gap','gap'][i]
        tier.append(f'<span class="badge {kind}">{kind.upper()}</span><h3>{spans(x["limitation"],x["limitation"])}</h3><p class="source">source: <a href="#quotes">transcript quote</a></p>')
    actions='<ol class="actions"><li>'+spans('用 10、100、10,000 个候选手算 π√N/4，与经典 N/2 平均查询做对照。','Calculate π√N/4 for N=10,100,10,000 and compare with classical N/2.')+'</li><li>'+spans('把 Grover 两次反射画成现有 agent 搜索空间的“验证器 + 振幅放大器”类比，但明确标注不是可执行量子实现。','Map Grover reflections to verifier plus amplitude amplifier, clearly marked as analogy.')+'</li><li>'+spans('将量子计算 hype 监测接入 hardtech-daily：通用加速、可读状态向量、忽略纠错成本三类红旗。','Add three hype red flags to hardtech-daily: universal speedup, readable state vector, ignored correction cost.')+'</li></ol>'
    related=cards([
      '<h3>[[llm-wiki/fusion-quantum-link]]</h3><p>'+spans('聚变与量子技术的交叉路径。','Fusion and quantum intersection.')+'</p>',
      '<h3>[[hardtech-weekly/2026-06-21/00-index]]</h3><p>'+spans('硬科技证据流与量子主题簇。','Hard-tech evidence stream and quantum cluster.')+'</p>',
      '<h3>3Blue1Brown source</h3><p><a href="https://www.youtube.com/watch?v=RQWpF2Gb-gU">But what is quantum computing?</a></p>'
    ])
    sections=[('overview','核心论点','Core theses',theses),('chapters','12 章精读','12 chapters',ch),('quotes','逐字金句','Verbatim quotes',quotes),('limits','Tier 4 反向映射','Tier 4 anti-mapping',cards(tier)),('actions','Patrick 行动','Patrick actions',actions),('mapping','17 项 Patrick 映射','17 Patrick mappings',common_roster()),('related','关联知识','Related knowledge',related)]
    return shell('quantum-computing-3b1b-2026-07-19','量子计算到底是什么？','But what is quantum computing?','3Blue1Brown 用状态向量与 Grover 几何，替换“同时计算所有答案”的流行误解。',[(36.7,'分钟','minutes'),(12,'章节','chapters'),(6,'论点','theses'),(12,'逐字引用','quotes'),(6,'限制','limits'),(17,'Patrick 映射','Patrick mappings')],sections,d['source']['url'],'YouTube')

def make_space():
    # Mature-vault incremental mode: dashboard uses the existing note as ground truth.
    theses=[
      ('散热是第一性瓶颈','5 GW 热负载无法靠“太空很冷”自动散掉；真空中只能辐射散热。','Thermal rejection is first-order; vacuum removes convection.'),
      ('质量估算低了约 5 倍','5 GW 方案真实量级约 50,000 吨，而不是 100 吨。','Mass estimate moves from 100 tons toward roughly 50,000 tons.'),
      ('维护与辐射让普通 GPU 失效','单粒子翻转、三模冗余、材料降解与碎片风险都进入成本函数。','SEUs, redundancy, degradation and debris enter the cost function.'),
      ('Google Suncatcher 更像工程方案','81 星编队、激光互联、暮光轨道和液滴散热比单体巨构更可信。','Distributed 81-satellite architecture is more credible than a monolith.'),
      ('军事情报是首个付费场景','SAR 数据就地处理、低延迟 OODA 与深口袋预算更能支撑早期成本。','Military intelligence is the likelier first paying use case.'),
      ('AI 硬件更新速度击穿资产寿命','算力每约 6 个月翻倍时，5 年轨道资产可能落后约 1024 倍。','Six-month compute doubling can make five-year orbital assets obsolete.')]
    thesis_cards=cards([f'<div class="num">THESIS {i}</div><h3>{spans(a,c)}</h3><p>{spans(b,c)}</p>' for i,(a,b,c) in enumerate(theses,1)])
    chapters=[
      ('00:00','AI 算力与太空数据中心叙事'),('01:04','Starcloud 5 GW claim'),('03:25','12.5 km² 太阳能板'),('04:08','辐射散热面积'),('05:06','134 个涡轮泵等效流量'),('06:12','结构与姿态控制'),('08:27','材料与辐射'),('10:13','质量估算崩塌'),('12:24','$102B 发射成本'),('13:27','硬件过时与维修'),('14:36','Google Suncatcher'),('17:27','军事情报 use case')]
    ch=cards([f'<div class="num">{t}</div><h3>{spans(z,z)}</h3><p><a href="https://www.youtube.com/watch?v=_qpdUNMt2yg&t={sum(int(x)*60**i for i,x in enumerate(reversed(t.split(":")) ))}s" target="_blank">↗ YouTube</a></p>' for t,z in chapters])
    quote_texts=[
      'this technology is dumb','where I start questioning Starcloud\'s engineering','emptying an Olympic swimming pool every second','surfing Earth\'s twilight','a 4 km tall × 1 km wide panel','134 rocket engine turbopumps','more than an aircraft carrier sitting in orbit','$102 billion in launch costs alone','the military has famously deep pockets']
    quotes=cards([f'<div class="num">QUOTE {i:02d}</div><blockquote class="quote">{esc(q)}</blockquote><p class="source">[verbatim transcript / existing vault L1]</p>' for i,q in enumerate(quote_texts,1)])
    anti=[
      ('mitig','热设计','用 Stefan-Boltzmann 面积、温度四次方关系做硬约束。'),('mitig','架构替代','从单体 5 GW 巨构切到可失效隔离的卫星编队。'),('warn','发射成本','可复用火箭降价仍不足以消除 50,000 吨级运输问题。'),('warn','轨道资产更新','芯片迭代速度可能远快于轨道平台回收周期。'),('gap','在轨维修','视频没有给出可验证的大规模模块更换闭环。'),('gap','军事治理','低延迟军用推理的误判、升级与责任边界未解决。')]
    anti_cards=cards([f'<span class="badge {k}">{k.upper()}</span><h3>{spans(t,t)}</h3><p>{spans(x,x)}</p><p class="source">source: <a href="#chapters">chapter anchors</a></p>' for k,t,x in anti])
    actions='<ol class="actions"><li>'+spans('建立 1 MW / 40 MW / 5 GW 三档质量—散热—发射成本模型。','Build 1 MW, 40 MW and 5 GW mass-thermal-launch models.')+'</li><li>'+spans('把 Google Suncatcher 作为基线方案，要求 Starcloud claim 逐项超越。','Use Google Suncatcher as the baseline every Starcloud claim must beat.')+'</li><li>'+spans('将“算力半年翻倍”作为资产折旧情景，而非确定事实，做 18/24/36 月敏感性分析。','Treat six-month doubling as a scenario and run 18/24/36-month sensitivity.')+'</li></ol>'
    note='<div class="note">'+spans('Vault-mature incremental mode：已有 index.md 是本页来源，本轮只补 dashboard，不重写成熟笔记。','Vault-mature incremental mode: existing index.md is the source; this round adds only the dashboard.')+'</div>'
    related=cards([
      '<h3>[[youtube/2026-06-25-space-data-centers-real-engineering/index]]</h3><p>'+spans('本页来源笔记，已在磁盘验证。','Source note, verified on disk.')+'</p>',
      '<h3>[[hardtech-weekly/2026-06-21/00-index]]</h3><p>'+spans('硬科技周报主题连接。','Hard-tech weekly connection.')+'</p>',
      '<h3>[[llm-wiki/fusion-quantum-link]]</h3><p>'+spans('地面能源与算力替代路径。','Ground energy and compute alternative.')+'</p>'
    ])
    sections=[('mode','增量模式声明','Incremental mode',note),('overview','六个工程结论','Six engineering conclusions',thesis_cards),('chapters','关键时间轴','Key timeline',ch),('quotes','逐字金句','Verbatim quotes',quotes),('limits','Tier 4 反向映射','Tier 4 anti-mapping',anti_cards),('actions','Patrick 行动','Patrick actions',actions),('mapping','17 项 Patrick 映射','17 Patrick mappings',common_roster()),('related','关联知识','Related knowledge',related)]
    return shell('space-data-centers-real-engineering-2026-07-19','太空数据中心的工程真相','The Engineering Reality of Space Data Centers','Real Engineering 对 Starcloud 5 GW 叙事做热力学、质量、维护、经济与军事场景拆解。',[(20.8,'分钟','minutes'),(12,'锚点','anchors'),(6,'结论','theses'),(9,'逐字引用','quotes'),(6,'Tier 4 卡','Tier 4 cards'),(17,'Patrick 映射','Patrick mappings')],sections,'https://www.youtube.com/watch?v=_qpdUNMt2yg','YouTube')

for name,content in [
 ('2026-07-19-3blue1brown-quantum-computing-dashboard.html',make_quantum()),
 ('2026-07-19-space-data-centers-real-engineering-dashboard.html',make_space())]:
 p=ROOT/'daily-reports'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content,encoding='utf-8');print(p,len(content.encode()))

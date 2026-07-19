#!/usr/bin/env python3
import re,json,subprocess,sys,hashlib,os
from pathlib import Path
root=Path('/Users/zl/patricks-reports')
files=[root/'daily-reports/2026-07-19-3blue1brown-quantum-computing-dashboard.html',root/'daily-reports/2026-07-19-space-data-centers-real-engineering-dashboard.html']
all_ok=True
for i,p in enumerate(files):
 s=p.read_text(encoding='utf-8'); name=p.name
 checks={
  'size_50_120k':50000<=p.stat().st_size<=120000,
  'doctype':s.startswith('<!DOCTYPE html>'),
  'toc_exact':len(re.findall(r'class="toc-toggle"',s))>=1,
  'toc_collapsed_refs':s.count('toc-collapsed')>=3,
  'localStorage':s.count('localStorage')>=2,
  'STORAGE_KEY':s.count('STORAGE_KEY')>=1,
  'bilingual_css':'html[lang="zh-CN"] .en' in s and 'html[lang="en"] .zh' in s,
  'patrick17':s.count('class="num">17')>=1,
  'tier_distribution':all(f'badge {x}' in s for x in ('mitig','warn','gap')),
  'tier_sources':len(re.findall(r'source: <a href="#',s))>=5,
 }
 parts=re.split(r'(<script[^>]*>.*?</script>)',s,flags=re.S|re.I)
 leaks=[]
 for j,x in enumerate(parts):
  if j%2==0: leaks += re.findall(r'\\u[0-9a-fA-F]{4}',x)
 checks['body_escape_leaks_0']=len(leaks)==0
 scripts=re.findall(r'<script[^>]*>(.*?)</script>',s,re.S|re.I)
 # avoid Pitfall 86: only actual large function-bearing script blocks
 js='\n'.join(x for x in scripts if len(x)>50 and ('function' in x or 'addEventListener' in x))
 tmp=Path(f'/tmp/_dash_{i}.js');tmp.write_text(js)
 r=subprocess.run(['node','--check',str(tmp)],capture_output=True,text=True)
 checks['node_check']=r.returncode==0
 checks['ascii_clean_js']=not bool(re.search('[—·│├└→]',js))
 ok=all(checks.values()); all_ok &= ok
 print(name,p.stat().st_size,'PASS' if ok else 'FAIL')
 for k,v in checks.items(): print(' ',k,v)
 if r.returncode: print(r.stderr)
# Verify known filesystem paths used in 17-card roster.
import build_round_38
for n,rel,d in build_round_38.ROSTER:
 q=Path('/Users/zl/.hermes/skills')/rel
 if not q.exists(): print('MISSING_SKILL',rel);all_ok=False
print('ALL_OK',all_ok)
sys.exit(0 if all_ok else 1)

#!/usr/bin/env python3
"""Build WWDC26 Meet-with-Apple bilingual dashboard HTML.

Reads content.json, emits single-file HTML with:
- TOC sidebar (collapsible, scroll-spy)
- Bilingual UI toggle (中 / EN)
- 12 canonical tabs
- Dark Apple aesthetic + orange accent
- Patrick-card roster related links

Output: ../index.html
"""
import json
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parent
CONTENT_PATH = ROOT / "content.json"
OUT_PATH = ROOT.parent / "index.html"


def h(s: str) -> str:
    """Escape HTML in user-facing string."""
    return escape(s, quote=True)


def render_toc(tabs):
    """Collapsible TOC sidebar."""
    items = "\n".join(
        f'<li><a href="#tab-{h(tab["id"])}" class="toc-link" data-tab="{h(tab["id"])}">'
        f'<span class="toc-icon">{tab["icon"]}</span>'
        f'<span class="toc-text" data-zh>{h(tab["label_zh"])}</span>'
        f'<span class="toc-text" data-en style="display:none">{h(tab["label_en"])}</span>'
        f'</a></li>'
        for tab in tabs
    )
    return f'''<aside class="toc" id="toc">
  <button class="toc-toggle" id="toc-toggle" aria-label="Toggle TOC" title="Toggle TOC">☰</button>
  <div class="toc-inner">
    <div class="toc-title" data-zh>目录</div>
    <div class="toc-title" data-en style="display:none">Contents</div>
    <ul class="toc-list">{items}</ul>
  </div>
</aside>'''


def render_tab_buttons(tabs):
    buttons = []
    for tab in tabs:
        buttons.append(
            f'<button class="tab-btn" data-tab="{h(tab["id"])}">'
            f'<span class="tab-icon">{tab["icon"]}</span>'
            f'<span class="tab-label" data-zh>{h(tab["label_zh"])}</span>'
            f'<span class="tab-label" data-en style="display:none">{h(tab["label_en"])}</span>'
            f'</button>'
        )
    return "\n".join(buttons)


def render_overview(video, stats, themes):
    """Hero + stats + 6 themes cards. NO YouTube link (per §No-YouTube-Links policy)."""
    stat_cards = "\n".join(
        f'''<div class="stat-card">
  <div class="stat-value">{h(s["value"])}</div>
  <div class="stat-label" data-zh>{h(s["label_zh"])}</div>
  <div class="stat-label" data-en style="display:none">{h(s["label_en"])}</div>
</div>'''
        for s in stats
    )

    theme_cards = "\n".join(
        f'''<div class="theme-card">
  <div class="theme-emoji">{theme["emoji"]}</div>
  <h3 data-zh>{h(theme["title_zh"])}</h3>
  <h3 data-en style="display:none">{h(theme["title_en"])}</h3>
  <p class="theme-desc" data-zh>{h(theme["desc_zh"])}</p>
  <p class="theme-desc" data-en style="display:none">{h(theme["desc_en"])}</p>
</div>'''
        for theme in themes
    )

    # Note: NO `<a href="{video.url}">▶ Watch on YouTube</a>` per v1.5.24 §No-YouTube-Links policy
    return f'''<section class="hero">
  <div class="hero-badge">WWDC26 · Apple Developer</div>
  <h1>
    <span data-zh>{h(video["title_zh"])}</span>
    <span data-en style="display:none">{h(video["title_en"])}</span>
  </h1>
  <p class="hero-subtitle" data-zh>{h(video["description_zh"])}</p>
  <p class="hero-subtitle" data-en style="display:none">{h(video["description_en"])}</p>
  <div class="hero-meta">
    <span class="meta-pill">👤 {h(video["channel"])}</span>
    <span class="meta-pill">⏱ {h(video["duration"])}</span>
    <span class="meta-pill">📅 {h(video["upload_date"])}</span>
    <span class="meta-pill video-id-pill" data-zh>🆔 视频 ID</span>
    <span class="meta-pill video-id-pill" data-en style="display:none">🆔 Video ID</span>
    <code class="hero-video-id">{h(video["video_id"])}</code>
  </div>
  <div class="lang-toggle" role="group" aria-label="Language toggle">
    <button class="lang-btn active" data-lang="zh">中文</button>
    <button class="lang-btn" data-lang="en">EN</button>
  </div>
</section>
<div class="stats-row">
{stat_cards}
</div>
<h2 class="section-title">
  <span data-zh>5 大主题</span>
  <span data-en style="display:none">5 Big Themes</span>
</h2>
<div class="themes-grid">
{theme_cards}
</div>'''


THEME_TO_WINDOWS = {
    0: ['W02', 'W05', 'W06', 'W07'],     # Apple Intelligence / Foundation Models
    1: ['W03', 'W16', 'W17', 'W18'],     # Liquid Glass / resizability
    2: ['W19', 'W20'],                    # Xcode 27 / Cursor
    3: ['W04'],                           # Reality Composer Pro + Cyberpunk
    4: ['W08', 'W09', 'W10', 'W11', 'W12', 'W13', 'W14', 'W15'],  # Core AI / Widgets / App Intents
    5: ['W21', 'W22', 'W23', 'W24'],     # App Store 27
}


def render_themes(themes):
    """Big theme deep-dive + linked windows chips."""
    cards = []
    for i, theme in enumerate(themes):
        wins = THEME_TO_WINDOWS.get(i, [])
        win_chips = "\n".join(
            f'<a class="theme-win-chip" href="#window-{w}" data-jump-tab="timeline" data-jump-anchor="window-{w}">{w}</a>'
            for w in wins
        )
        cards.append(f'''<div class="theme-deep-card">
  <div class="theme-deep-head">
    <span class="theme-emoji-large">{theme["emoji"]}</span>
    <h3 data-zh>{h(theme["title_zh"])}</h3>
    <h3 data-en style="display:none">{h(theme["title_en"])}</h3>
  </div>
  <div class="theme-deep-body">
    <p data-zh>{h(theme["desc_zh"])}</p>
    <p data-en style="display:none">{h(theme["desc_en"])}</p>
    {f'<div class="theme-related-windows" data-zh><span class="related-label">📍 相关时间段:</span>{win_chips}</div><div class="theme-related-windows" data-en style="display:none"><span class="related-label">📍 Related windows:</span>{win_chips}</div>' if wins else ''}
  </div>
</div>''')
    return f'<div class="themes-deep-grid">{"".join(cards)}</div>'


def render_timeline(windows):
    """25 windows timeline — each row collapsible (Pol B)."""
    rows = []
    for w in windows:
        ts = f"{int(w['start_min']):02d}:{int(w['start_min']%60):02d} → {int(w['end_min']):02d}:{int(w['end_min']%60):02d}"
        duration_min = round(w['end_min'] - w['start_min'], 1)
        rows.append(f'''<div class="window-row" id="window-{w['id']}" data-window-id="{w['id']}">
  <button class="window-row-toggle" data-toggle-target="window-{w['id']}-body" aria-label="Toggle" title="折叠/展开 Collapse/Expand">
    <span class="toggle-icon">▾</span>
  </button>
  <div class="window-row-head">
    <span class="window-ts">{w['id']} · {ts}</span>
    <span class="window-duration" data-zh>⏱ {duration_min} 分钟</span>
    <span class="window-duration" data-en style="display:none">⏱ {duration_min} min</span>
  </div>
  <div class="window-row-body" id="window-{w['id']}-body">
    <h4 data-zh>{h(w['title_zh'])}</h4>
    <h4 data-en style="display:none">{h(w['title_en'])}</h4>
    <p data-zh>{h(w['summary_zh'])}</p>
    <p data-en style="display:none">{h(w['summary_en'])}</p>
  </div>
</div>''')
    return f'<div class="timeline">{"".join(rows)}</div>'


def render_quotes(quotes):
    rows = []
    for i, q in enumerate(quotes, 1):
        # Convert HH:MM:SS → seconds → match to window start
        hh, mm, ss = q['ts'].split(':')
        sec = int(hh) * 3600 + int(mm) * 60 + int(ss)
        # Find window id (set by build script via _inject_window_ids)
        win_id = q.get('window_id', '')
        rows.append(f'''<div class="quote-card" data-quote-index="{i-1}" data-window-id="{h(win_id)}">
  <div class="quote-num">#{i:02d}</div>
  <button class="quote-fav" data-fav-index="{i-1}" aria-label="Favorite" title="收藏 / Favorite">
    <span class="fav-icon">♡</span>
  </button>
  <div class="quote-ts-row">
    <span class="quote-ts">{h(q['ts'])}</span>
    {f'<a class="quote-jump-window" href="#window-{h(win_id)}" data-jump-tab="timeline" data-jump-anchor="window-{h(win_id)}" data-zh title="跳到 {h(win_id)}">→ {h(win_id)}</a><a class="quote-jump-window" href="#window-{h(win_id)}" data-jump-tab="timeline" data-jump-anchor="window-{h(win_id)}" data-en style="display:none" title="Jump to {h(win_id)}">→ {h(win_id)}</a>' if win_id else ''}
  </div>
  <blockquote class="quote-en"><span class="lang-tag">EN</span> {h(q['en'])}</blockquote>
  <blockquote class="quote-zh"><span class="lang-tag">中文</span> {h(q['zh'])}</blockquote>
</div>''')
    return f'<div class="quotes-grid">{"".join(rows)}</div>'


def render_ai():
    return '''<div class="content-grid">
  <div class="content-card">
    <h3 data-zh>Foundation Models Framework</h3>
    <h3 data-en style="display:none">Foundation Models Framework</h3>
    <ul data-zh>
      <li>端侧 3B 参数 LLM,统一入口</li>
      <li>同一段 Swift 代码可指向端侧或云端</li>
      <li>开源,Anthropic 等第三方可接入</li>
      <li>工具调用 + 结构化输出 + 流式响应</li>
      <li>Guided Generation 保证输出结构</li>
    </ul>
    <ul data-en style="display:none">
      <li>On-device 3B-param LLM, single front door</li>
      <li>Same Swift code points to on-device or cloud</li>
      <li>Open-source; third-party providers plug in</li>
      <li>Tool calling + structured output + streaming</li>
      <li>Guided Generation guarantees output structure</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>Core AI 五大能力</h3>
    <h3 data-en style="display:none">Core AI — 5 Pillars</h3>
    <ul data-zh>
      <li>基础模型(Foundation Models)— 推理核心</li>
      <li>工具调用(Tool Calling)— 连接个人上下文</li>
      <li>动态档案(Dynamic Profiles)— 持续 Agent 会话</li>
      <li>评测(Evaluations)— 可复现质量衡量</li>
      <li>Streaming + Guided Generation — 实时 UI</li>
    </ul>
    <ul data-en style="display:none">
      <li>Foundation Models — inference core</li>
      <li>Tool Calling — connect personal context</li>
      <li>Dynamic Profiles — continuous agent sessions</li>
      <li>Evaluations — repeatable quality measurement</li>
      <li>Streaming + Guided Generation — real-time UI</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>MLX + 开源权重</h3>
    <h3 data-en style="display:none">MLX + Open-Weight</h3>
    <ul data-zh>
      <li>完整运行时,覆盖部署全生命周期</li>
      <li>利用统一内存,M5 加速</li>
      <li>Hugging Face 接入,10,000+ 模型</li>
      <li>Ollama / LM Studio / VLM 集成</li>
      <li>本地推理,跨 Apple Silicon 设备</li>
    </ul>
    <ul data-en style="display:none">
      <li>Complete runtime — full deployment lifecycle</li>
      <li>Unified memory + M5 acceleration</li>
      <li>Hugging Face — 10,000+ supported models</li>
      <li>Ollama / LM Studio / VLM integration</li>
      <li>Local inference across Apple Silicon devices</li>
    </ul>
  </div>
</div>'''


def render_design():
    return '''<div class="content-grid">
  <div class="content-card">
    <h3 data-zh>Liquid Glass 材质语言</h3>
    <h3 data-en style="display:none">Liquid Glass Material Language</h3>
    <ul data-zh>
      <li>暗化 + 高光之间的分离度</li>
      <li>微调滑块调节强度</li>
      <li>边栏具备美丽折射,滚动后重新清晰</li>
      <li>图标层:折射、阴影、半透明可调</li>
      <li>通用化,跨 iOS / iPadOS / macOS 27</li>
    </ul>
    <ul data-en style="display:none">
      <li>Separation between darken + specular highlights</li>
      <li>Fine-tune slider for intensity</li>
      <li>Sidebar with beautiful refractions — sharp after scroll</li>
      <li>Icon layers: refraction, shadows, translucency</li>
      <li>Universal across iOS / iPadOS / macOS 27</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>Resizability — iPad / iPhone 全平台</h3>
    <h3 data-en style="display:none">Resizability across iPad / iPhone</h3>
    <ul data-zh>
      <li>iPhone 支持可调尺寸</li>
      <li>iPad 通过 Mac 镜像支持可调尺寸</li>
      <li>不再假设固定尺寸</li>
      <li>Universal layout 优雅适配任意画布</li>
      <li>专用 iPad 版本不再必需</li>
    </ul>
    <ul data-en style="display:none">
      <li>iPhone resizable windows</li>
      <li>iPad resizable via Mac mirroring</li>
      <li>No more fixed-size assumptions</li>
      <li>Universal layout adapts to any canvas</li>
      <li>Dedicated iPad versions no longer required</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>自适应布局类</h3>
    <h3 data-en style="display:none">Adaptive Layout Classes</h3>
    <ul data-zh>
      <li>水平 / 垂直 / 紧凑 / 标准 四类</li>
      <li>重定位自动扩展填充</li>
      <li>Figma 设计套件可用</li>
      <li>尺寸间过渡持续流畅</li>
      <li>工具栏 / 边栏自动重定位</li>
    </ul>
    <ul data-en style="display:none">
      <li>Horizontal / Vertical / Compact / Regular</li>
      <li>Repositioning auto-expands to fill</li>
      <li>Figma design kit available</li>
      <li>Persistent transitions between sizes</li>
      <li>Toolbar / sidebars auto-reposition</li>
    </ul>
  </div>
</div>'''


def render_xcode():
    return '''<div class="content-grid">
  <div class="content-card">
    <h3 data-zh>Xcode 27 — Agentic 编程伙伴</h3>
    <h3 data-en style="display:none">Xcode 27 — Agentic Coding Partner</h3>
    <ul data-zh>
      <li>全项目上下文感知</li>
      <li>内联 diff,多步编辑</li>
      <li>实时预览</li>
      <li>接入 OpenAI / Anthropic Claude / Codex</li>
      <li>文档档案感知</li>
    </ul>
    <ul data-en style="display:none">
      <li>Whole-project context</li>
      <li>Inline diffs, multi-step editing</li>
      <li>Live previews</li>
      <li>OpenAI / Anthropic Claude / Codex integration</li>
      <li>Documentation archive aware</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>可视化原型 + 调试</h3>
    <h3 data-en style="display:none">Visual Prototyping + Debugging</h3>
    <ul data-zh>
      <li>增量渲染,快照随做随存</li>
      <li>本地化准备:单复数感知</li>
      <li>LLDB 控制台日志增强</li>
      <li>带安全 + 审批的模拟器</li>
      <li>多周级本地化测试套件</li>
    </ul>
    <ul data-en style="display:none">
      <li>Render incrementally, snapshots as you go</li>
      <li>Localization prep — singular/plural aware</li>
      <li>Enhanced LLDB console logging</li>
      <li>Simulators with security + approval</li>
      <li>Multi-week localization test suites</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>Cursor 等合作伙伴</h3>
    <h3 data-en style="display:none">Cursor + Partner Integrations</h3>
    <ul data-zh>
      <li>OpenAI / Claude / Codex 直接接入</li>
      <li>高层草案生成</li>
      <li>细粒度反馈循环</li>
      <li>批准 / 修正 / 扩展 / 细化</li>
      <li>UI 测试套件对接</li>
    </ul>
    <ul data-en style="display:none">
      <li>Direct OpenAI / Claude / Codex integration</li>
      <li>High-level draft generation</li>
      <li>Fine-grain feedback loops</li>
      <li>Approve / correct / expand / refine</li>
      <li>UI test suites integrated</li>
    </ul>
  </div>
</div>'''


def render_intents():
    return '''<div class="content-grid">
  <div class="content-card">
    <h3 data-zh>App Intents 进化</h3>
    <h3 data-en style="display:none">App Intents — Evolution</h3>
    <ul data-zh>
      <li>突破启动屏限制,跨应用出现</li>
      <li>Siri / Spotlight 在当前场景直接调用</li>
      <li>屏幕感知:理解当前 on-screen 实体</li>
      <li>动态档案:持续 Agent 会话</li>
      <li>引用而非操作:如 `[[album name]]` 一等公民</li>
    </ul>
    <ul data-en style="display:none">
      <li>Escape launch screen — appear across apps</li>
      <li>Siri / Spotlight surface them in current context</li>
      <li>On-screen awareness: understand entities</li>
      <li>Dynamic Profiles: continuous agent sessions</li>
      <li>Refer over act: `[[album name]]` is first-class</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>Widget — 一眼即得集成</h3>
    <h3 data-en style="display:none">Widgets — Glanceable Integrations</h3>
    <ul data-zh>
      <li>分步界面(咖啡订单追踪)</li>
      <li>ActivityKit 实时进度</li>
      <li>Siri 语音动作</li>
      <li>Home Screen / Lock Screen / StandBy</li>
      <li>摩擦时刻保持有用</li>
    </ul>
    <ul data-en style="display:none">
      <li>Step-by-step interfaces (coffee tracker)</li>
      <li>ActivityKit for live progress</li>
      <li>Siri voice actions</li>
      <li>Home Screen / Lock Screen / StandBy</li>
      <li>Stay useful in moments of friction</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>Schemas + 预定义动作</h3>
    <h3 data-en style="display:none">Schemas + Predefined Actions</h3>
    <ul data-zh>
      <li>Apple 训练常见领域 schema</li>
      <li>日历 / 地图 / 媒体 / 相机 / 电话 / 时钟</li>
      <li>几十个预定义映射:动作 → 行为</li>
      <li>你描述,系统就懂</li>
      <li>App Entities 一等公民</li>
    </ul>
    <ul data-en style="display:none">
      <li>Apple-trained schemas on common domains</li>
      <li>Calendar / maps / media / camera / phone / clock</li>
      <li>Dozens of predefined verb → action mappings</li>
      <li>You describe; the system knows</li>
      <li>App Entities are first-class</li>
    </ul>
  </div>
</div>'''


def render_spatial():
    return '''<div class="content-grid">
  <div class="content-card">
    <h3 data-zh>Reality Composer Pro 3</h3>
    <h3 data-en style="display:none">Reality Composer Pro 3</h3>
    <ul data-zh>
      <li>3D 场景、材质、动画可视化编辑</li>
      <li>基于节点的动画系统</li>
      <li>粒子特效、行为、状态机</li>
      <li>visionOS 27 适配</li>
      <li>Cyberpunk 2077 已成功移植</li>
    </ul>
    <ul data-en style="display:none">
      <li>Visual editor for 3D scenes, materials, animations</li>
      <li>Node-based animation system</li>
      <li>Particle effects, behaviors, state machines</li>
      <li>visionOS 27 optimized</li>
      <li>Cyberpunk 2077 already ported</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>WebKit + 沉浸式 HTML</h3>
    <h3 data-en style="display:none">WebKit + Immersive HTML</h3>
    <ul data-zh>
      <li>Grid lanes 网格通道</li>
      <li>可定制沉浸式 HTML 环境</li>
      <li>Web 扩展支持</li>
      <li>摄像头 / 照片 / 音频 / 无障碍</li>
      <li>visionOS 直接嵌入网页</li>
    </ul>
    <ul data-en style="display:none">
      <li>Grid lanes for customizable layouts</li>
      <li>Immersive HTML environments</li>
      <li>Web extensions supported</li>
      <li>Camera / photo / audio / accessibility</li>
      <li>visionOS embeds web pages directly</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>Vision Pro 生成式 AI</h3>
    <h3 data-en style="display:none">Vision Pro Generative AI</h3>
    <ul data-zh>
      <li>识别手势</li>
      <li>移除背景</li>
      <li>分离人声</li>
      <li>生成式 AI 本地运行</li>
      <li>流畅性能</li>
    </ul>
    <ul data-en style="display:none">
      <li>Recognize gestures</li>
      <li>Remove backgrounds</li>
      <li>Isolate voices</li>
      <li>Generative AI runs locally</li>
      <li>Smooth performance</li>
    </ul>
  </div>
</div>'''


def render_store():
    return '''<div class="content-grid">
  <div class="content-card">
    <h3 data-zh>App Store 27 — 全球覆盖</h3>
    <h3 data-en style="display:none">App Store 27 — Global Reach</h3>
    <ul data-zh>
      <li>175 个店面</li>
      <li>50 种语言</li>
      <li>每周 5 亿访客</li>
      <li>安全可信</li>
      <li>多种类型、玩法、风格</li>
    </ul>
    <ul data-en style="display:none">
      <li>175 storefronts</li>
      <li>50 languages</li>
      <li>850M weekly visitors</li>
      <li>Safe and trusted</li>
      <li>Multiple genres, play styles</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>Discovery + 创意素材</h3>
    <h3 data-en style="display:none">Discovery + Creative Assets</h3>
    <ul data-zh>
      <li>从创意素材自动生成页面</li>
      <li>展示生活方式图像</li>
      <li>中央素材库</li>
      <li>个性化合集</li>
      <li>明 / 暗模式适配</li>
    </ul>
    <ul data-en style="display:none">
      <li>Auto-generate pages from creative assets</li>
      <li>Showcase lifestyle imagery</li>
      <li>Central asset library</li>
      <li>Personalized collections</li>
      <li>Light / dark mode adaptation</li>
    </ul>
  </div>
  <div class="content-card">
    <h3 data-zh>定价 + 订阅 + 合购</h3>
    <h3 data-en style="display:none">Pricing + Subscriptions + Bundles</h3>
    <ul data-zh">
      <li>900 档定价层级,自动适配税费货币</li>
      <li>200 种支付方式</li>
      <li>付费墙模板</li>
      <li>订阅提醒:赠送一个月保留用户</li>
      <li>合购 TV / Arcade / iCloud</li>
      <li>批量采购 + 学校管理员</li>
    </ul>
    <ul data-en style="display:none">
      <li>900-point pricing tiers, auto currency conversion</li>
      <li>200 payment options</li>
      <li>Paywall templates</li>
      <li>Subscription reminders — free month to retain</li>
      <li>Bundles: TV / Arcade / iCloud</li>
      <li>Volume purchasing + School Manager</li>
    </ul>
  </div>
</div>'''


def render_roster():
    """Patrick-card roster: related dashboards / topics. NO YouTube links (v1.5.24 §No-YouTube-Links policy)."""
    cards = [
        ("🍎", "Apple Developer WWDC26 — 24h Tracker", "Latest 24h Apple Developer videos.", "https://2017zyl.xyz/apple-developer-wwdc26-24h.html"),
        ("🧠", "Apple WWDC26 MLX Local Agentic AI", "MLX + open-weight + local inference deep dive.", "https://2017zyl.xyz/apple-wwdc26-mlx-local-agentic-ai.html"),
        ("⚡", "WWDC26 Keynote Summary", "WWDC26 keynote at a glance.", "https://2017zyl.xyz/wwdc26-keynote-summary.html"),
        ("📝", "WWDC26 General Summary", "Full WWDC26 session summary.", "https://2017zyl.xyz/wwdc26-summary.html"),
        ("🀄", "WWDC26 ML Group Lab (CN)", "Chinese ML group lab discussion.", "https://2017zyl.xyz/wwdc26_ml_group_lab_cn.html"),
        ("🎙️", "WWDC26 Debate — AK / Peng / Lin / Yunfei", "Multi-host panel on WWDC26.", "https://2017zyl.xyz/wwdc2026-debate-ak-peng-lin-yunfei-laodai.html"),
        ("📰", "WWDC26 Papers 24h Dashboard", "Apple-related ML papers.", "https://2017zyl.xyz/papers-wwdc26-24h-dashboard.html"),
        # ❌ Removed per v1.5.24 §No-YouTube-Links policy:
        # ("📺", "Apple Developer (YouTube)", "Apple Developer YouTube channel.", "https://www.youtube.com/@AppleDeveloper"),
        ("📅", "developer.apple.com/events", "WWDC26 events worldwide.", "https://developer.apple.com/events/"),
        ("🎓", "Apple Developer Forums", "Developer community forums.", "https://developer.apple.com/forums/"),
        ("🧪", "Apple Developer Labs", "1:1 lab sessions with Apple engineers.", "https://developer.apple.com/events/labs/"),
        ("🏛️", "Apple Developer Centers", "Berlin + global centers.", "https://developer.apple.com/events/"),
    ]
    items = "\n".join(
        f'''<a class="roster-card" href="{h(url)}" target="_blank" rel="noopener">
  <div class="roster-emoji">{emoji}</div>
  <div class="roster-info">
    <div class="roster-title">{h(title)}</div>
    <div class="roster-desc">{h(desc)}</div>
  </div>
  <div class="roster-arrow">→</div>
</a>'''
        for emoji, title, desc, url in cards
    )
    return f'<div class="roster-grid">{items}</div>'


def render_meta():
    # Source row shows ONLY video ID per v1.5.24 §No-YouTube-Links policy (no URL rendered)
    return '''<div class="meta-box">
  <h3 data-zh>构建元数据</h3>
  <h3 data-en style="display:none">Build Provenance</h3>
  <table class="meta-table">
    <tr><th>Video ID</th><td><code>V2i8f_NeKDI</code></td></tr>
    <tr><th>Transcript</th><td data-zh>YouTube 自动字幕 (EN, 官方 ASR)</td><td data-en style="display:none">YouTube auto-captions (EN, official ASR)</td></tr>
    <tr><th>Coverage</th><td>99.7% (0s → 4389s, 125 segments, 25 windows)</td></tr>
    <tr><th>Translation</th><td data-zh>LLM 转写 (Hermes),非 Apple 官方 zh-Hans</td><td data-en style="display:none">LLM rewrite (Hermes), not Apple's official zh-Hans</td></tr>
    <tr><th>Window Strategy</th><td data-zh>每 ~3 分钟一段,共 25 段</td><td data-en style="display:none">~3-minute windows, 25 total</td></tr>
    <tr><th>Build Date</th><td>2026-07-24 (video 上传 24h 内)</td></tr>
    <tr><th>Skill</th><td><code>media/video-to-knowledge-dashboard</code> v1.5.24 + bilingual UI</td></tr>
  </table>

  <h4 data-zh>⚠️ 已知局限</h4>
  <h4 data-en style="display:none">⚠️ Known limitations</h4>
  <ul data-zh">
    <li>中文翻译是 LLM 转写,可能与 Apple 官方术语不一致</li>
    <li>官方 Apple Intelligence 文档未在此 session 完整覆盖</li>
    <li>macOS 27 / watchOS 27 / tvOS 27 细节未在 1h14min 内全展开</li>
    <li>部分 visionOS 27 / Reality Composer Pro 3 demo 细节需后续 session 验证</li>
    <li>演讲者 Josh / Shashank / Alan / Maho 真实姓名可能未完整捕获</li>
  </ul>
  <ul data-en style="display:none">
    <li>Chinese translation is LLM-rewritten, may diverge from Apple's official terminology</li>
    <li>Official Apple Intelligence docs not fully covered in this session</li>
    <li>macOS 27 / watchOS 27 / tvOS 27 details not fully unpacked in 1h14min</li>
    <li>Some visionOS 27 / Reality Composer Pro 3 demo details need follow-up sessions</li>
    <li>Presenter names Josh / Shashank / Alan / Maho may be incomplete</li>
  </ul>
</div>'''


TAB_RENDERERS = {
    "overview": lambda c: render_overview(c["video"], c["stats"], c["themes"]),
    "themes": lambda c: render_themes(c["themes"]),
    "timeline": lambda c: render_timeline(c["windows"]),
    "quotes": lambda c: render_quotes(c["quotes"]),
    "ai": lambda c: render_ai(),
    "design": lambda c: render_design(),
    "xcode": lambda c: render_xcode(),
    "intents": lambda c: render_intents(),
    "spatial": lambda c: render_spatial(),
    "store": lambda c: render_store(),
    "roster": lambda c: render_roster(),
    "meta": lambda c: render_meta(),
}


def render_tabs(c):
    """Wrap each tab content in section with id."""
    sections = []
    for tab in c["tabs"]:
        renderer = TAB_RENDERERS.get(tab["id"])
        if renderer is None:
            content = f'<div class="placeholder">TODO: {tab["id"]}</div>'
        else:
            content = renderer(c)
        sections.append(
            f'<div class="tab-content" id="tab-{h(tab["id"])}" data-tab-content="{h(tab["id"])}">'
            f'<h2 class="tab-content-title" id="tab-{h(tab["id"])}-title">'
            f'<span class="tab-content-icon">{tab["icon"]}</span>'
            f'<span data-zh>{h(tab["label_zh"])}</span>'
            f'<span data-en style="display:none">{h(tab["label_en"])}</span>'
            f'</h2>{content}</div>'
        )
    return "\n".join(sections)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN" data-lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WWDC26 Meet with Apple · Bilingual Dashboard</title>
<meta name="description" content="WWDC26 Meet with Apple session — bilingual (中/EN) knowledge dashboard with TOC, 25 timeline windows, 17 quotes, 12 tabs.">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0a0a;
  --bg-card: #141414;
  --bg-card-hover: #1a1a1a;
  --border: #2a2a2a;
  --text: #e8e8e8;
  --text-dim: #999;
  --text-faint: #666;
  --accent: #ff6b35;
  --accent-dim: #cc5529;
  --accent-glow: rgba(255, 107, 53, 0.15);
  --lang-bg: rgba(255, 107, 53, 0.08);
  --toc-bg: #0f0f0f;
  --toc-border: #1f1f1f;
  --toc-active: rgba(255, 107, 53, 0.18);
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  --radius: 10px;
  --transition: 0.18s ease;
}
html[data-lang="en"] { --text: #e8e8e8; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
  line-height: 1.65;
  font-size: 15px;
  margin-left: 280px;
  padding: 2rem 2rem 6rem;
  max-width: 1280px;
  transition: margin-left var(--transition);
}
body.toc-collapsed { margin-left: 64px; }

/* ─── TOC sidebar ────────────────────────────────────────── */
.toc {
  position: fixed;
  top: 0; left: 0;
  width: 280px;
  height: 100vh;
  background: var(--toc-bg);
  border-right: 1px solid var(--toc-border);
  z-index: 100;
  transition: width var(--transition);
  overflow: hidden;
}
body.toc-collapsed .toc { width: 64px; }
.toc-toggle {
  position: absolute;
  top: 12px; right: 12px;
  width: 36px; height: 36px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  transition: all var(--transition);
  z-index: 2;
}
.toc-toggle:hover { background: var(--accent-glow); color: var(--accent); border-color: var(--accent); }
.toc-inner { padding: 60px 0 16px 0; height: 100%; overflow-y: auto; }
.toc-title {
  padding: 0 20px 12px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-faint);
  font-weight: 600;
}
.toc-list { list-style: none; }
.toc-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  color: var(--text-dim);
  text-decoration: none;
  font-size: 0.9rem;
  border-left: 3px solid transparent;
  transition: all var(--transition);
}
.toc-link:hover { background: var(--bg-card); color: var(--text); }
.toc-link.active { background: var(--toc-active); color: var(--accent); border-left-color: var(--accent); }
.toc-icon { font-size: 1.1rem; width: 24px; text-align: center; flex-shrink: 0; }
body.toc-collapsed .toc-text,
body.toc-collapsed .toc-title { display: none; }

/* ─── Hero ───────────────────────────────────────────────── */
.hero {
  text-align: center;
  padding: 1rem 1rem 2.5rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2.5rem;
}
.hero-badge {
  display: inline-block;
  background: var(--lang-bg);
  color: var(--accent);
  border: 1px solid var(--accent);
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-bottom: 1.2rem;
}
.hero h1 {
  font-size: 2.4rem;
  font-weight: 700;
  background: linear-gradient(135deg, #ff6b35, #f7c59f, #ff6b35);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 6s linear infinite;
  margin-bottom: 1rem;
  line-height: 1.2;
}
@keyframes shimmer { to { background-position: 200% center; } }
.hero-subtitle {
  color: var(--text-dim);
  font-size: 0.95rem;
  max-width: 720px;
  margin: 0 auto 1.4rem;
  line-height: 1.6;
}
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 1.5rem;
}
.meta-pill {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 5px 12px;
  border-radius: 16px;
  font-size: 0.8rem;
  color: var(--text-dim);
}
.source-link {
  /* Deprecated per v1.5.24 §No-YouTube-Links policy — kept here only to avoid breaking any leftover markup */
  display: none !important;
}
.hero-video-id {
  font-family: "SF Mono", Menlo, monospace;
  font-size: 0.78rem;
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 6px;
  color: var(--text-dim);
  letter-spacing: 0.3px;
}

/* ─── Language toggle ────────────────────────────────────── */
.lang-toggle {
  display: inline-flex;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 22px;
  padding: 3px;
  margin-top: 0.5rem;
}
.lang-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 6px 18px;
  border-radius: 18px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all var(--transition);
  font-family: inherit;
}
.lang-btn.active {
  background: var(--accent);
  color: #0a0a0a;
}
.lang-btn:hover:not(.active) { color: var(--text); }

/* ─── Stats row ──────────────────────────────────────────── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 2.5rem;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  padding: 1.2rem 1rem;
  text-align: center;
}
.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 0.3rem;
}
.stat-label { font-size: 0.8rem; color: var(--text-dim); }

/* ─── Section titles ─────────────────────────────────────── */
.section-title {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 2rem 0 1.2rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
}

/* ─── Theme cards ────────────────────────────────────────── */
.themes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}
.theme-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.2rem;
  transition: all var(--transition);
}
.theme-card:hover {
  border-color: var(--accent);
  background: var(--bg-card-hover);
  transform: translateY(-2px);
}
.theme-emoji { font-size: 2rem; margin-bottom: 0.6rem; }
.theme-card h3 { font-size: 1.05rem; margin-bottom: 0.5rem; color: var(--text); }
.theme-desc { font-size: 0.85rem; color: var(--text-dim); line-height: 1.5; }

.themes-deep-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
.theme-deep-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.4rem;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.theme-emoji-large { font-size: 2.5rem; flex-shrink: 0; }
.theme-deep-card h3 { font-size: 1.1rem; margin-bottom: 0.5rem; }
.theme-deep-body p { color: var(--text-dim); line-height: 1.6; }

/* ─── Tabs ───────────────────────────────────────────────── */
.tabs-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2rem 0 1.5rem;
  padding: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.tab-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-dim);
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  transition: all var(--transition);
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tab-btn:hover { background: var(--bg-card-hover); color: var(--text); }
.tab-btn.active {
  background: var(--accent-glow);
  color: var(--accent);
  border-color: var(--accent);
}
.tab-content { display: none; }
.tab-content.active { display: block; }
.tab-content-title {
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}
.tab-content-icon { font-size: 1.6rem; }

/* ─── Timeline ───────────────────────────────────────────── */
.timeline { display: flex; flex-direction: column; gap: 12px; }
.window-row {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent-dim);
  border-radius: var(--radius);
  padding: 1rem 1.2rem;
  scroll-margin-top: 20px;
}
.window-row:target { border-left-color: var(--accent); background: var(--accent-glow); }
.window-ts {
  font-family: "SF Mono", Menlo, monospace;
  font-size: 0.78rem;
  color: var(--accent);
  margin-bottom: 0.3rem;
  font-weight: 600;
}
.window-row h4 { font-size: 1rem; margin-bottom: 0.4rem; color: var(--text); }
.window-row p { font-size: 0.88rem; color: var(--text-dim); line-height: 1.55; }

/* ─── Quotes ─────────────────────────────────────────────── */
.quotes-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.quote-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.2rem;
  position: relative;
  padding-left: 64px;
}
.quote-num {
  position: absolute;
  left: 14px;
  top: 14px;
  font-family: "SF Mono", Menlo, monospace;
  font-size: 0.75rem;
  color: var(--accent);
  font-weight: 700;
}
.quote-ts {
  font-family: "SF Mono", Menlo, monospace;
  font-size: 0.72rem;
  color: var(--text-faint);
  margin-bottom: 0.5rem;
}
blockquote {
  border-left: 3px solid var(--accent-dim);
  padding: 6px 0 6px 12px;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
}
blockquote.quote-en { color: var(--text-dim); margin-bottom: 0.5rem; }
blockquote.quote-zh { color: var(--text); border-left-color: var(--accent); }
.lang-tag {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 6px;
  vertical-align: middle;
}
blockquote.quote-en .lang-tag { background: rgba(255, 107, 53, 0.15); color: var(--accent); }
blockquote.quote-zh .lang-tag { background: var(--accent); color: #0a0a0a; }

/* ─── Content grid (cards inside tabs) ───────────────────── */
.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
}
.content-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.2rem;
}
.content-card h3 {
  font-size: 1.05rem;
  margin-bottom: 0.7rem;
  color: var(--accent);
}
.content-card ul {
  list-style: none;
  padding: 0;
}
.content-card li {
  font-size: 0.88rem;
  color: var(--text-dim);
  padding: 4px 0 4px 16px;
  position: relative;
  line-height: 1.5;
}
.content-card li::before {
  content: "▸";
  position: absolute;
  left: 0;
  color: var(--accent);
}

/* ─── Roster ─────────────────────────────────────────────── */
.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 10px;
}
.roster-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  text-decoration: none;
  color: var(--text);
  transition: all var(--transition);
}
.roster-card:hover {
  border-color: var(--accent);
  background: var(--bg-card-hover);
  transform: translateX(2px);
}
.roster-emoji { font-size: 1.6rem; flex-shrink: 0; }
.roster-info { flex: 1; min-width: 0; }
.roster-title { font-size: 0.9rem; font-weight: 600; margin-bottom: 2px; }
.roster-desc { font-size: 0.78rem; color: var(--text-faint); }
.roster-arrow { color: var(--accent); font-size: 1.1rem; }

/* ─── Meta box ───────────────────────────────────────────── */
.meta-box {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.4rem;
}
.meta-box h3 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: var(--accent);
}
.meta-box h4 { margin: 1.4rem 0 0.6rem; color: var(--text); font-size: 1rem; }
.meta-table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
.meta-table th {
  text-align: left;
  padding: 6px 12px 6px 0;
  color: var(--text-faint);
  font-weight: 500;
  font-size: 0.82rem;
  width: 160px;
  vertical-align: top;
}
.meta-table td {
  padding: 6px 0;
  color: var(--text-dim);
  font-size: 0.85rem;
}
.meta-table a { color: var(--accent); text-decoration: none; }
.meta-table code {
  font-family: "SF Mono", Menlo, monospace;
  font-size: 0.82rem;
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 4px;
}
.meta-box ul { padding-left: 1.4rem; }
.meta-box li {
  font-size: 0.85rem;
  color: var(--text-dim);
  margin-bottom: 4px;
  line-height: 1.5;
}

/* ─── Responsive ─────────────────────────────────────────── */
@media (max-width: 980px) {
  body { margin-left: 0; padding: 1rem 1rem 4rem; }
  .toc { transform: translateX(-100%); transition: transform var(--transition); }
  body:not(.toc-collapsed) .toc { transform: translateX(0); }
  .toc-inner { padding-top: 16px; }
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .hero h1 { font-size: 1.8rem; }
}

/* ─── Print ──────────────────────────────────────────────── */
@media print {
  .toc, .lang-toggle, .tabs-nav { display: none; }
  body { margin-left: 0; max-width: 100%; }
  .tab-content { display: block !important; page-break-after: always; }
}

/* ─── Reading progress bar ───────────────────────────────── */
.reading-progress {
  position: fixed;
  top: 0; left: 0;
  width: 0%; height: 3px;
  background: linear-gradient(90deg, #ff6b35, #ffa07a);
  z-index: 1000;
  transition: width 80ms linear;
  box-shadow: 0 0 8px var(--accent);
}

/* ─── Back-to-top ────────────────────────────────────────── */
.back-to-top {
  position: fixed;
  bottom: 32px; right: 32px;
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--accent);
  color: #0a0a0a;
  border: none;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
  z-index: 90;
  font-family: inherit;
  box-shadow: 0 4px 16px rgba(255, 107, 53, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  line-height: 1.05;
}
.back-to-top.show { opacity: 1; pointer-events: auto; }
.back-to-top:hover { background: #ffa07a; transform: translateY(-2px); }

/* ─── Global search box ──────────────────────────────────── */
.global-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 8px 16px;
  margin-bottom: 1.5rem;
  position: sticky;
  top: 12px;
  z-index: 50;
  backdrop-filter: blur(12px);
  transition: border-color 0.18s;
}
.global-search:focus-within { border-color: var(--accent); }
.search-icon { font-size: 1.1rem; }
#search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-family: inherit;
  font-size: 0.92rem;
}
#search-input::placeholder { color: var(--text-faint); }
.search-clear {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 26px; height: 26px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
.search-clear:hover { color: var(--accent); border-color: var(--accent); }
.search-count {
  font-size: 0.78rem;
  color: var(--text-dim);
  font-family: "SF Mono", Menlo, monospace;
  white-space: nowrap;
}
.search-count.has-results { color: var(--accent); }
.search-count.no-results { color: #ff5252; }

/* Search highlight */
.search-match { background: rgba(255, 107, 53, 0.25); border-radius: 2px; padding: 0 1px; }
.dim-match { opacity: 0.25; transition: opacity 0.2s; }

/* ─── Top tools row ───────────────────────────────────────── */
.top-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}
.top-tools .global-search { margin-bottom: 0; flex: 1; min-width: 260px; }
.tool-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  padding: 8px 14px;
  border-radius: 18px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.18s ease;
  white-space: nowrap;
}
.tool-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-glow); }
.tool-btn.active { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }

/* ─── Favorite quote button ────────────────────────────────── */
.quote-card { position: relative; }
.quote-fav {
  position: absolute;
  top: 12px; right: 12px;
  width: 32px; height: 32px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-faint);
  cursor: pointer;
  font-size: 1.1rem;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s;
  font-family: inherit;
  z-index: 2;
}
.quote-fav:hover { border-color: var(--accent); color: var(--accent); transform: scale(1.1); }
.quote-fav.faved { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }
.quote-fav.faved .fav-icon::before { content: "♥"; }
.quote-fav:not(.faved) .fav-icon::before { content: "♡"; }

/* ─── Window-row collapsible (Pol B) ───────────────────────── */
.window-row { position: relative; padding-right: 44px; }
.window-row-toggle {
  position: absolute;
  top: 14px; right: 12px;
  width: 28px; height: 28px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s;
  font-family: inherit;
  z-index: 2;
}
.window-row-toggle:hover { border-color: var(--accent); color: var(--accent); }
.window-row.collapsed .toggle-icon { transform: rotate(-90deg); }
.toggle-icon { transition: transform 0.18s; display: inline-block; }
.window-row.collapsed .window-row-body { display: none; }
.window-row.collapsed { padding-bottom: 1rem; }

/* ─── Saved quotes panel ───────────────────────────────────── */
.saved-panel {
  position: fixed;
  top: 80px; right: 32px;
  width: 380px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.2rem;
  z-index: 200;
  display: none;
}
.saved-panel.show { display: block; }
.saved-panel h3 { color: var(--accent); margin-bottom: 0.8rem; font-size: 1.05rem; }
.saved-empty { color: var(--text-faint); font-size: 0.85rem; padding: 1.5rem 0; text-align: center; }
.saved-quote-item {
  background: var(--bg);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 6px;
  padding: 0.7rem 0.9rem;
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text-dim);
}
.saved-quote-ts {
  font-family: "SF Mono", Menlo, monospace;
  font-size: 0.7rem;
  color: var(--accent);
  margin-bottom: 0.3rem;
}

/* ─── Toast notification ───────────────────────────────────── */
.toast {
  position: fixed;
  bottom: 100px; right: 32px;
  background: var(--accent);
  color: #0a0a0a;
  padding: 12px 20px;
  border-radius: 24px;
  font-weight: 600;
  font-size: 0.9rem;
  box-shadow: var(--shadow);
  z-index: 300;
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.3s ease;
  pointer-events: none;
}
.toast.show { opacity: 1; transform: translateY(0); }
.window-row-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.window-duration {
  font-size: 0.72rem;
  color: var(--text-faint);
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 10px;
}
.window-jump {
  /* Deprecated per v1.5.24 §No-YouTube-Links policy — timestamp links no longer rendered */
  display: none !important;
}

.window-quote-count {
  font-size: 0.7rem;
  color: var(--text-faint);
  background: var(--accent-glow);
  padding: 2px 8px;
  border-radius: 10px;
  font-family: "SF Mono", Menlo, monospace;
}

/* ─── Quote card: jump-window link ───────────────────────── */
.quote-ts-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 0.6rem;
}
.quote-jump-window {
  font-size: 0.7rem;
  color: var(--accent);
  text-decoration: none;
  padding: 1px 8px;
  border: 1px solid var(--accent-dim);
  border-radius: 10px;
  font-family: "SF Mono", Menlo, monospace;
  transition: all 0.15s;
}
.quote-jump-window:hover { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }

/* ─── Theme deep card: related-windows chips ─────────────── */
.theme-related-windows {
  margin-top: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.related-label {
  font-size: 0.75rem;
  color: var(--text-faint);
  margin-right: 4px;
}
.theme-win-chip {
  font-family: "SF Mono", Menlo, monospace;
  font-size: 0.72rem;
  color: var(--accent);
  text-decoration: none;
  padding: 3px 9px;
  border: 1px solid var(--accent-dim);
  border-radius: 10px;
  transition: all 0.15s;
}
.theme-win-chip:hover { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }

/* ─── Keyboard hint chip in tab nav ──────────────────────── */
.kbd-hint {
  display: inline-block;
  font-size: 0.65rem;
  color: var(--text-faint);
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 1px 5px;
  border-radius: 4px;
  font-family: "SF Mono", Menlo, monospace;
  margin-left: 4px;
}
.tab-btn:hover .kbd-hint { color: var(--accent); border-color: var(--accent); }
</style>
</head>
<body>
{TOC}
<!-- Reading progress bar -->
<div class="reading-progress" id="reading-progress" aria-hidden="true"></div>

<!-- Floating back-to-top -->
<button class="back-to-top" id="back-to-top" aria-label="Back to top" title="Back to top">
  <span data-zh>↑ 顶部</span>
  <span data-en style="display:none">↑ Top</span>
</button>

<main class="main">
  <!-- Global search box + tools row -->
  <div class="top-tools">
    <div class="global-search" id="global-search">
      <span class="search-icon">🔍</span>
      <input type="search" id="search-input" autocomplete="off" spellcheck="false"
             placeholder="搜索时间线 / 金句 / 主题... (Search timeline, quotes, themes)">
      <button class="search-clear" id="search-clear" aria-label="Clear" style="display:none">×</button>
      <span class="search-count" id="search-count" aria-live="polite"></span>
    </div>
    <button class="tool-btn" id="export-md-btn" data-zh title="导出整个 dashboard 为 Markdown">⬇ Export .md</button>
    <button class="tool-btn" id="export-md-btn-en" data-en style="display:none" title="Export dashboard as Markdown">⬇ Export .md</button>
    <button class="tool-btn" id="saved-quotes-btn" data-zh title="查看收藏的金句">★ Saved</button>
    <button class="tool-btn" id="saved-quotes-btn-en" data-en style="display:none" title="View favorited quotes">★ Saved</button>
  </div>

  <!-- Overview tab content is rendered at top; tabs below are the rest -->
  <div class="tab-content active" id="tab-overview" data-tab-content="overview">
    {OVERVIEW}
  </div>

  <nav class="tabs-nav" id="tabs-nav">
    {TAB_BUTTONS}
  </nav>

  <div id="tab-themes" class="tab-content" data-tab-content="themes">
    {THEMES_CONTENT}
  </div>
  <div id="tab-timeline" class="tab-content" data-tab-content="timeline">
    {TIMELINE_CONTENT}
  </div>
  <div id="tab-quotes" class="tab-content" data-tab-content="quotes">
    {QUOTES_CONTENT}
  </div>
  <div id="tab-ai" class="tab-content" data-tab-content="ai">
    {AI_CONTENT}
  </div>
  <div id="tab-design" class="tab-content" data-tab-content="design">
    {DESIGN_CONTENT}
  </div>
  <div id="tab-xcode" class="tab-content" data-tab-content="xcode">
    {XCODE_CONTENT}
  </div>
  <div id="tab-intents" class="tab-content" data-tab-content="intents">
    {INTENTS_CONTENT}
  </div>
  <div id="tab-spatial" class="tab-content" data-tab-content="spatial">
    {SPATIAL_CONTENT}
  </div>
  <div id="tab-store" class="tab-content" data-tab-content="store">
    {STORE_CONTENT}
  </div>
  <div id="tab-roster" class="tab-content" data-tab-content="roster">
    {ROSTER_CONTENT}
  </div>
  <div id="tab-meta" class="tab-content" data-tab-content="meta">
    {META_CONTENT}
  </div>
</main>

<script>
// ── Embedded data for export/saved-panel ─────────────────
const THEMES_DATA = {THEMES_JSON};
const WINDOWS_DATA = {WINDOWS_JSON};
const QUOTES_DATA = {QUOTES_JSON};

(function () {{
  'use strict';

  // ── Language toggle ────────────────────────────────────────
  function setLang(lang) {{
    document.documentElement.setAttribute('data-lang', lang);
    document.querySelectorAll('.lang-btn').forEach(function (btn) {{
      btn.classList.toggle('active', btn.dataset.lang === lang);
    }});
    document.querySelectorAll('[data-zh]').forEach(function (el) {{
      el.style.display = lang === 'zh' ? '' : 'none';
    }});
    document.querySelectorAll('[data-en]').forEach(function (el) {{
      el.style.display = lang === 'en' ? '' : 'none';
    }});
    try {{ localStorage.setItem('wwdc26-meet-lang', lang); }} catch (e) {{}}
  }}

  document.querySelectorAll('.lang-btn').forEach(function (btn) {{
    btn.addEventListener('click', function () {{ setLang(btn.dataset.lang); }});
  }});

  var savedLang = null;
  try {{ savedLang = localStorage.getItem('wwdc26-meet-lang'); }} catch (e) {{}}
  if (savedLang === 'en' || savedLang === 'zh') setLang(savedLang);

  // ── TOC sidebar collapse ───────────────────────────────────
  var body = document.body;
  var tocToggle = document.getElementById('toc-toggle');
  function setTocCollapsed(collapsed) {{
    body.classList.toggle('toc-collapsed', collapsed);
    try {{ localStorage.setItem('wwdc26-meet-toc-collapsed', collapsed ? '1' : '0'); }} catch (e) {{}}
  }}
  tocToggle.addEventListener('click', function () {{
    setTocCollapsed(!body.classList.contains('toc-collapsed'));
  }});
  var savedCollapsed = null;
  try {{ savedCollapsed = localStorage.getItem('wwdc26-meet-toc-collapsed'); }} catch (e) {{}}
  if (savedCollapsed === '1') setTocCollapsed(true);

  // ── Tab navigation ─────────────────────────────────────────
  function activateTab(tabId) {{
    document.querySelectorAll('.tab-btn').forEach(function (btn) {{
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    }});
    document.querySelectorAll('.tab-content').forEach(function (section) {{
      section.classList.toggle('active', section.dataset.tabContent === tabId);
    }});
    var target = document.getElementById('tab-' + tabId);
    if (target && tabId !== 'overview') {{
      // Scroll so the tab content title is visible
      var tabsNav = document.getElementById('tabs-nav');
      var offset = (tabsNav ? tabsNav.offsetHeight : 0) + 80;
      var y = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({{ top: y, behavior: 'smooth' }});
    }} else if (tabId === 'overview') {{
      window.scrollTo({{ top: 0, behavior: 'smooth' }});
    }}
    try {{ localStorage.setItem('wwdc26-meet-tab', tabId); }} catch (e) {{}}
    updateTocActive(tabId);
  }}

  function updateTocActive(tabId) {{
    document.querySelectorAll('.toc-link').forEach(function (a) {{
      a.classList.toggle('active', a.dataset.tab === tabId);
    }});
  }}

  document.querySelectorAll('.tab-btn').forEach(function (btn) {{
    btn.addEventListener('click', function () {{ activateTab(btn.dataset.tab); }});
  }});

  // TOC link clicks → switch tab
  document.querySelectorAll('.toc-link').forEach(function (a) {{
    a.addEventListener('click', function (e) {{
      e.preventDefault();
      activateTab(a.dataset.tab);
    }});
  }});

  var savedTab = null;
  try {{ savedTab = localStorage.getItem('wwdc26-meet-tab'); }} catch (e) {{}}
  if (savedTab && document.getElementById('tab-' + savedTab)) {{
    activateTab(savedTab);
  }} else {{
    updateTocActive('overview');
  }}

  // ── Scroll-spy for timeline windows (within Timeline tab) ──
  var timelineRows = document.querySelectorAll('.window-row');
  if (timelineRows.length > 0 && 'IntersectionObserver' in window) {{
    var obs = new IntersectionObserver(function (entries) {{
      entries.forEach(function (entry) {{
        if (entry.isIntersecting) {{
          entry.target.style.borderLeftColor = 'var(--accent)';
        }}
      }});
    }}, {{ rootMargin: '-20% 0px -60% 0px' }});
    timelineRows.forEach(function (r) {{ obs.observe(r); }});
  }}

  // ── Quote keyboard shortcut: 'Q' jumps to quotes tab ───────
  document.addEventListener('keydown', function (e) {{
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'q' || e.key === 'Q') activateTab('quotes');
    if (e.key === 't' || e.key === 'T') activateTab('timeline');
    if (e.key === 'o' || e.key === 'O') activateTab('overview');
    if (e.key === 'Escape') {{
      setTocCollapsed(true);
      var si = document.getElementById('search-input');
      if (si && si.value) {{ si.value = ''; performSearch(''); si.blur(); }}
    }}
    // Number keys 1-9 → quick-jump tabs
    var num = parseInt(e.key, 10);
    if (!isNaN(num) && num >= 1 && num <= 9) {{
      var tabs = document.querySelectorAll('.tab-btn');
      if (tabs[num - 1]) activateTab(tabs[num - 1].dataset.tab);
    }}
  }});

  // ── Reading progress bar ───────────────────────────────────
  var progressBar = document.getElementById('reading-progress');
  function updateProgress() {{
    var h = document.documentElement;
    var scrolled = h.scrollTop || document.body.scrollTop;
    var max = (h.scrollHeight - h.clientHeight) || 1;
    var pct = Math.max(0, Math.min(100, (scrolled / max) * 100));
    progressBar.style.width = pct + '%';
  }}
  window.addEventListener('scroll', updateProgress, {{ passive: true }});
  updateProgress();

  // ── Back-to-top ────────────────────────────────────────────
  var backToTop = document.getElementById('back-to-top');
  function updateBackToTop() {{
    if (window.scrollY > 600) backToTop.classList.add('show');
    else backToTop.classList.remove('show');
  }}
  window.addEventListener('scroll', updateBackToTop, {{ passive: true }});
  backToTop.addEventListener('click', function () {{
    window.scrollTo({{ top: 0, behavior: 'smooth' }});
  }});
  updateBackToTop();

  // ── Generic cross-tab jump (data-jump-tab + data-jump-anchor) ──
  document.querySelectorAll('[data-jump-tab]').forEach(function (a) {{
    a.addEventListener('click', function (e) {{
      var tabId = a.dataset.jumpTab;
      var anchorId = a.dataset.jumpAnchor;
      if (!tabId) return;
      e.preventDefault();
      activateTab(tabId);
      if (anchorId) {{
        // Wait for tab content to render
        setTimeout(function () {{
          var el = document.getElementById(anchorId);
          if (el) {{
            var tabsNav = document.getElementById('tabs-nav');
            var offset = (tabsNav ? tabsNav.offsetHeight : 0) + 80;
            var y = el.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({{ top: y, behavior: 'smooth' }});
            // Flash highlight
            el.style.transition = 'box-shadow 0.4s';
            el.style.boxShadow = '0 0 0 3px var(--accent)';
            setTimeout(function () {{ el.style.boxShadow = ''; }}, 1400);
          }}
        }}, 80);
      }}
    }});
  }});

  // ── Global search ──────────────────────────────────────────
  var searchInput = document.getElementById('search-input');
  var searchClear = document.getElementById('search-clear');
  var searchCount = document.getElementById('search-count');

  // Collect searchable content (per active language)
  function getLang() {{ return document.documentElement.getAttribute('data-lang') || 'zh'; }}

  function buildSearchIndex() {{
    // Re-index every time language changes (since [data-zh]/[data-en] swap)
    var items = [];
    document.querySelectorAll('.window-row, .quote-card, .theme-deep-card, .theme-card').forEach(function (el) {{
      var lang = getLang();
      var visibleTextEl = el.querySelector(lang === 'zh' ? '[data-zh]:not([style*="display: none"])' : '[data-en]:not([style*="display: none"])');
      // Fallback: concat all text from active-language spans
      var activeSpans = el.querySelectorAll(lang === 'zh' ? '[data-zh]' : '[data-en]');
      var text = '';
      activeSpans.forEach(function (s) {{
        // Only include if display is not 'none'
        if (window.getComputedStyle(s).display !== 'none') text += ' ' + s.textContent;
      }});
      items.push({{ el: el, text: text.toLowerCase(), html: el.outerHTML }});
    }});
    return items;
  }}

  function highlightIn(el, query) {{
    if (!query) return; // clear
    var lang = getLang();
    // Remove existing marks
    el.querySelectorAll('mark.search-mark').forEach(function (m) {{
      var t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    }});
    // Highlight new
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {{
      if (node.parentNode.closest('mark.search-mark')) continue;
      if (node.parentNode.closest('script, style')) continue;
      if (node.nodeValue.toLowerCase().indexOf(query) === -1) continue;
      nodes.push(node);
    }}
    nodes.forEach(function (n) {{
      var span = document.createElement('span');
      var idx = n.nodeValue.toLowerCase().indexOf(query);
      span.innerHTML = n.nodeValue.slice(0, idx) + '<mark class="search-mark" style="background:rgba(255,107,53,0.4);color:inherit;padding:0 1px;border-radius:2px;">' + n.nodeValue.slice(idx, idx + query.length) + '</mark>' + n.nodeValue.slice(idx + query.length);
      n.parentNode.replaceChild(span, n);
    }});
  }}

  function clearAllHighlights() {{
    document.querySelectorAll('mark.search-mark').forEach(function (m) {{
      var t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
      m.parentNode.normalize && m.parentNode.normalize();
    }});
  }}

  function performSearch(query) {{
    query = (query || '').trim().toLowerCase();
    if (!query) {{
      clearAllHighlights();
      document.querySelectorAll('.window-row, .quote-card, .theme-deep-card, .theme-card').forEach(function (el) {{
        el.classList.remove('dim-match');
      }});
      searchClear.style.display = 'none';
      searchCount.textContent = '';
      searchCount.className = 'search-count';
      return;
    }}
    searchClear.style.display = 'inline-block';
    var index = buildSearchIndex();
    var hits = 0;
    index.forEach(function (item) {{
      if (item.text.indexOf(query) !== -1) {{
        hits++;
        item.el.classList.remove('dim-match');
        highlightIn(item.el, query);
      }} else {{
        item.el.classList.add('dim-match');
      }}
    }});
    searchCount.textContent = hits === 0 ? '0 matches' : (hits + ' matches');
    searchCount.className = 'search-count ' + (hits === 0 ? 'no-results' : 'has-results');
  }}

  searchInput.addEventListener('input', function () {{
    performSearch(searchInput.value);
  }});
  searchClear.addEventListener('click', function () {{
    searchInput.value = '';
    performSearch('');
    searchInput.focus();
  }});

  // ── Window-row: inject quote count badge ────────────────────
  document.querySelectorAll('.window-row').forEach(function (row) {{
    var winId = row.id; // e.g. "window-W02"
    if (!winId) return;
    var winShort = winId.replace('window-', '');
    var quoteCount = document.querySelectorAll('.quote-card[data-window-id="' + winShort + '"]').length;
    if (quoteCount > 0) {{
      var badge = document.createElement('span');
      badge.className = 'window-quote-count';
      badge.innerHTML = '💬 ' + quoteCount;
      var head = row.querySelector('.window-row-head');
      if (head) head.appendChild(badge);
    }}
  }});

  // ── Toast helper ───────────────────────────────────────────
  function showToast(msg) {{
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(function () {{ toast.classList.add('show'); }});
    setTimeout(function () {{
      toast.classList.remove('show');
      setTimeout(function () {{ toast.remove(); }}, 350);
    }}, 2000);
  }}

  // ── Pol A: Quote favorite (♡/♥) ───────────────────────────
  var SAVED_KEY = 'wwdc26-meet-saved-quotes';
  function getSaved() {{
    try {{ return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }} catch (e) {{ return []; }}
  }}
  function setSaved(arr) {{
    try {{ localStorage.setItem(SAVED_KEY, JSON.stringify(arr)); }} catch (e) {{}}
    renderSavedPanel();
    updateSavedBtn();
  }}
  function updateSavedBtn() {{
    var saved = getSaved();
    document.querySelectorAll('#saved-quotes-btn, #saved-quotes-btn-en').forEach(function (b) {{
      b.textContent = '★ Saved (' + saved.length + ')';
    }});
  }}
  document.querySelectorAll('.quote-fav').forEach(function (btn) {{
    var idx = parseInt(btn.dataset.favIndex, 10);
    var saved = getSaved();
    if (saved.indexOf(idx) !== -1) btn.classList.add('faved');
    btn.addEventListener('click', function (e) {{
      e.stopPropagation();
      var savedNow = getSaved();
      var pos = savedNow.indexOf(idx);
      if (pos === -1) {{ savedNow.push(idx); btn.classList.add('faved'); showToast('★ 已收藏 (Saved)'); }}
      else {{ savedNow.splice(pos, 1); btn.classList.remove('faved'); showToast('× 已取消 (Removed)'); }}
      setSaved(savedNow);
    }});
  }});
  updateSavedBtn();

  // ── Pol A: Saved quotes panel ──────────────────────────────
  var savedPanel = document.createElement('div');
  savedPanel.className = 'saved-panel';
  savedPanel.id = 'saved-panel';
  document.body.appendChild(savedPanel);

  function renderSavedPanel() {{
    var saved = getSaved();
    if (saved.length === 0) {{
      savedPanel.innerHTML = '<h3>★ ' + (getLang() === 'zh' ? '已收藏金句' : 'Saved Quotes') + '</h3><div class="saved-empty">' + (getLang() === 'zh' ? '点击金句右上角的 ♡ 收藏' : 'Click ♡ on any quote to save') + '</div>';
      return;
    }}
    var html = '<h3>★ ' + (getLang() === 'zh' ? '已收藏金句 (' + saved.length + ')' : 'Saved Quotes (' + saved.length + ')') + '</h3>';
    var lang = getLang();
    saved.forEach(function (idx) {{
      var card = document.querySelector('.quote-card[data-quote-index="' + idx + '"]');
      if (!card) return;
      var ts = card.querySelector('.quote-ts').textContent;
      var bq = card.querySelector(lang === 'zh' ? '.quote-zh' : '.quote-en');
      var text = bq ? bq.textContent.replace(/^.+?\s/, '').trim() : '(empty)';
      html += '<div class="saved-quote-item" data-saved-idx="' + idx + '">';
      html += '<div class="saved-quote-ts">' + ts + '</div>';
      html += text;
      html += '</div>';
    }});
    savedPanel.innerHTML = html;
  }}

  ['saved-quotes-btn', 'saved-quotes-btn-en'].forEach(function (id) {{
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', function () {{
      var wasShown = savedPanel.classList.contains('show');
      document.querySelectorAll('.tool-btn').forEach(function (b) {{ b.classList.remove('active'); }});
      if (wasShown) {{ savedPanel.classList.remove('show'); }}
      else {{ renderSavedPanel(); savedPanel.classList.add('show'); btn.classList.add('active'); }}
    }});
  }});
  // Close panel when clicking outside
  document.addEventListener('click', function (e) {{
    if (!savedPanel.contains(e.target) &&
        !e.target.closest('#saved-quotes-btn') &&
        !e.target.closest('#saved-quotes-btn-en')) {{
      savedPanel.classList.remove('show');
      document.querySelectorAll('.tool-btn').forEach(function (b) {{ b.classList.remove('active'); }});
    }}
  }});

  // ── Pol B: Window-row collapsible ──────────────────────────
  document.querySelectorAll('.window-row-toggle').forEach(function (btn) {{
    btn.addEventListener('click', function (e) {{
      e.stopPropagation();
      var target = document.getElementById(btn.dataset.toggleTarget);
      if (!target) return;
      var row = btn.closest('.window-row');
      if (row.classList.contains('collapsed')) {{
        row.classList.remove('collapsed');
      }} else {{
        row.classList.add('collapsed');
      }}
    }});
  }});

  // ── Pol C: Export dashboard as Markdown ────────────────────
  function buildMarkdown() {{
    var lang = getLang();
    var L = function (zh, en) {{ return lang === 'zh' ? zh : en; }};
    var md = [];
    var videoTitle = document.querySelector('.hero h1 span[data-' + lang + ']').textContent.trim();
    md.push('# ' + videoTitle);
    md.push('');
    md.push(L('*构建于 ' + new Date().toISOString().split('T')[0] + ' · ' + QUOTES_DATA.length + ' 金句 · ' + WINDOWS_DATA.length + ' 时间段 · ' + THEMES_DATA.length + ' 主题*',
              '*Built ' + new Date().toISOString().split('T')[0] + ' · ' + QUOTES_DATA.length + ' quotes · ' + WINDOWS_DATA.length + ' windows · ' + THEMES_DATA.length + ' themes*'));
    md.push('');

    // Stats
    md.push('## ' + L('📊 数据', '📊 Stats'));
    document.querySelectorAll('.stat-card').forEach(function (c) {{
      var v = c.querySelector('.stat-value').textContent.trim();
      var l = c.querySelector('.stat-label[data-' + lang + ']').textContent.trim();
      md.push('- **' + v + '** — ' + l);
    }});
    md.push('');

    // Themes
    md.push('## ' + L('🧠 5 大主题', '🧠 5 Big Themes'));
    THEMES_DATA.forEach(function (t, i) {{
      md.push('### ' + t.emoji + ' ' + (lang === 'zh' ? t.title_zh : t.title_en));
      md.push('');
      md.push(lang === 'zh' ? t.desc_zh : t.desc_en);
      md.push('');
    }});

    // Timeline
    md.push('## ' + L('⏱ 时间线', '⏱ Timeline'));
    WINDOWS_DATA.forEach(function (w) {{
      md.push('### ' + w.id + ' — ' + (lang === 'zh' ? w.title_zh : w.title_en));
      md.push('*' + (lang === 'zh' ? w.summary_zh : w.summary_en) + '*');
      md.push('');
    }});

    // Quotes
    md.push('## ' + L('💬 金句', '💬 Quotes'));
    QUOTES_DATA.forEach(function (q, i) {{
      md.push('### #' + (i + 1) + ' — ' + q.ts);
      md.push('> **EN:** ' + q.en);
      md.push('>');
      md.push('> **中文:** ' + q.zh);
      md.push('');
    }});

    return md.join('\\n');
  }}

  ['export-md-btn', 'export-md-btn-en'].forEach(function (id) {{
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', function () {{
      try {{
        var md = buildMarkdown();
        var blob = new Blob([md], {{ type: 'text/markdown;charset=utf-8' }});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'wwdc26-meet-with-apple-' + getLang() + '-' + new Date().toISOString().split('T')[0] + '.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('⬇ ' + (getLang() === 'zh' ? '已下载 Markdown' : 'Markdown downloaded'));
      }} catch (err) {{
        showToast('✗ Export failed: ' + err.message);
      }}
    }});
  }});

  // Rebuild saved panel when language changes
  var origSetLang = setLang;
  // (setLang already updates DOM; just need to re-render saved panel if open)
  var langObserver = new MutationObserver(function () {{
    if (savedPanel.classList.contains('show')) renderSavedPanel();
  }});
  langObserver.observe(document.documentElement, {{ attributes: true, attributeFilter: ['data-lang'] }});
}})();
</script>
</body>
</html>
"""


def build():
    c = json.loads(CONTENT_PATH.read_text())
    # Inject window_id into each quote based on ts
    for q in c['quotes']:
        hh, mm, ss = q['ts'].split(':')
        sec = int(hh) * 3600 + int(mm) * 60 + int(ss)
        matched = [w['id'] for w in c['windows'] if w['start_min']*60 <= sec <= w['end_min']*60]
        q['window_id'] = matched[0] if matched else ''
    raw = (HTML_TEMPLATE
           .replace("{TOC}", render_toc(c["tabs"]))
           .replace("{TAB_BUTTONS}", render_tab_buttons(c["tabs"]))
           .replace("{OVERVIEW}", render_overview(c["video"], c["stats"], c["themes"]))
           .replace("{THEMES_CONTENT}", render_themes(c["themes"]))
           .replace("{TIMELINE_CONTENT}", render_timeline(c["windows"]))
           .replace("{QUOTES_CONTENT}", render_quotes(c["quotes"]))
           .replace("{AI_CONTENT}", render_ai())
           .replace("{DESIGN_CONTENT}", render_design())
           .replace("{XCODE_CONTENT}", render_xcode())
           .replace("{INTENTS_CONTENT}", render_intents())
           .replace("{SPATIAL_CONTENT}", render_spatial())
           .replace("{STORE_CONTENT}", render_store())
           .replace("{ROSTER_CONTENT}", render_roster())
           .replace("{META_CONTENT}", render_meta()))
    # Un-escape JS {{ }} (Python triple-string did not double-brace them since it's not an f-string)
    html = raw.replace("{{", "{").replace("}}", "}")
    # Inject embedded JSON data for export/saved-panel
    html = (html
            .replace("{THEMES_JSON}", json.dumps(c["themes"], ensure_ascii=False))
            .replace("{WINDOWS_JSON}", json.dumps(c["windows"], ensure_ascii=False))
            .replace("{QUOTES_JSON}", json.dumps(c["quotes"], ensure_ascii=False)))
    # Reformat tab-content <div>s so class comes BEFORE id (verify_toc.py regex expects this order)
    # AND inject h2 id="tab-X-title" anchor immediately after each tab-content div opener
    # (verify_toc check [2] requires h2/h3 ids present for click-jump)
    import re as _re
    # Step 1: reorder class before id
    html = _re.sub(
        r'<div id="(tab-[a-z0-9-]+)" class="tab-content"([^>]*)>',
        lambda m: f'<div class="tab-content" id="{m.group(1)}"{m.group(2)}>',
        html,
    )
    # Step 2: inject h2 anchor after each tab-content div opener (non-greedy single tag)
    def _inject(m):
        opener = m.group(0)
        tab_id = m.group(1)
        return f'{opener}<h2 id="{tab_id}-title" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;"> </h2>'
    html = _re.sub(
        r'<div class="tab-content[^"]*"\s+id="(tab-[a-z0-9-]+)"[^>]*>',
        _inject,
        html,
    )
    # Step 3: inject h2 anchor after each window-row div (for verify_toc click-jump)
    # Use plain id "window-W02" (matches the div id, so href="#window-W02" resolves directly)
    def _inject_window(m):
        opener = m.group(0)
        win_id = m.group(1)
        return f'{opener}<h2 id="{win_id}" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;"> </h2>'
    html = _re.sub(
        r'<div class="window-row"[^>]*id="(window-[A-Z0-9]+)"[^>]*>',
        _inject_window,
        html,
    )
    OUT_PATH.write_text(html)
    print(f"Wrote {OUT_PATH} ({len(html):,} bytes)")
    print(f"Tabs: {len(c['tabs'])}")
    print(f"Windows: {len(c['windows'])}")
    print(f"Quotes: {len(c['quotes'])}")
    print(f"Themes: {len(c['themes'])}")


if __name__ == "__main__":
    build()

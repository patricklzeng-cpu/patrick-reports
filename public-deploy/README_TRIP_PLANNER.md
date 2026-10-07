# Trip Planner Template

一份可以直接复制、改数据、发链接的全球自驾行程网页。它是单个 HTML：没有数据库、没有后端、没有构建步骤。你只需编辑 `trip-planner-template.html` 脚本最上方的 `TRIP_CONFIG`，地图、逐日时间线、预订卡片、视频库、双语 UI 和打卡状态都会自动生成。

模板沿用 `xjb-public.html` 的视觉语言与 `days[]` 数据结构，并内置一份云南大理丽江 6 日 demo。中国坐标会自动做 WGS84 → GCJ02 转换并使用高德瓦片；海外坐标保持 WGS84 并使用 OpenStreetMap。

## 30 秒开始

1. 复制文件：`cp trip-planner-template.html my-japan-road-trip.html`
2. 打开新文件，找到脚本最上方的 `const TRIP_CONFIG = { ... }`
3. 先改 `meta`，再逐天改 `days[]`，最后替换 `booked / videos / tips`
4. 双击 HTML 本地预览；确认无误后上传或部署

不要把整份 HTML 重写一遍。保留样式和渲染代码，只复制文件并替换 `TRIP_CONFIG`。

## 5 个最常见的修改场景

### 1. 改标题、日期、人数和作者

这些字段控制浏览器标题、Hero、倒计时、页脚和 localStorage 隔离键。

```js
meta: {
  title: "冰岛环岛 9 日自驾",
  subtitle: "雷克雅未克取还 · 2 人 · 2027/06/03–06/11",
  startDate: "2027-06-03",
  endDate: "2027-06-11",
  totalDays: 9,
  hotelNights: 8,
  partySize: 2,
  author: "Patrick",
  locale: "zh-CN"
}
```

`totalDays` 必须和 `days.length` 一致。页面顶部的配置检查会提示是否匹配。

### 2. 改顶部流程条

`type: "airport"` 使用蓝色，`type: "drive"` 使用绿色。

```js
flow: [
  { label: "✈ 上海", type: "airport" },
  { label: "雷克雅未克取车", type: "airport" },
  { label: "🚙 1 号公路环岛", type: "drive" },
  { label: "凯夫拉维克还车✈", type: "airport" }
]
```

### 3. 新增或修改一天行程

`days[]` 是核心，字段与 `xjb-public` 的 `DAYS[]` 对齐。经纬度请填写 WGS84；模板会自动处理中国 GCJ02 偏移。

```js
{
  d: 1,
  date: "06/03 周四",
  s: 1,
  fly: 1,
  r: "抵达雷克雅未克 · 取车",
  km: "约 52km",
  det: "机场取车，蓝湖短停，傍晚入住市区。",
  ho: "Reykjavík Hotel · 已预订",
  vid: "BV1xxxx",
  vidt: "冰岛环岛攻略",
  pts: [
    { n: "Keflavík Airport", la: 63.985, ln: -22.605, t: "air", dc: "10:30 抵达" },
    { n: "Blue Lagoon", la: 63.880, ln: -22.449, t: "s1", dc: "预约 13:00" },
    { n: "Reykjavík Hotel", la: 64.146, ln: -21.942, t: "h", dc: "已预订" }
  ]
}
```

地点类型：`h` 住宿、`air` 机场、`s1 / s2` 不同自驾段、`opt` 可选点。段号 `s` 超过 2 时会自动生成新的 HSL 路线色。

### 4. 改机票、租车和住宿

```js
booked: {
  flights: [
    { from: "上海", to: "雷克雅未克", date: "06/03", time: "00:40–09:20", flight: "AY087", note: "赫尔辛基转机" }
  ],
  cars: [
    { brand: "Toyota RAV4", segment: "冰岛环岛", pickup: "06/03 KEF", dropoff: "06/11 KEF", days: 9 }
  ],
  hotels: [
    { name: "Reykjavík Hotel", days: "06/03–04 · Day 1", tag: "已预订", icon: "R" }
  ],
  callouts: [
    { type: "t", title: "⚠️ 还车提醒：", text: "返程航班前至少预留 3 小时。" }
  ]
}
```

`callouts` 的 `type` 用 `t` 表示橙色 warning，用 `b` 表示蓝色提示。

### 5. 改视频、贴士和语言

B 站使用 `bv`，YouTube 使用 `youtube`。把 `videos` 改成 `[]`，整个视频 section 会消失。

```js
videos: [
  {
    category: "🎒 环岛攻略",
    items: [
      { bv: "BV1xxxx", title: "冰岛环岛完整攻略", tag: "路书" },
      { youtube: "VIDEO_ID", title: "Iceland road trip", tag: "YouTube" }
    ]
  }
],
tips: [
  "🌬️ 横风｜遇到强风预警不要勉强赶路",
  "⛽ 加油｜偏远路段见到加油站及时补满"
]
```

设置 `meta.locale = "en-US"` 可让导航、Hero、按钮、section 标题、提示和 demo tips 自动显示英文。模板也会把用户在页面右上角切换的语言保存到当前行程专属的 localStorage；要把英文作为新访客默认值，修改 `meta.locale` 后用无痕窗口验证即可。若你新增了自己的双语内容，在 `meta.i18n["en-US"]` 中补同名 key。

## 地图与打卡如何工作

- 中国行程：高德街道 / 卫星瓦片，坐标自动从 WGS84 转 GCJ02。
- 海外行程：OpenStreetMap，坐标保持 WGS84；导航链接打开 Google Maps。
- 点击时间线或日程卡片：地图缩放到当天并打开第一个地点。
- 点击时间线右侧 `○ / ✓`：完成状态写入当前行程专属 localStorage，刷新后保留。
- 语言与地图样式也分别保存，并使用 `author + startDate` 隔离，多个行程不会互相覆盖。

## 部署到 Cloudflare Pages

这是纯静态单 HTML，不需要 `npm install` 或构建。

已有 Pages 项目时，把文件复制到公开目录即可：

```bash
cp trip-planner-template.html public/trip/index.html
```

然后按现有 Cloudflare Pages 流程部署。若 Pages 直接托管一个目录，也可以把它命名为 `index.html` 后上传该目录。Leaflet、高德和 OpenStreetMap 瓦片来自公网，离线打开时地图可能不显示，但行程卡片和已保存打卡仍可用。

## Fork 一份新行程

```bash
cp trip-planner-template.html trip-japan-2027.html
```

只改新文件中的 `TRIP_CONFIG`。建议保留原始云南 demo 作为字段字典；如果某个模块暂时不用，数组设为 `[]`，不要删除渲染函数。

发布前至少检查：日期与天数、每个坐标、航班时刻、取还车地点、酒店日期、视频链接、移动端排版，以及页面顶部的配置检查状态。

## 作者与致谢

模板联系作者：Patrick。

设计与交互基于 Patrick 的 `xjb-public.html`，模板化改造为 `trip-planner-template`。公开分享前请隐去预订号、证件信息、电话与价格等敏感数据。

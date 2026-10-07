import test from "node:test";
import assert from "node:assert/strict";
import { findPublicUrl, inspectHtml, isPrivateAddress } from "../src/orchestrator/web-inspector.js";

test("findPublicUrl normalizes a bare domain inside a Chinese command", () => {
  assert.equal(findPublicUrl("2017zyl.xyz 看看这个 给出反馈")?.href, "https://2017zyl.xyz/");
  assert.equal(findPublicUrl("没有网址"), null);
});

test("inspectHtml produces evidence-backed feedback for a simulated command demo", () => {
  const report = inspectHtml(`<!doctype html>
    <html lang="zh-CN"><head><title>OpenSwarm</title><meta name="viewport" content="width=device-width"></head>
    <body><h1>One command</h1><form id="command"><input></form><a href="https://example.com" target="_blank">Output</a>
    <script>command.onsubmit = e => {}; setTimeout(a, 1); setTimeout(b, 2);</script></body></html>`, {
      finalUrl: "https://2017zyl.xyz/", status: 200,
    });

  assert.equal(report.title, "OpenSwarm");
  assert.equal(report.lang, "zh-CN");
  assert.equal(report.h1Count, 1);
  assert.equal(report.simulatedDemo, true);
  assert.equal(report.unsafeBlankLinks, 1);
  assert.match(report.summary, /演示动画/);
  assert.equal(report.recommendations.some((item) => item.includes("真实任务 API")), true);
});

test("private and reserved addresses are blocked", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.1.2", "192.168.1.2", "::1", "fd00::1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

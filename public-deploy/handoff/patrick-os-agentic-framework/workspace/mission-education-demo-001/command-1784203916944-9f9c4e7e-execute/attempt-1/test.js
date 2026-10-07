
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('lesson has required keys', () => {
  const lesson = JSON.parse(readFileSync("/Users/zl/patricks-reports/handoff/patrick-os-agentic-framework/workspace/mission-education-demo-001/command-1784203916944-9f9c4e7e-execute/attempt-1/lesson.json", 'utf8'));
  assert.equal(lesson.schema, 'patrick-os/lesson/v1');
  assert.ok(Array.isArray(lesson.planets));
  assert.ok(lesson.planets.length >= 4, 'expected at least 4 planets');
});

test('lesson has bilingual content', () => {
  const lesson = JSON.parse(readFileSync("/Users/zl/patricks-reports/handoff/patrick-os-agentic-framework/workspace/mission-education-demo-001/command-1784203916944-9f9c4e7e-execute/attempt-1/lesson.json", 'utf8'));
  assert.ok(lesson.title.en, 'missing en title');
  assert.ok(lesson.title.zh, 'missing zh title');
  assert.equal(lesson.title.en.length > 0 && lesson.title.zh.length > 0, true);
});

test('every planet has both translations', () => {
  const lesson = JSON.parse(readFileSync("/Users/zl/patricks-reports/handoff/patrick-os-agentic-framework/workspace/mission-education-demo-001/command-1784203916944-9f9c4e7e-execute/attempt-1/lesson.json", 'utf8'));
  for (const p of lesson.planets) {
    assert.ok(p.name.en, `planet missing en name`);
    assert.ok(p.name.zh, `planet missing zh name`);
    assert.ok(p.description.en, `planet missing en description`);
    assert.ok(p.description.zh, `planet missing zh description`);
  }
});

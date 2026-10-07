import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, assertTransition, isTerminal } from "../src/domain/mission-fsm.js";

test("mission state machine allows the happy path", () => {
  assert.equal(canTransition("draft", "planning"), true);
  assert.equal(canTransition("planning", "queued"), true);
  assert.equal(canTransition("queued", "running"), true);
  assert.equal(canTransition("running", "reviewing"), true);
  assert.equal(canTransition("reviewing", "completed"), true);
});

test("mission state machine rejects terminal-state resurrection", () => {
  assert.equal(isTerminal("completed"), true);
  assert.throws(() => assertTransition("completed", "running"), /Illegal mission transition/);
});


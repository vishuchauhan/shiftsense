// Runs the same deterministic suite the Evaluation Lab shows in the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSuite } from "../src/evaluation-tests.js";

const results = runSuite();
for (const r of results) {
  test(`${r.group} › ${r.name}`, () => assert.ok(r.pass, r.detail));
}

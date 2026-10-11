import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditWorkflows } from "../dist/index.js";

function audit(yaml) {
  const dir = mkdtempSync(join(tmpdir(), "gsa-"));
  const wf = join(dir, "workflows");
  mkdirSync(wf, { recursive: true });
  writeFileSync(join(wf, "ci.yml"), yaml);
  try {
    return auditWorkflows({ workflowsDir: wf, overExposureThreshold: 3 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("detects secret in step starting directly with - if:", () => {
  const yaml = `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - if: secrets.MY_SECRET != ''
        run: echo hello
`;
  const r = audit(yaml);
  assert.equal(r.ifConditionWarnings.length, 1);
  assert.equal(r.ifConditionWarnings[0].secretName, "MY_SECRET");
  assert.equal(r.ifConditionWarnings[0].job, "test");
  assert.ok(r.secretMap["MY_SECRET"], "secret must be in secretMap");
  const ref = r.secretMap["MY_SECRET"].references[0];
  assert.equal(ref.step, "step-1");
});

test("detects secret in multiline if: condition with folded scalar (>)", () => {
  const yaml = `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: test step
        if: >
          secrets.MY_SECRET != ''
        run: echo hello
`;
  const r = audit(yaml);
  assert.equal(r.ifConditionWarnings.length, 1);
  assert.equal(r.ifConditionWarnings[0].secretName, "MY_SECRET");
  assert.equal(r.ifConditionWarnings[0].job, "test");
  assert.ok(r.secretMap["MY_SECRET"], "secret must be in secretMap");
  const ref = r.secretMap["MY_SECRET"].references[0];
  assert.equal(ref.step, "test step");
});

test("detects secret in multiline if: condition with literal scalar (|)", () => {
  const yaml = `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: test step
        if: |
          secrets.MY_SECRET != ''
        run: echo hello
`;
  const r = audit(yaml);
  assert.equal(r.ifConditionWarnings.length, 1);
  assert.equal(r.ifConditionWarnings[0].secretName, "MY_SECRET");
  assert.equal(r.ifConditionWarnings[0].job, "test");
  assert.ok(r.secretMap["MY_SECRET"], "secret must be in secretMap");
  const ref = r.secretMap["MY_SECRET"].references[0];
  assert.equal(ref.step, "test step");
});

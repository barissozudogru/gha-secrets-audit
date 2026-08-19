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

const WITH_BLOCK = `name: CI
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CF_TOKEN }}
      - name: Purge edge cache
        run: |
          curl -H "Authorization: Bearer \${{ secrets.CF_TOKEN }}" https://example.com
      - name: Safe usage
        env:
          TOKEN: \${{ secrets.SAFE_TOKEN }}
        run: |
          curl -H "Authorization: Bearer $TOKEN" https://example.com
`;

test("a named step keeps its name when the secret follows uses:", () => {
  // A name: line set the step, then the next uses:/run: line overwrote it with
  // step-N, so the common "uses: ... with: apiToken:" pattern lost the name.
  const r = audit(WITH_BLOCK);
  const refs = r.secretMap["CF_TOKEN"].references;
  const steps = refs.map((x) => x.step);
  assert.ok(steps.includes("Deploy to Cloudflare Pages"), `got ${JSON.stringify(steps)}`);
  assert.ok(!steps.some((s) => /^step-\d+$/.test(s)), `fell back to step-N: ${JSON.stringify(steps)}`);
});

test("secrets interpolated into run: are reported", () => {
  const r = audit(WITH_BLOCK);
  const names = r.inlineRunWarnings.map((w) => w.secretName);
  assert.deepEqual(names, ["CF_TOKEN"]);
  assert.equal(r.inlineRunWarnings[0].step, "Purge edge cache");
});

test("a secret passed through env: is not flagged as inline", () => {
  const r = audit(WITH_BLOCK);
  assert.ok(
    !r.inlineRunWarnings.some((w) => w.secretName === "SAFE_TOKEN"),
    "env: is the recommended pattern and must not warn"
  );
});

test("a secret in with: is not flagged as inline", () => {
  const r = audit(WITH_BLOCK);
  const inlineForDeployStep = r.inlineRunWarnings.filter(
    (w) => w.step === "Deploy to Cloudflare Pages"
  );
  assert.deepEqual(inlineForDeployStep, []);
});

test("single-line run: is covered too", () => {
  const yaml = `name: CI
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - name: One liner
        run: curl -H "Authorization: Bearer \${{ secrets.INLINE }}" https://x.test
`;
  const r = audit(yaml);
  assert.equal(r.inlineRunWarnings.length, 1);
  assert.equal(r.inlineRunWarnings[0].secretName, "INLINE");
  assert.equal(r.inlineRunWarnings[0].step, "One liner");
});

test("line numbers stay accurate", () => {
  const r = audit(WITH_BLOCK);
  const refs = r.secretMap["CF_TOKEN"].references;
  // apiToken is on line 10, the curl on line 13 of the fixture above.
  assert.ok(refs.some((x) => x.line === 10), JSON.stringify(refs));
  assert.equal(r.inlineRunWarnings[0].line, 13);
});

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

test("jobs indented with 4 spaces are recognized and tracked for over-exposure", () => {
  const yaml = `name: CI
on: push
jobs:
    build:
        runs-on: ubuntu-latest
        steps:
            - run: echo \${{ secrets.SHARED_SECRET }}
    test:
        runs-on: ubuntu-latest
        steps:
            - run: echo \${{ secrets.SHARED_SECRET }}
    deploy:
        runs-on: ubuntu-latest
        steps:
            - run: echo \${{ secrets.SHARED_SECRET }}
`;

  const r = audit(yaml);
  const refs = r.secretMap["SHARED_SECRET"].references;
  const jobs = refs.map((ref) => ref.job);
  assert.deepEqual(jobs, ["build", "test", "deploy"]);
  assert.equal(r.overExposedSecrets.length, 1);
  assert.equal(r.overExposedSecrets[0].name, "SHARED_SECRET");
  assert.equal(r.overExposedSecrets[0].jobCount, 3);
});

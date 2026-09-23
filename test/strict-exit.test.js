import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");

function runStrict(yaml) {
  const dir = mkdtempSync(join(tmpdir(), "gsa-"));
  const wf = join(dir, "workflows");
  mkdirSync(wf, { recursive: true });
  writeFileSync(join(wf, "ci.yml"), yaml);
  try {
    return spawnSync(process.execPath, [cli, "--path", wf, "--strict"], {
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const INLINE_ONLY = `name: CI
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        run: ./deploy.sh --token \${{ secrets.DEPLOY_TOKEN }}
`;

const VIA_ENV = `name: CI
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        env:
          TOKEN: \${{ secrets.DEPLOY_TOKEN }}
        run: ./deploy.sh --token "$TOKEN"
`;

test("--strict exits 1 when the only finding is a secret interpolated into run:", () => {
  // The strict check used to test only over-exposure, duplicates and if:
  // conditions, so this workflow slipped through CI enforcement with exit 0.
  const r = runStrict(INLINE_ONLY);
  assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
});

test("--strict exits 0 when the secret goes through env:", () => {
  const r = runStrict(VIA_ENV);
  assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
});

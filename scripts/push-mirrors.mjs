#!/usr/bin/env node
/**
 * push-mirrors.mjs — Tradelab 백엔드 멀티-원격 push 헬퍼.
 *
 * 사용법:
 *   pnpm push:mirrors                  # 현재 브랜치를 origin + v65sum 양쪽에 push
 *   pnpm push:mirrors --include-main   # + feat/v6.5-merge 일 때 v65sum/main 에도 mirror push
 *
 * 목적: Frontend6.5/dev 가 origin/dev 보다 2 commit 뒤졌던 사고 (2026-05-09) 방지.
 *       원격 추가/제거 시 이 스크립트만 갱신.
 *
 * 정책:
 *   - origin              = tradelab-hq/tradelab-backend (production canonical)
 *   - v65sum              = godkyuho777/6.5SUM (사용자 미러)
 *   - 현재 브랜치 = dev / feat/v6.5-merge 모두 v65sum 에 mirror
 *   - feat/v6.5-merge 인 경우 v65sum/main 도 fast-forward (옵션, --include-main)
 */

import { execSync } from "node:child_process";

const MIRROR_REMOTES = ["v65sum"];
const ORIGIN_REMOTE = "origin";
const PROD_BRANCH = "feat/v6.5-merge";
const MIRROR_MAIN_BRANCH = "main";

function exec(cmd, options = {}) {
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...options }).trim();
}

function execLive(cmd) {
  return execSync(cmd, { stdio: "inherit" });
}

function currentBranch() {
  return exec("git rev-parse --abbrev-ref HEAD");
}

function workingTreeClean() {
  return exec("git status --porcelain") === "";
}

function remoteExists(remote) {
  try {
    exec(`git remote get-url ${remote}`);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const includeMainMirror = args.includes("--include-main");

  const branch = currentBranch();
  if (branch === "HEAD") {
    console.error("✗ Detached HEAD 상태 — 명시적 브랜치 체크아웃 필요");
    process.exit(1);
  }

  if (!workingTreeClean()) {
    console.error("✗ Working tree 가 dirty — commit 또는 stash 후 재시도");
    process.exit(1);
  }

  console.log(`\n[push-mirrors backend] 현재 브랜치: ${branch}\n`);

  // 1. origin (canonical) 먼저 push
  console.log(`→ origin/${branch} push`);
  try {
    execLive(`git push ${ORIGIN_REMOTE} ${branch}`);
  } catch {
    console.error(`✗ origin/${branch} push 실패`);
    process.exit(1);
  }

  // 2. 모든 미러에 같은 브랜치 push
  for (const remote of MIRROR_REMOTES) {
    if (!remoteExists(remote)) {
      console.warn(`⚠ ${remote} remote 미정의 — 스킵`);
      continue;
    }
    console.log(`\n→ ${remote}/${branch} push`);
    try {
      execLive(`git push ${remote} ${branch}`);
    } catch {
      console.error(`✗ ${remote}/${branch} push 실패`);
      process.exit(1);
    }
  }

  // 3. feat/v6.5-merge 인 경우 v65sum/main 미러 (optional)
  if (branch === PROD_BRANCH && includeMainMirror) {
    for (const remote of MIRROR_REMOTES) {
      if (!remoteExists(remote)) continue;
      console.log(`\n→ ${remote}/${MIRROR_MAIN_BRANCH} mirror push (from ${branch})`);
      try {
        execLive(`git push ${remote} ${branch}:${MIRROR_MAIN_BRANCH}`);
      } catch {
        console.error(`✗ ${remote}/${MIRROR_MAIN_BRANCH} push 실패`);
        process.exit(1);
      }
    }
  } else if (branch === PROD_BRANCH && !includeMainMirror) {
    console.log(
      `\nℹ ${PROD_BRANCH} 브랜치 — v65sum/main 미러도 갱신하려면 --include-main 추가`,
    );
  }

  console.log(`\n✓ push-mirrors 완료\n`);
}

main();

# 005 - PR Phase

## Overview

The PR phase is the final step of the wreckit workflow, responsible for delivering completed work to the codebase. It operates in two modes:

- **PR Mode** (default): Creates a GitHub pull request for review
- **Direct Mode**: Merges directly to the base branch (for greenfield projects)

**This phase is the gateway to production.** It requires the strongest safeguards of any phase.

---

## Security Model: Production Gateway

The PR phase is where code gets shipped. Every check that fails here can result in broken, incomplete, or insecure code reaching the main branch.

### Core Principle

Nothing ships without verification. The PR phase must validate that work is complete, correct, and safe before pushing.

### Guardrails Required

| Guardrail | Purpose |
|-----------|---------|
| **Completion Verification** | All stories must be marked done |
| **Git State Validation** | Clean working tree, correct branch, valid remote |
| **Quality Gate** | Tests/lint/typecheck pass before push |
| **Branch Protection** | Correct branch, no force-push, no history rewrite |
| **Conflict Detection** | No merge conflicts or in-progress operations |
| **Secret Scanning** | No credentials or sensitive data in diff |

### Critical Gaps (Current State)

The current implementation has significant gaps:

| Gap | Risk | Severity |
|-----|------|----------|
| **Preflight/commit ordering bug** | Preflight rejects dirty state, but auto-commit never runs | Critical |
| **No test/lint gate** | Broken code can be pushed | High |
| **No secret scanning** | Credentials can be committed | High |
| **Direct merge bypasses review** | Broken code ships immediately | High |
| **No conflict pre-check** | Merge failures leave repo in bad state | Medium |
| **No remote validation** | Could push to wrong repository | Medium |

---

## State Transitions

| Mode   | Transition                  |
|--------|-----------------------------|
| PR     | `implementing` → `in_pr`    |
| Direct | `implementing` → `done`     |

## Triggers

### Automatic Execution

The PR phase runs automatically when:

1. `wreckit` or `wreckit run <id>` is executed
2. Item state is `implementing`
3. All stories in the PRD are marked done

### Manual Execution

Use `wreckit pr <id>` to force PR phase execution. Useful for:

- Retrying after a failed PR attempt
- Debugging PR generation
- Testing PR workflow in isolation

## Preconditions

All preconditions must pass before PR phase execution:

### 1. State Validation

The item must be in the `implementing` state.

### 2. Story Completion

All stories in the PRD must have status `done`.

### 3. Git Preflight

Must pass git preflight validation (see below).

## Git Preflight

Validates the git repository state before proceeding.

### Current Checks

| Check | Validation | Recovery |
|-------|------------|----------|
| Is git repo | `.git` directory exists | Initialize with `git init` |
| Not detached HEAD | Attached to a branch | Checkout a branch |
| Clean working tree | No uncommitted changes | Auto-commit or stash |

### Missing Checks (Recommended)

| Check | Purpose | Risk if Missing |
|-------|---------|-----------------|
| Remote exists | Ensure push target configured | Push fails with confusing error |
| Correct remote URL | Prevent pushing to wrong repo | Code pushed to wrong repository |
| No merge in progress | Detect `.git/MERGE_HEAD` | Merge completes unexpectedly |
| No rebase in progress | Detect `.git/REBASE_HEAD` | Rebase completes unexpectedly |
| No unmerged paths | Detect conflict markers | Conflict markers committed |
| Base branch up-to-date | Fetch before branching | Branch from stale base |
| Branch not diverged | Local matches upstream | Push rejection |

### Failure Behavior

On preflight failure:

1. Error persisted to `item.last_error`
2. PR phase blocked
3. User must resolve issues manually and re-run

### Critical Bug: Preflight/Commit Ordering

The current implementation has a critical ordering bug:

1. Preflight runs first and **rejects** uncommitted changes
2. Auto-commit logic runs **after** preflight
3. Result: auto-commit never executes; dirty repos always fail

**Fix Required:** Either commit before preflight, or modify preflight to allow dirty state when auto-commit is intended.

## Branch Management

### Branch Naming Convention

Branches are named using the configured prefix plus the item ID:

```
{branch_prefix}{item_id}
```

Example: `wreckit/001-auth-system`

### Branch Initialization

The system handles three scenarios:

- **No local or remote branch**: Creates new branch from base branch
- **Remote exists, no local**: Creates local branch tracking remote
- **Local exists**: Switches to existing branch

## Auto-Commit Behavior

If the working tree has uncommitted changes during PR phase, changes are automatically committed.

### Commit Message Format

```
feat(<item-id>): implement <item-title>
```

Example: `feat(001-auth-system): implement User authentication with JWT`

## Merge Modes

### PR Mode (Default)

Creates a GitHub pull request for code review.

**Workflow:**

1. Push branch to origin
2. Generate PR title and body via agent
3. Create or update GitHub PR
4. Update item state to `in_pr`
5. Store PR URL and number on item

**Recommended Additional Steps:**

- After PR creation, check `gh pr view --json mergeable` to verify mergeability
- Request reviewers automatically if CODEOWNERS configured
- Optionally poll `gh pr checks` until CI passes

### Direct Mode

Merges directly to the base branch without a pull request.

**Workflow:**

1. Merge feature branch into base branch
2. Push base branch to origin
3. Delete feature branch (local and remote)
4. Update item state to `done`

### Direct Mode Risks

Direct mode bypasses critical safeguards:

| Bypassed Safeguard | Risk |
|--------------------|------|
| PR review | No human verification of changes |
| GitHub branch protections | Circumvents required reviews/checks |
| CI required checks | Broken code ships immediately |
| CODEOWNERS review | Domain experts not notified |

**Recommendation:** Direct mode should be:

- Disabled by default
- Require explicit `--force` or config flag `allow_unsafe_direct_merge: true`
- Run same test/lint gate as PR mode
- Create rollback anchor (backup ref or SHA recording) before merge
- Only used for truly greenfield projects with no production risk

## PR Generation

The agent generates PR content based on:

- Item title and description
- PRD with user stories
- Git diff of changes

**Generated content includes:**

- PR title following conventional commit format
- PR body with summary, changes made, and testing notes

If PR generation fails, a default title and body are used.

## Error Scenarios

### GitHub Authentication Failure

Occurs when `gh` CLI is not authenticated or token lacks permissions.

**Recovery:** Run `gh auth login` and re-run the PR phase.

### Push Rejection

Occurs when remote branch has diverged or push permissions are missing.

**Recovery:** Resolve conflicts locally or verify push access.

### PR Creation Failure

Occurs when repository doesn't exist or user lacks access.

**Recovery:** Verify repository exists and user has push access.

### PR Description Generation Failure

This is a **warning only** - the PR is still created with defaults.

### Merge Conflicts (Direct Mode)

Occurs when feature branch cannot be cleanly merged into base.

**Current Behavior:**
- Merge fails with error
- Repo may be left in mid-merge state
- No automatic cleanup

**Recommended Behavior:**
- Detect conflicts before starting merge
- On failure, run `git merge --abort` to restore clean state
- Return structured recovery steps

---

## Quality Gates (Recommended)

The PR phase should include quality gates before pushing:

### Pre-Push Verification

| Gate | Purpose | Configurable |
|------|---------|--------------|
| Stories complete | All PRD stories marked done | No (required) |
| Tests pass | Run configured test command | Yes |
| Lint passes | Run configured lint command | Yes |
| Typecheck passes | Run configured typecheck command | Yes |
| Build succeeds | Run configured build command | Yes |
| No secrets | Scan diff for credential patterns | Yes |

### Configuration

Add to `.wreckit/config.json`:

```
pr_checks:
  commands:
    - "npm test"
    - "npm run lint"
    - "npm run typecheck"
  secret_scan: true
  require_all_stories_done: true
```

### Behavior

- If any gate fails, PR phase aborts with clear error
- `--skip-checks` flag allows bypass (off by default, logs warning)
- Same gates apply to direct merge mode

---

## Secret Scanning (Recommended)

Before commit/push, scan for common credential patterns:

### Patterns to Detect

| Pattern | Example |
|---------|---------|
| Private keys | `BEGIN PRIVATE KEY`, `BEGIN RSA PRIVATE KEY` |
| AWS keys | `AKIA...` (20 character key IDs) |
| GitHub tokens | `ghp_`, `github_pat_`, `gho_` |
| Slack tokens | `xoxb-`, `xoxp-` |
| Generic secrets | `password=`, `secret=`, `api_key=` |
| Env files | `.env` additions |

### Behavior

- Scan `git diff --cached` before commit
- If patterns detected, fail with specific findings
- Allow override with explicit `--allow-secrets` flag (loud warning)

---

## Rollback and Recovery

### PR Mode Recovery

| Scenario | Recovery |
|----------|----------|
| PR creation failed | Fix issue, re-run `wreckit pr <id>` |
| PR exists but needs update | Re-run updates existing PR |
| PR merged incorrectly | Use GitHub "Revert" feature |

### Direct Mode Recovery

| Scenario | Recovery |
|----------|----------|
| Merge failed mid-way | Run `git merge --abort`, fix conflicts, retry |
| Bad code merged | Manual `git revert <sha>` on base branch |
| Need to undo | Rollback to recorded SHA (if captured) |

### Rollback Anchors (Recommended)

Before direct merge, capture rollback information:

1. Record `git rev-parse HEAD` of base branch before merge
2. Save to `item.json` as `rollback_sha`
3. Optionally create backup ref: `refs/wreckit/backup/<item-id>`

This enables recovery commands:
- `git reset --hard <rollback_sha>` (local)
- `git push --force origin <base_branch>` (requires force-push permission)

## Resumability

The PR phase is designed to be safely re-runnable.

| Scenario | Behavior |
|----------|----------|
| PR already exists | Updates existing PR |
| Branch already pushed | No-op on push (already up-to-date) |
| Partial failure | Resumes from failed step |
| Auth fixed | Retries previously failed operations |

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `base_branch` | string | `"main"` | Target branch for PRs/merges |
| `branch_prefix` | string | `"wreckit/"` | Prefix for feature branches |
| `merge_mode` | `"pr"` or `"direct"` | `"pr"` | How to deliver completed work |

### Example Configurations

**Standard PR Workflow:**
- `base_branch`: `main`
- `branch_prefix`: `wreckit/`
- `merge_mode`: `pr`

**Direct Merge (Greenfield):**
- `base_branch`: `main`
- `branch_prefix`: `wreckit/`
- `merge_mode`: `direct`

**Develop Branch Target:**
- `base_branch`: `develop`
- `branch_prefix`: `feature/wreckit-`
- `merge_mode`: `pr`

---

## Known Gaps

### Gap 1: Preflight/Commit Ordering Bug (Critical)

The preflight check rejects uncommitted changes, but the auto-commit logic runs after preflight. This means the auto-commit never executes.

**Impact:** PR phase fails on any repo with uncommitted changes from implementation.

**Fix:** Reorder to: ensure branch → commit if dirty → preflight (require clean) → push.

### Gap 2: No Quality Gate Before Push

There is no test/lint/typecheck execution before pushing. Broken code can be pushed and create PRs.

**Impact:** PRs created with failing tests, lint errors, or type errors.

**Fix:** Add configurable pre-push commands that must pass before pushing.

### Gap 3: No Secret Scanning

There is no scanning for credentials, API keys, or sensitive data in the diff.

**Impact:** Secrets can be committed and pushed to remote.

**Fix:** Scan diff for common credential patterns before commit.

### Gap 4: Direct Mode Bypasses All Safeguards

Direct merge mode skips PR review, CI checks, and branch protections.

**Impact:** Broken or insecure code ships immediately to production branch.

**Fix:** Require explicit opt-in, run same quality gates, create rollback anchors.

### Gap 5: No Conflict Pre-Check

The system doesn't check for merge conflicts before attempting direct merge.

**Impact:** Merge fails mid-way, leaving repo in inconsistent state.

**Fix:** Detect potential conflicts before merge; auto-abort on failure.

### Gap 6: No Remote Validation

The system doesn't verify the remote URL matches expected repository.

**Impact:** Code could be pushed to wrong repository (fork, different org).

**Fix:** Validate `origin` remote URL against configured/expected pattern.

### Gap 7: No Mergeability Check After PR Creation

After creating a PR, the system doesn't verify the PR is actually mergeable.

**Impact:** PRs created that immediately show as unmergeable due to conflicts.

**Fix:** Query `gh pr view --json mergeable` after creation and warn/fail if not mergeable.

---

## See Also

- [004-implement-phase.md](./004-implement-phase.md) — Previous phase
- [006-complete-phase.md](./006-complete-phase.md) — Next phase in workflow

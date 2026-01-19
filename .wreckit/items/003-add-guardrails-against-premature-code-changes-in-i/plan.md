# Add guardrails against premature code changes in idea agent Implementation Plan

## Overview

This implementation adds user-facing warnings when running the idea capture phase with uncommitted git changes. The idea agent already has strong technical guardrails (`allowedTools` prevents Read/Write/Bash operations), but users were not warned that they had uncommitted changes before ideation, leading to confusion about whether code changes would occur.

**The fix is about communication, not technical restrictions** - agents already cannot modify code during ideation.

## Current State Analysis

### What Exists Now

**Strong Technical Protections (Already Working):**
- `src/domain/ideas-agent.ts:60` - `allowedTools: ["mcp__wreckit__save_parsed_ideas"]` prevents agent from using Read, Write, Edit, or Bash tools
- `src/domain/ideas-interview.ts:209` - Interview mode also restricts to `["mcp__wreckit__save_interview_ideas"]`
- `src/prompts/ideas.md:49-56` - Prompt explicitly states "DO NOT read any files", "DO NOT write any code", "DO NOT execute any commands"

**Missing User Communication:**
- No warning shown when user has uncommitted git changes before ideation
- No visual indicator that ideation ≠ implementation
- Users may proceed with WIP changes without realizing they should commit first

### Key Discoveries

1. **`hasUncommittedChanges()` function exists** at `src/git/index.ts:208-213` - checks `git status --porcelain` for any modifications
2. **`isGitRepo()` function exists** at `src/git/index.ts:119-146` - safely checks if we're in a git repository
3. **Pattern to follow** from `src/workflow/itemWorkflow.ts:622-631` - shows how to do pre-flight git checks before phases
4. **Logger interface** at `src/logging.ts:6-12` - has `warn()` method for non-blocking warnings
5. **Entry points are limited** - only 2 places need changes:
   - `src/commands/ideas.ts:57-97` - `ideasCommand()` function (file/stdin input modes)
   - `src/domain/ideas-interview.ts:245-276` - `runIdeaInterview()` function (interview mode)

### Constraints

- **Non-blocking warnings only** - must not prevent users from proceeding (they may have legitimate WIP changes)
- **No new dependencies** - use existing `src/git` utilities
- **Graceful degradation** - handle non-git repos by skipping checks
- **Skip in dryRun mode** - consistent with existing workflow patterns
- **Minimal changes** - only add warnings, don't change existing logic

## Desired End State

When users run `wreckit ideas` with uncommitted changes:
1. A clear warning is displayed: "⚠️  You have uncommitted changes. The idea phase is for planning and exploration only. The agent is configured to read-only and cannot make code changes, but you may want to commit your work first."
2. Execution continues normally (non-blocking)
3. Users are informed and can make better decisions about their workflow

Verification:
- Run `wreckit ideas` in a repo with uncommitted changes → warning shown
- Run `wreckit ideas` in a clean repo → no warning
- Run `wreckit ideas --dry-run` with changes → no warning (dryRun skips checks)
- Run `wreckit ideas` outside a git repo → no warning, no errors
- All existing tests continue to pass
- New tests verify warning behavior

## What We're NOT Doing

- **NOT adding blocking errors** - warnings are non-blocking by design
- **NOT changing the `allowedTools` configuration** - existing restrictions are sufficient
- **NOT adding `--force` flags** - not needed since warnings don't block
- **NOT checking for remote sync status** - only local uncommitted changes matter
- **NOT modifying the interview prompts** - prompts already have strong guardrails
- **NOT adding validation helper functions** - simple inline checks are sufficient for this scope
- **NOT changing how agents work** - agents already cannot modify code during ideation

## Implementation Approach

**Strategy:** Add lightweight git status checks at the two entry points for idea capture, showing non-blocking warnings if uncommitted changes exist. Use existing utility functions and follow established patterns from the workflow system.

**Reasoning:** The research confirms that technical guardrails (`allowedTools`) already prevent code modifications. The issue is purely about user communication. A minimal approach that adds warnings at entry points provides the needed user feedback without adding complexity.

---

## Phase 1: Add Git Check to ideasCommand()

### Overview

Add pre-flight git status check in the main `ideasCommand()` function before invoking any agent. This catches the most common use cases (file input, stdin input, interview mode fallback).

### Changes Required:

#### 1. Import Git Utilities
**File:** `src/commands/ideas.ts`
**Line:** 1-8 (add to imports)

**Before:**
```typescript
import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import type { Logger } from "../logging";
import { findRootFromOptions } from "../fs/paths";
import { persistItems, generateSlug } from "../domain/ideas";
import { parseIdeasWithAgent } from "../domain/ideas-agent";
import { runIdeaInterview, runSimpleInterview } from "../domain/ideas-interview";
import { FileNotFoundError } from "../errors";
```

**After:**
```typescript
import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import type { Logger } from "../logging";
import { findRootFromOptions } from "../fs/paths";
import { persistItems, generateSlug } from "../domain/ideas";
import { parseIdeasWithAgent } from "../domain/ideas-agent";
import { runIdeaInterview, runSimpleInterview } from "../domain/ideas-interview";
import { FileNotFoundError } from "../errors";
import { hasUncommittedChanges, isGitRepo } from "../git";
```

#### 2. Add Git Check Function
**File:** `src/commands/ideas.ts`
**Line:** After line 56 (before `ideasCommand` function)

**Add this helper function:**
```typescript
/**
 * Check for uncommitted git changes and warn user if found.
 * Non-blocking - allows execution to continue.
 */
async function warnIfUncommittedChanges(
  root: string,
  logger: Logger,
  dryRun?: boolean
): Promise<void> {
  // Skip check in dryRun mode or if not in a git repo
  if (dryRun) {
    return;
  }

  const inGitRepo = await isGitRepo(root);
  if (!inGitRepo) {
    return;
  }

  const hasChanges = await hasUncommittedChanges({ cwd: root, logger });
  if (hasChanges) {
    logger.warn(
      "⚠️  You have uncommitted changes. " +
        "The idea phase is for planning and exploration only. " +
        "The agent is configured to read-only and cannot make code changes, " +
        "but you may want to commit your work first."
    );
  }
}
```

#### 3. Call Git Check in ideasCommand
**File:** `src/commands/ideas.ts`
**Line:** After line 62 (after `const root = findRootFromOptions(options);`)

**Add:**
```typescript
export async function ideasCommand(
  options: IdeasOptions,
  logger: Logger,
  inputOverride?: string
): Promise<void> {
  const root = findRootFromOptions(options);

  // Warn if user has uncommitted changes before ideation
  await warnIfUncommittedChanges(root, logger, options.dryRun);

  let ideas: Awaited<ReturnType<typeof parseIdeasWithAgent>> = [];
  // ... rest of function unchanged
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test -- src/__tests__/commands/ideas.test.ts`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Create a git repo with uncommitted changes, run `wreckit ideas -f ideas.md` → warning displayed
- [ ] Run with clean repo (no changes) → no warning
- [ ] Run with `--dry-run` flag with changes → no warning
- [ ] Run outside git repo → no warning, no errors
- [ ] Interview mode also shows warning when started with uncommitted changes

**Note:** Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Add Git Check to runIdeaInterview()

### Overview

Add pre-flight git status check in `runIdeaInterview()` function. This handles the interactive interview mode, showing the warning before the interview begins so users can stash/commit if they want a clean slate.

### Changes Required:

#### 1. Import Git Utilities
**File:** `src/domain/ideas-interview.ts`
**Line:** 1-11 (add to imports)

**Before:**
```typescript
import * as readline from "node:readline";
import {
  unstable_v2_createSession,
  query,
  type unstable_v2_Session,
} from "@anthropic-ai/claude-agent-sdk";
import { loadPromptTemplate } from "../prompts";
import type { ParsedIdea } from "./ideas";
import { createWreckitMcpServer } from "../agent/mcp/wreckitMcpServer";
import { buildSdkEnv } from "../agent/env";
import { createLogger } from "../logging";
```

**After:**
```typescript
import * as readline from "node:readline";
import {
  unstable_v2_createSession,
  query,
  type unstable_v2_Session,
} from "@anthropic-ai/claude-agent-sdk";
import { loadPromptTemplate } from "../prompts";
import type { ParsedIdea } from "./ideas";
import { createWreckitMcpServer } from "../agent/mcp/wreckitMcpServer";
import { buildSdkEnv } from "../agent/env";
import { createLogger } from "../logging";
import { hasUncommittedChanges, isGitRepo } from "../git";
```

#### 2. Add Git Check at Start of runIdeaInterview
**File:** `src/domain/ideas-interview.ts`
**Line:** After line 253 (after `const sdkEnv = await buildSdkEnv({ cwd: root, logger });`)

**Add:**
```typescript
export async function runIdeaInterview(
  root: string,
  options: InterviewOptions = {}
): Promise<ParsedIdea[]> {
  const systemPrompt = await loadPromptTemplate(root, "interview");

  // Build SDK environment to pass custom credentials (ANTHROPIC_AUTH_TOKEN, etc.)
  const logger = createLogger({ verbose: options.verbose });
  const sdkEnv = await buildSdkEnv({ cwd: root, logger });

  // Warn if user has uncommitted changes before starting interview
  const inGitRepo = await isGitRepo(root);
  if (inGitRepo) {
    const hasChanges = await hasUncommittedChanges({ cwd: root, logger });
    if (hasChanges) {
      console.log("");
      console.log("⚠️  You have uncommitted changes.");
      console.log("  The idea phase is for planning and exploration only.");
      console.log("  The agent is configured to read-only and cannot make code changes.");
      console.log("  You may want to commit or stash your work first for a clean slate.");
      console.log("");
    }
  }

  // Create readline interface for user input
  // ... rest of function unchanged
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test -- src/__tests__/domain/ideas-interview.test.ts` (if exists)
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Run `wreckit ideas` (interview mode) with uncommitted changes → warning displayed before interview starts
- [ ] Run with clean repo → no warning
- [ ] Warning is formatted clearly with line breaks for readability
- [ ] Interview proceeds normally after warning (non-blocking)

**Note:** Complete all automated verification, then pause for manual confirmation before proceeding to testing phase.

---

## Phase 3: Add Tests for Warning Behavior

### Overview

Add unit tests to verify the warning behavior works correctly across different scenarios: uncommitted changes, clean repo, dry-run mode, and non-git repo.

### Changes Required:

#### 1. Add Test Cases to ideas.test.ts
**File:** `src/__tests__/commands/ideas.test.ts`

**Add these test cases:**

```typescript
describe("ideasCommand - git warnings", () => {
  beforeEach(async () => {
    tempDir = await setupTempRepo();
    mockLogger = createMockLogger();
    mockedParseIdeasWithAgent.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("warns when uncommitted changes exist", async () => {
    // Create uncommitted change
    const testFile = path.join(tempDir, "test.txt");
    await fs.writeFile(testFile, "uncommitted");

    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Test idea");
    mockedParseIdeasWithAgent.mockResolvedValue([{ title: "Test idea", description: "" }]);

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    // Should have warning message
    const warningMessages = mockLogger.messages.filter(m => m.startsWith("warn:"));
    expect(warningMessages.length).toBeGreaterThan(0);
    expect(warningMessages.some(m => m.includes("uncommitted changes"))).toBe(true);
  });

  it("does not warn when repo is clean", async () => {
    // No uncommitted changes
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Test idea");
    mockedParseIdeasWithAgent.mockResolvedValue([{ title: "Test idea", description: "" }]);

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    // Should not have warning message
    const warningMessages = mockLogger.messages.filter(m => m.startsWith("warn:"));
    expect(warningMessages.some(m => m.includes("uncommitted changes"))).toBe(false);
  });

  it("does not warn in dry-run mode even with changes", async () => {
    // Create uncommitted change
    const testFile = path.join(tempDir, "test.txt");
    await fs.writeFile(testFile, "uncommitted");

    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Test idea");
    mockedParseIdeasWithAgent.mockResolvedValue([{ title: "Test idea", description: "" }]);

    await ideasCommand({ file: ideasFile, cwd: tempDir, dryRun: true }, mockLogger);

    // Should not have warning message in dry-run
    const warningMessages = mockLogger.messages.filter(m => m.startsWith("warn:"));
    expect(warningMessages.some(m => m.includes("uncommitted changes"))).toBe(false);
  });

  it("does not warn outside git repo", async () => {
    // Remove .git to simulate non-git repo
    await fs.rm(path.join(tempDir, ".git"), { recursive: true, force: true });

    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Test idea");
    mockedParseIdeasWithAgent.mockResolvedValue([{ title: "Test idea", description: "" }]);

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    // Should not have warning message (and should not error)
    const warningMessages = mockLogger.messages.filter(m => m.startsWith("warn:"));
    expect(warningMessages.some(m => m.includes("uncommitted changes"))).toBe(false);
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] All new tests pass: `npm test -- src/__tests__/commands/ideas.test.ts`
- [ ] All existing tests still pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Review test coverage to ensure all scenarios are covered
- [ ] Run tests with `--verbose` flag to see detailed output
- [ ] Verify tests complete in reasonable time (< 5 seconds for ideas.test.ts)

**Note:** This is the final phase. After completion, all automated and manual verification should be done and the feature is ready for use.

---

## Testing Strategy

### Unit Tests:
- Mock `hasUncommittedChanges` and `isGitRepo` to control test scenarios
- Test all 4 key scenarios: uncommitted changes, clean repo, dry-run mode, non-git repo
- Verify warning messages are logged correctly via mock logger
- Ensure execution continues despite warnings (non-blocking)

### Integration Tests:
- Run `wreckit ideas` in actual git repo with staged and unstaged changes
- Verify warning appears and agent continues normally
- Test interview mode interaction with uncommitted changes
- Confirm `allowedTools` still prevents code modifications

### Manual Testing Steps:
1. **Setup test repo:**
   ```bash
   mkdir /tmp/test-wreckit && cd /tmp/test-wreckit
   git init
   wreckit init
   echo "# Test idea" > ideas.md
   echo "uncommitted" > test.txt
   ```

2. **Test warning appears:**
   ```bash
   wreckit ideas -f ideas.md
   # Should see: ⚠️  You have uncommitted changes...
   # Should proceed and create idea item
   ```

3. **Test no warning when clean:**
   ```bash
   git add test.txt
   git commit -m "test"
   wreckit ideas -f ideas.md
   # Should NOT see warning
   ```

4. **Test dry-run skips warning:**
   ```bash
   echo "another change" >> test.txt
   wreckit ideas -f ideas.md --dry-run
   # Should NOT see warning (dry-run mode)
   ```

5. **Test interview mode:**
   ```bash
   wreckit ideas
   # Should see warning before interview starts
   # Interview should proceed normally
   ```

6. **Test non-git repo:**
   ```bash
   cd /tmp
   mkdir test-no-git && cd test-no-git
   wreckit init
   echo "# Idea" > ideas.md
   wreckit ideas -f ideas.md
   # Should NOT see warning, should NOT error
   ```

## Migration Notes

No data migration required - this is a pure UX improvement that adds warnings. No breaking changes to existing functionality.

## References

- Research: `/Users/mhostetler/Source/Wreckit/wreckit/.wreckit/items/003-add-guardrails-against-premature-code-changes-in-i/research.md`
- Git utilities: `src/git/index.ts:119-146` (`isGitRepo`), `src/git/index.ts:208-213` (`hasUncommittedChanges`)
- Workflow pattern: `src/workflow/itemWorkflow.ts:622-631` (pre-flight check example)
- Ideas command: `src/commands/ideas.ts:57-97` (`ideasCommand` function)
- Interview flow: `src/domain/ideas-interview.ts:245-276` (`runIdeaInterview` function)
- Existing test file: `src/__tests__/commands/ideas.test.ts`
- Logger interface: `src/logging.ts:6-12` (`warn` method)

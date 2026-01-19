# Research: Add guardrails against premature code changes in idea agent

**Date**: 2026-01-19
**Item**: 003-add-guardrails-against-premature-code-changes-in-i

## Research Question
The idea agent went ahead and fixed an issue during the brainstorming process, which is unintended behavior. The idea stage should be about exploration and planning, not implementation.

**Motivation:** Preserve the separation between idea brainstorming and implementation phases. Users may not expect code changes during ideation.

**Success criteria:**
- Idea agent checks for local changes in the codebase before proceeding
- Warning shown to user if there are uncommitted changes
- Guardrails prevent the agent from making code changes during brainstorm

**Technical constraints:**
- Check for local git changes before allowing modifications
- Do not block workflow but show warnings to user
- Add safeguards within idea agent to prevent code modification operations

**Signals:** priority: medium

## Summary

The codebase already has **partial protections** in place for the idea agent through the use of `allowedTools`, which restricts the agent to only using MCP tools for saving parsed ideas. However, there are **two critical gaps**:

1. **No git status checking before running the idea agent** - The `ideasCommand` doesn't check for uncommitted changes before invoking the agent
2. **No explicit warning to users** about potential for premature changes

The research reveals that:
- Tool restrictions exist (`allowedTools: ["mcp__wreckit__save_parsed_ideas"]`) at `ideas-agent.ts:60` and `ideas-interview.ts:209`
- Git checking utilities are available in `src/git/index.ts` (`hasUncommittedChanges`, `checkGitPreflight`)
- The workflow system uses these checks before implementation phases (e.g., `itemWorkflow.ts:624`)
- The prompts already warn against file operations (`ideas.md:51-56`)

**Recommended approach:** Add pre-flight git status checks in both `ideasCommand` and the interview flow, showing warnings to users if uncommitted changes exist, while strengthening the prompt-level guardrails.

## Current State Analysis

### Existing Implementation

The idea agent has **some safeguards** but is incomplete:

**Tool Restrictions (Strong Protection):**
- `src/domain/ideas-agent.ts:52-60` - Uses `allowedTools: ["mcp__wreckit__save_parsed_ideas"]` to prevent Read, Write, Bash operations
- `src/domain/ideas-interview.ts:207-210` - Interview mode also restricts to `["mcp__wreckit__save_interview_ideas"]`
- `src/agent/claude-sdk-runner.ts:40-41` - Passes `allowedTools` to SDK as `tools` parameter

**Prompt-Level Guardrails (Medium Protection):**
- `src/prompts/ideas.md:49-56` - Explicitly states "DO NOT read any files", "DO NOT write any code", "DO NOT execute any commands"
- `src/prompts/interview.md` - Interview agent focused on conversation, not implementation

**Missing Protections:**
- No git status checking before running idea agents
- No user-facing warnings about uncommitted changes
- No validation that the workspace is clean before ideation

### Key Files

- **`src/commands/ideas.ts:57-97`** - Main entry point for ideas command. Calls `parseIdeasWithAgent` or `runIdeaInterview` without any git checks.
- **`src/domain/ideas-agent.ts:33-111`** - Core agent runner with `allowedTools` restriction at line 60. Critical comment at 52-54 explains the guardrail.
- **`src/domain/ideas-interview.ts:245-423`** - Interactive interview mode. Also has `allowedTools` at line 209.
- **`src/git/index.ts:208-213`** - `hasUncommittedChanges()` function that checks `git status --porcelain`
- **`src/git/index.ts:264-334`** - `checkGitPreflight()` with comprehensive validation including uncommitted changes detection
- **`src/workflow/itemWorkflow.ts:622-657`** - Example of proper pre-flight checks before implementation phases

## Technical Considerations

### Dependencies

**Internal Modules:**
- `src/git/index.ts` - Provides `hasUncommittedChanges()` and `checkGitPreflight()` utilities
- `src/logging/index.ts` - Logger interface for warnings
- Existing agent infrastructure in `src/agent/`

**External Dependencies:**
- `@anthropic-ai/claude-agent-sdk` - SDK already supports `allowedTools` parameter
- No new dependencies required

### Patterns to Follow

**Git Status Checking Pattern (from itemWorkflow.ts:622-657):**
```typescript
// Pre-flight git state checks
const gitOptions = { cwd: root, logger, dryRun };
if (!dryRun) {
  const preflight = await checkGitPreflight({ ...gitOptions, checkRemoteSync: false });
  if (!preflight.valid) {
    const error = formatPreflightErrors(preflight.errors);
    // Handle error
  }
}
```

**Tool Restriction Pattern (from ideas-agent.ts:52-60):**
```typescript
// CRITICAL: Only allow the MCP tool - prevent agent from using Read, Write, Bash, etc.
const result = await runAgent({
  // ... other options
  allowedTools: ["mcp__wreckit__save_parsed_ideas"],
});
```

**Error Handling Pattern:**
- Use `logger.warn()` for non-blocking warnings
- Use `checkGitPreflight()` for comprehensive validation
- Show user-friendly messages with recovery steps

### Integration Points

1. **`src/commands/ideas.ts`** - Add git check in `ideasCommand()` function before line 64-70
2. **`src/domain/ideas-interview.ts`** - Add git check in `runIdeaInterview()` before line 276
3. **`src/prompts/ideas.md`** - Already has guardrails, may strengthen language
4. **`src/prompts/interview.md`** - Consider adding explicit prohibition of code changes

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **False positives** - Warning on clean repos due to staged but uncommitted changes | Medium | Use warning (not error), allow user to proceed. Check for actual modifications vs just staged changes |
| **Breaking existing workflows** - Users who rely on creating ideas while having WIP changes | Medium | Use **warnings only**, not blocking errors. Document the warning clearly |
| **SDK agent still has theoretical access** - If `allowedTools` is misconfigured | High | Add defense-in-depth: prompt-level guardrails + tool restrictions + git checks |
| **Performance overhead** - Git status check adds latency | Low | `git status --porcelain` is fast (< 100ms typically). Only runs in non-dryRun mode |
| **Not a git repo** - Commands run outside git context | Low | Gracefully handle non-git repos by skipping checks (same as dryRun behavior) |

## Recommended Approach

Based on research findings, here's the **high-level implementation strategy**:

### Phase 1: Add Pre-flight Git Checks (Non-blocking)

1. **In `src/commands/ideas.ts`:**
   - Import `hasUncommittedChanges` from `src/git`
   - Before calling `parseIdeasWithAgent()` or `runIdeaInterview()`, check for uncommitted changes
   - If changes exist, show warning: "⚠️  You have uncommitted changes. The idea agent should only extract structured data, not make code changes."
   - Continue execution (don't block)

2. **In `src/domain/ideas-interview.ts`:**
   - Add similar check at start of `runIdeaInterview()`
   - Show warning before starting interview session
   - Allows user to stash changes if they want a clean slate

### Phase 2: Strengthen Prompt Guardrails

3. **Update `src/prompts/ideas.md`:**
   - Move "Stage Boundaries" section earlier (lines 49-56)
   - Add explicit warning: "If you detect existing code changes, do NOT modify them"
   - Reinforce that this is READ-ONLY ideation phase

4. **Update `src/prompts/interview.md`:**
   - Add explicit section: "What This Interview Is NOT For"
   - List: "Not for fixing bugs, not for writing code, not for modifying files"

### Phase 3: Add Validation (Optional)

5. **Consider adding a validation helper:**
   - Create `validateIdeaPhasePreconditions()` in `src/domain/ideas-agent.ts`
   - Centralizes git checking logic
   - Can be reused across both command and interview flows
   - Returns warnings array (empty if clean)

### Implementation Order

**Priority 1 (Must Have):**
- Add git status check with warnings in `ideasCommand()`
- This is the primary entry point and will catch most cases

**Priority 2 (Should Have):**
- Add git status check in `runIdeaInterview()`
- Strengthens prompt language in `ideas.md`

**Priority 3 (Nice to Have):**
- Add validation helper for reusability
- Update interview prompt with explicit prohibitions

## Open Questions

1. **Should we check for uncommitted changes in ALL modes or just non-dryRun?**
   - **Recommendation:** Check in all modes except dryRun (consistent with workflow pattern)

2. **Should the warning be an error that blocks execution?**
   - **Recommendation:** No - use warnings only. Users may have legitimate reasons for WIP changes during ideation

3. **Should we check for both unstaged AND staged changes?**
   - **Recommendation:** Yes - `hasUncommittedChanges()` checks both (any change in `git status --porcelain`)

4. **What if the user isn't in a git repo?**
   - **Recommendation:** Gracefully skip checks (check `isGitRepo()` first), same as workflow pattern

5. **Should we add a `--force` flag to bypass warnings?**
   - **Recommendation:** Not needed - warnings are non-blocking by design. Only add if users request it

## Additional Notes

### Existing Defenses Already in Place

The codebase **already has strong protection** via `allowedTools`:

```typescript
// From ideas-agent.ts:52-60
// CRITICAL: Only allow the MCP tool - prevent agent from using Read, Write, Bash, etc.
// This ensures the agent can ONLY extract structured ideas, not implement fixes
const result = await runAgent({
  // ...
  allowedTools: ["mcp__wreckit__save_parsed_ideas"],
});
```

This means **the SDK agent literally cannot use Read, Write, Edit, or Bash tools** even if prompted to. The proposed git checks are **defense-in-depth** warnings to users, not primary protection mechanisms.

### Why This Happened

The issue occurred because:
1. No warning was shown to the user that they had uncommitted changes
2. User may not have understood that ideation ≠ implementation
3. No "red flag" to signal "you should commit these changes first"

The **fix is about communication**, not technical restrictions (which already exist).

### Testing Strategy

- Add tests in `src/__tests__/commands/ideas.test.ts` for warning behavior
- Mock `hasUncommittedChanges` to return true/false
- Verify warnings are logged correctly
- Ensure execution continues despite warnings
- Test non-git repo handling

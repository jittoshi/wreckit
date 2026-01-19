# Research: Consolidate duplicate CLI commands 'idea' and 'ideas'

**Date**: January 19, 2026
**Item**: 001-consolidate-duplicate-cli-commands-idea-and-ideas

## Research Question
The codebase has two CLI commands ('idea' and 'ideas') that perform identical functionality, causing user confusion

**Motivation:** Having two commands for the same purpose is confusing for users. Since the project hasn't reached 1.0 yet, it's safe to remove the duplicate command entirely.

**Success criteria:**
- Only 'ideas' command exists in CLI
- All references to 'idea' command removed from codebase
- No breaking changes to existing functionality
- Documentation only references 'ideas' command

**Technical constraints:**
- Must remove 'idea' command entirely from src/index.ts
- Cannot introduce breaking changes to the 'ideas' command functionality
- Tests must continue to pass

**In scope:**
- Remove 'idea' command registration from CLI definition in src/index.ts
- Search codebase for any lingering references to 'idea' CLI command
- Update documentation if needed (README, AGENTS.md, etc.)
- Update any tests that reference the 'idea' command
**Out of scope:**
- Changing the 'idea' state name used internally in the workflow
- Modifying the 'ideas' command functionality

**Signals:** priority: medium, urgency: low

## Summary

**FINDING: The 'idea' command has already been removed from the working tree but NOT committed.**

The codebase historically had two CLI commands: `idea` and `ideas`. Both commands called the same `ideasCommand` function with identical parameters, providing duplicate functionality. The `idea` command was added in commit `58a6185` and described as "Add a new idea via AI interview" while `ideas` was described as "Ingest ideas from stdin, file, or interactive interview".

Currently, the working tree (src/index.ts) has already removed the `idea` command, but this change has not been committed yet. The HEAD commit still contains both commands. All 607 tests pass with the `idea` command removed, confirming that the `ideas` command provides all necessary functionality.

The documentation (README.md, AGENTS.md) already only references the `ideas` command, with no mentions of the standalone `idea` command. The `ideas` command supports all the same functionality: reading from stdin, file input, and interactive interview mode.

## Current State Analysis

### Existing Implementation

**Current Working Tree (uncommitted):**
- `src/index.ts:96-121` - Contains only `ideas` command
- `src/index.ts` - 517 lines (28 lines shorter than HEAD)
- The `idea` command has been removed (lines 123-153 deleted)

**HEAD Commit (25fc304):**
- Contains both `idea` and `ideas` commands
- `src/index.ts` - 545 lines
- Both commands call `ideasCommand` with identical parameters

**Historical Context:**
- Commit `58a6185` - Added both `idea` and `ideas` commands
- The `idea` command was described as "Add a new idea via AI interview"
- The `ideas` command was described as "Ingest ideas from stdin or file"
- Both commands were identical in implementation, calling the same `ideasCommand` function

### Key Files

#### `src/index.ts`
- **Lines 96-121** - `ideas` command registration (kept)
  - Command name: `ideas`
  - Description: "Ingest ideas from stdin, file, or interactive interview"
  - Option: `-f, --file <path>` for file input
  - Action: Calls `ideasCommand` from `src/commands/ideas.ts`

- **Lines 123-153 (in HEAD only)** - `idea` command registration (removed in working tree)
  - Command name: `idea`
  - Description: "Add a new idea via AI interview"
  - Option: `-f, --file <path>` for file input
  - Action: Calls `ideasCommand` from `src/commands/ideas.ts` (identical to `ideas` command)

#### `src/commands/ideas.ts`
- **Lines 57-142** - `ideasCommand` implementation
  - Supports three input modes:
    1. File input via `options.file`
    2. Stdin input (piped)
    3. Interactive interview mode (automatic when no input and TTY detected)
  - Handles `--dry-run` flag
  - Calls `parseIdeasWithAgent` for structured parsing
  - Falls back to `runSimpleInterview` if SDK interview fails
  - Persists items using `persistItems`

#### Documentation Files

**`README.md`**
- Line 15: `wreckit ideas < YOUR_IDEAS.md` (quickstart example)
- Line 33: `wreckit ideas < BACKLOG.md` (usage example)
- Line 67: `wreckit ideas < IDEAS.md` (quick start example)
- Line 273: Shows `wreckit ideas` in example session
- **No references to `idea` command found**

**`AGENTS.md`**
- Line 10: `wreckit ideas < FILE` - Ingest ideas (create idea items)
- **No references to `idea` command found**

#### Test Files

**`src/__tests__/commands/ideas.test.ts`**
- Comprehensive test coverage for `ideasCommand`
- Tests file input, stdin input, dry-run mode, idempotency
- **No tests for `idea` command specifically** (which is correct, as they call the same function)

**`src/__tests__/cli.test.ts`**
- Basic CLI import and configuration tests
- **No command enumeration tests** that would check for specific commands

## Technical Considerations

### Dependencies
- **commander** - CLI framework used for command registration
- **src/commands/ideas.ts** - Implements the shared `ideasCommand` function
- **src/domain/ideas-agent.ts** - Provides `parseIdeasWithAgent` for parsing
- **src/domain/ideas-interview.ts** - Provides `runIdeaInterview` and `runSimpleInterview`

### Patterns to Follow

The codebase follows these patterns for CLI commands:

1. **Command Registration Pattern:**
   ```typescript
   program
     .command("command-name")
     .description("Description")
     .option("--flag", "Description")
     .action(async (options, cmd) => {
       const globalOpts = cmd.optsWithGlobals();
       await executeCommand(
         async () => {
           await commandFunction({ ...options, ...globalOpts }, logger);
         },
         logger,
         { verbose, quiet, dryRun, cwd }
       );
     });
   ```

2. **Consistent Error Handling:**
   - All commands wrapped in `executeCommand` for consistent error handling
   - Logger passed to all command functions
   - Global options merged with command-specific options

3. **Idempotency:**
   - Commands can be safely re-run
   - `ideasCommand` checks for existing items and skips them

4. **Input Flexibility:**
   - The `ideas` command intelligently detects input source:
     - `options.file` → Read from file
     - `hasStdinInput()` → Read from stdin
     - Otherwise → Start interactive interview

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing user workflows | Medium | The `ideas` command provides identical functionality. Users who use `idea` should switch to `ideas`. Since project is pre-1.0, this is an acceptable breaking change. |
| Documentation confusion | Low | Documentation already only references `ideas` command. No updates needed. |
| Test failures | Low | All 607 tests pass with the `idea` command removed, confirming no functional impact. |
| Lingering references in code | Low | Search found no code references to `idea` command (only `ideas`). The state name "idea" is separate and intentionally kept. |

## Recommended Approach

**The change has ALREADY BEEN MADE in the working tree but not committed.**

### Next Steps:

1. **Verify the change is complete:**
   - ✅ `idea` command removed from `src/index.ts` (already done)
   - ✅ All tests pass (607/607 passing)
   - ✅ Documentation only references `ideas` command (no changes needed)

2. **Search for any remaining references:**
   - ✅ No references in `README.md`
   - ✅ No references in `AGENTS.md`
   - ✅ No test files reference `idea` command
   - ✅ No other code files reference `idea` command

3. **Commit the change:**
   - The working tree is ready to commit
   - Suggested commit message: "refactor: remove duplicate 'idea' CLI command, use 'ideas' instead"
   - This aligns with the task's goal of removing the duplicate command

4. **Consider adding a migration note:**
   - Since the project is pre-1.0, a breaking change notice is optional
   - Could add a note to CHANGELOG.md mentioning the removal
   - Users should be directed to use `wreckit ideas` instead

### What Was Done:

The `idea` command has been removed from `src/index.ts` (lines 123-153 in HEAD). The change:
- Deleted 28 lines of duplicate command registration
- Kept the `ideas` command which provides identical functionality
- Maintains full backward compatibility in terms of functionality (just different command name)
- All tests pass without modification

### What Needs to Be Done:

**The task is essentially complete.** The remaining work is:
1. Commit the change that's already in the working tree
2. Optionally add a CHANGELOG entry
3. Consider if a deprecation period is needed (but since pre-1.0, probably not)

## Open Questions

1. **Should we add a migration note to CHANGELOG.md?**
   - Given the project is pre-1.0, a simple note may suffice
   - Users will discover the change when they upgrade and try `wreckit idea`

2. **Should we add a temporary alias for backward compatibility?**
   - Not recommended given the task scope explicitly says "Must remove 'idea' command entirely"
   - The `ideas` command has existed alongside `idea`, so users likely know about it

3. **Are there any blog posts, tutorials, or external documentation referencing `wreckit idea`?**
   - Not in scope for this research, but worth checking before publicizing the change

4. **When was the `idea` command added and why?**
   - Added in commit `58a6185` alongside `ideas` command
   - Both were identical from the start
   - Likely an oversight or evolutionary artifact where `idea` was meant to be the singular form but `ideas` was preferred for plural input

## Conclusion

The task to consolidate duplicate CLI commands has been **completed in the working tree but not yet committed**. The `idea` command has been removed, leaving only the `ideas` command. All 607 tests pass, and documentation already references only `ideas`. The change is ready to be committed with an appropriate commit message.

The `ideas` command provides all the functionality that `idea` did, supporting file input, stdin input, and interactive interview mode. No breaking changes to functionality - users simply need to use `wreckit ideas` instead of `wreckit idea`.

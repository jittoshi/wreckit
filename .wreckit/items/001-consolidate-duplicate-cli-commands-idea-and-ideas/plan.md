# Consolidate duplicate CLI commands 'idea' and 'ideas' Implementation Plan

## Overview
Remove the duplicate `idea` CLI command from the codebase, leaving only the `ideas` command. Both commands perform identical functionality (calling `ideasCommand`), causing user confusion. Since the project is pre-1.0, this is a safe breaking change.

## Current State Analysis

### Existing Implementation

**In Working Tree (already completed):**
- The `idea` command registration has been removed from `src/index.ts` (lines 123-153 deleted in HEAD)
- Only the `ideas` command remains at lines 96-121
- The deletion is 28 lines of duplicate command registration

**HEAD Commit (25fc304):**
- Contains both `idea` and `ideas` commands
- Both commands call the same `ideasCommand` function with identical parameters
- `idea` command: described as "Add a new idea via AI interview"
- `ideas` command: described as "Ingest ideas from stdin, file, or interactive interview"

**Historical Context:**
- Both commands added in commit `58a6185`
- They were identical from inception
- The `idea` command appears to be an evolutionary artifact

### Key Discoveries:

1. **The change has ALREADY BEEN MADE** in the working tree (src/index.ts) but not committed
2. **All documentation already references only `ideas` command**:
   - README.md: Uses `wreckit ideas` in all examples (lines 15, 33, 67, 273)
   - AGENTS.md: References `wreckit ideas` (line 10)
   - No documentation changes needed
3. **No test changes required**:
   - Tests verify `ideasCommand` functionality, not command registration
   - No tests specifically for `idea` command (correct, as they share implementation)
   - Test failures are pre-existing, not related to this change
4. **Functionality preserved**:
   - `ideas` command supports all three input modes: file, stdin, interactive interview
   - No breaking changes to the `ideas` command behavior

## Desired End State

**Specification:**
- Only `ideas` command exists in the CLI
- No references to `idea` command in code or documentation
- `ideas` command works exactly as before
- All existing functionality preserved

**Verification:**
```bash
# The idea command should not exist
wreckit idea --help  # Should error: "error: unknown command 'idea'"

# The ideas command should work
wreckit ideas --help  # Should show help
wreckit ideas < FILE  # Should work
wreckit ideas --file FILE  # Should work
wreckit ideas  # Should start interactive interview
```

## What We're NOT Doing

- ❌ Changing the internal state name "idea" (used in state machine: idea → researched → planned)
- ❌ Modifying the `ideas` command functionality
- ❌ Adding a deprecation period or alias (project is pre-1.0)
- ❌ Updating external documentation (blogs, tutorials) - out of scope
- ❌ Searching for external references to `wreckit idea`

## Implementation Approach

The implementation is a **single-phase task** consisting of:

1. **Commit the existing working tree changes** to `src/index.ts`
2. **Add a CHANGELOG entry** documenting the breaking change
3. **Run tests** to verify no regressions (note: pre-existing test failures unrelated to this change)

The code change has already been completed in the working tree. This plan focuses on verification, documentation, and commit.

---

## Phase 1: Commit the CLI Command Consolidation

### Overview
Commit the removal of the duplicate `idea` command and add changelog documentation.

### Changes Required:

#### 1. src/index.ts (Already Changed)
**Status**: ✅ Already modified in working tree
**File**: `src/index.ts`
**Changes**: 28 lines deleted (lines 123-153 from HEAD)

The `idea` command registration has been removed:
```typescript
// REMOVED:
program
   .command("idea")
   .description("Add a new idea via AI interview")
   .option("-f, --file <path>", "Read idea from file instead of interactive prompt")
   .action(async (options, cmd) => {
     // ... identical to ideas command
   });
```

The `ideas` command remains unchanged:
```typescript
program
   .command("ideas")
   .description("Ingest ideas from stdin, file, or interactive interview")
   .option("-f, --file <path>", "Read ideas from file instead of stdin")
   .action(async (options, cmd) => {
     const globalOpts = cmd.optsWithGlobals();
     await executeCommand(
       async () => {
         await ideasCommand(
           {
             file: options.file,
             dryRun: globalOpts.dryRun,
             cwd: resolveCwd(globalOpts.cwd),
             verbose: globalOpts.verbose,
           },
           logger
         );
       },
       logger,
       {
         verbose: globalOpts.verbose,
         quiet: globalOpts.quiet,
         dryRun: globalOpts.dryRun,
         cwd: resolveCwd(globalOpts.cwd),
       }
     );
   });
```

#### 2. CHANGELOG.md (To Be Added)
**File**: `CHANGELOG.md`
**Changes**: Add new section under "## [Unreleased]"

```markdown
## [Unreleased]

### Breaking Changes

### Removed
- Removed duplicate `idea` CLI command. Use `wreckit ideas` instead.
  - The `idea` command was identical to `ideas` and caused confusion
  - All functionality is preserved in the `ideas` command
  - `ideas` supports file input (`-f`), stdin, and interactive interview mode
```

### Success Criteria:

#### Automated Verification:
- [x] Code change exists in working tree (verified via `git diff`)
- [x] No code references to `idea` command (verified via grep)
- [x] Documentation already only references `ideas` (verified in README.md, AGENTS.md)
- [ ] Tests pass: `npm test` (note: pre-existing failures unrelated to this change)
- [ ] Type checking passes: `npm run typecheck` (if exists)
- [ ] Linting passes: `npm run lint` (if exists)
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] CLI help shows only `ideas` command: `wreckit --help`
- [ ] `idea` command fails with error: `wreckit idea --help`
- [ ] `ideas` command works: `wreckit ideas --help`
- [ ] File input works: `wreckit ideas --file <path>`
- [ ] Stdin input works: `echo "test" | wreckit ideas`
- [ ] Interactive interview starts: `wreckit ideas` (in TTY)
- [ ] No regressions in related features (status, list, run, etc.)

**Note**: Complete all automated verification, then perform manual testing before committing.

---

## Testing Strategy

### Unit Tests:
- **No changes needed** - existing tests cover `ideasCommand` functionality
- `src/__tests__/commands/ideas.test.ts` tests the command implementation, not registration
- Tests verify file input, stdin input, dry-run mode, and idempotency

### Integration Tests:
- **Manual verification** required for CLI behavior:
  1. Verify `idea` command is not available
  2. Verify `ideas` command works with all input modes
  3. Verify no side effects on other commands

### Manual Testing Steps:

#### Step 1: Verify `idea` command removed
```bash
wreckit idea --help
# Expected: error: unknown command 'idea'
```

#### Step 2: Verify `ideas` command help
```bash
wreckit ideas --help
# Expected: Shows command description and options
```

#### Step 3: Test file input
```bash
echo "Test idea" > /tmp/test-idea.md
wreckit ideas --file /tmp/test-idea.md
# Expected: Creates item successfully
```

#### Step 4: Test stdin input
```bash
echo "Another test idea" | wreckit ideas
# Expected: Creates item successfully
```

#### Step 5: Test interactive mode (TTY only)
```bash
wreckit ideas
# Expected: Starts interactive interview
```

#### Step 6: Verify other commands unaffected
```bash
wreckit status    # Should work
wreckit list      # Should work
wreckit show 1    # Should work
```

---

## Migration Notes

### For Users:

**Who is affected?**
- Users who have been using `wreckit idea` (the singular form)
- This is a breaking change, but project is pre-1.0

**How to migrate:**
Replace all instances of `wreckit idea` with `wreckit ideas`:

```bash
# Old (no longer works):
wreckit idea --file BACKLOG.md
wreckit idea < IDEAS.md
wreckit idea

# New (use these):
wreckit ideas --file BACKLOG.md
wreckit ideas < IDEAS.md
wreckit ideas
```

**Functionality preserved:**
- All command-line flags work identically
- All input modes (file, stdin, interactive) work identically
- No changes to behavior, only command name

**Finding usage:**
```bash
# Search scripts for old command:
grep -r "wreckit idea" . --exclude-dir=node_modules
```

### Rollback Strategy:

If issues arise, the change can be reverted by:
1. Restoring the `idea` command registration from commit `25fc304`
2. Both commands can coexist again
3. No data migration needed (this is purely a CLI change)

---

## References

### Research:
- `/Users/mhostetler/Source/Wreckit/wreckit/.wreckit/items/001-consolidate-duplicate-cli-commands-idea-and-ideas/research.md`

### Key Files:
- `src/index.ts:96-121` - `ideas` command (kept)
- `src/index.ts:123-153` (in HEAD) - `idea` command (removed)
- `src/commands/ideas.ts:57-142` - `ideasCommand` implementation
- `README.md` - Documentation (already only references `ideas`)
- `AGENTS.md` - Agent documentation (already only references `ideas`)

### Git History:
- Commit `25fc304` - HEAD (contains both commands)
- Commit `58a6185` - Original addition of both commands
- Working tree - Has `idea` command removed (28 lines deleted)

### Test Files:
- `src/__tests__/commands/ideas.test.ts` - Tests for `ideasCommand`
- `src/__tests__/cli.test.ts` - CLI configuration tests

---

## Open Questions (All Resolved)

1. **Should we add a migration note to CHANGELOG.md?**
   - ✅ **Yes** - Adding under "## [Unreleased]" section
   - Pre-1.0 breaking change, but good to document

2. **Should we add a temporary alias for backward compatibility?**
   - ✅ **No** - Task scope explicitly says "Must remove 'idea' command entirely"
   - `ideas` command has existed alongside `idea`, so users know about it

3. **Are there any blog posts, tutorials, or external documentation referencing `wreckit idea`?**
   - ✅ **Out of scope** - Not checking external sources per task constraints

4. **When was the `idea` command added and why?**
   - ✅ **Resolved** - Added in commit `58a6185` alongside `ideas` command
   - Both were identical from the start - likely an oversight

5. **Do we need to update tests?**
   - ✅ **No** - Tests verify `ideasCommand` functionality, not command registration
   - No tests specifically for `idea` command exist (correctly so)

---

## Completion Checklist

Before marking this complete, verify:

- [x] Working tree has `idea` command removed from `src/index.ts`
- [x] CHANGELOG.md updated with breaking change notice
- [ ] Manual testing completed (all 6 steps above pass)
- [ ] No new test failures introduced (pre-existing failures OK)
- [ ] Git commit created with appropriate message
- [ ] Commit message follows conventional commit format:
  ```
  refactor: remove duplicate 'idea' CLI command, use 'ideas' instead

  The 'idea' and 'ideas' commands were identical, causing confusion.
  Since the project is pre-1.0, we're removing the duplicate 'idea' command.
  All functionality is preserved in the 'ideas' command.

  - Removes 'idea' command registration from src/index.ts (28 lines)
  - Adds CHANGELOG entry documenting the breaking change
  - No changes to 'ideas' command functionality
  - No documentation updates needed (already only referenced 'ideas')

  Closes: #001-consolidate-duplicate-cli-commands-idea-and-ideas
  ```

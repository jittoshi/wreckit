# Wreckit - Idea-to-PR Automation CLI

**Package:** `wreckit`  
**CLI:** `wreckit`  
**Node:** 18+  
**License:** MIT

A CLI tool for turning ideas into automated PRs through an autonomous agent loop.

---

## Overview

Transform ideas into shipped PRs through a simple workflow:

```
ideas → research → plan → implement → PR → done
```

**Requirement:** `.wreckit/` must be in the repository root (same directory as `.git/`).

---

## Quick Start

```bash
# Ingest ideas from any markdown file
wreckit ideas < IDEAS.md
wreckit ideas --file BACKLOG.md

# Run everything until all items complete
wreckit

# Or work on specific items
wreckit status              # See all items
wreckit run <id>            # Run single item
wreckit next                # Run next incomplete item
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Level 1: Orchestrator                    │
│  wreckit (default)                                          │
│  - Scans .wreckit/<section>/<nnn>-<slug>/ in sorted order   │
│  - Evaluates state of each item                             │
│  - Dispatches to Level 2                                    │
│  - Displays TUI progress dashboard                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Level 2: Workflow Loop                    │
│  Per-item state machine                                     │
│  - Validates prerequisites before each phase                │
│  - Runs phases in sequence                                  │
│  - Each phase invokes Level 3 agent                         │
│  - Updates item.json state after each phase                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Level 3: Coding Agent                    │
│  Pluggable: amp (default), claude                           │
│  - Receives prompt via stdin                                │
│  - Outputs completion signal when done                      │
│  - Writes artifacts to item folder                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Workflow States

```
raw → researched → planned → implementing → in_pr → done
```

| State | Description |
|-------|-------------|
| `raw` | Item exists, no work done |
| `researched` | `research.md` exists |
| `planned` | `plan.md` + `prd.json` exist |
| `implementing` | Agent working on stories |
| `in_pr` | PR opened, awaiting merge |
| `done` | PR merged |

### State Validation

| Target State | Prerequisites |
|--------------|---------------|
| `researched` | `research.md` exists |
| `planned` | `plan.md` exists; `prd.json` is valid JSON |
| `implementing` | `prd.json` has at least one story with `status: "pending"` |
| `in_pr` | All stories `status: "done"`; PR created |
| `done` | PR merged |

---

## Folder Structure

```
.wreckit/
├── config.json                    # Configuration
├── index.json                     # Item registry
├── prompts/                       # Prompt templates
│   ├── research.md
│   ├── plan.md
│   └── implement.md
└── <section>/
    └── <nnn>-<slug>/
        ├── item.json              # Metadata, state
        ├── research.md            # Research output
        ├── plan.md                # Implementation plan
        ├── prd.json               # User stories
        ├── prompt.md              # Generated agent prompt
        └── progress.log           # Append-only learnings
```

---

## Ideas Ingestion

Input is **freeform text**—notes, bullet points, stream of consciousness, markdown, whatever.

```bash
wreckit ideas < IDEAS.md
wreckit ideas --file BACKLOG.md
cat notes.txt | wreckit ideas
echo "Add dark mode support" | wreckit ideas
```

The agent parses the input and creates structured items in `.wreckit/`.

### Output Structure

Each item becomes a folder:

```
.wreckit/<section>/<nnn>-<slug>/
├── item.json
└── (other artifacts created during workflow)
```

- **Section:** Agent-determined grouping (e.g., `features`, `bugs`, `infra`)
- **Number:** Sequential within section (001, 002, ...)
- **Slug:** Derived from title
- **ID:** `<section>/<nnn>-<slug>` (e.g., `features/001-dark-mode`)

---

## CLI Commands

### Core Commands

```bash
wreckit                           # Run all items until done (TUI)
wreckit ideas < FILE              # Ingest ideas from stdin
wreckit ideas --file PATH         # Ingest from file
wreckit status                    # List all items with state
wreckit status --json             # JSON output for scripting
wreckit show <id>                 # Show item details
wreckit run <id>                  # Run single item through all phases
wreckit run <id> --force          # Regenerate artifacts
wreckit next                      # Run next incomplete item
wreckit doctor                    # Validate all items
wreckit doctor --fix              # Auto-fix recoverable issues
```

### Phase Commands (for testing/debugging)

Run individual phases on an item:

```bash
wreckit research <id>             # raw → researched
wreckit plan <id>                 # researched → planned
wreckit implement <id>            # planned → implementing (loops until done)
wreckit pr <id>                   # implementing → in_pr
wreckit complete <id>             # in_pr → done
```

Each command advances the item one step. Use `--force` to regenerate artifacts.

### Global Flags

```bash
--verbose                         # Detailed logs
--quiet                           # Errors only
--no-tui                          # Disable TUI (for CI)
--dry-run                         # Show what would be done
```

**That's it. 6 commands.**

---

## Configuration

`.wreckit/config.json`:

```json
{
  "schema_version": 1,
  "base_branch": "main",
  "branch_prefix": "wreckit/",
  
  "agent": {
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "<promise>COMPLETE</promise>"
  },
  
  "max_iterations": 100,
  "timeout_seconds": 3600
}
```

### Agent Options

**Amp (default):**
```json
{
  "agent": {
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

**Claude:**
```json
{
  "agent": {
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

---

## Schemas

### item.json

```json
{
  "schema_version": 1,
  "id": "section/001-slug",
  "title": "Feature name",
  "section": "section",
  "state": "raw",
  "overview": "Description",
  "branch": null,
  "pr_url": null,
  "pr_number": null,
  "last_error": null,
  "created_at": "2025-01-12T00:00:00Z",
  "updated_at": "2025-01-12T00:00:00Z"
}
```

### prd.json

```json
{
  "schema_version": 1,
  "id": "section/001-slug",
  "branch_name": "wreckit/001-slug",
  "user_stories": [
    {
      "id": "US-001",
      "title": "Story title",
      "acceptance_criteria": ["Criterion 1", "Criterion 2"],
      "priority": 1,
      "status": "pending",
      "notes": ""
    }
  ]
}
```

**Story status:** `pending` | `done`

**Priority:** 1 = highest

### index.json

```json
{
  "schema_version": 1,
  "items": [
    {"id": "foundation/001-core-types", "state": "raw", "title": "Core Types"}
  ],
  "generated_at": "2025-01-12T00:00:00Z"
}
```

---

## Agent Contract

### All Phases

- **Input:** Prompt via stdin
- **Output:** Completion signal to stdout when done
- **Artifacts:** Written to item folder

### Research Phase

**Agent must create:** `research.md`

### Plan Phase

**Agent must create:** `plan.md` and `prd.json`

### Implement Phase

**Agent must:**
1. Pick highest priority pending story
2. Implement it
3. Run quality checks
4. Commit changes
5. Update `prd.json` status to `done`
6. Append to `progress.log`
7. Output completion signal when ALL stories done

---

## Idempotency

| Command | If already done |
|---------|-----------------|
| `ideas` | Skip existing items, add new |
| `run` | Skip phases with existing artifacts |
| `run --force` | Regenerate all artifacts |

---

## Error Handling

| Failure | Behavior |
|---------|----------|
| Agent timeout | Set `last_error`, exit non-zero |
| Agent crash | Set `last_error`, state unchanged |
| Invalid artifact | Set `last_error`, state unchanged |
| Ctrl-C | Clean exit, state unchanged |

### Recovery

```bash
wreckit doctor              # Find issues
wreckit doctor --fix        # Auto-fix
```

---

## TUI Dashboard

```
┌─ Wreckit ───────────────────────────────────────────────────┐
│ Running: foundation/001-core-types                          │
│ Phase: implementing (iteration 3/100)                       │
│ Story: US-002 - Add validation logic                        │
├─────────────────────────────────────────────────────────────┤
│ ✓ foundation/001-core-types    done                         │
│ → foundation/002-api-layer     implementing  [US-002]       │
│ ○ features/001-auth            raw                          │
├─────────────────────────────────────────────────────────────┤
│ Progress: 1/3 complete | Runtime: 00:12:34                  │
│ [q] quit  [l] logs                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Prompt Templates

Located in `.wreckit/prompts/`. Customizable per-project.

### Template Variables

| Variable | Description |
|----------|-------------|
| `{{id}}` | Item ID |
| `{{title}}` | Item title |
| `{{section}}` | Section name |
| `{{overview}}` | Item description |
| `{{item_path}}` | Path to item folder |
| `{{branch_name}}` | Git branch name |
| `{{base_branch}}` | Base branch |
| `{{completion_signal}}` | Signal string |
| `{{research}}` | Contents of research.md |
| `{{plan}}` | Contents of plan.md |
| `{{prd}}` | Contents of prd.json |
| `{{progress}}` | Contents of progress.log |

---

## Git Operations

- **Branch:** Created from `base_branch` with `branch_prefix`
- **PR:** Created via `gh` CLI (GitHub only for v1)
- **Idempotent:** Existing PR is updated, not duplicated

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error |
| 130 | Interrupted |

---

## Example Session

```bash
$ wreckit ideas < IDEAS.md
Created 3 items:
  foundation/001-core-types
  foundation/002-api-layer
  features/001-auth

$ wreckit status
ID                          STATE
foundation/001-core-types   raw
foundation/002-api-layer    raw
features/001-auth           raw

$ wreckit
[TUI displays progress until all items complete...]

$ wreckit status
ID                          STATE
foundation/001-core-types   done
foundation/002-api-layer    done
features/001-auth           done
```

---

## Design Principles

1. **Files are truth** — All state in JSON/Markdown, git-trackable
2. **Idempotent** — Safe to re-run any command
3. **Simple** — 6 commands, minimal config
4. **Transparent** — All prompts visible/editable
5. **Recoverable** — Doctor command for repair

---

## v1 Scope

**In:**
- GitHub only
- Amp/Claude agents
- TUI progress
- Single-threaded

**Out (v2+):**
- Bitbucket/GitLab
- Parallel execution
- Multiple agent profiles
- Web dashboard

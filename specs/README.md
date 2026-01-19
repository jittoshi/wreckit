# Wreckit Specifications

Design documentation for Wreckit, an AI-powered backlog automation CLI.

## Workflow Phases

The "Ralph Wiggum Loop" — each phase is fully specified including state transitions, artifacts, security model, error handling, and resumability.

| Spec | Purpose |
|------|---------|
| [001-ideas-ingestion.md](./001-ideas-ingestion.md) | Parse raw ideas into structured items (extraction-only) |
| [002-research-phase.md](./002-research-phase.md) | Analyze codebase and document findings (read-only) |
| [003-plan-phase.md](./003-plan-phase.md) | Design solution and create user stories (design-only) |
| [004-implement-phase.md](./004-implement-phase.md) | Execute user stories iteratively until complete |
| [005-pr-phase.md](./005-pr-phase.md) | Create PR or merge directly to base branch |
| [006-complete-phase.md](./006-complete-phase.md) | Verify PR merge and mark item done |

## Cross-Cutting Systems

Shared infrastructure not fully owned by any single phase.

| Spec | Code | Purpose |
|------|------|---------|
| [007-item-store.md](./007-item-store.md) | [src/domain/](../src/domain/), [src/fs/](../src/fs/) | Item schema, `.wreckit/` layout, artifact discovery, indexing |
| [008-agent-runtime.md](./008-agent-runtime.md) | [src/agent/](../src/agent/) | SDK vs process mode, MCP tools, tool allowlists, completion detection |
| [009-cli.md](./009-cli.md) | [src/index.ts](../src/index.ts) | Top-level commands, global flags, batch run semantics, exit codes |
| [010-doctor.md](./010-doctor.md) | [src/doctor.ts](../src/doctor.ts) | Invariants, state repair, validation rules |

---

## State Flow

```
idea → researched → planned → implementing → in_pr → done
```

See individual phase specs for transition rules, skip behavior, and error recovery.

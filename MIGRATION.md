# Migrating to SDK Mode

Wreckit now supports using the Claude Agent SDK directly instead of spawning external processes. This provides better performance, error handling, and integration.

## Quick Start

To enable SDK mode, update your `.wreckit/config.json`:

```json
{
  "agent": {
    "mode": "sdk",
    "sdk_model": "claude-sonnet-4-20250514"
  }
}
```

## Configuration Options

### Process Mode (default, backward compatible)
```json
{
  "agent": {
    "mode": "process",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

### SDK Mode (recommended)
```json
{
  "agent": {
    "mode": "sdk",
    "sdk_model": "claude-sonnet-4-20250514",
    "sdk_max_tokens": 8192,
    "sdk_tools": ["Read", "Edit", "Bash", "Glob", "Grep"]
  }
}
```

## Benefits of SDK Mode

- **No process spawning overhead**: Agent runs in-process for faster execution
- **Better error handling**: Structured error types with clear messages
- **Built-in tools**: Access to Claude's full toolset without configuration
- **Context management**: Automatic context compaction and optimization
- **No completion signals**: SDK handles completion detection automatically

## Authentication

SDK mode uses the same authentication as Claude Code CLI:
- Set `ANTHROPIC_API_KEY` environment variable, OR
- Run `claude` in terminal to authenticate, which the SDK will use

## Migration Checklist

- [ ] Update config.json to set `agent.mode: "sdk"`
- [ ] Test SDK mode with `--dry-run` flag first
- [ ] Run a full workflow with SDK mode enabled
- [ ] Monitor for any differences in output or behavior
- [ ] Report any issues to [GitHub Issues](https://github.com/mikehostetler/wreckit/issues)

## Rolling Back

If you encounter issues with SDK mode, simply set `agent.mode: "process"` in your config to revert to process-based execution.

## Configuration Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `agent.mode` | `"process"` \| `"sdk"` | `"process"` | Agent execution mode |
| `agent.command` | `string` | `"claude"` | Command to run (process mode only) |
| `agent.args` | `string[]` | `["--dangerously-skip-permissions", "--print"]` | Arguments for command (process mode only) |
| `agent.completion_signal` | `string` | `"<promise>COMPLETE</promise>"` | Signal to detect completion (process mode only) |
| `agent.sdk_model` | `string?` | `undefined` | Model to use (SDK mode only) |
| `agent.sdk_max_tokens` | `number?` | `undefined` | Max tokens for responses (SDK mode only) |
| `agent.sdk_tools` | `string[]?` | `undefined` | Allowed tools (SDK mode only) |

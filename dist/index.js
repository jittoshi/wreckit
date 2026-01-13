#!/usr/bin/env bun

// src/index.ts
import { Command } from "commander";

// src/logging.ts
var LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
function createLogger(options) {
  const { verbose = false, quiet = false, noColor = false } = options ?? {};
  const minLevel = quiet ? LOG_LEVELS.error : verbose ? LOG_LEVELS.debug : LOG_LEVELS.info;
  const colors = {
    debug: noColor ? "" : "\x1B[90m",
    info: noColor ? "" : "\x1B[36m",
    warn: noColor ? "" : "\x1B[33m",
    error: noColor ? "" : "\x1B[31m",
    reset: noColor ? "" : "\x1B[0m"
  };
  const shouldLog = (level) => LOG_LEVELS[level] >= minLevel;
  const formatMessage = (level, message) => {
    const prefix = level === "debug" ? "[debug] " : level === "warn" ? "[warn] " : level === "error" ? "[error] " : "";
    return `${colors[level]}${prefix}${message}${colors.reset}`;
  };
  return {
    debug(message, ...args) {
      if (shouldLog("debug")) {
        console.log(formatMessage("debug", message), ...args);
      }
    },
    info(message, ...args) {
      if (shouldLog("info")) {
        console.log(formatMessage("info", message), ...args);
      }
    },
    warn(message, ...args) {
      if (shouldLog("warn")) {
        console.warn(formatMessage("warn", message), ...args);
      }
    },
    error(message, ...args) {
      if (shouldLog("error")) {
        console.error(formatMessage("error", message), ...args);
      }
    },
    json(data) {
      console.log(JSON.stringify(data));
    }
  };
}
var logger = createLogger();
function setLogger(l) {
  logger = l;
}
function initLogger(options) {
  const l = createLogger(options);
  setLogger(l);
  return l;
}

// src/errors.ts
var WreckitError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "WreckitError";
  }
};
var RepoNotFoundError = class extends WreckitError {
  constructor(message) {
    super(message, "REPO_NOT_FOUND");
    this.name = "RepoNotFoundError";
  }
};
var InvalidJsonError = class extends WreckitError {
  constructor(message) {
    super(message, "INVALID_JSON");
    this.name = "InvalidJsonError";
  }
};
var SchemaValidationError = class extends WreckitError {
  constructor(message) {
    super(message, "SCHEMA_VALIDATION");
    this.name = "SchemaValidationError";
  }
};
var FileNotFoundError = class extends WreckitError {
  constructor(message) {
    super(message, "FILE_NOT_FOUND");
    this.name = "FileNotFoundError";
  }
};
var InterruptedError = class extends WreckitError {
  constructor() {
    super("Operation interrupted", "INTERRUPTED");
    this.name = "InterruptedError";
  }
};
function toExitCode(error) {
  if (error === null || error === void 0) {
    return 0;
  }
  if (error instanceof InterruptedError) {
    return 130;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("sigint") || message.includes("interrupted")) {
      return 130;
    }
  }
  return 1;
}
function isWreckitError(error) {
  return error instanceof WreckitError;
}

// src/cli-utils.ts
async function executeCommand(fn, logger2, options) {
  try {
    await fn();
  } catch (error) {
    handleError(error, logger2, options);
    process.exit(toExitCode(error));
  }
}
function handleError(error, logger2, options) {
  if (isWreckitError(error)) {
    logger2.error(`[${error.code}] ${error.message}`);
  } else if (error instanceof Error) {
    logger2.error(error.message);
    if (options.verbose) {
      logger2.debug(error.stack || "");
    }
  } else {
    logger2.error(String(error));
  }
}
function setupInterruptHandler(logger2) {
  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) {
      process.exit(130);
    }
    interrupted = true;
    logger2.warn("\nInterrupted. Press Ctrl+C again to force exit.");
    setTimeout(() => process.exit(130), 100);
  });
}

// src/commands/ideas.ts
import * as fs4 from "fs/promises";
import * as readline from "readline";

// src/fs/paths.ts
import * as fs from "fs";
import * as path from "path";
function findRepoRoot(startCwd) {
  let current = path.resolve(startCwd);
  while (current !== path.dirname(current)) {
    const gitDir = path.join(current, ".git");
    const wreckitDir = path.join(current, ".wreckit");
    const hasGit = fs.existsSync(gitDir);
    const hasWreckit = fs.existsSync(wreckitDir);
    if (hasGit && hasWreckit) {
      return current;
    }
    if (hasWreckit && !hasGit) {
      throw new RepoNotFoundError(
        `Found .wreckit at ${current} but no .git directory`
      );
    }
    current = path.dirname(current);
  }
  throw new RepoNotFoundError(
    "Could not find repository root with .git and .wreckit directories"
  );
}
function getWreckitDir(root) {
  return path.join(root, ".wreckit");
}
function getConfigPath(root) {
  return path.join(getWreckitDir(root), "config.json");
}
function getIndexPath(root) {
  return path.join(getWreckitDir(root), "index.json");
}
function getPromptsDir(root) {
  return path.join(getWreckitDir(root), "prompts");
}
function getSectionDir(root, section) {
  return path.join(getWreckitDir(root), section);
}
function getItemDir(root, id) {
  const [section, slug] = id.split("/");
  return path.join(getWreckitDir(root), section, slug);
}
function getPrdPath(root, id) {
  return path.join(getItemDir(root, id), "prd.json");
}
function getResearchPath(root, id) {
  return path.join(getItemDir(root, id), "research.md");
}
function getPlanPath(root, id) {
  return path.join(getItemDir(root, id), "plan.md");
}
function getProgressLogPath(root, id) {
  return path.join(getItemDir(root, id), "progress.log");
}

// src/domain/ideas.ts
import * as fs3 from "fs/promises";
import * as path3 from "path";

// src/fs/json.ts
import * as fs2 from "fs/promises";
import * as path2 from "path";

// src/schemas.ts
import { z } from "zod";
var WorkflowStateSchema = z.enum([
  "raw",
  "researched",
  "planned",
  "implementing",
  "in_pr",
  "done"
]);
var StoryStatusSchema = z.enum(["pending", "done"]);
var ConfigSchema = z.object({
  schema_version: z.number().default(1),
  base_branch: z.string().default("main"),
  branch_prefix: z.string().default("wreckit/"),
  agent: z.object({
    command: z.string(),
    args: z.array(z.string()),
    completion_signal: z.string()
  }),
  max_iterations: z.number().default(100),
  timeout_seconds: z.number().default(3600)
});
var ItemSchema = z.object({
  schema_version: z.number(),
  id: z.string(),
  title: z.string(),
  section: z.string(),
  state: WorkflowStateSchema,
  overview: z.string(),
  branch: z.string().nullable(),
  pr_url: z.string().nullable(),
  pr_number: z.number().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});
var StorySchema = z.object({
  id: z.string(),
  title: z.string(),
  acceptance_criteria: z.array(z.string()),
  priority: z.number(),
  status: StoryStatusSchema,
  notes: z.string()
});
var PrdSchema = z.object({
  schema_version: z.number(),
  id: z.string(),
  branch_name: z.string(),
  user_stories: z.array(StorySchema)
});
var IndexItemSchema = z.object({
  id: z.string(),
  state: WorkflowStateSchema,
  title: z.string()
});
var IndexSchema = z.object({
  schema_version: z.number(),
  items: z.array(IndexItemSchema),
  generated_at: z.string()
});

// src/fs/json.ts
async function readJsonWithSchema(filePath, schema) {
  let content;
  try {
    content = await fs2.readFile(filePath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new FileNotFoundError(`File not found: ${filePath}`);
    }
    throw err;
  }
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    throw new InvalidJsonError(`Invalid JSON in file: ${filePath}`);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SchemaValidationError(
      `Schema validation failed for ${filePath}: ${result.error.message}`
    );
  }
  return result.data;
}
async function writeJsonPretty(filePath, data) {
  const dir = path2.dirname(filePath);
  await fs2.mkdir(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  await fs2.writeFile(filePath, content, "utf-8");
}
async function readItem(itemDir) {
  const itemPath = path2.join(itemDir, "item.json");
  return readJsonWithSchema(itemPath, ItemSchema);
}
async function writeItem(itemDir, item) {
  const itemPath = path2.join(itemDir, "item.json");
  await writeJsonPretty(itemPath, item);
}
async function readPrd(itemDir) {
  const prdPath = path2.join(itemDir, "prd.json");
  return readJsonWithSchema(prdPath, PrdSchema);
}

// src/domain/ideas.ts
function parseIdeasFromText(text) {
  const ideas = [];
  const lines = text.split("\n");
  let currentTitle = null;
  let currentOverview = [];
  const flushCurrent = () => {
    if (currentTitle) {
      ideas.push({
        title: currentTitle,
        overview: currentOverview.join("\n").trim()
      });
      currentTitle = null;
      currentOverview = [];
    }
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushCurrent();
      continue;
    }
    const headerMatch = trimmed.match(/^#{1,2}\s+(.+)$/);
    if (headerMatch) {
      flushCurrent();
      currentTitle = headerMatch[1].trim();
      continue;
    }
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushCurrent();
      ideas.push({
        title: bulletMatch[1].trim(),
        overview: ""
      });
      continue;
    }
    if (currentTitle) {
      currentOverview.push(trimmed);
    } else {
      ideas.push({
        title: trimmed,
        overview: ""
      });
    }
  }
  flushCurrent();
  return ideas;
}
function determineSection(idea) {
  const text = `${idea.title} ${idea.overview} ${idea.suggestedSection ?? ""}`.toLowerCase();
  if (/\b(bug|fix)\b/.test(text)) {
    return "bugs";
  }
  if (/\b(infra|ci|deploy|config)\b/.test(text)) {
    return "infra";
  }
  if (/\b(docs?|readme)\b/.test(text)) {
    return "docs";
  }
  return "features";
}
function generateSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}
async function allocateItemId(root, section, slug) {
  const sectionDir = getSectionDir(root, section);
  let maxNumber = 0;
  try {
    const entries = await fs3.readdir(sectionDir);
    for (const entry of entries) {
      const match = entry.match(/^(\d{3})-/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  const nextNumber = (maxNumber + 1).toString().padStart(3, "0");
  const id = `${section}/${nextNumber}-${slug}`;
  const dir = getItemDir(root, id);
  return { id, dir, number: nextNumber };
}
function createItemFromIdea(id, section, idea) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    schema_version: 1,
    id,
    title: idea.title,
    section,
    state: "raw",
    overview: idea.overview,
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: now,
    updated_at: now
  };
}
async function findExistingItemBySlug(root, section, slug) {
  const sectionDir = getSectionDir(root, section);
  try {
    const entries = await fs3.readdir(sectionDir);
    for (const entry of entries) {
      if (entry.endsWith(`-${slug}`)) {
        return `${section}/${entry}`;
      }
    }
  } catch {
  }
  return null;
}
async function persistItems(root, ideas) {
  const created = [];
  const skipped = [];
  for (const idea of ideas) {
    const section = determineSection(idea);
    const slug = generateSlug(idea.title);
    if (!slug) {
      skipped.push(idea.title || "(empty title)");
      continue;
    }
    const existingId = await findExistingItemBySlug(root, section, slug);
    if (existingId) {
      skipped.push(existingId);
      continue;
    }
    const { id, dir } = await allocateItemId(root, section, slug);
    const item = createItemFromIdea(id, section, idea);
    await fs3.mkdir(dir, { recursive: true });
    await writeJsonPretty(path3.join(dir, "item.json"), item);
    created.push(item);
  }
  return { created, skipped };
}
async function ingestIdeas(root, text) {
  const ideas = parseIdeasFromText(text);
  return persistItems(root, ideas);
}

// src/commands/ideas.ts
async function readStdin() {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity
    });
    rl.on("line", (line) => {
      chunks.push(line);
    });
    rl.on("close", () => {
      resolve2(chunks.join("\n"));
    });
    rl.on("error", (err) => {
      reject(err);
    });
  });
}
async function readFile3(filePath) {
  try {
    return await fs4.readFile(filePath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new FileNotFoundError(`File not found: ${filePath}`);
    }
    throw err;
  }
}
async function ideasCommand(options, logger2, cwd = process.cwd(), inputOverride) {
  const root = findRepoRoot(cwd);
  let input;
  if (inputOverride !== void 0) {
    input = inputOverride;
  } else if (options.file) {
    input = await readFile3(options.file);
  } else {
    input = await readStdin();
  }
  if (options.dryRun) {
    const ideas = parseIdeasFromText(input);
    if (ideas.length === 0) {
      logger2.info("No items would be created");
      return;
    }
    logger2.info(`Would create ${ideas.length} items:`);
    for (const idea of ideas) {
      const section = determineSection(idea);
      const slug = generateSlug(idea.title);
      if (slug) {
        logger2.info(`  ${section}/XXX-${slug}`);
      }
    }
    return;
  }
  const result = await ingestIdeas(root, input);
  if (result.created.length === 0 && result.skipped.length === 0) {
    logger2.info("No items created");
    return;
  }
  if (result.created.length > 0) {
    logger2.info(`Created ${result.created.length} items:`);
    for (const item of result.created) {
      logger2.info(`  ${item.id}`);
    }
  }
  if (result.skipped.length > 0) {
    logger2.info(`Skipped ${result.skipped.length} existing items:`);
    for (const id of result.skipped) {
      logger2.info(`  ${id}`);
    }
  }
}

// src/commands/status.ts
import * as fs5 from "fs/promises";
import * as path4 from "path";
async function scanItems(root) {
  const wreckitDir = getWreckitDir(root);
  const items = [];
  let sections;
  try {
    const entries = await fs5.readdir(wreckitDir, { withFileTypes: true });
    sections = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "prompts").map((e) => e.name);
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  for (const section of sections) {
    const sectionDir = path4.join(wreckitDir, section);
    let itemDirs;
    try {
      const entries = await fs5.readdir(sectionDir, { withFileTypes: true });
      itemDirs = entries.filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name)).map((e) => e.name);
    } catch {
      continue;
    }
    for (const itemDir of itemDirs) {
      const itemPath = path4.join(sectionDir, itemDir);
      try {
        const item = await readItem(itemPath);
        items.push({
          id: item.id,
          state: item.state,
          title: item.title
        });
      } catch {
      }
    }
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}
async function statusCommand(options, logger2) {
  const root = findRepoRoot(process.cwd());
  const items = await scanItems(root);
  if (options.json) {
    const index = {
      schema_version: 1,
      items,
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    logger2.json(index);
    return;
  }
  if (items.length === 0) {
    logger2.info("No items found");
    return;
  }
  const idWidth = Math.max(2, ...items.map((i) => i.id.length));
  const header = `${"ID".padEnd(idWidth)}  STATE`;
  logger2.info(header);
  for (const item of items) {
    const line = `${item.id.padEnd(idWidth)}  ${item.state}`;
    logger2.info(line);
  }
}

// src/commands/show.ts
import * as fs6 from "fs/promises";
async function fileExists(filePath) {
  try {
    await fs6.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function loadItemDetails(root, id) {
  const itemDir = getItemDir(root, id);
  const item = await readItem(itemDir);
  const hasResearch = await fileExists(getResearchPath(root, id));
  const hasPlan = await fileExists(getPlanPath(root, id));
  let prd = null;
  try {
    prd = await readJsonWithSchema(getPrdPath(root, id), PrdSchema);
  } catch {
  }
  return { item, hasResearch, hasPlan, prd };
}
async function showCommand(id, options, logger2) {
  const root = findRepoRoot(process.cwd());
  let details;
  try {
    details = await loadItemDetails(root, id);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new FileNotFoundError(`Item not found: ${id}`);
    }
    throw err;
  }
  const { item, hasResearch, hasPlan, prd } = details;
  if (options.json) {
    const output = {
      ...item,
      artifacts: {
        research: hasResearch,
        plan: hasPlan,
        prd: prd ?? void 0
      }
    };
    logger2.json(output);
    return;
  }
  logger2.info(`ID: ${item.id}`);
  logger2.info(`Title: ${item.title}`);
  logger2.info(`State: ${item.state}`);
  if (item.overview) {
    logger2.info(`Overview: ${item.overview}`);
  }
  logger2.info("");
  logger2.info(`Research: ${hasResearch ? "\u2713" : "\u2717"}`);
  logger2.info(`Plan: ${hasPlan ? "\u2713" : "\u2717"}`);
  if (prd) {
    const pending = prd.user_stories.filter((s) => s.status === "pending").length;
    const done = prd.user_stories.filter((s) => s.status === "done").length;
    logger2.info(`Stories: ${pending} pending, ${done} done`);
  } else {
    logger2.info("Stories: -");
  }
  if (item.branch) {
    logger2.info(`Branch: ${item.branch}`);
  }
  if (item.pr_url) {
    logger2.info(`PR: ${item.pr_url}`);
  }
  if (item.last_error) {
    logger2.info(`Last Error: ${item.last_error}`);
  }
}

// src/config.ts
import * as fs7 from "fs/promises";
var DEFAULT_CONFIG = {
  schema_version: 1,
  base_branch: "main",
  branch_prefix: "wreckit/",
  agent: {
    command: "claude",
    args: ["--dangerously-skip-permissions", "--print"],
    completion_signal: "<promise>COMPLETE</promise>"
  },
  max_iterations: 100,
  timeout_seconds: 3600
};
function mergeWithDefaults(partial) {
  const agent = partial.agent ? {
    command: partial.agent.command ?? DEFAULT_CONFIG.agent.command,
    args: partial.agent.args ?? DEFAULT_CONFIG.agent.args,
    completion_signal: partial.agent.completion_signal ?? DEFAULT_CONFIG.agent.completion_signal
  } : { ...DEFAULT_CONFIG.agent };
  return {
    schema_version: partial.schema_version ?? DEFAULT_CONFIG.schema_version,
    base_branch: partial.base_branch ?? DEFAULT_CONFIG.base_branch,
    branch_prefix: partial.branch_prefix ?? DEFAULT_CONFIG.branch_prefix,
    agent,
    max_iterations: partial.max_iterations ?? DEFAULT_CONFIG.max_iterations,
    timeout_seconds: partial.timeout_seconds ?? DEFAULT_CONFIG.timeout_seconds
  };
}
function applyOverrides(config, overrides) {
  return {
    schema_version: config.schema_version,
    base_branch: overrides.baseBranch ?? config.base_branch,
    branch_prefix: overrides.branchPrefix ?? config.branch_prefix,
    agent: {
      command: overrides.agentCommand ?? config.agent.command,
      args: overrides.agentArgs ?? config.agent.args,
      completion_signal: overrides.completionSignal ?? config.agent.completion_signal
    },
    max_iterations: overrides.maxIterations ?? config.max_iterations,
    timeout_seconds: overrides.timeoutSeconds ?? config.timeout_seconds
  };
}
async function loadConfig(root, overrides) {
  const configPath = getConfigPath(root);
  let partial = {};
  try {
    const content = await fs7.readFile(configPath, "utf-8");
    let data;
    try {
      data = JSON.parse(content);
    } catch {
      throw new InvalidJsonError(`Invalid JSON in file: ${configPath}`);
    }
    const result = ConfigSchema.safeParse(data);
    if (!result.success) {
      throw new SchemaValidationError(
        `Schema validation failed for ${configPath}: ${result.error.message}`
      );
    }
    partial = result.data;
  } catch (err) {
    if (err.code === "ENOENT") {
      partial = {};
    } else if (err instanceof InvalidJsonError || err instanceof SchemaValidationError) {
      throw err;
    } else {
      throw err;
    }
  }
  const resolved = mergeWithDefaults(partial);
  if (overrides) {
    return applyOverrides(resolved, overrides);
  }
  return resolved;
}

// src/workflow/itemWorkflow.ts
import * as fs9 from "fs/promises";

// src/domain/states.ts
var WORKFLOW_STATES = [
  "raw",
  "researched",
  "planned",
  "implementing",
  "in_pr",
  "done"
];
function getStateIndex(state) {
  return WORKFLOW_STATES.indexOf(state);
}
function getNextState(current) {
  const index = getStateIndex(current);
  if (index === -1 || index >= WORKFLOW_STATES.length - 1) {
    return null;
  }
  return WORKFLOW_STATES[index + 1];
}
function getAllowedNextStates(current) {
  const next = getNextState(current);
  return next ? [next] : [];
}

// src/domain/validation.ts
function allStoriesDone(prd) {
  if (!prd || prd.user_stories.length === 0) {
    return false;
  }
  return prd.user_stories.every((story) => story.status === "done");
}
function hasPendingStories(prd) {
  if (!prd) {
    return false;
  }
  return prd.user_stories.some((story) => story.status === "pending");
}
function canEnterResearched(ctx) {
  if (!ctx.hasResearchMd) {
    return { valid: false, reason: "research.md does not exist" };
  }
  return { valid: true };
}
function canEnterPlanned(ctx) {
  if (!ctx.hasPlanMd) {
    return { valid: false, reason: "plan.md does not exist" };
  }
  if (!ctx.prd) {
    return { valid: false, reason: "prd.json is not valid" };
  }
  return { valid: true };
}
function canEnterImplementing(ctx) {
  if (!hasPendingStories(ctx.prd)) {
    return {
      valid: false,
      reason: "prd.json has no stories with status pending"
    };
  }
  return { valid: true };
}
function canEnterInPr(ctx) {
  if (!allStoriesDone(ctx.prd)) {
    return { valid: false, reason: "not all stories are done" };
  }
  if (!ctx.hasPr) {
    return { valid: false, reason: "PR not created" };
  }
  return { valid: true };
}
function canEnterDone(ctx) {
  if (!ctx.prMerged) {
    return { valid: false, reason: "PR not merged" };
  }
  return { valid: true };
}
function validateTransition(current, target, ctx) {
  const allowed = getAllowedNextStates(current);
  if (!allowed.includes(target)) {
    return {
      valid: false,
      reason: `cannot transition from ${current} to ${target}`
    };
  }
  switch (target) {
    case "researched":
      return canEnterResearched(ctx);
    case "planned":
      return canEnterPlanned(ctx);
    case "implementing":
      return canEnterImplementing(ctx);
    case "in_pr":
      return canEnterInPr(ctx);
    case "done":
      return canEnterDone(ctx);
    default:
      return { valid: false, reason: `unknown target state: ${target}` };
  }
}

// src/prompts.ts
import * as fs8 from "fs/promises";
import * as path5 from "path";
import { fileURLToPath } from "url";
function getPromptsDir2(root) {
  return path5.join(getWreckitDir(root), "prompts");
}
function getPromptPath(root, name) {
  return path5.join(getPromptsDir2(root), `${name}.md`);
}
function getBundledPromptPath(name) {
  const __dirname = path5.dirname(fileURLToPath(import.meta.url));
  return path5.join(__dirname, "prompts", `${name}.md`);
}
async function getDefaultTemplate(name) {
  const bundledPath = getBundledPromptPath(name);
  return fs8.readFile(bundledPath, "utf-8");
}
async function loadPromptTemplate(root, name) {
  const promptPath = getPromptPath(root, name);
  try {
    const content = await fs8.readFile(promptPath, "utf-8");
    return content;
  } catch (err) {
    if (err.code === "ENOENT") {
      return getDefaultTemplate(name);
    }
    throw err;
  }
}
function renderPrompt(template, variables) {
  let result = template;
  const varMap = {
    id: variables.id,
    title: variables.title,
    section: variables.section,
    overview: variables.overview,
    item_path: variables.item_path,
    branch_name: variables.branch_name,
    base_branch: variables.base_branch,
    completion_signal: variables.completion_signal,
    research: variables.research,
    plan: variables.plan,
    prd: variables.prd,
    progress: variables.progress
  };
  for (const [key, value] of Object.entries(varMap)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(pattern, value ?? "");
  }
  return result;
}
async function initPromptTemplates(root) {
  const promptsDir = getPromptsDir2(root);
  await fs8.mkdir(promptsDir, { recursive: true });
  const promptNames = ["research", "plan", "implement"];
  for (const name of promptNames) {
    const filePath = getPromptPath(root, name);
    try {
      await fs8.access(filePath);
    } catch {
      const content = await getDefaultTemplate(name);
      await fs8.writeFile(filePath, content, "utf-8");
    }
  }
}

// src/agent/runner.ts
import { spawn } from "child_process";
function getAgentConfig(config) {
  return {
    command: config.agent.command,
    args: config.agent.args,
    completion_signal: config.agent.completion_signal,
    timeout_seconds: config.timeout_seconds,
    max_iterations: config.max_iterations
  };
}
async function runAgent(options) {
  const { config, cwd, prompt, logger: logger2, dryRun = false } = options;
  if (dryRun) {
    logger2.info(`[dry-run] Would run: ${config.command} ${config.args.join(" ")}`);
    logger2.info(`[dry-run] Working directory: ${cwd}`);
    logger2.info(`[dry-run] Prompt length: ${prompt.length} characters`);
    return {
      success: true,
      output: "[dry-run] No output",
      timedOut: false,
      exitCode: 0,
      completionDetected: true
    };
  }
  return new Promise((resolve2) => {
    let output = "";
    let timedOut = false;
    let completionDetected = false;
    let child;
    let timeoutId;
    try {
      child = spawn(config.command, config.args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (err) {
      logger2.error(`Failed to spawn agent: ${err}`);
      resolve2({
        success: false,
        output: `Failed to spawn agent: ${err}`,
        timedOut: false,
        exitCode: null,
        completionDetected: false
      });
      return;
    }
    if (config.timeout_seconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger2.warn(`Agent timed out after ${config.timeout_seconds} seconds`);
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5e3);
      }, config.timeout_seconds * 1e3);
    }
    child.stdout?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk);
      if (output.includes(config.completion_signal)) {
        completionDetected = true;
      }
    });
    child.stderr?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stderr.write(chunk);
      if (output.includes(config.completion_signal)) {
        completionDetected = true;
      }
    });
    child.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      logger2.error(`Agent process error: ${err}`);
      resolve2({
        success: false,
        output: output + `
Process error: ${err}`,
        timedOut: false,
        exitCode: null,
        completionDetected: false
      });
    });
    child.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      const success = code === 0 && completionDetected;
      logger2.debug(`Agent exited with code ${code}, completion detected: ${completionDetected}`);
      resolve2({
        success,
        output,
        timedOut,
        exitCode: code,
        completionDetected
      });
    });
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

// src/git/index.ts
import { spawn as spawn2 } from "child_process";
async function runGitCommand(args, options) {
  return runCommand("git", args, options);
}
async function runGhCommand(args, options) {
  return runCommand("gh", args, options);
}
async function runCommand(command, args, options) {
  const { cwd, logger: logger2, dryRun = false } = options;
  if (dryRun) {
    logger2.info(`[dry-run] Would run: ${command} ${args.join(" ")}`);
    return { stdout: "", exitCode: 0 };
  }
  logger2.debug(`Running: ${command} ${args.join(" ")}`);
  return new Promise((resolve2) => {
    const proc = spawn2(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0 && stderr) {
        logger2.debug(`Command stderr: ${stderr}`);
      }
      resolve2({ stdout: stdout.trim(), exitCode: code ?? 0 });
    });
    proc.on("error", (err) => {
      logger2.debug(`Command error: ${err.message}`);
      resolve2({ stdout: "", exitCode: 1 });
    });
  });
}
async function branchExists(branchName, options) {
  const result = await runGitCommand(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    options
  );
  return result.exitCode === 0;
}
async function ensureBranch(baseBranch, branchPrefix, itemSlug, options) {
  const { logger: logger2, dryRun = false } = options;
  const branchName = `${branchPrefix}${itemSlug}`;
  if (dryRun) {
    logger2.info(`[dry-run] Would ensure branch: ${branchName}`);
    return { branchName, created: true };
  }
  const exists = await branchExists(branchName, options);
  if (exists) {
    logger2.info(`Branch ${branchName} exists, switching to it`);
    await runGitCommand(["checkout", branchName], options);
    return { branchName, created: false };
  }
  logger2.info(`Creating branch ${branchName} from ${baseBranch}`);
  await runGitCommand(["checkout", baseBranch], options);
  await runGitCommand(["checkout", "-b", branchName], options);
  return { branchName, created: true };
}
async function hasUncommittedChanges(options) {
  const result = await runGitCommand(["status", "--porcelain"], options);
  return result.stdout.length > 0;
}
async function commitAll(message, options) {
  const { logger: logger2, dryRun = false } = options;
  if (dryRun) {
    logger2.info(`[dry-run] Would commit: ${message}`);
    return;
  }
  await runGitCommand(["add", "-A"], options);
  await runGitCommand(["commit", "-m", message], options);
}
async function pushBranch(branchName, options) {
  const { logger: logger2, dryRun = false } = options;
  if (dryRun) {
    logger2.info(`[dry-run] Would push branch: ${branchName}`);
    return;
  }
  await runGitCommand(["push", "-u", "origin", branchName], options);
}
async function getPrByBranch(branchName, options) {
  const result = await runGhCommand(
    ["pr", "view", branchName, "--json", "url,number"],
    options
  );
  if (result.exitCode !== 0) {
    return null;
  }
  try {
    const data = JSON.parse(result.stdout);
    return { url: data.url, number: data.number };
  } catch {
    return null;
  }
}
async function createOrUpdatePr(baseBranch, headBranch, title, body, options) {
  const { logger: logger2, dryRun = false } = options;
  if (dryRun) {
    logger2.info(`[dry-run] Would create/update PR: ${title}`);
    return { url: "https://github.com/example/repo/pull/0", number: 0, created: true };
  }
  const existing = await getPrByBranch(headBranch, options);
  if (existing) {
    logger2.info(`Updating existing PR #${existing.number}`);
    await runGhCommand(
      ["pr", "edit", String(existing.number), "--title", title, "--body", body],
      options
    );
    return { url: existing.url, number: existing.number, created: false };
  }
  logger2.info(`Creating new PR: ${title}`);
  const result = await runGhCommand(
    [
      "pr",
      "create",
      "--base",
      baseBranch,
      "--head",
      headBranch,
      "--title",
      title,
      "--body",
      body
    ],
    options
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to create PR: ${result.stdout}`);
  }
  const prInfo = await getPrByBranch(headBranch, options);
  if (!prInfo) {
    throw new Error("PR was created but could not retrieve its info");
  }
  return { url: prInfo.url, number: prInfo.number, created: true };
}
async function isPrMerged(prNumber, options) {
  const result = await runGhCommand(
    ["pr", "view", String(prNumber), "--json", "state"],
    options
  );
  if (result.exitCode !== 0) {
    return false;
  }
  try {
    const data = JSON.parse(result.stdout);
    return data.state === "MERGED";
  } catch {
    return false;
  }
}

// src/workflow/itemWorkflow.ts
async function fileExists2(filePath) {
  try {
    await fs9.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function readFileIfExists(filePath) {
  try {
    return await fs9.readFile(filePath, "utf-8");
  } catch {
    return void 0;
  }
}
async function loadPrdSafe(itemDir) {
  try {
    return await readPrd(itemDir);
  } catch {
    return null;
  }
}
async function buildValidationContext(root, item) {
  const itemDir = getItemDir(root, item.id);
  const researchPath = getResearchPath(root, item.id);
  const planPath = getPlanPath(root, item.id);
  const hasResearchMd = await fileExists2(researchPath);
  const hasPlanMd = await fileExists2(planPath);
  const prd = await loadPrdSafe(itemDir);
  const hasPr = item.pr_url !== null;
  const prMerged = item.state === "done";
  return {
    hasResearchMd,
    hasPlanMd,
    prd,
    hasPr,
    prMerged
  };
}
async function loadItem(root, itemId) {
  const itemDir = getItemDir(root, itemId);
  return readItem(itemDir);
}
async function saveItem(root, item) {
  const itemDir = getItemDir(root, item.id);
  await writeItem(itemDir, {
    ...item,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function buildPromptVariables(root, item, config) {
  const itemDir = getItemDir(root, item.id);
  const branchName = `${config.branch_prefix}${item.id.replace("/", "-")}`;
  const research = await readFileIfExists(getResearchPath(root, item.id));
  const plan = await readFileIfExists(getPlanPath(root, item.id));
  const prdContent = await readFileIfExists(getPrdPath(root, item.id));
  const progress = await readFileIfExists(getProgressLogPath(root, item.id));
  return {
    id: item.id,
    title: item.title,
    section: item.section,
    overview: item.overview,
    item_path: itemDir,
    branch_name: branchName,
    base_branch: config.base_branch,
    completion_signal: config.agent.completion_signal,
    research,
    plan,
    prd: prdContent,
    progress
  };
}
async function runPhaseResearch(itemId, options) {
  const { root, config, logger: logger2, force = false, dryRun = false } = options;
  let item = await loadItem(root, itemId);
  const researchPath = getResearchPath(root, item.id);
  if (!force && await fileExists2(researchPath)) {
    logger2.info(`Research already exists for ${itemId}, skipping`);
    if (item.state === "raw") {
      item = { ...item, state: "researched" };
      await saveItem(root, item);
    }
    return { success: true, item };
  }
  const targetState = "researched";
  if (item.state !== "raw" && !force) {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'raw' for research phase`
    };
  }
  const originalState = item.state;
  if (force && item.state !== "raw") {
    item = { ...item, state: "raw" };
  }
  const template = await loadPromptTemplate(root, "research");
  const variables = await buildPromptVariables(root, item, config);
  const prompt = renderPrompt(template, variables);
  const itemDir = getItemDir(root, item.id);
  const agentConfig = getAgentConfig(config);
  const result = await runAgent({
    config: agentConfig,
    cwd: itemDir,
    prompt,
    logger: logger2,
    dryRun
  });
  if (dryRun) {
    return { success: true, item };
  }
  if (!result.success) {
    const error = result.timedOut ? "Agent timed out" : `Agent failed with exit code ${result.exitCode}`;
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  if (!await fileExists2(researchPath)) {
    const error = "Agent did not create research.md";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  const newCtx = await buildValidationContext(root, item);
  const validation = validateTransition(item.state, targetState, newCtx);
  if (!validation.valid) {
    const error = validation.reason ?? "Validation failed";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  item = { ...item, state: targetState, last_error: null };
  await saveItem(root, item);
  return { success: true, item };
}
async function runPhasePlan(itemId, options) {
  const { root, config, logger: logger2, force = false, dryRun = false } = options;
  let item = await loadItem(root, itemId);
  const planPath = getPlanPath(root, item.id);
  const prdPath = getPrdPath(root, item.id);
  if (!force && await fileExists2(planPath) && await fileExists2(prdPath)) {
    logger2.info(`Plan already exists for ${itemId}, skipping`);
    if (item.state === "researched") {
      const prd2 = await loadPrdSafe(getItemDir(root, item.id));
      if (prd2) {
        item = { ...item, state: "planned" };
        await saveItem(root, item);
      }
    }
    return { success: true, item };
  }
  if (item.state !== "researched" && !force) {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'researched' for plan phase`
    };
  }
  const template = await loadPromptTemplate(root, "plan");
  const variables = await buildPromptVariables(root, item, config);
  const prompt = renderPrompt(template, variables);
  const itemDir = getItemDir(root, item.id);
  const agentConfig = getAgentConfig(config);
  const result = await runAgent({
    config: agentConfig,
    cwd: itemDir,
    prompt,
    logger: logger2,
    dryRun
  });
  if (dryRun) {
    return { success: true, item };
  }
  if (!result.success) {
    const error = result.timedOut ? "Agent timed out" : `Agent failed with exit code ${result.exitCode}`;
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  if (!await fileExists2(planPath)) {
    const error = "Agent did not create plan.md";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  if (!await fileExists2(prdPath)) {
    const error = "Agent did not create prd.json";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  const prd = await loadPrdSafe(itemDir);
  if (!prd) {
    const error = "prd.json is not valid JSON or fails schema validation";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  const targetState = "planned";
  const newCtx = await buildValidationContext(root, item);
  const validation = validateTransition(item.state, targetState, newCtx);
  if (!validation.valid) {
    const error = validation.reason ?? "Validation failed";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  item = { ...item, state: targetState, last_error: null };
  await saveItem(root, item);
  return { success: true, item };
}
async function runPhaseImplement(itemId, options) {
  const { root, config, logger: logger2, force = false, dryRun = false } = options;
  let item = await loadItem(root, itemId);
  const itemDir = getItemDir(root, item.id);
  if (item.state !== "planned" && item.state !== "implementing" && !force) {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'planned' or 'implementing' for implement phase`
    };
  }
  let prd = await loadPrdSafe(itemDir);
  if (!prd) {
    const error = "prd.json not found or invalid";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  if (allStoriesDone(prd)) {
    logger2.info(`All stories already done for ${itemId}`);
    return { success: true, item };
  }
  if (item.state === "planned") {
    item = { ...item, state: "implementing" };
    await saveItem(root, item);
  }
  let iteration = 0;
  const maxIterations = config.max_iterations;
  while (hasPendingStories(prd) && iteration < maxIterations) {
    iteration++;
    const pendingStories = prd.user_stories.filter((s) => s.status === "pending").sort((a, b) => a.priority - b.priority);
    if (pendingStories.length === 0) break;
    const currentStory = pendingStories[0];
    logger2.info(
      `Implementing story ${currentStory.id} (iteration ${iteration}/${maxIterations})`
    );
    const template = await loadPromptTemplate(root, "implement");
    const variables = await buildPromptVariables(root, item, config);
    const prompt = renderPrompt(template, variables);
    const agentConfig = getAgentConfig(config);
    const result = await runAgent({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger: logger2,
      dryRun
    });
    if (dryRun) {
      return { success: true, item };
    }
    if (!result.success) {
      const error = result.timedOut ? "Agent timed out" : `Agent failed with exit code ${result.exitCode}`;
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }
    prd = await loadPrdSafe(itemDir);
    if (!prd) {
      const error = "prd.json became invalid during implementation";
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }
    const progressPath = getProgressLogPath(root, item.id);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const logEntry = `[${timestamp}] Completed iteration ${iteration} for story ${currentStory.id}
`;
    await fs9.appendFile(progressPath, logEntry, "utf-8");
  }
  if (iteration >= maxIterations && hasPendingStories(prd)) {
    const error = `Reached max iterations (${maxIterations}) with stories still pending`;
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  item = await loadItem(root, itemId);
  item = { ...item, last_error: null };
  await saveItem(root, item);
  return { success: true, item };
}
async function runPhasePr(itemId, options) {
  const { root, config, logger: logger2, dryRun = false } = options;
  let item = await loadItem(root, itemId);
  const itemDir = getItemDir(root, item.id);
  if (item.state !== "implementing") {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'implementing' for PR phase`
    };
  }
  const prd = await loadPrdSafe(itemDir);
  if (!allStoriesDone(prd)) {
    const error = "Not all stories are done";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }
  const gitOptions = { cwd: root, logger: logger2, dryRun };
  const itemSlug = item.id.replace("/", "-");
  const branchResult = await ensureBranch(
    config.base_branch,
    config.branch_prefix,
    itemSlug,
    gitOptions
  );
  if (await hasUncommittedChanges(gitOptions)) {
    const commitMessage = `feat(${itemSlug}): implement ${item.title}`;
    await commitAll(commitMessage, gitOptions);
  }
  await pushBranch(branchResult.branchName, gitOptions);
  const prTitle = `[${item.section}] ${item.title}`;
  const prBody = `## Overview

${item.overview}

---

*Automated PR created by wreckitloop*`;
  const prResult = await createOrUpdatePr(
    config.base_branch,
    branchResult.branchName,
    prTitle,
    prBody,
    gitOptions
  );
  item = {
    ...item,
    state: "in_pr",
    branch: branchResult.branchName,
    pr_url: prResult.url,
    pr_number: prResult.number,
    last_error: null
  };
  await saveItem(root, item);
  logger2.info(
    `${prResult.created ? "Created" : "Updated"} PR for ${itemId}: ${prResult.url}`
  );
  return { success: true, item };
}
async function runPhaseComplete(itemId, options) {
  const { root, logger: logger2, dryRun = false } = options;
  let item = await loadItem(root, itemId);
  if (item.state !== "in_pr") {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'in_pr' for complete phase`
    };
  }
  if (dryRun) {
    logger2.info(`[dry-run] Would complete ${itemId}`);
    return { success: true, item };
  }
  if (item.pr_number === null) {
    return {
      success: false,
      item,
      error: "Item has no PR number"
    };
  }
  const gitOptions = { cwd: root, logger: logger2, dryRun };
  const prMerged = await isPrMerged(item.pr_number, gitOptions);
  if (!prMerged) {
    return {
      success: false,
      item,
      error: "PR not merged yet"
    };
  }
  item = { ...item, state: "done", last_error: null };
  await saveItem(root, item);
  logger2.info(`Completed ${itemId}`);
  return { success: true, item };
}
function getNextPhase(item) {
  switch (item.state) {
    case "raw":
      return "research";
    case "researched":
      return "plan";
    case "planned":
      return "implement";
    case "implementing":
      return "pr";
    case "in_pr":
      return "complete";
    case "done":
      return null;
    default:
      return null;
  }
}

// src/commands/phase.ts
var PHASE_CONFIG = {
  research: {
    requiredState: "raw",
    targetState: "researched",
    skipIfInTarget: true,
    runFn: runPhaseResearch
  },
  plan: {
    requiredState: "researched",
    targetState: "planned",
    skipIfInTarget: true,
    runFn: runPhasePlan
  },
  implement: {
    requiredState: ["planned", "implementing"],
    targetState: "implementing",
    skipIfInTarget: false,
    runFn: runPhaseImplement
  },
  pr: {
    requiredState: "implementing",
    targetState: "in_pr",
    skipIfInTarget: true,
    runFn: runPhasePr
  },
  complete: {
    requiredState: "in_pr",
    targetState: "done",
    skipIfInTarget: true,
    runFn: runPhaseComplete
  }
};
function isInRequiredState(currentState, required) {
  if (Array.isArray(required)) {
    return required.includes(currentState);
  }
  return currentState === required;
}
function isInTargetState(currentState, targetState) {
  return currentState === targetState;
}
function isInvalidTransition(phase, currentState) {
  const config = PHASE_CONFIG[phase];
  const stateOrder = [
    "raw",
    "researched",
    "planned",
    "implementing",
    "in_pr",
    "done"
  ];
  const currentIndex = stateOrder.indexOf(currentState);
  const targetIndex = stateOrder.indexOf(config.targetState);
  if (currentState === "done" && phase !== "complete") {
    return true;
  }
  if (currentIndex > targetIndex) {
    return true;
  }
  return false;
}
async function runPhaseCommand(phase, itemId, options, logger2) {
  const { force = false, dryRun = false } = options;
  const root = findRepoRoot(process.cwd());
  const config = await loadConfig(root);
  const itemDir = getItemDir(root, itemId);
  let item;
  try {
    item = await readItem(itemDir);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new WreckitError(`Item not found: ${itemId}`, "ITEM_NOT_FOUND");
    }
    throw err;
  }
  const phaseConfig = PHASE_CONFIG[phase];
  if (isInvalidTransition(phase, item.state)) {
    throw new WreckitError(
      `Cannot run ${phase} on item in state '${item.state}' - invalid transition`,
      "INVALID_TRANSITION"
    );
  }
  if (!force && phaseConfig.skipIfInTarget && isInTargetState(item.state, phaseConfig.targetState)) {
    logger2.info(
      `Item ${itemId} is already in state '${item.state}', skipping (use --force to override)`
    );
    return;
  }
  if (!force && !isInRequiredState(item.state, phaseConfig.requiredState) && !isInTargetState(item.state, phaseConfig.targetState)) {
    const requiredStr = Array.isArray(phaseConfig.requiredState) ? phaseConfig.requiredState.join("' or '") : phaseConfig.requiredState;
    throw new WreckitError(
      `Item is in state '${item.state}', expected '${requiredStr}' for ${phase} phase`,
      "INVALID_STATE"
    );
  }
  if (dryRun) {
    logger2.info(
      `[dry-run] Would run ${phase} phase on ${itemId} (${item.state} \u2192 ${phaseConfig.targetState})`
    );
    return;
  }
  const workflowOptions = {
    root,
    config,
    logger: logger2,
    force,
    dryRun
  };
  const result = await phaseConfig.runFn(itemId, workflowOptions);
  if (result.success) {
    logger2.info(
      `Successfully ran ${phase} phase on ${itemId}: ${item.state} \u2192 ${result.item.state}`
    );
  } else {
    throw new WreckitError(
      result.error ?? `Phase ${phase} failed for ${itemId}`,
      "PHASE_FAILED"
    );
  }
}

// src/commands/run.ts
import * as fs10 from "fs/promises";
async function fileExists3(filePath) {
  try {
    await fs10.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function phaseArtifactsExist(phase, root, itemId) {
  switch (phase) {
    case "research":
      return fileExists3(getResearchPath(root, itemId));
    case "plan": {
      const planExists = await fileExists3(getPlanPath(root, itemId));
      const prdExists = await fileExists3(getPrdPath(root, itemId));
      return planExists && prdExists;
    }
    case "implement":
    case "pr":
    case "complete":
      return false;
    default:
      return false;
  }
}
async function runCommand2(itemId, options, logger2) {
  const { force = false, dryRun = false } = options;
  const root = findRepoRoot(process.cwd());
  const config = await loadConfig(root);
  const itemDir = getItemDir(root, itemId);
  let item;
  try {
    item = await readItem(itemDir);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new WreckitError(`Item not found: ${itemId}`, "ITEM_NOT_FOUND");
    }
    throw err;
  }
  if (item.state === "done") {
    logger2.info(`Item ${itemId} is already done`);
    return;
  }
  const workflowOptions = {
    root,
    config,
    logger: logger2,
    force,
    dryRun
  };
  const phaseRunners = {
    research: runPhaseResearch,
    plan: runPhasePlan,
    implement: runPhaseImplement,
    pr: runPhasePr,
    complete: runPhaseComplete
  };
  while (true) {
    item = await readItem(itemDir);
    if (item.state === "done") {
      logger2.info(`Item ${itemId} completed successfully`);
      return;
    }
    const nextPhase = getNextPhase(item);
    if (!nextPhase) {
      logger2.info(`Item ${itemId} is in state '${item.state}' with no next phase`);
      return;
    }
    if (!force && await phaseArtifactsExist(nextPhase, root, itemId)) {
      logger2.info(`Skipping ${nextPhase} phase (artifacts exist, use --force to regenerate)`);
      const runner2 = phaseRunners[nextPhase];
      const result2 = await runner2(itemId, { ...workflowOptions, force: false });
      if (!result2.success) {
        throw new WreckitError(
          result2.error ?? `Phase ${nextPhase} failed for ${itemId}`,
          "PHASE_FAILED"
        );
      }
      continue;
    }
    if (dryRun) {
      logger2.info(`[dry-run] Would run ${nextPhase} phase on ${itemId}`);
      return;
    }
    logger2.info(`Running ${nextPhase} phase on ${itemId}`);
    const runner = phaseRunners[nextPhase];
    const result = await runner(itemId, workflowOptions);
    if (!result.success) {
      throw new WreckitError(
        result.error ?? `Phase ${nextPhase} failed for ${itemId}`,
        "PHASE_FAILED"
      );
    }
    logger2.info(`Completed ${nextPhase} phase: ${item.state} \u2192 ${result.item.state}`);
  }
}

// src/tui/dashboard.ts
function createTuiState(items) {
  return {
    currentItem: null,
    currentPhase: null,
    currentIteration: 0,
    maxIterations: 100,
    currentStory: null,
    items: items.map((item) => ({
      id: item.id,
      state: item.state,
      title: item.title,
      currentStoryId: void 0
    })),
    completedCount: items.filter((item) => item.state === "done").length,
    totalCount: items.length,
    startTime: /* @__PURE__ */ new Date(),
    logs: []
  };
}
function updateTuiState(state, update) {
  return { ...state, ...update };
}
function formatRuntime(startTime) {
  const now = /* @__PURE__ */ new Date();
  const diffMs = now.getTime() - startTime.getTime();
  const totalSeconds = Math.floor(diffMs / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
function getStateIcon(state) {
  switch (state) {
    case "done":
      return "\u2713";
    case "implementing":
    case "in_pr":
      return "\u2192";
    case "raw":
    case "researched":
    case "planned":
    default:
      return "\u25CB";
  }
}
function padToWidth(str, width) {
  if (str.length > width) {
    return str.slice(0, width - 1) + "\u2026";
  }
  return str.padEnd(width);
}
function renderDashboard(state, width = 65) {
  const innerWidth = width - 4;
  const lines = [];
  lines.push("\u250C\u2500 Wreckit " + "\u2500".repeat(width - 12) + "\u2510");
  const currentItemText = state.currentItem ? `Running: ${state.currentItem}` : "Waiting...";
  lines.push("\u2502 " + padToWidth(currentItemText, innerWidth) + " \u2502");
  const phaseText = state.currentPhase ? `Phase: ${state.currentPhase} (iteration ${state.currentIteration}/${state.maxIterations})` : "Phase: idle";
  lines.push("\u2502 " + padToWidth(phaseText, innerWidth) + " \u2502");
  const storyText = state.currentStory ? `Story: ${state.currentStory.id} - ${state.currentStory.title}` : "Story: none";
  lines.push("\u2502 " + padToWidth(storyText, innerWidth) + " \u2502");
  lines.push("\u251C" + "\u2500".repeat(width - 2) + "\u2524");
  if (state.items.length === 0) {
    lines.push("\u2502 " + padToWidth("No items", innerWidth) + " \u2502");
  } else {
    for (const item of state.items) {
      const icon = getStateIcon(item.state);
      const storyInfo = item.currentStoryId ? ` [${item.currentStoryId}]` : "";
      const itemLine = `${icon} ${padToWidth(item.id, 30)} ${padToWidth(item.state, 14)}${storyInfo}`;
      lines.push("\u2502 " + padToWidth(itemLine, innerWidth) + " \u2502");
    }
  }
  lines.push("\u251C" + "\u2500".repeat(width - 2) + "\u2524");
  const runtime = formatRuntime(state.startTime);
  const progressText = `Progress: ${state.completedCount}/${state.totalCount} complete | Runtime: ${runtime}`;
  lines.push("\u2502 " + padToWidth(progressText, innerWidth) + " \u2502");
  const keysText = "[q] quit  [l] logs";
  lines.push("\u2502 " + padToWidth(keysText, innerWidth) + " \u2502");
  lines.push("\u2514" + "\u2500".repeat(width - 2) + "\u2518");
  return lines.join("\n");
}

// src/tui/runner.ts
var TuiRunner = class {
  state;
  intervalId = null;
  options;
  stdin = null;
  constructor(items, options) {
    this.state = createTuiState(items);
    this.options = options ?? {};
  }
  start() {
    this.render();
    this.intervalId = setInterval(() => {
      this.render();
    }, 1e3);
    if (process.stdin.isTTY) {
      this.stdin = process.stdin;
      this.stdin.setRawMode(true);
      this.stdin.resume();
      this.stdin.setEncoding("utf8");
      this.stdin.on("data", (key) => this.handleKey(key));
    }
  }
  update(update) {
    this.state = updateTuiState(this.state, update);
    this.render();
  }
  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.stdin !== null) {
      this.stdin.setRawMode(false);
      this.stdin.removeAllListeners("data");
      this.stdin = null;
    }
    console.clear();
  }
  handleKey(key) {
    if (key === "q" || key === "") {
      this.stop();
      this.options.onQuit?.();
    } else if (key === "l") {
      this.options.onLogs?.();
    }
  }
  getState() {
    return this.state;
  }
  render() {
    console.clear();
    console.log(renderDashboard(this.state));
  }
};
function createSimpleProgress(logger2) {
  return {
    update(itemId, phase, message) {
      const msg = message ? `: ${message}` : "";
      logger2.info(`[${itemId}] ${phase}${msg}`);
    },
    complete(itemId) {
      logger2.info(`[${itemId}] \u2713 complete`);
    },
    fail(itemId, error) {
      logger2.error(`[${itemId}] \u2717 failed: ${error}`);
    }
  };
}

// src/commands/orchestrator.ts
function shouldUseTui(noTui) {
  if (noTui) return false;
  if (!process.stdout.isTTY) return false;
  if (process.env.CI) return false;
  return true;
}
async function orchestrateAll(options, logger2) {
  const { force = false, dryRun = false, noTui = false } = options;
  const root = findRepoRoot(process.cwd());
  const config = await loadConfig(root);
  const items = await scanItems(root);
  const result = {
    completed: [],
    failed: [],
    skipped: [],
    remaining: []
  };
  const nonDoneItems = items.filter((item) => item.state !== "done");
  const doneItems = items.filter((item) => item.state === "done");
  result.skipped = doneItems.map((item) => item.id);
  if (dryRun) {
    for (const item of nonDoneItems) {
      logger2.info(`[dry-run] Would run: ${item.id}`);
    }
    result.remaining = nonDoneItems.map((item) => item.id);
    return result;
  }
  const useTui = shouldUseTui(noTui);
  let tuiRunner = null;
  const simpleProgress = useTui ? null : createSimpleProgress(logger2);
  if (useTui) {
    tuiRunner = new TuiRunner(items, {
      onQuit: () => {
        tuiRunner?.stop();
        process.exit(0);
      }
    });
    tuiRunner.start();
  }
  for (let i = 0; i < nonDoneItems.length; i++) {
    const item = nonDoneItems[i];
    if (useTui && tuiRunner) {
      tuiRunner.update({
        currentItem: item.id,
        currentPhase: item.state,
        currentIteration: 0,
        items: items.map((it) => ({
          id: it.id,
          state: it.id === item.id ? "implementing" : it.state,
          title: it.title
        }))
      });
    } else {
      simpleProgress?.update(item.id, "starting");
    }
    try {
      await runCommand2(item.id, { force, dryRun: false }, logger2);
      result.completed.push(item.id);
      if (useTui && tuiRunner) {
        tuiRunner.update({
          completedCount: result.completed.length + doneItems.length,
          items: items.map((it) => ({
            id: it.id,
            state: it.id === item.id ? "done" : result.completed.includes(it.id) ? "done" : it.state,
            title: it.title
          }))
        });
      } else {
        simpleProgress?.complete(item.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.failed.push(item.id);
      if (useTui && tuiRunner) {
        tuiRunner.update({
          logs: [...tuiRunner.getState().logs, `Failed ${item.id}: ${errorMessage}`]
        });
      } else {
        simpleProgress?.fail(item.id, errorMessage);
      }
    }
  }
  if (tuiRunner) {
    tuiRunner.stop();
  }
  return result;
}
async function orchestrateNext(options, logger2) {
  const { force = false, dryRun = false } = options;
  const root = findRepoRoot(process.cwd());
  await loadConfig(root);
  const nextItemId = await getNextIncompleteItem(root);
  if (nextItemId === null) {
    return { itemId: null, success: true };
  }
  if (dryRun) {
    logger2.info(`[dry-run] Would run: ${nextItemId}`);
    return { itemId: nextItemId, success: true };
  }
  try {
    logger2.info(`Running: ${nextItemId}`);
    await runCommand2(nextItemId, { force, dryRun: false }, logger2);
    return { itemId: nextItemId, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger2.error(`Failed ${nextItemId}: ${errorMessage}`);
    return { itemId: nextItemId, success: false };
  }
}
async function getNextIncompleteItem(root) {
  const items = await scanItems(root);
  const nextItem = items.find((item) => item.state !== "done");
  return nextItem?.id ?? null;
}

// src/doctor.ts
import * as fs11 from "fs/promises";
import * as path6 from "path";
async function fileExists4(filePath) {
  try {
    await fs11.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function readJson(filePath) {
  const content = await fs11.readFile(filePath, "utf-8");
  return JSON.parse(content);
}
async function diagnoseConfig(root) {
  const diagnostics = [];
  const configPath = getConfigPath(root);
  if (!await fileExists4(configPath)) {
    diagnostics.push({
      itemId: null,
      severity: "warning",
      code: "MISSING_CONFIG",
      message: "config.json is missing (using defaults)",
      fixable: false
    });
    return diagnostics;
  }
  try {
    const data = await readJson(configPath);
    const result = ConfigSchema.safeParse(data);
    if (!result.success) {
      diagnostics.push({
        itemId: null,
        severity: "error",
        code: "INVALID_CONFIG",
        message: `config.json is invalid: ${result.error.message}`,
        fixable: false
      });
    }
  } catch (err) {
    diagnostics.push({
      itemId: null,
      severity: "error",
      code: "INVALID_CONFIG",
      message: `config.json has invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      fixable: false
    });
  }
  return diagnostics;
}
async function diagnoseItem(root, sectionDir, itemDirName) {
  const diagnostics = [];
  const itemDir = path6.join(sectionDir, itemDirName);
  const itemJsonPath = path6.join(itemDir, "item.json");
  if (!await fileExists4(itemJsonPath)) {
    const section = path6.basename(sectionDir);
    diagnostics.push({
      itemId: `${section}/${itemDirName}`,
      severity: "error",
      code: "MISSING_ITEM_JSON",
      message: `item.json missing in ${itemDir}`,
      fixable: false
    });
    return diagnostics;
  }
  let item;
  try {
    const data = await readJson(itemJsonPath);
    const result = ItemSchema.safeParse(data);
    if (!result.success) {
      diagnostics.push({
        itemId: null,
        severity: "error",
        code: "INVALID_ITEM_JSON",
        message: `item.json invalid in ${itemDir}: ${result.error.message}`,
        fixable: false
      });
      return diagnostics;
    }
    item = result.data;
  } catch (err) {
    diagnostics.push({
      itemId: null,
      severity: "error",
      code: "INVALID_ITEM_JSON",
      message: `item.json has invalid JSON in ${itemDir}: ${err instanceof Error ? err.message : String(err)}`,
      fixable: false
    });
    return diagnostics;
  }
  const itemId = item.id;
  const researchPath = path6.join(itemDir, "research.md");
  const planPath = path6.join(itemDir, "plan.md");
  const prdPath = path6.join(itemDir, "prd.json");
  const hasResearch = await fileExists4(researchPath);
  const hasPlan = await fileExists4(planPath);
  const hasPrd = await fileExists4(prdPath);
  if (item.state === "researched" && !hasResearch) {
    diagnostics.push({
      itemId,
      severity: "warning",
      code: "STATE_FILE_MISMATCH",
      message: `State is 'researched' but research.md is missing`,
      fixable: true
    });
  }
  if (item.state === "planned") {
    if (!hasPlan && !hasPrd) {
      diagnostics.push({
        itemId,
        severity: "warning",
        code: "STATE_FILE_MISMATCH",
        message: `State is 'planned' but plan.md and prd.json are missing`,
        fixable: true
      });
    } else if (!hasPlan) {
      diagnostics.push({
        itemId,
        severity: "warning",
        code: "STATE_FILE_MISMATCH",
        message: `State is 'planned' but plan.md is missing`,
        fixable: false
      });
    } else if (!hasPrd) {
      diagnostics.push({
        itemId,
        severity: "warning",
        code: "STATE_FILE_MISMATCH",
        message: `State is 'planned' but prd.json is missing`,
        fixable: false
      });
    }
  }
  if (hasPrd) {
    try {
      const prdData = await readJson(prdPath);
      const prdResult = PrdSchema.safeParse(prdData);
      if (!prdResult.success) {
        diagnostics.push({
          itemId,
          severity: "error",
          code: "INVALID_PRD",
          message: `prd.json is invalid: ${prdResult.error.message}`,
          fixable: false
        });
      } else {
        if (item.state === "implementing") {
          const pendingStories = prdResult.data.user_stories.filter(
            (s) => s.status === "pending"
          );
          if (pendingStories.length === 0) {
            diagnostics.push({
              itemId,
              severity: "warning",
              code: "STATE_FILE_MISMATCH",
              message: `State is 'implementing' but no pending stories in prd.json`,
              fixable: false
            });
          }
        }
      }
    } catch (err) {
      diagnostics.push({
        itemId,
        severity: "error",
        code: "INVALID_PRD",
        message: `prd.json has invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        fixable: false
      });
    }
  }
  if (item.state === "in_pr" && !item.pr_url) {
    diagnostics.push({
      itemId,
      severity: "warning",
      code: "STATE_FILE_MISMATCH",
      message: `State is 'in_pr' but pr_url is not set`,
      fixable: false
    });
  }
  return diagnostics;
}
async function diagnoseIndex(root) {
  const diagnostics = [];
  const indexPath = getIndexPath(root);
  if (!await fileExists4(indexPath)) {
    return diagnostics;
  }
  try {
    const data = await readJson(indexPath);
    const result = IndexSchema.safeParse(data);
    if (!result.success) {
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "INDEX_STALE",
        message: `index.json is invalid: ${result.error.message}`,
        fixable: true
      });
      return diagnostics;
    }
    const indexedItems = result.data.items;
    const actualItems = await scanItems(root);
    const indexedIds = new Set(indexedItems.map((i) => i.id));
    const actualIds = new Set(actualItems.map((i) => i.id));
    const missingInIndex = actualItems.filter((i) => !indexedIds.has(i.id));
    const extraInIndex = indexedItems.filter((i) => !actualIds.has(i.id));
    const stateMismatches = actualItems.filter((actual) => {
      const indexed = indexedItems.find((i) => i.id === actual.id);
      return indexed && indexed.state !== actual.state;
    });
    if (missingInIndex.length > 0 || extraInIndex.length > 0 || stateMismatches.length > 0) {
      const issues = [];
      if (missingInIndex.length > 0) {
        issues.push(`${missingInIndex.length} items missing from index`);
      }
      if (extraInIndex.length > 0) {
        issues.push(`${extraInIndex.length} extra items in index`);
      }
      if (stateMismatches.length > 0) {
        issues.push(`${stateMismatches.length} state mismatches`);
      }
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "INDEX_STALE",
        message: `index.json is out of sync: ${issues.join(", ")}`,
        fixable: true
      });
    }
  } catch (err) {
    diagnostics.push({
      itemId: null,
      severity: "warning",
      code: "INDEX_STALE",
      message: `index.json has invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      fixable: true
    });
  }
  return diagnostics;
}
async function diagnosePrompts(root) {
  const diagnostics = [];
  const promptsDir = getPromptsDir(root);
  if (!await fileExists4(promptsDir)) {
    diagnostics.push({
      itemId: null,
      severity: "info",
      code: "MISSING_PROMPTS",
      message: "prompts directory is missing (defaults will be used)",
      fixable: true
    });
  }
  return diagnostics;
}
async function diagnose(root) {
  const diagnostics = [];
  const wreckitDir = getWreckitDir(root);
  if (!await fileExists4(wreckitDir)) {
    return diagnostics;
  }
  diagnostics.push(...await diagnoseConfig(root));
  diagnostics.push(...await diagnosePrompts(root));
  let sections;
  try {
    const entries = await fs11.readdir(wreckitDir, { withFileTypes: true });
    sections = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "prompts"
    ).map((e) => e.name);
  } catch {
    return diagnostics;
  }
  for (const section of sections) {
    const sectionDir = path6.join(wreckitDir, section);
    let itemDirs;
    try {
      const entries = await fs11.readdir(sectionDir, { withFileTypes: true });
      itemDirs = entries.filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name)).map((e) => e.name);
    } catch {
      continue;
    }
    for (const itemDir of itemDirs) {
      diagnostics.push(...await diagnoseItem(root, sectionDir, itemDir));
    }
  }
  diagnostics.push(...await diagnoseIndex(root));
  return diagnostics;
}
async function applyFixes(root, diagnostics, logger2) {
  const results = [];
  const fixableDiagnostics = diagnostics.filter((d) => d.fixable);
  for (const diagnostic of fixableDiagnostics) {
    let fixed = false;
    let message = "";
    switch (diagnostic.code) {
      case "INDEX_STALE": {
        try {
          const items = await scanItems(root);
          const index = {
            schema_version: 1,
            items,
            generated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          const indexPath = getIndexPath(root);
          await fs11.writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
          fixed = true;
          message = "Rebuilt index.json";
        } catch (err) {
          message = `Failed to rebuild index: ${err instanceof Error ? err.message : String(err)}`;
        }
        break;
      }
      case "MISSING_PROMPTS": {
        try {
          await initPromptTemplates(root);
          fixed = true;
          message = "Created default prompt templates";
        } catch (err) {
          message = `Failed to create prompts: ${err instanceof Error ? err.message : String(err)}`;
        }
        break;
      }
      case "STATE_FILE_MISMATCH": {
        if (diagnostic.itemId) {
          try {
            const [section, slug] = diagnostic.itemId.split("/");
            const itemDir = path6.join(getWreckitDir(root), section, slug);
            const itemJsonPath = path6.join(itemDir, "item.json");
            const data = await readJson(itemJsonPath);
            const item = ItemSchema.parse(data);
            const hasResearch = await fileExists4(
              path6.join(itemDir, "research.md")
            );
            const hasPlan = await fileExists4(path6.join(itemDir, "plan.md"));
            const hasPrd = await fileExists4(path6.join(itemDir, "prd.json"));
            let newState = item.state;
            if (item.state === "researched" && !hasResearch) {
              newState = "raw";
            } else if (item.state === "planned" && (!hasPlan || !hasPrd) && hasResearch) {
              newState = "researched";
            } else if (item.state === "planned" && !hasPlan && !hasPrd) {
              newState = hasResearch ? "researched" : "raw";
            }
            if (newState !== item.state) {
              const updatedItem = {
                ...item,
                state: newState,
                updated_at: (/* @__PURE__ */ new Date()).toISOString()
              };
              await fs11.writeFile(
                itemJsonPath,
                JSON.stringify(updatedItem, null, 2) + "\n"
              );
              fixed = true;
              message = `Reset state from '${item.state}' to '${newState}'`;
            } else {
              message = "Unable to determine correct state";
            }
          } catch (err) {
            message = `Failed to fix state: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        break;
      }
      default:
        message = "No fix available";
    }
    results.push({ diagnostic, fixed, message });
  }
  return results;
}
async function runDoctor(root, options, logger2) {
  const diagnostics = await diagnose(root);
  if (!options.fix) {
    return { diagnostics };
  }
  const fixes = await applyFixes(root, diagnostics, logger2);
  return { diagnostics, fixes };
}

// src/commands/doctor.ts
function formatDiagnostic(d) {
  const prefix = d.itemId ? `[${d.itemId}] ` : "";
  const fixable = d.fixable ? " (fixable)" : "";
  return `${prefix}${d.message}${fixable}`;
}
async function doctorCommand(options, logger2) {
  const root = findRepoRoot(process.cwd());
  const result = await runDoctor(root, { fix: options.fix }, logger2);
  const { diagnostics, fixes } = result;
  if (diagnostics.length === 0) {
    logger2.info("\u2713 No issues found");
    return;
  }
  const grouped = {
    error: diagnostics.filter((d) => d.severity === "error"),
    warning: diagnostics.filter((d) => d.severity === "warning"),
    info: diagnostics.filter((d) => d.severity === "info")
  };
  if (grouped.error.length > 0) {
    logger2.error(`Errors (${grouped.error.length}):`);
    for (const d of grouped.error) {
      logger2.error(`  \u2717 ${formatDiagnostic(d)}`);
    }
  }
  if (grouped.warning.length > 0) {
    logger2.warn(`Warnings (${grouped.warning.length}):`);
    for (const d of grouped.warning) {
      logger2.warn(`  \u26A0 ${formatDiagnostic(d)}`);
    }
  }
  if (grouped.info.length > 0) {
    logger2.info(`Info (${grouped.info.length}):`);
    for (const d of grouped.info) {
      logger2.info(`  \u2139 ${formatDiagnostic(d)}`);
    }
  }
  if (fixes && fixes.length > 0) {
    logger2.info("");
    logger2.info("Fixes applied:");
    for (const fix of fixes) {
      const status = fix.fixed ? "\u2713" : "\u2717";
      const itemPrefix = fix.diagnostic.itemId ? `[${fix.diagnostic.itemId}] ` : "";
      logger2.info(`  ${status} ${itemPrefix}${fix.message}`);
    }
    const fixedCount = fixes.filter((f) => f.fixed).length;
    const failedCount = fixes.length - fixedCount;
    logger2.info("");
    logger2.info(`Fixed ${fixedCount} issue(s), ${failedCount} failed`);
  } else if (diagnostics.some((d) => d.fixable) && !options.fix) {
    logger2.info("");
    logger2.info("Run with --fix to auto-fix recoverable issues");
  }
  const remainingErrors = options.fix ? diagnostics.filter(
    (d) => d.severity === "error" && !fixes?.some((f) => f.diagnostic === d && f.fixed)
  ) : grouped.error;
  if (remainingErrors.length > 0) {
    process.exit(1);
  }
}

// src/commands/init.ts
import * as fs12 from "fs/promises";
import * as path7 from "path";
var NotGitRepoError = class extends WreckitError {
  constructor(message) {
    super(message, "NOT_GIT_REPO");
    this.name = "NotGitRepoError";
  }
};
var WreckitExistsError = class extends WreckitError {
  constructor(message) {
    super(message, "WRECKIT_EXISTS");
    this.name = "WreckitExistsError";
  }
};
async function isGitRepo(cwd) {
  try {
    const gitDir = path7.join(cwd, ".git");
    const stat2 = await fs12.stat(gitDir);
    return stat2.isDirectory();
  } catch {
    return false;
  }
}
async function wreckitExists(cwd) {
  try {
    const wreckitDir = path7.join(cwd, ".wreckit");
    const stat2 = await fs12.stat(wreckitDir);
    return stat2.isDirectory();
  } catch {
    return false;
  }
}
async function initCommand(options, logger2, cwd = process.cwd()) {
  if (!await isGitRepo(cwd)) {
    throw new NotGitRepoError(
      "Not a git repository. Run 'git init' first or navigate to a git repository."
    );
  }
  if (await wreckitExists(cwd)) {
    if (!options.force) {
      throw new WreckitExistsError(
        ".wreckit/ already exists. Use --force to overwrite."
      );
    }
    logger2.warn("Overwriting existing .wreckit/ directory");
    await fs12.rm(path7.join(cwd, ".wreckit"), { recursive: true, force: true });
  }
  const wreckitDir = path7.join(cwd, ".wreckit");
  const promptsDir = path7.join(wreckitDir, "prompts");
  await fs12.mkdir(promptsDir, { recursive: true });
  const configPath = path7.join(wreckitDir, "config.json");
  await fs12.writeFile(
    configPath,
    JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
    "utf-8"
  );
  const promptNames = ["research", "plan", "implement"];
  for (const name of promptNames) {
    const content = await getDefaultTemplate(name);
    const promptPath = path7.join(promptsDir, `${name}.md`);
    await fs12.writeFile(promptPath, content, "utf-8");
  }
  logger2.info("Initialized .wreckit/ directory");
  logger2.info("  Created config.json");
  logger2.info("  Created prompts/research.md");
  logger2.info("  Created prompts/plan.md");
  logger2.info("  Created prompts/implement.md");
}

// src/index.ts
var program = new Command();
program.name("wreckit").description("A CLI tool for turning ideas into automated PRs through an autonomous agent loop").version("0.0.1").option("--verbose", "Enable verbose output").option("--quiet", "Suppress non-essential output").option("--no-tui", "Disable terminal UI").option("--dry-run", "Show what would be done without making changes");
program.action(async () => {
  const opts = program.opts();
  initLogger({ verbose: opts.verbose, quiet: opts.quiet });
  await executeCommand(async () => {
    const result = await orchestrateAll({
      force: false,
      dryRun: opts.dryRun,
      noTui: opts.noTui
    }, logger);
    if (result.completed.length > 0) {
      logger.info(`Completed ${result.completed.length} items`);
    }
    if (result.failed.length > 0) {
      logger.warn(`Failed ${result.failed.length} items`);
      result.failed.forEach((id) => logger.warn(`  - ${id}`));
    }
    if (result.remaining.length > 0) {
      logger.info(`Remaining: ${result.remaining.length} items`);
    }
    if (result.failed.length > 0) {
      process.exit(1);
    }
  }, logger, { verbose: opts.verbose, quiet: opts.quiet, dryRun: opts.dryRun, noTui: opts.noTui });
});
program.command("ideas").description("Ingest ideas from stdin or file").option("-f, --file <path>", "Read ideas from file instead of stdin").action(async (options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await ideasCommand(
      { file: options.file, dryRun: globalOpts.dryRun },
      logger
    );
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
});
program.command("status").description("List all items with state").option("--json", "Output as JSON").action(async (options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await statusCommand({ json: options.json }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet });
});
program.command("show <id>").description("Show item details").option("--json", "Output as JSON").action(async (id, options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await showCommand(id, { json: options.json }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet });
});
program.command("research <id>").description("Run research phase: raw \u2192 researched").option("--force", "Regenerate artifacts even if they exist").action(async (id, options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await runPhaseCommand("research", id, { force: options.force, dryRun: globalOpts.dryRun }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
});
program.command("plan <id>").description("Run plan phase: researched \u2192 planned").option("--force", "Regenerate artifacts even if they exist").action(async (id, options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await runPhaseCommand("plan", id, { force: options.force, dryRun: globalOpts.dryRun }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
});
program.command("implement <id>").description("Run implement phase: planned \u2192 implementing").option("--force", "Re-run even if in progress").action(async (id, options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await runPhaseCommand("implement", id, { force: options.force, dryRun: globalOpts.dryRun }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
});
program.command("pr <id>").description("Create/update PR: implementing \u2192 in_pr").option("--force", "Force PR update").action(async (id, options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await runPhaseCommand("pr", id, { force: options.force, dryRun: globalOpts.dryRun }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
});
program.command("complete <id>").description("Mark as complete: in_pr \u2192 done").action(async (id, _options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await runPhaseCommand("complete", id, { dryRun: globalOpts.dryRun }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
});
program.command("run <id>").description("Run single item through all phases until done").option("--force", "Regenerate artifacts even if they exist").action(async (id, options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  await executeCommand(async () => {
    await runCommand2(id, {
      force: options.force,
      dryRun: globalOpts.dryRun
    }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
});
program.command("next").description("Run next incomplete item").action(async (_options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  initLogger({ verbose: globalOpts.verbose, quiet: globalOpts.quiet });
  await executeCommand(async () => {
    const result = await orchestrateNext({
      dryRun: globalOpts.dryRun,
      noTui: globalOpts.noTui
    }, logger);
    if (result.itemId === null) {
      logger.info("All items complete");
    } else if (result.success) {
      logger.info(`Completed: ${result.itemId}`);
    } else {
      logger.error(`Failed: ${result.itemId}`);
      process.exit(1);
    }
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun, noTui: globalOpts.noTui });
});
program.command("doctor").description("Validate all items and optionally fix issues").option("--fix", "Auto-fix recoverable issues").action(async (options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  initLogger({ verbose: globalOpts.verbose, quiet: globalOpts.quiet });
  await executeCommand(async () => {
    await doctorCommand(options, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet });
});
program.command("init").description("Initialize .wreckit/ in the current repository").option("--force", "Overwrite existing .wreckit/").action(async (options, cmd) => {
  const globalOpts = cmd.optsWithGlobals();
  initLogger({ verbose: globalOpts.verbose, quiet: globalOpts.quiet });
  await executeCommand(async () => {
    await initCommand({ force: options.force }, logger);
  }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet });
});
async function main() {
  setupInterruptHandler(logger);
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    initLogger({
      verbose: opts.verbose,
      quiet: opts.quiet
    });
  });
  try {
    await program.parseAsync();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(toExitCode(error));
  }
}
if (import.meta.main) {
  main();
}
export {
  program
};

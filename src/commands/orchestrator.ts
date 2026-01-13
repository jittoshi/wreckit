import type { Logger } from "../logging";
import { findRepoRoot } from "../fs/paths";
import { loadConfig } from "../config";
import { scanItems } from "./status";
import { runCommand } from "./run";
import { TuiRunner, createSimpleProgress } from "../tui";

export interface OrchestratorOptions {
  force?: boolean;
  dryRun?: boolean;
  noTui?: boolean;
}

export interface OrchestratorResult {
  completed: string[];
  failed: string[];
  skipped: string[];
  remaining: string[];
}

function shouldUseTui(noTui?: boolean): boolean {
  if (noTui) return false;
  if (!process.stdout.isTTY) return false;
  if (process.env.CI) return false;
  return true;
}

export async function orchestrateAll(
  options: OrchestratorOptions,
  logger: Logger
): Promise<OrchestratorResult> {
  const { force = false, dryRun = false, noTui = false } = options;

  const root = findRepoRoot(process.cwd());
  const config = await loadConfig(root);

  const items = await scanItems(root);

  const result: OrchestratorResult = {
    completed: [],
    failed: [],
    skipped: [],
    remaining: [],
  };

  const nonDoneItems = items.filter((item) => item.state !== "done");
  const doneItems = items.filter((item) => item.state === "done");

  result.skipped = doneItems.map((item) => item.id);

  if (dryRun) {
    for (const item of nonDoneItems) {
      logger.info(`[dry-run] Would run: ${item.id}`);
    }
    result.remaining = nonDoneItems.map((item) => item.id);
    return result;
  }

  const useTui = shouldUseTui(noTui);
  let tuiRunner: TuiRunner | null = null;
  const simpleProgress = useTui ? null : createSimpleProgress(logger);

  if (useTui) {
    tuiRunner = new TuiRunner(items, {
      onQuit: () => {
        tuiRunner?.stop();
        process.exit(0);
      },
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
          title: it.title,
        })),
      });
    } else {
      simpleProgress?.update(item.id, "starting");
    }

    try {
      await runCommand(item.id, { force, dryRun: false }, logger);
      result.completed.push(item.id);

      if (useTui && tuiRunner) {
        tuiRunner.update({
          completedCount: result.completed.length + doneItems.length,
          items: items.map((it) => ({
            id: it.id,
            state: it.id === item.id ? "done" : result.completed.includes(it.id) ? "done" : it.state,
            title: it.title,
          })),
        });
      } else {
        simpleProgress?.complete(item.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.failed.push(item.id);

      if (useTui && tuiRunner) {
        tuiRunner.update({
          logs: [...(tuiRunner.getState().logs), `Failed ${item.id}: ${errorMessage}`],
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

export async function orchestrateNext(
  options: OrchestratorOptions,
  logger: Logger
): Promise<{ itemId: string | null; success: boolean }> {
  const { force = false, dryRun = false } = options;

  const root = findRepoRoot(process.cwd());
  await loadConfig(root);

  const nextItemId = await getNextIncompleteItem(root);

  if (nextItemId === null) {
    return { itemId: null, success: true };
  }

  if (dryRun) {
    logger.info(`[dry-run] Would run: ${nextItemId}`);
    return { itemId: nextItemId, success: true };
  }

  try {
    logger.info(`Running: ${nextItemId}`);
    await runCommand(nextItemId, { force, dryRun: false }, logger);
    return { itemId: nextItemId, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed ${nextItemId}: ${errorMessage}`);
    return { itemId: nextItemId, success: false };
  }
}

export async function getNextIncompleteItem(root: string): Promise<string | null> {
  const items = await scanItems(root);

  const nextItem = items.find((item) => item.state !== "done");
  return nextItem?.id ?? null;
}

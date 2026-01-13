import type { Item } from "../schemas";
import type { Logger } from "../logging";
import {
  createTuiState,
  updateTuiState,
  renderDashboard,
  type TuiState,
} from "./dashboard";

export interface TuiOptions {
  onQuit?: () => void;
  onLogs?: () => void;
}

export class TuiRunner {
  private state: TuiState;
  private intervalId: NodeJS.Timeout | null = null;
  private options: TuiOptions;
  private stdin: NodeJS.ReadStream | null = null;

  constructor(items: Item[], options?: TuiOptions) {
    this.state = createTuiState(items);
    this.options = options ?? {};
  }

  start(): void {
    this.render();

    this.intervalId = setInterval(() => {
      this.render();
    }, 1000);

    if (process.stdin.isTTY) {
      this.stdin = process.stdin;
      this.stdin.setRawMode(true);
      this.stdin.resume();
      this.stdin.setEncoding("utf8");
      this.stdin.on("data", (key: string) => this.handleKey(key));
    }
  }

  update(update: Partial<TuiState>): void {
    this.state = updateTuiState(this.state, update);
    this.render();
  }

  stop(): void {
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

  handleKey(key: string): void {
    if (key === "q" || key === "\u0003") {
      this.stop();
      this.options.onQuit?.();
    } else if (key === "l") {
      this.options.onLogs?.();
    }
  }

  getState(): TuiState {
    return this.state;
  }

  private render(): void {
    console.clear();
    console.log(renderDashboard(this.state));
  }
}

export interface SimpleProgress {
  update: (itemId: string, phase: string, message?: string) => void;
  complete: (itemId: string) => void;
  fail: (itemId: string, error: string) => void;
}

export function createSimpleProgress(logger: Logger): SimpleProgress {
  return {
    update(itemId: string, phase: string, message?: string): void {
      const msg = message ? `: ${message}` : "";
      logger.info(`[${itemId}] ${phase}${msg}`);
    },
    complete(itemId: string): void {
      logger.info(`[${itemId}] ✓ complete`);
    },
    fail(itemId: string, error: string): void {
      logger.error(`[${itemId}] ✗ failed: ${error}`);
    },
  };
}

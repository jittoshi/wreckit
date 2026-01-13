#!/usr/bin/env bun

import { Command } from 'commander';
import { initLogger, logger } from './logging';
import { toExitCode } from './errors';
import { executeCommand, setupInterruptHandler } from './cli-utils';
import { ideasCommand } from './commands/ideas';
import { statusCommand } from './commands/status';
import { showCommand } from './commands/show';
import { runPhaseCommand } from './commands/phase';
import { runCommand } from './commands/run';
import { orchestrateAll, orchestrateNext } from './commands/orchestrator';
import { doctorCommand } from './commands/doctor';
import { initCommand } from './commands/init';

export const program = new Command();

program
  .name('wreckit')
  .description('A CLI tool for turning ideas into automated PRs through an autonomous agent loop')
  .version('0.0.1')
  .option('--verbose', 'Enable verbose output')
  .option('--quiet', 'Suppress non-essential output')
  .option('--no-tui', 'Disable terminal UI')
  .option('--dry-run', 'Show what would be done without making changes');

program.action(async () => {
  const opts = program.opts();
  initLogger({ verbose: opts.verbose, quiet: opts.quiet });
  await executeCommand(async () => {
    const result = await orchestrateAll({
      force: false,
      dryRun: opts.dryRun,
      noTui: opts.noTui,
    }, logger);

    if (result.completed.length > 0) {
      logger.info(`Completed ${result.completed.length} items`);
    }
    if (result.failed.length > 0) {
      logger.warn(`Failed ${result.failed.length} items`);
      result.failed.forEach(id => logger.warn(`  - ${id}`));
    }
    if (result.remaining.length > 0) {
      logger.info(`Remaining: ${result.remaining.length} items`);
    }

    if (result.failed.length > 0) {
      process.exit(1);
    }
  }, logger, { verbose: opts.verbose, quiet: opts.quiet, dryRun: opts.dryRun, noTui: opts.noTui });
});

program
  .command('ideas')
  .description('Ingest ideas from stdin or file')
  .option('-f, --file <path>', 'Read ideas from file instead of stdin')
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await ideasCommand(
        { file: options.file, dryRun: globalOpts.dryRun },
        logger
      );
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
  });

program
  .command('status')
  .description('List all items with state')
  .option('--json', 'Output as JSON')
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await statusCommand({ json: options.json }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet });
  });

program
  .command('show <id>')
  .description('Show item details')
  .option('--json', 'Output as JSON')
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await showCommand(id, { json: options.json }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet });
  });

program
  .command('research <id>')
  .description('Run research phase: raw → researched')
  .option('--force', 'Regenerate artifacts even if they exist')
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await runPhaseCommand('research', id, { force: options.force, dryRun: globalOpts.dryRun }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
  });

program
  .command('plan <id>')
  .description('Run plan phase: researched → planned')
  .option('--force', 'Regenerate artifacts even if they exist')
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await runPhaseCommand('plan', id, { force: options.force, dryRun: globalOpts.dryRun }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
  });

program
  .command('implement <id>')
  .description('Run implement phase: planned → implementing')
  .option('--force', 'Re-run even if in progress')
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await runPhaseCommand('implement', id, { force: options.force, dryRun: globalOpts.dryRun }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
  });

program
  .command('pr <id>')
  .description('Create/update PR: implementing → in_pr')
  .option('--force', 'Force PR update')
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await runPhaseCommand('pr', id, { force: options.force, dryRun: globalOpts.dryRun }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
  });

program
  .command('complete <id>')
  .description('Mark as complete: in_pr → done')
  .action(async (id, _options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await runPhaseCommand('complete', id, { dryRun: globalOpts.dryRun }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
  });

program
  .command('run <id>')
  .description('Run single item through all phases until done')
  .option('--force', 'Regenerate artifacts even if they exist')
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(async () => {
      await runCommand(id, {
        force: options.force,
        dryRun: globalOpts.dryRun,
      }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun });
  });

program
  .command('next')
  .description('Run next incomplete item')
  .action(async (_options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    initLogger({ verbose: globalOpts.verbose, quiet: globalOpts.quiet });
    await executeCommand(async () => {
      const result = await orchestrateNext({
        dryRun: globalOpts.dryRun,
        noTui: globalOpts.noTui,
      }, logger);

      if (result.itemId === null) {
        logger.info('All items complete');
      } else if (result.success) {
        logger.info(`Completed: ${result.itemId}`);
      } else {
        logger.error(`Failed: ${result.itemId}`);
        process.exit(1);
      }
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet, dryRun: globalOpts.dryRun, noTui: globalOpts.noTui });
  });

program
  .command('doctor')
  .description('Validate all items and optionally fix issues')
  .option('--fix', 'Auto-fix recoverable issues')
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    initLogger({ verbose: globalOpts.verbose, quiet: globalOpts.quiet });
    await executeCommand(async () => {
      await doctorCommand(options, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet });
  });

program
  .command('init')
  .description('Initialize .wreckit/ in the current repository')
  .option('--force', 'Overwrite existing .wreckit/')
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    initLogger({ verbose: globalOpts.verbose, quiet: globalOpts.quiet });
    await executeCommand(async () => {
      await initCommand({ force: options.force }, logger);
    }, logger, { verbose: globalOpts.verbose, quiet: globalOpts.quiet });
  });

async function main(): Promise<void> {
  setupInterruptHandler(logger);

  program.hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    initLogger({
      verbose: opts.verbose,
      quiet: opts.quiet,
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

import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli/cli.module.js';

// Entry point for console commands: `node dist/cli.js seed [--fresh] [--admin-only]`
await CommandFactory.run(CliModule, ['error', 'warn']);

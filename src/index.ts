#!/usr/bin/env node

/**
 * Main CLI entry point for the versioner utility
 *
 * This file sets up the command-line interface using Commander.js
 * and defines all available commands with their options and arguments.
 */

import { program } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { handleCopyTo, handleCreateTsVersion, handleUpdateVersionPart } from './cli/commands.js';

// Get package version
const packageJson = JSON.parse(
  fs.readFileSync(
    path.join(new URL('.', import.meta.url).pathname, '..', '..', 'package.json'),
    'utf-8'
  )
);

// Configure main CLI program
program
  .name('@devstacks/versioner')
  .description('A utility to help with versioning projects')
  .version(packageJson.version);

// Global options
program
  .option('--package <path>', 'Path to package.json file (default: current directory)')
  .option('--type <type>', 'Type of project (default: node)', 'node');

/**
 * Copy version command - Copy version to files by replacing a placeholder
 */
program
  .command('copyto')
  .description('Copy version to files by replacing placeholders')
  .argument('<target>', 'Target file or directory to update')
  .option('--subject <placeholder>', 'Placeholder string to replace (default: __VERSION__)')
  .action((target, options) => handleCopyTo(target, options));

/**
 * Major version command - Increment or decrement major version
 */
program
  .command('major')
  .description('Update major version')
  .option('--up', 'Increment major version (default)')
  .option('--down', 'Decrement major version')
  .action((options) => handleUpdateVersionPart('major', options));

/**
 * Minor version command - Increment or decrement minor version
 */
program
  .command('minor')
  .description('Update minor version')
  .option('--up', 'Increment minor version (default)')
  .option('--down', 'Decrement minor version')
  .action((options) => handleUpdateVersionPart('minor', options));

/**
 * Patch version command - Increment or decrement patch version
 */
program
  .command('patch')
  .description('Update patch version')
  .option('--up', 'Increment patch version (default)')
  .option('--down', 'Decrement patch version')
  .action((options) => handleUpdateVersionPart('patch', options));

/**
 * Create TypeScript file with version command
 */
program
  .command('create-ts')
  .description('Create a TypeScript file with the version as a constant')
  .argument('<target>', 'Target TypeScript file to create')
  .option('--single-quotes', 'Use single quotes instead of double quotes')
  .option('--semi', 'Include semicolons')
  .action((target, options) => handleCreateTsVersion(target, options));

/**
 * Process the provided command-line arguments
 * This must be called after all commands are defined
 */
program.parse();

/**
 * Default behavior when no command is specified
 * Shows the help information to guide the user
 */
if (process.argv.length <= 2) {
  program.help();
}
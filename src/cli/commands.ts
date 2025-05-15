import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { z } from 'zod';
import { createSpinner, error, info, validatePath, warning } from './utils.js';
import {
  adjustVersionPart,
  findPackageJson,
  formatVersion,
  readPackageVersion,
  updatePackageVersion
} from './version.js';

export interface Options {
  package?: string;
  type?: string;
  subject?: string;
  up?: boolean;
  down?: boolean;
  [key: string]: unknown;
}

/**
 * Zod validation schemas for command parameters
 */
const PathSchema = z.string().min(1, 'Path must not be empty');

const OptionsSchema = z.object({
  package: z.string().optional(),
  type: z.enum(['node']).optional(),
  subject: z.string().optional(),
  up: z.boolean().optional(),
  down: z.boolean().optional()
}).strict().catchall(z.unknown());

/**
 * Helper function to validate parameters with zod schemas
 */
function validateParams<T extends z.ZodTypeAny[]>(schemas: T, values: unknown[]): boolean {
  try {
    // Validate each value with its corresponding schema
    for (let i = 0; i < schemas.length; i++) {
      schemas[i].parse(values[i]);
    }
    return true;
  } catch (validationError) {
    if (validationError instanceof z.ZodError) {
      error(`Validation error: ${validationError.errors.map(e => e.message).join(', ')}`);
    }
    return false;
  }
}

/**
 * Copy version to files handler
 * Finds and replaces version placeholders in files
 */
export async function handleCopyTo(targetPath: string, options: Options): Promise<void> {
  // Validate input parameters
  if (!validateParams([PathSchema, OptionsSchema], [targetPath, options])) {
    return;
  }

  try {
    // Determine package.json path
    const packagePath = options.package || findPackageJson(process.cwd());
    if (!packagePath) {
      error('No package.json found. Please specify with --package option.');
      return;
    }

    // Validate package.json exists
    if (!validatePath(packagePath, 'file')) {
      return;
    }

    // Read the version from package.json
    const version = readPackageVersion(packagePath);
    if (!version) {
      return;
    }

    const versionString = formatVersion(version);
    const subject = options.subject || '__VERSION__';

    // Show spinner
    const spinner = createSpinner('Finding files to update...');
    spinner.start();

    // Check if the target is a file or directory
    const isDirectory = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();

    const filesToUpdate: string[] = [];

    if (isDirectory) {
      // If directory, find all files that contain the subject
      const files = await glob('**/*', {
        cwd: targetPath,
        nodir: true,
        dot: true,
        follow: false
      });

      // Check each file for the subject
      for (const relativeFile of files) {
        const filePath = path.join(targetPath, relativeFile);
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        if (fileContent.includes(subject)) {
          filesToUpdate.push(filePath);
        }
      }
    } else {
      // If file, just check the single file
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
        const fileContent = fs.readFileSync(targetPath, 'utf-8');

        if (fileContent.includes(subject)) {
          filesToUpdate.push(targetPath);
        }
      } else {
        spinner.fail(`Target path does not exist or is not a file/directory: ${targetPath}`);
        return;
      }
    }

    spinner.text = `Updating ${filesToUpdate.length} files...`;

    // No files found with the subject
    if (filesToUpdate.length === 0) {
      spinner.info(`No files found containing '${subject}'`);
      return;
    }

    // Replace the subject with the version in each file
    let updatedCount = 0;
    for (const filePath of filesToUpdate) {
      try {
        let fileContent = fs.readFileSync(filePath, 'utf-8');
        const originalContent = fileContent;

        // Replace all occurrences of the subject with the version
        fileContent = fileContent.replace(new RegExp(subject, 'g'), versionString);

        // Only write if changed
        if (fileContent !== originalContent) {
          fs.writeFileSync(filePath, fileContent, 'utf-8');
          updatedCount++;
        }
      } catch {
        warning(`Failed to update ${filePath}`);
      }
    }

    spinner.succeed(`Updated ${updatedCount} of ${filesToUpdate.length} files with version ${versionString}`);
  } catch (err: unknown) {
    if (err instanceof Error) {
      error(`Failed to copy version: ${err.message}`);
    } else {
      error('Failed to copy version: Unknown error');
    }
  }
}

/**
 * Update version part handler
 * Increments or decrements a specific part of the version
 */
export async function handleUpdateVersionPart(
  part: 'major' | 'minor' | 'patch',
  options: Options
): Promise<void> {
  // Validate input parameters
  if (!validateParams([z.enum(['major', 'minor', 'patch']), OptionsSchema], [part, options])) {
    return;
  }

  try {
    // Determine direction (up or down)
    let direction: 'up' | 'down' = 'up'; // Default is up
    if (options.down) {
      direction = 'down';
    }

    // Determine package.json path
    const packagePath = options.package || findPackageJson(process.cwd());
    if (!packagePath) {
      error('No package.json found. Please specify with --package option.');
      return;
    }

    // Validate package.json exists
    if (!validatePath(packagePath, 'file')) {
      return;
    }

    // Read the current version
    const currentVersion = readPackageVersion(packagePath);
    if (!currentVersion) {
      return;
    }

    // Show current version
    info(`Current version: ${formatVersion(currentVersion)}`);

    // Calculate new version
    const newVersion = adjustVersionPart(currentVersion, part, direction);

    // Spinner for updating
    const spinner = createSpinner(`Updating ${part} version ${direction}...`);
    spinner.start();

    // Update the version in package.json
    if (updatePackageVersion(packagePath, newVersion)) {
      spinner.succeed(`Successfully updated version from ${formatVersion(currentVersion)} to ${formatVersion(newVersion)}`);
    } else {
      spinner.fail('Failed to update version');
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      error(`Failed to update version: ${err.message}`);
    } else {
      error('Failed to update version: Unknown error');
    }
  }
}

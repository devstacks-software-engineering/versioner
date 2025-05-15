import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { error } from './utils.js';

/**
 * Schema for a semantic version
 */
export const SemanticVersionSchema = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
  build: z.string().optional()
});

export type SemanticVersion = z.infer<typeof SemanticVersionSchema>;

/**
 * Parse a version string into a semantic version object
 * @param version Version string (e.g., "1.2.3" or "1.2.3-alpha.1")
 * @returns Parsed semantic version object
 */
export function parseVersion(version: string): SemanticVersion | null {
  // Match: major.minor.patch or major.minor.patch-build
  const regex = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;
  const match = version.match(regex);

  if (!match) {
    return null;
  }

  try {
    const [, majorStr, minorStr, patchStr, build] = match;
    const semanticVersion: SemanticVersion = {
      major: parseInt(majorStr, 10),
      minor: parseInt(minorStr, 10),
      patch: parseInt(patchStr, 10)
    };

    if (build) {
      semanticVersion.build = build;
    }

    return SemanticVersionSchema.parse(semanticVersion);
  } catch {
    return null;
  }
}

/**
 * Convert a semantic version object to a string
 * @param version Semantic version object
 * @returns Version string
 */
export function formatVersion(version: SemanticVersion): string {
  if (version.build) {
    return `${version.major}.${version.minor}.${version.patch}-${version.build}`;
  }
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Read a package.json file and return its version
 * @param packagePath Path to the package.json file
 * @returns Parsed semantic version or null if invalid
 */
export function readPackageVersion(packagePath: string): SemanticVersion | null {
  try {
    const packageContent = fs.readFileSync(packagePath, 'utf-8');
    const packageJson = JSON.parse(packageContent);

    if (!packageJson.version || typeof packageJson.version !== 'string') {
      error(`No valid version found in ${packagePath}`);
      return null;
    }

    const version = parseVersion(packageJson.version);
    if (!version) {
      error(`Invalid version format in ${packagePath}: ${packageJson.version}`);
      return null;
    }

    return version;
  } catch (err) {
    if (err instanceof Error) {
      error(`Failed to read package version: ${err.message}`);
    } else {
      error('Failed to read package version');
    }
    return null;
  }
}

/**
 * Update the version in a package.json file
 * @param packagePath Path to the package.json file
 * @param version New semantic version object
 * @returns Whether the update was successful
 */
export function updatePackageVersion(packagePath: string, version: SemanticVersion): boolean {
  try {
    const packageContent = fs.readFileSync(packagePath, 'utf-8');
    const packageJson = JSON.parse(packageContent);

    packageJson.version = formatVersion(version);

    fs.writeFileSync(
      packagePath,
      JSON.stringify(packageJson, null, 2) + '\n',
      'utf-8'
    );

    return true;
  } catch (err) {
    if (err instanceof Error) {
      error(`Failed to update package version: ${err.message}`);
    } else {
      error('Failed to update package version');
    }
    return false;
  }
}

/**
 * Find possible package.json files in the current directory
 * @param startDir Directory to start searching from
 * @returns Path to package.json or null if not found
 */
export function findPackageJson(startDir: string): string | null {
  try {
    const packagePath = path.join(startDir, 'package.json');

    // Check if package.json exists in the current directory
    if (fs.existsSync(packagePath)) {
      return packagePath;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Increment a specific part of the version
 * @param version Current semantic version
 * @param part Part to increment ('major', 'minor', 'patch')
 * @param direction Direction to adjust ('up' or 'down')
 * @returns Updated semantic version
 */
export function adjustVersionPart(
  version: SemanticVersion,
  part: 'major' | 'minor' | 'patch',
  direction: 'up' | 'down'
): SemanticVersion {
  const newVersion: SemanticVersion = { ...version };

  if (direction === 'up') {
    newVersion[part] += 1;

    // Reset subordinate parts when incrementing major or minor
    if (part === 'major') {
      newVersion.minor = 0;
      newVersion.patch = 0;
    } else if (part === 'minor') {
      newVersion.patch = 0;
    }
  } else if (direction === 'down') {
    // Prevent negative values
    if (newVersion[part] > 0) {
      newVersion[part] -= 1;
    }
  }

  return newVersion;
}

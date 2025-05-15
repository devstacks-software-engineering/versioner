import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseVersion,
  formatVersion,
  readPackageVersion,
  updatePackageVersion,
  findPackageJson,
  adjustVersionPart,
  type SemanticVersion
} from '../src/cli/version.js';

vi.mock('node:fs');
vi.mock('node:path');

describe('Version utilities', () => {
  describe('parseVersion', () => {
    it('should parse a valid version string', () => {
      const result = parseVersion('1.2.3');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3
      });
    });

    it('should parse a version string with build', () => {
      const result = parseVersion('1.2.3-beta.1');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        build: 'beta.1'
      });
    });

    it('should return null for an invalid version string', () => {
      expect(parseVersion('not.a.version')).toBeNull();
      expect(parseVersion('1.2')).toBeNull();
      expect(parseVersion('1.2.3.4')).toBeNull();
    });
  });

  describe('formatVersion', () => {
    it('should format a version object without build', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      expect(formatVersion(version)).toBe('1.2.3');
    });

    it('should format a version object with build', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3, build: 'beta.1' };
      expect(formatVersion(version)).toBe('1.2.3-beta.1');
    });
  });

  describe('adjustVersionPart', () => {
    it('should increment major version', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      const result = adjustVersionPart(version, 'major', 'up');
      expect(result).toEqual({ major: 2, minor: 0, patch: 0 });
    });

    it('should decrement major version', () => {
      const version: SemanticVersion = { major: 2, minor: 0, patch: 0 };
      const result = adjustVersionPart(version, 'major', 'down');
      expect(result).toEqual({ major: 1, minor: 0, patch: 0 });
    });

    it('should not decrement major version below 0', () => {
      const version: SemanticVersion = { major: 0, minor: 2, patch: 3 };
      const result = adjustVersionPart(version, 'major', 'down');
      expect(result).toEqual({ major: 0, minor: 2, patch: 3 });
    });

    it('should increment minor version', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      const result = adjustVersionPart(version, 'minor', 'up');
      expect(result).toEqual({ major: 1, minor: 3, patch: 0 });
    });

    it('should decrement minor version', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      const result = adjustVersionPart(version, 'minor', 'down');
      expect(result).toEqual({ major: 1, minor: 1, patch: 3 });
    });

    it('should not decrement minor version below 0', () => {
      const version: SemanticVersion = { major: 1, minor: 0, patch: 3 };
      const result = adjustVersionPart(version, 'minor', 'down');
      expect(result).toEqual({ major: 1, minor: 0, patch: 3 });
    });

    it('should increment patch version', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      const result = adjustVersionPart(version, 'patch', 'up');
      expect(result).toEqual({ major: 1, minor: 2, patch: 4 });
    });

    it('should decrement patch version', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      const result = adjustVersionPart(version, 'patch', 'down');
      expect(result).toEqual({ major: 1, minor: 2, patch: 2 });
    });

    it('should not decrement patch version below 0', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 0 };
      const result = adjustVersionPart(version, 'patch', 'down');
      expect(result).toEqual({ major: 1, minor: 2, patch: 0 });
    });

    it('should preserve build when adjusting version', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3, build: 'beta.1' };
      const result = adjustVersionPart(version, 'major', 'up');
      expect(result).toEqual({ major: 2, minor: 0, patch: 0, build: 'beta.1' });
    });
  });

  describe('readPackageVersion', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should read a valid package version', () => {
      const mockPackageContent = JSON.stringify({
        name: '@devstacks/versioner',
        version: '1.2.3'
      });

      vi.mocked(fs.readFileSync).mockReturnValue(mockPackageContent);

      const result = readPackageVersion('/path/to/package.json');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3
      });
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/package.json', 'utf-8');
    });

    it('should return null if package.json has no version', () => {
      const mockPackageContent = JSON.stringify({
        name: '@devstacks/versioner'
      });

      vi.mocked(fs.readFileSync).mockReturnValue(mockPackageContent);

      const result = readPackageVersion('/path/to/package.json');
      expect(result).toBeNull();
    });

    it('should return null if version is invalid', () => {
      const mockPackageContent = JSON.stringify({
        name: '@devstacks/versioner',
        version: 'invalid'
      });

      vi.mocked(fs.readFileSync).mockReturnValue(mockPackageContent);

      const result = readPackageVersion('/path/to/package.json');
      expect(result).toBeNull();
    });

    it('should return null if file cannot be read', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = readPackageVersion('/path/to/package.json');
      expect(result).toBeNull();
    });
  });

  describe('updatePackageVersion', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should update the package version', () => {
      const mockPackageContent = JSON.stringify({
        name: '@devstacks/versioner',
        version: '1.2.3'
      });

      vi.mocked(fs.readFileSync).mockReturnValue(mockPackageContent);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const newVersion: SemanticVersion = { major: 2, minor: 0, patch: 0 };
      const result = updatePackageVersion('/path/to/package.json', newVersion);

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/package.json',
        expect.stringContaining('"version": "2.0.0"'),
        'utf-8'
      );
    });

    it('should return false if file cannot be read', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const newVersion: SemanticVersion = { major: 2, minor: 0, patch: 0 };
      const result = updatePackageVersion('/path/to/package.json', newVersion);

      expect(result).toBe(false);
    });

    it('should return false if file cannot be written', () => {
      const mockPackageContent = JSON.stringify({
        name: '@devstacks/versioner',
        version: '1.2.3'
      });

      vi.mocked(fs.readFileSync).mockReturnValue(mockPackageContent);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Cannot write file');
      });

      const newVersion: SemanticVersion = { major: 2, minor: 0, patch: 0 };
      const result = updatePackageVersion('/path/to/package.json', newVersion);

      expect(result).toBe(false);
    });
  });

  describe('findPackageJson', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should find package.json in the current directory', () => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = findPackageJson('/project/dir');
      expect(result).toBe('/project/dir/package.json');
    });

    it('should return null if package.json is not found', () => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = findPackageJson('/project/dir');
      expect(result).toBeNull();
    });

    it('should return null if an error occurs', () => {
      vi.mocked(path.join).mockImplementation(() => {
        throw new Error('Path error');
      });

      const result = findPackageJson('/project/dir');
      expect(result).toBeNull();
    });
  });
});

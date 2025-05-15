import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { handleCopyTo, handleUpdateVersionPart } from '../src/cli/commands.js';
import * as utils from '../src/cli/utils.js';
import * as version from '../src/cli/version.js';

// Mock dependencies
vi.mock('node:fs');
vi.mock('node:path');
vi.mock('glob');
vi.mock('../src/cli/utils.js');
vi.mock('../src/cli/version.js');

describe('Command handlers', () => {
  // Setup spies for logging and spinner functions
  type MockSpinner = {
    start: ReturnType<typeof vi.fn>;
    succeed: ReturnType<typeof vi.fn>;
    fail: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    text?: string;
  };

  const mockSpinner: MockSpinner = {
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    info: vi.fn()
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(utils.createSpinner).mockReturnValue(mockSpinner as unknown as utils.Ora);
    vi.mocked(utils.validatePath).mockReturnValue(true);
    vi.mocked(utils.warning).mockImplementation(() => {});
    vi.mocked(version.findPackageJson).mockReturnValue('/project/package.json');
    vi.mocked(version.readPackageVersion).mockReturnValue({
      major: 1,
      minor: 2,
      patch: 3
    });
    vi.mocked(version.formatVersion).mockReturnValue('1.2.3');
  });

  describe('handleCopyTo', () => {
    it('should update files in a directory containing the subject', async () => {
      // Arrange
      const targetPath = '/project/build';
      const options = { subject: '__VERSION__' };
      const files = ['file1.js', 'file2.js'];

      // Set up mocks
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(glob).mockResolvedValue(files);

      const fileContents = new Map();
      fileContents.set('/project/build/file1.js', 'const version = "__VERSION__";');
      fileContents.set('/project/build/file2.js', 'const version = "not-the-subject";');

      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        return fileContents.get(filePath as string) || '';
      });

      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      // Act
      await handleCopyTo(targetPath, options);

      // Assert
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(glob).toHaveBeenCalledWith('**/*', expect.any(Object));
      expect(fs.readFileSync).toHaveBeenCalledTimes(3); // once for each file + once for package.json
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/project/build/file1.js',
        'const version = "1.2.3";',
        'utf-8'
      );
      // Should not write to the second file since it doesn't have the subject
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });

    it('should update a single file containing the subject', async () => {
      // Arrange
      const targetPath = '/project/build/file.js';
      const options = { subject: '__VERSION__' };

      // Set up mocks
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, isFile: () => true } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('const version = "__VERSION__";');

      // Act
      await handleCopyTo(targetPath, options);

      // Assert
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(fs.readFileSync).toHaveBeenCalledWith(targetPath, 'utf-8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        targetPath,
        'const version = "1.2.3";',
        'utf-8'
      );
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });

    it('should handle when no files contain the subject', async () => {
      // Arrange
      const targetPath = '/project/build';
      const options = { subject: '__VERSION__' };
      const files = ['file1.js', 'file2.js'];

      // Set up mocks
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(glob).mockResolvedValue(files);
      vi.mocked(fs.readFileSync).mockReturnValue('const version = "not-the-subject";');

      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      // Act
      await handleCopyTo(targetPath, options);

      // Assert
      expect(mockSpinner.info).toHaveBeenCalledWith(expect.stringContaining('No files found'));
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle invalid target path', async () => {
      // Arrange
      const targetPath = '/project/nonexistent';
      const options = { subject: '__VERSION__' };

      // Set up mocks
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Act
      await handleCopyTo(targetPath, options);

      // Assert
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });

    it('should handle file read errors', async () => {
      // This is a simpler test that focuses on the error path
      // We'll manually call the warning by simulating a specific scenario
      const errorFilePath = '/project/build/file1.js';

      // Set up the basic mocks needed for the test
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, isFile: () => true } as unknown as fs.Stats);

      // Make fs.readFileSync throw an error when reading the file
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === errorFilePath) {
          throw new Error('Cannot read file');
        }
        return '{ "version": "1.2.3" }'; // For package.json read
      });

      // Act
      await handleCopyTo(errorFilePath, { subject: '__VERSION__' });

      // Assert - should call warning when file read fails
      expect(utils.warning).toHaveBeenCalledWith(`Failed to update ${errorFilePath}`);
      // Should not attempt to write the file
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle user-specified package.json path', async () => {
      // Arrange
      const targetPath = '/project/build/file.js';
      const options = {
        subject: '__VERSION__',
        package: '/custom/path/package.json'
      };

      // Set up mocks
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, isFile: () => true } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('const version = "__VERSION__";');

      // Act
      await handleCopyTo(targetPath, options);

      // Assert
      expect(version.readPackageVersion).toHaveBeenCalledWith('/custom/path/package.json');
    });
  });

  describe('handleUpdateVersionPart', () => {
    it('should update major version up', async () => {
      // Arrange
      const options = {};
      const currentVersion = { major: 1, minor: 2, patch: 3 };
      const newVersion = { major: 2, minor: 0, patch: 0 };

      vi.mocked(version.readPackageVersion).mockReturnValue(currentVersion);
      vi.mocked(version.adjustVersionPart).mockReturnValue(newVersion);
      vi.mocked(version.updatePackageVersion).mockReturnValue(true);

      // Act
      await handleUpdateVersionPart('major', options);

      // Assert
      expect(version.adjustVersionPart).toHaveBeenCalledWith(currentVersion, 'major', 'up');
      expect(version.updatePackageVersion).toHaveBeenCalledWith('/project/package.json', newVersion);
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });

    it('should update patch version down', async () => {
      // Arrange
      const options = { down: true };
      const currentVersion = { major: 1, minor: 2, patch: 3 };
      const newVersion = { major: 1, minor: 2, patch: 2 };

      vi.mocked(version.readPackageVersion).mockReturnValue(currentVersion);
      vi.mocked(version.adjustVersionPart).mockReturnValue(newVersion);
      vi.mocked(version.updatePackageVersion).mockReturnValue(true);

      // Act
      await handleUpdateVersionPart('patch', options);

      // Assert
      expect(version.adjustVersionPart).toHaveBeenCalledWith(currentVersion, 'patch', 'down');
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });

    it('should handle update failure', async () => {
      // Arrange
      const options = {};
      const currentVersion = { major: 1, minor: 2, patch: 3 };
      const newVersion = { major: 2, minor: 0, patch: 0 };

      vi.mocked(version.readPackageVersion).mockReturnValue(currentVersion);
      vi.mocked(version.adjustVersionPart).mockReturnValue(newVersion);
      vi.mocked(version.updatePackageVersion).mockReturnValue(false);

      // Act
      await handleUpdateVersionPart('major', options);

      // Assert
      expect(mockSpinner.fail).toHaveBeenCalled();
    });

    it('should handle missing package.json', async () => {
      // Arrange
      const options = {};

      vi.mocked(version.findPackageJson).mockReturnValue(null);

      // Act
      await handleUpdateVersionPart('major', options);

      // Assert
      expect(utils.error).toHaveBeenCalledWith(expect.stringContaining('No package.json found'));
    });

    it('should handle invalid package.json path', async () => {
      // Arrange
      const options = { package: '/invalid/path/package.json' };

      vi.mocked(utils.validatePath).mockReturnValue(false);

      // Act
      await handleUpdateVersionPart('minor', options);

      // Assert
      expect(utils.validatePath).toHaveBeenCalledWith('/invalid/path/package.json', 'file');
    });

    it('should handle error reading version', async () => {
      // Arrange
      const options = {};

      vi.mocked(version.readPackageVersion).mockReturnValue(null);

      // Act
      await handleUpdateVersionPart('patch', options);

      // Assert
      expect(mockSpinner.start).not.toHaveBeenCalled();
    });
  });
});

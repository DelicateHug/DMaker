/**
 * @automaker/git-utils
 * Git operations utilities for AutoMaker
 */

// Export types and constants
export {
  BINARY_EXTENSIONS,
  GIT_STATUS_MAP,
  type FileStatus,
} from './types';

// Export status utilities
export {
  isGitRepo,
  parseGitStatus,
} from './status';

// Export diff utilities
export {
  generateSyntheticDiffForNewFile,
  appendUntrackedFileDiffs,
  listAllFilesInDirectory,
  generateDiffsForNonGitDirectory,
  getGitRepositoryDiffs,
} from './diff';

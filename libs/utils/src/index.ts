/**
 * @dmaker/utils
 * Shared utility functions for DMaker
 */

// Error handling
export {
  isAbortError,
  isCancellationError,
  isAuthenticationError,
  isRateLimitError,
  isQuotaExhaustedError,
  extractRetryAfter,
  classifyError,
  getUserFriendlyErrorMessage,
  getErrorMessage,
} from './error-handler.js';

// Conversation utilities
export {
  extractTextFromContent,
  normalizeContentBlocks,
  formatHistoryAsText,
  convertHistoryToMessages,
} from './conversation-utils.js';

// Image handling
export {
  getMimeTypeForImage,
  readImageAsBase64,
  convertImagesToContentBlocks,
  formatImagePathsForPrompt,
} from './image-handler.js';

// Prompt building
export {
  buildPromptWithImages,
  type PromptContent,
  type PromptWithImages,
} from './prompt-builder.js';

// Logger
export {
  createLogger,
  getLogLevel,
  setLogLevel,
  setColorsEnabled,
  setTimestampsEnabled,
  LogLevel,
  type Logger,
} from './logger.js';

// File and path utilities (consolidated from fs-utils + path-utils)
export { mkdirSafe, existsSafe, normalizePath, pathsEqual } from './file-utils.js';

// Atomic file operations
export {
  atomicWriteJson,
  readJsonFile,
  updateJsonAtomically,
  readJsonWithRecovery,
  rotateBackups,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
  type AtomicWriteOptions,
  type ReadJsonRecoveryResult,
  type ReadJsonRecoveryOptions,
} from './atomic-writer.js';

// Context file loading
export {
  loadContextFiles,
  getContextFilesSummary,
  getEnabledContextFileNames,
  getEnabledMemoryFileNames,
  type ContextMetadata,
  type ContextFileInfo,
  type ContextFilesResult,
  type ContextFsModule,
  type LoadContextFilesOptions,
  type MemoryFileInfo,
  type TaskContext,
} from './context-loader.js';

// Retry with exponential backoff
export {
  retryWithBackoff,
  retryWithBackoffResult,
  isTransientError,
  calculateBackoffDelay,
  type RetryOptions,
  type RetryResult,
} from './retry.js';

// Memory loading
export {
  loadRelevantMemory,
  initializeMemoryFolder,
  appendLearning,
  recordMemoryUsage,
  getMemoryDir,
  parseFrontmatter,
  serializeFrontmatter,
  extractTerms,
  calculateUsageScore,
  countMatches,
  incrementUsageStat,
  formatLearning,
  // Tiered memory system
  consolidateMemoryToMaster,
  memoryTiersNeedRegeneration,
  writeMemoryTiers,
  getMemoryTierForModel,
  getTierFileName,
  isTierSystemFile,
  type MemoryFsModule,
  type MemoryMetadata,
  type MemoryFile,
  type MemoryLoadResult,
  type UsageStats,
  type LearningEntry,
  type SimpleMemoryFile,
  type MemoryTier,
  type MemoryTierMeta,
} from './memory-loader.js';

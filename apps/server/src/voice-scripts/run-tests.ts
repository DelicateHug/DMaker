/**
 * Run Tests Voice Script
 *
 * Handles voice commands for running Playwright tests and checking test status.
 * This script is invoked by the voice command interpreter when the user
 * asks to "run tests", "run playwright tests", "test feature X", etc.
 *
 * Voice Script Pattern:
 * - Scripts receive a context object with projectPath, session info, and dependencies
 * - Scripts return a VoiceCommandResult with success status and response text
 * - Scripts should format responses for both text display and TTS readback
 */

import type { Feature, VoiceCommandResult } from '@automaker/types';
import type { VoiceScriptContext } from './list-features.js';
import { createLogger } from '@automaker/utils';
import { exec } from 'child_process';
import { promisify } from 'util';

const logger = createLogger('VoiceScript:RunTests');
const execAsync = promisify(exec);

/** Default timeout for test execution (5 minutes) */
const DEFAULT_TEST_TIMEOUT = 300000;

/** Maximum output buffer size (10MB) */
const MAX_OUTPUT_BUFFER = 10 * 1024 * 1024;

/**
 * Test runner types supported by the system
 */
export type TestRunner = 'playwright' | 'vitest' | 'jest' | 'npm';

/**
 * Options for running tests
 */
export interface RunTestsOptions {
  /** Specific test file or pattern to run */
  testPattern?: string;
  /** Feature ID to run tests for */
  featureId?: string;
  /** Feature title to run tests for */
  featureTitle?: string;
  /** Test runner to use (default: playwright) */
  runner?: TestRunner;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
  /** Run tests in headed mode (visible browser) */
  headed?: boolean;
  /** Only run tests matching this grep pattern */
  grep?: string;
  /** Number of workers/parallel tests */
  workers?: number;
  /** Run tests in UI mode */
  uiMode?: boolean;
}

/**
 * Test run result details
 */
export interface TestRunResult {
  /** Whether all tests passed */
  passed: boolean;
  /** Number of tests that passed */
  passedCount: number;
  /** Number of tests that failed */
  failedCount: number;
  /** Number of tests that were skipped */
  skippedCount: number;
  /** Total number of tests */
  totalCount: number;
  /** Duration in milliseconds */
  duration: number;
  /** Standard output from test run */
  stdout: string;
  /** Standard error from test run */
  stderr: string;
  /** Exit code from test runner */
  exitCode: number;
  /** Error message if execution failed */
  error?: string;
}

/**
 * Build the test command based on options
 */
function buildTestCommand(projectPath: string, options: RunTestsOptions): string {
  const { runner = 'playwright', testPattern, headed, grep, workers, uiMode } = options;

  const parts: string[] = ['npm', 'run'];

  switch (runner) {
    case 'playwright':
      parts.push('test');

      // Add Playwright-specific options
      if (headed) {
        parts.push('--', '--headed');
      }
      if (grep) {
        parts.push('--', '--grep', `"${grep}"`);
      }
      if (workers !== undefined) {
        parts.push('--', '--workers', String(workers));
      }
      if (uiMode) {
        parts.push('--', '--ui');
      }
      if (testPattern) {
        parts.push('--', testPattern);
      }
      break;

    case 'vitest':
      parts.push('test:unit');
      if (testPattern) {
        parts.push('--', testPattern);
      }
      break;

    case 'jest':
      parts.push('test');
      if (testPattern) {
        parts.push('--', testPattern);
      }
      break;

    case 'npm':
    default:
      // Generic npm test
      parts.push('test');
      break;
  }

  return parts.join(' ');
}

/**
 * Parse test output to extract pass/fail counts
 * Handles Playwright output format
 */
function parseTestOutput(stdout: string, stderr: string): Partial<TestRunResult> {
  const result: Partial<TestRunResult> = {
    passedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalCount: 0,
  };

  const output = stdout + '\n' + stderr;

  // Playwright format: "X passed", "X failed", "X skipped"
  const passedMatch = output.match(/(\d+)\s+passed/i);
  const failedMatch = output.match(/(\d+)\s+failed/i);
  const skippedMatch = output.match(/(\d+)\s+skipped/i);

  if (passedMatch) {
    result.passedCount = parseInt(passedMatch[1], 10);
  }
  if (failedMatch) {
    result.failedCount = parseInt(failedMatch[1], 10);
  }
  if (skippedMatch) {
    result.skippedCount = parseInt(skippedMatch[1], 10);
  }

  result.totalCount =
    (result.passedCount || 0) + (result.failedCount || 0) + (result.skippedCount || 0);
  result.passed = result.failedCount === 0 && result.totalCount > 0;

  return result;
}

/**
 * Format test result for display
 */
function formatTestResultForDisplay(result: TestRunResult): string {
  const lines: string[] = [];

  // Status header
  const statusIcon = result.passed ? '\u2705' : '\u274C';
  const statusText = result.passed ? 'Tests Passed' : 'Tests Failed';
  lines.push(`## ${statusIcon} ${statusText}`);
  lines.push('');

  // Summary
  lines.push('### Summary');
  lines.push(`- **Passed:** ${result.passedCount}`);
  lines.push(`- **Failed:** ${result.failedCount}`);
  if (result.skippedCount > 0) {
    lines.push(`- **Skipped:** ${result.skippedCount}`);
  }
  lines.push(`- **Total:** ${result.totalCount}`);
  lines.push(`- **Duration:** ${formatDuration(result.duration)}`);

  // Show errors if failed
  if (!result.passed && result.stderr) {
    lines.push('');
    lines.push('### Error Output');
    // Truncate long error output
    const errorPreview =
      result.stderr.length > 500 ? result.stderr.substring(0, 500) + '...' : result.stderr;
    lines.push('```');
    lines.push(errorPreview);
    lines.push('```');
  }

  return lines.join('\n');
}

/**
 * Format test result for speech
 */
function formatTestResultForSpeech(result: TestRunResult): string {
  if (result.passed) {
    if (result.totalCount === 1) {
      return `Great news! The test passed in ${formatDuration(result.duration)}.`;
    }
    return `Great news! All ${result.passedCount} tests passed in ${formatDuration(result.duration)}.`;
  }

  const failedText =
    result.failedCount === 1 ? '1 test failed' : `${result.failedCount} tests failed`;
  const passedText = result.passedCount > 0 ? `, ${result.passedCount} passed` : '';

  return `${failedText}${passedText} out of ${result.totalCount} total tests.`;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  return `${minutes} minute${minutes === 1 ? '' : 's'} ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`;
}

/**
 * Run Tests Voice Script
 *
 * Executes Playwright or other test runners and reports results.
 *
 * @param context - Voice script context with project info and services
 * @param options - Options for test execution
 * @returns VoiceCommandResult with test results
 */
export async function runTests(
  context: VoiceScriptContext,
  options: RunTestsOptions = {}
): Promise<VoiceCommandResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? DEFAULT_TEST_TIMEOUT;
  const runner = options.runner ?? 'playwright';

  try {
    logger.info(`Running ${runner} tests`, {
      projectPath: context.projectPath,
      options,
    });

    // Build the test command
    const command = buildTestCommand(context.projectPath, options);
    logger.info(`Executing: ${command}`);

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const result = await execAsync(command, {
        cwd: context.projectPath,
        timeout,
        maxBuffer: MAX_OUTPUT_BUFFER,
        env: {
          ...process.env,
          // Force color output for better parsing
          FORCE_COLOR: '1',
          // Disable interactive prompts
          CI: 'true',
        },
      });

      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: unknown) {
      // exec throws on non-zero exit code, but tests may still have run
      const error = execError as { stdout?: string; stderr?: string; code?: number };
      stdout = error.stdout || '';
      stderr = error.stderr || '';
      exitCode = error.code || 1;
    }

    const duration = Date.now() - startTime;

    // Parse the test output
    const parsedResult = parseTestOutput(stdout, stderr);

    const testResult: TestRunResult = {
      passed: parsedResult.passed ?? false,
      passedCount: parsedResult.passedCount ?? 0,
      failedCount: parsedResult.failedCount ?? 0,
      skippedCount: parsedResult.skippedCount ?? 0,
      totalCount: parsedResult.totalCount ?? 0,
      duration,
      stdout,
      stderr,
      exitCode,
    };

    // If no tests were found in output but exit code is 0, consider it passed
    if (testResult.totalCount === 0 && exitCode === 0) {
      testResult.passed = true;
    }

    const displayText = formatTestResultForDisplay(testResult);
    const speechText = formatTestResultForSpeech(testResult);

    logger.info(`Test run complete: ${testResult.passed ? 'PASSED' : 'FAILED'}`, {
      passed: testResult.passedCount,
      failed: testResult.failedCount,
      duration,
    });

    return {
      success: true,
      response: displayText,
      commandName: 'run-tests',
      data: {
        testResult,
        runner,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const duration = Date.now() - startTime;

    logger.error('Failed to run tests:', error);

    return {
      success: false,
      response: `## \u274C Test Execution Failed\n\nError: ${errorMessage}\n\nDuration: ${formatDuration(duration)}`,
      commandName: 'run-tests',
      error: errorMessage,
      data: {
        speechText: `Test execution failed: ${errorMessage}`,
        duration,
      },
    };
  }
}

/**
 * Run Tests for Feature
 *
 * Runs tests related to a specific feature by ID or title.
 * Searches for test files that match the feature name.
 *
 * @param context - Voice script context
 * @param identifier - Feature ID or title
 * @param options - Additional test options
 * @returns VoiceCommandResult with test results
 */
export async function runTestsForFeature(
  context: VoiceScriptContext,
  identifier: string,
  options: Omit<RunTestsOptions, 'featureId' | 'featureTitle'> = {}
): Promise<VoiceCommandResult> {
  try {
    if (!identifier || !identifier.trim()) {
      return {
        success: false,
        response: 'Please specify a feature ID or title to run tests for.',
        commandName: 'run-tests-for-feature',
        error: 'Feature identifier is required',
      };
    }

    const trimmedId = identifier.trim();
    logger.info(`Running tests for feature: "${trimmedId}"`, {
      projectPath: context.projectPath,
    });

    // Try to find the feature
    let feature: Feature | null = await context.featureLoader.get(context.projectPath, trimmedId);

    // If not found by ID, try title match
    if (!feature) {
      feature = await context.featureLoader.findByTitle(context.projectPath, trimmedId);
    }

    // If still not found, try partial match
    if (!feature) {
      const allFeatures = await context.featureLoader.getAll(context.projectPath);
      const normalizedQuery = trimmedId.toLowerCase();

      const matches = allFeatures.filter(
        (f) => f.title && f.title.toLowerCase().includes(normalizedQuery)
      );

      if (matches.length === 1) {
        feature = matches[0];
      } else if (matches.length > 1) {
        const matchTitles = matches
          .slice(0, 5)
          .map((f) => f.title || 'Untitled')
          .join(', ');
        return {
          success: false,
          response: `Found ${matches.length} features matching "${trimmedId}". Which one did you mean: ${matchTitles}?`,
          commandName: 'run-tests-for-feature',
          error: 'Multiple matches found',
          data: {
            matches: matches.slice(0, 5).map((f) => ({
              id: f.id,
              title: f.title,
            })),
            speechText: `I found ${matches.length} features matching that name. Could you be more specific?`,
          },
        };
      }
    }

    if (!feature) {
      return {
        success: false,
        response: `Could not find a feature matching "${trimmedId}".`,
        commandName: 'run-tests-for-feature',
        error: 'Feature not found',
        data: {
          speechText: `I couldn't find a feature called "${trimmedId}".`,
        },
      };
    }

    // Build a test pattern based on the feature title
    // Convert feature title to a grep pattern (lowercase, replace spaces with .*)
    const featureTitle = feature.title || feature.id;
    const grepPattern = featureTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.*')
      .replace(/\.\*+/g, '.*');

    logger.info(`Running tests with grep pattern: "${grepPattern}" for feature: ${featureTitle}`);

    // Run tests with the feature-specific pattern
    const result = await runTests(context, {
      ...options,
      grep: grepPattern,
    });

    // Enhance the response with feature context
    if (result.success) {
      const testData = result.data as { testResult: TestRunResult; speechText: string };
      const testResult = testData?.testResult;

      if (testResult) {
        // Prepend feature context to display
        const updatedResponse = `## Testing Feature: ${featureTitle}\n\n${result.response}`;

        // Update speech text with feature context
        const existingData = (result.data || {}) as Record<string, unknown>;
        let updatedSpeechText: string;

        if (testResult.totalCount === 0) {
          updatedSpeechText = `No tests found matching the feature "${featureTitle}".`;
        } else {
          updatedSpeechText = `Tests for "${featureTitle}": ${testData.speechText}`;
        }

        return {
          success: result.success,
          response: updatedResponse,
          commandName: 'run-tests-for-feature',
          error: result.error,
          data: {
            ...existingData,
            speechText: updatedSpeechText,
            feature: {
              id: feature.id,
              title: feature.title,
            },
          },
        };
      }
    }

    return {
      success: result.success,
      response: result.response,
      commandName: 'run-tests-for-feature',
      error: result.error,
      data: result.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to run tests for feature:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while running tests for that feature.',
      commandName: 'run-tests-for-feature',
      error: errorMessage,
    };
  }
}

/**
 * Get Test Status
 *
 * Checks the current status of tests without running them.
 * Useful for queries like "what's the test status" or "did the tests pass"
 *
 * @param context - Voice script context
 * @returns VoiceCommandResult with test status
 */
export async function getTestStatus(context: VoiceScriptContext): Promise<VoiceCommandResult> {
  try {
    logger.info(`Getting test status for: ${context.projectPath}`);

    // Run tests with a quick dry-run or list command
    // For Playwright, we can use --list to just list tests without running
    const command = 'npm run test -- --list';

    let stdout = '';
    let stderr = '';

    try {
      const result = await execAsync(command, {
        cwd: context.projectPath,
        timeout: 30000, // 30 second timeout for listing
        maxBuffer: MAX_OUTPUT_BUFFER,
        env: {
          ...process.env,
          CI: 'true',
        },
      });

      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: unknown) {
      const error = execError as { stdout?: string; stderr?: string };
      stdout = error.stdout || '';
      stderr = error.stderr || '';
    }

    // Parse the test list
    const output = stdout + '\n' + stderr;
    const testCount = (output.match(/\[.*\]/g) || []).length;

    let displayText: string;
    let speechText: string;

    if (testCount > 0) {
      displayText = `## Test Status\n\n**Available Tests:** ${testCount}\n\nRun \`npm run test\` to execute all tests.`;
      speechText = `You have ${testCount} test${testCount === 1 ? '' : 's'} available. Would you like me to run them?`;
    } else {
      displayText = '## Test Status\n\nNo tests found in the project.';
      speechText = "I couldn't find any tests in the project.";
    }

    return {
      success: true,
      response: displayText,
      commandName: 'get-test-status',
      data: {
        testCount,
        speechText,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to get test status:', error);

    return {
      success: false,
      response: 'Sorry, I encountered an error while checking the test status.',
      commandName: 'get-test-status',
      error: errorMessage,
    };
  }
}

/**
 * Run All Tests
 *
 * Convenience function to run all tests with default settings.
 * Responds to "run all tests" or "run the tests"
 *
 * @param context - Voice script context
 * @returns VoiceCommandResult with test results
 */
export async function runAllTests(context: VoiceScriptContext): Promise<VoiceCommandResult> {
  return runTests(context, { runner: 'playwright' });
}

/**
 * Run Unit Tests
 *
 * Runs unit tests using Vitest.
 * Responds to "run unit tests" or "run vitest"
 *
 * @param context - Voice script context
 * @returns VoiceCommandResult with test results
 */
export async function runUnitTests(context: VoiceScriptContext): Promise<VoiceCommandResult> {
  logger.info(`Running unit tests for: ${context.projectPath}`);

  const result = await runTests(context, { runner: 'vitest' });

  // Update command name
  return {
    ...result,
    commandName: 'run-unit-tests',
  };
}

/**
 * Run E2E Tests
 *
 * Runs end-to-end tests using Playwright.
 * Responds to "run e2e tests" or "run end to end tests"
 *
 * @param context - Voice script context
 * @param headed - Whether to run in headed mode
 * @returns VoiceCommandResult with test results
 */
export async function runE2ETests(
  context: VoiceScriptContext,
  headed: boolean = false
): Promise<VoiceCommandResult> {
  logger.info(`Running E2E tests for: ${context.projectPath}`, { headed });

  const result = await runTests(context, {
    runner: 'playwright',
    headed,
  });

  // Update command name
  return {
    ...result,
    commandName: 'run-e2e-tests',
  };
}

/**
 * Run Tests with Pattern
 *
 * Runs tests matching a specific pattern.
 * Responds to "run tests matching X" or "run X tests"
 *
 * @param context - Voice script context
 * @param pattern - Test file pattern or grep pattern
 * @returns VoiceCommandResult with test results
 */
export async function runTestsWithPattern(
  context: VoiceScriptContext,
  pattern: string
): Promise<VoiceCommandResult> {
  if (!pattern || !pattern.trim()) {
    return {
      success: false,
      response: 'Please specify a test pattern to run.',
      commandName: 'run-tests-with-pattern',
      error: 'Test pattern is required',
    };
  }

  logger.info(`Running tests with pattern: "${pattern}"`, {
    projectPath: context.projectPath,
  });

  const result = await runTests(context, {
    runner: 'playwright',
    grep: pattern.trim(),
  });

  // Update command name
  return {
    ...result,
    commandName: 'run-tests-with-pattern',
  };
}

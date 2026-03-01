/**
 * Context routes - HTTP API for context file operations
 *
 * Provides endpoints for managing context files including
 * AI-powered image and file description generation.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as path from 'path';
import { createLogger, readImageAsBase64 } from '@dmaker/utils';
import { DEFAULT_PHASE_MODELS, isCursorModel } from '@dmaker/types';
import { PathNotAllowedError, secureFs } from '@dmaker/platform';
import { resolvePhaseModel } from '@dmaker/model-resolver';
import { simpleQuery } from '../providers/simple-query-service.js';
import type { SettingsService } from '../services/settings-service.js';
import { getAutoLoadClaudeMdSetting, getPromptCustomization } from '../lib/settings-helpers.js';

// ---------------------------------------------------------------------------
// Loggers
// ---------------------------------------------------------------------------

const describeFileLogger = createLogger('DescribeFile');
const describeImageLogger = createLogger('DescribeImage');

// ---------------------------------------------------------------------------
// Describe-file types
// ---------------------------------------------------------------------------

interface DescribeFileRequestBody {
  filePath: string;
}

interface DescribeFileSuccessResponse {
  success: true;
  description: string;
}

interface DescribeFileErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// POST /describe-file - Generate description for a text file
// ---------------------------------------------------------------------------

function createDescribeFileHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as DescribeFileRequestBody;

      if (!filePath || typeof filePath !== 'string') {
        const response: DescribeFileErrorResponse = {
          success: false,
          error: 'filePath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      describeFileLogger.info(`Starting description generation for: ${filePath}`);

      const resolvedPath = secureFs.resolvePath(filePath);

      let fileContent: string;
      try {
        const content = await secureFs.readFile(resolvedPath, 'utf-8');
        fileContent = typeof content === 'string' ? content : content.toString('utf-8');
      } catch (readError) {
        if (readError instanceof PathNotAllowedError) {
          describeFileLogger.warn(`Path not allowed: ${filePath}`);
          const response: DescribeFileErrorResponse = {
            success: false,
            error: 'File path is not within the allowed directory',
          };
          res.status(403).json(response);
          return;
        }

        if (
          readError !== null &&
          typeof readError === 'object' &&
          'code' in readError &&
          readError.code === 'ENOENT'
        ) {
          describeFileLogger.warn(`File not found: ${resolvedPath}`);
          const response: DescribeFileErrorResponse = {
            success: false,
            error: `File not found: ${filePath}`,
          };
          res.status(404).json(response);
          return;
        }

        const errorMessage = readError instanceof Error ? readError.message : 'Unknown error';
        describeFileLogger.error(`Failed to read file: ${errorMessage}`);
        const response: DescribeFileErrorResponse = {
          success: false,
          error: `Failed to read file: ${errorMessage}`,
        };
        res.status(500).json(response);
        return;
      }

      const MAX_CONTENT_LENGTH = 50000;
      const truncated = fileContent.length > MAX_CONTENT_LENGTH;
      const contentToAnalyze = truncated
        ? fileContent.substring(0, MAX_CONTENT_LENGTH)
        : fileContent;

      const fileName = path.basename(resolvedPath);

      const prompts = await getPromptCustomization(settingsService, '[DescribeFile]');

      const prompt = `${prompts.contextDescription.describeFilePrompt}

File: ${fileName}${truncated ? ' (truncated)' : ''}

--- FILE CONTENT ---
${contentToAnalyze}`;

      const cwd = path.dirname(resolvedPath);

      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        cwd,
        settingsService,
        '[DescribeFile]'
      );

      const settings = await settingsService?.getGlobalSettings();
      describeFileLogger.info(
        `Raw phaseModels from settings:`,
        JSON.stringify(settings?.phaseModels, null, 2)
      );
      const phaseModelEntry =
        settings?.phaseModels?.fileDescriptionModel || DEFAULT_PHASE_MODELS.fileDescriptionModel;
      describeFileLogger.info(`fileDescriptionModel entry:`, JSON.stringify(phaseModelEntry));
      const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

      describeFileLogger.info(`Resolved model: ${model}, thinkingLevel: ${thinkingLevel}`);

      const result = await simpleQuery({
        prompt,
        model,
        cwd,
        maxTurns: 1,
        allowedTools: [],
        thinkingLevel,
        readOnly: true,
        settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
      });

      const description = result.text;

      if (!description || description.trim().length === 0) {
        describeFileLogger.warn('Received empty response from Claude');
        const response: DescribeFileErrorResponse = {
          success: false,
          error: 'Failed to generate description - empty response',
        };
        res.status(500).json(response);
        return;
      }

      describeFileLogger.info(`Description generated, length: ${description.length} chars`);

      const response: DescribeFileSuccessResponse = {
        success: true,
        description: description.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      describeFileLogger.error('File description failed:', errorMessage);

      const response: DescribeFileErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}

// ---------------------------------------------------------------------------
// Describe-image types & helpers
// ---------------------------------------------------------------------------

const SAFE_HEADERS_ALLOWLIST = new Set([
  'content-type',
  'accept',
  'user-agent',
  'host',
  'referer',
  'content-length',
  'origin',
  'x-request-id',
]);

function filterSafeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SAFE_HEADERS_ALLOWLIST.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function findActualFilePath(requestedPath: string): string | null {
  if (secureFs.existsSync(requestedPath)) {
    return requestedPath;
  }

  const normalizedPath = requestedPath.normalize('NFC');
  if (secureFs.existsSync(normalizedPath)) {
    return normalizedPath;
  }

  const dir = path.dirname(requestedPath);
  const baseName = path.basename(requestedPath);

  if (!secureFs.existsSync(dir)) {
    return null;
  }

  try {
    const files = secureFs.readdirSync(dir);

    const normalizeSpaces = (s: string): string => s.replace(/[\u00A0\u202F\u2009\u200A]/g, ' ');

    const normalizedBaseName = normalizeSpaces(baseName);

    for (const file of files) {
      if (normalizeSpaces(file) === normalizedBaseName) {
        describeImageLogger.info(`Found matching file with different space encoding: ${file}`);
        return path.join(dir, file);
      }
    }
  } catch (err) {
    describeImageLogger.error(`Error reading directory ${dir}: ${err}`);
  }

  return null;
}

interface DescribeImageRequestBody {
  imagePath: string;
}

interface DescribeImageSuccessResponse {
  success: true;
  description: string;
}

interface DescribeImageErrorResponse {
  success: false;
  error: string;
  requestId?: string;
}

function mapDescribeImageError(rawMessage: string | undefined): {
  statusCode: number;
  userMessage: string;
} {
  const baseResponse = {
    statusCode: 500,
    userMessage: 'Failed to generate an image description. Please try again.',
  };

  if (!rawMessage) return baseResponse;

  if (rawMessage.includes('Claude Code process exited')) {
    return {
      statusCode: 503,
      userMessage:
        'Claude exited unexpectedly while describing the image. Try again. If it keeps happening, re-run `claude login` or update your API key in Setup so Claude can restart cleanly.',
    };
  }

  if (
    rawMessage.includes('Failed to spawn Claude Code process') ||
    rawMessage.includes('Claude Code executable not found') ||
    rawMessage.includes('Claude Code native binary not found')
  ) {
    return {
      statusCode: 503,
      userMessage:
        'Claude CLI could not be launched. Make sure the Claude CLI is installed and available in PATH, then try again.',
    };
  }

  if (rawMessage.toLowerCase().includes('rate limit') || rawMessage.includes('429')) {
    return {
      statusCode: 429,
      userMessage: 'Rate limited while describing the image. Please wait a moment and try again.',
    };
  }

  if (rawMessage.toLowerCase().includes('payload too large') || rawMessage.includes('413')) {
    return {
      statusCode: 413,
      userMessage:
        'The image is too large to send for description. Please resize/compress it and try again.',
    };
  }

  return baseResponse;
}

// ---------------------------------------------------------------------------
// POST /describe-image - Generate description for an image
// ---------------------------------------------------------------------------

function createDescribeImageHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const requestId = `describe-image-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const startedAt = Date.now();

    describeImageLogger.info(`[${requestId}] ===== POST /api/context/describe-image =====`);
    describeImageLogger.info(
      `[${requestId}] headers=${JSON.stringify(filterSafeHeaders(req.headers))}`
    );
    describeImageLogger.info(`[${requestId}] body=${JSON.stringify(req.body)}`);

    try {
      const { imagePath } = req.body as DescribeImageRequestBody;

      if (!imagePath || typeof imagePath !== 'string') {
        const response: DescribeImageErrorResponse = {
          success: false,
          error: 'imagePath is required and must be a string',
          requestId,
        };
        res.status(400).json(response);
        return;
      }

      describeImageLogger.info(`[${requestId}] imagePath="${imagePath}" type=${typeof imagePath}`);

      const actualPath = findActualFilePath(imagePath);
      if (!actualPath) {
        describeImageLogger.error(`[${requestId}] File not found: ${imagePath}`);
        const hexPath = Buffer.from(imagePath).toString('hex');
        describeImageLogger.error(`[${requestId}] imagePath hex: ${hexPath}`);
        const response: DescribeImageErrorResponse = {
          success: false,
          error: `File not found: ${imagePath}`,
          requestId,
        };
        res.status(404).json(response);
        return;
      }

      if (actualPath !== imagePath) {
        describeImageLogger.info(`[${requestId}] Using actual path: ${actualPath}`);
      }

      let stat: ReturnType<typeof secureFs.statSync> | null = null;
      try {
        stat = secureFs.statSync(actualPath);
        describeImageLogger.info(
          `[${requestId}] fileStats size=${stat.size} bytes mtime=${stat.mtime.toISOString()}`
        );
      } catch (statErr) {
        describeImageLogger.warn(
          `[${requestId}] Unable to stat image file (continuing to read base64): ${String(statErr)}`
        );
      }

      describeImageLogger.info(`[${requestId}] Reading image into base64...`);
      const imageReadStart = Date.now();
      const imageData = await readImageAsBase64(actualPath);
      const imageReadMs = Date.now() - imageReadStart;

      const base64Length = imageData.base64.length;
      const estimatedBytes = Math.ceil((base64Length * 3) / 4);
      describeImageLogger.info(`[${requestId}] imageReadMs=${imageReadMs}`);
      describeImageLogger.info(
        `[${requestId}] image meta filename=${imageData.filename} mime=${imageData.mimeType} base64Len=${base64Length} estBytes=${estimatedBytes}`
      );

      const cwd = path.dirname(actualPath);
      describeImageLogger.info(`[${requestId}] Using cwd=${cwd}`);

      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        cwd,
        settingsService,
        '[DescribeImage]'
      );

      const settings = await settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.imageDescriptionModel || DEFAULT_PHASE_MODELS.imageDescriptionModel;
      const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

      describeImageLogger.info(`[${requestId}] Using model: ${model}`);

      const prompts = await getPromptCustomization(settingsService, '[DescribeImage]');

      const instructionText = prompts.contextDescription.describeImagePrompt;

      let prompt: string | Array<{ type: string; text?: string; source?: object }>;

      if (isCursorModel(model)) {
        describeImageLogger.info(`[${requestId}] Using text prompt for Cursor model`);
        prompt = `${instructionText}\n\nImage file: ${actualPath}\nMIME type: ${imageData.mimeType}`;
      } else {
        describeImageLogger.info(`[${requestId}] Using multi-part prompt with image block`);
        prompt = [
          { type: 'text', text: instructionText },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.mimeType,
              data: imageData.base64,
            },
          },
        ];
      }

      describeImageLogger.info(`[${requestId}] Calling simpleQuery...`);
      const queryStart = Date.now();

      const result = await simpleQuery({
        prompt,
        model,
        cwd,
        maxTurns: 1,
        allowedTools: isCursorModel(model) ? ['Read'] : [],
        thinkingLevel,
        readOnly: true,
        settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
      });

      describeImageLogger.info(
        `[${requestId}] simpleQuery completed in ${Date.now() - queryStart}ms`
      );

      const description = result.text;

      if (!description || description.trim().length === 0) {
        describeImageLogger.warn(`[${requestId}] Received empty response from AI`);
        const response: DescribeImageErrorResponse = {
          success: false,
          error: 'Failed to generate description - empty response',
          requestId,
        };
        res.status(500).json(response);
        return;
      }

      const totalMs = Date.now() - startedAt;
      describeImageLogger.info(
        `[${requestId}] Success descriptionLen=${description.length} totalMs=${totalMs}`
      );

      const response: DescribeImageSuccessResponse = {
        success: true,
        description: description.trim(),
      };
      res.json(response);
    } catch (error) {
      const totalMs = Date.now() - startedAt;
      const err = error as unknown;
      const errMessage = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : 'UnknownError';
      const errStack = err instanceof Error ? err.stack : undefined;

      describeImageLogger.error(`[${requestId}] FAILED totalMs=${totalMs}`);
      describeImageLogger.error(`[${requestId}] errorName=${errName}`);
      describeImageLogger.error(`[${requestId}] errorMessage=${errMessage}`);
      if (errStack) describeImageLogger.error(`[${requestId}] errorStack=${errStack}`);

      try {
        const props = err && typeof err === 'object' ? Object.getOwnPropertyNames(err) : [];
        describeImageLogger.error(`[${requestId}] errorProps=${JSON.stringify(props)}`);
        if (err && typeof err === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyErr = err as any;
          const details = JSON.stringify(anyErr, props as unknown as string[]);
          describeImageLogger.error(`[${requestId}] errorDetails=${details}`);
        }
      } catch (stringifyErr) {
        describeImageLogger.error(
          `[${requestId}] Failed to serialize error object: ${String(stringifyErr)}`
        );
      }

      const { statusCode, userMessage } = mapDescribeImageError(errMessage);
      const response: DescribeImageErrorResponse = {
        success: false,
        error: `${userMessage} (requestId: ${requestId})`,
        requestId,
      };
      res.status(statusCode).json(response);
    }
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createContextRoutes(settingsService?: SettingsService): Router {
  const router = Router();

  router.post('/describe-image', createDescribeImageHandler(settingsService));
  router.post('/describe-file', createDescribeFileHandler(settingsService));

  return router;
}

/**
 * POST /auth-gcp endpoint - Authenticate GCP/Vertex AI
 */

import type { Request, Response } from 'express';
import { logError, getErrorMessage } from '../common.js';
import * as fs from 'fs';
import * as path from 'path';

export function createAuthGcpHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Remove the disconnected marker file to reconnect the app to GCP
      const markerPath = path.join(process.cwd(), '.dmaker', '.gcp-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      // Check if GCP is already authenticated
      const hasCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const hasProject = !!process.env.GOOGLE_CLOUD_PROJECT;

      if (hasCredentials || hasProject) {
        res.json({
          success: true,
          message: 'GCP Vertex AI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        res.json({
          success: true,
          message:
            'GCP Vertex AI is now linked with the app. Please set GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth GCP failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link GCP Vertex AI with the app',
      });
    }
  };
}

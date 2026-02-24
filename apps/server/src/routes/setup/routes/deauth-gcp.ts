import type { Request, Response } from 'express';
import { logError, getErrorMessage } from '../common.js';
import * as fs from 'fs';
import * as path from 'path';

export function createDeauthGcpHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const dmakerDir = path.join(process.cwd(), '.dmaker');
      const markerPath = path.join(dmakerDir, '.gcp-disconnected');

      if (!fs.existsSync(dmakerDir)) {
        fs.mkdirSync(dmakerDir, { recursive: true });
      }

      fs.writeFileSync(
        markerPath,
        JSON.stringify({
          disconnectedAt: new Date().toISOString(),
          message: 'GCP Vertex AI is disconnected from the app',
        })
      );

      res.json({
        success: true,
        message: 'GCP Vertex AI is now disconnected from the app',
      });
    } catch (error) {
      logError(error, 'Deauth GCP failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to disconnect GCP Vertex AI from the app',
      });
    }
  };
}

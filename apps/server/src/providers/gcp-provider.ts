/**
 * GCP Provider - Executes queries using Google Cloud Vertex AI
 *
 * Provides access to Gemini models via the Vertex AI platform.
 * Requires the @google-cloud/vertexai SDK and GCP project configuration.
 */

import { BaseProvider } from './base-provider.js';
import { createLogger } from '@dmaker/utils';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from '@dmaker/types';

const logger = createLogger('GcpProvider');

export class GcpProvider extends BaseProvider {
  getName(): string {
    return 'gcp';
  }

  /**
   * Execute a query using Vertex AI
   *
   * Currently a stub. Full implementation requires the @google-cloud/vertexai SDK.
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    logger.error('executeQuery() called but Vertex AI SDK is not available');

    throw new Error(
      'GCP Vertex AI execution requires the @google-cloud/vertexai SDK. Please install it and configure your GCP project.'
    );

    // Unreachable, but required to satisfy the AsyncGenerator return type
    yield undefined as never;
  }

  /**
   * Detect GCP Vertex AI configuration via environment variables
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const hasCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const hasProject = !!process.env.GOOGLE_CLOUD_PROJECT;
    const authenticated = hasCredentials || hasProject;

    logger.info('detectInstallation() checking GCP environment', {
      hasCredentials,
      hasProject,
    });

    const status: InstallationStatus = {
      installed: authenticated,
      method: 'sdk',
      hasApiKey: hasCredentials,
      authenticated,
    };

    return status;
  }

  /**
   * Get available Gemini models on Vertex AI
   */
  getAvailableModels(): ModelDefinition[] {
    const models = [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        modelString: 'gemini-2.5-pro',
        provider: 'gcp',
        description: 'Most capable Gemini model with advanced reasoning',
        contextWindow: 1000000,
        maxOutputTokens: 65536,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        modelString: 'gemini-2.5-flash',
        provider: 'gcp',
        description: 'Fast and efficient with strong capabilities',
        contextWindow: 1000000,
        maxOutputTokens: 65536,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        modelString: 'gemini-2.0-flash',
        provider: 'gcp',
        description: 'Lightweight model optimized for speed',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        modelString: 'gemini-1.5-pro',
        provider: 'gcp',
        description: 'Balanced performance with long context support',
        contextWindow: 2000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        modelString: 'gemini-1.5-flash',
        provider: 'gcp',
        description: 'Fastest Gemini model for high-throughput tasks',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ] satisfies ModelDefinition[];

    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision'];
    return supportedFeatures.includes(feature);
  }
}

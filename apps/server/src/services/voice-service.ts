/**
 * Voice Service - Manages voice mode sessions and AI integration
 *
 * Provides session management for voice interactions, including:
 * - Creating and managing voice sessions
 * - Processing voice commands via AI
 * - Emitting events for real-time UI updates
 * - Coordinating with settings service for voice configuration
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type {
  VoiceSession,
  VoiceSessionStatus,
  VoiceMessage,
  VoiceSettings,
  VoiceCommandResult,
  CreateVoiceSessionParams,
  ProcessVoiceCommandRequest,
  ProcessVoiceCommandResponse,
  VoiceSessionStatusResponse,
  VoiceErrorCode,
} from '@automaker/types';
import { DEFAULT_VOICE_SETTINGS } from '@automaker/types';
import { createLogger, isAbortError } from '@automaker/utils';
import type { SettingsService } from './settings-service.js';
import { validateWorkingDirectory } from '../lib/sdk-options.js';
import type { FeatureLoader } from './feature-loader.js';
import { VoiceCommandInterpreter, type InterpreterOptions } from './voice-command-interpreter.js';

const logger = createLogger('VoiceService');

/**
 * Active voice session state (in-memory)
 */
interface ActiveVoiceSession {
  session: VoiceSession;
  isProcessing: boolean;
  abortController: AbortController | null;
}

/**
 * Voice data directory structure:
 * {dataDir}/voice-sessions/
 *   {sessionId}.json - Session data with messages
 */

export class VoiceService {
  private activeSessions = new Map<string, ActiveVoiceSession>();
  private stateDir: string;
  private events: EventEmitter;
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private commandInterpreter: VoiceCommandInterpreter;

  /**
   * Create a new VoiceService instance
   *
   * @param dataDir - Absolute path to data directory (e.g., ~/.automaker)
   * @param events - Event emitter for broadcasting voice events
   * @param settingsService - Optional settings service for loading voice configuration
   * @param featureLoader - Optional feature loader for voice commands that interact with features
   */
  constructor(
    dataDir: string,
    events: EventEmitter,
    settingsService?: SettingsService,
    featureLoader?: FeatureLoader
  ) {
    this.stateDir = path.join(dataDir, 'voice-sessions');
    this.events = events;
    this.settingsService = settingsService ?? null;
    this.featureLoader = featureLoader ?? null;
    this.commandInterpreter = new VoiceCommandInterpreter();
  }

  /**
   * Initialize the voice service
   * Creates necessary directories for session storage
   */
  async initialize(): Promise<void> {
    await secureFs.mkdir(this.stateDir, { recursive: true });
    logger.info('Voice service initialized');
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Start a new voice session
   *
   * Creates a new session associated with a project path and optional settings.
   * Emits 'voice:session-started' event on success.
   *
   * @param params - Session creation parameters
   * @returns The created voice session
   */
  async startSession(params: CreateVoiceSessionParams): Promise<VoiceSession> {
    const { projectPath, settings: settingsOverride } = params;

    // Validate project path
    validateWorkingDirectory(projectPath);

    // Load voice settings (merge defaults, global, project, and override)
    const voiceSettings = await this.loadVoiceSettings(projectPath, settingsOverride);

    // Generate session ID
    const sessionId = this.generateId('voice');
    const now = new Date().toISOString();

    // Create session object
    const session: VoiceSession = {
      id: sessionId,
      projectPath,
      status: 'idle',
      messages: [],
      createdAt: now,
      updatedAt: now,
      settings: voiceSettings,
    };

    // Create active session state
    const activeSession: ActiveVoiceSession = {
      session,
      isProcessing: false,
      abortController: null,
    };

    // Store in memory
    this.activeSessions.set(sessionId, activeSession);

    // Persist to disk
    await this.saveSession(session);

    // Emit session started event
    this.emitVoiceEvent('voice:session-started', {
      sessionId,
      projectPath,
      timestamp: now,
    });

    logger.info(`Voice session started: ${sessionId} for project: ${projectPath}`);

    return session;
  }

  /**
   * Get an existing voice session
   *
   * Retrieves session from memory or loads from disk if not active.
   *
   * @param sessionId - The session ID to retrieve
   * @returns The voice session or null if not found
   */
  async getSession(sessionId: string): Promise<VoiceSession | null> {
    // Check memory first
    const activeSession = this.activeSessions.get(sessionId);
    if (activeSession) {
      return activeSession.session;
    }

    // Try loading from disk
    const session = await this.loadSessionFromDisk(sessionId);
    if (session) {
      // Restore to memory as inactive
      this.activeSessions.set(sessionId, {
        session,
        isProcessing: false,
        abortController: null,
      });
    }

    return session;
  }

  /**
   * Get session status information
   *
   * @param sessionId - The session ID to check
   * @returns Status response or null if session not found
   */
  async getSessionStatus(sessionId: string): Promise<VoiceSessionStatusResponse | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const activeSession = this.activeSessions.get(sessionId);
    const createdAt = new Date(session.createdAt).getTime();
    const now = Date.now();

    return {
      sessionId: session.id,
      active: !!activeSession,
      status: session.status,
      messageCount: session.messages.length,
      durationMs: now - createdAt,
      error: session.error,
    };
  }

  /**
   * End a voice session
   *
   * Stops any active processing and marks the session as ended.
   * Emits 'voice:session-ended' event.
   *
   * @param sessionId - The session ID to end
   * @returns Success status
   */
  async endSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return { success: false, error: 'Session not found' };
    }

    // Abort any ongoing processing
    if (activeSession.abortController) {
      activeSession.abortController.abort();
      activeSession.abortController = null;
    }

    // Update session status
    activeSession.session.status = 'idle';
    activeSession.session.updatedAt = new Date().toISOString();
    activeSession.isProcessing = false;

    // Persist final state
    await this.saveSession(activeSession.session);

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    // Emit session ended event
    this.emitVoiceEvent('voice:session-ended', {
      sessionId,
      projectPath: activeSession.session.projectPath,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Voice session ended: ${sessionId}`);

    return { success: true };
  }

  /**
   * Update session status
   *
   * Used to update the session status (e.g., recording, processing, etc.)
   *
   * @param sessionId - The session ID to update
   * @param status - The new status
   * @returns Success status
   */
  async updateSessionStatus(
    sessionId: string,
    status: VoiceSessionStatus
  ): Promise<{ success: boolean; error?: string }> {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return { success: false, error: 'Session not found' };
    }

    activeSession.session.status = status;
    activeSession.session.updatedAt = new Date().toISOString();

    // Emit appropriate event based on status
    const eventType = this.getEventTypeForStatus(status);
    if (eventType) {
      this.emitVoiceEvent(eventType, {
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }

    return { success: true };
  }

  // ============================================================================
  // Command Processing
  // ============================================================================

  /**
   * Process a voice command
   *
   * Takes transcribed text and processes it through the AI to generate a response.
   * Handles command interpretation and execution.
   *
   * @param request - The voice command request
   * @returns The processed response
   */
  async processCommand(request: ProcessVoiceCommandRequest): Promise<ProcessVoiceCommandResponse> {
    const { sessionId, text, audioDurationMs, confidence } = request;

    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (activeSession.isProcessing) {
      throw new Error('Session is already processing a command');
    }

    // Mark as processing
    activeSession.isProcessing = true;
    activeSession.abortController = new AbortController();
    activeSession.session.status = 'responding';
    activeSession.session.updatedAt = new Date().toISOString();

    const now = new Date().toISOString();

    // Create user message
    const userMessage: VoiceMessage = {
      id: this.generateId('msg'),
      role: 'user',
      content: text,
      timestamp: now,
      confidence,
      audioDurationMs,
    };

    // Add user message to session
    activeSession.session.messages.push(userMessage);

    // Emit command received event
    this.emitVoiceEvent('voice:command-received', {
      sessionId,
      timestamp: now,
      command: text,
    });

    try {
      // Process through AI
      const result = await this.executeAICommand(activeSession, text);

      // Create assistant message
      const assistantMessage: VoiceMessage = {
        id: this.generateId('msg'),
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString(),
        executedCommand: result.success && !!result.commandName,
        commandName: result.commandName,
      };

      // Add to session
      activeSession.session.messages.push(assistantMessage);
      activeSession.session.status = 'idle';
      activeSession.session.updatedAt = new Date().toISOString();

      // Save session
      await this.saveSession(activeSession.session);

      // Emit response completed event
      this.emitVoiceEvent('voice:response-completed', {
        sessionId,
        timestamp: new Date().toISOString(),
        content: result.response,
        done: true,
      });

      // Emit command executed event if a command was run
      if (result.commandName) {
        this.emitVoiceEvent('voice:command-executed', {
          sessionId,
          timestamp: new Date().toISOString(),
          command: result.commandName,
          result,
        });
      }

      return {
        messageId: assistantMessage.id,
        response: result.response,
        commandExecuted: result.success && !!result.commandName,
        commandResult: result.commandName ? result : undefined,
      };
    } catch (error) {
      if (isAbortError(error)) {
        // Handle abort gracefully
        activeSession.session.status = 'idle';
        activeSession.session.updatedAt = new Date().toISOString();
        await this.saveSession(activeSession.session);

        return {
          messageId: this.generateId('msg'),
          response: 'Command processing was cancelled.',
          commandExecuted: false,
        };
      }

      // Handle error
      const errorMessage = (error as Error).message;
      logger.error('Error processing voice command:', error);

      // Update session with error
      activeSession.session.status = 'error';
      activeSession.session.error = errorMessage;
      activeSession.session.updatedAt = new Date().toISOString();

      // Create error message
      const errorAssistantMessage: VoiceMessage = {
        id: this.generateId('msg'),
        role: 'assistant',
        content: `I encountered an error processing your request: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      };
      activeSession.session.messages.push(errorAssistantMessage);

      await this.saveSession(activeSession.session);

      // Emit error event
      this.emitVoiceEvent('voice:error', {
        sessionId,
        timestamp: new Date().toISOString(),
        code: 'command_execution_failed' as VoiceErrorCode,
        message: errorMessage,
      });

      throw error;
    } finally {
      activeSession.isProcessing = false;
      activeSession.abortController = null;
    }
  }

  /**
   * Stop any ongoing command processing
   *
   * @param sessionId - The session ID to stop processing for
   * @returns Success status
   */
  async stopProcessing(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return { success: false, error: 'Session not found' };
    }

    if (activeSession.abortController) {
      activeSession.abortController.abort();
      activeSession.abortController = null;
      activeSession.isProcessing = false;
      activeSession.session.status = 'idle';
      activeSession.session.updatedAt = new Date().toISOString();

      await this.saveSession(activeSession.session);

      logger.info(`Stopped processing for session: ${sessionId}`);
    }

    return { success: true };
  }

  // ============================================================================
  // AI Integration
  // ============================================================================

  /**
   * Execute a voice command through the AI command interpreter
   *
   * Uses the VoiceCommandInterpreter to understand the user's intent,
   * map it to the appropriate voice script, and execute the command.
   *
   * @param activeSession - The active voice session
   * @param command - The user's voice command text
   * @returns The command result
   */
  private async executeAICommand(
    activeSession: ActiveVoiceSession,
    command: string
  ): Promise<VoiceCommandResult> {
    const { session } = activeSession;
    const projectPath = session.projectPath;

    // Emit response started event
    this.emitVoiceEvent('voice:response-started', {
      sessionId: session.id,
      timestamp: new Date().toISOString(),
    });

    // Build conversation history from previous messages
    const conversationHistory = session.messages.slice(-10).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Check if this is a simple confirmation/cancellation for a pending destructive action
    if (this.commandInterpreter.isConfirmation(command)) {
      // Handle confirmation - this would be used with a pending action system
      // For now, just acknowledge the confirmation
      return {
        success: true,
        response: 'Understood, proceeding.',
        commandName: 'confirmation',
      };
    }

    if (this.commandInterpreter.isCancellation(command)) {
      return {
        success: true,
        response: 'Cancelled.',
        commandName: 'cancellation',
      };
    }

    // If we don't have a feature loader, we can only interpret but not execute commands
    if (!this.featureLoader) {
      logger.warn('Feature loader not available, falling back to interpretation only');

      // Just interpret the command without executing
      const interpreterOptions: InterpreterOptions = {
        projectPath,
        sessionId: session.id,
        conversationHistory,
        confirmDestructiveCommands: session.settings.confirmDestructiveCommands,
      };

      const parsed = await this.commandInterpreter.interpret(command, interpreterOptions);

      return {
        success: true,
        response: parsed.response,
        commandName: parsed.commandName ?? undefined,
      };
    }

    // Build the voice script context for command execution
    const scriptContext = {
      projectPath,
      sessionId: session.id,
      featureLoader: this.featureLoader,
    };

    // Build interpreter options
    const interpreterOptions: InterpreterOptions = {
      projectPath,
      sessionId: session.id,
      conversationHistory,
      confirmDestructiveCommands: session.settings.confirmDestructiveCommands,
    };

    // Use the command interpreter to interpret and execute the command
    const result = await this.commandInterpreter.interpretAndExecute(
      command,
      scriptContext,
      interpreterOptions
    );

    // Emit streaming update with the response
    this.emitVoiceEvent('voice:response-started', {
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      content: result.parsed.response,
    });

    // Return the result
    if (!result.success) {
      return {
        success: false,
        response: result.error ?? 'Command execution failed',
        commandName: result.parsed.commandName ?? undefined,
        error: result.error,
      };
    }

    // If a command was executed, use its result
    if (result.executionResult) {
      return result.executionResult;
    }

    // Otherwise return the interpreted response (for help requests, conversations, etc.)
    return {
      success: true,
      response: result.parsed.response,
      commandName: result.parsed.commandName ?? undefined,
      data: result.parsed.isHelpRequest ? { isHelpRequest: true } : undefined,
    };
  }

  /**
   * Set the feature loader for command execution
   *
   * @param featureLoader - The feature loader instance
   */
  setFeatureLoader(featureLoader: FeatureLoader): void {
    this.featureLoader = featureLoader;
  }

  // ============================================================================
  // Settings & Configuration
  // ============================================================================

  /**
   * Load voice settings with proper precedence
   *
   * Merges settings from: defaults < global < project < override
   *
   * @param projectPath - Project path for loading project-specific settings
   * @param settingsOverride - Optional settings to override
   * @returns Merged voice settings
   */
  private async loadVoiceSettings(
    projectPath: string,
    settingsOverride?: Partial<VoiceSettings>
  ): Promise<VoiceSettings> {
    let settings: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS };

    if (this.settingsService) {
      try {
        // Load global settings
        const globalSettings = await this.settingsService.getGlobalSettings();
        if (globalSettings.voiceSettings) {
          settings = { ...settings, ...globalSettings.voiceSettings };
        }

        // Load project settings (override global)
        const projectSettings = await this.settingsService.getProjectSettings(projectPath);
        if (projectSettings.voiceSettings) {
          settings = { ...settings, ...projectSettings.voiceSettings };
        }
      } catch (error) {
        logger.warn('Failed to load voice settings, using defaults:', error);
      }
    }

    // Apply any explicit overrides
    if (settingsOverride) {
      settings = { ...settings, ...settingsOverride };
    }

    return settings;
  }

  /**
   * Update voice settings for a session
   *
   * @param sessionId - The session ID to update
   * @param settings - Partial settings to merge
   * @returns Success status
   */
  async updateSessionSettings(
    sessionId: string,
    settings: Partial<VoiceSettings>
  ): Promise<{ success: boolean; error?: string }> {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return { success: false, error: 'Session not found' };
    }

    activeSession.session.settings = {
      ...activeSession.session.settings,
      ...settings,
    };
    activeSession.session.updatedAt = new Date().toISOString();

    await this.saveSession(activeSession.session);

    return { success: true };
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * Save a session to disk
   *
   * @param session - The session to save
   */
  private async saveSession(session: VoiceSession): Promise<void> {
    const sessionFile = path.join(this.stateDir, `${session.id}.json`);
    try {
      await secureFs.writeFile(sessionFile, JSON.stringify(session, null, 2), 'utf-8');
    } catch (error) {
      logger.error(`Failed to save voice session ${session.id}:`, error);
    }
  }

  /**
   * Load a session from disk
   *
   * @param sessionId - The session ID to load
   * @returns The loaded session or null
   */
  private async loadSessionFromDisk(sessionId: string): Promise<VoiceSession | null> {
    const sessionFile = path.join(this.stateDir, `${sessionId}.json`);
    try {
      const content = (await secureFs.readFile(sessionFile, 'utf-8')) as string;
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * List all voice sessions for a project
   *
   * @param projectPath - The project path to filter by
   * @returns Array of session IDs
   */
  async listSessions(projectPath?: string): Promise<VoiceSession[]> {
    const sessions: VoiceSession[] = [];

    try {
      const entries = await secureFs.readdir(this.stateDir);
      for (const entry of entries as string[]) {
        if (entry.endsWith('.json')) {
          const sessionId = entry.replace('.json', '');
          const session = await this.loadSessionFromDisk(sessionId);
          if (session) {
            // Filter by project path if provided
            if (!projectPath || session.projectPath === projectPath) {
              sessions.push(session);
            }
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }

    // Sort by updatedAt descending
    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Delete a session from disk
   *
   * @param sessionId - The session ID to delete
   * @returns Success status
   */
  async deleteSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    // Remove from memory
    this.activeSessions.delete(sessionId);

    // Remove from disk
    const sessionFile = path.join(this.stateDir, `${sessionId}.json`);
    try {
      await secureFs.unlink(sessionFile);
      logger.info(`Deleted voice session: ${sessionId}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'Session not found'
          : (error as Error).message;
      return { success: false, error: errorMessage };
    }
  }

  // ============================================================================
  // Event Helpers
  // ============================================================================

  /**
   * Emit a voice event through the event system
   *
   * @param type - The event type
   * @param payload - The event payload
   */
  private emitVoiceEvent(
    type:
      | 'voice:session-started'
      | 'voice:session-ended'
      | 'voice:recording-started'
      | 'voice:recording-stopped'
      | 'voice:transcription-started'
      | 'voice:transcription-completed'
      | 'voice:command-received'
      | 'voice:command-executed'
      | 'voice:response-started'
      | 'voice:response-completed'
      | 'voice:speaking-started'
      | 'voice:speaking-completed'
      | 'voice:error',
    payload: Record<string, unknown>
  ): void {
    this.events.emit(type, payload);
  }

  /**
   * Get the appropriate event type for a status change
   *
   * @param status - The new session status
   * @returns The event type or undefined
   */
  private getEventTypeForStatus(
    status: VoiceSessionStatus
  ):
    | 'voice:recording-started'
    | 'voice:recording-stopped'
    | 'voice:transcription-started'
    | 'voice:transcription-completed'
    | 'voice:response-started'
    | 'voice:speaking-started'
    | 'voice:speaking-completed'
    | undefined {
    switch (status) {
      case 'recording':
        return 'voice:recording-started';
      case 'processing':
        return 'voice:recording-stopped';
      case 'transcribing':
        return 'voice:transcription-started';
      case 'responding':
        return 'voice:response-started';
      case 'speaking':
        return 'voice:speaking-started';
      case 'idle':
        // Could be end of speaking, but we don't know for sure
        return undefined;
      default:
        return undefined;
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Generate a unique ID with a prefix
   *
   * @param prefix - The ID prefix
   * @returns A unique ID string
   */
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if a session is currently processing
   *
   * @param sessionId - The session ID to check
   * @returns True if processing
   */
  isSessionProcessing(sessionId: string): boolean {
    const activeSession = this.activeSessions.get(sessionId);
    return activeSession?.isProcessing ?? false;
  }

  /**
   * Get the number of active sessions
   *
   * @returns Count of active sessions
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}

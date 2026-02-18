/**
 * Voice Mode Types - Shared types for voice interaction feature
 *
 * Defines the structure for voice settings, sessions, and events
 * that are used by both the server (for voice processing) and the
 * UI (for state management and audio capture).
 */

// ============================================================================
// Voice Settings Types
// ============================================================================

/**
 * VoiceInputMode - How voice input is triggered
 *
 * - push_to_talk: User holds button to record (default, most reliable)
 * - toggle: User clicks once to start/stop recording
 * - continuous: Voice activity detection (VAD) - experimental
 */
export type VoiceInputMode = 'push_to_talk' | 'toggle' | 'continuous';

/**
 * VoiceOutputMode - How AI responses are delivered
 *
 * - text_only: Display text response only (default)
 * - text_and_speech: Display text and synthesize speech
 * - speech_only: Synthesize speech without showing text
 */
export type VoiceOutputMode = 'text_only' | 'text_and_speech' | 'speech_only';

/**
 * VoiceSettings - User preferences for voice interaction
 *
 * Configures microphone selection, noise gate, input/output modes,
 * and other voice-related preferences.
 */
export interface VoiceSettings {
  /** Whether voice mode is enabled for this project/globally */
  enabled: boolean;

  /** Preferred microphone device ID (null = system default) */
  microphoneDeviceId: string | null;

  /** Noise gate threshold in dB (-60 to 0, lower = more sensitive) */
  noiseGateThreshold: number;

  /** How voice input is triggered */
  inputMode: VoiceInputMode;

  /** How AI responses are delivered */
  outputMode: VoiceOutputMode;

  /** Enable text-to-speech for AI responses */
  enableTextToSpeech: boolean;

  /** TTS voice identifier (browser/system dependent) */
  ttsVoice: string | null;

  /** TTS speech rate (0.5 to 2.0, 1.0 = normal) */
  ttsRate: number;

  /** Auto-stop recording after silence (in milliseconds, 0 = disabled) */
  silenceTimeoutMs: number;

  /** Maximum recording duration (in milliseconds, default 30000 = 30s) */
  maxRecordingDurationMs: number;

  /** Show live transcription while speaking */
  showLiveTranscription: boolean;

  /** Require confirmation for destructive voice commands */
  confirmDestructiveCommands: boolean;
}

/**
 * Default voice settings
 */
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  microphoneDeviceId: null,
  noiseGateThreshold: -40,
  inputMode: 'push_to_talk',
  outputMode: 'text_and_speech',
  enableTextToSpeech: true,
  ttsVoice: null,
  ttsRate: 1.0,
  silenceTimeoutMs: 2000,
  maxRecordingDurationMs: 30000,
  showLiveTranscription: true,
  confirmDestructiveCommands: true,
};

// ============================================================================
// Voice Session Types
// ============================================================================

/**
 * VoiceSessionStatus - Current state of a voice session
 *
 * - idle: Session active but not recording or processing
 * - recording: Actively capturing audio from microphone
 * - processing: Audio captured, waiting for transcription
 * - transcribing: Transcription in progress
 * - responding: AI generating response
 * - speaking: TTS playing response
 * - error: Session encountered an error
 */
export type VoiceSessionStatus =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'transcribing'
  | 'responding'
  | 'speaking'
  | 'error';

/**
 * VoiceMessage - A single message in the voice conversation
 */
export interface VoiceMessage {
  /** Unique message identifier */
  id: string;

  /** Who sent the message */
  role: 'user' | 'assistant';

  /** Transcribed or generated text content */
  content: string;

  /** Timestamp when message was created */
  timestamp: string;

  /** Transcription confidence score (0-1, user messages only) */
  confidence?: number;

  /** Duration of the audio in milliseconds (user messages only) */
  audioDurationMs?: number;

  /** Whether this message triggered a command execution */
  executedCommand?: boolean;

  /** Name of the command that was executed (if any) */
  commandName?: string;
}

/**
 * VoiceSession - An active voice interaction session
 *
 * Tracks the state of a voice conversation including messages,
 * session status, and any errors.
 */
export interface VoiceSession {
  /** Unique session identifier */
  id: string;

  /** Project path this session is associated with */
  projectPath: string;

  /** Current session status */
  status: VoiceSessionStatus;

  /** Messages exchanged in this session */
  messages: VoiceMessage[];

  /** Session creation timestamp */
  createdAt: string;

  /** Last activity timestamp */
  updatedAt: string;

  /** Error message if status is 'error' */
  error?: string;

  /** Currently active voice settings for this session */
  settings: VoiceSettings;
}

/**
 * CreateVoiceSessionParams - Parameters for starting a new voice session
 */
export interface CreateVoiceSessionParams {
  /** Project path to associate with the session */
  projectPath: string;

  /** Optional settings override for this session */
  settings?: Partial<VoiceSettings>;
}

/**
 * VoiceCommandResult - Result of executing a voice command
 */
export interface VoiceCommandResult {
  /** Whether the command was successfully executed */
  success: boolean;

  /** Response message to display/speak */
  response: string;

  /** Name of the command that was executed */
  commandName?: string;

  /** Any data returned by the command */
  data?: unknown;

  /** Error message if command failed */
  error?: string;
}

// ============================================================================
// Voice Event Types
// ============================================================================

/**
 * VoiceEventType - Types of events emitted during voice interactions
 */
export type VoiceEventType =
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
  | 'voice:error';

/**
 * VoiceSessionEvent - Event for session lifecycle changes
 */
export interface VoiceSessionEvent {
  type: 'voice:session-started' | 'voice:session-ended';
  sessionId: string;
  projectPath: string;
  timestamp: string;
}

/**
 * VoiceRecordingEvent - Event for recording state changes
 */
export interface VoiceRecordingEvent {
  type: 'voice:recording-started' | 'voice:recording-stopped';
  sessionId: string;
  timestamp: string;
  /** Duration in milliseconds (only for recording-stopped) */
  durationMs?: number;
}

/**
 * VoiceTranscriptionEvent - Event for transcription updates
 */
export interface VoiceTranscriptionEvent {
  type: 'voice:transcription-started' | 'voice:transcription-completed';
  sessionId: string;
  timestamp: string;
  /** Transcribed text (only for transcription-completed) */
  text?: string;
  /** Confidence score 0-1 (only for transcription-completed) */
  confidence?: number;
}

/**
 * VoiceCommandEvent - Event for voice command processing
 */
export interface VoiceCommandEvent {
  type: 'voice:command-received' | 'voice:command-executed';
  sessionId: string;
  timestamp: string;
  /** The interpreted command */
  command?: string;
  /** Parameters extracted from the command */
  parameters?: Record<string, unknown>;
  /** Result of command execution (only for command-executed) */
  result?: VoiceCommandResult;
}

/**
 * VoiceResponseEvent - Event for AI response generation
 */
export interface VoiceResponseEvent {
  type: 'voice:response-started' | 'voice:response-completed';
  sessionId: string;
  timestamp: string;
  /** Partial response content (streaming) */
  content?: string;
  /** Whether response generation is complete */
  done?: boolean;
}

/**
 * VoiceSpeakingEvent - Event for text-to-speech playback
 */
export interface VoiceSpeakingEvent {
  type: 'voice:speaking-started' | 'voice:speaking-completed';
  sessionId: string;
  timestamp: string;
}

/**
 * VoiceErrorEvent - Event for voice-related errors
 */
export interface VoiceErrorEvent {
  type: 'voice:error';
  sessionId: string;
  timestamp: string;
  /** Error code for programmatic handling */
  code: VoiceErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: unknown;
}

/**
 * VoiceErrorCode - Specific error codes for voice operations
 */
export type VoiceErrorCode =
  | 'microphone_not_found'
  | 'microphone_permission_denied'
  | 'recording_failed'
  | 'transcription_failed'
  | 'command_parse_failed'
  | 'command_execution_failed'
  | 'tts_failed'
  | 'session_expired'
  | 'network_error'
  | 'unknown_error';

/**
 * VoiceEvent - Union type of all voice events
 */
export type VoiceEvent =
  | VoiceSessionEvent
  | VoiceRecordingEvent
  | VoiceTranscriptionEvent
  | VoiceCommandEvent
  | VoiceResponseEvent
  | VoiceSpeakingEvent
  | VoiceErrorEvent;

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * ProcessVoiceCommandRequest - Request to process a voice command
 */
export interface ProcessVoiceCommandRequest {
  /** Session ID for context */
  sessionId: string;

  /** Transcribed text from user */
  text: string;

  /** Original audio duration in ms (for metrics) */
  audioDurationMs?: number;

  /** Transcription confidence score */
  confidence?: number;
}

/**
 * ProcessVoiceCommandResponse - Response from processing a voice command
 */
export interface ProcessVoiceCommandResponse {
  /** Unique message ID for the response */
  messageId: string;

  /** AI response text */
  response: string;

  /** Whether a command was executed */
  commandExecuted: boolean;

  /** Details about the executed command */
  commandResult?: VoiceCommandResult;
}

/**
 * VoiceSessionStatusResponse - Status information about a voice session
 */
export interface VoiceSessionStatusResponse {
  /** Session ID */
  sessionId: string;

  /** Whether session is active */
  active: boolean;

  /** Current session status */
  status: VoiceSessionStatus;

  /** Number of messages in session */
  messageCount: number;

  /** Session duration in milliseconds */
  durationMs: number;

  /** Any current error */
  error?: string;
}

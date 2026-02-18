import { useState, useCallback, useRef, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('AudioRecorder');

/**
 * Audio recording state
 */
export interface AudioRecorderState {
  /** Whether recording is currently in progress */
  isRecording: boolean;
  /** Whether audio is being processed (after recording) */
  isProcessing: boolean;
  /** Current audio level (0-1) for visualization */
  audioLevel: number;
  /** Duration of current recording in milliseconds */
  recordingDurationMs: number;
  /** Any error that occurred */
  error: string | null;
  /** List of available microphone devices */
  availableDevices: MediaDeviceInfo[];
  /** Currently selected device ID */
  selectedDeviceId: string | null;
}

/**
 * Audio recorder result
 */
export interface AudioRecorderResult {
  /** The recorded audio blob */
  audioBlob: Blob;
  /** Duration in milliseconds */
  durationMs: number;
  /** Audio format (e.g., 'audio/webm') */
  mimeType: string;
}

/**
 * Options for the audio recorder hook
 */
export interface AudioRecorderOptions {
  /** Noise gate threshold in dB (-60 to 0) */
  noiseGateThreshold?: number;
  /** Maximum recording duration in ms (default 30000) */
  maxDurationMs?: number;
  /** Auto-stop after silence duration in ms (0 = disabled) */
  silenceTimeoutMs?: number;
  /** Preferred microphone device ID */
  deviceId?: string | null;
  /** Callback when recording starts */
  onRecordingStart?: () => void;
  /** Callback when recording stops with result */
  onRecordingStop?: (result: AudioRecorderResult) => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Callback for audio level updates */
  onAudioLevel?: (level: number) => void;
}

// Preferred MIME types in order of preference
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

/**
 * Get the best supported MIME type for recording
 */
function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return 'audio/webm'; // fallback
}

/**
 * Hook for recording audio from the microphone
 *
 * Provides functionality for:
 * - Starting/stopping recording
 * - Real-time audio level monitoring
 * - Device selection
 * - Noise gate filtering
 * - Auto-stop after silence or max duration
 */
export function useAudioRecorder(options: AudioRecorderOptions = {}) {
  const {
    noiseGateThreshold = -40,
    maxDurationMs = 30000,
    silenceTimeoutMs = 0,
    deviceId = null,
    onRecordingStart,
    onRecordingStop,
    onError,
    onAudioLevel,
  } = options;

  // State
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isProcessing: false,
    audioLevel: 0,
    recordingDurationMs: 0,
    error: null,
    availableDevices: [],
    selectedDeviceId: deviceId,
  });

  // Refs for cleanup
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Load available audio devices
   */
  const loadDevices = useCallback(async () => {
    try {
      // Need to get permission first to see device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter((d) => d.kind === 'audioinput');

      setState((s) => ({
        ...s,
        availableDevices: audioDevices,
        error: null,
      }));

      return audioDevices;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access microphone';
      logger.error('Failed to load audio devices:', error);
      setState((s) => ({ ...s, error: message }));
      onError?.(message);
      return [];
    }
  }, [onError]);

  /**
   * Convert dB threshold to linear amplitude (0-1)
   */
  const dbToLinear = useCallback((db: number): number => {
    return Math.pow(10, db / 20);
  }, []);

  /**
   * Update audio level from analyser
   */
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate RMS level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = dataArray[i] / 255;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);

    setState((s) => ({ ...s, audioLevel: rms }));
    onAudioLevel?.(rms);

    // Check for silence if timeout is enabled
    if (silenceTimeoutMs > 0) {
      const threshold = dbToLinear(noiseGateThreshold);
      if (rms < threshold) {
        if (!silenceTimeoutRef.current) {
          silenceTimeoutRef.current = setTimeout(() => {
            logger.info('Silence detected, stopping recording');
            stopRecording();
          }, silenceTimeoutMs);
        }
      } else {
        // Reset silence timeout if audio detected
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, [noiseGateThreshold, silenceTimeoutMs, dbToLinear, onAudioLevel]);

  /**
   * Cleanup all resources
   */
  const cleanup = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear intervals/timeouts
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
    }
    mediaRecorderRef.current = null;

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // Ignore errors when closing
      }
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    chunksRef.current = [];
  }, []);

  /**
   * Start recording
   */
  const startRecording = useCallback(async () => {
    // Cleanup any existing recording
    cleanup();

    try {
      // Get media stream
      const constraints: MediaStreamConstraints = {
        audio: state.selectedDeviceId ? { deviceId: { exact: state.selectedDeviceId } } : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      // Setup audio context for level monitoring
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Setup media recorder
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const durationMs = Date.now() - startTimeRef.current;
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });

        setState((s) => ({
          ...s,
          isRecording: false,
          isProcessing: true,
          audioLevel: 0,
        }));

        const result: AudioRecorderResult = {
          audioBlob,
          durationMs,
          mimeType,
        };

        onRecordingStop?.(result);

        setState((s) => ({
          ...s,
          isProcessing: false,
        }));
      };

      mediaRecorder.onerror = (event) => {
        const error = 'Recording error occurred';
        logger.error('MediaRecorder error:', event);
        setState((s) => ({ ...s, error, isRecording: false }));
        onError?.(error);
        cleanup();
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      startTimeRef.current = Date.now();

      setState((s) => ({
        ...s,
        isRecording: true,
        isProcessing: false,
        error: null,
        recordingDurationMs: 0,
      }));

      // Start audio level monitoring
      updateAudioLevel();

      // Start duration tracking
      durationIntervalRef.current = setInterval(() => {
        setState((s) => ({
          ...s,
          recordingDurationMs: Date.now() - startTimeRef.current,
        }));
      }, 100);

      // Set max duration timeout
      if (maxDurationMs > 0) {
        maxDurationTimeoutRef.current = setTimeout(() => {
          logger.info('Max duration reached, stopping recording');
          stopRecording();
        }, maxDurationMs);
      }

      onRecordingStart?.();
      logger.info('Recording started');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start recording';
      logger.error('Failed to start recording:', error);
      setState((s) => ({ ...s, error: message, isRecording: false }));
      onError?.(message);
      cleanup();
    }
  }, [
    state.selectedDeviceId,
    maxDurationMs,
    cleanup,
    updateAudioLevel,
    onRecordingStart,
    onRecordingStop,
    onError,
  ]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    logger.info('Stopping recording');

    // Stop timeouts/intervals
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop the media recorder (will trigger onstop)
    mediaRecorderRef.current.stop();

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  /**
   * Cancel recording without processing/sending the audio.
   * This is used when the user closes voice mode while recording -
   * the recording should be discarded, not sent for processing.
   */
  const cancelRecording = useCallback(() => {
    if (!state.isRecording) {
      return;
    }

    logger.info('Cancelling recording (discarding audio)');

    // Use cleanup to stop everything without triggering onRecordingStop
    cleanup();

    // Reset state
    setState((s) => ({
      ...s,
      isRecording: false,
      isProcessing: false,
      audioLevel: 0,
      recordingDurationMs: 0,
    }));
  }, [state.isRecording, cleanup]);

  /**
   * Select a microphone device
   */
  const selectDevice = useCallback((newDeviceId: string | null) => {
    setState((s) => ({ ...s, selectedDeviceId: newDeviceId }));
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Load devices on mount
  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Handle device changes
  useEffect(() => {
    const handleDeviceChange = () => {
      loadDevices();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [loadDevices]);

  return {
    // State
    ...state,

    // Actions
    startRecording,
    stopRecording,
    cancelRecording,
    selectDevice,
    loadDevices,
    clearError,
  };
}

export type AudioRecorderHook = ReturnType<typeof useAudioRecorder>;

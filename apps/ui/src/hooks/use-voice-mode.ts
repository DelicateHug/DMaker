import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { useAudioRecorder, type AudioRecorderResult } from './use-audio-recorder';
import { matchesShortcutWithCode, useKeyboardShortcutsConfig } from './use-keyboard-shortcuts';
import type { VoiceEvent, VoiceMessage, VoiceSession, VoiceSettings } from '@automaker/types';

const logger = createLogger('VoiceMode');

/**
 * Hook for managing voice mode interactions
 *
 * Provides functionality for:
 * - Starting/stopping voice sessions
 * - Recording and processing voice commands
 * - Managing voice conversation state
 * - Text-to-speech playback
 * - Real-time event handling
 */
export function useVoiceMode() {
  const {
    currentProject,
    voiceSettings,
    voiceSessionActive,
    voiceSession,
    voiceSessionStatus,
    voiceRecording,
    voiceProcessing,
    voiceError,
    voiceTranscript,
    voiceMessages,
    setVoiceSettings,
    updateVoiceSettings,
    setVoiceSessionActive,
    setVoiceSession,
    setVoiceSessionStatus,
    setVoiceRecording,
    setVoiceProcessing,
    setVoiceError,
    setVoiceTranscript,
    addVoiceMessage,
    clearVoiceMessages,
    startVoiceSession: storeStartSession,
    endVoiceSession: storeEndSession,
    // Voice Widget visibility state
    voiceWidgetVisible,
    toggleVoiceWidget,
    showVoiceWidget,
    hideVoiceWidget,
  } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      voiceSettings: state.voiceSettings,
      voiceSessionActive: state.voiceSessionActive,
      voiceSession: state.voiceSession,
      voiceSessionStatus: state.voiceSessionStatus,
      voiceRecording: state.voiceRecording,
      voiceProcessing: state.voiceProcessing,
      voiceError: state.voiceError,
      voiceTranscript: state.voiceTranscript,
      voiceMessages: state.voiceMessages,
      setVoiceSettings: state.setVoiceSettings,
      updateVoiceSettings: state.updateVoiceSettings,
      setVoiceSessionActive: state.setVoiceSessionActive,
      setVoiceSession: state.setVoiceSession,
      setVoiceSessionStatus: state.setVoiceSessionStatus,
      setVoiceRecording: state.setVoiceRecording,
      setVoiceProcessing: state.setVoiceProcessing,
      setVoiceError: state.setVoiceError,
      setVoiceTranscript: state.setVoiceTranscript,
      addVoiceMessage: state.addVoiceMessage,
      clearVoiceMessages: state.clearVoiceMessages,
      startVoiceSession: state.startVoiceSession,
      endVoiceSession: state.endVoiceSession,
      // Voice Widget visibility state
      voiceWidgetVisible: state.voiceWidgetVisible,
      toggleVoiceWidget: state.toggleVoiceWidget,
      showVoiceWidget: state.showVoiceWidget,
      hideVoiceWidget: state.hideVoiceWidget,
    }))
  );

  // TTS utterance ref for stopping
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const eventUnsubscribeRef = useRef<(() => void) | null>(null);

  // Audio recorder hook
  const audioRecorder = useAudioRecorder({
    noiseGateThreshold: voiceSettings.noiseGateThreshold,
    maxDurationMs: voiceSettings.maxRecordingDurationMs,
    silenceTimeoutMs: voiceSettings.silenceTimeoutMs,
    deviceId: voiceSettings.microphoneDeviceId,
    onRecordingStart: () => {
      setVoiceRecording(true);
      setVoiceSessionStatus('recording');
      setVoiceTranscript('');
    },
    onRecordingStop: async (result) => {
      setVoiceRecording(false);
      setVoiceSessionStatus('processing');
      await processAudioRecording(result);
    },
    onError: (error) => {
      setVoiceError(error);
      setVoiceRecording(false);
      setVoiceSessionStatus('error');
    },
    onAudioLevel: (_level) => {
      // Could be used for visualization
    },
  });

  /**
   * Process recorded audio - transcribe and send to server
   */
  const processAudioRecording = useCallback(
    async (result: AudioRecorderResult) => {
      if (!voiceSession) {
        setVoiceError('No active voice session');
        return;
      }

      const api = getElectronAPI();

      try {
        setVoiceSessionStatus('transcribing');

        // For now, we'll use the Web Speech API for transcription
        // In the future, this could be replaced with a server-side transcription service
        const transcribedText = await transcribeAudio(result.audioBlob);

        if (!transcribedText || transcribedText.trim() === '') {
          setVoiceError('Could not understand audio. Please try again.');
          setVoiceSessionStatus('idle');
          return;
        }

        setVoiceTranscript(transcribedText);

        // Add user message with transcribed text
        const userMessage: VoiceMessage = {
          id: `msg-${Date.now()}`,
          role: 'user',
          content: transcribedText,
          timestamp: new Date().toISOString(),
        };
        addVoiceMessage(userMessage);

        setVoiceSessionStatus('responding');
        setVoiceProcessing(true);

        // Send to server for processing
        const response = await api.voice!.processCommand(
          voiceSession.id,
          transcribedText,
          result.durationMs,
          0.9 // Web Speech API doesn't provide confidence
        );

        if (response.error) {
          throw new Error(response.error);
        }

        // Add the response message to the conversation
        if (response.response) {
          const assistantMessage: VoiceMessage = {
            id: response.messageId || `msg-${Date.now()}`,
            role: 'assistant',
            content: response.response,
            timestamp: new Date().toISOString(),
            executedCommand: response.commandExecuted,
            commandName: response.commandResult?.commandName,
          };
          addVoiceMessage(assistantMessage);

          // Speak the response if TTS is enabled
          if (voiceSettings.enableTextToSpeech && voiceSettings.outputMode !== 'text_only') {
            await speakResponse(response.response);
          }
        }

        setVoiceProcessing(false);
        setVoiceSessionStatus('idle');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process voice command';
        logger.error('Failed to process voice command:', error);
        setVoiceError(message);
        setVoiceProcessing(false);
        setVoiceSessionStatus('error');
      }
    },
    [
      voiceSession,
      voiceSettings,
      addVoiceMessage,
      setVoiceError,
      setVoiceProcessing,
      setVoiceSessionStatus,
      setVoiceTranscript,
    ]
  );

  /**
   * Transcribe audio using Web Speech API
   */
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Check if Web Speech API is available
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        // Fallback: prompt user to type their command
        reject(new Error('Speech recognition not available in this browser'));
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
      };

      recognition.onerror = (event: any) => {
        reject(new Error(event.error));
      };

      recognition.onend = () => {
        // If no result was captured
      };

      // Note: Web Speech API works directly with microphone, not with audio blobs
      // For actual implementation, we'd need a server-side transcription service
      // For now, we'll start a new recognition session
      recognition.start();

      // Auto-stop after 10 seconds if no result
      setTimeout(() => {
        try {
          recognition.stop();
        } catch (e) {
          // Already stopped
        }
      }, 10000);
    });
  }, []);

  /**
   * Speak response using Text-to-Speech
   */
  const speakResponse = useCallback(
    async (text: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in window)) {
          logger.warn('Text-to-speech not available');
          resolve();
          return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;

        // Apply settings
        utterance.rate = voiceSettings.ttsRate;

        // Select voice if specified
        if (voiceSettings.ttsVoice) {
          const voices = window.speechSynthesis.getVoices();
          const selectedVoice = voices.find((v) => v.voiceURI === voiceSettings.ttsVoice);
          if (selectedVoice) {
            utterance.voice = selectedVoice;
          }
        }

        utterance.onstart = () => {
          setVoiceSessionStatus('speaking');
        };

        utterance.onend = () => {
          setVoiceSessionStatus('idle');
          utteranceRef.current = null;
          resolve();
        };

        utterance.onerror = (event) => {
          logger.error('TTS error:', event);
          setVoiceSessionStatus('idle');
          utteranceRef.current = null;
          reject(new Error(event.error));
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [voiceSettings.ttsRate, voiceSettings.ttsVoice, setVoiceSessionStatus]
  );

  /**
   * Stop any ongoing TTS
   */
  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    if (voiceSessionStatus === 'speaking') {
      setVoiceSessionStatus('idle');
    }
  }, [voiceSessionStatus, setVoiceSessionStatus]);

  /**
   * Start a new voice session
   */
  const startSession = useCallback(async () => {
    if (!currentProject) {
      setVoiceError('No project selected');
      return null;
    }

    const api = getElectronAPI();

    try {
      setVoiceError(null);

      const response = await api.voice!.startSession(currentProject.path, voiceSettings);

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.session) {
        storeStartSession(response.session);
        logger.info('Voice session started:', response.session.id);

        // Subscribe to voice events
        subscribeToVoiceEvents();

        return response.session;
      }

      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start voice session';
      logger.error('Failed to start voice session:', error);
      setVoiceError(message);
      return null;
    }
  }, [currentProject, voiceSettings, storeStartSession, setVoiceError]);

  /**
   * End the current voice session
   *
   * @param discardRecording - If true, any ongoing recording will be discarded (not sent for processing).
   *                           This is used when closing voice mode via Alt+M or close button.
   *                           If false (default), ongoing recording will be stopped and sent for processing.
   */
  const endSession = useCallback(
    async (discardRecording = false) => {
      if (!voiceSession) {
        return;
      }

      const api = getElectronAPI();

      try {
        // Stop any ongoing recording
        if (audioRecorder.isRecording) {
          if (discardRecording) {
            // Cancel recording without sending (used when closing voice mode)
            audioRecorder.cancelRecording();
            setVoiceRecording(false);
            setVoiceSessionStatus('idle');
            logger.info('Recording discarded on voice mode close');
          } else {
            // Stop recording and send for processing (normal behavior)
            audioRecorder.stopRecording();
          }
        }

        // Stop any ongoing TTS
        stopSpeaking();

        // Unsubscribe from events
        if (eventUnsubscribeRef.current) {
          eventUnsubscribeRef.current();
          eventUnsubscribeRef.current = null;
        }

        await api.voice!.stopSession(voiceSession.id);
        storeEndSession();
        logger.info('Voice session ended');
      } catch (error) {
        logger.error('Error ending voice session:', error);
        // Still clean up local state
        storeEndSession();
      }
    },
    [
      voiceSession,
      audioRecorder,
      stopSpeaking,
      storeEndSession,
      setVoiceRecording,
      setVoiceSessionStatus,
    ]
  );

  /**
   * Toggle voice session (start if not active, end if active)
   */
  const toggleSession = useCallback(async () => {
    if (voiceSessionActive) {
      await endSession();
    } else {
      await startSession();
    }
  }, [voiceSessionActive, startSession, endSession]);

  /**
   * Toggle voice mode visibility (open/close the voice widget)
   *
   * This is the primary toggle for opening/closing voice mode.
   * When opening: Shows the widget and starts a voice session if not already active
   * When closing: Hides the widget and ends the voice session
   *
   * Note: When closing, any ongoing recording is discarded (not sent for processing).
   * This matches the acceptance criteria: "GIVEN user is recording and presses Alt+M,
   * WHEN dialog closes, THEN recording is stopped and discarded (not sent)"
   */
  const toggleVoiceMode = useCallback(async () => {
    if (voiceWidgetVisible) {
      // Closing voice mode
      // End the session and discard any ongoing recording (don't send for processing)
      if (voiceSessionActive) {
        await endSession(true); // discardRecording = true
      }
      hideVoiceWidget();
    } else {
      // Opening voice mode
      showVoiceWidget();
      // Start a session if not already active
      if (!voiceSessionActive) {
        await startSession();
      }
    }
  }, [
    voiceWidgetVisible,
    voiceSessionActive,
    endSession,
    hideVoiceWidget,
    showVoiceWidget,
    startSession,
  ]);

  /**
   * Open voice mode (show widget and start session)
   */
  const openVoiceMode = useCallback(async () => {
    showVoiceWidget();
    if (!voiceSessionActive) {
      await startSession();
    }
  }, [showVoiceWidget, voiceSessionActive, startSession]);

  /**
   * Close voice mode (hide widget and end session)
   *
   * Note: Any ongoing recording is discarded (not sent for processing).
   * This matches the acceptance criteria for closing voice mode while recording.
   */
  const closeVoiceMode = useCallback(async () => {
    if (voiceSessionActive) {
      await endSession(true); // discardRecording = true
    }
    hideVoiceWidget();
  }, [voiceSessionActive, endSession, hideVoiceWidget]);

  /**
   * Start recording (push-to-talk or toggle mode)
   */
  const startRecording = useCallback(() => {
    if (!voiceSessionActive) {
      setVoiceError('Voice session not active');
      return;
    }

    audioRecorder.startRecording();
  }, [voiceSessionActive, audioRecorder, setVoiceError]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    audioRecorder.stopRecording();
  }, [audioRecorder]);

  /**
   * Toggle recording state
   */
  const toggleRecording = useCallback(() => {
    if (audioRecorder.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [audioRecorder.isRecording, startRecording, stopRecording]);

  /**
   * Send a text command (alternative to voice)
   */
  const sendTextCommand = useCallback(
    async (text: string) => {
      if (!voiceSession) {
        setVoiceError('No active voice session');
        return;
      }

      const api = getElectronAPI();

      try {
        setVoiceProcessing(true);
        setVoiceSessionStatus('responding');

        // Add user message
        const userMessage: VoiceMessage = {
          id: `msg-${Date.now()}`,
          role: 'user',
          content: text,
          timestamp: new Date().toISOString(),
        };
        addVoiceMessage(userMessage);

        // Send to server
        const response = await api.voice!.processCommand(voiceSession.id, text);

        if (response.error) {
          throw new Error(response.error);
        }

        // Add assistant response
        if (response.response) {
          const assistantMessage: VoiceMessage = {
            id: response.messageId || `msg-${Date.now()}`,
            role: 'assistant',
            content: response.response,
            timestamp: new Date().toISOString(),
            executedCommand: response.commandExecuted,
            commandName: response.commandResult?.commandName,
          };
          addVoiceMessage(assistantMessage);

          // Speak if TTS is enabled
          if (voiceSettings.enableTextToSpeech && voiceSettings.outputMode !== 'text_only') {
            await speakResponse(response.response);
          }
        }

        setVoiceProcessing(false);
        setVoiceSessionStatus('idle');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send command';
        logger.error('Failed to send text command:', error);
        setVoiceError(message);
        setVoiceProcessing(false);
        setVoiceSessionStatus('error');
      }
    },
    [
      voiceSession,
      voiceSettings,
      addVoiceMessage,
      speakResponse,
      setVoiceError,
      setVoiceProcessing,
      setVoiceSessionStatus,
    ]
  );

  /**
   * Subscribe to voice events from the server
   */
  const subscribeToVoiceEvents = useCallback(() => {
    const api = getElectronAPI();

    // Unsubscribe from any existing subscription
    if (eventUnsubscribeRef.current) {
      eventUnsubscribeRef.current();
    }

    eventUnsubscribeRef.current = api.voice!.onEvent((event: VoiceEvent) => {
      logger.debug('Voice event received:', event.type);

      switch (event.type) {
        case 'voice:session-started':
          setVoiceSessionActive(true);
          break;

        case 'voice:session-ended':
          storeEndSession();
          break;

        case 'voice:recording-started':
          setVoiceRecording(true);
          setVoiceSessionStatus('recording');
          break;

        case 'voice:recording-stopped':
          setVoiceRecording(false);
          setVoiceSessionStatus('processing');
          break;

        case 'voice:transcription-started':
          setVoiceSessionStatus('transcribing');
          break;

        case 'voice:transcription-completed':
          if ('text' in event && event.text) {
            setVoiceTranscript(event.text);
          }
          break;

        case 'voice:response-started':
          setVoiceSessionStatus('responding');
          break;

        case 'voice:response-completed':
          if ('content' in event && event.content) {
            // Response will be added via the processCommand response
          }
          setVoiceProcessing(false);
          setVoiceSessionStatus('idle');
          break;

        case 'voice:speaking-started':
          setVoiceSessionStatus('speaking');
          break;

        case 'voice:speaking-completed':
          setVoiceSessionStatus('idle');
          break;

        case 'voice:error':
          if ('message' in event) {
            setVoiceError(event.message);
          }
          setVoiceSessionStatus('error');
          break;
      }
    });
  }, [
    setVoiceSessionActive,
    storeEndSession,
    setVoiceRecording,
    setVoiceSessionStatus,
    setVoiceTranscript,
    setVoiceProcessing,
    setVoiceError,
  ]);

  /**
   * Clear current error
   */
  const clearError = useCallback(() => {
    setVoiceError(null);
    if (voiceSessionStatus === 'error') {
      setVoiceSessionStatus('idle');
    }
  }, [setVoiceError, setVoiceSessionStatus, voiceSessionStatus]);

  /**
   * Get available TTS voices
   */
  const getTTSVoices = useCallback((): SpeechSynthesisVoice[] => {
    if (!('speechSynthesis' in window)) {
      return [];
    }
    return window.speechSynthesis.getVoices();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventUnsubscribeRef.current) {
        eventUnsubscribeRef.current();
        eventUnsubscribeRef.current = null;
      }
      stopSpeaking();
    };
  }, [stopSpeaking]);

  return {
    // State
    isSessionActive: voiceSessionActive,
    session: voiceSession,
    sessionStatus: voiceSessionStatus,
    isRecording: voiceRecording || audioRecorder.isRecording,
    isProcessing: voiceProcessing,
    error: voiceError || audioRecorder.error,
    transcript: voiceTranscript,
    messages: voiceMessages,
    settings: voiceSettings,
    audioLevel: audioRecorder.audioLevel,
    recordingDuration: audioRecorder.recordingDurationMs,
    availableDevices: audioRecorder.availableDevices,
    selectedDeviceId: audioRecorder.selectedDeviceId,

    // Voice mode visibility state
    isVisible: voiceWidgetVisible,

    // Voice mode visibility actions (open/close the voice widget)
    toggleVoiceMode,
    openVoiceMode,
    closeVoiceMode,

    // Session actions
    startSession,
    endSession,
    toggleSession,

    // Recording actions
    startRecording,
    stopRecording,
    toggleRecording,

    // Command actions
    sendTextCommand,

    // TTS actions
    speakResponse,
    stopSpeaking,
    getTTSVoices,

    // Settings actions
    updateSettings: updateVoiceSettings,
    selectDevice: audioRecorder.selectDevice,

    // Error handling
    clearError,
  };
}

export type VoiceModeHook = ReturnType<typeof useVoiceMode>;

/**
 * Hook to register the global Alt+M keyboard shortcut for voice mode toggle.
 *
 * This shortcut is special because it:
 * - Bypasses the normal input focus check (works even when typing in inputs)
 * - Uses event.code for keyboard-layout independence
 * - Is designed for hands-free voice control
 *
 * Behavior:
 * - If voice mode is closed: Opens voice mode (shows widget and starts session)
 * - If voice mode is open: Closes voice mode (hides widget and ends session)
 *
 * @param voiceMode - The voice mode hook instance to control
 */
export function useGlobalVoiceModeShortcut(voiceMode: VoiceModeHook) {
  const shortcuts = useKeyboardShortcutsConfig();
  const voiceModeToggleShortcut = shortcuts.voiceModeToggle;

  // Use refs to avoid stale closures in the event handler
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Check if the event matches the voiceModeToggle shortcut
      // This bypasses input focus check intentionally - voice mode should
      // work even when user is typing
      if (!matchesShortcutWithCode(event, voiceModeToggleShortcut)) {
        return;
      }

      // Prevent default behavior and stop propagation
      event.preventDefault();
      event.stopPropagation();

      const vm = voiceModeRef.current;

      // Toggle voice mode visibility (open/close)
      // This will show/hide the widget and start/end the session accordingly
      vm.toggleVoiceMode();
    };

    // Use capture phase to ensure we get the event before other handlers
    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    };
  }, [voiceModeToggleShortcut]);
}

/**
 * Hook to register the global Alt+N keyboard shortcut for recording toggle.
 *
 * This shortcut is special because it:
 * - Only works when voice mode is visible/open
 * - Bypasses the normal input focus check (works even when typing in inputs)
 * - Uses event.code for keyboard-layout independence
 * - Is designed for hands-free recording control
 *
 * Behavior:
 * - If voice mode is closed: Does nothing (recording only works within voice mode)
 * - If voice mode is open and not recording: Starts recording
 * - If voice mode is open and recording: Stops recording and sends audio for processing
 *
 * @param voiceMode - The voice mode hook instance to control
 */
export function useGlobalRecordingToggleShortcut(voiceMode: VoiceModeHook) {
  const shortcuts = useKeyboardShortcutsConfig();
  const recordingToggleShortcut = shortcuts.recordingToggle;

  // Use refs to avoid stale closures in the event handler
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Check if the event matches the recordingToggle shortcut
      if (!matchesShortcutWithCode(event, recordingToggleShortcut)) {
        return;
      }

      const vm = voiceModeRef.current;

      // Only toggle recording if voice mode is visible
      // Per acceptance criteria: "GIVEN voice mode is closed, WHEN user presses Alt+N, THEN nothing happens"
      if (!vm.isVisible) {
        return;
      }

      // Prevent default behavior and stop propagation
      event.preventDefault();
      event.stopPropagation();

      // Toggle recording state
      // - If not recording: Start recording
      // - If recording: Stop recording (audio will be sent for processing via onRecordingStop callback)
      vm.toggleRecording();

      logger.debug('Recording toggle triggered via Alt+N', { isRecording: vm.isRecording });
    };

    // Use capture phase to ensure we get the event before other handlers
    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    };
  }, [recordingToggleShortcut]);
}

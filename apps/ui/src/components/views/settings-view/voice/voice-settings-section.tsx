import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mic, Volume2, Settings2, Clock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import type { VoiceInputMode, VoiceOutputMode } from '@automaker/types';

/**
 * Voice Settings Section - Configuration for voice mode
 *
 * Allows users to configure:
 * - Enable/disable voice mode
 * - Input mode (push-to-talk, toggle, continuous)
 * - Output mode (text-only, text+speech, speech-only)
 * - TTS settings (rate, voice)
 * - Noise gate threshold
 * - Recording limits
 * - Confirmation preferences
 */
export function VoiceSettingsSection() {
  const { voiceSettings, updateVoiceSettings } = useAppStore(
    useShallow((state) => ({
      voiceSettings: state.voiceSettings,
      updateVoiceSettings: state.updateVoiceSettings,
    }))
  );

  // Available TTS voices
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load TTS voices
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setTtsVoices(voices);
      }
    };

    loadVoices();
    // Chrome loads voices asynchronously
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Mic className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Voice Mode</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure voice interaction settings for hands-free feature management.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Enable Voice Mode */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="voice-enabled"
            checked={voiceSettings.enabled}
            onCheckedChange={(checked) => updateVoiceSettings({ enabled: !!checked })}
            className="mt-1"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="voice-enabled"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Mic className="w-4 h-4 text-brand-500" />
              Enable Voice Mode
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Allow hands-free interaction using voice commands. When enabled, the voice button
              appears in the board header.
            </p>
          </div>
        </div>

        {/* Input Mode */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Settings2 className="w-4 h-4 text-brand-500" />
            Input Mode
          </Label>
          <Select
            value={voiceSettings.inputMode}
            onValueChange={(value) => updateVoiceSettings({ inputMode: value as VoiceInputMode })}
            disabled={!voiceSettings.enabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="push_to_talk">Push to Talk (Hold button to record)</SelectItem>
              <SelectItem value="toggle">Toggle (Click to start/stop)</SelectItem>
              <SelectItem value="continuous">Continuous (Experimental - VAD)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground/80">
            How voice recording is triggered. Push-to-talk is most reliable.
          </p>
        </div>

        {/* Output Mode */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="w-4 h-4 text-brand-500" />
            Response Mode
          </Label>
          <Select
            value={voiceSettings.outputMode}
            onValueChange={(value) => updateVoiceSettings({ outputMode: value as VoiceOutputMode })}
            disabled={!voiceSettings.enabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text_only">Text Only</SelectItem>
              <SelectItem value="text_and_speech">Text and Speech</SelectItem>
              <SelectItem value="speech_only">Speech Only</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground/80">
            How AI responses are delivered. Text and Speech is recommended.
          </p>
        </div>

        {/* Text-to-Speech Settings */}
        {voiceSettings.enableTextToSpeech && voiceSettings.outputMode !== 'text_only' && (
          <>
            {/* TTS Voice Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Volume2 className="w-4 h-4 text-brand-500" />
                Voice
              </Label>
              <Select
                value={voiceSettings.ttsVoice || ''}
                onValueChange={(value) => updateVoiceSettings({ ttsVoice: value || null })}
                disabled={!voiceSettings.enabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="System Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">System Default</SelectItem>
                  {ttsVoices.map((voice) => (
                    <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* TTS Rate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Speech Rate</Label>
                <span className="text-sm text-muted-foreground">
                  {voiceSettings.ttsRate.toFixed(1)}x
                </span>
              </div>
              <Slider
                value={[voiceSettings.ttsRate]}
                min={0.5}
                max={2.0}
                step={0.1}
                onValueChange={([value]) => updateVoiceSettings({ ttsRate: value })}
                disabled={!voiceSettings.enabled}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground/80">
                Speed of text-to-speech playback. 1.0 is normal speed.
              </p>
            </div>
          </>
        )}

        {/* Noise Gate Threshold */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Noise Gate Threshold</Label>
            <span className="text-sm text-muted-foreground">
              {voiceSettings.noiseGateThreshold} dB
            </span>
          </div>
          <Slider
            value={[voiceSettings.noiseGateThreshold]}
            min={-60}
            max={0}
            step={5}
            onValueChange={([value]) => updateVoiceSettings({ noiseGateThreshold: value })}
            disabled={!voiceSettings.enabled}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground/80">
            Audio levels below this threshold are ignored. Lower values are more sensitive.
          </p>
        </div>

        {/* Recording Limits */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Clock className="w-4 h-4 text-brand-500" />
              Max Recording Duration
            </Label>
            <span className="text-sm text-muted-foreground">
              {Math.round(voiceSettings.maxRecordingDurationMs / 1000)}s
            </span>
          </div>
          <Slider
            value={[voiceSettings.maxRecordingDurationMs]}
            min={5000}
            max={120000}
            step={5000}
            onValueChange={([value]) => updateVoiceSettings({ maxRecordingDurationMs: value })}
            disabled={!voiceSettings.enabled}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground/80">
            Maximum length of a single voice recording before auto-stop.
          </p>
        </div>

        {/* Silence Timeout */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Silence Timeout</Label>
            <span className="text-sm text-muted-foreground">
              {voiceSettings.silenceTimeoutMs === 0
                ? 'Disabled'
                : `${voiceSettings.silenceTimeoutMs / 1000}s`}
            </span>
          </div>
          <Slider
            value={[voiceSettings.silenceTimeoutMs]}
            min={0}
            max={10000}
            step={500}
            onValueChange={([value]) => updateVoiceSettings({ silenceTimeoutMs: value })}
            disabled={!voiceSettings.enabled}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground/80">
            Automatically stop recording after this duration of silence. Set to 0 to disable.
          </p>
        </div>

        {/* Confirmation Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="confirm-destructive"
            checked={voiceSettings.confirmDestructiveCommands}
            onCheckedChange={(checked) =>
              updateVoiceSettings({ confirmDestructiveCommands: !!checked })
            }
            disabled={!voiceSettings.enabled}
            className="mt-1"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="confirm-destructive"
              className="text-foreground cursor-pointer font-medium"
            >
              Confirm Destructive Commands
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Require verbal confirmation before executing destructive actions like deleting
              features or bulk updates.
            </p>
          </div>
        </div>

        {/* Live Transcription Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="show-live-transcription"
            checked={voiceSettings.showLiveTranscription}
            onCheckedChange={(checked) => updateVoiceSettings({ showLiveTranscription: !!checked })}
            disabled={!voiceSettings.enabled}
            className="mt-1"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="show-live-transcription"
              className="text-foreground cursor-pointer font-medium"
            >
              Show Live Transcription
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Display real-time transcription text while you&apos;re speaking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

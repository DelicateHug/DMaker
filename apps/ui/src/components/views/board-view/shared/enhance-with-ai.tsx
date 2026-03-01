import { useState } from 'react';
import { createLogger } from '@dmaker/utils/logger';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sparkles, ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { ModelOverrideTrigger, useModelOverride } from '@/components/shared';
import { EnhancementMode, ENHANCEMENT_MODE_LABELS } from './enhancement';

const logger = createLogger('EnhanceWithAI');

interface EnhanceWithAIProps {
  /** Current text value to enhance */
  value: string;
  /** Callback when text is enhanced */
  onChange: (enhancedText: string) => void;
  /** Optional callback to track enhancement in history */
  onHistoryAdd?: (entry: {
    mode: EnhancementMode;
    originalText: string;
    enhancedText: string;
  }) => void;
  /** Disable the enhancement feature */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode: renders as a small button with dropdown */
  compact?: boolean;
}

/**
 * Reusable "Enhance with AI" component
 *
 * Provides AI-powered text enhancement with multiple modes:
 * - Improve Clarity
 * - Add Technical Details
 * - Simplify
 * - Add Acceptance Criteria
 * - User Experience
 *
 * Used in Add Feature, Edit Feature, and Follow-Up dialogs.
 */
export function EnhanceWithAI({
  value,
  onChange,
  onHistoryAdd,
  disabled = false,
  className,
  compact = false,
}: EnhanceWithAIProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>('improve');
  const [lastUsedMode, setLastUsedMode] = useState<EnhancementMode | null>(null);
  const [enhanceOpen, setEnhanceOpen] = useState(false);

  // Enhancement model override
  const enhancementOverride = useModelOverride({ phase: 'enhancementModel' });

  const handleEnhance = async (mode?: EnhancementMode) => {
    const activeMode = mode ?? enhancementMode;
    if (!value.trim() || isEnhancing || disabled) return;

    setLastUsedMode(activeMode);
    setIsEnhancing(true);
    try {
      const api = getElectronAPI();
      const result = await api.enhancePrompt?.enhance(
        value,
        activeMode,
        enhancementOverride.effectiveModel,
        enhancementOverride.effectiveModelEntry.thinkingLevel
      );

      if (result?.success && result.enhancedText) {
        const originalText = value;
        const enhancedText = result.enhancedText;
        onChange(enhancedText);

        // Track in history if callback provided (includes original for restoration)
        onHistoryAdd?.({ mode: activeMode, originalText, enhancedText });

        toast.success('Enhanced successfully!');
      } else {
        toast.error(result?.error || 'Failed to enhance');
      }
    } catch (error) {
      logger.error('Enhancement failed:', error);
      toast.error('Failed to enhance');
    } finally {
      setIsEnhancing(false);
    }
  };

  const isCompactDisabled = !value.trim() || isEnhancing || disabled;

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 text-xs transition-colors',
              isCompactDisabled
                ? 'text-blue-800/40 cursor-default'
                : 'text-blue-800 hover:text-blue-900 cursor-pointer'
            )}
            onClick={(e) => {
              if (isCompactDisabled) e.preventDefault();
            }}
          >
            <Sparkles className={cn('w-3.5 h-3.5', isEnhancing && 'animate-spin')} />
            <span>{isEnhancing ? 'Enhancing...' : 'Enhance'}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {lastUsedMode && (
            <DropdownMenuItem onClick={() => handleEnhance(lastUsedMode)} className="text-primary">
              <RotateCw className="w-3.5 h-3.5 mr-2" />
              Enhance again ({ENHANCEMENT_MODE_LABELS[lastUsedMode]})
            </DropdownMenuItem>
          )}
          {(Object.entries(ENHANCEMENT_MODE_LABELS) as [EnhancementMode, string][]).map(
            ([mode, label]) => (
              <DropdownMenuItem key={mode} onClick={() => handleEnhance(mode)}>
                {label}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Collapsible open={enhanceOpen} onOpenChange={setEnhanceOpen} className={className}>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1"
          disabled={disabled}
        >
          {enhanceOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Sparkles className="w-4 h-4" />
          <span>Enhance with AI</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={disabled}>
                {ENHANCEMENT_MODE_LABELS[enhancementMode]}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(Object.entries(ENHANCEMENT_MODE_LABELS) as [EnhancementMode, string][]).map(
                ([mode, label]) => (
                  <DropdownMenuItem key={mode} onClick={() => setEnhancementMode(mode)}>
                    {label}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={() => handleEnhance()}
            disabled={!value.trim() || isEnhancing || disabled}
            loading={isEnhancing}
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Enhance
          </Button>

          <ModelOverrideTrigger
            currentModelEntry={enhancementOverride.effectiveModelEntry}
            onModelChange={enhancementOverride.setOverride}
            phase="enhancementModel"
            isOverridden={enhancementOverride.isOverridden}
            size="sm"
            variant="inline"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

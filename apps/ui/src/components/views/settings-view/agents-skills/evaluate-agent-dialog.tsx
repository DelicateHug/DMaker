/**
 * Evaluate Agent Dialog - AI-powered agent evaluation with suggestions
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  Wand2,
} from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import type { AgentWithScope } from './hooks/use-agents';

interface EvaluationResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  improvedPrompt: string;
}

interface EvaluateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentWithScope | null;
  projectPath?: string;
  onApplySuggestions: (agent: AgentWithScope, improvedPrompt: string) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 8) return 'text-emerald-500 bg-emerald-500/15 border-emerald-500/30';
    if (score >= 6) return 'text-blue-500 bg-blue-500/15 border-blue-500/30';
    if (score >= 4) return 'text-amber-500 bg-amber-500/15 border-amber-500/30';
    return 'text-red-500 bg-red-500/15 border-red-500/30';
  };

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center w-14 h-14 rounded-xl border-2 text-xl font-bold',
        getColor()
      )}
    >
      {score}
    </div>
  );
}

export function EvaluateAgentDialog({
  open,
  onOpenChange,
  agent,
  projectPath,
  onApplySuggestions,
}: EvaluateAgentDialogProps) {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [showImproved, setShowImproved] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && agent) {
      setResult(null);
      setShowImproved(false);
      runEvaluation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent]);

  const runEvaluation = async () => {
    if (!agent) return;

    setIsEvaluating(true);
    try {
      const api = getElectronAPI();
      if (!api.agents) {
        throw new Error('Agents API not available');
      }

      const res = await api.agents.evaluate({
        name: agent.name,
        description: agent.definition.description,
        prompt: agent.definition.prompt,
        tools: agent.definition.tools,
        model: agent.definition.model,
        projectPath,
      });

      if (res.success && res.evaluation) {
        setResult(res.evaluation);
      } else {
        toast.error(res.error || 'Evaluation failed');
      }
    } catch (error) {
      toast.error('Failed to evaluate agent');
      console.error(error);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleApply = () => {
    if (agent && result) {
      onApplySuggestions(agent, result.improvedPrompt);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            {agent ? `Evaluating: ${agent.name}` : 'Evaluate Agent'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {isEvaluating && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Analyzing agent definition...</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Score */}
              <div className="flex items-center gap-4">
                <ScoreBadge score={result.score} />
                <div>
                  <div className="font-medium">Overall Score</div>
                  <div className="text-sm text-muted-foreground">
                    {result.score >= 8
                      ? 'Excellent agent definition'
                      : result.score >= 6
                        ? 'Good with room for improvement'
                        : result.score >= 4
                          ? 'Needs improvement'
                          : 'Significant issues found'}
                  </div>
                </div>
              </div>

              {/* Strengths */}
              {result.strengths.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-500 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Strengths
                  </div>
                  <ul className="space-y-1">
                    {result.strengths.map((s, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground pl-6 relative before:content-[''] before:absolute before:left-2 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500/50"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {result.weaknesses.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-500 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    Weaknesses
                  </div>
                  <ul className="space-y-1">
                    {result.weaknesses.map((w, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground pl-6 relative before:content-[''] before:absolute before:left-2 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-500/50"
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {result.suggestions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-500 mb-2">
                    <Lightbulb className="w-4 h-4" />
                    Suggestions
                  </div>
                  <ul className="space-y-1">
                    {result.suggestions.map((s, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground pl-6 relative before:content-[''] before:absolute before:left-2 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-blue-500/50"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improved Prompt */}
              <Collapsible open={showImproved} onOpenChange={setShowImproved}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 text-sm font-medium text-violet-500 hover:text-violet-400 transition-colors cursor-pointer">
                    {showImproved ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    Improved Prompt
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 rounded-lg border border-border/30 bg-muted/30 p-4 overflow-auto max-h-64">
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {result.improvedPrompt}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>

        {result && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={handleApply} className="gap-1.5">
              <Wand2 className="w-4 h-4" />
              Apply Suggestions
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

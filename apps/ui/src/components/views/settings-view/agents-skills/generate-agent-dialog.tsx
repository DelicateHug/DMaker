/**
 * Generate Agent Dialog - AI-powered agent generation
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/forms';
import { Sparkles, Loader2 } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

interface GenerateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath?: string;
  onGenerated: (agent: {
    name: string;
    description: string;
    prompt: string;
    tools?: string[];
    model?: string;
  }) => void;
}

export function GenerateAgentDialog({
  open,
  onOpenChange,
  projectPath,
  onGenerated,
}: GenerateAgentDialogProps) {
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('sonnet');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setIsGenerating(true);
    try {
      const api = getElectronAPI();
      if (!api.agents) {
        throw new Error('Agents API not available');
      }

      const result = await api.agents.generate({
        description: description.trim(),
        projectPath,
        model,
      });

      if (result.success && result.agent) {
        toast.success('Agent generated! Review and save below.');
        onOpenChange(false);
        onGenerated(result.agent);
        setDescription('');
      } else {
        toast.error(result.error || 'Failed to generate agent');
      }
    } catch (error) {
      toast.error('Failed to generate agent');
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            Generate Agent with AI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Description */}
          <div>
            <Label htmlFor="gen-description">What should this agent do?</Label>
            <textarea
              id="gen-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A code reviewer that checks for security vulnerabilities and suggests fixes..."
              rows={4}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              disabled={isGenerating}
            />
          </div>

          {/* Model for generation */}
          <div>
            <Label htmlFor="gen-model">Generation Model</Label>
            <select
              id="gen-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isGenerating}
            >
              <option value="sonnet">Sonnet (Recommended)</option>
              <option value="opus">Opus</option>
              <option value="haiku">Haiku</option>
            </select>
          </div>

          {isGenerating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating agent definition...
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !description.trim()}
            className="gap-1.5"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

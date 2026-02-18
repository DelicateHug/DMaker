// @ts-nocheck
import { memo } from 'react';
import { Feature } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import {
  Edit,
  PlayCircle,
  RotateCcw,
  StopCircle,
  CheckCircle2,
  FileText,
  Eye,
  Wand2,
} from 'lucide-react';

const RECENTLY_STARTED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isRecentlyStarted(feature: Feature): boolean {
  if (!feature.startedAt) return false;
  const elapsed = Date.now() - new Date(feature.startedAt).getTime();
  return elapsed < RECENTLY_STARTED_THRESHOLD_MS;
}

interface CardActionsProps {
  feature: Feature;
  isCurrentAutoTask: boolean;
  hasContext?: boolean;
  shortcutKey?: string;
  isSelectionMode?: boolean;
  onEdit: () => void;
  onViewOutput?: () => void;
  onVerify?: () => void;
  onResume?: () => void;
  onForceStop?: () => void;
  onManualVerify?: () => void;
  onFollowUp?: () => void;
  onImplement?: () => void;
  onViewPlan?: () => void;
  onApprovePlan?: () => void;
}

export const CardActions = memo(function CardActions({
  feature,
  isCurrentAutoTask,
  hasContext,
  shortcutKey,
  isSelectionMode = false,
  onEdit,
  onViewOutput,
  onVerify,
  onResume,
  onForceStop,
  onManualVerify,
  onFollowUp,
  onImplement,
  onViewPlan,
  onApprovePlan,
}: CardActionsProps) {
  // Hide all actions when in selection mode
  if (isSelectionMode) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 -mx-2.5 px-2.5 pt-1 pb-2">
      {isCurrentAutoTask && (
        <>
          {/* Approve Plan button - PRIORITY: shows even when agent is "running" (paused for approval) */}
          {feature.planSpec?.status === 'generated' && onApprovePlan && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 min-w-0 h-7 text-[11px] bg-purple-600 hover:bg-purple-700 text-white animate-pulse"
              onClick={(e) => {
                e.stopPropagation();
                onApprovePlan();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`approve-plan-running-${feature.id}`}
            >
              <FileText className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Approve Plan</span>
            </Button>
          )}
          {onViewOutput && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 h-7 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onViewOutput();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`view-output-${feature.id}`}
            >
              <FileText className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Logs</span>
              {shortcutKey && (
                <span
                  className="ml-1.5 px-1 py-0.5 text-[9px] font-mono rounded bg-foreground/10"
                  data-testid={`shortcut-key-${feature.id}`}
                >
                  {shortcutKey}
                </span>
              )}
            </Button>
          )}
          {onForceStop && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-[11px] px-2 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onForceStop();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`force-stop-${feature.id}`}
            >
              <StopCircle className="w-3 h-3" />
            </Button>
          )}
        </>
      )}
      {!isCurrentAutoTask &&
        (feature.status === 'in_progress' ||
          (typeof feature.status === 'string' && feature.status.startsWith('pipeline_'))) && (
          <>
            {/* Approve Plan button - shows when plan is generated and waiting for approval */}
            {feature.planSpec?.status === 'generated' && onApprovePlan && (
              <Button
                variant="default"
                size="sm"
                className="flex-1 h-7 text-[11px] bg-purple-600 hover:bg-purple-700 text-white animate-pulse"
                onClick={(e) => {
                  e.stopPropagation();
                  onApprovePlan();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`approve-plan-${feature.id}`}
              >
                <FileText className="w-3 h-3 mr-1" />
                Approve Plan
              </Button>
            )}
            {feature.skipTests && onManualVerify ? (
              <Button
                variant="default"
                size="sm"
                className="flex-1 h-7 text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onManualVerify();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`manual-verify-${feature.id}`}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Complete
              </Button>
            ) : onResume && !isRecentlyStarted(feature) ? (
              <Button
                variant="default"
                size="sm"
                className="flex-1 h-7 text-[11px] bg-[var(--status-success)] hover:bg-[var(--status-success)]/90"
                onClick={(e) => {
                  e.stopPropagation();
                  onResume();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`resume-feature-${feature.id}`}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Resume
              </Button>
            ) : onVerify ? (
              <Button
                variant="default"
                size="sm"
                className="flex-1 h-7 text-[11px] bg-[var(--status-success)] hover:bg-[var(--status-success)]/90"
                onClick={(e) => {
                  e.stopPropagation();
                  onVerify();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`verify-feature-${feature.id}`}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Complete
              </Button>
            ) : null}
            {onViewOutput && !feature.skipTests && (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-[11px] px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewOutput();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`view-output-inprogress-${feature.id}`}
              >
                <FileText className="w-3 h-3" />
              </Button>
            )}
          </>
        )}
      {!isCurrentAutoTask && feature.status === 'waiting_approval' && (
        <>
          {/* Refine prompt button */}
          {onFollowUp && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 h-7 text-[11px] min-w-0"
              onClick={(e) => {
                e.stopPropagation();
                onFollowUp();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`follow-up-${feature.id}`}
            >
              <Wand2 className="w-3 h-3 mr-1 shrink-0" />
              <span className="truncate">Refine</span>
            </Button>
          )}
          {/* Show Complete button to mark feature as done */}
          {onManualVerify ? (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onManualVerify();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`mark-as-complete-${feature.id}`}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Complete
            </Button>
          ) : null}
        </>
      )}
      {!isCurrentAutoTask && feature.status === 'backlog' && (
        <>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`edit-backlog-${feature.id}`}
          >
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
          {feature.planSpec?.content && onViewPlan && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={(e) => {
                e.stopPropagation();
                onViewPlan();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`view-plan-${feature.id}`}
              title="View Plan"
            >
              <Eye className="w-3 h-3" />
            </Button>
          )}
          {onImplement && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onImplement();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid={`make-${feature.id}`}
            >
              <PlayCircle className="w-3 h-3 mr-1" />
              Make
            </Button>
          )}
        </>
      )}
    </div>
  );
});

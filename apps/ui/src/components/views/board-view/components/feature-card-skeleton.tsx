import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Shimmer placeholder block used within the skeleton card.
 * Renders an animated bar that mimics loading content.
 */
function ShimmerBlock({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-muted/40 animate-pulse', className)} />;
}

interface FeatureCardSkeletonProps {
  /** Feature title to display (real text, not a placeholder) */
  title?: string;
  /** Category label to display (real text, not a placeholder) */
  category?: string;
  /** Status label shown as a badge */
  status?: string;
  /** Additional CSS classes for the outer wrapper */
  className?: string;
}

/**
 * FeatureCardSkeleton - A loading placeholder that mirrors the KanbanCard layout.
 *
 * Shows real title, category, and status text while rendering shimmer
 * placeholders for the description and agent info sections.
 * This is useful when a card's metadata is known but its full content
 * (description, agent context, tasks) is still being loaded.
 */
export const FeatureCardSkeleton = memo(function FeatureCardSkeleton({
  title,
  category,
  status,
  className,
}: FeatureCardSkeletonProps) {
  return (
    <div
      className={cn('relative select-none outline-none cursor-default', className)}
      data-testid="feature-card-skeleton"
    >
      <Card className="kanban-card-content h-full relative shadow-sm border-border/50">
        {/* Background overlay matching KanbanCard */}
        <div className="absolute inset-0 rounded-xl bg-card -z-10" />

        {/* Status badge row — mirrors CardBadges placement */}
        {status && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1.5 min-h-[24px]">
            <span
              className={cn(
                'inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border',
                'bg-muted/30 border-border/40 text-muted-foreground'
              )}
            >
              {status}
            </span>
          </div>
        )}

        {/* Category row — mirrors the category + favorite toggle row */}
        <div className="px-2.5 pt-2 flex items-center gap-1.5">
          {category ? (
            <span className="text-[11px] text-muted-foreground/70 font-medium flex-1">
              {category}
            </span>
          ) : (
            <ShimmerBlock className="h-3 w-16 flex-none" />
          )}
        </div>

        {/* Card Header — title (real) + description (shimmer) */}
        <CardHeader className="px-2 pt-0.5 pb-1 block">
          <div className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0 overflow-hidden">
              {/* Title — real text */}
              {title ? (
                <CardTitle className="text-sm font-semibold text-foreground mb-0.5 line-clamp-2">
                  {title}
                </CardTitle>
              ) : (
                <div className="mb-0.5 space-y-1">
                  <ShimmerBlock className="h-4 w-3/4" />
                  <ShimmerBlock className="h-4 w-1/2" />
                </div>
              )}

              {/* Description — shimmer placeholder (3 lines) */}
              <div className="space-y-1.5 mt-1">
                <ShimmerBlock className="h-3 w-full" />
                <ShimmerBlock className="h-3 w-5/6" />
                <ShimmerBlock className="h-3 w-2/3" />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-2.5 pt-0 pb-1.5">
          {/* Agent info panel — shimmer placeholder */}
          <div className="mb-3 space-y-2 overflow-hidden">
            {/* Model & Phase row */}
            <div className="flex items-center gap-2">
              <ShimmerBlock className="h-3 w-3 rounded-full flex-none" />
              <ShimmerBlock className="h-3 w-20" />
              <ShimmerBlock className="h-4 w-14 rounded-md" />
            </div>

            {/* Task list progress shimmer */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <ShimmerBlock className="h-3 w-3 flex-none" />
                <ShimmerBlock className="h-3 w-16" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <ShimmerBlock className="h-2.5 w-2.5 rounded-full flex-none" />
                  <ShimmerBlock className="h-2.5 w-4/5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <ShimmerBlock className="h-2.5 w-2.5 rounded-full flex-none" />
                  <ShimmerBlock className="h-2.5 w-3/5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <ShimmerBlock className="h-2.5 w-2.5 rounded-full flex-none" />
                  <ShimmerBlock className="h-2.5 w-2/3" />
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons row — shimmer placeholder */}
          <div className="flex items-center gap-1.5 mt-1">
            <ShimmerBlock className="h-7 w-20 rounded-md" />
            <ShimmerBlock className="h-7 w-16 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

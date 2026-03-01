import { useState, useCallback } from 'react';
import {
  Circle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  User,
  UserCheck,
  UserX,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/forms';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import type { Feature } from '@/store/app-store';
import { useIssueComments } from '../../github-issues-view/hooks/use-issue-comments';
import { CommentItem } from '../../github-issues-view/components/comment-item';
import { formatDate } from '../../github-issues-view/utils';

interface GitHubIssueDialogProps {
  feature: Feature;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GitHubIssueDialog({ feature, open, onOpenChange }: GitHubIssueDialogProps) {
  const { currentProject } = useAppStore();
  const issue = feature.githubIssue;

  // Comments
  const {
    comments,
    totalCount,
    loading: commentsLoading,
    loadingMore,
    hasNextPage,
    error: commentsError,
    loadMore,
    refresh: refreshComments,
  } = useIssueComments(open && issue ? issue.number : null);

  // Add comment state
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Claim/unclaim state
  const [claiming, setClaiming] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  // Body expanded state
  const [bodyExpanded, setBodyExpanded] = useState(true);

  // Issue management action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Fetch current GitHub user when dialog opens
  const fetchCurrentUser = useCallback(async () => {
    if (!currentProject?.path || currentUser !== null) return;
    setUserLoading(true);
    try {
      const api = getElectronAPI();
      if (api.github) {
        const result = await api.github.getCurrentUser(currentProject.path);
        if (result.success && result.username) {
          setCurrentUser(result.username);
        }
      }
    } catch {
      // Silently fail - user info is optional
    } finally {
      setUserLoading(false);
    }
  }, [currentProject?.path, currentUser]);

  // Fetch user on open
  if (open && currentUser === null && !userLoading) {
    fetchCurrentUser();
  }

  const handleAddComment = useCallback(async () => {
    if (!currentProject?.path || !issue || !newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const api = getElectronAPI();
      if (api.github) {
        const result = await api.github.addComment(
          currentProject.path,
          issue.number,
          newComment.trim()
        );
        if (result.success) {
          setNewComment('');
          refreshComments();
        }
      }
    } catch {
      // Error handled silently
    } finally {
      setSubmittingComment(false);
    }
  }, [currentProject?.path, issue, newComment, refreshComments]);

  const handleClaim = useCallback(async () => {
    if (!currentProject?.path || !issue) return;
    setClaiming(true);
    try {
      const api = getElectronAPI();
      if (api.github) {
        await api.github.claimIssue(currentProject.path, feature.id, issue.number);
      }
    } catch {
      // Error handled silently
    } finally {
      setClaiming(false);
    }
  }, [currentProject?.path, issue, feature.id]);

  const handleUnclaim = useCallback(async () => {
    if (!currentProject?.path || !issue) return;
    setClaiming(true);
    try {
      const api = getElectronAPI();
      if (api.github) {
        await api.github.unclaimIssue(currentProject.path, feature.id, issue.number);
      }
    } catch {
      // Error handled silently
    } finally {
      setClaiming(false);
    }
  }, [currentProject?.path, issue, feature.id]);

  const handleIssueAction = useCallback(
    async (action: 'lockIssue' | 'unlockIssue' | 'pinIssue' | 'unpinIssue' | 'deleteIssue') => {
      if (!currentProject?.path || !issue) return;
      setActionLoading(action);
      try {
        const api = getElectronAPI();
        if (api.github) {
          const result = await api.github[action](currentProject.path, issue.number);
          if (result.success && action === 'deleteIssue') {
            onOpenChange(false);
          }
        }
      } catch {
        // Error handled silently
      } finally {
        setActionLoading(null);
        setConfirmingDelete(false);
      }
    },
    [currentProject?.path, issue, onOpenChange]
  );

  if (!issue) return null;

  const assignees = issue.assignees || [];
  const isAssignedToMe = currentUser ? assignees.includes(currentUser) : false;
  const isOpen = issue.state === 'open';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] flex flex-col"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            {isOpen ? (
              <Circle className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
            )}
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                isOpen ? 'bg-green-500/10 text-green-500' : 'bg-purple-500/10 text-purple-500'
              )}
            >
              {isOpen ? 'Open' : 'Closed'}
            </span>
            <span className="text-sm text-muted-foreground">#{issue.number}</span>
          </div>
          <DialogTitle className="text-lg">{feature.title}</DialogTitle>
          <DialogDescription className="sr-only">
            GitHub Issue #{issue.number} details
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* Assignees Section */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Assignees</span>
              </div>
              {currentUser && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isAssignedToMe ? handleUnclaim : handleClaim}
                  disabled={claiming}
                  className="h-7 text-xs"
                >
                  {claiming ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : isAssignedToMe ? (
                    <UserX className="h-3 w-3 mr-1" />
                  ) : (
                    <UserCheck className="h-3 w-3 mr-1" />
                  )}
                  {isAssignedToMe ? 'Release' : 'Claim'}
                </Button>
              )}
            </div>
            <div className="mt-2">
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No one assigned</p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {assignees.map((login) => (
                    <span
                      key={login}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border',
                        login === currentUser
                          ? 'bg-green-500/10 text-green-500 border-green-500/20'
                          : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                      )}
                    >
                      {login}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Issue Body */}
          <div className="rounded-lg border border-border p-3">
            <button
              className="flex items-center gap-2 w-full text-left"
              onClick={() => setBodyExpanded(!bodyExpanded)}
            >
              <span className="text-sm font-medium">Description</span>
              {bodyExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {bodyExpanded && (
              <div className="mt-2">
                {feature.description ? (
                  <Markdown className="text-sm">{feature.description}</Markdown>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No description provided.</p>
                )}
              </div>
            )}
          </div>

          {/* Comments Section */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Comments {totalCount > 0 && `(${totalCount})`}
              </span>
              {commentsLoading && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="mt-3 space-y-3">
              {commentsError ? (
                <p className="text-sm text-red-500">{commentsError}</p>
              ) : comments.length === 0 && !commentsLoading ? (
                <p className="text-sm text-muted-foreground italic">No comments yet.</p>
              ) : (
                <>
                  {comments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} />
                  ))}
                  {hasNextPage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        'Load More Comments'
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Add Comment */}
            <div className="mt-4 space-y-2">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="min-h-[80px] text-sm"
                disabled={submittingComment}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || submittingComment}
                >
                  {submittingComment ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  Comment
                </Button>
              </div>
            </div>
          </div>

          {/* Issue Management Actions */}
          <div className="rounded-lg border border-border p-3">
            <span className="text-sm font-medium">Actions</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleIssueAction('lockIssue')}
                disabled={actionLoading !== null}
                className="h-7 text-xs"
              >
                {actionLoading === 'lockIssue' ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Lock className="h-3 w-3 mr-1" />
                )}
                Lock
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleIssueAction('unlockIssue')}
                disabled={actionLoading !== null}
                className="h-7 text-xs"
              >
                {actionLoading === 'unlockIssue' ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Unlock className="h-3 w-3 mr-1" />
                )}
                Unlock
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleIssueAction('pinIssue')}
                disabled={actionLoading !== null}
                className="h-7 text-xs"
              >
                {actionLoading === 'pinIssue' ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Pin className="h-3 w-3 mr-1" />
                )}
                Pin
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleIssueAction('unpinIssue')}
                disabled={actionLoading !== null}
                className="h-7 text-xs"
              >
                {actionLoading === 'unpinIssue' ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <PinOff className="h-3 w-3 mr-1" />
                )}
                Unpin
              </Button>
              {confirmingDelete ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleIssueAction('deleteIssue')}
                    disabled={actionLoading !== null}
                    className="h-7 text-xs"
                  >
                    {actionLoading === 'deleteIssue' ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Trash2 className="h-3 w-3 mr-1" />
                    )}
                    Confirm Delete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingDelete(false)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={actionLoading !== null}
                  className="h-7 text-xs text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-border mt-2">
          <Button variant="outline" onClick={() => window.open(issue.url, '_blank')}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in GitHub
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

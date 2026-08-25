import type { BranchSyncResult } from '@/lib/http-api-client';
import { branchStateLabel } from '@/hooks/use-branch-sync';

/**
 * Turns a broken branch into a task an agent can actually pick up.
 *
 * The sidebar knows exactly what git said and which files are conflicted, and
 * that is precisely the context an agent otherwise has to rediscover. Handing
 * it over as the task description means the agent starts from the diagnosis
 * instead of from "something is wrong with this branch".
 */
export function buildBranchFixTask(sync: BranchSyncResult): { title: string; description: string } {
  const conflicted = sync.conflictedFiles.length > 0;

  const title = conflicted
    ? `Resolve merge conflicts on ${sync.branch}`
    : `Get ${sync.branch} back in sync with ${sync.upstream ?? 'its remote'}`;

  const facts: string[] = [
    `- Branch: \`${sync.branch}\``,
    sync.upstream ? `- Upstream: \`${sync.upstream}\`` : '- Upstream: none configured',
    `- State: ${branchStateLabel(sync.state)}`,
    `- ${sync.ahead} commit(s) ahead, ${sync.behind} commit(s) behind`,
    `- ${sync.dirtyCount} uncommitted change(s) in the worktree`,
  ];

  if (sync.message) facts.push(`- Git reported: ${sync.message}`);

  const sections: string[] = [
    'This branch has fallen out of sync with its remote and the automatic',
    'fast-forward could not put it right.',
    '',
    '## What the sidebar found',
    '',
    ...facts,
  ];

  if (conflicted) {
    sections.push(
      '',
      '## Conflicted files',
      '',
      ...sync.conflictedFiles.map((file) => `- \`${file}\``)
    );
  }

  sections.push(
    '',
    '## What to do',
    '',
    conflicted
      ? [
          '1. Read each conflicted file and work out what both sides were trying to do.',
          '2. Resolve every conflict so the result keeps both intents — do not just take one side unless that is genuinely correct.',
          '3. Remove every conflict marker, then make sure the project still builds and its tests still pass.',
          '4. Stage the resolved files and complete the merge or rebase that is in progress.',
          '5. Report what each conflict was about and how you resolved it.',
        ].join('\n')
      : [
          `1. Fetch the remote and inspect how \`${sync.branch}\` and \`${sync.upstream ?? 'its upstream'}\` have moved apart.`,
          '2. Bring the branch back in line — rebase local commits onto the upstream where that is clean, or merge where a rebase would rewrite shared history.',
          '3. Preserve any uncommitted work; commit or stash it deliberately rather than discarding it.',
          '4. Make sure the project still builds and its tests still pass afterwards.',
          '5. Report what diverged and what you did about it.',
        ].join('\n'),
    '',
    'Do not force-push, and do not discard local commits without saying so.'
  );

  return { title, description: sections.join('\n') };
}

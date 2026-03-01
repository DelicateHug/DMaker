/**
 * GitHub routes - HTTP API for GitHub integration
 *
 * Consolidated from github/ directory into a single module.
 */

import { exec } from 'child_process';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { EventEmitter } from '../lib/events.js';
import type {
  IssueValidationResult,
  IssueValidationEvent,
  ModelId,
  GitHubComment,
  LinkedPRInfo,
  ThinkingLevel,
  ReasoningEffort,
} from '@dmaker/types';
import {
  DEFAULT_PHASE_MODELS,
  isClaudeModel,
  isCodexModel,
  isCursorModel,
  isOpencodeModel,
} from '@dmaker/types';
import type { IssueCommentsResult } from '@dmaker/types';
import { resolvePhaseModel } from '@dmaker/model-resolver';
import { createLogger } from '@dmaker/utils';
import { validatePathParams } from '../middleware.js';
import { extractJson } from '../lib/json-extractor.js';
import {
  readValidation,
  getAllValidations,
  getValidationWithFreshness,
  deleteValidation,
  markValidationViewed,
  writeValidation,
} from '../lib/validation-storage.js';
import { streamingQuery } from '../providers/simple-query-service.js';
import { getPromptCustomization, getAutoLoadClaudeMdSetting } from '../lib/settings-helpers.js';
import { getGitHubSyncService } from '../services/github-sync-service.js';
import { FeatureLoader } from '../services/feature-loader.js';
import type { SettingsService } from '../services/settings-service.js';

// ─── Logger & Helpers ────────────────────────────────────────────────────────

const logger = createLogger('GitHub');
const listIssuesLogger = createLogger('ListIssues');
const validationLogger = createLogger('IssueValidation');

const execAsync = promisify(exec);

const extendedPath = [
  process.env.PATH,
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/home/linuxbrew/.linuxbrew/bin',
  `${process.env.HOME}/.local/bin`,
]
  .filter(Boolean)
  .join(':');

const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function logError(error: unknown, context: string): void {
  logger.error(`${context}:`, error);
}

// ─── Validation State Management ─────────────────────────────────────────────

interface ValidationStatus {
  isRunning: boolean;
  abortController: AbortController;
  startedAt: Date;
}

const validationStatusMap = new Map<string, ValidationStatus>();

const MAX_VALIDATION_AGE_MS = 60 * 60 * 1000;

function getValidationKey(projectPath: string, issueNumber: number): string {
  return `${projectPath}||${issueNumber}`;
}

function isValidationRunning(projectPath: string, issueNumber: number): boolean {
  const key = getValidationKey(projectPath, issueNumber);
  const status = validationStatusMap.get(key);
  return status?.isRunning ?? false;
}

function getValidationStatusInfo(
  projectPath: string,
  issueNumber: number
): { isRunning: boolean; startedAt?: Date } | null {
  const key = getValidationKey(projectPath, issueNumber);
  const status = validationStatusMap.get(key);
  if (!status) {
    return null;
  }
  return {
    isRunning: status.isRunning,
    startedAt: status.startedAt,
  };
}

function getRunningValidations(projectPath: string): number[] {
  const runningIssues: number[] = [];
  const prefix = `${projectPath}||`;
  for (const [key, status] of validationStatusMap.entries()) {
    if (status.isRunning && key.startsWith(prefix)) {
      const issueNumber = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(issueNumber)) {
        runningIssues.push(issueNumber);
      }
    }
  }
  return runningIssues;
}

function setValidationRunning(
  projectPath: string,
  issueNumber: number,
  abortController: AbortController
): void {
  const key = getValidationKey(projectPath, issueNumber);
  validationStatusMap.set(key, {
    isRunning: true,
    abortController,
    startedAt: new Date(),
  });
}

function trySetValidationRunning(
  projectPath: string,
  issueNumber: number,
  abortController: AbortController
): boolean {
  const key = getValidationKey(projectPath, issueNumber);
  if (validationStatusMap.has(key)) {
    return false;
  }
  validationStatusMap.set(key, {
    isRunning: true,
    abortController,
    startedAt: new Date(),
  });
  return true;
}

export function cleanupStaleValidations(): number {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [key, status] of validationStatusMap.entries()) {
    if (now - status.startedAt.getTime() > MAX_VALIDATION_AGE_MS) {
      status.abortController.abort();
      validationStatusMap.delete(key);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    validationLogger.info(`Cleaned up ${cleanedCount} stale validation entries`);
  }
  return cleanedCount;
}

function clearValidationStatus(projectPath: string, issueNumber: number): void {
  const key = getValidationKey(projectPath, issueNumber);
  validationStatusMap.delete(key);
}

function abortValidation(projectPath: string, issueNumber: number): boolean {
  const key = getValidationKey(projectPath, issueNumber);
  const status = validationStatusMap.get(key);

  if (!status || !status.isRunning) {
    return false;
  }

  status.abortController.abort();
  validationStatusMap.delete(key);
  return true;
}

// ─── Validation Schema ───────────────────────────────────────────────────────

const issueValidationSchema = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['valid', 'invalid', 'needs_clarification'],
      description: 'The validation verdict for the issue',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'How confident the AI is in its assessment',
    },
    reasoning: {
      type: 'string',
      description: 'Detailed explanation of the verdict',
    },
    bugConfirmed: {
      type: 'boolean',
      description: 'For bug reports: whether the bug was confirmed in the codebase',
    },
    relatedFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Files related to the issue found during analysis',
    },
    suggestedFix: {
      type: 'string',
      description: 'Suggested approach to fix or implement the issue',
    },
    missingInfo: {
      type: 'array',
      items: { type: 'string' },
      description: 'Information needed when verdict is needs_clarification',
    },
    estimatedComplexity: {
      type: 'string',
      enum: ['trivial', 'simple', 'moderate', 'complex', 'very_complex'],
      description: 'Estimated effort to address the issue',
    },
    prAnalysis: {
      type: 'object',
      properties: {
        hasOpenPR: {
          type: 'boolean',
          description: 'Whether there is an open PR linked to this issue',
        },
        prFixesIssue: {
          type: 'boolean',
          description: 'Whether the PR appears to fix the issue based on the diff',
        },
        prNumber: {
          type: 'number',
          description: 'The PR number that was analyzed',
        },
        prSummary: {
          type: 'string',
          description: 'Brief summary of what the PR changes',
        },
        recommendation: {
          type: 'string',
          enum: ['wait_for_merge', 'pr_needs_work', 'no_pr'],
          description:
            'Recommendation: wait for PR to merge, PR needs more work, or no relevant PR',
        },
      },
      description: 'Analysis of linked pull requests if any exist',
    },
  },
  required: ['verdict', 'confidence', 'reasoning'],
  additionalProperties: false,
} as const;

interface ValidationComment {
  author: string;
  createdAt: string;
  body: string;
}

interface ValidationLinkedPR {
  number: number;
  title: string;
  state: string;
}

function buildValidationPrompt(
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  issueLabels?: string[],
  comments?: ValidationComment[],
  linkedPRs?: ValidationLinkedPR[]
): string {
  const labelsSection = issueLabels?.length ? `\n\n**Labels:** ${issueLabels.join(', ')}` : '';

  let linkedPRsSection = '';
  if (linkedPRs && linkedPRs.length > 0) {
    const prsText = linkedPRs
      .map((pr) => `- PR #${pr.number} (${pr.state}): ${pr.title}`)
      .join('\n');
    linkedPRsSection = `\n\n### Linked Pull Requests\n\n${prsText}`;
  }

  let commentsSection = '';
  if (comments && comments.length > 0) {
    const recentComments = comments.slice(-10);
    const commentsText = recentComments
      .map(
        (c) => `**${c.author}** (${new Date(c.createdAt).toISOString().slice(0, 10)}):\n${c.body}`
      )
      .join('\n\n---\n\n');

    commentsSection = `\n\n### Comments (${comments.length} total${comments.length > 10 ? ', showing last 10' : ''})\n\n${commentsText}`;
  }

  const hasWorkInProgress =
    linkedPRs && linkedPRs.some((pr) => pr.state === 'open' || pr.state === 'OPEN');
  const workInProgressNote = hasWorkInProgress
    ? '\n\n**Note:** This issue has an open pull request linked. Consider that someone may already be working on a fix.'
    : '';

  return `Please validate the following GitHub issue by analyzing the codebase:

## Issue #${issueNumber}: ${issueTitle}
${labelsSection}
${linkedPRsSection}

### Description

${issueBody || '(No description provided)'}
${commentsSection}
${workInProgressNote}

---

Scan the codebase to verify this issue. Look for the files, components, or functionality mentioned. Determine if this issue is valid, invalid, or needs clarification.${comments && comments.length > 0 ? ' Consider the context provided in the comments as well.' : ''}${hasWorkInProgress ? ' Also note in your analysis if there is already work in progress on this issue.' : ''}`;
}

// ─── Check GitHub Remote ─────────────────────────────────────────────────────

const GIT_REMOTE_ORIGIN_COMMAND = 'git remote get-url origin';
const GH_REPO_VIEW_COMMAND = 'gh repo view --json name,owner';
const GITHUB_REPO_URL_PREFIX = 'https://github.com/';
const GITHUB_HTTPS_REMOTE_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/.]+)/;
const GITHUB_SSH_REMOTE_REGEX = /git@github\.com:([^/]+)\/([^/.]+)/;

interface GhRepoViewResponse {
  name?: string;
  owner?: {
    login?: string;
  };
}

async function resolveRepoFromGh(projectPath: string): Promise<{
  owner: string;
  repo: string;
} | null> {
  try {
    const { stdout } = await execAsync(GH_REPO_VIEW_COMMAND, {
      cwd: projectPath,
      env: execEnv,
    });

    const data = JSON.parse(stdout) as GhRepoViewResponse;
    const owner = typeof data.owner?.login === 'string' ? data.owner.login : null;
    const repo = typeof data.name === 'string' ? data.name : null;

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

export interface GitHubRemoteStatus {
  hasGitHubRemote: boolean;
  remoteUrl: string | null;
  owner: string | null;
  repo: string | null;
}

export async function checkGitHubRemote(
  projectPath: string,
  githubRepoOverride?: string
): Promise<GitHubRemoteStatus> {
  if (githubRepoOverride) {
    const parts = githubRepoOverride.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return {
        hasGitHubRemote: true,
        remoteUrl: `https://github.com/${parts[0]}/${parts[1]}`,
        owner: parts[0],
        repo: parts[1],
      };
    }
  }

  const status: GitHubRemoteStatus = {
    hasGitHubRemote: false,
    remoteUrl: null,
    owner: null,
    repo: null,
  };

  try {
    let remoteUrl = '';
    try {
      const { stdout } = await execAsync(GIT_REMOTE_ORIGIN_COMMAND, {
        cwd: projectPath,
        env: execEnv,
      });
      remoteUrl = stdout.trim();
      status.remoteUrl = remoteUrl || null;
    } catch {
      // Ignore missing origin remote
    }

    const ghRepo = await resolveRepoFromGh(projectPath);
    if (ghRepo) {
      status.hasGitHubRemote = true;
      status.owner = ghRepo.owner;
      status.repo = ghRepo.repo;
      if (!status.remoteUrl) {
        status.remoteUrl = `${GITHUB_REPO_URL_PREFIX}${ghRepo.owner}/${ghRepo.repo}`;
      }
      return status;
    }

    if (!remoteUrl) {
      return status;
    }

    const httpsMatch = remoteUrl.match(GITHUB_HTTPS_REMOTE_REGEX);
    const sshMatch = remoteUrl.match(GITHUB_SSH_REMOTE_REGEX);

    const match = httpsMatch || sshMatch;
    if (match) {
      status.hasGitHubRemote = true;
      status.owner = match[1];
      status.repo = match[2].replace(/\.git$/, '');
    }
  } catch {
    // No remote or not a git repo - that's okay
  }

  return status;
}

// ─── List Issues ─────────────────────────────────────────────────────────────

const OPEN_ISSUES_LIMIT = 100;
const CLOSED_ISSUES_LIMIT = 50;
const ISSUE_LIST_FIELDS = 'number,title,state,author,createdAt,closedAt,labels,url,body,assignees';
const ISSUE_STATE_OPEN = 'open';
const ISSUE_STATE_CLOSED = 'closed';
const GH_ISSUE_LIST_COMMAND = 'gh issue list';
const GH_STATE_FLAG = '--state';
const GH_JSON_FLAG = '--json';
const GH_LIMIT_FLAG = '--limit';
const LINKED_PRS_BATCH_SIZE = 20;
const LINKED_PRS_TIMELINE_ITEMS = 10;

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubAuthor {
  login: string;
  avatarUrl?: string;
}

export interface GitHubAssignee {
  login: string;
  avatarUrl?: string;
}

export interface LinkedPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  author: GitHubAuthor;
  createdAt: string;
  closedAt?: string;
  labels: GitHubLabel[];
  url: string;
  body: string;
  assignees: GitHubAssignee[];
  linkedPRs?: LinkedPullRequest[];
}

export interface ListIssuesResult {
  success: boolean;
  openIssues?: GitHubIssue[];
  closedIssues?: GitHubIssue[];
  owner?: string;
  repo?: string;
  error?: string;
}

async function fetchLinkedPRs(
  projectPath: string,
  owner: string,
  repo: string,
  issueNumbers: number[]
): Promise<Map<number, LinkedPullRequest[]>> {
  const linkedPRsMap = new Map<number, LinkedPullRequest[]>();

  if (issueNumbers.length === 0) {
    return linkedPRsMap;
  }

  for (let i = 0; i < issueNumbers.length; i += LINKED_PRS_BATCH_SIZE) {
    const batch = issueNumbers.slice(i, i + LINKED_PRS_BATCH_SIZE);

    const issueQueries = batch
      .map(
        (num, idx) => `
        issue${idx}: issueOrPullRequest(number: ${num}) {
          ... on Issue {
            number
            timelineItems(
              first: ${LINKED_PRS_TIMELINE_ITEMS}
              itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]
            ) {
              nodes {
                ... on CrossReferencedEvent {
                  source {
                    ... on PullRequest {
                      number
                      title
                      state
                      url
                    }
                  }
                }
                ... on ConnectedEvent {
                  subject {
                    ... on PullRequest {
                      number
                      title
                      state
                      url
                    }
                  }
                }
              }
            }
          }
          ... on PullRequest {
            number
            timelineItems(
              first: ${LINKED_PRS_TIMELINE_ITEMS}
              itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]
            ) {
              nodes {
                ... on CrossReferencedEvent {
                  source {
                    ... on PullRequest {
                      number
                      title
                      state
                      url
                    }
                  }
                }
                ... on ConnectedEvent {
                  subject {
                    ... on PullRequest {
                      number
                      title
                      state
                      url
                    }
                  }
                }
              }
            }
          }
        }`
      )
      .join('\n');

    const query = `{
      repository(owner: "${owner}", name: "${repo}") {
        ${issueQueries}
      }
    }`;

    try {
      const requestBody = JSON.stringify({ query });
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const gh = spawn('gh', ['api', 'graphql', '--input', '-'], {
          cwd: projectPath,
          env: execEnv,
        });

        let stdout = '';
        let stderr = '';
        gh.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
        gh.stderr.on('data', (data: Buffer) => (stderr += data.toString()));

        gh.on('close', (code) => {
          if (code !== 0) {
            return reject(new Error(`gh process exited with code ${code}: ${stderr}`));
          }
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(e);
          }
        });

        gh.stdin.write(requestBody);
        gh.stdin.end();
      });

      const repoData = (response?.data as Record<string, unknown>)?.repository as Record<
        string,
        unknown
      > | null;

      if (repoData) {
        batch.forEach((issueNum, idx) => {
          const issueData = repoData[`issue${idx}`] as {
            timelineItems?: {
              nodes?: Array<{
                source?: { number?: number; title?: string; state?: string; url?: string };
                subject?: { number?: number; title?: string; state?: string; url?: string };
              }>;
            };
          } | null;
          if (issueData?.timelineItems?.nodes) {
            const linkedPRs: LinkedPullRequest[] = [];
            const seenPRs = new Set<number>();

            for (const node of issueData.timelineItems.nodes) {
              const pr = node?.source || node?.subject;
              if (pr?.number && !seenPRs.has(pr.number)) {
                seenPRs.add(pr.number);
                linkedPRs.push({
                  number: pr.number,
                  title: pr.title || '',
                  state: (pr.state || '').toLowerCase(),
                  url: pr.url || '',
                });
              }
            }

            if (linkedPRs.length > 0) {
              linkedPRsMap.set(issueNum, linkedPRs);
            }
          }
        });
      }
    } catch (error) {
      listIssuesLogger.warn(
        'Failed to fetch linked PRs via GraphQL:',
        error instanceof Error ? error.message : error
      );
    }
  }

  return linkedPRsMap;
}

// ─── List PRs ────────────────────────────────────────────────────────────────

const OPEN_PRS_LIMIT = 100;
const MERGED_PRS_LIMIT = 50;
const PR_LIST_FIELDS =
  'number,title,state,author,createdAt,labels,url,isDraft,headRefName,reviewDecision,mergeable,body';
const PR_STATE_OPEN = 'open';
const PR_STATE_MERGED = 'merged';
const GH_PR_LIST_COMMAND = 'gh pr list';

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: { login: string };
  createdAt: string;
  labels: GitHubLabel[];
  url: string;
  isDraft: boolean;
  headRefName: string;
  reviewDecision: string | null;
  mergeable: string;
  body: string;
}

export interface ListPRsResult {
  success: boolean;
  openPRs?: GitHubPR[];
  mergedPRs?: GitHubPR[];
  error?: string;
}

// ─── List Comments (GraphQL) ─────────────────────────────────────────────────

interface GraphQLComment {
  id: string;
  author: {
    login: string;
    avatarUrl?: string;
  } | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface GraphQLCommentConnection {
  totalCount: number;
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  nodes: GraphQLComment[];
}

interface GraphQLIssueOrPullRequest {
  __typename: 'Issue' | 'PullRequest';
  comments: GraphQLCommentConnection;
}

interface GraphQLResponse {
  data?: {
    repository?: {
      issueOrPullRequest?: GraphQLIssueOrPullRequest | null;
    };
  };
  errors?: Array<{ message: string }>;
}

const GITHUB_API_TIMEOUT_MS = 30000;
const COMMENTS_PAGE_SIZE = 50;

function isValidCursor(cursor: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(cursor);
}

async function fetchIssueComments(
  projectPath: string,
  owner: string,
  repo: string,
  issueNumber: number,
  cursor?: string
): Promise<IssueCommentsResult> {
  if (cursor && !isValidCursor(cursor)) {
    throw new Error('Invalid cursor format');
  }

  const query = `
    query GetIssueComments(
      $owner: String!
      $repo: String!
      $issueNumber: Int!
      $cursor: String
      $pageSize: Int!
    ) {
      repository(owner: $owner, name: $repo) {
        issueOrPullRequest(number: $issueNumber) {
          __typename
          ... on Issue {
            comments(first: $pageSize, after: $cursor) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                author {
                  login
                  avatarUrl
                }
                body
                createdAt
                updatedAt
              }
            }
          }
          ... on PullRequest {
            comments(first: $pageSize, after: $cursor) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                author {
                  login
                  avatarUrl
                }
                body
                createdAt
                updatedAt
              }
            }
          }
        }
      }
    }`;

  const variables = {
    owner,
    repo,
    issueNumber,
    cursor: cursor || null,
    pageSize: COMMENTS_PAGE_SIZE,
  };

  const requestBody = JSON.stringify({ query, variables });

  const response = await new Promise<GraphQLResponse>((resolve, reject) => {
    const gh = spawn('gh', ['api', 'graphql', '--input', '-'], {
      cwd: projectPath,
      env: execEnv,
    });

    const timeoutId = setTimeout(() => {
      gh.kill();
      reject(new Error('GitHub API request timed out'));
    }, GITHUB_API_TIMEOUT_MS);

    let stdout = '';
    let stderr = '';
    gh.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
    gh.stderr.on('data', (data: Buffer) => (stderr += data.toString()));

    gh.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        return reject(new Error(`gh process exited with code ${code}: ${stderr}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(e);
      }
    });

    gh.stdin.write(requestBody);
    gh.stdin.end();
  });

  if (response.errors && response.errors.length > 0) {
    throw new Error(response.errors[0].message);
  }

  const commentsData = response.data?.repository?.issueOrPullRequest?.comments;

  if (!commentsData) {
    throw new Error('Issue or pull request not found or no comments data available');
  }

  const ghComments: GitHubComment[] = commentsData.nodes.map((node) => ({
    id: node.id,
    author: {
      login: node.author?.login || 'ghost',
      avatarUrl: node.author?.avatarUrl,
    },
    body: node.body,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }));

  return {
    comments: ghComments,
    totalCount: commentsData.totalCount,
    hasNextPage: commentsData.pageInfo.hasNextPage,
    endCursor: commentsData.pageInfo.endCursor || undefined,
  };
}

// ─── Validate Issue ──────────────────────────────────────────────────────────

interface ValidateIssueRequestBody {
  projectPath: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  model?: ModelId;
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: ReasoningEffort;
  comments?: GitHubComment[];
  linkedPRs?: LinkedPRInfo[];
}

async function runValidation(
  projectPath: string,
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  issueLabels: string[] | undefined,
  model: ModelId,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  comments?: ValidationComment[],
  linkedPRs?: ValidationLinkedPR[],
  thinkingLevel?: ThinkingLevel,
  reasoningEffort?: ReasoningEffort
): Promise<void> {
  const startEvent: IssueValidationEvent = {
    type: 'issue_validation_start',
    issueNumber,
    issueTitle,
    projectPath,
  };
  events.emit('issue-validation:event', startEvent);

  const VALIDATION_TIMEOUT_MS = 360000;
  const timeoutId = setTimeout(() => {
    validationLogger.warn(`Validation timeout reached after ${VALIDATION_TIMEOUT_MS}ms`);
    abortController.abort();
  }, VALIDATION_TIMEOUT_MS);

  try {
    const basePrompt = buildValidationPrompt(
      issueNumber,
      issueTitle,
      issueBody,
      issueLabels,
      comments,
      linkedPRs
    );

    let responseText = '';

    const prompts = await getPromptCustomization(settingsService, '[ValidateIssue]');
    const issueValidationSystemPrompt = prompts.issueValidation.systemPrompt;

    const useStructuredOutput = isClaudeModel(model) || isCodexModel(model);

    let finalPrompt = basePrompt;
    if (!useStructuredOutput) {
      finalPrompt = `${issueValidationSystemPrompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. Respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
3. The JSON must match this exact schema:

${JSON.stringify(issueValidationSchema, null, 2)}

Your entire response should be valid JSON starting with { and ending with }. No text before or after.

${basePrompt}`;
    }

    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      settingsService,
      '[ValidateIssue]'
    );

    let effectiveThinkingLevel: ThinkingLevel | undefined = thinkingLevel;
    let effectiveReasoningEffort: ReasoningEffort | undefined = reasoningEffort;
    if (!effectiveThinkingLevel || !effectiveReasoningEffort) {
      const settings = await settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.validationModel || DEFAULT_PHASE_MODELS.validationModel;
      const resolved = resolvePhaseModel(phaseModelEntry);
      if (!effectiveThinkingLevel) {
        effectiveThinkingLevel = resolved.thinkingLevel;
      }
      if (!effectiveReasoningEffort && typeof phaseModelEntry !== 'string') {
        effectiveReasoningEffort = phaseModelEntry.reasoningEffort;
      }
    }

    validationLogger.info(`Using model: ${model}`);

    const result = await streamingQuery({
      prompt: finalPrompt,
      model: model as string,
      cwd: projectPath,
      systemPrompt: useStructuredOutput ? issueValidationSystemPrompt : undefined,
      abortController,
      thinkingLevel: effectiveThinkingLevel,
      reasoningEffort: effectiveReasoningEffort,
      readOnly: true,
      settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
      outputFormat: useStructuredOutput
        ? {
            type: 'json_schema',
            schema: issueValidationSchema as Record<string, unknown>,
          }
        : undefined,
      onText: (text) => {
        responseText += text;
        const progressEvent: IssueValidationEvent = {
          type: 'issue_validation_progress',
          issueNumber,
          content: text,
          projectPath,
        };
        events.emit('issue-validation:event', progressEvent);
      },
    });

    clearTimeout(timeoutId);

    let validationResult: IssueValidationResult | null = null;

    if (result.structured_output) {
      validationResult = result.structured_output as unknown as IssueValidationResult;
      validationLogger.debug('Received structured output:', validationResult);
    } else if (responseText) {
      validationResult = extractJson<IssueValidationResult>(responseText, {
        logger: validationLogger,
      });
    }

    if (!validationResult) {
      validationLogger.error('No validation result received from AI provider');
      throw new Error('Validation failed: no valid result received');
    }

    validationLogger.info(`Issue #${issueNumber} validation complete: ${validationResult.verdict}`);

    await writeValidation(projectPath, issueNumber, {
      issueNumber,
      issueTitle,
      validatedAt: new Date().toISOString(),
      model,
      result: validationResult,
    });

    const completeEvent: IssueValidationEvent = {
      type: 'issue_validation_complete',
      issueNumber,
      issueTitle,
      result: validationResult,
      projectPath,
      model,
    };
    events.emit('issue-validation:event', completeEvent);
  } catch (error) {
    clearTimeout(timeoutId);

    const errorMessage = getErrorMessage(error);
    logError(error, `Issue #${issueNumber} validation failed`);

    const errorEvent: IssueValidationEvent = {
      type: 'issue_validation_error',
      issueNumber,
      error: errorMessage,
      projectPath,
    };
    events.emit('issue-validation:event', errorEvent);

    throw error;
  }
}

// ─── Manage Issue (generic action handler) ───────────────────────────────────

function createIssueActionHandler(
  action:
    | 'lockIssue'
    | 'unlockIssue'
    | 'pinIssue'
    | 'unpinIssue'
    | 'deleteIssue'
    | 'reopenIssue'
    | 'closeIssue',
  label: string
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber: number;
      };

      if (!projectPath || !issueNumber) {
        res.status(400).json({ success: false, error: 'projectPath and issueNumber are required' });
        return;
      }

      const syncService = getGitHubSyncService();
      const result = await syncService[action](projectPath, issueNumber);

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, `${label} failed`);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ─── Route Handler Factories ─────────────────────────────────────────────────

function createCheckGitHubRemoteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const status = await checkGitHubRemote(projectPath);
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Check GitHub remote failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createListIssuesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, githubRepo } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const remoteStatus = await checkGitHubRemote(projectPath, githubRepo);
      if (!remoteStatus.hasGitHubRemote) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      const repoQualifier =
        remoteStatus.owner && remoteStatus.repo ? `${remoteStatus.owner}/${remoteStatus.repo}` : '';
      const repoFlag = repoQualifier ? `-R ${repoQualifier}` : '';
      const [openResult, closedResult] = await Promise.all([
        execAsync(
          [
            GH_ISSUE_LIST_COMMAND,
            repoFlag,
            `${GH_STATE_FLAG} ${ISSUE_STATE_OPEN}`,
            `${GH_JSON_FLAG} ${ISSUE_LIST_FIELDS}`,
            `${GH_LIMIT_FLAG} ${OPEN_ISSUES_LIMIT}`,
          ]
            .filter(Boolean)
            .join(' '),
          {
            cwd: projectPath,
            env: execEnv,
          }
        ),
        execAsync(
          [
            GH_ISSUE_LIST_COMMAND,
            repoFlag,
            `${GH_STATE_FLAG} ${ISSUE_STATE_CLOSED}`,
            `${GH_JSON_FLAG} ${ISSUE_LIST_FIELDS}`,
            `${GH_LIMIT_FLAG} ${CLOSED_ISSUES_LIMIT}`,
          ]
            .filter(Boolean)
            .join(' '),
          {
            cwd: projectPath,
            env: execEnv,
          }
        ),
      ]);

      const { stdout: openStdout } = openResult;
      const { stdout: closedStdout } = closedResult;

      const openIssues: GitHubIssue[] = JSON.parse(openStdout || '[]');
      const closedIssues: GitHubIssue[] = JSON.parse(closedStdout || '[]');

      if (remoteStatus.owner && remoteStatus.repo && openIssues.length > 0) {
        const linkedPRsMap = await fetchLinkedPRs(
          projectPath,
          remoteStatus.owner,
          remoteStatus.repo,
          openIssues.map((i) => i.number)
        );

        for (const issue of openIssues) {
          const linkedPRs = linkedPRsMap.get(issue.number);
          if (linkedPRs) {
            issue.linkedPRs = linkedPRs;
          }
        }
      }

      if (remoteStatus.owner && remoteStatus.repo && closedIssues.length > 0) {
        const closedLinkedPRsMap = await fetchLinkedPRs(
          projectPath,
          remoteStatus.owner,
          remoteStatus.repo,
          closedIssues.map((i) => i.number)
        );

        for (const issue of closedIssues) {
          const linkedPRs = closedLinkedPRsMap.get(issue.number);
          if (linkedPRs) {
            issue.linkedPRs = linkedPRs;
          }
        }
      }

      res.json({
        success: true,
        openIssues,
        closedIssues,
        owner: remoteStatus.owner ?? undefined,
        repo: remoteStatus.repo ?? undefined,
      });
    } catch (error) {
      logError(error, 'List GitHub issues failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createListPRsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, githubRepo } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const remoteStatus = await checkGitHubRemote(projectPath, githubRepo);
      if (!remoteStatus.hasGitHubRemote) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      const repoQualifier =
        remoteStatus.owner && remoteStatus.repo ? `${remoteStatus.owner}/${remoteStatus.repo}` : '';
      const repoFlag = repoQualifier ? `-R ${repoQualifier}` : '';

      const [openResult, mergedResult] = await Promise.all([
        execAsync(
          [
            GH_PR_LIST_COMMAND,
            repoFlag,
            `${GH_STATE_FLAG} ${PR_STATE_OPEN}`,
            `${GH_JSON_FLAG} ${PR_LIST_FIELDS}`,
            `${GH_LIMIT_FLAG} ${OPEN_PRS_LIMIT}`,
          ]
            .filter(Boolean)
            .join(' '),
          {
            cwd: projectPath,
            env: execEnv,
          }
        ),
        execAsync(
          [
            GH_PR_LIST_COMMAND,
            repoFlag,
            `${GH_STATE_FLAG} ${PR_STATE_MERGED}`,
            `${GH_JSON_FLAG} ${PR_LIST_FIELDS}`,
            `${GH_LIMIT_FLAG} ${MERGED_PRS_LIMIT}`,
          ]
            .filter(Boolean)
            .join(' '),
          {
            cwd: projectPath,
            env: execEnv,
          }
        ),
      ]);
      const { stdout: openStdout } = openResult;
      const { stdout: mergedStdout } = mergedResult;

      const openPRs: GitHubPR[] = JSON.parse(openStdout || '[]');
      const mergedPRs: GitHubPR[] = JSON.parse(mergedStdout || '[]');

      res.json({
        success: true,
        openPRs,
        mergedPRs,
      });
    } catch (error) {
      logError(error, 'List GitHub PRs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createListCommentsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber, cursor, githubRepo } = req.body as {
        projectPath: string;
        issueNumber: number;
        cursor?: string;
        githubRepo?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      const remoteStatus = await checkGitHubRemote(projectPath, githubRepo);
      if (!remoteStatus.hasGitHubRemote || !remoteStatus.owner || !remoteStatus.repo) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      const result = await fetchIssueComments(
        projectPath,
        remoteStatus.owner,
        remoteStatus.repo,
        issueNumber,
        cursor
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logError(error, `Fetch comments for issue failed`);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createValidateIssueHandler(events: EventEmitter, settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        issueNumber,
        issueTitle,
        issueBody,
        issueLabels,
        model = 'opus',
        thinkingLevel,
        reasoningEffort,
        comments: rawComments,
        linkedPRs: rawLinkedPRs,
      } = req.body as ValidateIssueRequestBody;

      const validationComments: ValidationComment[] | undefined = rawComments?.map((c) => ({
        author: c.author?.login || 'ghost',
        createdAt: c.createdAt,
        body: c.body,
      }));

      const validationLinkedPRs: ValidationLinkedPR[] | undefined = rawLinkedPRs?.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
      }));

      validationLogger.info(
        `[ValidateIssue] Received validation request for issue #${issueNumber}` +
          (rawComments?.length ? ` with ${rawComments.length} comments` : ' (no comments)') +
          (rawLinkedPRs?.length ? ` and ${rawLinkedPRs.length} linked PRs` : '')
      );

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      if (!issueTitle || typeof issueTitle !== 'string') {
        res.status(400).json({ success: false, error: 'issueTitle is required' });
        return;
      }

      if (typeof issueBody !== 'string') {
        res.status(400).json({ success: false, error: 'issueBody must be a string' });
        return;
      }

      const isValidModel =
        isClaudeModel(model) ||
        isCursorModel(model) ||
        isCodexModel(model) ||
        isOpencodeModel(model);

      if (!isValidModel) {
        res.status(400).json({
          success: false,
          error: 'Invalid model. Must be a Claude, Cursor, Codex, or OpenCode model ID (or alias).',
        });
        return;
      }

      validationLogger.info(`Starting async validation for issue #${issueNumber}: ${issueTitle}`);

      const abortController = new AbortController();
      if (!trySetValidationRunning(projectPath, issueNumber, abortController)) {
        res.json({
          success: false,
          error: `Validation is already running for issue #${issueNumber}`,
        });
        return;
      }

      runValidation(
        projectPath,
        issueNumber,
        issueTitle,
        issueBody,
        issueLabels,
        model,
        events,
        abortController,
        settingsService,
        validationComments,
        validationLinkedPRs,
        thinkingLevel,
        reasoningEffort
      )
        .catch(() => {
          // Error is already handled inside runValidation (event emitted)
        })
        .finally(() => {
          clearValidationStatus(projectPath, issueNumber);
        });

      res.json({
        success: true,
        message: `Validation started for issue #${issueNumber}`,
        issueNumber,
      });
    } catch (error) {
      logError(error, `Issue validation failed`);
      validationLogger.error('Issue validation error:', error);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: getErrorMessage(error),
        });
      }
    }
  };
}

function createValidationStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber?: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (issueNumber !== undefined) {
        const status = getValidationStatusInfo(projectPath, issueNumber);
        res.json({
          success: true,
          isRunning: status?.isRunning ?? false,
          startedAt: status?.startedAt?.toISOString(),
        });
        return;
      }

      const runningIssues = getRunningValidations(projectPath);
      res.json({
        success: true,
        runningIssues,
      });
    } catch (error) {
      logError(error, 'Validation status check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createValidationStopHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      const wasAborted = abortValidation(projectPath, issueNumber);

      if (wasAborted) {
        validationLogger.info(`Validation for issue #${issueNumber} was stopped`);
        res.json({
          success: true,
          message: `Validation for issue #${issueNumber} has been stopped`,
        });
      } else {
        res.json({
          success: false,
          error: `No validation is running for issue #${issueNumber}`,
        });
      }
    } catch (error) {
      logError(error, 'Validation stop failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createGetValidationsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber?: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (issueNumber !== undefined) {
        const result = await getValidationWithFreshness(projectPath, issueNumber);

        if (!result) {
          res.json({
            success: true,
            validation: null,
          });
          return;
        }

        res.json({
          success: true,
          validation: result.validation,
          isStale: result.isStale,
        });
        return;
      }

      const validations = await getAllValidations(projectPath);

      res.json({
        success: true,
        validations,
      });
    } catch (error) {
      logError(error, 'Get validations failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createDeleteValidationHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      const deleted = await deleteValidation(projectPath, issueNumber);

      res.json({
        success: true,
        deleted,
      });
    } catch (error) {
      logError(error, 'Delete validation failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createMarkViewedHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      const success = await markValidationViewed(projectPath, issueNumber);

      if (success) {
        const viewedEvent: IssueValidationEvent = {
          type: 'issue_validation_viewed',
          issueNumber,
          projectPath,
        };
        events.emit('issue-validation:event', viewedEvent);
      }

      res.json({ success });
    } catch (error) {
      logError(error, 'Mark validation viewed failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

const featureLoaderInstance = new FeatureLoader();

function createClaimIssueHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, issueNumber } = req.body as {
        projectPath: string;
        featureId: string;
        issueNumber: number;
      };

      if (!projectPath || !featureId || !issueNumber) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, featureId and issueNumber are required' });
        return;
      }

      const syncService = getGitHubSyncService(events);
      const currentUser = await syncService.getCurrentUser(projectPath);
      if (!currentUser) {
        res.status(400).json({
          success: false,
          error: 'Not authenticated with GitHub CLI. Run `gh auth login` first.',
        });
        return;
      }

      const claimResult = await syncService.claimIssue(projectPath, issueNumber);
      if (!claimResult.success) {
        res.status(500).json({ success: false, error: claimResult.error });
        return;
      }

      const issueData = await syncService.syncIssueData(projectPath, issueNumber);
      const now = new Date().toISOString();

      await featureLoaderInstance.update(projectPath, featureId, {
        claimedBy: currentUser,
        claimedAt: now,
        ...(issueData ? { githubIssue: issueData } : {}),
      });

      events.emit('feature:claimed', {
        featureId,
        issueNumber,
        claimedBy: currentUser,
        projectPath,
      });

      res.json({ success: true, claimedBy: currentUser, issueData });
    } catch (error) {
      logError(error, 'Claim issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createUnclaimIssueHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, issueNumber } = req.body as {
        projectPath: string;
        featureId: string;
        issueNumber: number;
      };

      if (!projectPath || !featureId || !issueNumber) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, featureId and issueNumber are required' });
        return;
      }

      const syncService = getGitHubSyncService(events);
      const currentUser = await syncService.getCurrentUser(projectPath);
      if (!currentUser) {
        res.status(400).json({ success: false, error: 'Not authenticated with GitHub CLI.' });
        return;
      }

      const unclaimResult = await syncService.unclaimIssue(projectPath, issueNumber);
      if (!unclaimResult.success) {
        res.status(500).json({ success: false, error: unclaimResult.error });
        return;
      }

      const issueData = await syncService.syncIssueData(projectPath, issueNumber);

      await featureLoaderInstance.update(projectPath, featureId, {
        claimedBy: undefined,
        claimedAt: undefined,
        ...(issueData ? { githubIssue: issueData } : {}),
      });

      events.emit('feature:unclaimed', {
        featureId,
        issueNumber,
        projectPath,
      });

      res.json({ success: true, issueData });
    } catch (error) {
      logError(error, 'Unclaim issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createSyncIssueHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, issueNumber } = req.body as {
        projectPath: string;
        featureId: string;
        issueNumber: number;
      };

      if (!projectPath || !featureId || !issueNumber) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, featureId and issueNumber are required' });
        return;
      }

      const syncService = getGitHubSyncService(events);
      const issueData = await syncService.syncIssueData(projectPath, issueNumber);

      if (!issueData) {
        res
          .status(502)
          .json({ success: false, error: `Could not fetch issue #${issueNumber} from GitHub` });
        return;
      }

      const feature = await featureLoaderInstance.get(projectPath, featureId);
      if (feature) {
        const currentUser = await syncService.getCurrentUser(projectPath);
        const updates: Record<string, unknown> = { githubIssue: issueData };

        if (feature.claimedBy && !issueData.assignees.includes(feature.claimedBy)) {
          updates.claimedBy = undefined;
          updates.claimedAt = undefined;
        }

        if (currentUser && issueData.assignees.includes(currentUser) && !feature.claimedBy) {
          updates.claimedBy = currentUser;
          updates.claimedAt = issueData.syncedAt;
        }

        await featureLoaderInstance.update(projectPath, featureId, updates);
      }

      res.json({ success: true, issueData });
    } catch (error) {
      logError(error, 'Sync issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createCurrentUserHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const syncService = getGitHubSyncService(events);
      const username = await syncService.getCurrentUser(projectPath);

      res.json({ success: true, username });
    } catch (error) {
      logError(error, 'Get current user failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createCreateIssueHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, title, body, labels } = req.body as {
        projectPath: string;
        title: string;
        body?: string;
        labels?: string[];
      };

      if (!projectPath || !title) {
        res.status(400).json({ success: false, error: 'projectPath and title are required' });
        return;
      }

      const syncService = getGitHubSyncService();
      const result = await syncService.createIssue(projectPath, title, body, labels);

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }

      res.json({
        success: true,
        issueNumber: result.issueNumber,
        url: result.url,
      });
    } catch (error) {
      logError(error, 'Create issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createUpdateIssueLabelsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber, addLabels, removeLabels } = req.body as {
        projectPath: string;
        issueNumber: number;
        addLabels?: string[];
        removeLabels?: string[];
      };

      if (!projectPath || !issueNumber) {
        res.status(400).json({ success: false, error: 'projectPath and issueNumber are required' });
        return;
      }

      const syncService = getGitHubSyncService();
      const result = await syncService.updateIssueLabels(
        projectPath,
        issueNumber,
        addLabels,
        removeLabels
      );

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Update issue labels failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

function createAddCommentHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber, body } = req.body as {
        projectPath: string;
        issueNumber: number;
        body: string;
      };

      if (!projectPath || !issueNumber || !body) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, issueNumber, and body are required' });
        return;
      }

      const syncService = getGitHubSyncService();
      const result = await syncService.addComment(projectPath, issueNumber, body);

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Add comment failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ─── Router Factory ──────────────────────────────────────────────────────────

export function createGitHubRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  // Initialize the singleton sync service with the shared event emitter
  getGitHubSyncService(events);

  router.post('/check-remote', validatePathParams('projectPath'), createCheckGitHubRemoteHandler());
  router.post('/issues', validatePathParams('projectPath'), createListIssuesHandler());
  router.post('/prs', validatePathParams('projectPath'), createListPRsHandler());
  router.post('/issue-comments', validatePathParams('projectPath'), createListCommentsHandler());
  router.post(
    '/validate-issue',
    validatePathParams('projectPath'),
    createValidateIssueHandler(events, settingsService)
  );

  // Validation management endpoints
  router.post(
    '/validation-status',
    validatePathParams('projectPath'),
    createValidationStatusHandler()
  );
  router.post('/validation-stop', validatePathParams('projectPath'), createValidationStopHandler());
  router.post('/validations', validatePathParams('projectPath'), createGetValidationsHandler());
  router.post(
    '/validation-delete',
    validatePathParams('projectPath'),
    createDeleteValidationHandler()
  );
  router.post(
    '/validation-mark-viewed',
    validatePathParams('projectPath'),
    createMarkViewedHandler(events)
  );

  // Collaboration: claim/unclaim/sync issue assignees
  router.post('/claim-issue', validatePathParams('projectPath'), createClaimIssueHandler(events));
  router.post(
    '/unclaim-issue',
    validatePathParams('projectPath'),
    createUnclaimIssueHandler(events)
  );
  router.post('/sync-issue', validatePathParams('projectPath'), createSyncIssueHandler(events));
  router.post('/current-user', validatePathParams('projectPath'), createCurrentUserHandler(events));
  router.post('/create-issue', validatePathParams('projectPath'), createCreateIssueHandler());
  router.post(
    '/update-issue-labels',
    validatePathParams('projectPath'),
    createUpdateIssueLabelsHandler()
  );
  router.post('/add-comment', validatePathParams('projectPath'), createAddCommentHandler());

  // Issue management: lock, unlock, pin, unpin, delete
  router.post(
    '/lock-issue',
    validatePathParams('projectPath'),
    createIssueActionHandler('lockIssue', 'Lock issue')
  );
  router.post(
    '/unlock-issue',
    validatePathParams('projectPath'),
    createIssueActionHandler('unlockIssue', 'Unlock issue')
  );
  router.post(
    '/pin-issue',
    validatePathParams('projectPath'),
    createIssueActionHandler('pinIssue', 'Pin issue')
  );
  router.post(
    '/unpin-issue',
    validatePathParams('projectPath'),
    createIssueActionHandler('unpinIssue', 'Unpin issue')
  );
  router.post(
    '/delete-issue',
    validatePathParams('projectPath'),
    createIssueActionHandler('deleteIssue', 'Delete issue')
  );
  router.post(
    '/reopen-issue',
    validatePathParams('projectPath'),
    createIssueActionHandler('reopenIssue', 'Reopen issue')
  );
  router.post(
    '/close-issue',
    validatePathParams('projectPath'),
    createIssueActionHandler('closeIssue', 'Close issue')
  );

  return router;
}

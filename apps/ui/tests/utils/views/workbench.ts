/**
 * Workbench E2E helpers — bring-up, navigation and state seeding.
 *
 * THE CONSTRAINT THAT SHAPES EVERY WORKBENCH SPEC: the Playwright suite runs
 * the backend with `DMAKER_MOCK_AGENT=true` (hardcoded in playwright.config.ts),
 * and the mock branch of AutoModeService returns after three
 * `auto_mode_progress` events. It never spawns a sub-agent, never asks a
 * question, never writes a plan and never touches a file. So nothing the new
 * panes render can be produced by *running* something.
 *
 * Every helper here therefore SEEDS state — writes `feature.json` and its
 * sidecars straight to disk, or POSTs a real endpoint — and the specs assert
 * that the UI renders what was seeded. That is a deliberate design, not a
 * shortcut around a flaky agent.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API_BASE_URL } from '../core/constants';
import { waitForNetworkIdle } from '../core/waiting';
import { setupRealProject } from '../project/setup';
import { authenticateForTests } from '../api/client';
import { showAllStatuses } from './board';

// ============================================================================
// Tabs and test ids
// ============================================================================

/**
 * The workbench panes, in tab-strip order.
 *
 * Mirrors `WORKBENCH_TABS` in `apps/ui/src/store/workbench-store.ts`. Kept as a
 * literal rather than imported because the spec suite must not depend on the
 * app bundle — but if the strip ever changes, the pane loop in
 * `workbench-panes.spec.ts` is what fails, which is the point.
 */
export const WORKBENCH_TAB_IDS = [
  'agents',
  'changes',
  'phases',
  'questions',
  'chat',
  'browser',
] as const;

export type WorkbenchPaneId = (typeof WORKBENCH_TAB_IDS)[number];

/** localStorage key the workbench shell persists its UI state under. */
export const WORKBENCH_STORAGE_KEY = 'dmaker:workbench-ui';

export function workbenchTab(page: Page, pane: WorkbenchPaneId): Locator {
  return page.locator(`[data-testid="workbench-tab-${pane}"]`);
}

/**
 * A pane's host element.
 *
 * Visited panes stay mounted and are hidden with `visibility: hidden`, so scope
 * every pane assertion to its host: a testid that only one pane emits is still
 * *present* in the DOM for every other open task, and only `toBeVisible()`
 * against the right host tells the two apart.
 */
export function workbenchPane(page: Page, pane: WorkbenchPaneId): Locator {
  return page.locator(`[data-testid="workbench-pane-${pane}"]`);
}

/** One level of the Agents pane's Miller columns. Row 0 is Master alone. */
export function agentChainRow(page: Page, rowDepth: number): Locator {
  return page.locator(`[data-testid="agent-chain-row-${rowDepth}"]`);
}

/** One agent card. `agent-chain-item-*` is its own namespace — see agent-chain-item.tsx. */
export function agentChainItem(page: Page, agentId: string): Locator {
  return page.locator(`[data-testid="agent-chain-item-${agentId}"]`);
}

/** A task's row in the sidebar — the only way into a workbench. */
export function sidebarFeatureRow(page: Page, featureId: string): Locator {
  return page.locator(`[data-testid="sidebar-feature-row"][data-feature-id="${featureId}"]`);
}

// ============================================================================
// Seeding features on disk
// ============================================================================

/**
 * A feature to write to disk.
 *
 * Deliberately open (`[key: string]: unknown`) rather than the closed
 * `FeatureData` used by `createTestFeature`: these specs seed `planSpec`,
 * `agentQuestions`, `executionMetrics` and `pipelineProgress`, all of which are
 * real `Feature` fields that no other spec has needed yet. `Feature` itself
 * carries an index signature server-side, so an unknown key round-trips.
 */
export interface SeededFeature {
  id: string;
  /** Decides the directory: `.dmaker/features/<status>/<id>/`. */
  status: string;
  title?: string;
  description?: string;
  category?: string;
  branchName?: string;
  createdAt?: string;
  [extraField: string]: unknown;
}

/** Where a seeded feature lives. Features are stored under their status. */
export function seededFeatureDir(
  projectPath: string,
  feature: Pick<SeededFeature, 'id' | 'status'>
): string {
  return path.join(projectPath, '.dmaker', 'features', feature.status, feature.id);
}

/**
 * Re-seed `.dmaker/features` from scratch.
 *
 * Wipes first, on purpose: features move between status directories, and specs
 * share one backend, so a test that inherits the previous one's leftovers reads
 * as a mysterious extra row in the sidebar.
 */
export function seedWorkbenchFeatures(projectPath: string, features: SeededFeature[]): void {
  const featuresDir = path.join(projectPath, '.dmaker', 'features');
  fs.rmSync(featuresDir, { recursive: true, force: true });
  fs.mkdirSync(featuresDir, { recursive: true });

  for (const feature of features) {
    const dir = seededFeatureDir(projectPath, feature);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'feature.json'),
      JSON.stringify(
        {
          category: 'Uncategorized',
          description: feature.title ? `${feature.title} description` : 'Seeded task',
          createdAt: new Date().toISOString(),
          ...feature,
        },
        null,
        2
      ),
      'utf-8'
    );
  }
}

/** Write a file inside a seeded feature's directory (`logs/…`, `images/…`). */
export function seedFeatureSidecar(
  projectPath: string,
  feature: Pick<SeededFeature, 'id' | 'status'>,
  relativePath: string,
  contents: string
): void {
  const target = path.join(seededFeatureDir(projectPath, feature), relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf-8');
}

/** The transcript `POST /api/features/agent-output` serves. */
export function seedAgentTranscript(
  projectPath: string,
  feature: Pick<SeededFeature, 'id' | 'status'>,
  transcript: string
): void {
  seedFeatureSidecar(projectPath, feature, path.join('logs', 'agent-output.md'), transcript);
}

/** The sidecar `POST /api/running-agents/tree` falls back to when nothing is running. */
export function seedAgentTree(
  projectPath: string,
  feature: Pick<SeededFeature, 'id' | 'status'>,
  tree: SeededAgentTree
): void {
  seedFeatureSidecar(
    projectPath,
    feature,
    path.join('logs', 'agent-tree.json'),
    JSON.stringify(tree, null, 2)
  );
}

// ============================================================================
// Agent trees and transcripts
// ============================================================================

/** Mirrors `AgentNode` in `libs/types/src/agent-tree.ts`. */
export interface SeededAgentNode {
  id: string;
  /** null only for the master node. */
  parentId: string | null;
  depth: number;
  name: string;
  description?: string;
  prompt?: string;
  model?: string;
  background?: boolean;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  startedAt: string;
  endedAt?: string;
  toolCallCount: number;
  /** Spawn order across the whole tree. Master is 0. */
  index: number;
  result?: string;
  isError?: boolean;
  inferred?: boolean;
}

/** Mirrors `AgentTree`: a node map plus a spawn-ordered id list, master first. */
export interface SeededAgentTree {
  featureId: string;
  nodes: Record<string, SeededAgentNode>;
  order: string[];
  updatedAt: string;
}

/**
 * Build a sidecar-shaped tree from nodes given in spawn order.
 *
 * `AgentTree` has no `rootId` and no `agents[]` — the root is the node keyed
 * `master`, and `order` is what records spawn sequence.
 */
export function buildSeededAgentTree(featureId: string, nodes: SeededAgentNode[]): SeededAgentTree {
  const byId: Record<string, SeededAgentNode> = {};
  for (const node of nodes) byId[node.id] = node;
  return {
    featureId,
    nodes: byId,
    order: nodes.map((node) => node.id),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The server's change-of-author marker, byte for byte:
 * `[timestamp:<ISO>] [agent:<id>] U+25B6 <name>`.
 *
 * The arrow is written as an escape rather than a literal glyph so a file saved
 * in the wrong encoding cannot quietly mangle it. Three places in the app
 * restate this format (the auto-mode service, `use-agent-output-stream.ts` and
 * `lib/agent-tree.ts`); a broken arrow here would read as a UI bug.
 */
export const AGENT_MARKER_GLYPH = '\u25B6';

export function agentTranscriptMarker(
  agentId: string,
  agentName: string,
  timestamp: string = new Date().toISOString()
): string {
  return `[timestamp:${timestamp}] [agent:${agentId}] ${AGENT_MARKER_GLYPH} ${agentName}`;
}

// ============================================================================
// Bring-up
// ============================================================================

export interface WorkbenchProject {
  projectPath: string;
  projectName: string;
  projectId: string;
}

/**
 * Make this the only project the backend knows about, and select it.
 *
 * The app reads its project list from the server's global settings, so seeding
 * localStorage alone leaves it pointing at whatever the previous spec
 * registered — features then load for the wrong project and the sidebar looks
 * inexplicably populated.
 */
export async function registerOnlyProject(page: Page, project: WorkbenchProject): Promise<void> {
  const current = await page.request.get(`${API_BASE_URL}/api/settings/global`);
  const settings = current.ok() ? ((await current.json())?.settings ?? {}) : {};

  await page.request.put(`${API_BASE_URL}/api/settings/global`, {
    data: {
      ...settings,
      projects: [
        {
          id: project.projectId,
          name: project.projectName,
          path: project.projectPath,
          lastOpened: new Date().toISOString(),
        },
      ],
      currentProjectId: project.projectId,
    },
  });
}

/**
 * Register the project, load the board and widen the status funnel so every
 * seeded task has a sidebar row.
 *
 * Anything that has to be in localStorage before the app boots — see
 * `seedPersistedWorkbenchTab` — must be registered BEFORE this call, because
 * this is what navigates.
 */
export async function openWorkbenchBoard(page: Page, project: WorkbenchProject): Promise<void> {
  await registerOnlyProject(page, project);
  await setupRealProject(page, project.projectPath, project.projectName);
  await authenticateForTests(page);

  await page.goto('/board');
  await page.waitForLoadState('load');
  await waitForNetworkIdle(page);
  await showAllStatuses(page);
}

/** Open a task's workbench by clicking its sidebar row. */
export async function openTaskWorkbench(page: Page, featureId: string): Promise<void> {
  const row = sidebarFeatureRow(page, featureId);
  await expect(row, `sidebar row for ${featureId} should render`).toBeVisible({ timeout: 15000 });
  await row.click();
  await expect(page.locator('[data-testid="workbench"]')).toBeVisible({ timeout: 10000 });
}

/** Switch panes, and wait until the pane really is the visible one. */
export async function selectWorkbenchTab(page: Page, pane: WorkbenchPaneId): Promise<void> {
  const tab = workbenchTab(page, pane);
  await expect(tab, `${pane} tab should exist`).toBeVisible({ timeout: 10000 });
  await tab.click();
  await expect(tab, `${pane} tab should select`).toHaveAttribute('aria-selected', 'true');
  await expect(workbenchPane(page, pane), `${pane} pane should be active`).toHaveAttribute(
    'data-active',
    'true',
    { timeout: 10000 }
  );
}

/**
 * Pre-seed the workbench's persisted UI state before the app boots.
 *
 * `workbench-store.ts` reads localStorage once at module scope, so this must be
 * registered before the page navigates. Used to prove the legacy tab aliases
 * (`agent`→`agents`, `diff`/`files`→`changes`, `terminal`→`chat`) still map a
 * retired id onto its successor rather than silently dropping the user on the
 * default pane.
 */
export async function seedPersistedWorkbenchTab(page: Page, activeTab: string): Promise<void> {
  await page.addInitScript(
    ({ key, tab }: { key: string; tab: string }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          sidebarCollapsed: false,
          sidebarWidth: 268,
          activeTab: tab,
          collapsedSections: [],
          pinGroups: [],
          projectGroups: [],
          branchGroups: [],
          researchMode: false,
        })
      );
    },
    { key: WORKBENCH_STORAGE_KEY, tab: activeTab }
  );
}

// ============================================================================
// Reading state back from the backend
// ============================================================================

/** A question as it lands on disk. Only the fields these specs assert on. */
export interface StoredAgentQuestion {
  id: string;
  number?: number;
  question: string;
  header?: string;
  answer?: string;
  answerSource?: 'option' | 'custom' | 'skipped';
  selectedOptionIds?: string[];
  answeredAt?: string;
  skipped?: boolean;
  expiredAt?: string;
  [extraField: string]: unknown;
}

export interface StoredFeature {
  id: string;
  status?: string;
  agentQuestions?: StoredAgentQuestion[];
  [extraField: string]: unknown;
}

/**
 * The feature as the server has it — the only honest way to check that an
 * answer reached disk rather than just the screen.
 */
export async function fetchStoredFeature(
  page: Page,
  projectPath: string,
  featureId: string
): Promise<StoredFeature | null> {
  const response = await page.request.post(`${API_BASE_URL}/api/features/get`, {
    data: { projectPath, featureId },
  });
  if (!response.ok()) return null;
  const body = (await response.json()) as { success?: boolean; feature?: StoredFeature | null };
  return body?.feature ?? null;
}

/** One question off the stored feature. */
export async function fetchStoredQuestion(
  page: Page,
  projectPath: string,
  featureId: string,
  questionId: string
): Promise<StoredAgentQuestion | null> {
  const feature = await fetchStoredFeature(page, projectPath, featureId);
  return feature?.agentQuestions?.find((question) => question.id === questionId) ?? null;
}

/**
 * The agent tree the Agents pane will be served.
 *
 * Doubles as the warm-up gate for a seeded sidecar: `FeatureLoader.getAgentTree`
 * resolves the feature's directory through a cache that only a feature read
 * populates, so this fetches the feature first and is meant to be driven by
 * `expect(...).toPass()`.
 */
export async function fetchAgentTree(
  page: Page,
  projectPath: string,
  featureId: string
): Promise<SeededAgentTree | null> {
  await fetchStoredFeature(page, projectPath, featureId);

  const response = await page.request.post(`${API_BASE_URL}/api/running-agents/tree`, {
    data: { projectPath, featureId },
  });
  if (!response.ok()) return null;
  const body = (await response.json()) as { success?: boolean; tree?: SeededAgentTree | null };
  return body?.tree ?? null;
}

// ============================================================================
// Questions
// ============================================================================

export interface AnswerQuestionOptions {
  /** Pick one of the offered choices. Records `answerSource: 'option'`. */
  choiceId?: string;
  /** Type free text behind the "Other…" chip. Records `answerSource: 'custom'`. */
  customAnswer?: string;
  /** Dismiss it. Records `answerSource: 'skipped'`. */
  skip?: boolean;
}

/**
 * Answer an outstanding question through the UI.
 *
 * Picking a choice submits ids, never the label: the server derives the answer
 * text from the labels it recorded, and submitting the label as free text would
 * record `'custom'` and lose which choice was taken.
 */
export async function answerAgentQuestion(
  page: Page,
  questionId: string,
  options: AnswerQuestionOptions
): Promise<void> {
  if (options.skip) {
    await page.locator(`[data-testid="agent-question-skip-${questionId}"]`).click();
    return;
  }

  if (options.choiceId) {
    const choice = page.locator(
      `[data-testid="agent-question-choice-${questionId}-${options.choiceId}"]`
    );
    await expect(choice).toBeVisible({ timeout: 10000 });
    await choice.click();
    await expect(choice).toHaveAttribute('data-selected', 'true');
  } else if (options.customAnswer !== undefined) {
    // The textarea is behind "Other…" whenever choices were offered — the panel
    // shows it outright only for a question with nothing on offer.
    const other = page.locator(`[data-testid="agent-question-other-${questionId}"]`);
    if (await other.isVisible().catch(() => false)) {
      await other.click();
    }
    const input = page.locator(`[data-testid="agent-question-input-${questionId}"]`);
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill(options.customAnswer);
  }

  const submit = page.locator(`[data-testid="agent-question-submit-${questionId}"]`);
  await expect(submit).toBeEnabled({ timeout: 10000 });
  await submit.click();
}

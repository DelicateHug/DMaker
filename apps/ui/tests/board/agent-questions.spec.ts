/**
 * Questions pane E2E — what was offered, and what was picked.
 *
 * The requirement this covers is the record, not the reply: a resolved question
 * has to show every option it put on screen, mark the one that was taken, keep
 * its number, and say when the answer was free text rather than a choice.
 * Nothing in the panel had that before — an answered question showed a line of
 * text and no trace of the fork it resolved.
 *
 * This is the one new surface that needs no agent at all. Questions live in
 * `feature.json`, so a seeded array is indistinguishable from one an agent
 * wrote — which matters, because the suite runs `DMAKER_MOCK_AGENT=true` and
 * the mock returns after three progress events without ever asking anything.
 *
 * The answers submitted here go through the real `POST
 * /api/features/answer-question`, and every one of them is read back off disk
 * through `POST /api/features/get`. That second read is the point: the server
 * DERIVES `answerSource` from what was submitted and never takes the client's
 * word for it, so "the card looks right" and "the record is right" are two
 * different claims and only the second one survives a reload.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  answerAgentQuestion,
  cleanupTempDir,
  createTempDirPath,
  fetchStoredQuestion,
  openTaskWorkbench,
  openWorkbenchBoard,
  seedWorkbenchFeatures,
  selectWorkbenchTab,
  workbenchPane,
  type SeededFeature,
  type WorkbenchProject,
} from '../utils';

const TEST_TEMP_DIR = createTempDirPath('agent-questions-test');

const FEATURE_ID = 'feat-with-questions';

/** Answered by picking one of three choices. */
const PICKED_ID = 'q-picked';
/** Answered by typing something none of the choices covered. */
const CUSTOM_ID = 'q-custom';
/** Still outstanding — the one the interactive tests act on. */
const OPEN_ID = 'q-open';

const PICKED_CHOICES = [
  { id: 'opt-1', label: 'Use SQLite', description: 'One file, no service to run.' },
  { id: 'opt-2', label: 'Use flat JSON files', description: 'Readable, diffable, slow to query.' },
  { id: 'opt-3', label: 'Use Postgres', description: 'Needs a service the app does not ship.' },
];

const CUSTOM_CHOICES = [
  { id: 'opt-1', label: 'Yes, everywhere' },
  { id: 'opt-2', label: 'No, leave it alone' },
];

const OPEN_CHOICES = [
  { id: 'opt-1', label: 'Extend the existing table' },
  { id: 'opt-2', label: 'Add a new table' },
];

const CUSTOM_ANSWER = 'Only behind a feature flag, and only for new projects.';

/**
 * A feature carrying the three question states that matter.
 *
 * `number` is written explicitly rather than left to the panel's askedAt-order
 * fallback: the fallback exists for questions written before the server
 * assigned numbers, and a test that leans on it would pass even if the real
 * `number` were being ignored.
 */
const FEATURE: SeededFeature = {
  id: FEATURE_ID,
  status: 'in_progress',
  title: 'A task with questions',
  agentQuestions: [
    {
      id: PICKED_ID,
      source: 'implementation',
      number: 1,
      header: 'Storage',
      question: 'Where should the run history be persisted?',
      choices: PICKED_CHOICES,
      options: PICKED_CHOICES.map((choice) => choice.label),
      allowCustomAnswer: true,
      askedAt: '2026-08-01T09:00:00.000Z',
      answer: 'Use flat JSON files',
      answerSource: 'option',
      selectedOptionIds: ['opt-2'],
      answeredAt: '2026-08-01T09:01:00.000Z',
    },
    {
      id: CUSTOM_ID,
      source: 'implementation',
      number: 2,
      question: 'Should the new setting apply to existing projects?',
      choices: CUSTOM_CHOICES,
      options: CUSTOM_CHOICES.map((choice) => choice.label),
      allowCustomAnswer: true,
      askedAt: '2026-08-01T09:02:00.000Z',
      answer: CUSTOM_ANSWER,
      answerSource: 'custom',
      answeredAt: '2026-08-01T09:03:00.000Z',
    },
    {
      id: OPEN_ID,
      source: 'implementation',
      number: 3,
      header: 'Schema',
      question: 'How should the sub-agent rows be stored?',
      choices: OPEN_CHOICES,
      options: OPEN_CHOICES.map((choice) => choice.label),
      allowCustomAnswer: true,
      askedAt: '2026-08-01T09:04:00.000Z',
    },
  ],
};

function questionTitle(pane: Locator, questionId: string): Locator {
  return pane.locator(`[data-testid="agent-question-title-${questionId}"]`);
}

function resolvedCard(pane: Locator, questionId: string): Locator {
  return pane.locator(`[data-testid="agent-question-resolved-${questionId}"]`);
}

function resolvedChoice(pane: Locator, questionId: string, choiceId: string): Locator {
  return pane.locator(`[data-testid="agent-question-resolved-choice-${questionId}-${choiceId}"]`);
}

/** Open the task and land on Questions — every test starts here. */
async function openQuestionsPane(page: Page): Promise<Locator> {
  await openTaskWorkbench(page, FEATURE_ID);
  await selectWorkbenchTab(page, 'questions');
  const pane = workbenchPane(page, 'questions');
  await expect(pane.locator('[data-testid="agent-questions-panel"]')).toBeVisible({
    timeout: 15000,
  });
  return pane;
}

test.describe('Agent questions', () => {
  // Every test boots the board, opens a task and switches pane before it
  // asserts, and the hook time comes out of the same 30s budget. Raised rather
  // than trimmed: the waits are ceilings, not costs, on a warm machine.
  test.describe.configure({ timeout: 90_000 });

  let project: WorkbenchProject;

  test.beforeAll(async () => {
    fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    const projectName = `agent-questions-${Date.now()}`;
    const projectPath = path.join(TEST_TEMP_DIR, projectName);

    fs.mkdirSync(path.join(projectPath, '.dmaker', 'context'), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );
    fs.writeFileSync(
      path.join(projectPath, '.dmaker', 'categories.json'),
      JSON.stringify({ categories: [] }, null, 2)
    );

    project = { projectPath, projectName, projectId: `agent-questions-project-${Date.now()}` };
  });

  test.afterAll(async () => {
    if (process.env.KEEP_TEST_DIR === 'true') return;
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test.beforeEach(async ({ page }) => {
    // Answering writes to feature.json, so every test needs the outstanding
    // question back — otherwise the second test in the file finds it answered.
    seedWorkbenchFeatures(project.projectPath, [FEATURE]);
    await openWorkbenchBoard(page, project);
  });

  test('a resolved question keeps its number and shows every choice it offered', async ({
    page,
  }) => {
    const pane = await openQuestionsPane(page);

    // The number comes off the question, not from its position on screen: the
    // outstanding card renders above these two, so an index-based number would
    // have to be wrong somewhere.
    await expect(questionTitle(pane, PICKED_ID)).toHaveText('Question 1');
    await expect(resolvedCard(pane, PICKED_ID)).toContainText('Storage');

    const card = resolvedCard(pane, PICKED_ID);
    await expect(card).toHaveAttribute('data-answer-source', 'option');

    // Every option that was on offer is still listed — this is the whole
    // requirement. An answer of "Use flat JSON files" with the other two
    // discarded loses the fork the agent was actually stuck on.
    for (const choice of PICKED_CHOICES) {
      const row = resolvedChoice(pane, PICKED_ID, choice.id);
      await expect(row, `${choice.label} should still be listed`).toBeVisible();
      await expect(row).toHaveAttribute('data-chosen', choice.id === 'opt-2' ? 'true' : 'false');
      await expect(row).toContainText(choice.label);
      if (choice.description) await expect(row).toContainText(choice.description);
    }

    await expect(card).toContainText('Use flat JSON files');
  });

  test('a custom answer is badged and marks none of the choices', async ({ page }) => {
    const pane = await openQuestionsPane(page);

    await expect(questionTitle(pane, CUSTOM_ID)).toHaveText('Question 2');

    const card = resolvedCard(pane, CUSTOM_ID);
    await expect(card).toHaveAttribute('data-answer-source', 'custom');
    // The badge is what tells a reader the answer came from nowhere on the
    // list, rather than from an option they have to go hunting for.
    await expect(card).toContainText('Other');
    await expect(card).toContainText(CUSTOM_ANSWER);

    for (const choice of CUSTOM_CHOICES) {
      await expect(resolvedChoice(pane, CUSTOM_ID, choice.id)).toHaveAttribute(
        'data-chosen',
        'false'
      );
    }
  });

  test('picking a choice records the option ids, and the server derives the text', async ({
    page,
  }) => {
    const pane = await openQuestionsPane(page);

    await expect(questionTitle(pane, OPEN_ID)).toHaveText('Question 3');
    await answerAgentQuestion(page, OPEN_ID, { choiceId: 'opt-2' });

    // On disk, not on screen. The panel submits ids and never the label, and
    // the server synthesises the answer text from the labels it recorded — so
    // this is the assertion that catches a client that started sending text.
    await expect(async () => {
      const stored = await fetchStoredQuestion(page, project.projectPath, FEATURE_ID, OPEN_ID);
      expect(stored?.answerSource).toBe('option');
      expect(stored?.selectedOptionIds).toEqual(['opt-2']);
      expect(stored?.answer).toBe('Add a new table');
      expect(stored?.answeredAt).toBeTruthy();
    }).toPass({ timeout: 15000 });

    const card = resolvedCard(pane, OPEN_ID);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toHaveAttribute('data-answer-source', 'option');
    await expect(resolvedChoice(pane, OPEN_ID, 'opt-2')).toHaveAttribute('data-chosen', 'true');
    await expect(resolvedChoice(pane, OPEN_ID, 'opt-1')).toHaveAttribute('data-chosen', 'false');

    // It stopped being outstanding, rather than being rendered twice.
    await expect(pane.locator(`[data-testid="agent-question-${OPEN_ID}"]`)).toHaveCount(0);
  });

  test('“Other…” reveals free text and is recorded as a custom answer', async ({ page }) => {
    const pane = await openQuestionsPane(page);

    // The textarea is deliberately behind the chip: the asking agent is told
    // never to invent an "Other" option because the UI always supplies one.
    await expect(pane.locator(`[data-testid="agent-question-input-${OPEN_ID}"]`)).toHaveCount(0);

    const typed = 'Neither — reuse the existing run cache.';
    await answerAgentQuestion(page, OPEN_ID, { customAnswer: typed });

    await expect(async () => {
      const stored = await fetchStoredQuestion(page, project.projectPath, FEATURE_ID, OPEN_ID);
      expect(stored?.answerSource).toBe('custom');
      expect(stored?.answer).toBe(typed);
      // No id may be recorded: a custom answer took none of the choices, and
      // an id here would put a tick beside an option nobody picked.
      expect(stored?.selectedOptionIds ?? []).toEqual([]);
    }).toPass({ timeout: 15000 });

    const card = resolvedCard(pane, OPEN_ID);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toHaveAttribute('data-answer-source', 'custom');
    await expect(card).toContainText('Other');
    await expect(resolvedChoice(pane, OPEN_ID, 'opt-1')).toHaveAttribute('data-chosen', 'false');
    await expect(resolvedChoice(pane, OPEN_ID, 'opt-2')).toHaveAttribute('data-chosen', 'false');
  });

  test('skipping records a skip rather than an empty answer', async ({ page }) => {
    const pane = await openQuestionsPane(page);

    await answerAgentQuestion(page, OPEN_ID, { skip: true });

    await expect(async () => {
      const stored = await fetchStoredQuestion(page, project.projectPath, FEATURE_ID, OPEN_ID);
      expect(stored?.answerSource).toBe('skipped');
      expect(stored?.skipped).toBe(true);
      expect(stored?.answeredAt).toBeTruthy();
    }).toPass({ timeout: 15000 });

    const card = resolvedCard(pane, OPEN_ID);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toHaveAttribute('data-answer-source', 'skipped');
    await expect(card).toContainText('Skipped');
    // Skipping is still an outcome for the question, so the choices it offered
    // stay on the record with none of them marked.
    await expect(resolvedChoice(pane, OPEN_ID, 'opt-1')).toHaveAttribute('data-chosen', 'false');
  });
});

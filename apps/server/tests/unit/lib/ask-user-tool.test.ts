import { describe, it, expect, vi } from 'vitest';
import type { AgentQuestion } from '@dmaker/types';
import {
  ASK_USER_MAX_CALLS_PER_RUN,
  ASK_USER_MCP_SERVER_NAME,
  ASK_USER_TOOL_NAME,
  askUserToolDescription,
  createAskUserHandler,
  createAskUserMcpServer,
  isAskUserDisabled,
  normaliseAskQuestion,
  type AskUserAnswer,
  type AskUserToolDeps,
  type NormalisedAskInput,
} from '@/lib/ask-user-tool.js';

/** The text a CallToolResult carries, joined. */
function textOf(result: { content: Array<{ type: 'text'; text: string }> }): string {
  return result.content.map((block) => block.text).join('\n');
}

/** Build the questions `ask` would have written, ids and all. */
function written(inputs: NormalisedAskInput[]): AgentQuestion[] {
  return inputs.map((input, index) => ({
    id: `q-${index + 1}`,
    source: 'implementation',
    number: index + 1,
    question: input.question,
    ...(input.header ? { header: input.header } : {}),
    choices: input.choices.map((choice, i) => ({ id: `opt-${i + 1}`, ...choice })),
    allowCustomAnswer: true,
    askedAt: new Date().toISOString(),
  }));
}

/** Deps whose `ask` records and echoes, and whose waits resolve immediately. */
function stubDeps(overrides: Partial<AskUserToolDeps> = {}): AskUserToolDeps & {
  asked: NormalisedAskInput[][];
  waited: string[];
  expired: string[][];
} {
  const asked: NormalisedAskInput[][] = [];
  const waited: string[] = [];
  const expired: string[][] = [];

  return {
    asked,
    waited,
    expired,
    ask: async (questions) => {
      asked.push(questions);
      return written(questions);
    },
    waitForAnswer: async (questionId) => {
      waited.push(questionId);
      return { answer: `answer for ${questionId}` };
    },
    expire: async (ids) => {
      expired.push(ids);
    },
    ...overrides,
  };
}

const ONE_QUESTION = {
  questions: [
    {
      question: 'Which storage should the cache use?',
      header: 'Storage',
      options: [
        { label: 'In memory', description: 'Fast, lost on restart' },
        { label: 'SQLite', description: 'Survives a restart, one more file' },
      ],
    },
  ],
};

describe('ask-user-tool.ts', () => {
  describe('constants', () => {
    it('derives the allowedTools entry from the server name', () => {
      expect(ASK_USER_TOOL_NAME).toBe(`mcp__${ASK_USER_MCP_SERVER_NAME}__ask_user`);
    });

    it('states the same budget in the description that it enforces', () => {
      expect(askUserToolDescription(ASK_USER_MAX_CALLS_PER_RUN)).toContain(
        `at most ${ASK_USER_MAX_CALLS_PER_RUN} time(s)`
      );
    });
  });

  describe('isAskUserDisabled', () => {
    it('is off unless the kill switch is exactly "true"', () => {
      const original = process.env.DMAKER_DISABLE_ASK_USER;
      try {
        delete process.env.DMAKER_DISABLE_ASK_USER;
        expect(isAskUserDisabled()).toBe(false);
        process.env.DMAKER_DISABLE_ASK_USER = '1';
        expect(isAskUserDisabled()).toBe(false);
        process.env.DMAKER_DISABLE_ASK_USER = 'true';
        expect(isAskUserDisabled()).toBe(true);
      } finally {
        if (original === undefined) delete process.env.DMAKER_DISABLE_ASK_USER;
        else process.env.DMAKER_DISABLE_ASK_USER = original;
      }
    });
  });

  describe('normaliseAskQuestion', () => {
    it('drops a question with no text', () => {
      expect(normaliseAskQuestion({ question: '   ' })).toBeNull();
    });

    it('truncates header to the 12 characters the chip can show', () => {
      const result = normaliseAskQuestion({
        question: 'Which one?',
        header: 'Authentication method',
      });
      expect(result?.header).toBe('Authenticati');
      expect(result?.header?.length).toBeLessThanOrEqual(12);
    });

    it('strips an "Other" option the model invented', () => {
      // The panel always renders its own free-text path; a hand-made one shows
      // the user the same escape hatch twice.
      const result = normaliseAskQuestion({
        question: 'Which library?',
        options: [
          { label: 'date-fns' },
          { label: 'Luxon' },
          { label: 'Other', description: 'Something else' },
          { label: 'None of these' },
        ],
      });
      expect(result?.choices.map((c) => c.label)).toEqual(['date-fns', 'Luxon']);
    });

    it('caps options at four and drops blank labels', () => {
      const result = normaliseAskQuestion({
        question: 'Which?',
        options: [
          { label: 'A' },
          { label: '   ' },
          { label: 'B' },
          { label: 'C' },
          { label: 'D' },
          { label: 'E' },
        ],
      });
      expect(result?.choices.map((c) => c.label)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('keeps multiSelect only when it was asked for', () => {
      expect(normaliseAskQuestion({ question: 'Which?' }).multiSelect).toBeUndefined();
      expect(normaliseAskQuestion({ question: 'Which?', multiSelect: true })?.multiSelect).toBe(
        true
      );
    });
  });

  describe('handler', () => {
    it('parks the question and returns the answer to the model', async () => {
      const deps = stubDeps();
      const handler = createAskUserHandler(deps);

      const result = await handler(ONE_QUESTION);

      expect(deps.asked).toHaveLength(1);
      expect(deps.asked[0][0].question).toBe('Which storage should the cache use?');
      expect(deps.waited).toEqual(['q-1']);
      expect(result.isError).toBeUndefined();
      expect(textOf(result)).toContain('[Storage] Which storage should the cache use?');
      expect(textOf(result)).toContain('answer for q-1');
    });

    it('registers every waiter before any answer could be processed', async () => {
      // An answer only ever arrives over HTTP, which is a macrotask. This
      // asserts the property that actually protects the run: no macrotask may
      // run between the question becoming visible and its waiter existing. An
      // `await` slipped between `ask` and `waitForAnswer` would let the timer
      // below fire first and this would read 0.
      let waitersAtFirstMacrotask: number | null = null;
      const deps = stubDeps({
        ask: async (questions) => {
          const created = written(questions);
          setTimeout(() => {
            waitersAtFirstMacrotask = deps.waited.length;
          }, 0);
          return created;
        },
      });
      const handler = createAskUserHandler(deps);

      await handler({
        questions: [{ question: 'A?' }, { question: 'B?' }],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(waitersAtFirstMacrotask).toBe(2);
    });

    it('reports a skip as a decision handed back, not as an answer', async () => {
      const deps = stubDeps({
        waitForAnswer: async () => ({ answer: '', skipped: true }),
      });

      const result = await createAskUserHandler(deps)(ONE_QUESTION);

      expect(result.isError).toBeUndefined();
      expect(textOf(result)).toContain('the user skipped this');
    });

    it('keeps the answers it did get when one wait hits the ceiling', async () => {
      const deps = stubDeps({
        waitForAnswer: async (questionId) => {
          if (questionId === 'q-1') {
            throw new Error('Question timed out after 30 minutes without an answer');
          }
          return { answer: 'SQLite' } satisfies AskUserAnswer;
        },
      });

      const result = await createAskUserHandler(deps)({
        questions: [{ question: 'A?' }, { question: 'B?' }],
      });

      const text = textOf(result);
      expect(text).toContain('Question timed out after 30 minutes');
      expect(text).toContain('SQLite');
      // Not a total failure - one answer came back.
      expect(result.isError).toBeUndefined();
    });

    it('expires only the questions nobody answered', async () => {
      // waitForQuestionAnswer's timeout rejects the waiter but never touches
      // the record, so without this the question stays outstanding for ever.
      const deps = stubDeps({
        waitForAnswer: async (questionId) => {
          if (questionId === 'q-1') throw new Error('run ended');
          return { answer: 'yes' };
        },
      });

      await createAskUserHandler(deps)({
        questions: [{ question: 'A?' }, { question: 'B?' }],
      });

      expect(deps.expired).toEqual([['q-1']]);
    });

    it('flags the result as an error only when nothing came back at all', async () => {
      const deps = stubDeps({
        waitForAnswer: async () => {
          throw new Error('The run ended before the question was answered');
        },
      });

      const result = await createAskUserHandler(deps)(ONE_QUESTION);

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Use your own judgement');
    });

    it('does not blow up the run when the question cannot be written', async () => {
      const deps = stubDeps({
        ask: async () => {
          throw new Error('feature.json is gone');
        },
      });

      const result = await createAskUserHandler(deps)(ONE_QUESTION);

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('could not be delivered');
      expect(deps.waited).toEqual([]);
    });

    it('tells the model when the feature refused the question', async () => {
      const deps = stubDeps({ ask: async () => [] });

      const result = await createAskUserHandler(deps)(ONE_QUESTION);

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('nobody will see it');
    });

    it('refuses once the per-run budget is spent', async () => {
      const deps = stubDeps({ maxCalls: 2 });
      const handler = createAskUserHandler(deps);

      await handler(ONE_QUESTION);
      await handler(ONE_QUESTION);
      const third = await handler(ONE_QUESTION);

      expect(deps.asked).toHaveLength(2);
      expect(third.isError).toBe(true);
      expect(textOf(third)).toContain('2-call ask_user budget');
    });

    it('spends budget on a failed ask so a retry loop cannot refill it', async () => {
      const deps = stubDeps({
        maxCalls: 1,
        ask: async () => {
          throw new Error('nope');
        },
      });
      const handler = createAskUserHandler(deps);

      await handler(ONE_QUESTION);
      const second = await handler(ONE_QUESTION);

      expect(textOf(second)).toContain('budget');
    });

    it('caps a call at four questions', async () => {
      const deps = stubDeps();

      await createAskUserHandler(deps)({
        questions: [1, 2, 3, 4, 5, 6].map((n) => ({ question: `Q${n}?` })),
      });

      expect(deps.asked[0]).toHaveLength(4);
    });

    it('costs no budget when there was nothing askable in the call', async () => {
      const deps = stubDeps({ maxCalls: 1 });
      const handler = createAskUserHandler(deps);

      const empty = await handler({ questions: [{ question: '  ' }] });
      expect(empty.isError).toBe(true);

      const real = await handler(ONE_QUESTION);
      expect(real.isError).toBeUndefined();
    });
  });

  describe('DEFAULT_ASK_USER_INSTRUCTIONS', () => {
    // The prompt text lives in @dmaker/prompts and the tool lives here, so
    // nothing but this test stops the two drifting - and a prompt naming a
    // tool that does not exist under that name is worse than no prompt.
    it('names the tool the model will actually see', async () => {
      const { DEFAULT_ASK_USER_INSTRUCTIONS } = await import('@dmaker/prompts');
      expect(DEFAULT_ASK_USER_INSTRUCTIONS).toContain(ASK_USER_TOOL_NAME);
    });

    it('quotes the same call budget the handler enforces', async () => {
      const { DEFAULT_ASK_USER_INSTRUCTIONS } = await import('@dmaker/prompts');
      expect(DEFAULT_ASK_USER_INSTRUCTIONS).toContain(
        `at most ${ASK_USER_MAX_CALLS_PER_RUN} times in this run`
      );
    });

    it('carries the four rules the tool cannot enforce on its own', async () => {
      const { DEFAULT_ASK_USER_INSTRUCTIONS } = await import('@dmaker/prompts');
      // Blocking, the option count, the no-"Other" rule and the ceiling. Each
      // of these is a behaviour the model has to choose; none of them can be
      // recovered from a schema.
      expect(DEFAULT_ASK_USER_INSTRUCTIONS).toContain('The call blocks');
      expect(DEFAULT_ASK_USER_INSTRUCTIONS).toContain('2-4 mutually exclusive options');
      expect(DEFAULT_ASK_USER_INSTRUCTIONS).toContain('Never add an "Other"');
      expect(DEFAULT_ASK_USER_INSTRUCTIONS).toContain('30 minutes');
    });
  });

  describe('createAskUserMcpServer', () => {
    it('registers ask_user on an in-process SDK server', () => {
      // Also the smoke test that the zod shape is one @modelcontextprotocol/sdk
      // will accept - `server.tool()` validates it at registration time.
      const server = createAskUserMcpServer(stubDeps());

      expect(server.type).toBe('sdk');
      expect(server.name).toBe(ASK_USER_MCP_SERVER_NAME);
      expect(server.instance).toBeDefined();
    });

    it('does not call anything until the model does', () => {
      const ask = vi.fn();
      createAskUserMcpServer({ ...stubDeps(), ask });
      expect(ask).not.toHaveBeenCalled();
    });
  });
});

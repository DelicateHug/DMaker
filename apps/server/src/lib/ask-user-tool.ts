/**
 * ask_user - the channel a running implementation agent uses to park on a
 * decision it cannot make from the repository alone.
 *
 * This is an in-process MCP server (`createSdkMcpServer`), not an interception
 * of the SDK's built-in AskUserQuestion tool. Intercepting that one via
 * `canUseTool` genuinely works, but `canUseTool` is per-run and GLOBAL: taking
 * it would make DMaker the permission handler for every tool call in a feature
 * run, against the deliberate bypassPermissions stance. So we copy the shape
 * instead of hijacking the tool.
 *
 * The input schema deliberately mirrors the SDK's own `AskUserQuestionInput`
 * (`sdk-tools.d.ts`) field for field - question / header / 2-4 {label,
 * description} options / multiSelect - because that is the shape the model is
 * already trained on. The one rule that has to survive: NO "Other" option in
 * the list. The panel always renders its own free-text path, so a model that
 * invents one produces a visible duplicate.
 *
 * Lifecycle notes that have already cost time:
 *
 * - The handler BLOCKS. That is the point, and it is also a real behaviour
 *   change for an autonomous run: the await holds a worktree, a concurrency
 *   slot and a CLI subprocess. `waitForQuestionAnswer` caps it at 30 minutes -
 *   the same ceiling plan approval uses - and this file never waits on
 *   anything without that ceiling behind it.
 * - The CLI's own MCP tool timeout (`MCP_TOOL_TIMEOUT`) defaults to 1e8 ms
 *   (~27 hours) and the SDK puts no timeout on the control request at all, so
 *   nothing underneath us will cut a 30-minute block short. The ceiling here
 *   is the only one.
 * - There is a per-run call budget. Without it a model that likes asking can
 *   turn one queued task into an all-day stall, and the budget is deliberately
 *   its own rather than inherited from the issue drafter's clarification cap.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createLogger } from '@dmaker/utils';
import type { AgentQuestion } from '@dmaker/types';

const logger = createLogger('AskUserTool');

/** MCP server name. The tool the model sees is `mcp__<server>__ask_user`. */
export const ASK_USER_MCP_SERVER_NAME = 'dmaker_ask';

/** Fully-qualified tool name, as it must appear in `allowedTools`. */
export const ASK_USER_TOOL_NAME = `mcp__${ASK_USER_MCP_SERVER_NAME}__ask_user`;

/**
 * How many times one run may call the tool. Each call may carry up to
 * {@link MAX_QUESTIONS_PER_CALL} related questions, so the real ceiling is
 * three human interruptions per feature, not three questions.
 */
export const ASK_USER_MAX_CALLS_PER_RUN = 3;

/** The SDK's own cap, mirrored. */
const MAX_QUESTIONS_PER_CALL = 4;

/** The SDK's own cap, mirrored. */
const MAX_OPTIONS_PER_QUESTION = 4;

/** `header` is a chip in the UI; the SDK documents 12 characters. */
const MAX_HEADER_LENGTH = 12;

/**
 * Environment kill switch. Set `DMAKER_DISABLE_ASK_USER=true` to take the
 * channel away from every run and go back to agents that never block on a
 * human - the escape hatch if a blocking tool ever wedges the queue.
 */
export function isAskUserDisabled(): boolean {
  return process.env.DMAKER_DISABLE_ASK_USER === 'true';
}

/** One choice, as the model supplies it. */
export interface AskUserOptionInput {
  label: string;
  description?: string;
}

/** One question, as the model supplies it. */
export interface AskUserQuestionInput {
  question: string;
  header?: string;
  options?: AskUserOptionInput[];
  multiSelect?: boolean;
}

/** A question normalised into what `AgentQuestionService.ask` accepts. */
export interface NormalisedAskInput {
  question: string;
  header?: string;
  choices: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

/** The answer a waiter is released with. Mirrors AutoModeService's QuestionAnswer. */
export interface AskUserAnswer {
  answer: string;
  skipped?: boolean;
}

/**
 * Everything the tool needs from the rest of the server, injected rather than
 * imported so the handler is testable without an AutoModeService, a
 * FeatureLoader or a running agent.
 */
export interface AskUserToolDeps {
  /**
   * Write the questions and tell the UI they exist. Returns them as written -
   * ids included, which is the only place the ids come from.
   */
  ask: (questions: NormalisedAskInput[]) => Promise<AgentQuestion[]>;
  /**
   * Park until the question is answered, skipped, or the 30-minute ceiling
   * fires. Rejecting is a normal outcome, not a bug.
   */
  waitForAnswer: (questionId: string) => Promise<AskUserAnswer>;
  /**
   * Stamp `expiredAt` on questions whose wait ended without an answer.
   *
   * `waitForQuestionAnswer`'s timeout rejects the waiter but does not touch
   * the record, so without this a timed-out question stays "outstanding" on
   * the board for ever and keeps a finished task looking blocked.
   */
  expire?: (questionIds: string[]) => Promise<unknown>;
  /** Per-run call budget. Defaults to {@link ASK_USER_MAX_CALLS_PER_RUN}. */
  maxCalls?: number;
}

/**
 * Turn one model-supplied question into the service's shape, or null when
 * there is nothing askable in it.
 *
 * Normalising rather than rejecting is deliberate. The MCP layer returns a zod
 * validation failure straight back to the model as a tool error, which costs a
 * turn from the run's budget and, in practice, tends to make the model abandon
 * the question rather than reshape it. The schema therefore carries the
 * contract in its descriptions and this function enforces it silently.
 */
export function normaliseAskQuestion(input: AskUserQuestionInput): NormalisedAskInput | null {
  const question = input?.question?.trim();
  if (!question) return null;

  const header = input.header?.trim().slice(0, MAX_HEADER_LENGTH) || undefined;

  const choices = (input.options ?? [])
    .map((option) => ({
      label: option?.label?.trim() ?? '',
      description: option?.description?.trim() || undefined,
    }))
    .filter((choice) => choice.label.length > 0)
    // An "Other" the model invented would sit next to the one the panel always
    // renders. Drop it rather than show the user the same escape hatch twice.
    .filter((choice) => !/^(other|something else|none of these)\b/i.test(choice.label))
    .slice(0, MAX_OPTIONS_PER_QUESTION);

  return {
    question,
    ...(header ? { header } : {}),
    choices,
    ...(input.multiSelect ? { multiSelect: true } : {}),
  };
}

/** Render one settled wait as the line the model reads back. */
function describeOutcome(
  question: AgentQuestion,
  outcome: PromiseSettledResult<AskUserAnswer>
): string {
  const label = question.header ? `[${question.header}] ${question.question}` : question.question;

  if (outcome.status === 'rejected') {
    const reason =
      outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    return `Q: ${label}\nA: (no answer - ${reason}). Use your own judgement and say in your summary which way you went and why.`;
  }
  if (outcome.value.skipped) {
    return `Q: ${label}\nA: (the user skipped this and asked you to decide). Use your own judgement and record the choice in your summary.`;
  }
  const answer = outcome.value.answer?.trim();
  if (!answer) {
    return `Q: ${label}\nA: (empty answer). Use your own judgement and record the choice in your summary.`;
  }
  return `Q: ${label}\nA: ${answer}`;
}

/** A CallToolResult carrying plain text. */
function textResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

/** What the model sends. Kept loose on purpose - see {@link normaliseAskQuestion}. */
export interface AskUserToolArgs {
  questions?: AskUserQuestionInput[];
}

/**
 * The `ask_user` handler, separated from the MCP wrapper so a test can drive
 * it directly. Everything stateful about the run - the call budget - lives in
 * this closure, so one handler is one run.
 */
export function createAskUserHandler(
  deps: AskUserToolDeps
): (args: AskUserToolArgs) => Promise<ReturnType<typeof textResult>> {
  const maxCalls = deps.maxCalls ?? ASK_USER_MAX_CALLS_PER_RUN;
  let callsUsed = 0;

  return async (args) => {
    if (callsUsed >= maxCalls) {
      logger.warn(`ask_user budget of ${maxCalls} call(s) exhausted; refusing`);
      return textResult(
        `You have already used your ${maxCalls}-call ask_user budget for this run. No further questions can be asked. Decide for yourself, and record the choice and your reasoning in your summary.`,
        true
      );
    }

    const normalised = (args.questions ?? [])
      .slice(0, MAX_QUESTIONS_PER_CALL)
      .map((input) => normaliseAskQuestion(input))
      .filter((question): question is NormalisedAskInput => question !== null);

    if (normalised.length === 0) {
      return textResult(
        'No question text was supplied, so nothing was asked. Send a non-empty `question` for each entry.',
        true
      );
    }

    // Counted on the attempt, not on success. A failed ask still interrupted
    // the run, and a model that retries a broken call must not earn itself a
    // free budget refill out of the failure.
    callsUsed += 1;

    let created: AgentQuestion[];
    let waits: Array<Promise<AskUserAnswer>>;
    try {
      created = await deps.ask(normalised);

      // NOTHING MAY AWAIT BETWEEN `ask` RESOLVING AND THESE WAITERS BEING
      // REGISTERED. `ask` is what makes the question visible - it writes
      // feature.json and emits feature:question-asked - and an answer can only
      // come back over HTTP, which is a macrotask. Registering here, in the
      // microtask `ask` resolves into, is therefore what guarantees the waiter
      // exists before any answer can possibly be processed. The question id
      // does not exist until `ask` returns, so registering literally before the
      // write is not available to us; this is the equivalent guarantee, and an
      // await slipped in here would quietly destroy it.
      waits = created.map((question) => deps.waitForAnswer(question.id));
    } catch (error) {
      logger.error('Failed to park a question on the feature:', error);
      return textResult(
        'The question could not be delivered to the user (the task may no longer exist). Carry on with your own judgement and record the choice in your summary.',
        true
      );
    }

    if (created.length === 0) {
      return textResult(
        'The question could not be recorded against this task, so nobody will see it. Carry on with your own judgement and record the choice in your summary.',
        true
      );
    }

    logger.info(`Parked ${created.length} question(s) on the user; call ${callsUsed}/${maxCalls}`);

    // allSettled, never all: one waiter hitting the 30-minute ceiling must not
    // throw away the answers the user did give to the others.
    const outcomes = await Promise.allSettled(waits);

    const unanswered = created
      .filter((_, index) => outcomes[index].status === 'rejected')
      .map((question) => question.id);
    if (unanswered.length > 0 && deps.expire) {
      try {
        await deps.expire(unanswered);
      } catch (error) {
        logger.warn('Failed to expire unanswered questions:', error);
      }
    }

    const body = created
      .map((question, index) => describeOutcome(question, outcomes[index]))
      .join('\n\n');
    const allRejected = outcomes.every((outcome) => outcome.status === 'rejected');

    return textResult(body, allRejected);
  };
}

/**
 * What the model reads before deciding whether to call the tool. The budget is
 * interpolated so the description can never promise a different number of
 * calls from the one the handler enforces.
 */
export function askUserToolDescription(maxCalls: number): string {
  return [
    'Ask the user to decide something you genuinely cannot resolve from the repository.',
    '',
    'THIS CALL BLOCKS until the user answers, and it holds the worktree and the run',
    'slot while it waits, so use it only for a real fork in the road - two or more',
    'defensible directions with different consequences, where guessing wrong means',
    'rework. Anything the code, the tests, the plan or CLAUDE.md already answers is',
    'not a question: go and read it.',
    '',
    `You may call this at most ${maxCalls} time(s) in a run. Batch related decisions into`,
    'one call rather than spending the budget one question at a time.',
    '',
    'Each question must offer 2-4 mutually exclusive options, each with a short label',
    'and a description of what choosing it means. Never add an "Other" or "Something',
    'else" option - the user is always given a free-text path and a hand-made one just',
    'duplicates it.',
    '',
    'If nobody answers within 30 minutes the call returns unanswered; carry on with',
    'your own judgement and say in your summary which way you went.',
  ].join('\n');
}

/**
 * The zod raw shape `tool()` wants.
 *
 * The 1-4 / 2-4 counts live in the descriptions rather than in the schema on
 * purpose - see {@link normaliseAskQuestion} for why a zod failure is the
 * expensive outcome here.
 */
const askUserInputSchema = {
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe(
            'The complete question to ask the user. Clear, specific, and ending with a question mark. If multiSelect is true, phrase it accordingly.'
          ),
        header: z
          .string()
          .optional()
          .describe(
            `Very short label shown as a chip (max ${MAX_HEADER_LENGTH} chars). Examples: "Auth method", "Library", "Approach".`
          ),
        options: z
          .array(
            z.object({
              label: z
                .string()
                .describe(
                  'The display text the user selects. Concise (1-5 words) and clearly the choice itself.'
                ),
              description: z
                .string()
                .optional()
                .describe(
                  'What this option means, or what will happen if it is chosen. Name the trade-off.'
                ),
            })
          )
          .describe(
            `The available choices. Give 2-${MAX_OPTIONS_PER_QUESTION} distinct, mutually exclusive options (unless multiSelect is set). Do NOT include an "Other" option - one is always provided for you.`
          ),
        // Optional-with-a-default rather than required, unlike the SDK's own
        // schema: a missing field would otherwise fail validation and burn a
        // turn on a question the model meant as single-select anyway.
        multiSelect: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Set true only when the choices are not mutually exclusive and the user may pick several.'
          ),
      })
    )
    .describe(
      `The questions to ask, ${MAX_QUESTIONS_PER_CALL} at most. Ask everything you need decided in one call.`
    ),
};

/**
 * Build the in-process MCP server that exposes `ask_user` for one run.
 *
 * One server per run, because the handler closes over that run's feature and
 * its call budget: the questions it writes and the waiters it registers both
 * belong to a single `runAgent` call.
 */
export function createAskUserMcpServer(deps: AskUserToolDeps) {
  const handler = createAskUserHandler(deps);

  const askUser = tool(
    'ask_user',
    askUserToolDescription(deps.maxCalls ?? ASK_USER_MAX_CALLS_PER_RUN),
    askUserInputSchema,
    async (args) => handler(args as AskUserToolArgs)
  );

  return createSdkMcpServer({
    name: ASK_USER_MCP_SERVER_NAME,
    version: '1.0.0',
    tools: [askUser],
  });
}

/** The `McpSdkServerConfigWithInstance` {@link createAskUserMcpServer} returns. */
export type AskUserMcpServer = ReturnType<typeof createAskUserMcpServer>;

/**
 * Voice Command Interpreter - Routes natural language to voice scripts
 *
 * This service takes natural language voice commands and uses AI to:
 * 1. Understand the user's intent
 * 2. Map the intent to the appropriate voice script
 * 3. Extract parameters from the natural language
 * 4. Execute the script and return results
 *
 * The interpreter acts as a bridge between free-form voice input and
 * the structured voice scripts registered in the script registry.
 */

import type { VoiceCommandResult } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import { simpleQuery } from '../providers/simple-query-service.js';
import {
  dispatchCommand,
  getAllCommands,
  getHelpText,
  type ScriptMetadata,
  type VoiceScriptContext,
} from '../voice-scripts/index.js';

const logger = createLogger('VoiceCommandInterpreter');

// ============================================================================
// Types
// ============================================================================

/**
 * Result from parsing a voice command
 */
export interface ParsedCommand {
  /** The matched command name (null if no match or just conversation) */
  commandName: string | null;
  /** Confidence score 0-1 for the command match */
  confidence: number;
  /** Extracted parameters for the command */
  parameters: Record<string, unknown>;
  /** Whether this requires confirmation (for destructive commands) */
  requiresConfirmation: boolean;
  /** Natural language response to give the user */
  response: string;
  /** Whether this is a help/info request vs a command */
  isHelpRequest: boolean;
  /** Whether the AI couldn't understand the request */
  isAmbiguous: boolean;
}

/**
 * Options for the interpreter
 */
export interface InterpreterOptions {
  /** Model to use for interpretation (defaults to a fast model) */
  model?: string;
  /** Working directory for the project */
  projectPath: string;
  /** Voice session ID for context */
  sessionId: string;
  /** Conversation history for context */
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Whether to require confirmation for destructive commands */
  confirmDestructiveCommands?: boolean;
}

/**
 * Result from interpreting and executing a voice command
 */
export interface InterpretResult {
  /** Whether interpretation was successful */
  success: boolean;
  /** The parsed command info */
  parsed: ParsedCommand;
  /** The execution result (if command was executed) */
  executionResult?: VoiceCommandResult;
  /** Error message if something went wrong */
  error?: string;
}

// ============================================================================
// Voice Command Interpreter
// ============================================================================

/**
 * Voice Command Interpreter
 *
 * Uses AI to understand natural language voice commands and route them
 * to the appropriate voice scripts for execution.
 */
export class VoiceCommandInterpreter {
  private model: string;
  private confirmDestructive: boolean;

  /**
   * Create a new VoiceCommandInterpreter
   *
   * @param options - Configuration options
   */
  constructor(options?: { model?: string; confirmDestructiveCommands?: boolean }) {
    // Use a fast model for quick voice interactions
    this.model = options?.model ?? 'claude-haiku-3-5';
    this.confirmDestructive = options?.confirmDestructiveCommands ?? true;
  }

  /**
   * Interpret a natural language voice command
   *
   * Analyzes the user's voice input and determines:
   * - Which command (if any) they want to execute
   * - What parameters to pass to that command
   * - How to respond conversationally
   *
   * @param input - The transcribed voice input
   * @param options - Interpretation options
   * @returns Parsed command information
   */
  async interpret(input: string, options: InterpreterOptions): Promise<ParsedCommand> {
    const { projectPath, sessionId, conversationHistory } = options;

    logger.info(`Interpreting voice command: "${input}"`, { sessionId });

    // Get available commands for context
    const commands = getAllCommands();
    const commandContext = this.buildCommandContext(commands);

    // Build the interpretation prompt
    const systemPrompt = this.buildSystemPrompt(commandContext);
    const userPrompt = this.buildUserPrompt(input, conversationHistory);

    try {
      // Use AI to interpret the command
      const result = await simpleQuery({
        prompt: userPrompt,
        model: this.model,
        cwd: projectPath,
        systemPrompt,
        maxTurns: 1,
        allowedTools: [],
        outputFormat: {
          type: 'json_schema',
          schema: this.getOutputSchema(),
        },
      });

      // Parse the AI response
      const parsed = this.parseAIResponse(result.structured_output, result.text, commands);

      logger.info(`Interpreted command: ${parsed.commandName ?? 'none'}`, {
        confidence: parsed.confidence,
        parameters: parsed.parameters,
        isHelp: parsed.isHelpRequest,
        isAmbiguous: parsed.isAmbiguous,
      });

      return parsed;
    } catch (error) {
      logger.error('Failed to interpret voice command:', error);

      // Return a graceful fallback
      return {
        commandName: null,
        confidence: 0,
        parameters: {},
        requiresConfirmation: false,
        response:
          "I'm sorry, I had trouble understanding that. Could you try rephrasing your request?",
        isHelpRequest: false,
        isAmbiguous: true,
      };
    }
  }

  /**
   * Interpret and execute a voice command
   *
   * This is the main entry point for voice command processing.
   * It interprets the command and, if appropriate, executes it.
   *
   * @param input - The transcribed voice input
   * @param context - Voice script context for execution
   * @param options - Interpretation options
   * @returns Full interpretation and execution result
   */
  async interpretAndExecute(
    input: string,
    context: VoiceScriptContext,
    options: InterpreterOptions
  ): Promise<InterpretResult> {
    // First, interpret the command
    const parsed = await this.interpret(input, options);

    // If no command was matched or it's a help/ambiguous request, return just the parsed result
    if (!parsed.commandName || parsed.isHelpRequest || parsed.isAmbiguous) {
      return {
        success: true,
        parsed,
      };
    }

    // Check if this is a destructive command that needs confirmation
    if (parsed.requiresConfirmation && this.confirmDestructive) {
      // Check if the command includes confirmation in the parameters
      const isConfirmed = parsed.parameters.confirmed === true;
      if (!isConfirmed) {
        return {
          success: true,
          parsed: {
            ...parsed,
            response: `${parsed.response} This is a destructive action. Please confirm by saying "yes" or "confirm".`,
          },
        };
      }
    }

    // Execute the command
    try {
      logger.info(`Executing command: ${parsed.commandName}`, { parameters: parsed.parameters });

      const dispatchResult = await dispatchCommand({
        commandName: parsed.commandName,
        context: {
          ...context,
          parameters: parsed.parameters,
        },
        args: [parsed.parameters],
      });

      if (!dispatchResult.dispatched) {
        return {
          success: false,
          parsed,
          error: dispatchResult.error ?? 'Command dispatch failed',
        };
      }

      // Merge the execution result with the interpretation
      const executionResult = dispatchResult.result;

      return {
        success: true,
        parsed: {
          ...parsed,
          // Use the execution response if available, otherwise keep the interpreted response
          response: executionResult?.response ?? parsed.response,
        },
        executionResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Command execution failed: ${parsed.commandName}`, error);

      return {
        success: false,
        parsed,
        error: errorMessage,
      };
    }
  }

  /**
   * Build context string for available commands
   */
  private buildCommandContext(commands: ScriptMetadata[]): string {
    const lines: string[] = ['Available commands:'];

    for (const cmd of commands) {
      const destructive = cmd.destructive ? ' [DESTRUCTIVE]' : '';
      lines.push(`\n## ${cmd.name}${destructive}`);
      lines.push(`Description: ${cmd.description}`);
      lines.push(`Category: ${cmd.category}`);
      lines.push(`Examples: ${cmd.examples.slice(0, 3).join('; ')}`);

      if (cmd.parameters && cmd.parameters.length > 0) {
        lines.push('Parameters:');
        for (const param of cmd.parameters) {
          const required = param.required ? '(required)' : '(optional)';
          lines.push(`  - ${param.name} ${required}: ${param.description} [${param.type}]`);
        }
      }

      if (cmd.aliases && cmd.aliases.length > 0) {
        lines.push(`Aliases: ${cmd.aliases.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build the system prompt for command interpretation
   */
  private buildSystemPrompt(commandContext: string): string {
    return `You are a voice command interpreter for a feature management application called Automaker.
Your job is to understand natural language voice commands and map them to the appropriate system commands.

${commandContext}

## Instructions

1. Analyze the user's voice input carefully
2. Determine if they are:
   - Requesting to execute a specific command
   - Asking for help or information
   - Making a conversational statement (not a command)
   - Saying something ambiguous that needs clarification

3. For command requests:
   - Match to the most appropriate command from the list above
   - Extract any parameters mentioned in their request
   - Convert natural language values to the expected parameter types
   - Set confidence based on how clearly the request matches

4. Parameter extraction guidelines:
   - "list pending features" -> status: "pending"
   - "search for login" -> query: "login"
   - "feature 123" or "feature number 123" -> identifier: "123"
   - "the login feature" -> identifier: "login"
   - "mark as completed" -> status: "completed"
   - "create a feature called X" -> title: "X"
   - "run e2e tests" -> runner: "playwright"
   - "run unit tests" -> runner: "vitest"

5. For help requests like "what can you do", "help", "what commands are available":
   - Set isHelpRequest to true
   - Provide a helpful summary of capabilities

6. For ambiguous requests:
   - Set isAmbiguous to true
   - Ask a clarifying question in the response

7. For destructive commands (delete, bulk update):
   - Set requiresConfirmation to true
   - Only set confirmed: true if the user explicitly confirms

8. Respond in a conversational, voice-friendly manner:
   - Keep responses concise (1-3 sentences)
   - Use natural language, not technical jargon
   - For lists, summarize rather than enumerate everything

Always respond with the specified JSON structure.`;
  }

  /**
   * Build the user prompt including conversation history
   */
  private buildUserPrompt(
    input: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    let prompt = '';

    // Include recent conversation for context
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-6); // Last 3 exchanges
      prompt += 'Recent conversation:\n';
      for (const msg of recentHistory) {
        prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      }
      prompt += '\n';
    }

    prompt += `Current user voice input: "${input}"\n\n`;
    prompt += 'Analyze this input and determine the appropriate command and parameters.';

    return prompt;
  }

  /**
   * Get the JSON schema for structured output
   */
  private getOutputSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        commandName: {
          type: ['string', 'null'],
          description: 'The matched command name, or null if no command matches',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Confidence score for the command match (0-1)',
        },
        parameters: {
          type: 'object',
          description: 'Extracted parameters for the command',
          additionalProperties: true,
        },
        requiresConfirmation: {
          type: 'boolean',
          description: 'Whether this command requires user confirmation',
        },
        response: {
          type: 'string',
          description: 'Natural language response to give the user',
        },
        isHelpRequest: {
          type: 'boolean',
          description: 'Whether the user is asking for help/information',
        },
        isAmbiguous: {
          type: 'boolean',
          description: 'Whether the request is ambiguous and needs clarification',
        },
      },
      required: [
        'commandName',
        'confidence',
        'parameters',
        'requiresConfirmation',
        'response',
        'isHelpRequest',
        'isAmbiguous',
      ],
      additionalProperties: false,
    };
  }

  /**
   * Parse the AI response into a ParsedCommand
   */
  private parseAIResponse(
    structuredOutput: Record<string, unknown> | undefined,
    textResponse: string,
    commands: ScriptMetadata[]
  ): ParsedCommand {
    // If we have structured output, use it
    if (structuredOutput) {
      const commandName = structuredOutput.commandName as string | null;

      // Validate the command exists if one was specified
      if (commandName) {
        const matchedCommand = commands.find(
          (cmd) => cmd.name === commandName || cmd.aliases?.includes(commandName)
        );

        if (!matchedCommand) {
          // Command not found - treat as ambiguous
          return {
            commandName: null,
            confidence: 0,
            parameters: {},
            requiresConfirmation: false,
            response:
              (structuredOutput.response as string) ||
              "I'm not sure which command you're referring to. Could you be more specific?",
            isHelpRequest: false,
            isAmbiguous: true,
          };
        }

        // Check if destructive command needs confirmation
        const requiresConfirmation =
          matchedCommand.destructive === true &&
          (structuredOutput.requiresConfirmation as boolean) !== false;

        return {
          commandName: matchedCommand.name, // Use canonical name
          confidence: (structuredOutput.confidence as number) || 0.8,
          parameters: (structuredOutput.parameters as Record<string, unknown>) || {},
          requiresConfirmation,
          response: (structuredOutput.response as string) || 'Executing your command.',
          isHelpRequest: (structuredOutput.isHelpRequest as boolean) || false,
          isAmbiguous: (structuredOutput.isAmbiguous as boolean) || false,
        };
      }

      // No command matched
      return {
        commandName: null,
        confidence: (structuredOutput.confidence as number) || 0,
        parameters: (structuredOutput.parameters as Record<string, unknown>) || {},
        requiresConfirmation: false,
        response:
          (structuredOutput.response as string) ||
          "I didn't recognize that as a command. How can I help you?",
        isHelpRequest: (structuredOutput.isHelpRequest as boolean) || false,
        isAmbiguous: (structuredOutput.isAmbiguous as boolean) || false,
      };
    }

    // Fallback: Try to parse text response as JSON
    try {
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.parseAIResponse(parsed, '', commands);
      }
    } catch {
      // JSON parsing failed
    }

    // Last resort: Return ambiguous response
    return {
      commandName: null,
      confidence: 0,
      parameters: {},
      requiresConfirmation: false,
      response: textResponse || "I'm having trouble understanding. Could you try rephrasing that?",
      isHelpRequest: false,
      isAmbiguous: true,
    };
  }

  /**
   * Get help text for voice commands
   *
   * @param commandName - Optional specific command to get help for
   * @returns Formatted help text
   */
  getHelp(commandName?: string): string {
    return getHelpText(commandName);
  }

  /**
   * Check if an input looks like a confirmation
   *
   * @param input - User input to check
   * @returns Whether the input is a confirmation
   */
  isConfirmation(input: string): boolean {
    const confirmationPatterns = [
      /^yes$/i,
      /^yeah$/i,
      /^yep$/i,
      /^confirm$/i,
      /^confirmed$/i,
      /^do it$/i,
      /^go ahead$/i,
      /^proceed$/i,
      /^ok$/i,
      /^okay$/i,
      /^sure$/i,
      /^affirmative$/i,
    ];

    const normalizedInput = input.trim().toLowerCase();
    return confirmationPatterns.some((pattern) => pattern.test(normalizedInput));
  }

  /**
   * Check if an input looks like a cancellation
   *
   * @param input - User input to check
   * @returns Whether the input is a cancellation
   */
  isCancellation(input: string): boolean {
    const cancellationPatterns = [
      /^no$/i,
      /^nope$/i,
      /^cancel$/i,
      /^cancelled$/i,
      /^stop$/i,
      /^abort$/i,
      /^nevermind$/i,
      /^never mind$/i,
      /^forget it$/i,
      /^don't$/i,
    ];

    const normalizedInput = input.trim().toLowerCase();
    return cancellationPatterns.some((pattern) => pattern.test(normalizedInput));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new VoiceCommandInterpreter instance
 *
 * @param options - Configuration options
 * @returns A configured interpreter instance
 */
export function createVoiceCommandInterpreter(options?: {
  model?: string;
  confirmDestructiveCommands?: boolean;
}): VoiceCommandInterpreter {
  return new VoiceCommandInterpreter(options);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Interpret a voice command using default settings
 *
 * @param input - The transcribed voice input
 * @param options - Interpretation options
 * @returns Parsed command information
 */
export async function interpretVoiceCommand(
  input: string,
  options: InterpreterOptions
): Promise<ParsedCommand> {
  const interpreter = createVoiceCommandInterpreter({
    confirmDestructiveCommands: options.confirmDestructiveCommands,
  });
  return interpreter.interpret(input, options);
}

/**
 * Interpret and execute a voice command using default settings
 *
 * @param input - The transcribed voice input
 * @param context - Voice script context for execution
 * @param options - Interpretation options
 * @returns Full interpretation and execution result
 */
export async function interpretAndExecuteVoiceCommand(
  input: string,
  context: VoiceScriptContext,
  options: InterpreterOptions
): Promise<InterpretResult> {
  const interpreter = createVoiceCommandInterpreter({
    confirmDestructiveCommands: options.confirmDestructiveCommands,
  });
  return interpreter.interpretAndExecute(input, context, options);
}

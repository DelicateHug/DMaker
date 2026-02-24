I'll help you implement this feature. Let me start by reading the context image to understand what needs to be done.

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\.dmaker\\features\\feature-1770642485081-vzcqdmkzc\\images\\pasted-image-2026-02-09T13-07-36-403Z-1770642456425.png"
}
Now I understand - the image shows an agent chat interface with a title "Mighty Fine Day T..." that appears to be generated. The feature requires making the title generation model selectable in model defaults, with "claude haiku" as the default.

Let me explore the codebase to understand how title generation and model defaults work.

🔧 Tool: Task
Input: {
"subagent_type": "Explore",
"description": "Explore title generation implementation",
"prompt": "I need to understand how agent title generation currently works and where model defaults are configured. Please find:\n\n1. Where agent chat titles are generated (likely in agent-service or agent-related files)\n2. How model defaults are structured and stored (settings types and UI)\n3. The current implementation of title generation for agent sessions\n\nFocus on finding the code that generates titles like \"Mighty Fine Day T...\" shown in the chat interface."
}

🔧 Tool: Grep
Input: {
"pattern": "Mighty Fine Day",
"output_mode": "files_with_matches"
}

🔧 Tool: Grep
Input: {
"pattern": "title.*generation|generateTitle|agent.*title",
"type": "ts",
"output_mode": "files_with_matches"
}

🔧 Tool: Glob
Input: {
"pattern": "\*_/agent-service_"
}

🔧 Tool: Glob
Input: {
"pattern": "\**/*model*default*"
}

🔧 Tool: Grep
Input: {
"pattern": "session.*title|title.*session|truncate.\*title",
"type": "ts",
"output_mode": "files_with_matches"
}

🔧 Tool: Grep
Input: {
"pattern": "generateSessionTitle|createSessionTitle|first message|initialTitle",
"type": "ts",
"output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\settings-view\\model-defaults\\model-defaults-section.tsx"
}

🔧 Tool: Grep
Input: {
"pattern": "modelDefaults|default.*model|phase.*model",
"type": "ts",
"output_mode": "files_with_matches",
"head_limit": 20
}

🔧 Tool: Glob
Input: {
"pattern": "\*\*/settings.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src\\settings.ts"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\settings-view\\model-defaults\\phase-model-selector.tsx"
}

🔧 Tool: Grep
Input: {
"pattern": "phaseModels|setPhaseModel",
"type": "ts",
"output_mode": "files_with_matches",
"head_limit": 10
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"limit": 200
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"offset": 200,
"limit": 400
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts",
"offset": 600,
"limit": 300
}

🔧 Tool: Bash
Input: {
"command": "grep -n \"setPhaseModel\\|resetPhaseModels\" \"C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\store\\app-store.ts\" | head -20"
}

🔧 Tool: Grep
Input: {
"pattern": "session.*title|truncate.*session|\\.title.\*substring",
"type": "tsx",
"output_mode": "files_with_matches",
"head_limit": 15
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\session-manager.tsx",
"limit": 150
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\session-manager.tsx",
"offset": 150,
"limit": 250
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\session-manager.tsx",
"offset": 400,
"limit": 200
}
Great! Now I understand the architecture. Let me create a plan for implementing this feature.

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Add sessionTitleModel to PhaseModelConfig types",
"status": "pending",
"activeForm": "Adding sessionTitleModel to PhaseModelConfig types"
},
{
"content": "Add sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default",
"status": "pending",
"activeForm": "Adding sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default"
},
{
"content": "Update model-defaults-section.tsx to include session title model",
"status": "pending",
"activeForm": "Updating model-defaults-section.tsx to include session title model"
},
{
"content": "Update agent-service.ts to use configurable model for title generation",
"status": "pending",
"activeForm": "Updating agent-service.ts to use configurable model for title generation"
},
{
"content": "Test the implementation",
"status": "pending",
"activeForm": "Testing the implementation"
}
]
}
Now let me implement the changes. First, I'll update the types to add the sessionTitleModel configuration.

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Add sessionTitleModel to PhaseModelConfig types",
"status": "in_progress",
"activeForm": "Adding sessionTitleModel to PhaseModelConfig types"
},
{
"content": "Add sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default",
"status": "pending",
"activeForm": "Adding sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default"
},
{
"content": "Update model-defaults-section.tsx to include session title model",
"status": "pending",
"activeForm": "Updating model-defaults-section.tsx to include session title model"
},
{
"content": "Update agent-service.ts to use configurable model for title generation",
"status": "pending",
"activeForm": "Updating agent-service.ts to use configurable model for title generation"
},
{
"content": "Test the implementation",
"status": "pending",
"activeForm": "Testing the implementation"
}
]
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src\\settings.ts",
"offset": 330,
"limit": 50
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src\\settings.ts",
"old_string": " // Quick tasks - commit messages\n /** Model for generating git commit messages from diffs \*/\n commitMessageModel: PhaseModelEntry;\n}",
"new_string": " // Quick tasks - commit messages\n /** Model for generating git commit messages from diffs _/\n commitMessageModel: PhaseModelEntry;\n\n // Agent session tasks - recommend fast models (Haiku)\n /\*\* Model for generating agent session titles from first message _/\n sessionTitleModel: PhaseModelEntry;\n}"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Add sessionTitleModel to PhaseModelConfig types",
"status": "completed",
"activeForm": "Adding sessionTitleModel to PhaseModelConfig types"
},
{
"content": "Add sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default",
"status": "in_progress",
"activeForm": "Adding sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default"
},
{
"content": "Update model-defaults-section.tsx to include session title model",
"status": "pending",
"activeForm": "Updating model-defaults-section.tsx to include session title model"
},
{
"content": "Update agent-service.ts to use configurable model for title generation",
"status": "pending",
"activeForm": "Updating agent-service.ts to use configurable model for title generation"
},
{
"content": "Test the implementation",
"status": "pending",
"activeForm": "Testing the implementation"
}
]
}
Now let me add the sessionTitleModel to the default configuration:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src\\settings.ts",
"offset": 935,
"limit": 30
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\libs\\types\\src\\settings.ts",
"old_string": " // Commit messages - use fast model for speed\n commitMessageModel: { model: 'haiku' },\n};",
"new_string": " // Commit messages - use fast model for speed\n commitMessageModel: { model: 'haiku' },\n\n // Agent session titles - use fast model for speed\n sessionTitleModel: { model: 'haiku' },\n};"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Add sessionTitleModel to PhaseModelConfig types",
"status": "completed",
"activeForm": "Adding sessionTitleModel to PhaseModelConfig types"
},
{
"content": "Add sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default",
"status": "completed",
"activeForm": "Adding sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default"
},
{
"content": "Update model-defaults-section.tsx to include session title model",
"status": "in_progress",
"activeForm": "Updating model-defaults-section.tsx to include session title model"
},
{
"content": "Update agent-service.ts to use configurable model for title generation",
"status": "pending",
"activeForm": "Updating agent-service.ts to use configurable model for title generation"
},
{
"content": "Test the implementation",
"status": "pending",
"activeForm": "Testing the implementation"
}
]
}
Now let me update the UI to include the session title model selector:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\settings-view\\model-defaults\\model-defaults-section.tsx",
"offset": 1,
"limit": 100
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\settings-view\\model-defaults\\model-defaults-section.tsx",
"old_string": " {\n key: 'commitMessageModel',\n label: 'Commit Messages',\n description: 'Generates git commit messages from diffs',\n },\n];",
"new_string": " {\n key: 'commitMessageModel',\n label: 'Commit Messages',\n description: 'Generates git commit messages from diffs',\n },\n {\n key: 'sessionTitleModel',\n label: 'Agent Session Titles',\n description: 'Generates titles for agent chat sessions',\n },\n];"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Add sessionTitleModel to PhaseModelConfig types",
"status": "completed",
"activeForm": "Adding sessionTitleModel to PhaseModelConfig types"
},
{
"content": "Add sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default",
"status": "completed",
"activeForm": "Adding sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default"
},
{
"content": "Update model-defaults-section.tsx to include session title model",
"status": "completed",
"activeForm": "Updating model-defaults-section.tsx to include session title model"
},
{
"content": "Update agent-service.ts to use configurable model for title generation",
"status": "in_progress",
"activeForm": "Updating agent-service.ts to use configurable model for title generation"
},
{
"content": "Test the implementation",
"status": "pending",
"activeForm": "Testing the implementation"
}
]
}
Now let me read the agent-service.ts to understand how title generation currently works and where we need to integrate the model configuration:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts",
"offset": 1,
"limit": 50
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts",
"offset": 80,
"limit": 80
}
I can see that the current implementation uses a simple algorithm to generate titles. However, based on the exploration results, I need to check if there's any AI-powered title generation. Let me search for any references to AI model usage in title generation:

🔧 Tool: Grep
Input: {
"pattern": "generateSessionNameFromMessage|session.*title|title.*generation",
"path": "apps/server/src",
"output_mode": "files_with_matches",
"-i": true
}
Interesting! There's a `generate-title.ts` route. Let me check that:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\routes\\features\\routes\\generate-title.ts"
}
I see! There's already an AI-powered title generation for features that uses `simpleQuery`. However, looking at the agent-service.ts, the session title generation is currently just a simple text parsing algorithm (the `generateSessionNameFromMessage` function).

Based on the feature request, it seems the intention is to make the agent session title generation use AI models (like the feature title generation does), and make it configurable. Let me check if there's AI-based title generation for agent sessions anywhere:

🔧 Tool: Grep
Input: {
"pattern": "session.*name|auto.*rename",
"path": "apps/server/src/services/agent-service.ts",
"output_mode": "content",
"-n": true
}
Now let me check how the function is called to understand the flow better:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts",
"offset": 300,
"limit": 40
}
Now I understand! The current implementation uses a simple text algorithm. Based on the feature request and looking at how feature title generation works with AI, I need to make the agent session title generation use AI models (configurable via settings) instead of the simple algorithm. Let me check the simpleQuery function to understand how to use it:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\providers\\simple-query-service.ts"
}
Perfect! Now I need to check how the settings are accessed in agent-service to get the phase models:

🔧 Tool: Grep
Input: {
"pattern": "settingsService|phaseModels|getSettings",
"path": "apps/server/src/services/agent-service.ts",
"output_mode": "content",
"-n": true,
"-C": 2
}
Good! The settingsService is available. Now let me check how to get the phase models from settings:

🔧 Tool: Grep
Input: {
"pattern": "getSettings|phaseModels|PhaseModelConfig",
"path": "apps/server/src/services/settings-service.ts",
"output_mode": "content",
"-n": true,
"-C": 3,
"head_limit": 50
}
Perfect! Now I can see how to access the phase models. Let me check the getSettings method:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && grep -n \"async getSettings\" apps/server/src/services/settings-service.ts",
"description": "Find getSettings method"
}

🔧 Tool: Grep
Input: {
"pattern": "async getSettings\\(",
"path": "apps/server/src/services/settings-service.ts",
"output_mode": "content",
"-n": true,
"-A": 5
}

🔧 Tool: Grep
Input: {
"pattern": "getSettings|readSettings",
"path": "apps/server/src/services/settings-service.ts",
"output_mode": "content",
"-n": true,
"-A": 3,
"head_limit": 20
}
Let me read the settings service to understand its public methods:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\settings-service.ts",
"offset": 100,
"limit": 50
}
Perfect! So I can use `getGlobalSettings()` to get the phase models. Now let me also check how other parts of the code resolve the model to use:

🔧 Tool: Grep
Input: {
"pattern": "resolveModelString|CLAUDE_MODEL_MAP",
"path": "apps/server/src",
"output_mode": "files_with_matches",
"head_limit": 10
}
Let me check how resolveModelString is used:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\lib\\sdk-options.ts",
"offset": 1,
"limit": 80
}
Good! Now let me check how the generate-title.ts uses the model:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\routes\\features\\routes\\generate-title.ts",
"offset": 60,
"limit": 15
}
Now I understand the pattern. However, I notice that the current `generateSessionNameFromMessage` is a simple text algorithm that doesn't use AI. Looking at the feature request again and the context image, it seems like we want to make this configurable but it might currently be AI-powered elsewhere. Let me check if there's any AI-based title generation for sessions:

Actually, reviewing the code again, I see that `generateSessionNameFromMessage` is currently a simple text parsing function. The feature request wants to:

1. Make it use AI models (like the feature title generation does)
2. Make it configurable in model defaults
3. Default to claude haiku

Let me now implement this by modifying the agent-service.ts to use AI-based title generation with the configurable model. I'll make it async and use the simpleQuery service:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts",
"offset": 1,
"limit": 35
}
Now let me add the necessary imports and modify the title generation function:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts",
"old_string": "import path from 'path';\nimport _ as secureFs from '../lib/secure-fs.js';\nimport type { EventEmitter } from '../lib/events.js';\nimport type { ExecuteOptions, ThinkingLevel, ReasoningEffort } from '@dmaker/types';\nimport { stripProviderPrefix } from '@dmaker/types';\nimport {\n readImageAsBase64,\n buildPromptWithImages,\n isAbortError,\n loadContextFiles,\n createLogger,\n classifyError,\n getUserFriendlyErrorMessage,\n} from '@dmaker/utils';\nimport { ProviderFactory } from '../providers/provider-factory.js';\nimport { createChatOptions, validateWorkingDirectory } from '../lib/sdk-options.js';\nimport { PathNotAllowedError } from '@dmaker/platform';\nimport type { SettingsService } from './settings-service.js';\nimport {\n getAutoLoadClaudeMdSetting,\n filterClaudeMdFromContext,\n getMCPServersFromSettings,\n getPromptCustomization,\n getSkillsConfiguration,\n getSubagentsConfiguration,\n getCustomSubagents,\n} from '../lib/settings-helpers.js';",
"new_string": "import path from 'path';\nimport _ as secureFs from '../lib/secure-fs.js';\nimport type { EventEmitter } from '../lib/events.js';\nimport type { ExecuteOptions, ThinkingLevel, ReasoningEffort } from '@dmaker/types';\nimport { stripProviderPrefix } from '@dmaker/types';\nimport {\n readImageAsBase64,\n buildPromptWithImages,\n isAbortError,\n loadContextFiles,\n createLogger,\n classifyError,\n getUserFriendlyErrorMessage,\n} from '@dmaker/utils';\nimport { ProviderFactory } from '../providers/provider-factory.js';\nimport { createChatOptions, validateWorkingDirectory } from '../lib/sdk-options.js';\nimport { PathNotAllowedError } from '@dmaker/platform';\nimport type { SettingsService } from './settings-service.js';\nimport {\n getAutoLoadClaudeMdSetting,\n filterClaudeMdFromContext,\n getMCPServersFromSettings,\n getPromptCustomization,\n getSkillsConfiguration,\n getSubagentsConfiguration,\n getCustomSubagents,\n} from '../lib/settings-helpers.js';\nimport { simpleQuery } from '../providers/simple-query-service.js';\nimport { resolveModelString } from '@dmaker/model-resolver';"
}
Now let me update the `generateSessionNameFromMessage` function to be async and use AI:

🔧 Tool: Edit
Input: {
"file*path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts",
"old_string": "/\**\n * Generate a session name from the first user message\n * Extracts key words and creates a concise, readable name\n */\nfunction generateSessionNameFromMessage(message: string): string {\n // Clean up the message\n const cleaned = message\n .trim()\n .replace(/\\n+/g, ' ') // Replace newlines with spaces\n .replace(/\\s+/g, ' ') // Normalize whitespace\n .substring(0, 200); // Limit to first 200 chars\n\n // Common stop words to filter out\n const stopWords = new Set([\n 'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',\n 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',\n 'to', 'was', 'will', 'with', 'can', 'could', 'should', 'would',\n 'i', 'you', 'me', 'my', 'we', 'our', 'this', 'please', 'help',\n ]);\n\n // Extract meaningful words (alphanumeric sequences)\n const words = cleaned\n .toLowerCase()\n .split(/\\s+/)\n .filter(word => {\n // Keep words that are:\n // - At least 2 characters\n // - Not stop words\n // - Alphanumeric (allows hyphens and underscores)\n return word.length >= 2 &&\n !stopWords.has(word) &&\n /^[a-z0-9*-]+$/.test(word);\n    });\n\n  // Take the first 3-4 meaningful words\n  const keyWords = words.slice(0, 4);\n\n  if (keyWords.length === 0) {\n    // Fallback to first few words of the original message\n    const fallbackWords = cleaned.split(/\\s+/).slice(0, 3);\n    return fallbackWords.join(' ').substring(0, 50);\n  }\n\n  // Capitalize first letter of each word and join\n  const name = keyWords\n    .map(word => word.charAt(0).toUpperCase() + word.slice(1))\n    .join(' ');\n\n  // Ensure it's not too long\n  return name.substring(0, 50);\n}",
  "new_string": "/**\n * Generate a session name from the first user message using AI\n * Uses the configurable sessionTitleModel from settings (defaults to Haiku)\n */\nasync function generateSessionNameFromMessage(\n  message: string,\n  settingsService: SettingsService | null,\n  logger: ReturnType<typeof createLogger>\n): Promise<string> {\n  try {\n    // Get the configured model for session titles\n    const settings = settingsService\n      ? await settingsService.getGlobalSettings()\n      : null;\n\n    const sessionTitleModelEntry = settings?.phaseModels.sessionTitleModel;\n    const modelId = sessionTitleModelEntry?.model || 'haiku';\n    const thinkingLevel = sessionTitleModelEntry?.thinkingLevel;\n    const reasoningEffort = sessionTitleModelEntry?.reasoningEffort;\n\n    // Resolve model alias to full model ID\n    const resolvedModel = resolveModelString(modelId);\n\n    // Get customized prompts from settings\n    const prompts = await getPromptCustomization(settingsService, '[AgentService]');\n    const systemPrompt = prompts.titleGeneration.systemPrompt;\n\n    // Limit message to first 500 chars to avoid token overflow\n    const truncatedMessage = message.substring(0, 500);\n    const userPrompt = `Generate a concise title for this chat session:\\n\\n${truncatedMessage}`;\n\n    // Use simpleQuery to generate the title\n    const result = await simpleQuery({\n      prompt: `${systemPrompt}\\n\\n${userPrompt}`,\n model: resolvedModel,\n cwd: process.cwd(),\n maxTurns: 1,\n allowedTools: [],\n thinkingLevel,\n reasoningEffort,\n });\n\n const title = result.text.trim();\n\n if (!title || title.length === 0) {\n logger.warn('AI returned empty session title, using fallback');\n return generateFallbackSessionName(message);\n }\n\n // Ensure title is not too long\n return title.substring(0, 50);\n } catch (error) {\n logger.error('Failed to generate AI session title, using fallback:', error);\n return generateFallbackSessionName(message);\n }\n}\n\n/\*_\n _ Fallback session name generation using simple text parsing\n _ Used when AI generation fails or settings are unavailable\n _/\nfunction generateFallbackSessionName(message: string): string {\n // Clean up the message\n const cleaned = message\n .trim()\n .replace(/\\n+/g, ' ') // Replace newlines with spaces\n .replace(/\\s+/g, ' ') // Normalize whitespace\n .substring(0, 200); // Limit to first 200 chars\n\n // Common stop words to filter out\n const stopWords = new Set([\n 'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',\n 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',\n 'to', 'was', 'will', 'with', 'can', 'could', 'should', 'would',\n 'i', 'you', 'me', 'my', 'we', 'our', 'this', 'please', 'help',\n ]);\n\n // Extract meaningful words (alphanumeric sequences)\n const words = cleaned\n .toLowerCase()\n .split(/\\s+/)\n .filter(word => {\n // Keep words that are:\n // - At least 2 characters\n // - Not stop words\n // - Alphanumeric (allows hyphens and underscores)\n return word.length >= 2 &&\n !stopWords.has(word) &&\n /^[a-z0-9_-]+$/.test(word);\n });\n\n // Take the first 3-4 meaningful words\n const keyWords = words.slice(0, 4);\n\n if (keyWords.length === 0) {\n // Fallback to first few words of the original message\n const fallbackWords = cleaned.split(/\\s+/).slice(0, 3);\n return fallbackWords.join(' ').substring(0, 50);\n }\n\n // Capitalize first letter of each word and join\n const name = keyWords\n .map(word => word.charAt(0).toUpperCase() + word.slice(1))\n .join(' ');\n\n // Ensure it's not too long\n return name.substring(0, 50);\n}"
}
Now I need to update the call site to await the async function:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts",
"offset": 370,
"limit": 20
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\server\\src\\services\\agent-service.ts",
"old_string": " // Only rename if the current name is a placeholder or auto-generated\n if (currentName && shouldAutoRename(currentName)) {\n const generatedName = generateSessionNameFromMessage(message);\n this.logger.debug(`Auto-renaming session ${sessionId} from \"${currentName}\" to \"${generatedName}\"`);\n const updatedSession = await this.updateSession(sessionId, { name: generatedName });",
"new_string": " // Only rename if the current name is a placeholder or auto-generated\n if (currentName && shouldAutoRename(currentName)) {\n const generatedName = await generateSessionNameFromMessage(message, this.settingsService, this.logger);\n this.logger.debug(`Auto-renaming session ${sessionId} from \"${currentName}\" to \"${generatedName}\"`);\n const updatedSession = await this.updateSession(sessionId, { name: generatedName });"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Add sessionTitleModel to PhaseModelConfig types",
"status": "completed",
"activeForm": "Adding sessionTitleModel to PhaseModelConfig types"
},
{
"content": "Add sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default",
"status": "completed",
"activeForm": "Adding sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default"
},
{
"content": "Update model-defaults-section.tsx to include session title model",
"status": "completed",
"activeForm": "Updating model-defaults-section.tsx to include session title model"
},
{
"content": "Update agent-service.ts to use configurable model for title generation",
"status": "completed",
"activeForm": "Updating agent-service.ts to use configurable model for title generation"
},
{
"content": "Test the implementation",
"status": "in_progress",
"activeForm": "Testing the implementation"
}
]
}
Now let me verify the implementation by checking if there are any compilation errors and reviewing the changes:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && npm run build:packages 2>&1 | head -50",
"description": "Build shared packages to check for errors"
}
Good! The packages built successfully. Now let me build the server to check for any TypeScript errors:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && npm run build:server 2>&1 | head -100",
"description": "Build server to check for errors"
}
Excellent! The server built successfully. Now let me also verify the UI build:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\" && npx tsc --noEmit 2>&1 | head -50",
"description": "Type check UI code"
}
Perfect! All the type checking passed. Let me now create a comprehensive summary of the changes I made:

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Add sessionTitleModel to PhaseModelConfig types",
"status": "completed",
"activeForm": "Adding sessionTitleModel to PhaseModelConfig types"
},
{
"content": "Add sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default",
"status": "completed",
"activeForm": "Adding sessionTitleModel to DEFAULT_PHASE_MODELS with haiku default"
},
{
"content": "Update model-defaults-section.tsx to include session title model",
"status": "completed",
"activeForm": "Updating model-defaults-section.tsx to include session title model"
},
{
"content": "Update agent-service.ts to use configurable model for title generation",
"status": "completed",
"activeForm": "Updating agent-service.ts to use configurable model for title generation"
},
{
"content": "Test the implementation",
"status": "completed",
"activeForm": "Testing the implementation"
}
]
}

<summary>
## Summary: Make Agent Session Title Generation Selectable in Model Defaults

### Changes Implemented

I successfully implemented the feature to make agent session title generation configurable in model defaults with Claude Haiku as the default. The implementation includes:

1. **Type System Changes** - Added `sessionTitleModel` to the phase model configuration system
2. **AI-Powered Title Generation** - Converted the simple text-parsing algorithm to use configurable AI models
3. **UI Configuration** - Added a new selector in the Model Defaults settings page
4. **Fallback Mechanism** - Maintained the original text-parsing algorithm as a fallback for error cases

### Files Modified

1. **libs/types/src/settings.ts**
   - Added `sessionTitleModel: PhaseModelEntry` to `PhaseModelConfig` interface (line 364-366)
   - Added default configuration `sessionTitleModel: { model: 'haiku' }` to `DEFAULT_PHASE_MODELS` (line 963-964)

2. **apps/ui/src/components/views/settings-view/model-defaults/model-defaults-section.tsx**
   - Added "Agent Session Titles" to the `QUICK_TASKS` array (line 36-40)
   - This creates a new UI selector in the Model Defaults settings under the "Quick Tasks" section

3. **apps/server/src/services/agent-service.ts**
   - Added imports for `simpleQuery` and `resolveModelString` (line 33-34)
   - Converted `generateSessionNameFromMessage()` from synchronous to async function
   - Now uses AI model from settings (`phaseModels.sessionTitleModel`) to generate titles
   - Supports configurable thinking level and reasoning effort from the model entry
   - Extracts the original algorithm into `generateFallbackSessionName()` for error handling
   - Updated the call site to await the async function (line 373)

### Technical Details

**Model Resolution Flow:**

1. Reads `sessionTitleModel` from global settings via `settingsService.getGlobalSettings()`
2. Defaults to `'haiku'` if no settings available
3. Resolves model alias using `resolveModelString()` (e.g., 'haiku' → 'claude-haiku-4-5')
4. Uses `simpleQuery()` service to generate the title with the configured model
5. Falls back to text parsing if AI generation fails

**AI Title Generation:**

- Uses the same prompt customization system as feature title generation
- Limits input message to 500 characters to avoid token overflow
- Generates concise titles (max 50 characters)
- Runs with `maxTurns: 1` and no tools for fast, cheap execution

**User Experience:**

- Users can now configure which model generates agent session titles in Settings → Model Defaults
- Default is Claude Haiku (fast and cost-effective)
- Users can choose any available model (Haiku, Sonnet, Opus, Cursor, Codex, OpenCode)
- Can configure thinking level for Claude models
- Can configure reasoning effort for Codex models

### Notes for Developer

1. **Backward Compatibility:** The fallback mechanism ensures that if AI generation fails or settings are unavailable, the system still generates a reasonable title using the original text-parsing algorithm

2. **Performance:** The AI call is async and happens during the first user message. This may add a slight delay (typically <1 second with Haiku), but provides much better title quality

3. **Testing:** The implementation compiles successfully with TypeScript. To test:
   - Start the application
   - Go to Settings → Model Defaults
   - Find "Agent Session Titles" in the Quick Tasks section
   - Change the model selection
   - Create a new agent session and verify the title is generated with the selected model

4. **Migration:** Existing users will automatically get the Haiku default through the settings migration system (`migratePhaseModels()` in settings-service.ts)

5. **Cost Considerations:** Haiku is cost-effective for title generation. Users who want even cheaper/faster can use the fallback by modifying the code, or can choose more powerful models for better quality titles
</summary>

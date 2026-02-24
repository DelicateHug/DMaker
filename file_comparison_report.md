# File-by-File Comparison: Your Fork vs Upstream

| File                                                                                                     | Your Lines | Upstream Lines | Shared Lines | Shared % | Status           |
| -------------------------------------------------------------------------------------------------------- | ---------- | -------------- | ------------ | -------- | ---------------- |
| .claude/.gitignore                                                                                       | 1          | 0              | 1            | 100%     | Identical        |
| .claude/agents/clean-code-architect.md                                                                   | 86         | 0              | 86           | 100%     | Identical        |
| .claude/agents/deepcode.md                                                                               | 249        | 0              | 249          | 100%     | Identical        |
| .claude/agents/deepdive.md                                                                               | 253        | 0              | 253          | 100%     | Identical        |
| .claude/agents/security-vulnerability-scanner.md                                                         | 78         | 0              | 78           | 100%     | Identical        |
| .claude/commands/deepreview.md                                                                           | 591        | 0              | 591          | 100%     | Identical        |
| .claude/commands/gh-issue.md                                                                             | 74         | 0              | 74           | 100%     | Identical        |
| .claude/commands/release.md                                                                              | 77         | 0              | 77           | 100%     | Identical        |
| .claude/commands/review.md                                                                               | 484        | 0              | 484          | 100%     | Identical        |
| .claude/commands/thorough.md                                                                             | 45         | 0              | 45           | 100%     | Identical        |
| .claude/commands/validate-build.md                                                                       | 49         | 0              | 49           | 100%     | Identical        |
| .claude/commands/validate-tests.md                                                                       | 36         | 0              | 36           | 100%     | Identical        |
| .claude/settings.json                                                                                    | 12         | 0              | 0            | 0%       | Only in fork     |
| .dockerignore                                                                                            | 18         | 0              | 18           | 100%     | Identical        |
| .github/actions/setup-project/action.yml                                                                 | 72         | 0              | 72           | 100%     | Identical        |
| .github/ISSUE_TEMPLATE/bug_report.yml                                                                    | 117        | 0              | 117          | 100%     | Identical        |
| .github/ISSUE_TEMPLATE/feature_request.yml                                                               | 108        | 0              | 108          | 100%     | Identical        |
| .github/scripts/upload-to-r2.js                                                                          | 355        | 0              | 355          | 100%     | Identical        |
| .github/workflows/claude.yml                                                                             | 49         | 0              | 49           | 100%     | Identical        |
| .github/workflows/e2e-tests.yml                                                                          | 178        | 0              | 178          | 100%     | Identical        |
| .github/workflows/format-check.yml                                                                       | 31         | 0              | 31           | 100%     | Identical        |
| .github/workflows/pr-check.yml                                                                           | 26         | 0              | 26           | 100%     | Identical        |
| .github/workflows/release.yml                                                                            | 116        | 0              | 0            | 0%       | Modified         |
| .github/workflows/security-audit.yml                                                                     | 30         | 0              | 30           | 100%     | Identical        |
| .github/workflows/test.yml                                                                               | 44         | 0              | 44           | 100%     | Identical        |
| .gitignore                                                                                               | 105        | 0              | 0            | 0%       | Modified         |
| .husky/pre-commit                                                                                        | 51         | 0              | 51           | 100%     | Identical        |
| .npmrc                                                                                                   | 16         | 0              | 16           | 100%     | Identical        |
| .nvmrc                                                                                                   | 2          | 0              | 2            | 100%     | Identical        |
| .prettierignore                                                                                          | 41         | 0              | 41           | 100%     | Identical        |
| .prettierrc                                                                                              | 10         | 0              | 10           | 100%     | Identical        |
| apps/server/.env.example                                                                                 | 95         | 89             | 0            | 0%       | Modified         |
| apps/server/.gitignore                                                                                   | 3          | 3              | 3            | 100%     | Identical        |
| apps/server/package.json                                                                                 | 61         | 61             | 57           | 93%      | Modified         |
| apps/server/pnpm-lock.yaml                                                                               | 2267       | 2267           | 2267         | 100%     | Identical        |
| apps/server/src/index.ts                                                                                 | 731        | 835            | 616          | 73%      | Modified         |
| apps/server/src/lib/agent-discovery.ts                                                                   | 257        | 257            | 257          | 100%     | Identical        |
| apps/server/src/lib/app-spec-format.ts                                                                   | 210        | 210            | 210          | 100%     | Identical        |
| apps/server/src/lib/auth.ts                                                                              | 379        | 467            | 350          | 74%      | Modified         |
| apps/server/src/lib/auth-utils.ts                                                                        | 263        | 263            | 263          | 100%     | Identical        |
| apps/server/src/lib/cli-detection.ts                                                                     | 447        | 447            | 447          | 100%     | Identical        |
| apps/server/src/lib/codex-auth.ts                                                                        | 68         | 68             | 68           | 100%     | Identical        |
| apps/server/src/lib/enhancement-prompts.ts                                                               | 25         | 25             | 25           | 100%     | Identical        |
| apps/server/src/lib/error-handler.ts                                                                     | 414        | 414            | 414          | 100%     | Identical        |
| apps/server/src/lib/events.ts                                                                            | 212        | 39             | 39           | 18%      | Modified         |
| apps/server/src/lib/json-extractor.ts                                                                    | 211        | 211            | 211          | 100%     | Identical        |
| apps/server/src/lib/permission-enforcer.ts                                                               | 173        | 173            | 173          | 100%     | Identical        |
| apps/server/src/lib/request-cache.ts                                                                     | 411        | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/lib/sdk-options.ts                                                                       | 578        | 578            | 578          | 100%     | Identical        |
| apps/server/src/lib/secure-fs.ts                                                                         | 39         | 39             | 39           | 100%     | Identical        |
| apps/server/src/lib/settings-helpers.ts                                                                  | 347        | 730            | 0            | 0%       | Modified         |
| apps/server/src/lib/terminal-themes-data.ts                                                              | 0          | 25             | 0            | 0%       | Only in upstream |
| apps/server/src/lib/validation-storage.ts                                                                | 181        | 181            | 181          | 100%     | Identical        |
| apps/server/src/lib/version.ts                                                                           | 36         | 36             | 36           | 100%     | Identical        |
| apps/server/src/lib/worktree-metadata.ts                                                                 | 186        | 182            | 0            | 0%       | Modified         |
| apps/server/src/lib/xml-extractor.ts                                                                     | 611        | 611            | 611          | 100%     | Identical        |
| apps/server/src/middleware/require-json-content-type.ts                                                  | 50         | 50             | 50           | 100%     | Identical        |
| apps/server/src/middleware/validate-paths.ts                                                             | 87         | 87             | 87           | 100%     | Identical        |
| apps/server/src/providers/base-provider.ts                                                               | 94         | 94             | 94           | 100%     | Identical        |
| apps/server/src/providers/claude-provider.ts                                                             | 250        | 411            | 239          | 58%      | Modified         |
| apps/server/src/providers/cli-provider.ts                                                                | 625        | 625            | 625          | 100%     | Identical        |
| apps/server/src/providers/codex-config-manager.ts                                                        | 85         | 85             | 85           | 100%     | Identical        |
| apps/server/src/providers/codex-models.ts                                                                | 111        | 111            | 111          | 100%     | Identical        |
| apps/server/src/providers/codex-provider.ts                                                              | 1131       | 1143           | 0            | 0%       | Modified         |
| apps/server/src/providers/codex-sdk-client.ts                                                            | 173        | 173            | 173          | 100%     | Identical        |
| apps/server/src/providers/codex-tool-mapping.ts                                                          | 436        | 436            | 436          | 100%     | Identical        |
| apps/server/src/providers/copilot-provider.ts                                                            | 0          | 942            | 0            | 0%       | Only in upstream |
| apps/server/src/providers/cursor-config-manager.ts                                                       | 197        | 197            | 0            | 0%       | Modified         |
| apps/server/src/providers/cursor-provider.ts                                                             | 1056       | 1243           | 0            | 0%       | Modified         |
| apps/server/src/providers/gemini-provider.ts                                                             | 0          | 810            | 0            | 0%       | Only in upstream |
| apps/server/src/providers/index.ts                                                                       | 40         | 56             | 0            | 0%       | Modified         |
| apps/server/src/providers/opencode-provider.ts                                                           | 1250       | 1205           | 1185         | 94%      | Modified         |
| apps/server/src/providers/provider-factory.ts                                                            | 303        | 330            | 299          | 90%      | Modified         |
| apps/server/src/providers/simple-query-service.ts                                                        | 254        | 275            | 0            | 0%       | Modified         |
| apps/server/src/providers/tool-normalization.ts                                                          | 0          | 112            | 0            | 0%       | Only in upstream |
| apps/server/src/providers/types.ts                                                                       | 22         | 25             | 0            | 0%       | Modified         |
| apps/server/src/routes/agent/common.ts                                                                   | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/agent/index.ts                                                                    | 45         | 45             | 45           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/clear.ts                                                             | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/history.ts                                                           | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/model.ts                                                             | 29         | 29             | 29           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/queue-add.ts                                                         | 41         | 41             | 41           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/queue-clear.ts                                                       | 29         | 29             | 29           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/queue-list.ts                                                        | 29         | 29             | 29           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/queue-remove.ts                                                      | 32         | 32             | 32           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/send.ts                                                              | 70         | 70             | 70           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/start.ts                                                             | 35         | 35             | 35           | 100%     | Identical        |
| apps/server/src/routes/agent/routes/stop.ts                                                              | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/app-spec/common.ts                                                                | 140        | 140            | 140          | 100%     | Identical        |
| apps/server/src/routes/app-spec/generate-features-from-spec.ts                                           | 158        | 329            | 0            | 0%       | Modified         |
| apps/server/src/routes/app-spec/generate-spec.ts                                                         | 295        | 317            | 0            | 0%       | Modified         |
| apps/server/src/routes/app-spec/index.ts                                                                 | 29         | 29             | 29           | 100%     | Identical        |
| apps/server/src/routes/app-spec/parse-and-create-features.ts                                             | 112        | 112            | 112          | 100%     | Identical        |
| apps/server/src/routes/app-spec/routes/create.ts                                                         | 93         | 93             | 93           | 100%     | Identical        |
| apps/server/src/routes/app-spec/routes/generate.ts                                                       | 94         | 94             | 94           | 100%     | Identical        |
| apps/server/src/routes/app-spec/routes/generate-features.ts                                              | 76         | 76             | 76           | 100%     | Identical        |
| apps/server/src/routes/app-spec/routes/status.ts                                                         | 18         | 18             | 18           | 100%     | Identical        |
| apps/server/src/routes/app-spec/routes/stop.ts                                                           | 24         | 24             | 24           | 100%     | Identical        |
| apps/server/src/routes/app-spec/routes/sync.ts                                                           | 76         | 76             | 76           | 100%     | Identical        |
| apps/server/src/routes/app-spec/sync-spec.ts                                                             | 307        | 390            | 0            | 0%       | Modified         |
| apps/server/src/routes/auth/index.ts                                                                     | 248        | 266            | 0            | 0%       | Modified         |
| apps/server/src/routes/auto-mode/common.ts                                                               | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/auto-mode/index.ts                                                                | 74         | 80             | 0            | 0%       | Modified         |
| apps/server/src/routes/auto-mode/routes/analyze-project.ts                                               | 33         | 33             | 33           | 100%     | Identical        |
| apps/server/src/routes/auto-mode/routes/approve-plan.ts                                                  | 78         | 78             | 78           | 100%     | Identical        |
| apps/server/src/routes/auto-mode/routes/commit-feature.ts                                                | 33         | 33             | 33           | 100%     | Identical        |
| apps/server/src/routes/auto-mode/routes/context-exists.ts                                                | 32         | 32             | 32           | 100%     | Identical        |
| apps/server/src/routes/auto-mode/routes/follow-up-feature.ts                                             | 51         | 51             | 51           | 100%     | Identical        |
| apps/server/src/routes/auto-mode/routes/resume-feature.ts                                                | 70         | 43             | 43           | 61%      | Modified         |
| apps/server/src/routes/auto-mode/routes/resume-interrupted.ts                                            | 42         | 42             | 42           | 100%     | Identical        |
| apps/server/src/routes/auto-mode/routes/run-feature.ts                                                   | 130        | 65             | 0            | 0%       | Modified         |
| apps/server/src/routes/auto-mode/routes/start.ts                                                         | 0          | 67             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/auto-mode/routes/status.ts                                                        | 22         | 56             | 0            | 0%       | Modified         |
| apps/server/src/routes/auto-mode/routes/stop.ts                                                          | 0          | 66             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/auto-mode/routes/stop-feature.ts                                                  | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/auto-mode/routes/verify-feature.ts                                                | 32         | 32             | 32           | 100%     | Identical        |
| apps/server/src/routes/backlog-plan/common.ts                                                            | 114        | 163            | 0            | 0%       | Modified         |
| apps/server/src/routes/backlog-plan/generate-plan.ts                                                     | 236        | 266            | 0            | 0%       | Modified         |
| apps/server/src/routes/backlog-plan/index.ts                                                             | 32         | 32             | 32           | 100%     | Identical        |
| apps/server/src/routes/backlog-plan/routes/apply.ts                                                      | 170        | 171            | 0            | 0%       | Modified         |
| apps/server/src/routes/backlog-plan/routes/clear.ts                                                      | 25         | 25             | 25           | 100%     | Identical        |
| apps/server/src/routes/backlog-plan/routes/generate.ts                                                   | 75         | 74             | 0            | 0%       | Modified         |
| apps/server/src/routes/backlog-plan/routes/status.ts                                                     | 20         | 20             | 20           | 100%     | Identical        |
| apps/server/src/routes/backlog-plan/routes/stop.ts                                                       | 29         | 29             | 29           | 100%     | Identical        |
| apps/server/src/routes/claude/index.ts                                                                   | 57         | 57             | 57           | 100%     | Identical        |
| apps/server/src/routes/claude/types.ts                                                                   | 38         | 35             | 35           | 92%      | Modified         |
| apps/server/src/routes/codex/index.ts                                                                    | 90         | 90             | 90           | 100%     | Identical        |
| apps/server/src/routes/common.ts                                                                         | 38         | 38             | 38           | 100%     | Identical        |
| apps/server/src/routes/context/index.ts                                                                  | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/context/routes/describe-file.ts                                                   | 210        | 220            | 0            | 0%       | Modified         |
| apps/server/src/routes/context/routes/describe-image.ts                                                  | 388        | 401            | 0            | 0%       | Modified         |
| apps/server/src/routes/deploy/common.ts                                                                  | 12         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/deploy/index.ts                                                                   | 50         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/deploy/routes/delete-runs.ts                                                      | 30         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/deploy/routes/folder-scripts.ts                                                   | 53         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/deploy/routes/run.ts                                                              | 147        | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/deploy/routes/runs.ts                                                             | 32         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/enhance-prompt/index.ts                                                           | 24         | 24             | 24           | 100%     | Identical        |
| apps/server/src/routes/enhance-prompt/routes/enhance.ts                                                  | 172        | 273            | 0            | 0%       | Modified         |
| apps/server/src/routes/event-history/common.ts                                                           | 0          | 19             | 0            | 0%       | Modified         |
| apps/server/src/routes/event-history/index.ts                                                            | 0          | 68             | 0            | 0%       | Modified         |
| apps/server/src/routes/event-history/routes/clear.ts                                                     | 0          | 33             | 0            | 0%       | Modified         |
| apps/server/src/routes/event-history/routes/delete.ts                                                    | 0          | 43             | 0            | 0%       | Modified         |
| apps/server/src/routes/event-history/routes/get.ts                                                       | 0          | 46             | 0            | 0%       | Modified         |
| apps/server/src/routes/event-history/routes/list.ts                                                      | 0          | 53             | 0            | 0%       | Modified         |
| apps/server/src/routes/event-history/routes/replay.ts                                                    | 0          | 234            | 0            | 0%       | Modified         |
| apps/server/src/routes/features/common.ts                                                                | 50         | 12             | 12           | 24%      | Modified         |
| apps/server/src/routes/features/index.ts                                                                 | 78         | 66             | 57           | 73%      | Modified         |
| apps/server/src/routes/features/routes/agent-output.ts                                                   | 74         | 61             | 60           | 81%      | Modified         |
| apps/server/src/routes/features/routes/bulk-delete.ts                                                    | 73         | 69             | 68           | 93%      | Modified         |
| apps/server/src/routes/features/routes/bulk-update.ts                                                    | 98         | 94             | 93           | 94%      | Modified         |
| apps/server/src/routes/features/routes/counts-by-status.ts                                               | 30         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/features/routes/create.ts                                                         | 60         | 57             | 55           | 91%      | Modified         |
| apps/server/src/routes/features/routes/delete.ts                                                         | 37         | 32             | 31           | 83%      | Modified         |
| apps/server/src/routes/features/routes/export.ts                                                         | 0          | 96             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/features/routes/generate-title.ts                                                 | 104        | 109            | 0            | 0%       | Modified         |
| apps/server/src/routes/features/routes/get.ts                                                            | 37         | 37             | 37           | 100%     | Identical        |
| apps/server/src/routes/features/routes/import.ts                                                         | 0          | 210            | 0            | 0%       | Only in upstream |
| apps/server/src/routes/features/routes/list.ts                                                           | 42         | 53             | 24           | 45%      | Modified         |
| apps/server/src/routes/features/routes/list-summaries.ts                                                 | 45         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/features/routes/running.ts                                                        | 54         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/features/routes/summaries.ts                                                      | 88         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/features/routes/update.ts                                                         | 98         | 95             | 93           | 94%      | Modified         |
| apps/server/src/routes/fs/common.ts                                                                      | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/fs/index.ts                                                                       | 42         | 42             | 42           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/browse.ts                                                               | 142        | 118            | 116          | 81%      | Modified         |
| apps/server/src/routes/fs/routes/delete.ts                                                               | 34         | 34             | 34           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/delete-board-background.ts                                              | 45         | 45             | 45           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/exists.ts                                                               | 41         | 41             | 41           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/image.ts                                                                | 66         | 73             | 0            | 0%       | Modified         |
| apps/server/src/routes/fs/routes/mkdir.ts                                                                | 70         | 70             | 70           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/read.ts                                                                 | 50         | 50             | 50           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/readdir.ts                                                              | 40         | 40             | 40           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/resolve-directory.ts                                                    | 117        | 117            | 117          | 100%     | Identical        |
| apps/server/src/routes/fs/routes/save-board-background.ts                                                | 52         | 54             | 0            | 0%       | Modified         |
| apps/server/src/routes/fs/routes/save-image.ts                                                           | 54         | 57             | 0            | 0%       | Modified         |
| apps/server/src/routes/fs/routes/stat.ts                                                                 | 42         | 42             | 42           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/validate-path.ts                                                        | 59         | 59             | 59           | 100%     | Identical        |
| apps/server/src/routes/fs/routes/write.ts                                                                | 41         | 41             | 41           | 100%     | Identical        |
| apps/server/src/routes/git/common.ts                                                                     | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/git/index.ts                                                                      | 17         | 17             | 17           | 100%     | Identical        |
| apps/server/src/routes/git/routes/diffs.ts                                                               | 36         | 36             | 36           | 100%     | Identical        |
| apps/server/src/routes/git/routes/file-diff.ts                                                           | 57         | 57             | 57           | 100%     | Identical        |
| apps/server/src/routes/github/index.ts                                                                   | 96         | 58             | 0            | 0%       | Modified         |
| apps/server/src/routes/github/routes/check-github-remote.ts                                              | 140        | 127            | 0            | 0%       | Modified         |
| apps/server/src/routes/github/routes/claim-issue.ts                                                      | 73         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/github/routes/common.ts                                                           | 38         | 38             | 38           | 100%     | Identical        |
| apps/server/src/routes/github/routes/current-user.ts                                                     | 32         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/github/routes/list-comments.ts                                                    | 247        | 247            | 0            | 0%       | Modified         |
| apps/server/src/routes/github/routes/list-issues.ts                                                      | 335        | 331            | 0            | 0%       | Modified         |
| apps/server/src/routes/github/routes/list-prs.ts                                                         | 123        | 123            | 0            | 0%       | Modified         |
| apps/server/src/routes/github/routes/sync-issue.ts                                                       | 70         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/github/routes/unclaim-issue.ts                                                    | 67         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/github/routes/validate-issue.ts                                                   | 399        | 427            | 0            | 0%       | Modified         |
| apps/server/src/routes/github/routes/validation-common.ts                                                | 174        | 174            | 174          | 100%     | Identical        |
| apps/server/src/routes/github/routes/validation-endpoints.ts                                             | 236        | 236            | 236          | 100%     | Identical        |
| apps/server/src/routes/github/routes/validation-schema.ts                                                | 172        | 172            | 172          | 100%     | Identical        |
| apps/server/src/routes/health/common.ts                                                                  | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/health/index.ts                                                                   | 30         | 30             | 30           | 100%     | Identical        |
| apps/server/src/routes/health/routes/detailed.ts                                                         | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/health/routes/environment.ts                                                      | 22         | 22             | 22           | 100%     | Identical        |
| apps/server/src/routes/health/routes/index.ts                                                            | 16         | 16             | 16           | 100%     | Identical        |
| apps/server/src/routes/ideation/common.ts                                                                | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/ideation/index.ts                                                                 | 109        | 109            | 109          | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/add-suggestion.ts                                                 | 70         | 70             | 70           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/analyze.ts                                                        | 49         | 49             | 49           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/convert.ts                                                        | 77         | 77             | 77           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/ideas-create.ts                                                   | 51         | 51             | 51           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/ideas-delete.ts                                                   | 42         | 42             | 42           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/ideas-get.ts                                                      | 39         | 39             | 39           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/ideas-list.ts                                                     | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/ideas-update.ts                                                   | 54         | 54             | 54           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/prompts.ts                                                        | 42         | 42             | 42           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/session-get.ts                                                    | 45         | 45             | 45           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/session-message.ts                                                | 40         | 40             | 40           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/session-start.ts                                                  | 30         | 30             | 30           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/session-stop.ts                                                   | 39         | 39             | 39           | 100%     | Identical        |
| apps/server/src/routes/ideation/routes/suggestions-generate.ts                                           | 56         | 63             | 0            | 0%       | Modified         |
| apps/server/src/routes/mcp/common.ts                                                                     | 24         | 24             | 24           | 100%     | Identical        |
| apps/server/src/routes/mcp/index.ts                                                                      | 36         | 36             | 36           | 100%     | Identical        |
| apps/server/src/routes/mcp/routes/list-tools.ts                                                          | 57         | 57             | 57           | 100%     | Identical        |
| apps/server/src/routes/mcp/routes/test-server.ts                                                         | 50         | 50             | 50           | 100%     | Identical        |
| apps/server/src/routes/models/common.ts                                                                  | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/models/index.ts                                                                   | 16         | 16             | 16           | 100%     | Identical        |
| apps/server/src/routes/models/routes/available.ts                                                        | 22         | 21             | 21           | 95%      | Modified         |
| apps/server/src/routes/models/routes/providers.ts                                                        | 36         | 35             | 35           | 97%      | Modified         |
| apps/server/src/routes/notifications/common.ts                                                           | 21         | 21             | 21           | 100%     | Identical        |
| apps/server/src/routes/notifications/index.ts                                                            | 62         | 62             | 62           | 100%     | Identical        |
| apps/server/src/routes/notifications/routes/dismiss.ts                                                   | 53         | 53             | 53           | 100%     | Identical        |
| apps/server/src/routes/notifications/routes/list.ts                                                      | 39         | 39             | 39           | 100%     | Identical        |
| apps/server/src/routes/notifications/routes/mark-read.ts                                                 | 50         | 50             | 50           | 100%     | Identical        |
| apps/server/src/routes/notifications/routes/unread-count.ts                                              | 39         | 39             | 39           | 100%     | Identical        |
| apps/server/src/routes/pipeline/common.ts                                                                | 21         | 21             | 21           | 100%     | Identical        |
| apps/server/src/routes/pipeline/index.ts                                                                 | 77         | 77             | 77           | 100%     | Identical        |
| apps/server/src/routes/pipeline/routes/add-step.ts                                                       | 54         | 54             | 54           | 100%     | Identical        |
| apps/server/src/routes/pipeline/routes/delete-step.ts                                                    | 42         | 42             | 42           | 100%     | Identical        |
| apps/server/src/routes/pipeline/routes/get-config.ts                                                     | 35         | 35             | 35           | 100%     | Identical        |
| apps/server/src/routes/pipeline/routes/reorder-steps.ts                                                  | 42         | 42             | 42           | 100%     | Identical        |
| apps/server/src/routes/pipeline/routes/save-config.ts                                                    | 43         | 43             | 43           | 100%     | Identical        |
| apps/server/src/routes/pipeline/routes/update-step.ts                                                    | 50         | 50             | 50           | 100%     | Identical        |
| apps/server/src/routes/projects/common.ts                                                                | 0          | 12             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/projects/index.ts                                                                 | 0          | 27             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/projects/routes/overview.ts                                                       | 0          | 317            | 0            | 0%       | Only in upstream |
| apps/server/src/routes/running-agents/common.ts                                                          | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/running-agents/index.ts                                                           | 15         | 15             | 15           | 100%     | Identical        |
| apps/server/src/routes/running-agents/routes/index.ts                                                    | 70         | 70             | 70           | 100%     | Identical        |
| apps/server/src/routes/sessions/common.ts                                                                | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/sessions/index.ts                                                                 | 25         | 25             | 25           | 100%     | Identical        |
| apps/server/src/routes/sessions/routes/archive.ts                                                        | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/sessions/routes/create.ts                                                         | 31         | 31             | 31           | 100%     | Identical        |
| apps/server/src/routes/sessions/routes/delete.ts                                                         | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/sessions/routes/index.ts                                                          | 43         | 43             | 43           | 100%     | Identical        |
| apps/server/src/routes/sessions/routes/unarchive.ts                                                      | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/sessions/routes/update.ts                                                         | 35         | 35             | 35           | 100%     | Identical        |
| apps/server/src/routes/settings/common.ts                                                                | 50         | 26             | 26           | 52%      | Modified         |
| apps/server/src/routes/settings/index.ts                                                                 | 81         | 81             | 81           | 100%     | Identical        |
| apps/server/src/routes/settings/routes/discover-agents.ts                                                | 61         | 61             | 61           | 100%     | Identical        |
| apps/server/src/routes/settings/routes/get-credentials.ts                                                | 35         | 35             | 35           | 100%     | Identical        |
| apps/server/src/routes/settings/routes/get-global.ts                                                     | 41         | 34             | 32           | 78%      | Modified         |
| apps/server/src/routes/settings/routes/get-project.ts                                                    | 45         | 45             | 45           | 100%     | Identical        |
| apps/server/src/routes/settings/routes/migrate.ts                                                        | 86         | 86             | 86           | 100%     | Identical        |
| apps/server/src/routes/settings/routes/status.ts                                                         | 47         | 47             | 47           | 100%     | Identical        |
| apps/server/src/routes/settings/routes/update-credentials.ts                                             | 49         | 49             | 49           | 100%     | Identical        |
| apps/server/src/routes/settings/routes/update-global.ts                                                  | 97         | 129            | 77           | 59%      | Modified         |
| apps/server/src/routes/settings/routes/update-project.ts                                                 | 57         | 57             | 57           | 100%     | Identical        |
| apps/server/src/routes/setup/common.ts                                                                   | 54         | 59             | 0            | 0%       | Modified         |
| apps/server/src/routes/setup/get-claude-status.ts                                                        | 182        | 182            | 182          | 100%     | Identical        |
| apps/server/src/routes/setup/index.ts                                                                    | 92         | 118            | 0            | 0%       | Modified         |
| apps/server/src/routes/setup/routes/api-keys.ts                                                          | 22         | 22             | 22           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/auth-claude.ts                                                       | 57         | 57             | 57           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/auth-codex.ts                                                        | 50         | 50             | 50           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/auth-copilot.ts                                                      | 0          | 30             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/setup/routes/auth-cursor.ts                                                       | 73         | 73             | 73           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/auth-gemini.ts                                                       | 0          | 42             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/setup/routes/auth-opencode.ts                                                     | 51         | 51             | 51           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/claude-status.ts                                                     | 22         | 22             | 22           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/codex-status.ts                                                      | 81         | 81             | 81           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/copilot-models.ts                                                    | 0          | 139            | 0            | 0%       | Only in upstream |
| apps/server/src/routes/setup/routes/copilot-status.ts                                                    | 0          | 78             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/setup/routes/cursor-config.ts                                                     | 411        | 411            | 411          | 100%     | Identical        |
| apps/server/src/routes/setup/routes/cursor-status.ts                                                     | 88         | 88             | 88           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/deauth-claude.ts                                                     | 44         | 44             | 44           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/deauth-codex.ts                                                      | 44         | 44             | 44           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/deauth-copilot.ts                                                    | 0          | 30             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/setup/routes/deauth-cursor.ts                                                     | 44         | 44             | 44           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/deauth-gemini.ts                                                     | 0          | 42             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/setup/routes/deauth-opencode.ts                                                   | 40         | 40             | 40           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/delete-api-key.ts                                                    | 84         | 84             | 84           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/gemini-status.ts                                                     | 0          | 79             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/setup/routes/gh-status.ts                                                         | 126        | 126            | 126          | 100%     | Identical        |
| apps/server/src/routes/setup/routes/install-claude.ts                                                    | 23         | 23             | 23           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/install-codex.ts                                                     | 33         | 33             | 33           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/opencode-models.ts                                                   | 189        | 189            | 189          | 100%     | Identical        |
| apps/server/src/routes/setup/routes/opencode-status.ts                                                   | 59         | 59             | 59           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/platform.ts                                                          | 27         | 27             | 27           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/store-api-key.ts                                                     | 49         | 49             | 49           | 100%     | Identical        |
| apps/server/src/routes/setup/routes/verify-claude-auth.ts                                                | 337        | 337            | 337          | 100%     | Identical        |
| apps/server/src/routes/setup/routes/verify-codex-auth.ts                                                 | 282        | 282            | 282          | 100%     | Identical        |
| apps/server/src/routes/suggestions/common.ts                                                             | 34         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/suggestions/generate-suggestions.ts                                               | 296        | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/suggestions/index.ts                                                              | 28         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/suggestions/routes/generate.ts                                                    | 75         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/suggestions/routes/status.ts                                                      | 18         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/suggestions/routes/stop.ts                                                        | 22         | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/routes/templates/common.ts                                                               | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/templates/index.ts                                                                | 15         | 15             | 15           | 100%     | Identical        |
| apps/server/src/routes/templates/routes/clone.ts                                                         | 204        | 204            | 204          | 100%     | Identical        |
| apps/server/src/routes/terminal/common.ts                                                                | 150        | 150            | 150          | 100%     | Identical        |
| apps/server/src/routes/terminal/index.ts                                                                 | 44         | 44             | 44           | 100%     | Identical        |
| apps/server/src/routes/terminal/routes/auth.ts                                                           | 66         | 66             | 66           | 100%     | Identical        |
| apps/server/src/routes/terminal/routes/logout.ts                                                         | 20         | 20             | 20           | 100%     | Identical        |
| apps/server/src/routes/terminal/routes/session-delete.ts                                                 | 26         | 26             | 26           | 100%     | Identical        |
| apps/server/src/routes/terminal/routes/session-resize.ts                                                 | 36         | 36             | 36           | 100%     | Identical        |
| apps/server/src/routes/terminal/routes/sessions.ts                                                       | 70         | 70             | 70           | 100%     | Identical        |
| apps/server/src/routes/terminal/routes/settings.ts                                                       | 83         | 83             | 83           | 100%     | Identical        |
| apps/server/src/routes/terminal/routes/status.ts                                                         | 21         | 21             | 21           | 100%     | Identical        |
| apps/server/src/routes/workspace/common.ts                                                               | 12         | 12             | 12           | 100%     | Identical        |
| apps/server/src/routes/workspace/index.ts                                                                | 17         | 17             | 17           | 100%     | Identical        |
| apps/server/src/routes/workspace/routes/config.ts                                                        | 58         | 58             | 58           | 100%     | Identical        |
| apps/server/src/routes/workspace/routes/directories.ts                                                   | 60         | 60             | 60           | 100%     | Identical        |
| apps/server/src/routes/worktree/common.ts                                                                | 210        | 210            | 210          | 100%     | Identical        |
| apps/server/src/routes/worktree/index.ts                                                                 | 129        | 191            | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/middleware.ts                                                            | 75         | 75             | 75           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/add-remote.ts                                                     | 0          | 166            | 0            | 0%       | Only in upstream |
| apps/server/src/routes/worktree/routes/branch-tracking.ts                                                | 109        | 109            | 109          | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/checkout-branch.ts                                                | 88         | 88             | 88           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/commit.ts                                                         | 81         | 81             | 81           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/create.ts                                                         | 228        | 228            | 228          | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/create-pr.ts                                                      | 399        | 403            | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/delete.ts                                                         | 89         | 89             | 89           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/dev-server-logs.ts                                                | 53         | 53             | 53           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/diffs.ts                                                          | 82         | 85             | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/discard-changes.ts                                                | 0          | 112            | 0            | 0%       | Only in upstream |
| apps/server/src/routes/worktree/routes/file-diff.ts                                                      | 79         | 82             | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/generate-commit-message.ts                                        | 275        | 249            | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/info.ts                                                           | 50         | 53             | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/init-git.ts                                                       | 63         | 67             | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/init-script.ts                                                    | 280        | 280            | 280          | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/list.ts                                                           | 384        | 446            | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/list-branches.ts                                                  | 151        | 178            | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/list-dev-servers.ts                                               | 29         | 29             | 29           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/list-remotes.ts                                                   | 0          | 127            | 0            | 0%       | Only in upstream |
| apps/server/src/routes/worktree/routes/merge.ts                                                          | 74         | 143            | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/migrate.ts                                                        | 32         | 32             | 32           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/open-in-editor.ts                                                 | 147        | 147            | 147          | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/open-in-terminal.ts                                               | 0          | 181            | 0            | 0%       | Only in upstream |
| apps/server/src/routes/worktree/routes/pr-info.ts                                                        | 257        | 257            | 257          | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/pull.ts                                                           | 93         | 93             | 93           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/push.ts                                                           | 63         | 67             | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/start-dev.ts                                                      | 61         | 84             | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/start-tests.ts                                                    | 0          | 92             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/worktree/routes/status.ts                                                         | 70         | 73             | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/stop-dev.ts                                                       | 49         | 49             | 49           | 100%     | Identical        |
| apps/server/src/routes/worktree/routes/stop-tests.ts                                                     | 0          | 58             | 0            | 0%       | Only in upstream |
| apps/server/src/routes/worktree/routes/switch-branch.ts                                                  | 147        | 146            | 0            | 0%       | Modified         |
| apps/server/src/routes/worktree/routes/test-logs.ts                                                      | 0          | 160            | 0            | 0%       | Only in upstream |
| apps/server/src/services/agent-service.ts                                                                | 1154       | 969            | 934          | 80%      | Modified         |
| apps/server/src/services/auto-mode-service.ts                                                            | 4197       | 5913           | 0            | 0%       | Modified         |
| apps/server/src/services/claude-usage-service.ts                                                         | 821        | 769            | 703          | 85%      | Modified         |
| apps/server/src/services/codex-app-server-service.ts                                                     | 212        | 212            | 212          | 100%     | Identical        |
| apps/server/src/services/codex-model-cache-service.ts                                                    | 258        | 258            | 258          | 100%     | Identical        |
| apps/server/src/services/codex-usage-service.ts                                                          | 348        | 348            | 348          | 100%     | Identical        |
| apps/server/src/services/copilot-connection-service.ts                                                   | 0          | 80             | 0            | 0%       | Only in upstream |
| apps/server/src/services/cursor-config-service.ts                                                        | 280        | 280            | 280          | 100%     | Identical        |
| apps/server/src/services/deploy-service.ts                                                               | 553        | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/services/dev-server-service.ts                                                           | 665        | 782            | 0            | 0%       | Modified         |
| apps/server/src/services/event-history-service.ts                                                        | 0          | 338            | 0            | 0%       | Modified         |
| apps/server/src/services/event-hook-service.ts                                                           | 0          | 395            | 0            | 0%       | Modified         |
| apps/server/src/services/feature-export-service.ts                                                       | 0          | 540            | 0            | 0%       | Only in upstream |
| apps/server/src/services/feature-loader.ts                                                               | 1495       | 595            | 0            | 0%       | Modified         |
| apps/server/src/services/github-sync-service.ts                                                          | 483        | 0              | 0            | 0%       | Only in fork     |
| apps/server/src/services/ideation-service.ts                                                             | 1710       | 1855           | 0            | 0%       | Modified         |
| apps/server/src/services/init-script-service.ts                                                          | 360        | 360            | 360          | 100%     | Identical        |
| apps/server/src/services/mcp-test-service.ts                                                             | 251        | 251            | 251          | 100%     | Identical        |
| apps/server/src/services/notification-service.ts                                                         | 280        | 280            | 280          | 100%     | Identical        |
| apps/server/src/services/pipeline-service.ts                                                             | 320        | 344            | 307          | 89%      | Modified         |
| apps/server/src/services/settings-service.ts                                                             | 766        | 1322           | 0            | 0%       | Modified         |
| apps/server/src/services/terminal-service.ts                                                             | 684        | 935            | 0            | 0%       | Modified         |
| apps/server/src/services/test-runner-service.ts                                                          | 0          | 682            | 0            | 0%       | Only in upstream |
| apps/server/src/tests/cli-integration.test.ts                                                            | 373        | 373            | 373          | 100%     | Identical        |
| apps/server/src/types/settings.ts                                                                        | 41         | 47             | 36           | 76%      | Modified         |
| apps/server/tests/fixtures/configs.ts                                                                    | 17         | 17             | 17           | 100%     | Identical        |
| apps/server/tests/fixtures/images.ts                                                                     | 14         | 14             | 14           | 100%     | Identical        |
| apps/server/tests/fixtures/messages.ts                                                                   | 34         | 34             | 34           | 100%     | Identical        |
| apps/server/tests/integration/helpers/git-test-repo.ts                                                   | 143        | 140            | 0            | 0%       | Modified         |
| apps/server/tests/integration/routes/worktree/create.integration.test.ts                                 | 60         | 61             | 0            | 0%       | Modified         |
| apps/server/tests/integration/services/auto-mode-service.integration.test.ts                             | 694        | 694            | 694          | 100%     | Identical        |
| apps/server/tests/setup.ts                                                                               | 15         | 15             | 15           | 100%     | Identical        |
| apps/server/tests/unit/lib/app-spec-format.test.ts                                                       | 183        | 183            | 183          | 100%     | Identical        |
| apps/server/tests/unit/lib/auth.test.ts                                                                  | 386        | 399            | 360          | 90%      | Modified         |
| apps/server/tests/unit/lib/dmaker-paths.test.ts                                                          | 398        | 214            | 214          | 53%      | Modified         |
| apps/server/tests/unit/lib/conversation-utils.test.ts                                                    | 224        | 224            | 224          | 100%     | Identical        |
| apps/server/tests/unit/lib/dependency-resolver.test.ts                                                   | 480        | 432            | 394          | 82%      | Modified         |
| apps/server/tests/unit/lib/enhancement-prompts.test.ts                                                   | 240        | 240            | 240          | 100%     | Identical        |
| apps/server/tests/unit/lib/error-handler.test.ts                                                         | 211        | 211            | 211          | 100%     | Identical        |
| apps/server/tests/unit/lib/events.test.ts                                                                | 130        | 130            | 130          | 100%     | Identical        |
| apps/server/tests/unit/lib/fs-utils.test.ts                                                              | 177        | 171            | 153          | 86%      | Modified         |
| apps/server/tests/unit/lib/image-handler.test.ts                                                         | 226        | 226            | 226          | 100%     | Identical        |
| apps/server/tests/unit/lib/json-extractor.test.ts                                                        | 308        | 308            | 308          | 100%     | Identical        |
| apps/server/tests/unit/lib/logger.test.ts                                                                | 141        | 141            | 141          | 100%     | Identical        |
| apps/server/tests/unit/lib/model-resolver.test.ts                                                        | 167        | 168            | 154          | 91%      | Modified         |
| apps/server/tests/unit/lib/prompt-builder.test.ts                                                        | 120        | 120            | 120          | 100%     | Identical        |
| apps/server/tests/unit/lib/request-cache.test.ts                                                         | 600        | 0              | 0            | 0%       | Only in fork     |
| apps/server/tests/unit/lib/sdk-options.test.ts                                                           | 495        | 495            | 495          | 100%     | Identical        |
| apps/server/tests/unit/lib/security.test.ts                                                              | 186        | 186            | 186          | 100%     | Identical        |
| apps/server/tests/unit/lib/settings-helpers.test.ts                                                      | 289        | 289            | 289          | 100%     | Identical        |
| apps/server/tests/unit/lib/validation-storage.test.ts                                                    | 306        | 306            | 306          | 100%     | Identical        |
| apps/server/tests/unit/lib/worktree-metadata.test.ts                                                     | 391        | 391            | 0            | 0%       | Modified         |
| apps/server/tests/unit/lib/xml-extractor.test.ts                                                         | 1027       | 1027           | 1027         | 100%     | Identical        |
| apps/server/tests/unit/providers/base-provider.test.ts                                                   | 238        | 238            | 238          | 100%     | Identical        |
| apps/server/tests/unit/providers/claude-provider.test.ts                                                 | 493        | 489            | 472          | 95%      | Modified         |
| apps/server/tests/unit/providers/codex-provider.test.ts                                                  | 414        | 418            | 0            | 0%       | Modified         |
| apps/server/tests/unit/providers/copilot-provider.test.ts                                                | 0          | 517            | 0            | 0%       | Only in upstream |
| apps/server/tests/unit/providers/cursor-config-manager.test.ts                                           | 352        | 352            | 0            | 0%       | Modified         |
| apps/server/tests/unit/providers/opencode-provider.test.ts                                               | 1314       | 1627           | 1312         | 80%      | Modified         |
| apps/server/tests/unit/providers/provider-factory.test.ts                                                | 305        | 331            | 299          | 90%      | Modified         |
| apps/server/tests/unit/routes/app-spec/common.test.ts                                                    | 104        | 104            | 104          | 100%     | Identical        |
| apps/server/tests/unit/routes/app-spec/parse-and-create-features.test.ts                                 | 244        | 244            | 244          | 100%     | Identical        |
| apps/server/tests/unit/routes/pipeline.test.ts                                                           | 499        | 499            | 499          | 100%     | Identical        |
| apps/server/tests/unit/routes/running-agents.test.ts                                                     | 195        | 195            | 195          | 100%     | Identical        |
| apps/server/tests/unit/routes/worktree/add-remote.test.ts                                                | 0          | 565            | 0            | 0%       | Only in upstream |
| apps/server/tests/unit/routes/worktree/switch-branch.test.ts                                             | 0          | 106            | 0            | 0%       | Only in upstream |
| apps/server/tests/unit/services/agent-service.test.ts                                                    | 746        | 746            | 746          | 100%     | Identical        |
| apps/server/tests/unit/services/auto-mode-service.test.ts                                                | 318        | 920            | 316          | 34%      | Modified         |
| apps/server/tests/unit/services/auto-mode-service-planning.test.ts                                       | 346        | 346            | 346          | 100%     | Identical        |
| apps/server/tests/unit/services/auto-mode-task-parsing.test.ts                                           | 345        | 570            | 0            | 0%       | Modified         |
| apps/server/tests/unit/services/claude-usage-service.test.ts                                             | 626        | 679            | 0            | 0%       | Modified         |
| apps/server/tests/unit/services/cursor-config-service.test.ts                                            | 359        | 359            | 359          | 100%     | Identical        |
| apps/server/tests/unit/services/dev-server-service.test.ts                                               | 394        | 537            | 387          | 72%      | Modified         |
| apps/server/tests/unit/services/feature-export-service.test.ts                                           | 0          | 623            | 0            | 0%       | Only in upstream |
| apps/server/tests/unit/services/feature-loader.test.ts                                                   | 1525       | 916            | 905          | 59%      | Modified         |
| apps/server/tests/unit/services/ideation-service.test.ts                                                 | 788        | 932            | 0            | 0%       | Modified         |
| apps/server/tests/unit/services/mcp-test-service.test.ts                                                 | 447        | 447            | 447          | 100%     | Identical        |
| apps/server/tests/unit/services/pipeline-service.test.ts                                                 | 859        | 1221           | 855          | 70%      | Modified         |
| apps/server/tests/unit/services/settings-service.test.ts                                                 | 810        | 812            | 786          | 96%      | Modified         |
| apps/server/tests/unit/services/terminal-service.test.ts                                                 | 643        | 643            | 643          | 100%     | Identical        |
| apps/server/tests/utils/helpers.ts                                                                       | 38         | 38             | 38           | 100%     | Identical        |
| apps/server/tests/utils/mocks.ts                                                                         | 107        | 107            | 107          | 100%     | Identical        |
| apps/server/tsconfig.json                                                                                | 20         | 20             | 20           | 100%     | Identical        |
| apps/server/tsconfig.test.json                                                                           | 10         | 10             | 10           | 100%     | Identical        |
| apps/server/vitest.config.ts                                                                             | 62         | 62             | 62           | 100%     | Identical        |
| apps/ui/.gitignore                                                                                       | 47         | 47             | 47           | 100%     | Identical        |
| apps/ui/components.json                                                                                  | 22         | 22             | 22           | 100%     | Identical        |
| apps/ui/docs/AGENT_ARCHITECTURE.md                                                                       | 285        | 285            | 284          | 99%      | Modified         |
| apps/ui/docs/SESSION_MANAGEMENT.md                                                                       | 393        | 393            | 393          | 100%     | Identical        |
| apps/ui/eslint.config.mjs                                                                                | 114        | 142            | 0            | 0%       | Modified         |
| apps/ui/index.html                                                                                       | 35         | 35             | 34           | 97%      | Modified         |
| apps/ui/nginx.conf                                                                                       | 10         | 10             | 10           | 100%     | Identical        |
| apps/ui/package.json                                                                                     | 241        | 269            | 236          | 87%      | Modified         |
| apps/ui/playwright.config.ts                                                                             | 79         | 79             | 79           | 100%     | Identical        |
| apps/ui/public/dmaker.svg                                                                                | 27         | 27             | 27           | 100%     | Identical        |
| apps/ui/public/file.svg                                                                                  | 0          | 0              | 0            | 100%     | Identical        |
| apps/ui/public/globe.svg                                                                                 | 0          | 0              | 0            | 100%     | Identical        |
| apps/ui/public/icon.ico                                                                                  | 86         | 86             | 86           | 100%     | Identical        |
| apps/ui/public/logo.png                                                                                  | 436        | 436            | 436          | 100%     | Identical        |
| apps/ui/public/logo_larger.png                                                                           | 1158       | 1158           | 1158         | 100%     | Identical        |
| apps/ui/public/next.svg                                                                                  | 0          | 0              | 0            | 100%     | Identical        |
| apps/ui/public/readme_logo.png                                                                           | 195        | 195            | 195          | 100%     | Identical        |
| apps/ui/public/readme_logo.svg                                                                           | 38         | 38             | 38           | 100%     | Identical        |
| apps/ui/public/sounds/ding.mp3                                                                           | 270        | 270            | 270          | 100%     | Identical        |
| apps/ui/public/vercel.svg                                                                                | 0          | 0              | 0            | 100%     | Identical        |
| apps/ui/public/window.svg                                                                                | 0          | 0              | 0            | 100%     | Identical        |
| apps/ui/scripts/bump-version.mjs                                                                         | 92         | 92             | 92           | 100%     | Identical        |
| apps/ui/scripts/kill-test-servers.mjs                                                                    | 64         | 64             | 0            | 0%       | Modified         |
| apps/ui/scripts/prepare-server.mjs                                                                       | 131        | 154            | 0            | 0%       | Modified         |
| apps/ui/scripts/rebuild-server-natives.cjs                                                               | 56         | 56             | 56           | 100%     | Identical        |
| apps/ui/scripts/setup-e2e-fixtures.mjs                                                                   | 158        | 160            | 0            | 0%       | Modified         |
| apps/ui/scripts/update-version.mjs                                                                       | 46         | 46             | 46           | 100%     | Identical        |
| apps/ui/src/app.tsx                                                                                      | 59         | 84             | 48           | 57%      | Modified         |
| apps/ui/src/assets/fonts/zed/zed-fonts.css                                                               | 67         | 67             | 67           | 100%     | Identical        |
| apps/ui/src/assets/fonts/zed/zed-mono-extended.ttf                                                       | 31463      | 31463          | 31463        | 100%     | Identical        |
| apps/ui/src/assets/fonts/zed/zed-mono-extendedbold.ttf                                                   | 33866      | 33866          | 33866        | 100%     | Identical        |
| apps/ui/src/assets/fonts/zed/zed-mono-extendedbolditalic.ttf                                             | 35021      | 35021          | 35021        | 100%     | Identical        |
| apps/ui/src/assets/fonts/zed/zed-mono-extendeditalic.ttf                                                 | 36597      | 36597          | 36597        | 100%     | Identical        |
| apps/ui/src/assets/fonts/zed/zed-sans-extended.ttf                                                       | 41501      | 41501          | 41501        | 100%     | Identical        |
| apps/ui/src/assets/fonts/zed/zed-sans-extendedbold.ttf                                                   | 42233      | 42233          | 42233        | 100%     | Identical        |
| apps/ui/src/assets/fonts/zed/zed-sans-extendedbolditalic.ttf                                             | 42766      | 42766          | 42766        | 100%     | Identical        |
| apps/ui/src/assets/fonts/zed/zed-sans-extendeditalic.ttf                                                 | 50631      | 50631          | 50631        | 100%     | Identical        |
| apps/ui/src/assets/icons/gemini-icon.svg                                                                 | 0          | 10             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/claude-usage-popover.tsx                                                          | 694        | 263            | 223          | 32%      | Modified         |
| apps/ui/src/components/codex-usage-popover.tsx                                                           | 430        | 345            | 314          | 73%      | Modified         |
| apps/ui/src/components/dialogs/auto-mode-modal.tsx                                                       | 478        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/dialogs/board-background-modal.tsx                                                | 493        | 531            | 450          | 84%      | Modified         |
| apps/ui/src/components/dialogs/delete-all-archived-sessions-dialog.tsx                                   | 55         | 55             | 55           | 100%     | Identical        |
| apps/ui/src/components/dialogs/delete-project-dialog.tsx                                                 | 122        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/dialogs/delete-session-dialog.tsx                                                 | 48         | 48             | 48           | 100%     | Identical        |
| apps/ui/src/components/dialogs/file-browser-dialog.tsx                                                   | 466        | 357            | 286          | 61%      | Modified         |
| apps/ui/src/components/dialogs/index.ts                                                                  | 29         | 8              | 7            | 24%      | Modified         |
| apps/ui/src/components/dialogs/new-project-modal.tsx                                                     | 465        | 457            | 0            | 0%       | Modified         |
| apps/ui/src/components/dialogs/sandbox-rejection-screen.tsx                                              | 52         | 53             | 50           | 94%      | Modified         |
| apps/ui/src/components/dialogs/sandbox-risk-dialog.tsx                                                   | 108        | 108            | 107          | 99%      | Modified         |
| apps/ui/src/components/dialogs/workspace-picker-modal.tsx                                                | 141        | 115            | 0            | 0%       | Modified         |
| apps/ui/src/components/icons/editor-icons.tsx                                                            | 220        | 220            | 220          | 100%     | Identical        |
| apps/ui/src/components/icons/terminal-icons.tsx                                                          | 0          | 213            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/deploy-button.tsx                                                          | 71         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/layout/index.ts                                                                   | 3          | 1              | 0            | 0%       | Modified         |
| apps/ui/src/components/layout/project-switcher/components/edit-project-dialog.tsx                        | 0          | 204            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/project-switcher/components/icon-picker.tsx                                | 0          | 522            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/project-switcher/components/index.ts                                       | 0          | 4              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/project-switcher/components/notification-bell.tsx                          | 0          | 207            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/project-switcher/components/project-context-menu.tsx                       | 0          | 531            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/project-switcher/components/project-switcher-item.tsx                      | 0          | 124            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/project-switcher/index.ts                                                  | 0          | 1              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/project-switcher/project-switcher.tsx                                      | 0          | 531            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/running-agents-indicator.tsx                                               | 1229       | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/layout/sidebar/components/dmaker-logo.tsx                                         | 0          | 151            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/bug-report-button.tsx                                   | 0          | 33             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/collapse-toggle-button.tsx                              | 0          | 68             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/index.ts                                                | 0          | 11             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/mobile-sidebar-toggle.tsx                               | 0          | 42             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/project-actions.tsx                                     | 0          | 91             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/project-selector-with-options.tsx                       | 0          | 389            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/sidebar-footer.tsx                                      | 0          | 360            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/sidebar-header.tsx                                      | 0          | 408            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/sidebar-navigation.tsx                                  | 0          | 397            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/sortable-project-item.tsx                               | 0          | 60             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/components/theme-menu-item.tsx                                     | 0          | 23             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/constants.ts                                                       | 0          | 60             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/dialogs/index.ts                                                   | 0          | 2              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/dialogs/onboarding-dialog.tsx                                      | 0          | 135            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/dialogs/trash-dialog.tsx                                           | 0          | 181            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/index.ts                                                     | 0          | 12             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-drag-and-drop.ts                                         | 0          | 41             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-navigation.ts                                            | 0          | 334            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-project-creation.ts                                      | 0          | 267            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-project-picker.ts                                        | 0          | 147            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-project-theme.ts                                         | 0          | 25             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-running-agents.ts                                        | 0          | 132            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-setup-dialog.ts                                          | 0          | 150            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-sidebar-auto-collapse.ts                                 | 0          | 48             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-spec-regeneration.ts                                     | 0          | 82             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-theme-preview.ts                                         | 0          | 53             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-trash-operations.ts                                      | 0          | 91             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/hooks/use-unviewed-validations.ts                                  | 0          | 85             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/index.ts                                                           | 0          | 1              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/sidebar.tsx                                                        | 0          | 522            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/sidebar/types.ts                                                           | 0          | 40             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/layout/top-nav-bar.tsx                                                            | 1493       | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/session-manager.tsx                                                               | 620        | 589            | 317          | 51%      | Modified         |
| apps/ui/src/components/shared/font-selector.tsx                                                          | 62         | 47             | 45           | 72%      | Modified         |
| apps/ui/src/components/shared/index.ts                                                                   | 10         | 10             | 10           | 100%     | Identical        |
| apps/ui/src/components/shared/model-override-trigger.tsx                                                 | 138        | 116            | 112          | 81%      | Modified         |
| apps/ui/src/components/shared/use-model-override.ts                                                      | 122        | 104            | 103          | 84%      | Modified         |
| apps/ui/src/components/splash-screen.tsx                                                                 | 0          | 282            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/ui/accordion.tsx                                                                  | 228        | 228            | 228          | 100%     | Identical        |
| apps/ui/src/components/ui/ansi-output.tsx                                                                | 276        | 276            | 276          | 100%     | Identical        |
| apps/ui/src/components/ui/autocomplete.tsx                                                               | 205        | 205            | 205          | 100%     | Identical        |
| apps/ui/src/components/ui/badge.tsx                                                                      | 48         | 48             | 48           | 100%     | Identical        |
| apps/ui/src/components/ui/branch-autocomplete.tsx                                                        | 67         | 67             | 66           | 98%      | Modified         |
| apps/ui/src/components/ui/breadcrumb.tsx                                                                 | 102        | 102            | 102          | 100%     | Identical        |
| apps/ui/src/components/ui/button.tsx                                                                     | 108        | 119            | 0            | 0%       | Modified         |
| apps/ui/src/components/ui/card.tsx                                                                       | 84         | 84             | 84           | 100%     | Identical        |
| apps/ui/src/components/ui/category-autocomplete.tsx                                                      | 43         | 43             | 43           | 100%     | Identical        |
| apps/ui/src/components/ui/checkbox.tsx                                                                   | 55         | 55             | 55           | 100%     | Identical        |
| apps/ui/src/components/ui/collapsible.tsx                                                                | 10         | 9              | 0            | 0%       | Modified         |
| apps/ui/src/components/ui/command.tsx                                                                    | 166        | 166            | 166          | 100%     | Identical        |
| apps/ui/src/components/ui/confirm-dialog.tsx                                                             | 83         | 83             | 83           | 100%     | Identical        |
| apps/ui/src/components/ui/count-up-timer.tsx                                                             | 61         | 61             | 61           | 100%     | Identical        |
| apps/ui/src/components/ui/delete-confirm-dialog.tsx                                                      | 91         | 83             | 83           | 91%      | Modified         |
| apps/ui/src/components/ui/dependency-selector.tsx                                                        | 245        | 245            | 245          | 100%     | Identical        |
| apps/ui/src/components/ui/description-image-dropzone.tsx                                                 | 614        | 548            | 524          | 85%      | Modified         |
| apps/ui/src/components/ui/dialog.tsx                                                                     | 214        | 214            | 214          | 100%     | Identical        |
| apps/ui/src/components/ui/dropdown-menu.tsx                                                              | 302        | 298            | 295          | 97%      | Modified         |
| apps/ui/src/components/ui/error-state.tsx                                                                | 49         | 36             | 36           | 73%      | Modified         |
| apps/ui/src/components/ui/feature-image-upload.tsx                                                       | 294        | 270            | 265          | 90%      | Modified         |
| apps/ui/src/components/ui/git-diff-panel.tsx                                                             | 638        | 631            | 0            | 0%       | Modified         |
| apps/ui/src/components/ui/header-actions-panel.tsx                                                       | 105        | 105            | 105          | 100%     | Identical        |
| apps/ui/src/components/ui/hotkey-button.tsx                                                              | 290        | 290            | 290          | 100%     | Identical        |
| apps/ui/src/components/ui/icon-picker.tsx                                                                | 119        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/image-drop-zone.tsx                                                            | 289        | 287            | 283          | 97%      | Modified         |
| apps/ui/src/components/ui/image-preview-dialog.tsx                                                       | 39         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/input.tsx                                                                      | 65         | 65             | 65           | 100%     | Identical        |
| apps/ui/src/components/ui/json-syntax-editor.tsx                                                         | 47         | 140            | 18           | 12%      | Modified         |
| apps/ui/src/components/ui/json-syntax-editor-impl.tsx                                                    | 130        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/kbd.tsx                                                                        | 28         | 28             | 28           | 100%     | Identical        |
| apps/ui/src/components/ui/keyboard-map.tsx                                                               | 714        | 699            | 463          | 64%      | Modified         |
| apps/ui/src/components/ui/label.tsx                                                                      | 19         | 19             | 19           | 100%     | Identical        |
| apps/ui/src/components/ui/lazy-dialog.tsx                                                                | 263        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/lazy-image.tsx                                                                 | 53         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/loading-state.tsx                                                              | 17         | 15             | 0            | 0%       | Modified         |
| apps/ui/src/components/ui/log-viewer.tsx                                                                 | 908        | 765            | 685          | 75%      | Modified         |
| apps/ui/src/components/ui/markdown.tsx                                                                   | 56         | 145            | 20           | 13%      | Modified         |
| apps/ui/src/components/ui/markdown-renderer.tsx                                                          | 54         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/path-input.tsx                                                                 | 442        | 442            | 442          | 100%     | Identical        |
| apps/ui/src/components/ui/popover.tsx                                                                    | 67         | 67             | 67           | 100%     | Identical        |
| apps/ui/src/components/ui/provider-icon.tsx                                                              | 575        | 638            | 0            | 0%       | Modified         |
| apps/ui/src/components/ui/radio-group.tsx                                                                | 38         | 38             | 38           | 100%     | Identical        |
| apps/ui/src/components/ui/route-error-boundary.tsx                                                       | 92         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/scroll-area.tsx                                                                | 73         | 73             | 73           | 100%     | Identical        |
| apps/ui/src/components/ui/select.tsx                                                                     | 153        | 153            | 153          | 100%     | Identical        |
| apps/ui/src/components/ui/separator.tsx                                                                  | 26         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/sheet.tsx                                                                      | 150        | 150            | 150          | 100%     | Identical        |
| apps/ui/src/components/ui/shell-syntax-editor.tsx                                                        | 46         | 141            | 17           | 12%      | Modified         |
| apps/ui/src/components/ui/shell-syntax-editor-impl.tsx                                                   | 132        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/skeleton.tsx                                                                   | 0          | 18             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/ui/slider.tsx                                                                     | 61         | 61             | 61           | 100%     | Identical        |
| apps/ui/src/components/ui/spinner.tsx                                                                    | 0          | 42             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/ui/switch.tsx                                                                     | 29         | 29             | 29           | 100%     | Identical        |
| apps/ui/src/components/ui/tabs.tsx                                                                       | 118        | 118            | 118          | 100%     | Identical        |
| apps/ui/src/components/ui/task-progress-panel.tsx                                                        | 428        | 326            | 288          | 67%      | Modified         |
| apps/ui/src/components/ui/test-logs-panel.tsx                                                            | 0          | 426            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/ui/textarea.tsx                                                                   | 24         | 24             | 24           | 100%     | Identical        |
| apps/ui/src/components/ui/tooltip.tsx                                                                    | 69         | 69             | 69           | 100%     | Identical        |
| apps/ui/src/components/ui/xml-syntax-editor.tsx                                                          | 40         | 70             | 13           | 18%      | Modified         |
| apps/ui/src/components/ui/xml-syntax-editor-impl.tsx                                                     | 106        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/ui/xterm-log-viewer.tsx                                                           | 301        | 318            | 292          | 91%      | Modified         |
| apps/ui/src/components/usage-display.tsx                                                                 | 1161       | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/usage-popover.tsx                                                                 | 937        | 559            | 440          | 46%      | Modified         |
| apps/ui/src/components/views/agent-tools-view.tsx                                                        | 451        | 434            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/agent-view.tsx                                                              | 251        | 251            | 148          | 58%      | Modified         |
| apps/ui/src/components/views/agent-view/components/agent-header.tsx                                      | 215        | 78             | 51           | 23%      | Modified         |
| apps/ui/src/components/views/agent-view/components/chat-area.tsx                                         | 61         | 50             | 47           | 77%      | Modified         |
| apps/ui/src/components/views/agent-view/components/empty-states.tsx                                      | 187        | 49             | 31           | 16%      | Modified         |
| apps/ui/src/components/views/agent-view/components/index.ts                                              | 7          | 6              | 6            | 85%      | Modified         |
| apps/ui/src/components/views/agent-view/components/message-bubble.tsx                                    | 204        | 129            | 96           | 47%      | Modified         |
| apps/ui/src/components/views/agent-view/components/message-list.tsx                                      | 113        | 41             | 29           | 25%      | Modified         |
| apps/ui/src/components/views/agent-view/components/session-selector.tsx                                  | 458        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/agent-view/components/thinking-indicator.tsx                                | 70         | 18             | 12           | 17%      | Modified         |
| apps/ui/src/components/views/agent-view/hooks/index.ts                                                   | 4          | 4              | 4            | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/hooks/use-agent-scroll.ts                                        | 97         | 78             | 50           | 51%      | Modified         |
| apps/ui/src/components/views/agent-view/hooks/use-agent-session.ts                                       | 82         | 64             | 49           | 59%      | Modified         |
| apps/ui/src/components/views/agent-view/hooks/use-agent-shortcuts.ts                                     | 41         | 41             | 41           | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/hooks/use-file-attachments.ts                                    | 291        | 291            | 291          | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/input-area/agent-input-area.tsx                                  | 133        | 133            | 133          | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/input-area/file-preview.tsx                                      | 135        | 103            | 101          | 74%      | Modified         |
| apps/ui/src/components/views/agent-view/input-area/index.ts                                              | 4          | 4              | 4            | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/input-area/input-controls.tsx                                    | 193        | 193            | 193          | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/input-area/queue-display.tsx                                     | 60         | 60             | 60           | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/shared/agent-model-selector.tsx                                  | 25         | 25             | 25           | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/shared/constants.ts                                              | 9          | 9              | 9            | 100%     | Identical        |
| apps/ui/src/components/views/agent-view/shared/index.ts                                                  | 2          | 2              | 2            | 100%     | Identical        |
| apps/ui/src/components/views/analysis-view.tsx                                                           | 961        | 969            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view.tsx                                                              | 3075       | 1867           | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/board-controls.tsx                                               | 39         | 39             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/board-header.tsx                                                 | 250        | 269            | 120          | 44%      | Modified         |
| apps/ui/src/components/views/board-view/board-search-bar.tsx                                             | 107        | 87             | 84           | 78%      | Modified         |
| apps/ui/src/components/views/board-view/completed-features-list-view.tsx                                 | 1059       | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/agent-chat-panel.tsx                                  | 593        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/board-filter-dropdown.tsx                             | 827        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/board-project-dropdown.tsx                            | 324        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/board-skeleton.tsx                                    | 148        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/board-status-dropdown.tsx                             | 549        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/board-status-tabs.tsx                                 | 330        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/category-group.tsx                                    | 244        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/deploy-log-output.tsx                                 | 163        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/deploy-panel.tsx                                      | 1438       | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/empty-state-card.tsx                                  | 120        | 120            | 120          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/components/file-explorer/file-explorer.tsx                       | 404        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/file-explorer/index.ts                                | 1          | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/index.ts                                              | 67         | 34             | 25           | 37%      | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-card/agent-info-panel.tsx                      | 0          | 455            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-card/card-actions.tsx                          | 0          | 348            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-card/card-badges.tsx                           | 0          | 271            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-card/card-content-sections.tsx                 | 0          | 55             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-card/card-header.tsx                           | 0          | 381            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-card/feature-card-skeleton.tsx                 | 0          | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/kanban-card/index.ts                                  | 0          | 7              | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-card/kanban-card.tsx                           | 0          | 306            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-card/summary-dialog.tsx                        | 0          | 72             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/kanban-column.tsx                                     | 0          | 123            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/list-view/index.ts                                    | 11         | 20             | 11           | 55%      | Modified         |
| apps/ui/src/components/views/board-view/components/list-view/list-header.tsx                             | 284        | 293            | 280          | 95%      | Modified         |
| apps/ui/src/components/views/board-view/components/list-view/list-row.tsx                                | 586        | 414            | 296          | 50%      | Modified         |
| apps/ui/src/components/views/board-view/components/list-view/list-view.tsx                               | 984        | 459            | 353          | 35%      | Modified         |
| apps/ui/src/components/views/board-view/components/list-view/row-actions.tsx                             | 695        | 635            | 557          | 80%      | Modified         |
| apps/ui/src/components/views/board-view/components/list-view/status-badge.tsx                            | 232        | 218            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/running-agents-panel.tsx                              | 478        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/components/selection-action-bar.tsx                              | 223        | 223            | 223          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/components/view-toggle.tsx                                       | 0          | 62             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/components/virtualized-column-content.tsx                        | 0          | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/constants.ts                                                     | 305        | 154            | 144          | 47%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/add-edit-pipeline-step-dialog.tsx                        | 257        | 254            | 253          | 98%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/add-feature-dialog.tsx                                   | 907        | 720            | 582          | 64%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/agent-output-modal.tsx                                   | 824        | 461            | 358          | 43%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/archive-all-verified-dialog.tsx                          | 54         | 54             | 54           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/auto-mode-settings-popover.tsx                           | 99         | 95             | 83           | 83%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/backlog-plan-dialog.tsx                                  | 495        | 477            | 466          | 94%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/code-editor-window.tsx                                   | 743        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/dialogs/commit-worktree-dialog.tsx                               | 226        | 227            | 223          | 98%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/complete-all-waiting-dialog.tsx                          | 54         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/dialogs/completed-features-modal.tsx                             | 139        | 103            | 19           | 13%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/completed-runs-modal.tsx                                 | 416        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/dialogs/create-branch-dialog.tsx                                 | 147        | 148            | 144          | 97%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/create-pr-dialog.tsx                                     | 424        | 404            | 383          | 90%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/create-worktree-dialog.tsx                               | 233        | 234            | 230          | 98%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/delete-all-verified-dialog.tsx                           | 55         | 55             | 55           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/delete-completed-feature-dialog.tsx                      | 61         | 61             | 61           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/delete-worktree-dialog.tsx                               | 164        | 165            | 161          | 97%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/dependency-link-dialog.tsx                               | 0          | 143            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/dialogs/dependency-tree-dialog.tsx                               | 245        | 211            | 208          | 84%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/edit-feature-dialog.tsx                                  | 618        | 649            | 519          | 79%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/export-features-dialog.tsx                               | 0          | 196            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/dialogs/follow-up-dialog.tsx                                     | 179        | 170            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/dialogs/import-features-dialog.tsx                               | 0          | 474            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/dialogs/index.ts                                                 | 114        | 17             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/dialogs/mass-edit-dialog.tsx                                     | 297        | 387            | 287          | 74%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/merge-worktree-dialog.tsx                                | 234        | 347            | 125          | 36%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/pipeline-settings-dialog.tsx                             | 273        | 270            | 264          | 96%      | Modified         |
| apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/code-review.ts                   | 94         | 94             | 94           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/commit.ts                        | 0          | 150            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/documentation.ts                 | 77         | 77             | 77           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/index.ts                         | 28         | 30             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/optimization.ts                  | 103        | 103            | 103          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/security-review.ts               | 114        | 114            | 114          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/testing.ts                       | 81         | 81             | 81           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/pipeline-step-templates/ux-review.ts                     | 116        | 116            | 116          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/plan-approval-dialog.tsx                                 | 205        | 225            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/dialogs/plan-content-viewer.tsx                                  | 0          | 216            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/dialogs/plan-settings-popover.tsx                                | 61         | 61             | 61           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/dialogs/pull-resolve-conflicts-dialog.tsx                        | 0          | 296            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/dialogs/push-to-remote-dialog.tsx                                | 0          | 446            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/dialogs/unsatisfied-dependencies-dialog.tsx                      | 148        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/dialogs/view-worktree-changes-dialog.tsx                         | 0          | 68             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/dialogs/worktree-settings-popover.tsx                            | 61         | 61             | 61           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/header-mobile-menu.tsx                                           | 171        | 179            | 81           | 45%      | Modified         |
| apps/ui/src/components/views/board-view/hooks/index.ts                                                   | 26         | 11             | 9            | 34%      | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-board-actions.ts                                       | 1453       | 1107           | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-board-background.ts                                    | 43         | 43             | 43           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/hooks/use-board-column-features.ts                               | 333        | 225            | 179          | 53%      | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-board-drag-drop.ts                                     | 0          | 323            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-board-effects.ts                                       | 157        | 128            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-board-features.ts                                      | 810        | 196            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-board-keyboard-shortcuts.ts                            | 189        | 78             | 77           | 40%      | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-board-persistence.ts                                   | 209        | 133            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-board-project.ts                                       | 144        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/hooks/use-board-status-tabs.ts                                   | 474        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/hooks/use-follow-up-state.ts                                     | 67         | 67             | 67           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/hooks/use-list-view-state.ts                                     | 161        | 223            | 157          | 70%      | Modified         |
| apps/ui/src/components/views/board-view/hooks/use-selection-mode.ts                                      | 91         | 91             | 91           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/hooks/use-virtualized-column.ts                                  | 0          | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/init-script-indicator.tsx                                        | 209        | 210            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/kanban-board.tsx                                                 | 0          | 677            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/mobile-usage-bar.tsx                                             | 245        | 232            | 224          | 91%      | Modified         |
| apps/ui/src/components/views/board-view/shared/ancestor-context-section.tsx                              | 211        | 211            | 211          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/board-model-selector.tsx                                  | 72         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/board-view/shared/branch-selector.tsx                                       | 90         | 90             | 89           | 98%      | Modified         |
| apps/ui/src/components/views/board-view/shared/enhancement/enhancement-constants.ts                      | 20         | 20             | 20           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/enhancement/enhancement-history-button.tsx                | 136        | 136            | 136          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/enhancement/enhance-with-ai.tsx                           | 152        | 157            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/shared/enhancement/index.ts                                      | 3          | 3              | 3            | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/index.ts                                                  | 12         | 14             | 11           | 78%      | Modified         |
| apps/ui/src/components/views/board-view/shared/model-constants.ts                                        | 170        | 216            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/shared/model-selector.tsx                                        | 382        | 389            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/shared/pipeline-exclusion-controls.tsx                           | 0          | 113            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/shared/planning-mode-select.tsx                                  | 0          | 161            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/shared/planning-mode-selector.tsx                                | 0          | 346            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/shared/priority-select.tsx                                       | 112        | 112            | 112          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/priority-selector.tsx                                     | 57         | 57             | 57           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/reasoning-effort-selector.tsx                             | 47         | 47             | 47           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/testing-tab-content.tsx                                   | 40         | 40             | 40           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/thinking-level-selector.tsx                               | 47         | 47             | 47           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/shared/work-mode-selector.tsx                                    | 163        | 163            | 163          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/worktree-panel/components/branch-switch-dropdown.tsx             | 117        | 118            | 113          | 95%      | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/components/dev-server-logs-panel.tsx              | 289        | 288            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/components/index.ts                               | 5          | 16             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/components/tooltip-wrapper.tsx                    | 44         | 42             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/components/worktree-actions-dropdown.tsx          | 406        | 659            | 375          | 56%      | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/components/worktree-dropdown.tsx                  | 0          | 479            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/worktree-panel/components/worktree-dropdown-item.tsx             | 0          | 200            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/worktree-panel/components/worktree-indicator-utils.ts            | 0          | 70             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/worktree-panel/components/worktree-mobile-dropdown.tsx           | 115        | 113            | 108          | 93%      | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/components/worktree-tab.tsx                       | 360        | 454            | 282          | 62%      | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/index.ts                                    | 7          | 7              | 7            | 100%     | Identical        |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-available-editors.ts                    | 101        | 85             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-available-terminals.ts                  | 0          | 99             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-branches.ts                             | 86         | 67             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-default-editor.ts                       | 32         | 32             | 32           | 100%     | Identical        |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-dev-server-logs.ts                      | 221        | 221            | 221          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-dev-servers.ts                          | 181        | 181            | 181          | 100%     | Identical        |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-running-features.ts                     | 33         | 35             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-worktree-actions.ts                     | 157        | 112            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/hooks/use-worktrees.ts                            | 129        | 128            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/index.ts                                          | 8          | 8              | 8            | 100%     | Identical        |
| apps/ui/src/components/views/board-view/worktree-panel/types.ts                                          | 82         | 100            | 72           | 72%      | Modified         |
| apps/ui/src/components/views/board-view/worktree-panel/worktree-panel.tsx                                | 448        | 1053           | 0            | 0%       | Modified         |
| apps/ui/src/components/views/chat-history.tsx                                                            | 227        | 340            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/code-view.tsx                                                               | 264        | 265            | 261          | 98%      | Modified         |
| apps/ui/src/components/views/context-view.tsx                                                            | 0          | 1232           | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/dashboard-view.tsx                                                          | 1010       | 1032           | 966          | 93%      | Modified         |
| apps/ui/src/components/views/github-issues-view.tsx                                                      | 412        | 342            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/github-issues-view/components/comment-item.tsx                              | 43         | 40             | 39           | 90%      | Modified         |
| apps/ui/src/components/views/github-issues-view/components/index.ts                                      | 5          | 5              | 5            | 100%     | Identical        |
| apps/ui/src/components/views/github-issues-view/components/issue-detail-panel.tsx                        | 373        | 360            | 354          | 94%      | Modified         |
| apps/ui/src/components/views/github-issues-view/components/issue-row.tsx                                 | 136        | 136            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/github-issues-view/components/issues-filter-controls.tsx                    | 191        | 191            | 191          | 100%     | Identical        |
| apps/ui/src/components/views/github-issues-view/components/issues-list-header.tsx                        | 175        | 100            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/github-issues-view/constants.ts                                             | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/github-issues-view/dialogs/index.ts                                         | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/github-issues-view/dialogs/validation-dialog.tsx                            | 307        | 307            | 307          | 100%     | Identical        |
| apps/ui/src/components/views/github-issues-view/hooks/index.ts                                           | 4          | 4              | 4            | 100%     | Identical        |
| apps/ui/src/components/views/github-issues-view/hooks/use-github-issues.ts                               | 84         | 29             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/github-issues-view/hooks/use-issue-comments.ts                              | 137        | 52             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/github-issues-view/hooks/use-issues-filter.ts                               | 240        | 240            | 240          | 100%     | Identical        |
| apps/ui/src/components/views/github-issues-view/hooks/use-issue-validation.ts                            | 365        | 334            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/github-issues-view/types.ts                                                 | 149        | 149            | 149          | 100%     | Identical        |
| apps/ui/src/components/views/github-issues-view/utils.ts                                                 | 33         | 33             | 33           | 100%     | Identical        |
| apps/ui/src/components/views/github-prs-view.tsx                                                         | 414        | 394            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/graph-view/components/dependency-edge.tsx                                   | 0          | 240            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/components/graph-controls.tsx                                    | 0          | 127            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/components/graph-filter-controls.tsx                             | 0          | 366            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/components/graph-legend.tsx                                      | 0          | 65             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/components/index.ts                                              | 0          | 5              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/components/task-node.tsx                                         | 0          | 505            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/constants.ts                                                     | 0          | 7              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/graph-canvas.tsx                                                 | 0          | 614            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/graph-view.tsx                                                   | 0          | 245            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/hooks/index.ts                                                   | 0          | 9              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/hooks/use-graph-filter.ts                                        | 0          | 240            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/hooks/use-graph-layout.ts                                        | 0          | 135            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/hooks/use-graph-nodes.ts                                         | 0          | 195            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view/index.ts                                                         | 0          | 9              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/graph-view-page.tsx                                                         | 0          | 447            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/ideation-view/components/ideation-dashboard.tsx                             | 528        | 525            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/ideation-view/components/ideation-settings-popover.tsx                      | 0          | 136            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/ideation-view/components/prompt-category-grid.tsx                           | 96         | 96             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/ideation-view/components/prompt-list.tsx                                    | 201        | 177            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/ideation-view/index.tsx                                                     | 310        | 322            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/interview-view.tsx                                                          | 617        | 618            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/logged-out-view.tsx                                                         | 29         | 29             | 29           | 100%     | Identical        |
| apps/ui/src/components/views/login-view.tsx                                                              | 471        | 472            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/memory-view.tsx                                                             | 670        | 671            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/notifications-view.tsx                                                      | 0          | 271            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/overview/project-status-card.tsx                                            | 0          | 207            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/overview/recent-activity-feed.tsx                                           | 0          | 223            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/overview/running-agents-panel.tsx                                           | 0          | 139            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/overview-view.tsx                                                           | 0          | 519            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/project-settings-view/commands-section.tsx                                  | 0          | 315            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/project-settings-view/components/project-settings-navigation.tsx            | 125        | 122            | 122          | 97%      | Modified         |
| apps/ui/src/components/views/project-settings-view/config/navigation.ts                                  | 16         | 27             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/project-settings-view/data-management-section.tsx                           | 0          | 110            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/project-settings-view/hooks/index.ts                                        | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/project-settings-view/hooks/use-project-settings-view.ts                    | 22         | 29             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/project-settings-view/index.ts                                              | 6          | 7              | 0            | 0%       | Modified         |
| apps/ui/src/components/views/project-settings-view/project-bulk-replace-dialog.tsx                       | 0          | 411            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/project-settings-view/project-claude-section.tsx                            | 0          | 151            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/project-settings-view/project-identity-section.tsx                          | 262        | 225            | 216          | 82%      | Modified         |
| apps/ui/src/components/views/project-settings-view/project-models-section.tsx                            | 0          | 505            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/project-settings-view/project-settings-view.tsx                             | 181        | 183            | 171          | 93%      | Modified         |
| apps/ui/src/components/views/project-settings-view/project-theme-section.tsx                             | 365        | 358            | 358          | 98%      | Modified         |
| apps/ui/src/components/views/project-settings-view/worktree-preferences-section.tsx                      | 484        | 470            | 466          | 96%      | Modified         |
| apps/ui/src/components/views/running-agents-view.tsx                                                     | 0          | 235            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view.tsx                                                           | 237        | 236            | 207          | 87%      | Modified         |
| apps/ui/src/components/views/settings-view/account/account-section.tsx                                   | 387        | 188            | 119          | 30%      | Modified         |
| apps/ui/src/components/views/settings-view/account/index.ts                                              | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/api-keys/api-key-field.tsx                                    | 117        | 118            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/api-keys/api-keys-section.tsx                                 | 173        | 201            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/api-keys/authentication-status-display.tsx                    | 83         | 83             | 83           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/api-keys/claude-usage-section.tsx                             | 236        | 186            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/api-keys/hooks/index.ts                                       | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/api-keys/hooks/use-api-key-management.ts                      | 230        | 230            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/api-keys/index.ts                                             | 4          | 4              | 4            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/api-keys/security-notice.tsx                                  | 21         | 21             | 21           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/appearance/appearance-section.tsx                             | 299        | 317            | 192          | 60%      | Modified         |
| apps/ui/src/components/views/settings-view/appearance/index.ts                                           | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/audio/audio-section.tsx                                       | 0          | 59             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/audio/index.ts                                                | 0          | 1              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/claude/claude-md-settings.tsx                                 | 82         | 82             | 82           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/cli-status/claude-cli-status.tsx                              | 319        | 337            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/cli-status/cli-status-card.tsx                                | 151        | 152            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/cli-status/codex-cli-status.tsx                               | 311        | 329            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/cli-status/copilot-cli-status.tsx                             | 0          | 234            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/cli-status/cursor-cli-status.tsx                              | 399        | 417            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/cli-status/gemini-cli-status.tsx                              | 0          | 250            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/cli-status/index.ts                                           | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/cli-status/opencode-cli-status.tsx                            | 388        | 386            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/codex/codex-settings.tsx                                      | 122        | 122            | 122          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/codex/codex-usage-section.tsx                                 | 226        | 183            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/components/delete-project-dialog.tsx                          | 54         | 54             | 54           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/components/edit-project-dialog.tsx                            | 315        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/settings-view/components/import-export-dialog.tsx                           | 203        | 203            | 203          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/components/index.ts                                           | 4          | 4              | 4            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/components/keyboard-map-dialog.tsx                            | 46         | 46             | 46           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/components/settings-header.tsx                                | 73         | 73             | 73           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/components/settings-navigation.tsx                            | 279        | 281            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/config/index.ts                                               | 2          | 2              | 2            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/config/navigation.ts                                          | 87         | 95             | 81           | 85%      | Modified         |
| apps/ui/src/components/views/settings-view/danger-zone/danger-zone-section.tsx                           | 64         | 64             | 64           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/danger-zone/index.ts                                          | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/developer/developer-section.tsx                               | 91         | 122            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/event-hooks/event-history-view.tsx                            | 0          | 349            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/event-hooks/event-hook-dialog.tsx                             | 0          | 291            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/event-hooks/event-hooks-section.tsx                           | 0          | 232            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/event-hooks/index.ts                                          | 0          | 1              | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/feature-defaults/feature-defaults-section.tsx                 | 303        | 320            | 214          | 66%      | Modified         |
| apps/ui/src/components/views/settings-view/feature-defaults/index.ts                                     | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/hooks/index.ts                                                | 4          | 4              | 4            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/hooks/use-cli-status.ts                                       | 127        | 127            | 127          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/hooks/use-cursor-permissions.ts                               | 106        | 55             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/hooks/use-cursor-status.ts                                    | 70         | 56             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/hooks/use-settings-view.ts                                    | 40         | 43             | 38           | 88%      | Modified         |
| apps/ui/src/components/views/settings-view/keyboard-shortcuts/index.ts                                   | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/keyboard-shortcuts/keyboard-shortcuts-section.tsx             | 69         | 69             | 69           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/components/index.ts                               | 3          | 3              | 3            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/components/mcp-server-card.tsx                    | 169        | 170            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/mcp-servers/components/mcp-server-header.tsx                  | 87         | 87             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/mcp-servers/components/mcp-tools-warning.tsx                  | 25         | 25             | 25           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/constants.ts                                      | 14         | 14             | 14           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/dialogs/add-edit-server-dialog.tsx                | 161        | 161            | 161          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/dialogs/delete-server-dialog.tsx                  | 42         | 42             | 42           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/dialogs/global-json-edit-dialog.tsx               | 82         | 82             | 82           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/dialogs/import-json-dialog.tsx                    | 69         | 69             | 69           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/dialogs/index.ts                                  | 6          | 6              | 6            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/dialogs/json-edit-dialog.tsx                      | 77         | 77             | 77           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/dialogs/security-warning-dialog.tsx               | 107        | 107            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/mcp-servers/hooks/index.ts                                    | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts                          | 989        | 989            | 989          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/index.ts                                          | 2          | 2              | 2            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/mcp-servers-section.tsx                           | 195        | 195            | 195          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/mcp-tools-list.tsx                                | 117        | 117            | 117          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/types.ts                                          | 32         | 32             | 32           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/mcp-servers/utils.tsx                                         | 51         | 52             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/model-defaults/bulk-replace-dialog.tsx                        | 0          | 390            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/model-defaults/index.ts                                       | 2          | 2              | 2            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/model-defaults/model-defaults-section.tsx                     | 186        | 255            | 170          | 66%      | Modified         |
| apps/ui/src/components/views/settings-view/model-defaults/phase-model-selector.tsx                       | 1292       | 2181           | 1084         | 49%      | Modified         |
| apps/ui/src/components/views/settings-view/projects/index.ts                                             | 1          | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/settings-view/projects/projects-section.tsx                                 | 676        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/components/views/settings-view/prompts/components.tsx                                        | 159        | 159            | 159          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/prompts/index.ts                                              | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/prompts/prompt-customization-section.tsx                      | 176        | 176            | 176          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/prompts/tab-configs.ts                                        | 448        | 448            | 448          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/prompts/types.ts                                              | 51         | 51             | 51           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab.tsx                             | 64         | 69             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/api-profiles-section.tsx        | 0          | 911            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/hooks/index.ts                  | 6          | 6              | 6            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/hooks/use-skills-settings.ts    | 63         | 57             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/hooks/use-subagents.ts          | 85         | 76             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/hooks/use-subagents-settings.ts | 63         | 57             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/index.ts                        | 7          | 7              | 7            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/skills-section.tsx              | 169        | 169            | 169          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/subagent-card.tsx               | 138        | 138            | 138          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/providers/claude-settings-tab/subagents-section.tsx           | 257        | 244            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/codex-model-configuration.tsx                       | 169        | 169            | 169          | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/providers/codex-settings-tab.tsx                              | 198        | 225            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/copilot-model-configuration.tsx                     | 0          | 53             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/providers/copilot-settings-tab.tsx                            | 0          | 130            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/providers/cursor-model-configuration.tsx                      | 128        | 129            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/cursor-permissions-section.tsx                      | 253        | 251            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/cursor-settings-tab.tsx                             | 110        | 110            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/gemini-model-configuration.tsx                      | 0          | 51             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/providers/gemini-settings-tab.tsx                             | 0          | 130            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/providers/index.ts                                            | 5          | 7              | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/opencode-model-configuration.tsx                    | 684        | 678            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/opencode-settings-tab.tsx                           | 324        | 166            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/provider-tabs.tsx                                   | 55         | 79             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/providers/provider-toggle.tsx                                 | 41         | 41             | 41           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/providers/shared/base-model-configuration.tsx                 | 0          | 183            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/security/index.ts                                             | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/security/security-section.tsx                                 | 71         | 71             | 71           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/shared/index.ts                                               | 2          | 2              | 2            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/shared/types.ts                                               | 39         | 39             | 39           | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/terminal/prompt-preview.tsx                                   | 0          | 283            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/terminal/prompt-theme-presets.ts                              | 0          | 253            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/terminal/terminal-config-section.tsx                          | 0          | 662            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/settings-view/terminal/terminal-section.tsx                                 | 192        | 311            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/settings-view/worktrees/index.ts                                            | 1          | 1              | 1            | 100%     | Identical        |
| apps/ui/src/components/views/settings-view/worktrees/worktrees-section.tsx                               | 67         | 67             | 67           | 100%     | Identical        |
| apps/ui/src/components/views/setup-view.tsx                                                              | 145        | 145            | 145          | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/components/auth-method-selector.tsx                              | 76         | 76             | 76           | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/components/cli-installation-card.tsx                             | 84         | 85             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/components/copyable-command-field.tsx                            | 29         | 29             | 29           | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/components/index.ts                                              | 9          | 9              | 9            | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/components/ready-state-card.tsx                                  | 38         | 38             | 38           | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/components/status-badge.tsx                                      | 58         | 59             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/components/status-row.tsx                                        | 20         | 20             | 20           | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/components/step-indicator.tsx                                    | 20         | 19             | 18           | 90%      | Modified         |
| apps/ui/src/components/views/setup-view/components/terminal-output.tsx                                   | 18         | 18             | 18           | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/dialogs/index.ts                                                 | 2          | 2              | 2            | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/hooks/index.ts                                                   | 4          | 4              | 4            | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/hooks/use-cli-installation.ts                                    | 96         | 110            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/hooks/use-cli-status.ts                                          | 105        | 132            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/hooks/use-token-save.ts                                          | 59         | 59             | 59           | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/steps/claude-setup-step.tsx                                      | 690        | 675            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/steps/cli-setup-step.tsx                                         | 814        | 836            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/steps/codex-setup-step.tsx                                       | 103        | 103            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/steps/complete-step.tsx                                          | 34         | 34             | 33           | 97%      | Modified         |
| apps/ui/src/components/views/setup-view/steps/cursor-setup-step.tsx                                      | 371        | 371            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/steps/github-setup-step.tsx                                      | 302        | 286            | 279          | 92%      | Modified         |
| apps/ui/src/components/views/setup-view/steps/index.ts                                                   | 12         | 12             | 12           | 100%     | Identical        |
| apps/ui/src/components/views/setup-view/steps/opencode-setup-step.tsx                                    | 369        | 374            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/setup-view/steps/providers-setup-step.tsx                                   | 1544       | 2179           | 1470         | 67%      | Modified         |
| apps/ui/src/components/views/setup-view/steps/theme-step.tsx                                             | 127        | 123            | 117          | 92%      | Modified         |
| apps/ui/src/components/views/setup-view/steps/welcome-step.tsx                                           | 34         | 34             | 31           | 91%      | Modified         |
| apps/ui/src/components/views/spec-view.tsx                                                               | 169        | 240            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/spec-view/components/edit-mode/array-field-editor.tsx                       | 0          | 103            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/edit-mode/capabilities-section.tsx                     | 0          | 30             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/edit-mode/features-section.tsx                         | 0          | 259            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/edit-mode/index.ts                                     | 0          | 7              | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/edit-mode/optional-sections.tsx                        | 0          | 59             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/edit-mode/project-info-section.tsx                     | 0          | 51             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/edit-mode/roadmap-section.tsx                          | 0          | 193            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/edit-mode/tech-stack-section.tsx                       | 0          | 30             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/index.ts                                               | 3          | 6              | 0            | 0%       | Modified         |
| apps/ui/src/components/views/spec-view/components/spec-edit-mode.tsx                                     | 0          | 118            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/spec-editor.tsx                                        | 22         | 22             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/spec-view/components/spec-empty-state.tsx                                   | 116        | 117            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/spec-view/components/spec-header.tsx                                        | 228        | 236            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/spec-view/components/spec-mode-tabs.tsx                                     | 0          | 55             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/components/spec-view-mode.tsx                                     | 0          | 223            | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/constants.ts                                                      | 30         | 30             | 30           | 100%     | Identical        |
| apps/ui/src/components/views/spec-view/dialogs/create-spec-dialog.tsx                                    | 180        | 181            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/spec-view/dialogs/index.ts                                                  | 2          | 2              | 2            | 100%     | Identical        |
| apps/ui/src/components/views/spec-view/dialogs/regenerate-spec-dialog.tsx                                | 176        | 177            | 0            | 0%       | Modified         |
| apps/ui/src/components/views/spec-view/hooks/index.ts                                                    | 3          | 5              | 0            | 0%       | Modified         |
| apps/ui/src/components/views/spec-view/hooks/use-spec-generation.ts                                      | 656        | 620            | 565          | 86%      | Modified         |
| apps/ui/src/components/views/spec-view/hooks/use-spec-loading.ts                                         | 66         | 54             | 18           | 27%      | Modified         |
| apps/ui/src/components/views/spec-view/hooks/use-spec-parser.ts                                          | 0          | 61             | 0            | 0%       | Only in upstream |
| apps/ui/src/components/views/spec-view/hooks/use-spec-save.ts                                            | 47         | 32             | 23           | 48%      | Modified         |
| apps/ui/src/components/views/spec-view/types.ts                                                          | 50         | 53             | 0            | 0%       | Modified         |
| apps/ui/src/components/views/terminal-view.tsx                                                           | 1694       | 1830           | 1643         | 89%      | Modified         |
| apps/ui/src/components/views/terminal-view/terminal-error-boundary.tsx                                   | 88         | 88             | 88           | 100%     | Identical        |
| apps/ui/src/components/views/terminal-view/terminal-panel.tsx                                            | 2237       | 2243           | 0            | 0%       | Modified         |
| apps/ui/src/components/views/welcome-view.tsx                                                            | 812        | 792            | 782          | 96%      | Modified         |
| apps/ui/src/components/views/wiki-view.tsx                                                               | 0          | 592            | 0            | 0%       | Only in upstream |
| apps/ui/src/config/api-providers.ts                                                                      | 147        | 147            | 147          | 100%     | Identical        |
| apps/ui/src/config/app-config.ts                                                                         | 0          | 0              | 0            | 100%     | Identical        |
| apps/ui/src/config/model-config.ts                                                                       | 56         | 56             | 56           | 100%     | Identical        |
| apps/ui/src/config/syntax-themes.ts                                                                      | 519        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/config/terminal-themes.ts                                                                    | 628        | 629            | 627          | 99%      | Modified         |
| apps/ui/src/config/theme-options.ts                                                                      | 415        | 415            | 415          | 100%     | Identical        |
| apps/ui/src/config/ui-font-options.ts                                                                    | 54         | 77             | 45           | 58%      | Modified         |
| apps/ui/src/contexts/file-browser-context.tsx                                                            | 94         | 106            | 89           | 83%      | Modified         |
| apps/ui/src/electron/constants.ts                                                                        | 0          | 47             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/index.ts                                                                            | 0          | 32             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/ipc/app-handlers.ts                                                                 | 0          | 37             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/ipc/auth-handlers.ts                                                                | 0          | 34             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/ipc/channels.ts                                                                     | 0          | 36             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/ipc/dialog-handlers.ts                                                              | 0          | 72             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/ipc/index.ts                                                                        | 0          | 26             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/ipc/server-handlers.ts                                                              | 0          | 24             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/ipc/shell-handlers.ts                                                               | 0          | 61             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/ipc/window-handlers.ts                                                              | 0          | 24             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/security/api-key-manager.ts                                                         | 0          | 58             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/server/backend-server.ts                                                            | 0          | 230            | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/server/static-server.ts                                                             | 0          | 101            | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/state.ts                                                                            | 0          | 33             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/utils/icon-manager.ts                                                               | 0          | 46             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/utils/port-manager.ts                                                               | 0          | 42             | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/windows/main-window.ts                                                              | 0          | 116            | 0            | 0%       | Only in upstream |
| apps/ui/src/electron/windows/window-bounds.ts                                                            | 0          | 130            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/index.ts                                                                               | 38         | 34             | 12           | 31%      | Modified         |
| apps/ui/src/hooks/mutations/index.ts                                                                     | 0          | 79             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/mutations/use-auto-mode-mutations.ts                                                   | 0          | 398            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/mutations/use-cursor-permissions-mutations.ts                                          | 0          | 96             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/mutations/use-feature-mutations.ts                                                     | 0          | 267            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/mutations/use-github-mutations.ts                                                      | 0          | 161            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/mutations/use-ideation-mutations.ts                                                    | 0          | 119            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/mutations/use-settings-mutations.ts                                                    | 0          | 160            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/mutations/use-spec-mutations.ts                                                        | 0          | 184            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/mutations/use-worktree-mutations.ts                                                    | 0          | 495            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/index.ts                                                                       | 0          | 92             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-cli-status.ts                                                              | 0          | 194            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-cursor-permissions.ts                                                      | 0          | 58             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-features.ts                                                                | 0          | 150            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-git.ts                                                                     | 0          | 40             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-github.ts                                                                  | 0          | 199            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-ideation.ts                                                                | 0          | 86             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-models.ts                                                                  | 0          | 138            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-pipeline.ts                                                                | 0          | 39             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-running-agents.ts                                                          | 0          | 70             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-sessions.ts                                                                | 0          | 95             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-settings.ts                                                                | 0          | 138            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-spec.ts                                                                    | 0          | 106            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-usage.ts                                                                   | 0          | 89             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-workspace.ts                                                               | 0          | 42             | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/queries/use-worktrees.ts                                                               | 0          | 302            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/use-auto-mode.ts                                                                       | 550        | 691            | 389          | 56%      | Modified         |
| apps/ui/src/hooks/use-board-background-settings.ts                                                       | 201        | 173            | 146          | 72%      | Modified         |
| apps/ui/src/hooks/use-cursor-status-init.ts                                                              | 52         | 46             | 25           | 48%      | Modified         |
| apps/ui/src/hooks/use-electron-agent.ts                                                                  | 645        | 616            | 577          | 89%      | Modified         |
| apps/ui/src/hooks/use-event-recency.ts                                                                   | 0          | 176            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/use-guided-prompts.ts                                                                  | 86         | 71             | 0            | 0%       | Modified         |
| apps/ui/src/hooks/use-init-script-events.ts                                                              | 89         | 79             | 77           | 86%      | Modified         |
| apps/ui/src/hooks/use-in-view.ts                                                                         | 63         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/hooks/use-keyboard-shortcuts.ts                                                              | 268        | 254            | 218          | 81%      | Modified         |
| apps/ui/src/hooks/use-media-query.ts                                                                     | 67         | 67             | 67           | 100%     | Identical        |
| apps/ui/src/hooks/use-message-queue.ts                                                                   | 93         | 93             | 93           | 100%     | Identical        |
| apps/ui/src/hooks/use-multi-project-status.ts                                                            | 0          | 121            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/use-notification-events.ts                                                             | 78         | 78             | 78           | 100%     | Identical        |
| apps/ui/src/hooks/use-os-detection.ts                                                                    | 49         | 49             | 49           | 100%     | Identical        |
| apps/ui/src/hooks/use-project-settings-loader.ts                                                         | 170        | 157            | 22           | 12%      | Modified         |
| apps/ui/src/hooks/use-project-switch-for-sessions.ts                                                     | 247        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/hooks/use-provider-auth-init.ts                                                              | 108        | 102            | 101          | 93%      | Modified         |
| apps/ui/src/hooks/use-query-invalidation.ts                                                              | 0          | 380            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/use-remote-sync.ts                                                                     | 607        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/hooks/use-responsive-kanban.ts                                                               | 264        | 193            | 183          | 69%      | Modified         |
| apps/ui/src/hooks/use-running-agents.ts                                                                  | 331        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/hooks/use-scroll-tracking.ts                                                                 | 101        | 101            | 101          | 100%     | Identical        |
| apps/ui/src/hooks/use-settings-migration.ts                                                              | 759        | 923            | 0            | 0%       | Modified         |
| apps/ui/src/hooks/use-settings-sync.ts                                                                   | 572        | 767            | 513          | 66%      | Modified         |
| apps/ui/src/hooks/use-test-logs.ts                                                                       | 0          | 396            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/use-test-runners.ts                                                                    | 0          | 393            | 0            | 0%       | Only in upstream |
| apps/ui/src/hooks/use-usage-tracking.ts                                                                  | 503        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/hooks/use-window-state.ts                                                                    | 53         | 53             | 53           | 100%     | Identical        |
| apps/ui/src/lib/agent-context-parser.ts                                                                  | 399        | 367            | 339          | 84%      | Modified         |
| apps/ui/src/lib/api-fetch.ts                                                                             | 191        | 197            | 0            | 0%       | Modified         |
| apps/ui/src/lib/codex-usage-format.ts                                                                    | 75         | 75             | 75           | 100%     | Identical        |
| apps/ui/src/lib/electron.ts                                                                              | 3593       | 3741           | 0            | 0%       | Modified         |
| apps/ui/src/lib/file-picker.ts                                                                           | 282        | 288            | 0            | 0%       | Modified         |
| apps/ui/src/lib/font-loader.ts                                                                           | 352        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/lib/http-api-client.ts                                                                       | 2966       | 2967           | 0            | 0%       | Modified         |
| apps/ui/src/lib/icon-registry.ts                                                                         | 935        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/lib/image-utils.ts                                                                           | 236        | 236            | 236          | 100%     | Identical        |
| apps/ui/src/lib/log-parser.ts                                                                            | 1566       | 1348           | 1245         | 79%      | Modified         |
| apps/ui/src/lib/project-init.ts                                                                          | 238        | 238            | 238          | 100%     | Identical        |
| apps/ui/src/lib/query-client.ts                                                                          | 0          | 138            | 0            | 0%       | Only in upstream |
| apps/ui/src/lib/query-keys.ts                                                                            | 0          | 286            | 0            | 0%       | Only in upstream |
| apps/ui/src/lib/request-cache.ts                                                                         | 405        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/lib/storage.ts                                                                               | 100        | 100            | 100          | 100%     | Identical        |
| apps/ui/src/lib/templates.ts                                                                             | 103        | 103            | 103          | 100%     | Identical        |
| apps/ui/src/lib/theme-loader.ts                                                                          | 89         | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/lib/utils.ts                                                                                 | 203        | 183            | 137          | 67%      | Modified         |
| apps/ui/src/lib/workspace-config.ts                                                                      | 127        | 127            | 0            | 0%       | Modified         |
| apps/ui/src/main.ts                                                                                      | 1274       | 242            | 138          | 10%      | Modified         |
| apps/ui/src/preload.ts                                                                                   | 68         | 66             | 49           | 72%      | Modified         |
| apps/ui/src/renderer.tsx                                                                                 | 14         | 9              | 9            | 64%      | Modified         |
| apps/ui/src/routes/\_\_root.tsx                                                                          | 1109       | 908            | 825          | 74%      | Modified         |
| apps/ui/src/routes/agent.tsx                                                                             | 0          | 6              | 0            | 0%       | Only in upstream |
| apps/ui/src/routes/board.tsx                                                                             | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/context.tsx                                                                           | 0          | 6              | 0            | 0%       | Only in upstream |
| apps/ui/src/routes/dashboard.tsx                                                                         | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/github-issues.tsx                                                                     | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/github-prs.tsx                                                                        | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/graph.tsx                                                                             | 0          | 6              | 0            | 0%       | Only in upstream |
| apps/ui/src/routes/ideation.tsx                                                                          | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/index.tsx                                                                             | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/interview.tsx                                                                         | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/logged-out.tsx                                                                        | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/login.tsx                                                                             | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/memory.tsx                                                                            | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/notifications.tsx                                                                     | 0          | 6              | 0            | 0%       | Only in upstream |
| apps/ui/src/routes/overview.tsx                                                                          | 0          | 6              | 0            | 0%       | Only in upstream |
| apps/ui/src/routes/project-settings.tsx                                                                  | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/running-agents.tsx                                                                    | 0          | 6              | 0            | 0%       | Only in upstream |
| apps/ui/src/routes/settings.tsx                                                                          | 21         | 16             | 14           | 66%      | Modified         |
| apps/ui/src/routes/setup.tsx                                                                             | 11         | 6              | 4            | 36%      | Modified         |
| apps/ui/src/routes/spec.tsx                                                                              | 8          | 6              | 4            | 50%      | Modified         |
| apps/ui/src/routes/terminal.tsx                                                                          | 11         | 20             | 5            | 25%      | Modified         |
| apps/ui/src/routes/wiki.tsx                                                                              | 0          | 6              | 0            | 0%       | Only in upstream |
| apps/ui/src/store/app-store.ts                                                                           | 4362       | 2605           | 0            | 0%       | Modified         |
| apps/ui/src/store/auth-store.ts                                                                          | 34         | 34             | 34           | 100%     | Identical        |
| apps/ui/src/store/board-controls-store.ts                                                                | 330        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/src/store/defaults/background-settings.ts                                                        | 0          | 13             | 0            | 0%       | Only in upstream |
| apps/ui/src/store/defaults/constants.ts                                                                  | 0          | 2              | 0            | 0%       | Only in upstream |
| apps/ui/src/store/defaults/index.ts                                                                      | 0          | 3              | 0            | 0%       | Only in upstream |
| apps/ui/src/store/defaults/terminal-defaults.ts                                                          | 0          | 21             | 0            | 0%       | Only in upstream |
| apps/ui/src/store/ideation-store.ts                                                                      | 338        | 385            | 0            | 0%       | Modified         |
| apps/ui/src/store/notifications-store.ts                                                                 | 129        | 129            | 0            | 0%       | Modified         |
| apps/ui/src/store/setup-store.ts                                                                         | 293        | 349            | 0            | 0%       | Modified         |
| apps/ui/src/store/test-runners-store.ts                                                                  | 0          | 249            | 0            | 0%       | Only in upstream |
| apps/ui/src/store/types/chat-types.ts                                                                    | 0          | 40             | 0            | 0%       | Only in upstream |
| apps/ui/src/store/types/index.ts                                                                         | 0          | 7              | 0            | 0%       | Only in upstream |
| apps/ui/src/store/types/project-types.ts                                                                 | 0          | 66             | 0            | 0%       | Only in upstream |
| apps/ui/src/store/types/settings-types.ts                                                                | 0          | 5              | 0            | 0%       | Only in upstream |
| apps/ui/src/store/types/state-types.ts                                                                   | 0          | 799            | 0            | 0%       | Only in upstream |
| apps/ui/src/store/types/terminal-types.ts                                                                | 0          | 82             | 0            | 0%       | Only in upstream |
| apps/ui/src/store/types/ui-types.ts                                                                      | 0          | 119            | 0            | 0%       | Only in upstream |
| apps/ui/src/store/types/usage-types.ts                                                                   | 0          | 60             | 0            | 0%       | Only in upstream |
| apps/ui/src/store/utils/index.ts                                                                         | 0          | 13             | 0            | 0%       | Only in upstream |
| apps/ui/src/store/utils/shortcut-utils.ts                                                                | 0          | 117            | 0            | 0%       | Only in upstream |
| apps/ui/src/store/utils/theme-utils.ts                                                                   | 0          | 117            | 0            | 0%       | Only in upstream |
| apps/ui/src/store/utils/usage-utils.ts                                                                   | 0          | 34             | 0            | 0%       | Only in upstream |
| apps/ui/src/styles/font-imports.ts                                                                       | 19         | 113            | 5            | 4%       | Modified         |
| apps/ui/src/styles/global.css                                                                            | 1205       | 1129           | 1120         | 92%      | Modified         |
| apps/ui/src/styles/theme-imports.ts                                                                      | 10         | 48             | 6            | 12%      | Modified         |
| apps/ui/src/styles/themes/ayu-dark.css                                                                   | 151        | 151            | 151          | 100%     | Identical        |
| apps/ui/src/styles/themes/ayu-light.css                                                                  | 151        | 151            | 151          | 100%     | Identical        |
| apps/ui/src/styles/themes/ayu-mirage.css                                                                 | 151        | 151            | 151          | 100%     | Identical        |
| apps/ui/src/styles/themes/blossom.css                                                                    | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/bluloco.css                                                                    | 93         | 93             | 92           | 98%      | Modified         |
| apps/ui/src/styles/themes/catppuccin.css                                                                 | 144        | 144            | 144          | 100%     | Identical        |
| apps/ui/src/styles/themes/cream.css                                                                      | 115        | 115            | 114          | 99%      | Modified         |
| apps/ui/src/styles/themes/dark.css                                                                       | 166        | 166            | 165          | 99%      | Modified         |
| apps/ui/src/styles/themes/dracula.css                                                                    | 144        | 144            | 144          | 100%     | Identical        |
| apps/ui/src/styles/themes/ember.css                                                                      | 151        | 151            | 151          | 100%     | Identical        |
| apps/ui/src/styles/themes/feather.css                                                                    | 93         | 93             | 92           | 98%      | Modified         |
| apps/ui/src/styles/themes/forest.css                                                                     | 98         | 98             | 97           | 98%      | Modified         |
| apps/ui/src/styles/themes/github.css                                                                     | 87         | 87             | 86           | 98%      | Modified         |
| apps/ui/src/styles/themes/gray.css                                                                       | 110        | 110            | 109          | 99%      | Modified         |
| apps/ui/src/styles/themes/gruvbox.css                                                                    | 144        | 144            | 144          | 100%     | Identical        |
| apps/ui/src/styles/themes/gruvboxlight.css                                                               | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/lavender.css                                                                   | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/light.css                                                                      | 102        | 102            | 102          | 100%     | Identical        |
| apps/ui/src/styles/themes/matcha.css                                                                     | 103        | 103            | 102          | 99%      | Modified         |
| apps/ui/src/styles/themes/mint.css                                                                       | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/monokai.css                                                                    | 144        | 144            | 144          | 100%     | Identical        |
| apps/ui/src/styles/themes/nord.css                                                                       | 144        | 144            | 144          | 100%     | Identical        |
| apps/ui/src/styles/themes/nordlight.css                                                                  | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/ocean.css                                                                      | 98         | 98             | 97           | 98%      | Modified         |
| apps/ui/src/styles/themes/onedark.css                                                                    | 144        | 144            | 144          | 100%     | Identical        |
| apps/ui/src/styles/themes/onelight.css                                                                   | 93         | 93             | 92           | 98%      | Modified         |
| apps/ui/src/styles/themes/paper.css                                                                      | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/peach.css                                                                      | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/red.css                                                                        | 83         | 83             | 83           | 100%     | Identical        |
| apps/ui/src/styles/themes/retro.css                                                                      | 249        | 249            | 249          | 100%     | Identical        |
| apps/ui/src/styles/themes/rose.css                                                                       | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/sand.css                                                                       | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/sepia.css                                                                      | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/sky.css                                                                        | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/snow.css                                                                       | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/solarized.css                                                                  | 144        | 144            | 144          | 100%     | Identical        |
| apps/ui/src/styles/themes/solarizedlight.css                                                             | 92         | 92             | 91           | 98%      | Modified         |
| apps/ui/src/styles/themes/sunset.css                                                                     | 110        | 110            | 109          | 99%      | Modified         |
| apps/ui/src/styles/themes/synthwave.css                                                                  | 160        | 160            | 160          | 100%     | Identical        |
| apps/ui/src/styles/themes/tokyonight.css                                                                 | 144        | 144            | 144          | 100%     | Identical        |
| apps/ui/src/types/css.d.ts                                                                               | 9          | 9              | 9            | 100%     | Identical        |
| apps/ui/src/types/electron.d.ts                                                                          | 1187       | 1469           | 0            | 0%       | Modified         |
| apps/ui/src/types/global.d.ts                                                                            | 0          | 68             | 0            | 0%       | Only in upstream |
| apps/ui/src/utils/router.ts                                                                              | 22         | 22             | 22           | 100%     | Identical        |
| apps/ui/src/vite-env.d.ts                                                                                | 15         | 14             | 14           | 93%      | Modified         |
| apps/ui/test/github-collab-test-12580-0fnq3v2/github-collab-1771467974672/package.json                   | 4          | 0              | 0            | 0%       | Only in fork     |
| apps/ui/tests/agent/start-new-chat-session.spec.ts                                                       | 91         | 91             | 91           | 100%     | Identical        |
| apps/ui/tests/board/agent-chat-persistence.spec.ts                                                       | 552        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/tests/context/add-context-image.spec.ts                                                          | 0          | 148            | 0            | 0%       | Only in upstream |
| apps/ui/tests/context/context-file-management.spec.ts                                                    | 0          | 70             | 0            | 0%       | Only in upstream |
| apps/ui/tests/context/delete-context-file.spec.ts                                                        | 0          | 77             | 0            | 0%       | Only in upstream |
| apps/ui/tests/e2e-testing-guide.md                                                                       | 343        | 343            | 342          | 99%      | Modified         |
| apps/ui/tests/features/add-feature-to-backlog.spec.ts                                                    | 127        | 91             | 0            | 0%       | Modified         |
| apps/ui/tests/features/auto-mode-dependencies.spec.ts                                                    | 592        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/tests/features/edit-feature.spec.ts                                                              | 137        | 145            | 136          | 93%      | Modified         |
| apps/ui/tests/features/feature-manual-review-flow.spec.ts                                                | 197        | 194            | 181          | 91%      | Modified         |
| apps/ui/tests/features/feature-skip-tests-toggle.spec.ts                                                 | 112        | 112            | 112          | 100%     | Identical        |
| apps/ui/tests/features/list-view-priority.spec.ts                                                        | 0          | 168            | 0            | 0%       | Only in upstream |
| apps/ui/tests/features/planning-mode-fix-verification.spec.ts                                            | 0          | 131            | 0            | 0%       | Only in upstream |
| apps/ui/tests/global-setup.ts                                                                            | 12         | 12             | 12           | 100%     | Identical        |
| apps/ui/tests/img/background.jpg                                                                         | 6570       | 6570           | 6570         | 100%     | Identical        |
| apps/ui/tests/navigation/top-nav-bar.spec.ts                                                             | 245        | 0              | 0            | 0%       | Only in fork     |
| apps/ui/tests/projects/new-project-creation.spec.ts                                                      | 85         | 89             | 78           | 87%      | Modified         |
| apps/ui/tests/projects/open-existing-project.spec.ts                                                     | 189        | 210            | 177          | 84%      | Modified         |
| apps/ui/tests/projects/overview-dashboard.spec.ts                                                        | 0          | 394            | 0            | 0%       | Only in upstream |
| apps/ui/tests/settings/settings-startup-sync-race.spec.ts                                                | 153        | 153            | 153          | 100%     | Identical        |
| apps/ui/tests/utils/api/client.ts                                                                        | 409        | 409            | 409          | 100%     | Identical        |
| apps/ui/tests/utils/components/autocomplete.ts                                                           | 62         | 62             | 62           | 100%     | Identical        |
| apps/ui/tests/utils/components/dialogs.ts                                                                | 186        | 186            | 186          | 100%     | Identical        |
| apps/ui/tests/utils/components/modals.ts                                                                 | 92         | 92             | 92           | 100%     | Identical        |
| apps/ui/tests/utils/components/toasts.ts                                                                 | 85         | 85             | 85           | 100%     | Identical        |
| apps/ui/tests/utils/core/constants.ts                                                                    | 203        | 174            | 162          | 79%      | Modified         |
| apps/ui/tests/utils/core/elements.ts                                                                     | 32         | 49             | 0            | 0%       | Modified         |
| apps/ui/tests/utils/core/interactions.ts                                                                 | 173        | 173            | 172          | 99%      | Modified         |
| apps/ui/tests/utils/core/waiting.ts                                                                      | 99         | 99             | 99           | 100%     | Identical        |
| apps/ui/tests/utils/features/kanban.ts                                                                   | 62         | 62             | 62           | 100%     | Identical        |
| apps/ui/tests/utils/features/skip-tests.ts                                                               | 96         | 96             | 96           | 100%     | Identical        |
| apps/ui/tests/utils/features/timers.ts                                                                   | 30         | 30             | 30           | 100%     | Identical        |
| apps/ui/tests/utils/features/waiting-approval.ts                                                         | 62         | 62             | 62           | 100%     | Identical        |
| apps/ui/tests/utils/files/drag-drop.ts                                                                   | 92         | 92             | 92           | 100%     | Identical        |
| apps/ui/tests/utils/git/worktree.ts                                                                      | 536        | 539            | 536          | 99%      | Modified         |
| apps/ui/tests/utils/helpers/concurrency.ts                                                               | 48         | 48             | 48           | 100%     | Identical        |
| apps/ui/tests/utils/helpers/log-viewer.ts                                                                | 113        | 113            | 113          | 100%     | Identical        |
| apps/ui/tests/utils/helpers/scroll.ts                                                                    | 58         | 58             | 58           | 100%     | Identical        |
| apps/ui/tests/utils/index.ts                                                                             | 48         | 48             | 48           | 100%     | Identical        |
| apps/ui/tests/utils/navigation/views.ts                                                                  | 206        | 198            | 174          | 84%      | Modified         |
| apps/ui/tests/utils/project/fixtures.ts                                                                  | 124        | 125            | 124          | 99%      | Modified         |
| apps/ui/tests/utils/project/setup.ts                                                                     | 815        | 835            | 809          | 96%      | Modified         |
| apps/ui/tests/utils/views/agent.ts                                                                       | 87         | 87             | 87           | 100%     | Identical        |
| apps/ui/tests/utils/views/board.ts                                                                       | 221        | 221            | 221          | 100%     | Identical        |
| apps/ui/tests/utils/views/context.ts                                                                     | 189        | 181            | 180          | 95%      | Modified         |
| apps/ui/tests/utils/views/settings.ts                                                                    | 8          | 8              | 8            | 100%     | Identical        |
| apps/ui/tests/utils/views/setup.ts                                                                       | 68         | 68             | 68           | 100%     | Identical        |
| apps/ui/tests/utils/views/spec-editor.ts                                                                 | 119        | 119            | 119          | 100%     | Identical        |
| apps/ui/tsconfig.json                                                                                    | 22         | 22             | 22           | 100%     | Identical        |
| apps/ui/vite.config.mts                                                                                  | 99         | 104            | 0            | 0%       | Modified         |
| check-sync.sh                                                                                            | 215        | 215            | 215          | 100%     | Identical        |
| CLAUDE.md                                                                                                | 175        | 176            | 174          | 98%      | Modified         |
| CONTRIBUTING.md                                                                                          | 740        | 740            | 740          | 100%     | Identical        |
| DEVELOPMENT_WORKFLOW.md                                                                                  | 253        | 253            | 253          | 100%     | Identical        |
| DISCLAIMER.md                                                                                            | 85         | 85             | 85           | 100%     | Identical        |
| docker-compose.dev.yml                                                                                   | 151        | 149            | 0            | 0%       | Modified         |
| docker-compose.dev-server.yml                                                                            | 107        | 106            | 0            | 0%       | Modified         |
| docker-compose.override.yml.example                                                                      | 42         | 42             | 42           | 100%     | Identical        |
| docker-compose.yml                                                                                       | 133        | 133            | 133          | 100%     | Identical        |
| docker-entrypoint.sh                                                                                     | 74         | 74             | 74           | 100%     | Identical        |
| Dockerfile                                                                                               | 224        | 226            | 0            | 0%       | Modified         |
| Dockerfile.dev                                                                                           | 94         | 94             | 94           | 100%     | Identical        |
| docs/add-new-cursor-model.md                                                                             | 154        | 154            | 154          | 100%     | Identical        |
| docs/checkout-branch-pr.md                                                                               | 237        | 237            | 237          | 100%     | Identical        |
| docs/clean-code.md                                                                                       | 464        | 464            | 464          | 100%     | Identical        |
| docs/context-files-pattern.md                                                                            | 170        | 170            | 170          | 100%     | Identical        |
| docs/folder-pattern.md                                                                                   | 167        | 167            | 167          | 100%     | Identical        |
| docs/install-fedora.md                                                                                   | 485        | 485            | 485          | 100%     | Identical        |
| docs/llm-shared-packages.md                                                                              | 450        | 450            | 449          | 99%      | Modified         |
| docs/pr/terminal-omp.png                                                                                 | 0          | 75             | 0            | 0%       | Only in upstream |
| docs/pr-comment-fix-agent.md                                                                             | 152        | 152            | 152          | 100%     | Identical        |
| docs/pr-comment-fix-prompt.md                                                                            | 51         | 51             | 51           | 100%     | Identical        |
| docs/prd-to-features-guide.md                                                                            | 0          | 431            | 0            | 0%       | Only in upstream |
| docs/release.md                                                                                          | 126        | 126            | 126          | 100%     | Identical        |
| docs/server/providers.md                                                                                 | 800        | 800            | 797          | 99%      | Modified         |
| docs/server/route-organization.md                                                                        | 573        | 573            | 573          | 100%     | Identical        |
| docs/server/utilities.md                                                                                 | 699        | 699            | 693          | 99%      | Modified         |
| docs/settings-api-migration.md                                                                           | 215        | 215            | 215          | 100%     | Identical        |
| docs/terminal.md                                                                                         | 123        | 123            | 123          | 100%     | Identical        |
| docs/terminal-custom-configs-plan.md                                                                     | 0          | 632            | 0            | 0%       | Only in upstream |
| docs/UNIFIED_API_KEY_PROFILES.md                                                                         | 0          | 323            | 0            | 0%       | Only in upstream |
| docs/worktree-init-script-example.sh                                                                     | 30         | 30             | 30           | 100%     | Identical        |
| graph-layout-bug.md                                                                                      | 203        | 0              | 0            | 0%       | Only in fork     |
| libs/dependency-resolver/package.json                                                                    | 39         | 39             | 39           | 100%     | Identical        |
| libs/dependency-resolver/README.md                                                                       | 188        | 188            | 188          | 100%     | Identical        |
| libs/dependency-resolver/src/index.ts                                                                    | 19         | 19             | 17           | 89%      | Modified         |
| libs/dependency-resolver/src/resolver.ts                                                                 | 465        | 458            | 427          | 91%      | Modified         |
| libs/dependency-resolver/tests/resolver.test.ts                                                          | 748        | 570            | 549          | 73%      | Modified         |
| libs/dependency-resolver/tsconfig.json                                                                   | 9          | 9              | 9            | 100%     | Identical        |
| libs/dependency-resolver/vitest.config.ts                                                                | 22         | 22             | 22           | 100%     | Identical        |
| libs/git-utils/package.json                                                                              | 33         | 33             | 33           | 100%     | Identical        |
| libs/git-utils/README.md                                                                                 | 276        | 276            | 276          | 100%     | Identical        |
| libs/git-utils/src/diff.ts                                                                               | 335        | 283            | 283          | 84%      | Modified         |
| libs/git-utils/src/index.ts                                                                              | 19         | 19             | 19           | 100%     | Identical        |
| libs/git-utils/src/status.ts                                                                             | 104        | 104            | 104          | 100%     | Identical        |
| libs/git-utils/src/types.ts                                                                              | 73         | 73             | 73           | 100%     | Identical        |
| libs/git-utils/tests/diff.test.ts                                                                        | 349        | 349            | 349          | 100%     | Identical        |
| libs/git-utils/tsconfig.json                                                                             | 9          | 9              | 9            | 100%     | Identical        |
| libs/git-utils/vitest.config.ts                                                                          | 22         | 22             | 22           | 100%     | Identical        |
| libs/model-resolver/package.json                                                                         | 32         | 32             | 32           | 100%     | Identical        |
| libs/model-resolver/README.md                                                                            | 135        | 135            | 129          | 95%      | Modified         |
| libs/model-resolver/src/index.ts                                                                         | 21         | 21             | 21           | 100%     | Identical        |
| libs/model-resolver/src/resolver.ts                                                                      | 205        | 250            | 0            | 0%       | Modified         |
| libs/model-resolver/tests/resolver.test.ts                                                               | 539        | 552            | 495          | 89%      | Modified         |
| libs/model-resolver/tsconfig.json                                                                        | 9          | 9              | 9            | 100%     | Identical        |
| libs/model-resolver/vitest.config.ts                                                                     | 22         | 22             | 22           | 100%     | Identical        |
| libs/platform/package.json                                                                               | 32         | 32             | 32           | 100%     | Identical        |
| libs/platform/README.md                                                                                  | 217        | 217            | 217          | 100%     | Identical        |
| libs/platform/src/config/ports.ts                                                                        | 8          | 8              | 8            | 100%     | Identical        |
| libs/platform/src/editor.ts                                                                              | 343        | 449            | 0            | 0%       | Modified         |
| libs/platform/src/index.ts                                                                               | 181        | 222            | 173          | 77%      | Modified         |
| libs/platform/src/node-finder.ts                                                                         | 361        | 361            | 361          | 100%     | Identical        |
| libs/platform/src/paths.ts                                                                               | 621        | 461            | 407          | 65%      | Modified         |
| libs/platform/src/rc-file-manager.ts                                                                     | 0          | 308            | 0            | 0%       | Only in upstream |
| libs/platform/src/rc-generator.ts                                                                        | 0          | 972            | 0            | 0%       | Only in upstream |
| libs/platform/src/secure-fs.ts                                                                           | 629        | 629            | 629          | 100%     | Identical        |
| libs/platform/src/security.ts                                                                            | 131        | 131            | 131          | 100%     | Identical        |
| libs/platform/src/subprocess.ts                                                                          | 263        | 263            | 263          | 100%     | Identical        |
| libs/platform/src/system-paths.ts                                                                        | 1331       | 1334           | 0            | 0%       | Modified         |
| libs/platform/src/terminal.ts                                                                            | 0          | 612            | 0            | 0%       | Only in upstream |
| libs/platform/src/terminal-theme-colors.ts                                                               | 0          | 468            | 0            | 0%       | Only in upstream |
| libs/platform/src/wsl.ts                                                                                 | 389        | 389            | 389          | 100%     | Identical        |
| libs/platform/tests/node-finder.test.ts                                                                  | 197        | 197            | 197          | 100%     | Identical        |
| libs/platform/tests/paths.test.ts                                                                        | 625        | 212            | 212          | 33%      | Modified         |
| libs/platform/tests/rc-file-manager.test.ts                                                              | 0          | 100            | 0            | 0%       | Only in upstream |
| libs/platform/tests/rc-generator.test.ts                                                                 | 0          | 55             | 0            | 0%       | Only in upstream |
| libs/platform/tests/secure-fs.test.ts                                                                    | 136        | 136            | 136          | 100%     | Identical        |
| libs/platform/tests/security.test.ts                                                                     | 234        | 234            | 234          | 100%     | Identical        |
| libs/platform/tests/subprocess.test.ts                                                                   | 516        | 516            | 516          | 100%     | Identical        |
| libs/platform/tsconfig.json                                                                              | 9          | 9              | 9            | 100%     | Identical        |
| libs/platform/vitest.config.ts                                                                           | 24         | 24             | 24           | 100%     | Identical        |
| libs/prompts/package.json                                                                                | 32         | 32             | 32           | 100%     | Identical        |
| libs/prompts/README.md                                                                                   | 257        | 257            | 257          | 100%     | Identical        |
| libs/prompts/src/defaults.ts                                                                             | 976        | 1091           | 0            | 0%       | Modified         |
| libs/prompts/src/enhancement.ts                                                                          | 186        | 186            | 186          | 100%     | Identical        |
| libs/prompts/src/enhancement-modes/acceptance.ts                                                         | 90         | 90             | 90           | 100%     | Identical        |
| libs/prompts/src/enhancement-modes/improve.ts                                                            | 88         | 88             | 88           | 100%     | Identical        |
| libs/prompts/src/enhancement-modes/index.ts                                                              | 27         | 27             | 27           | 100%     | Identical        |
| libs/prompts/src/enhancement-modes/simplify.ts                                                           | 74         | 74             | 74           | 100%     | Identical        |
| libs/prompts/src/enhancement-modes/technical.ts                                                          | 92         | 92             | 92           | 100%     | Identical        |
| libs/prompts/src/enhancement-modes/ux-reviewer.ts                                                        | 325        | 325            | 325          | 100%     | Identical        |
| libs/prompts/src/index.ts                                                                                | 114        | 114            | 114          | 100%     | Identical        |
| libs/prompts/src/merge.ts                                                                                | 338        | 338            | 338          | 100%     | Identical        |
| libs/prompts/tests/enhancement.test.ts                                                                   | 526        | 526            | 526          | 100%     | Identical        |
| libs/prompts/tsconfig.json                                                                               | 9          | 9              | 9            | 100%     | Identical        |
| libs/prompts/vitest.config.ts                                                                            | 22         | 22             | 22           | 100%     | Identical        |
| libs/spec-parser/package.json                                                                            | 0          | 39             | 0            | 0%       | Only in upstream |
| libs/spec-parser/src/index.ts                                                                            | 0          | 26             | 0            | 0%       | Only in upstream |
| libs/spec-parser/src/spec-to-xml.ts                                                                      | 0          | 88             | 0            | 0%       | Only in upstream |
| libs/spec-parser/src/validate.ts                                                                         | 0          | 143            | 0            | 0%       | Only in upstream |
| libs/spec-parser/src/xml-to-spec.ts                                                                      | 0          | 232            | 0            | 0%       | Only in upstream |
| libs/spec-parser/src/xml-utils.ts                                                                        | 0          | 79             | 0            | 0%       | Only in upstream |
| libs/spec-parser/tsconfig.json                                                                           | 0          | 9              | 0            | 0%       | Only in upstream |
| libs/tsconfig.base.json                                                                                  | 16         | 16             | 16           | 100%     | Identical        |
| libs/types/package.json                                                                                  | 25         | 25             | 25           | 100%     | Identical        |
| libs/types/README.md                                                                                     | 142        | 165            | 0            | 0%       | Modified         |
| libs/types/src/backlog-plan.ts                                                                           | 67         | 67             | 67           | 100%     | Identical        |
| libs/types/src/cache.ts                                                                                  | 154        | 0              | 0            | 0%       | Only in fork     |
| libs/types/src/codex.ts                                                                                  | 52         | 52             | 52           | 100%     | Identical        |
| libs/types/src/codex-app-server.ts                                                                       | 87         | 87             | 87           | 100%     | Identical        |
| libs/types/src/codex-models.ts                                                                           | 95         | 95             | 95           | 100%     | Identical        |
| libs/types/src/copilot-models.ts                                                                         | 0          | 194            | 0            | 0%       | Only in upstream |
| libs/types/src/cursor-cli.ts                                                                             | 398        | 398            | 398          | 100%     | Identical        |
| libs/types/src/cursor-models.ts                                                                          | 427        | 462            | 0            | 0%       | Modified         |
| libs/types/src/editor.ts                                                                                 | 13         | 13             | 13           | 100%     | Identical        |
| libs/types/src/enhancement.ts                                                                            | 16         | 16             | 16           | 100%     | Identical        |
| libs/types/src/error.ts                                                                                  | 26         | 26             | 26           | 100%     | Identical        |
| libs/types/src/event.ts                                                                                  | 61         | 57             | 0            | 0%       | Modified         |
| libs/types/src/event-history.ts                                                                          | 0          | 123            | 0            | 0%       | Modified         |
| libs/types/src/feature.ts                                                                                | 253        | 164            | 0            | 0%       | Modified         |
| libs/types/src/gemini-models.ts                                                                          | 0          | 101            | 0            | 0%       | Only in upstream |
| libs/types/src/ideation.ts                                                                               | 230        | 262            | 0            | 0%       | Modified         |
| libs/types/src/image.ts                                                                                  | 21         | 21             | 21           | 100%     | Identical        |
| libs/types/src/index.ts                                                                                  | 314        | 381            | 275          | 72%      | Modified         |
| libs/types/src/issue-validation.ts                                                                       | 209        | 209            | 209          | 100%     | Identical        |
| libs/types/src/model.ts                                                                                  | 102        | 137            | 98           | 71%      | Modified         |
| libs/types/src/model-display.ts                                                                          | 204        | 232            | 0            | 0%       | Modified         |
| libs/types/src/model-migration.ts                                                                        | 0          | 218            | 0            | 0%       | Only in upstream |
| libs/types/src/notification.ts                                                                           | 58         | 58             | 58           | 100%     | Identical        |
| libs/types/src/opencode-models.ts                                                                        | 179        | 204            | 0            | 0%       | Modified         |
| libs/types/src/pipeline.ts                                                                               | 29         | 29             | 27           | 93%      | Modified         |
| libs/types/src/ports.ts                                                                                  | 15         | 15             | 15           | 100%     | Identical        |
| libs/types/src/project-overview.ts                                                                       | 0          | 244            | 0            | 0%       | Only in upstream |
| libs/types/src/prompts.ts                                                                                | 366        | 366            | 366          | 100%     | Identical        |
| libs/types/src/provider.ts                                                                               | 292        | 316            | 0            | 0%       | Modified         |
| libs/types/src/provider-utils.ts                                                                         | 294        | 418            | 0            | 0%       | Modified         |
| libs/types/src/session.ts                                                                                | 31         | 31             | 31           | 100%     | Identical        |
| libs/types/src/settings.ts                                                                               | 947        | 1603           | 787          | 49%      | Modified         |
| libs/types/src/spec.ts                                                                                   | 118        | 118            | 118          | 100%     | Identical        |
| libs/types/src/terminal.ts                                                                               | 0          | 15             | 0            | 0%       | Only in upstream |
| libs/types/src/test-runner.ts                                                                            | 0          | 17             | 0            | 0%       | Only in upstream |
| libs/types/src/worktree.ts                                                                               | 0          | 76             | 0            | 0%       | Only in upstream |
| libs/types/tsconfig.json                                                                                 | 9          | 9              | 9            | 100%     | Identical        |
| libs/utils/package.json                                                                                  | 42         | 50             | 0            | 0%       | Modified         |
| libs/utils/README.md                                                                                     | 155        | 155            | 155          | 100%     | Identical        |
| libs/utils/src/atomic-writer.ts                                                                          | 362        | 365            | 0            | 0%       | Modified         |
| libs/utils/src/context-loader.ts                                                                         | 485        | 490            | 0            | 0%       | Modified         |
| libs/utils/src/conversation-utils.ts                                                                     | 95         | 95             | 95           | 100%     | Identical        |
| libs/utils/src/debounce.ts                                                                               | 0          | 280            | 0            | 0%       | Only in upstream |
| libs/utils/src/error-handler.ts                                                                          | 243        | 243            | 243          | 100%     | Identical        |
| libs/utils/src/fs-utils.ts                                                                               | 67         | 67             | 67           | 100%     | Identical        |
| libs/utils/src/image-handler.ts                                                                          | 113        | 113            | 113          | 100%     | Identical        |
| libs/utils/src/index.ts                                                                                  | 117        | 116            | 106          | 90%      | Modified         |
| libs/utils/src/logger.ts                                                                                 | 247        | 247            | 245          | 99%      | Modified         |
| libs/utils/src/memory-loader.ts                                                                          | 685        | 685            | 685          | 100%     | Identical        |
| libs/utils/src/path-utils.ts                                                                             | 51         | 102            | 0            | 0%       | Modified         |
| libs/utils/src/prompt-builder.ts                                                                         | 79         | 79             | 79           | 100%     | Identical        |
| libs/utils/src/retry.ts                                                                                  | 342        | 0              | 0            | 0%       | Only in fork     |
| libs/utils/src/string-utils.ts                                                                           | 0          | 178            | 0            | 0%       | Only in upstream |
| libs/utils/tests/atomic-writer.test.ts                                                                   | 709        | 710            | 0            | 0%       | Modified         |
| libs/utils/tests/conversation-utils.test.ts                                                              | 241        | 241            | 241          | 100%     | Identical        |
| libs/utils/tests/debounce.test.ts                                                                        | 0          | 330            | 0            | 0%       | Only in upstream |
| libs/utils/tests/error-handler.test.ts                                                                   | 459        | 459            | 459          | 100%     | Identical        |
| libs/utils/tests/fs-utils.test.ts                                                                        | 249        | 246            | 237          | 95%      | Modified         |
| libs/utils/tests/image-handler.test.ts                                                                   | 244        | 244            | 244          | 100%     | Identical        |
| libs/utils/tests/logger.test.ts                                                                          | 298        | 298            | 298          | 100%     | Identical        |
| libs/utils/tests/path-utils.test.ts                                                                      | 0          | 152            | 0            | 0%       | Only in upstream |
| libs/utils/tests/prompt-builder.test.ts                                                                  | 283        | 283            | 283          | 100%     | Identical        |
| libs/utils/tests/retry.test.ts                                                                           | 553        | 0              | 0            | 0%       | Only in fork     |
| libs/utils/tsconfig.json                                                                                 | 9          | 9              | 9            | 100%     | Identical        |
| libs/utils/vitest.config.ts                                                                              | 24         | 24             | 24           | 100%     | Identical        |
| LICENSE                                                                                                  | 141        | 27             | 0            | 0%       | Modified         |
| package.json                                                                                             | 79         | 82             | 74           | 90%      | Modified         |
| package-lock.json                                                                                        | 16488      | 16844          | 0            | 0%       | Modified         |
| README.md                                                                                                | 668        | 678            | 0            | 0%       | Modified         |
| scripts/fix-lockfile-urls.mjs                                                                            | 34         | 34             | 34           | 100%     | Identical        |
| scripts/get-claude-token.sh                                                                              | 34         | 34             | 34           | 100%     | Identical        |
| scripts/get-cursor-token.sh                                                                              | 69         | 69             | 69           | 100%     | Identical        |
| scripts/lint-lockfile.mjs                                                                                | 33         | 33             | 33           | 100%     | Identical        |
| start-dmaker.mjs                                                                                         | 0          | 201            | 0            | 0%       | Only in upstream |
| start-dmaker.sh                                                                                          | 1352       | 1437           | 0            | 0%       | Modified         |
| test/agent-session-test-115699-vyk2nk2/test-project-1768743000887/package.json                           | 0          | 4              | 0            | 0%       | Only in upstream |
| test/feature-backlog-test-114171-aysp86y/test-project-1768742910934/package.json                         | 0          | 4              | 0            | 0%       | Only in upstream |
| test/feature-backlog-test-80497-5rxs746/test-project-1767820775187/package.json                          | 4          | 4              | 4            | 100%     | Identical        |
| test/fixtures/projectA/.gitkeep                                                                          | 2          | 2              | 2            | 100%     | Identical        |
| tests/e2e/multi-project-dashboard.spec.ts                                                                | 0          | 119            | 0            | 0%       | Only in upstream |
| TODO.md                                                                                                  | 17         | 0              | 0            | 0%       | Only in fork     |
| vitest.config.ts                                                                                         | 9          | 9              | 9            | 100%     | Identical        |

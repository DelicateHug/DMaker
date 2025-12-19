# @automaker/platform

Platform-specific utilities for AutoMaker.

## Overview

This package provides platform-specific utilities including path management, subprocess handling, and security validation. It handles AutoMaker's directory structure and system operations.

## Installation

```bash
npm install @automaker/platform
```

## Exports

### Path Management
AutoMaker directory structure utilities.

```typescript
import {
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBoardDir,
  getImagesDir,
  getContextDir,
  getWorktreesDir,
  getAppSpecPath,
  getBranchTrackingPath,
  ensureAutomakerDir
} from '@automaker/platform';

// Get AutoMaker directory: /project/.automaker
const automakerDir = getAutomakerDir('/project/path');

// Get features directory: /project/.automaker/features
const featuresDir = getFeaturesDir('/project/path');

// Get specific feature directory: /project/.automaker/features/feature-id
const featureDir = getFeatureDir('/project/path', 'feature-id');

// Get feature images: /project/.automaker/features/feature-id/images
const imagesDir = getFeatureImagesDir('/project/path', 'feature-id');

// Ensure .automaker directory exists
await ensureAutomakerDir('/project/path');
```

### Subprocess Management
Spawn and manage subprocesses with JSON-lines output.

```typescript
import { spawnJSONLProcess, spawnProcess } from '@automaker/platform';

// Spawn process with JSONL output parsing
const result = await spawnJSONLProcess({
  command: 'claude-agent',
  args: ['--output', 'jsonl'],
  cwd: '/project/path',
  onLine: (data) => console.log('Received:', data),
  onError: (error) => console.error('Error:', error)
});

// Spawn regular process
const output = await spawnProcess({
  command: 'git',
  args: ['status'],
  cwd: '/project/path'
});
```

### Security Validation
Path validation and security checks.

```typescript
import {
  initAllowedPaths,
  addAllowedPath,
  isPathAllowed,
  validatePath,
  getAllowedPaths
} from '@automaker/platform';

// Initialize allowed paths from environment
initAllowedPaths();

// Add custom allowed path
addAllowedPath('/custom/path');

// Check if path is allowed
if (isPathAllowed('/project/path')) {
  console.log('Path is allowed');
}

// Validate and normalize path
const safePath = validatePath('/requested/path');

// Get all allowed paths
const allowed = getAllowedPaths();
```

## Usage Example

```typescript
import {
  getFeatureDir,
  ensureAutomakerDir,
  spawnJSONLProcess,
  validatePath
} from '@automaker/platform';

async function executeFeature(projectPath: string, featureId: string) {
  // Validate project path
  const safePath = validatePath(projectPath);

  // Ensure AutoMaker directory exists
  await ensureAutomakerDir(safePath);

  // Get feature directory
  const featureDir = getFeatureDir(safePath, featureId);

  // Execute agent in feature directory
  const result = await spawnJSONLProcess({
    command: 'claude-agent',
    args: ['execute'],
    cwd: featureDir,
    onLine: (data) => {
      if (data.type === 'progress') {
        console.log('Progress:', data.progress);
      }
    }
  });

  return result;
}
```

## Directory Structure

AutoMaker uses the following directory structure:

```
/project/
├── .automaker/
│   ├── features/          # Feature storage
│   │   └── {featureId}/
│   │       ├── feature.json
│   │       └── images/
│   ├── board/             # Board configuration
│   ├── context/           # Context files
│   ├── images/            # Global images
│   ├── worktrees/         # Git worktrees
│   ├── app-spec.md        # App specification
│   └── branch-tracking.json
```

## Dependencies

- `@automaker/types` - Type definitions

## Used By

- `@automaker/server`

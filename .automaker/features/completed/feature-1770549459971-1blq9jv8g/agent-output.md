🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\dev-restart.ps1"
}

# Specification: PowerShell Script Execution Issue

## 1. Problem Statement

The user is unable to run the `dev-restart.ps1` PowerShell script located at `C:\Users\dylan\Downloads\dmaker-pr\dev-restart.ps1`. This script is designed to stop existing dev processes, clear caches, and restart Electron dev mode, but it's not executing as expected.

## 2. User Story

As a developer, I want to run the dev-restart.ps1 script, so that I can quickly restart my development environment with clean caches.

## 3. Acceptance Criteria

- **Happy Path**: GIVEN the script exists in the project root, WHEN I execute it in PowerShell, THEN it should stop processes, clear caches, and start `npm run dev:electron`
- **Execution Policy**: GIVEN PowerShell has restricted execution policy, WHEN I try to run the script, THEN I should be able to bypass or change the policy to allow execution
- **Error Handling**: GIVEN any step fails, WHEN the script encounters an error, THEN it should continue with the next step (which it already does with `-ErrorAction SilentlyContinue`)

## 4. Technical Context

| Aspect             | Value                               |
| ------------------ | ----------------------------------- |
| Affected Files     | `dev-restart.ps1`                   |
| Dependencies       | PowerShell, npm                     |
| Constraints        | Windows PowerShell execution policy |
| Patterns to Follow | Standard PowerShell scripting       |

## 5. Non-Goals

- Modifying the core functionality of the script
- Adding new features to the script

## 6. Implementation Tasks

```tasks
## Phase 1: Diagnosis & Fix

- [ ] T001: Verify script can execute by checking for syntax errors | File: dev-restart.ps1
- [ ] T002: Add shebang/execution instructions as comments | File: dev-restart.ps1
```

## 7. Likely Causes & Solutions

The most common reason a PowerShell script won't run on Windows is the **Execution Policy**. Here are ways to run the script:

### Option 1: Run with Bypass (One-time)

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\dylan\Downloads\dmaker-pr\dev-restart.ps1"
```

### Option 2: Unblock the file (if downloaded from internet)

```powershell
Unblock-File -Path "C:\Users\dylan\Downloads\dmaker-pr\dev-restart.ps1"
.\dev-restart.ps1
```

### Option 3: Change execution policy for current user

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Option 4: Right-click the script → "Run with PowerShell"

## 8. Success Metrics

- Script executes all 5 steps successfully
- Electron dev mode starts on ports 3017 (UI) and 3019 (Server)

---

The script itself looks syntactically correct. The issue is almost certainly **Windows PowerShell execution policy** blocking script execution.

**To run the script immediately, open PowerShell in the project directory and run:**

```powershell
powershell -ExecutionPolicy Bypass -File .\dev-restart.ps1
```

Or if you want a permanent fix for your user:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then simply run:

```powershell
.\dev-restart.ps1
```

Would you like me to:

1. Add usage instructions as comments to the script header?
2. Create a batch file wrapper (`dev-restart.bat`) that bypasses execution policy automatically?
3. Something else?

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand project selector structure",
"status": "in_progress",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add '+ Add New Project' option at end of project list",
"status": "pending",
"activeForm": "Adding new project option"
},
{
"content": "Add trash icon with delete functionality",
"status": "pending",
"activeForm": "Adding trash icon for deletion"
},
{
"content": "Create confirmation modal with project name typing requirement",
"status": "pending",
"activeForm": "Creating confirmation modal"
},
{
"content": "Make project name selectable/copyable (not click-to-copy)",
"status": "pending",
"activeForm": "Making project name copyable"
}
]
}
Let me start by exploring the codebase to understand the project selector structure. I'll look at the board view and any project-related components.

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\.dmaker\\features\\feature-1770409929079-44y85k0r4\\images\\pasted-image-2026-02-06T20-30-34-366Z-1770409834382.png"
}

🔧 Tool: Glob
Input: {
"pattern": "apps/ui/src/components/views/board-view/\*_/_.{ts,tsx}"
}
Let me look at the board header where the project selector dropdown is shown. Based on the image, it appears to be in the header area.

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\board-header.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view.tsx"
}
Looking at the image, I can see there's a dropdown menu with "All Projects" and "dmaker" project. I need to find the project selector component. Let me search for it.

🔧 Tool: Grep
Input: {
"pattern": "Select Project|All Projects",
"glob": "\*.tsx"
}

🔧 Tool: Grep
Input: {
"pattern": "currentProject|selectProject",
"path": "apps/ui/src/components/layout",
"glob": "\*.tsx"
}
Let me look at the top-nav-bar.tsx file since it seems to have the project selector:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx"
}
Now I understand the project dropdown structure. The project dropdown is in the `TopNavigationBar` component. I need to:

1. Add a "+ Add New Project" option at the end of the project list
2. Add a trash icon next to each project for quick delete
3. Create a confirmation modal that requires typing the project name
4. Make the project name selectable/copyable (not click-to-copy)

Let me also check the app-store.ts to understand how projects are managed and if there's already a trash/delete mechanism:

🔧 Tool: Grep
Input: {
"pattern": "trashedProjects|trashProject|deleteProject|removeProject",
"path": "apps/ui/src/store/app-store.ts",
"output_mode": "content",
"-C": 3
}
There's already a `moveProjectToTrash` action which is the "soft delete" functionality. Now I understand the architecture. Let me update my todo list and start implementing:

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand project selector structure",
"status": "completed",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add '+ Add New Project' option at end of project list",
"status": "in_progress",
"activeForm": "Adding new project option"
},
{
"content": "Add trash icon with delete functionality",
"status": "pending",
"activeForm": "Adding trash icon for deletion"
},
{
"content": "Create confirmation modal with project name typing requirement",
"status": "pending",
"activeForm": "Creating confirmation modal"
},
{
"content": "Make project name selectable/copyable (not click-to-copy)",
"status": "pending",
"activeForm": "Making project name copyable"
}
]
}
Now let me implement the features. I'll start by adding the "+ Add New Project" option and the trash icon with delete functionality. First, I need to create a delete confirmation dialog:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\views\\board-view\\dialogs\\delete-completed-feature-dialog.tsx"
}
Let me look at the UI Input component to understand how to create an input field for the confirmation dialog:

🔧 Tool: Glob
Input: {
"pattern": "apps/ui/src/components/ui/input.tsx"
}

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\ui\\input.tsx"
}
Now I have all the information I need. Let me create the delete project confirmation dialog and modify the top-nav-bar.tsx to add:

1. A delete project dialog with name confirmation and soft delete option
2. A "+ Add New Project" option at the end of the project list
3. A trash icon next to each project for quick delete
4. Make the project name selectable/copyable

🔧 Tool: Write
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\dialogs\\delete-project-dialog.tsx",
"content": "import { useState, useEffect } from 'react';\nimport {\n Dialog,\n DialogContent,\n DialogDescription,\n DialogFooter,\n DialogHeader,\n DialogTitle,\n} from '@/components/ui/dialog';\nimport { Button } from '@/components/ui/button';\nimport { Input } from '@/components/ui/input';\nimport { Label } from '@/components/ui/label';\nimport { Trash2, FolderMinus } from 'lucide-react';\nimport type { Project } from '@/lib/electron';\n\ninterface DeleteProjectDialogProps {\n project: Project | null;\n open: boolean;\n onOpenChange: (open: boolean) => void;\n onSoftDelete: () => void;\n onHardDelete: () => void;\n}\n\nexport function DeleteProjectDialog({\n project,\n open,\n onOpenChange,\n onSoftDelete,\n onHardDelete,\n}: DeleteProjectDialogProps) {\n const [confirmName, setConfirmName] = useState('');\n const isNameMatch = confirmName === project?.name;\n\n // Reset confirmation input when dialog opens/closes or project changes\n useEffect(() => {\n if (!open) {\n setConfirmName('');\n }\n }, [open]);\n\n if (!project) return null;\n\n return (\n <Dialog open={open} onOpenChange={onOpenChange}>\n <DialogContent\n className=\"max-w-md\"\n data-testid=\"delete-project-dialog\"\n >\n <DialogHeader>\n <DialogTitle className=\"flex items-center gap-2 text-destructive\">\n <Trash2 className=\"w-5 h-5\" />\n Delete Project\n </DialogTitle>\n <DialogDescription asChild>\n <div className=\"space-y-3\">\n <p>\n Are you sure you want to delete this project?\n </p>\n {/_ Project name - selectable and copyable _/}\n <div className=\"bg-muted rounded-md p-3 border border-border\">\n <p\n className=\"font-medium text-foreground select-text cursor-text break-all\"\n title=\"Select and press Ctrl+C to copy\"\n >\n {project.name}\n </p>\n <p className=\"text-xs text-muted-foreground mt-1 truncate\">\n {project.path}\n </p>\n </div>\n <p className=\"text-sm\">\n To confirm, type the project name below:\n </p>\n </div>\n </DialogDescription>\n </DialogHeader>\n\n <div className=\"py-2\">\n <Label htmlFor=\"confirm-project-name\" className=\"sr-only\">\n Project Name\n </Label>\n <Input\n id=\"confirm-project-name\"\n placeholder={`Type \"${project.name}\" to confirm`}\n value={confirmName}\n onChange={(e) => setConfirmName(e.target.value)}\n data-testid=\"confirm-project-name-input\"\n autoComplete=\"off\"\n />\n </div>\n\n <DialogFooter className=\"flex-col gap-2 sm:flex-col\">\n {/_ Soft Delete - Remove from projects (move to trash) _/}\n <Button\n variant=\"outline\"\n onClick={onSoftDelete}\n disabled={!isNameMatch}\n className=\"w-full justify-start gap-2\"\n data-testid=\"soft-delete-project-button\"\n >\n <FolderMinus className=\"w-4 h-4\" />\n Remove from Projects\n <span className=\"text-xs text-muted-foreground ml-auto\">\n (can be restored)\n </span>\n </Button>\n\n {/_ Hard Delete - Permanent deletion _/}\n <Button\n variant=\"destructive\"\n onClick={onHardDelete}\n disabled={!isNameMatch}\n className=\"w-full justify-start gap-2\"\n data-testid=\"hard-delete-project-button\"\n >\n <Trash2 className=\"w-4 h-4\" />\n Delete Permanently\n <span className=\"text-xs ml-auto opacity-80\">\n (cannot be undone)\n </span>\n </Button>\n\n <Button\n variant=\"ghost\"\n onClick={() => onOpenChange(false)}\n className=\"w-full\"\n data-testid=\"cancel-delete-project-button\"\n >\n Cancel\n </Button>\n </DialogFooter>\n </DialogContent>\n </Dialog>\n );\n}\n"
}

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand project selector structure",
"status": "completed",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add '+ Add New Project' option at end of project list",
"status": "in_progress",
"activeForm": "Adding new project option"
},
{
"content": "Add trash icon with delete functionality",
"status": "in_progress",
"activeForm": "Adding trash icon for deletion"
},
{
"content": "Create confirmation modal with project name typing requirement",
"status": "completed",
"activeForm": "Creating confirmation modal"
},
{
"content": "Make project name selectable/copyable (not click-to-copy)",
"status": "completed",
"activeForm": "Making project name copyable"
}
]
}
Now let me update the top-nav-bar.tsx to add the "+ Add New Project" option and the trash icon:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": "import { useState, useCallback, useMemo } from 'react';\nimport { useNavigate, useLocation } from '@tanstack/react-router';\nimport { Folder, ChevronDown, Check, LucideIcon, Layers, ListTodo, Github, CircleDot, GitPullRequest, Wrench, Lightbulb, FileText, Brain, Bot, Terminal, Settings, Keyboard, Menu, X } from 'lucide-react';",
"new_string": "import { useState, useCallback, useMemo } from 'react';\nimport { useNavigate, useLocation } from '@tanstack/react-router';\nimport { Folder, ChevronDown, Check, LucideIcon, Layers, ListTodo, Github, CircleDot, GitPullRequest, Wrench, Lightbulb, FileText, Brain, Bot, Terminal, Settings, Keyboard, Menu, X, Plus, Trash2 } from 'lucide-react';"
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": "import { DeployButton } from './deploy-button';\nimport { RunningAgentsIndicator } from './running-agents-indicator';",
"new_string": "import { DeployButton } from './deploy-button';\nimport { RunningAgentsIndicator } from './running-agents-indicator';\nimport { DeleteProjectDialog } from '@/components/dialogs/delete-project-dialog';"
}
Now I need to add the state for the delete dialog and the handlers. Let me find the right place to add them:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"offset": 47,
"limit": 80
}
I need to add `moveProjectToTrash` and `removeProject` to the store destructuring and add state for the delete dialog:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": " const {\n projects,\n trashedProjects,\n currentProject,\n setCurrentProject,\n features,\n projectHistory,\n upsertAndSetCurrentProject,\n cyclePrevProject,\n cycleNextProject,\n theme: globalTheme,\n } = useAppStore();",
"new_string": " const {\n projects,\n trashedProjects,\n currentProject,\n setCurrentProject,\n features,\n projectHistory,\n upsertAndSetCurrentProject,\n cyclePrevProject,\n cycleNextProject,\n theme: globalTheme,\n moveProjectToTrash,\n removeProject,\n } = useAppStore();"
}

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": " // Project dropdown open state (for keyboard shortcut control)\n const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);",
"new_string": " // Project dropdown open state (for keyboard shortcut control)\n const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);\n\n // Delete project dialog state\n const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);\n const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);\n\n // Handle opening delete dialog for a project\n const handleOpenDeleteDialog = useCallback((project: Project, e: React.MouseEvent) => {\n e.stopPropagation(); // Prevent selecting the project when clicking trash\n setProjectToDelete(project);\n setDeleteProjectDialogOpen(true);\n setIsProjectDropdownOpen(false); // Close dropdown when opening delete dialog\n }, []);\n\n // Handle soft delete (move to trash)\n const handleSoftDelete = useCallback(() => {\n if (projectToDelete) {\n moveProjectToTrash(projectToDelete.id);\n toast.success('Project moved to trash', {\n description: `${projectToDelete.name} has been moved to trash`,\n });\n setDeleteProjectDialogOpen(false);\n setProjectToDelete(null);\n }\n }, [projectToDelete, moveProjectToTrash]);\n\n // Handle hard delete (permanent removal)\n const handleHardDelete = useCallback(() => {\n if (projectToDelete) {\n removeProject(projectToDelete.id);\n toast.success('Project deleted', {\n description: `${projectToDelete.name} has been permanently deleted`,\n });\n setDeleteProjectDialogOpen(false);\n setProjectToDelete(null);\n }\n }, [projectToDelete, removeProject]);"
}
Now I need to update the project dropdown to include the "+ Add New Project" option and the trash icon. Let me find the relevant section:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"offset": 420,
"limit": 100
}
Now I need to update the individual projects section to add the trash icon and add the "+ Add New Project" option:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": " {/_ Individual projects _/}\n {projects.map((project) => {\n const ProjectIcon = getIconComponent(project);\n const isActive = !showAllProjects && currentProject?.id === project.id;\n\n return (\n <DropdownMenuItem\n key={project.id}\n onClick={() => handleProjectSelect(project)}\n className={cn(\n 'flex items-center gap-3 cursor-pointer',\n isActive && 'bg-brand-500/10'\n )}\n data-testid={`project-option-${project.id}`}\n >\n {project.customIconPath ? (\n <img\n src={getAuthenticatedImageUrl(project.customIconPath, project.path)}\n alt={project.name}\n className=\"w-6 h-6 rounded object-cover ring-1 ring-border/50\"\n />\n ) : (\n <div\n className={cn(\n 'w-6 h-6 rounded flex items-center justify-center',\n isActive ? 'bg-brand-500/20' : 'bg-muted'\n )}\n >\n <ProjectIcon\n className={cn(\n 'w-4 h-4',\n isActive ? 'text-brand-500' : 'text-muted-foreground'\n )}\n />\n </div>\n )}\n <span className=\"flex-1 text-sm truncate\">{project.name}</span>\n {isActive && <Check className=\"w-4 h-4 text-brand-500\" />}\n </DropdownMenuItem>\n );\n })}\n\n {projects.length === 0 && (\n <div className=\"px-2 py-4 text-center text-sm text-muted-foreground\">\n No projects yet\n </div>\n )}\n </DropdownMenuContent>",
"new_string": " {/_ Individual projects _/}\n {projects.map((project) => {\n const ProjectIcon = getIconComponent(project);\n const isActive = !showAllProjects && currentProject?.id === project.id;\n\n return (\n <DropdownMenuItem\n key={project.id}\n onClick={() => handleProjectSelect(project)}\n className={cn(\n 'flex items-center gap-3 cursor-pointer group',\n isActive && 'bg-brand-500/10'\n )}\n data-testid={`project-option-${project.id}`}\n >\n {project.customIconPath ? (\n <img\n src={getAuthenticatedImageUrl(project.customIconPath, project.path)}\n alt={project.name}\n className=\"w-6 h-6 rounded object-cover ring-1 ring-border/50\"\n />\n ) : (\n <div\n className={cn(\n 'w-6 h-6 rounded flex items-center justify-center',\n isActive ? 'bg-brand-500/20' : 'bg-muted'\n )}\n >\n <ProjectIcon\n className={cn(\n 'w-4 h-4',\n isActive ? 'text-brand-500' : 'text-muted-foreground'\n )}\n />\n </div>\n )}\n <span className=\"flex-1 text-sm truncate\">{project.name}</span>\n {isActive && <Check className=\"w-4 h-4 text-brand-500\" />}\n {/_ Trash icon - always visible for quick delete _/}\n <button\n onClick={(e) => handleOpenDeleteDialog(project, e)}\n className={cn(\n 'p-1 rounded hover:bg-destructive/20 transition-colors',\n 'text-muted-foreground hover:text-destructive',\n 'opacity-0 group-hover:opacity-100 focus:opacity-100'\n )}\n title=\"Delete project\"\n data-testid={`delete-project-${project.id}`}\n >\n <Trash2 className=\"w-3.5 h-3.5\" />\n </button>\n </DropdownMenuItem>\n );\n })}\n\n {projects.length === 0 && (\n <div className=\"px-2 py-4 text-center text-sm text-muted-foreground\">\n No projects yet\n </div>\n )}\n\n {/_ Separator before Add New Project _/}\n <DropdownMenuSeparator />\n\n {/_ Add New Project option _/}\n <DropdownMenuItem\n onClick={handleOpenFolder}\n className=\"flex items-center gap-3 cursor-pointer text-brand-500 hover:text-brand-600\"\n data-testid=\"add-new-project-option\"\n >\n <div className=\"w-6 h-6 rounded flex items-center justify-center bg-brand-500/10 border border-brand-500/20 border-dashed\">\n <Plus className=\"w-4 h-4 text-brand-500\" />\n </div>\n <span className=\"flex-1 text-sm font-medium\">Add New Project</span>\n </DropdownMenuItem>\n </DropdownMenuContent>"
}
Now I need to add the DeleteProjectDialog component at the end of the component's return statement. Let me find the closing of the return:

🔧 Tool: Read
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"offset": 700,
"limit": 80
}
Now I need to add the DeleteProjectDialog before the closing `</header>` tag:

🔧 Tool: Edit
Input: {
"file_path": "C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\\src\\components\\layout\\top-nav-bar.tsx",
"old_string": " {/_ Mobile navigation menu - slides down on mobile when open _/}\n {mobileMenuOpen && (\n <MobileNavigationMenu\n location={location}\n onNavigate={(path) => {\n navigate({ to: path });\n setMobileMenuOpen(false);\n }}\n onClose={() => setMobileMenuOpen(false)}\n currentProject={currentProject}\n isOnBoardView={isOnBoardView}\n features={features}\n />\n )}\n </header>\n );\n}",
"new_string": " {/_ Mobile navigation menu - slides down on mobile when open _/}\n {mobileMenuOpen && (\n <MobileNavigationMenu\n location={location}\n onNavigate={(path) => {\n navigate({ to: path });\n setMobileMenuOpen(false);\n }}\n onClose={() => setMobileMenuOpen(false)}\n currentProject={currentProject}\n isOnBoardView={isOnBoardView}\n features={features}\n />\n )}\n\n {/_ Delete Project Confirmation Dialog _/}\n <DeleteProjectDialog\n project={projectToDelete}\n open={deleteProjectDialogOpen}\n onOpenChange={setDeleteProjectDialogOpen}\n onSoftDelete={handleSoftDelete}\n onHardDelete={handleHardDelete}\n />\n </header>\n );\n}"
}
Now let me update the todo list and verify the changes compile correctly:

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand project selector structure",
"status": "completed",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add '+ Add New Project' option at end of project list",
"status": "completed",
"activeForm": "Adding new project option"
},
{
"content": "Add trash icon with delete functionality",
"status": "completed",
"activeForm": "Adding trash icon for deletion"
},
{
"content": "Create confirmation modal with project name typing requirement",
"status": "completed",
"activeForm": "Creating confirmation modal"
},
{
"content": "Make project name selectable/copyable (not click-to-copy)",
"status": "completed",
"activeForm": "Making project name copyable"
},
{
"content": "Verify code compiles without errors",
"status": "in_progress",
"activeForm": "Verifying code compilation"
}
]
}

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\" && npm run build:packages 2>&1 | head -50",
"description": "Build packages to check for compile errors",
"timeout": 120000
}
Packages built successfully. Now let me run a TypeScript check on the UI to verify my changes:

🔧 Tool: Bash
Input: {
"command": "cd \"C:\\Users\\dylan\\Downloads\\dmaker-pr\\apps\\ui\" && npx tsc --noEmit 2>&1 | head -100",
"description": "Type check UI for errors",
"timeout": 120000
}
The TypeScript check passes without errors. Let me update the todo list:

🔧 Tool: TodoWrite
Input: {
"todos": [
{
"content": "Explore the codebase to understand project selector structure",
"status": "completed",
"activeForm": "Exploring codebase structure"
},
{
"content": "Add '+ Add New Project' option at end of project list",
"status": "completed",
"activeForm": "Adding new project option"
},
{
"content": "Add trash icon with delete functionality",
"status": "completed",
"activeForm": "Adding trash icon for deletion"
},
{
"content": "Create confirmation modal with project name typing requirement",
"status": "completed",
"activeForm": "Creating confirmation modal"
},
{
"content": "Make project name selectable/copyable (not click-to-copy)",
"status": "completed",
"activeForm": "Making project name copyable"
},
{
"content": "Verify code compiles without errors",
"status": "completed",
"activeForm": "Verifying code compilation"
}
]
}
All tasks are completed. Let me provide a summary of the changes:

<summary>
## Summary: Add New Project and Delete Project Features in Kanban View

### Changes Implemented

1. **Added "+ Add New Project" option** at the end of the project dropdown list with a dashed border icon and branded styling
2. **Added trash icon** next to each project in the dropdown for quick delete (appears on hover)
3. **Created confirmation modal** (`DeleteProjectDialog`) that:
   - Displays the project name in a selectable format (can highlight and Ctrl+C to copy)
   - Requires typing the exact project name to enable delete buttons
   - Offers two deletion options:
     - "Remove from Projects" (soft delete - moves to trash, can be restored)
     - "Delete Permanently" (hard delete - cannot be undone)
4. **Made project name copyable** by highlighting and pressing Ctrl+C (not click-to-copy as specified)

### Files Modified

- `apps/ui/src/components/layout/top-nav-bar.tsx`:
  - Added imports for `Plus`, `Trash2` icons and `DeleteProjectDialog`
  - Added `moveProjectToTrash` and `removeProject` from app store
  - Added state for delete dialog (`deleteProjectDialogOpen`, `projectToDelete`)
  - Added handlers: `handleOpenDeleteDialog`, `handleSoftDelete`, `handleHardDelete`
  - Added trash icon button to each project item (visible on hover)
  - Added "+ Add New Project" option with separator at end of project list
  - Added `DeleteProjectDialog` component to render

### Files Created

- `apps/ui/src/components/dialogs/delete-project-dialog.tsx`:
  - New confirmation dialog component with:
    - Selectable project name display area
    - Text input for project name confirmation
    - Soft delete button (move to trash)
    - Hard delete button (permanent deletion)
    - Cancel button

### Notes for Developer

- The trash icon appears on hover to keep the UI clean
- The confirmation input must match the project name exactly (case-sensitive)
- Both delete buttons are disabled until the name is correctly typed
- The dialog closes automatically after any delete action
- Toast notifications confirm the action taken
- The project name in the dialog can be selected with mouse and copied with Ctrl+C
</summary>

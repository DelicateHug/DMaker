import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/legacy-modes/mode/javascript';
import { python } from '@codemirror/legacy-modes/mode/python';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { css } from '@codemirror/legacy-modes/mode/css';
import { go } from '@codemirror/legacy-modes/mode/go';
import { rust } from '@codemirror/legacy-modes/mode/rust';
import { xml } from '@codemirror/lang-xml';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { getSyntaxTheme } from '@/config/syntax-themes';
import {
  dracula,
  monokai,
  nord as nordTheme,
  atomone,
  tokyoNight,
  githubDark,
  githubLight,
  solarizedDark,
  solarizedLight,
  gruvboxDark,
  gruvboxLight,
  noctisLilac,
  quietlight,
} from '@uiw/codemirror-themes-all';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import {
  X,
  Save,
  FileCode,
  FileText,
  File,
  RefreshCw,
  ExternalLink,
  Circle,
  Palette,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, type SyntaxTheme } from '@/store/app-store';

interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: string;
}

interface CodeEditorWindowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFilePath?: string;
  projectPath: string | null;
}

// Get language extension based on file extension
function getLanguageExtension(fileName: string): Extension | null {
  const ext = fileName.split('.').pop()?.toLowerCase();

  switch (ext) {
    // JavaScript/TypeScript
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'mjs':
    case 'cjs':
      return StreamLanguage.define(javascript);

    // Python
    case 'py':
    case 'pyw':
    case 'pyi':
      return StreamLanguage.define(python);

    // PowerShell / Shell
    case 'ps1':
    case 'psm1':
    case 'psd1':
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return StreamLanguage.define(shell);

    // Markdown - use JavaScript mode for basic highlighting
    case 'md':
    case 'mdx':
    case 'markdown':
      return null; // Plain text for markdown - rendering is handled elsewhere

    // YAML
    case 'yaml':
    case 'yml':
      return StreamLanguage.define(yaml);

    // JSON (use JavaScript mode)
    case 'json':
    case 'jsonc':
      return StreamLanguage.define(javascript);

    // CSS/SCSS/LESS
    case 'css':
    case 'scss':
    case 'less':
      return StreamLanguage.define(css);

    // SQL - use JavaScript mode for basic highlighting
    case 'sql':
      return StreamLanguage.define(javascript);

    // Go
    case 'go':
      return StreamLanguage.define(go);

    // Rust
    case 'rs':
      return StreamLanguage.define(rust);

    // C/C++/C#/Java - use JavaScript mode for basic highlighting
    case 'c':
    case 'h':
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
    case 'cs':
    case 'java':
      return StreamLanguage.define(javascript);

    // XML/HTML
    case 'xml':
    case 'html':
    case 'htm':
    case 'xhtml':
    case 'svg':
      return xml();

    // Config files
    case 'toml':
    case 'ini':
    case 'cfg':
    case 'conf':
      return StreamLanguage.define(javascript); // Basic highlighting

    default:
      return null;
  }
}

// Get language display name
function getLanguageName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();

  const languageNames: Record<string, string> = {
    js: 'JavaScript',
    jsx: 'JavaScript (JSX)',
    ts: 'TypeScript',
    tsx: 'TypeScript (TSX)',
    py: 'Python',
    ps1: 'PowerShell',
    sh: 'Shell',
    bash: 'Bash',
    md: 'Markdown',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    xml: 'XML',
    sql: 'SQL',
    go: 'Go',
    rs: 'Rust',
    c: 'C',
    cpp: 'C++',
    cs: 'C#',
    java: 'Java',
    toml: 'TOML',
  };

  return languageNames[ext || ''] || 'Plain Text';
}

// Get file icon based on extension
function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const codeExtensions = [
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'ps1',
    'sh',
    'bash',
    'json',
    'yaml',
    'yml',
    'toml',
    'xml',
    'html',
    'css',
    'scss',
    'less',
    'sql',
    'go',
    'rs',
    'java',
    'c',
    'cpp',
    'h',
    'hpp',
    'cs',
    'rb',
    'php',
    'swift',
    'kt',
    'vue',
    'svelte',
  ];
  const textExtensions = [
    'md',
    'txt',
    'log',
    'ini',
    'cfg',
    'conf',
    'env',
    'gitignore',
    'dockerignore',
    'editorconfig',
  ];

  if (codeExtensions.includes(ext || '')) {
    return FileCode;
  }
  if (textExtensions.includes(ext || '')) {
    return FileText;
  }
  return File;
}

// ---------------------------------------------------------------------------
// Syntax theme display names and categories for the dropdown selector
// ---------------------------------------------------------------------------

/** Display names for each syntax theme option */
const SYNTAX_THEME_DISPLAY_NAMES: Record<SyntaxTheme, string> = {
  auto: 'Auto (Match UI)',
  dracula: 'Dracula',
  monokai: 'Monokai',
  nord: 'Nord',
  onedark: 'One Dark',
  tokyonight: 'Tokyo Night',
  'github-dark': 'GitHub Dark',
  catppuccin: 'Catppuccin',
  'solarized-dark': 'Solarized Dark',
  'gruvbox-dark': 'Gruvbox Dark',
  synthwave: 'Synthwave',
  'github-light': 'GitHub Light',
  'solarized-light': 'Solarized Light',
  'gruvbox-light': 'Gruvbox Light',
  'nord-light': 'Nord Light',
  'one-light': 'One Light',
  'catppuccin-latte': 'Catppuccin Latte',
};

/** Dark syntax themes in display order */
const DARK_THEMES: SyntaxTheme[] = [
  'dracula',
  'monokai',
  'nord',
  'onedark',
  'tokyonight',
  'github-dark',
  'catppuccin',
  'solarized-dark',
  'gruvbox-dark',
  'synthwave',
];

/** Light syntax themes in display order */
const LIGHT_THEMES: SyntaxTheme[] = [
  'github-light',
  'solarized-light',
  'gruvbox-light',
  'nord-light',
  'one-light',
  'catppuccin-latte',
];

// Get the compact syntax theme - designed for multi-tab code editors with bordered gutters
// Used for 'auto' mode (CSS-variable based) and as the editor chrome base for all themes
const compactTheme = getSyntaxTheme('compact');

/**
 * Map SyntaxTheme setting to an actual CodeMirror theme Extension.
 * 'auto' returns null so the CSS-variable-based compactTheme is used instead.
 * Named themes return their full CodeMirror extension (syntax colors + editor chrome).
 */
function getCodeMirrorTheme(theme: SyntaxTheme): Extension | null {
  switch (theme) {
    case 'auto':
      return null; // Use compactTheme (CSS-variable based, adapts to UI)
    case 'dracula':
      return dracula;
    case 'monokai':
      return monokai;
    case 'nord':
      return nordTheme;
    case 'onedark':
      return atomone;
    case 'tokyonight':
      return tokyoNight;
    case 'github-dark':
      return githubDark;
    case 'catppuccin':
      return tokyoNight; // Closest available match
    case 'solarized-dark':
      return solarizedDark;
    case 'gruvbox-dark':
      return gruvboxDark;
    case 'synthwave':
      return dracula; // Closest available match
    case 'github-light':
      return githubLight;
    case 'solarized-light':
      return solarizedLight;
    case 'gruvbox-light':
      return gruvboxLight;
    case 'nord-light':
      return quietlight; // Closest available light match
    case 'one-light':
      return noctisLilac; // Closest available light match
    case 'catppuccin-latte':
      return noctisLilac; // Closest available light match
    default:
      return null;
  }
}

export function CodeEditorWindow({
  open,
  onOpenChange,
  initialFilePath,
  projectPath,
}: CodeEditorWindowProps) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pendingFileRef = useRef<string | null>(null);

  // Syntax theme from global app settings
  const syntaxTheme = useAppStore((state) => state.syntaxTheme);
  const setSyntaxTheme = useAppStore((state) => state.setSyntaxTheme);

  // Load a file into the editor
  const loadFile = useCallback(
    async (filePath: string) => {
      // Check if file is already open
      const existingIndex = openFiles.findIndex((f) => f.path === filePath);
      if (existingIndex !== -1) {
        setActiveFileIndex(existingIndex);
        return;
      }

      setIsLoading(true);
      try {
        const api = getElectronAPI();
        const result = await api.readFile(filePath);

        if (!result.success || result.content === undefined) {
          toast.error(`Failed to open file: ${result.error || 'Unknown error'}`);
          return;
        }

        const fileName = filePath.split(/[/\\]/).pop() || 'untitled';
        const newFile: OpenFile = {
          path: filePath,
          name: fileName,
          content: result.content,
          originalContent: result.content,
          isDirty: false,
          language: getLanguageName(fileName),
        };

        setOpenFiles((prev) => [...prev, newFile]);
        setActiveFileIndex(openFiles.length);
      } catch (error) {
        toast.error(
          `Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      } finally {
        setIsLoading(false);
      }
    },
    [openFiles]
  );

  // Handle initial file path
  useEffect(() => {
    if (open && initialFilePath && pendingFileRef.current !== initialFilePath) {
      pendingFileRef.current = initialFilePath;
      loadFile(initialFilePath);
    }
  }, [open, initialFilePath, loadFile]);

  // Reset pending file when dialog closes
  useEffect(() => {
    if (!open) {
      pendingFileRef.current = null;
    }
  }, [open]);

  // Save the current file
  const saveFile = useCallback(async () => {
    if (activeFileIndex < 0 || activeFileIndex >= openFiles.length) return;

    const file = openFiles[activeFileIndex];
    if (!file.isDirty) return;

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      const result = await api.writeFile(file.path, file.content);

      if (!result.success) {
        toast.error(`Failed to save file: ${result.error || 'Unknown error'}`);
        return;
      }

      setOpenFiles((prev) =>
        prev.map((f, i) =>
          i === activeFileIndex ? { ...f, originalContent: f.content, isDirty: false } : f
        )
      );
      toast.success('File saved');
    } catch (error) {
      toast.error(
        `Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsSaving(false);
    }
  }, [activeFileIndex, openFiles]);

  // Handle content change
  const handleContentChange = useCallback(
    (value: string) => {
      setOpenFiles((prev) =>
        prev.map((f, i) =>
          i === activeFileIndex ? { ...f, content: value, isDirty: value !== f.originalContent } : f
        )
      );
    },
    [activeFileIndex]
  );

  // Close a file
  const closeFile = useCallback(
    (index: number, e?: React.MouseEvent) => {
      e?.stopPropagation();

      const file = openFiles[index];
      if (file.isDirty) {
        if (!confirm(`Save changes to ${file.name}?`)) {
          // User chose not to save - close anyway
        } else {
          // Save then close
          saveFile().then(() => {
            setOpenFiles((prev) => prev.filter((_, i) => i !== index));
            if (activeFileIndex >= index && activeFileIndex > 0) {
              setActiveFileIndex(activeFileIndex - 1);
            }
          });
          return;
        }
      }

      setOpenFiles((prev) => prev.filter((_, i) => i !== index));
      if (activeFileIndex >= index && activeFileIndex > 0) {
        setActiveFileIndex(activeFileIndex - 1);
      }
    },
    [openFiles, activeFileIndex, saveFile]
  );

  // Open in external editor (VS Code)
  const openInExternalEditor = useCallback(async () => {
    if (activeFileIndex < 0 || activeFileIndex >= openFiles.length) return;

    const file = openFiles[activeFileIndex];
    const api = getElectronAPI();

    if (api.openInEditor) {
      const result = await api.openInEditor(file.path);
      if (!result.success) {
        toast.error(`Failed to open in editor: ${result.error}`);
      }
    }
  }, [activeFileIndex, openFiles]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }

      // Ctrl/Cmd + W to close current tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (openFiles.length > 0) {
          closeFile(activeFileIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, saveFile, closeFile, openFiles.length, activeFileIndex]);

  const activeFile = openFiles[activeFileIndex];
  const languageExtension = activeFile ? getLanguageExtension(activeFile.name) : null;

  // Resolve the active CodeMirror theme extension from the syntax theme setting
  const cmTheme = useMemo(() => getCodeMirrorTheme(syntaxTheme), [syntaxTheme]);

  // Build CodeMirror extensions
  // When a named theme is active, use the compact editor chrome (layout only) without the
  // CSS-variable highlight style, since the named theme provides its own syntax colors.
  // When 'auto', use the full compactTheme which includes CSS-variable-based highlighting.
  const extensions: Extension[] = useMemo(() => {
    const exts: Extension[] = [EditorView.lineWrapping];
    if (cmTheme) {
      // Named theme: use compact editor chrome for layout, named theme provides colors
      exts.push(compactTheme.editorTheme);
    } else {
      // Auto mode: use full compact theme (editor chrome + CSS-variable syntax colors)
      exts.push(...compactTheme.extensions);
    }
    if (languageExtension) {
      exts.push(languageExtension);
    }
    return exts;
  }, [languageExtension, cmTheme]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[90vw] w-[1200px] h-[80vh] p-0 gap-0 flex flex-col overflow-hidden"
        data-testid="code-editor-window"
      >
        <DialogHeader className="px-4 py-2 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-medium">Code Editor</DialogTitle>
            <div className="flex items-center gap-2">
              {activeFile && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={saveFile}
                    disabled={!activeFile.isDirty || isSaving}
                    className="h-7 px-2 text-xs"
                  >
                    {isSaving ? (
                      <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openInExternalEditor}
                    className="h-7 px-2 text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Open in VS Code
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Tab bar */}
        {openFiles.length > 0 && (
          <div className="flex-shrink-0 border-b border-border bg-muted/30 overflow-x-auto">
            <div className="flex">
              {openFiles.map((file, index) => {
                const Icon = getFileIcon(file.name);
                return (
                  <button
                    key={file.path}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-border',
                      'hover:bg-accent/50 transition-colors',
                      index === activeFileIndex ? 'bg-background' : 'bg-muted/50'
                    )}
                    onClick={() => setActiveFileIndex(index)}
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    {file.isDirty && <Circle className="h-2 w-2 fill-current text-orange-500" />}
                    <button
                      className="ml-1 p-0.5 rounded hover:bg-accent"
                      onClick={(e) => closeFile(index, e)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Editor content */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : openFiles.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <FileCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No files open</p>
                <p className="text-xs mt-1">Click a file in the explorer to open it</p>
              </div>
            </div>
          ) : activeFile ? (
            <CodeMirror
              value={activeFile.content}
              onChange={handleContentChange}
              extensions={extensions}
              theme={cmTheme ?? 'none'}
              height="100%"
              className="h-full [&_.cm-editor]:h-full"
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                autocompletion: false,
                bracketMatching: true,
                indentOnInput: true,
              }}
            />
          ) : null}
        </div>

        {/* Status bar */}
        {activeFile && (
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>{activeFile.language}</span>
              <span className="truncate max-w-[400px]">{activeFile.path}</span>
            </div>
            <div className="flex items-center gap-4">
              {activeFile.isDirty && <span className="text-orange-500">Modified</span>}
              <span>UTF-8</span>

              {/* Syntax theme selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                    <Palette className="h-3 w-3" />
                    <span>{SYNTAX_THEME_DISPLAY_NAMES[syntaxTheme]}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side="top"
                  className="max-h-[300px] overflow-y-auto"
                >
                  <DropdownMenuRadioGroup
                    value={syntaxTheme}
                    onValueChange={(value) => setSyntaxTheme(value as SyntaxTheme)}
                  >
                    <DropdownMenuLabel className="text-xs">Auto</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="auto" className="text-xs">
                      {SYNTAX_THEME_DISPLAY_NAMES['auto']}
                    </DropdownMenuRadioItem>

                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs">Dark Themes</DropdownMenuLabel>
                    {DARK_THEMES.map((theme) => (
                      <DropdownMenuRadioItem key={theme} value={theme} className="text-xs">
                        {SYNTAX_THEME_DISPLAY_NAMES[theme]}
                      </DropdownMenuRadioItem>
                    ))}

                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs">Light Themes</DropdownMenuLabel>
                    {LIGHT_THEMES.map((theme) => (
                      <DropdownMenuRadioItem key={theme} value={theme} className="text-xs">
                        {SYNTAX_THEME_DISPLAY_NAMES[theme]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Export a function to be used by other components to add files to the editor
export interface CodeEditorWindowRef {
  openFile: (filePath: string) => void;
}

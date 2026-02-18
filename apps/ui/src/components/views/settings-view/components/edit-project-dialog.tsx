import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Folder, Pencil, Upload, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconPicker } from '@/components/ui/icon-picker';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { LazyImage } from '@/components/ui/lazy-image';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import type { Project } from '@/lib/electron';
import { getProjectIcon } from '@/lib/icon-registry';

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSave: (
    projectId: string,
    updates: { name?: string; icon?: string | null; customIconPath?: string | null }
  ) => void;
}

export function EditProjectDialog({ open, onOpenChange, project, onSave }: EditProjectDialogProps) {
  const [projectName, setProjectName] = useState('');
  const [projectIcon, setProjectIcon] = useState<string | null>(null);
  const [customIconPath, setCustomIconPath] = useState<string | null>(null);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when project changes or dialog opens
  useEffect(() => {
    if (open && project) {
      setProjectName(project.name || '');
      setProjectIcon(project.icon || null);
      setCustomIconPath(project.customIconPath || null);
      setShowIconPicker(false);
    }
  }, [open, project]);

  const handleSave = () => {
    if (!project) return;

    const updates: { name?: string; icon?: string | null; customIconPath?: string | null } = {};

    if (projectName.trim() && projectName.trim() !== project.name) {
      updates.name = projectName.trim();
    }

    if (projectIcon !== (project.icon || null)) {
      updates.icon = projectIcon;
    }

    if (customIconPath !== (project.customIconPath || null)) {
      updates.customIconPath = customIconPath;
    }

    if (Object.keys(updates).length > 0) {
      onSave(project.id, updates);
      toast.success('Project updated', {
        description: `Updated ${updates.name || project.name}`,
      });
    }

    onOpenChange(false);
  };

  const handleCustomIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type', {
        description: 'Please upload a PNG, JPG, GIF, or WebP image.',
      });
      return;
    }

    // Validate file size (max 2MB for icons)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large', {
        description: 'Please upload an image smaller than 2MB.',
      });
      return;
    }

    setIsUploadingIcon(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const result = await getHttpApiClient().saveImageToTemp(
            base64Data,
            `project-icon-${file.name}`,
            file.type,
            project.path
          );
          if (result.success && result.path) {
            setCustomIconPath(result.path);
            // Clear Lucide icon when custom icon is set
            setProjectIcon(null);
            toast.success('Icon uploaded');
          } else {
            toast.error('Failed to upload icon', {
              description: result.error || 'Please try again.',
            });
          }
        } catch {
          toast.error('Failed to upload icon', {
            description: 'Network error. Please try again.',
          });
        } finally {
          setIsUploadingIcon(false);
        }
      };
      reader.onerror = () => {
        toast.error('Failed to read file', {
          description: 'Please try again with a different file.',
        });
        setIsUploadingIcon(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Failed to upload icon');
      setIsUploadingIcon(false);
    }
  };

  const handleRemoveCustomIcon = () => {
    setCustomIconPath(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectIcon = (icon: string | null) => {
    setProjectIcon(icon);
    // Clear custom icon when selecting a Lucide icon
    if (icon) {
      setCustomIconPath(null);
    }
    setShowIconPicker(false);
  };

  if (!project) return null;

  const IconComponent = getProjectIcon(projectIcon || project.icon);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="edit-project-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-brand-500" />
            Edit Project
          </DialogTitle>
          <DialogDescription>Update your project's name and icon.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-project-name">Project Name</Label>
            <Input
              id="edit-project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
              data-testid="edit-project-name-input"
            />
          </div>

          {/* Current Icon Display */}
          <div className="space-y-2">
            <Label>Project Icon</Label>
            <div className="flex items-center gap-3">
              {/* Icon Preview */}
              <div
                className={cn(
                  'w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden',
                  'bg-muted/50 border border-border'
                )}
              >
                {customIconPath ? (
                  <LazyImage
                    src={getAuthenticatedImageUrl(customIconPath, project.path)}
                    alt={projectName || 'Project icon'}
                    className="w-full h-full object-cover"
                    containerClassName="w-full h-full"
                    errorIconSize="w-4 h-4"
                  />
                ) : (
                  <IconComponent className="w-7 h-7 text-muted-foreground" />
                )}
              </div>

              {/* Icon Actions */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                  >
                    Choose Icon
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleCustomIconUpload}
                    className="hidden"
                    id="edit-custom-icon-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingIcon}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    {isUploadingIcon ? 'Uploading...' : 'Upload'}
                  </Button>

                  {(customIconPath || projectIcon) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setProjectIcon(null);
                        handleRemoveCustomIcon();
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Choose a preset icon or upload a custom image (PNG, JPG, GIF, WebP - max 2MB)
                </p>
              </div>
            </div>
          </div>

          {/* Icon Picker (collapsible) */}
          {showIconPicker && !customIconPath && (
            <div className="border border-border rounded-lg p-3">
              <IconPicker selectedIcon={projectIcon} onSelectIcon={handleSelectIcon} />
            </div>
          )}

          {/* Custom Icon Preview with Remove */}
          {customIconPath && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground flex-1 truncate">
                Custom icon uploaded
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveCustomIcon}
                className="text-muted-foreground hover:text-destructive h-7 px-2"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Remove
              </Button>
            </div>
          )}

          {/* Path Info (read-only) */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Project Path</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
              <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate" title={project.path}>
                {project.path}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="save-project-changes">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

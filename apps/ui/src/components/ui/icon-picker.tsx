import { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  searchIcons,
  getIcon,
  ICON_CATEGORIES,
  ICON_CATEGORY_LABELS,
  getIconsByCategory,
} from '@/lib/icon-registry';

interface IconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (icon: string | null) => void;
}

export function IconPicker({ selectedIcon, onSelectIcon }: IconPickerProps) {
  const [search, setSearch] = useState('');

  const filteredIcons = useMemo(() => searchIcons(search), [search]);

  /** Group filtered results by category for section rendering. */
  const groupedIcons = useMemo(() => {
    if (search) {
      // When searching, show flat results (no category headings)
      return null;
    }
    // When not searching, group by category
    return ICON_CATEGORIES.map((cat) => ({
      category: cat,
      label: ICON_CATEGORY_LABELS[cat],
      icons: getIconsByCategory(cat),
    })).filter((g) => g.icons.length > 0);
  }, [search]);

  const renderIconButton = (iconName: string) => {
    const IconComponent = getIcon(iconName);
    if (!IconComponent) return null;

    const isSelected = selectedIcon === iconName;

    return (
      <button
        key={iconName}
        onClick={() => onSelectIcon(iconName)}
        className={cn(
          'aspect-square rounded-md flex items-center justify-center',
          'transition-all duration-150',
          'hover:bg-accent hover:scale-110',
          isSelected ? 'bg-brand-500/20 border-2 border-brand-500' : 'border border-transparent'
        )}
        title={iconName}
      >
        <IconComponent
          className={cn('w-5 h-5', isSelected ? 'text-brand-500' : 'text-foreground')}
        />
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons..."
          className="pl-9"
        />
      </div>

      {/* Selected Icon Display */}
      {selectedIcon && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-accent/50 border border-border">
          <div className="flex items-center gap-2 flex-1">
            {(() => {
              const IconComponent = getIcon(selectedIcon);
              return IconComponent ? <IconComponent className="w-5 h-5 text-brand-500" /> : null;
            })()}
            <span className="text-sm font-medium">{selectedIcon}</span>
          </div>
          <button
            onClick={() => onSelectIcon(null)}
            className="p-1 hover:bg-background rounded transition-colors"
            title="Clear icon"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Icons Grid */}
      <ScrollArea className="h-96 rounded-md border">
        {groupedIcons ? (
          // Browsing mode: show icons grouped by category
          <div className="p-2 space-y-4">
            {groupedIcons.map(({ category, label, icons }) => (
              <div key={category}>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">{label}</h4>
                <div className="grid grid-cols-6 gap-1">
                  {icons.map((entry) => renderIconButton(entry.name))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Search mode: show flat results
          <div className="grid grid-cols-6 gap-1 p-2">
            {filteredIcons.map((entry) => renderIconButton(entry.name))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

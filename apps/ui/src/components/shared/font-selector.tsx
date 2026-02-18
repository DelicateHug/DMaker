import { useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import { loadFontByFamily } from '@/lib/font-loader';

interface FontOption {
  value: string;
  label: string;
}

interface FontSelectorProps {
  id: string;
  value: string;
  options: readonly FontOption[];
  placeholder: string;
  onChange: (value: string) => void;
}

/**
 * Reusable font selector component with live preview styling.
 *
 * When the user hovers over a font option in the dropdown, the font is
 * eagerly preloaded via the font-loader so that switching to it feels instant.
 */
export function FontSelector({ id, value, options, placeholder, onChange }: FontSelectorProps) {
  const handlePointerEnter = useCallback((fontFamily: string) => {
    if (fontFamily === DEFAULT_FONT_VALUE) return;
    // Fire-and-forget: preload the font CSS so it's ready when selected
    void loadFontByFamily(fontFamily);
  }, []);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            onPointerEnter={() => handlePointerEnter(option.value)}
          >
            <span
              style={{
                fontFamily: option.value === DEFAULT_FONT_VALUE ? undefined : option.value,
              }}
            >
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

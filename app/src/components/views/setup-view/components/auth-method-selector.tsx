import { ReactNode } from "react";

interface AuthMethodOption {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  badge: string;
  badgeColor: string; // e.g., "brand-500", "green-500"
}

interface AuthMethodSelectorProps {
  options: AuthMethodOption[];
  onSelect: (methodId: string) => void;
}

export function AuthMethodSelector({
  options,
  onSelect,
}: AuthMethodSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onSelect(option.id)}
          className={`p-4 rounded-lg border border-border hover:border-${option.badgeColor}/50 bg-card hover:bg-${option.badgeColor}/5 transition-all text-left`}
          data-testid={`select-${option.id}-auth`}
        >
          <div className="flex items-start gap-3">
            {option.icon}
            <div>
              <p className="font-medium text-foreground">{option.title}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {option.description}
              </p>
              <p className={`text-xs text-${option.badgeColor} mt-2`}>
                {option.badge}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

import { useEffect } from 'react';

interface UseSidebarAutoCollapseProps {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export function useSidebarAutoCollapse({
  sidebarOpen,
  toggleSidebar,
}: UseSidebarAutoCollapseProps) {
  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)'); // lg breakpoint

    const handleResize = () => {
      if (mediaQuery.matches && sidebarOpen) {
        // Auto-collapse on small screens
        toggleSidebar();
      }
    };

    // Check on mount
    handleResize();

    // Listen for changes
    mediaQuery.addEventListener('change', handleResize);
    return () => mediaQuery.removeEventListener('change', handleResize);
  }, [sidebarOpen, toggleSidebar]);
}

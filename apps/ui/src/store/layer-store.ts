import { create } from 'zustand';

export type LayerId =
  | 'settings'
  | 'terminal'
  | 'ideation'
  | 'spec'
  | 'memory'
  | 'github-issues'
  | 'github-prs'
  | 'project-settings'
  | 'interview';

export const LAYER_TITLES: Record<LayerId, string> = {
  settings: 'Settings',
  terminal: 'Terminal',
  ideation: 'Ideation',
  spec: 'Spec Editor',
  memory: 'Memory',
  'github-issues': 'GitHub Issues',
  'github-prs': 'GitHub Pull Requests',
  'project-settings': 'Project Settings',
  interview: 'Interview',
};

interface LayerState {
  /** Stack of open layers (last = topmost) */
  layers: LayerId[];

  /** Open a layer. If already open, brings it to top. */
  openLayer: (id: LayerId) => void;

  /** Close the topmost layer */
  closeLayer: () => void;

  /** Close a specific layer by id */
  closeLayerById: (id: LayerId) => void;

  /** Close all layers */
  closeAllLayers: () => void;

  /** Toggle a layer open/closed */
  toggleLayer: (id: LayerId) => void;

  /** Check if a specific layer is open */
  isLayerOpen: (id: LayerId) => boolean;

  /** Get the topmost layer id */
  topLayer: () => LayerId | null;
}

export const useLayerStore = create<LayerState>((set, get) => ({
  layers: [],

  openLayer: (id) =>
    set((state) => {
      // Remove if already in stack, then push to top
      const filtered = state.layers.filter((l) => l !== id);
      return { layers: [...filtered, id] };
    }),

  closeLayer: () =>
    set((state) => ({
      layers: state.layers.slice(0, -1),
    })),

  closeLayerById: (id) =>
    set((state) => ({
      layers: state.layers.filter((l) => l !== id),
    })),

  closeAllLayers: () => set({ layers: [] }),

  toggleLayer: (id) => {
    const state = get();
    if (state.layers.includes(id)) {
      set({ layers: state.layers.filter((l) => l !== id) });
    } else {
      set({ layers: [...state.layers.filter((l) => l !== id), id] });
    }
  },

  isLayerOpen: (id) => get().layers.includes(id),

  topLayer: () => {
    const { layers } = get();
    return layers.length > 0 ? layers[layers.length - 1]! : null;
  },
}));

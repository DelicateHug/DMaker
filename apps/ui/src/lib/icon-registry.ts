import type { LucideIcon } from 'lucide-react';
import {
  // files
  Folder,
  FolderOpen,
  FolderCode,
  FolderGit,
  FolderKanban,
  FolderTree,
  FolderInput,
  FolderOutput,
  FolderPlus,
  File,
  FileCode,
  FileText,
  FileJson,
  FileImage,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  Files,
  Archive,
  // code
  Code,
  Code2,
  Braces,
  Brackets,
  Terminal,
  TerminalSquare,
  Command,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  GitCompare,
  GitFork,
  Github,
  Gitlab,
  // packages
  Package,
  PackageSearch,
  PackageCheck,
  PackageX,
  Box,
  Boxes,
  Container,
  // ui
  Layout,
  LayoutGrid,
  LayoutList,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  Layers2,
  Layers3,
  Blocks,
  Component,
  Palette,
  Paintbrush,
  Brush,
  PenTool,
  Ruler,
  Grid3x3,
  Square,
  Circle,
  // tools
  Cog,
  Settings,
  Settings2,
  Wrench,
  Hammer,
  Sliders,
  SlidersHorizontal,
  Filter,
  FilterX,
  // tech
  Server,
  ServerCrash,
  ServerCog,
  Database,
  DatabaseBackup,
  CloudUpload,
  CloudDownload,
  CloudOff,
  Globe,
  Globe2,
  Network,
  Wifi,
  WifiOff,
  Router,
  Cpu,
  MemoryStick,
  HardDrive,
  CircuitBoard,
  Monitor,
  Laptop,
  Smartphone,
  Tablet,
  Mouse,
  Keyboard,
  Headphones,
  Printer,
  // workflow
  Workflow,
  Zap,
  Rocket,
  Flame,
  Target,
  Flag,
  FlagTriangleRight,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  HelpCircle,
  Clock,
  Timer,
  Calendar,
  CalendarDays,
  CalendarCheck,
  CalendarClock,
  // security
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Lock,
  Unlock,
  Key,
  KeyRound,
  Eye,
  EyeOff,
  User,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  UserCog,
  // business
  Briefcase,
  Building,
  Building2,
  Store,
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  Wallet,
  DollarSign,
  Coins,
  Receipt,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart,
  LineChart,
  PieChart,
  // communication
  MessageSquare,
  MessageCircle,
  Mail,
  MailOpen,
  Send,
  Inbox,
  Phone,
  PhoneCall,
  Video,
  VideoOff,
  Camera,
  CameraOff,
  Image,
  Film,
  Music,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Podcast,
  // social
  Heart,
  HeartHandshake,
  Star,
  StarOff,
  ThumbsUp,
  ThumbsDown,
  Share,
  Share2,
  Link,
  Link2,
  ExternalLink,
  AtSign,
  Hash,
  Tag,
  Tags,
  // navigation
  Compass,
  Map as MapIcon,
  MapPin,
  Navigation,
  Navigation2,
  Route,
  Plane,
  Car,
  Ship,
  Train,
  // science
  FlaskConical,
  FlaskRound,
  TestTube,
  TestTube2,
  Microscope,
  Atom,
  Brain,
  GraduationCap,
  Book,
  BookOpen,
  BookMarked,
  Library,
  // food
  Coffee,
  Utensils,
  UtensilsCrossed,
  Apple,
  Cherry,
  Cookie,
  Cake,
  Pizza,
  Beer,
  Wine,
  HeartPulse,
  Dumbbell,
  // nature
  Trees,
  TreePine,
  Leaf,
  Flower,
  Flower2,
  Sun,
  Moon,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Droplet,
  Wind,
  Snowflake,
  Umbrella,
  // objects
  Puzzle,
  Gamepad,
  Gamepad2,
  Gem,
  Crown,
  Trophy,
  Medal,
  Award,
  Gift,
  Bell,
  BellOff,
  BellRing,
  Home,
  Lightbulb,
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryCharging,
  Plug,
  PlugZap,
  Power,
  PowerOff,
  // arrows
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDownLeft,
  ArrowUpLeft,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Move,
  MoveUp,
  MoveDown,
  MoveLeft,
  MoveRight,
  RotateCw,
  RotateCcw,
  RefreshCw,
  RefreshCcw,
  // shapes
  Diamond,
  Pentagon,
  Plus,
  Minus,
  X,
  Check,
  Divide,
  Equal,
  Infinity,
  Percent,
  // misc
  Bot,
  Wand,
  Wand2,
  Stars,
  Sparkles,
  Satellite,
  SatelliteDish,
  Scan,
  ScanLine,
  QrCode,
  Search,
  SearchX,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Maximize2,
  Minimize2,
  Copy,
  CopyCheck,
  Clipboard,
  ClipboardCheck,
  ClipboardCopy,
  ClipboardList,
  ClipboardPaste,
  Scissors,
  Pen,
  Pencil,
  Eraser,
  Trash,
  Trash2,
  Download,
  Upload,
  Save,
  SaveAll,
  FilePlus,
  FileMinus,
  FileX,
  FileCheck,
  FileQuestion,
  FileWarning,
  FileSearch,
  FolderSearch,
  FolderX,
  FolderCheck,
  FolderMinus,
  FolderSync,
  FolderUp,
  FolderDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Category labels used to organise the curated icon set. */
export type IconCategory =
  | 'files'
  | 'code'
  | 'packages'
  | 'ui'
  | 'tools'
  | 'tech'
  | 'workflow'
  | 'security'
  | 'business'
  | 'communication'
  | 'social'
  | 'navigation'
  | 'science'
  | 'food'
  | 'nature'
  | 'objects'
  | 'arrows'
  | 'shapes'
  | 'misc';

/** Metadata stored for every icon in the registry. */
export interface IconEntry {
  /** PascalCase icon name as exported by lucide-react (e.g. "FolderOpen"). */
  name: string;
  /** The actual Lucide icon component. */
  component: LucideIcon;
  /** Category the icon belongs to. */
  category: IconCategory;
  /** Lowercase search keywords (auto-derived from name + category). */
  keywords: readonly string[];
}

/** Human-readable labels for every category. */
export const ICON_CATEGORY_LABELS: Readonly<Record<IconCategory, string>> = {
  files: 'Folders & Files',
  code: 'Code & Development',
  packages: 'Packages & Containers',
  ui: 'UI & Design',
  tools: 'Tools & Settings',
  tech: 'Technology & Infrastructure',
  workflow: 'Workflow & Process',
  security: 'Security & Access',
  business: 'Business & Finance',
  communication: 'Communication & Media',
  social: 'Social & Community',
  navigation: 'Navigation & Location',
  science: 'Science & Education',
  food: 'Food & Health',
  nature: 'Nature & Weather',
  objects: 'Objects & Symbols',
  arrows: 'Arrows & Directions',
  shapes: 'Shapes & Symbols',
  misc: 'Miscellaneous',
} as const;

// ---------------------------------------------------------------------------
// Curated icon map (name -> component, organized by category)
// ---------------------------------------------------------------------------

/**
 * The authoritative curated set of Lucide icons exposed throughout the app.
 * Each entry maps a PascalCase name to its imported component and category.
 * Using individual named imports ensures proper tree-shaking — only icons
 * listed here end up in the bundle.
 */
const CURATED_ICONS: ReadonlyArray<[string, LucideIcon, IconCategory]> = [
  // files
  ['Folder', Folder, 'files'],
  ['FolderOpen', FolderOpen, 'files'],
  ['FolderCode', FolderCode, 'files'],
  ['FolderGit', FolderGit, 'files'],
  ['FolderKanban', FolderKanban, 'files'],
  ['FolderTree', FolderTree, 'files'],
  ['FolderInput', FolderInput, 'files'],
  ['FolderOutput', FolderOutput, 'files'],
  ['FolderPlus', FolderPlus, 'files'],
  ['File', File, 'files'],
  ['FileCode', FileCode, 'files'],
  ['FileText', FileText, 'files'],
  ['FileJson', FileJson, 'files'],
  ['FileImage', FileImage, 'files'],
  ['FileVideo', FileVideo, 'files'],
  ['FileAudio', FileAudio, 'files'],
  ['FileSpreadsheet', FileSpreadsheet, 'files'],
  ['Files', Files, 'files'],
  ['Archive', Archive, 'files'],
  // code
  ['Code', Code, 'code'],
  ['Code2', Code2, 'code'],
  ['Braces', Braces, 'code'],
  ['Brackets', Brackets, 'code'],
  ['Terminal', Terminal, 'code'],
  ['TerminalSquare', TerminalSquare, 'code'],
  ['Command', Command, 'code'],
  ['GitBranch', GitBranch, 'code'],
  ['GitCommit', GitCommit, 'code'],
  ['GitMerge', GitMerge, 'code'],
  ['GitPullRequest', GitPullRequest, 'code'],
  ['GitCompare', GitCompare, 'code'],
  ['GitFork', GitFork, 'code'],
  ['Github', Github, 'code'],
  ['Gitlab', Gitlab, 'code'],
  // packages
  ['Package', Package, 'packages'],
  ['PackageSearch', PackageSearch, 'packages'],
  ['PackageCheck', PackageCheck, 'packages'],
  ['PackageX', PackageX, 'packages'],
  ['Box', Box, 'packages'],
  ['Boxes', Boxes, 'packages'],
  ['Container', Container, 'packages'],
  // ui
  ['Layout', Layout, 'ui'],
  ['LayoutGrid', LayoutGrid, 'ui'],
  ['LayoutList', LayoutList, 'ui'],
  ['LayoutDashboard', LayoutDashboard, 'ui'],
  ['LayoutTemplate', LayoutTemplate, 'ui'],
  ['Layers', Layers, 'ui'],
  ['Layers2', Layers2, 'ui'],
  ['Layers3', Layers3, 'ui'],
  ['Blocks', Blocks, 'ui'],
  ['Component', Component, 'ui'],
  ['Palette', Palette, 'ui'],
  ['Paintbrush', Paintbrush, 'ui'],
  ['Brush', Brush, 'ui'],
  ['PenTool', PenTool, 'ui'],
  ['Ruler', Ruler, 'ui'],
  ['Grid3x3', Grid3x3, 'ui'],
  ['Square', Square, 'ui'],
  ['Circle', Circle, 'ui'],
  // tools
  ['Cog', Cog, 'tools'],
  ['Settings', Settings, 'tools'],
  ['Settings2', Settings2, 'tools'],
  ['Wrench', Wrench, 'tools'],
  ['Hammer', Hammer, 'tools'],
  ['Sliders', Sliders, 'tools'],
  ['SlidersHorizontal', SlidersHorizontal, 'tools'],
  ['Filter', Filter, 'tools'],
  ['FilterX', FilterX, 'tools'],
  // tech
  ['Server', Server, 'tech'],
  ['ServerCrash', ServerCrash, 'tech'],
  ['ServerCog', ServerCog, 'tech'],
  ['Database', Database, 'tech'],
  ['DatabaseBackup', DatabaseBackup, 'tech'],
  ['CloudUpload', CloudUpload, 'tech'],
  ['CloudDownload', CloudDownload, 'tech'],
  ['CloudOff', CloudOff, 'tech'],
  ['Globe', Globe, 'tech'],
  ['Globe2', Globe2, 'tech'],
  ['Network', Network, 'tech'],
  ['Wifi', Wifi, 'tech'],
  ['WifiOff', WifiOff, 'tech'],
  ['Router', Router, 'tech'],
  ['Cpu', Cpu, 'tech'],
  ['MemoryStick', MemoryStick, 'tech'],
  ['HardDrive', HardDrive, 'tech'],
  ['CircuitBoard', CircuitBoard, 'tech'],
  ['Monitor', Monitor, 'tech'],
  ['Laptop', Laptop, 'tech'],
  ['Smartphone', Smartphone, 'tech'],
  ['Tablet', Tablet, 'tech'],
  ['Mouse', Mouse, 'tech'],
  ['Keyboard', Keyboard, 'tech'],
  ['Headphones', Headphones, 'tech'],
  ['Printer', Printer, 'tech'],
  // workflow
  ['Workflow', Workflow, 'workflow'],
  ['Zap', Zap, 'workflow'],
  ['Rocket', Rocket, 'workflow'],
  ['Flame', Flame, 'workflow'],
  ['Target', Target, 'workflow'],
  ['Flag', Flag, 'workflow'],
  ['FlagTriangleRight', FlagTriangleRight, 'workflow'],
  ['CheckCircle', CheckCircle, 'workflow'],
  ['CheckCircle2', CheckCircle2, 'workflow'],
  ['XCircle', XCircle, 'workflow'],
  ['AlertCircle', AlertCircle, 'workflow'],
  ['Info', Info, 'workflow'],
  ['HelpCircle', HelpCircle, 'workflow'],
  ['Clock', Clock, 'workflow'],
  ['Timer', Timer, 'workflow'],
  ['Calendar', Calendar, 'workflow'],
  ['CalendarDays', CalendarDays, 'workflow'],
  ['CalendarCheck', CalendarCheck, 'workflow'],
  ['CalendarClock', CalendarClock, 'workflow'],
  // security
  ['Shield', Shield, 'security'],
  ['ShieldCheck', ShieldCheck, 'security'],
  ['ShieldAlert', ShieldAlert, 'security'],
  ['ShieldOff', ShieldOff, 'security'],
  ['Lock', Lock, 'security'],
  ['Unlock', Unlock, 'security'],
  ['Key', Key, 'security'],
  ['KeyRound', KeyRound, 'security'],
  ['Eye', Eye, 'security'],
  ['EyeOff', EyeOff, 'security'],
  ['User', User, 'security'],
  ['Users', Users, 'security'],
  ['UserCheck', UserCheck, 'security'],
  ['UserX', UserX, 'security'],
  ['UserPlus', UserPlus, 'security'],
  ['UserCog', UserCog, 'security'],
  // business
  ['Briefcase', Briefcase, 'business'],
  ['Building', Building, 'business'],
  ['Building2', Building2, 'business'],
  ['Store', Store, 'business'],
  ['ShoppingCart', ShoppingCart, 'business'],
  ['ShoppingBag', ShoppingBag, 'business'],
  ['CreditCard', CreditCard, 'business'],
  ['Wallet', Wallet, 'business'],
  ['DollarSign', DollarSign, 'business'],
  ['Coins', Coins, 'business'],
  ['Receipt', Receipt, 'business'],
  ['TrendingUp', TrendingUp, 'business'],
  ['TrendingDown', TrendingDown, 'business'],
  ['Activity', Activity, 'business'],
  ['BarChart', BarChart, 'business'],
  ['LineChart', LineChart, 'business'],
  ['PieChart', PieChart, 'business'],
  // communication
  ['MessageSquare', MessageSquare, 'communication'],
  ['MessageCircle', MessageCircle, 'communication'],
  ['Mail', Mail, 'communication'],
  ['MailOpen', MailOpen, 'communication'],
  ['Send', Send, 'communication'],
  ['Inbox', Inbox, 'communication'],
  ['Phone', Phone, 'communication'],
  ['PhoneCall', PhoneCall, 'communication'],
  ['Video', Video, 'communication'],
  ['VideoOff', VideoOff, 'communication'],
  ['Camera', Camera, 'communication'],
  ['CameraOff', CameraOff, 'communication'],
  ['Image', Image, 'communication'],
  ['Film', Film, 'communication'],
  ['Music', Music, 'communication'],
  ['Mic', Mic, 'communication'],
  ['MicOff', MicOff, 'communication'],
  ['Volume2', Volume2, 'communication'],
  ['VolumeX', VolumeX, 'communication'],
  ['Radio', Radio, 'communication'],
  ['Podcast', Podcast, 'communication'],
  // social
  ['Heart', Heart, 'social'],
  ['HeartHandshake', HeartHandshake, 'social'],
  ['Star', Star, 'social'],
  ['StarOff', StarOff, 'social'],
  ['ThumbsUp', ThumbsUp, 'social'],
  ['ThumbsDown', ThumbsDown, 'social'],
  ['Share', Share, 'social'],
  ['Share2', Share2, 'social'],
  ['Link', Link, 'social'],
  ['Link2', Link2, 'social'],
  ['ExternalLink', ExternalLink, 'social'],
  ['AtSign', AtSign, 'social'],
  ['Hash', Hash, 'social'],
  ['Tag', Tag, 'social'],
  ['Tags', Tags, 'social'],
  // navigation
  ['Compass', Compass, 'navigation'],
  ['Map', MapIcon, 'navigation'],
  ['MapPin', MapPin, 'navigation'],
  ['Navigation', Navigation, 'navigation'],
  ['Navigation2', Navigation2, 'navigation'],
  ['Route', Route, 'navigation'],
  ['Plane', Plane, 'navigation'],
  ['Car', Car, 'navigation'],
  ['Ship', Ship, 'navigation'],
  ['Train', Train, 'navigation'],
  // science
  ['FlaskConical', FlaskConical, 'science'],
  ['FlaskRound', FlaskRound, 'science'],
  ['TestTube', TestTube, 'science'],
  ['TestTube2', TestTube2, 'science'],
  ['Microscope', Microscope, 'science'],
  ['Atom', Atom, 'science'],
  ['Brain', Brain, 'science'],
  ['GraduationCap', GraduationCap, 'science'],
  ['Book', Book, 'science'],
  ['BookOpen', BookOpen, 'science'],
  ['BookMarked', BookMarked, 'science'],
  ['Library', Library, 'science'],
  // food
  ['Coffee', Coffee, 'food'],
  ['Utensils', Utensils, 'food'],
  ['UtensilsCrossed', UtensilsCrossed, 'food'],
  ['Apple', Apple, 'food'],
  ['Cherry', Cherry, 'food'],
  ['Cookie', Cookie, 'food'],
  ['Cake', Cake, 'food'],
  ['Pizza', Pizza, 'food'],
  ['Beer', Beer, 'food'],
  ['Wine', Wine, 'food'],
  ['HeartPulse', HeartPulse, 'food'],
  ['Dumbbell', Dumbbell, 'food'],
  // nature
  ['Trees', Trees, 'nature'],
  ['TreePine', TreePine, 'nature'],
  ['Leaf', Leaf, 'nature'],
  ['Flower', Flower, 'nature'],
  ['Flower2', Flower2, 'nature'],
  ['Sun', Sun, 'nature'],
  ['Moon', Moon, 'nature'],
  ['CloudRain', CloudRain, 'nature'],
  ['CloudSnow', CloudSnow, 'nature'],
  ['CloudLightning', CloudLightning, 'nature'],
  ['Droplet', Droplet, 'nature'],
  ['Wind', Wind, 'nature'],
  ['Snowflake', Snowflake, 'nature'],
  ['Umbrella', Umbrella, 'nature'],
  // objects
  ['Puzzle', Puzzle, 'objects'],
  ['Gamepad', Gamepad, 'objects'],
  ['Gamepad2', Gamepad2, 'objects'],
  ['Gem', Gem, 'objects'],
  ['Crown', Crown, 'objects'],
  ['Trophy', Trophy, 'objects'],
  ['Medal', Medal, 'objects'],
  ['Award', Award, 'objects'],
  ['Gift', Gift, 'objects'],
  ['Bell', Bell, 'objects'],
  ['BellOff', BellOff, 'objects'],
  ['BellRing', BellRing, 'objects'],
  ['Home', Home, 'objects'],
  ['Lightbulb', Lightbulb, 'objects'],
  ['Battery', Battery, 'objects'],
  ['BatteryFull', BatteryFull, 'objects'],
  ['BatteryLow', BatteryLow, 'objects'],
  ['BatteryCharging', BatteryCharging, 'objects'],
  ['Plug', Plug, 'objects'],
  ['PlugZap', PlugZap, 'objects'],
  ['Power', Power, 'objects'],
  ['PowerOff', PowerOff, 'objects'],
  // arrows
  ['ArrowRight', ArrowRight, 'arrows'],
  ['ArrowLeft', ArrowLeft, 'arrows'],
  ['ArrowUp', ArrowUp, 'arrows'],
  ['ArrowDown', ArrowDown, 'arrows'],
  ['ArrowUpRight', ArrowUpRight, 'arrows'],
  ['ArrowDownRight', ArrowDownRight, 'arrows'],
  ['ArrowDownLeft', ArrowDownLeft, 'arrows'],
  ['ArrowUpLeft', ArrowUpLeft, 'arrows'],
  ['ChevronRight', ChevronRight, 'arrows'],
  ['ChevronLeft', ChevronLeft, 'arrows'],
  ['ChevronUp', ChevronUp, 'arrows'],
  ['ChevronDown', ChevronDown, 'arrows'],
  ['Move', Move, 'arrows'],
  ['MoveUp', MoveUp, 'arrows'],
  ['MoveDown', MoveDown, 'arrows'],
  ['MoveLeft', MoveLeft, 'arrows'],
  ['MoveRight', MoveRight, 'arrows'],
  ['RotateCw', RotateCw, 'arrows'],
  ['RotateCcw', RotateCcw, 'arrows'],
  ['RefreshCw', RefreshCw, 'arrows'],
  ['RefreshCcw', RefreshCcw, 'arrows'],
  // shapes
  ['Diamond', Diamond, 'shapes'],
  ['Pentagon', Pentagon, 'shapes'],
  ['Plus', Plus, 'shapes'],
  ['Minus', Minus, 'shapes'],
  ['X', X, 'shapes'],
  ['Check', Check, 'shapes'],
  ['Divide', Divide, 'shapes'],
  ['Equal', Equal, 'shapes'],
  ['Infinity', Infinity, 'shapes'],
  ['Percent', Percent, 'shapes'],
  // misc
  ['Bot', Bot, 'misc'],
  ['Wand', Wand, 'misc'],
  ['Wand2', Wand2, 'misc'],
  ['Stars', Stars, 'misc'],
  ['Sparkles', Sparkles, 'misc'],
  ['Satellite', Satellite, 'misc'],
  ['SatelliteDish', SatelliteDish, 'misc'],
  ['Scan', Scan, 'misc'],
  ['ScanLine', ScanLine, 'misc'],
  ['QrCode', QrCode, 'misc'],
  ['Search', Search, 'misc'],
  ['SearchX', SearchX, 'misc'],
  ['ZoomIn', ZoomIn, 'misc'],
  ['ZoomOut', ZoomOut, 'misc'],
  ['Maximize', Maximize, 'misc'],
  ['Minimize', Minimize, 'misc'],
  ['Maximize2', Maximize2, 'misc'],
  ['Minimize2', Minimize2, 'misc'],
  ['Copy', Copy, 'misc'],
  ['CopyCheck', CopyCheck, 'misc'],
  ['Clipboard', Clipboard, 'misc'],
  ['ClipboardCheck', ClipboardCheck, 'misc'],
  ['ClipboardCopy', ClipboardCopy, 'misc'],
  ['ClipboardList', ClipboardList, 'misc'],
  ['ClipboardPaste', ClipboardPaste, 'misc'],
  ['Scissors', Scissors, 'misc'],
  ['Pen', Pen, 'misc'],
  ['Pencil', Pencil, 'misc'],
  ['Eraser', Eraser, 'misc'],
  ['Trash', Trash, 'misc'],
  ['Trash2', Trash2, 'misc'],
  ['Download', Download, 'misc'],
  ['Upload', Upload, 'misc'],
  ['Save', Save, 'misc'],
  ['SaveAll', SaveAll, 'misc'],
  ['FilePlus', FilePlus, 'misc'],
  ['FileMinus', FileMinus, 'misc'],
  ['FileX', FileX, 'misc'],
  ['FileCheck', FileCheck, 'misc'],
  ['FileQuestion', FileQuestion, 'misc'],
  ['FileWarning', FileWarning, 'misc'],
  ['FileSearch', FileSearch, 'misc'],
  ['FolderSearch', FolderSearch, 'misc'],
  ['FolderX', FolderX, 'misc'],
  ['FolderCheck', FolderCheck, 'misc'],
  ['FolderMinus', FolderMinus, 'misc'],
  ['FolderSync', FolderSync, 'misc'],
  ['FolderUp', FolderUp, 'misc'],
  ['FolderDown', FolderDown, 'misc'],
];

// ---------------------------------------------------------------------------
// Helpers – keyword generation
// ---------------------------------------------------------------------------

/**
 * Turn a PascalCase name like "GitPullRequest" into lowercase tokens
 * `["git", "pull", "request"]` so users can search intuitively.
 */
function nameToKeywords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/);
}

// ---------------------------------------------------------------------------
// Build the registry at module-load time (runs once)
// ---------------------------------------------------------------------------

function buildRegistry(): {
  entries: readonly IconEntry[];
  byName: ReadonlyMap<string, IconEntry>;
  byCategory: ReadonlyMap<IconCategory, readonly IconEntry[]>;
  allNames: readonly string[];
} {
  const entries: IconEntry[] = [];
  const byName = new Map<string, IconEntry>();
  const byCategoryMap = new Map<IconCategory, IconEntry[]>();

  for (const [name, component, category] of CURATED_ICONS) {
    const keywords = [...new Set([...nameToKeywords(name), category])];
    const entry: IconEntry = { name, component, category, keywords };

    entries.push(entry);
    byName.set(name, entry);

    let categoryEntries = byCategoryMap.get(category);
    if (!categoryEntries) {
      categoryEntries = [];
      byCategoryMap.set(category, categoryEntries);
    }
    categoryEntries.push(entry);
  }

  return {
    entries: Object.freeze(entries),
    byName,
    byCategory: byCategoryMap,
    allNames: Object.freeze(entries.map((e) => e.name)),
  };
}

const registry = buildRegistry();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Flat, ordered list of all curated icon entries.
 */
export const ICON_REGISTRY: readonly IconEntry[] = registry.entries;

/**
 * Flat array of all curated icon names (PascalCase strings).
 *
 * Drop-in replacement for the `POPULAR_ICONS` array previously hard-coded in
 * `icon-picker.tsx`.
 */
export const ICON_NAMES: readonly string[] = registry.allNames;

/**
 * Ordered list of every {@link IconCategory} that has at least one valid icon.
 */
export const ICON_CATEGORIES: readonly IconCategory[] = Object.freeze([
  ...registry.byCategory.keys(),
]);

// ---------------------------------------------------------------------------
// Lookup utilities
// ---------------------------------------------------------------------------

/**
 * Resolve a PascalCase icon name to its Lucide React component.
 *
 * Returns `undefined` when the name is not part of the curated set.
 */
export function getIcon(name: string): LucideIcon | undefined {
  return registry.byName.get(name)?.component;
}

/**
 * Resolve an icon name to its component, falling back to a default icon
 * when the name is not found.
 */
export function getIconOrDefault(name: string | null | undefined, fallback: string): LucideIcon {
  if (name) {
    const icon = getIcon(name);
    if (icon) return icon;
  }
  const fb = getIcon(fallback);
  if (fb) return fb;
  // Ultimate fallback
  return Folder;
}

/**
 * Resolve a project's Lucide icon name to its component.
 *
 * Convenience wrapper around {@link getIconOrDefault} with a `Folder` fallback.
 * Replaces the duplicated `getIconComponent` / `getProjectIconComponent`
 * helpers previously inlined across many view components.
 */
export function getProjectIcon(iconName?: string | null): LucideIcon {
  return getIconOrDefault(iconName, 'Folder');
}

/**
 * Look up the {@link IconEntry} metadata for a given icon name.
 */
export function getIconEntry(name: string): IconEntry | undefined {
  return registry.byName.get(name);
}

/**
 * Return all icons belonging to a specific category.
 */
export function getIconsByCategory(category: IconCategory): readonly IconEntry[] {
  return registry.byCategory.get(category) ?? [];
}

/**
 * Search the curated icon set by a free-text query.
 *
 * Matches against the icon name and its auto-generated keywords. The search
 * is case-insensitive and supports partial matches.
 */
export function searchIcons(query: string): readonly IconEntry[] {
  if (!query) return registry.entries;

  const q = query.toLowerCase().trim();
  if (!q) return registry.entries;

  return registry.entries.filter(
    (entry) => entry.name.toLowerCase().includes(q) || entry.keywords.some((kw) => kw.includes(q))
  );
}

/**
 * Check whether a given icon name exists in the curated registry.
 */
export function isRegisteredIcon(name: string): boolean {
  return registry.byName.has(name);
}

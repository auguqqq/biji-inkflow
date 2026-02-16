
export enum ViewMode {
  Editor = 'editor',
  Statistics = 'statistics',
  Outline = 'outline',
  Inspiration = 'inspiration',
  Search = 'search',
  Bookshelf = 'bookshelf',
  History = 'history',
  Settings = 'settings',
  Ambience = 'ambience'
}

export interface AIConfig {
  provider: 'gemini' | 'deepseek' | 'openai' | 'custom' | 'deepseek-trial';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AppSettings {
  fontSize: number;
  lineHeight: number;
  theme: 'cream' | 'white' | 'dark' | 'green' | 'system';
  fontFamily: 'serif' | 'sans';
  autoSaveInterval: number; // seconds
  autoFormatOnSave: boolean;
  ai: AIConfig;
  isPro: boolean; // Membership status
  proTrialStartedAt?: number; // Timestamp for 15-min trial start
}

export interface ChapterVersion {
  id: string;
  timestamp: number;
  content: string;
  title: string;
  wordCount: number;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  synopsis?: string; // 章节梗概/大纲
  lastModified: number;
  versions?: ChapterVersion[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SearchState {
  query: string;
  resultHTML: string; // Stored as formatted HTML string
  sources: any[];
  isSearching: boolean;
  timestamp: number;
}

export interface Book {
  id: string;
  type: 'novel' | 'anthology'; // New field: Novel (Long-form) vs Anthology (Short stories)
  title: string;
  coverColor: string;
  coverImage?: string; // Base64 or URL
  chapters: Chapter[];
  currentChapterId: string;
  isFinished?: boolean;
  createdAt: number;
  totalWritingTime?: number; 
  
  // New Persistence Fields
  aiChatLogs?: ChatMessage[]; // Max 80 items
  searchState?: SearchState; // Persist search result per book
  bookSummary?: string; // 100-300 words summary
  
  // Persist Deep Analysis
  analysisReport?: {
    text: string; // Markdown content
    data?: any; // JSON data for charts
    timestamp: number;
  };
}

export interface WritingStats {
  dailyCount: number;
  weeklyCount: number[]; 
  speed: number; 
  startTime: number;
  writingHistory: Record<string, number>; 
}

export interface Inspiration {
  id: string;
  text: string;
  timestamp: number;
}

export interface BlackHouseConfig {
  active: boolean;
  type: 'word' | 'time';
  target: number;
  currentProgress: number; 
  lastTotalCount: number; 
  startTime?: number;
}

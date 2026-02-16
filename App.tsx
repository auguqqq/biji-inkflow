
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  BookOpen, 
  BarChart2, 
  Lightbulb, 
  Search, 
  Layout, 
  Lock, 
  Unlock, 
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Type,
  Library,
  Save,
  History as HistoryIcon,
  Download,
  Upload,
  Sun,
  Moon,
  CheckCircle2,
  Sparkles,
  FileOutput,
  Feather,
  PenTool,
  Headphones,
  Crown,
  Menu,
  X
} from 'lucide-react';
import Editor from './components/Editor';
import Bookshelf from './components/Bookshelf';
import Statistics from './components/Statistics';
import Outline from './components/Outline';
import InspirationView from './components/InspirationView';
import SearchView from './components/SearchView';
import BlackHouseOverlay from './components/BlackHouseOverlay';
import VersionHistory from './components/VersionHistory';
import SettingsView from './components/SettingsView';
import AmbienceView from './components/AmbienceView';
import PaymentModal from './components/PaymentModal';
import OnboardingTour from './components/OnboardingTour';
import { ViewMode, WritingStats, Book, Chapter, Inspiration, BlackHouseConfig, ChapterVersion, AppSettings, ChatMessage, SearchState } from './types';

const STORAGE_KEY = 'inkflow_studio_v7';

const countActualChars = (text: string): number => {
  if (!text) return 0;
  const matches = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]/g);
  return matches ? matches.length : 0;
};

const getTodayKey = () => new Date().toISOString().split('T')[0];

const NavButton = ({ 
  icon: Icon, 
  label, 
  isActive, 
  onClick, 
  disabled = false,
  isDanger = false,
  isPro = false,
  compact = false,
  id
}: { icon: any, label: string, isActive?: boolean, onClick: () => void, disabled?: boolean, isDanger?: boolean, isPro?: boolean, compact?: boolean, id?: string }) => (
  <button
    id={id}
    onClick={onClick}
    disabled={disabled}
    className={`
      relative group flex items-center justify-center rounded-2xl transition-all duration-300 ease-out
      ${compact ? 'w-10 h-10' : 'w-12 h-12'}
      ${disabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer hover:scale-105 active:scale-95'}
      ${isActive 
        ? (isDanger 
            ? 'bg-red-500/10 text-red-400 shadow-[0_0_20px_rgba(248,113,113,0.1)] ring-1 ring-red-500/20' 
            : 'bg-[#2c2c2e] text-amber-400 shadow-[0_4px_12px_rgba(0,0,0,0.2)] ring-1 ring-white/5')
        : 'text-[#8e8e93] hover:text-white hover:bg-[#2c2c2e]'
      }
    `}
  >
    <Icon size={compact ? 20 : 22} strokeWidth={isActive ? 2.5 : 2} className="transition-transform duration-300" />
    
    {isPro && (
      <div className="absolute top-0 right-0 -mr-1 -mt-1 bg-amber-500 text-white rounded-full p-0.5 border border-[#1c1c1e]">
        <Crown size={8} fill="currentColor" />
      </div>
    )}

    {/* Minimalist Tooltip (Desktop Only) */}
    <span className="hidden md:block absolute left-16 bg-[#2c2c2e] text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-white/5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-[-8px] group-hover:translate-x-0 pointer-events-none z-50 whitespace-nowrap shadow-xl">
      {label}
    </span>
    
    {isActive && !isDanger && (
      <span className="absolute inset-0 rounded-2xl bg-amber-500/5 pointer-events-none" />
    )}
  </button>
);

const App: React.FC = () => {
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_settings`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.ai) {
        parsed.ai = {
          provider: 'gemini',
          apiKey: '',
          baseUrl: '',
          model: 'gemini-2.0-flash'
        };
      }
      return { ...parsed, isPro: parsed.isPro || false, proTrialStartedAt: parsed.proTrialStartedAt };
    }
    return {
      fontSize: 20,
      lineHeight: 1.8,
      theme: 'cream',
      fontFamily: 'serif',
      autoSaveInterval: 10,
      autoFormatOnSave: false,
      ai: {
        provider: 'gemini',
        apiKey: '',
        baseUrl: '',
        model: 'gemini-2.0-flash'
      },
      isPro: false
    };
  });

  const [books, setBooks] = useState<Book[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_books`);
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'default-book',
        type: 'novel',
        title: '我的第一部小说',
        coverColor: 'bg-amber-700',
        currentChapterId: 'chapter-1',
        chapters: [
          { id: 'chapter-1', title: '第 1 章', content: '', synopsis: '在这里输入本章梗概...', lastModified: Date.now(), versions: [] }
        ],
        isFinished: false,
        createdAt: Date.now(),
        aiChatLogs: [],
        searchState: { query: '', resultHTML: '', sources: [], isSearching: false, timestamp: 0 },
        bookSummary: ''
      }
    ];
  });

  const [currentBookId, setCurrentBookId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_currentBookId`) || 'default-book';
  });

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Editor);
  const [rightSidebarMode, setRightSidebarMode] = useState<ViewMode>(ViewMode.Outline);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lastSaved, setLastSaved] = useState<number>(Date.now());
  const [isSettingUpBlackHouse, setIsSettingUpBlackHouse] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [trialStatus, setTrialStatus] = useState<'available' | 'active' | 'expired'>('available');
  
  const [inspirations, setInspirations] = useState<Inspiration[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_inspirations`);
    return saved ? JSON.parse(saved) : [];
  });

  const [blackHouse, setBlackHouse] = useState<BlackHouseConfig>({
    active: false,
    type: 'word',
    target: 1000,
    currentProgress: 0,
    lastTotalCount: 0
  });
  
  const [stats, setStats] = useState<WritingStats>(() => {
    const defaultStats = {
      dailyCount: 0,
      weeklyCount: [0, 0, 0, 0, 0, 0, 0],
      speed: 0,
      startTime: Date.now(),
      writingHistory: {}
    };
    const saved = localStorage.getItem(`${STORAGE_KEY}_stats`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...defaultStats, ...parsed, writingHistory: parsed.writingHistory || {} };
      } catch (e) {
        return defaultStats;
      }
    }
    return defaultStats;
  });

  // Calculate Trial Status
  useEffect(() => {
    if (appSettings.isPro) {
        setTrialStatus('active'); // Treated as active for UI purposes
        return;
    }
    if (!appSettings.proTrialStartedAt) {
        setTrialStatus('available');
    } else {
        const elapsed = Date.now() - appSettings.proTrialStartedAt;
        const limit = 15 * 60 * 1000; // 15 minutes
        if (elapsed < limit) {
            setTrialStatus('active');
        } else {
            setTrialStatus('expired');
        }
    }
  }, [appSettings.isPro, appSettings.proTrialStartedAt]);

  // Initial Sidebar State for Mobile
  useEffect(() => {
    // Start with closed sidebar on mobile
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleProAction = (callback: () => void) => {
    if (appSettings.isPro) {
        callback();
        return;
    }

    // Check trial
    if (trialStatus === 'active') {
        // Double check time validity
        const elapsed = Date.now() - (appSettings.proTrialStartedAt || 0);
        if (elapsed < 15 * 60 * 1000) {
            callback();
            return;
        } else {
            setTrialStatus('expired');
            setShowPaymentModal(true);
        }
    } else {
        // Either available (needs start) or expired
        setShowPaymentModal(true);
    }
  };

  const startTrial = () => {
    setAppSettings(prev => ({ ...prev, proTrialStartedAt: Date.now() }));
    setShowPaymentModal(false);
    setRightSidebarMode(ViewMode.Ambience); // Auto direct to a pro feature
    setSidebarOpen(true);
  };

  const currentBook = useMemo(() => books.find(b => b.id === currentBookId) || books[0], [books, currentBookId]);
  const currentChapter = useMemo(() => 
    currentBook.chapters.find(c => c.id === currentBook.currentChapterId) || currentBook.chapters[0]
  , [currentBook]);

  const currentChapterChars = useMemo(() => countActualChars(currentChapter.content), [currentChapter.content]);
  const totalBookChars = useMemo(() => {
    return currentBook.chapters.reduce((sum, ch) => sum + countActualChars(ch.content), 0);
  }, [currentBook]);

  const [isSystemDark, setIsSystemDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveTheme = useMemo(() => {
    if (appSettings.theme === 'system') return isSystemDark ? 'dark' : 'white';
    return appSettings.theme;
  }, [appSettings.theme, isSystemDark]);

  const createSnapshot = useCallback(() => {
    const version: ChapterVersion = {
      id: `ver-${Date.now()}`,
      timestamp: Date.now(),
      content: currentChapter.content,
      title: currentChapter.title,
      wordCount: countActualChars(currentChapter.content)
    };

    setBooks(prev => prev.map(b => {
      if (b.id === currentBookId) {
        return {
          ...b,
          chapters: b.chapters.map(c => {
            if (c.id === b.currentChapterId) {
              const versions = [version, ...(c.versions || [])].slice(200);
              return { ...c, versions };
            }
            return c;
          })
        };
      }
      return b;
    }));
  }, [currentBookId, currentChapter]);

  useEffect(() => {
    const saveToDisk = () => {
      if (!isDirty) return;
      createSnapshot();
      localStorage.setItem(`${STORAGE_KEY}_books`, JSON.stringify(books));
      localStorage.setItem(`${STORAGE_KEY}_currentBookId`, currentBookId);
      localStorage.setItem(`${STORAGE_KEY}_inspirations`, JSON.stringify(inspirations));
      localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(appSettings));
      localStorage.setItem(`${STORAGE_KEY}_stats`, JSON.stringify(stats));
      setLastSaved(Date.now());
      setIsDirty(false);
    };
    const timer = setInterval(saveToDisk, appSettings.autoSaveInterval * 1000);
    return () => clearInterval(timer);
  }, [books, currentBookId, inspirations, appSettings, stats, isDirty, createSnapshot]);

  const lastCharCountRef = useRef(currentChapterChars);
  useEffect(() => {
    lastCharCountRef.current = currentChapterChars;
  }, [currentBook.currentChapterId]);

  const setChapterContent = (text: string, isComposing: boolean = false) => {
    setBooks(prev => prev.map(b => b.id === currentBookId ? {
      ...b,
      chapters: b.chapters.map(c => c.id === b.currentChapterId ? { ...c, content: text, lastModified: Date.now() } : c)
    } : b));
    
    setIsDirty(true);

    if (!isComposing) {
      const newCount = countActualChars(text);
      const diff = newCount - lastCharCountRef.current;
      
      if (diff > 0) {
        const today = getTodayKey();
        setStats(prev => ({
          ...prev,
          writingHistory: {
            ...prev.writingHistory,
            [today]: (prev.writingHistory?.[today] || 0) + diff
          }
        }));
      }
      
      lastCharCountRef.current = newCount;
      
      if (blackHouse.active && blackHouse.type === 'word') {
        const bhDiff = newCount - blackHouse.lastTotalCount;
        if (bhDiff > 0) {
          setBlackHouse(prev => ({
            ...prev,
            currentProgress: prev.currentProgress + bhDiff,
            lastTotalCount: newCount
          }));
        } else {
          setBlackHouse(prev => ({ ...prev, lastTotalCount: newCount }));
        }
      }
    }
  };

  const setChapterTitle = (title: string) => {
    setIsDirty(true);
    setBooks(prev => prev.map(b => b.id === currentBookId ? {
      ...b,
      chapters: b.chapters.map(c => c.id === b.currentChapterId ? { ...c, title } : c)
    } : b));
  };

  const setChapterSynopsis = (synopsis: string) => {
    setIsDirty(true);
    setBooks(prev => prev.map(b => b.id === currentBookId ? {
      ...b,
      chapters: b.chapters.map(c => c.id === b.currentChapterId ? { ...c, synopsis } : c)
    } : b));
  };

  const setNextChapterSynopsis = (synopsis: string) => {
    setIsDirty(true);
    setBooks(prev => prev.map(b => {
      if (b.id === currentBookId) {
        const idx = b.chapters.findIndex(c => c.id === b.currentChapterId);
        if (idx !== -1 && idx < b.chapters.length - 1) {
          const nextChapters = [...b.chapters];
          nextChapters[idx + 1] = { ...nextChapters[idx + 1], synopsis };
          return { ...b, chapters: nextChapters };
        }
      }
      return b;
    }));
  };

  // Helper to update specific book fields (for persistence)
  const updateCurrentBookField = (field: keyof Book, value: any) => {
      setBooks(prev => prev.map(b => b.id === currentBookId ? { ...b, [field]: value } : b));
      setIsDirty(true); // Ensure it saves to localStorage on next cycle
  };

  const handleFinishBook = () => {
    setBooks(prev => prev.map(b => b.id === currentBookId ? { ...b, isFinished: true } : b));
    setIsDirty(true);
  };

  const addNextChapterAndNavigate = (synopsis: string) => {
    const book = books.find(b => b.id === currentBookId);
    if (!book) return;
    
    // For anthologies, we just add a new story without synopsis inheritance logic typically used for chapters
    // But keeping it consistent for now is fine, just the "Next Chapter" concept changes in UI
    
    const currentIndex = book.chapters.findIndex(c => c.id === book.currentChapterId);
    const hasNext = currentIndex !== -1 && currentIndex < book.chapters.length - 1;

    if (hasNext) {
      const nextId = book.chapters[currentIndex + 1].id;
      setNextChapterSynopsis(synopsis);
      setBooks(prev => prev.map(b => b.id === currentBookId ? { ...b, currentChapterId: nextId } : b));
    } else {
      const newId = `chapter-${Date.now()}`;
      const nextNum = book.chapters.length + 1;
      const isAnthology = book.type === 'anthology';
      const newTitle = isAnthology ? '新篇章' : `第 ${nextNum} 章`;

      const newChapter: Chapter = {
        id: newId,
        title: newTitle,
        content: '',
        synopsis: synopsis,
        lastModified: Date.now(),
        versions: []
      };
      setBooks(prev => prev.map(b => b.id === currentBookId ? { 
        ...b, 
        chapters: [...b.chapters, newChapter], 
        currentChapterId: newId 
      } : b));
    }
    setIsDirty(true);
  };

  const sortedBooks = useMemo(() => {
    const unfinished = books.filter(b => !b.isFinished).sort((a, b) => b.createdAt - a.createdAt);
    const finished = books.filter(b => b.isFinished).sort((a, b) => b.createdAt - a.createdAt);
    return [...unfinished, ...finished];
  }, [books]);

  const handleFormat = useCallback(() => {
    setIsDirty(true);
    setBooks(prev => prev.map(b => b.id === currentBookId ? {
      ...b,
      chapters: b.chapters.map(c => {
        if (c.id === b.currentChapterId) {
          const formatted = c.content.split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => '　　' + p)
            .join('\n\n');
          return { ...c, content: formatted, lastModified: Date.now() };
        }
        return c;
      })
    } : b));
  }, [currentBookId]);

  const startBlackHouse = (config: Partial<BlackHouseConfig>) => {
    const currentTotal = countActualChars(currentChapter.content);
    setBlackHouse({
      active: true,
      type: config.type || 'word',
      target: config.target || 1000,
      currentProgress: 0,
      lastTotalCount: currentTotal,
      startTime: Date.now()
    });
    setIsSettingUpBlackHouse(false);
  };

  const exitBlackHouse = () => setBlackHouse(prev => ({ ...prev, active: false }));

  const navigateToChapter = (chapterId: string) => {
    const book = books.find(b => b.id === currentBookId);
    if (!book) return;
    const targetChapter = book.chapters.find(c => c.id === chapterId);
    if (!targetChapter) return;

    if (blackHouse.active) {
      setBlackHouse(prev => ({
        ...prev,
        lastTotalCount: countActualChars(targetChapter.content)
      }));
    }

    setBooks(prev => prev.map(b => b.id === currentBookId ? { ...b, currentChapterId: chapterId } : b));
    setViewMode(ViewMode.Editor);
  };

  const toggleRightSidebar = (mode: ViewMode) => {
    if (viewMode !== ViewMode.Editor) {
      setViewMode(ViewMode.Editor);
      setRightSidebarMode(mode);
      setSidebarOpen(true);
      return;
    }

    if (mode === ViewMode.Ambience) {
        handleProAction(() => {
            if (!sidebarOpen) {
              setRightSidebarMode(mode);
              setSidebarOpen(true);
            } else if (rightSidebarMode === mode) {
              setSidebarOpen(false);
            } else {
              setRightSidebarMode(mode);
            }
        });
        return;
    }

    if (!sidebarOpen) {
      setRightSidebarMode(mode);
      setSidebarOpen(true);
    } else if (rightSidebarMode === mode) {
      setSidebarOpen(false);
    } else {
      setRightSidebarMode(mode);
    }
  };

  const themeClasses = { cream: 'bg-[#f8f5f0]', white: 'bg-white', dark: 'bg-[#1a1a1a]', green: 'bg-[#e8f5e9]' };
  const headerClasses = { cream: 'bg-white/80 border-gray-200 text-gray-800', white: 'bg-white/80 border-gray-200 text-gray-800', dark: 'bg-[#111] border-white/5 text-gray-200', green: 'bg-[#e8f5e9]/90 border-green-100 text-[#1b5e20]' };

  return (
    <div className={`flex flex-col md:flex-row h-screen w-full transition-colors duration-1000 overflow-hidden font-sans ${themeClasses[effectiveTheme]}`}>
      
      {/* DESKTOP SIDEBAR */}
      <nav className="hidden md:flex w-[88px] h-full flex-col items-center py-8 gap-y-4 z-50 shrink-0 transition-all duration-500 ease-in-out bg-[#1c1c1e] shadow-[4px_0_24px_rgba(0,0,0,0.15)] border-r border-white/5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className="flex flex-col items-center mb-4 shrink-0">
            <div 
              className="w-10 h-10 text-white/90 flex items-center justify-center hover:text-white hover:scale-110 transition-all cursor-pointer active:scale-95 duration-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" 
              onClick={() => setViewMode(ViewMode.Bookshelf)}
              title="笔纪"
            >
               <Feather size={28} strokeWidth={2.5} />
            </div>
        </div>
        <div className="flex flex-col items-center gap-y-3 w-full shrink-0">
          <NavButton id="nav-bookshelf" icon={Library} label="书架" isActive={viewMode === ViewMode.Bookshelf} onClick={() => !blackHouse.active && setViewMode(ViewMode.Bookshelf)} disabled={blackHouse.active} />
          <NavButton id="nav-editor" icon={PenTool} label="创作" isActive={viewMode === ViewMode.Editor && !sidebarOpen} onClick={() => { setViewMode(ViewMode.Editor); setSidebarOpen(false); }} />
          <NavButton id="nav-outline" icon={Layout} label="大纲" isActive={viewMode === ViewMode.Editor && sidebarOpen && rightSidebarMode === ViewMode.Outline} onClick={() => toggleRightSidebar(ViewMode.Outline)} />
          <NavButton icon={HistoryIcon} label="版本" isActive={viewMode === ViewMode.Editor && sidebarOpen && rightSidebarMode === ViewMode.History} onClick={() => toggleRightSidebar(ViewMode.History)} />
          
          <div className="h-px w-8 bg-white/10 my-1 shrink-0" />

          <NavButton icon={Lightbulb} label="灵感" isActive={viewMode === ViewMode.Editor && sidebarOpen && rightSidebarMode === ViewMode.Inspiration} onClick={() => toggleRightSidebar(ViewMode.Inspiration)} />
          <NavButton icon={Search} label="检索" isActive={viewMode === ViewMode.Editor && sidebarOpen && rightSidebarMode === ViewMode.Search} onClick={() => toggleRightSidebar(ViewMode.Search)} />
          <NavButton icon={BarChart2} label="统计" isActive={viewMode === ViewMode.Editor && sidebarOpen && rightSidebarMode === ViewMode.Statistics} onClick={() => toggleRightSidebar(ViewMode.Statistics)} />
        </div>
        
        <div className="flex-grow min-h-[20px]" />
        
        <div className="flex flex-col items-center gap-y-3 pb-4 shrink-0">
           <NavButton icon={Headphones} label="白噪音" isPro={true} isActive={viewMode === ViewMode.Editor && sidebarOpen && rightSidebarMode === ViewMode.Ambience} onClick={() => toggleRightSidebar(ViewMode.Ambience)} />
           <NavButton icon={effectiveTheme === 'dark' ? Sun : Moon} label="主题" onClick={() => setAppSettings(p => ({ ...p, theme: effectiveTheme === 'dark' ? 'cream' : 'dark' }))} />
           <NavButton id="nav-focus" icon={blackHouse.active ? Lock : Unlock} label={blackHouse.active ? "锁定中" : "小黑屋"} isActive={blackHouse.active} isDanger={blackHouse.active} onClick={() => blackHouse.active ? null : setIsSettingUpBlackHouse(true)} />
           <NavButton id="nav-settings" icon={SettingsIcon} label="设置" isActive={viewMode === ViewMode.Settings} onClick={() => !blackHouse.active && setViewMode(ViewMode.Settings)} disabled={blackHouse.active} />
        </div>
      </nav>

      <main className="flex-grow flex flex-col relative overflow-hidden pb-16 md:pb-0">
        <header className={`h-14 border-b transition-all duration-500 ease-in-out flex items-center justify-between px-4 md:px-6 shrink-0 z-10 backdrop-blur-md ${headerClasses[effectiveTheme]}`}>
          <div className="flex items-center space-x-2 md:space-x-4 max-w-[60%] md:max-w-none">
            <div className="flex items-center truncate">
              <h1 className="font-bold text-base md:text-lg tracking-tight truncate">{currentBook.title}</h1>
              {currentBook.isFinished && <CheckCircle2 size={16} className="text-emerald-500 ml-2 shrink-0" />}
              {currentBook.type === 'anthology' && (
                  <span className="hidden md:inline-block ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[9px] font-bold rounded-md uppercase tracking-wide">
                      短篇集
                  </span>
              )}
            </div>
            <span className="text-sm opacity-20 hidden md:block">|</span>
            <div className="hidden md:flex flex-col">
              <span className="text-[10px] font-bold opacity-60 uppercase tracking-tighter">
                  {currentBook.type === 'anthology' ? '本篇' : '本章'}: <span className="font-mono">{currentChapterChars}</span> 字
              </span>
              <span className="text-[10px] font-bold opacity-40 uppercase tracking-tighter">
                  {currentBook.type === 'anthology' ? '文集' : '全书'}: <span className="font-mono">{totalBookChars}</span> 字
              </span>
            </div>
            {blackHouse.active && (
              <div className="flex items-center ml-2 md:ml-4 bg-amber-500/10 text-amber-600 px-2 py-1 rounded-full text-[10px] font-black tracking-widest border border-amber-500/20 animate-pulse uppercase shrink-0">
                <Lock size={12} className="mr-1.5" /> 
                <span className="hidden md:inline">专注模式</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-3 md:space-x-5">
             <div className="hidden md:flex items-center text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                <Save size={12} className="mr-1.5" />
                <span>自动保存: {new Date(lastSaved).toLocaleTimeString([], { hour12: false })}</span>
                {isDirty && <div className="w-1.5 h-1.5 bg-amber-500 rounded-full ml-2 animate-pulse" title="有未保存的更改" />}
             </div>
             
             <button onClick={handleFormat} className="px-3 py-1.5 md:px-4 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-all shadow-sm active:scale-95 whitespace-nowrap">排版</button>
             <button 
                onClick={() => setSidebarOpen(!sidebarOpen)} 
                className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
             >
                <Menu size={20} />
             </button>
          </div>
        </header>

        <div className="flex-grow flex overflow-hidden relative">
          <div className={`flex-grow transition-all duration-500 ease-in-out overflow-hidden w-full`}>
            {viewMode === ViewMode.Bookshelf ? (
              <Bookshelf 
                books={sortedBooks} 
                setBooks={setBooks} 
                onSelectBook={(id) => { setCurrentBookId(id); setViewMode(ViewMode.Editor); }} 
                isPro={appSettings.isPro}
                onProAction={() => handleProAction(() => {})} 
              />
            ) : viewMode === ViewMode.Settings ? (
              <SettingsView settings={appSettings} setSettings={setAppSettings} onProAction={() => setShowPaymentModal(true)} />
            ) : (
              <Editor 
                chapter={currentChapter}
                book={currentBook}
                setChapterTitle={setChapterTitle}
                setChapterContent={setChapterContent} 
                setChapterSynopsis={setChapterSynopsis}
                setNextChapterSynopsis={setNextChapterSynopsis}
                onFinishBook={handleFinishBook}
                onAddNextChapter={addNextChapterAndNavigate}
                onExport={() => {}} // Editor handles export UI internally now
                focusMode={blackHouse.active}
                settings={appSettings}
                blackHouse={blackHouse}
                isDirty={isDirty}
                // Pass persisted logs and update function
                chatLogs={currentBook.aiChatLogs || []}
                onUpdateChatLogs={(logs) => updateCurrentBookField('aiChatLogs', logs)}
                isPro={appSettings.isPro}
                onProAction={() => handleProAction(() => {})}
              />
            )}
          </div>
          
          {/* MOBILE OVERLAY */}
          {sidebarOpen && (
            <div 
              className="md:hidden fixed inset-0 bg-black/40 z-[55] backdrop-blur-sm transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* RIGHT SIDEBAR */}
          <aside className={`
            fixed md:static top-0 right-0 h-full z-[60] md:z-auto
            flex flex-col bg-white overflow-hidden transition-transform duration-300 ease-in-out
            w-[70%] max-w-[300px] md:w-0 md:border-l shadow-2xl md:shadow-none
            ${sidebarOpen ? 'translate-x-0 md:w-[22rem]' : 'translate-x-full md:translate-x-0'}
            ${effectiveTheme === 'dark' ? 'bg-[#111] md:border-white/5 text-gray-400' : 'bg-white border-gray-200 text-gray-800'}
          `}>
            <div className={`p-4 border-b flex justify-between items-center shrink-0 ${effectiveTheme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
              <h2 className="font-bold text-[10px] uppercase tracking-[0.2em] text-gray-400">
                  {rightSidebarMode === ViewMode.Outline && (currentBook.type === 'anthology' ? '文集目录' : '章节目录')}
                  {rightSidebarMode === ViewMode.Statistics && '创作统计'}
                  {rightSidebarMode === ViewMode.Inspiration && '灵感仓库'}
                  {rightSidebarMode === ViewMode.Search && '参考资料'}
                  {rightSidebarMode === ViewMode.History && '版本回溯'}
                  {rightSidebarMode === ViewMode.Ambience && '沉浸白噪音'}
              </h2>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-300 hover:text-gray-600 transition-colors p-1 bg-gray-100 rounded-full md:bg-transparent">
                  <X size={18} className="md:hidden" />
                  <ChevronRight size={18} className="hidden md:block" />
              </button>
            </div>
            
            <div className="md:hidden p-3 bg-gray-50/50 border-b shrink-0">
               <div className="grid grid-cols-2 gap-2">
                 {[
                   { m: ViewMode.Outline, i: Layout, l: currentBook.type === 'anthology' ? '文集目录' : '章节大纲', color: 'text-blue-500 bg-blue-50 border-blue-100' },
                   { m: ViewMode.Statistics, i: BarChart2, l: '创作统计', color: 'text-emerald-500 bg-emerald-50 border-emerald-100' },
                   { m: ViewMode.Ambience, i: Headphones, l: '白噪音', color: 'text-purple-500 bg-purple-50 border-purple-100' },
                   { m: ViewMode.Search, i: Search, l: 'AI 检索', color: 'text-amber-500 bg-amber-50 border-amber-100' },
                   { m: ViewMode.Inspiration, i: Lightbulb, l: '灵感便签', color: 'text-pink-500 bg-pink-50 border-pink-100' },
                   { m: ViewMode.History, i: HistoryIcon, l: '历史版本', color: 'text-gray-500 bg-gray-100 border-gray-200' },
                 ].map(tool => (
                   <button 
                     key={tool.m}
                     onClick={() => toggleRightSidebar(tool.m)}
                     className={`flex items-center p-2 rounded-xl text-xs font-bold border transition-all ${
                       rightSidebarMode === tool.m 
                       ? `${tool.color} shadow-sm ring-1 ring-offset-1` 
                       : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'
                     }`}
                   >
                      <tool.i size={16} className="mr-2" />
                      <span>{tool.l}</span>
                   </button>
                 ))}
               </div>
            </div>

            <div className="flex-grow overflow-hidden w-full relative">
              {rightSidebarMode === ViewMode.Outline && 
                <Outline 
                    chapters={currentBook.chapters} 
                    currentChapterId={currentBook.currentChapterId} 
                    onSelectChapter={navigateToChapter} 
                    setBooks={setBooks} 
                    bookId={currentBookId} 
                    settings={appSettings}
                    bookSummary={currentBook.bookSummary || ''}
                    onUpdateSummary={(s) => updateCurrentBookField('bookSummary', s)}
                    isAnthology={currentBook.type === 'anthology'}
                />
              }
              {rightSidebarMode === ViewMode.History && <VersionHistory versions={currentChapter.versions || []} onRevert={(v) => { createSnapshot(); setBooks(prev => prev.map(b => b.id === currentBookId ? { ...b, chapters: b.chapters.map(c => c.id === b.currentChapterId ? { ...c, content: v.content, title: v.title } : c) } : b)); }} />}
              {rightSidebarMode === ViewMode.Statistics && 
                <Statistics 
                  stats={{...stats, dailyCount: stats.writingHistory[getTodayKey()] || 0}} 
                  book={currentBook} 
                  settings={appSettings} 
                  onUpdateBook={updateCurrentBookField}
                />
              }
              {rightSidebarMode === ViewMode.Inspiration && <InspirationView items={inspirations} setItems={setInspirations} />}
              {rightSidebarMode === ViewMode.Search && 
                <SearchView 
                    settings={appSettings} 
                    searchState={currentBook.searchState} 
                    onUpdateSearchState={(s) => updateCurrentBookField('searchState', s)}
                />
              }
              {rightSidebarMode === ViewMode.Ambience && <AmbienceView isPro={appSettings.isPro || trialStatus === 'active'} />}
            </div>
          </aside>
          
          {!sidebarOpen && viewMode === ViewMode.Editor && (
             <button onClick={() => setSidebarOpen(true)} className={`hidden md:block absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-l-2xl shadow-xl z-10 border transition-all ${effectiveTheme === 'dark' ? 'bg-[#1a1a1a] border-white/10 text-gray-400' : 'bg-white border-gray-200 text-gray-500'}`}><ChevronLeft size={20} /></button>
          )}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 w-full h-16 bg-[#1c1c1e] z-50 flex items-center justify-around px-2 pb-safe border-t border-white/5 shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
          <NavButton compact icon={Library} label="书架" isActive={viewMode === ViewMode.Bookshelf} onClick={() => !blackHouse.active && setViewMode(ViewMode.Bookshelf)} disabled={blackHouse.active} />
          <NavButton compact icon={PenTool} label="创作" isActive={viewMode === ViewMode.Editor && !sidebarOpen} onClick={() => { setViewMode(ViewMode.Editor); setSidebarOpen(false); }} />
          <NavButton compact icon={SettingsIcon} label="设置" isActive={viewMode === ViewMode.Settings} onClick={() => !blackHouse.active && setViewMode(ViewMode.Settings)} disabled={blackHouse.active} />
      </nav>

      <PaymentModal 
        isOpen={showPaymentModal} 
        onClose={() => setShowPaymentModal(false)}
        onSuccess={() => { setAppSettings(p => ({ ...p, isPro: true })); setShowPaymentModal(false); }}
        onStartTrial={startTrial}
        trialStatus={trialStatus}
      />
      
      {!blackHouse.active && <OnboardingTour />}

      {(isSettingUpBlackHouse || blackHouse.active) && <BlackHouseOverlay config={blackHouse} onExit={exitBlackHouse} onStart={startBlackHouse} onCancel={() => setIsSettingUpBlackHouse(false)} isSettingUp={isSettingUpBlackHouse} />}
    </div>
  );
};

export default App;

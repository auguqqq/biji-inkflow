
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Lock, Sparkles, MessageSquare, Send, ChevronDown, ChevronUp, BrainCircuit, RotateCcw, User, Bot, Loader2, PartyPopper, Trophy, FileText, Target, Zap, CheckCircle2, FileOutput, Eraser, Settings2, RefreshCw, X, Move, GripHorizontal, Lightbulb, AlertTriangle, FileUp, AlertCircle, Save, ShieldCheck } from 'lucide-react';
import { AppSettings, BlackHouseConfig, Chapter, Book, AIConfig, ChatMessage } from '../types';
import { GoogleGenAI } from "@google/genai";

interface EditorProps {
  chapter: Chapter;
  book: Book;
  setChapterTitle: (val: string) => void;
  setChapterContent: (val: string, isComposing?: boolean) => void;
  setChapterSynopsis: (val: string) => void;
  setNextChapterSynopsis: (val: string) => void;
  onFinishBook: () => void;
  onAddNextChapter: (synopsis: string) => void;
  onExport: () => void;
  focusMode: boolean;
  settings: AppSettings;
  blackHouse?: BlackHouseConfig;
  isDirty?: boolean;
  chatLogs: ChatMessage[];
  onUpdateChatLogs: (logs: ChatMessage[]) => void;
  isPro?: boolean;
  onProAction?: (callback: () => void) => void;
}

type AIMode = 'critic' | 'partner' | 'polisher';

const BTN_SIZE = 48;   // Button width/height
const BTN_MARGIN = 24; // Safe margin from screen edge
const TRIAL_LIMIT_REQUESTS = 50;
const EMBEDDED_DEEPSEEK_KEY = "sk-REPLACE_WITH_YOUR_DEEPSEEK_KEY"; // REPLACE THIS!

const countActualChars = (text: string): number => {
  if (!text) return 0;
  const matches = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]/g);
  return matches ? matches.length : 0;
};

// Robust error message extractor
const getFriendlyErrorMessage = (error: any): string => {
  let msg = '';
  if (error instanceof Error) {
    msg = error.message;
  } else if (typeof error === 'object' && error !== null) {
    msg = error.error?.message || error.message || JSON.stringify(error);
  } else {
    msg = String(error);
  }

  // Priority check for Trial Quota Message
  if (msg.includes('今日免费额度已领完')) {
      return msg;
  }

  // Try to parse JSON error message if it looks like one
  if (typeof msg === 'string' && (msg.trim().startsWith('{') || msg.includes('{"error"'))) {
     try {
       const jsonMatch = msg.match(/(\{.*"error".*\})/s) || msg.match(/(\{.*\})/s);
       const jsonStr = jsonMatch ? jsonMatch[0] : msg;
       const parsed = JSON.parse(jsonStr);
       if (parsed.error?.message) msg = parsed.error.message;
       else if (parsed.message) msg = parsed.message;
       
       // Append code/status for better matching below
       if (parsed.error?.code) msg += ` (Code: ${parsed.error.code})`;
       if (parsed.error?.status) msg += ` (Status: ${parsed.error.status})`;
     } catch (e) {}
  }

  // Quota / 429 Errors
  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Insufficient Balance')) {
      return 'API 配额已耗尽 (429)。请检查您的 API Key 额度或稍后再试。';
  }

  // 404 Model Not Found
  if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('Requested entity was not found')) {
      return "模型未找到 (404)。请在“设置”中检查您的模型名称是否正确。";
  }

  // 403 Permission / Invalid Key
  if (msg.includes('403') || msg.includes('API key not valid') || msg.includes('PERMISSION_DENIED')) {
      return "鉴权失败 (403)。API Key 无效或无权访问该模型，请在设置中重新配置。";
  }
  
  // Network Errors
  if (msg.includes('Rpc failed') || msg.includes('xhr error') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return "网络连接失败。请检查：\n1. 网络连接是否正常\n2. 若使用 Gemini，需确保网络环境支持 Google 服务\n3. API Key 是否正确配置";
  }
  
  return `AI 服务异常: ${msg.slice(0, 150)}${msg.length > 150 ? '...' : ''}`;
};

// Helper function for OpenAI compatible API calls
const fetchOpenAICompatible = async (config: AIConfig, messages: any[], systemPrompt?: string) => {
  // --- TRIAL MODE LOGIC ---
  if (config.provider === 'deepseek-trial') {
      const usage = parseInt(localStorage.getItem('inkflow_trial_usage') || '0');
      if (usage >= TRIAL_LIMIT_REQUESTS) {
          throw new Error(`今日免费额度已领完，请填入自己的 Key 或明天再来。`);
      }
      
      // Inject parameters for trial
      config.apiKey = EMBEDDED_DEEPSEEK_KEY;
      config.baseUrl = "https://api.deepseek.com";
      config.model = "deepseek-chat"; 
  }
  // ------------------------

  if (!config.apiKey || config.apiKey.includes('REPLACE')) {
     throw new Error(config.provider === 'deepseek-trial' 
        ? "开发者未配置试用 Key，请使用自定义 Key 模式。" 
        : "请在设置中配置 API Key");
  }
  
  let baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  if (baseUrl.endsWith('/chat/completions')) {
    baseUrl = baseUrl.substring(0, baseUrl.length - '/chat/completions'.length);
  }

  const payload: any = {
    model: config.model || 'gpt-3.5-turbo',
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ]
  };

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // DeepSeek Trial Logic: Catch 402/Balance errors
      if (config.provider === 'deepseek-trial') {
          if (response.status === 402 || errorText.includes('Insufficient Balance') || errorText.includes('Balance')) {
              // Lock local usage to prevent spamming
              localStorage.setItem('inkflow_trial_usage', '9999');
              throw new Error("今日免费额度已领完，请填入自己的 Key 或明天再来。");
          }
      }

      throw new Error(errorText || `请求失败 (${response.status})`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error("API 返回内容为空，可能是模型名称填写错误。");
    }

    // --- SUCCESS: INCREMENT TRIAL USAGE ---
    if (config.provider === 'deepseek-trial') {
        const current = parseInt(localStorage.getItem('inkflow_trial_usage') || '0');
        localStorage.setItem('inkflow_trial_usage', (current + 1).toString());
    }
    // -------------------------------------

    return data.choices[0]?.message?.content || "未收到回复";

  } catch (e: any) {
    throw e;
  }
};

const Editor: React.FC<EditorProps> = ({ 
  chapter, 
  book,
  setChapterTitle, 
  setChapterContent, 
  setChapterSynopsis, 
  setNextChapterSynopsis,
  onFinishBook, 
  onAddNextChapter,
  onExport,
  focusMode, 
  settings, 
  blackHouse, 
  isDirty,
  chatLogs,
  onUpdateChatLogs,
  isPro,
  onProAction
}) => {
  const [timeProgress, setTimeProgress] = useState(0);
  const isComposing = useRef(false);
  const isAnthology = book.type === 'anthology';
  
  // Export Menu State
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Tips State
  const [showExportTip, setShowExportTip] = useState(false);

  // Close export menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  // Use a ref to track chatLogs to avoid stale closures in async functions
  const chatLogsRef = useRef(chatLogs);
  useEffect(() => {
    chatLogsRef.current = chatLogs;
  }, [chatLogs]);

  // Initial Export Tip
  useEffect(() => {
      const timer = setTimeout(() => {
          const hasSeen = sessionStorage.getItem('inkflow_export_tip_seen');
          if (!hasSeen) {
              setShowExportTip(true);
              sessionStorage.setItem('inkflow_export_tip_seen', 'true');
              setTimeout(() => setShowExportTip(false), 8000); // Hide after 8s
          }
      }, 2000);
      return () => clearTimeout(timer);
  }, []);

  const activeProgress = useMemo(() => {
    if (!blackHouse || !focusMode) return 0;
    if (blackHouse.type === 'word') {
      return Math.min(100, (blackHouse.currentProgress / blackHouse.target) * 100);
    }
    return timeProgress;
  }, [blackHouse, focusMode, timeProgress]);

  // AI State
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('思考中...');
  const [userInput, setUserInput] = useState('');
  const [aiMode, setAiMode] = useState<AIMode>('critic');
  
  // Auto-scroll State
  const [turnStartIndex, setTurnStartIndex] = useState<number | null>(null);
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  // Draggable Panel State
  const [panelRect, setPanelRect] = useState({ x: window.innerWidth - 380 - 20, y: 80, w: 360, h: 600 });
  const isDraggingPanel = useRef(false);
  const isResizingPanel = useRef(false);
  const panelDragOffset = useRef({ x: 0, y: 0 });

  // Draggable Toggle Button State
  const [btnPos, setBtnPos] = useState(() => {
      if (typeof window === 'undefined') return { x: 0, y: 0 };
      
      const defaultX = window.innerWidth - BTN_SIZE - BTN_MARGIN;
      const defaultY = window.innerHeight - BTN_SIZE - BTN_MARGIN;

      try {
          const saved = sessionStorage.getItem('inkflow_ai_btn_pos');
          if (saved) {
              const parsed = JSON.parse(saved);
              if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
                  // CRITICAL FIX: If position is in top-left danger zone (overlapping header/nav), force reset to bottom-right
                  // Top header is ~60px, Left sidebar is ~90px on desktop
                  if (parsed.x < 100 && parsed.y < 100) {
                      return { x: defaultX, y: defaultY };
                  }
                  return parsed;
              }
          }
      } catch (e) {}
      
      return { x: defaultX, y: defaultY };
  });

  const isDraggingBtn = useRef(false);
  const btnDragStart = useRef({ x: 0, y: 0 });
  const hasBtnMoved = useRef(false);

  // Idle Tip State
  const [showIdleTip, setShowIdleTip] = useState(false);
  const [currentTip, setCurrentTip] = useState('');
  const idleTimerRef = useRef<any>(null);

  // Data Persistence Warning in Chat - USER FRIENDLY VERSION
  useEffect(() => {
      if (isAiPanelOpen && chatLogs.length === 0) {
          const warningMsg: ChatMessage = {
              role: 'assistant',
              content: `👋 您好！我是您的智能责编。\n\n🛡️ **数据安全说明**：\n为了确保您的文本数据绝对安全，您的所有创作内容均**缓存在本地设备**中，绝不上传至任何服务器。\n\n💾 **备份建议**：\n虽然本地缓存稳定高效，但为了防止意外清理，建议您养成**经常性点击导出按钮**保存到电脑的好习惯。\n\n现在，我们可以开始聊聊您的作品了！`
          };
          onUpdateChatLogs([warningMsg]);
      }
  }, [isAiPanelOpen, chatLogs.length]);

  // Window Resize & Boundary Check Logic (Smart Anchoring)
  useEffect(() => {
     const handleResize = () => {
         setBtnPos((prev: {x: number, y: number}) => {
             const maxX = window.innerWidth - BTN_SIZE - BTN_MARGIN;
             const maxY = window.innerHeight - BTN_SIZE - BTN_MARGIN;
             
             // 1. Clamp position to visible area
             let newX = Math.min(Math.max(BTN_MARGIN, prev.x), maxX);
             let newY = Math.min(Math.max(BTN_MARGIN, prev.y), maxY);
             
             // 2. Safety Check: If accidentally in top-left (e.g. 0,0), snap to bottom-right immediately
             if (newX < 100 && newY < 100) {
                 return { x: maxX, y: maxY };
             }

             // 3. Smart Anchoring: 
             // If user placed button near the bottom-right corner previously, 
             // keep it anchored to bottom-right when window resizes.
             const distToRight = window.innerWidth - (prev.x + BTN_SIZE);
             const distToBottom = window.innerHeight - (prev.y + BTN_SIZE);
             
             if (prev.x > window.innerWidth - 300 || distToRight < 100) {
                 newX = maxX;
             }
             if (prev.y > window.innerHeight - 300 || distToBottom < 100) {
                 newY = maxY;
             }

             if (newX !== prev.x || newY !== prev.y) {
                 return { x: newX, y: newY };
             }
             return prev;
         });

         // Panel Logic
         if (window.innerWidth > 768) {
             setPanelRect((prev: any) => ({ 
                 x: window.innerWidth - 380 - 40, 
                 y: 100, 
                 w: 360, 
                 h: window.innerHeight - 200 
             }));
         } else {
             setPanelRect((prev: any) => ({ x: 0, y: 60, w: window.innerWidth, h: window.innerHeight - 60 }));
         }
     };

     // Force run once to correct any initial bad positioning
     handleResize();

     window.addEventListener('resize', handleResize);
     return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Persist button position to storage whenever it changes
  useEffect(() => {
      sessionStorage.setItem('inkflow_ai_btn_pos', JSON.stringify(btnPos));
  }, [btnPos]);
  
  const [synopsisExpanded, setSynopsisExpanded] = useState(true);
  const [showFinishedEffect, setShowFinishedEffect] = useState(false);
  const [finishStats, setFinishStats] = useState({ words: 0, chapters: 0, time: 0 });
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatTopRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveTheme = settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'white') : settings.theme;
  const themeStyles = { cream: 'bg-[#f8f5f0]', white: 'bg-white', dark: 'bg-[#1a1a1a]', green: 'bg-[#e8f5e9]' };
  const textColors = { cream: 'text-gray-800', white: 'text-gray-800', dark: 'text-gray-100', green: 'text-[#1b5e20]' };

  const focusBgClass = focusMode 
    ? (effectiveTheme === 'dark' ? 'bg-black' : 'bg-[#fefdfb]') 
    : themeStyles[effectiveTheme as keyof typeof themeStyles];

  const TIPS = [
    "写累了吗？记得点击右上角「导出」图标备份章节。",
    "点击右侧栏的「统计」，可以看到您的每日码字速度趋势。",
    "如果觉得背景太安静，试试 Pro 版的「白噪音」功能吧。",
    "卡文了？唤醒右下角的 AI 责编，聊聊接下来的剧情。",
    "点击章节标题左侧的箭头，可以快速收起/展开梗概。",
    "小提示：按 Ctrl+S (或 Cmd+S) 可以手动触发立即保存。"
  ];

  const resetIdleTimer = () => {
    if (showIdleTip) setShowIdleTip(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    
    if (chapter.content.length > 50 && !focusMode) {
        idleTimerRef.current = setTimeout(() => {
            const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];
            setCurrentTip(randomTip);
            setShowIdleTip(true);
        }, 3 * 60 * 1000);
    }
  };

  useEffect(() => {
    resetIdleTimer();
    return () => clearTimeout(idleTimerRef.current);
  }, [chapter.content]);

  // FIX: Force scroll to top on chapter change without smooth behavior to avoid jumping
  useEffect(() => {
    if (mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    
    if (textareaRef.current) {
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.setSelectionRange(0, 0);
                textareaRef.current.focus({ preventScroll: true });
            }
            if (mainScrollRef.current) {
                mainScrollRef.current.scrollTop = 0;
            }
        }, 10);
    }
  }, [chapter.id]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (isDraggingPanel.current) {
            setPanelRect(prev => ({
                ...prev,
                x: e.clientX - panelDragOffset.current.x,
                y: e.clientY - panelDragOffset.current.y
            }));
        } 
        else if (isResizingPanel.current) {
            setPanelRect(prev => ({
                ...prev,
                w: Math.max(300, e.clientX - prev.x),
                h: Math.max(400, e.clientY - prev.y)
            }));
        }
        else if (isDraggingBtn.current) {
            const dx = e.clientX - btnDragStart.current.x;
            const dy = e.clientY - btnDragStart.current.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasBtnMoved.current = true; // Increased threshold
            
            // Constrain button to window bounds
            const btnSize = BTN_SIZE;
            const margin = BTN_MARGIN;
            let newX = e.clientX - (btnSize / 2);
            let newY = e.clientY - (btnSize / 2);

            newX = Math.max(margin, Math.min(window.innerWidth - btnSize - margin, newX));
            newY = Math.max(margin, Math.min(window.innerHeight - btnSize - margin, newY));

            setBtnPos({ x: newX, y: newY });
        }
    };

    const handleMouseUp = () => {
        isDraggingPanel.current = false;
        isResizingPanel.current = false;
        if (isDraggingBtn.current) {
            isDraggingBtn.current = false;
        }
        document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDownHeader = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      isDraggingPanel.current = true;
      panelDragOffset.current = {
          x: e.clientX - panelRect.x,
          y: e.clientY - panelRect.y
      };
      document.body.style.userSelect = 'none';
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
      e.stopPropagation();
      isResizingPanel.current = true;
      document.body.style.userSelect = 'none';
  };

  const handleMouseDownBtn = (e: React.MouseEvent) => {
      // Prevent default to avoid text selection issues
      // e.preventDefault(); 
      isDraggingBtn.current = true;
      hasBtnMoved.current = false;
      btnDragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleBtnClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!hasBtnMoved.current) {
          setIsAiPanelOpen(true);
      }
  };

  useEffect(() => {
    let interval: any;
    if (focusMode && blackHouse?.type === 'time' && blackHouse.startTime) {
      const targetSeconds = blackHouse.target * 60;
      const update = () => {
        const elapsed = (Date.now() - blackHouse.startTime!) / 1000;
        setTimeProgress(Math.min(100, (elapsed / targetSeconds) * 100));
      };
      update();
      interval = setInterval(update, 1000);
    }
    return () => clearInterval(interval);
  }, [focusMode, blackHouse]);

  useEffect(() => {
    let interval: any;
    if (aiLoading) {
      const msgs = ['正在研读正文...', '正在分析逻辑...', '正在构建建议...', '正在润色措辞...', 'AI 正在思考...'];
      let i = 0;
      setLoadingMsg(msgs[0]);
      interval = setInterval(() => {
        i = (i + 1) % msgs.length;
        setLoadingMsg(msgs[i]);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [aiLoading]);

  // Enhanced auto-scroll to handle turn start
  useEffect(() => {
    if (aiLoading) {
        // If loading, follow bottom
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (turnStartIndex !== null) {
        // If loaded and we have a start index, scroll to it
        setTimeout(() => {
            const el = messageRefs.current[turnStartIndex];
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            setTurnStartIndex(null);
        }, 150);
    }
  }, [aiLoading, turnStartIndex, chatLogs.length]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 600)}px`;
    }
  }, [chapter.content, settings.lineHeight, settings.fontSize]);

  const addChatLog = (newMsg: ChatMessage) => {
      // FIX: Use ref to get the absolute latest logs even inside async loops
      const currentLogs = chatLogsRef.current;
      const updated = [...currentLogs, newMsg];
      const truncated = updated.length > 80 ? updated.slice(updated.length - 80) : updated;
      onUpdateChatLogs(truncated);
  };

  const generateResponse = async (userPrompt: string, systemPrompt?: string) => {
    const aiConfig = settings.ai || { provider: 'gemini', apiKey: '', baseUrl: '', model: 'gemini-3-flash-preview' };

    // --- GEMINI PROVIDER ---
    if (aiConfig.provider === 'gemini') {
      const key = aiConfig.apiKey || process.env.API_KEY;
      if (!key) throw new Error("未配置 Gemini API Key");
      
      const ai = new GoogleGenAI({ apiKey: key });
      const modelName = aiConfig.model || 'gemini-3-flash-preview';
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: systemPrompt ? { systemInstruction: systemPrompt } : undefined
      });
      return response.text?.trim() || "未能生成评估。";
    } else {
      // --- GENERIC PROVIDERS (DeepSeek / OpenAI / Trial) ---
      // We pass the config (which might be 'deepseek-trial') to the helper
      return await fetchOpenAICompatible(aiConfig, [{ role: 'user', content: userPrompt }], systemPrompt);
    }
  };

  const getSystemPromptForMode = (mode: AIMode) => {
    // ----------------------------
    // SHORT STORY / ANTHOLOGY MODE
    // ----------------------------
    if (isAnthology) {
      switch (mode) {
        case 'critic':
          return `你是一位资深短篇小说与文学杂志主编。你的眼光毒辣，极度看重作品的“完成度”、“文字张力”和“主题深度”。

          【任务目标】
          深度审视这篇短篇/散文，指出结构是否松散、主题是否浅显、结尾是否乏力。

          【输出格式规范】
          1. ##篇目复盘：[一句话概括核心冲突或意象]
          2. ##毒舌辣评：
             - [结构问题：例如开头入题太慢，或结尾戛然而止却无余韵]
             - [主题问题：例如立意过于俗套，缺乏新意]
             - [文字问题：例如形容词堆砌，不够凝练]
          3. ##修改建议：
             - 建议 1：[如何删减冗余，提升紧凑感]
             - 建议 2：[如何强化结尾的爆发力或回味感]
          4. ##灵感拓展：[如果不写下一章，而是作为一个独立故事，哪里还可以加一个“欧·亨利式”的反转？]`;

        case 'partner':
          return `你是一位擅长头脑风暴的短篇故事构思伙伴。你的风格是“寻找奇点”、“打破常规”。

          【任务目标】
          基于当前文本，提供多种截然不同的发展方向或结局变体，帮助作者探索可能。

          【输出格式规范】
          1. ##核心提炼：[提取本篇的“文眼”或核心矛盾]
          2. ##脑洞风暴：
             - 🎭 结局变体A（悲剧美学）：[如何让结局更具遗憾美]
             - 🎪 结局变体B（荒诞现实）：[加入超现实或黑色幽默元素]
             - 💡 视角转换：[如果是配角视角，这个故事会变成什么样？]
          3. ##写作提示：[关于短篇小说“留白”技巧的一个小建议]`;

        case 'polisher':
          return `你是一位极简主义文学修辞专家。你信奉“少即是多”。

          【任务目标】
          针对短篇小说的特性，优化文字的密度和质感，去除废话。

          【输出格式规范】
          1. ##风格诊断：[当前的语言风格是啰嗦、平实还是华丽？]
          2. ##炼字工坊：
             - 原文定位：[找出一段累赘的描写]
             - 极简重写：[展示删减后的版本，保留神韵]
          3. ##意境营造：[建议在哪里加入一个关键的“空镜头”或环境描写来烘托氛围]`;
      }
    }

    // ----------------------------
    // NOVEL / LONG FORM MODE (DEFAULT)
    // ----------------------------
    switch (mode) {
      case 'critic':
        return `你是一位资深、严厉且眼光独到的网文主编（Critic）。你的风格是“毒舌但一针见血”，拒绝任何客套的赞美。
        
        【任务目标】
        深度审视用户提供的章节，无情地指出逻辑漏洞、人设崩塌、节奏拖沓或行文小白之处。

        【输出格式规范】
        1. ##剧情复盘：[用一句话高度概括本章核心事件，50字以内]
        2. ##毒舌辣评：
           - [指出逻辑硬伤，例如：反派降智、巧合过多]
           - [指出人设问题，例如：主角性格前后矛盾]
           - [指出节奏问题，例如：水字数太多，核心冲突不明显]
        3. ##修改建议（Construction）：
           - 建议 1：[具体可行的修改方案]
           - 建议 2：[如何加强冲突或悬念]
        4. ##下一章方向总结：[根据当前剧情，给出最合理的后续发展预测，50字以内，以引导式语气结尾]`;
        
      case 'partner':
        return `你是一位脑洞大开、热情洋溢的网文灵感搭档（Partner）。你的风格是“鼓励、发散、打破常规”。

        【任务目标】
        基于现有剧情，通过“如果不...会怎样”的思维，提供多种有趣的后续发展可能性，帮助作者打开思路。

        【输出格式规范】
        1. ##剧情复盘：[用一句话概括本章核心，50字以内]
        2. ##脑洞风暴（Brainstorming）：
           - 💡 路线A（反转向）：[提供一个意想不到的反转]
           - 🔥 路线B（高爽向）：[如何让主角装逼打脸更爽]
           - 🕵️ 路线C（悬疑向）：[埋下一个伏笔或揭示一个阴谋]
        3. ##下一章方向总结：[综合上述脑洞，给出一个最推荐的、最具吸引力的后续走向，50字以内]`;

      case 'polisher':
        return `你是一位细腻考究的文学润色专家（Polisher）。你的风格是“注重画面感、情绪流动和修辞之美”。

        【任务目标】
        不改变核心剧情，仅针对描写、对话和氛围进行升格，提升文字的代入感。

        【输出格式规范】
        1. ##剧情复盘：[概括本章内容，50字以内]
        2. ##高光时刻：[指出文中写得最有感觉的一处]
        3. ##润色示例（Showcase）：
           - 原文定位：[引用原文中一段较平淡的描写]
           - 升格重写：[展示优化后的版本，加强感官描写（视、听、触、嗅）和心理刻画]
           - 解析：[简述修改理由]
        4. ##下一章方向总结：[建议下一章在氛围营造或情感推进上的重点，50字以内]`;

      default:
        return '';
    }
  };

  const handleEditorReview = async () => {
    if (chapter.content.length < 50) return alert("写多一点再来让 AI 评估吧！");
    if (aiLoading) return;

    setTurnStartIndex(chatLogsRef.current.length); 

    setAiLoading(true);
    if (chatLogsRef.current.length > 0) {
        addChatLog({ role: 'assistant', content: '--- 新的评估 ---' });
    }
    
    const triggerMsg = { 
        'critic': '主编，请帮我狠狠挑刺，指出这一章的逻辑硬伤和节奏问题！',
        'partner': '搭档，我需要灵感！帮我想想后面怎么写更有趣？',
        'polisher': '老师，请帮我看看文笔，有哪些段落可以润色得更有画面感？'
    }[aiMode];

    addChatLog({ role: 'user', content: `[请求全章评估] ${triggerMsg}` });

    try {
      const systemPrompt = getSystemPromptForMode(aiMode);
      const userPrompt = `【章节/篇目标题】：${chapter.title}\n【正文】：\n${chapter.content}`;
      
      const aiText = await generateResponse(userPrompt, systemPrompt);
      const parts = aiText.split('\n\n').filter((p: string) => p.trim());
      
      for (let i = 0; i < parts.length; i++) {
        // Dynamic delay based on reading speed simulation
        const delay = Math.max(1000, parts[i].length * 5);
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 500 : delay)); 
        addChatLog({ role: 'assistant', content: parts[i] });
      }
      
    } catch (e: any) {
      console.error(e);
      const friendlyMsg = getFriendlyErrorMessage(e);
      addChatLog({ role: 'assistant', content: `❌ 分析中断: ${friendlyMsg}` });
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiDialogue = async (msg: string) => {
    if (msg.includes("本文完结")) {
      const totalWords = book.chapters.reduce((sum, c) => sum + countActualChars(c.content), 0);
      const totalTime = Math.round((Date.now() - book.createdAt) / 60000); 
      setFinishStats({ words: totalWords, chapters: book.chapters.length, time: totalTime });
      setShowFinishedEffect(true);
      onFinishBook();
      return;
    }

    setTurnStartIndex(chatLogsRef.current.length);
    setAiLoading(true);
    addChatLog({ role: 'user', content: msg });
    
    try {
      const systemContext = `你是一个资深${isAnthology ? '短篇文学' : '网文'}助手。当前模式：${aiMode === 'critic' ? '严厉主编' : aiMode === 'partner' ? '灵感搭档' : '润色专家'}。
      请保持当前人设。${!isAnthology ? '如果你的回复中包含对下一章剧情的具体建议，请务必在最后单独一行以 "##下一章方向总结：" 开头进行总结，方便系统提取。' : ''}`;
      
      const aiText = await generateResponse(msg, systemContext);
      
      const parts = aiText.split('\n\n').filter((p: string) => p.trim());
      for (const part of parts) {
        await new Promise(resolve => setTimeout(resolve, 800));
        addChatLog({ role: 'assistant', content: part });
      }
    } catch (e: any) {
      console.error(e);
      const friendlyMsg = getFriendlyErrorMessage(e);
      addChatLog({ role: 'assistant', content: `❌ 错误: ${friendlyMsg}` });
    } finally {
      setAiLoading(false);
    }
  };

  // Robust Text Extraction for Synopsis/Plot
  const updateSynopsis = (text: string, type: 'current' | 'next') => {
    const keyword = type === 'current' ? (isAnthology ? '篇目复盘' : '剧情复盘') : '下一章方向总结';
    const regex = new RegExp(`(?:##|\\*\\*|\\d+\\.)\\s*${keyword}[:：]?\\s*([\\s\\S]+?)(?=\\n\\n|\\n\\s*(?:##|\\*\\*|\\d+\\.)|$)`, 'i');
    const match = text.match(regex);
    let extractedContent = '';

    if (match && match[1]) {
        extractedContent = match[1].trim();
    } else {
        const parts = text.split(keyword);
        if (parts.length > 1) {
            extractedContent = parts[1].split('\n\n')[0].trim();
        }
    }

    let clean = extractedContent
        .replace(/^\s*[:：]\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/^[-\s]+/, '')
        .trim();

    clean = clean.slice(0, 200);
    
    if (!clean || clean.length < 2) {
        alert('自动提取失败，请尝试手动复制。');
        return;
    }

    if (type === 'current') {
      setChapterSynopsis(clean);
      const btn = document.activeElement as HTMLElement;
      if(btn) {
          const originalText = btn.innerText;
          btn.innerText = "已更新!";
          setTimeout(() => btn.innerText = originalText, 2000);
      }
    } else {
      onAddNextChapter(clean);
      addChatLog({ role: 'assistant', content: "✅ 已将该走向同步至下一章大纲，祝您下笔如有神！" });
    }
  };

  const renderText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-amber-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposing.current = false;
    setChapterContent(e.currentTarget.value, false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChapterContent(e.target.value, isComposing.current);
    resetIdleTimer();
  };

  // Export Logic
  const handleExportClick = (format: 'txt' | 'epub' | 'pdf') => {
      if (format === 'txt') {
          onExport();
          setShowExportMenu(false);
          setShowExportTip(false);
          return;
      }

      // Pro formats
      if (!isPro) {
          onProAction?.(() => {});
          setShowExportMenu(false);
          return;
      }

      // Mock generation for Pro formats
      alert(`[模拟] 正在为您生成 ${format.toUpperCase()} 文件...\n这可能需要几秒钟时间。`);
      setShowExportMenu(false);
      setShowExportTip(false);
  };

  return (
    <div className={`h-full w-full flex flex-col items-center transition-all duration-500 relative overflow-hidden ${focusBgClass}`}>
      {/* Finished Effect Layer */}
      {showFinishedEffect && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-500 p-6">
           <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.3)] border border-white/20 text-center max-w-lg w-full relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-200 via-amber-500 to-amber-200" />
              <Trophy size={60} className="text-amber-500 mx-auto mb-6" />
              <h2 className="text-2xl md:text-3xl font-black text-gray-800 serif mb-8 tracking-[0.3em]">{isAnthology ? '文 集 归 档' : '全 书 完 结'}</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">作品总字数</span>
                  <span className="text-xl font-black text-amber-600 font-mono">{finishStats.words}</span>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{isAnthology ? '总篇目数' : '总创作章节'}</span>
                  <span className="text-xl font-black text-gray-700 font-mono">{finishStats.chapters}</span>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 col-span-2">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">累计时长</span>
                  <span className="text-xl font-black text-gray-700 font-mono">{finishStats.time} 分钟</span>
                </div>
              </div>
              
              <button onClick={() => setShowFinishedEffect(false)} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold tracking-widest hover:bg-black transition-all active:scale-95 shadow-lg flex items-center justify-center space-x-2">
                <CheckCircle2 size={18} />
                <span>归 档 文 件</span>
              </button>
           </div>
        </div>
      )}

      {/* Idle Tip Toast */}
      {showIdleTip && !focusMode && !isAiPanelOpen && (
        <div className="absolute bottom-6 left-6 z-40 animate-in slide-in-from-bottom-4 duration-700">
            <div className="bg-white/90 backdrop-blur-md border border-amber-200 shadow-lg p-3 rounded-2xl max-w-xs flex items-start space-x-3">
                <div className="bg-amber-100 p-1.5 rounded-full mt-0.5 shrink-0">
                    <Lightbulb size={14} className="text-amber-600" />
                </div>
                <div className="flex-grow">
                    <p className="text-xs text-gray-700 leading-relaxed font-medium">{currentTip}</p>
                </div>
                <button 
                  onClick={() => setShowIdleTip(false)} 
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                   <X size={14} />
                </button>
            </div>
        </div>
      )}

      {focusMode && (
        <div className="absolute top-0 left-0 right-0 h-1 z-50 bg-gray-100">
          <div className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)] transition-all duration-1000" style={{ width: `${activeProgress}%` }} />
        </div>
      )}

      {/* HEADER SECTION */}
      <div className={`w-full shrink-0 border-b transition-all duration-300 z-40 backdrop-blur-xl ${focusMode ? (effectiveTheme === 'dark' ? 'bg-black border-white/5' : 'bg-white border-gray-100') : (effectiveTheme === 'dark' ? 'bg-[#1a1a1a]/95 border-white/5' : 'bg-[#f8f5f0]/95 border-amber-500/10')}`}>
          <div className="max-w-6xl mx-auto px-4 md:px-10 pt-4 pb-2 md:pt-6 md:pb-4">
            <div className="flex items-center space-x-2 md:space-x-4 mb-2 md:mb-4">
                <div className="flex-grow flex items-center">
                  <input 
                    value={chapter.title}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder={isAnthology ? "请输入篇目标题" : "请输入章节标题"}
                    className={`w-full bg-transparent border-none focus:outline-none text-xl md:text-2xl font-black serif tracking-tight ${textColors[effectiveTheme as keyof typeof textColors]} placeholder:text-gray-300`}
                  />
                </div>
                <div className="flex items-center space-x-1 shrink-0 relative" ref={exportMenuRef}>
                  {/* Export Tip Popover */}
                  {showExportTip && !showExportMenu && (
                      <div className="absolute top-full right-0 mt-3 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-lg z-50 animate-bounce whitespace-nowrap after:content-[''] after:absolute after:bottom-full after:right-3 after:border-[6px] after:border-transparent after:border-b-red-500">
                          建议写完定期备份
                      </div>
                  )}
                  
                  <button 
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="p-2 text-gray-300 hover:text-amber-600 transition-colors rounded-lg hover:bg-amber-50 relative"
                    title="导出选项"
                  >
                    <FileOutput size={18} />
                    {showExportTip && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />}
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                        <button onClick={() => handleExportClick('txt')} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center">
                            <FileText size={12} className="mr-2"/> TXT <span className="ml-auto text-[9px] text-gray-300">免费</span>
                        </button>
                        <button onClick={() => handleExportClick('epub')} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center">
                            <FileUp size={12} className="mr-2"/> EPUB {!isPro && <Zap size={10} className="ml-auto text-amber-500" fill="currentColor" />}
                        </button>
                        <button onClick={() => handleExportClick('pdf')} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center">
                            <FileUp size={12} className="mr-2"/> PDF {!isPro && <Zap size={10} className="ml-auto text-amber-500" fill="currentColor" />}
                        </button>
                    </div>
                  )}

                  <button onClick={() => setSynopsisExpanded(!synopsisExpanded)} className="p-2 text-gray-300 hover:text-amber-600 transition-colors rounded-lg hover:bg-amber-50">
                      {synopsisExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
            </div>
            
            {synopsisExpanded && (
                <textarea 
                    value={chapter.synopsis}
                    onChange={(e) => setChapterSynopsis(e.target.value)}
                    placeholder={isAnthology ? "本篇摘要或灵感点（纯文本）..." : "本章剧情梗概（纯文本模式）..."}
                    className="w-full h-14 bg-amber-50/10 rounded-xl p-3 text-xs text-gray-500 border border-amber-200/20 resize-none focus:outline-none focus:border-amber-400 focus:bg-amber-50/20 transition-all custom-scrollbar leading-relaxed"
                />
            )}
          </div>
      </div>

      {/* SCROLLABLE EDITOR AREA */}
      <div ref={mainScrollRef} className="flex-grow w-full overflow-y-auto custom-scrollbar relative">
        <div id="editor-area" className="w-full max-w-6xl mx-auto px-4 md:px-10 py-6 md:py-10 min-h-full flex flex-col">
          <textarea
            ref={textareaRef}
            value={chapter.content}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onChange={handleChange}
            placeholder="笔耕不辍，字字千金..."
            style={{ 
              fontSize: `${settings.fontSize}px`, 
              lineHeight: settings.lineHeight, 
              fontFamily: settings.fontFamily === 'serif' ? '"Noto Serif SC", serif' : '"Noto Sans SC", sans-serif' 
            }}
            className={`w-full bg-transparent resize-none focus:outline-none transition-all ${textColors[effectiveTheme as keyof typeof textColors]} placeholder:text-gray-200 caret-amber-600 overflow-hidden min-h-[50vh] flex-grow`}
            autoFocus
            spellCheck={false}
          />
          <div className="h-[20vh] pointer-events-none" />
          
          {/* Add Next Button - Customized for Anthology */}
          {!focusMode && (
             <div className="flex justify-center pb-20">
                <button 
                  onClick={() => onAddNextChapter('')}
                  className="px-6 py-3 bg-gray-50 hover:bg-amber-50 text-gray-400 hover:text-amber-600 rounded-full border border-dashed border-gray-200 hover:border-amber-300 transition-all text-xs font-bold flex items-center space-x-2"
                >
                   {isAnthology ? (
                       <>
                         <Sparkles size={14} />
                         <span>开启新一篇创作</span>
                       </>
                   ) : (
                       <>
                         <ChevronDown size={14} />
                         <span>创建下一章</span>
                       </>
                   )}
                </button>
             </div>
          )}
        </div>
      </div>

      {/* AI Assistant Toggle (Draggable) - REPAIRED & PERSISTED */}
      {!focusMode && !isAiPanelOpen && (
          <button 
            id="ai-assistant-toggle"
            onMouseDown={handleMouseDownBtn}
            onClick={handleBtnClick}
            style={{
                position: 'fixed',
                left: btnPos.x,
                top: btnPos.y,
                zIndex: 100 // High z-index to prevent disappearing behind other layers
            }}
            className="w-12 h-12 bg-gray-900 text-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.3)] hover:scale-110 active:scale-95 transition-transform flex items-center justify-center border-2 border-white/10 group overflow-hidden hover:w-32 cursor-grab active:cursor-grabbing"
          >
            <BrainCircuit size={20} className="shrink-0" />
            <span className="w-0 overflow-hidden group-hover:w-auto group-hover:ml-2 text-xs font-bold whitespace-nowrap transition-all duration-300 pointer-events-none">
               责编助手
            </span>
          </button>
      )}

      {/* AI Editor Assistant Panel (Draggable & Resizable Floating Window) */}
      {isAiPanelOpen && (
        <div 
            style={{
                top: panelRect.y,
                left: panelRect.x,
                width: panelRect.w,
                height: panelRect.h,
                position: 'fixed'
            }}
            className={`
                z-[110] overflow-hidden flex flex-col bg-white shadow-[0_10px_50px_rgba(0,0,0,0.2)] rounded-2xl border border-gray-200
                animate-in fade-in zoom-in-95 duration-200
            `}
        >
            {/* Header (Drag Target) */}
            <div 
                onMouseDown={handleMouseDownHeader}
                className="px-5 py-3 bg-gray-900 text-white flex justify-between items-center shrink-0 cursor-move select-none"
            >
                <div className="flex items-center space-x-2 pointer-events-none">
                    <Bot size={18} className="text-amber-400" /> 
                    <span className="text-xs font-black uppercase tracking-widest">智能责编中心</span>
                </div>
                <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
                   <button 
                    type="button"
                    onClick={() => setIsAiPanelOpen(false)} 
                    className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors pointer-events-auto"
                   >
                    <X size={18} />
                   </button>
                </div>
            </div>

            {/* AI Controls */}
            <div className="bg-gray-50 border-b border-gray-100 p-4 shrink-0 space-y-3">
               <div className="flex bg-gray-200/50 p-1 rounded-xl">
                  {[
                    { id: 'critic', label: isAnthology ? '毒舌主编' : '毒舌主编', icon: Zap },
                    { id: 'partner', label: '灵感搭档', icon: Sparkles },
                    { id: 'polisher', label: '润色专家', icon: Settings2 }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setAiMode(mode.id as AIMode)}
                      className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${
                        aiMode === mode.id 
                        ? 'bg-white text-gray-800 shadow-sm ring-1 ring-black/5' 
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200/50'
                      }`}
                    >
                      <mode.icon size={12} />
                      <span>{mode.label}</span>
                    </button>
                  ))}
               </div>
               
               <button 
                  onClick={handleEditorReview}
                  disabled={aiLoading}
                  className={`w-full py-2.5 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-70 disabled:grayscale flex items-center justify-center space-x-2 ${
                    chatLogs.length > 0 ? 'bg-gray-800 hover:bg-black shadow-gray-800/20' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                  }`}
               >
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  <span>{aiLoading ? '正在交互...' : (chatLogs.length > 0 ? '重新生成建议 (Regenerate)' : isAnthology ? '开始全文评估' : '开始本章评估')}</span>
               </button>
            </div>
            
            {/* Chat Area */}
            <div className="flex-grow overflow-y-auto p-5 space-y-5 custom-scrollbar bg-white relative">
                <div ref={chatTopRef} />
                
                {chatLogs.length === 0 && (
                   <div className="text-center py-10 text-gray-300">
                      <Move size={32} className="mx-auto mb-3 opacity-20" />
                      <p className="text-xs font-medium">拖拽标题栏可移动窗口</p>
                      <p className="text-[10px] mt-1 opacity-70">右下角调整大小，避免遮挡正文</p>
                   </div>
                )}

                {chatLogs.map((msg, i) => (
                  <div key={i} ref={el => { messageRefs.current[i] = el; }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-start space-x-2 max-w-[92%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
                      {msg.role !== 'user' && (
                          <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-1 ${
                              msg.content.includes('数据安全说明') ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {msg.content.includes('数据安全说明') ? <ShieldCheck size={14} /> : <Bot size={14} />}
                          </div>
                      )}
                      
                      {msg.role === 'user' && msg.content.includes('[请求全章评估') ? (
                          <div className="text-[10px] text-gray-300 w-full text-center py-2 border-b border-gray-100 mb-2">
                            {new Date().toLocaleTimeString()} · 执行请求
                          </div>
                      ) : (
                          <div className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                            msg.role === 'user' 
                            ? 'bg-amber-50 text-amber-900 border border-amber-100' 
                            : msg.content.includes('数据安全说明') 
                                ? 'bg-blue-50 border border-blue-100 text-gray-700'
                                : 'bg-white border border-gray-100 text-gray-700 shadow-sm'
                          }`}>
                            <div className="whitespace-pre-wrap">{renderText(msg.content)}</div>
                            
                            {msg.role === 'assistant' && !aiLoading && (
                              <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-gray-50/50">
                                {(msg.content.includes("剧情复盘") || msg.content.includes("篇目复盘")) && (
                                    <button 
                                      onClick={() => updateSynopsis(msg.content, 'current')}
                                      className="text-[10px] px-2 py-1 bg-gray-50 text-gray-500 font-bold rounded hover:bg-amber-50 hover:text-amber-600 transition-colors flex items-center border border-gray-100"
                                    >
                                      <FileText size={10} className="mr-1" /> {isAnthology ? '提取篇目梗概' : '提取本章梗概'}
                                    </button>
                                )}
                                {msg.content.includes("下一章方向总结") && !isAnthology && (
                                    <button 
                                      onClick={() => updateSynopsis(msg.content, 'next')}
                                      className="text-[10px] px-2 py-1 bg-gray-50 text-gray-500 font-bold rounded hover:bg-emerald-50 hover:text-emerald-600 transition-colors flex items-center border border-gray-100"
                                    >
                                      <Target size={10} className="mr-1" /> 采纳后续走向
                                    </button>
                                )}
                                {msg.content.includes('数据安全说明') && (
                                    <button
                                        onClick={onExport}
                                        className="text-[10px] px-2 py-1 bg-white text-amber-600 font-bold rounded border border-amber-100 hover:bg-amber-50 transition-colors flex items-center"
                                    >
                                        <Save size={10} className="mr-1" /> 立即备份导出
                                    </button>
                                )}
                              </div>
                            )}
                          </div>
                      )}
                    </div>
                  </div>
                ))}

                {aiLoading && (
                  <div className="flex justify-start pl-9 animate-in fade-in slide-in-from-bottom-2">
                    <div className="bg-gray-50 px-4 py-3 rounded-2xl border border-gray-100 flex items-center space-x-3">
                      <div className="flex space-x-1">
                         <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                         <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                         <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[100px]">{loadingMsg}</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-100 shrink-0">
              <div className="flex items-center space-x-2 bg-gray-50 p-2 rounded-2xl border border-gray-200 focus-within:border-amber-400 focus-within:bg-white transition-colors">
                <textarea 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAiDialogue(userInput);
                      setUserInput('');
                    }
                  }}
                  placeholder="询问具体细节，或输入'本文完结'..."
                  className="flex-grow bg-transparent text-xs p-2 focus:outline-none resize-none h-10 custom-scrollbar placeholder:text-gray-400"
                />
                <button 
                  onClick={() => { handleAiDialogue(userInput); setUserInput(''); }}
                  disabled={!userInput.trim() || aiLoading}
                  className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all disabled:opacity-50 disabled:scale-100 active:scale-95"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>

            {/* Resize Handle */}
            <div 
                onMouseDown={handleMouseDownResize}
                className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 text-gray-300 hover:text-amber-500"
            >
                <div className="w-2 h-2 bg-current rounded-full opacity-50" />
            </div>
        </div>
      )}
    </div>
  );
};

export default Editor;

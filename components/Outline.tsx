
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, GripVertical, Trash2, Download, FileText, Sparkles, Loader2, Info } from 'lucide-react';
import { Chapter, Book, AppSettings, AIConfig } from '../types';
import { GoogleGenAI } from "@google/genai";

interface OutlineProps {
  chapters: Chapter[];
  currentChapterId: string;
  onSelectChapter: (id: string) => void;
  setBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  bookId: string;
  settings: AppSettings;
  bookSummary: string;
  onUpdateSummary: (summary: string) => void;
  isAnthology?: boolean;
}

const TRIAL_LIMIT_REQUESTS = 50;
const EMBEDDED_DEEPSEEK_KEY = "sk-REPLACE_WITH_YOUR_DEEPSEEK_KEY"; // REPLACE THIS!

// Copy helper function to ensure Outline works with generic providers
const fetchOpenAICompatible = async (config: AIConfig, messages: any[]) => {
  // --- TRIAL MODE LOGIC ---
  if (config.provider === 'deepseek-trial') {
      const usage = parseInt(localStorage.getItem('inkflow_trial_usage') || '0');
      if (usage >= TRIAL_LIMIT_REQUESTS) {
          throw new Error(`今日免费额度已领完，请填入自己的 Key 或明天再来。`);
      }
      config.apiKey = EMBEDDED_DEEPSEEK_KEY;
      config.baseUrl = "https://api.deepseek.com";
      config.model = "deepseek-chat"; 
  }
  // ------------------------

  if (!config.apiKey || config.apiKey.includes('REPLACE')) {
     throw new Error("API Key 未配置或试用额度已耗尽");
  }

  let baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  if (baseUrl.endsWith('/chat/completions')) {
    baseUrl = baseUrl.substring(0, baseUrl.length - '/chat/completions'.length);
  }

  const payload: any = {
    model: config.model || 'gpt-3.5-turbo',
    messages: messages
  };

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
  
  // --- SUCCESS: INCREMENT TRIAL USAGE ---
  if (config.provider === 'deepseek-trial') {
      const current = parseInt(localStorage.getItem('inkflow_trial_usage') || '0');
      localStorage.setItem('inkflow_trial_usage', (current + 1).toString());
  }
  
  return data.choices[0]?.message?.content || "";
};

const Outline: React.FC<OutlineProps> = ({ chapters, currentChapterId, onSelectChapter, setBooks, bookId, settings, bookSummary, onUpdateSummary, isAnthology = false }) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  
  // Hover Tooltip State
  const [hoveredSynopsis, setHoveredSynopsis] = useState<{ id: string, text: string, top: number, left: number } | null>(null);
  const synopsisRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const addChapter = () => {
    const nextNum = chapters.length + 1;
    const newId = `chapter-${Date.now()}`;
    const newChapter: Chapter = {
      id: newId,
      title: isAnthology ? '新篇章' : `第 ${nextNum} 章`,
      content: '',
      synopsis: '',
      lastModified: Date.now()
    };
    
    setBooks(prev => prev.map(b => 
      b.id === bookId ? { ...b, chapters: [...b.chapters, newChapter], currentChapterId: newId } : b
    ));
    onSelectChapter(newId);
  };

  const removeChapter = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (chapters.length <= 1) return;
    if (!confirm(isAnthology ? '确定删除这篇作品吗？' : '确定删除该章节吗？内容将无法恢复。')) return;

    setBooks(prev => prev.map(b => {
      if (b.id === bookId) {
        const remaining = b.chapters.filter(c => c.id !== id);
        return { 
          ...b, 
          chapters: remaining,
          currentChapterId: id === b.currentChapterId ? remaining[0].id : b.currentChapterId
        };
      }
      return b;
    }));
  };

  const exportChapter = (e: React.MouseEvent, chapter: Chapter) => {
    e.stopPropagation();
    const text = `${chapter.title}\n\n${chapter.content}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chapter.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateChapterField = (id: string, field: 'title' | 'synopsis', value: string) => {
    setBooks(prev => prev.map(b => {
      if (b.id === bookId) {
        return {
          ...b,
          chapters: b.chapters.map(c => c.id === id ? { ...c, [field]: value } : c)
        };
      }
      return b;
    }));
  };

  const handleGenerateSummary = async () => {
      if (!settings.ai.apiKey && settings.ai.provider !== 'deepseek-trial') return alert("请先在设置中配置 API Key");
      
      setIsGeneratingSummary(true);
      setGenerationError(null);
      
      try {
          // Limit context to save budget
          const sample = chapters.map(c => c.content).join('\n').slice(0, 15000);
          const prompt = isAnthology 
            ? `请阅读以下短篇小说集的内容片段，生成一段 100-300 字的精炼简介，概括这些故事的整体风格、主题共性或精彩之处。文本：${sample}`
            : `请阅读以下小说文本，生成一段 100-300 字的精炼故事简介，概括核心情节和人物关系。文本：${sample}`;
          
          let result = "";

          if (settings.ai.provider === 'gemini') {
              const ai = new GoogleGenAI({ apiKey: settings.ai.apiKey });
              const response = await ai.models.generateContent({
                  model: settings.ai.model || 'gemini-3-flash-preview',
                  contents: prompt,
                  config: { maxOutputTokens: 500 }
              });
              result = response.text || "";
          } else {
              // Use generic provider (or trial)
              result = await fetchOpenAICompatible(settings.ai, [{ role: 'user', content: prompt }]);
          }

          if (result) {
              onUpdateSummary(result);
          } else {
              throw new Error("API 返回为空");
          }
      } catch (e: any) {
          console.error(e);
          let msg = "生成失败，请检查网络";
          const rawMsg = e.message || "";
          
          if (rawMsg.includes('429') || rawMsg.includes('quota') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
              msg = "API 配额不足 (429)";
          } else if (rawMsg.includes('404')) {
              msg = "模型未找到";
          } else if (rawMsg.includes('403')) {
              msg = "鉴权失败";
          } else if (rawMsg.includes('试用') || rawMsg.includes('今日免费额度')) {
              msg = rawMsg; 
          }
          
          setGenerationError(msg);
          // Clear error after 4s
          setTimeout(() => setGenerationError(null), 4000);
      } finally {
          setIsGeneratingSummary(false);
      }
  };

  // Drag handlers...
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    setBooks(prev => prev.map(b => {
      if (b.id === bookId) {
        const newChapters = [...b.chapters];
        const [movedChapter] = newChapters.splice(draggedIndex, 1);
        newChapters.splice(targetIndex, 0, movedChapter);
        return { ...b, chapters: newChapters };
      }
      return b;
    }));
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSynopsisMouseEnter = (id: string, text: string) => {
      // Don't show tooltip if text is empty
      if (!text || text.length < 1) return; 
      
      const el = synopsisRefs.current[id];
      // Don't show tooltip if the input is currently focused (user is editing)
      if (document.activeElement === el) return;

      if (el) {
          // Check if text is truncated or long enough
          // scrollWidth > clientWidth means text is overflowing
          const isOverflowing = el.scrollWidth > el.clientWidth;
          
          // Show if strictly overflowing OR length is long enough (UX safety net)
          if (isOverflowing || text.length > 8) {
             const rect = el.getBoundingClientRect();
             // Adjust position to avoid being covered by mouse
             setHoveredSynopsis({ id, text, top: rect.bottom + 8, left: rect.left });
          }
      }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50/50 relative">
      {/* Header Actions */}
      <div className="flex flex-col p-4 pb-2 border-b border-gray-100 bg-white shrink-0">
        <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
                <FileText size={12} className="mr-1.5" /> {isAnthology ? '篇目列表' : '故事脉络'}
            </span>
            <button 
                onClick={addChapter}
                className="flex items-center space-x-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-black transition-all shadow-lg shadow-gray-200 active:scale-95"
            >
                <Plus size={14} />
                <span>{isAnthology ? '新篇' : '新章'}</span>
            </button>
        </div>
        
        {/* Book Summary Card - HIDE IF ANTHOLOGY */}
        {!isAnthology && (
            <div className={`bg-amber-50 rounded-xl p-3 border text-xs transition-colors ${generationError ? 'border-red-200 bg-red-50' : 'border-amber-100'}`}>
                <div className="flex justify-between items-start mb-2">
                    <span className={`font-bold flex items-center ${generationError ? 'text-red-700' : 'text-amber-800'}`}>
                        <Info size={12} className="mr-1"/> {generationError ? '生成错误' : '全书简介'}
                    </span>
                    <button 
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary}
                        className="text-[10px] bg-white border border-amber-200 text-amber-600 px-2 py-0.5 rounded-md hover:bg-amber-100 transition-colors flex items-center disabled:opacity-50"
                    >
                        {isGeneratingSummary ? <Loader2 size={10} className="animate-spin mr-1"/> : <Sparkles size={10} className="mr-1"/>}
                        {bookSummary ? '重新生成' : 'AI生成'}
                    </button>
                </div>
                <p className={`leading-relaxed min-h-[40px] ${generationError ? 'text-red-500' : 'text-amber-900/70'}`}>
                    {generationError || bookSummary || "暂无简介，点击生成按钮让 AI 通读全书并总结..."}
                </p>
            </div>
        )}
      </div>
      
      {/* Chapters List */}
      <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-2 relative" onDragLeave={() => setDragOverIndex(null)}>
        {chapters.map((chapter, idx) => (
          <div 
            key={chapter.id} 
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelectChapter(chapter.id)}
            className={`group flex flex-col px-3 py-2.5 rounded-lg transition-all border relative overflow-visible ${
              currentChapterId === chapter.id 
              ? 'bg-white border-amber-400 ring-1 ring-amber-500/10 shadow-sm z-10' 
              : 'bg-white border-gray-200 hover:border-amber-300 hover:shadow-sm'
            } ${draggedIndex === idx ? 'opacity-40 scale-95 grayscale' : ''} ${
              dragOverIndex === idx ? 'border-blue-400 bg-blue-50/30 -translate-y-2 z-20 shadow-xl' : ''
            }`}
          >
            <div className="flex items-center">
                <div className={`cursor-grab active:cursor-grabbing text-gray-300 mr-2 transition-colors ${currentChapterId === chapter.id ? 'text-amber-400' : 'group-hover:text-amber-400'}`}>
                    <GripVertical size={14} />
                </div>
                <span className={`text-[10px] font-mono font-bold mr-2 w-5 text-right shrink-0 select-none ${currentChapterId === chapter.id ? 'text-amber-500' : 'text-gray-300'}`}>
                    {String(idx + 1).padStart(2, '0')}
                </span>
                <input 
                    type="text"
                    value={chapter.title}
                    onChange={(e) => updateChapterField(chapter.id, 'title', e.target.value)}
                    onClick={(e) => e.stopPropagation()} 
                    className={`flex-grow bg-transparent text-sm font-bold focus:outline-none focus:bg-amber-50 rounded px-1 transition-colors truncate ${currentChapterId === chapter.id ? 'text-gray-900' : 'text-gray-600'}`}
                />
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                    <button onClick={(e) => exportChapter(e, chapter)} className="p-1 text-gray-300 hover:text-amber-600 hover:bg-amber-50 rounded transition-all"><Download size={12} /></button>
                    <button onClick={(e) => removeChapter(e, chapter.id)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all"><Trash2 size={12} /></button>
                </div>
            </div>
            
            <div className="pl-9 pr-1 mt-1">
                <div 
                    className="flex items-center space-x-2"
                >
                    <input
                        ref={el => { synopsisRefs.current[chapter.id] = el; }}
                        type="text" 
                        value={chapter.synopsis || ''}
                        onChange={(e) => updateChapterField(chapter.id, 'synopsis', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={() => setHoveredSynopsis(null)} // Hide tooltip immediately on edit
                        onMouseEnter={() => handleSynopsisMouseEnter(chapter.id, chapter.synopsis || '')}
                        onMouseLeave={() => setHoveredSynopsis(null)}
                        placeholder={isAnthology ? "一句话主旨..." : "一句话梗概..."}
                        className={`w-full bg-transparent border-b border-dashed border-gray-100 text-[10px] focus:outline-none focus:border-amber-300 focus:bg-amber-50/30 transition-all rounded px-1 h-5 truncate placeholder:text-gray-300 placeholder:italic ${currentChapterId === chapter.id ? 'text-gray-500' : 'text-gray-400'}`}
                        spellCheck={false}
                    />
                </div>
            </div>
            {currentChapterId === chapter.id && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500" />}
          </div>
        ))}
      </div>

      {/* Render tooltip in Portal to escape sidebar stacking context */}
      {hoveredSynopsis && createPortal(
          <div 
            className="fixed z-[9999] pointer-events-none animate-in fade-in zoom-in-95 duration-200 max-w-[280px]"
            style={{ 
                top: hoveredSynopsis.top, 
                left: Math.min(hoveredSynopsis.left, window.innerWidth - 300) // Prevent overflow right
            }}
          >
              <div className="bg-white/95 backdrop-blur-md text-gray-700 text-xs p-3 rounded-xl shadow-xl border border-amber-100 leading-relaxed break-words relative ring-1 ring-black/5">
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-white rotate-45 border-l border-t border-amber-100" />
                  <p className="font-medium">{hoveredSynopsis.text}</p>
              </div>
          </div>,
          document.body
      )}
    </div>
  );
};

export default Outline;

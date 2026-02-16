
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Search, Loader2, ExternalLink, Sparkles, AlertCircle } from 'lucide-react';
import { AppSettings, AIConfig, SearchState } from '../types';

interface SearchViewProps {
  settings?: AppSettings;
  searchState?: SearchState;
  onUpdateSearchState: (state: SearchState) => void;
}

// Consistent error handler
const getFriendlyErrorMessage = (error: any): string => {
  let msg = '';
  if (error instanceof Error) {
    msg = error.message;
  } else if (typeof error === 'object' && error !== null) {
    msg = error.error?.message || error.message || JSON.stringify(error);
  } else {
    msg = String(error);
  }

  if (typeof msg === 'string' && (msg.trim().startsWith('{') || msg.includes('{"error"'))) {
     try {
       const jsonMatch = msg.match(/(\{.*"error".*\})/s) || msg.match(/(\{.*\})/s);
       const jsonStr = jsonMatch ? jsonMatch[0] : msg;
       const parsed = JSON.parse(jsonStr);
       if (parsed.error?.message) msg = parsed.error.message;
       else if (parsed.message) msg = parsed.message;
     } catch (e) {}
  }

  if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('Requested entity was not found')) {
      return "模型未找到 (404)。请在“设置”中检查您的模型名称是否正确。";
  }
  
  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Insufficient Balance')) {
      return 'API 配额已耗尽 (429)。请检查您的 API Key 额度或稍后再试。';
  }

  if (msg.includes('Rpc failed') || msg.includes('xhr error') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return "网络连接失败。请检查：\n1. 网络连接是否正常\n2. 若使用 Gemini，需确保网络环境支持 Google 服务\n3. API Key 是否正确配置";
  }
  if (msg.includes('403') || msg.includes('API key not valid')) {
      return "鉴权失败 (403)。API Key 无效或无权访问该模型，请在设置中重新配置。";
  }
  
  return msg;
};

// Simple text formatter to avoid raw markdown
const formatResultText = (text: string) => {
    let formatted = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Bold
        .replace(/\*(.*?)\*/g, '<i>$1</i>') // Italic
        .replace(/^##\s+(.*$)/gm, '<h3 class="text-sm font-bold text-amber-700 mt-4 mb-2 uppercase tracking-wide">$1</h3>') // H2
        .replace(/^###\s+(.*$)/gm, '<h4 class="text-xs font-bold text-gray-600 mt-2 mb-1">$1</h4>') // H3
        .replace(/\n/g, '<br />'); // Newline
    
    return formatted;
};

const SearchView: React.FC<SearchViewProps> = ({ settings, searchState, onUpdateSearchState }) => {
  const [query, setQuery] = useState(searchState?.query || '');

  // Sync internal query state if prop changes (e.g. book switch)
  useEffect(() => {
      if (searchState) {
          setQuery(searchState.query);
      }
  }, [searchState?.timestamp]); // Use timestamp as signal of fresh state

  const handleSearch = async () => {
    if (!query.trim()) return;

    // Update state to loading
    onUpdateSearchState({
        query,
        resultHTML: '',
        sources: [],
        isSearching: true,
        timestamp: Date.now()
    });
    
    const aiConfig: AIConfig = settings?.ai || { provider: 'gemini', apiKey: '', baseUrl: '', model: '' };

    try {
      if (aiConfig.provider === 'gemini') {
        const key = aiConfig.apiKey || process.env.API_KEY;
        if (!key) throw new Error("未配置 Gemini API Key");

        const ai = new GoogleGenAI({ apiKey: key });
        
        // Using Grounding
        const response = await ai.models.generateContent({
          model: aiConfig.model || "gemini-3-flash-preview",
          contents: `作为一个小说资料检索助手，请针对以下主题提供详尽的创作背景资料、历史知识或器物设定：${query}。请直接输出排版好的内容，不要使用Markdown代码块，使用常规文本，重点部分加粗。`,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const text = response.text || "未能获取检索结果。";
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        
        onUpdateSearchState({
            query,
            resultHTML: formatResultText(text),
            sources,
            isSearching: false,
            timestamp: Date.now()
        });

      } else {
          throw new Error("目前仅 Gemini 模型支持实时联网检索，请在设置中切换。");
      }
    } catch (err: any) {
      console.error("Search error:", err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      onUpdateSearchState({
          query,
          resultHTML: `<div class="text-red-500 font-bold">检索遇到困难: ${friendlyMsg}</div>`,
          sources: [],
          isSearching: false,
          timestamp: Date.now()
      });
    }
  };

  return (
    <div className="p-4 flex flex-col h-full bg-inherit">
      {/* Search Header */}
      <div className="mb-4">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center mb-3">
            <Sparkles size={12} className="mr-2 text-amber-500" /> AI 智能资料库
        </h3>
        <div className="relative">
            <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="输入历史背景、器物知识或设定..."
            className="w-full pl-10 pr-12 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm transition-all"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={18} />
            </div>
            <button 
            onClick={handleSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors shadow-sm active:scale-95"
            >
            <Sparkles size={14} />
            </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {searchState?.isSearching ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 animate-in fade-in zoom-in duration-300">
            <div className="relative mb-6">
                <Loader2 className="animate-spin text-amber-500" size={40} />
                <Sparkles size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-300 animate-pulse" />
            </div>
            <p className="text-sm font-medium">AI 正在深度检索与分析资料...</p>
            <p className="text-xs text-gray-300 mt-2">您可以切换到其他页面，搜索将在后台继续</p>
          </div>
        ) : searchState?.resultHTML ? (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className={`p-5 rounded-2xl border shadow-sm ${searchState.resultHTML.includes('困难') ? 'bg-red-50 border-red-100' : 'bg-amber-50/50 border-amber-100'}`}>
              <h3 className={`text-xs font-black uppercase mb-4 flex items-center tracking-widest ${searchState.resultHTML.includes('困难') ? 'text-red-600' : 'text-amber-600'}`}>
                {searchState.resultHTML.includes('困难') ? <AlertCircle size={14} className="mr-2" /> : <Sparkles size={14} className="mr-2" />}
                {searchState.resultHTML.includes('困难') ? '检索受阻' : '智能检索分析'}
              </h3>
              {/* Use dangerouslySetInnerHTML for formatted text */}
              <div 
                className="text-sm text-gray-700 leading-relaxed font-serif"
                dangerouslySetInnerHTML={{ __html: searchState.resultHTML }} 
              />
            </div>

            {searchState.sources && searchState.sources.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-gray-400 px-1 uppercase tracking-widest">溯源资料库</h4>
                <div className="grid gap-2">
                    {searchState.sources.map((src: any, i: number) => (
                    src.web && (
                        <a 
                        key={i} 
                        href={src.web.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="group flex items-start p-3 bg-white border border-gray-100 rounded-xl hover:border-amber-300 hover:shadow-md transition-all active:scale-[0.98]"
                        >
                        <div className="flex-grow mr-2 overflow-hidden">
                            <p className="text-xs font-bold text-gray-700 line-clamp-1 group-hover:text-amber-700 transition-colors">{src.web.title || "互联网文献资料"}</p>
                            <p className="text-[10px] text-gray-400 mt-1 line-clamp-1 italic">{src.web.uri}</p>
                        </div>
                        <ExternalLink size={12} className="text-gray-300 mt-1 shrink-0 group-hover:text-amber-500" />
                        </a>
                    )
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <div className={`mx-auto w-16 h-16 rounded-3xl flex items-center justify-center mb-6 border-2 border-dashed border-gray-100 text-gray-200`}>
              <Sparkles size={32} />
            </div>
            <h4 className="text-sm font-bold text-gray-400 mb-2">
                博采众长，文思泉涌
            </h4>
            <p className="text-xs text-gray-300 font-light italic leading-relaxed max-w-[200px] mx-auto">
                输入小说中涉及的专业名词、历史背景或地理设定，AI 将为您联网检索并整理相关资料。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchView;

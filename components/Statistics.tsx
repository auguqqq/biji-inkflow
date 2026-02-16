
import React, { useMemo, useState, useEffect } from 'react';
import { WritingStats, Book, AppSettings } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import { BrainCircuit, Loader2, Sparkles, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface StatisticsProps {
  stats: WritingStats;
  book?: Book;
  settings?: AppSettings;
  onUpdateBook?: (field: keyof Book, value: any) => void;
}

interface AnalysisData {
  rhythm?: { chapter: number; tension: number; label: string }[];
  characters?: { name: string; role: string; prominence: number }[];
  keywords?: { word: string; count: number }[];
}

const Statistics: React.FC<StatisticsProps> = ({ stats, book, settings, onUpdateBook }) => {
  const [showReportModal, setShowReportModal] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(book?.analysisReport?.data || null);
  const [reportText, setReportText] = useState<string>(book?.analysisReport?.text || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state if prop changes (e.g. re-open sidebar)
  useEffect(() => {
      if (book?.analysisReport) {
          setAnalysisData(book.analysisReport.data || null);
          setReportText(book.analysisReport.text || '');
      }
  }, [book?.analysisReport]);

  // Generate last 7 days chart data
  const chartData = useMemo(() => {
    const data = [];
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      data.push({
        name: days[d.getDay()],
        count: stats.writingHistory[key] || 0,
        key
      });
    }
    return data;
  }, [stats.writingHistory]);

  const streak = useMemo(() => {
    let count = 0;
    const now = new Date();
    const todayKey = now.toISOString().split('T')[0];
    let currentKey = todayKey;
    let d = new Date(now);

    if (stats.writingHistory[todayKey]) {
      count = 1;
    } else {
      d.setDate(d.getDate() - 1);
      currentKey = d.toISOString().split('T')[0];
      if (!stats.writingHistory[currentKey]) return 0;
      count = 0;
    }

    while (stats.writingHistory[currentKey] > 0) {
      if (currentKey !== todayKey) count++;
      d.setDate(d.getDate() - 1);
      currentKey = d.toISOString().split('T')[0];
    }
    return count;
  }, [stats.writingHistory]);

  const generateReport = async () => {
    if (!settings?.ai?.apiKey || !book) {
        setErrorMsg("请先在设置中配置 API Key");
        return;
    }
    
    setIsAnalyzing(true);
    setErrorMsg(null);
    setReportText("");
    setAnalysisData(null);

    try {
        const chapters = book.chapters || [];
        const sampleText = chapters.map(c => `[Chapter ${c.title}]: ${c.content.slice(0, 800)}`).join('\n').slice(0, 20000); 
        
        const key = settings.ai.apiKey;
        const ai = new GoogleGenAI({ apiKey: key });
        const modelName = settings.ai.model || 'gemini-3-flash-preview';

        const prompt = `
        As a professional novel editor, please analyze the following novel text.
        
        PART 1: TEXTUAL REPORT (in Markdown, Chinese)
        - Analyze the pacing, character development, and main conflicts.
        - Give specific advice on how to improve the hook and retention rate.
        - Be critical and constructive.
        
        PART 2: DATA VISUALIZATION (JSON Block)
        - After the text report, output a single JSON code block enclosed in \`\`\`json ... \`\`\`.
        - The JSON must have these fields:
          - "rhythm": array of { chapter (number), tension (0-100), label (string) }
          - "characters": array of { name, role, prominence (0-100) }
          - "keywords": array of { word, count (0-100) }

        Text sample:
        ${sampleText}
        `;

        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt
        });

        if (response.text) {
            let fullText = response.text;
            let jsonPart = null;
            let mdPart = fullText;

            // Extract JSON block if exists
            const jsonMatch = fullText.match(/```json([\s\S]*?)```/);
            if (jsonMatch) {
                try {
                    jsonPart = JSON.parse(jsonMatch[1]);
                    // Remove the JSON block from display text to keep it clean
                    mdPart = fullText.replace(jsonMatch[0], '').trim();
                } catch (e) {
                    console.warn("Failed to parse visual data JSON", e);
                }
            }
            
            setReportText(mdPart);
            setAnalysisData(jsonPart);

            // Persist to Book
            if (onUpdateBook) {
                onUpdateBook('analysisReport', {
                    text: mdPart,
                    data: jsonPart,
                    timestamp: Date.now()
                });
            }

        } else {
            throw new Error("Analysis failed to produce data");
        }
    } catch (e: any) {
        let msg = e.message || "未知错误";
        // Attempt to parse JSON error from message if present
        if (msg.includes('{')) {
             try {
                 const jsonPart = msg.match(/\{.*\}/s);
                 if (jsonPart) {
                     const parsed = JSON.parse(jsonPart[0]);
                     if (parsed.error?.message) msg = parsed.error.message;
                 }
             } catch {}
        }
        if (msg.includes('404') || msg.includes('NOT_FOUND')) msg = "模型未找到 (404)。请检查设置。";
        else if (msg.includes('403')) msg = "鉴权失败 (403)。请检查 API Key。";
        else if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) msg = "API 配额耗尽 (429)。请稍后再试或升级 Key。";
        
        setErrorMsg(msg);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleOpenReport = () => {
      setShowReportModal(true);
      // If we don't have report data, start generation? 
      // User requested "allow user to do other things", so maybe we don't auto-start blocking.
      // But modal is separate. Let's auto-start if empty.
      if (!reportText && !analysisData && !isAnalyzing) {
          generateReport();
      }
  };

  // Simple Markdown Renderer
  const renderMarkdown = (text: string) => {
      return text.split('\n').map((line, i) => {
          if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-bold mt-4 mb-2 text-gray-700">{line.replace('### ', '')}</h4>;
          if (line.startsWith('## ')) return <h3 key={i} className="text-base font-black mt-6 mb-3 text-gray-800 border-b pb-1">{line.replace('## ', '')}</h3>;
          if (line.startsWith('- ')) return <li key={i} className="ml-4 text-xs text-gray-600 leading-relaxed list-disc">{line.replace('- ', '')}</li>;
          if (line.trim() === '') return <br key={i} />;
          return <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1">{line.replace(/\*\*(.*?)\*\*/g, (_, p1) => p1)}</p>; // Simple bold strip or could implement bold rendering
      });
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 space-y-8 flex flex-col">
      {/* Basic Stats Grid */}
      <div className="grid grid-cols-2 gap-4 shrink-0">
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
          <p className="text-xs text-amber-600 font-bold uppercase tracking-wider mb-1">今日累计</p>
          <p className="text-3xl font-bold text-amber-900">{stats.dailyCount}</p>
          <p className="text-xs text-amber-500 mt-1">有效汉字</p>
        </div>
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
          <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-1">连续创作</p>
          <p className="text-3xl font-bold text-emerald-900">{streak}</p>
          <p className="text-xs text-emerald-500 mt-1">坚持天数</p>
        </div>
      </div>

      {/* Main Chart */}
      <div className="shrink-0">
        <h3 className="text-sm font-bold text-gray-500 mb-4 px-1">本周产量趋势</h3>
        <div className="h-64 w-full min-h-[200px]"> 
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#9ca3af' }} />
              <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#9ca3af' }} />
              <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 6 ? '#d97706' : '#d1d5db'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex-grow" />

      {/* Deep Analysis Button */}
      <div className="pt-6 border-t border-gray-100 shrink-0">
         <button 
            onClick={handleOpenReport}
            className="w-full py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl transition-all border border-purple-100 hover:border-purple-200 flex items-center justify-center space-x-2 group"
         >
            <BrainCircuit size={18} className="group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm">生成深度创作可视报告</span>
         </button>
      </div>

      {/* Visual Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl h-[85vh] rounded-2xl shadow-2xl flex flex-col relative overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div className="flex items-center space-x-2 text-purple-700">
                        <BrainCircuit size={20} />
                        <h3 className="font-bold text-base">深度创作可视报告 (AI)</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                        {book?.analysisReport?.timestamp && (
                            <span className="text-[10px] text-gray-400">
                                上次更新: {new Date(book.analysisReport.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        )}
                        <button onClick={() => setShowReportModal(false)} className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-grow p-6 overflow-y-auto custom-scrollbar bg-white">
                    {isAnalyzing ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                            <Loader2 size={40} className="animate-spin text-purple-500" />
                            <p className="font-medium text-gray-600">AI 正在深度阅读与建模...</p>
                            <p className="text-xs text-gray-400">您可以关闭窗口，分析将在后台保存</p>
                        </div>
                    ) : errorMsg ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                            <AlertTriangle size={32} className="text-red-500 mb-4" />
                            <p className="text-sm text-gray-500 mb-4">{errorMsg}</p>
                            <button onClick={generateReport} className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold">重试</button>
                        </div>
                    ) : (reportText || analysisData) ? (
                        <div className="space-y-8 pb-10">
                            {/* Text Report */}
                            {reportText && (
                                <div className="prose prose-sm max-w-none text-gray-700">
                                    {renderMarkdown(reportText)}
                                </div>
                            )}
                            
                            {/* Visuals Divider */}
                            {analysisData && (
                                <div className="flex items-center space-x-2 text-gray-300 py-4">
                                    <div className="h-px bg-gray-200 flex-grow" />
                                    <span className="text-[10px] uppercase font-bold tracking-widest">数据可视化</span>
                                    <div className="h-px bg-gray-200 flex-grow" />
                                </div>
                            )}

                            {/* Charts */}
                            {analysisData && (
                                <div className="grid gap-6">
                                    {/* Rhythm Heatmap */}
                                    {analysisData.rhythm && Array.isArray(analysisData.rhythm) && analysisData.rhythm.length > 0 && (
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">章节节奏热力图</h4>
                                            <div className="h-48 w-full">
                                                <ResponsiveContainer>
                                                    <LineChart data={analysisData.rhythm}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                                        <XAxis dataKey="chapter" hide />
                                                        <Tooltip labelFormatter={(v) => `第 ${v} 部分`} />
                                                        <Line type="monotone" dataKey="tension" stroke="#8b5cf6" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}

                                    {/* Character Network */}
                                    {analysisData.characters && Array.isArray(analysisData.characters) && analysisData.characters.length > 0 && (
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">核心角色权重</h4>
                                            <div className="space-y-4">
                                                {analysisData.characters.map((char, i) => (
                                                    <div key={i}>
                                                        <div className="flex justify-between text-xs font-bold mb-1">
                                                            <span className="text-gray-700">{char.name || '未知角色'} <span className="text-gray-400 font-normal">({char.role || '配角'})</span></span>
                                                            <span className="text-purple-600">{char.prominence || 0}%</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                                                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, char.prominence || 0))}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Word Cloud */}
                                    {analysisData.keywords && Array.isArray(analysisData.keywords) && analysisData.keywords.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">主题词云</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {analysisData.keywords.map((kw, i) => (
                                                    <span 
                                                        key={i} 
                                                        className="px-4 py-2 rounded-full font-bold text-white shadow-sm"
                                                        style={{
                                                            backgroundColor: `hsl(${260 + i * 10}, 70%, ${60 - ((kw.count || 0) / 100) * 20}%)`,
                                                            fontSize: `${Math.max(10, 10 + ((kw.count || 0) / 5))}px`
                                                        }}
                                                    >
                                                        {kw.word || '...'}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-300">
                            <Sparkles size={40} className="mb-4 opacity-20" />
                            <p className="text-sm font-bold">点击下方按钮开始分析</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
                    <button 
                        onClick={generateReport}
                        disabled={isAnalyzing}
                        className="flex items-center space-x-1 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 hover:text-purple-600 transition-colors"
                    >
                        <RefreshCw size={14} className={isAnalyzing ? "animate-spin" : ""} />
                        <span>{reportText ? '重新生成分析' : '开始深度评估'}</span>
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Statistics;


import React, { useState, useEffect } from 'react';
import { AppSettings, AIConfig } from '../types';
import { Type, Layout, Settings, Palette, Save, Monitor, Bot, Key, Globe, Box, Mail, Info, Crown, Star, Check, Heart, Sparkles, Battery } from 'lucide-react';

interface SettingsViewProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onProAction: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, setSettings, onProAction }) => {
  // Ensure ai settings object exists
  const aiSettings = settings.ai || { provider: 'gemini', apiKey: '', baseUrl: '', model: '' };
  
  const [trialUsage, setTrialUsage] = useState(0);
  const TRIAL_LIMIT = 50; // Total free requests per device

  useEffect(() => {
      const usage = parseInt(localStorage.getItem('inkflow_trial_usage') || '0');
      setTrialUsage(usage);
  }, []);

  const updateSetting = (key: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateAISetting = (key: keyof AIConfig, value: string) => {
    setSettings(prev => ({
      ...prev,
      ai: { ...prev.ai, [key]: value }
    }));
  };

  const handleProviderChange = (provider: AIConfig['provider']) => {
    const defaults: Record<string, Partial<AIConfig>> = {
      gemini: { baseUrl: '', model: 'gemini-2.0-flash' },
      deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
      custom: { baseUrl: '', model: '' },
      'deepseek-trial': { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'TRIAL_MODE' }
    };
    
    setSettings(prev => ({
      ...prev,
      ai: {
        ...prev.ai,
        provider,
        ...defaults[provider]
      }
    }));
  };

  return (
    <div className="p-6 space-y-8 h-full overflow-y-auto pb-20 custom-scrollbar">
      
      {/* Membership Plan */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-amber-600 uppercase tracking-widest flex items-center">
          <Heart size={14} className="mr-2" />
          赞助计划 (Sponsorship)
        </h3>
        <div className={`p-6 rounded-2xl border transition-all relative overflow-hidden ${settings.isPro ? 'bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 text-white' : 'bg-white border-amber-100'}`}>
           {/* Background Decoration */}
           <div className="absolute top-0 right-0 p-8 opacity-10">
              <Star size={120} />
           </div>

           <div className="relative z-10">
              <div className="flex justify-between items-start mb-4">
                 <div>
                    <h2 className="text-xl font-black serif tracking-wide">
                        {settings.isPro ? '感谢您的赞助！' : '支持独立开发'}
                    </h2>
                    <p className={`text-xs mt-1 font-medium ${settings.isPro ? 'text-amber-400' : 'text-gray-500'}`}>
                        {settings.isPro ? '您已解锁所有高级功能，祝创作愉快。' : '小额赞助即可永久解锁白噪音、云同步与高级导出功能。'}
                    </p>
                 </div>
                 {settings.isPro && <div className="px-3 py-1 bg-amber-500 text-black text-[10px] font-black uppercase rounded-full">Pro Active</div>}
              </div>

              <div className="space-y-2 mb-6">
                 {[
                   '沉浸式白噪音 (风声/雨声/机械键盘)',
                   '高级导出 (EPUB/PDF/Markdown)',
                   '多端云同步 (即将上线)',
                   '长篇/短篇分流创作 (开发中)'
                 ].map((feat, i) => (
                    <div key={i} className="flex items-center space-x-2">
                        <div className={`rounded-full p-0.5 ${settings.isPro ? 'bg-amber-500 text-black' : 'bg-amber-100 text-amber-600'}`}>
                            <Check size={10} strokeWidth={3} />
                        </div>
                        <span className={`text-xs font-bold ${settings.isPro ? 'text-gray-300' : 'text-gray-600'}`}>{feat}</span>
                    </div>
                 ))}
              </div>

              {!settings.isPro && (
                <div className="flex items-center justify-between bg-black/5 p-2 rounded-xl border border-black/5">
                    <span className="text-xs font-bold ml-2 text-gray-500">¥3.00 / 永久赞助</span>
                    <button 
                    onClick={onProAction}
                    className="px-4 py-1.5 rounded-lg text-xs font-black transition-all bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-600/30"
                    >
                        成为赞助者
                    </button>
                </div>
              )}
           </div>
        </div>
      </section>

      {/* AI Assistant Configuration */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
          <Bot size={14} className="mr-2" />
          AI 助手配置 (BYOK)
        </h3>
        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm space-y-5">
           <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-800 leading-relaxed border border-amber-100/50">
              {aiSettings.provider === 'deepseek-trial' ? (
                  <span className="flex items-center text-emerald-600 font-bold">
                      <Sparkles size={14} className="mr-1" /> 当前为免费体验模式。内置 DeepSeek V3 模型。
                  </span>
              ) : (
                  "您可以配置自己的 API Key 以获得更稳定、更强大的 AI 辅助体验。支持 DeepSeek、OpenAI、豆包等兼容接口。Key 仅存储在本地浏览器。"
              )}
           </div>
           
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[
                { id: 'deepseek-trial', name: 'DeepSeek (免费试用)', desc: '内置额度 · 极速体验' },
                { id: 'gemini', name: 'Gemini', desc: 'Google 官方' },
                { id: 'deepseek', name: 'DeepSeek (自填Key)', desc: '深度求索' },
                { id: 'openai', name: 'OpenAI (自填Key)', desc: 'GPT-4 等' },
                { id: 'custom', name: '自定义 / 豆包', desc: '兼容接口' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id as any)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    aiSettings.provider === p.id 
                    ? 'border-amber-500 bg-amber-50 text-amber-900' 
                    : 'border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                      <div className="text-xs font-bold">{p.name}</div>
                      {p.id === 'deepseek-trial' && <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-bold">推荐</span>}
                  </div>
                  <div className="text-[10px] opacity-70">{p.desc}</div>
                </button>
              ))}
           </div>

           {aiSettings.provider === 'deepseek-trial' ? (
               <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                   <div className="flex justify-between items-end mb-2">
                       <label className="text-xs font-bold text-gray-600 flex items-center">
                           <Battery size={14} className={`mr-1 ${trialUsage >= TRIAL_LIMIT ? 'text-red-500' : 'text-emerald-500'}`} /> 
                           本设备体验额度
                       </label>
                       <span className="text-xs font-bold text-gray-500">{trialUsage} / {TRIAL_LIMIT} 次对话</span>
                   </div>
                   <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                       <div 
                         className={`h-full transition-all duration-500 ${trialUsage >= TRIAL_LIMIT ? 'bg-red-500' : 'bg-emerald-500'}`} 
                         style={{ width: `${Math.min(100, (trialUsage / TRIAL_LIMIT) * 100)}%` }} 
                       />
                   </div>
                   <p className="text-[10px] text-gray-400 mt-2">
                       {trialUsage >= TRIAL_LIMIT 
                        ? "试用额度已耗尽。请切换到其他模式并填入您自己的 API Key 继续使用。" 
                        : "由 DeepSeek V3 提供技术支持。"}
                   </p>
               </div>
           ) : (
               <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center"><Key size={12} className="mr-1"/> API Key</label>
                    <input 
                      type="password"
                      value={aiSettings.apiKey}
                      onChange={(e) => updateAISetting('apiKey', e.target.value)}
                      placeholder={aiSettings.provider === 'gemini' ? "留空使用内置 Key，或填入您的 Key" : "sk-..."}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                    />
                  </div>

                  {aiSettings.provider !== 'gemini' && (
                    <div>
                      <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center"><Globe size={12} className="mr-1"/> API Base URL</label>
                      <input 
                        type="text"
                        value={aiSettings.baseUrl}
                        onChange={(e) => updateAISetting('baseUrl', e.target.value)}
                        placeholder="例如: https://api.deepseek.com (勿包含 /chat/completions)"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center"><Box size={12} className="mr-1"/> 模型名称 (Model Name)</label>
                    <input 
                      type="text"
                      value={aiSettings.model}
                      onChange={(e) => updateAISetting('model', e.target.value)}
                      placeholder={aiSettings.provider === 'deepseek' ? 'deepseek-chat' : (aiSettings.provider === 'gemini' ? 'gemini-3-flash-preview' : 'gpt-4o')}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                    />
                  </div>
               </div>
           )}
        </div>
      </section>

      {/* 界面主题 */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
          <Palette size={14} className="mr-2" />
          阅读配色
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[
            { id: 'system', name: '随动系统', icon: <Monitor size={14} />, bg: 'bg-gray-200', border: 'border-gray-300' },
            { id: 'cream', name: '象牙白', bg: 'bg-[#f8f5f0]', border: 'border-amber-200' },
            { id: 'white', name: '纯白', bg: 'bg-white', border: 'border-gray-200' },
            { id: 'green', name: '护眼绿', bg: 'bg-[#e8f5e9]', border: 'border-green-200' },
            { id: 'dark', name: '水墨黑', bg: 'bg-[#1a1a1a]', border: 'border-gray-800' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => updateSetting('theme', t.id)}
              className={`p-3 rounded-xl border-2 transition-all flex items-center space-x-3 ${
                settings.theme === t.id ? 'border-amber-500 shadow-sm bg-amber-50/10' : 'border-transparent bg-gray-50'
              }`}
            >
              <div className={`w-6 h-6 rounded-full ${t.bg} border ${t.border} flex items-center justify-center`}>
                {t.id === 'system' && <Monitor size={10} className="text-gray-500" />}
              </div>
              <span className={`text-xs font-bold ${settings.theme === t.id ? 'text-amber-700' : 'text-gray-500'}`}>
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 字体排版 */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
          <Type size={14} className="mr-2" />
          排版设置
        </h3>
        
        <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-bold text-gray-600">字体大小 ({settings.fontSize}px)</label>
            </div>
            <input 
              type="range" min="14" max="32" step="1"
              value={settings.fontSize}
              onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
              className="w-full accent-amber-600"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-bold text-gray-600">行间距 ({settings.lineHeight})</label>
            </div>
            <input 
              type="range" min="1.4" max="2.4" step="0.1"
              value={settings.lineHeight}
              onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
              className="w-full accent-amber-600"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-gray-600">字体族</span>
            <div className="flex bg-white rounded-lg p-1 border border-gray-200">
              <button 
                onClick={() => updateSetting('fontFamily', 'serif')}
                className={`px-3 py-1 text-xs rounded-md transition-all ${settings.fontFamily === 'serif' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400'}`}
              >
                衬线
              </button>
              <button 
                onClick={() => updateSetting('fontFamily', 'sans')}
                className={`px-3 py-1 text-xs rounded-md transition-all ${settings.fontFamily === 'sans' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400'}`}
              >
                无衬线
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 系统偏好 */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
          <Settings size={14} className="mr-2" />
          系统偏好
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center space-x-3">
              <Save size={16} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-600">自动保存间隔</span>
            </div>
            <select 
              value={settings.autoSaveInterval}
              onChange={(e) => updateSetting('autoSaveInterval', parseInt(e.target.value))}
              className="bg-transparent text-xs font-bold text-amber-600 focus:outline-none"
            >
              <option value={30}>30秒</option>
              <option value={60}>1分钟</option>
              <option value={300}>5分钟</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center space-x-3">
              <Layout size={16} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-600">保存时自动排版</span>
            </div>
            <button 
              onClick={() => updateSetting('autoFormatOnSave', !settings.autoFormatOnSave)}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.autoFormatOnSave ? 'bg-amber-600' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.autoFormatOnSave ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>
      </section>

      {/* 问题反馈 */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
          <Mail size={14} className="mr-2" />
          关于与反馈
        </h3>
        <div className="bg-gradient-to-br from-gray-50 to-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div>
                  <div className="text-sm font-bold text-gray-800 flex items-center">
                    <Info size={14} className="mr-1.5 text-amber-500" />
                    笔纪 Inkflow Studio
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1 pl-5">版本 v1.3.1 · 让创作更自由</div>
              </div>
              <a 
                  href="mailto:kingkingaugust@foxmail.com?subject=笔纪App反馈"
                  className="flex items-center space-x-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition-all border border-amber-100 hover:border-amber-200 shadow-sm active:scale-95"
              >
                  <Mail size={14} />
                  <span className="text-xs font-bold">邮件反馈</span>
              </a>
            </div>
            <div className="text-[10px] text-gray-400 pl-5 leading-relaxed">
               遇到 BUG 或有新功能建议？欢迎随时联系我们。<br/>
               官方邮箱: <span className="font-mono text-gray-600 select-all cursor-text">kingkingaugust@foxmail.com</span>
            </div>
        </div>
      </section>
    </div>
  );
};

export default SettingsView;

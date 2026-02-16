
import React, { useState, useEffect, useLayoutEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

interface Step {
  target: string;
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const TOUR_STEPS: Step[] = [
  {
    target: 'center',
    title: '欢迎来到 笔纪',
    content: '我们希望这里是您创意的僚机，而非批量生产文章的工厂。AI 将辅助您打磨灵感，但故事的灵魂始终属于您。祝您码字愉快！',
    placement: 'center'
  },
  {
    target: '#nav-bookshelf',
    title: '书架管理',
    content: '在这里管理您的所有作品。系统会自动统计全书字数和章节信息，井井有条。',
    placement: 'right'
  },
  {
    target: '#editor-area',
    title: '专注创作区',
    content: '这是您的主战场。界面极简，支持一键智能排版（段首缩进）。每隔几秒自动保存，请安心创作。',
    placement: 'center'
  },
  {
    target: '#ai-assistant-toggle',
    title: 'AI 智能责编',
    content: '✨ 点击这里展开侧边面板。它可以帮您复盘剧情、润色文笔，甚至在卡文时提供后续情节建议，是您忠实的读者和顾问。',
    placement: 'left'
  },
  {
    target: '#nav-outline',
    title: '大纲与工具箱',
    content: '切换右侧面板，访问章节大纲、创作统计、灵感便签、历史版本回溯等实用工具。',
    placement: 'right'
  },
  {
    target: '#nav-focus',
    title: '小黑屋模式',
    content: '拖延症克星。强制锁定屏幕，设定字数或时间目标，不达标无法退出，助您进入心流状态。',
    placement: 'right'
  },
  {
    target: '#nav-settings',
    title: '个性化设置',
    content: '配置您的 AI API Key，调整字体大小、主题配色和排版偏好。',
    placement: 'right'
  }
];

const STORAGE_KEY = 'inkflow_tour_completed_v2';

const OnboardingTour: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const hasSeen = localStorage.getItem(STORAGE_KEY);
    if (!hasSeen) {
      setTimeout(() => setIsActive(true), 1000);
    }
  }, []);

  const handleFinish = () => {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const handleSkip = () => {
    if (confirm('确定要跳过新手引导吗？')) {
      handleFinish();
    }
  };

  const currentStepData = TOUR_STEPS[currentStep];

  useLayoutEffect(() => {
    if (!isActive) return;

    const updatePosition = () => {
      const targetSelector = currentStepData.target;
      if (targetSelector === 'center') {
        setRect(null);
        return;
      }

      const el = document.querySelector(targetSelector);
      if (el) {
        // Calculate visibility
        const r = el.getBoundingClientRect();
        const isVisible = (
          r.top >= 0 &&
          r.left >= 0 &&
          r.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          r.right <= (window.innerWidth || document.documentElement.clientWidth)
        );

        // Only scroll if strictly necessary to avoid layout shifts (white background bleed)
        // Use 'nearest' to prevent aggressive centering that pulls the page up
        if (!isVisible) {
             el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        }
        
        // Re-measure after potential scroll
        const rUpdated = el.getBoundingClientRect();
        
        // Add padding to highlight box
        setRect({
          ...rUpdated,
          top: rUpdated.top - 8,
          left: rUpdated.left - 8,
          width: rUpdated.width + 16,
          height: rUpdated.height + 16,
          bottom: rUpdated.bottom + 8,
          right: rUpdated.right + 8,
          x: rUpdated.x - 8,
          y: rUpdated.y - 8,
          toJSON: () => {}
        });
      } else {
        // Fallback if element not found
        setRect(null);
      }
    };

    // Delay slightly to ensure layout is stable
    const timer = setTimeout(updatePosition, 50);
    window.addEventListener('resize', updatePosition);
    return () => {
        window.removeEventListener('resize', updatePosition);
        clearTimeout(timer);
    };
  }, [currentStep, isActive, currentStepData]);

  if (!isActive) return null;

  const isGlobalCenter = !rect || currentStepData.target === 'center';

  // --- Safe Positioning Logic ---
  let tooltipStyle: React.CSSProperties = {};

  if (isGlobalCenter || currentStepData.placement === 'center') {
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 10000
    };
  } else if (rect) {
    const placement = currentStepData.placement || 'bottom';
    const gap = 16;
    const tooltipWidth = 320; 
    const estTooltipHeight = 280; 
    const padding = 20; 

    let top: number | undefined;
    let left: number | undefined;
    let bottom: number | undefined;

    switch (placement) {
      case 'right':
        top = rect.top;
        left = rect.right + gap;
        break;
      case 'left':
        top = rect.top;
        left = rect.left - tooltipWidth - gap;
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        break;
      case 'top':
        bottom = window.innerHeight - rect.top + gap;
        left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        break;
    }

    // Boundary Protection
    if (left !== undefined) {
       if (left < padding) left = padding;
       if (left + tooltipWidth > window.innerWidth - padding) {
           left = window.innerWidth - tooltipWidth - padding;
       }
    }

    if (top !== undefined) {
        // Check vertical overflow
        if (top < padding) top = padding;
        const projectedBottom = top + estTooltipHeight;
        if (projectedBottom > window.innerHeight - padding) {
            // If bottom overflows, try to flip to 'top' placement logic relative to rect
            // But here simply clamping or adjusting top:
            top = Math.max(padding, window.innerHeight - estTooltipHeight - padding);
        }
    }

    tooltipStyle = {
        position: 'absolute',
        left: left,
        top: top,
        bottom: bottom,
        width: tooltipWidth
    };
  }

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden pointer-events-none">
      <div className="absolute inset-0 pointer-events-auto">
        {isGlobalCenter ? (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-500" />
        ) : (
            <div className="absolute inset-0">
                <svg className="w-full h-full text-black/60 fill-current backdrop-blur-[1px]">
                    <path d={`
                        M0,0 H${window.innerWidth} V${window.innerHeight} H0 Z
                        M${rect!.left},${rect!.top} 
                        h${rect!.width} 
                        v${rect!.height} 
                        h-${rect!.width} 
                        Z
                    `} fillRule="evenodd" />
                </svg>
                <div 
                    className="absolute border-2 border-amber-500 rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-pulse"
                    style={{
                        top: rect!.top,
                        left: rect!.left,
                        width: rect!.width,
                        height: rect!.height
                    }}
                />
            </div>
        )}
      </div>

      <div 
        className="bg-white rounded-2xl shadow-2xl p-6 border border-amber-100 flex flex-col pointer-events-auto"
        style={tooltipStyle}
      >
        <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-black text-gray-800 flex items-center">
                {currentStep === 0 && <Sparkles className="text-amber-500 mr-2" size={20} />}
                {currentStepData.title}
            </h3>
            <button onClick={handleSkip} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={16} />
            </button>
        </div>
        
        <p className="text-sm text-gray-600 leading-relaxed mb-6">
            {currentStepData.content}
        </p>

        <div className="flex items-center justify-between mt-auto">
            <div className="flex space-x-1">
                {TOUR_STEPS.map((_, idx) => (
                    <div 
                        key={idx} 
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === currentStep ? 'bg-amber-500' : 'bg-gray-200'}`}
                    />
                ))}
            </div>
            
            <div className="flex space-x-2">
                {currentStep > 0 && (
                    <button 
                        onClick={() => setCurrentStep(prev => prev - 1)}
                        className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        上一步
                    </button>
                )}
                <button 
                    onClick={() => {
                        if (currentStep < TOUR_STEPS.length - 1) {
                            setCurrentStep(prev => prev + 1);
                        } else {
                            handleFinish();
                        }
                    }}
                    className="px-4 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-black transition-all shadow-lg flex items-center"
                >
                    {currentStep < TOUR_STEPS.length - 1 ? '下一步' : '开始创作'}
                    {currentStep < TOUR_STEPS.length - 1 && <ChevronRight size={14} className="ml-1" />}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;

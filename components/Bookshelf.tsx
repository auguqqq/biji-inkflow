
import React, { useState, useRef } from 'react';
import { Plus, Book as BookIcon, MoreVertical, Edit2, Download, Trash2, Image as ImageIcon, Check, X, Upload, CheckCircle2, FileText, Crown, Lock, BookOpen, ScrollText } from 'lucide-react';
import { Book } from '../types';

interface BookshelfProps {
  books: Book[];
  setBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  onSelectBook: (id: string) => void;
  isPro: boolean;
  onProAction: (callback: () => void) => void;
}

const Bookshelf: React.FC<BookshelfProps> = ({ books, setBooks, onSelectBook, isPro, onProAction }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [coverTargetId, setCoverTargetId] = useState<string | null>(null);
  
  // Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);

  const confirmCreateBook = (type: 'novel' | 'anthology') => {
    const id = `book-${Date.now()}`;
    const colors = ['bg-amber-700', 'bg-emerald-800', 'bg-blue-900', 'bg-red-900', 'bg-indigo-900', 'bg-slate-800'];
    const newBook: Book = {
      id,
      type,
      title: type === 'novel' ? '未命名长篇小说' : '未命名短篇文集',
      coverColor: colors[Math.floor(Math.random() * colors.length)],
      currentChapterId: 'chapter-1',
      chapters: [
        { 
          id: 'chapter-1', 
          title: type === 'novel' ? '第 1 章' : '新篇章', 
          content: '', 
          synopsis: '在这里输入梗概...', 
          lastModified: Date.now() 
        }
      ],
      isFinished: false,
      createdAt: Date.now()
    };
    setBooks([newBook, ...books]);
    setShowCreateModal(false);
  };

  const deleteBook = (id: string) => {
    if (confirm('确定要删除这部作品吗？此操作无法恢复。')) {
      setBooks(books.filter(b => b.id !== id));
    }
  };

  const startRename = (book: Book) => {
    setEditingId(book.id);
    setEditTitle(book.title);
    setActiveMenu(null);
  };

  const saveRename = () => {
    if (editTitle.trim()) {
      setBooks(books.map(b => b.id === editingId ? { ...b, title: editTitle } : b));
    }
    setEditingId(null);
  };

  const exportFullBook = (book: Book, format: 'txt' | 'epub' | 'pdf') => {
    const performExport = () => {
        if (format === 'epub' || format === 'pdf') {
            // Placeholder for PDF/EPUB generation (requires external libs like jspdf/jszip)
            alert(`[模拟] 正在为您生成 ${format.toUpperCase()} 文件...\n(注：真实 PDF/EPUB 生成通常需要引入额外依赖库)`);
            setActiveMenu(null);
            return;
        }

        // Default TXT export
        const fullText = book.chapters.map(c => `【${c.title}】\n\n${c.content}\n\n`).join('--- 分章线 ---\n\n');
        const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${book.title}_全本导出.txt`;
        link.click();
        setActiveMenu(null);
    };

    if (format !== 'txt') {
        if (!isPro) {
            onProAction(() => {}); // Open payment modal
        } else {
            performExport();
        }
    } else {
        performExport();
    }
  };

  const triggerCoverUpload = (bookId: string) => {
    setCoverTargetId(bookId);
    fileInputRef.current?.click();
    setActiveMenu(null);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && coverTargetId) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setBooks(prev => prev.map(b => b.id === coverTargetId ? { ...b, coverImage: base64 } : b));
      };
      reader.readAsDataURL(file);
    }
    setCoverTargetId(null);
  };

  const handleSelect = (book: Book) => {
    if (editingId) return;
    onSelectBook(book.id);
  };

  return (
    <div className="p-6 md:p-12 h-full overflow-y-auto custom-scrollbar relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleCoverChange} 
        accept="image/*" 
        className="hidden" 
      />
      
      {/* Creation Modal */}
      {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 relative overflow-hidden">
                  <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2"><X size={20}/></button>
                  
                  <div className="text-center mb-8">
                      <h2 className="text-2xl font-black text-gray-800 mb-2">选择作品类型</h2>
                      <p className="text-gray-500 text-sm">不同的类型将适配不同的 AI 辅助策略与写作界面</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Novel Option */}
                      <div 
                        onClick={() => confirmCreateBook('novel')}
                        className="group border-2 border-gray-100 rounded-2xl p-6 hover:border-amber-500 hover:bg-amber-50/30 cursor-pointer transition-all flex flex-col items-center text-center relative overflow-hidden"
                      >
                          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4 text-amber-600 group-hover:scale-110 transition-transform">
                              <BookOpen size={32} />
                          </div>
                          <h3 className="text-lg font-bold text-gray-800 mb-2">长篇连载</h3>
                          <p className="text-xs text-gray-500 leading-relaxed mb-4">
                              适用于网文、长篇小说。强调章节连续性、伏笔回收与宏大叙事结构。
                          </p>
                          <span className="mt-auto text-[10px] font-black uppercase tracking-widest text-amber-600 border border-amber-200 px-2 py-1 rounded bg-white">
                              AI 侧重：节奏与钩子
                          </span>
                      </div>

                      {/* Anthology Option */}
                      <div 
                        onClick={() => confirmCreateBook('anthology')}
                        className="group border-2 border-gray-100 rounded-2xl p-6 hover:border-purple-500 hover:bg-purple-50/30 cursor-pointer transition-all flex flex-col items-center text-center relative overflow-hidden"
                      >
                          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4 text-purple-600 group-hover:scale-110 transition-transform">
                              <ScrollText size={32} />
                          </div>
                          <h3 className="text-lg font-bold text-gray-800 mb-2">短篇文集</h3>
                          <p className="text-xs text-gray-500 leading-relaxed mb-4">
                              适用于短篇小说、散文随笔集。强调单篇独立性、主题深度与结尾余韵。
                          </p>
                          <span className="mt-auto text-[10px] font-black uppercase tracking-widest text-purple-600 border border-purple-200 px-2 py-1 rounded bg-white">
                              AI 侧重：完整性与升华
                          </span>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8 md:mb-12">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">我的书架</h2>
            <p className="text-sm text-gray-400 mt-1 font-medium">共创作了 {books.length} 部作品</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center space-x-2 bg-amber-600 text-white px-4 py-2 md:px-6 md:py-3 rounded-2xl hover:bg-amber-700 transition-all shadow-xl shadow-amber-600/20 active:scale-95">
            <Plus size={22} />
            <span className="font-bold hidden md:inline">新建作品</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-12">
          {books.map(book => (
            <div key={book.id} className={`group relative flex flex-col ${book.isFinished ? 'grayscale-[0.5] opacity-80' : ''}`}>
              <div 
                className={`aspect-[3/4.2] rounded-r-2xl shadow-xl md:shadow-2xl ${book.coverColor} relative overflow-hidden flex flex-col p-4 md:p-6 transition-all duration-500 hover:-translate-y-2 md:group-hover:-translate-y-3 group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)] cursor-pointer`}
                onClick={() => handleSelect(book)}
              >
                {book.coverImage && (
                  <img src={book.coverImage} className="absolute inset-0 w-full h-full object-cover" alt={book.title} />
                )}
                <div className="absolute left-0 top-0 bottom-0 w-3 md:w-4 bg-black/10 z-10" />
                
                {/* Book Type Badge */}
                {book.type === 'anthology' && (
                    <div className="absolute top-2 right-2 z-20">
                        <span className="px-1.5 py-0.5 bg-white/20 backdrop-blur-md text-white text-[8px] font-black rounded uppercase tracking-wide border border-white/20">
                            文集
                        </span>
                    </div>
                )}

                <div className="flex-grow flex flex-col justify-center text-center px-1 relative z-10">
                  {editingId === book.id ? (
                    <div className="flex flex-col space-y-2" onClick={e => e.stopPropagation()}>
                       <input 
                         autoFocus
                         value={editTitle}
                         onChange={e => setEditTitle(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && saveRename()}
                         className="bg-white/90 text-gray-800 text-center font-bold text-sm p-2 rounded-lg border border-white/40 focus:outline-none"
                       />
                       <div className="flex justify-center space-x-2">
                         <button onClick={saveRename} className="p-1 bg-emerald-500 text-white rounded"><Check size={16} /></button>
                         <button onClick={() => setEditingId(null)} className="p-1 bg-red-500 text-white rounded"><X size={16} /></button>
                       </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <h3 className={`text-white font-black text-sm md:text-xl serif leading-tight line-clamp-3 ${book.coverImage ? 'bg-black/40 backdrop-blur-sm p-2 md:p-3 rounded-lg' : 'drop-shadow-md'}`}>
                        {book.title}
                      </h3>
                      {book.isFinished && (
                        <div className="mt-4 px-2 py-0.5 md:px-3 md:py-1 bg-emerald-500 text-white text-[8px] md:text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg">已完结</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-auto flex justify-between items-center text-white/70 text-[8px] md:text-[10px] font-black uppercase tracking-widest relative z-10">
                  <span className={book.coverImage ? 'bg-black/40 px-2 py-1 rounded' : ''}>{book.chapters.length} {book.type === 'anthology' ? '篇' : '章'}</span>
                  <BookIcon size={12} className={`md:w-3.5 md:h-3.5 ${book.coverImage ? 'drop-shadow-md' : ''}`} />
                </div>
              </div>

              <div className="mt-3 md:mt-5 flex justify-between items-start px-1">
                <div className="flex-grow mr-2">
                  <div className="flex items-center space-x-1.5">
                    <h4 className="font-bold text-gray-800 text-xs md:text-sm line-clamp-1">{book.title}</h4>
                    {book.isFinished && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 font-bold truncate">最后: {new Date(Math.max(...book.chapters.map(c => c.lastModified))).toLocaleDateString()}</p>
                </div>
                
                <div className="relative">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(activeMenu === book.id ? null : book.id);
                    }}
                    className="text-gray-300 hover:text-gray-600 transition-colors p-1"
                  >
                    <MoreVertical size={16} />
                  </button>

                  {activeMenu === book.id && (
                    <div className="absolute right-0 top-full mt-2 w-48 md:w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in duration-200">
                      <button onClick={() => startRename(book)} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center space-x-2">
                        <Edit2 size={14} /> <span>重命名</span>
                      </button>
                      <button onClick={() => triggerCoverUpload(book.id)} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center space-x-2">
                        <ImageIcon size={14} /> <span>导入封面</span>
                      </button>
                      
                      <div className="px-4 py-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">导出选项</div>
                      <button onClick={() => exportFullBook(book, 'txt')} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center space-x-2">
                        <Download size={14} /> <span>TXT 纯文本</span>
                      </button>
                      <button onClick={() => exportFullBook(book, 'epub')} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-between group/item">
                         <div className="flex items-center space-x-2"><FileText size={14} /> <span>EPUB 电子书</span></div>
                         {!isPro && <Lock size={12} className="text-amber-500 group-hover/item:animate-pulse" />}
                      </button>
                       <button onClick={() => exportFullBook(book, 'pdf')} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-between group/item">
                         <div className="flex items-center space-x-2"><FileText size={14} /> <span>PDF 打印版</span></div>
                         {!isPro && <Lock size={12} className="text-amber-500 group-hover/item:animate-pulse" />}
                      </button>

                      <div className="h-px bg-gray-50 my-1" />
                      <button onClick={() => deleteBook(book.id)} className="w-full text-left px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 flex items-center space-x-2">
                        <Trash2 size={14} /> <span>删除作品</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          <button onClick={() => setShowCreateModal(true)} className="aspect-[3/4.2] border-2 border-dashed border-gray-200 rounded-r-2xl flex flex-col items-center justify-center text-gray-300 hover:border-amber-300 hover:text-amber-500 transition-all cursor-pointer group min-h-[160px]">
            <Plus className="w-8 h-8 md:w-12 md:h-12 transition-transform group-hover:scale-125" />
            <span className="text-[10px] md:text-xs mt-3 font-black uppercase tracking-widest">开启新篇章</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Bookshelf;

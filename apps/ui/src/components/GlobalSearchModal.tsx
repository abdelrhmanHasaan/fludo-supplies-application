import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Package, Users, Truck, FileText, ArrowRight, CornerDownLeft, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import { SectionKey } from './Sidebar';

interface SearchResult {
  type: 'product' | 'customer' | 'supplier' | 'invoice' | 'employee' | 'equipment';
  id: string;
  title: string;
  subtitle: string;
  code?: string;
  route: SectionKey;
  meta?: any;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (section: SectionKey) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Global keydown listener so ESC works even if focus is not in input
  useEffect(() => {
    if (!isOpen) return;
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onGlobalKey, true);
    return () => window.removeEventListener('keydown', onGlobalKey, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const typeParam = selectedType === 'all' ? undefined : selectedType;
        const res = await api.search(query, typeParam);
        setResults(res.results || []);
        setSelectedIndex(0);
      } catch (err) {
        console.warn('Search query error:', err);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, selectedType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelect = (item: SearchResult) => {
    const targetRoute = ((item.route as string) === 'products' ? 'inventory' : item.route) as SectionKey;
    onNavigate(targetRoute);
    onClose();
  };

  if (!isOpen) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'product':
        return <Package className="w-4 h-4 text-blue-500" />;
      case 'customer':
        return <Users className="w-4 h-4 text-emerald-500" />;
      case 'supplier':
        return <Truck className="w-4 h-4 text-purple-500" />;
      case 'invoice':
        return <FileText className="w-4 h-4 text-amber-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-slate-400" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'product':
        return <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded">صنف</span>;
      case 'customer':
        return <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">عميل</span>;
      case 'supplier':
        return <span className="bg-purple-50 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded">مورد</span>;
      case 'invoice':
        return <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded">فاتورة</span>;
      case 'employee':
        return <span className="bg-teal-50 text-teal-700 text-[10px] font-bold px-2 py-0.5 rounded">موظف</span>;
      case 'equipment':
        return <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded">معدة</span>;
      default:
        return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[75vh]" onClick={(e) => e.stopPropagation()}>
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ابحث بالاسم، الكود، رقم الهاتف، أو رقم الفاتورة (مثال: زلط، A01، أنس، 010...)"
            className="flex-1 text-sm font-medium outline-none text-slate-800 placeholder-slate-400"
          />
          {query && (
            <button 
              type="button"
              onClick={() => setQuery('')} 
              className="text-slate-400 hover:text-slate-600 p-1"
              title="مسح النص"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd 
            onClick={onClose}
            className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold text-slate-500 bg-slate-100 rounded border border-slate-200 cursor-pointer hover:bg-slate-200"
            title="إغلاق (Esc)"
          >
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="إغلاق نافذة البحث"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-slate-50/70 text-xs overflow-x-auto">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'products', label: 'الأصناف' },
            { id: 'customers', label: 'العملاء' },
            { id: 'suppliers', label: 'الموردين' },
            { id: 'invoices', label: 'الفواتير' },
            { id: 'employees', label: 'الموظفين' },
            { id: 'equipment', label: 'المعدات' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedType(cat.id)}
              className={`px-3 py-1 rounded-lg font-bold transition-colors whitespace-nowrap ${
                selectedType === cat.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100">
          {loading && (
            <div className="py-8 text-center text-xs text-slate-400">جاري البحث والمطابقة...</div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="py-10 text-center space-y-1">
              <p className="text-xs font-bold text-slate-600">لم يتم العثور على أي نتائج مطابقة لـ "{query}"</p>
              <p className="text-[11px] text-slate-400">تأكد من كتابة جزء من الاسم أو الكود أو رقم الهاتف بشكل صحيح</p>
            </div>
          )}

          {!loading && !query && (
            <div className="py-10 text-center space-y-2 text-slate-400">
              <p className="text-xs font-bold text-slate-500">سيرش النظام الشامل بالكود والاسم (Ctrl+K)</p>
              <p className="text-[11px]">يدعم تجاهل الهمزات، والتشكيل، والأرقام العربية والإنجليزية</p>
            </div>
          )}

          {!loading &&
            results.map((item, idx) => (
              <div
                key={`${item.type}-${item.id}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                  idx === selectedIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-sm">
                    {getTypeIcon(item.type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-800">{item.title}</span>
                      {getTypeBadge(item.type)}
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5">{item.subtitle}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {idx === selectedIndex && (
                    <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                      <span>فتح</span>
                      <CornerDownLeft className="w-3 h-3" />
                    </span>
                  )}
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            ))}
        </div>

        {/* Footer shortcuts info */}
        <div className="p-2.5 px-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>↑↓ للتنقل</span>
            <span>↵ للاختيار</span>
            <span>ESC للإغلاق</span>
          </div>
          <span>Fludo ERP Quick Finder</span>
        </div>
      </div>
    </div>
  );
};

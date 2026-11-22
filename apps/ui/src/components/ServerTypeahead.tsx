import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Check } from 'lucide-react';
import { api } from '../api/client';

export interface TypeaheadOption {
  id: string;
  title: string;
  subtitle?: string;
  code?: string;
  meta?: any;
}

interface ServerTypeaheadProps {
  types?: string; // 'products', 'customers', 'suppliers', 'parties', 'employees', 'cash_accounts'
  placeholder?: string;
  value?: string; // selected id
  selectedLabel?: string;
  onSelect: (option: TypeaheadOption | null) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export const ServerTypeahead: React.FC<ServerTypeaheadProps> = ({
  types,
  placeholder = 'ابحث بالكود، الاسم، أو الهاتف...',
  value,
  selectedLabel,
  onSelect,
  className = '',
  required = false,
  disabled = false,
}) => {
  const [query, setQuery] = useState(selectedLabel || '');
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<TypeaheadOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    if (selectedLabel !== undefined) {
      setQuery(selectedLabel);
    }
  }, [selectedLabel]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchResults = async (q: string) => {
    if (!q || !q.trim()) {
      setOptions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.search(q.trim(), types);
      const mapped: TypeaheadOption[] = (res?.results || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        code: r.code,
        meta: r.meta,
      }));
      setOptions(mapped);
      setHighlightIndex(-1);
    } catch (err) {
      console.error('Typeahead search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchResults(val);
    }, 150); // 150ms debounce specification
  };

  const handleSelectOption = (opt: TypeaheadOption) => {
    setQuery(opt.title);
    setIsOpen(false);
    onSelect(opt);
  };

  const handleClear = () => {
    setQuery('');
    setOptions([]);
    setIsOpen(false);
    onSelect(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || options.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < options.length) {
        handleSelectOption(options[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (options.length > 0 || query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          className="w-full pr-9 pl-8 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold bg-white disabled:bg-slate-100"
        />

        {loading ? (
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute left-3" />
        ) : query ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute left-2.5 p-1 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div className="absolute top-full mt-1.5 w-full bg-white rounded-2xl shadow-xl border border-slate-200 z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-100 text-right">
          {loading && options.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">جاري البحث...</div>
          ) : options.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">لا توجد نتائج مطابقة</div>
          ) : (
            options.map((opt, idx) => {
              const isSelected = value === opt.id;
              const isHighlighted = highlightIndex === idx;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectOption(opt)}
                  className={`w-full p-2.5 flex items-center justify-between text-right text-xs transition-colors ${
                    isHighlighted ? 'bg-blue-50/80' : isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex-1 truncate">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      {opt.code && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-black">
                          {opt.code}
                        </span>
                      )}
                      <span>{opt.title}</span>
                    </div>
                    {opt.subtitle && <div className="text-[11px] text-slate-400 truncate mt-0.5">{opt.subtitle}</div>}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

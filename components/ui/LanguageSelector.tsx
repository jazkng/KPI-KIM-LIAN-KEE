import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Languages, Check, ChevronDown } from 'lucide-react';
import { AppLanguage } from '../../types';
import { useIsMobile } from '../../utils/useIsMobile';

interface LanguageSelectorProps {
  currentLang: AppLanguage;
  onSelectLang: (lang: AppLanguage) => void;
  dark?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  currentLang,
  onSelectLang,
  dark = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [desktopPosition, setDesktopPosition] = useState({ top: 0, left: 0 });

  const updateDesktopPosition = () => {
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 208;
    const pagePadding = 12;
    setDesktopPosition({
      top: rect.bottom + 8,
      left: Math.min(
        window.innerWidth - menuWidth - pagePadding,
        Math.max(pagePadding, rect.right - menuWidth)
      )
    });
  };

  useLayoutEffect(() => {
    if (!isOpen || isMobile) return;
    updateDesktopPosition();
  }, [isOpen, isMobile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const reposition = () => {
      if (!isMobile) updateDesktopPosition();
    };

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    if (isMobile) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
      };
    }

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen, isMobile]);

  const options: { value: AppLanguage; label: string; sub: string }[] = [
    { value: 'zh_en', label: '中英', sub: '中文 / English' },
    { value: 'en', label: 'EN', sub: 'English Only' },
    { value: 'my', label: 'မြန်မာ', sub: 'Burmese' }
  ];

  const currentOption = options.find(o => o.value === currentLang) || options[0];

  const optionButtons = options.map((opt) => {
    const active = opt.value === currentLang;
    return (
      <button
        key={opt.value}
        type="button"
        onClick={() => {
          onSelectLang(opt.value);
          setIsOpen(false);
        }}
        className={`w-full min-h-[52px] text-left px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer select-none ${
          active
            ? 'bg-[#FFD200]/20 text-[#111111] font-black'
            : 'text-stone-700 hover:bg-stone-50 active:bg-stone-100 font-bold'
        }`}
      >
        <span className="flex flex-col">
          <span className="text-sm">{opt.label}</span>
          <span className="text-[11px] text-stone-400 font-normal">{opt.sub}</span>
        </span>
        {active && <Check size={16} className="text-[#111111] shrink-0" />}
      </button>
    );
  });

  const languageMenu = isOpen && typeof document !== 'undefined'
    ? createPortal(
        isMobile ? (
          <div
            className="fixed inset-0 z-[9999] flex items-end bg-black/40 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => setIsOpen(false)}
          >
            <div
              ref={menuRef}
              role="dialog"
              aria-modal="true"
              aria-label="Select language"
              onClick={(event) => event.stopPropagation()}
              className="w-full rounded-t-3xl bg-white shadow-2xl border-t border-stone-200 overflow-hidden animate-in slide-in-from-bottom duration-200"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
            >
              <div className="flex justify-center pt-2.5 pb-1">
                <span className="h-1 w-10 rounded-full bg-stone-300" />
              </div>
              <div className="px-5 py-3 text-xs font-black text-stone-500 uppercase tracking-wider border-b border-stone-100">
                Language / 语言 / ဘာသာ
              </div>
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
                {optionButtons}
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={menuRef}
            className="fixed z-[9999] w-52 rounded-2xl bg-white shadow-2xl border border-stone-200 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={{ top: desktopPosition.top, left: desktopPosition.left }}
          >
            <div className="px-3.5 py-2 text-[10px] font-black text-stone-400 uppercase tracking-wider border-b border-stone-100">
              Language / 语言 / ဘာသာ
            </div>
            {optionButtons}
          </div>
        ),
        document.body
      )
    : null;

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{ minHeight: '44px' }}
        className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black transition-all active:scale-95 cursor-pointer outline-none shadow-sm ${
          dark
            ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
            : 'bg-stone-50 border border-stone-200 text-stone-800 hover:bg-stone-100'
        }`}
        aria-label="Select Language"
      >
        <Languages size={14} className={dark ? 'text-[#FFD200]' : 'text-[#650707]'} />
        <span>{currentOption.label}</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {languageMenu}
    </div>
  );
};

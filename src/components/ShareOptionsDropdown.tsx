import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Share2, Bluetooth, Copy, FolderOpen, Loader2 } from 'lucide-react';
import { ShareTarget } from '../utils/shareUtils';
import { LocalSendIcon } from './LocalSendIcon';
import { WhatsAppIcon } from '../utils/whatsapp';

export interface ShareOptionsDropdownProps {
  onShare: (target: ShareTarget) => Promise<void> | void;
  isSharing?: boolean;
  buttonLabel?: string;
  buttonClassName?: string;
  buttonStyle?: React.CSSProperties;
  iconClassName?: string;
  align?: 'left' | 'right';
  menuTitle?: string;
  tooltip?: string;
  id?: string;
}

export const ShareOptionsDropdown: React.FC<ShareOptionsDropdownProps> = ({
  onShare,
  isSharing = false,
  buttonLabel,
  buttonClassName,
  buttonStyle,
  iconClassName = 'w-4 h-4',
  align = 'left',
  menuTitle = 'خيارات المشاركة (PDF)',
  tooltip = 'خيارات المشاركة (تطبيق LocalSend، البلوتوث، تطبيقات ويندوز، نسخ الملف)',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = async (target: ShareTarget) => {
    setIsOpen(false);
    await onShare(target);
  };

  const defaultBtnClass = `p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 text-xs font-bold ${
    isOpen
      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
      : 'bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border-slate-300 shadow-2xs'
  }`;

  return (
    <div className="relative inline-block text-right no-print" ref={containerRef}>
      <button
        id={id}
        type="button"
        disabled={isSharing}
        onClick={() => setIsOpen((prev) => !prev)}
        className={buttonClassName || defaultBtnClass}
        style={buttonStyle}
        title={tooltip}
      >
        {isSharing ? (
          <Loader2 className={`${iconClassName} animate-spin text-blue-600 shrink-0`} />
        ) : (
          <MoreVertical className={`${iconClassName} shrink-0`} />
        )}
        {buttonLabel && <span>{buttonLabel}</span>}
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] p-2 text-xs animate-in fade-in zoom-in-95 duration-100 text-right divide-y divide-slate-100`}
        >
          <div className="px-3 py-2 text-[11px] font-black text-slate-500 flex items-center justify-between">
            <span>{menuTitle}</span>
            <Share2 className="w-3.5 h-3.5 text-blue-600" />
          </div>

          <div className="py-1.5 space-y-1">
            {/* WhatsApp PDF */}
            <button
              type="button"
              disabled={isSharing}
              onClick={() => handleSelect('whatsapp')}
              className="w-full text-right p-2.5 rounded-xl hover:bg-green-50 active:bg-green-100 text-slate-800 hover:text-green-950 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-green-200 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white border border-green-200 flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <WhatsAppIcon size={22} />
                </div>
                <div>
                  <span className="font-black block text-xs text-slate-900 group-hover:text-green-700">
                    إرسال PDF عبر واتساب
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    فتح واتساب سطح المكتب وإرفاق الملف مباشرة
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                واتساب
              </span>
            </button>


            {/* LocalSend */}
            <button
              type="button"
              disabled={isSharing}
              onClick={() => handleSelect('localsend')}
              className="w-full text-right p-2.5 rounded-xl hover:bg-emerald-50 active:bg-emerald-100 text-slate-800 hover:text-emerald-950 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-emerald-200 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <LocalSendIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="font-black block text-xs text-slate-900 group-hover:text-teal-700">
                    تطبيق LocalSend
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    إرسال سريع ومباشر للأجهزة المجاورة
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                LocalSend
              </span>
            </button>

            {/* Bluetooth */}
            <button
              type="button"
              disabled={isSharing}
              onClick={() => handleSelect('bluetooth')}
              className="w-full text-right p-2.5 rounded-xl hover:bg-blue-50 active:bg-blue-100 text-slate-800 hover:text-blue-950 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-blue-200 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Bluetooth className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black block text-xs text-slate-900 group-hover:text-blue-700">
                    البلوتوث (Bluetooth)
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    إرسال لاسلكي للأجهزة المجاورة
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                لاسلكي
              </span>
            </button>

            {/* Windows Apps / Open With */}
            <button
              type="button"
              disabled={isSharing}
              onClick={() => handleSelect('open-with')}
              className="w-full text-right p-2.5 rounded-xl hover:bg-purple-50 active:bg-purple-100 text-slate-800 hover:text-purple-950 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-purple-200 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black block text-xs text-slate-900 group-hover:text-purple-700">
                    مشاركة عبر ويندوز
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    فتح واختيار تطبيق المشاركة
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                ويندوز
              </span>
            </button>

            {/* Copy PDF File */}
            <button
              type="button"
              disabled={isSharing}
              onClick={() => handleSelect('copy')}
              className="w-full text-right p-2.5 rounded-xl hover:bg-slate-100 active:bg-slate-200 text-slate-800 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-slate-300 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-700 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <Copy className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black block text-xs text-slate-900 group-hover:text-slate-700">
                    نسخ ملف PDF للحافظة
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    للصق المباشر في أي محادثة أو مجلد
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                نسخ
              </span>
            </button>

            {/* Show in Folder */}
            <button
              type="button"
              disabled={isSharing}
              onClick={() => handleSelect('show-folder')}
              className="w-full text-right p-2.5 rounded-xl hover:bg-amber-50 active:bg-amber-100 text-slate-800 hover:text-amber-950 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-amber-200 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black block text-xs text-slate-900 group-hover:text-amber-700">
                    فتح المجلد
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    إظهار وتحديد مكان الملف على القرص
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                المجلد
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

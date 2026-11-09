import React from 'react';
import {
  Zap,
  Receipt,
  FileText,
  Users,
  Fish,
  Settings,
  ChevronRight,
  ChevronLeft,
  X,
  Database,
  Wifi,
  WifiOff,
  Wallet,
  LogOut,
  ClipboardCheck,
} from 'lucide-react';
import { MarketSettings } from '../types';

export type NavTabId =
  | 'pos'
  | 'transactions'
  | 'reports'
  | 'cashBox'
  | 'dailyInventory'
  | 'contacts'
  | 'fishTypes'
  | 'settings'
  | 'backup';

interface SidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  settings: MarketSettings;
  transactionsCount: number;
  contactsCount: number;
  fishTypesCount: number;
  cashEntriesCount?: number;
  isOnline: boolean;
  isDbConnected?: boolean;
  onOpenSettings: () => void;
  onOpenBackup?: () => void;
  onLogout?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}


export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  settings,
  transactionsCount,
  contactsCount,
  fishTypesCount,
  cashEntriesCount = 0,
  isOnline,
  isDbConnected = true,
  onOpenSettings,
  onOpenBackup,
  onLogout,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const navItems = [
    {
      group: 'العمليات والمبيعات',
      items: [
        {
          id: 'pos' as NavTabId,
          label: 'تسجيل فاتورة',
          icon: Zap,
        },
        {
          id: 'reports' as NavTabId,
          label: 'كشف حساب العملاء',
          icon: FileText,
        },
        {
          id: 'transactions' as NavTabId,
          label: 'سجل العمليات والفواتير',
          icon: Receipt,
        },
        {
          id: 'cashBox' as NavTabId,
          label: 'صندوق النقدية واليومية',
          icon: Wallet,
        },
        {
          id: 'dailyInventory' as NavTabId,
          label: 'الجرد اليومي',
          icon: ClipboardCheck,
        },
      ],
    },
    {
      group: 'الدليل وقواعد البيانات',
      items: [
        {
          id: 'contacts' as NavTabId,
          label: 'الصياد والمشترين',
          icon: Users,
        },
        {
          id: 'fishTypes' as NavTabId,
          label: 'دليل أنواع الأسماك',
          icon: Fish,
        },
      ],
    },
  ];

  const handleTabClick = (tabId: NavTabId) => {
    onSelectTab(tabId);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container - Full Height along page (Sharp ERP Style) */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 right-0 z-50 flex flex-col h-screen bg-white border-l border-slate-300 text-slate-800 shadow-none transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${isMobileOpen ? 'translate-x-0' : 'translate-x-full'
          } ${isCollapsed ? 'lg:w-20 w-20' : 'lg:w-[310px] w-80'}`}
      >
        {/* Sidebar Header / Brand Logo */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-300 bg-[#f0f4f9] shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
            <div className="w-10 h-10 rounded-none bg-white flex items-center justify-center shrink-0 border border-slate-300 overflow-hidden p-0.5 shadow-xs">
              <img src="/logo.png" alt="الشعار" className="w-full h-full object-contain" />
            </div>

            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <h2 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight leading-tight truncate">
                  {settings.marketName || 'حراج الأسماك المركزي'}
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] text-blue-900 font-bold mt-0.5">
                  <span className="w-2 h-2 rounded-none bg-blue-700 inline-block" />
                  <span>منظومة الحراج والشروات المتكاملة</span>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1 rounded-none border border-slate-300 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="إغلاق القائمة"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-none text-slate-600 hover:text-blue-900 hover:bg-white border border-slate-300 transition-all cursor-pointer shrink-0"
            title={isCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
          >
            {isCollapsed ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Sidebar Navigation Items - No Scrollbar, items fit cleanly on screen */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-2 space-y-2">
          {navItems.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-0.5">
              {!isCollapsed && (
                <div className="px-2 py-0.5 text-[10px] font-black tracking-wider text-slate-500 uppercase bg-slate-50 border-y border-slate-200">
                  {group.group}
                </div>
              )}

              <div className="space-y-0.5 pt-0.5">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      id={`sidebar-tab-${item.id}`}
                      type="button"
                      onClick={() => handleTabClick(item.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-none font-bold text-xs transition-all relative group text-right cursor-pointer border ${isActive
                          ? 'bg-[#f0f4f9] text-blue-950 border-slate-400 font-black shadow-xs'
                          : 'border-transparent text-slate-700 hover:text-blue-900 hover:bg-slate-50 hover:border-slate-300 font-bold'
                        } ${isCollapsed ? 'justify-center px-1.5' : ''}`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      {/* Active Indicator Bar (RTL right edge) */}
                      {isActive && (
                        <span
                          className="absolute right-0 top-0 bottom-0 w-1 rounded-none shadow-none"
                          style={{ backgroundColor: '#030164' }}
                        />
                      )}

                      <div
                        className={`p-1 rounded-none shrink-0 transition-all border ${isActive
                            ? 'text-white border-transparent'
                            : 'bg-white text-slate-600 group-hover:text-blue-900 border-slate-300'
                          }`}
                        style={isActive ? { backgroundColor: '#030164' } : undefined}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>

                      {!isCollapsed && (
                        <span className="flex-1 min-w-0 truncate text-right">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer - Always anchored at the bottom */}
        <div className="p-2 border-t border-slate-300 bg-[#f0f4f9] space-y-1 shrink-0">
          <div className="flex flex-col gap-1">
            <button
              id="sidebar-settings-btn"
              type="button"
              onClick={() => {
                onSelectTab('settings');
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none transition-all text-xs font-bold cursor-pointer border ${activeTab === 'settings'
                  ? 'text-white font-black border-transparent shadow-none'
                  : 'text-slate-800 hover:text-blue-950 bg-white hover:bg-slate-50 border-slate-300'
                } ${isCollapsed ? 'justify-center px-1.5' : ''}`}
              style={activeTab === 'settings' ? { backgroundColor: '#030164' } : undefined}
              title="إعدادات الحراج، الطابعات، والنسب المالية"
            >
              <Settings className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'settings' ? 'text-white' : 'text-slate-600'}`} />
              {!isCollapsed && <span>إعدادات النظام والنسب</span>}
            </button>

            <button
              id="sidebar-backup-btn"
              type="button"
              onClick={() => {
                onSelectTab('backup');
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none transition-all text-[11px] font-bold cursor-pointer border ${activeTab === 'backup'
                  ? 'text-white font-black border-transparent shadow-none'
                  : 'text-slate-800 hover:text-blue-950 bg-white hover:bg-slate-50 border-slate-300'
                } ${isCollapsed ? 'justify-center px-1.5' : ''}`}
              style={activeTab === 'backup' ? { backgroundColor: '#030164' } : undefined}
              title="النسخ الاحتياطي واستعادة البيانات ومجلد Google Drive"
            >
              <Database className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'backup' ? 'text-white' : 'text-slate-600'}`} />
              {!isCollapsed && <span>النسخ الاحتياطي والأرشيف</span>}
            </button>

            {onLogout && (
              <button
                id="sidebar-logout-btn"
                type="button"
                onClick={onLogout}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 transition-all text-xs font-bold cursor-pointer ${isCollapsed ? 'justify-center px-1.5' : ''
                  }`}
                title="قفل الشاشة والعودة لشاشة البداية"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                {!isCollapsed && <span>قفل الشاشة / خروج</span>}
              </button>
            )}
          </div>

          {/* Connection status indicator */}
          {!isCollapsed && (
            <div className="pt-1 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-600 px-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-none ${isDbConnected ? 'bg-emerald-600' : 'bg-amber-500'
                    }`}
                />
                <span className="text-slate-800 font-bold">قاعدة البيانات (PostgreSQL)</span>
              </div>
              <span
                className={`text-[9px] px-1 py-0.5 rounded-none font-mono font-bold border ${isDbConnected
                    ? 'text-emerald-900 bg-emerald-50 border-emerald-300'
                    : 'text-amber-900 bg-amber-50 border-amber-300'
                  }`}
              >
                {isDbConnected ? 'متصلة' : 'غير متصلة'}
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

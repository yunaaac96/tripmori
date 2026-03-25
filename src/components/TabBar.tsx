import React from 'react';

interface TabBarProps {
  activeTab: string;
  onTabChange: (label: string) => void;
}

const TABS = [
  { icon: '🗓️', label: '行程' },
  { icon: '✈️', label: '預訂' },
  { icon: '💰', label: '記帳' },
  { icon: '📖', label: '日誌' },
  { icon: '📋', label: '準備' },
  { icon: '👥', label: '成員' },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[#FDFCF8] via-[#FDFCF8]/90 to-transparent z-50 flex justify-center">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-md rounded-full shadow-2xl border border-slate-100 flex justify-around py-4 px-3">
        {TABS.map((tab) => (
          <button 
            key={tab.label} 
            onClick={() => onTabChange(tab.label)}
            className={`flex flex-col items-center gap-1.5 transition-all active:scale-90 ${
              activeTab === tab.label ? "text-[#769370]" : "text-slate-300 grayscale opacity-70"
            }`}
          >
            <span className="text-2xl">{tab.icon}</span>
            <span className="text-[10px] font-black tracking-widest">{tab.label}</span>
            {activeTab === tab.label && <div className="w-1 h-1 bg-[#769370] rounded-full"></div>}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TabBar;
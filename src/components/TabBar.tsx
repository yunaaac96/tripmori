import React from 'react';

const TABS = [
  { icon: '🗓️', label: '行程', active: true },
  { icon: '✈️', label: '預訂' },
  { icon: '💰', label: '記帳' },
  { icon: '📖', label: '日誌' },
  { icon: '👥', label: '成員' },
];

const TabBar: React.FC = () => {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[#FDFCF8] via-[#FDFCF8]/90 to-transparent z-50">
      <div className="max-w-md mx-auto bg-white rounded-full shadow-2xl shadow-slate-900/10 border border-slate-100 flex justify-around py-4 px-3">
        {TABS.map((tab) => (
          <div key={tab.label} className={`flex flex-col items-center gap-1.5 ${tab.active ? "text-[#769370]" : "text-slate-300"}`}>
            <span className="text-2xlgrayscale opacity-50 active:grayscale-0">{tab.icon}</span>
            <span className="text-[10px] font-black tracking-widest">{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TabBar;
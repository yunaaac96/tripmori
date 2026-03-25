import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDays, faPlane, faWallet, faBook, faUsers } from '@fortawesome/free-solid-svg-icons';

interface TabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TabBar = ({ activeTab, onTabChange }: TabBarProps) => {
  const tabs = [
    { name: '行程', icon: faCalendarDays },
    { name: '預訂', icon: faPlane },
    { name: '記帳', icon: faWallet },
    { name: '日誌', icon: faBook },
    { name: '成員', icon: faUsers },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-8 px-4 z-50 pointer-events-none">
      <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl shadow-lg px-2 py-2 flex gap-1 pointer-events-auto max-w-sm w-full justify-between">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            onClick={() => onTabChange(tab.name)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all ${
              activeTab === tab.name 
              ? 'bg-[#769370] text-white shadow-md' 
              : 'text-slate-400 hover:bg-slate-50'
            }`}
          >
            <FontAwesomeIcon icon={tab.icon} className="text-lg" />
            <span className="text-[10px] font-bold">{tab.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TabBar;
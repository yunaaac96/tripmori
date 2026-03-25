import React from 'react';
import { DayOption } from '../types/index';

interface DaySelectorProps {
  days: DayOption[];
  activeDay: string;
  onDayChange: (date: string) => void;
}

const DaySelector: React.FC<DaySelectorProps> = ({ days, activeDay, onDayChange }) => {
  return (
    <nav className="relative z-50 py-4 px-4 flex justify-center gap-3">
      {days.map((d, index) => (
        <button
          key={d.date}
          type="button"
          onClick={() => onDayChange(d.date)}
          className={`flex-shrink-0 w-16 h-16 rounded-3xl border-2 transition-all flex flex-col items-center justify-center cursor-pointer ${
            activeDay === d.date 
              ? "bg-[#769370] border-[#769370] text-white shadow-lg scale-105" 
              : "bg-white border-slate-100 text-slate-400"
          }`}
        >
          <span className="text-[10px] font-bold opacity-60 pointer-events-none">D{index + 1}</span>
          <span className="text-xl font-black leading-none mt-0.5 pointer-events-none">{d.label.split('/')[1]}</span>
          <span className="text-[9px] font-bold mt-1 pointer-events-none">{d.week}</span>
        </button>
      ))}
    </nav>
  );
};

export default DaySelector;
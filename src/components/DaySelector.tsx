import React from 'react';
import { DayOption } from '../types';

interface DaySelectorProps {
  days: DayOption[];
  activeDay: string;
  onDayChange: (date: string) => void;
}

const DaySelector: React.FC<DaySelectorProps> = ({ days, activeDay, onDayChange }) => {
  return (
    <nav className="sticky top-0 z-20 py-4 px-4 bg-[#FDFCF8]/80 backdrop-blur-lg flex justify-center gap-3">
      {days.map((d, index) => (
        <button
          key={d.date}
          onClick={() => onDayChange(d.date)}
          className={`flex-shrink-0 w-16 h-16 rounded-3xl border-2 transition-all flex flex-col items-center justify-center ${
            activeDay === d.date 
              ? "bg-[#769370] border-[#769370] text-white shadow-xl shadow-slate-900/10 scale-105" 
              : "bg-white border-slate-100 text-slate-400"
          }`}
        >
          <p className="text-[10px] font-bold opacity-60">D{index + 1}</p>
          <p className="text-xl font-black leading-none mt-0.5">{d.label.split('/')[1]}</p>
          <p className="text-[9px] font-bold mt-1 tracking-widest">{d.week}</p>
        </button>
      ))}
    </nav>
  );
};

export default DaySelector;
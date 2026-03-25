import React from 'react';
import { TripEvent, EventCategory } from '../types';

interface EventCardProps {
  event: TripEvent;
}

const CATEGORY_MAP: Record<EventCategory, { label: string; icon: string; bg: string; text: string; dot: string }> = {
  food: { label: '美食', icon: '🍜', bg: 'bg-[#FFF3D6]', text: 'text-[#D4A373]', dot: 'bg-[#E9C46A]' },
  transport: { label: '交通', icon: '🚌', bg: 'bg-[#E0F2F1]', text: 'text-[#00897B]', dot: 'bg-[#90BECC]' },
  attraction: { label: '景點', icon: '🌿', bg: 'bg-[#E8F5E9]', text: 'text-[#4CAF50]', dot: 'bg-[#769370]' },
  hotel: { label: '住宿', icon: '🛏️', bg: 'bg-[#EFEBE9]', text: 'text-[#795548]', dot: 'bg-[#A1887F]' },
  spot: { label: 'Spot', icon: '📍', bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' },
};

const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const info = CATEGORY_MAP[event.category] || CATEGORY_MAP.spot;

  return (
    <div 
      onClick={() => event.mapUrl && window.open(event.mapUrl, '_blank')}
      className={`group bg-white p-5 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-50 transition-all active:scale-95 ${event.mapUrl ? 'cursor-pointer' : ''}`}
    >
      <div className="flex justify-between items-center mb-3">
        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${info.bg} ${info.text}`}>
          {info.icon} {info.label}
        </span>
        <span className="text-[11px] font-mono font-bold text-slate-300 tracking-wider">
          {event.startTime}
        </span>
      </div>
      
      <h3 className="text-xl font-bold text-slate-900 leading-tight tracking-tight">
        {event.title}
      </h3>
      
      <p className="text-[10px] text-slate-400 mt-2.5 font-bold flex items-center gap-1">
        <span className="grayscale opacity-60">📍</span> {event.location}
      </p>
      
      {event.notes && (
        <div className="mt-4 p-4 bg-[#F8F9FA] rounded-3xl text-[11px] leading-relaxed text-slate-500 border border-slate-100 font-medium relative">
          {event.notes}
        </div>
      )}
    </div>
  );
};

export default EventCard;
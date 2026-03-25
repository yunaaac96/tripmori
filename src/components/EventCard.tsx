import { TripEvent } from '../types';

const EventCard = ({ event }: { event: TripEvent }) => {
  // 定義分類標籤顏色
  const categoryStyles: Record<string, { label: string, color: string, icon: string }> = {
    food: { label: '美食', color: 'bg-[#E9C46A]', icon: '🍜' },
    transport: { label: '交通', color: 'bg-[#90BECC]', icon: '🚌' },
    attraction: { label: '景點', color: 'bg-[#769370]', icon: '🌿' },
    hotel: { label: '住宿', color: 'bg-[#E76F51]', icon: '🏨' },
  };

  const style = categoryStyles[event.category || 'attraction'];

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <span className={`${style.color} text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1`}>
          <span>{style.icon}</span> {style.label}
        </span>
      </div>
      <h3 className="text-lg font-black text-slate-800 leading-tight">{event.title}</h3>
      <p className="text-xs text-slate-400 font-bold mt-1 flex items-center gap-1">
        📍 {event.location || '沖繩'}
      </p>
      {event.note && (
        <div className="mt-3 pt-3 border-t border-dashed border-slate-100">
          <p className="text-xs text-slate-500 leading-relaxed italic">"{event.note}"</p>
        </div>
      )}
    </div>
  );
};

export default EventCard;
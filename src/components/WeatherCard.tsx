import React from 'react';

const WeatherCard: React.FC = () => {
  return (
    <div className="px-4 mt-2">
      <div className="bg-[#D8E9E4]/60 backdrop-blur-md rounded-3xl p-5 flex items-center gap-4 border border-white/80 shadow-inner">
        <span className="text-4xl">⛅</span>
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-3xl font-black text-slate-900">29°C</span>
            <span className="text-sm font-bold text-slate-700">多雲時晴</span>
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mt-0.5">濕度 72% · 沖繩那霸 · 日本</p>
        </div>
      </div>
    </div>
  );
};

export default WeatherCard;
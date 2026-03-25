import React from 'react';

const MemberCard = ({ member }: { member: any }) => {
  // 根據名字簡單對應圖示
  const getIcon = (name: string) => {
    if (name.toLowerCase().includes('uu')) return '🌿';
    if (name.toLowerCase().includes('brian')) return '⛰️';
    return '👤';
  };

  return (
    <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-50 text-center">
      <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl shadow-inner bg-slate-50"
           style={{ backgroundColor: (member.color || '#769370') + '22' }}>
        {getIcon(member.name)}
      </div>
      <h3 className="font-black text-slate-800 text-xl">{member.name}</h3>
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">
        {member.role || '旅伴'}
      </p>
      
      {/* 模擬設計圖中的記帳數據 */}
      <div className="mt-5 flex justify-center gap-2">
        <div className="bg-slate-50 px-3 py-1.5 rounded-xl">
          <p className="text-[8px] text-slate-400 font-bold leading-none">已付</p>
          <p className="text-[10px] font-black text-slate-700 mt-1">¥8,400</p>
        </div>
        <div className="bg-green-50 px-3 py-1.5 rounded-xl">
          <p className="text-[8px] text-green-400 font-bold leading-none">應收</p>
          <p className="text-[10px] font-black text-green-600 mt-1">+¥200</p>
        </div>
      </div>
    </div>
  );
};

export default MemberCard;
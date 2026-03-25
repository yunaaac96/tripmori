import React from 'react';

const MemberCard = ({ member }: { member: any }) => {
  // 自動匹配頭像圖示
  const getIcon = (name: string) => {
    const n = (name || "").toLowerCase();
    if (n.includes('uu')) return '🌿';
    if (n.includes('brian')) return '⛰️';
    return '👤';
  };

  return (
    <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-50 text-center animate-in zoom-in duration-300">
      <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl shadow-inner"
           style={{ backgroundColor: (member.color || '#769370') + '22' }}>
        {getIcon(member.name)}
      </div>
      
      {/* 確保 name 存在，否則顯示 Unknown */}
      <h3 className="font-black text-slate-800 text-lg">{member.name || "新成員"}</h3>
      
      {/* 確保 role 存在 */}
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
        {member.role || "成員"}
      </p>

      <div className="mt-4 flex justify-around text-[9px] font-black">
        <div className="bg-slate-50 px-2 py-1 rounded-lg text-slate-500">
          已付 ¥8,400
        </div>
        <div className="bg-green-50 px-2 py-1 rounded-lg text-green-600">
          +¥200
        </div>
      </div>
    </div>
  );
};

export default MemberCard;
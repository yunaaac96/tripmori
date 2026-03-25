import React from 'react';

const BookingCard = ({ data }: { data: any }) => {
  const isFlight = data.type === 'flight';

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-50 overflow-hidden mb-6">
      {/* 卡片頭部 */}
      <div className={`p-6 ${isFlight ? 'bg-[#769370]' : 'bg-[#90BECC]'} text-white`}>
        <div className="flex justify-between items-center opacity-80 text-[10px] font-black uppercase tracking-[0.2em]">
          <span>{isFlight ? `✈️ ${data.airline}` : `🏨 HOTEL`}</span>
          <span>{data.flightNo || data.roomType || 'RESERVATION'}</span>
        </div>
        <div className="mt-4 flex justify-between items-center">
          <div className="text-left">
            <h3 className="text-3xl font-black">{isFlight ? data.departure?.airport : data.name}</h3>
            <p className="text-[10px] font-bold opacity-70">{isFlight ? data.departure?.airportName : 'Okinawa, Japan'}</p>
          </div>
          {isFlight && <span className="text-3xl opacity-50">→</span>}
          {isFlight && (
            <div className="text-right">
              <h3 className="text-3xl font-black">{data.arrival?.airport}</h3>
              <p className="text-[10px] font-bold opacity-70">{data.arrival?.airportName}</p>
            </div>
          )}
        </div>
      </div>

      {/* 卡片詳情區 */}
      <div className="p-6 bg-white grid grid-cols-2 gap-y-4 gap-x-2">
        <DetailItem label="日期 / 日期" value={isFlight ? '4/23 08:25' : '4/23 - 4/24'} />
        <DetailItem label="確認碼 / PIN" value={data.confirmCode || data.pin || 'JL8K2M'} />
        {!isFlight && <div className="col-span-2 border-t border-slate-50 pt-4 mt-2 italic text-[10px] text-slate-400">📍 {data.address}</div>}
      </div>
    </div>
  );
};

const DetailItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">{label}</p>
    <p className="text-sm font-bold text-slate-700 mt-0.5">{value}</p>
  </div>
);

export default BookingCard;
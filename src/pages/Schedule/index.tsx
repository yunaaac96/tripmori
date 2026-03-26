import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faClock, faCloudSun } from '@fortawesome/free-solid-svg-icons';

const SchedulePage = ({ events }: any) => {
  const [activeDay, setActiveDay] = useState("2026-04-23");
  return (
    <div style={{ padding: '0 20px', animation: 'fadeIn 0.5s' }}>
      <div style={{ background: '#E9C46A', borderRadius: 24, padding: '16px', color: 'white', marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 900, fontSize: 12 }}>距离出發還有</span>
        <span style={{ fontWeight: 900, fontSize: 20 }}>28D 14H</span>
      </div>
      <h1 style={{ textAlign: 'center', margin: '30px 0', fontWeight: 900, fontSize: 28 }}>日本沖繩之旅 🗾</h1>
      <div style={{ textAlign: 'center', padding: '40px', color: '#A0AEC0', fontWeight: 700 }}>行程資料加載中... 🌱</div>
    </div>
  );
};
export default SchedulePage;
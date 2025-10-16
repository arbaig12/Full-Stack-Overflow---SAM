import React, { useState } from 'react';
import { getCurrentDate, setCustomDate } from '../utils/dateWrapper';

export default function CurrentDateConfig() {
  const [manualDate, setManualDate] = useState('');
  const [current, setCurrent] = useState(getCurrentDate());

  const handleApply = () => {
    setCustomDate(manualDate || null);
    setCurrent(getCurrentDate());
  };

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: 20 }}>
      <h3>Current Date Configuration</h3>
      <p>Current system date: {current.toDateString()}</p>

      <input
        type="date"
        value={manualDate}
        onChange={e => setManualDate(e.target.value)}
        style={{ padding: 6, marginRight: 10 }}
      />
      <button onClick={handleApply} style={{ padding: "6px 12px" }}>
        Apply
      </button>

      <p style={{ marginTop: 10 }}>
        Leave empty to use the actual current date.
      </p>
    </div>
  );
}


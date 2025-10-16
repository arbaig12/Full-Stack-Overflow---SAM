import React, { useState } from 'react';
import axios from 'axios';

export default function ImportPage() {
  const [files, setFiles] = useState({
    users: null,
    catalog: null,
    schedule: null,
    calendar: null,
  });
  const [messages, setMessages] = useState({});
  const [logs, setLogs] = useState({});

  const handleFileChange = (type, file) => {
    setFiles(prev => ({ ...prev, [type]: file }));
    setMessages(prev => ({ ...prev, [type]: '' }));
    setLogs(prev => ({ ...prev, [type]: [] }));
  };

  const handleUpload = async (type, endpoint) => {
    const file = files[type];
    if (!file) {
      setMessages(prev => ({ ...prev, [type]: 'Please select a file.' }));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`http://localhost:5000/${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
      });

      setMessages(prev => ({ ...prev, [type]: res.data.message || 'Import successful!' }));
      if (res.data.logs) {
        setLogs(prev => ({ ...prev, [type]: res.data.logs }));
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => ({ ...prev, [type]: err.response?.data?.error || 'Error importing file.' }));
    }
  };

  const renderFileInput = (label, type, endpoint, accept) => (
    <div style={{ marginBottom: 20 }}>
      <h3>{label}</h3>
      <input
        type="file"
        accept={accept}
        onChange={e => handleFileChange(type, e.target.files[0])}
      />
      <button
        onClick={() => handleUpload(type, endpoint)}
        style={{
          marginLeft: 10,
          padding: '6px 12px',
          cursor: 'pointer',
          border: '1px solid #ddd',
          background: '#fff',
          borderRadius: 999,
        }}
      >
        Upload
      </button>

      {messages[type] && <p style={{ marginTop: 6 }}>{messages[type]}</p>}

      {logs[type]?.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: '#f0f0f0', borderRadius: 8 }}>
          <h4>Logs / Warnings</h4>
          <ul>
            {logs[type].map((log, idx) => (
              <li key={idx}>{log}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
      <h2>Registrar Imports</h2>

      {renderFileInput('Import Users', 'users', 'import/users', '.yaml,.yml')}
      {renderFileInput('Import Course Catalog', 'catalog', 'import/catalog', '.yaml,.yml')}
      {renderFileInput('Import Class Schedule', 'schedule', 'import/schedule', '.pdf')}
      {renderFileInput('Import Academic Calendar', 'calendar', 'import/calendar', '.yaml,.yml')}
    </div>
  );
}

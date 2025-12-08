import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function ImportPage() {
  const [files, setFiles] = useState({
    users: null,
    catalog: null,
    schedule: null,
    calendar: null,
    degreeReq: null,
    rooms: null, 
  });
  const [messages, setMessages] = useState({});
  const [logs, setLogs] = useState({});
  const [terms, setTerms] = useState([]);
  const [scheduleTermId, setScheduleTermId] = useState('');

  useEffect(() => {
    async function loadTerms() {
      try {
        // Try to get terms from registration init, but if it fails (401), try a public endpoint
        let termsData = null;
        try {
          const res = await axios.get('http://localhost:4000/api/registration/init', {
            withCredentials: true,
          });
          if (res.data.ok !== false && res.data.terms) {
            termsData = res.data.terms;
          }
        } catch (err) {
          // If 401, user not logged in - that's okay, we can still import without term selection
          if (err.response?.status === 401) {
            console.log('Not authenticated - term selection will be optional');
          } else {
            console.error('Failed to load terms:', err);
          }
        }
        
        // If we got terms, use them; otherwise terms array stays empty and user can rely on auto-detection
        if (termsData) {
          setTerms(termsData);
          if (termsData.length > 0 && !scheduleTermId) {
            setScheduleTermId(String(termsData[0].termId));
          }
        }
      } catch (err) {
        console.error('Failed to load terms:', err);
      }
    }
    loadTerms();
  }, []);

  const handleFileChange = (type, file) => {
    setFiles(prev => ({ ...prev, [type]: file }));
    setMessages(prev => ({ ...prev, [type]: '' }));
    setLogs(prev => ({ ...prev, [type]: [] }));
  };

  const handleUpload = async (type, endpoint, extraData = {}) => {
    const file = files[type];
    if (!file) {
      setMessages(prev => ({ ...prev, [type]: 'Please select a file.' }));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    
    // Add extra form data (e.g., term_id for schedule import)
    Object.keys(extraData).forEach(key => {
      if (extraData[key]) {
        formData.append(key, extraData[key]);
      }
    });

    try {
      const res = await axios.post(`http://localhost:4000/${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
      });

      setMessages(prev => ({ ...prev, [type]: res.data.message || res.data.status === 'success' ? 'Import successful!' : 'Import completed' }));
      
      // Helper function to filter out "No course found" warnings
      const filterCourseWarnings = (warnings) => {
        if (!warnings || !Array.isArray(warnings)) return [];
        return warnings.filter(w => {
          const wLower = String(w).toLowerCase();
          return !wLower.includes('no course found') && !wLower.includes('skipping');
        });
      };
      
      // Handle warnings from summary (for user imports) or logs (for other imports)
      if (res.data.summary?.warnings && res.data.summary.warnings.length > 0) {
        // Filter out course warnings for all import types
        const filteredWarnings = filterCourseWarnings(res.data.summary.warnings);
        if (filteredWarnings.length > 0) {
          setLogs(prev => ({ ...prev, [type]: filteredWarnings }));
        }
      } else if (res.data.logs) {
        const filteredLogs = filterCourseWarnings(res.data.logs);
        if (filteredLogs.length > 0) {
          setLogs(prev => ({ ...prev, [type]: filteredLogs }));
        }
      } else if (res.data.summary) {
        // For schedule import, show summary info
        const summary = res.data.summary;
        const summaryLogs = [];
        if (summary.inserted) summaryLogs.push(`Inserted: ${summary.inserted}`);
        if (summary.updated) summaryLogs.push(`Updated: ${summary.updated}`);
        if (summary.skipped) summaryLogs.push(`Skipped: ${summary.skipped}`);
        // Filter out "No course found" warnings - these are expected when courses haven't been imported from catalog yet
        if (summary.warnings && summary.warnings.length > 0) {
          const filteredWarnings = filterCourseWarnings(summary.warnings);
          if (filteredWarnings.length > 0) {
            summaryLogs.push(...filteredWarnings);
          }
        }
        if (summaryLogs.length > 0) {
          setLogs(prev => ({ ...prev, [type]: summaryLogs }));
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => ({ ...prev, [type]: err.response?.data?.error || 'Error importing file.' }));
    }
  };

  const renderFileInput = (label, type, endpoint, accept, showTermSelect = false) => (
    <div style={{ marginBottom: 20 }}>
      <h3>{label}</h3>
      {showTermSelect && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
            Term (optional - will auto-detect from PDF if not specified):
          </label>
          <select
            value={scheduleTermId}
            onChange={(e) => setScheduleTermId(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 14,
              minWidth: 200,
            }}
          >
            <option value="">Auto-detect from PDF</option>
            {terms.map((term) => (
              <option key={term.termId} value={term.termId}>
                {term.semester} {term.year}
              </option>
            ))}
          </select>
        </div>
      )}
      <input
        type="file"
        accept={accept}
        onChange={e => handleFileChange(type, e.target.files[0])}
      />
      <button
        onClick={() => {
          const extraData = showTermSelect && scheduleTermId ? { term_id: scheduleTermId } : {};
          handleUpload(type, endpoint, extraData);
        }}
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
          <ul style={{ margin: 0, paddingLeft: 20 }}>
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

      {renderFileInput('Import Users', 'users', 'api/import/users', '.yaml,.yml')}
      {renderFileInput('Import Course Catalog', 'catalog', 'api/import/catalog', '.yaml,.yml')}
      {renderFileInput('Import Class Schedule', 'schedule', 'api/import/schedule', '.pdf', terms.length > 0)}
      {renderFileInput('Import Academic Calendar', 'calendar', 'api/import/academic-calendar', '.yaml,.yml')}
      {renderFileInput('Import Degree Requirements', 'degreeReq', 'api/import/degree-requirements', '.yaml,.yml')}
      {renderFileInput('Import Rooms', 'rooms', 'api/import/rooms', '.yaml,.yml')}
    </div>
  );
}

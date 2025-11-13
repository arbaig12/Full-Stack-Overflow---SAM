import React, { useState, useEffect } from 'react';
import axios from 'axios';

const availableMajors = [
  'Biology (BA)',
  'Biology (BS)',
  'Psychology',
  'Computer Science',
  'Economics',
  'Applied Mathematical Sciences (BA)',
  'Applied Mathematical Sciences (BS)',
  "Political Science",
];

const availableMinors = [
  'Biology',
  'Psychology',
  'Computer Science',
  'Economics',
  'Applied Mathematical Sciences',
  "Political Science",
];

export default function DeclareMajorMinor({}) {
  const [currentMajor, setCurrentMajor] = useState('');
  const [currentMinor, setCurrentMinor] = useState('');
  const [selectedMajor, setSelectedMajor] = useState(currentMajor || '');
  const [selectedMinor, setSelectedMinor] = useState(currentMinor || '');
  const [type, setType] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchCurrentProgram = async () => {
      try {
        const res = await axios.get('http://localhost:4000/api/users/current-program');
        setCurrentMajor(res.data.major || '');
        setCurrentMinor(res.data.minor || '');
        setSelectedMajor(res.data.major || '');
        setSelectedMinor(res.data.minor || '');
      } catch (err) {
        console.error('Failed to fetch current program:', err);
      }
    };
    fetchCurrentProgram();
  }, []);

  const handleSave = async () => {
    if (!selectedMajor) {
      alert('Please select a major.');
      return;
    }

    try {
      const res = await axios.post('http://localhost:4000/api/users/update-program', {
        major: selectedMajor,
        minor: selectedMinor,
      });
      setCurrentMajor(selectedMajor);
      setCurrentMinor(selectedMinor);
      setMessage(res.data.message || 'Program updated successfully!');
    } catch (err) {
      console.error(err);
      setMessage('Failed to save program.');
    }
  };

  return (
  <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
    <h1>Declare Your Major / Minor</h1>
    
    {/* Show current major and minor */}
      <div style={{ marginBottom: 20, padding: 10, backgroundColor: '#f5f5f5', borderRadius: 6 }}>
        <p><strong>Current Major:</strong> {currentMajor || 'None'}</p>
        <p><strong>Current Minor:</strong> {currentMinor || 'None'}</p>
    </div>
      
    {/*Choose type */}
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontWeight: 'bold' }}>Select Type:</label>
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        style={{ display: 'block', width: '100%', padding: 8, marginTop: 8, borderRadius: 6 }}
      >
        <option value="">-- Select Type --</option>
        <option value="major">Major</option>
        <option value="minor">Minor</option>
      </select>
    </div>

    {/*Choose the actual major or minor */}
    {type && (
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 'bold' }}>
          {type === 'major' ? 'Major:' : 'Minor:'}
        </label>
        <select
          value={type === 'major' ? selectedMajor : selectedMinor}
          onChange={(e) =>
            type === 'major'
              ? setSelectedMajor(e.target.value)
              : setSelectedMinor(e.target.value)
          }
          style={{ display: 'block', width: '100%', padding: 8, marginTop: 8, borderRadius: 6 }}
        >
          <option value="">
            -- Select {type === 'major' ? 'Major' : 'Minor'} --
          </option>
          {(type === 'major' ? availableMajors : availableMinors).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    )}

    <button
      onClick={handleSave}
      style={{
        padding: '12px 24px',
        backgroundColor: '#1976d2',
        color: 'white',
        fontWeight: 'bold',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer'
      }}
    >
      Send
    </button>
  </div>
  );
}

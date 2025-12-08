import React, { useEffect, useState } from 'react';

export default function RegistrationScheduleManage() {
  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const classStandings = ['U4', 'U3', 'U2', 'U1'];

  useEffect(() => {
    async function fetchTerms() {
      try {
        const res = await fetch('/api/registration/init', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.terms) {
            const termsWithLabel = data.terms.map((t) => ({
              ...t,
              termLabel: `${t.semester} ${t.year}`,
            }));
            setTerms(termsWithLabel);
            if (termsWithLabel.length > 0) {
              setSelectedTermId(String(termsWithLabel[0].termId));
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch terms:', err);
        setError('Failed to load terms');
      }
    }
    fetchTerms();
  }, []);

  useEffect(() => {
    if (!selectedTermId) {
      setWindows([]);
      return;
    }

    async function fetchSchedule() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`/api/registration/schedule/${selectedTermId}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.windows) {
            setWindows(data.windows.map((w) => ({ ...w, id: Math.random() })));
          } else {
            setWindows([]);
          }
        } else {
          const data = await res.json();
          setError(data.error || 'Failed to load schedule');
          setWindows([]);
        }
      } catch (err) {
        console.error('Failed to fetch schedule:', err);
        setError('Failed to load registration schedule');
        setWindows([]);
      } finally {
        setLoading(false);
      }
    }

    fetchSchedule();
  }, [selectedTermId]);

  const addWindow = () => {
    setWindows([
      ...windows,
      {
        id: Math.random(),
        classStanding: 'U4',
        creditThreshold: null,
        registrationStartDate: '',
      },
    ]);
  };

  const removeWindow = (id) => {
    setWindows(windows.filter((w) => w.id !== id));
  };

  const updateWindow = (id, field, value) => {
    setWindows(
      windows.map((w) => {
        if (w.id === id) {
          if (field === 'creditThreshold') {
            // Handle credit threshold: "100+" means 100, "< 100" means null, empty means null
            if (value === '' || value === null) {
              return { ...w, creditThreshold: null };
            }
            if (value === '100+') {
              return { ...w, creditThreshold: 100 };
            }
            if (value === '< 100') {
              return { ...w, creditThreshold: 0 }; // 0 is special value for "< 100"
            }
            // Try to parse as integer
            const parsed = parseInt(value, 10);
            return { ...w, creditThreshold: isNaN(parsed) ? null : parsed };
          }
          return { ...w, [field]: value };
        }
        return w;
      })
    );
  };

  const formatCreditThreshold = (threshold) => {
    if (threshold === null || threshold === undefined) return '';
    if (threshold === 100) return '100+';
    if (threshold === 0) return '< 100';
    return String(threshold);
  };

  const handleSave = async () => {
    if (!selectedTermId) {
      setError('Please select a term');
      return;
    }

    // Validate all windows have required fields
    for (const window of windows) {
      if (!window.classStanding || !window.registrationStartDate) {
        setError('All windows must have class standing and registration start date');
        return;
      }
    }

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      // Prepare windows for submission
      const windowsToSubmit = windows.map((w) => ({
        classStanding: w.classStanding,
        creditThreshold: w.creditThreshold,
        registrationStartDate: w.registrationStartDate,
      }));

      const res = await fetch('/api/registration/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          termId: parseInt(selectedTermId, 10),
          windows: windowsToSubmit,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setSuccessMsg(`Registration schedule saved successfully for ${terms.find((t) => String(t.termId) === selectedTermId)?.termLabel || 'selected term'}`);
        setError('');
        // Reload the schedule
        const reloadRes = await fetch(`/api/registration/schedule/${selectedTermId}`, {
          credentials: 'include',
        });
        if (reloadRes.ok) {
          const reloadData = await reloadRes.json();
          if (reloadData.ok && reloadData.windows) {
            setWindows(reloadData.windows.map((w) => ({ ...w, id: Math.random() })));
          }
        }
      } else {
        setError(data.error || 'Failed to save registration schedule');
        setSuccessMsg('');
      }
    } catch (err) {
      console.error('Failed to save schedule:', err);
      setError('Failed to save registration schedule');
      setSuccessMsg('');
    } finally {
      setSaving(false);
    }
  };

  const selectedTerm = terms.find((t) => String(t.termId) === selectedTermId);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Registration Schedule Management</h1>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: '#fee',
            border: '1px solid #fcc',
            borderRadius: 6,
            color: '#c00',
          }}
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: '#efe',
            border: '1px solid #cfc',
            borderRadius: 6,
            color: '#0c0',
          }}
        >
          {successMsg}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
          Select Term:
        </label>
        <select
          value={selectedTermId}
          onChange={(e) => setSelectedTermId(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: 14,
            minWidth: 200,
          }}
        >
          <option value="">-- Select Term --</option>
          {terms.map((term) => (
            <option key={term.termId} value={String(term.termId)}>
              {term.semester} {term.year}
            </option>
          ))}
        </select>
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center' }}>Loading...</div>}

      {!loading && selectedTermId && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 600 }}>
              Registration Windows for {selectedTerm?.semester} {selectedTerm?.year}
            </h2>
            <button
              onClick={addWindow}
              style={{
                padding: '8px 16px',
                background: '#0066cc',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + Add Window
            </button>
          </div>

          {windows.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', background: '#f9f9f9', borderRadius: 6, border: '1px solid #eee' }}>
              No registration windows defined. Click "Add Window" to create one.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16, overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #ddd' }}>Class Standing</th>
                      <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #ddd' }}>Credit Threshold</th>
                      <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #ddd' }}>Registration Start Date</th>
                      <th style={{ padding: 12, textAlign: 'center', borderBottom: '2px solid #ddd' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {windows.map((window) => (
                      <tr key={window.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: 12 }}>
                          <select
                            value={window.classStanding || ''}
                            onChange={(e) => updateWindow(window.id, 'classStanding', e.target.value)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid #ccc',
                              fontSize: 14,
                              width: '100%',
                            }}
                          >
                            {classStandings.map((standing) => (
                              <option key={standing} value={standing}>
                                {standing}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: 12 }}>
                          <select
                            value={formatCreditThreshold(window.creditThreshold)}
                            onChange={(e) => updateWindow(window.id, 'creditThreshold', e.target.value)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid #ccc',
                              fontSize: 14,
                              width: '100%',
                            }}
                          >
                            <option value="">No threshold</option>
                            <option value="100+">100+</option>
                            <option value="< 100">&lt; 100</option>
                          </select>
                        </td>
                        <td style={{ padding: 12 }}>
                          <input
                            type="date"
                            value={window.registrationStartDate || ''}
                            onChange={(e) => updateWindow(window.id, 'registrationStartDate', e.target.value)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid #ccc',
                              fontSize: 14,
                              width: '100%',
                            }}
                          />
                        </td>
                        <td style={{ padding: 12, textAlign: 'center' }}>
                          <button
                            onClick={() => removeWindow(window.id)}
                            style={{
                              padding: '6px 12px',
                              background: '#dc3545',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontSize: 14,
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 24 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '10px 24px',
                    background: saving ? '#ccc' : '#28a745',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Registration Schedule'}
                </button>
              </div>

              <div style={{ marginTop: 16, padding: 12, background: '#f0f8ff', borderRadius: 6, fontSize: 14, color: '#666' }}>
                <strong>Note:</strong> Registration windows end on the "Late registration ends" date from the academic calendar for this term.
                Windows are checked in order: U4 (with credit thresholds) → U4 (no threshold) → U3 → U2 → U1.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}


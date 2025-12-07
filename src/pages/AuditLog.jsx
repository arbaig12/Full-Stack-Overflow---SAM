import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function AuditLog() {
  const { user } = useAuth();
  const [role, setRole] = useState(() => localStorage.getItem('role') || 'student');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 100, offset: 0, hasMore: false });
  const [actionTypes, setActionTypes] = useState([]);
  
  // Filters
  const [filters, setFilters] = useState({
    student_id: '',
    action_type: '',
    start_date: '',
    end_date: ''
  });
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    loadActionTypes();
    loadEntries();
  }, [role, filters, pagination.offset]);

  async function loadActionTypes() {
    try {
      if (role !== 'advisor' && role !== 'registrar') return;

      const res = await fetch('/api/audit-log/action-types', {
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        setActionTypes(data.actionTypes || []);
      }
    } catch (err) {
      console.error('Failed to load action types:', err);
    }
  }

  async function loadEntries() {
    try {
      setLoading(true);
      setError('');

      let url = '/api/audit-log';
      if (role === 'student') {
        const studentId = user?.user_id || user?.userId;
        if (!studentId) {
          setError('Student ID not found');
          return;
        }
        url = `/api/audit-log/students/${studentId}`;
      }

      const params = new URLSearchParams();
      if (filters.student_id) params.append('student_id', filters.student_id);
      if (filters.action_type) params.append('action_type', filters.action_type);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      params.append('limit', pagination.limit.toString());
      params.append('offset', pagination.offset.toString());

      const res = await fetch(`${url}?${params.toString()}`, {
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load audit log');
      }

      const data = await res.json();
      setEntries(data.entries || []);
      setPagination(data.pagination || { total: 0, limit: 100, offset: 0, hasMore: false });
    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, offset: 0 }));
  }

  function handlePreviousPage() {
    if (pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    }
  }

  function handleNextPage() {
    if (pagination.hasMore) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    }
  }

  function getActionIcon(actionType) {
    switch (actionType?.toLowerCase()) {
      case 'hold_created':
      case 'hold_issued':
        return '⚠️';
      case 'hold_resolved':
        return '✅';
      case 'waiver_requested':
        return '📝';
      case 'waiver_approved':
        return '✓';
      case 'waiver_rejected':
        return '✗';
      case 'enrollment':
        return '📚';
      case 'grade_submitted':
        return '📊';
      case 'program_declared':
        return '🎓';
      default:
        return '📋';
    }
  }

  function getActionColor(actionType) {
    switch (actionType?.toLowerCase()) {
      case 'hold_created':
      case 'hold_issued':
        return '#ffc107';
      case 'hold_resolved':
        return '#28a745';
      case 'waiver_approved':
        return '#28a745';
      case 'waiver_rejected':
        return '#dc3545';
      case 'waiver_requested':
        return '#17a2b8';
      default:
        return '#6c757d';
    }
  }

  if (loading && entries.length === 0) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginBottom: 24 }}>Audit Log</h1>

      {error && (
        <div style={{
          padding: 12,
          marginBottom: 16,
          borderRadius: 6,
          background: '#ffebee',
          color: '#c62828',
          border: '1px solid #ef5350'
        }}>
          {error}
        </div>
      )}

      {/* Filters (only for advisor/registrar) */}
      {(role === 'advisor' || role === 'registrar') && (
        <div style={{
          padding: 20,
          marginBottom: 24,
          borderRadius: 12,
          background: '#fff',
          border: '1px solid #e0e0e0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Filters</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
                Student ID:
              </label>
              <input
                type="text"
                value={filters.student_id}
                onChange={(e) => handleFilterChange('student_id', e.target.value)}
                placeholder="Enter student ID"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
                Action Type:
              </label>
              <select
                value={filters.action_type}
                onChange={(e) => handleFilterChange('action_type', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 14
                }}
              >
                <option value="">All Actions</option>
                {actionTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
                Start Date:
              </label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
                End Date:
              </label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>
          </div>
          <button
            onClick={() => {
              setFilters({ student_id: '', action_type: '', start_date: '', end_date: '' });
              setPagination(prev => ({ ...prev, offset: 0 }));
            }}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: '#f5f5f5',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Results Summary */}
      <div style={{ marginBottom: 16, color: '#666' }}>
        Showing {entries.length} of {pagination.total} entries
      </div>

      {/* Audit Log Entries */}
      {entries.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: '#f9f9f9',
          borderRadius: 8,
          border: '1px solid #e0e0e0',
          color: '#666'
        }}>
          <p>No audit log entries found.</p>
          {(role === 'advisor' || role === 'registrar') && (
            <p style={{ fontSize: 14, marginTop: 8 }}>Try adjusting your filters.</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {entries.map(entry => (
            <div
              key={entry.auditId}
              style={{
                padding: 16,
                borderRadius: 8,
                background: '#fff',
                border: '1px solid #e0e0e0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                display: 'flex',
                gap: 16,
                alignItems: 'start'
              }}
            >
              <div style={{
                fontSize: 24,
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: getActionColor(entry.actionType) + '20',
                color: getActionColor(entry.actionType),
                flexShrink: 0
              }}>
                {getActionIcon(entry.actionType)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>
                      {entry.actionType?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </div>
                    {(role === 'advisor' || role === 'registrar') && entry.studentName && (
                      <div style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>
                        Student: {entry.studentName} (ID: {entry.studentId})
                      </div>
                    )}
                  </div>
                  <div style={{ color: '#666', fontSize: 12, textAlign: 'right' }}>
                    {new Date(entry.performedAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ color: '#333', marginBottom: 8 }}>
                  {entry.actionDescription}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
                  <span>
                    <strong>Performed by:</strong> {entry.performedByName || 'System'} (ID: {entry.performedBy})
                  </span>
                  {entry.entityType && (
                    <span>
                      <strong>Entity:</strong> {entry.entityType} {entry.entityId ? `(ID: ${entry.entityId})` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 24,
          padding: 16,
          background: '#f8f9fa',
          borderRadius: 8,
          border: '1px solid #e0e0e0'
        }}>
          <div style={{ color: '#666', fontSize: 14 }}>
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handlePreviousPage}
              disabled={pagination.offset === 0}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #ddd',
                background: pagination.offset === 0 ? '#f5f5f5' : 'white',
                color: pagination.offset === 0 ? '#999' : '#333',
                cursor: pagination.offset === 0 ? 'not-allowed' : 'pointer',
                fontSize: 14
              }}
            >
              Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={!pagination.hasMore}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #ddd',
                background: !pagination.hasMore ? '#f5f5f5' : 'white',
                color: !pagination.hasMore ? '#999' : '#333',
                cursor: !pagination.hasMore ? 'not-allowed' : 'pointer',
                fontSize: 14
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


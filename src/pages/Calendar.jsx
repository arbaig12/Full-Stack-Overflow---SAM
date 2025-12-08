// import React, { useEffect, useMemo, useState } from 'react';

// export default function Calendar() {
//   const role = localStorage.getItem('role') || 'student';
//     const isRegistrar = role === 'registrar';

//   const [terms, setTerms] = useState([]);
//   const [selectedTermId, setSelectedTermId] = useState('');
//   const [calendar, setCalendar] = useState(null);

//   const [loading, setLoading] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState('');
//   const [successMsg, setSuccessMsg] = useState('');

//   // Edit modal
//   const [editOpen, setEditOpen] = useState(false);
//   const [editKey, setEditKey] = useState('');
//   const [editLabel, setEditLabel] = useState('');
//   const [editValue, setEditValue] = useState(''); // YYYY-MM-DD
//   const [editErr, setEditErr] = useState('');

//   const FIELDS = useMemo(
//     () => [
//       { key: 'major_and_minor_changes_end', label: 'Major/Minor Changes End' },
//       { key: 'waitlist', label: 'Waitlist Deadline' },
//       { key: 'waitlist_process_ends', label: 'Waitlist Process Ends' },
//       { key: 'late_registration_ends', label: 'Late Registration Ends' },
//       { key: 'gpnc_selection_ends', label: 'GPNC Selection Ends' },
//       { key: 'course_withdrawal_ends', label: 'Course Withdrawal Ends' },
//       { key: 'major_and_minor_changes_begin', label: 'Major/Minor Changes Begin' },
//       { key: 'advanced_registration_begins', label: 'Advanced Registration Begins' },
//       { key: 'semester_end', label: 'Semester End' },
//     ],
//     []
//   );

//   useEffect(() => {
//     (async () => {
//       try {
//         setLoading(true);
//         setError('');
//         setSuccessMsg('');

//         const res = await fetch('/api/calendar/terms', { credentials: 'include' });
//         const data = await res.json();
//         if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to load terms.');

//         setTerms(data.terms || []);
//         if ((data.terms || []).length > 0) setSelectedTermId(String(data.terms[0].termId));
//       } catch (e) {
//         console.error(e);
//         setError(e.message || 'Failed to load calendar setup.');
//       } finally {
//         setLoading(false);
//       }
//     })();
//   }, []);

//   useEffect(() => {
//     if (!selectedTermId) return;

//     (async () => {
//       try {
//         setLoading(true);
//         setError('');
//         setSuccessMsg('');

//         const res = await fetch(`/api/calendar/${selectedTermId}`, { credentials: 'include' });
//         const data = await res.json();
//         if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to load academic calendar.');

//         setCalendar(data.calendar || null);
//       } catch (e) {
//         console.error(e);
//         setError(e.message || 'Failed to load academic calendar.');
//         setCalendar(null);
//       } finally {
//         setLoading(false);
//       }
//     })();
//   }, [selectedTermId]);

//   const selectedTermLabel = useMemo(() => {
//     const t = terms.find((x) => String(x.termId) === String(selectedTermId));
//     return t ? `${t.semester} ${t.year}` : '';
//   }, [terms, selectedTermId]);

//   const openEdit = (field) => {
//     if (role !== 'registrar') return;
//     setEditErr('');
//     setSuccessMsg('');
//     setError('');

//     setEditKey(field.key);
//     setEditLabel(field.label);
//     setEditValue((calendar?.[field.key] || '').toString()); // expected YYYY-MM-DD or ''
//     setEditOpen(true);
//   };

//   const closeEdit = () => {
//     if (saving) return;
//     setEditOpen(false);
//     setEditKey('');
//     setEditLabel('');
//     setEditValue('');
//     setEditErr('');
//   };

//   const saveEdit = async () => {
//     if (role !== 'registrar') return;
//     setEditErr('');
//     setSuccessMsg('');
//     setError('');

//     try {
//       setSaving(true);

//       const payload = { field: editKey, value: editValue || null };
//       const res = await fetch(`/api/calendar/${selectedTermId}`, {
//         method: 'PUT',
//         headers: { 'Content-Type': 'application/json' },
//         credentials: 'include',
//         body: JSON.stringify(payload),
//       });

//       const data = await res.json();
//       if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to update calendar.');

//       setCalendar(data.calendar || null);
//       setSuccessMsg(data.message || 'Calendar updated.');
//       closeEdit();
//     } catch (e) {
//       console.error(e);
//       setEditErr(e.message || 'Failed to update calendar.');
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <div style={{ padding: 20, maxWidth: 980, margin: '0 auto' }}>
//       <h1 style={{ marginTop: 0 }}>Academic Calendar</h1>

//       <p style={{ color: '#555', maxWidth: 850, marginBottom: 18 }}>
//         Select a term to view its academic calendar. {isRegistrar ? 'Registrars can edit dates.' : ''}
//       </p>

//       {(error || successMsg) && (
//         <div
//           style={{
//             marginBottom: 14,
//             padding: 12,
//             borderRadius: 6,
//             border: `1px solid ${error ? '#e57373' : '#81c784'}`,
//             background: error ? '#ffebee' : '#e8f5e9',
//             color: error ? '#c62828' : '#2e7d32',
//             fontSize: 14,
//           }}
//         >
//           {error || successMsg}
//         </div>
//       )}

//       <div
//         style={{
//           border: '1px solid #e0e0e0',
//           borderRadius: 10,
//           padding: 16,
//           background: '#fff',
//           boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
//           marginBottom: 16,
//           display: 'flex',
//           alignItems: 'center',
//           gap: 10,
//           flexWrap: 'wrap',
//         }}
//       >
//         <label style={{ fontWeight: 800, color: '#333' }}>Term:</label>
//         <select
//           value={selectedTermId}
//           onChange={(e) => setSelectedTermId(e.target.value)}
//           style={{
//             padding: '8px 10px',
//             border: '1px solid #ddd',
//             borderRadius: 8,
//             minWidth: 260,
//             fontSize: 14,
//           }}
//         >
//           {terms.length === 0 && <option value="">No terms loaded</option>}
//           {terms.map((t) => (
//             <option key={t.termId} value={t.termId}>
//               {t.semester} {t.year}
//             </option>
//           ))}
//         </select>

//         <span style={{ color: '#777', fontSize: 13 }}>
//           {selectedTermLabel ? `Viewing: ${selectedTermLabel}` : ''}
//         </span>
//       </div>

//       <div
//         style={{
//           border: '1px solid #e0e0e0',
//           borderRadius: 10,
//           padding: 16,
//           background: '#fff',
//           boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
//         }}
//       >
//         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
//           <h2 style={{ margin: 0, fontSize: 18, color: '#333' }}>Dates</h2>
//           {loading && <span style={{ color: '#666', fontSize: 13 }}>Loading…</span>}
//         </div>

//         <div style={{ marginTop: 12 }}>
//           <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
//             <thead>
//               <tr>
//                 <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #eee' }}>Event</th>
//                 <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #eee' }}>Date</th>
//                 <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #eee' }}>
//                   {isRegistrar ? 'Actions' : ''}
//                 </th>
//               </tr>
//             </thead>
//             <tbody>
//               {FIELDS.map((f) => {
//                 const v = calendar?.[f.key] || '';
//                 return (
//                   <tr key={f.key}>
//                     <td style={{ padding: '10px 6px', borderBottom: '1px solid #f3f3f3', fontWeight: 700 }}>
//                       {f.label}
//                     </td>
//                     <td style={{ padding: '10px 6px', borderBottom: '1px solid #f3f3f3', color: v ? '#222' : '#888' }}>
//                       {v ? v : '—'}
//                     </td>
//                     <td style={{ padding: '10px 6px', borderBottom: '1px solid #f3f3f3' }}>
//                       {isRegistrar && (
//                         <button
//                           type="button"
//                           onClick={() => openEdit(f)}
//                           style={{
//                             padding: '7px 12px',
//                             borderRadius: 8,
//                             border: '1px solid #ddd',
//                             background: '#fff',
//                             cursor: 'pointer',
//                             fontWeight: 700,
//                           }}
//                         >
//                           Edit
//                         </button>
//                       )}
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//           </table>

//           {!loading && !calendar && (
//             <p style={{ marginTop: 12, color: '#666' }}>
//               No calendar record exists for this term yet. {isRegistrar ? 'Use Edit to set dates.' : ''}
//             </p>
//           )}
//         </div>
//       </div>

//       {/* Edit Modal */}
//       {editOpen && (
//         <div
//           onMouseDown={(e) => {
//             if (e.target === e.currentTarget) closeEdit();
//           }}
//           style={{
//             position: 'fixed',
//             inset: 0,
//             background: 'rgba(0,0,0,0.35)',
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             padding: 16,
//             zIndex: 9999,
//           }}
//         >
//           <div
//             style={{
//               width: 'min(520px, 100%)',
//               background: '#fff',
//               borderRadius: 12,
//               border: '1px solid #e0e0e0',
//               boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
//               overflow: 'hidden',
//             }}
//           >
//             <div
//               style={{
//                 padding: '14px 16px',
//                 borderBottom: '1px solid #eee',
//                 display: 'flex',
//                 justifyContent: 'space-between',
//                 alignItems: 'center',
//                 gap: 12,
//               }}
//             >
//               <div>
//                 <div style={{ fontSize: 16, fontWeight: 900, color: '#222' }}>Edit Date</div>
//                 <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
//                   {selectedTermLabel} • {editLabel}
//                 </div>
//               </div>

//               <button
//                 type="button"
//                 onClick={closeEdit}
//                 disabled={saving}
//                 style={{
//                   padding: '6px 10px',
//                   borderRadius: 8,
//                   border: '1px solid #ddd',
//                   background: '#fff',
//                   cursor: 'pointer',
//                 }}
//               >
//                 ✕
//               </button>
//             </div>

//             <div style={{ padding: 16 }}>
//               {editErr && (
//                 <div
//                   style={{
//                     marginBottom: 12,
//                     padding: 10,
//                     borderRadius: 8,
//                     border: '1px solid #e57373',
//                     background: '#ffebee',
//                     color: '#c62828',
//                     fontSize: 13,
//                   }}
//                 >
//                   {editErr}
//                 </div>
//               )}

//               <label style={{ display: 'block', fontWeight: 800, marginBottom: 6 }}>
//                 {editLabel}
//               </label>

//               {/* native date picker */}
//               <input
//                 type="date"
//                 value={editValue || ''}
//                 onChange={(e) => setEditValue(e.target.value)}
//                 style={{
//                   width: '100%',
//                   padding: '10px 12px',
//                   border: '1px solid #ddd',
//                   borderRadius: 10,
//                   fontSize: 14,
//                 }}
//               />

//               <div style={{ marginTop: 10, color: '#777', fontSize: 12 }}>
//                 Stored in DB as <b>YYYY-MM-DD</b>.
//               </div>
//             </div>

//             <div
//               style={{
//                 padding: 16,
//                 borderTop: '1px solid #eee',
//                 display: 'flex',
//                 justifyContent: 'flex-end',
//                 gap: 10,
//                 background: '#fafafa',
//               }}
//             >
//               <button
//                 type="button"
//                 onClick={closeEdit}
//                 disabled={saving}
//                 style={{
//                   padding: '8px 14px',
//                   borderRadius: 10,
//                   border: '1px solid #ccc',
//                   background: '#fff',
//                   cursor: 'pointer',
//                   fontWeight: 800,
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 type="button"
//                 onClick={saveEdit}
//                 disabled={saving}
//                 style={{
//                   padding: '8px 14px',
//                   borderRadius: 10,
//                   border: 'none',
//                   background: '#1976d2',
//                   color: '#fff',
//                   cursor: 'pointer',
//                   fontWeight: 900,
//                   opacity: saving ? 0.7 : 1,
//                 }}
//               >
//                 {saving ? 'Saving…' : 'Save'}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

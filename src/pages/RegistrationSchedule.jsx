import React, { useEffect, useMemo, useState } from "react";

export default function RegistrationSchedule() {
  const [activeTab, setActiveTab] = useState("register");

  const [terms, setTerms] = useState([]);
  const [currentTermId, setCurrentTermId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");

  const [sections, setSections] = useState([]);
  const [enrollments, setEnrollments] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterCourseNum, setFilterCourseNum] = useState("");
  const [filterDays, setFilterDays] = useState({ M: false, T: false, W: false, R: false, F: false });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const parseMeetingDays = (daysOrSchedule) => {
    if (!daysOrSchedule) return new Set();
    const s = String(daysOrSchedule).replace(/\s+/g, "").toUpperCase();
    const out = new Set();
    for (const ch of s) {
      if (["M", "T", "W", "R", "F"].includes(ch)) out.add(ch);
    }
    return out;
  };

  const parseTimeRange = (timeStr) => {
    if (!timeStr) return null;
    const str = String(timeStr);
    const m = str.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;

    const [, h1, m1, h2, m2] = m;
    const start = parseInt(h1, 10) * 60 + parseInt(m1, 10);
    const end = parseInt(h2, 10) * 60 + parseInt(m2, 10);

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
    return { start, end };
  };

  const timeRangesOverlap = (a, b) => a.start < b.end && b.start < a.end;

  const findScheduleConflict = (candidate) => {
    const candDaySource = candidate.meetingDays || candidate.scheduleText;
    const candDays = parseMeetingDays(candDaySource);
    const candRange =
      parseTimeRange(candidate.meetingTimes) ||
      parseTimeRange(candidate.scheduleText);

    if (!candDays.size || !candRange) return null;

    for (const enr of enrollments) {
      if (String(enr.termId) !== String(selectedTermId)) continue;

      const enrDaySource = enr.meetingDays || enr.scheduleText;
      const enrDays = parseMeetingDays(enrDaySource);
      const enrRange =
        parseTimeRange(enr.meetingTimes) || parseTimeRange(enr.scheduleText);

      if (!enrDays.size || !enrRange) continue;

      const hasDayOverlap = [...candDays].some((d) => enrDays.has(d));
      if (!hasDayOverlap) continue;

      if (timeRangesOverlap(candRange, enrRange)) return enr;
    }

    return null;
  };

  useEffect(() => {
    async function loadRegistrationData() {
      try {
        setError("");
        setMessage("");

        // Try to load from registration/init (requires auth)
        let termsData = [];
        let enrollmentsData = [];
        let currentTermData = null;

        try {
          const res = await fetch("/api/registration/init", {
            credentials: "include",
          });

          if (res.ok) {
            const data = await res.json();
            if (data.ok !== false) {
              termsData = data.terms || [];
              enrollmentsData = data.enrollments || [];
              currentTermData = data.systemState?.currentTerm;
            }
          } else if (res.status === 401) {
            // Not authenticated - try to load terms from public endpoint
            console.log("Not authenticated, trying public terms endpoint");
            try {
              const termsRes = await fetch("/api/calendar/terms", {
                credentials: "include",
              });
              if (termsRes.ok) {
                const termsData_res = await termsRes.json();
                if (termsData_res.ok && termsData_res.terms) {
                  termsData = termsData_res.terms;
                }
              }
            } catch (termsErr) {
              console.log("Could not load terms from calendar endpoint");
            }
          }
        } catch (e) {
          // If registration/init fails, try calendar/terms as fallback
          console.log("Registration init failed, trying calendar terms");
          try {
            const termsRes = await fetch("/api/calendar/terms", {
              credentials: "include",
            });
            if (termsRes.ok) {
              const termsData_res = await termsRes.json();
              if (termsData_res.ok && termsData_res.terms) {
                termsData = termsData_res.terms;
              }
            }
          } catch (termsErr) {
            console.error("Could not load terms:", termsErr);
          }
        }

        setTerms(termsData);
        setEnrollments(enrollmentsData);

        // Set selected term
        if (currentTermData?.termId) {
          setCurrentTermId(String(currentTermData.termId));
          setSelectedTermId(String(currentTermData.termId));
        } else if (termsData.length > 0) {
          setCurrentTermId(String(termsData[0].termId));
          setSelectedTermId(String(termsData[0].termId));
        }
      } catch (e) {
        console.error(e);
        // Don't show error if it's just an auth issue - we can still view sections
        if (!e.message?.includes("401")) {
          setError(e.message || "Failed to load registration data.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadRegistrationData();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedTermId, searchTerm, filterSubject, filterCourseNum, filterDays, activeTab]);

  // Load sections with filters when filters or term changes
  useEffect(() => {
    async function loadSectionsWithFilters() {
      if (!selectedTermId) {
        setSections([]);
        return;
      }

      try {
        setLoading(true);
        setError("");

        // Build query params
        const params = new URLSearchParams({ term_id: selectedTermId });
        if (filterSubject) params.append('subject', filterSubject.toUpperCase());
        if (filterCourseNum) params.append('course_num', filterCourseNum);
        
        // Build days filter (e.g., "M,W" for Monday and Wednesday)
        // Backend stores days as "MW", "TR", etc., so we send single letters
        const selectedDays = Object.keys(filterDays).filter(day => filterDays[day]);
        if (selectedDays.length > 0) {
          const daysStr = selectedDays.join(',');
          params.append('days', daysStr);
        }

        const res = await fetch(`/api/schedule/sections?${params.toString()}`, {
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(`Failed to load sections (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (data.ok === false) {
          throw new Error(data.error || "Failed to load sections.");
        }

        // Transform sections to match the format expected by the component
        const transformedSections = (data.sections || []).map(sec => ({
          classId: sec.classId,
          termId: sec.termId,
          sectionNum: sec.sectionNumber,
          courseCode: sec.courseCode,
          courseTitle: sec.title,
          credits: sec.credits,
          instructorName: sec.instructor?.name || null,
          scheduleText: sec.meetingDays && sec.meetingTimes 
            ? `${sec.meetingDays} ${sec.meetingTimes}` 
            : sec.meetingDays || sec.meetingTimes || 'TBA',
          meetingDays: sec.meetingDays,
          meetingTimes: sec.meetingTimes,
          roomLabel: sec.location || 'TBA',
          capacity: sec.capacity,
          enrolledCount: sec.enrolled || 0,
          sbc: sec.sbc || '',
        }));

        setSections(transformedSections);
      } catch (e) {
        console.error(e);
        setError(e.message || "Failed to load sections.");
      } finally {
        setLoading(false);
      }
    }

    if (activeTab === "register") {
      loadSectionsWithFilters();
    }
  }, [selectedTermId, filterSubject, filterCourseNum, filterDays, activeTab]);

  const getTermLabel = (termId) => {
    const t = terms.find((term) => String(term.termId) === String(termId));
    return t ? `${t.semester} ${t.year}` : "";
  };

  const getAvailabilityColor = (enrolledCount, capacity) => {
    const e = enrolledCount || 0;
    const c = capacity || 1;
    const percentage = (e / c) * 100;
    if (percentage >= 90) return "#ff4444";
    if (percentage >= 75) return "#ff8800";
    return "#44aa44";
  };

  const getTotalCredits = (termId) => {
    return enrollments
      .filter((e) => String(e.termId) === String(termId))
      .reduce((sum, e) => sum + (e.credits || 0), 0);
  };

  const enrollmentsForSelectedTerm = useMemo(
    () => enrollments.filter((e) => String(e.termId) === String(selectedTermId)),
    [enrollments, selectedTermId]
  );

  const enrolledClassIds = useMemo(
    () => new Set(enrollmentsForSelectedTerm.map((e) => String(e.classId))),
    [enrollmentsForSelectedTerm]
  );

  const filteredSections = useMemo(() => {
    return sections.filter((sec) => {
      const matchesSearch =
        sec.courseTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sec.courseCode.toLowerCase().includes(searchTerm.toLowerCase());
      const notAlreadyEnrolled = !enrolledClassIds.has(String(sec.classId));
      return matchesSearch && notAlreadyEnrolled;
    });
  }, [sections, searchTerm, enrolledClassIds]);

  const totalPages = Math.max(1, Math.ceil(filteredSections.length / PAGE_SIZE));

  const pagedSections = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredSections.slice(start, start + PAGE_SIZE);
  }, [filteredSections, page, totalPages]);

  const handleRegister = async (section) => {
    try {
      setActionLoading(true);
      setMessage("");
      setError("");

      const conflict = findScheduleConflict(section);
      if (conflict) {
        setError(
          `Schedule conflict: ${section.courseCode} (${section.scheduleText || "time TBA"}) ` +
            `overlaps with ${conflict.courseCode} (${conflict.scheduleText || "time TBA"}).`
        );
        return;
      }

      const res = await fetch("/api/registration/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ classId: section.classId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error || `Failed to register for ${section.courseCode}.`
        );
      }

      const { enrollment, updatedSection } = data;

      if (enrollment) setEnrollments((prev) => [...prev, enrollment]);

      if (updatedSection) {
        setSections((prev) =>
          prev.map((s) =>
            String(s.classId) === String(updatedSection.classId)
              ? updatedSection
              : s
          )
        );
      }

      setMessage(`Successfully registered for ${section.courseCode}.`);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to register.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async (enrollment) => {
    try {
      setActionLoading(true);
      setMessage("");
      setError("");

      const res = await fetch("/api/registration/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enrollmentId: enrollment.enrollmentId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error || `Failed to withdraw from ${enrollment.courseCode}.`
        );
      }

      const { updatedSection } = data;

      setEnrollments((prev) =>
        prev.filter((e) => e.enrollmentId !== enrollment.enrollmentId)
      );

      if (updatedSection) {
        setSections((prev) =>
          prev.map((s) =>
            String(s.classId) === String(updatedSection.classId)
              ? updatedSection
              : s
          )
        );
      }

      setMessage(`Successfully withdrew from ${enrollment.courseCode}.`);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to withdraw.");
    } finally {
      setActionLoading(false);
    }
  };

  const termLabel = getTermLabel(selectedTermId);
  const totalCredits = getTotalCredits(selectedTermId);

  const Pagination = () => {
    if (totalPages <= 1) return null;

    const maxButtons = 7;
    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxButtons + 1);
    }

    const pages = [];
    for (let p = start; p <= end; p++) pages.push(p);

    const go = (p) => setPage(Math.min(Math.max(1, p), totalPages));

    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          alignItems: "center",
          marginTop: 18,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => go(1)}
          disabled={page === 1}
          style={{
            padding: "6px 10px",
            border: "1px solid #ddd",
            borderRadius: 6,
            background: "white",
            cursor: page === 1 ? "not-allowed" : "pointer",
            opacity: page === 1 ? 0.6 : 1,
          }}
        >
          First
        </button>
        <button
          onClick={() => go(page - 1)}
          disabled={page === 1}
          style={{
            padding: "6px 10px",
            border: "1px solid #ddd",
            borderRadius: 6,
            background: "white",
            cursor: page === 1 ? "not-allowed" : "pointer",
            opacity: page === 1 ? 0.6 : 1,
          }}
        >
          Prev
        </button>

        {start > 1 && <span style={{ color: "#777" }}>…</span>}

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => go(p)}
            style={{
              padding: "6px 10px",
              border: "1px solid #ddd",
              borderRadius: 6,
              background: p === page ? "#1976d2" : "white",
              color: p === page ? "white" : "#333",
              cursor: "pointer",
              fontWeight: p === page ? "bold" : "normal",
            }}
          >
            {p}
          </button>
        ))}

        {end < totalPages && <span style={{ color: "#777" }}>…</span>}

        <button
          onClick={() => go(page + 1)}
          disabled={page === totalPages}
          style={{
            padding: "6px 10px",
            border: "1px solid #ddd",
            borderRadius: 6,
            background: "white",
            cursor: page === totalPages ? "not-allowed" : "pointer",
            opacity: page === totalPages ? 0.6 : 1,
          }}
        >
          Next
        </button>
        <button
          onClick={() => go(totalPages)}
          disabled={page === totalPages}
          style={{
            padding: "6px 10px",
            border: "1px solid #ddd",
            borderRadius: 6,
            background: "white",
            cursor: page === totalPages ? "not-allowed" : "pointer",
            opacity: page === totalPages ? 0.6 : 1,
          }}
        >
          Last
        </button>

        <div style={{ color: "#666", fontSize: 12, marginLeft: 6 }}>
          Page <strong>{page}</strong> of <strong>{totalPages}</strong> (
          {filteredSections.length} sections)
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Course Registration &amp; Schedule</h1>

      {loading && (
        <p style={{ color: "#666", marginBottom: 16 }}>
          Loading registration data...
        </p>
      )}

      {(error || message) && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 6,
            background: error ? "#f8d7da" : "#d4edda",
            color: error ? "#721c24" : "#155724",
            border: `1px solid ${error ? "#f5c6cb" : "#c3e6cb"}`,
            fontSize: 14,
          }}
        >
          {error || message}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              marginBottom: 4,
              fontWeight: "bold",
              fontSize: 14,
            }}
          >
            Term
          </label>
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            {terms.map((t) => (
              <option key={t.termId} value={t.termId}>
                {t.semester} {t.year}
                {String(t.termId) === String(currentTermId) ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 13, color: "#555" }}>
          Total enrolled in {termLabel || "selected term"}:{" "}
          <strong>
            {enrollmentsForSelectedTerm.length} course
            {enrollmentsForSelectedTerm.length !== 1 ? "s" : ""},{" "}
            {totalCredits} credits
          </strong>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab("register")}
          style={{
            padding: "12px 24px",
            border: "none",
            borderRadius: 6,
            background: activeTab === "register" ? "#1976d2" : "#f5f5f5",
            color: activeTab === "register" ? "white" : "#333",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Register for Courses
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          style={{
            padding: "12px 24px",
            border: "none",
            borderRadius: 6,
            background: activeTab === "schedule" ? "#1976d2" : "#f5f5f5",
            color: activeTab === "schedule" ? "white" : "#333",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          My Schedule ({enrollmentsForSelectedTerm.length} course
          {enrollmentsForSelectedTerm.length !== 1 ? "s" : ""}, {totalCredits}{" "}
          credits)
        </button>
      </div>

      {activeTab === "register" && (
        <div>
          <h2>Available Sections for {termLabel || "selected term"}</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: "bold", fontSize: 14 }}>
                Search by course code or title
              </label>
              <input
                type="text"
                placeholder="e.g., CSE 416..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: "bold", fontSize: 14 }}>
                Subject
              </label>
              <input
                type="text"
                placeholder="e.g., CSE"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value.toUpperCase())}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: "bold", fontSize: 14 }}>
                Course Number
              </label>
              <input
                type="text"
                placeholder="e.g., 416"
                value={filterCourseNum}
                onChange={(e) => setFilterCourseNum(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: "bold", fontSize: 14 }}>
                Days of Week
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { key: "M", label: "Mon" },
                  { key: "T", label: "Tue" },
                  { key: "W", label: "Wed" },
                  { key: "R", label: "Thu" },
                  { key: "F", label: "Fri" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      cursor: "pointer",
                      padding: "4px 8px",
                      border: `1px solid ${filterDays[key] ? "#1976d2" : "#ddd"}`,
                      borderRadius: 4,
                      background: filterDays[key] ? "#e3f2fd" : "white",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterDays[key]}
                      onChange={(e) =>
                        setFilterDays((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13 }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {pagedSections.map((sec) => {
              const isFull = (sec.enrolledCount || 0) >= (sec.capacity || 0);
              return (
                <div
                  key={sec.classId}
                  style={{
                    border: "1px solid #e0e0e0",
                    borderRadius: 8,
                    padding: 20,
                    background: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <h3 style={{ margin: 0, fontSize: 18, color: "#333" }}>
                          {sec.courseTitle} (Sec {sec.sectionNum})
                        </h3>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: "bold",
                            background: "#e3f2fd",
                            color: "#1976d2",
                          }}
                        >
                          {sec.credits} credits
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: 12,
                          fontSize: 14,
                          marginBottom: 12,
                        }}
                      >
                        <div>
                          <strong>Instructor:</strong> {sec.instructorName || "TBA"}
                        </div>
                        <div>
                          <strong>Schedule:</strong> {sec.scheduleText || "TBA"}
                        </div>
                        <div>
                          <strong>Room:</strong> {sec.roomLabel || "TBA"}
                        </div>
                        {sec.sbc && (
                          <div>
                            <strong>SBCs:</strong> {sec.sbc}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: getAvailabilityColor(
                            sec.enrolledCount,
                            sec.capacity
                          ),
                          color: "white",
                          fontWeight: "bold",
                          fontSize: 14,
                          marginBottom: 8,
                        }}
                      >
                        {sec.enrolledCount}/{sec.capacity} enrolled
                      </div>
                      <button
                        onClick={() => handleRegister(sec)}
                        disabled={isFull || actionLoading}
                        style={{
                          padding: "8px 16px",
                          border: "none",
                          borderRadius: 6,
                          background: isFull ? "#ccc" : "#28a745",
                          color: "white",
                          cursor:
                            isFull || actionLoading ? "not-allowed" : "pointer",
                          fontWeight: "bold",
                          opacity: actionLoading ? 0.8 : 1,
                        }}
                      >
                        {isFull ? "Full" : "Register"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSections.length === 0 && !loading && (
            <div
              style={{
                textAlign: "center",
                padding: 40,
                color: "#666",
                background: "#f9f9f9",
                borderRadius: 8,
                border: "1px solid #e0e0e0",
                marginTop: 16,
              }}
            >
              <p>No available sections found for this term / search.</p>
            </div>
          )}

          <Pagination />
        </div>
      )}

      {activeTab === "schedule" && (
        <div>
          <h2>My Schedule – {termLabel || "selected term"}</h2>

          {enrollmentsForSelectedTerm.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: 40,
                color: "#666",
                background: "#f9f9f9",
                borderRadius: 8,
                border: "1px solid #e0e0e0",
              }}
            >
              <p>You are not enrolled in any courses for this term.</p>
              <p>
                Use the &quot;Register for Courses&quot; tab to add courses to
                your schedule.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {enrollmentsForSelectedTerm.map((enr) => (
                <div
                  key={enr.enrollmentId}
                  style={{
                    border: "1px solid #e0e0e0",
                    borderRadius: 8,
                    padding: 20,
                    background: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <h3 style={{ margin: 0, fontSize: 18, color: "#333" }}>
                          {enr.courseTitle}
                        </h3>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: "bold",
                            background: "#e8f5e8",
                            color: "#2e7d32",
                          }}
                        >
                          {enr.credits} credits
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: 12,
                          fontSize: 14,
                        }}
                      >
                        <div>
                          <strong>Instructor:</strong> {enr.instructorName || "TBA"}
                        </div>
                        <div>
                          <strong>Schedule:</strong> {enr.scheduleText || "TBA"}
                        </div>
                        <div>
                          <strong>Room:</strong> {enr.roomLabel || "TBA"}
                        </div>
                        <div>
                          <strong>Status:</strong>{" "}
                          <span style={{ color: "#28a745", fontWeight: "bold" }}>
                            Enrolled
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <button
                        onClick={() => handleWithdraw(enr)}
                        disabled={actionLoading}
                        style={{
                          padding: "8px 16px",
                          border: "none",
                          borderRadius: 6,
                          background: "#dc3545",
                          color: "white",
                          cursor: actionLoading ? "not-allowed" : "pointer",
                          fontWeight: "bold",
                          opacity: actionLoading ? 0.8 : 1,
                        }}
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * @file currentDateRoutes.js
 * @description Express routes for managing SAM's current date and resolving the active term
 * from academic_calendar based on the chosen date.
 */

import { Router } from "express";
import { getCurrentDate, setCustomDate, getCurrentDateString } from "../utils/dateWrapper.js";

const router = Router();

const normStr = (x) => (x ?? "").toString().trim();
const normLower = (x) => normStr(x).toLowerCase();

const isValidYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(normStr(s));

const toUtcMidnight = (d) => {
  if (!d) return null;
  if (d instanceof Date) return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const s = normStr(d);
  if (isValidYmd(s)) return Date.parse(`${s}T00:00:00Z`);
  if (typeof d === "string") {
    const t = Date.parse(d);
    if (!Number.isNaN(t)) {
      const dt = new Date(t);
      return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
    }
  }
  return null;
};

const isAfter = (a, b) => {
  const ta = toUtcMidnight(a);
  const tb = toUtcMidnight(b);
  if (ta == null || tb == null) return false;
  return ta > tb;
};

const isOnOrBefore = (a, b) => {
  const ta = toUtcMidnight(a);
  const tb = toUtcMidnight(b);
  if (ta == null || tb == null) return false;
  return ta <= tb;
};

const ymdFromDate = (dateObj) => {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseTerm = (termField) => {
  const t = termField && typeof termField === "object" ? termField : null;
  const semester = normStr(t?.semester);
  const year = Number(t?.year);
  if (!semester || !Number.isFinite(year)) return null;
  return { semester, year };
};

const nextTerm = (term) => {
  const sem = normLower(term?.semester);
  const yr = Number(term?.year);
  if (!Number.isFinite(yr)) return null;

  if (sem === "fall") return { semester: "Spring", year: yr + 1 };
  if (sem === "spring") return { semester: "Fall", year: yr };
  return null;
};

const prevTerm = (term) => {
  const sem = normLower(term?.semester);
  const yr = Number(term?.year);
  if (!Number.isFinite(yr)) return null;

  if (sem === "spring") return { semester: "Fall", year: yr - 1 };
  if (sem === "fall") return { semester: "Spring", year: yr };
  return null;
};

async function fetchCalendarForTerm(db, term) {
  if (!db || !term?.semester || !Number.isFinite(Number(term?.year))) return null;

  const { rows } = await db.query(
    `
    SELECT
      id,
      term,
      semester_end
    FROM academic_calendar
    WHERE lower(term->>'semester') = lower($1)
      AND (term->>'year')::int = $2
    LIMIT 1
    `,
    [term.semester, Number(term.year)]
  );

  return rows[0] ?? null;
}

async function fetchCalendarContainingDate(db, ymd) {
  if (!db || !isValidYmd(ymd)) return null;

  const { rows } = await db.query(
    `
    SELECT id, term, semester_end
    FROM academic_calendar
    WHERE semester_end IS NOT NULL
      AND semester_end >= $1::date
    ORDER BY semester_end ASC, id ASC
    LIMIT 1
    `,
    [ymd]
  );

  if (rows[0]) return rows[0];

  const { rows: lastRows } = await db.query(
    `
    SELECT id, term, semester_end
    FROM academic_calendar
    WHERE semester_end IS NOT NULL
    ORDER BY semester_end DESC, id DESC
    LIMIT 1
    `
  );

  return lastRows[0] ?? null;
}

async function fetchPrevCalendarByEnd(db, endYmd) {
  if (!db || !endYmd) return null;

  const { rows } = await db.query(
    `
    SELECT id, term, semester_end
    FROM academic_calendar
    WHERE semester_end IS NOT NULL
      AND semester_end < $1::date
    ORDER BY semester_end DESC, id DESC
    LIMIT 1
    `,
    [endYmd]
  );

  return rows[0] ?? null;
}

async function fetchNextCalendarByEnd(db, endYmd) {
  if (!db || !endYmd) return null;

  const { rows } = await db.query(
    `
    SELECT id, term, semester_end
    FROM academic_calendar
    WHERE semester_end IS NOT NULL
      AND semester_end > $1::date
    ORDER BY semester_end ASC, id ASC
    LIMIT 1
    `,
    [endYmd]
  );

  return rows[0] ?? null;
}

async function fetchTermId(db, term) {
  if (!db || !term?.semester || !Number.isFinite(Number(term?.year))) return null;

  const { rows } = await db.query(
    `
    SELECT term_id
    FROM terms
    WHERE lower(semester::text) = lower($1)
      AND year = $2
    LIMIT 1
    `,
    [term.semester, Number(term.year)]
  );

  return rows[0]?.term_id ?? null;
}

async function resolveActiveTermForDate(db, currentYmd, targetYmd) {
  const seedCal = await fetchCalendarContainingDate(db, currentYmd);
  if (!seedCal) return { calendar: null, term: null, warning: "No academic_calendar rows found." };

  let cal = seedCal;
  let term = parseTerm(cal.term);

  if (!term) {
    return { calendar: cal, term: null, warning: "academic_calendar.term is malformed for the current term row." };
  }

  let guard = 0;
  const MAX_STEPS = 80;

  while (guard++ < MAX_STEPS && cal?.semester_end && isAfter(targetYmd, cal.semester_end)) {
    const nxt = nextTerm(term);
    let nextCal = nxt ? await fetchCalendarForTerm(db, nxt) : null;

    if (!nextCal) {
      const endYmd = typeof cal.semester_end === "string" ? cal.semester_end : ymdFromDate(new Date(cal.semester_end));
      nextCal = await fetchNextCalendarByEnd(db, endYmd);
    }

    if (!nextCal) break;

    cal = nextCal;
    term = parseTerm(cal.term) ?? term;
  }

  guard = 0;
  while (guard++ < MAX_STEPS && cal?.semester_end) {
    const prv = prevTerm(term);
    let prevCal = prv ? await fetchCalendarForTerm(db, prv) : null;

    if (!prevCal) {
      const endYmd = typeof cal.semester_end === "string" ? cal.semester_end : ymdFromDate(new Date(cal.semester_end));
      prevCal = await fetchPrevCalendarByEnd(db, endYmd);
    }

    if (!prevCal) break;

    if (prevCal?.semester_end && isOnOrBefore(targetYmd, prevCal.semester_end)) {
      cal = prevCal;
      term = parseTerm(cal.term) ?? term;
      continue;
    }

    break;
  }

  return { calendar: cal, term, warning: null };
}

router.get("/", async (req, res) => {
  try {
    const currentDate = getCurrentDate();
    const dateString = getCurrentDateString();

    let termInfo = null;

    if (req.db) {
      const { calendar, term } = await resolveActiveTermForDate(req.db, dateString, dateString);
      if (term) {
        termInfo = {
          ...term,
          termId: await fetchTermId(req.db, term),
          semesterEnd: calendar?.semester_end ?? null,
        };
      }
    }

    return res.json({
      ok: true,
      currentDate: dateString,
      currentDateObject: currentDate.toISOString(),
      displayDate: currentDate.toDateString(),
      activeTerm: termInfo,
    });
  } catch (e) {
    console.error("[current-date] GET failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { date } = req.body;

    const beforeDateString = getCurrentDateString();

    if (!date || date === "") {
      setCustomDate(null);

      const currentDate = getCurrentDate();
      const dateString = getCurrentDateString();

      let termInfo = null;

      if (req.db) {
        const { calendar, term } = await resolveActiveTermForDate(req.db, dateString, dateString);
        if (term) {
          termInfo = {
            ...term,
            termId: await fetchTermId(req.db, term),
            semesterEnd: calendar?.semester_end ?? null,
          };
        }
      }

      return res.json({
        ok: true,
        message: "Current date reset to actual current date",
        currentDate: dateString,
        displayDate: currentDate.toDateString(),
        activeTerm: termInfo,
      });
    }

    if (!isValidYmd(date)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid date format. Expected YYYY-MM-DD format.",
      });
    }

    const [year, month, day] = date.split("-").map(Number);
    const testUtc = new Date(Date.UTC(year, month - 1, day));
    if (
      testUtc.getUTCFullYear() !== year ||
      testUtc.getUTCMonth() !== month - 1 ||
      testUtc.getUTCDate() !== day
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid date. Please provide a valid date.",
      });
    }

    setCustomDate(date);

    const currentDate = getCurrentDate();
    const dateString = getCurrentDateString();

    let termInfo = null;
    let warning = null;

    if (req.db) {
      const { calendar, term, warning: w } = await resolveActiveTermForDate(req.db, beforeDateString, dateString);
      warning = w;

      if (term) {
        termInfo = {
          ...term,
          termId: await fetchTermId(req.db, term),
          semesterEnd: calendar?.semester_end ?? null,
        };
      }

      if (req.session) {
        req.session.activeTerm = termInfo ? { semester: termInfo.semester, year: termInfo.year } : null;
      }
    }

    return res.json({
      ok: true,
      message: `Current date set to ${dateString}`,
      currentDate: dateString,
      displayDate: currentDate.toDateString(),
      activeTerm: termInfo,
      warning: warning || undefined,
    });
  } catch (e) {
    console.error("[current-date] POST failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

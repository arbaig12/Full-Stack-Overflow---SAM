/**
 * @file studentProfileModel.js
 * @description This file defines the data model and business logic for the Student Profile concept.
 * It aggregates various pieces of student-related information from different concepts
 * (academic programs, registration holds, waivers, classes) to construct a comprehensive profile.
 * @requires ../academicProgram/academicProgramModel.js - Functions to retrieve student's academic programs.
 * @requires ../registrationHold/registrationHoldModel.js - Functions to retrieve student's registration holds.
 * @requires ../waiver/waiverModel.js - Functions to retrieve student's waivers.
 * @requires js-yaml - Library to parse YAML files.
 * @requires fs - Node.js File System module for reading files.
 * @requires path - Node.js module for handling and transforming file paths.
 * @requires url - Node.js module for URL resolution and parsing.
 */

import { getStudentPrograms } from '../academicProgram/academicProgramModel.js';
import { getStudentHolds } from '../registrationHold/registrationHoldModel.js';
import { getStudentWaivers } from '../waiver/waiverModel.js';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @constant {object} graduationRequirements
 * @description Loads university-level graduation requirements from a YAML file.
 * This data is used for calculations like class standing.
 */
const graduationRequirements = yaml.load(fs.readFileSync(path.join(__dirname, '../../../project_requirements/graduation_requirements.yaml'), 'utf8'));

/**
 * Calculates a student's class standing (U1, U2, U3, U4) based on their earned credits.
 * The thresholds for each standing are derived from the total minimum credits required for graduation.
 *
 * @param {Array<object>} classes - An array of class objects the student has taken, each with `credits` and `grade`.
 * @param {object} graduationRequirements - The loaded graduation requirements, containing `minimum_credits`.
 * @returns {string} The calculated class standing (e.g., 'U1', 'U2', 'U3', 'U4').
 */
function calculateClassStanding(classes, graduationRequirements) {
  // Filter out classes that don't count towards earned credits (e.g., withdrawn, pass/fail, no grade)
  const credits = classes
    .filter((c) => c.grade !== null && c.grade !== 'W' && c.grade !== 'P' && c.grade !== 'NC')
    .reduce((acc, c) => acc + c.credits, 0);

  const { minimum_credits } = graduationRequirements.graduation_requirements;
  const senior_credits = minimum_credits * 0.75;
  const junior_credits = minimum_credits * 0.5;
  const sophomore_credits = minimum_credits * 0.25;

  if (credits >= senior_credits) {
    return 'U4'; // Senior
  } else if (credits >= junior_credits) {
    return 'U3'; // Junior
  } else if (credits >= sophomore_credits) {
    return 'U2'; // Sophomore
  } else {
    return 'U1'; // Freshman
  }
}

/**
 * Calculates a student's cumulative GPA, term GPAs, and cumulative credits.
 * Grades 'W', 'P', 'NC' are excluded from GPA calculation.
 *
 * @param {Array<object>} classes - An array of class objects the student has taken.
 *   Each object should have `grade`, `credits`, `semester`, and `year`.
 * @returns {object} An object containing `cumulativeGpa`, `termGpa` (an object mapping term to GPA),
 *   and `cumulativeCredits`.
 */
function calculateGpa(classes) {
  const gradePoints = {
    'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
    'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0.0,
  };

  let totalCredits = 0;
  let totalPoints = 0;
  const terms = {}; // Stores credits and points per term

  for (const c of classes) {
    // Only consider graded courses for GPA calculation
    if (c.grade in gradePoints) {
      const credits = c.credits;
      const points = gradePoints[c.grade] * credits;
      totalCredits += credits;
      totalPoints += points;

      const term = `${c.semester} ${c.year}`;
      if (!terms[term]) {
        terms[term] = { credits: 0, points: 0 };
      }
      terms[term].credits += credits;
      terms[term].points += points;
    }
  }

  const cumulativeGpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
  const termGpa = {};
  for (const term in terms) {
    termGpa[term] = terms[term].credits > 0 ? terms[term].points / terms[term].credits : 0;
  }

  return {
    cumulativeGpa: parseFloat(cumulativeGpa.toFixed(2)), // Round to 2 decimal places
    termGpa: Object.fromEntries(Object.entries(termGpa).map(([term, gpa]) => [term, parseFloat(gpa.toFixed(2))])),
    cumulativeCredits: totalCredits,
  };
}

/**
 * Retrieves a comprehensive profile for a specific student.
 * This function orchestrates calls to various other model functions to gather all necessary data.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} userId - The unique identifier for the student.
 * @returns {Promise<object|null>} A promise that resolves to a student profile object if found, otherwise `null`.
 * The profile includes user details, classes taken, calculated GPA and class standing,
 * registration holds, waivers, and academic programs.
 */
export async function getStudentProfile(db, userId) {
  // 1. Retrieve basic user information
  const userSql = `
    SELECT
      u.user_id,
      u.sbu_id,
      u.first_name,
      u.last_name,
      u.email,
      u.role::text AS role,
      u.university_entry,
      u.direct_admit,
      u.aoi,
      u.college
    FROM users u
    WHERE u.user_id = $1 AND u.role = 'Student'
  `;
  const { rows: userRoutes } = await db.query(userSql, [userId]);
  const user = userRoutes[0];

  if (!user) {
    return null; // Student not found
  }

  // 2. Retrieve student's class history
  const classesSql = `
    SELECT
      sc.class_id,
      c.subject,
      c.course_num,
      c.credits,
      sc.grade,
      t.semester,
      t.year
    FROM student_classes sc
    JOIN classes cl ON cl.class_id = sc.class_id
    JOIN courses c ON c.course_id = cl.course_id
    JOIN terms t ON t.term_id = cl.term_id
    WHERE sc.student_id = $1
  `;
  const { rows: classes } = await db.query(classesSql, [userId]);

  // 3. Calculate derived properties
  const class_standing = calculateClassStanding(classes, graduationRequirements);
  const { cumulativeGpa, termGpa, cumulativeCredits } = calculateGpa(classes);

  // 4. Retrieve related concept data
  const registration_holds = await getStudentHolds(db, userId);
  const waivers = await getStudentWaivers(db, userId);
  const academic_programs = await getStudentPrograms(db, userId);

  // 5. Assemble and return the complete student profile
  return {
    ...user,
    classes,
    class_standing,
    cumulativeGpa,
    termGpa,
    cumulativeCredits,
    registration_holds,
    waivers,
    academic_programs,
  };
}

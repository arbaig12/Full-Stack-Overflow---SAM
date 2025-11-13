import { getStudentPrograms } from '../academicProgram/academicProgramModel.js';
import { getStudentHolds } from '../registrationHold/registrationHoldModel.js';
import { getStudentWaivers } from '../waiver/waiverModel.js';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const graduationRequirements = yaml.load(fs.readFileSync(path.join(__dirname, '../../../project_requirements/graduation_requirements.yaml'), 'utf8'));

/**
 * @file studentProfileModel.js
 * @description Defines the data model for the Student Profile concept.
 */

function calculateClassStanding(classes, graduationRequirements) {
  const credits = classes
    .filter((c) => c.grade !== null && c.grade !== 'W' && c.grade !== 'P' && c.grade !== 'NC')
    .reduce((acc, c) => acc + c.credits, 0);

  const { minimum_credits } = graduationRequirements.graduation_requirements;
  const senior_credits = minimum_credits * 0.75;
  const junior_credits = minimum_credits * 0.5;
  const sophomore_credits = minimum_credits * 0.25;

  if (credits >= senior_credits) {
    return 'U4';
  } else if (credits >= junior_credits) {
    return 'U3';
  } else if (credits >= sophomore_credits) {
    return 'U2';
  } else {
    return 'U1';
  }
}

function calculateGpa(classes) {
  const gradePoints = {
    'A': 4.0,
    'A-': 3.7,
    'B+': 3.3,
    'B': 3.0,
    'B-': 2.7,
    'C+': 2.3,
    'C': 2.0,
    'C-': 1.7,
    'D+': 1.3,
    'D': 1.0,
    'F': 0.0,
  };

  let totalCredits = 0;
  let totalPoints = 0;
  const terms = {};

  for (const c of classes) {
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
    cumulativeGpa,
    termGpa,
    cumulativeCredits: totalCredits,
  };
}

export async function getStudentProfile(db, userId) {
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
    return null;
  }

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

  const class_standing = calculateClassStanding(classes, graduationRequirements);
  const { cumulativeGpa, termGpa, cumulativeCredits } = calculateGpa(classes);
  const registration_holds = await getStudentHolds(db, userId);
  const waivers = await getStudentWaivers(db, userId);
  const academic_programs = await getStudentPrograms(db, userId);

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

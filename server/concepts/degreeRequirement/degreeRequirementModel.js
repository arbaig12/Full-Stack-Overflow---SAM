/**
 * @file degreeRequirementModel.js
 * @description This file defines the data model and database interactions for the Degree Requirement concept.
 * It includes functions for importing degree requirement specifications from a YAML file.
 */

/**
 * Imports a new set of degree requirements for a specific academic program from parsed YAML data.
 *
 * This function enforces the business rule that a degree program (a unique combination of subject and degree type)
 * can only have one set of requirements defined in the system. It checks for the existence of the
 * program before attempting to insert the new requirement data.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} data - The parsed YAML data representing the degree requirements.
 * @param {string} data.subject - The subject code for the program (e.g., "CSE").
 * @param {string} data.degree_type - The type of degree (e.g., "BS").
 * @param {string} data.type - The type of program (e.g., "Major").
 * @param {object} [data.effective_term] - The term when these requirements become effective.
 * @param {object} [data.admission_requirements] - A JSON object detailing admission requirements.
 * @param {object} [data.degree_requirements] - A JSON object detailing the full degree requirements.
 * @returns {Promise<{id: number}|{error: string}>} A promise that resolves to an object containing the new requirement set's ID if successful, or an error object if validation fails or the program already exists.
 */
export async function importDegreeRequirement(db, data) {
  const { subject, degree_type, type, effective_term, admission_requirements, degree_requirements } = data;

  // 1. Validate input parameters
  if (!subject || !degree_type || !type) {
    return { error: "YAML missing required fields: subject, degree_type, type" };
  }

  // 2. Business Rule: Prohibit duplicate degree program requirements.
  // Check if requirements for this program already exist.
  const existsQuery = `
    SELECT id FROM degree_requirements
    WHERE subject = $1 AND degree_type = $2
  `;
  const existsResult = await db.query(existsQuery, [subject, degree_type]);

  if (existsResult.rows.length > 0) {
    return { error: `Degree program "${subject} ${degree_type}" already exists.` };
  }

  // 3. If no existing program is found, insert the new requirement set.
  const insertQuery = `
    INSERT INTO degree_requirements
    (subject, degree_type, program_type, effective_term, admission_requirements, degree_requirements)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
    RETURNING id
  `;
  const values = [
    subject,
    degree_type,
    type,
    JSON.stringify(effective_term || {}),
    JSON.stringify(admission_requirements || {}),
    JSON.stringify(degree_requirements || {})
  ];

  const result = await db.query(insertQuery, values);

  // 4. Return the ID of the newly inserted record.
  return { id: result.rows[0].id };
}

/**
 * Checks a student's academic record against a specific set of degree requirements.
 * This function will determine which requirements are satisfied, pending, or unsatisfied.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The ID of the student whose requirements are being checked.
 * @param {object} degreeRequirements - The specific degree requirements to check against (e.g., from a major/minor).
 * @param {Array<object>} studentTranscript - An array of courses the student has completed or is currently taking.
 * @param {Array<object>} studentCurrentEnrollment - An array of courses the student is currently enrolled in.
 * @param {object} courseCatalog - The current course catalog for looking up course details (e.g., SBCs).
 * @returns {Promise<{status: string, details: object}|{error: string}>} A promise that resolves to an object
 *   containing the status of the degree requirements (satisfied, pending, unsatisfied) and detailed breakdown.
 */
export async function checkDegreeRequirements(db, studentId, programRequirements, studentTranscript, studentCurrentEnrollment, courseCatalog) {
  const issues = [];
  let satisfiedCount = 0;
  let pendingCount = 0;
  let totalRequiredCourses = 0;
  let totalEarnedCredits = 0;
  let totalRequiredCredits = 0;

  const degreeRequirements = programRequirements.degree_requirements;
  const admissionRequirements = programRequirements.admission_requirements;

  const allStudentCourses = [
    ...studentTranscript.map(c => ({ ...c, status: 'completed' })),
    ...studentCurrentEnrollment.map(c => ({ ...c, status: 'enrolled' }))
  ];

  // Helper to check if a course is satisfied by student's record
  const isCourseSatisfied = (reqCourse, studentCourses) => {
    return studentCourses.some(sCourse =>
      sCourse.subject === reqCourse.subject &&
      sCourse.number === reqCourse.number &&
      (sCourse.status === 'completed' || sCourse.status === 'enrolled') // Assuming enrolled courses will be completed
      // TODO: Add grade check if reqCourse specifies a minimum grade
    );
  };

  const details = {
    admissionStatus: 'N/A',
    requiredCourses: [],
    creditRequirements: [],
    sbcRequirements: [], // Placeholder for future
    overallCredits: 0,
  };

  // 1. Check Admission Requirements (simplified)
  if (admissionRequirements && admissionRequirements.min_gpa) {
    // This would require fetching student's actual GPA, which is part of studentProfile.
    // For now, we'll assume this check happens elsewhere or is simplified.
    details.admissionStatus = `Min GPA: ${admissionRequirements.min_gpa} (check not implemented here)`;
  }

  // 2. Check Degree Requirements
  if (degreeRequirements) {
    // Required Courses
    if (degreeRequirements.required_courses && degreeRequirements.required_courses.length > 0) {
      totalRequiredCourses = degreeRequirements.required_courses.length;
      for (const reqCourse of degreeRequirements.required_courses) {
        const satisfied = isCourseSatisfied(reqCourse, studentTranscript);
        const pending = !satisfied && isCourseSatisfied(reqCourse, studentCurrentEnrollment);

        details.requiredCourses.push({ ...reqCourse, satisfied, pending });
        if (satisfied) {
          satisfiedCount++;
          totalEarnedCredits += reqCourse.credits || 3;
        } else if (pending) {
          pendingCount++;
          totalEarnedCredits += reqCourse.credits || 3; // Count pending credits towards total
        }
      }
    }

    // Credit Requirements
    if (degreeRequirements.minimum_credits) {
      totalRequiredCredits = degreeRequirements.minimum_credits;
      details.creditRequirements.push({
        type: 'minimum_credits',
        required: totalRequiredCredits,
        earned: totalEarnedCredits,
        satisfied: totalEarnedCredits >= totalRequiredCredits,
      });
    }

    // SBC Requirements (Placeholder)
    if (degreeRequirements.sbc_requirements && degreeRequirements.sbc_requirements.length > 0) {
      for (const sbcReq of degreeRequirements.sbc_requirements) {
        details.sbcRequirements.push({
          sbc: sbcReq,
          satisfied: false, // TODO: Implement SBC checking using courseCatalog
          message: `SBC ${sbcReq} check not fully implemented.`
        });
      }
    }
  }

  // Determine overall status
  let overallStatus = 'unsatisfied';
  if (satisfiedCount === totalRequiredCourses && totalEarnedCredits >= totalRequiredCredits) {
    overallStatus = 'satisfied';
  } else if (satisfiedCount + pendingCount >= totalRequiredCourses && totalEarnedCredits >= totalRequiredCredits) {
    overallStatus = 'pending';
  }

  return {
    status: overallStatus,
    details: {
      message: `Degree requirements check for student ${studentId} is ${overallStatus}.`,
      hasCse101: hasCse101,
      ...details
    }
  };
}

/**
 * Retrieves degree requirements for a specific subject and degree type.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {string} subject - The subject code (e.g., "CSE").
 * @param {string} degreeType - The type of degree (e.g., "BS").
 * @returns {Promise<object|null>} A promise that resolves to the degree requirements object, or null if not found.
 */
export async function getDegreeRequirements(db, subject, degreeType) {
  const sql = `
    SELECT id, subject, degree_type, program_type, effective_term, admission_requirements, degree_requirements
    FROM degree_requirements
    WHERE subject = $1 AND degree_type = $2
  `;
  const { rows } = await db.query(sql, [subject, degreeType]);
  return rows[0] || null;
}

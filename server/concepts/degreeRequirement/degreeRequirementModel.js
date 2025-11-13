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

/**
 * @file degreeRequirementModel.js
 * @description Defines the data model for the Degree Requirement concept.
 */

/**
 * Imports a degree requirement from a YAML file.
 * @param {object} db - The database connection object.
 * @param {object} data - The parsed YAML data.
 * @returns {Promise<object>} - A promise that resolves to an object containing the import results.
 */
export async function importDegreeRequirement(db, data) {
  const { subject, degree_type, type, effective_term, admission_requirements, degree_requirements } = data;

  if (!subject || !degree_type || !type) {
    return { error: "YAML missing required fields: subject, degree_type, type" };
  }

  //Check if the program already exists
  const existsQuery = `
    SELECT id FROM degree_requirements
    WHERE subject = $1 AND degree_type = $2
  `;
  const existsResult = await db.query(existsQuery, [subject, degree_type]);

  if (existsResult.rows.length > 0) {
    return { error: `Degree program "${subject} ${degree_type}" already exists.` };
  }

  //insert if not exists
  const insertQuery = `
    INSERT INTO degree_requirements
    (subject, degree_type, program_type, effective_term, admission_requirements, degree_requirements)
    VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)
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

  return { id: result.rows[0].id };
}

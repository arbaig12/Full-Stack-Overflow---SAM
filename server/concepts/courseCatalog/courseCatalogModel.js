/**
 * @file courseCatalogModel.js
 * @description This file defines the data model and functions for interacting with the Course Catalog concept.
 * It provides methods to retrieve course information from the scraped JSON files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to dynamically get the path to the server root
const getServerRoot = () => path.join(__dirname, '..', '..', '..', 'server');

/**
 * Loads course data for a given term from the corresponding JSON file.
 *
 * @param {string} term - The academic term (e.g., "Fall2025").
 * @returns {Array<object>} An array of course data, or an empty array if the file doesn't exist.
 */
async function loadCourseData(term) {
  const filePath = path.join(getServerRoot(), `${term}_courses.json`);
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    const parsedData = JSON.parse(data);
    // The JSON structure is an array of subjects, each containing a 'courses' array.
    // We want to flatten this into a single array of course objects.
    return parsedData.flatMap(subjectEntry => subjectEntry.courses || []);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[CourseCatalogModel] Course data file not found for term: ${term}.`);
      return [];
    }
    console.error(`[CourseCatalogModel] Error loading course data for term ${term}:`, error);
    throw error;
  }
}

/**
 * Retrieves a course by its unique course ID (coid) for a given term.
 *
 * @param {import('pg').Pool} db - The database connection pool object (not directly used for JSON files, but kept for consistency).
 * @param {string} term - The academic term (e.g., "Fall2025").
 * @param {string} coid - The unique course ID.
 * @returns {Promise<object|null>} The course object, or null if not found.
 */
export async function getCourseByCoid(db, term, coid) {
  const courses = await loadCourseData(term);
  return courses.find(course => course.coid === coid) || null;
}

/**
 * Retrieves a course by its subject and course number for a given term.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {string} term - The academic term (e.g., "Fall2025").
 * @param {string} subject - The course subject (e.g., "CSE").
 * @param {string} courseNum - The course number (e.g., "416").
 * @returns {Promise<object|null>} The course object, or null if not found.
 */
export async function getCourseBySubjectAndNumber(db, term, subject, courseNum) {
  const courses = await loadCourseData(term);
  // The title is in the format "SUBJECT NUM - Course Name"
  const fullCourseNum = `${subject} ${courseNum}`;
  return courses.find(course => course.title.startsWith(fullCourseNum)) || null;
}

/**
 * Searches for courses based on provided filters for a given term.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {string} term - The academic term (e.g., "Fall2025").
 * @param {object} filters - An object containing search filters (e.g., subject, sbc, keyword).
 * @returns {Promise<Array<object>>} An array of matching course objects.
 */
export async function searchCourses(db, term, filters = {}) {
  let courses = await loadCourseData(term);

  if (filters.subject) {
    courses = courses.filter(course => course.title.startsWith(filters.subject.toUpperCase()));
  }
  if (filters.sbc) {
    courses = courses.filter(course => course.sbc && course.sbc.toUpperCase().includes(filters.sbc.toUpperCase()));
  }
  if (filters.keyword) {
    const keywordLower = filters.keyword.toLowerCase();
    courses = courses.filter(course =>
      course.title.toLowerCase().includes(keywordLower) ||
      course.description.toLowerCase().includes(keywordLower)
    );
  }
  // Add more filters as needed (e.g., credits, prereq, etc.)

  return courses;
}

/**
 * Finds the nearest available term for which course data exists.
 * This is a simplified implementation. In a real system, this would involve
 * querying a database of available terms or a more complex logic.
 * For now, it prioritizes the requested term, then 'Fall2025'.
 *
 * @param {string} requestedTerm - The term for which data is requested.
 * @returns {string} The nearest available term.
 */
async function getNearestAvailableTerm(requestedTerm) {
  // In a more robust system, this would check a list of available terms
  // and determine the closest one. For this implementation, we'll
  // just check if the requested term's file exists, otherwise default to Fall2025.
  const requestedTermFilePath = path.join(getServerRoot(), `${requestedTerm}_courses.json`);
  try {
    await fs.promises.access(requestedTermFilePath, fs.constants.F_OK);
    return requestedTerm; // Requested term file exists
  } catch (error) {
    // Fallback to a default term if the requested term's file doesn't exist
    console.warn(`Course data for term ${requestedTerm} not found. Falling back to Fall2025.`);
    return 'Fall2025';
  }
}

/**
 * Finds the course_data for a course. If the requested term catalog is missing,
 * it returns data from the nearest available term.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} courseIdentifier - An object containing either `subject` and `courseNum` or `coid`.
 * @param {string} term - The academic term (e.g., "Fall2025").
 * @returns {Promise<object|null>} The course object, or null if not found.
 */
export async function getCourseInfo(db, courseIdentifier, term) {
  const actualTerm = await getNearestAvailableTerm(term);
  const courses = await loadCourseData(actualTerm);

  if (courseIdentifier.coid) {
    return courses.find(course => course.coid === courseIdentifier.coid) || null;
  } else if (courseIdentifier.subject && courseIdentifier.courseNum) {
    const fullCourseNum = `${courseIdentifier.subject} ${courseIdentifier.courseNum}`;
    return courses.find(course => course.title.startsWith(fullCourseNum)) || null;
  }
  return null;
}

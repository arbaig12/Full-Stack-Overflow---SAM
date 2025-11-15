/**
 * @file pdfParser.js
 * @description Service for parsing PDF files to extract class schedule data.
 * This is a simplified parser and may require adjustments based on the exact PDF format.
 */

import pdf from 'pdf-parse';

/**
 * Parses a PDF buffer to extract class schedule information.
 *
 * @param {Buffer} pdfBuffer - The buffer of the PDF file.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of class objects.
 */
export async function parsePdf(pdfBuffer) {
  const data = await pdf(pdfBuffer);
  const text = data.text;

  const classes = [];
  const lines = text.split('\n').filter(line => line.trim() !== '');

  // Simplified parsing logic:
  // This assumes a relatively consistent line-by-line structure.
  // A more robust parser would use regex patterns to identify blocks of class information.

  let currentClass = null;
  for (const line of lines) {
    // Example pattern: "CSE 416 - 01 Software Engineering John Doe Mon/Wed 10:00-10:50 LGT-101"
    const classPattern = /([A-Z]{2,4})\s+(\d{3,4})\s+-\s+(\d{2,3})\s+([A-Za-z\s]+?)\s+([A-Za-z\/]+\s+\d{1,2}:\d{2}-\d{1,2}:\d{2})\s+([A-Z0-9-]+)/;
    const match = line.match(classPattern);

    if (match) {
      if (currentClass) {
        classes.push(currentClass);
      }
      const [, subject, number, section_num, course_name, meeting_times, room_id] = match;

      // Further parsing of meeting_times
      const meetings = [];
      const meetingParts = meeting_times.split(/\s+/); // Split by space
      const days = meetingParts[0].match(/[A-Z][a-z]{2}/g); // e.g., Mon, Tue
      const timeRange = meetingParts[1]; // e.g., 10:00-10:50
      const [start, end] = timeRange.split('-');

      if (days) {
        for (const day of days) {
          meetings.push({ day, start, end, room_id });
        }
      }

      currentClass = {
        course_ref: { subject, number: parseInt(number, 10) },
        section_num,
        course_name: course_name.trim(),
        instructor: 'Unknown', // PDF parsing for instructor can be tricky, often on a separate line or in a different format
        meetings,
        room_id,
      };
    } else {
      // Attempt to extract instructor if it's on the next line
      if (currentClass && currentClass.instructor === 'Unknown' && line.trim().length > 5 && !line.includes(':')) { // Heuristic to avoid parsing non-instructor lines
        currentClass.instructor = line.trim();
      }
    }
  }

  if (currentClass) {
    classes.push(currentClass);
  }

  console.log(`[PDFParser] Parsed ${classes.length} classes from PDF.`);
  return classes;
}

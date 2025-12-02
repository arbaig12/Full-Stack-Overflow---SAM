/**
 * @file dateWrapper.js
 * @description Wrapper around date functions to support testing with custom dates.
 * Per Section 9.3: "SAM always determines the current date by calling a wrapper
 * around the relevant library function."
 */

let customDate = null;

/**
 * Returns the current date (either actual or overridden for testing).
 * @returns {Date} Current date
 */
export function getCurrentDate() {
  return customDate ? new Date(customDate) : new Date();
}

/**
 * Sets a custom date for testing purposes.
 * @param {string|null} dateString - Date string in YYYY-MM-DD format, or null to use actual date
 */
export function setCustomDate(dateString) {
  if (!dateString) {
    customDate = null;
    return;
  }

  // Parse YYYY-MM-DD manually to avoid timezone shift
  const [year, month, day] = dateString.split('-').map(Number);
  customDate = new Date(year, month - 1, day);
}

/**
 * Gets the current date as a string in YYYY-MM-DD format.
 * @returns {string} Current date string
 */
export function getCurrentDateString() {
  const date = getCurrentDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


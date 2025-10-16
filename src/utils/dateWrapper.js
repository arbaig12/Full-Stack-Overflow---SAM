let customDate = null;

//returns the current date (either actual or overridden)
export function getCurrentDate() {
  return customDate ? new Date(customDate) : new Date();
}

//allows setting a custom date (YYYY-MM-DD)
export function setCustomDate(dateString) {
  if (!dateString) {
    customDate = null;
    return;
  }

  // Parse YYYY-MM-DD manually to avoid timezone shift
  const [year, month, day] = dateString.split('-').map(Number);
  customDate = new Date(year, month - 1, day);
}
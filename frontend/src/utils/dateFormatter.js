/**
 * Date/Time Formatting Utility
 * Formats dates according to user preference (US or ISO format)
 */

/**
 * Get the current date/time format preference from localStorage
 * @returns {string} 'us' or 'iso'
 */
export const getDateTimeFormat = () => {
  return localStorage.getItem('dateTimeFormat') || 'us';
};

/**
 * Format a date according to user preference
 * @param {string|Date} dateString - Date to format
 * @param {object} options - Optional formatting options
 * @returns {string} Formatted date string
 */
export const formatDateTime = (dateString, options = {}) => {
  if (!dateString) return options.nullText || 'N/A';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return options.invalidText || 'Invalid Date';

  const format = getDateTimeFormat();

  if (format === 'iso') {
    // ISO Format: YYYY-MM-DD HH:MM:SS
    return date.toISOString().replace('T', ' ').substring(0, 19);
  } else {
    // US Format: MM/DD/YYYY, HH:MM AM/PM
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: options.showSeconds ? '2-digit' : undefined,
      hour12: true,
    });
  }
};

/**
 * Format a date (without time) according to user preference
 * @param {string|Date} dateString - Date to format
 * @param {object} options - Optional formatting options
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return options.nullText || 'N/A';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return options.invalidText || 'Invalid Date';

  const format = getDateTimeFormat();

  if (format === 'iso') {
    // ISO Format: YYYY-MM-DD
    return date.toISOString().substring(0, 10);
  } else {
    // US Format: MM/DD/YYYY
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  }
};

/**
 * Format a time (without date) according to user preference
 * @param {string|Date} dateString - Date to format
 * @param {object} options - Optional formatting options
 * @returns {string} Formatted time string
 */
export const formatTime = (dateString, options = {}) => {
  if (!dateString) return options.nullText || 'N/A';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return options.invalidText || 'Invalid Time';

  const format = getDateTimeFormat();

  if (format === 'iso') {
    // ISO Format: HH:MM:SS
    return date.toISOString().substring(11, 19);
  } else {
    // US Format: HH:MM AM/PM
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: options.showSeconds ? '2-digit' : undefined,
      hour12: true,
    });
  }
};

/**
 * React hook to use date/time formatting with auto-refresh on format change
 * @returns {object} Formatting functions
 */
export const useDateTimeFormat = () => {
  // This can be enhanced with React state to trigger re-renders
  // For now, components can listen to the 'dateTimeFormatChanged' event
  return {
    formatDateTime,
    formatDate,
    formatTime,
    getFormat: getDateTimeFormat,
  };
};

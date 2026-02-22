/**
 * CSV Export Utilities
 * 
 * Helper functions for generating CSV files from data
 */

/**
 * Convert an array of objects to CSV string
 */
export function arrayToCSV<T extends Record<string, any>>(
  data: T[],
  headers?: string[]
): string {
  if (data.length === 0) {
    return "";
  }

  // Use provided headers or extract from first object
  const keys = headers || Object.keys(data[0]);
  
  // Create header row
  const headerRow = keys.map((key) => escapeCSVValue(key)).join(",");
  
  // Create data rows
  const dataRows = data.map((row) => {
    return keys
      .map((key) => {
        const value = row[key];
        return escapeCSVValue(formatCSVValue(value));
      })
      .join(",");
  });
  
  return [headerRow, ...dataRows].join("\n");
}

/**
 * Escape CSV value (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  
  const stringValue = String(value);
  
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

/**
 * Format value for CSV (handle dates, arrays, objects)
 */
function formatCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  
  // Handle dates
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    return value.join("; ");
  }
  
  // Handle objects
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * Generate CSV filename with timestamp
 */
export function generateCSVFilename(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  return `${prefix}-${timestamp}.csv`;
}

/**
 * Convert CSV string to Blob for download
 */
export function csvToBlob(csv: string): Blob {
  return new Blob([csv], { type: "text/csv;charset=utf-8;" });
}

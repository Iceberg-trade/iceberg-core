/**
 * Error handling utility functions
 * Provides type-safe error handling methods
 */

/**
 * Type guard function to safely check if error has message property
 * @param error - Unknown type error object
 * @returns Returns true if error is Error type
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error);
}

/**
 * Safely get error message
 * @param error - Unknown type error object
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  return String(error);
}

/**
 * Safely check if error message contains specified text
 * @param error - Unknown type error object
 * @param searchText - Text to search for
 * @returns Returns true if contains
 */
export function errorMessageIncludes(error: unknown, searchText: string): boolean {
  return isError(error) && error.message.includes(searchText);
}
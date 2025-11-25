/**
 * Result type for operations that can succeed or fail
 * Internal type - shared across internal files but not exported to consumers
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };


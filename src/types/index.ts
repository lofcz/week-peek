/**
 * Hour type: valid hour values (0-23)
 * Provides compile-time type safety for hour values
 */
export type Hour = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;

/**
 * Minute type: valid minute values (0-59)
 * Provides compile-time type safety for minute values
 */
export type Minute = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59;

/**
 * Represents a time of day (hours and minutes) without date information
 * Immutable value object for time operations
 */
export class TimeOnly {
  readonly hours: Hour;
  readonly minutes: Minute;

  /**
   * Create a TimeOnly instance
   * @param hours - Hour value (0-23) with compile-time type safety
   * @param minutes - Minute value (0-59) with compile-time type safety
   */
  constructor(hours: Hour, minutes: Minute) {
    this.hours = hours;
    this.minutes = minutes;
  }

  /**
   * Format time as HH:mm string
   * @returns Formatted time string (e.g., "09:00", "14:30")
   */
  toString(): string {
    const h = this.hours.toString().padStart(2, '0');
    const m = this.minutes.toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Convert time to total minutes since midnight
   * @returns Total minutes (e.g., 09:30 => 570)
   */
  toMinutes(): number {
    return this.hours * 60 + this.minutes;
  }

  /**
   * Compare this time with another time
   * @param other - TimeOnly to compare with
   * @returns Negative if this < other, 0 if equal, positive if this > other
   */
  compare(other: TimeOnly): number {
    return this.toMinutes() - other.toMinutes();
  }

  /**
   * Check if this time is before another time
   */
  isBefore(other: TimeOnly): boolean {
    return this.compare(other) < 0;
  }

  /**
   * Check if this time is after another time
   */
  isAfter(other: TimeOnly): boolean {
    return this.compare(other) > 0;
  }

  /**
   * Check if this time equals another time
   */
  equals(other: TimeOnly): boolean {
    return this.hours === other.hours && this.minutes === other.minutes;
  }
}

export enum TimeSlotInterval {
  FifteenMinutes = 15,
  ThirtyMinutes = 30,
  SixtyMinutes = 60
}

export enum DayOfWeek {
  Monday = 0,
  Tuesday = 1,
  Wednesday = 2,
  Thursday = 3,
  Friday = 4,
  Saturday = 5,
  Sunday = 6
}

/**
 * All days in order for iteration
 */
export const ALL_DAYS: readonly DayOfWeek[] = [
  DayOfWeek.Monday,
  DayOfWeek.Tuesday,
  DayOfWeek.Wednesday,
  DayOfWeek.Thursday,
  DayOfWeek.Friday,
  DayOfWeek.Saturday,
  DayOfWeek.Sunday
] as const;

/**
 * Work week days (Monday-Friday)
 */
export const WORK_WEEK_DAYS: readonly DayOfWeek[] = [
  DayOfWeek.Monday,
  DayOfWeek.Tuesday,
  DayOfWeek.Wednesday,
  DayOfWeek.Thursday,
  DayOfWeek.Friday
] as const;

/**
 * Day name translations for localization
 * Default: English
 */
export interface DayNameTranslations {
  [DayOfWeek.Monday]: string;
  [DayOfWeek.Tuesday]: string;
  [DayOfWeek.Wednesday]: string;
  [DayOfWeek.Thursday]: string;
  [DayOfWeek.Friday]: string;
  [DayOfWeek.Saturday]: string;
  [DayOfWeek.Sunday]: string;
}

/**
 * Default English day names
 */
export const DEFAULT_DAY_NAMES: DayNameTranslations = {
  [DayOfWeek.Monday]: 'Monday',
  [DayOfWeek.Tuesday]: 'Tuesday',
  [DayOfWeek.Wednesday]: 'Wednesday',
  [DayOfWeek.Thursday]: 'Thursday',
  [DayOfWeek.Friday]: 'Friday',
  [DayOfWeek.Saturday]: 'Saturday',
  [DayOfWeek.Sunday]: 'Sunday'
};

/**
 * Helper to get day name from enum value
 * @param day - Day enum value
 * @param translations - Optional custom translations (defaults to English)
 */
export function getDayName(
  day: DayOfWeek,
  translations: DayNameTranslations = DEFAULT_DAY_NAMES
): string {
  return translations[day];
}

/**
 * A recurring event that appears on a specific day of the week at a specific time.
 * This is NOT tied to any calendar date - it represents a pattern (e.g., "every Monday at 10:00").
 */
export interface ScheduleEvent {
  id: string;
  day: DayOfWeek;
  
  /**
   * Start time of the event
   */
  startTime: TimeOnly;
  
  /**
   * End time of the event
   * Must be after startTime
   */
  endTime: TimeOnly;
  
  title: string;

  description?: string;
  
  /**
   * Optional background color for the event
   * Can be any valid CSS color value
   * Default: component theme primary color
   */
  color?: string;
  
  /**
   * Optional CSS class name(s) to apply to event element
   */
  className?: string;
  
  /**
   * Optional metadata for application use
   */
  metadata?: Record<string, unknown>;
}

/**
 * Theme configuration for visual customization
 */
export interface ScheduleTheme {
  /**
   * Primary color for events (if event.color not specified)
   * Default: #3b82f6 (blue)
   */
  primaryColor?: string;
  
  /**
   * Background color for schedule grid
   * Default: #ffffff (white)
   */
  backgroundColor?: string;
  
  /**
   * Color for grid lines
   * Default: #e5e7eb (light gray)
   */
  gridLineColor?: string;
  
  /**
   * Text color for day headers
   * Default: #111827 (dark gray)
   */
  headerTextColor?: string;
  
  /**
   * Text color for time labels
   * Default: #6b7280 (medium gray)
   */
  timeTextColor?: string;
  
  /**
   * Text color for event content
   * Default: #ffffff (white)
   */
  eventTextColor?: string;
  
  /**
   * Border radius for events
   * Default: 4px
   */
  eventBorderRadius?: string;
  
  /**
   * Font family for all text
   * Default: system font stack
   */
  fontFamily?: string;
}

/**
 * Configuration options for the WeeklySchedule component
 */
export interface ScheduleConfig {
  /**
   * Which days of the week to display as columns
   * Default: Monday-Friday (work week)
   */
  visibleDays?: DayOfWeek[];
  
  /**
   * Start hour for the time axis (0-23)
   * Default: 9 (9:00 AM)
   */
  startHour?: Hour;
  
  /**
   * End hour for the time axis (0-23)
   * Default: 17 (5:00 PM)
   * Must be greater than startHour
   */
  endHour?: Hour;
  
  /**
   * Interval between time slots in minutes
   * Default: 60 (1 hour)
   */
  timeSlotInterval?: TimeSlotInterval;
  
  /**
   * Callback function invoked when an event is clicked
   * Optional - if not provided, events are not clickable
   */
  onEventClick?: (event: ScheduleEvent) => void;
  
  /**
   * Whether to show time labels on the vertical axis
   * Default: true
   */
  showTimeLabels?: boolean;
  
  /**
   * Whether to show day headers at the top
   * Default: true
   */
  showDayHeaders?: boolean;
  
  /**
   * CSS class name to apply to the root schedule element
   */
  className?: string;
  
  /**
   * Theme configuration (optional)
   */
  theme?: ScheduleTheme;
  
  /**
   * Day name translations for localization
   * Default: English day names
   * Example: { [DayOfWeek.Monday]: 'Lunes', [DayOfWeek.Tuesday]: 'Martes', ... }
   */
  dayNameTranslations?: DayNameTranslations;
}

/**
 * Internal: Event with layout position calculated
 * @internal
 */
export interface LayoutEvent extends ScheduleEvent {
  /**
   * Grid row start index (1-based for CSS Grid)
   */
  gridRowStart: number;
  
  /**
   * Grid row end index (1-based for CSS Grid)
   */
  gridRowEnd: number;
  
  /**
   * Grid column index (1-based for CSS Grid)
   */
  gridColumn: number;
  
  /**
   * Column index within overlapping group (0-based)
   */
  overlapColumn?: number;
  
  /**
   * Total number of columns in overlapping group
   */
  overlapColumnCount?: number;
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}


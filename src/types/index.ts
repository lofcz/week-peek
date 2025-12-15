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

/**
 * Schedule orientation: determines axis layout
 */
export enum ScheduleOrientation {
  Vertical = 'vertical',   // Days as columns (default)
  Horizontal = 'horizontal' // Days as rows
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
   * Optional inline CSS styles for the event element
   * Can be any valid CSS string (e.g., "background: red; border: 1px solid black;")
   * If provided, this takes precedence over `color`
   */
  style?: string;

  /**
   * Optional CSS class name(s) to apply to event element
   */
  className?: string;

  /**
   * Optional metadata for application use
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional priority for lane assignment when events overlap.
   * Higher values are assigned to lower lane indices (more visible).
   * Events with higher lanePriority will be visible in the compressed view,
   * while lower priority events may be hidden in overflow.
   * Default: 0
   */
  lanePriority?: number;
}

export interface RenderContext {
  laneInfo?: LaneInfo,
  orientation: ScheduleOrientation,
  isZoomed: boolean,
}

export interface EventFragment {
  content: string;
  style?: string;
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
   * CSS class name to apply to the root schedule element
   */
  className?: string;

  /**
   * Day name translations for localization
   * Default: English day names
   * Example: { [DayOfWeek.Monday]: 'Lunes', [DayOfWeek.Tuesday]: 'Martes', ... }
   */
  dayNameTranslations?: DayNameTranslations;

  /**
   * Schedule orientation: determines whether days are displayed as columns or rows
   * Default: Vertical (days as columns, time as rows)
   */
  orientation?: ScheduleOrientation;

  /**
   * Icon configuration (replaces previous separate iconClass + icons fields)
   * Supports text, emoji, icon font names, or HTML content (e.g., SVG)
   */
  icons?: IconConfig;

  /**
   * Gap between overlapping events in lanes
   * Can be a number (pixels) or a CSS unit string (e.g., "4px", "0.5rem", "1em")
   * Default: undefined (no gap, events fill available space)
   * Only applies to events in lanes (overlapping events)
   */
  eventGap?: string | number;

  renderEvent?: (event: ScheduleEvent, context: RenderContext) => string;

  overflowIndicatorFormat?: (overflowEvents: number) => string;

  /**
   * Translations for component text strings
   * Key-value map where keys are TranslationKey enum values
   * Example: { [TranslationKey.mobileNoEvents]: 'No hay eventos para este día.' }
   */
  translations?: Record<TranslationKey, string>;
}

/**
 * Internal: Event with layout position calculated
 * @internal
 */
/**
 * Lane assignment information for overlapping events
 */
export interface LaneInfo {
  /**
   * 0-based lane index (0 = first lane, 1 = second lane, etc.)
   */
  laneIndex: number;

  /**
   * Total number of lanes for this conflict group
   */
  totalLanes: number;
}

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
  gridColumnStart: number;

  /**
   * Grid column end index (1-based for CSS Grid)
   */
  gridColumnEnd: number;

  /**
   * CSS positioning values for fractional offsets
   */
  leftPercent?: number; // For horizontal orientation
  topPercent?: number; // For vertical orientation
  widthPercent?: number; // For horizontal orientation
  heightPercent?: number; // For vertical orientation

  /**
   * Optional lane assignment for overlapping events
   */
  laneInfo?: LaneInfo;

  /**
   * Gap value for CSS calc() when applying gaps between lane events
   * @internal
   */
  gap?: string | number;
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface AxisConfiguration {
  headerHeight: string;
  crossAxisWidth: string;
  numColumns: number;
  numRows: number;
  headerAxisData: string;
  crossAxisData: string;
}

/**
 * Icon configuration object passed through component instead of using globals
 * 
 * Icon values can be:
 * - Text/emoji (e.g., '🔍', '↺')
 * - Icon font class names (e.g., 'zoom_in' for Material Symbols)
 * - HTML content (e.g., SVG markup: '<svg>...</svg>')
 * 
 * When HTML is provided, it will be inserted directly into the DOM.
 * Users are responsible for ensuring HTML content is safe and properly formatted.
 */
export interface IconConfig {
  /** CSS class applied to icon span elements (e.g., material-symbols-outlined) */
  className?: string;
  /** Icon content for zoom affordance - can be text, emoji, icon font name, or HTML (e.g., SVG) */
  zoom?: string;
  /** Icon content for unzoom affordance - can be text, emoji, icon font name, or HTML (e.g., SVG) */
  unzoom?: string;
  /** Icon content for intersection CTA hint - can be text, emoji, icon font name, or HTML (e.g., SVG) */
  cta?: string;
  /** Icon content for previous day navigation button - can be text, emoji, icon font name, or HTML (e.g., SVG). Defaults to '←' for vertical orientation, '↑' for horizontal */
  prevDay?: string;
  /** Icon content for next day navigation button - can be text, emoji, icon font name, or HTML (e.g., SVG). Defaults to '→' for vertical orientation, '↓' for horizontal */
  nextDay?: string;
}

/**
 * Translation keys for component text strings
 */
export enum TranslationKey {
  /** Message displayed when there are no events for a day in mobile view */
  mobileNoEvents = 'mobileNoEvents'
}

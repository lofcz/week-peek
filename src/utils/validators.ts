import type { DayOfWeek, ScheduleEvent, ScheduleConfig, ValidationError, TimeOnly } from '../types';
import type { Result } from '../types/internal';
import { DayOfWeek as DayEnum, TimeOnly as TimeOnlyClass } from '../types';

/**
 * Type guard to check if a value is a valid DayOfWeek enum value
 */
export function isDayOfWeek(value: unknown): value is DayOfWeek {
  if (typeof value === 'number') {
    return value >= DayEnum.Monday && value <= DayEnum.Sunday;
  }
  return false;
}

/**
 * Validate that a value is a TimeOnly instance
 */
export function isValidTimeOnly(value: unknown): value is TimeOnly {
  return value instanceof TimeOnlyClass;
}

/**
 * Validate a single event object
 */
export function validateEvent(event: unknown): Result<void, ValidationError[]> {
  const errors: ValidationError[] = [];
  
  if (typeof event !== 'object' || event === null) {
    return {
      success: false,
      error: [{ field: 'event', message: 'Event must be an object' }]
    };
  }
  
  const e = event as Partial<ScheduleEvent>;
  
  // Validate id
  if (typeof e.id !== 'string' || e.id.length === 0) {
    errors.push({
      field: 'id',
      message: 'Event id is required and must be a non-empty string',
      value: e.id
    });
  }
  
  // Validate day
  if (!isDayOfWeek(e.day)) {
    errors.push({
      field: 'day',
      message: `Invalid day. Must be a valid DayOfWeek enum value (0-6)`,
      value: e.day
    });
  }
  
  // Validate startTime
  if (!isValidTimeOnly(e.startTime)) {
    errors.push({
      field: 'startTime',
      message: 'startTime must be a TimeOnly instance',
      value: e.startTime
    });
  }

  // Validate endTime
  if (!isValidTimeOnly(e.endTime)) {
    errors.push({
      field: 'endTime',
      message: 'endTime must be a TimeOnly instance',
      value: e.endTime
    });
  }
  
  // Validate time order (only if both are valid)
  if (isValidTimeOnly(e.startTime) && isValidTimeOnly(e.endTime)) {
    if (!e.endTime.isAfter(e.startTime)) {
      errors.push({
        field: 'endTime',
        message: 'endTime must be after startTime',
        value: { startTime: e.startTime.toString(), endTime: e.endTime.toString() }
      });
    }
  }
  
  // Validate title
  if (typeof e.title !== 'string' || e.title.length === 0) {
    errors.push({
      field: 'title',
      message: 'Event title is required and must be a non-empty string',
      value: e.title
    });
  }
  
  if (errors.length > 0) {
    return { success: false, error: errors };
  }
  
  return { success: true, data: undefined };
}

/**
 * Validate configuration object
 */
export function validateConfig(config: unknown): Result<void, ValidationError[]> {
  const errors: ValidationError[] = [];
  
  if (typeof config !== 'object' || config === null) {
    return {
      success: false,
      error: [{ field: 'config', message: 'Config must be an object' }]
    };
  }
  
  const c = config as Partial<ScheduleConfig>;
  
  // Validate visibleDays
  if (c.visibleDays !== undefined) {
    if (!Array.isArray(c.visibleDays) || c.visibleDays.length === 0) {
      errors.push({
        field: 'visibleDays',
        message: 'visibleDays must be a non-empty array',
        value: c.visibleDays
      });
    } else {
      c.visibleDays.forEach((day, index) => {
        if (!isDayOfWeek(day)) {
          errors.push({
            field: `visibleDays[${index}]`,
            message: `Invalid day. Must be a valid DayOfWeek enum value (0-6)`,
            value: day
          });
        }
      });
    }
  }
  
  // Validate hour range (runtime check for valid Hour values)
  if (c.startHour !== undefined) {
    if (typeof c.startHour !== 'number' || !Number.isInteger(c.startHour) || c.startHour < 0 || c.startHour > 23) {
      errors.push({
        field: 'startHour',
        message: 'startHour must be an integer between 0 and 23',
        value: c.startHour
      });
    }
  }
  
  if (c.endHour !== undefined) {
    if (typeof c.endHour !== 'number' || !Number.isInteger(c.endHour) || c.endHour < 0 || c.endHour > 23) {
      errors.push({
        field: 'endHour',
        message: 'endHour must be an integer between 0 and 23',
        value: c.endHour
      });
    }
  }
  
  // Validate hour order
  if (c.startHour !== undefined && c.endHour !== undefined && c.endHour <= c.startHour) {
    errors.push({
      field: 'endHour',
      message: 'endHour must be greater than startHour',
      value: { startHour: c.startHour, endHour: c.endHour }
    });
  }
  
  if (errors.length > 0) {
    return { success: false, error: errors };
  }
  
  return { success: true, data: undefined };
}


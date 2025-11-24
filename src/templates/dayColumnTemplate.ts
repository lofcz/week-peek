import type { DayOfWeek } from '../types';
import { getDayName } from '../types';
import type { DayNameTranslations } from '../types';

/**
 * Create HTML for a day header
 * @param day - Day of week enum value
 * @param translations - Optional day name translations (defaults to English)
 * @returns HTML string for day header
 */
export function createDayHeaderHTML(
  day: DayOfWeek,
  translations?: DayNameTranslations
): string {
  const dayName = getDayName(day, translations);
  return `<div class="day-header">${dayName}</div>`;
}

/**
 * Create HTML for a complete day column with header and events
 * @param day - Day of week enum value
 * @param eventHTMLs - HTML strings for events (already filtered and positioned)
 * @param translations - Optional day name translations
 * @returns HTML string for day column
 */
export function createDayColumnHTML(
  day: DayOfWeek,
  eventHTMLs: string[],
  translations?: DayNameTranslations
): string {
  // Events are already filtered and positioned as HTML strings, just join them
  const dayEvents = eventHTMLs.join('');
  
  const dayHeader = createDayHeaderHTML(day, translations);
  
  return `
    <div class="day-column" data-day="${day}">
      ${dayHeader}
      <div class="day-events">
        ${dayEvents}
      </div>
    </div>
  `;
}


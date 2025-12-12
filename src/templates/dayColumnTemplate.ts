import type { DayOfWeek, IconConfig } from '../types';
import { getDayName, ScheduleOrientation } from '../types';
import type { DayNameTranslations } from '../types';

/**
 * Create HTML for a day header (simple div, no positioning)
 * @param day - Day of week enum value
 * @param translations - Optional day name translations (defaults to English)
 * @returns HTML string for day header
 */
export function createDayHeaderHTML(
  day: DayOfWeek,
  translations?: DayNameTranslations,
  selectedDay?: DayOfWeek | null,
  icons?: IconConfig
): string {
  const dayName = getDayName(day, translations);
  const isSelected = selectedDay === day;
  const selectedClass = isSelected ? ' selected' : '';
  const selectedAttr = isSelected ? ' data-selected="1"' : '';
  const ariaLabel = isSelected ? `Return to full week` : `Zoom to ${dayName}`;
  const iconText = isSelected ? (icons?.unzoom ?? '↺') : (icons?.zoom ?? '🔍');
  const iconClassAttr = icons?.className ? ` ${icons.className}` : '';
  return `<div class="day-header${selectedClass}" role="button" tabindex="0" aria-label="${ariaLabel}" data-day="${day}"${selectedAttr}><span class="day-header-label">${dayName}</span><span class="day-header-icon${iconClassAttr}" aria-hidden="true">${iconText}</span></div>`;
}

/**
 * Create HTML for zoomed day header with navigation
 * @param day - Current day of week enum value
 * @param visibleDays - Array of visible days to navigate within
 * @param translations - Optional day name translations (defaults to English)
 * @param orientation - Schedule orientation (affects button direction)
 * @param icons - Optional icon configuration
 * @returns HTML string for zoomed day header with navigation
 */
export function createZoomedDayHeaderHTML(
  day: DayOfWeek,
  visibleDays: DayOfWeek[],
  translations?: DayNameTranslations,
  orientation?: ScheduleOrientation,
  icons?: IconConfig
): string {
  const dayName = getDayName(day, translations);
  
  // Find previous and next days within visible days
  const currentIndex = visibleDays.indexOf(day);
  const prevDay = currentIndex > 0 ? visibleDays[currentIndex - 1] : null;
  const nextDay = currentIndex < visibleDays.length - 1 ? visibleDays[currentIndex + 1] : null;
  
  // Determine button symbols based on orientation and icon config
  const isHorizontal = orientation === ScheduleOrientation.Horizontal;
  const prevSymbol = icons?.prevDay ?? (isHorizontal ? '↑' : '←');
  const nextSymbol = icons?.nextDay ?? (isHorizontal ? '↓' : '→');
  
  const isPrevDisabled = prevDay === null;
  const isNextDisabled = nextDay === null;
  
  const prevDayAttr = prevDay !== null ? ` data-day="${prevDay}"` : '';
  const nextDayAttr = nextDay !== null ? ` data-day="${nextDay}"` : '';
  const prevDisabledAttr = isPrevDisabled ? ' disabled' : '';
  const nextDisabledAttr = isNextDisabled ? ' disabled' : '';
  
  return `
    <div class="zoomed-day-header">
      <button type="button" class="nav-btn nav-btn-prev" data-action="prev-day"${prevDayAttr} aria-label="Previous day"${prevDisabledAttr}>
        ${prevSymbol}
      </button>
      <div class="day-label-container">
        <span class="day-header-label">${dayName}</span>
      </div>
      <button type="button" class="nav-btn nav-btn-next" data-action="next-day"${nextDayAttr} aria-label="Next day"${nextDisabledAttr}>
        ${nextSymbol}
      </button>
    </div>
  `;
}



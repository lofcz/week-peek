import type { ScheduleEvent, TimeOnly } from '../types';

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param str - String to escape
 * @returns Escaped string safe for HTML
 */
export function escapeHTML(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Calculate event duration in minutes
 * @param startTime - Start TimeOnly
 * @param endTime - End TimeOnly
 * @returns Duration in minutes
 */
function calculateEventDuration(startTime: TimeOnly, endTime: TimeOnly): number {
  return endTime.toMinutes() - startTime.toMinutes();
}

/**
 * Create HTML for a single event
 * @param event - Event to render
 * @returns HTML string for the event element
 */
export function createEventHTML(event: ScheduleEvent): string {
  const style = event.color ? `background-color: ${event.color};` : '';
  const className = `event ${event.className || ''}`.trim();
  
  // Calculate event duration to determine if description should be shown
  // Hide description for short events (1 hour or less)
  const durationMinutes = calculateEventDuration(event.startTime, event.endTime);
  const isShortEvent = durationMinutes <= 60;
  const showDescription = event.description && !isShortEvent;
  
  return `
    <div 
      class="${className}" 
      data-event-id="${event.id}"
      style="${style}"
    >
      <div class="event-title">${escapeHTML(event.title)}</div>
      <div class="event-time">${event.startTime.toString()} - ${event.endTime.toString()}</div>
      ${showDescription ? `<div class="event-description">${escapeHTML(event.description!)}</div>` : ''}
    </div>
  `;
}


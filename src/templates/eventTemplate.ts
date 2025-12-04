import { ScheduleOrientation, type LaneInfo, type RenderContext, type ScheduleEvent, type TimeOnly } from '../types';

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
 * @param laneInfo - Optional lane assignment info
 * @param renderEvent - Optional custom renderer function for event content
 * @returns HTML string for the event element
 */
export function createEventHTML(
  event: ScheduleEvent, 
  laneInfo?: LaneInfo,
  renderEvent?: (event: ScheduleEvent, context: RenderContext) => string
): string {
  // Style generation: use event.style if provided, else fall back to event.color
  let style = '';
  if (event.style) {
    style = event.style;
  } else if (event.color) {
    style = `background-color: ${event.color};`;
  }
  
  const className = `event ${event.className || ''}`.trim();

  const lanes = laneInfo?.totalLanes ?? 1;
  const durationMinutes = calculateEventDuration(event.startTime, event.endTime);
  const isShortEvent = durationMinutes <= 60;
  const showDescription = event.description && !isShortEvent;
  let showTime = true;
  let timeString = `${event.startTime.toString()} - ${event.endTime.toString()}`;
  let titleStyle = '';
  
  if (lanes === 2) {
    style += `padding: 4px;`;
    if (durationMinutes < 60) {
      timeString = `${event.startTime.toString()}`;
    }
  }
  else if (lanes > 2) {
    style += `padding: 0px;`;
    console.log(durationMinutes);
    showTime = false;
    // Allow title text to wrap instead of ellipsis
    titleStyle = 'white-space: normal; overflow: visible; text-overflow: clip;';
  }
  
  if (event.className && event.className.includes('event-overflow-indicator')) {
    const classNameOverflow = `event ${event.className}`.trim();
    return `
      <div class="${classNameOverflow}" data-event-id="${event.id}" style="${style}" role="button" aria-label="Zoom to view all overlapping events">
        <div class="event-title" style="text-align:center; width:100%">${escapeHTML(event.title)}</div>
      </div>
    `;
  }

  // Use custom renderer if provided, else use default content
  const content = renderEvent 
    ? renderEvent(event, { laneInfo, orientation: ScheduleOrientation.Vertical })
    : `
      <div class="event-title"${titleStyle ? ` style="${titleStyle}"` : ''}>${escapeHTML(event.title)}</div>
      ${showTime ? `<div class="event-time">${timeString}</div>` : ''}
      ${showDescription ? `<div class="event-description">${escapeHTML(event.description!)}</div>` : ''}
    `;

  return `
    <div 
      class="${className}" 
      data-event-id="${event.id}"
      style="${style}"
    >
      ${content}
    </div>
  `;
}

/**
 * Create HTML for a single event in horizontal layout
 * @param event - Event to render
 * @param laneInfo - Optional lane assignment info
 * @param renderEvent - Optional custom renderer function for event content
 * @returns HTML string for the event element
 */
export function createEventHTMLHorizontal(
  event: ScheduleEvent, 
  laneInfo?: LaneInfo,
  renderEvent?: (event: ScheduleEvent, context: RenderContext) => string
): string {
  // Style generation: use event.style if provided, else fall back to event.color
  let style = '';
  if (event.style) {
    style = event.style;
  } else if (event.color) {
    style = `background-color: ${event.color};`;
  }
  
  const className = `event ${event.className || ''}`.trim();

  const lanes = laneInfo?.totalLanes ?? 1;
  let showTime = true;
  let titleString = escapeHTML(event.title);
  
  if (lanes > 2) {
    showTime = false;
    // titleString += `, ${event.startTime.hours}`;
  }
  
  if (event.className && event.className.includes('event-overflow-indicator')) {
    const classNameOverflow = `event ${event.className}`.trim();
    return `
      <div class="${classNameOverflow}" data-event-id="${event.id}" style="${style}" role="button" aria-label="Zoom to view all overlapping events">
        <div class="event-title" style="text-align:center; width:100%">${titleString}</div>
      </div>
    `;
  }

  // Use custom renderer if provided, else use default content
  const content = renderEvent
    ? renderEvent(event, { laneInfo, orientation: ScheduleOrientation.Horizontal })
    : `
      <div class="event-title">${titleString}</div>
      ${showTime ? `<div class="event-time">${event.startTime.toString()} - ${event.endTime.toString()}</div>` : ''}
    `;

  return `
    <div 
      class="${className}" 
      data-event-id="${event.id}"
      style="${style}"
    >
      ${content}
    </div>
  `;
}


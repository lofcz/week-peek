import { EventFragment, ScheduleOrientation, type LaneInfo, type RenderContext, type ScheduleEvent, type TimeOnly } from '../types';

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

export function createOverflowIndicatorHTML(
  event: ScheduleEvent, 
  laneInfo?: LaneInfo
): string {
  const padding = laneInfo && laneInfo.totalLanes > 2 ? '0px' : '4px';
  const classNameOverflow = `event ${event.className}`.trim();

  return `
    <div class="${classNameOverflow}" data-event-id="${event.id}" style="padding: ${padding};" role="button" aria-label="Zoom to view all overlapping events">
      <div class="event-title" style="text-align:center; width:100%">${escapeHTML(event.title)}</div>
    </div>
  `;
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
  renderContext: RenderContext,
  renderEvent?: (event: ScheduleEvent, context: RenderContext) => string
): string {  
  let content = '';
  let style = '';

  if (renderEvent) {
    // TODO: this could also return an EventFragment to unify the api
    content = renderEvent(event, renderContext);
  }
  else {
    const eventFragment = renderContext.orientation === ScheduleOrientation.Vertical 
      ? createEventContentDefault(event, renderContext)
      : createEventContentHorizontalDefault(event, renderContext);
    content = eventFragment.content;
    style = eventFragment.style || '';
  }
     
  const clasName = `event ${event.className || ''}`.trim();
  if (event.style) {
    style += ` ${event.style}`;
  }

  return `
  <div 
    class="${clasName}" 
    data-event-id="${event.id}"
    style="${style.trim()}"
  >
    ${content}
  </div>
`;
}

function createEventContentDefault(
  event: ScheduleEvent,
  renderContext: RenderContext
): EventFragment {
  const lanes = renderContext.laneInfo?.totalLanes ?? 1;
  const durationMinutes = calculateEventDuration(event.startTime, event.endTime);
  const isShortEvent = durationMinutes <= 60;
  const showDescription = event.description && !isShortEvent;
  let showTime = true;
  let timeString = `${event.startTime.toString()} - ${event.endTime.toString()}`;
  let titleStyle = '';
  let style = '';

  if (lanes === 2) {
    style += `padding: 4px;`;
    if (durationMinutes < 60) {
      timeString = `${event.startTime.toString()}`;
    }
  }
  else if (lanes > 2) {
    style += `padding: 0px;`;
    showTime = false;
    // Allow title text to wrap instead of ellipsis
    titleStyle = 'white-space: normal; overflow: visible; text-overflow: clip;';
  }

  const content = `
  <div class="event-title"${titleStyle ? ` style="${titleStyle}"` : ''}>${escapeHTML(event.title)}</div>
  ${showTime ? `<div class="event-time">${timeString}</div>` : ''}
      ${showDescription ? `<div class="event-description">${escapeHTML(event.description!)}</div>` : ''}
      `;
  
  return {
    content: content,
    style: style,
  };
}

function createEventContentHorizontalDefault(
  event: ScheduleEvent,
  renderContext: RenderContext
): EventFragment {
  const lanes = renderContext.laneInfo?.totalLanes ?? 1;
    let showTime = true;
    let titleString = escapeHTML(event.title);
    
    if (lanes > 2) {
      showTime = false;
    }
    
    const content = `
        <div class="event-title">${titleString}</div>
        ${showTime ? `<div class="event-time">${event.startTime.toString()} - ${event.endTime.toString()}</div>` : ''}
      `;
    
    return {
      content: content,
    };
  }
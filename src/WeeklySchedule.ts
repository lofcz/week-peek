import type {
  ScheduleConfig,
  ScheduleEvent
} from './types';
import type { Result } from './types/internal';
import { WORK_WEEK_DAYS, TimeSlotInterval, ScheduleOrientation } from './types';
import { validateConfig, validateEvent } from './utils/validators';
import { filterVisibleEvents, calculateEventPosition, timeToGridColumn } from './utils/layoutHelpers';
import { createTimeLabelsHTML } from './templates/timeAxisTemplate';
import { createDayHeaderHTML } from './templates/dayColumnTemplate';
import { createEventHTML } from './templates/eventTemplate';
import './styles/main.scss';

/**
 * Weekly Schedule Component
 * Displays a generic weekly schedule with events positioned by day and time
 */
export class WeeklySchedule {
  private container: HTMLElement;
  private config: ScheduleConfig;
  private events: ScheduleEvent[];

  /**
   * Factory method to create a WeeklySchedule instance with validation
   * @param container - DOM element where schedule will be rendered
   * @param config - Configuration options
   * @param events - Array of events to display (default: empty array)
   * @returns Result containing either the WeeklySchedule instance or an error
   */
  static create(
    container: HTMLElement,
    config: ScheduleConfig,
    events: ScheduleEvent[] = []
  ): Result<WeeklySchedule, Error> {
    if (!container || !(container instanceof HTMLElement)) {
      return {
        success: false,
        error: new Error('Container must be a valid HTMLElement')
      };
    }

    const configValidation = validateConfig(config);
    if (!configValidation.success) {
      const errorMessages = configValidation.error.map(e => e.message).join(', ');
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errorMessages}`)
      };
    }

    const eventErrors: string[] = [];
    events.forEach((event, index) => {
      const result = validateEvent(event);
      if (!result.success) {
        result.error.forEach(err => {
          eventErrors.push(`events[${index}].${err.field}: ${err.message}`);
        });
      }
    });

    if (eventErrors.length > 0) {
      return {
        success: false,
        error: new Error(`Invalid events: ${eventErrors.join(', ')}`)
      };
    }

    const instance = new WeeklySchedule(container, config, events);
    return {
      success: true,
      data: instance
    };
  }

  /**
   * Private constructor - use WeeklySchedule.create() instead
   * @param container - DOM element where schedule will be rendered
   * @param config - Configuration options (already validated)
   * @param events - Array of events (already validated)
   */
  private constructor(container: HTMLElement, config: ScheduleConfig, events: ScheduleEvent[] = []) {
    this.container = container;
    this.events = [...events];
    this.config = {
      visibleDays: config.visibleDays || [...WORK_WEEK_DAYS],
      startHour: config.startHour ?? 9,
      endHour: config.endHour ?? 17,
      timeSlotInterval: config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes,
      showDayHeaders: config.showDayHeaders ?? true,
      className: config.className || '',
      onEventClick: config.onEventClick,
      dayNameTranslations: config.dayNameTranslations,
      theme: config.theme || undefined,
      orientation: config.orientation ?? ScheduleOrientation.Vertical
    } as ScheduleConfig;

    this.render();
  }

  /**
   * Render the schedule component
   */
  render(): void {
    const visibleEvents = filterVisibleEvents(this.events, this.config.visibleDays!);
    
    const hours = this.config.endHour! - this.config.startHour! + 1;
    const slotsPerHour = 60 / this.config.timeSlotInterval!;
    const totalSlots = hours * slotsPerHour;
    
    const isHorizontal = this.config.orientation === ScheduleOrientation.Horizontal;
    
    // Swap CSS variables based on orientation
    // Vertical: columns = days, rows = time slots
    // Horizontal: columns = time slots, rows = days
    const numColumns = isHorizontal ? totalSlots : this.config.visibleDays!.length;
    const numRows = isHorizontal ? this.config.visibleDays!.length : totalSlots;
    
    const orientationClass = isHorizontal ? 'weekly-schedule--horizontal' : '';
    const eventsGridClass = isHorizontal ? 'events-grid--horizontal' : '';
    
    // Swap axis order for horizontal orientation
    const headerAxis = this.createHeaderAxis();
    const timeAxis = this.createTimeAxis();
    const axesHTML = isHorizontal ? `${timeAxis}${headerAxis}` : `${headerAxis}${timeAxis}`;
    
    const html = `
      <div 
        class="weekly-schedule ${orientationClass} ${this.config.className!}"
        style="--num-columns: ${numColumns}; --num-rows: ${numRows};"
      >
        <div class="schedule-intersection"></div>
        ${axesHTML}
        ${this.createEventsGrid(visibleEvents, eventsGridClass)}
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEventListeners();
  }

  /**
   * Create header axis HTML (day headers in flex container)
   * @private
   */
  private createHeaderAxis(): string {
    if (!this.config.showDayHeaders) {
      const axisClass = this.config.orientation === ScheduleOrientation.Horizontal 
        ? 'axis-vertical' 
        : 'axis-horizontal';
      return `<div class="${axisClass}"></div>`;
    }
    
    const headers = this.config.visibleDays!
      .map(day => createDayHeaderHTML(day, this.config.dayNameTranslations))
      .join('');
    
    // Swap axis class based on orientation
    const axisClass = this.config.orientation === ScheduleOrientation.Horizontal 
      ? 'axis-vertical' 
      : 'axis-horizontal';
    
    return `<div class="${axisClass}">${headers}</div>`;
  }

  /**
   * Create time axis HTML (time labels in flex container)
   * @private
   */
  private createTimeAxis(): string {
    const timeLabels = createTimeLabelsHTML(
      this.config.startHour!,
      this.config.endHour!,
      this.config.timeSlotInterval!
    );
    
    // Swap axis class based on orientation
    const axisClass = this.config.orientation === ScheduleOrientation.Horizontal 
      ? 'axis-horizontal' 
      : 'axis-vertical';
    
    return `<div class="${axisClass}">${timeLabels}</div>`;
  }

  /**
   * Create events grid HTML
   * @private
   */
  private createEventsGrid(events: ScheduleEvent[], modifierClass: string = ''): string {
    const positionedEvents = events.map(event =>
      this.createPositionedEvent(event)
    ).join('');
    
    const classAttr = modifierClass ? `class="events-grid ${modifierClass}"` : 'class="events-grid"';
    return `<div ${classAttr}>${positionedEvents}</div>`;
  }

  /**
   * Create positioned event HTML with grid styling (relative to events grid)
   * @private
   */
  private createPositionedEvent(event: ScheduleEvent): string {
    const layout = calculateEventPosition(
      event,
      this.config.startHour!,
      this.config.timeSlotInterval!,
      this.config.visibleDays!,
      this.config.orientation!
    );

    const eventHTML = createEventHTML(event);
    
    // Add grid positioning styles - relative to events grid
    // For horizontal orientation, we need to calculate column span
    let gridStyle: string;
    if (this.config.orientation === ScheduleOrientation.Horizontal) {
      // Horizontal: grid-column spans time slots, grid-row is day
      const startCol = layout.gridColumn;
      const endCol = timeToGridColumn(event.endTime, this.config.startHour!, this.config.timeSlotInterval!);
      const finalEndCol = Math.max(endCol, startCol + 1);
      gridStyle = `grid-column: ${startCol} / ${finalEndCol}; grid-row: ${layout.gridRowStart} / ${layout.gridRowEnd};`;
    } else {
      // Vertical: grid-column is day, grid-row spans time slots
      gridStyle = `grid-column: ${layout.gridColumn}; grid-row: ${layout.gridRowStart} / ${layout.gridRowEnd};`;
    }
    
    if (eventHTML.includes('style="')) {
      return eventHTML.replace(
        'style="',
        `style="${gridStyle} `
      );
    } else {
      return eventHTML.replace(
        'class="event',
        `class="event" style="${gridStyle}`
      );
    }
  }

  /**
   * Attach event listeners for click handling
   * @private
   */
  private attachEventListeners(): void {
    if (!this.config.onEventClick) return;
    
    this.container.addEventListener('click', (e) => {
      const eventEl = (e.target as HTMLElement).closest('.event');
      if (eventEl) {
        const eventId = eventEl.getAttribute('data-event-id');
        const event = this.events.find(ev => ev.id === eventId);
        if (event && this.config.onEventClick) {
          this.config.onEventClick(event);
        }
      }
    });
  }

  /**
   * Get current events array (copy)
   */
  getEvents(): ScheduleEvent[] {
    return [...this.events];
  }

  /**
   * Get current configuration (copy)
   */
  getConfig(): ScheduleConfig {
    return { ...this.config };
  }

  /**
   * Update events and re-render
   * @param events - New events array
   * @returns Result indicating success or failure
   */
  updateEvents(events: ScheduleEvent[]): Result<void, Error> {
    const errors: string[] = [];
    
    events.forEach((event, index) => {
      const result = validateEvent(event);
      if (!result.success) {
        result.error.forEach(err => {
          errors.push(`events[${index}].${err.field}: ${err.message}`);
        });
      }
    });
    
    if (errors.length > 0) {
      return {
        success: false,
        error: new Error(`Invalid events: ${errors.join(', ')}`)
      };
    }
    
    this.events = [...events];
    this.render();
    
    return {
      success: true,
      data: undefined
    };
  }

  /**
   * Update configuration and re-render
   * @param newConfig - Partial configuration to merge
   * @returns Result indicating success or failure
   */
  updateConfig(newConfig: Partial<ScheduleConfig>): Result<void, Error> {
    const mergedConfig: ScheduleConfig = {
      ...this.config,
      ...newConfig
    };

    const validation = validateConfig(mergedConfig);
    if (!validation.success) {
      const errorMessages = validation.error.map(e => e.message).join(', ');
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errorMessages}`)
      };
    }

    this.config = {
      visibleDays: mergedConfig.visibleDays || this.config.visibleDays!,
      startHour: mergedConfig.startHour ?? this.config.startHour!,
      endHour: mergedConfig.endHour ?? this.config.endHour!,
      timeSlotInterval: mergedConfig.timeSlotInterval ?? this.config.timeSlotInterval!,
      showDayHeaders: mergedConfig.showDayHeaders ?? this.config.showDayHeaders!,
      className: mergedConfig.className || this.config.className!,
      onEventClick: mergedConfig.onEventClick,
      dayNameTranslations: mergedConfig.dayNameTranslations,
      theme: mergedConfig.theme || undefined,
      orientation: mergedConfig.orientation ?? this.config.orientation!
    } as ScheduleConfig;

    this.render();
    
    return {
      success: true,
      data: undefined
    };
  }

  /**
   * Clean up component and remove event listeners
   */
  destroy(): void {
    this.container.innerHTML = '';
    this.events = [];
  }
}


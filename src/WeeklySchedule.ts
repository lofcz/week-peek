import type {
  ScheduleConfig,
  ScheduleEvent
} from './types';
import type { Result } from './types/internal';
import { WORK_WEEK_DAYS, TimeSlotInterval } from './types';
import { validateConfig, validateEvent } from './utils/validators';
import { filterVisibleEvents, calculateEventPosition } from './utils/layoutHelpers';
import { createTimeLabelsHTML } from './templates/timeAxisTemplate';
import { createDayColumnHTML } from './templates/dayColumnTemplate';
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

    // Store events separately (state, not config)
    this.events = [...events];

    // Set defaults and store config
    this.config = {
      visibleDays: config.visibleDays || [...WORK_WEEK_DAYS],
      startHour: config.startHour ?? 9,
      endHour: config.endHour ?? 17,
      timeSlotInterval: config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes,
      showTimeLabels: config.showTimeLabels ?? true,
      showDayHeaders: config.showDayHeaders ?? true,
      className: config.className || '',
      onEventClick: config.onEventClick,
      dayNameTranslations: config.dayNameTranslations,
      theme: config.theme || undefined
    } as ScheduleConfig;

    // Initial render
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
    
    const html = `
      <div 
        class="weekly-schedule ${this.config.className!}"
        style="--visible-days: ${this.config.visibleDays!.length}; --time-slots: ${totalSlots};"
      >
        ${this.config.showTimeLabels ? this.createTimeAxis() : ''}
        <div class="days-grid">
          ${this.createDayColumns(visibleEvents)}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  /**
   * Create time axis HTML
   * @private
   */
  private createTimeAxis(): string {
    return `
      <div class="time-axis">
        ${createTimeLabelsHTML(
          this.config.startHour!,
          this.config.endHour!,
          this.config.timeSlotInterval!
        )}
      </div>
    `;
  }

  /**
   * Create day columns HTML
   * @private
   */
  private createDayColumns(events: ScheduleEvent[]): string {
    return this.config.visibleDays!
      .map((day, index) => {
        const dayEvents = events.filter(e => e.day === day);
        // Note: Column index: +2 because column 1 is time axis, column 2+ are day columns
        const columnIndex = index + 2;
        const positionedEventHTMLs = dayEvents.map(event =>
          this.createPositionedEvent(event, columnIndex)
        );
        
        return createDayColumnHTML(
          day,
          positionedEventHTMLs,
          this.config.dayNameTranslations
        );
      })
      .join('');
  }

  /**
   * Create positioned event HTML with grid styling
   * @private
   */
  private createPositionedEvent(
    event: ScheduleEvent,
    dayColumnIndex: number
  ): string {
    const layout = calculateEventPosition(
      event,
      this.config.startHour!,
      this.config.timeSlotInterval!,
      dayColumnIndex
    );

    const eventHTML = createEventHTML(event);
    
    // Add grid positioning styles
    // Note: grid-column is not needed since events are already in the correct day column
    // Only grid-row is needed to position events vertically within the day-events grid
    const gridStyle = `grid-row: ${layout.gridRowStart} / ${layout.gridRowEnd};`;
    
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
      showTimeLabels: mergedConfig.showTimeLabels ?? this.config.showTimeLabels!,
      showDayHeaders: mergedConfig.showDayHeaders ?? this.config.showDayHeaders!,
      className: mergedConfig.className || this.config.className!,
      onEventClick: mergedConfig.onEventClick,
      dayNameTranslations: mergedConfig.dayNameTranslations,
      theme: mergedConfig.theme || undefined
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


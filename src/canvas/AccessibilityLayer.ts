/**
 * Accessibility Layer - Hidden DOM layer for screen reader support
 * 
 * Canvas content is not accessible to screen readers, so we maintain
 * a hidden DOM layer that mirrors the schedule structure for accessibility.
 */

import type { ScheduleLayout, DayLayout } from './types';
import type { ScheduleEvent, DayOfWeek } from '../types';
import { getDayName, type DayNameTranslations } from '../types';

/**
 * Configuration for accessibility layer
 */
export interface AccessibilityConfig {
  /** Day name translations */
  dayNameTranslations?: DayNameTranslations;
  /** Custom event description formatter */
  formatEventDescription?: (event: ScheduleEvent) => string;
  /** ARIA labels */
  labels?: {
    scheduleLabel?: string;
    dayHeaderLabel?: string;
    eventLabel?: string;
    timeSlotLabel?: string;
  };
}

const DEFAULT_LABELS = {
  scheduleLabel: 'Weekly schedule',
  dayHeaderLabel: 'Day column',
  eventLabel: 'Event',
  timeSlotLabel: 'Time slot',
};

/**
 * AccessibilityLayer maintains a hidden DOM structure for screen readers
 */
export class AccessibilityLayer {
  private container: HTMLElement;
  private root: HTMLElement;
  private config: AccessibilityConfig;
  private eventElements: Map<string, HTMLElement>;

  constructor(container: HTMLElement, config: AccessibilityConfig = {}) {
    this.container = container;
    this.config = config;
    this.eventElements = new Map();
    
    // Create hidden accessibility root
    this.root = document.createElement('div');
    this.root.setAttribute('role', 'application');
    this.root.setAttribute('aria-label', config.labels?.scheduleLabel ?? DEFAULT_LABELS.scheduleLabel);
    this.root.className = 'sr-only weekly-schedule-a11y';
    
    // Apply screen-reader only styles
    this.root.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    
    this.container.appendChild(this.root);
  }

  /**
   * Update the accessibility layer with new layout
   */
  update(layout: ScheduleLayout, events: ScheduleEvent[]): void {
    // Clear existing content
    this.root.innerHTML = '';
    this.eventElements.clear();

    // Create schedule grid structure
    const grid = document.createElement('div');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', this.config.labels?.scheduleLabel ?? DEFAULT_LABELS.scheduleLabel);

    // Create day columns
    for (const dayLayout of layout.days) {
      const column = this.createDayColumn(dayLayout, events);
      grid.appendChild(column);
    }

    this.root.appendChild(grid);
  }

  /**
   * Create accessible day column
   */
  private createDayColumn(
    dayLayout: DayLayout,
    events: ScheduleEvent[]
  ): HTMLElement {
    const column = document.createElement('div');
    column.setAttribute('role', 'rowgroup');
    
    // Day header
    const header = document.createElement('div');
    header.setAttribute('role', 'columnheader');
    header.setAttribute('tabindex', '0');
    
    const dayName = getDayName(dayLayout.day, this.config.dayNameTranslations);
    header.textContent = dayName;
    header.setAttribute('aria-label', `${dayName} ${this.config.labels?.dayHeaderLabel ?? DEFAULT_LABELS.dayHeaderLabel}`);
    
    // Store day reference for keyboard navigation
    header.dataset.day = String(dayLayout.day);
    
    column.appendChild(header);

    // Events for this day
    const dayEvents = events
      .filter(e => e.day === dayLayout.day)
      .sort((a, b) => a.startTime.toMinutes() - b.startTime.toMinutes());

    for (const event of dayEvents) {
      const eventEl = this.createEventElement(event);
      column.appendChild(eventEl);
      this.eventElements.set(event.id, eventEl);
    }

    // If no events, add placeholder
    if (dayEvents.length === 0) {
      const empty = document.createElement('div');
      empty.setAttribute('role', 'gridcell');
      empty.textContent = `No events on ${dayName}`;
      column.appendChild(empty);
    }

    return column;
  }

  /**
   * Create accessible event element
   */
  private createEventElement(event: ScheduleEvent): HTMLElement {
    const element = document.createElement('button');
    element.setAttribute('role', 'gridcell');
    element.setAttribute('tabindex', '0');
    element.dataset.eventId = event.id;

    // Build accessible description
    const description = this.formatEventDescription(event);
    element.textContent = description;
    element.setAttribute('aria-label', description);

    return element;
  }

  /**
   * Format event description for screen readers
   */
  private formatEventDescription(event: ScheduleEvent): string {
    if (this.config.formatEventDescription) {
      return this.config.formatEventDescription(event);
    }

    const timeRange = `${event.startTime.toString()} to ${event.endTime.toString()}`;
    let description = `${event.title}, ${timeRange}`;
    
    if (event.description) {
      description += `, ${event.description}`;
    }

    return description;
  }

  /**
   * Focus an event element (for keyboard navigation)
   */
  focusEvent(eventId: string): void {
    const element = this.eventElements.get(eventId);
    if (element) {
      element.focus();
    }
  }

  /**
   * Get event element by ID
   */
  getEventElement(eventId: string): HTMLElement | undefined {
    return this.eventElements.get(eventId);
  }

  /**
   * Announce a message to screen readers
   */
  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    this.root.appendChild(announcement);
    
    // Remove after announcement is read
    setTimeout(() => {
      announcement.remove();
    }, 1000);
  }

  /**
   * Announce event details
   */
  announceEvent(event: ScheduleEvent): void {
    const description = this.formatEventDescription(event);
    this.announce(description);
  }

  /**
   * Announce day change (when zooming)
   */
  announceDay(day: DayOfWeek): void {
    const dayName = getDayName(day, this.config.dayNameTranslations);
    this.announce(`Viewing ${dayName}`);
  }

  /**
   * Announce zoom reset
   */
  announceZoomReset(): void {
    this.announce('Viewing full week');
  }

  /**
   * Set up keyboard event handlers
   */
  setupKeyboardNavigation(
    onEventSelect: (eventId: string) => void,
    onDaySelect: (day: DayOfWeek) => void
  ): void {
    this.root.addEventListener('keydown', (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      
      if (target.dataset.eventId) {
        this.handleEventKeydown(e, target.dataset.eventId, onEventSelect);
      } else if (target.dataset.day) {
        this.handleDayKeydown(e, Number(target.dataset.day) as DayOfWeek, onDaySelect);
      }
    });

    this.root.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      if (target.dataset.eventId) {
        onEventSelect(target.dataset.eventId);
      } else if (target.dataset.day) {
        onDaySelect(Number(target.dataset.day) as DayOfWeek);
      }
    });
  }

  /**
   * Handle keyboard events on event elements
   */
  private handleEventKeydown(
    e: KeyboardEvent,
    eventId: string,
    onSelect: (eventId: string) => void
  ): void {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(eventId);
        break;
        
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        this.navigateEvents(eventId, e.key === 'ArrowDown' ? 1 : -1);
        break;
    }
  }

  /**
   * Handle keyboard events on day headers
   */
  private handleDayKeydown(
    e: KeyboardEvent,
    day: DayOfWeek,
    onSelect: (day: DayOfWeek) => void
  ): void {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(day);
        break;
        
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        this.navigateDays(day, e.key === 'ArrowRight' ? 1 : -1);
        break;
    }
  }

  /**
   * Navigate between events
   */
  private navigateEvents(currentEventId: string, direction: 1 | -1): void {
    const eventIds = Array.from(this.eventElements.keys());
    const currentIndex = eventIds.indexOf(currentEventId);
    
    if (currentIndex === -1) return;
    
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < eventIds.length) {
      const newEventId = eventIds[newIndex];
      this.focusEvent(newEventId);
    }
  }

  /**
   * Navigate between day headers
   */
  private navigateDays(currentDay: DayOfWeek, direction: 1 | -1): void {
    const headers = this.root.querySelectorAll('[data-day]');
    const days = Array.from(headers).map(h => Number((h as HTMLElement).dataset.day) as DayOfWeek);
    const currentIndex = days.indexOf(currentDay);
    
    if (currentIndex === -1) return;
    
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < days.length) {
      (headers[newIndex] as HTMLElement).focus();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AccessibilityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.root.remove();
    this.eventElements.clear();
  }
}

/**
 * Utility: Add screen reader only class to document if not exists
 */
export function ensureSROnlyStyles(): void {
  if (document.getElementById('sr-only-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'sr-only-styles';
  style.textContent = `
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    
    .sr-only-focusable:focus {
      position: static;
      width: auto;
      height: auto;
      margin: 0;
      overflow: visible;
      clip: auto;
      white-space: normal;
    }
  `;
  
  document.head.appendChild(style);
}

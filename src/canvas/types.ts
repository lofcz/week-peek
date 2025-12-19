/**
 * Canvas-specific types for the WeeklySchedule canvas renderer
 */

import type { ScheduleEvent, DayOfWeek, LaneInfo, ScheduleOrientation } from '../types';

/**
 * A rectangle in pixel coordinates
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A point in pixel coordinates
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Color definition - supports CSS color strings
 */
export type Color = string;

/**
 * Font specification for canvas text rendering
 */
export interface FontSpec {
  family: string;
  size: number;
  weight?: number | string;
  style?: 'normal' | 'italic';
}

/**
 * Text alignment options
 */
export interface TextAlign {
  horizontal: 'left' | 'center' | 'right';
  vertical: 'top' | 'middle' | 'bottom';
}

/**
 * Computed layout for a single event - all values in pixels
 */
export interface EventLayout {
  /** Reference to the original event */
  event: ScheduleEvent;
  /** Bounding rectangle in canvas coordinates */
  bounds: Rect;
  /** Lane information for overlapping events */
  laneInfo?: LaneInfo;
  /** Whether this is an overflow indicator */
  isOverflow: boolean;
  /** For overflow indicators: count of hidden events */
  overflowCount?: number;
  /** Computed background color */
  backgroundColor: Color;
  /** Computed text color */
  textColor: Color;
  /** Opacity (0-1) for animations */
  opacity: number;
  /** Scale factor for animations */
  scale: number;
}

/**
 * Computed layout for a day column/row
 */
export interface DayLayout {
  day: DayOfWeek;
  /** Header bounds */
  headerBounds: Rect;
  /** Content area bounds (where events go) */
  contentBounds: Rect;
  /** Day index (0-based) in visible days */
  index: number;
  /** Previous day navigation button bounds (only when zoomed) */
  prevButtonBounds?: Rect;
  /** Next day navigation button bounds (only when zoomed) */
  nextButtonBounds?: Rect;
  /** Whether previous button is disabled (no previous day available) */
  prevButtonDisabled?: boolean;
  /** Whether next button is disabled (no next day available) */
  nextButtonDisabled?: boolean;
}

/**
 * Computed layout for a time slot
 */
export interface TimeSlotLayout {
  /** Time in minutes from midnight */
  timeMinutes: number;
  /** Formatted time string */
  label: string;
  /** Label bounds */
  labelBounds: Rect;
  /** Grid line position */
  lineStart: Point;
  lineEnd: Point;
}

/**
 * Complete computed layout for the entire schedule
 */
export interface ScheduleLayout {
  /** Total canvas dimensions */
  canvasWidth: number;
  canvasHeight: number;
  
  /** Grid area (excluding headers) */
  gridBounds: Rect;
  
  /** Header area for days */
  dayHeaderBounds: Rect;
  
  /** Header area for time axis */
  timeAxisBounds: Rect;
  
  /** Intersection area (top-left corner) */
  intersectionBounds: Rect;
  
  /** Layout for each visible day */
  days: DayLayout[];
  
  /** Layout for each time slot */
  timeSlots: TimeSlotLayout[];
  
  /** Layout for each event */
  events: EventLayout[];
  
  /** Current orientation */
  orientation: ScheduleOrientation;
  
  /** Device pixel ratio for crisp rendering */
  devicePixelRatio: number;
  
  /** Zoomed day (null if not zoomed) */
  zoomedDay: DayOfWeek | null;
}

/**
 * Hit test result
 */
export interface HitTestResult {
  type: 'event' | 'day-header' | 'time-slot' | 'grid' | 'prev-day-button' | 'next-day-button' | 'none';
  /** The event if type is 'event' */
  event?: ScheduleEvent;
  /** The event layout if type is 'event' */
  eventLayout?: EventLayout;
  /** The day if type is 'day-header' or navigation button */
  day?: DayOfWeek;
  /** The time slot if type is 'time-slot' */
  timeSlot?: TimeSlotLayout;
  /** The exact point clicked */
  point: Point;
}

/**
 * Animation state for an event
 */
export interface EventAnimationState {
  eventId: string;
  /** Current position (animating from) */
  currentBounds: Rect;
  /** Target position (animating to) */
  targetBounds: Rect;
  /** Animation progress (0-1) */
  progress: number;
  /** Animation start time */
  startTime: number;
  /** Animation duration in ms */
  duration: number;
  /** Easing function name */
  easing: EasingFunction;
  /** Current opacity */
  opacity: number;
  /** Target opacity */
  targetOpacity: number;
  /** Current scale */
  scale: number;
  /** Target scale */
  targetScale: number;
}

/**
 * Supported easing functions
 */
export type EasingFunction = 
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeOutBack'
  | 'easeInOutBack';

/**
 * Global animation state
 */
export interface AnimationState {
  /** Whether any animation is in progress */
  isAnimating: boolean;
  /** Individual event animations */
  events: Map<string, EventAnimationState>;
  /** Zoom animation progress (0-1, null if not zooming) */
  zoomProgress: number | null;
  /** Scroll offset animation */
  scrollOffset: Point;
  /** Target scroll offset */
  targetScrollOffset: Point;
}

/**
 * Render layer for compositing
 */
export enum RenderLayer {
  /** Background (grid lines, alternating rows) */
  Background = 0,
  /** Events */
  Events = 1,
  /** Headers (day names, time labels) */
  Headers = 2,
  /** Overlays (hover effects, selection) */
  Overlays = 3,
}

/**
 * Dirty region tracking for partial redraws
 */
export interface DirtyRegion {
  /** Union of all dirty rectangles */
  bounds: Rect | null;
  /** Whether full redraw is needed */
  fullRedraw: boolean;
  /** Individual dirty rectangles */
  rects: Rect[];
}

/**
 * Theme colors for canvas rendering
 */
export interface CanvasTheme {
  // Background colors
  backgroundColor: Color;
  alternateRowColor: Color;
  headerBackgroundColor: Color;
  
  // Grid colors
  gridLineColor: Color;
  gridLineMajorColor: Color;
  
  // Text colors
  headerTextColor: Color;
  timeTextColor: Color;
  eventTextColor: Color;
  
  // Event colors
  eventDefaultColor: Color;
  eventHoverBorderColor: Color;
  overflowIndicatorColor: Color;
  
  // Interaction colors
  hoverHighlightColor: Color;
  selectionColor: Color;
}

/**
 * Internal canvas renderer configuration
 */
export interface CanvasRendererOptions {
  /** Device pixel ratio override (default: window.devicePixelRatio) */
  devicePixelRatio?: number;
  
  /** Animation duration in ms (default: 300) */
  animationDuration?: number;
  
  /** Default easing function */
  defaultEasing?: EasingFunction;
  
  /** Enable anti-aliasing (default: true) */
  antiAlias?: boolean;
  
  /** Theme overrides */
  theme?: Partial<CanvasTheme>;
  
  /** Font family for text (default: system font stack) */
  fontFamily?: string;
  
  /** Enable debug rendering (shows bounds, hit areas) */
  debug?: boolean;
}

/**
 * Scroll state for the schedule
 */
export interface ScrollState {
  /** Current scroll offset */
  offset: Point;
  /** Maximum scroll bounds */
  maxOffset: Point;
  /** Viewport size */
  viewportSize: { width: number; height: number };
  /** Content size (may be larger than viewport) */
  contentSize: { width: number; height: number };
  /** Whether scrolling is needed */
  canScrollX: boolean;
  canScrollY: boolean;
}

/**
 * Interaction state
 */
export interface InteractionState {
  /** Currently hovered event */
  hoveredEvent: ScheduleEvent | null;
  /** Currently hovered day header */
  hoveredDay: DayOfWeek | null;
  /** Currently hovered navigation button */
  hoveredNavButton: 'prev' | 'next' | null;
  /** Mouse position in canvas coordinates */
  mousePosition: Point | null;
  /** Whether mouse is down */
  isMouseDown: boolean;
  /** Drag start position */
  dragStart: Point | null;
  /** Current cursor style */
  cursor: string;
}

/**
 * Callback for render completion
 */
export type RenderCallback = (
  ctx: CanvasRenderingContext2D,
  layout: ScheduleLayout
) => void;

/**
 * Event emitted during canvas interactions
 */
export interface CanvasInteractionEvent {
  type: 'click' | 'hover' | 'hover-end' | 'day-click' | 'scroll';
  event?: ScheduleEvent;
  day?: DayOfWeek;
  point: Point;
  originalEvent: MouseEvent | TouchEvent | WheelEvent;
}

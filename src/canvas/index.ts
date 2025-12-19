/**
 * Canvas Schedule Module
 * 
 * High-performance canvas-based rendering utilities.
 * The main component is WeeklySchedule from the parent module.
 */

// Types
export type {
  Rect,
  Point,
  Color,
  FontSpec,
  TextAlign,
  EventLayout,
  DayLayout,
  TimeSlotLayout,
  ScheduleLayout,
  HitTestResult,
  EventAnimationState,
  AnimationState,
  EasingFunction,
  RenderLayer,
  DirtyRegion,
  CanvasTheme,
  CanvasRendererOptions,
  ScrollState,
  InteractionState,
  CanvasInteractionEvent,
} from './types';

// Layout engine
export { LayoutEngine, DEFAULT_THEME, type LayoutDimensions } from './LayoutEngine';
export { pointInRect, expandRect, rectsIntersect, unionRects } from './LayoutEngine';

// Renderers
export { CanvasRenderer, crispPixel, parseColor, darkenColor, lightenColor, withAlpha } from './CanvasRenderer';
export { GridRenderer, renderNowIndicator, type GridRendererConfig } from './GridRenderer';
export { EventRenderer, renderEventSelection, renderEventDragPreview, renderDropZone, type EventRendererConfig } from './EventRenderer';
export { TextRenderer, textFits, splitTextToFit, type TextLayout, type TextLine, type TextRenderOptions, type FontMetrics } from './TextRenderer';

// Interaction
export { HitTester, isNearEdge, getCursorForEdge } from './HitTester';

// Animation
export { AnimationManager, easings, SpringAnimation, SpringAnimation2D } from './AnimationManager';

// Accessibility
export { AccessibilityLayer, ensureSROnlyStyles, type AccessibilityConfig } from './AccessibilityLayer';

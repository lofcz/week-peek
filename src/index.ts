// Canvas-based schedule component
export { WeeklySchedule, type WeeklyScheduleConfig, type CanvasConfig } from './WeeklySchedule';

// Canvas utilities (for advanced usage)
export { CanvasRenderer } from './canvas/CanvasRenderer';
export { LayoutEngine, type LayoutDimensions } from './canvas/LayoutEngine';
export { GridRenderer, type GridRendererConfig } from './canvas/GridRenderer';
export { EventRenderer, type EventRendererConfig } from './canvas/EventRenderer';
export { HitTester } from './canvas/HitTester';
export { AnimationManager } from './canvas/AnimationManager';
export { TextRenderer } from './canvas/TextRenderer';
export type * from './canvas/types';

// Shared types
export * from './types';
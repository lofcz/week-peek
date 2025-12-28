/**
 * Grid Renderer - Renders grid lines, headers, and time axis
 */

import type { ScheduleLayout, DayLayout, CanvasTheme, FontSpec, Rect } from './types';
import { ScheduleOrientation, type DayNameTranslations, type IconConfig } from '../types';
import { CanvasRenderer } from './CanvasRenderer';

/**
 * Configuration for grid rendering
 */
export interface GridRendererConfig {
  /** Day name translations */
  dayNameTranslations?: DayNameTranslations;
  /** Show alternating row/column backgrounds */
  showAlternatingBackground: boolean;
  /** Show grid lines */
  showGridLines: boolean;
  /** Grid line width */
  gridLineWidth: number;
  /** Header font */
  headerFont: FontSpec;
  /** Time label font */
  timeFont: FontSpec;
  /** Icon configuration for navigation buttons */
  icons?: IconConfig;
}

const DEFAULT_CONFIG: GridRendererConfig = {
  showAlternatingBackground: true,
  showGridLines: true,
  gridLineWidth: 1,
  headerFont: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: 14,
    weight: 600,
  },
  timeFont: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: 12,
    weight: 400,
  },
};

/**
 * GridRenderer handles rendering of the schedule grid structure
 */
export class GridRenderer {
  private renderer: CanvasRenderer;
  private config: GridRendererConfig;

  constructor(renderer: CanvasRenderer, config: Partial<GridRendererConfig> = {}) {
    this.renderer = renderer;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GridRendererConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Render complete grid (background, lines, headers)
   * @param layout - The schedule layout to render
   * @param skipTimeAxis - If true, skip rendering time axis (when using separate DOM time header)
   */
  render(layout: ScheduleLayout, skipTimeAxis: boolean = false): void {
    const theme = this.renderer.getTheme();
    
    // 1. Clear and fill background
    this.renderer.clear(theme.backgroundColor);
    
    // 2. Draw alternating backgrounds
    if (this.config.showAlternatingBackground) {
      this.renderAlternatingBackground(layout, theme);
    }
    
    // 3. Draw grid lines
    if (this.config.showGridLines) {
      this.renderGridLines(layout, theme);
    }
    
    // 4. Headers are now in DOM - skip rendering
    // this.renderHeaders(layout, theme);
    
    // 5. Draw time axis (skip if using separate DOM time header)
    if (!skipTimeAxis) {
      this.renderTimeAxis(layout, theme);
    }
  }

  /**
   * Render only grid lines (for partial updates)
   */
  renderGridLines(layout: ScheduleLayout, theme: CanvasTheme): void {
    // Draw time slot lines
    for (const slot of layout.timeSlots) {
      this.renderer.drawLine(
        slot.lineStart,
        slot.lineEnd,
        theme.gridLineColor,
        this.config.gridLineWidth
      );
    }

    // Draw day separator lines
    for (const day of layout.days) {
      if (layout.orientation === ScheduleOrientation.Vertical) {
        // Vertical lines between columns
        this.renderer.drawVerticalLine(
          day.contentBounds.x,
          layout.gridBounds.y,
          layout.gridBounds.y + layout.gridBounds.height,
          theme.gridLineColor,
          this.config.gridLineWidth
        );
      } else {
        // Horizontal lines between rows
        this.renderer.drawHorizontalLine(
          day.contentBounds.y,
          layout.gridBounds.x,
          layout.gridBounds.x + layout.gridBounds.width,
          theme.gridLineColor,
          this.config.gridLineWidth
        );
      }
    }

    // Draw border around grid
    this.renderer.strokeRect(layout.gridBounds, theme.gridLineColor, this.config.gridLineWidth);
  }

  /**
   * Render alternating row/column backgrounds
   */
  private renderAlternatingBackground(layout: ScheduleLayout, theme: CanvasTheme): void {
    if (layout.orientation === ScheduleOrientation.Vertical) {
      // Alternate time slot rows
      layout.timeSlots.forEach((slot, index) => {
        if (index % 2 === 1) {
          const slotHeight = layout.gridBounds.height / layout.timeSlots.length;
          this.renderer.fillRect(
            {
              x: layout.gridBounds.x,
              y: slot.lineStart.y,
              width: layout.gridBounds.width,
              height: slotHeight,
            },
            theme.alternateRowColor
          );
        }
      });
    } else {
      // Alternate day rows
      layout.days.forEach((day, index) => {
        if (index % 2 === 1) {
          this.renderer.fillRect(day.contentBounds, theme.alternateRowColor);
        }
      });
    }
  }


  /**
   * Render time axis labels
   */
  private renderTimeAxis(layout: ScheduleLayout, theme: CanvasTheme): void {
    // Fill time axis background
    this.renderer.fillRect(layout.timeAxisBounds, theme.headerBackgroundColor);
    
    // Set font for time labels
    this.renderer.setFont(this.config.timeFont);

    // Draw each time slot label (left-aligned) and tick marks at hour boundaries
    for (const slot of layout.timeSlots) {
      const isHourBoundary = slot.timeMinutes % 60 === 0;
      
      // Draw tick mark at hour boundaries (perpendicular to the time axis)
      if (isHourBoundary) {
        if (layout.orientation === ScheduleOrientation.Vertical) {
          // Vertical orientation: time axis is vertical on left, draw horizontal tick marks
          const tickX = layout.timeAxisBounds.x; // Left edge of time axis
          const tickY = slot.labelBounds.y;
          // Draw horizontal line extending from left edge into time axis
          this.renderer.drawHorizontalLine(
            tickY,
            tickX,
            tickX + 8, // Extend 8px into time axis
            theme.gridLineMajorColor, // Use lighter gray for subtle tick marks
            this.config.gridLineWidth
          );
        } else {
          // Horizontal orientation: time axis is horizontal at top, draw vertical tick marks
          const tickX = slot.labelBounds.x; // Left edge of slot (where hour starts)
          const tickY = layout.timeAxisBounds.y; // Top edge of time axis
          // Draw vertical line extending from top edge down into time axis
          this.renderer.drawVerticalLine(
            tickX,
            tickY,
            tickY + layout.timeAxisBounds.height, // Extend through full time axis height
            theme.gridLineMajorColor, // Use lighter gray for subtle tick marks
            this.config.gridLineWidth
          );
        }
      }
      
      // Draw label left-aligned with padding
      const padding = 4; // Padding from left edge
      const textX = slot.labelBounds.x + padding;
      const textY = layout.orientation === ScheduleOrientation.Vertical
        ? slot.labelBounds.y + slot.labelBounds.height / 2
        : slot.labelBounds.y + slot.labelBounds.height / 2;
      
      this.renderer.drawText(
        slot.label,
        textX,
        textY,
        theme.timeTextColor,
        'left',
        'middle'
      );
    }

    // Draw border
    if (layout.orientation === ScheduleOrientation.Vertical) {
      this.renderer.drawVerticalLine(
        layout.timeAxisBounds.x + layout.timeAxisBounds.width,
        0,
        layout.canvasHeight,
        theme.gridLineMajorColor,
        this.config.gridLineWidth
      );
    } else {
      this.renderer.drawHorizontalLine(
        layout.timeAxisBounds.y + layout.timeAxisBounds.height,
        0,
        layout.canvasWidth,
        theme.gridLineMajorColor,
        this.config.gridLineWidth
      );
    }
  }

  /**
   * DEPRECATED: Day headers are now rendered as DOM elements
   * Kept for reference only
   */
  renderDayHoverHighlight(_day: DayLayout, _theme: CanvasTheme): void {
    // Headers moved to DOM - this method is no longer used
    return;
  }

  /**
   * DEPRECATED: Navigation buttons are now rendered as DOM elements
   * Kept for reference only
   */
  renderNavigationButton(
    _bounds: Rect,
    _type: 'prev' | 'next',
    _orientation: ScheduleOrientation,
    _theme: CanvasTheme,
    _isHovered: boolean,
    _isDisabled: boolean = false
  ): void {
    // Navigation buttons moved to DOM - this method is no longer used
    return;
  }

  /**
   * DEPRECATED: Navigation buttons are now rendered as DOM elements
   * Kept for reference only
   */
  renderNavigationButtonHover(
    _day: DayLayout,
    _buttonType: 'prev' | 'next',
    _theme: CanvasTheme,
    _orientation: ScheduleOrientation
  ): void {
    // Navigation buttons moved to DOM - this method is no longer used
    return;
  }

  /**
   * Render column/row highlight when hovering a day
   */
  renderDayColumnHighlight(day: DayLayout, theme: CanvasTheme): void {
    this.renderer.fillRect(day.contentBounds, theme.hoverHighlightColor);
  }
}

/**
 * Render "Now" indicator line showing current time
 */
export function renderNowIndicator(
  renderer: CanvasRenderer,
  layout: ScheduleLayout,
  color: string = '#ef4444',
  lineWidth: number = 2
): void {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Find the start time in minutes
  const startMinutes = (layout.timeSlots[0]?.timeMinutes ?? 0);
  const endMinutes = (layout.timeSlots[layout.timeSlots.length - 1]?.timeMinutes ?? 0) + 60; // Assume 60 min last slot
  
  // Check if current time is within range
  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    return;
  }
  
  // Calculate position
  const totalDuration = endMinutes - startMinutes;
  const elapsed = currentMinutes - startMinutes;
  const progress = elapsed / totalDuration;
  
  if (layout.orientation === ScheduleOrientation.Vertical) {
    const y = layout.gridBounds.y + layout.gridBounds.height * progress;
    renderer.drawHorizontalLine(
      y,
      layout.gridBounds.x,
      layout.gridBounds.x + layout.gridBounds.width,
      color,
      lineWidth
    );
    
    // Draw small circle at the start
    const ctx = renderer.getContext();
    ctx.beginPath();
    ctx.arc(layout.gridBounds.x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    const x = layout.gridBounds.x + layout.gridBounds.width * progress;
    renderer.drawVerticalLine(
      x,
      layout.gridBounds.y,
      layout.gridBounds.y + layout.gridBounds.height,
      color,
      lineWidth
    );
    
    // Draw small circle at the top
    const ctx = renderer.getContext();
    ctx.beginPath();
    ctx.arc(x, layout.gridBounds.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

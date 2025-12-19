/**
 * Grid Renderer - Renders grid lines, headers, and time axis
 */

import type { ScheduleLayout, DayLayout, CanvasTheme, FontSpec, Rect } from './types';
import { ScheduleOrientation, getDayName, type DayNameTranslations, type IconConfig } from '../types';
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
   */
  render(layout: ScheduleLayout): void {
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
    
    // 4. Draw headers
    this.renderHeaders(layout, theme);
    
    // 5. Draw time axis
    this.renderTimeAxis(layout, theme);
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
   * Render day headers
   */
  private renderHeaders(layout: ScheduleLayout, theme: CanvasTheme): void {
    // Fill header background
    this.renderer.fillRect(layout.dayHeaderBounds, theme.headerBackgroundColor);
    
    // Draw intersection area
    this.renderer.fillRect(layout.intersectionBounds, theme.headerBackgroundColor);
    
    // Set font for headers
    this.renderer.setFont(this.config.headerFont);

    // Draw each day header
    for (const day of layout.days) {
      const dayName = getDayName(day.day, this.config.dayNameTranslations);
      
      this.renderer.drawTextCentered(
        dayName,
        day.headerBounds,
        theme.headerTextColor
      );

      // Render navigation buttons when zoomed (always visible, but may be disabled)
      if (layout.zoomedDay !== null && day.day === layout.zoomedDay) {
        // Note: hover state will be rendered separately by WeeklySchedule
        if (day.prevButtonBounds) {
          this.renderNavigationButton(
            day.prevButtonBounds,
            'prev',
            layout.orientation,
            theme,
            false,
            day.prevButtonDisabled ?? false
          );
        }
        if (day.nextButtonBounds) {
          this.renderNavigationButton(
            day.nextButtonBounds,
            'next',
            layout.orientation,
            theme,
            false,
            day.nextButtonDisabled ?? false
          );
        }
      }

      // Draw separator line after header (except last)
      if (layout.orientation === ScheduleOrientation.Vertical) {
        this.renderer.drawVerticalLine(
          day.headerBounds.x + day.headerBounds.width,
          day.headerBounds.y,
          day.headerBounds.y + day.headerBounds.height,
          theme.gridLineColor,
          this.config.gridLineWidth
        );
      } else {
        this.renderer.drawHorizontalLine(
          day.headerBounds.y + day.headerBounds.height,
          day.headerBounds.x,
          day.headerBounds.x + day.headerBounds.width,
          theme.gridLineColor,
          this.config.gridLineWidth
        );
      }
    }

    // Draw border under/beside header
    if (layout.orientation === ScheduleOrientation.Vertical) {
      this.renderer.drawHorizontalLine(
        layout.dayHeaderBounds.y + layout.dayHeaderBounds.height,
        0,
        layout.canvasWidth,
        theme.gridLineMajorColor,
        this.config.gridLineWidth
      );
    } else {
      this.renderer.drawVerticalLine(
        layout.dayHeaderBounds.x + layout.dayHeaderBounds.width,
        0,
        layout.canvasHeight,
        theme.gridLineMajorColor,
        this.config.gridLineWidth
      );
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

    // Draw each time slot label
    for (const slot of layout.timeSlots) {
      this.renderer.drawTextCentered(
        slot.label,
        slot.labelBounds,
        theme.timeTextColor
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
   * Render hover highlight for a day header
   */
  renderDayHoverHighlight(day: DayLayout, theme: CanvasTheme): void {
    this.renderer.fillRect(day.headerBounds, theme.hoverHighlightColor);
    
    // Redraw the day name
    this.renderer.setFont(this.config.headerFont);
    const dayName = getDayName(day.day, this.config.dayNameTranslations);
    this.renderer.drawTextCentered(dayName, day.headerBounds, theme.headerTextColor);
  }

  /**
   * Render navigation button (prev/next)
   */
  renderNavigationButton(
    bounds: Rect,
    type: 'prev' | 'next',
    _orientation: ScheduleOrientation,
    theme: CanvasTheme,
    isHovered: boolean,
    isDisabled: boolean = false
  ): void {
    // Button background
    const bgColor = isHovered && !isDisabled 
      ? theme.hoverHighlightColor 
      : theme.headerBackgroundColor;
    this.renderer.fillRect(bounds, bgColor);

    // Button border
    this.renderer.strokeRect(
      bounds,
      theme.gridLineColor,
      this.config.gridLineWidth
    );

    // Icon - buttons are always above/below, so use vertical arrows
    const defaultPrevIcon = '↑';
    const defaultNextIcon = '↓';
    
    const iconText = type === 'prev'
      ? (this.config.icons?.prevDay ?? defaultPrevIcon)
      : (this.config.icons?.nextDay ?? defaultNextIcon);

    // Icon color - reduced opacity if disabled
    const iconColor = isDisabled 
      ? this.withAlpha(theme.headerTextColor, 0.4)
      : theme.headerTextColor;

    // Set font for icon (smaller size for 16x16 icon)
    this.renderer.setFont({
      ...this.config.headerFont,
      size: 16,
    });

    // Draw icon centered
    this.renderer.drawTextCentered(iconText, bounds, iconColor);
  }

  /**
   * Helper to apply alpha to a color
   */
  private withAlpha(color: string, alpha: number): string {
    // Simple implementation - assumes rgba format or converts hex
    if (color.startsWith('rgba')) {
      return color.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
    } else if (color.startsWith('rgb')) {
      return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    } else if (color.startsWith('#')) {
      // Convert hex to rgba
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  /**
   * Render column/row highlight when hovering a day
   */
  renderDayColumnHighlight(day: DayLayout, theme: CanvasTheme): void {
    this.renderer.fillRect(day.contentBounds, theme.hoverHighlightColor);
  }

  /**
   * Render navigation button hover highlight
   */
  renderNavigationButtonHover(
    day: DayLayout,
    buttonType: 'prev' | 'next',
    theme: CanvasTheme,
    _orientation: ScheduleOrientation
  ): void {
    const bounds = buttonType === 'prev' ? day.prevButtonBounds : day.nextButtonBounds;
    const isDisabled = buttonType === 'prev' ? (day.prevButtonDisabled ?? false) : (day.nextButtonDisabled ?? false);
    if (!bounds) return;

    // Re-render button with hover state (but don't show hover if disabled)
    // Note: orientation is not needed since buttons are always vertical now
    this.renderNavigationButton(bounds, buttonType, ScheduleOrientation.Vertical, theme, !isDisabled, isDisabled);
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

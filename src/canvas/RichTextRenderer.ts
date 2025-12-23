/**
 * Rich Text Renderer - Renders simple HTML to canvas
 * Supports basic HTML tags: <p>, <strong>, <em>, <h2>, <h3>, <br>
 */

import type { Rect, FontSpec, Color } from './types';
import { CanvasRenderer } from './CanvasRenderer';

/**
 * Rich text rendering options
 */
export interface RichTextOptions {
  maxLines?: number;
  lineHeight?: number;
  padding?: number;
}

/**
 * Text segment with styling information
 */
interface TextSegment {
  text: string;
  font: FontSpec;
  isLineBreak: boolean;
}

/**
 * RichTextRenderer renders HTML content to canvas with basic formatting support
 */
export class RichTextRenderer {
  private allowedTags = new Set(['p', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'br']);
  
  constructor(private renderer: CanvasRenderer) {}

  /**
   * Sanitize HTML to prevent XSS attacks
   * Strips dangerous tags and attributes, only allows safe formatting tags
   */
  private sanitizeHTML(html: string): string {
    try {
      // Wrap HTML in a container div to ensure we have a valid structure
      const wrappedHTML = `<div>${html}</div>`;
      
      // Parse HTML using DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(wrappedHTML, 'text/html');
      
      // Check for parsing errors (DOMParser puts errors in the DOM)
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        throw new Error('HTML parsing error');
      }
      
      // Get the container div (should be in body)
      const container = doc.body?.querySelector('div');
      if (!container) {
        // If no container found, try to get body content directly
        if (doc.body) {
          this.sanitizeNode(doc.body);
          return doc.body.innerHTML;
        }
        // If still no body, return escaped HTML
        return this.escapeHTML(html);
      }
      
      // Sanitize the container's CHILDREN only (not the container itself)
      // If we sanitize the container, it gets removed since 'div' is not in allowedTags
      for (const child of Array.from(container.childNodes)) {
        this.sanitizeNode(child);
      }
      
      // Return the sanitized innerHTML
      return container.innerHTML;
    } catch (error) {
      // If parsing fails, escape HTML and return plain text
      console.warn('Failed to sanitize HTML, escaping:', error);
      return this.escapeHTML(html);
    }
  }

  /**
   * Recursively sanitize DOM nodes
   */
  private sanitizeNode(node: Node | null): void {
    if (!node) return;
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      
      // Remove disallowed tags entirely
      if (!this.allowedTags.has(tagName)) {
        // Replace with its children (which will be sanitized recursively)
        const parent = element.parentNode;
        if (parent) {
          const children = Array.from(element.childNodes);
          for (const child of children) {
            parent.insertBefore(child, element);
            this.sanitizeNode(child);
          }
          parent.removeChild(element);
        }
        return;
      }
      
      // Remove all attributes (XSS prevention)
      while (element.attributes.length > 0) {
        element.removeAttribute(element.attributes[0].name);
      }
      
      // Recursively sanitize children
      const children = Array.from(element.childNodes);
      for (const child of children) {
        this.sanitizeNode(child);
      }
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Render HTML content to canvas
   * @param html - HTML string to render
   * @param bounds - Bounding rectangle for rendering
   * @param baseFont - Base font specification
   * @param color - Text color
   * @param options - Rendering options
   * @returns Object with rendered height and truncation status
   */
  render(
    html: string,
    bounds: Rect,
    baseFont: FontSpec,
    color: Color,
    options: RichTextOptions = {}
  ): { height: number; truncated: boolean } {
    const opts = {
      maxLines: options.maxLines ?? Infinity,
      lineHeight: options.lineHeight ?? 1.3,
      padding: options.padding ?? 0,
    };

    // Sanitize HTML to prevent XSS
    const sanitizedHTML = this.sanitizeHTML(html);

    // Parse HTML and extract text segments
    const segments = this.parseHTML(sanitizedHTML, baseFont);
    
    // Calculate layout with word wrapping
    const layout = this.calculateLayout(segments, bounds, baseFont, opts);
    
    // Render to canvas
    this.drawLayout(layout, bounds, color);
    
    return {
      height: layout.totalHeight,
      truncated: layout.truncated,
    };
  }

  /**
   * Parse HTML and extract text segments with styling
   */
  private parseHTML(html: string, baseFont: FontSpec): TextSegment[] {
    const segments: TextSegment[] = [];
    
    try {
      // Parse HTML using DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check for parsing errors (DOMParser puts errors in the DOM)
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        throw new Error('HTML parsing error');
      }
      
      // Walk the DOM tree and extract text segments
      this.walkDOM(doc.body, baseFont, segments);
      
      // If no segments were extracted, the HTML might be empty or malformed
      if (segments.length === 0) {
        console.warn('No text segments extracted from HTML:', html);
        // Fall back to extracting plain text (strip HTML tags)
        const textContent = doc.body.textContent || '';
        if (textContent.trim()) {
          segments.push({ text: textContent.trim(), font: baseFont, isLineBreak: false });
        } else {
          // If even textContent is empty, try to extract text by stripping HTML tags manually
          const stripped = html.replace(/<[^>]*>/g, '').trim();
          if (stripped) {
            segments.push({ text: stripped, font: baseFont, isLineBreak: false });
          }
        }
      }
    } catch (error) {
      // If parsing fails, extract plain text by stripping HTML tags
      console.warn('Failed to parse HTML, extracting plain text:', error);
      const stripped = html.replace(/<[^>]*>/g, '').trim();
      if (stripped) {
        segments.push({ text: stripped, font: baseFont, isLineBreak: false });
      }
    }
    
    return segments;
  }

  /**
   * Recursively walk DOM tree and extract text segments
   */
  private walkDOM(
    node: Node,
    currentFont: FontSpec,
    segments: TextSegment[],
    parentTag: string = ''
  ): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      // Don't trim - preserve spaces for proper word spacing
      // Only skip completely empty text nodes
      if (text.length > 0) {
        segments.push({ text, font: { ...currentFont }, isLineBreak: false });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      
      // Only process allowed tags
      if (!this.allowedTags.has(tagName)) {
        // For disallowed tags, just process children with current font
        for (const child of Array.from(node.childNodes)) {
          this.walkDOM(child, currentFont, segments, parentTag);
        }
        return;
      }
      
      // Apply tag-specific styling
      const modifiedFont = this.applyTagStyle(tagName, currentFont);
      
      // Handle line breaks
      if (tagName === 'br') {
        segments.push({ text: '', font: modifiedFont, isLineBreak: true });
      } else if (tagName === 'p' && parentTag !== 'p') {
        // Add spacing before paragraph (except if nested in another p)
        if (segments.length > 0 && !segments[segments.length - 1].isLineBreak) {
          segments.push({ text: '', font: modifiedFont, isLineBreak: true });
        }
      }
      
      // Process children
      for (const child of Array.from(node.childNodes)) {
        this.walkDOM(child, modifiedFont, segments, tagName);
      }
      
      // Add spacing after paragraph
      if (tagName === 'p' && parentTag !== 'p') {
        segments.push({ text: '', font: modifiedFont, isLineBreak: true });
      }
    } else {
      // Process other node types (comments, etc.)
      for (const child of Array.from(node.childNodes)) {
        this.walkDOM(child, currentFont, segments, parentTag);
      }
    }
  }

  /**
   * Apply tag-specific font styling
   */
  private applyTagStyle(tagName: string, baseFont: FontSpec): FontSpec {
    const font = { ...baseFont };
    
    switch (tagName) {
      case 'strong':
      case 'b':
        font.weight = 600;
        break;
      case 'em':
      case 'i':
        font.style = 'italic';
        break;
      case 'h2':
        font.size = baseFont.size * 1.5;
        font.weight = 600;
        break;
      case 'h3':
        font.size = baseFont.size * 1.25;
        font.weight = 600;
        break;
    }
    
    return font;
  }

  /**
   * Calculate text layout with word wrapping
   */
  private calculateLayout(
    segments: TextSegment[],
    bounds: Rect,
    baseFont: FontSpec,
    options: Required<RichTextOptions>
  ): {
    lines: Array<{ segments: Array<{ text: string; font: FontSpec; x: number }>; y: number; height: number }>;
    totalHeight: number;
    truncated: boolean;
  } {
    const lines: Array<{ segments: Array<{ text: string; font: FontSpec; x: number }>; y: number; height: number }> = [];
    const maxWidth = bounds.width - options.padding * 2;
    let currentY = bounds.y + options.padding;
    let currentLine: Array<{ text: string; font: FontSpec; x: number }> = [];
    let currentX = options.padding;
    let lineHeight = baseFont.size * options.lineHeight;
    let truncated = false;
    
    for (const segment of segments) {
      if (segment.isLineBreak) {
        // Finalize current line
        if (currentLine.length > 0) {
          const height = lineHeight;
          lines.push({
            segments: [...currentLine],
            y: currentY,
            height,
          });
          currentY += height;
          currentLine = [];
          currentX = options.padding;
          lineHeight = baseFont.size * options.lineHeight;
          
          // Check if we've exceeded max lines
          if (lines.length >= options.maxLines) {
            truncated = true;
            break;
          }
        }
        continue;
      }
      
      // Set font for measurement
      this.renderer.setFont(segment.font);
      // Split text into words and spaces, preserving whitespace
      // Use a regex that captures both words and whitespace
      const parts = segment.text.split(/(\s+)/);
      
      for (const part of parts) {
        if (!part) continue; // Skip empty strings
        
        // Check if this part is whitespace
        if (/^\s+$/.test(part)) {
          // It's whitespace - treat as a space for layout purposes
          const spaceWidth = this.renderer.measureText(' ').width;
          if (currentLine.length > 0 && currentX + spaceWidth <= maxWidth) {
            // Add space to current word if there's room
            const lastSegment = currentLine[currentLine.length - 1];
            lastSegment.text += ' ';
            currentX += spaceWidth;
          }
          continue;
        }
        
        // It's a word
        const word = part;
        const wordMetrics = this.renderer.measureText(word);
        const wordWidth = wordMetrics.width;
        const spaceMetrics = this.renderer.measureText(' ');
        const spaceWidth = spaceMetrics.width;
        
        // Check if word fits on current line
        if (currentLine.length === 0) {
          // First word on line
          if (wordWidth <= maxWidth) {
            currentLine.push({ text: word, font: segment.font, x: currentX });
            currentX += wordWidth;
            lineHeight = Math.max(lineHeight, segment.font.size * options.lineHeight);
          } else {
            // Word is too long, truncate it
            const truncatedWord = this.truncateText(word, maxWidth, segment.font);
            currentLine.push({ text: truncatedWord, font: segment.font, x: currentX });
            truncated = true;
          }
        } else {
          // Check if word fits with space
          const testWidth = currentX + spaceWidth + wordWidth;
          if (testWidth <= maxWidth) {
            // Add space and word
            const lastSegment = currentLine[currentLine.length - 1];
            lastSegment.text += ' ' + word;
            currentX = testWidth;
            lineHeight = Math.max(lineHeight, segment.font.size * options.lineHeight);
          } else {
            // Word doesn't fit, start new line
            const height = lineHeight;
            lines.push({
              segments: [...currentLine],
              y: currentY,
              height,
            });
            currentY += height;
            currentLine = [];
            currentX = options.padding;
            lineHeight = segment.font.size * options.lineHeight;
            
            // Check if we've exceeded max lines
            if (lines.length >= options.maxLines) {
              truncated = true;
              break;
            }
            
            // Add word to new line
            if (wordWidth <= maxWidth) {
              currentLine.push({ text: word, font: segment.font, x: currentX });
              currentX += wordWidth;
            } else {
              const truncatedWord = this.truncateText(word, maxWidth, segment.font);
              currentLine.push({ text: truncatedWord, font: segment.font, x: currentX });
              truncated = true;
            }
          }
        }
      }
    }
    
    // Add remaining line
    if (currentLine.length > 0 && lines.length < options.maxLines) {
      const height = lineHeight;
      lines.push({
        segments: [...currentLine],
        y: currentY,
        height,
      });
    }
    
    const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);
    
    return { lines, totalHeight, truncated };
  }

  /**
   * Truncate text to fit width with ellipsis
   */
  private truncateText(text: string, maxWidth: number, font: FontSpec): string {
    this.renderer.setFont(font);
    const ellipsis = '…';
    const ellipsisMetrics = this.renderer.measureText(ellipsis);
    const ellipsisWidth = ellipsisMetrics.width;
    const availableWidth = maxWidth - ellipsisWidth;
    
    if (availableWidth <= 0) {
      return ellipsis;
    }
    
    // Binary search for truncation point
    let low = 0;
    let high = text.length;
    
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const testText = text.slice(0, mid);
      const testWidth = this.renderer.measureText(testText).width;
      
      if (testWidth <= availableWidth) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    
    return low > 0 ? text.slice(0, low) + ellipsis : ellipsis;
  }

  /**
   * Draw calculated layout to canvas
   */
  private drawLayout(
    layout: {
      lines: Array<{ segments: Array<{ text: string; font: FontSpec; x: number }>; y: number; height: number }>;
      totalHeight: number;
      truncated: boolean;
    },
    bounds: Rect,
    color: Color
  ): void {
    const ctx = this.renderer.getContext();
    ctx.save();
    
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    for (const line of layout.lines) {
      for (const segment of line.segments) {
        this.renderer.setFont(segment.font);
        ctx.fillText(segment.text, bounds.x + segment.x, line.y);
      }
    }
    
    ctx.restore();
  }
}


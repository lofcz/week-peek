# Week Peek

[![Version](https://img.shields.io/badge/version-1.4.1-blue.svg)](https://github.com/ddcveng/week-peek)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Demo:** [edo.sh/week-peek](https://edo.sh/week-peek)

A lightweight, zero-dependency weekly schedule component built with vanilla TypeScript and Sass. Week Peek displays events in a weekly grid layout with intelligent overlap handling, day zooming, and smooth view transitions.

## Features

- **Zero dependencies**: Pure TypeScript + Sass; built with Vite
- **Mobile-first responsive**: Automatically adapts to a clean list view on mobile devices
- **Day zooming**: Click any day header to focus on that day with smooth view transitions
- **Smart event clustering**: Overlapping events are automatically arranged into lanes to prevent visual clutter
- **View Transitions API**: Smooth animations when zooming/unzooming
- **Accessibility**: ARIA labels and keyboard-accessible elements (focusable with tabindex)
- **Type-safe**: Built with TypeScript for compile-time safety
- **Event-driven**: Emits custom DOM events for event clicks and hovers
- **Highly customizable**: Custom event rendering, icon configuration, CSS theming, and more

## Zooming & Clustering

### Day Zooming

Week Peek supports focusing on a single day for detailed viewing:

- **Enter zoom mode**: Click any day header to zoom into that day
- **Navigation**: Use the previous/next day buttons to navigate between days
- **Exit zoom**: Click the "Back to week" button in the intersection cell, or click the day label in the zoomed header
- **Smooth transitions**: Uses the View Transitions API for fluid animations (with fallback for unsupported browsers)

When zoomed, the schedule shows only the selected day with larger time slots, making it easier to see event details and manage overlapping events.

### Event Clustering

When multiple events overlap in the same time slot, Week Peek automatically:

- **Arranges events into lanes**: Overlapping events are placed side-by-side in separate lanes
- **Shows overflow indicators**: When more than 3 events overlap, excess events are collapsed into a overflow indicator
- **Clusters by time**: Hidden events are grouped into clusters based on their overlapping time ranges
- **Clickable indicators**: Overflow indicators zoom into the event cluster on click

## Usage

### Basic Setup

```html
<link rel="stylesheet" href="/week-peek/style.css">
<div id="schedule-container"></div>
<script type="module">
  import { WeeklySchedule, DayOfWeek, TimeOnly } from '/week-peek/week-peek.es.js';

  const container = document.getElementById('schedule-container');
  
  const config = {
    visibleDays: [
      DayOfWeek.Monday,
      DayOfWeek.Tuesday,
      DayOfWeek.Wednesday,
      DayOfWeek.Thursday,
      DayOfWeek.Friday
    ],
    startHour: 9,
    endHour: 17
  };
  
  const events = [
    { 
      id: 'evt-1', 
      day: DayOfWeek.Monday, 
      title: 'Standup', 
      startTime: new TimeOnly(9, 0), 
      endTime: new TimeOnly(9, 30) 
    },
    { 
      id: 'evt-2', 
      day: DayOfWeek.Monday, 
      title: 'Team Meeting', 
      startTime: new TimeOnly(10, 0), 
      endTime: new TimeOnly(11, 0),
      description: 'Weekly team sync'
    }
  ];

  const result = WeeklySchedule.create(container, config, events);
  if (!result.success) {
    console.error(result.error);
    return;
  }
  
  const schedule = result.data;
</script>
```

### Container Sizing

Your container element should control the schedule's dimensions. The component fills its container (100% width/height via CSS) and automatically switches to mobile layout below 768px width.

```css
#schedule-container {
  width: 100%;
  height: 640px; /* or any desired height */
}
```

## Configuration

The `ScheduleConfig` interface accepts the following options:

### Basic Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `visibleDays` | `DayOfWeek[]` | `WORK_WEEK_DAYS` | Which days of the week to display |
| `startHour` | `Hour` (0-23) | `9` | Start hour for the time axis |
| `endHour` | `Hour` (0-23) | `17` | End hour for the time axis (must be > startHour) |
| `timeSlotInterval` | `TimeSlotInterval` | `60` | Interval between time slots (15, 30, or 60 minutes) |

### Layout Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `orientation` | `ScheduleOrientation` | `Vertical` | Layout orientation: `Vertical` (days as columns) or `Horizontal` (days as rows) |
| `eventGap` | `string \| number` | `undefined` | Gap between overlapping events in lanes (e.g., `"4px"`, `"0.5rem"`, `8`) |

### Customization

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `className` | `string` | `""` | CSS class name to apply to the root schedule element |
| `dayNameTranslations` | `DayNameTranslations` | English names | Custom day name translations for localization |
| `icons` | `IconConfig` | `undefined` | Icon configuration (see Icon Configuration below) |
| `overflowIndicatorFormat` | `(count: number) => string` | `"+N more"` | Custom formatter for overflow indicators |

### Custom Event Rendering

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `renderEvent` | `(event: ScheduleEvent, context: RenderContext) => string` | Default template | Custom function to render event HTML. Receives the event and render context (lane info, orientation, zoom state). Should return HTML string. |

### Icon Configuration

The `icons` option accepts an `IconConfig` object with the following properties:

```typescript
interface IconConfig {
  className?: string;           // CSS class for icon elements (e.g., 'material-symbols-outlined')
  zoom?: string;                 // Icon for zoom affordance (default: '🔍')
  unzoom?: string;               // Icon for unzoom affordance (default: '↺')
  cta?: string;                  // Icon for intersection CTA hint
  prevDay?: string;              // Icon for previous day button (default: '←' or '↑' based on orientation)
  nextDay?: string;              // Icon for next day button (default: '→' or '↓' based on orientation)
}
```

Icon values can be:
- Text or emoji (e.g., `'🔍'`, `'↺'`)
- Icon font class names (e.g., `'zoom_in'` for Material Symbols)
- HTML content (e.g., SVG markup: `'<svg>...</svg>'`)

**Note**: When HTML is provided, it's inserted directly into the DOM. Ensure HTML content is safe and properly formatted.

### Example: Full Configuration

```typescript
const config = {
  visibleDays: [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday],
  startHour: 8,
  endHour: 18,
  timeSlotInterval: TimeSlotInterval.ThirtyMinutes,
  orientation: ScheduleOrientation.Horizontal,
  eventGap: '4px',
  className: 'my-custom-schedule',
  dayNameTranslations: {
    [DayOfWeek.Monday]: 'Lunes',
    [DayOfWeek.Tuesday]: 'Martes',
    [DayOfWeek.Wednesday]: 'Miércoles',
    // ... rest of days
  },
  icons: {
    className: 'material-symbols-outlined',
    zoom: 'zoom_in',
    unzoom: 'close_fullscreen',
    prevDay: 'arrow_back',
    nextDay: 'arrow_forward'
  },
  overflowIndicatorFormat: (count) => `+${count} events`,
  renderEvent: (event, context) => {
    // Custom rendering logic
    return `<div class="my-event">${event.title}</div>`;
  }
};
```

## Styling

Week Peek uses CSS custom properties (variables) for theming. Override these variables to customize the appearance:

### Color Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--schedule-primary-color` | `#3b82f6` | Primary accent color (used for events, borders, highlights) |
| `--schedule-bg-color` | `#ffffff` | Background color |
| `--schedule-grid-line-color` | `#e5e7eb` | Grid line and border color |
| `--schedule-header-text-color` | `#111827` | Header and title text color |
| `--schedule-time-text-color` | `#6b7280` | Time label text color |
| `--schedule-event-text-color` | `#ffffff` | Event text color |

### Other Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--schedule-event-border-radius` | `0px` | Border radius for event blocks |
| `--schedule-font-family` | System fonts | Font family for the schedule |

### Example: Custom Theme

```css
#schedule-container {
  --schedule-primary-color: #8b5cf6;
  --schedule-bg-color: #f9fafb;
  --schedule-header-text-color: #1f2937;
  --schedule-event-border-radius: 8px;
}
```

## API Reference

### Static Methods

#### `WeeklySchedule.create(container, config, events?)`

Factory method to create a WeeklySchedule instance with validation.

**Parameters:**
- `container` (HTMLElement): DOM element where schedule will be rendered
- `config` (ScheduleConfig): Configuration options
- `events` (ScheduleEvent[]): Optional array of events (default: `[]`)

**Returns:** `Result<WeeklySchedule, Error>`

**Example:**
```typescript
const result = WeeklySchedule.create(container, config, events);
if (result.success) {
  const schedule = result.data;
} else {
  console.error(result.error);
}
```

### Instance Methods

#### `getEvents(): ScheduleEvent[]`

Returns a copy of the currently displayed events array.

#### `updateEvents(events: ScheduleEvent[]): Result<void, Error>`

Replaces all events and re-renders. Validates events before updating.

**Parameters:**
- `events` (ScheduleEvent[]): New events array

**Returns:** `Result<void, Error>`

#### `filterEvents(predicate: (event: ScheduleEvent) => boolean): Result<void, Error>`

Filters events at runtime using a predicate function. The predicate receives each event and should return `true` to keep it, `false` to remove it. Triggers a re-render on success.

**Parameters:**
- `predicate` (function): Filter function `(event: ScheduleEvent) => boolean`

**Returns:** `Result<void, Error>`

**Example:**
```typescript
// Show only events on Monday
schedule.filterEvents(event => event.day === DayOfWeek.Monday);
```

#### `clearFilter(): Result<void, Error>`

Clears any active event filtering and restores all original events.

**Returns:** `Result<void, Error>`

#### `getConfig(): ScheduleConfig`

Returns a copy of the current configuration.

#### `updateConfig(newConfig: Partial<ScheduleConfig>): Result<void, Error>`

Updates configuration and re-renders. Only provided properties are updated.

**Parameters:**
- `newConfig` (Partial<ScheduleConfig>): Partial configuration to merge

**Returns:** `Result<void, Error>`

**Example:**
```typescript
schedule.updateConfig({ 
  orientation: ScheduleOrientation.Horizontal,
  startHour: 8 
});
```

#### `zoomToDay(day: DayOfWeek): void`

Zooms into a specific day. If already zoomed to that day, does nothing.

**Parameters:**
- `day` (DayOfWeek): Day to zoom into

#### `resetZoom(): void`

Exits zoom mode and returns to the full week view.

#### `destroy(): void`

Cleans up the component, removes event listeners, and clears the container. Call this when the component is no longer needed.

### Events

Week Peek emits custom DOM events on the container element. Listen for these events to handle user interactions:

#### `schedule-event-click`

Emitted when an event (or overflow indicator) is clicked.

**Event Detail:**
```typescript
{
  event: ScheduleEvent  // The clicked event
}
```

**Example:**
```typescript
container.addEventListener('schedule-event-click', (e) => {
  const { event } = (e as CustomEvent).detail;
  console.log('Clicked:', event.id, event.title);
});
```

#### `schedule-event-hover`

Emitted when the mouse enters an event element (desktop only, not emitted on mobile).

**Event Detail:**
```typescript
{
  event: ScheduleEvent,    // The hovered event
  element: HTMLElement     // The DOM element
}
```

**Example:**
```typescript
container.addEventListener('schedule-event-hover', (e) => {
  const { event, element } = (e as CustomEvent).detail;
  element.style.outline = '2px solid #3b82f6';
});
```

#### `schedule-event-hover-end`

Emitted when the mouse leaves an event element (desktop only, not emitted on mobile).

**Event Detail:**
```typescript
{
  event: ScheduleEvent,    // The event that was hovered
  element: HTMLElement     // The DOM element
}
```

**Example:**
```typescript
container.addEventListener('schedule-event-hover-end', (e) => {
  const { element } = (e as CustomEvent).detail;
  element.style.outline = '';
});
```

## Event Data Structure

Events are represented by the `ScheduleEvent` interface:

```typescript
interface ScheduleEvent {
  id: string;                    // Unique identifier
  day: DayOfWeek;                // Day of week (0-6, Monday-Sunday)
  startTime: TimeOnly;           // Start time (hours: 0-23, minutes: 0-59)
  endTime: TimeOnly;             // End time (must be after startTime)
  title: string;                 // Event title
  description?: string;          // Optional description
  style?: string;                // Optional inline CSS styles
  className?: string;            // Optional CSS class name(s)
  metadata?: Record<string, unknown>; // Optional metadata for app use
}
```

**Example:**
```typescript
const event: ScheduleEvent = {
  id: 'meeting-1',
  day: DayOfWeek.Wednesday,
  startTime: new TimeOnly(14, 30),  // 2:30 PM
  endTime: new TimeOnly(15, 30),    // 3:30 PM
  title: 'Team Standup',
  description: 'Daily sync meeting',
  style: 'background-color: #3b82f6;',
  className: 'important-meeting',
  metadata: { room: 'Conference A', organizer: 'John Doe' }
};
```

## Production Build

```bash
npm run build
```

Outputs:
- `dist/week-peek.iife.min.js` (global `WeekPeek` namespace)
- `dist/week-peek.es.js` (ES module)
- `dist/style.css`

## License

MIT

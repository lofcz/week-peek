# Weekly Schedule Component

A lightweight, reusable weekly schedule view component built with vanilla TypeScript, Vite, and SCSS. Display recurring weekly events with a clean, responsive grid layout.

## Features

- ✨ Generic weekly schedule template (not date-specific)
- 📅 Configurable visible days (work week Mon-Fri or custom)
- ⏰ Flexible time range configuration
- 🎯 Event click detection with callbacks
- 🌍 Localization/i18n support (day name translations)
- 📱 Fully responsive (320px - 1920px)
- 🎨 Customizable theme via CSS variables
- 🚀 Zero runtime dependencies
- 📦 Tiny bundle size (<20KB gzipped)
- 🔧 TypeScript with strict mode

## Quick Start

### Prerequisites

- Node.js 18+ (LTS)
- npm or pnpm

### Installation & Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Development Server

The development server will start at `http://localhost:5173`

## Project Structure

```
src/
├── WeeklySchedule.ts         # Main component class
├── types/
│   └── index.ts              # TypeScript interfaces
├── templates/
│   ├── eventTemplate.ts      # Event HTML generation
│   ├── dayColumnTemplate.ts  # Day column generation
│   └── timeAxisTemplate.ts   # Time labels generation
├── utils/
│   ├── timeHelpers.ts        # Time parsing & formatting
│   ├── layoutHelpers.ts      # Event positioning logic
│   └── validators.ts         # Input validation
├── styles/
│   ├── main.scss             # Main styles entry
│   ├── _variables.scss       # Theme variables
│   ├── _mixins.scss          # Responsive mixins
│   ├── _schedule.scss        # Schedule grid styles
│   └── _event.scss           # Event styles
└── main.ts                   # Demo entry point
```

## Tech Stack

- **Build Tool**: Vite 5.x
- **Language**: TypeScript 5.x (strict mode)
- **Styling**: SCSS/Sass
- **Template System**: Template literal functions
- **Layout**: CSS Grid
- **Runtime**: Zero dependencies

## Usage Example (Coming Soon)

```typescript
import { WeeklySchedule } from './WeeklySchedule';
import { DayOfWeek } from './types';

const schedule = new WeeklySchedule(
  document.getElementById('container'),
  {
    events: [
      {
        id: '1',
        day: DayOfWeek.Monday,
        startTime: '10:00',
        endTime: '11:00',
        title: 'Team Meeting'
      }
    ],
    visibleDays: [
      DayOfWeek.Monday,
      DayOfWeek.Tuesday,
      DayOfWeek.Wednesday,
      DayOfWeek.Thursday,
      DayOfWeek.Friday
    ],
    onEventClick: (event) => console.log('Clicked:', event)
  }
);
```

### Localization Example

```typescript
import { DayOfWeek } from './types';

// Spanish day names
const schedule = new WeeklySchedule(container, {
  events: [...],
  dayNameTranslations: {
    [DayOfWeek.Monday]: 'Lunes',
    [DayOfWeek.Tuesday]: 'Martes',
    [DayOfWeek.Wednesday]: 'Miércoles',
    [DayOfWeek.Thursday]: 'Jueves',
    [DayOfWeek.Friday]: 'Viernes',
    [DayOfWeek.Saturday]: 'Sábado',
    [DayOfWeek.Sunday]: 'Domingo'
  }
});
```

## Documentation

- [Feature Specification](./specs/001-weekly-calendar/spec.md)
- [Technical Plan](./specs/001-weekly-calendar/plan.md)
- [Quick Start Guide](./specs/001-weekly-calendar/quickstart.md)
- [Data Model](./specs/001-weekly-calendar/data-model.md)
- [API Reference](./specs/001-weekly-calendar/contracts/component-api.md)

## Development Status

🚧 **In Development** - Phase 1 & 2 (Setup & Foundation) in progress

- [x] Project setup
- [ ] Core type definitions
- [ ] Template system
- [ ] Component implementation
- [ ] Event handling
- [ ] Responsive design
- [ ] Documentation

## Constitutional Principles

This project follows strict engineering principles:

1. **Code Simplicity**: Straightforward solutions over clever abstractions
2. **Readability First**: Clear, self-documenting code
3. **Testability**: Designed for testing with pure functions
4. **Performance Conscious**: Optimize with data, not speculation

See [Project Constitution](./specify/memory/constitution.md) for details.

## License

MIT (or your preferred license)

## Contributing

Contributions welcome! Please follow the project's constitutional principles and coding standards.

---

Built with ❤️ using Vite + TypeScript + SCSS


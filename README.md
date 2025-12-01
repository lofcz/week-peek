# Week Peek

Simple weekly schedule component with zoomable days and minimal dependencies.

## Quick Start

1) Install and run the dev server

```pwsh
npm install
npm run dev
```

2) Open the local URL printed by Vite and resize to see mobile/desktop.

## Usage (Embed)

```ts
import { WeeklySchedule } from './src/WeeklySchedule';
import { DayOfWeek, TimeOnly } from './src/types';

const container = document.getElementById('app')!;
const schedule = WeeklySchedule.create(container, {
  visibleDays: [
    DayOfWeek.Monday,
    DayOfWeek.Tuesday,
    DayOfWeek.Wednesday,
    DayOfWeek.Thursday,
    DayOfWeek.Friday,
  ],
  startHour: 9,
  endHour: 17,
}, [
  {
    id: 'evt-1',
    day: DayOfWeek.Monday,
    title: 'Standup',
    startTime: new TimeOnly(9, 0),
    endTime: new TimeOnly(9, 30),
  },
]);

if (!schedule.success) {
  console.error(schedule.error);
}
```

Ensure your container controls sizing. The component fills its container (width/height via CSS), and switches to mobile layout below the breakpoint.

## Features

- Minimal dependencies: vanilla TypeScript + Sass (plus Floating UI for tooltips); built with Vite
- Mobile-first responsive design: adapts cleanly from phone to desktop
- Zoomable days: click a day header to focus that day

## Build

```pwsh
npm run build
```

Outputs a production build via Vite.

## License

MIT
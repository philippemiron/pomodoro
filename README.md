# Pomodoro Flow 🍅

A premium, modern Pomodoro browser extension designed to optimize focus, manage breaks, and track productivity with a GitHub-style contribution graph and hourly breakdowns.

## Features

- **Dynamic Timer**: A custom-drawn circular SVG progress indicator showing elapsed/remaining session times.
- **Multiple Modes**: Support for **Work** sessions, **Short Breaks**, and **Long Breaks** with quick presets or custom minute options (up to 3 hours).
- **Cycle Progress**: Visual indicator tracking your progress through the 4-step Pomodoro cycle.
- **Productivity Analytics**:
  - **GitHub-Style Contribution Graph**: A visual representation of your focus history showing active days with color-coded intensity.
  - **Hourly Activity Heatmap**: Click on any day to view an hourly breakdown of when your Pomodoro blocks were completed.
- **Background Persistence**: Leverages Manifest V3 Service Workers, Chrome Alarms, and local storage to ensure your timer keeps ticking even when the popup is closed.
- **System Notifications & Audio Alerts**: Browser notifications to alert you when a timer finishes.

## Tech Stack & Architecture

- **Manifest V3**: Using modern service workers and Chrome extension standards.
- **Frontend**: HTML5, Vanilla CSS3 (curated dark-mode theme, smooth transitions, custom properties), and raw ES6 JavaScript.
- **Testing**: [Vitest](https://vitest.dev/) with `happy-dom` for component and DOM testing.
- **Linting & Formatting**: ESLint and Prettier.

## Project Structure

- [manifest.json](manifest.json): Configuration, permissions (storage, alarms, notifications), and paths.
- [background.js](background.js): Service worker managing state, alarms, chrome notifications, and data storage.
- `popup/`: User interface assets.
  - [popup.html](popup/popup.html): The markup structure for the extension popup.
  - [popup.css](popup/popup.css): Styling for the modern interface (layout, theme, glassmorphism, responsive grid).
  - [popup.js](popup/popup.js): Client-side logic for the popup, tracking timers, tabs, and analytics grids.
- `icons/`: Image assets for the extension icons.
- `tests/`: Vitest configuration and suite testing background, setup, and popup logic.

## Getting Started

### Installation in Chrome/Edge/Brave
1. Clone this repository:
   ```bash
   git clone git@github.com:philippemiron/pomodoro.git
   cd pomodoro
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the root directory (`pomodoro`) containing `manifest.json`.

### Installation in Firefox
1. Open Firefox and navigate to `about:debugging`.
2. Click on **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on...** under the **Temporary Extensions** section.
4. Select the [manifest.json](manifest.json) file in the root directory.

### Development & Scripts
Install dependencies:
```bash
npm install
```

Available npm scripts:
- `npm run test`: Run the tests once.
- `npm run test:watch`: Run tests in watch mode.
- `npm run lint`: Lint the codebase.
- `npm run format`: Format code with Prettier.
- `npm run check`: Run both ESLint check and Prettier format verification.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

# Repository Guidelines

## Project Structure & Module Organization
This repo is an Office Add-in (Excel task pane) with a small Node server.
- `src/commands/`: command surface HTML/TS used by the add-in ribbon.
- `src/taskpane/`: taskpane UI (`taskpane.html`, `taskpane.ts`, `taskpane.css`).
- `src/dialog/`: dialog UI entry point (`dialog.html`).
- `public/`: static assets copied into the bundle.
- `assets/` and `images.pkd`: image assets and packed image bundle.
- `server.js`: local Express server for API/dev support.
- `manifest.xml`: Office Add-in manifest (entry point for sideloading).
- `dist/`: webpack build output (generated; do not edit manually).

## Build, Test, and Development Commands
Run commands from the repo root:
- `npm run build`: production bundle via webpack.
- `npm run build:dev`: development bundle (no dev server).
- `npm run dev-server`: webpack dev server only.
- `npm run start`: runs `server.js` and webpack dev server together.
- `npm run start:excel`: sideload and launch Excel for debugging.
- `npm run stop`: stop the add-in debugging session.
- `npm run watch`: rebuild on file changes.
- `npm run validate`: validate `manifest.xml`.
- `npm run lint` / `npm run lint:fix`: Office Add-in ESLint rules.
- `npm run prettier`: apply the Office Add-in Prettier config.

## Coding Style & Naming Conventions
- TypeScript/JavaScript in `src/` with 2-space indentation and double quotes.
- Keep module names aligned with folder purpose (e.g., `taskpane.ts` for task pane logic).
- Prefer small functions and explicit Office.js async flows (`Excel.run`, `context.sync`).
- Use `office-addin-lint` and `office-addin-prettier-config` before committing.

## Testing Guidelines
There are no automated tests in this repo today.
- If you add tests, document their location and add a script in `package.json`.
- Prefer colocated tests like `src/**/__tests__/*.test.ts` or `*.spec.ts`.

## Commit & Pull Request Guidelines
- Recent commits use short, descriptive messages (often Chinese) without a strict convention.
- Keep commit subjects concise and imperative (e.g., 鈥滀紭鍖栧璇濇甯冨眬鈥?.
- PRs should include: a brief summary, testing steps (commands run), and screenshots for UI changes.
- If `manifest.xml` changes, call it out explicitly and note how to sideload.

## Security & Configuration Tips
- Do not commit secrets; configure API credentials via local environment or `.env` if introduced.
- Ensure `manifest.xml` URLs match your dev server (`https://localhost:3000` by default).

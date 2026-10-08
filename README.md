# Fadhil N Prabowo - Management Suites

Local-first project tracking for construction teams. Data is stored in this browser using localStorage; no server or login is needed. Each record is associated with its project.

## Install and run

1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Run `npm run dev` and open the local URL printed by Vite.
4. Run `npm run build` to create the static site in `dist`; `npm run preview` previews it.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In repository Settings → Pages, select **GitHub Actions** as the source.
3. The included workflow builds and deploys on pushes to `main`. The app uses hash-based routing and relative asset paths for static hosting.

## Data and backups

The first browser visit creates a removable demo project. Use Export Center to export a project workbook, project JSON, or full backup. Import a JSON backup to restore data in this browser. Browser storage is local to the browser profile; keep backups for safekeeping.

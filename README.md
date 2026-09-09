# Bodhi — a quiet habit tracker

A calm, personalizable daily/weekly habit tracker for iPhone-shaped screens. Complete your
own tasks to grow a bodhi tree over the year; past years are kept in a Grove. Data saves
to your browser automatically, with optional Google Drive sync and manual JSON export/import
as backup.

No build step, no framework, no server — plain HTML/CSS/JS, deployable to GitHub Pages.

## Run it locally

Just open `index.html` in a browser, or serve the folder with any static server, e.g.:

```
npx serve .
```

## Deploy to GitHub Pages

1. Push this repo to GitHub (see below).
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Save. GitHub gives you a URL like `https://<your-username>.github.io/<repo-name>/` within a minute or two.
5. Open that URL on your iPhone in Safari, then **Share → Add to Home Screen** to use it like an app.

## Set up Google Drive sync

Drive sync uses Google's client-side OAuth (Google Identity Services) with the restrictive
`drive.file` scope — the app can only ever see files it creates itself, never the rest of
your Drive. There's no backend and no secret key involved; the Client ID below is a public
identifier, safe to commit and safe to expose in your deployed site's source.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project
   (or use an existing one).
2. **APIs & Services → Library** — search for "Google Drive API" and click **Enable**.
3. **APIs & Services → OAuth consent screen** — choose **External**, fill in an app name and
   your email, and add your own Google account as a **test user** (this keeps the app in
   testing mode, which is fine for personal use — no Google review needed).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins**, add the exact origin(s) you'll open the app from, e.g.:
     - `https://<your-username>.github.io`
     - `http://localhost:3000` (or whatever port you use for local testing)
   - Leave "Authorized redirect URIs" empty — this flow doesn't use redirects.
5. Copy the generated **Client ID** (looks like `123-abc.apps.googleusercontent.com`).
6. Paste it into [`js/config.js`](js/config.js):

   ```js
   window.BODHI_CONFIG = {
     GOOGLE_CLIENT_ID: 'PASTE_YOUR_CLIENT_ID_HERE',
   };
   ```

7. Commit and push. Open the app, go to **Manage → Google Drive sync → Connect Google Drive**,
   and approve access. From then on, every change auto-saves to a `bodhi-state.json` file in
   your Drive a couple of seconds after you make it, and opening the app fresh (e.g. on
   another device) pulls the latest copy down automatically once you connect there too.

If you skip this setup, the app still works fully offline via the browser's local storage,
plus the manual **Export/Import backup** buttons in Manage.

## Project structure

- `index.html` — page shell and tab navigation markup
- `css/styles.css` — all visual styling (calm, dark, bodhi-inspired palette)
- `js/config.js` — your Google OAuth Client ID goes here
- `js/drive-sync.js` — Google Drive connect/sync logic
- `js/app.js` — app state, task logic, tree growth, and all screen rendering
- `manifest.webmanifest` + `icons/icon.svg` — installable PWA metadata
- `service-worker.js` — basic offline app-shell caching

## Notes on notifications

There's no real OS push notification here — that would require a backend push server and
service worker push subscription. Instead, the Today screen shows an in-app "before bed"
banner once you open the app after your chosen reminder hour (set in Manage) if tasks are
still incomplete.

## Push this to your own GitHub repo

```
git init
git add .
git commit -m "Initial commit: Bodhi habit tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

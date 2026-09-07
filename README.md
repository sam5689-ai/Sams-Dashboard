# Sam's Dashboard

A personal dashboard combining three tools in one place:

- **Meeting Scheduler** — schedule meetings with date/time, attendees, location, and notes; filter by today / upcoming / past.
- **Candidate Interview Tracker** — track candidates through a hiring pipeline (Screening → Phone Interview → Technical → Onsite → Offer → Hired/Rejected) with a kanban-style board or filtered list view.
- **Task Management** — track tasks with priority, status, due dates, and categories; click a status badge to cycle it forward.

The **Overview** tab shows at-a-glance stats plus your next meetings, active candidates, and soonest-due tasks.

## Running it

No build step or server required — it's a static site.

```bash
# from the project root
python3 -m http.server 8080
# then open http://localhost:8080
```

Or just open `index.html` directly in a browser.

## Data storage

All data is stored locally in your browser via `localStorage` — nothing leaves your machine (except meetings you explicitly sync to Google Calendar, see below). Use the **Export** button in the sidebar to download a JSON backup, and **Import** to restore it (or move data between browsers/devices).

## Importing candidates without an API

Many hiring sites (like Wuzzuf) don't offer employers a public API. The **Import Candidates** button on the Interview Tracker works around that with no API needed:

1. On the hiring site's dashboard, select the applicant table (name, role, status, contact, etc.) and copy it (or download a CSV/Excel export if one's offered).
2. Click **Import Candidates**, paste the copied data (or upload the CSV file), and click **Import**.
3. Columns are auto-detected by header name — `Name`/`Candidate`, `Role`/`Job Title`, `Status`/`Stage`, `Email`/`Phone`/`Contact`, `Interview Date`/`Applied Date`, `Interviewer`, `Rating`, `Notes` all match common variants. Status values like "Shortlisted", "Interview", "Offered", "Rejected" are mapped onto the pipeline stages automatically.
4. If no header row is recognized, the first four columns are assumed to be Name, Role, Contact, and Notes.

This works with anything copy-pasted from a webpage table, Excel, or a plain CSV — no login credentials or scraping involved, since you're just pasting data you already see on your own screen.

## Google Calendar / Google Meet sync

The Meeting Scheduler can create real Google Calendar events with an auto-generated Google Meet link, using Google's own sign-in flow directly from your browser — no backend or server-side secret involved. To enable it, you need a free OAuth Client ID from your own Google Cloud project (takes ~2 minutes):

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or pick an existing one).
2. Under **APIs & Services → Library**, enable the **Google Calendar API**.
3. Under **APIs & Services → OAuth consent screen**, set it to **External**, fill in the required fields, and add your own Google account under **Test users** (unless your project is verified).
4. Under **APIs & Services → Credentials**, click **Create Credentials → OAuth client ID**, choose **Web application**, and add an **Authorized JavaScript origin** matching wherever you'll run this dashboard from (e.g. `http://localhost:8080`, or your GitHub Pages URL).
5. Copy the generated **Client ID** (looks like `xxxxxxxxxx.apps.googleusercontent.com`).
6. In the dashboard, click **Connect Google** in the sidebar, paste the Client ID, and sign in when prompted.

Once connected, new meetings have a **"Sync to Google Calendar & add a Meet link"** checkbox (on by default while connected). Synced meetings show a *Google Calendar* badge and a **Join Google Meet** link on their card; editing keeps the linked event in sync, and deleting a synced meeting also removes it from your Google Calendar. Only comma-separated entries that look like email addresses in the Attendees field are invited on Google's side.

The Client ID is stored in `localStorage`; the OAuth access token is stored in `sessionStorage` and expires after about an hour (click **Connect Google** again to refresh it).

## Project structure

```
index.html        Page shell and layout for all views
css/styles.css     Design system (light/dark theme aware)
js/storage.js      localStorage data layer (CRUD + export/import)
js/google.js       Google Calendar/Meet OAuth + API integration
js/scheduler.js    Meeting Scheduler view logic
js/interviews.js   Interview Tracker view logic
js/tasks.js        Task Management view logic
js/app.js          Navigation, modal, toast, theme, overview stats
```

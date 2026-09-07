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

Sync also runs the other way: click **Sync from Google** on the Meeting Scheduler toolbar to pull events already on your Google Calendar (next 60 days) into the dashboard. Events already linked to a local meeting are updated in place rather than duplicated, so it's safe to click repeatedly.

Once connected, this pull sync also runs automatically — once when the dashboard loads (only if you're still signed in) and again every 15 minutes while the tab stays open — so you don't normally need to click the button yourself. The one thing that still needs a manual click: your Google sign-in token lasts about an hour and doesn't survive closing the tab, so coming back later (e.g. the next day) may need one click of **Sync from Google** (or **Connect Google**) to reconnect.

The Client ID is stored in `localStorage`; the OAuth access token is stored in `sessionStorage` and expires after about an hour (click **Connect Google** again to refresh it).

## Email-to-task (Gmail + AI)

Label an email in Gmail and it turns into a task automatically — no email forwarding or dedicated inbox needed. This is the one feature that isn't purely static: it needs one small serverless function (already included, deploys with the rest of the site on Vercel) so an AI API key never has to sit in browser-visible code.

**One-time setup:**

1. In the same Google Cloud project as Calendar, go to **APIs & Services → Library** and enable the **Gmail API**.
2. Under **OAuth consent screen → Data access**, add the Gmail scope `.../auth/gmail.modify` to the app's scope list (it's needed alongside the Calendar scope already there).
3. In Gmail, create a label called exactly **`ToDashboard`** (the dashboard will also auto-create it the first time it runs if you skip this).
4. Get an API key from [console.anthropic.com](https://console.anthropic.com/) (pay-as-you-go; parsing one email costs a fraction of a cent with the Haiku model this uses).
5. In your Vercel project settings, add an environment variable named `ANTHROPIC_API_KEY` with that key, then redeploy.
6. Back in the dashboard, click **Connect Google** again (the scope changed, so it needs a fresh sign-in) and grant the new Gmail permission.

**Using it:** apply the `ToDashboard` label to any email — a request, a reminder, a follow-up — and click **Sync from Email** on the Task Management toolbar (or just wait; it also runs automatically on load and every 15 minutes like the calendar sync). Each labeled email is read, sent to Claude to extract a title, description, due date, priority, and category, added as a new task, and then the label is removed from the email so it isn't processed twice.

This only works on the deployed Vercel site, not when running the dashboard via a plain local file server, since it needs the `/api/parse-email` function to be live.

## Inbox

The **Inbox** tab shows your 20 most recent Gmail messages (sender, subject, snippet, date, unread status) using the same Google connection as the calendar and email-to-task features — no extra setup needed once those are connected. Each email has an **Open in Gmail** link and a checkmark button that applies the `ToDashboard` label and immediately runs the email-to-task sync on it, so you can turn any inbox email into a task in one click without leaving the dashboard. A green checkmark means that email is already queued.

## Project structure

```
index.html          Page shell and layout for all views
css/styles.css       Design system (light/dark theme aware)
api/parse-email.js   Vercel serverless function: calls Claude to turn an email into a task
js/storage.js        localStorage data layer (CRUD + export/import)
js/google.js         Google OAuth (Calendar + Gmail scopes) + generic API request helper
js/gmail.js           Gmail label lookup, message fetching/decoding, label removal
js/inbox.js           Inbox view: recent emails + one-click convert to task
js/scheduler.js      Meeting Scheduler view logic
js/interviews.js     Interview Tracker view logic
js/tasks.js          Task Management view logic + email-to-task sync
js/app.js            Navigation, modal, toast, theme, overview stats, auto-sync scheduling
```

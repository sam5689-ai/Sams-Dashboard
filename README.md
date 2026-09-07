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

All data is stored locally in your browser via `localStorage` — nothing leaves your machine. Use the **Export** button in the sidebar to download a JSON backup, and **Import** to restore it (or move data between browsers/devices).

## Project structure

```
index.html        Page shell and layout for all views
css/styles.css     Design system (light/dark theme aware)
js/storage.js      localStorage data layer (CRUD + export/import)
js/scheduler.js    Meeting Scheduler view logic
js/interviews.js   Interview Tracker view logic
js/tasks.js        Task Management view logic
js/app.js          Navigation, modal, toast, theme, overview stats
```

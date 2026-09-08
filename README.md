# Sam's Dashboard

A personal CRM for running the business day-to-day — unifying WhatsApp, email, meetings, and hiring into one place:

- **Contacts** — the CRM backbone. Every person seen via a candidate record, a meeting, a labeled email, or a WhatsApp message is automatically linked into one Contact, so their communications, meetings, and tasks all show up together regardless of which channel they came through.
- **Meeting Scheduler** — schedule meetings with date/time, attendees, location, and notes; synced with Google Calendar with auto-generated Meet links; filter by today / upcoming / past.
- **Candidate Interview Tracker** — track candidates through a hiring pipeline (Screening → Phone Interview → Technical → Onsite → Offer → Hired/Rejected) with a kanban-style board or filtered list view.
- **Task Management** — track tasks with priority, status, due dates, and categories; click a status badge to cycle it forward. Tasks are also created automatically from labeled emails and WhatsApp messages.
- **Inbox** and **WhatsApp** tabs — read Gmail and see recent WhatsApp messages without leaving the dashboard.

The **Overview** tab shows at-a-glance stats plus your next meetings, active candidates, and soonest-due tasks.

## Contacts (the CRM layer)

Contacts aren't something you maintain by hand — they build themselves as you use the rest of the dashboard:

- Adding or importing a **candidate** with a contact email/phone creates or updates a Contact.
- A **labeled email** turned into a task links that task to the sender's Contact.
- A **WhatsApp message** turned into a task links that task to the sender's Contact.
- **Meetings** are matched to a Contact by attendee name (a simple text match, not a hard link).

Matching works by email or phone first; if neither matches an existing Contact, it falls back to an exact name match (so the same person showing up on a new channel — say, WhatsApp, after only ever emailing you — merges into their existing record instead of creating a duplicate). Click any Contact to see their linked candidate record, related tasks, related meetings, and recent WhatsApp messages all in one place, and to edit their name/notes.

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
2. Under **OAuth consent screen → Data access**, add the Gmail scopes `.../auth/gmail.modify` and `.../auth/gmail.send` to the app's scope list (needed alongside the Calendar scope already there — `gmail.send` powers the Inbox tab's reply/forward/compose feature below).
3. In Gmail, create a label called exactly **`ToDashboard`** (the dashboard will also auto-create it the first time it runs if you skip this).
4. Get an API key from [console.anthropic.com](https://console.anthropic.com/) (pay-as-you-go; parsing one email costs a fraction of a cent with the Haiku model this uses).
5. In your Vercel project settings, add an environment variable named `ANTHROPIC_API_KEY` with that key, then redeploy.
6. Back in the dashboard, click **Connect Google** again (the scope changed, so it needs a fresh sign-in) and grant the new Gmail permission.

**Using it:** apply the `ToDashboard` label to any email — a request, a reminder, a follow-up — and click **Sync from Email** on the Task Management toolbar (or just wait; it also runs automatically on load and every 15 minutes like the calendar sync). Each labeled email is read, sent to Claude to extract a title, description, due date, priority, and category, added as a new task, and then the label is removed from the email so it isn't processed twice.

This only works on the deployed Vercel site, not when running the dashboard via a plain local file server, since it needs the `/api/parse-email` function to be live.

## Inbox

The **Inbox** tab is a lightweight Gmail client built into the dashboard, using the same Google connection as the calendar and email-to-task features:

- **Search** — the search box accepts real Gmail search syntax (`from:sam`, `subject:invoice`, `is:unread`, etc.), scoped to your inbox.
- **Category tabs** — Primary/Promotions/Social/Updates/Forums, same as Gmail, and filtered automatically the same way: each tab is just Gmail's own `category:` search operator (`category:promotions`, etc.), so there's no guessing at what's promotional — it's whatever Gmail itself already classified. Click the **+** at the end of the tab bar to add your own tab from any Gmail search query (e.g. `label:Clients`, `from:boss@example.com`, `is:starred` — a few common ones are offered as one-click presets). Hover a custom tab for an **×** to remove it. Your tabs and last-open tab are saved locally and persist across visits.
- **Load more** — fetches the next page of results instead of being capped at 20.
- **One row per conversation** — the list is deduped by thread the way Gmail's own inbox is, instead of showing every message in a back-and-forth separately.
- **Read** — click a conversation to open it full-page (not a popup), same as clicking into a conversation in Gmail itself; a **Back to Inbox** link returns you to the list. Marks every message in it read in Gmail too, just like opening it there would.
- **Threaded conversation view** — every message in the conversation is shown stacked in order, collapsed to a one-line header (sender + snippet) except the most recent, which is expanded; click any header to expand/collapse it, matching Gmail's own conversation view.
- **Attachments** — shown as download chips under whichever message they're on; click one to fetch and save the file. Composing, replying, and forwarding all support attaching your own files too (multiple at once).
- **Reply / Reply All / Forward** — from the reader, each opens a compose modal prefilled with the right recipients, subject, and quoted original, and sends via Gmail so it threads correctly in the real conversation (using every message's Message-ID in the thread for proper `References`).
- **Compose** — the toolbar button starts a brand-new email from scratch.
- **Archive / Delete** — available both on each row and in the reader; both act on the whole conversation at once (all its messages), the same as archiving/deleting a conversation in Gmail.
- **Turn into a task** — the checkmark button (row or reader) applies the `ToDashboard` label and immediately runs the email-to-task sync on it. A green checkmark means that email is already queued.

Sending mail requires the `gmail.send` scope (see the Email-to-task setup above) — if you connected Google before this feature was added, click **Connect Google** again once to re-grant the extra permission.

## WhatsApp Inbox and WhatsApp-to-task

The **WhatsApp** tab shows recent messages sent to your WhatsApp Business number, arriving through Meta's official WhatsApp Business Cloud API. Receiving only needs a webhook; sending a reply needs a WhatsApp access token too (see **Replying** below).

Unlike email-to-task, WhatsApp messages don't automatically become tasks — you browse the messages and click **Create Task** on the ones you actually want turned into one, same idea as the Gmail Inbox tab. This avoids cluttering Tasks with every casual message.

Because a WhatsApp message can arrive while no browser tab is open (unlike the Gmail flow, which the browser polls directly), this feature needs one small piece of shared storage so the message log isn't lost: a free Redis-backed store from Vercel's Storage marketplace.

**One-time setup:**

1. **Add storage:** in your Vercel project, go to the **Storage** tab → **Create Database** → choose a Redis/KV option (Upstash-backed) → connect it to this project. This automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, depending on how Vercel labels it — the code checks both) as environment variables.
2. **Create a Meta app:** go to [developers.facebook.com](https://developers.facebook.com/), create an app (type: Business), and add the **WhatsApp** product.
3. **Add yourself as a test recipient:** in WhatsApp → API Setup, add your own phone number under the test recipients list and verify it with the OTP code sent to your phone. This lets you message the free test WhatsApp Business number Meta provides without needing full business verification.
4. **Pick a verify token:** make up any random string yourself (e.g. a UUID) — this isn't provided by Meta, you choose it. Add it to Vercel's environment variables as `WHATSAPP_VERIFY_TOKEN`, and redeploy so the webhook function can see it.
5. **Configure the webhook:** in WhatsApp → Configuration, set the **Callback URL** to `https://<your-vercel-domain>/api/whatsapp-webhook` and the **Verify token** to the same string from step 4. Click Verify and Save, then subscribe to the **messages** webhook field.
6. **Publish the app:** go to your app's **Publish** page and complete whatever it asks for (usually just a Privacy Policy URL — this repo includes a basic one at `/privacy.html` you can point it to). Real (non-test-button) webhook events are only delivered once the app is published.
7. **Subscribe the app to your WhatsApp Business Account** — this is the one step that's easy to miss and isn't automatic: configuring the Callback URL only tells the *app* where to send events, it doesn't tell your *WhatsApp Business Account* to forward messages there. Using the [Graph API Explorer](https://developers.facebook.com/tools/explorer/), with your app selected, send a **POST** request to:
   ```
   <your-whatsapp-business-account-id>/subscribed_apps
   ```
   A successful response looks like `{"success": true}`. Without this step, Meta's own "Test" button (next to each webhook field) will work, but real messages won't — which is a very confusing failure mode since everything else looks correctly configured.
8. **Test it:** from your own phone, send a WhatsApp message to the test number (e.g. "Follow up with the electrician tomorrow about the quote"). Open the dashboard's **WhatsApp** tab — within a few seconds (or up to a minute or so) the message should appear in the list. Click the checkmark button on it to turn it into a task.

Note: Meta's free test access tokens/numbers are meant for development — messages you send only work from numbers you've explicitly added as test recipients, and a test number's session details can expire, requiring you to revisit the WhatsApp API Setup page occasionally. For long-term personal use this is usually fine since it's just you messaging yourself.

The **WhatsApp** tab shows the last 50 messages received. A green checkmark means that message already has a task; clicking an unconverted one calls Claude to extract a title, description, due date, priority, and category, and links the resulting task to the sender's Contact.

### Replying

Each inbound message also has a **Reply** button. Unlike everything else in this integration, sending actually requires a WhatsApp access token — so there's one more setup step:

1. **Get an access token.** The short-lived one from the API Setup / Graph API Explorer page works but expires in a day or so. For anything longer-lived, create a **System User** in Meta Business Settings (Business Settings → Users → System Users → Add), assign it to your WhatsApp app with the `whatsapp_business_messaging` permission, and generate a token from there — these can be issued to not expire.
2. **Add two environment variables in Vercel:**
   - `WHATSAPP_ACCESS_TOKEN` — the token from step 1.
   - `WHATSAPP_PHONE_NUMBER_ID` — visible on the WhatsApp API Setup page (labeled "Phone Number ID" next to your test/business number).
3. Redeploy.

**The 24-hour rule:** WhatsApp only allows free-form (plain text) replies within 24 hours of the customer's last message. Outside that window, sending will fail with a clear explanation rather than a cryptic API error — at that point WhatsApp requires using a pre-approved message template instead, which this dashboard doesn't currently support (a future addition if needed).

## Project structure

```
index.html               Page shell and layout for all views
css/styles.css            Design system (light/dark theme aware)
api/parse-email.js            Vercel serverless function: calls Claude to turn an email into a task
api/whatsapp-webhook.js       Vercel serverless function: receives WhatsApp messages and logs them
api/whatsapp-messages.js      Vercel serverless function: returns the recent WhatsApp message log for the Inbox view
api/parse-whatsapp-message.js Vercel serverless function: calls Claude to turn one WhatsApp message into a task, on demand
api/send-whatsapp-message.js  Vercel serverless function: sends a free-form WhatsApp reply
js/storage.js                 localStorage data layer (CRUD + export/import)
js/contacts.js                Contacts CRM layer: matching/upsert logic + Contacts view
js/google.js                  Google OAuth (Calendar + Gmail scopes) + generic API request helper
js/gmail.js                   Gmail label lookup, message fetching/decoding, label removal
js/inbox.js                   Gmail Inbox view: recent emails + one-click convert to task
js/whatsapp-inbox.js          WhatsApp Inbox view: recent messages + click-to-create-task
js/scheduler.js           Meeting Scheduler view logic
js/interviews.js          Interview Tracker view logic
js/tasks.js               Task Management view logic + email-to-task sync
js/app.js                 Navigation, modal, toast, theme, overview stats, auto-sync scheduling
```

# Daymark

Daymark is a personal habit, study, wellness, and workout planner. Data is saved in the browser and can optionally sync across devices through Firebase Authentication and Cloud Firestore. Use Export in the account menu to keep a separate backup.

## Features

- **Habits:** fixed-day or flexible weekly goals, optional quantity targets, linked habit stacks, monthly streak freezes, and optional missed-habit reasons.
- **Study:** class timetable and open-gap suggestions, tagged flashcard decks and cram mode, grade projections, and assignment deadlines.
- **Google Classroom:** manually sync published coursework and due dates into the assignment list with read-only Google access.
- **Workout:** set history, estimated one-rep-max trends, progressive-overload suggestions, warm-up and plate calculations, saved routines, and body-measurement charts.
- **Learning:** dated goals with daily pace estimates, study logs, reading lists with page tracking, reading-speed estimates, and yearly page goals.
- **Journal and wellness:** daily prompts, mood calendar, weekly reflection, sleep tracking, bedtime consistency, and optional bedtime reminders.
- **Dashboard and insights:** show/hide and drag-to-reorder cards, cross-area trends, quarterly goals with weekly milestones, and a downloadable year-in-review image.

Study documents are processed locally in the browser when generating flashcards. The model is downloaded and cached the first time that feature is used.

## Enable Firebase sync

1. Create a Firebase project and register a **Web app** in the Firebase console.
2. Enable **Email/Password** and **Google** under Authentication → Sign-in method. Add your local and production domains under Authentication → Settings → Authorized domains.
3. Create a Cloud Firestore database.
4. In the project settings, copy the web app's API key, auth domain, project ID, and app ID into a local `.env.local` file using `.env.example` as the template. These are Firebase client configuration values; never add a service-account key to the web app.
5. Publish `firestore.rules` in the Firebase console (Firestore Database → Rules). The rules only allow an authenticated user to read and write their own Daymark state document.
6. Restart the Vite server. Open the account menu and choose **Sync across devices**, then sign in with Google or email/password.

When an account has no saved Daymark state, the current browser's data is uploaded. If the account already has data, the cloud copy is loaded onto the device. Changes sync while connected; when offline, they remain saved locally and can be retried after reconnecting. Sync stores the app state as one Firestore document, so very large imported collections may require a future split-storage upgrade.

Firebase sync does not connect Apple Health, Health Connect, or Xiaomi/Mi Fitness. Those require separate OAuth/API or native mobile integrations.

## Enable Google Classroom sync

1. In Google Cloud Console, select a project and enable the **Google Classroom API**.
2. Configure Google Auth Platform consent/branding and add the Classroom read-only scopes `classroom.courses.readonly` and `classroom.coursework.me.readonly`. While the app is in testing mode, add your Google account as a test user. Google may require OAuth verification before general release.
3. Create an OAuth client ID for a **Web application**. Add the exact origins where Daymark runs under **Authorized JavaScript origins** (for local development, `http://localhost:5174`; add your deployed site origin when applicable). A redirect URI is not needed for this popup flow.
4. Add `VITE_GOOGLE_CLASSROOM_CLIENT_ID=your-client-id.apps.googleusercontent.com` to `.env.local` and restart Vite. The client ID is public configuration; do not put a client secret in the browser app.
5. Open **Classes → Assignments & deadlines → Connect Google Classroom**, choose your Google account, and approve the read-only access request. Use **Sync now** to refresh assignments later.

Daymark imports published coursework from active courses, including titles and due dates. It does not submit work or change Classroom. Access tokens are kept in memory and are not saved; imported assignment details are saved with Daymark data. If a Google OAuth setup error appears, confirm that the Classroom API is enabled, the app origin matches, and your account is on the consent screen's test-user list.

## Development

```sh
npm install
npm run dev
npm test
npm run build
npm run lint
```

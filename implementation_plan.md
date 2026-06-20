# Convert CricLab to 100% Offline Capacitor Android App with SQLite

This plan details the steps to convert CricLab from a TanStack Start (SSR) web application to a fully offline, client-side React Single Page Application (SPA) running on Android via Capacitor. All backend communication (Laravel APIs, Supabase, MySQL) will be replaced by local queries using the Capacitor SQLite plugin, and settings will be persisted via Capacitor Preferences. Media files like team logos and player photos will be stored locally using the Capacitor Filesystem.

## User Review Required

> [!WARNING]
> **Conversion to Client-Only React SPA**: Since Capacitor requires static assets (`index.html` + JS/CSS bundle) to package the app into an APK, we must bypass the TanStack Start SSR/Nitro build. We will introduce a standard root `index.html` and a client-side entry point `src/main.tsx`, adjusting `src/routes/__root.tsx` to omit server-specific elements (like `<HeadContent />` and `<Scripts />`).

> [!IMPORTANT]
> **Default Admin Account**: To ensure immediate access to scoring and admin functions without backend servers, we will automatically seed a default local user account (`admin` / password `admin` or role-based login) in the SQLite database during migrations.

> [!NOTE]
> **Web Support for Development**: To keep browser-based development (`npm run dev`) working, we will configure `@capacitor-community/sqlite` with its web fallback (`jeep-sqlite`). When running in the browser, the data will persist in IndexedDB via SQL.js WASM.

## Proposed Changes

We will install Capacitor, Capacitor SQLite, Filesystem, and Preferences, define the database schema, write a unified database wrapper, and adapt the business logic services.

---

### Phase 1: Capacitor Setup & SPA Conversion

We need to add Capacitor configuration and dependencies, and configure Vite to build a standard client-only React SPA.

#### [NEW] [capacitor.config.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/capacitor.config.ts)
- Define the Capacitor configuration naming `criclab` and specifying `webDir: "dist"` for static assets.

#### [NEW] [index.html](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/index.html)
- Create the root HTML document which mounts the React SPA at `<div id="root"></div>` and references `/src/main.tsx`.

#### [NEW] [src/main.tsx](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/main.tsx)
- The client-side entry point that initializes the React DOM root, query client, and renders the RouterProvider.

#### [MODIFY] [vite.config.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/vite.config.ts)
- Replace the `@lovable.dev/vite-tanstack-config` with standard Vite React and `@tanstack/router-plugin/vite` plugins to compile static SPA files into `dist/`.
- Add optimization exclusions for `jeep-sqlite/loader`.

#### [MODIFY] [package.json](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/package.json)
- Add Capacitor dependencies:
  - `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
  - `@capacitor-community/sqlite`
  - `@capacitor/filesystem`
  - `@capacitor/preferences`
  - `jeep-sqlite`, `sql.js`, `uuid`
- Adjust build scripts if necessary to compile client-only assets.

#### [MODIFY] [src/routes/__root.tsx](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/routes/__root.tsx)
- Remove TanStack Start specific components (`HeadContent`, `Scripts`, `RootShell`) that are server-only. Render a clean layout with `<Outlet />` and the Query/Auth context providers.

---

### Phase 2: Offline SQLite Database & Statistics Engine

We will build the local SQLite database service, run migrations, and implement an automatic statistics engine that aggregates match data.

#### [NEW] [src/lib/services/sqliteService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/sqliteService.ts)
- Initialize the Capacitor SQLite connection. On web, mount the `jeep-sqlite` custom element and load the SQL.js WASM.
- Define and execute migrations to create all required tables:
  - `users`, `teams`, `players`, `matches`, `match_squads`, `innings`, `overs`, `ball_events`
  - `batting_stats`, `bowling_stats`, `fielding_stats`, `partnerships`, `fall_of_wickets`, `extras`, `match_results`, `app_settings`
- Auto-seed a default administrator user (`admin` / `admin` role, username: `admin`, phone: `1234567890`).
- Implement the statistics calculation: `recalculateMatchStats(matchId: string)`. It runs `matchEngine.replay` on raw ball events, deletes existing stats records for the match, and writes calculated data into the stats tables (`batting_stats`, `bowling_stats`, `fielding_stats`, `partnerships`, `extras`, `match_results`).

---

### Phase 3: Service Refactoring

We will rewrite each service to use local SQLite queries and filesystem operations instead of axios HTTP requests.

#### [MODIFY] [src/lib/services/authService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/authService.ts)
- Replace server routes with local queries against the SQLite `users` table.
- Maintain credentials/session details locally via Capacitor Preferences.

#### [MODIFY] [src/lib/services/teamService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/teamService.ts)
- Query/insert local `teams` records. Add support for local team logo paths in the SQLite database.

#### [MODIFY] [src/lib/services/playerService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/playerService.ts)
- Query/insert local `players` records.
- Implement `getPlayerProfile(id)` by running SQL aggregations on `batting_stats`, `bowling_stats`, `fielding_stats`, and `matches` to generate career figures (strike rate, runs, wickets, averages, economy, catches).
- Implement rankings (runs, wickets, strike rate, MVPs) using aggregations.

#### [MODIFY] [src/lib/services/matchService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/matchService.ts)
- CRUD matches in the local SQLite database.
- Read/update match squads in `match_squads`.
- Trigger `recalculateMatchStats` when ending matches.

#### [MODIFY] [src/lib/services/inningsService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/inningsService.ts)
- CRUD innings in SQLite.

#### [MODIFY] [src/lib/services/ballService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/ballService.ts)
- Insert/update/delete ball events in the SQLite database.
- Call `recalculateMatchStats` after each change.

#### [MODIFY] [src/lib/services/backupService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/backupService.ts)
- Adapt `exportBackup()` to fetch all data from all local SQLite tables and serialize them into a single JSON object.
- Adapt `importBackup()` to validate the JSON checksum and restore records to local tables, avoiding duplicates by upserting on UUIDs.

#### [MODIFY] [src/lib/services/userService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/userService.ts) & [friendService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/friendService.ts)
- Mock these services to operate locally or return mock data, as they are not needed in a standalone local app.

#### [MODIFY] [src/lib/echo.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/echo.ts)
- Remove Pusher / Echo initialization and prevent connection errors.

---

### Phase 4: Local Media & Preferences Setup

#### [NEW] [src/lib/services/mediaService.ts](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/lib/services/mediaService.ts)
- Save team logos and player photos in the device filesystem using `@capacitor/filesystem`.
- Return local device paths (e.g. `capacitor://localhost/...`) for image rendering.

#### [MODIFY] [src/routes/profile.tsx](file:///c:/Users/smitp/OneDrive/Desktop/CricLab-main/src/routes/profile.tsx) & Other UI Screens
- Adjust profile settings and app configurations to write to Capacitor Preferences.

---

## Verification Plan

### Automated Tests
- Since the environment is browser-based, we will verify the code compiles and runs using:
  `npm run dev`
- We will verify that the app successfully loads the SQL.js WASM and initializes the database.
- We will execute transactions (create players, teams, matches, scores) in the browser to ensure the SQLite schema and CRUD calculations function as expected.

### Manual Verification
- Deploy to the browser dev server and verify:
  1. The login screen accepts credentials from local users, or redirects using the seeded admin user.
  2. Creating teams and players works and persists through page reloads.
  3. Live scoring updates immediately without loading states.
  4. Undoing/editing scoring actions recalculates stats in player career profiles instantly.
  5. Backing up and restoring downloads and imports a valid JSON file.
- Finally, prepare the build (`npm run build`), initialize Android project (`npx cap add android`), and synchronize assets (`npx cap sync`) to prepare it for building the Android APK.

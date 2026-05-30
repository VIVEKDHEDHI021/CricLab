# CricLab

Local cricket management and live scoring — React (TanStack Start) frontend + Laravel API.

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | `https://vivekdhedhi021-criclab.aidocument.workers.dev` |
| API | `https://criclab-api.onrender.com` |

## Default admin login

Use the **Admin** tab (not User):

- Mobile: `9429442013`
- Password: `admin123`

After deploying the API, accounts are synced automatically via `start.sh` → `php artisan criclab:sync-admins`.

Manual repair on production: open `https://criclab-api.onrender.com/api/make-admin-manual` once.

## Local development

### API (`criclab-api`)

```bash
cd criclab-api
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate --force
php artisan criclab:sync-admins
php artisan serve
```

### Frontend (repo root)

```bash
npm install
cp .env.production .env   # or set VITE_API_URL=http://localhost:8000/api
npm run dev
```

## Deploy

- **API (Render):** Docker build from `criclab-api/` — runs migrations + `criclab:sync-admins` on start.
- **Frontend (Cloudflare Workers):** build with `VITE_API_URL` pointing at the Render API.

## Where user data is stored

All accounts live in the Laravel database (`users`, `players` tables) on the API host — not in the browser (only an auth token is stored in `localStorage`).

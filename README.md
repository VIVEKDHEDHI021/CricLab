# CricLab

Local cricket management and live scoring — React (TanStack Start) frontend + Laravel API.

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | `https://vivekdhedhi021-criclab.aidocument.workers.dev` |
| API | `https://criclab-api01.onrender.com` |

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

### API on Render (important)

In the Render dashboard for **criclab-api**, set:

| Setting | Value |
|---------|--------|
| **Root Directory** | `criclab-api` |
| **Runtime** | Docker |
| **Docker Command** | `/start.sh` |

Then **Manual Deploy** after pushing to GitHub.

Bootstrap admin (if login still fails after deploy):

- https://criclab-api01.onrender.com/api/make-admin-manual  
- or https://criclab-api01.onrender.com/make-admin-manual  

### Frontend (Cloudflare Workers)

Build with `VITE_API_URL=https://criclab-api01.onrender.com/api`

## Where user data is stored

All accounts live in the Laravel database (`users`, `players` tables) on the API host — not in the browser (only an auth token is stored in `localStorage`).

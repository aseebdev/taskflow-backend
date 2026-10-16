# TaskFlow API deployment (Vercel)

Deploy this folder as a **separate Vercel project**.

1. Import the GitHub repository again as a new Vercel project (or configure the existing `todo-um7e` project).
2. Set **Root Directory** to `server`.
3. Framework preset: **Express** (or let Vercel detect Express).
4. Add these environment variables to Production:
   - `MONGO_URI`: your MongoDB Atlas connection string, including database name `taskflow`.
   - `SESSION_SECRET`: a long random secret.
   - `CLIENT_URL`: your stable production frontend domain, e.g. `https://todo-dmgo.vercel.app`
   - Optional `CLIENT_URLS`: comma-separated extra exact origins if you need more than one frontend domain (do not include paths or trailing slashes).
   - `NODE_ENV`: `production`
5. Deploy. Keep the frontend project’s production domain assigned in Vercel → Settings → Domains; preview deployment URLs can change and should not be used as the primary `CLIENT_URL`. Test `https://YOUR-BACKEND-DOMAIN/api/health` and expect JSON with `ok: true` and `database: "connected"`.

Do not upload `server/.env` or share `MONGO_URI` / `SESSION_SECRET`.

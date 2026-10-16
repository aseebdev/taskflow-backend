# TaskFlow API deployment (Vercel)

Deploy this folder as a **separate Vercel project**.

1. Import the GitHub repository again as a new Vercel project (or configure the existing `todo-um7e` project).
2. Set **Root Directory** to `server`.
3. Framework preset: **Express** (or let Vercel detect Express).
4. Add these environment variables to Production:
   - `MONGO_URI`: your MongoDB Atlas connection string, including database name `taskflow`.
   - `SESSION_SECRET`: a long random secret.
   - `CLIENT_URL`: `https://todo-dmgo.vercel.app`
   - `NODE_ENV`: `production`
5. Deploy. Test `https://YOUR-BACKEND-DOMAIN/api/health` and expect JSON with `ok: true` and `database: "connected"`.

Do not upload `server/.env` or share `MONGO_URI` / `SESSION_SECRET`.

# Shadow Chart Web Prototype

## Backend and database

The local backend is `dev-server.cjs`.

Locally, if `DATABASE_URL` is not set, it automatically creates a SQLite database here:

```text
data/shadow-chart.sqlite
```

On Railway, connect a PostgreSQL database to the service. Railway will provide `DATABASE_URL`, and the app will create the same tables in PostgreSQL automatically.

The backend handles:

- account registration with a 6-digit email verification code
- login/logout with an HttpOnly session cookie
- password hashing with a unique salt
- saved mini readings in PostgreSQL on Railway or SQLite locally
- Resend email delivery through a server-side API endpoint

## Local run

Copy `.env.example` to `.env` and put your real Resend credentials there:

```text
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=Shadow Chart <onboarding@resend.dev>
PORT=4177
HOST=127.0.0.1
```

Then start the server:

```powershell
node .\dev-server.cjs
```

Then open:

```text
http://127.0.0.1:4177
```

Email sending and registration codes will not work when opening `index.html` directly as a file. They need the local server because the Resend API key must stay server-side.

## Railway

On Railway, set only:

```text
RESEND_API_KEY=...
RESEND_FROM_EMAIL=Shadow Chart <onboarding@resend.dev>
```

Then add a PostgreSQL database in Railway and connect it to this service so `DATABASE_URL` appears in Variables.

Do not set `HOST` on Railway. The server defaults to `0.0.0.0`, which Railway needs for public traffic.

Railway should use:

```text
npm start
```

For production, replace `onboarding@resend.dev` with a verified sender address from your own Resend domain.

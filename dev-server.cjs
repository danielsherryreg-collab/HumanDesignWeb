const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { calculateReading } = require("./services/chart-engine.cjs");

const root = path.resolve(__dirname);
const dataDir = path.join(root, "data");

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "0.0.0.0";
const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM_EMAIL || "Shadow Chart <onboarding@resend.dev>";
const sessionCookieName = "shadow_session";
const usePostgres = Boolean(process.env.DATABASE_URL);

fs.mkdirSync(dataDir, { recursive: true });

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeRow(row) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

function createDatabase() {
  if (usePostgres) {
    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
    });

    return {
      kind: "postgres",
      async init() {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
          );

          CREATE TABLE IF NOT EXISTS readings (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reading_json TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS pending_registrations (
            email TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            code_salt TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
          );

          CREATE TABLE IF NOT EXISTS login_codes (
            email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
            code_hash TEXT NOT NULL,
            code_salt TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
          );
        `);
      },
      async get(sql, params = []) {
        const result = await pool.query(toPostgresSql(sql), params);
        return normalizeRow(result.rows[0]);
      },
      async all(sql, params = []) {
        const result = await pool.query(toPostgresSql(sql), params);
        return result.rows.map(normalizeRow);
      },
      async run(sql, params = []) {
        await pool.query(toPostgresSql(sql), params);
      },
      async insertUser(name, email, passwordHash, passwordSalt) {
        const result = await pool.query(
          "INSERT INTO users (name, email, password_hash, password_salt) VALUES ($1, $2, $3, $4) RETURNING id",
          [name, email, passwordHash, passwordSalt],
        );
        return result.rows[0].id;
      },
      async close() {
        await pool.end();
      },
    };
  }

  const dbPath = process.env.SHADOW_DB_PATH || path.join(dataDir, "shadow-chart.sqlite");
  const sqlite = new DatabaseSync(dbPath);

  return {
    kind: "sqlite",
    async init() {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS readings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          reading_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pending_registrations (
          email TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          code_salt TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS login_codes (
          email TEXT PRIMARY KEY,
          code_hash TEXT NOT NULL,
          code_salt TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL,
          FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
        );
      `);
    },
    async get(sql, params = []) {
      return normalizeRow(sqlite.prepare(sql).get(...params));
    },
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...params).map(normalizeRow);
    },
    async run(sql, params = []) {
      sqlite.prepare(sql).run(...params);
    },
    async insertUser(name, email, passwordHash, passwordSalt) {
      const result = sqlite
        .prepare("INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)")
        .run(name, email, passwordHash, passwordSalt);
      return result.lastInsertRowid;
    },
    async close() {
      sqlite.close();
    },
  };
}

const db = createDatabase();
const dbReady = db.init();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(response) {
  sendJson(response, 405, { error: "Method not allowed." });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { hash, salt };
}

function hashCode(code, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");
  return { hash, salt };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.password_salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.password_hash, "hex"));
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

function setSessionCookie(response, token, expiresAt) {
  response.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at,
  };
}

async function getCurrentUser(request) {
  const token = parseCookies(request)[sessionCookieName];
  if (!token) return null;

  return db.get(
    `
      SELECT users.id, users.name, users.email, users.created_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > ?
    `,
    [token, new Date().toISOString()],
  );
}

async function requireUser(request, response) {
  const user = await getCurrentUser(request);
  if (!user) {
    sendJson(response, 401, { error: "Please log in first." });
    return null;
  }
  return user;
}

async function createSession(response, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await db.run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [token, userId, expiresAt]);
  setSessionCookie(response, token, expiresAt);
}

async function sendEmail({ to, subject, html, text }) {
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured on the server.");
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const result = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    throw new Error(result.message || "Resend could not send the email.");
  }

  return result;
}

function renderVerificationEmail(code) {
  return `
    <div style="margin: 0; padding: 32px; background: #050505; color: #efe8da; font-family: Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background: #100e0f; border: 1px solid #2b2525; border-radius: 8px;">
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 10px; color: #b9975b; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Shadow Chart</p>
            <h1 style="margin: 0 0 12px; color: #efe8da; font-size: 28px;">Verify your email</h1>
            <p style="margin: 0 0 22px; color: #c9beb0; line-height: 1.7;">Enter this code to finish creating your Shadow Chart account.</p>
            <p style="margin: 0; padding: 18px 22px; background: #050505; border: 1px solid #2b2525; border-radius: 8px; color: #b9975b; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">${escapeHtml(code)}</p>
            <p style="margin: 22px 0 0; color: #8f8579; line-height: 1.6;">This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function renderLoginCodeEmail(code) {
  return `
    <div style="margin: 0; padding: 32px; background: #050505; color: #efe8da; font-family: Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background: #100e0f; border: 1px solid #2b2525; border-radius: 8px;">
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 10px; color: #b9975b; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Shadow Chart</p>
            <h1 style="margin: 0 0 12px; color: #efe8da; font-size: 28px;">Your login code</h1>
            <p style="margin: 0 0 22px; color: #c9beb0; line-height: 1.7;">Enter this code to log in to your Shadow Chart account.</p>
            <p style="margin: 0; padding: 18px 22px; background: #050505; border: 1px solid #2b2525; border-radius: 8px; color: #b9975b; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">${escapeHtml(code)}</p>
            <p style="margin: 22px 0 0; color: #8f8579; line-height: 1.6;">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function handleRegister(request, response) {
  const { name, email, password } = await readJson(request);
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail.includes("@")) {
    sendJson(response, 400, { error: "A valid email is required." });
    return;
  }

  if (!password || String(password).length < 6) {
    sendJson(response, 400, { error: "Password should be at least 6 characters." });
    return;
  }

  const existingUser = await db.get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existingUser) {
    sendJson(response, 409, { error: "An account with this email already exists." });
    return;
  }

  const { hash, salt } = hashPassword(String(password));
  const code = String(crypto.randomInt(100000, 1000000));
  const { hash: codeHash, salt: codeSalt } = hashCode(code);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15).toISOString();
  const displayName = String(name || "Stargazer").trim() || "Stargazer";

  await db.run(
    `
      INSERT INTO pending_registrations
        (email, name, password_hash, password_salt, code_hash, code_salt, attempts, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        code_hash = excluded.code_hash,
        code_salt = excluded.code_salt,
        attempts = 0,
        created_at = CURRENT_TIMESTAMP,
        expires_at = excluded.expires_at
    `,
    [normalizedEmail, displayName, hash, salt, codeHash, codeSalt, expiresAt],
  );

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Your Shadow Chart verification code",
      html: renderVerificationEmail(code),
      text: `Your Shadow Chart verification code is ${code}. It expires in 15 minutes.`,
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
    return;
  }

  sendJson(response, 200, {
    email: normalizedEmail,
    message: "Verification code sent.",
  });
}

async function handleVerifyRegistration(request, response) {
  const { email, code } = await readJson(request);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(code || "").replace(/\D/g, "");
  const pending = await db.get("SELECT * FROM pending_registrations WHERE email = ?", [normalizedEmail]);

  if (!pending) {
    sendJson(response, 404, { error: "Verification code was not found. Please create an account again." });
    return;
  }

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await db.run("DELETE FROM pending_registrations WHERE email = ?", [normalizedEmail]);
    sendJson(response, 410, { error: "Verification code expired. Please create an account again." });
    return;
  }

  if (pending.attempts >= 5) {
    await db.run("DELETE FROM pending_registrations WHERE email = ?", [normalizedEmail]);
    sendJson(response, 429, { error: "Too many incorrect attempts. Please create an account again." });
    return;
  }

  const { hash } = hashCode(normalizedCode, pending.code_salt);
  if (hash !== pending.code_hash) {
    await db.run("UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = ?", [normalizedEmail]);
    sendJson(response, 401, { error: "Verification code is incorrect." });
    return;
  }

  const existingUser = await db.get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existingUser) {
    await db.run("DELETE FROM pending_registrations WHERE email = ?", [normalizedEmail]);
    sendJson(response, 409, { error: "An account with this email already exists." });
    return;
  }

  const userId = await db.insertUser(pending.name, pending.email, pending.password_hash, pending.password_salt);
  await db.run("DELETE FROM pending_registrations WHERE email = ?", [normalizedEmail]);

  const user = await db.get("SELECT id, name, email, created_at FROM users WHERE id = ?", [userId]);
  await createSession(response, user.id);
  sendJson(response, 201, { user: publicUser(user) });
}

async function handleLogin(request, response) {
  const { email, password } = await readJson(request);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await db.get("SELECT * FROM users WHERE email = ?", [normalizedEmail]);

  if (!user || !verifyPassword(String(password || ""), user)) {
    sendJson(response, 401, { error: "Email or password is incorrect." });
    return;
  }

  await createSession(response, user.id);
  sendJson(response, 200, {
    user: publicUser(user),
  });
}

async function handleRequestLoginCode(request, response) {
  const { email } = await readJson(request);
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail.includes("@")) {
    sendJson(response, 400, { error: "A valid email is required." });
    return;
  }

  const user = await db.get("SELECT id, email FROM users WHERE email = ?", [normalizedEmail]);
  if (!user) {
    sendJson(response, 404, { error: "No account exists for this email. Create an account first." });
    return;
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const { hash, salt } = hashCode(code);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();

  await db.run(
    `
      INSERT INTO login_codes (email, code_hash, code_salt, attempts, expires_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(email) DO UPDATE SET
        code_hash = excluded.code_hash,
        code_salt = excluded.code_salt,
        attempts = 0,
        created_at = CURRENT_TIMESTAMP,
        expires_at = excluded.expires_at
    `,
    [normalizedEmail, hash, salt, expiresAt],
  );

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Your Shadow Chart login code",
      html: renderLoginCodeEmail(code),
      text: `Your Shadow Chart login code is ${code}. It expires in 10 minutes.`,
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
    return;
  }

  sendJson(response, 200, {
    email: normalizedEmail,
    message: "Login code sent.",
  });
}

async function handleLoginWithCode(request, response) {
  const { email, code } = await readJson(request);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(code || "").replace(/\D/g, "");
  const loginCode = await db.get("SELECT * FROM login_codes WHERE email = ?", [normalizedEmail]);

  if (!loginCode) {
    sendJson(response, 404, { error: "Login code was not found. Request a new code." });
    return;
  }

  if (new Date(loginCode.expires_at).getTime() < Date.now()) {
    await db.run("DELETE FROM login_codes WHERE email = ?", [normalizedEmail]);
    sendJson(response, 410, { error: "Login code expired. Request a new code." });
    return;
  }

  if (loginCode.attempts >= 5) {
    await db.run("DELETE FROM login_codes WHERE email = ?", [normalizedEmail]);
    sendJson(response, 429, { error: "Too many incorrect attempts. Request a new code." });
    return;
  }

  const { hash } = hashCode(normalizedCode, loginCode.code_salt);
  if (hash !== loginCode.code_hash) {
    await db.run("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?", [normalizedEmail]);
    sendJson(response, 401, { error: "Login code is incorrect." });
    return;
  }

  const user = await db.get("SELECT id, name, email, created_at FROM users WHERE email = ?", [normalizedEmail]);
  if (!user) {
    await db.run("DELETE FROM login_codes WHERE email = ?", [normalizedEmail]);
    sendJson(response, 404, { error: "Account was not found. Create an account first." });
    return;
  }

  await db.run("DELETE FROM login_codes WHERE email = ?", [normalizedEmail]);
  await createSession(response, user.id);
  sendJson(response, 200, { user: publicUser(user) });
}

async function handleLogout(request, response) {
  const token = parseCookies(request)[sessionCookieName];
  if (token) await db.run("DELETE FROM sessions WHERE token = ?", [token]);
  clearSessionCookie(response);
  sendJson(response, 200, { ok: true });
}

async function handleMe(request, response) {
  sendJson(response, 200, { user: publicUser(await getCurrentUser(request)) });
}

async function handleSaveReading(request, response) {
  const user = await requireUser(request, response);
  if (!user) return;

  const { reading } = await readJson(request);
  if (!reading || !Array.isArray(reading.cards) || !reading.cards.length) {
    sendJson(response, 400, { error: "A mini reading is required." });
    return;
  }

  await db.run("INSERT INTO readings (user_id, reading_json) VALUES (?, ?)", [user.id, JSON.stringify(reading)]);
  sendJson(response, 201, { ok: true });
}

async function handleListReadings(request, response) {
  const user = await requireUser(request, response);
  if (!user) return;

  const readings = (
    await db.all("SELECT id, reading_json, created_at FROM readings WHERE user_id = ? ORDER BY id DESC", [user.id])
  ).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    ...JSON.parse(row.reading_json),
  }));

  sendJson(response, 200, { readings });
}

async function handleCalculateReading(request, response) {
  try {
    const { birthDate, birthTime, birthPlace, firstName } = await readJson(request);
    const reading = await calculateReading({
      birthDate,
      birthTime,
      birthPlace,
      firstName,
    });

    sendJson(response, 200, { reading });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Chart calculation failed." });
  }
}

function renderMiniReadingEmail(reading) {
  const title = reading.firstName ? `${escapeHtml(reading.firstName)}'s Mini Reading` : "Your Mini Reading";
  const details = [
    reading.birthDate ? `Birth date: ${escapeHtml(reading.birthDate)}` : "",
    reading.birthTime ? `Birth time: ${escapeHtml(reading.birthTime)}` : "",
    reading.birthPlace ? `Birth place: ${escapeHtml(reading.birthPlace)}` : "",
  ]
    .filter(Boolean)
    .join(" - ");

  const cards = Array.isArray(reading.cards) ? reading.cards : [];
  const cardHtml = cards
    .map(
      (card) => `
        <tr>
          <td style="padding: 18px 0; border-top: 1px solid #2b2525;">
            <h2 style="margin: 0 0 8px; color: #efe8da; font-size: 20px;">${escapeHtml(card.title)}</h2>
            <p style="margin: 0; color: #c9beb0; line-height: 1.7;">${escapeHtml(card.text)}</p>
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <div style="margin: 0; padding: 32px; background: #050505; color: #efe8da; font-family: Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; margin: 0 auto; background: #100e0f; border: 1px solid #2b2525; border-radius: 8px;">
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 10px; color: #b9975b; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Shadow Chart</p>
            <h1 style="margin: 0 0 12px; color: #efe8da; font-size: 30px;">${title}</h1>
            <p style="margin: 0 0 20px; color: #b9aea0;">${details || "Your dark astrology mini reading is ready."}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${cardHtml}
            </table>
            <p style="margin: 26px 0 0; color: #b9975b;">The full birth chart report will go deeper into shadow patterns, relationships, career energy, and life direction.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function sendMiniReadingEmail(request, response) {
  if (!resendApiKey) {
    sendJson(response, 500, {
      error: "RESEND_API_KEY is not configured on the server.",
    });
    return;
  }

  try {
    const { email, reading } = await readJson(request);

    if (!email || !String(email).includes("@")) {
      sendJson(response, 400, { error: "A valid recipient email is required." });
      return;
    }

    if (!reading || !Array.isArray(reading.cards) || !reading.cards.length) {
      sendJson(response, 400, { error: "A mini reading is required." });
      return;
    }

    const result = await sendEmail({
      to: email,
      subject: "Your Shadow Chart mini reading",
      html: renderMiniReadingEmail(reading),
      text: reading.cards.map((card) => `${card.title}\n${card.text}`).join("\n\n"),
    });

    sendJson(response, 200, {
      id: result.id,
      message: "Mini reading email sent.",
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || "Email sending failed.",
    });
  }
}

async function handleRequest(request, response) {
  await dbReady;
  const pathname = request.url.split("?")[0];

  if (pathname === "/api/auth/register") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handleRegister(request, response);
    return;
  }

  if (pathname === "/api/auth/verify") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handleVerifyRegistration(request, response);
    return;
  }

  if (pathname === "/api/auth/login") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handleLogin(request, response);
    return;
  }

  if (pathname === "/api/auth/request-login-code") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handleRequestLoginCode(request, response);
    return;
  }

  if (pathname === "/api/auth/login-code") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handleLoginWithCode(request, response);
    return;
  }

  if (pathname === "/api/auth/logout") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handleLogout(request, response);
    return;
  }

  if (pathname === "/api/me") {
    if (request.method !== "GET") return sendMethodNotAllowed(response);
    await handleMe(request, response);
    return;
  }

  if (pathname === "/api/readings") {
    if (request.method === "GET") return handleListReadings(request, response);
    if (request.method === "POST") return handleSaveReading(request, response);
    return sendMethodNotAllowed(response);
  }

  if (pathname === "/api/calculate-reading") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handleCalculateReading(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/send-mini-reading") {
    await sendMiniReadingEmail(request, response);
    return;
  }

  const rawPath = request.url === "/" ? "/index.html" : decodeURIComponent(request.url.split("?")[0]);
  const safePath = rawPath.replace(/^[/\\]+/, "");
  const filePath = path.resolve(root, safePath);

  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendJson(response, 500, { error: error.message || "Server error." });
  });
});

if (require.main === module) {
  dbReady
    .then(() => {
      server.listen(port, host, () => {
        const localUrl = host === "0.0.0.0" ? `http://127.0.0.1:${port}` : `http://${host}:${port}`;
        console.log(`Shadow Chart preview: ${localUrl}`);
        console.log(`Database: ${db.kind}`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  db,
  dbReady,
  server,
};

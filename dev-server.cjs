const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { Paddle, Environment } = require("@paddle/paddle-node-sdk");
const { calculateReading } = require("./services/chart-engine.cjs");
const { REPORT_CURRENCY, REPORT_PRICE_CENTS, buildReportInput } = require("./services/ai-report-schema.cjs");
const { generateStructuredReport } = require("./services/openai-report-generator.cjs");
const { renderFullReportPdf } = require("./services/pdf-report.cjs");

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
const reportEmailDisabled = process.env.DISABLE_REPORT_EMAIL === "true";
const sessionCookieName = "shadow_session";
const SNAPSHOT_PRODUCT_KEY = "extended-shadow-snapshot";
const FULL_REPORT_PRODUCT_KEY = "full-birth-chart-report";
const SNAPSHOT_PRICE_CENTS = 99;
const paddleWebhookSecret = process.env.PADDLE_WEBHOOK_SECRET || "";
const paddleEnv = process.env.PADDLE_ENV || "";
const paddleClientToken = process.env.PADDLE_CLIENT_TOKEN || "";
const paddleApiKey = process.env.PADDLE_API_KEY || "";
const paddleSnapshotPriceId = process.env.PADDLE_SNAPSHOT_PRICE_ID || "";
const paddleFullReportPriceId = process.env.PADDLE_FULL_REPORT_PRICE_ID || "";
const paddleIpAllowlistEnabled = process.env.PADDLE_IP_ALLOWLIST_DISABLED !== "true";
let paddleIpsCache = { expiresAt: 0, cidrs: [] };
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

          CREATE TABLE IF NOT EXISTS full_reports (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reading_id BIGINT REFERENCES readings(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            price_cents INTEGER NOT NULL DEFAULT 1999,
            currency TEXT NOT NULL DEFAULT 'USD',
            payment_provider TEXT,
            payment_reference TEXT,
            chart_json TEXT,
            prompt_json TEXT,
            report_json TEXT,
            report_html TEXT,
            pdf_path TEXT,
            error_message TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            generated_at TIMESTAMPTZ
          );

          CREATE TABLE IF NOT EXISTS product_unlocks (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reading_id BIGINT REFERENCES readings(id) ON DELETE CASCADE,
            product_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'unlocked',
            price_cents INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'USD',
            payment_provider TEXT,
            payment_reference TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, reading_id, product_key)
          );

          CREATE TABLE IF NOT EXISTS paddle_customers (
            customer_id TEXT PRIMARY KEY,
            user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
            email TEXT NOT NULL,
            name TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS paddle_subscriptions (
            subscription_id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES paddle_customers(customer_id) ON DELETE CASCADE,
            user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
            status TEXT NOT NULL,
            price_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            scheduled_change_action TEXT,
            scheduled_change_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS paddle_webhook_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            payment_reference TEXT,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            payload_json TEXT NOT NULL
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
      async insertFullReport(params) {
        const result = await pool.query(
          `
            INSERT INTO full_reports
              (user_id, reading_id, status, price_cents, currency, payment_provider, chart_json, prompt_json, report_json, report_html, error_message, updated_at, generated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
            RETURNING id
          `,
          [
            params.userId,
            params.readingId,
            params.status,
            params.priceCents,
            params.currency,
            params.paymentProvider,
            params.chartJson,
            params.promptJson,
            params.reportJson,
            params.reportHtml,
            params.errorMessage,
          ],
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

        CREATE TABLE IF NOT EXISTS full_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          reading_id INTEGER,
          status TEXT NOT NULL DEFAULT 'draft',
          price_cents INTEGER NOT NULL DEFAULT 1999,
          currency TEXT NOT NULL DEFAULT 'USD',
          payment_provider TEXT,
          payment_reference TEXT,
          chart_json TEXT,
          prompt_json TEXT,
          report_json TEXT,
          report_html TEXT,
          pdf_path TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          generated_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (reading_id) REFERENCES readings(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS product_unlocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          reading_id INTEGER,
          product_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'unlocked',
          price_cents INTEGER NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'USD',
          payment_provider TEXT,
          payment_reference TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, reading_id, product_key),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (reading_id) REFERENCES readings(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS paddle_customers (
          customer_id TEXT PRIMARY KEY,
          user_id INTEGER,
          email TEXT NOT NULL,
          name TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS paddle_subscriptions (
          subscription_id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          user_id INTEGER,
          status TEXT NOT NULL,
          price_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          scheduled_change_action TEXT,
          scheduled_change_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES paddle_customers(customer_id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS paddle_webhook_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          payment_reference TEXT,
          processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          payload_json TEXT NOT NULL
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
    async insertFullReport(params) {
      const result = sqlite
        .prepare(
          `
            INSERT INTO full_reports
              (user_id, reading_id, status, price_cents, currency, payment_provider, chart_json, prompt_json, report_json, report_html, error_message, updated_at, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
          `,
        )
        .run(
          params.userId,
          params.readingId,
          params.status,
          params.priceCents,
          params.currency,
          params.paymentProvider,
          params.chartJson,
          params.promptJson,
          params.reportJson,
          params.reportHtml,
          params.errorMessage,
          new Date().toISOString(),
        );
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

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;

    request.on("data", (chunk) => {
      chunks.push(chunk);
      length += chunk.length;
      if (length > 2_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function getPaddleSdkEnvironment() {
  if (paddleEnv === "sandbox") return Environment.sandbox;
  if (paddleEnv === "production") return Environment.production;
  throw new Error("PADDLE_ENV must be set to sandbox or production.");
}

function createPaddleClient({ requireApiKey = false } = {}) {
  if (requireApiKey && !paddleApiKey) throw new Error("PADDLE_API_KEY is not configured on the server.");
  return new Paddle(paddleApiKey || "webhook-verification-only", {
    environment: getPaddleSdkEnvironment(),
  });
}
function getPaddleConfigErrors() {
  const errors = [];

  if (!paddleEnv) errors.push("PADDLE_ENV is missing.");
  if (paddleEnv && !["sandbox", "production"].includes(paddleEnv)) errors.push("PADDLE_ENV must be sandbox or production.");
  if (!paddleClientToken) errors.push("PADDLE_CLIENT_TOKEN is missing.");
  if (!paddleSnapshotPriceId) errors.push("PADDLE_SNAPSHOT_PRICE_ID is missing.");
  if (!paddleFullReportPriceId) errors.push("PADDLE_FULL_REPORT_PRICE_ID is missing.");

  if (paddleClientToken && paddleEnv === "production" && !paddleClientToken.startsWith("live_")) {
    errors.push("PADDLE_CLIENT_TOKEN must start with live_ when PADDLE_ENV=production.");
  }
  if (paddleClientToken && paddleEnv === "sandbox" && !paddleClientToken.startsWith("test_")) {
    errors.push("PADDLE_CLIENT_TOKEN must start with test_ when PADDLE_ENV=sandbox.");
  }
  if (paddleApiKey && paddleEnv === "production" && paddleApiKey.startsWith("pdl_sdbx")) {
    errors.push("PADDLE_API_KEY looks like a sandbox key, but PADDLE_ENV=production.");
  }
  if (paddleApiKey && paddleEnv === "sandbox" && paddleApiKey.startsWith("pdl_live")) {
    errors.push("PADDLE_API_KEY looks like a live key, but PADDLE_ENV=sandbox.");
  }
  if (paddleSnapshotPriceId && !paddleSnapshotPriceId.startsWith("pri_")) errors.push("PADDLE_SNAPSHOT_PRICE_ID must be a Paddle Price ID that starts with pri_.");
  if (paddleFullReportPriceId && !paddleFullReportPriceId.startsWith("pri_")) errors.push("PADDLE_FULL_REPORT_PRICE_ID must be a Paddle Price ID that starts with pri_.");

  if (paddleEnv === "production") {
    if (!paddleApiKey) errors.push("PADDLE_API_KEY is required in production for customer portal and server-side Paddle calls.");
    if (!paddleWebhookSecret) errors.push("PADDLE_WEBHOOK_SECRET is required in production for verified webhook fulfillment.");
  }

  return errors;
}

async function unmarshalPaddleWebhook(rawBody, signatureHeader) {
  if (!paddleWebhookSecret) throw new Error("PADDLE_WEBHOOK_SECRET is not configured.");
  if (!signatureHeader) throw new Error("Paddle-Signature header is missing.");
  return createPaddleClient().webhooks.unmarshal(rawBody, paddleWebhookSecret, signatureHeader);
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

async function sendEmail({ to, subject, html, text, attachments = [] }) {
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
      ...(attachments.length ? { attachments } : {}),
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

  if (!user) {
    const pending = await db.get("SELECT email, expires_at FROM pending_registrations WHERE email = ?", [normalizedEmail]);
    if (pending) {
      sendJson(response, 403, {
        error: "Finish email verification first. Your password is saved after you enter the verification code.",
      });
      return;
    }

    sendJson(response, 401, { error: "Email or password is incorrect." });
    return;
  }

  if (!verifyPassword(String(password || ""), user)) {
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

function getRequestCountry(request) {
  const headerValue =
    request.headers["x-vercel-ip-country"] ||
    request.headers["cf-ipcountry"] ||
    request.headers["x-country-code"] ||
    "";
  const country = String(Array.isArray(headerValue) ? headerValue[0] : headerValue).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country) || country === "XX") return "";
  return country;
}
function getRequestIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const firstForwarded = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || "").split(",")[0].trim();
  const rawIp = firstForwarded || request.socket?.remoteAddress || "";
  return rawIp.replace(/^::ffff:/, "");
}

function ipv4ToNumber(ip) {
  const parts = String(ip).split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((result, part) => (result << 8) + part, 0) >>> 0;
}

function ipv4MatchesCidr(ip, cidr) {
  const [rangeIp, bitsText = "32"] = String(cidr).split("/");
  const bits = Number(bitsText);
  const ipNumber = ipv4ToNumber(ip);
  const rangeNumber = ipv4ToNumber(rangeIp);
  if (ipNumber === null || rangeNumber === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNumber & mask) === (rangeNumber & mask);
}

async function getPaddleLiveIpCidrs() {
  if (paddleIpsCache.expiresAt > Date.now() && paddleIpsCache.cidrs.length) return paddleIpsCache.cidrs;

  const response = await fetch("https://api.paddle.com/ips", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Could not fetch Paddle IP allowlist: ${response.status}`);
  const payload = await response.json();
  const cidrs = Array.isArray(payload?.data?.ipv4_cidrs) ? payload.data.ipv4_cidrs : [];
  if (!cidrs.length) throw new Error("Paddle IP allowlist response did not include data.ipv4_cidrs.");

  paddleIpsCache = { expiresAt: Date.now() + 1000 * 60 * 60, cidrs };
  return cidrs;
}

async function verifyPaddleWebhookSource(request) {
  if (paddleEnv !== "production" || !paddleIpAllowlistEnabled) return { allowed: true };
  const requestIp = getRequestIp(request);
  const cidrs = await getPaddleLiveIpCidrs();
  const allowed = cidrs.some((cidr) => ipv4MatchesCidr(requestIp, cidr));
  return { allowed, requestIp };
}

async function handlePaddleConfig(request, response) {
  const configErrors = getPaddleConfigErrors();

  if (configErrors.length) {
    sendJson(response, 500, { error: `Invalid Paddle configuration: ${configErrors.join(" ")}` });
    return;
  }

  const user = await getCurrentUser(request);
  const paddleCustomer = user
    ? await db.get("SELECT customer_id FROM paddle_customers WHERE user_id = ? OR email = ? ORDER BY updated_at DESC LIMIT 1", [
        user.id,
        String(user.email).trim().toLowerCase(),
      ])
    : null;

  sendJson(response, 200, {
    paddle: {
      environment: paddleEnv,
      clientToken: paddleClientToken,
      countryCode: getRequestCountry(request) || undefined,
      customerId: paddleCustomer?.customer_id || undefined,
      priceIds: {
        snapshot: paddleSnapshotPriceId,
        fullReport: paddleFullReportPriceId,
      },
    },
  });
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

function publicFullReport(row) {
  return {
    id: row.id,
    readingId: row.reading_id,
    status: row.status,
    priceCents: row.price_cents,
    currency: row.currency,
    generationProvider: row.payment_provider,
    errorMessage: row.error_message,
    report: row.report_json ? JSON.parse(row.report_json) : null,
    createdAt: row.created_at,
    generatedAt: row.generated_at,
  };
}

function getPdfFilename(user, reportId) {
  const emailName = String(user.email || "shadow-chart").split("@")[0].replace(/[^a-z0-9_-]+/gi, "-");
  return `shadow-chart-full-report-${emailName}-${reportId}.pdf`;
}

function renderFullReportEmail({ user, reading, report }) {
  const title = report.identity?.title || "Your Shadow Chart full report is ready";
  const summary = report.identity?.oneSentenceSummary || "Your full dark astrology report has been generated.";

  return `
    <div style="margin: 0; padding: 32px; background: #050505; color: #efe8da; font-family: Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; margin: 0 auto; background: #100e0f; border: 1px solid #2b2525; border-radius: 8px;">
        <tr>
          <td style="padding: 28px;">
            <p style="margin: 0 0 10px; color: #b9975b; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Shadow Chart</p>
            <h1 style="margin: 0 0 12px; color: #efe8da; font-size: 30px;">${escapeHtml(title)}</h1>
            <p style="margin: 0 0 18px; color: #c9beb0; line-height: 1.7;">${escapeHtml(summary)}</p>
            <p style="margin: 0 0 18px; color: #b9aea0;">Birth data: ${escapeHtml(reading.birthDate || "Unknown")} - ${escapeHtml(reading.birthTime || "Unknown")} - ${escapeHtml(reading.birthPlace || "Unknown")}</p>
            <p style="margin: 0; color: #b9975b;">Your PDF is attached to this email. You can also download it from your personal cabinet.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function sendFullReportPdfEmail({ user, reading, report, reportId }) {
  if (reportEmailDisabled) {
    return { sent: false, skipped: true, reason: "Report email delivery is disabled." };
  }

  if (!resendApiKey) {
    return { sent: false, skipped: true, reason: "RESEND_API_KEY is not configured on the server." };
  }

  const pdfBuffer = renderFullReportPdf({ user, reading, report });
  const filename = getPdfFilename(user, reportId);
  const result = await sendEmail({
    to: user.email,
    subject: report.email?.subject || "Your Shadow Chart full report is ready",
    html: renderFullReportEmail({ user, reading, report }),
    text: `${report.identity?.title || "Your Shadow Chart full report is ready"}\n\n${report.identity?.oneSentenceSummary || ""}\n\nYour PDF is attached to this email.`,
    attachments: [
      {
        filename,
        content: pdfBuffer.toString("base64"),
      },
    ],
  });

  return { sent: true, id: result.id };
}

async function handleCreateFullReport(request, response) {
  const user = await requireUser(request, response);
  if (!user) return;

  const { readingId, checkoutId } = await readJson(request);
  let readingRow = readingId
    ? await db.get("SELECT id, reading_json FROM readings WHERE id = ? AND user_id = ?", [readingId, user.id])
    : null;

  if (!readingRow) {
    readingRow = await db.get("SELECT id, reading_json FROM readings WHERE user_id = ? ORDER BY id DESC LIMIT 1", [user.id]);
  }

  if (!readingRow) {
    sendJson(response, 404, { error: "No saved mini reading was found. Generate and save a mini reading first." });
    return;
  }

  const reading = JSON.parse(readingRow.reading_json);
  const promptInput = buildReportInput({ user, reading });
  const generation = await generateStructuredReport({ user, reading, promptInput });
  const report = generation.report;
  const reportHtml = "";

  const reportId = await db.insertFullReport({
    userId: user.id,
    readingId: readingRow.id,
    status: "ready",
    priceCents: REPORT_PRICE_CENTS,
    currency: REPORT_CURRENCY,
    paymentProvider: generation.provider,
    chartJson: JSON.stringify(reading.chart || {}),
    promptJson: JSON.stringify(promptInput),
    reportJson: JSON.stringify(report),
    reportHtml,
    errorMessage: generation.errorMessage,
  });

  const saved = await db.get("SELECT * FROM full_reports WHERE id = ? AND user_id = ?", [reportId, user.id]);
  let emailDelivery = { sent: false, skipped: true, reason: "Email delivery was not attempted." };

  try {
    emailDelivery = await sendFullReportPdfEmail({ user, reading, report, reportId });
  } catch (error) {
    emailDelivery = { sent: false, skipped: false, error: error.message || "Full report email failed." };
  }

  sendJson(response, 201, { fullReport: publicFullReport(saved), emailDelivery });
}

async function handleListFullReports(request, response) {
  const user = await requireUser(request, response);
  if (!user) return;

  const reports = (
    await db.all("SELECT * FROM full_reports WHERE user_id = ? ORDER BY id DESC", [user.id])
  ).map(publicFullReport);

  sendJson(response, 200, { fullReports: reports });
}

function publicProductUnlock(row) {
  return {
    id: row.id,
    readingId: row.reading_id,
    productKey: row.product_key,
    status: row.status,
    priceCents: row.price_cents,
    currency: row.currency,
    paymentProvider: row.payment_provider,
    unlockedAt: row.unlocked_at,
  };
}

async function handleListProductUnlocks(request, response) {
  const user = await requireUser(request, response);
  if (!user) return;

  const unlocks = (
    await db.all("SELECT * FROM product_unlocks WHERE user_id = ? ORDER BY id DESC", [user.id])
  ).map(publicProductUnlock);

  sendJson(response, 200, { unlocks });
}

async function getExistingProductUnlock(userId, readingId, productKey) {
  if (readingId) {
    return db.get(
      "SELECT * FROM product_unlocks WHERE user_id = ? AND reading_id = ? AND product_key = ? ORDER BY id DESC",
      [userId, readingId, productKey],
    );
  }

  return db.get(
    "SELECT * FROM product_unlocks WHERE user_id = ? AND reading_id IS NULL AND product_key = ? ORDER BY id DESC",
    [userId, productKey],
  );
}

async function createProductUnlock({ userId, readingId, productKey, priceCents, currency = "USD", paymentReference = "" }) {
  const normalizedReadingId = readingId || null;
  const existing = await getExistingProductUnlock(userId, normalizedReadingId, productKey);

  if (!existing) {
    await db.run(
      "INSERT INTO product_unlocks (user_id, reading_id, product_key, status, price_cents, currency, payment_provider, payment_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, normalizedReadingId, productKey, "unlocked", priceCents, currency, "paddle_webhook", paymentReference],
    );
  }

  return getExistingProductUnlock(userId, normalizedReadingId, productKey);
}

function getPaddleCustomData(data) {
  return data?.customData || data?.custom_data || {};
}

function getPaddleLineItems(data) {
  return data?.items || data?.details?.lineItems || data?.details?.line_items || [];
}

function getPaddleLineItemPriceId(item) {
  return item?.price?.id || item?.priceId || item?.price_id || "";
}

function getPaddleLineItemProductId(item) {
  return item?.price?.productId || item?.price?.product_id || item?.product?.id || item?.productId || item?.product_id || "";
}

function inferPaddlePurchaseType(data) {
  const customData = getPaddleCustomData(data);
  const purchaseType = customData.purchase_type || customData.purchaseType || "";
  if (purchaseType === "snapshot") return "snapshot";
  if (purchaseType === "full-report" || purchaseType === "fullReport") return "full-report";

  const priceIds = getPaddleLineItems(data).map(getPaddleLineItemPriceId).filter(Boolean);
  if (priceIds.includes(paddleSnapshotPriceId)) return "snapshot";
  if (priceIds.includes(paddleFullReportPriceId)) return "full-report";
  return "";
}

function subscriptionGrantsPaidAccess(subscription) {
  return ["active", "trialing"].includes(String(subscription?.status || ""));
}

function getPrimarySubscriptionItem(subscription) {
  return (subscription?.items || []).find((item) => item?.price?.id || item?.priceId || item?.price_id) || subscription?.items?.[0] || {};
}

function getScheduledChange(subscription) {
  return subscription?.scheduledChange || subscription?.scheduled_change || null;
}

async function findUserIdForPaddleData(data) {
  const customData = getPaddleCustomData(data);
  const userId = customData.user_id || customData.userId || "";
  if (userId) return userId;

  const email = customData.customer_email || customData.email || data?.email || data?.customer?.email || data?.customerEmail || data?.customer_email || "";
  if (!email) return null;
  const user = await db.get("SELECT id FROM users WHERE email = ?", [String(email).trim().toLowerCase()]);
  return user?.id || null;
}

async function resolveWebhookUserAndReading(data) {
  const customData = getPaddleCustomData(data);
  const readingId = customData.reading_id || customData.readingId || "";
  const userId = customData.user_id || customData.userId || "";
  const email = customData.customer_email || customData.email || data?.email || data?.customer?.email || data?.customerEmail || data?.customer_email || "";

  if (readingId) {
    const readingRow = await db.get("SELECT id, user_id FROM readings WHERE id = ?", [readingId]);
    if (readingRow) return { userId: readingRow.user_id, readingId: readingRow.id };
  }

  if (userId) return { userId, readingId: null };

  if (email) {
    const user = await db.get("SELECT id FROM users WHERE email = ?", [String(email).trim().toLowerCase()]);
    if (user) return { userId: user.id, readingId: null };
  }

  return { userId: null, readingId: null };
}

async function upsertPaddleCustomer(customer, explicitUserId = null) {
  if (!customer?.id || !customer?.email) return null;
  const userId = explicitUserId || (await findUserIdForPaddleData(customer));
  await db.run(
    `INSERT INTO paddle_customers (customer_id, user_id, email, name, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(customer_id) DO UPDATE SET
       user_id = COALESCE(excluded.user_id, paddle_customers.user_id),
       email = excluded.email,
       name = COALESCE(excluded.name, paddle_customers.name),
       updated_at = CURRENT_TIMESTAMP`,
    [customer.id, userId || null, String(customer.email).trim().toLowerCase(), customer.name || null],
  );
  return db.get("SELECT * FROM paddle_customers WHERE customer_id = ?", [customer.id]);
}

async function ensurePaddleCustomer({ customerId, email = "", name = null, userId = null }) {
  if (!customerId) return null;
  const existing = await db.get("SELECT * FROM paddle_customers WHERE customer_id = ?", [customerId]);
  if (existing) {
    if (userId && !existing.user_id) {
      await db.run("UPDATE paddle_customers SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?", [userId, customerId]);
      return db.get("SELECT * FROM paddle_customers WHERE customer_id = ?", [customerId]);
    }
    return existing;
  }

  const normalizedEmail = email ? String(email).trim().toLowerCase() : `unknown+${customerId}@shadowchart.local`;
  await db.run(
    "INSERT INTO paddle_customers (customer_id, user_id, email, name) VALUES (?, ?, ?, ?)",
    [customerId, userId || null, normalizedEmail, name],
  );
  return db.get("SELECT * FROM paddle_customers WHERE customer_id = ?", [customerId]);
}

async function upsertPaddleSubscription(subscription) {
  if (!subscription?.id || !subscription?.customerId) return null;
  const customer = await ensurePaddleCustomer({ customerId: subscription.customerId });
  const item = getPrimarySubscriptionItem(subscription);
  const scheduledChange = getScheduledChange(subscription);
  const priceId = getPaddleLineItemPriceId(item) || "unknown";
  const productId = getPaddleLineItemProductId(item) || "unknown";

  await db.run(
    `INSERT INTO paddle_subscriptions
       (subscription_id, customer_id, user_id, status, price_id, product_id, scheduled_change_action, scheduled_change_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(subscription_id) DO UPDATE SET
       customer_id = excluded.customer_id,
       user_id = COALESCE(excluded.user_id, paddle_subscriptions.user_id),
       status = excluded.status,
       price_id = excluded.price_id,
       product_id = excluded.product_id,
       scheduled_change_action = excluded.scheduled_change_action,
       scheduled_change_at = excluded.scheduled_change_at,
       updated_at = CURRENT_TIMESTAMP`,
    [
      subscription.id,
      subscription.customerId,
      customer?.user_id || null,
      subscription.status || "unknown",
      priceId,
      productId,
      scheduledChange?.action || null,
      scheduledChange?.effectiveAt || scheduledChange?.resumeAt || null,
    ],
  );
  return db.get("SELECT * FROM paddle_subscriptions WHERE subscription_id = ?", [subscription.id]);
}

async function handlePaddleCustomerEvent(event) {
  const customer = await upsertPaddleCustomer(event.data);
  return { mirrored: Boolean(customer), customerId: customer?.customer_id || event.data?.id || null };
}

async function handlePaddleSubscriptionEvent(event) {
  const subscription = await upsertPaddleSubscription(event.data);
  return {
    mirrored: Boolean(subscription),
    subscriptionId: subscription?.subscription_id || event.data?.id || null,
    grantsAccess: subscriptionGrantsPaidAccess(subscription),
  };
}

async function handlePaddleTransactionCompleted(event) {
  const data = event.data || {};
  const customData = getPaddleCustomData(data);
  const userAndReading = await resolveWebhookUserAndReading(data);

  if (data.customerId) {
    await ensurePaddleCustomer({
      customerId: data.customerId,
      email: customData.customer_email || customData.email || "",
      userId: userAndReading.userId,
    });
  }

  const purchaseType = inferPaddlePurchaseType(data);
  const transactionId = data.id || event.notificationId || event.eventId || "";
  const currency = data.currencyCode || data.currency_code || "USD";

  if (!userAndReading.userId) return { fulfilled: false, reason: "No matching Shadow Chart user was found." };

  if (purchaseType === "snapshot") {
    const unlock = await createProductUnlock({
      userId: userAndReading.userId,
      readingId: userAndReading.readingId,
      productKey: SNAPSHOT_PRODUCT_KEY,
      priceCents: SNAPSHOT_PRICE_CENTS,
      currency,
      paymentReference: transactionId,
    });
    return { fulfilled: true, productKey: SNAPSHOT_PRODUCT_KEY, unlockId: unlock.id };
  }

  if (purchaseType === "full-report") {
    const unlock = await createProductUnlock({
      userId: userAndReading.userId,
      readingId: userAndReading.readingId,
      productKey: FULL_REPORT_PRODUCT_KEY,
      priceCents: REPORT_PRICE_CENTS,
      currency,
      paymentReference: transactionId,
    });
    return { fulfilled: true, productKey: FULL_REPORT_PRODUCT_KEY, unlockId: unlock.id };
  }

  return { fulfilled: false, reason: "Transaction completed, but purchase type was not recognized." };
}

async function routePaddleEvent(event) {
  switch (event.eventType) {
    case "customer.created":
    case "customer.updated":
      return handlePaddleCustomerEvent(event);
    case "subscription.created":
    case "subscription.updated":
    case "subscription.canceled":
      return handlePaddleSubscriptionEvent(event);
    case "transaction.completed":
      return handlePaddleTransactionCompleted(event);
    default:
      return { ignored: true, reason: `Ignored ${event.eventType || "unknown event"}.` };
  }
}

async function handlePaddleWebhook(request, response) {
  let sourceCheck;
  try {
    sourceCheck = await verifyPaddleWebhookSource(request);
  } catch (error) {
    sendJson(response, 503, { error: error.message || "Could not verify Paddle webhook source." });
    return;
  }
  if (!sourceCheck.allowed) {
    sendJson(response, 403, { error: "Webhook source IP is not in Paddle's live allowlist." });
    return;
  }

  const rawBody = await readRawBody(request);
  const signatureHeader = request.headers["paddle-signature"] || request.headers["Paddle-Signature"];

  let event;
  try {
    event = await unmarshalPaddleWebhook(rawBody, signatureHeader);
  } catch (error) {
    sendJson(response, 401, { error: error.message || "Invalid Paddle webhook signature." });
    return;
  }

  const eventId = event.eventId || event.notificationId || `${event.eventType || "event"}:${event.data?.id || crypto.randomUUID()}`;
  const eventType = event.eventType || "unknown";
  const paymentReference = event.data?.id || "";

  const existing = await db.get("SELECT event_id FROM paddle_webhook_events WHERE event_id = ?", [eventId]);
  if (existing) {
    sendJson(response, 200, { ok: true, duplicate: true });
    return;
  }

  const result = await routePaddleEvent(event);
  await db.run(
    "INSERT INTO paddle_webhook_events (event_id, event_type, payment_reference, payload_json) VALUES (?, ?, ?, ?)",
    [eventId, eventType, paymentReference, rawBody],
  );

  sendJson(response, 200, { ok: true, result });
}

async function getActivePaddleSubscriptionsForUser(userId) {
  return db.all(
    "SELECT * FROM paddle_subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY updated_at DESC",
    [userId],
  );
}

async function handlePaddlePortalSession(request, response) {
  const user = await requireUser(request, response);
  if (!user) return;

  const customer = await db.get(
    "SELECT * FROM paddle_customers WHERE user_id = ? OR email = ? ORDER BY updated_at DESC LIMIT 1",
    [user.id, String(user.email).trim().toLowerCase()],
  );

  if (!customer?.customer_id) {
    sendJson(response, 404, { error: "No Paddle customer is connected to this account yet. Make a purchase first." });
    return;
  }

  const subscriptions = await db.all(
    "SELECT * FROM paddle_subscriptions WHERE customer_id = ? ORDER BY updated_at DESC",
    [customer.customer_id],
  );
  const subscriptionIds = subscriptions.map((subscription) => subscription.subscription_id).filter(Boolean);
  const session = await createPaddleClient({ requireApiKey: true }).customerPortalSessions.create(customer.customer_id, subscriptionIds);
  const portalUrl = session?.urls?.general?.overview || session?.urls?.subscriptions?.[0]?.cancelSubscription || "";

  if (!portalUrl) {
    sendJson(response, 502, { error: "Paddle did not return a customer portal URL." });
    return;
  }

  sendJson(response, 200, {
    url: portalUrl,
    customerId: customer.customer_id,
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.subscription_id,
      status: subscription.status,
      grantsAccess: subscriptionGrantsPaidAccess(subscription),
    })),
  });
}
async function handleUnlockSnapshot(request, response) {
  const user = await requireUser(request, response);
  if (!user) return;

  const { readingId, checkoutId } = await readJson(request);
  const readingRow = readingId
    ? await db.get("SELECT id FROM readings WHERE id = ? AND user_id = ?", [readingId, user.id])
    : null;

  if (!readingRow) {
    sendJson(response, 404, { error: "Saved reading was not found." });
    return;
  }

  const existing = await db.get(
    "SELECT * FROM product_unlocks WHERE user_id = ? AND reading_id = ? AND product_key = ?",
    [user.id, readingRow.id, SNAPSHOT_PRODUCT_KEY],
  );

  if (!existing) {
    await db.run(
      "INSERT INTO product_unlocks (user_id, reading_id, product_key, status, price_cents, currency, payment_provider, payment_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [user.id, readingRow.id, SNAPSHOT_PRODUCT_KEY, "unlocked", SNAPSHOT_PRICE_CENTS, "USD", "paddle_checkout", checkoutId || "checkout-callback"],
    );
  }

  const unlock = await db.get(
    "SELECT * FROM product_unlocks WHERE user_id = ? AND reading_id = ? AND product_key = ?",
    [user.id, readingRow.id, SNAPSHOT_PRODUCT_KEY],
  );

  sendJson(response, existing ? 200 : 201, { unlock: publicProductUnlock(unlock) });
}

async function handleDownloadFullReportPdf(request, response, reportId) {
  const user = await requireUser(request, response);
  if (!user) return;

  const reportRow = await db.get("SELECT * FROM full_reports WHERE id = ? AND user_id = ?", [reportId, user.id]);
  if (!reportRow || !reportRow.report_json) {
    sendJson(response, 404, { error: "Full report was not found." });
    return;
  }

  const readingRow = reportRow.reading_id
    ? await db.get("SELECT id, reading_json FROM readings WHERE id = ? AND user_id = ?", [reportRow.reading_id, user.id])
    : null;
  const reading = readingRow ? JSON.parse(readingRow.reading_json) : {};
  const report = JSON.parse(reportRow.report_json);
  const pdfBuffer = renderFullReportPdf({ user, reading, report });

  response.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${getPdfFilename(user, reportRow.id)}"`,
    "Content-Length": pdfBuffer.length,
  });
  response.end(pdfBuffer);
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

  if (pathname === "/api/paddle/config") {
    if (request.method !== "GET") return sendMethodNotAllowed(response);
    await handlePaddleConfig(request, response);
    return;
  }

  if (pathname === "/api/paddle/webhook") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handlePaddleWebhook(request, response);
    return;
  }

  if (pathname === "/api/paddle/portal-session") {
    if (request.method !== "POST") return sendMethodNotAllowed(response);
    await handlePaddlePortalSession(request, response);
    return;
  }

  if (pathname === "/api/readings") {
    if (request.method === "GET") return handleListReadings(request, response);
    if (request.method === "POST") return handleSaveReading(request, response);
    return sendMethodNotAllowed(response);
  }

  const fullReportPdfMatch = pathname.match(/^\/api\/full-reports\/([^/]+)\/pdf$/);
  if (fullReportPdfMatch) {
    if (request.method !== "GET") return sendMethodNotAllowed(response);
    await handleDownloadFullReportPdf(request, response, fullReportPdfMatch[1]);
    return;
  }

  if (pathname === "/api/full-reports") {
    if (request.method === "GET") return handleListFullReports(request, response);
    if (request.method === "POST") return handleCreateFullReport(request, response);
    return sendMethodNotAllowed(response);
  }

  if (pathname === "/api/product-unlocks") {
    if (request.method === "GET") return handleListProductUnlocks(request, response);
    return sendMethodNotAllowed(response);
  }

  if (pathname === "/api/snapshot/unlock") {
    if (request.method === "POST") return handleUnlockSnapshot(request, response);
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

  let rawPath = request.url === "/" ? "/index.html" : decodeURIComponent(request.url.split("?")[0]);
  if (rawPath === "/welcome") rawPath = "/welcome.html";
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

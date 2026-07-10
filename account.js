const cabinetIntro = document.querySelector("#cabinet-intro");
const cabinetLogin = document.querySelector("#cabinet-login");
const cabinetContent = document.querySelector("#cabinet-content");
const cabinetList = document.querySelector("#cabinet-list");
const cabinetDetail = document.querySelector("#cabinet-detail");
const cabinetStatus = document.querySelector("#cabinet-status");
const cabinetLogout = document.querySelector("#cabinet-logout");

const state = {
  user: null,
  readings: [],
  fullReports: [],
  snapshotUnlocks: [],
  paddle: null,
  paddleReady: false,
  pendingCheckout: null,
  selectedId: null,
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function getCheckoutId(data) {
  return data?.data?.id || data?.data?.checkout?.id || data?.data?.transaction_id || data?.data?.transactionId || "";
}

async function loadPaddleConfig() {
  const { paddle } = await api("/api/paddle/config", {
    method: "GET",
    headers: {},
  });
  state.paddle = paddle;
  return paddle;
}

function handlePaddleEvent(data) {
  const eventName = String(data?.name || data?.event || "");
  if (!eventName.includes("checkout.completed") && !eventName.includes("transaction.completed")) return;
  if (!state.pendingCheckout || state.pendingCheckout.completed) return;

  state.pendingCheckout.completed = true;
  finalizePaddlePurchase(state.pendingCheckout, data).catch((error) => {
    cabinetStatus.textContent = error.message || "Paddle checkout finished, but fulfillment failed.";
  });
}

async function ensurePaddleReady() {
  const paddle = state.paddle || (await loadPaddleConfig());
  if (!paddle?.clientToken) throw new Error("PADDLE_CLIENT_TOKEN is not configured.");
  if (!window.Paddle) throw new Error("Paddle.js did not load. Refresh the page and try again.");

  if (!state.paddleReady) {
    if (paddle.environment === "sandbox") window.Paddle.Environment.set("sandbox");
    window.Paddle.Initialize({
      token: paddle.clientToken,
      eventCallback: handlePaddleEvent,
    });
    state.paddleReady = true;
  }

  return paddle;
}

async function openPaddleCheckout({ type, readingId }) {
  const paddle = await ensurePaddleReady();
  const priceId = type === "snapshot" ? paddle.priceIds?.snapshot : paddle.priceIds?.fullReport;
  if (!priceId) throw new Error(type === "snapshot" ? "PADDLE_SNAPSHOT_PRICE_ID is not configured." : "PADDLE_FULL_REPORT_PRICE_ID is not configured.");
  if (!String(priceId).startsWith("pri_")) throw new Error(`Paddle price id looks wrong: ${priceId}. Use a Price ID that starts with pri_.`);

  const environment = paddle.environment || "sandbox";
  cabinetStatus.textContent = `Opening Paddle ${environment} checkout for ${type}. Price ID: ${priceId.slice(0, 8)}...`;
  state.pendingCheckout = { type, readingId, completed: false };
  window.Paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: state.user?.email ? { email: state.user.email } : undefined,
    settings: {
      displayMode: "overlay",
      variant: "one-page",
      theme: "dark",
    },
    customData: {
      app: "shadow-chart",
      purchase_type: type,
      reading_id: String(readingId),
      user_id: state.user?.id ? String(state.user.id) : "",
      customer_email: state.user?.email || "",
    },
  });
}

async function unlockSnapshotAfterCheckout(readingId, checkoutId = "") {
  const { unlock } = await api("/api/snapshot/unlock", {
    method: "POST",
    body: JSON.stringify({ readingId, checkoutId }),
  });
  state.snapshotUnlocks = [
    unlock,
    ...state.snapshotUnlocks.filter(
      (item) => !(String(item.readingId) === String(unlock.readingId) && item.productKey === unlock.productKey),
    ),
  ];
  state.selectedId = unlock.readingId || state.selectedId;
  selectReading(state.selectedId);
  cabinetStatus.textContent = "Payment confirmed. Extended Shadow Snapshot is unlocked.";
}

async function createFullReportAfterCheckout(readingId) {
  cabinetStatus.textContent = "Payment confirmed. Generating full report and preparing PDF email...";
  const { fullReport, emailDelivery } = await api("/api/full-reports", {
    method: "POST",
    body: JSON.stringify({ readingId }),
  });
  state.fullReports = [fullReport, ...state.fullReports.filter((report) => String(report.id) !== String(fullReport.id))];
  state.selectedId = fullReport.readingId || state.selectedId;
  selectReading(state.selectedId);
  if (emailDelivery?.sent) {
    cabinetStatus.textContent = "Full report is ready. PDF was sent to your email.";
  } else if (emailDelivery?.error) {
    cabinetStatus.textContent = `Full report is ready, but email failed: ${emailDelivery.error}`;
  } else {
    cabinetStatus.textContent = `Full report is ready. ${emailDelivery?.reason || "PDF can be downloaded from the report."}`;
  }
}

async function finalizePaddlePurchase(pendingCheckout, data) {
  const checkoutId = getCheckoutId(data);
  if (pendingCheckout.type === "snapshot") {
    await unlockSnapshotAfterCheckout(pendingCheckout.readingId, checkoutId);
    return;
  }

  if (pendingCheckout.type === "full-report") {
    await createFullReportAfterCheckout(pendingCheckout.readingId);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getReadingTitle(reading) {
  return reading.firstName ? `${reading.firstName}'s Mini Reading` : "Mini Reading";
}

function renderLoginState() {
  cabinetLogin.classList.remove("is-hidden");
  cabinetContent.classList.add("is-hidden");
  cabinetLogout.classList.add("is-hidden");
  cabinetIntro.textContent = "Log in to open your saved readings.";
}

function renderReadingList() {
  if (!state.readings.length) {
    cabinetList.innerHTML = `
      <p class="empty-state">No saved readings yet. Generate a mini reading and save it to your account.</p>
      <a class="button button--ghost" href="index.html#reading">Create First Reading</a>
    `;
    return;
  }

  cabinetList.innerHTML = state.readings
    .map((reading, index) => {
      const active = String(reading.id) === String(state.selectedId) ? " is-active" : "";
      return `
        <button class="cabinet-reading-item${active}" type="button" data-reading-id="${escapeHtml(reading.id)}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHtml(getReadingTitle(reading))}</strong>
          <small>${escapeHtml(formatDate(reading.createdAt))} - ${escapeHtml(reading.birthPlace || "Birth place")}</small>
        </button>
      `;
    })
    .join("");
}

function renderChartSnapshot(reading) {
  const chart = reading.chart;
  if (!chart) return "";

  const sun = chart.planets && chart.planets.sun;
  const moon = chart.planets && chart.planets.moon;
  const venus = chart.planets && chart.planets.venus;
  const asc = chart.ascendant;

  return `
    <div class="chart-snapshot">
      <div>
        <span>Sun</span>
        <strong>${escapeHtml(sun ? `${sun.degree} deg ${sun.sign}` : "Unknown")}</strong>
      </div>
      <div>
        <span>Moon</span>
        <strong>${escapeHtml(moon ? `${moon.degree} deg ${moon.sign}` : "Unknown")}</strong>
      </div>
      <div>
        <span>Ascendant</span>
        <strong>${escapeHtml(asc ? `${asc.degree} deg ${asc.sign}` : "Unknown")}</strong>
      </div>
      <div>
        <span>Venus</span>
        <strong>${escapeHtml(venus ? `${venus.degree} deg ${venus.sign}` : "Unknown")}</strong>
      </div>
    </div>
  `;
}

function findFullReport(reading) {
  return state.fullReports.find((report) => String(report.readingId) === String(reading.id));
}

function findSnapshotUnlock(reading) {
  if (!reading) return null;
  return state.snapshotUnlocks.find(
    (unlock) => String(unlock.readingId) === String(reading.id) && unlock.productKey === "extended-shadow-snapshot",
  );
}

function isSnapshotUnlocked(reading) {
  return Boolean(findSnapshotUnlock(reading));
}

const zodiacSigns = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const zodiacGlyphs = {
  Aries: "Ar",
  Taurus: "Ta",
  Gemini: "Ge",
  Cancer: "Ca",
  Leo: "Le",
  Virgo: "Vi",
  Libra: "Li",
  Scorpio: "Sc",
  Sagittarius: "Sg",
  Capricorn: "Cp",
  Aquarius: "Aq",
  Pisces: "Pi",
};
const chartPointOrder = [
  { key: "sun", label: "Sun", meaning: "Personality core, motivation, life-force" },
  { key: "moon", label: "Moon", meaning: "Emotional world, reactions, comfort zone" },
  { key: "ascendant", label: "Ascendant", meaning: "Social mask, first impression, behavioral style" },
  { key: "mercury", label: "Mercury", meaning: "Thinking, speech, perception" },
  { key: "venus", label: "Venus", meaning: "Love style, values, attraction" },
  { key: "mars", label: "Mars", meaning: "Drive, anger, action style" },
  { key: "jupiter", label: "Jupiter", meaning: "Growth, optimism, expansion" },
  { key: "saturn", label: "Saturn", meaning: "Boundaries, discipline, life lessons" },
  { key: "uranus", label: "Uranus", meaning: "Freedom, change, individuality" },
  { key: "neptune", label: "Neptune", meaning: "Dreams, sensitivity, idealization" },
  { key: "pluto", label: "Pluto", meaning: "Depth, power, transformation" },
];

function getChartPoints(chart) {
  return chartPointOrder
    .map((point, index) => {
      const source = point.key === "ascendant" ? chart.ascendant : chart.planets?.[point.key];
      if (!source) return null;

      return {
        number: index + 1,
        label: point.label,
        meaning: point.meaning,
        longitude: source.longitude,
        sign: source.sign,
        degree: source.degree,
        house: source.house,
      };
    })
    .filter(Boolean);
}

function polarPoint(cx, cy, radius, longitude) {
  const angle = ((longitude - 90) * Math.PI) / 180;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function renderNatalChartWheel(reading, unlocked = false) {
  const chart = reading.chart;
  if (!chart?.planets) return "";

  const planets = Object.values(chart.planets);
  const chartPoints = getChartPoints(chart);
  const aspectLines = (chart.aspects || [])
    .slice(0, 18)
    .map((aspect) => {
      const from = planets.find((planet) => planet.label === aspect.from);
      const to = planets.find((planet) => planet.label === aspect.to);
      if (!from || !to) return "";
      const a = polarPoint(100, 100, 56, from.longitude);
      const b = polarPoint(100, 100, 56, to.longitude);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="natal-aspect natal-aspect--${escapeHtml(aspect.type)}" />`;
    })
    .join("");

  const signLabels = zodiacSigns
    .map((sign, index) => {
      const point = polarPoint(100, 100, 83, index * 30 + 15);
      return `<text x="${point.x}" y="${point.y}" class="natal-sign">${zodiacGlyphs[sign]}</text>`;
    })
    .join("");

  const signLines = zodiacSigns
    .map((_, index) => {
      const inner = polarPoint(100, 100, 64, index * 30);
      const outer = polarPoint(100, 100, 92, index * 30);
      return `<line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" class="natal-division" />`;
    })
    .join("");

  const houseLines = Array.from({ length: 12 })
    .map((_, index) => {
      const longitude = (chart.ascendant?.longitude || 0) + index * 30;
      const inner = polarPoint(100, 100, 35, longitude);
      const outer = polarPoint(100, 100, 64, longitude);
      return `<line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" class="natal-house" />`;
    })
    .join("");

  const planetLabels = chartPoints
    .map((chartPoint, index) => {
      const point = polarPoint(100, 100, chartPoint.label === "Ascendant" ? 68 : 52 - (index % 2) * 6, chartPoint.longitude);
      return `
        <g class="natal-planet">
          <circle cx="${point.x}" cy="${point.y}" r="4.8"></circle>
          <text x="${point.x}" y="${point.y + 1.5}">${escapeHtml(chartPoint.number)}</text>
        </g>
      `;
    })
    .join("");

  const legend = chartPoints
    .map((point) => {
      const placement = `${point.degree ?? "?"} deg ${point.sign || "Unknown"}${point.house ? `, House ${point.house}` : ""}`;
      return `
        <li>
          <strong>${point.number}. ${escapeHtml(point.label)}</strong>
          <span>${escapeHtml(placement)} - ${escapeHtml(point.meaning)}</span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="natal-chart-panel">
      <div>
        <h3>Unlock the 9-point interpretation</h3>
        <p>
          Your numbered wheel marks 11 calculated chart factors. The Snapshot focuses
          on the 9 strongest signals and translates them into a clear psychological
          interpretation.
        </p>
      </div>
      <svg class="natal-wheel" viewBox="0 0 200 200" role="img" aria-label="Calculated natal chart wheel">
        <circle cx="100" cy="100" r="92" class="natal-ring natal-ring--outer"></circle>
        <circle cx="100" cy="100" r="64" class="natal-ring"></circle>
        <circle cx="100" cy="100" r="35" class="natal-ring natal-ring--inner"></circle>
        <g>${signLines}</g>
        <g>${houseLines}</g>
        <g>${aspectLines}</g>
        <g>${planetLabels}</g>
        <g>${signLabels}</g>
      </svg>
      ${unlocked ? `<ol class="natal-legend">${legend}</ol>` : renderLockedSnapshotPanel(reading)}
    </section>
  `;
}

function renderLockedSnapshotPanel(reading) {
  return `
    <div class="snapshot-locked-panel">
      <p class="panel-kicker">Extended Shadow Snapshot</p>
      <h4>9-point interpretation is locked</h4>
      <p>
        Unlock this saved reading to open the 9 focused interpretation points beneath
        the numbered wheel.
      </p>
      <button class="button button--primary" type="button" data-unlock-snapshot="${escapeHtml(reading.id)}">
        Buy Extended Snapshot
      </button>
    </div>
  `;
}

function renderSnapshotOffer(reading, unlocked) {
  if (unlocked) {
    const unlock = findSnapshotUnlock(reading);
    return `
      <div class="snapshot-offer snapshot-offer--unlocked">
        <div>
          <p class="panel-kicker">Extended Shadow Snapshot</p>
          <h3>9-point interpretation unlocked</h3>
          <p>
            This Snapshot is already unlocked for this saved reading. The price is hidden
            because the access status is now stored on your account.
          </p>
        </div>
        <div class="snapshot-offer__status">
          <span>Purchased / Unlocked</span>
          <small>${escapeHtml(unlock?.unlockedAt ? formatDate(unlock.unlockedAt) : "Active")}</small>
        </div>
      </div>
    `;
  }

  return `
    <div class="snapshot-offer">
      <div>
        <p class="panel-kicker">Extended Shadow Snapshot</p>
        <h3>Unlock the 9-point interpretation</h3>
        <p>
          A low-risk test upgrade for this saved reading: 9 focused psychological points
          based on the numbered birth chart map.
        </p>
      </div>
      <div class="snapshot-offer__price">
        <strong>$0.99</strong>
        <button class="button button--primary" type="button" data-unlock-snapshot="${escapeHtml(reading.id)}">
          Buy / Unlock
        </button>
      </div>
    </div>
  `;
}

function renderRaveChartRenderer(report) {
  const visualData = report?.report?.humanDesign?.raveChartVisualData;
  if (!visualData) return "";

  const centersById = Object.fromEntries((visualData.centers || []).map((center) => [center.id, center]));
  const channels = (visualData.channels || [])
    .map((channel) => {
      const from = centersById[channel.fromCenter];
      const to = centersById[channel.toCenter];
      if (!from || !to) return "";
      return `<line x1="${from.position.x}" y1="${from.position.y}" x2="${to.position.x}" y2="${to.position.y}" class="${channel.active ? "is-active" : ""}" />`;
    })
    .join("");

  const centers = (visualData.centers || [])
    .map(
      (center) => `
        <g class="rave-center ${center.defined ? "is-defined" : ""}">
          <circle cx="${center.position.x}" cy="${center.position.y}" r="5.8" style="--center-color: ${escapeHtml(center.color)}"></circle>
          <text x="${center.position.x}" y="${center.position.y + 10}">${escapeHtml(center.label)}</text>
        </g>
      `,
    )
    .join("");

  const gates = (visualData.gates || [])
    .map((gate, index) => {
      const center = centersById[gate.center] || visualData.centers[index % visualData.centers.length];
      if (!center) return "";
      const angle = (index / Math.max(1, visualData.gates.length)) * Math.PI * 2;
      const x = center.position.x + Math.cos(angle) * 8;
      const y = center.position.y + Math.sin(angle) * 8;
      return `
        <g class="rave-gate">
          <circle cx="${x}" cy="${y}" r="2.8"></circle>
          <text x="${x}" y="${y + 1}">${escapeHtml(gate.label)}</text>
        </g>
      `;
    })
    .join("");

  return `
    <section class="rave-chart-panel">
      <div>
        <p class="panel-kicker">Rave chart renderer</p>
        <h3>Visual BodyGraph Layer</h3>
        <p>This preview is rendered by the website from structured JSON, not by an AI image.</p>
      </div>
      <svg class="rave-chart" viewBox="0 0 100 100" role="img" aria-label="Human Design rave chart preview">
        <defs>
          <filter id="raveGlow">
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g class="rave-channels">${channels}</g>
        <g>${centers}</g>
        <g>${gates}</g>
      </svg>
    </section>
  `;
}

function renderStructuredFullReport(report) {
  if (!report?.report) return "";

  const fullSections = report.report.fullReport?.sections || [];
  const uiCards = report.report.uiCards || [];

  return `
    <section class="structured-report">
      <div class="structured-report__header">
        <p class="panel-kicker">Structured AI report</p>
        <h3>${escapeHtml(report.report.identity?.title || "Full Report Draft")}</h3>
        <p>${escapeHtml(report.report.identity?.oneSentenceSummary || "")}</p>
        <a class="button button--ghost structured-report__download" href="/api/full-reports/${escapeHtml(report.id)}/pdf">
          Download PDF
        </a>
      </div>
      <div class="structured-ui-cards">
        ${uiCards
          .map(
            (card) => `
              <article>
                <span>${escapeHtml(card.eyebrow)}</span>
                <strong>${escapeHtml(card.title)}</strong>
                <p>${escapeHtml(card.body)}</p>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="structured-sections">
        ${fullSections
          .map(
            (section) => `
              <article>
                <span>${escapeHtml(section.id)}</span>
                <h4>${escapeHtml(section.title)}</h4>
                <p>${escapeHtml(section.body)}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderReadingDetail(reading) {
  if (!reading) {
    cabinetDetail.innerHTML = `
      <div class="cabinet-empty">
        <p class="panel-kicker">Reading preview</p>
        <h2>Select a saved reading</h2>
        <p>Choose a reading from your library to view the birth data and mini report.</p>
      </div>
    `;
    return;
  }

  const cards = Array.isArray(reading.cards) ? reading.cards : [];
  const fullReport = findFullReport(reading);
  const snapshotUnlocked = isSnapshotUnlocked(reading);

  cabinetDetail.innerHTML = `
    <div class="cabinet-detail-header cabinet-detail-header--compact">
      <a class="button button--ghost" href="index.html#full-report">Upgrade to Full Report</a>
    </div>

    <div class="birth-summary">
      <div>
        <span>Birth Date</span>
        <strong>${escapeHtml(reading.birthDate || "Unknown")}</strong>
      </div>
      <div>
        <span>Birth Time</span>
        <strong>${escapeHtml(reading.birthTime || "Unknown")}</strong>
      </div>
      <div>
        <span>Birth Place</span>
        <strong>${escapeHtml(reading.birthPlace || "Unknown")}</strong>
      </div>
      <div>
        <span>Saved</span>
        <strong>${escapeHtml(formatDate(reading.createdAt))}</strong>
      </div>
    </div>

    ${renderChartSnapshot(reading)}

    <div class="cabinet-reading-cards">
      ${cards
        .map(
          (card, index) => `
            <article class="reading-card">
              <span class="card-number">${String(index + 1).padStart(2, "0")}</span>
              <h3>${escapeHtml(card.title)}</h3>
              <p>${escapeHtml(card.text)}</p>
            </article>
          `,
        )
        .join("")}
    </div>

    <div class="full-report-offer">
      <div>
        <p class="panel-kicker">Full report</p>
        <h3>Go deeper with the complete birth chart report</h3>
        <p>
          Your mini reading is the first layer. The full report will expand this into
          shadow patterns, relationship dynamics, career energy, Human Design gates,
          and practical reflection prompts. Launch price: $19.99.
        </p>
      </div>
      <button class="button button--primary" type="button" data-create-full-report="${escapeHtml(reading.id)}">
        ${fullReport ? "Regenerate & Email PDF" : "Buy Full Report"}
      </button>
    </div>

    ${renderNatalChartWheel(reading, snapshotUnlocked)}
    ${renderSnapshotOffer(reading, snapshotUnlocked)}

    ${renderStructuredFullReport(fullReport)}
  `;
}

function selectReading(id) {
  state.selectedId = id;
  const reading = state.readings.find((item) => String(item.id) === String(id));
  renderReadingList();
  renderReadingDetail(reading);
}

async function loadCabinet() {
  try {
    cabinetStatus.textContent = "Loading your account...";
    const { user } = await api("/api/me", {
      method: "GET",
      headers: {},
    });

    if (!user) {
      renderLoginState();
      cabinetStatus.textContent = "";
      return;
    }

    state.user = user;
    const { readings } = await api("/api/readings", {
      method: "GET",
      headers: {},
    });
    const { fullReports } = await api("/api/full-reports", {
      method: "GET",
      headers: {},
    });
    const { unlocks } = await api("/api/product-unlocks", {
      method: "GET",
      headers: {},
    });
    await loadPaddleConfig();

    state.readings = readings;
    state.fullReports = fullReports;
    state.snapshotUnlocks = unlocks;
    state.selectedId = readings[0] ? readings[0].id : null;
    cabinetIntro.textContent = `${user.email} - ${readings.length} saved reading${readings.length === 1 ? "" : "s"}.`;
    cabinetLogin.classList.add("is-hidden");
    cabinetContent.classList.remove("is-hidden");
    cabinetLogout.classList.remove("is-hidden");
    renderReadingList();
    renderReadingDetail(readings[0]);
    cabinetStatus.textContent = "";
  } catch (error) {
    cabinetStatus.textContent = error.message;
    renderLoginState();
  }
}

cabinetList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-reading-id]");
  if (!button) return;
  selectReading(button.dataset.readingId);
});

cabinetDetail.addEventListener("click", async (event) => {
  const snapshotButton = event.target.closest("[data-unlock-snapshot]");
  if (snapshotButton) {
    try {
      snapshotButton.disabled = true;
      cabinetStatus.textContent = "Opening secure Paddle checkout...";
      await openPaddleCheckout({ type: "snapshot", readingId: snapshotButton.dataset.unlockSnapshot });
      snapshotButton.disabled = false;
    } catch (error) {
      cabinetStatus.textContent = error.message;
      snapshotButton.disabled = false;
    }
    return;
  }

  const button = event.target.closest("[data-create-full-report]");
  if (!button) return;

  try {
    button.disabled = true;
    const readingId = button.dataset.createFullReport;
    const reading = state.readings.find((item) => String(item.id) === String(readingId));
    const fullReport = reading ? findFullReport(reading) : null;

    if (fullReport) {
      cabinetStatus.textContent = "Regenerating full report and preparing PDF email...";
      await createFullReportAfterCheckout(readingId);
    } else {
      cabinetStatus.textContent = "Opening secure Paddle checkout...";
      await openPaddleCheckout({ type: "full-report", readingId });
      button.disabled = false;
    }
  } catch (error) {
    cabinetStatus.textContent = error.message;
    button.disabled = false;
  }
});

cabinetLogout.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } finally {
    state.user = null;
    state.readings = [];
    state.fullReports = [];
    state.snapshotUnlocks = [];
    state.paddle = null;
    state.paddleReady = false;
    state.pendingCheckout = null;
    state.selectedId = null;
    renderLoginState();
  }
});

loadCabinet();

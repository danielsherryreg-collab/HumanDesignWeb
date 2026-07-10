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
  const asc = chart.ascendant;
  const hd = chart.humanDesign;

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
        <span>Personality Sun</span>
        <strong>${escapeHtml(hd ? `Gate ${hd.personalitySun.gate}.${hd.personalitySun.line}` : "Unknown")}</strong>
      </div>
    </div>
  `;
}

function findFullReport(reading) {
  return state.fullReports.find((report) => String(report.readingId) === String(reading.id));
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
      ${renderRaveChartRenderer(report)}
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

  cabinetDetail.innerHTML = `
    <div class="cabinet-detail-header">
      <div>
        <p class="panel-kicker">Saved mini reading</p>
        <h2>${escapeHtml(getReadingTitle(reading))}</h2>
      </div>
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
          and practical reflection prompts. Launch price: $19.
        </p>
      </div>
      <button class="button button--primary" type="button" data-create-full-report="${escapeHtml(reading.id)}">
        ${fullReport ? "Regenerate & Email PDF" : "Generate Full Report"}
      </button>
    </div>

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

    state.readings = readings;
    state.fullReports = fullReports;
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
  const button = event.target.closest("[data-create-full-report]");
  if (!button) return;

  try {
    button.disabled = true;
    cabinetStatus.textContent = "Generating full report and preparing PDF email...";
    const { fullReport, emailDelivery } = await api("/api/full-reports", {
      method: "POST",
      body: JSON.stringify({ readingId: button.dataset.createFullReport }),
    });
    state.fullReports = [fullReport, ...state.fullReports.filter((report) => String(report.id) !== String(fullReport.id))];
    selectReading(state.selectedId);
    if (emailDelivery?.sent) {
      cabinetStatus.textContent = "Full report is ready. PDF was sent to your email.";
    } else if (emailDelivery?.error) {
      cabinetStatus.textContent = `Full report is ready, but email failed: ${emailDelivery.error}`;
    } else {
      cabinetStatus.textContent = `Full report is ready. ${emailDelivery?.reason || "PDF can be downloaded from the report."}`;
    }
  } catch (error) {
    cabinetStatus.textContent = error.message;
  } finally {
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
    state.selectedId = null;
    renderLoginState();
  }
});

loadCabinet();

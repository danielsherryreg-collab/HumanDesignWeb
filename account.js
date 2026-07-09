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

    state.readings = readings;
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

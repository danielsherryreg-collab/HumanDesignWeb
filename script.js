const birthForm = document.querySelector("#birth-form");
const saveNameButton = document.querySelector("#save-name");
const skipNameButton = document.querySelector("#skip-name");
const checkoutButton = document.querySelector("#go-checkout");
const readingOutput = document.querySelector("#reading-output");
const progressItems = document.querySelectorAll(".progress__item");
const miniDelivery = document.querySelector("#mini-delivery");
const deliveryStatus = document.querySelector("#delivery-status");
const saveToAccountButton = document.querySelector("#save-to-account");
const emailReportForm = document.querySelector("#email-report-form");
const reportEmailInput = document.querySelector("#report-email");
const authModal = document.querySelector("#auth-modal");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authNote = document.querySelector("#auth-note");
const authName = document.querySelector("#auth-name");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authCodeRow = document.querySelector("#auth-code-row");
const authCode = document.querySelector("#auth-code");
const authSubmit = document.querySelector("#auth-submit");
const authStatus = document.querySelector("#auth-status");
const switchAuth = document.querySelector("#switch-auth");
const closeAuth = document.querySelector("#close-auth");
const openLogin = document.querySelector("#open-login");
const openRegister = document.querySelector("#open-register");
const openAccount = document.querySelector("#open-account");
const logoutButton = document.querySelector("#logout-button");
const accountSummary = document.querySelector("#account-summary");
const savedReadings = document.querySelector("#saved-readings");

const state = {
  date: "",
  time: "",
  place: "",
  firstName: "",
  currentReading: null,
  authMode: "register",
  currentUser: null,
  savedReadings: [],
  pendingSaveAfterAuth: false,
  pendingVerificationEmail: "",
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

function setStatus(element, message) {
  element.textContent = message;
}

function setStep(step) {
  document.querySelectorAll(".step-panel").forEach((panel) => {
    panel.classList.toggle("is-visible", panel.dataset.step === step);
  });

  progressItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.progress === step);
  });
}

function getBirthMood(timeValue) {
  if (!timeValue) return "liminal";
  const hour = Number(timeValue.split(":")[0]);
  if (hour >= 5 && hour < 11) return "dawn";
  if (hour >= 11 && hour < 17) return "solar";
  if (hour >= 17 && hour < 22) return "twilight";
  return "midnight";
}

function getMiniReadingCards() {
  const name = state.firstName ? `${state.firstName}, ` : "";
  const place = state.place || "your birthplace";
  const mood = getBirthMood(state.time);

  const interpretations = {
    dawn: {
      core: "your chart carries a threshold quality: part instinct, part awakening. You are pulled toward new beginnings, but you need meaning before momentum feels natural.",
      drive: "your hidden drive is strongest when you are building something that proves your inner vision can survive daylight.",
      mirror: "you tend to attract people who ask you to choose between comfort and becoming more honest with yourself.",
    },
    solar: {
      core: "your chart reads like a pressure point between visibility and control. You are here to be seen, but not at the cost of becoming predictable.",
      drive: "your hidden drive is recognition, though you may disguise it as competence, service, or independence.",
      mirror: "relationships become mirrors for your authority: who gets to define you, and who helps you define yourself.",
    },
    twilight: {
      core: "your chart carries a liminal signature. You can sense endings before others name them, and your growth often begins where certainty dissolves.",
      drive: "your hidden drive is transformation. You move best when a chapter is ready to become something more honest.",
      mirror: "love tends to reveal where you merge too quickly, withhold too long, or mistake intensity for intimacy.",
    },
    midnight: {
      core: "your chart has a nocturnal intensity. You notice what is unsaid, and your power often comes from understanding the hidden room behind the visible one.",
      drive: "your hidden drive is depth. Surface success rarely satisfies unless it carries emotional truth or private meaning.",
      mirror: "relationships may activate your fear of being fully known, then quietly ask you to stop performing invulnerability.",
    },
    liminal: {
      core: "your chart points toward a layered inner life: intuitive, observant, and difficult to reduce to one simple role.",
      drive: "your hidden drive is coherence. You want the outside shape of your life to finally match what you sense within.",
      mirror: "relationships reveal the gap between who you protect and who you are ready to become.",
    },
  };

  const selected = interpretations[mood];

  return [
    {
      title: "Core Pattern",
      text: `${name}${selected.core}`,
    },
    {
      title: "Hidden Drive",
      text: `Born in ${place}, ${selected.drive}`,
    },
    {
      title: "Relationship Mirror",
      text: selected.mirror,
    },
  ];
}

function buildMiniReading() {
  const cards = getMiniReadingCards();

  state.currentReading = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    firstName: state.firstName,
    birthDate: state.date,
    birthTime: state.time,
    birthPlace: state.place,
    cards,
  };

  readingOutput.innerHTML = cards
    .map(
      (card, index) => `
        <article class="reading-card">
          <span class="card-number">${String(index + 1).padStart(2, "0")}</span>
          <h3>${card.title}</h3>
          <p>${card.text}</p>
        </article>
      `,
    )
    .join("");

  miniDelivery.classList.remove("is-hidden");
  setStatus(deliveryStatus, "");
}

function renderAccount() {
  const user = state.currentUser;
  const isLoggedIn = Boolean(user);

  openLogin.classList.toggle("is-hidden", isLoggedIn);
  openRegister.classList.toggle("is-hidden", isLoggedIn);
  openAccount.classList.toggle("is-hidden", !isLoggedIn);
  logoutButton.classList.toggle("is-hidden", !isLoggedIn);

  if (!isLoggedIn) {
    accountSummary.innerHTML = `
      <p class="panel-kicker">Account status</p>
      <h3>You are not logged in yet</h3>
      <p>Create an account to save this reading to your personal cabinet.</p>
      <div class="button-row">
        <button class="button button--primary" type="button" data-auth-mode="register">Create Account</button>
        <button class="button button--ghost" type="button" data-auth-mode="login">Log In</button>
      </div>
    `;
    savedReadings.innerHTML = `<p class="empty-state">Your saved mini readings will appear here.</p>`;
    return;
  }

  accountSummary.innerHTML = `
    <p class="panel-kicker">Account status</p>
    <h3>Welcome, ${user.name || "stargazer"}</h3>
    <p>${user.email}</p>
    <p>Your mini readings are saved in the site database.</p>
  `;

  if (!state.savedReadings.length) {
    savedReadings.innerHTML = `<p class="empty-state">No saved readings yet.</p>`;
    return;
  }

  savedReadings.innerHTML = state.savedReadings
    .map((reading) => {
      const date = new Date(reading.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const title = reading.firstName ? `${reading.firstName}'s Mini Reading` : "Mini Reading";
      return `
        <article class="saved-reading">
          <h4>${title}</h4>
          <p>${date} - ${reading.birthDate || "Birth date"} - ${reading.birthPlace || "Birth place"}</p>
          <p>${reading.cards[0].text}</p>
        </article>
      `;
    })
    .join("");
}

async function loadAccount() {
  try {
    const { user } = await api("/api/me", {
      method: "GET",
      headers: {},
    });
    state.currentUser = user;

    if (user) {
      const { readings } = await api("/api/readings", {
        method: "GET",
        headers: {},
      });
      state.savedReadings = readings;
    } else {
      state.savedReadings = [];
    }
  } catch {
    state.currentUser = null;
    state.savedReadings = [];
  }

  renderAccount();
}

function openAuthModal(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  const isVerify = mode === "verify";
  authModal.classList.remove("is-hidden");

  authTitle.textContent = isVerify ? "Verify Your Email" : isRegister ? "Create Account" : "Log In";
  authNote.textContent = isVerify
    ? `Enter the 6-digit code we sent to ${state.pendingVerificationEmail}.`
    : isRegister
      ? "Create your account, then confirm your email with a verification code."
      : "Log in to save this mini reading to your personal cabinet.";
  authSubmit.textContent = isVerify ? "Verify Email" : isRegister ? "Send Verification Code" : "Log In";
  switchAuth.textContent = isVerify
    ? "Use a different email"
    : isRegister
      ? "Already have an account? Log in"
      : "New here? Create account";
  authName.parentElement.classList.toggle("is-hidden", !isRegister);
  authEmail.parentElement.classList.toggle("is-hidden", isVerify);
  authPassword.parentElement.classList.toggle("is-hidden", isVerify);
  authCodeRow.classList.toggle("is-hidden", !isVerify);
  authEmail.required = !isVerify;
  authPassword.required = !isVerify;
  authCode.required = isVerify;
  authStatus.textContent = "";

  if (isVerify) {
    authCode.value = "";
    authCode.focus();
  }
}

function closeAuthModal() {
  authModal.classList.add("is-hidden");
  authForm.reset();
  authStatus.textContent = "";
}

async function register(name, email, password) {
  const result = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      password,
    }),
  });

  state.pendingVerificationEmail = result.email || email;
  openAuthModal("verify");
  setStatus(authStatus, "Verification code sent. Check your inbox.");
}

async function verifyEmail(code) {
  const { user } = await api("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({
      email: state.pendingVerificationEmail,
      code,
    }),
  });

  state.currentUser = user;
  state.pendingVerificationEmail = "";
  closeAuthModal();
  await loadAccount();
  if (state.pendingSaveAfterAuth) await saveReadingToAccount();
  document.querySelector("#account").scrollIntoView({ behavior: "smooth" });
}

async function logIn(email, password) {
  const { user } = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });

  state.currentUser = user;
  closeAuthModal();
  await loadAccount();
  if (state.pendingSaveAfterAuth) await saveReadingToAccount();
}

async function saveReadingToAccount() {
  if (!state.currentReading) {
    setStatus(deliveryStatus, "Generate your mini reading first.");
    return;
  }

  if (!state.currentUser) {
    state.pendingSaveAfterAuth = true;
    openAuthModal("register");
    setStatus(authStatus, "Create an account to save this mini reading.");
    return;
  }

  try {
    await api("/api/readings", {
      method: "POST",
      body: JSON.stringify({
        reading: state.currentReading,
      }),
    });
    state.pendingSaveAfterAuth = false;
    await loadAccount();
    setStatus(deliveryStatus, "Saved to your personal cabinet.");
    document.querySelector("#account").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    setStatus(deliveryStatus, error.message);
  }
}

async function sendReadingToEmail(email) {
  if (!state.currentReading) {
    setStatus(deliveryStatus, "Generate your mini reading first.");
    return;
  }

  if (!email) {
    setStatus(deliveryStatus, "Enter an email address first.");
    return;
  }

  setStatus(deliveryStatus, "Sending your mini reading...");

  try {
    const result = await api("/api/send-mini-reading", {
      method: "POST",
      body: JSON.stringify({
        email,
        reading: state.currentReading,
      }),
    });

    setStatus(deliveryStatus, `Sent to ${email}. Email id: ${result.id || "created"}.`);
  } catch (error) {
    setStatus(deliveryStatus, error.message);
  }
}

birthForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.date = document.querySelector("#birth-date").value;
  state.time = document.querySelector("#birth-time").value;
  state.place = document.querySelector("#birth-place").value.trim();
  setStep("name");
});

saveNameButton.addEventListener("click", () => {
  state.firstName = document.querySelector("#first-name").value.trim();
  buildMiniReading();
  setStep("mini");
  document.querySelector("#reading").scrollIntoView({ behavior: "smooth" });
});

skipNameButton.addEventListener("click", () => {
  state.firstName = "";
  buildMiniReading();
  setStep("mini");
  document.querySelector("#reading").scrollIntoView({ behavior: "smooth" });
});

checkoutButton.addEventListener("click", () => {
  progressItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.progress === "full");
  });
  document.querySelector("#checkout").scrollIntoView({ behavior: "smooth" });
});

saveToAccountButton.addEventListener("click", saveReadingToAccount);

emailReportForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendReadingToEmail(reportEmailInput.value.trim());
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value;

  if (state.authMode !== "verify" && password.length < 6) {
    setStatus(authStatus, "Password should be at least 6 characters.");
    return;
  }

  try {
    authSubmit.disabled = true;
    setStatus(authStatus, "One moment...");

    if (state.authMode === "verify") {
      await verifyEmail(authCode.value.trim());
    } else if (state.authMode === "register") {
      await register(authName.value.trim(), email, password);
    } else {
      await logIn(email, password);
    }
  } catch (error) {
    setStatus(authStatus, error.message);
  } finally {
    authSubmit.disabled = false;
  }
});

switchAuth.addEventListener("click", () => {
  if (state.authMode === "verify") {
    state.pendingVerificationEmail = "";
    openAuthModal("register");
    return;
  }

  openAuthModal(state.authMode === "register" ? "login" : "register");
});

closeAuth.addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (event) => {
  if (event.target === authModal) closeAuthModal();
});

openLogin.addEventListener("click", () => openAuthModal("login"));
openRegister.addEventListener("click", () => openAuthModal("register"));
openAccount.addEventListener("click", () => {
  document.querySelector("#account").scrollIntoView({ behavior: "smooth" });
});
logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } finally {
    state.currentUser = null;
    state.savedReadings = [];
    renderAccount();
  }
});

document.addEventListener("click", (event) => {
  const authTrigger = event.target.closest("[data-auth-mode]");
  if (authTrigger) openAuthModal(authTrigger.dataset.authMode);
});

document.querySelectorAll("[data-scroll-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scrollTarget);
    if (target) target.scrollIntoView({ behavior: "smooth" });
  });
});

loadAccount();

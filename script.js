const birthForm = document.querySelector("#birth-form");
const saveNameButton = document.querySelector("#save-name");
const skipNameButton = document.querySelector("#skip-name");
const checkoutButton = document.querySelector("#go-checkout");
const readingOutput = document.querySelector("#reading-output");
const progressItems = document.querySelectorAll(".progress__item");
const miniDelivery = document.querySelector("#mini-delivery");
const readingStatus = document.querySelector("#reading-status");
const deliveryStatus = document.querySelector("#delivery-status");
const saveToAccountButton = document.querySelector("#save-to-account");
const openReadingCabinetButton = document.querySelector("#open-reading-cabinet");
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
const codeLogin = document.querySelector("#code-login");
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
  pendingLoginEmail: "",
  redirectAfterAuth: "",
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
  if (!element) return;
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderReadingCards(cards) {
  readingOutput.innerHTML = cards
    .map(
      (card, index) => `
        <article class="reading-card">
          <span class="card-number">${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(card.title)}</h3>
          <p>${escapeHtml(card.text)}</p>
        </article>
      `,
    )
    .join("");
}

async function buildMiniReading() {
  setStatus(readingStatus, "Calculating your natal chart...");
  setStatus(deliveryStatus, "");
  miniDelivery.classList.add("is-hidden");

  const { reading } = await api("/api/calculate-reading", {
    method: "POST",
    body: JSON.stringify({
      birthDate: state.date,
      birthTime: state.time,
      birthPlace: state.place,
      firstName: state.firstName,
    }),
  });

  state.currentReading = reading;
  renderReadingCards(reading.cards);

  miniDelivery.classList.remove("is-hidden");
  setStatus(readingStatus, "");
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
    <a class="button button--ghost" href="account.html">Open Personal Cabinet</a>
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
          <a href="account.html">Open reading</a>
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
  const isLogin = mode === "login";
  const isLoginCode = mode === "login-code";
  const isLoginCodeConfirm = isLoginCode && Boolean(state.pendingLoginEmail);
  authModal.classList.remove("is-hidden");

  authTitle.textContent = isVerify
    ? "Verify Your Email"
    : isRegister
      ? "Create Account"
      : isLoginCodeConfirm
        ? "Enter Login Code"
        : isLoginCode
          ? "Log In With Email Code"
          : "Log In";
  authNote.textContent = isVerify
    ? `Enter the 6-digit code we sent to ${state.pendingVerificationEmail}.`
    : isLoginCodeConfirm
      ? `Enter the 6-digit login code we sent to ${state.pendingLoginEmail}.`
      : isLoginCode
        ? "Enter your account email and we will send a one-time login code."
        : isRegister
          ? "Create your account, then confirm your email with a verification code."
          : "Log in to save this mini reading to your personal cabinet.";
  authSubmit.textContent = isVerify
    ? "Verify Email"
    : isRegister
      ? "Send Verification Code"
      : isLoginCodeConfirm
        ? "Log In"
        : isLoginCode
          ? "Send Login Code"
          : "Log In";
  switchAuth.textContent = isVerify
    ? "Use a different email"
    : isLoginCode
      ? "Use password instead"
    : isRegister
      ? "Already have an account? Log in"
      : "New here? Create account";
  authName.parentElement.classList.toggle("is-hidden", !isRegister);
  authEmail.parentElement.classList.toggle("is-hidden", isVerify || isLoginCodeConfirm);
  authPassword.parentElement.classList.toggle("is-hidden", isVerify || isLoginCode);
  authCodeRow.classList.toggle("is-hidden", !isVerify && !isLoginCodeConfirm);
  codeLogin.classList.toggle("is-hidden", !isLogin);
  authEmail.required = !isVerify && !isLoginCodeConfirm;
  authPassword.required = isRegister || isLogin;
  authCode.required = isVerify || isLoginCodeConfirm;
  authStatus.textContent = "";

  if (isVerify || isLoginCodeConfirm) {
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
  if (!state.pendingSaveAfterAuth) redirectAfterAuth();
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
  if (!state.pendingSaveAfterAuth) redirectAfterAuth();
}

async function requestLoginCode(email) {
  const result = await api("/api/auth/request-login-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  state.pendingLoginEmail = result.email || email;
  openAuthModal("login-code");
  setStatus(authStatus, "Login code sent. Check your inbox.");
}

async function logInWithCode(code) {
  const { user } = await api("/api/auth/login-code", {
    method: "POST",
    body: JSON.stringify({
      email: state.pendingLoginEmail,
      code,
    }),
  });

  state.currentUser = user;
  state.pendingLoginEmail = "";
  closeAuthModal();
  await loadAccount();
  if (state.pendingSaveAfterAuth) await saveReadingToAccount();
  if (!state.pendingSaveAfterAuth) redirectAfterAuth();
}

function redirectAfterAuth() {
  if (state.redirectAfterAuth === "account" || state.currentUser) {
    window.location.href = "account.html";
  }
}

async function saveReadingToAccount() {
  if (!state.currentReading) {
    setStatus(deliveryStatus, "Generate your mini reading first.");
    setStatus(readingStatus, "Generate your mini reading first.");
    return;
  }

  if (!state.currentUser) {
    state.pendingSaveAfterAuth = true;
    openAuthModal("register");
    setStatus(authStatus, "Create an account to save this mini reading.");
    setStatus(readingStatus, "Create an account or log in to open your mini reading in the cabinet.");
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
    setStatus(readingStatus, "Saved to your personal cabinet.");
    window.location.href = "account.html";
  } catch (error) {
    setStatus(deliveryStatus, error.message);
    setStatus(readingStatus, error.message);
  }
}

async function openMiniReadingInCabinet() {
  if (!state.currentReading) {
    setStatus(readingStatus, "Generate your mini reading first.");
    return;
  }

  setStatus(readingStatus, "Saving your mini reading...");
  await saveReadingToAccount();
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

async function revealMiniReading() {
  try {
    saveNameButton.disabled = true;
    skipNameButton.disabled = true;
    await buildMiniReading();
    setStep("mini");
  } catch (error) {
    setStatus(readingStatus, error.message);
  } finally {
    saveNameButton.disabled = false;
    skipNameButton.disabled = false;
  }
}

saveNameButton.addEventListener("click", () => {
  state.firstName = document.querySelector("#first-name").value.trim();
  revealMiniReading();
});

skipNameButton.addEventListener("click", () => {
  state.firstName = "";
  revealMiniReading();
});

checkoutButton.addEventListener("click", () => {
  progressItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.progress === "full");
  });
  document.querySelector("#checkout").scrollIntoView({ behavior: "smooth" });
});

saveToAccountButton.addEventListener("click", saveReadingToAccount);
openReadingCabinetButton.addEventListener("click", openMiniReadingInCabinet);

emailReportForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendReadingToEmail(reportEmailInput.value.trim());
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value;

  if ((state.authMode === "register" || state.authMode === "login") && password.length < 6) {
    setStatus(authStatus, "Password should be at least 6 characters.");
    return;
  }

  try {
    authSubmit.disabled = true;
    setStatus(authStatus, "One moment...");

    if (state.authMode === "verify") {
      await verifyEmail(authCode.value.trim());
    } else if (state.authMode === "login-code" && state.pendingLoginEmail) {
      await logInWithCode(authCode.value.trim());
    } else if (state.authMode === "login-code") {
      await requestLoginCode(email);
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

  if (state.authMode === "login-code") {
    state.pendingLoginEmail = "";
    openAuthModal("login");
    return;
  }

  openAuthModal(state.authMode === "register" ? "login" : "register");
});

codeLogin.addEventListener("click", () => {
  state.pendingLoginEmail = "";
  openAuthModal("login-code");
});

closeAuth.addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (event) => {
  if (event.target === authModal) closeAuthModal();
});

openLogin.addEventListener("click", () => openAuthModal("login"));
openRegister.addEventListener("click", () => openAuthModal("register"));
openAccount.addEventListener("click", () => {
  window.location.href = "account.html";
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

function openRequestedAuthMode() {
  const params = new URLSearchParams(window.location.search);
  const authMode = params.get("auth");
  state.redirectAfterAuth = params.get("next") === "account" ? "account" : "";

  if (authMode === "login" || authMode === "register") {
    openAuthModal(authMode);
  }
}

loadAccount().then(openRequestedAuthMode);

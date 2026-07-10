const pricingGrid = document.querySelector("#pricing-grid");
const pricingStatus = document.querySelector("#pricing-status");

const tiers = [
  {
    name: "Starter",
    product: "Unlock the 9-point interpretation",
    description: "Unlock the 9 focused psychological interpretation points beneath your numbered birth chart map.",
    features: ["9 focused chart signals", "Natal wheel interpretation", "Saved to your account", "One-time unlock"],
    priceKey: "snapshot",
  },
  {
    name: "Pro",
    product: "Go deeper with the complete birth chart report",
    description: "Generate the full Shadow Chart PDF with deeper chart sections, shadow patterns, relationship dynamics, and growth prompts.",
    features: ["Complete birth chart report", "PDF download", "Email delivery", "One-time purchase"],
    priceKey: "fullReport",
  },
];

const state = {
  paddle: null,
  paddleReady: false,
  customerEmail: "",
  pricePreview: {},
};

function setStatus(message) {
  pricingStatus.textContent = message || "";
}

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

function getPriceId(tier) {
  return state.paddle?.priceIds?.[tier.priceKey] || "";
}

function getPreviewTotal(priceId) {
  const preview = state.pricePreview[priceId];
  return preview?.formattedTotals?.total || preview?.formatted_totals?.total || preview?.formattedTotal || preview?.total || "Loading...";
}

function collectPreviewItems(result) {
  const data = result?.data || result || {};
  return (
    data.details?.lineItems ||
    data.details?.line_items ||
    data.lineItems ||
    data.line_items ||
    data.items ||
    []
  );
}

function getLineItemPriceId(item) {
  return item.price?.id || item.priceId || item.price_id || item.price?.priceId || item.price?.price_id || "";
}

function renderPricing() {
  pricingGrid.innerHTML = tiers
    .map((tier) => {
      const priceId = getPriceId(tier);
      const total = priceId ? getPreviewTotal(priceId) : "Not configured";
      return `
        <article class="pricing-card">
          <p class="panel-kicker">${tier.name}</p>
          <h2>${tier.product}</h2>
          <p>${tier.description}</p>
          <strong class="pricing-card__price">${total}</strong>
          <ul>
            ${tier.features.map((feature) => `<li>${feature}</li>`).join("")}
          </ul>
          <button class="button button--primary" type="button" data-price-key="${tier.priceKey}" ${priceId ? "" : "disabled"}>
            Buy
          </button>
        </article>
      `;
    })
    .join("");
}

async function loadConfig() {
  const [{ paddle }, meResult] = await Promise.all([
    api("/api/paddle/config", { method: "GET", headers: {} }),
    api("/api/me", { method: "GET", headers: {} }).catch(() => ({ user: null })),
  ]);

  state.paddle = paddle;
  state.customerEmail = meResult.user?.email || "";
}

function ensurePaddleReady() {
  const paddle = state.paddle;
  if (!paddle?.environment) throw new Error("PADDLE_ENV is not configured.");
  if (!paddle?.clientToken) throw new Error("PADDLE_CLIENT_TOKEN is not configured.");
  if (!window.Paddle) throw new Error("Paddle.js did not load. Refresh the page and try again.");

  if (!state.paddleReady) {
    if (paddle.environment === "sandbox") window.Paddle.Environment.set("sandbox");
    window.Paddle.Initialize({ token: paddle.clientToken });
    state.paddleReady = true;
  }
}

async function loadPricePreview() {
  ensurePaddleReady();
  const items = tiers
    .map((tier) => ({ priceId: getPriceId(tier), quantity: 1 }))
    .filter((item) => item.priceId);

  if (!items.length) throw new Error("No Paddle price IDs are configured.");

  const request = { items };
  if (state.paddle.countryCode) request.customer = { address: { countryCode: state.paddle.countryCode } };

  const result = await window.Paddle.PricePreview(request);
  const lineItems = collectPreviewItems(result);
  state.pricePreview = {};

  for (const item of lineItems) {
    const priceId = getLineItemPriceId(item);
    if (priceId) state.pricePreview[priceId] = item;
  }
}

function openCheckout(priceKey) {
  ensurePaddleReady();
  const tier = tiers.find((item) => item.priceKey === priceKey);
  const priceId = tier ? getPriceId(tier) : "";
  if (!priceId) throw new Error("Paddle price ID is not configured.");

  window.Paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: state.customerEmail ? { email: state.customerEmail } : undefined,
    settings: {
      displayMode: "overlay",
      variant: "one-page",
      theme: "dark",
      successUrl: `${window.location.origin}/welcome`,
    },
    customData: {
      app: "shadow-chart",
      purchase_type: priceKey,
      customer_email: state.customerEmail || "",
    },
  });
}

pricingGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-price-key]");
  if (!button) return;
  try {
    setStatus("Opening secure Paddle checkout...");
    openCheckout(button.dataset.priceKey);
  } catch (error) {
    setStatus(error.message);
  }
});

async function init() {
  try {
    setStatus("Loading localized Paddle prices...");
    await loadConfig();
    renderPricing();
    await loadPricePreview();
    renderPricing();
    setStatus(state.paddle.countryCode ? `Prices localized for ${state.paddle.countryCode}.` : "Prices localized by Paddle from your IP.");
  } catch (error) {
    renderPricing();
    setStatus(error.message || "Pricing could not be loaded.");
  }
}

init();

const apiKey = process.env.PADDLE_API_KEY;
const apiBase = process.env.PADDLE_API_BASE || "https://sandbox-api.paddle.com";

if (!apiKey) {
  console.error("Missing PADDLE_API_KEY. Set it first: $env:PADDLE_API_KEY=\"your_sandbox_key\"");
  process.exit(1);
}

const products = [
  {
    key: "snapshot",
    productName: "Unlock the 9-point interpretation",
    description: "Unlocks the focused 9-point Shadow Chart interpretation for a saved reading.",
    priceName: "Unlock the 9-point interpretation",
    priceDescription: "One-time unlock for the 9-point interpretation.",
    usd: "99",
    overrides: [
      { country_codes: ["GB"], unit_price: { amount: "79", currency_code: "GBP" } },
      { country_codes: ["IE"], unit_price: { amount: "89", currency_code: "EUR" } },
      { country_codes: ["AU"], unit_price: { amount: "149", currency_code: "AUD" } },
    ],
  },
  {
    key: "full_report",
    productName: "Go deeper with the complete birth chart report",
    description: "Unlocks the complete Shadow Chart birth chart report.",
    priceName: "Go deeper with the complete birth chart report",
    priceDescription: "One-time purchase for the complete birth chart report.",
    usd: "1999",
    overrides: [
      { country_codes: ["GB"], unit_price: { amount: "1499", currency_code: "GBP" } },
      { country_codes: ["IE"], unit_price: { amount: "1799", currency_code: "EUR" } },
      { country_codes: ["AU"], unit_price: { amount: "2799", currency_code: "AUD" } },
    ],
  },
];

async function paddle(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error(`Paddle API request failed: ${response.status} ${response.statusText}`);
  }

  return result.data;
}

async function createProduct(product) {
  return paddle("/products", {
    name: product.productName,
    description: product.description,
    tax_category: "saas",
    custom_data: {
      app: "shadow-chart",
      product_key: product.key,
    },
  });
}

async function createOneTimePrice(product, paddleProduct) {
  return paddle("/prices", {
    product_id: paddleProduct.id,
    name: product.priceName,
    description: product.priceDescription,
    unit_price: {
      amount: product.usd,
      currency_code: "USD",
    },
    unit_price_overrides: product.overrides,
    custom_data: {
      app: "shadow-chart",
      product_key: product.key,
      price_type: "one_time",
    },
  });
}

async function main() {
  console.log(`Creating Paddle sandbox one-time catalog using ${apiBase}`);
  console.log("Country overrides:");
  console.log("- 9-point interpretation: USD 99, GB GBP 79, IE EUR 89, AU AUD 149");
  console.log("- Complete birth chart report: USD 1999, GB GBP 1499, IE EUR 1799, AU AUD 2799");
  console.log("");

  const created = [];

  for (const product of products) {
    const paddleProduct = await createProduct(product);
    const price = await createOneTimePrice(product, paddleProduct);

    created.push({
      key: product.key,
      name: paddleProduct.name,
      productId: paddleProduct.id,
      priceId: price.id,
      priceName: price.name,
    });
  }

  console.log("Created Paddle catalog mapping:");
  console.log(JSON.stringify(created, null, 2));
  console.log("");
  console.log("Railway variables to add later:");
  for (const item of created) {
    const envName = item.key === "snapshot" ? "PADDLE_SNAPSHOT_PRICE_ID" : "PADDLE_FULL_REPORT_PRICE_ID";
    console.log(`${envName}=${item.priceId}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
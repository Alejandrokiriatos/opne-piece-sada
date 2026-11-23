import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function fakeDb() {
  return {
    prepare(sql) {
      const stmt = {
        bind() { return stmt; },
        async first() {
          if (sql.includes("COUNT(*) AS total")) return { total: 0 };
          return null;
        },
        async all() { return { results: [] }; },
        async run() { return { success: true }; }
      };
      return stmt;
    },
    async batch() { return { success: true }; }
  };
}
function env(extra = {}) {
  return { DB: fakeDb(), CORS_ORIGINS: "https://app.example.test", ...extra };
}

test("health endpoint responds without database activity", async () => {
  const response = await worker.fetch(new Request("https://api.example.test/health"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "butterfly-cafe-api");
});

test("rejects a browser origin that is not allowed", async () => {
  const response = await worker.fetch(
    new Request("https://api.example.test/health", { headers: { Origin: "https://evil.example" } }),
    env()
  );
  assert.equal(response.status, 403);
});

test("allows only configured CORS origin", async () => {
  const response = await worker.fetch(
    new Request("https://api.example.test/health", { headers: { Origin: "https://app.example.test" } }),
    env()
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://app.example.test");
});

test("orders endpoint requires valid name and phone before reading catalogue", async () => {
  const response = await worker.fetch(new Request("https://api.example.test/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "test-order-key-123456" },
    body: JSON.stringify({ customerName: "", customerPhone: "", items: [{ productId: "cappuccino", quantity: 1 }] })
  }), env());
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /nombre y un teléfono válido/i);
});

test("admin order listing rejects missing or invalid token", async () => {
  const response = await worker.fetch(new Request("https://api.example.test/api/admin/orders"), env({ ADMIN_API_TOKEN: "a".repeat(40) }));
  assert.equal(response.status, 401);
});

test("admin sales endpoint rejects unauthenticated reads", async () => {
  const response = await worker.fetch(new Request("https://api.example.test/api/admin/stats"), env({ ADMIN_API_TOKEN: "b".repeat(40) }));
  assert.equal(response.status, 401);
});

test("push config exposes only public capability information", async () => {
  const response = await worker.fetch(new Request("https://api.example.test/api/push/config"), env());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.webPushAvailable, false);
  assert.equal(body.nativePushAvailable, false);
  assert.equal(Object.hasOwn(body, "privateKey"), false);
});

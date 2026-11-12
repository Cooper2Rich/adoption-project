import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SHOWCASE, sampleWeek } from "../server/demo-showcase.ts";
import { financeFixture } from "./finance-helpers.ts";
import { fixture } from "./helpers.ts";

test("sample statement week is stable across days and adjacent across UTC Mondays", () => {
  const friday = sampleWeek("2026-10-23T23:59:00Z");
  assert.deepEqual(sampleWeek("2026-10-24T12:00:00Z"), friday);
  assert.equal(friday.startsAt, "2026-10-19T00:00:00.000Z");
  assert.equal(sampleWeek("2026-10-26T00:00:00Z").startsAt, friday.endsAt);
});

test("explicit showcase appends once, preserves originals, and supports the tracked gift and statement journey", async (t) => {
  const f = await fixture(t);
  const before = f.store.read();
  assert.equal(
    (
      await f.request("/demo/showcase", {
        method: "POST",
        role: "creator",
        body: {},
      })
    ).status,
    403,
  );
  const setup = await f.request("/demo/showcase", { method: "POST", body: {} });
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  assert.equal(setup.data.created, true);
  const again = await f.request("/demo/showcase", { method: "POST", body: {} });
  assert.equal(again.data.created, false);
  const state = f.store.read();
  assert.equal(state.projects.length, before.projects.length + 1);
  assert.equal(state.posts.length, before.posts.length);
  for (const p of before.projects)
    assert.deepEqual(
      state.projects.find((v) => v.id === p.id),
      p,
    );
  const finance = (await f.request(`/campaigns/${SHOWCASE}/finance`)).data;
  assert.equal(finance.availableSeedGuaranteeCents, 60000);
  assert.equal(finance.availableMediaCents, 40000);
  const creator = state.creators.find(
    (c) => c.name === "Alex River · fictional",
  );
  const headers = { "x-demo-creator": creator.id };
  const terms = (
    await f.request(`/campaigns/${SHOWCASE}/terms`, {
      role: "creator",
      headers,
    })
  ).data.terms;
  await f.request(`/campaigns/${SHOWCASE}/consent`, {
    role: "creator",
    headers,
    method: "POST",
    body: { termsId: terms.id },
  });
  const post = await f.request(`/campaigns/${SHOWCASE}/sample-creative`, {
    role: "creator",
    headers,
    method: "POST",
    body: {},
  });
  assert.equal(post.status, 201, JSON.stringify(post.data));
  assert.equal(post.data.status, "approved");
  const link = await f.request(`/campaigns/${SHOWCASE}/demo-link`, {
    role: "creator",
    headers,
    method: "POST",
    body: { postId: post.data.id },
  });
  assert.equal(link.status, 201, JSON.stringify(link.data));
  const click = await fetch(f.baseURL + link.data.link.path, {
    redirect: "manual",
  });
  const cookie = click.headers.get("set-cookie").split(";")[0];
  assert.equal(click.status, 303);
  const renew = await fetch(f.baseURL + link.data.link.path, {
    redirect: "manual",
    headers: { cookie },
  });
  assert.equal(renew.headers.get("set-cookie").split(";")[0], cookie);
  assert.match(renew.headers.get("set-cookie"), /Max-Age=604800/);
  const intent = await fetch(`${f.baseURL}/api/giving/${SHOWCASE}/intents`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ amountCents: 10000 }),
  });
  const giftIntent = await intent.json();
  const confirm = () =>
    fetch(
      `${f.baseURL}/api/giving/${SHOWCASE}/intents/${giftIntent.id}/confirm`,
      {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: "{}",
      },
    ).then((r) => r.json());
  const gift = await confirm();
  assert.equal(gift.creatorCents, 1000);
  assert.equal(gift.beneficiaryCents, 9000);
  assert.equal(gift.votes, 1);
  await confirm();
  const after = (await f.request(`/campaigns/${SHOWCASE}/finance`)).data;
  assert.equal(after.creatorCents, 1000);
  assert.equal(after.votes, 1);
  const statement = await f.request("/demo/sample-statement", {
    method: "POST",
    body: {},
  });
  assert.equal(statement.status, 200, JSON.stringify(statement.data));
  assert.match(statement.data.disclosure, /preview/);
  assert.equal(statement.data.statement.capturedAccrualCents, 1000);
  assert.equal((await f.request("/demo/grade-example")).data.score, 77.5);
  assert.equal(
    (await f.request(`/campaigns/${SHOWCASE}/finance`, { role: "nonprofit" }))
      .status,
    404,
  );
  assert.equal(
    (await f.request("/offers", { role: "nonprofit" })).data.items.length,
    0,
  );
});

test("public uploaded media immediately respects participation suspension without a workspace refresh", async (t) => {
  const f = await financeFixture(t);
  const form = new FormData();
  form.append(
    "media",
    new Blob([readFileSync("public/images/forest.jpg")], {
      type: "image/jpeg",
    }),
    "fixture.jpg",
  );
  const uploaded = await fetch(f.baseURL + "/api/uploads", {
    method: "POST",
    headers: { "x-demo-role": "creator", "x-demo-creator": f.creatorId },
    body: form,
  });
  const media = await uploaded.json();
  const revised = await f.request("/posts/" + f.post.id, {
    method: "PUT",
    role: "creator",
    body: { ...f.post, ...media, revision: f.post.revision },
  });
  assert.equal(revised.status, 200);
  const p = revised.data,
    url =
      f.baseURL + p.media + "?postId=" + p.id + "&snapshotId=" + p.snapshotId;
  assert.equal((await fetch(url)).status, 200);
  await f.request(
    "/campaigns/" + f.project.id + "/participation-restrictions",
    {
      method: "POST",
      body: {
        creatorId: f.creatorId,
        state: "suspended",
        evidence: "Isolated regression fixture",
      },
    },
  );
  assert.equal((await fetch(url)).status, 404);
});

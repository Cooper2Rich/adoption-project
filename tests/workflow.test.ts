import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../server/app.ts";
import { createStore } from "../server/store.ts";

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "slander-test-"));
  const store = createStore(join(dir, "test.sqlite"));
  const app = createApp(store, dir);
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(
    path,
    { method = "GET", body, role = "admin", headers = {} } = {},
  ) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method,
        headers: {
          "x-demo-role": role,
          ...(role === "creator"
            ? { "x-demo-creator": store.read().creators[0].id }
            : {}),
          ...(role === "nonprofit"
            ? { "x-demo-nonprofit": store.read().nonprofits[0].id }
            : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return { status: response.status, data: await response.json() };
  }
  return {
    request,
    store,
    dir,
    baseURL: `http://127.0.0.1:${server.address().port}`,
  };
}
export const submission = {
  title: "A better tomorrow",
  creator: "Test Creator",
  caption: "Help us grow a greener community.",
  format: "photo",
  media: "/images/forest.jpg",
  mediaType: "image",
  rights: true,
  destination: "/campaigns/greener-tomorrow/give",
  acceptedTermsVersion: "local-v1",
  disclosures: {
    compensation:
      "Creators receive 10% of eligible attributed donations; 90% belongs to the nonprofit before fees.",
    beneficiary: "Beneficiary: One Tree Collective.",
  },
};

test("project account pairing persists and stays scoped to its nonprofit", async (t) => {
  const { request, store, dir } = await fixture(t);
  const project = (await request("/workspace")).data.projects[0];
  const result = await request(`/projects/${project.id}`, {
    method: "PUT",
    body: { ...project, instagram: "https://www.instagram.com/One.Tree/" },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.instagram, "one.tree");
  const state = (await request("/workspace")).data;
  assert.equal(state.projects[1].instagram, "");
  assert.equal(
    state.posts.find((p) => p.id === "sample-4").readiness.ready,
    true,
  );
  const secondStore = createStore(join(dir, "test.sqlite"));
  assert.equal(secondStore.read().projects[0].instagram, "one.tree");
  secondStore.close();
  assert.match(store.read().activity[0].title, /Paired @one.tree/);
});

test("automatic eligibility is separate from account pairing which gates handoff", async (t) => {
  const { request } = await fixture(t);
  const create = await request("/projects/greener-tomorrow/posts", {
    method: "POST",
    role: "creator",
    body: submission,
  });
  assert.equal(create.status, 201);
  assert.equal(create.data.status, "approved");
  assert.equal(create.data.revision, 1);
  assert.equal(create.data.history[0].action, "submitted");
  assert.equal(create.data.eligibility.outcome, "eligible");
  assert.equal(
    (await request("/posts/" + create.data.id + "/export")).status,
    409,
  );
  assert.equal(
    (
      await request("/posts/" + create.data.id + "/review", {
        method: "POST",
        body: { decision: "approved", revision: 1 },
      })
    ).status,
    409,
  );
  const project = (await request("/workspace")).data.projects[0];
  await request("/projects/" + project.id, {
    method: "PUT",
    body: { ...project, instagram: "@official.nonprofit" },
  });
  const exported = await request("/posts/" + create.data.id + "/export");
  assert.equal(exported.status, 200);
  assert.equal(exported.data.instagram, "@official.nonprofit");
  assert.equal(exported.data.caption, submission.caption);
  assert.equal(
    exported.data.snapshot.digest,
    create.data.eligibility.snapshotDigest,
  );
  assert.match(exported.data.note, /not been published/);
});

test("failed checks resolve only through a new automatically evaluated revision", async (t) => {
  const { request } = await fixture(t);
  const post = (
    await request("/projects/greener-tomorrow/posts", {
      method: "POST",
      role: "creator",
      body: { ...submission, rights: false },
    })
  ).data;
  assert.equal(post.policy.passed, false);
  assert.equal(post.status, "changes");
  assert.equal(post.eligibility.reasons[0].code, "RIGHTS_REQUIRED");
  for (const decision of ["approved", "changes", "rejected"])
    assert.equal(
      (
        await request("/posts/" + post.id + "/review", {
          method: "POST",
          body: { decision, note: "Manual bypass", revision: 1 },
        })
      ).status,
      409,
    );
  const revised = await request("/posts/" + post.id, {
    method: "PUT",
    role: "creator",
    body: { ...submission, revision: 1 },
  });
  assert.equal(revised.data.status, "approved");
  assert.equal(revised.data.revision, 2);
  assert.equal(revised.data.snapshots.length, 2);
  assert.equal(revised.data.snapshots[0].content.rights, false);
  assert.equal(revised.data.evaluations.length, 2);
});

test("manual decision mutations are retired and stale revisions cannot overwrite content", async (t) => {
  const { request, store } = await fixture(t);
  for (const decision of ["approved", "changes", "rejected"])
    assert.equal(
      (
        await request("/posts/sample-1/review", {
          method: "POST",
          body: { decision, revision: 1 },
        })
      ).status,
      409,
    );
  const before = store.read().posts[0];
  const revised = await request("/posts/sample-1", {
    method: "PUT",
    role: "creator",
    body: { ...submission, revision: 1 },
  });
  assert.equal(revised.status, 200);
  assert.equal(
    (
      await request("/posts/sample-1", {
        method: "PUT",
        role: "creator",
        body: { ...submission, revision: 1 },
      })
    ).status,
    409,
  );
  assert.deepEqual(store.read().posts[0].snapshots[0], before.snapshots[0]);
});

test("demo roles enforce workflow permissions and block cross-origin mutations", async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (
      await request("/posts/sample-1/review", {
        role: "creator",
        method: "POST",
        body: { decision: "approved", revision: 1 },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/projects/greener-tomorrow/posts", {
        method: "POST",
        role: "nonprofit",
        body: submission,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/posts/sample-1/review", {
        method: "POST",
        headers: { Origin: "https://unrelated.example" },
        body: { decision: "approved", revision: 1 },
      })
    ).status,
    403,
  );
});

test("draft, archived, future, and ended projects reject submissions", async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (
      await request("/projects/room-to-grow/posts", {
        method: "POST",
        role: "creator",
        body: submission,
      })
    ).status,
    404,
  );
  const project = (await request("/workspace")).data.projects[0];
  for (const changes of [
    { status: "archived" },
    { startDate: "2099-01-01", endDate: "2099-02-01" },
    { startDate: "2020-01-01", endDate: "2020-02-01" },
  ]) {
    await request(`/projects/${project.id}`, {
      method: "PUT",
      body: { ...project, ...changes },
    });
    assert.equal(
      (
        await request(`/projects/${project.id}/posts`, {
          method: "POST",
          role: "creator",
          body: submission,
        })
      ).status,
      changes.status === "archived" ? 404 : 409,
    );
  }
});

test("format proposals are retained while unsupported handoff remains blocked", async (t) => {
  const { request } = await fixture(t);
  const project = (await request("/workspace")).data.projects[0];
  await request(`/projects/${project.id}`, {
    method: "PUT",
    body: { ...project, instagram: "nonprofit" },
  });
  const post = (
    await request(`/projects/${project.id}/posts`, {
      method: "POST",
      role: "creator",
      body: { ...submission, format: "story" },
    })
  ).data;
  assert.equal(post.format, "story");
  assert.equal(
    (
      await request(`/posts/${post.id}/review`, {
        method: "POST",
        body: { decision: "approved", revision: 1 },
      })
    ).status,
    409,
  );
  const exportResult = await request(`/posts/${post.id}/export`);
  assert.equal(exportResult.status, 409);
  assert.match(exportResult.data.error, /Format/);
});

test("media-type checks prevent a photo being approved as a reel", async (t) => {
  const { request } = await fixture(t);
  const result = await request("/projects/greener-tomorrow/posts", {
    method: "POST",
    role: "creator",
    body: { ...submission, format: "reel" },
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.policy.passed, false);
  assert.equal(
    (
      await request(`/posts/${result.data.id}/review`, {
        method: "POST",
        body: { decision: "approved", revision: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/projects/greener-tomorrow/posts", {
        method: "POST",
        role: "creator",
        body: { ...submission, media: "/uploads/not-real.jpg" },
      })
    ).status,
    400,
  );
});

test("invalid project dates and account names do not mutate existing data", async (t) => {
  const { request } = await fixture(t);
  const project = (await request("/workspace")).data.projects[0];
  for (const changes of [
    { instagram: "bad handle!" },
    { startDate: "2026-02-30" },
    { startDate: "2028-01-01", endDate: "2027-01-01" },
  ]) {
    assert.equal(
      (
        await request(`/projects/${project.id}`, {
          method: "PUT",
          body: { ...project, ...changes },
        })
      ).status,
      400,
    );
    assert.deepEqual((await request("/workspace")).data.projects[0], project);
  }
});

test("removing an account immediately blocks previously approved handoff", async (t) => {
  const { request } = await fixture(t);
  const project = (await request("/workspace")).data.projects[0];
  await request(`/projects/${project.id}`, {
    method: "PUT",
    body: { ...project, instagram: "nonprofit" },
  });
  assert.equal((await request("/posts/sample-4/export")).status, 200);
  await request(`/projects/${project.id}`, {
    method: "PUT",
    body: { ...project, instagram: "" },
  });
  assert.equal((await request("/posts/sample-4/export")).status, 409);
});

test("uploads reject forged image content and unknown API routes return JSON", async (t) => {
  const { request, baseURL } = await fixture(t);
  const form = new FormData();
  form.append(
    "media",
    new Blob(["<script>alert(1)</script>"], { type: "image/jpeg" }),
    "bad.jpg",
  );
  const response = await fetch(`${baseURL}/api/uploads`, {
    method: "POST",
    headers: { "x-demo-role": "admin" },
    body: form,
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /does not match/);
  assert.equal((await request("/missing")).status, 404);
});

test("nonprofit must select an organization before seeing workspace data", async (t) => {
  const { request, store } = await fixture(t);
  assert.equal(
    (
      await request("/workspace", {
        role: "nonprofit",
        headers: { "x-demo-nonprofit": "" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/workspace", {
        role: "nonprofit",
        headers: { "x-demo-nonprofit": "unknown" },
      })
    ).status,
    403,
  );
  const { data } = await request("/workspace", { role: "nonprofit" });
  assert.deepEqual(
    data.projects.map((p) => p.id),
    ["greener-tomorrow"],
  );
  assert(data.posts.every((p) => p.projectId === "greener-tomorrow"));
  assert(data.approvedPosts.every((p) => p.projectId === "greener-tomorrow"));
  assert(data.activity.every((e) => e.projectId === "greener-tomorrow"));
  const second = store.read().projects[1].nonprofitId;
  const other = await request("/workspace", {
    role: "nonprofit",
    headers: { "x-demo-nonprofit": second },
  });
  assert.deepEqual(
    other.data.projects.map((p) => p.id),
    ["seat-at-the-table"],
  );
  assert(other.data.posts.every((p) => p.projectId === "seat-at-the-table"));
});

test("nonprofit can manage and review its projects but cannot add, reassign, or access other projects", async (t) => {
  const { request, store } = await fixture(t);
  const [own, other] = store.read().projects;
  assert.equal(
    (
      await request("/projects", {
        method: "POST",
        role: "nonprofit",
        body: own,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/projects/${other.id}`, {
        method: "PUT",
        role: "nonprofit",
        body: { ...other, instagram: "wrong.account" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/projects/${own.id}`, {
        method: "PUT",
        role: "nonprofit",
        body: { ...own, nonprofit: other.nonprofit },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/posts/sample-2/review", {
        method: "POST",
        role: "nonprofit",
        body: { decision: "approved", revision: 1 },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/projects/${own.id}`, {
        method: "PUT",
        role: "nonprofit",
        body: { ...own, instagram: "our.nonprofit" },
      })
    ).status,
    200,
  );
  const review = await request("/posts/sample-1/review", {
    method: "POST",
    role: "nonprofit",
    body: { decision: "approved", revision: 1 },
  });
  assert.equal(review.status, 409);
  assert.equal(store.read().posts[0].eligibility.outcome, "eligible");
  assert.equal(
    (await request("/posts/sample-1/export", { role: "nonprofit" })).status,
    200,
  );
  assert.equal(store.read().projects[1].instagram, "");
});

test("creators see published projects, only their submissions, and public approved work", async (t) => {
  const { request, store } = await fixture(t);
  assert.equal(
    (
      await request("/workspace", {
        role: "creator",
        headers: { "x-demo-creator": "" },
      })
    ).status,
    403,
  );
  const result = await request("/workspace", { role: "creator" });
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.data.projects.map((p) => p.id),
    ["greener-tomorrow", "seat-at-the-table"],
  );
  assert.deepEqual(
    result.data.posts.map((p) => p.id),
    ["sample-1", "sample-5"],
  );
  assert.deepEqual(
    result.data.approvedPosts.map((p) => p.id),
    ["sample-1", "sample-2", "sample-3", "sample-4"],
  );
  assert(
    result.data.projects.every(
      (p) => !("instagram" in p) && !("nonprofitId" in p),
    ),
  );
  assert(result.data.posts.every((p) => !("readiness" in p)));
  assert.equal(result.data.approvedPosts[0].feedback, "");
  assert.equal(
    result.data.approvedPosts.find((p) => p.id === "sample-4").policy,
    undefined,
  );
  assert.deepEqual(result.data.activity, []);
  const alex = store.read().creators.find((c) => c.name === "Alex Rivera");
  const other = await request("/workspace", {
    role: "creator",
    headers: { "x-demo-creator": alex.id },
  });
  assert.deepEqual(
    other.data.posts.map((p) => p.id),
    ["sample-2"],
  );
});

test("creators cannot mutate project settings, review others, export handoff, or impersonate creators", async (t) => {
  const { request, store } = await fixture(t);
  const project = store.read().projects[0];
  assert.equal(
    (
      await request("/projects", {
        role: "creator",
        method: "POST",
        body: project,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/projects/${project.id}`, {
        role: "creator",
        method: "PUT",
        body: project,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/posts/sample-2", {
        role: "creator",
        method: "PUT",
        body: { ...submission, revision: 1 },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/posts/sample-1/review", {
        role: "creator",
        method: "POST",
        body: { decision: "approved", revision: 1 },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/posts/sample-4/export", { role: "creator" })).status,
    403,
  );
  const created = await request(`/projects/${project.id}/posts`, {
    role: "creator",
    method: "POST",
    body: { ...submission, creator: "Someone else" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.creator, "Maya Chen");
  assert.equal(created.data.creatorId, store.read().creators[0].id);
});

test("admin sees everything and assigns stable nonprofit and creator ownership", async (t) => {
  const { request, store } = await fixture(t);
  assert.equal((await request("/workspace")).data.projects.length, 3);
  const own = store.read().projects[0];
  const second = await request("/projects", {
    method: "POST",
    body: {
      ...own,
      name: "Another mission",
      nonprofit: "  ONE TREE COLLECTIVE  ",
    },
  });
  assert.equal(second.status, 201);
  assert.equal(second.data.nonprofitId, own.nonprofitId);
  assert.equal(
    (await request("/workspace", { role: "nonprofit" })).data.projects.length,
    2,
  );
  const post = await request(`/projects/${own.id}/posts`, {
    method: "POST",
    body: submission,
  });
  assert.equal(post.status, 201);
  assert.equal(post.data.creator, submission.creator);
  const profile = await request("/demo-creators", {
    role: "creator",
    method: "POST",
    body: { name: "New Demo Creator" },
  });
  assert.equal(profile.status, 201);
  const fresh = await request("/workspace", {
    role: "creator",
    headers: { "x-demo-creator": profile.data.id },
  });
  assert.deepEqual(fresh.data.posts, []);
});

test("existing workspace data gets persistent identities without replacing projects", async (t) => {
  const { store, dir } = await fixture(t);
  const before = store.read();
  const persisted = createStore(join(dir, "test.sqlite"));
  assert.deepEqual(persisted.read().projects, before.projects);
  assert.deepEqual(persisted.read().creators, before.creators);
  persisted.close();
});

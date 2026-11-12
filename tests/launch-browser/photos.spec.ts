import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { campaignRules as rules } from "../launch/fixtures.ts";
import { jpegBytes, pngBytes } from "../launch/photo-fixtures.ts";

test("T03 creator actual photo upload correction rejection and manager approval journey", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const base = String(info.project.use.baseURL ?? "http://127.0.0.1:3210");
  const session = await (
    await page.request.get(`${base}/__allocation/session`)
  ).json();
  const manager = new ConvexHttpClient(session.url);
  manager.setAuth(session.token);
  const scope = { campaignId: "adoption" };
  try {
    await manager.mutation(
      makeFunctionReference<"mutation">("campaignSetup:create"),
      {
        ...scope,
        operationId: "t03-browser-rules",
        rules,
      },
    );
  } catch (error) {
    expect(String(error)).toMatch(/RULES_LOCKED/);
  }
  const invitation = await manager.mutation(
    makeFunctionReference<"mutation">("creatorAccess:invite"),
    {
      ...scope,
      email: "creator-b@creators.example",
      operationId: "t03-browser-invite",
    },
  );
  await manager.action("clerkInvitations:dispatch", {
    ...scope,
    invitationId: invitation._id,
    kind: "create",
  });
  // Establish the owned fixture before navigation; isVisible() can observe
  // the loading state before the unavailable-terms heading renders.
  await page.request.post(`${base}/__allocation/terms`);
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  await context.route("**/__allocation/session", async (route) => {
    const target = new URL(route.request().url());
    target.searchParams.set("identity", "creator-b");
    await route.fulfill({
      response: await route.fetch({ url: target.toString() }),
    });
  });
  const creator = await context.newPage();
  try {
    await creator.goto(
      `${base}/?workspace=creator&invitation=${invitation._id}`,
    );
    await creator.getByRole("checkbox").check();
    await creator
      .getByRole("button", { name: "Complete campaign signup" })
      .click();
    const photos = creator.getByRole("region", {
      name: "Your photo submissions",
    });
    await expect(photos).toBeVisible();
    await creator
      .getByLabel("Photo title", { exact: true })
      .fill("A family together");
    await creator
      .getByLabel("Photo description", { exact: true })
      .fill("An original image supporting adoption.is families.");
    await creator.getByLabel("JPEG/PNG photos", { exact: true }).setInputFiles({
      name: "corrupt.png",
      mimeType: "image/png",
      buffer: Buffer.from("This is not an image"),
    });
    await creator
      .getByRole("button", { name: "Submit photos for review", exact: true })
      .click();
    await expect(photos.getByRole("status")).toContainText("PHOTO_FORMAT");
    await creator.screenshot({
      path: `.codex/ralph/t03-${info.project.name}-format-error.png`,
      fullPage: true,
    });
    await creator.getByLabel("JPEG/PNG photos", { exact: true }).setInputFiles({
      name: "family.png",
      mimeType: "image/png",
      buffer: await pngBytes(),
    });
    await creator
      .getByRole("button", { name: "Submit photos for review", exact: true })
      .click();
    await expect(photos.getByRole("status")).toContainText(
      "Saved for manager review",
    );
    const creatorSession = await (
      await creator.request.get(
        `${base}/__allocation/session?identity=creator-b`,
      )
    ).json();
    const client = new ConvexHttpClient(creatorSession.url);
    client.setAuth(creatorSession.token);
    let entries = await client.query(
      makeFunctionReference<"query">("photos:workspace"),
      scope,
    );
    expect(entries).toHaveLength(1);
    const entryId = entries[0]._id,
      trackedPath = entries[0].trackedPath;
    const owned = creator.getByRole("article", {
      name: `Submission ${entryId}`,
    });
    await expect(owned.getByText("pending", { exact: true })).toBeVisible();
    await expect(owned.getByRole("img")).toBeVisible();
    await expect(owned.getByRole("img")).toHaveJSProperty("naturalWidth", 2);
    expect(
      (
        await page.request.get(
          `${base}/api/photos?action=resource&uploadId=${entries[0].versions[0].photos[0]}`,
        )
      ).status(),
    ).toBe(403);
    await creator.reload();
    await expect(
      creator.getByRole("article", { name: `Submission ${entryId}` }),
    ).toContainText(trackedPath);
    await creator.screenshot({
      path: `.codex/ralph/t03-${info.project.name}-creator-pending.png`,
      fullPage: true,
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Photo review", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review creator photos." }),
    ).toBeVisible();
    const review = page.getByRole("article", { name: `Review ${entryId}` });
    await expect(review.getByRole("img")).toHaveJSProperty("naturalWidth", 2);
    await review
      .getByRole("button", { name: "Request revisions", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText("REASON_REQUIRED");
    await review
      .getByRole("textbox")
      .fill("Please replace this with the landscape original.");
    await review
      .getByRole("button", { name: "Request revisions", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText("Feedback saved");
    await expect(owned.getByText("revisions", { exact: true })).toBeVisible();
    await owned.getByText(/Submission and review history/).click();
    await expect(owned).toContainText(
      "Please replace this with the landscape original.",
    );
    await creator.screenshot({
      path: `.codex/ralph/t03-${info.project.name}-revision-feedback.png`,
      fullPage: true,
    });
    await owned
      .getByRole("button", { name: "Correct A family together", exact: true })
      .click();
    await creator
      .getByLabel("Replacement photos (leave empty for descriptive edits)", {
        exact: true,
      })
      .setInputFiles({
        name: "landscape.jpg",
        mimeType: "image/jpeg",
        buffer: await jpegBytes(),
      });
    await creator
      .getByRole("button", { name: "Submit correction", exact: true })
      .click();
    await expect(photos.getByRole("status")).toContainText(
      "Saved for manager review",
    );
    await expect(owned).toContainText("Version 2");
    await expect(owned).toContainText(trackedPath);
    await review
      .getByRole("textbox")
      .fill("Please describe the context of this photo.");
    await review
      .getByRole("button", { name: "Reject with reason", exact: true })
      .click();
    await expect(owned.getByText("rejected", { exact: true })).toBeVisible();
    await expect(owned).toContainText(
      "Please describe the context of this photo.",
    );
    await owned
      .getByRole("button", { name: "Correct A family together", exact: true })
      .click();
    await creator
      .getByLabel("Photo description", { exact: true })
      .fill("The landscape original shows a family spending the day together.");
    await creator
      .getByRole("button", { name: "Submit correction", exact: true })
      .click();
    await expect(owned).toContainText("Version 3");
    await review
      .getByRole("button", { name: "Approve unchanged creative", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText(
      "No paid advertising was dispatched",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      owned.getByText("approved", { exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: `.codex/ralph/t03-${info.project.name}-manager-approved.png`,
      fullPage: true,
    });
    await owned
      .getByRole("button", { name: "Correct A family together", exact: true })
      .click();
    await creator
      .getByLabel("Photo title", { exact: true })
      .fill("A second family story");
    await creator
      .getByLabel("Replacement photos (leave empty for descriptive edits)", {
        exact: true,
      })
      .setInputFiles({
        name: "replacement.png",
        mimeType: "image/png",
        buffer: await pngBytes(),
      });
    await creator
      .getByRole("button", { name: "Submit correction", exact: true })
      .click();
    await expect(photos.getByRole("status")).toContainText(
      "separate pending entry with its own link",
    );
    await expect(creator.getByRole("article")).toHaveCount(2);
    entries = await client.query(
      makeFunctionReference<"query">("photos:workspace"),
      scope,
    );
    const replacement = entries.find((e: any) => e._id !== entryId);
    expect(replacement.status).toBe("pending");
    expect(replacement.trackedPath).not.toBe(trackedPath);
    expect(replacement.firstApprovedAt).toBeUndefined();
    expect(entries.find((e: any) => e._id === entryId).status).toBe("approved");
    await creator.screenshot({
      path: `.codex/ralph/t03-${info.project.name}-replacement-entry.png`,
      fullPage: true,
    });
    expect(
      await creator.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await manager.mutation(
      makeFunctionReference<"mutation">("creatorAccess:revoke"),
      {
        ...scope,
        invitationId: invitation._id,
        operationId: "t03-browser-revoke",
      },
    );
    await expect(
      creator.getByRole("heading", { name: "Workspace unavailable" }),
    ).toBeVisible();
    await expect(creator.getByRole("img")).toHaveCount(0);
    await creator.screenshot({
      path: `.codex/ralph/t03-${info.project.name}-revoked.png`,
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

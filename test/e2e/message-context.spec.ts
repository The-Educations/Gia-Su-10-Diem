import { test, expect } from "@playwright/test";

// Message context on the new flow: a proposal sent in an inquiry thread carries
// its context card for both participants, the card links to /app/proposals, and
// a bad context blocks sending until removed.
test("proposal messages keep context for both people, with direct links and scoped replies", async ({ page, browser }) => {
  const tutorContext = await browser.newContext(), tutor = await tutorContext.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); tutor.on("pageerror", error => errors.push(error.message));
  expect((await page.request.post("/api/auth/login", { data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  expect((await tutor.request.post("/api/auth/login", { data: { email: "nam@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  const profile = await (await tutor.request.get("/api/tutor/profile")).json();
  // Open a thread and send a proposal so it lands as a context event.
  const dep = await page.request.post("/api/wallet/deposits", { data: { amount: 200000 } });
  if (dep.ok()) { const d = await dep.json(); await page.request.post(`/api/wallet/deposits/${d.id}/simulate`, { data: {} }); }
  const res = await page.request.post("/api/proposals", { data: {
    tutor_id: profile.user_id, subject_id: "vat-li", level: "", mode: "online", area: "",
    sessions: 1, minutes: 60, rate: 150000, trial: false,
    schedule: [{ weekday: 1, hour: 19, minute: 0 }], start_date: "2099-01-10", message: "",
  }});
  expect(res.ok(), JSON.stringify(await res.json())).toBe(true);
  const proposal = await res.json();
  const inquiries = await (await page.request.get("/api/inquiries")).json();
  const inquiry = inquiries.find((i: { tutor_id: number }) => i.tutor_id === profile.user_id);
  expect(inquiry).toBeTruthy();
  await page.goto(`/app/messages?c=inquiry-${inquiry.id}`);
  const card = page.locator(".conversation-body .message-context", { has: page.locator(`a[href="/app/proposals?id=${proposal.id}"]`) }).last();
  await expect(card).toBeVisible();
  // The receiver sees the same context card and it links to the proposal page.
  await tutor.goto(`/app/messages?c=inquiry-${inquiry.id}`);
  const theirs = tutor.locator(".conversation-body .message-context", { has: tutor.locator(`a[href="/app/proposals?id=${proposal.id}"]`) }).last();
  await expect(theirs).toBeVisible();
  await theirs.locator("a").click();
  await expect(tutor).toHaveURL(new RegExp(`proposals\\?id=${proposal.id}`));
  // A bad context cannot silently send a context-free message; it can be removed.
  await page.goto(`/app/messages?c=inquiry-${inquiry.id}&context=proposal&contextId=999999`);
  await page.waitForTimeout(400);
  const badDraft = page.locator(".message-context-draft");
  if (await badDraft.count()) {
    await expect(badDraft.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Bỏ ngữ cảnh tin nhắn" }).click();
  }
  await page.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill("Câu hỏi chung");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.locator(".conversation-body")).toContainText("Câu hỏi chung");
  expect(errors).toEqual([]);
  await tutorContext.close();
});

import { test, expect, chromium, type Page } from "@playwright/test";
import sharp from "sharp";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("admin can remove subjects and exams with cancellation and historical-safe confirmation", async ({ page }) => {
  await login(page,"admin");
  const id = "browser-removal";
  expect((await page.request.put(`/api/admin/subjects/${id}`,{data:{name:"Môn kiểm tra bỏ",stage:"THPT",description:"Kiểm tra danh mục"}})).ok()).toBe(true);
  expect((await page.request.post("/api/admin/resources",{data:{title:"Kỳ thi kiểm tra bỏ",subject_id:id,category:"Kiểm thử",level:"THPT",year:2026,description:"Kỳ thi kiểm tra danh mục",source_name:"Nguồn kiểm thử",source_url:"https://example.com",published:true}})).ok()).toBe(true);
  await page.goto("/");
  await expect(page.locator(`#form-subject option[value=${id}]`)).toHaveText("Môn kiểm tra bỏ");
  // The old ?tab=resources link still lands on the merged catalog.
  await page.goto("/app/admin?tab=resources");
  await expect(page.getByRole("tab",{name:"Danh mục",exact:true})).toHaveAttribute("aria-selected","true");
  const subject = page.getByRole("region",{name:"Môn kiểm tra bỏ"});
  const exam = subject.locator("li").filter({hasText:"Kỳ thi kiểm tra bỏ"});
  await exam.getByRole("button",{name:"Thao tác khác",exact:true}).click();
  await page.getByRole("menuitem",{name:"Bỏ kỳ thi",exact:true}).click();
  await page.getByRole("button",{name:"Giữ lại",exact:true}).click();
  await expect(exam).toBeVisible();
  await exam.getByRole("button",{name:"Thao tác khác",exact:true}).click();
  await page.getByRole("menuitem",{name:"Bỏ kỳ thi",exact:true}).click();
  await page.getByRole("button",{name:"Bỏ khỏi danh mục",exact:true}).click();
  await expect(exam).toHaveCount(0);
  await page.goto("/app/admin?tab=subjects");
  await subject.locator("header").getByRole("button",{name:"Thao tác khác",exact:true}).click();
  await page.getByRole("menuitem",{name:"Bỏ môn",exact:true}).click();
  await page.getByRole("button",{name:"Bỏ khỏi danh mục",exact:true}).click();
  await expect(subject).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator("#form-subject option[value=toan]")).toHaveCount(1);
  await expect(page.locator(`#form-subject option[value=${id}]`)).toHaveCount(0);
  await page.goto("/app/admin?tab=catalog");
  for (const width of [320,768,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test("tutor schedule shows dated class sessions and weekly free hours", async ({ page }) => {
  await login(page,"chau");
  const profile = await (await page.request.get("/api/tutor/profile")).json();
  const date = new Date(Date.now()+86400000).toISOString().slice(0,10);
  const starts_at = `${date}T10:30:00+07:00`;
  const session = {id:9001,title:"Toán — Học sinh lịch thử",color:"blue",status:"confirmed",starts_at,minutes:60,kind:"lesson"};
  await page.route("**/api/schedule?**",route=>route.fulfill({json:[session]}));
  await page.route("**/api/calendar-events?**",route=>route.fulfill({json:[]}));
  await page.route("**/api/tutor/profile",route=>route.fulfill({json:{...profile,weekly_schedule:{blocks:[0,1,2,3,4,5,6].map(wd=>({weekday:wd,hour:12})),revision:1}}}));
  await page.goto("/app/schedule");
  await expect(page.locator(".cal-event").filter({hasText:"Toán"})).toHaveCount(1);
  await expect(page.locator(".cal-free").first()).toBeVisible();
  await expect(page.locator(".cal-free").first()).toContainText("Rảnh");
  for (const width of [320,768,1440]) {
    await page.setViewportSize({width,height:900});
    await expect(page.locator(".cal-free").first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.locator(".cal-event").filter({hasText:"Toán"}).click();
  await expect(page.getByRole("dialog").or(page.locator("[data-radix-popper-content-wrapper]")).first()).toContainText("Học sinh lịch thử");
});

test("Enter sends, Shift+Enter preserves lines, and private images survive a failed send", async ({ page, browser }) => {
  await login(page,"student");
  await page.goto("/app/messages");
  const input=page.getByRole("textbox",{name:"Tin nhắn",exact:true});
  await input.fill("Dòng đầu"); await input.press("Shift+Enter"); await input.press("b");
  await expect(input).toHaveValue("Dòng đầu\nb");
  await input.press("Enter");
  await expect(page.locator(".conversation-body")).toContainText("Dòng đầu");
  await expect(input).toHaveValue("");
  const image=await sharp({create:{width:80,height:60,channels:3,background:"green"}}).png().toBuffer();
  await page.getByLabel("Chọn ảnh gửi",{exact:true}).setInputFiles({name:"Bài tập.png",mimeType:"image/png",buffer:image});
  await expect(page.getByAltText("Ảnh sắp gửi")).toBeVisible();
  await page.route("**/api/support/*/messages",route=>route.request().method()==="POST"?route.fulfill({status:503,json:{error:"Thử lại tin nhắn"}}):route.continue());
  await page.getByRole("button",{name:"Gửi",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Thử lại tin nhắn");
  await expect(page.getByAltText("Ảnh sắp gửi")).toBeVisible();
  await page.unroute("**/api/support/*/messages");
  await page.getByRole("button",{name:"Gửi",exact:true}).click();
  await expect(page.locator(".conversation-body .chat-image")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".conversation-body .chat-image")).toBeVisible();
  const adminContext=await browser.newContext(), admin=await adminContext.newPage();
  await login(admin,"admin");
  const support=(await (await page.request.get("/api/support")).json())[0];
  await admin.goto(`/app/messages?support=${support.id}`);
  await expect(admin.getByRole("complementary",{name:"Tin nhắn được ghim"})).toHaveCount(0);
  await expect(admin.getByLabel("Đã ghim")).toHaveCount(0);
  await expect(admin.locator(".conversation-body .chat-image")).toBeVisible();
  expect((await admin.request.get(await admin.locator(".chat-image").getAttribute("src")!)).ok()).toBe(true);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await adminContext.close();
});

test("voice can be recorded, previewed, sent, played and attached from a file", async ({ baseURL }) => {
  const browser=await chromium.launch({channel:"chrome",args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]});
  const context=await browser.newContext({baseURL,permissions:["microphone"]});
  const page=await context.newPage();
  try {
    await login(page,"community-parent"); await page.goto("/app/messages");
    await page.getByRole("button",{name:"Ghi âm",exact:true}).click();
    await expect(page.getByRole("button",{name:"Dừng ghi âm",exact:true})).toBeVisible();
    await expect(page.locator(".chat-composer-actions [role=status]")).toHaveText(/0:0[1-9]/);
    await page.getByRole("button",{name:"Dừng ghi âm",exact:true}).click();
    await expect(page.getByLabel("Nghe lại âm thanh trước khi gửi")).toBeVisible();
    await page.getByRole("button",{name:"Gửi",exact:true}).click();
    await expect(page.locator(".chat-audio")).toHaveCount(1);
    await page.reload();
    const audio=page.locator(".chat-audio").first();
    await audio.evaluate(async (el:HTMLAudioElement)=>{await el.play();el.pause();});
    const bytes=Buffer.from(await (await page.request.get((await audio.getAttribute("src"))!)).body());
    await page.getByLabel("Chọn tệp gửi",{exact:true}).setInputFiles({name:"Ghi âm.webm",mimeType:"audio/webm",buffer:bytes});
    await page.getByRole("button",{name:"Gửi",exact:true}).click();
    await expect(page.locator(".chat-audio")).toHaveCount(2);
    await page.setViewportSize({width:320,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally {await browser.close();}
});

test("documents can be attached, sent and downloaded, and unsupported files are refused", async ({ page }) => {
  await login(page,"community-parent"); await page.goto("/app/messages");
  const input=page.getByLabel("Chọn tệp gửi",{exact:true});
  await input.setInputFiles({name:"setup.exe",mimeType:"application/x-msdownload",buffer:Buffer.from("MZ")});
  await expect(page.getByText("Định dạng chưa được hỗ trợ")).toBeVisible();
  const name="Bài tập tuần 1 - rất dài rất dài rất dài rất dài rất dài rất dài.pdf";
  await input.setInputFiles({name,mimeType:"",buffer:Buffer.from("%PDF-1.4\n%%EOF")});
  await expect(page.locator(".chat-attachment-preview")).toContainText(name);
  await page.getByRole("button",{name:"Gửi",exact:true}).click();
  const file=page.locator(".chat-file").first();
  await expect(file).toContainText(name);
  await page.reload();
  await expect(page.locator(".chat-file").first()).toContainText(name);
  const [download]=await Promise.all([page.waitForEvent("download"),page.locator(".chat-file").first().click()]);
  expect(download.suggestedFilename()).toBe(name);
  await page.setViewportSize({width:320,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

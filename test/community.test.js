import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/local-db.js";
import { migrateDatabase, one, run, tokenHash } from "../server/db.js";
import { createApi } from "../server/api.js";
import { seedCatalog } from "../server/seed-catalog.js";
import { authorLabel, findContactInfo, displayNameSchema } from "../server/community-policy.js";

async function fixture(t) {
  const db = openDatabase(":memory:"); seedCatalog(db);
  const ids = {};
  for (const [key, role, learner] of [["student","student","student"],["parent","student","parent"],["tutor","tutor","student"],["pending","tutor","student"],["admin","admin","student"],["other","student","student"]]) {
    ids[key] = Number(run(db, "INSERT INTO users(name,email,password,role,learner_type,display_name) VALUES (?,?,?,?,?,?)", `Private ${key} Real Name`, `${key}@private.test`, "unused", role, learner, key === "admin" ? "" : `Public ${key}`).lastInsertRowid);
    if (role === "tutor") run(db, "INSERT INTO tutors(user_id,status) VALUES (?,?)", ids[key], key === "tutor" ? "approved" : "pending");
    run(db, "INSERT INTO sessions VALUES (?,?,?)", tokenHash(key), ids[key], Date.now() + 600000);
  }
  migrateDatabase(db);
  const server = createApi(db, { limit: false }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  t.after(async () => { await new Promise(r => server.close(r)); db.close(); });
  const call = async (user, path, method = "GET", body = {}) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(user ? {Cookie:`giasu_session=${user}`} : {}) }, ...(method !== "GET" ? {body:JSON.stringify(body)} : {}) });
    return { status: r.status, data: await r.json() };
  };
  const create = async (user = "student", title = "Tìm gia sư Anh văn lớp 8") => {
    const r = await call(user, "/community/posts", "POST", { title, body: "Mình muốn tìm cách học hiệu quả hơn." }); assert.equal(r.status,201,JSON.stringify(r.data)); return r.data.id;
  };
  const approve = async id => { const r = await call("admin", `/admin/community/posts/${id}/approve`, "POST"); assert.equal(r.status,200,JSON.stringify(r.data)); };
  return { db, ids, call, create, approve };
}

test("contact filtering, names and live public author labels", () => {
  for (const s of ["0912 345 678","0912.345.678","+84 912 345 678","84912345678","a@b.vn","https://example.com","www.example.org","abc.vn","Zalo: minh","telegram minh123"]) assert.ok(findContactInfo(s),s);
  for (const s of ["Lớp 10 có 35 học sinh","Học toán 2 giờ mỗi tuần","Điểm 9.5","Năm 2026"]) assert.equal(findContactInfo(s),null,s);
  for (const s of ["Admin Minh","QUẢN TRỊ","quan tri vien","a","x".repeat(31),"abc.com"]) assert.equal(displayNameSchema.safeParse(s).success,false,s);
  assert.equal(displayNameSchema.safeParse("Minh").success,true);
  const u = { id: 77, name: "Private", display_name: "Minh", role: "student", learner_type: "parent" };
  assert.deepEqual(authorLabel(u),{label:"Minh - Phụ huynh",name_part:"Minh",tier:"parent"});
  assert.equal(authorLabel({...u,role:"tutor",tutor_status:"pending"}).tier,"student");
  assert.equal(authorLabel({...u,role:"tutor",tutor_status:"approved"}).tutor_id,77);
});

test("post lifecycle, revisions, privacy, notifications and ownership", async t => {
  const {call,create,approve,db,ids} = await fixture(t);
  assert.equal((await call(null,"/community/posts","POST")).status,401);
  const id = await create();
  assert.equal((await call(null,`/community/posts/${id}`)).status,404);
  assert.equal((await call("other",`/community/posts/${id}`)).status,404);
  assert.equal((await call("student",`/community/posts/${id}`)).data.status,"pending");
  assert.equal((await call("student","/admin/community/queue")).status,403);
  assert.equal((await call("admin",`/admin/community/posts/${id}/reject`,"POST",{note:""})).status,400);
  await call("admin",`/admin/community/posts/${id}/reject`,"POST",{note:"Hãy bổ sung mục tiêu học"});
  assert.equal((await call("student",`/community/posts/${id}`)).data.review_note,"Hãy bổ sung mục tiêu học");
  await call("student",`/community/posts/${id}`,"PUT",{title:"Anh văn lớp 8",body:"Bản cũ"});
  await approve(id);
  const published = (await call(null,`/community/posts/${id}`)).data;
  assert.equal(published.author.label,"Public student - Học sinh");
  assert.equal(published.author.id,undefined); assert.equal(published.author_id,undefined);
  assert.ok(!JSON.stringify(published).includes("Private")); assert.ok(!JSON.stringify(published).includes("@private"));
  await call("student",`/community/posts/${id}`,"PUT",{title:"Tiêu đề mới",body:"Bản sửa riêng tư"});
  assert.equal((await call(null,`/community/posts/${id}`)).data.body,"Bản cũ");
  assert.equal((await call(null,`/community/posts/${id}`)).data.revision_body,undefined);
  assert.equal((await call("admin","/admin/community/queue")).data[0].owner.email,"student@private.test");
  await call("admin",`/admin/community/posts/${id}/reject`,"POST",{note:"Sửa lại"});
  assert.equal((await call(null,`/community/posts/${id}`)).data.body,"Bản cũ");
  await call("student",`/community/posts/${id}`,"PUT",{title:"Tiêu đề mới",body:"Bản được duyệt"}); await approve(id);
  const revised = (await call(null,`/community/posts/${id}`)).data;
  assert.equal(revised.body,"Bản được duyệt"); assert.equal(revised.published_at,published.published_at);
  assert.equal((await call("other",`/community/posts/${id}`,"DELETE")).status,403);
  await call("admin",`/admin/community/posts/${id}/hide`,"POST",{note:"Vi phạm"});
  assert.equal((await call(null,`/community/posts/${id}`)).status,404);
  assert.equal((await call("student",`/community/posts/${id}`,"DELETE")).status,409);
  await call("admin",`/admin/community/posts/${id}/restore`,"POST");
  run(db,"UPDATE users SET status='suspended' WHERE id=?",ids.student);
  assert.equal((await call(null,`/community/posts/${id}`)).status,404);
  run(db,"UPDATE users SET status='active' WHERE id=?",ids.student);
  assert.ok((await call("student","/community/notifications/unread-count")).data.count > 0);
  await call("student","/community/notifications/read","POST",{all:true});
  assert.equal((await call("student","/community/notifications/unread-count")).data.count,0);
  await call("student",`/community/posts/${id}`,"DELETE"); assert.equal((await call(null,`/community/posts/${id}`)).status,404);
});

test("comments, flattened replies, helpful, best answer, removal and suspension", async t => {
  const {call,create,approve,db,ids} = await fixture(t);
  const id = await create();
  assert.equal((await call("parent",`/community/posts/${id}/comments`,"POST",{body:"Học đều nhé"})).status,404);
  await approve(id);
  const add = async (user, body, parent_id) => { const r=await call(user,`/community/posts/${id}/comments`,"POST",{body,parent_id}); assert.equal(r.status,201,JSON.stringify(r.data)); return r.data; };
  const root = await add("parent","Mình có kinh nghiệm này");
  assert.equal(root.author.label,"Public parent - Phụ huynh");
  const reply = await add("tutor","Chia sẻ cách học",root.id);
  assert.equal(reply.author.label,"Private tutor Real Name - Gia sư");
  assert.equal(reply.author.tutor_id,ids.tutor);
  const third = await add("pending","Cảm ơn",reply.id); assert.equal(third.parent_id,root.id);
  assert.equal(third.author.label,"Public pending - Học sinh");
  assert.equal((await call("parent",`/community/comments/${root.id}/helpful`,"PUT")).status,403);
  assert.equal((await call("admin",`/community/comments/${root.id}/helpful`,"PUT")).status,403);
  await call("student",`/community/comments/${root.id}/helpful`,"PUT"); await call("student",`/community/comments/${root.id}/helpful`,"PUT");
  assert.equal((await call(null,`/community/posts/${id}/comments`)).data.items[0].helpful_count,1);
  await call("student",`/community/posts/${id}/solve`,"POST",{solved:true,best_comment_id:reply.id});
  assert.equal((await call(null,`/community/posts/${id}/comments`)).data.best.id,reply.id);
  assert.equal((await call("parent",`/community/posts/${id}/solve`,"POST",{solved:true})).status,403);
  await call("parent",`/community/comments/${root.id}`,"PATCH",{body:"Kinh nghiệm đã sửa"});
  assert.equal((await call(null,`/community/posts/${id}/comments`)).data.items[0].edited,true);
  run(db,"UPDATE tutors SET status='approved' WHERE user_id=?",ids.pending);
  assert.equal((await call(null,`/community/posts/${id}/comments`)).data.items[0].replies[1].author.tier,"tutor");
  run(db,"UPDATE users SET status='suspended' WHERE id=?",ids.tutor);
  assert.equal((await call(null,`/community/posts/${id}/comments`)).data.best,null);
  run(db,"UPDATE users SET status='active' WHERE id=?",ids.tutor);
  await call("admin",`/admin/community/comments/${root.id}`,"DELETE",{note:"Không phù hợp"});
  const removed = (await call(null,`/community/posts/${id}/comments`)).data.items[0];
  assert.equal(removed.body,""); assert.equal(removed.author,null); assert.equal(removed.replies.length,2);
  await call("tutor",`/community/comments/${reply.id}`,"DELETE");
  assert.equal(one(db,"SELECT best_comment_id FROM community_posts WHERE id=?",id).best_comment_id,null);
});

test("names, contact validation, quotas, reports, community lock and audit", async t => {
  const {call,create,approve,db,ids} = await fixture(t);
  run(db,"UPDATE users SET display_name='' WHERE id=?",ids.student);
  assert.equal((await call("student","/community/posts","POST",{title:"Học toán",body:"Tìm gia sư"})).status,409);
  assert.equal((await call("student","/community/me/display-name","PUT",{display_name:"Quản Trị"})).status,400);
  await call("student","/community/me/display-name","PUT",{display_name:"Minh"});
  await call("tutor","/community/me/display-name","PUT",{display_name:"Châu"});
  assert.equal(one(db,"SELECT status FROM tutors WHERE user_id=?",ids.tutor).status,"approved");
  assert.equal((await call("student","/community/posts","POST",{title:"Gọi 0912.345.678",body:"Tìm gia sư"})).status,400);
  const id = await create(); await approve(id);
  for(let i=0;i<5;i++) assert.equal((await call("parent",`/community/posts/${id}/comments`,"POST",{body:"Học toán mỗi ngày"})).status,201);
  assert.equal((await call("parent",`/community/posts/${id}/comments`,"POST",{body:"Thêm bình luận"})).status,429);
  await create(); await create();
  assert.equal((await call("student","/community/posts","POST",{title:"Bài thứ tư",body:"Nội dung"})).status,429);
  const report={target_type:"post",target_id:id,reason:"Khác"};
  assert.equal((await call("parent","/community/reports","POST",report)).status,201);
  assert.equal((await call("parent","/community/reports","POST",report)).status,409);
  const reports=(await call("admin","/admin/community/reports")).data;
  assert.equal(reports[0].owner.id,ids.student);
  await call("admin",`/admin/community/reports/${reports[0].id}/resolve`,"POST",{resolution:"Đã xem xét"});
  assert.equal((await call("admin","/admin/community/reports")).data.length,0);
  await call("admin",`/admin/community/users/${ids.parent}/lock`,"PATCH",{locked:true,reason:"Vi phạm lặp lại"});
  assert.equal((await call("parent",`/community/posts/${id}/comments`,"POST",{body:"Học toán"})).status,403);
  assert.equal((await call("parent",`/community/posts/${id}`)).status,200);
  assert.equal((await call("parent","/auth/me")).status,200);
  assert.ok(one(db,"SELECT id FROM audit WHERE action='community.user.lock'"));
});

test("search, subject and level filters, helpful sorting, paging, rules and repeat migrations", async t => {
  const {call,db,ids} = await fixture(t);
  run(db,"INSERT INTO posts(title,summary,body,author_id) VALUES ('Tin tức','Tóm tắt','Nội dung',?)",ids.admin);
  migrateDatabase(db); migrateDatabase(db);
  assert.equal(one(db,"SELECT COUNT(*) n FROM community_posts WHERE kind='rules'").n,1);
  assert.equal(one(db,"SELECT COUNT(*) n FROM posts").n,1);
  for(let i=0;i<22;i++) await call("admin","/admin/community/posts","POST",{title:i===0?"Anh văn lớp 8":"Toán lớp 10",body:"Kinh nghiệm học"});
  const filtered=(await call(null,"/community/posts?q=anh%20van&subject=tieng-anh&level=THCS")).data;
  assert.equal(filtered.items.length,1); assert.equal(filtered.rules.kind,"rules");
  assert.equal((await call(null,"/community/posts?level=Ti%E1%BB%83u%20h%E1%BB%8Dc")).data.items.length,0);
  assert.equal((await call(null,"/community/posts?q=%25")).data.items.length,0);
  assert.equal((await call(null,"/community/posts?q=no-match")).data.rules.kind,"rules");
  const page1=(await call(null,"/community/posts")).data,page2=(await call(null,"/community/posts?page=2")).data;
  assert.equal(page1.items.length,20); assert.equal(page1.more,true); assert.equal(page2.rules,null); assert.equal(page2.items.length,2);
  const id=filtered.items[0].id;
  const c=(await call("student",`/community/posts/${id}/comments`,"POST",{body:"Rất hay"})).data;
  await call("parent",`/community/comments/${c.id}/helpful`,"PUT");
  assert.equal((await call(null,"/community/posts?sort=helpful")).data.items[0].id,id);
  assert.equal((await call(null,"/community/sitemap")).data.length,23);
  const noAdmin=openDatabase(":memory:");migrateDatabase(noAdmin);noAdmin.close();
});

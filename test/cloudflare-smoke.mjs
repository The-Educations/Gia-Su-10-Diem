import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
const base=process.env.TEST_ORIGIN || 'http://127.0.0.1:4176';
for (const path of ['/', '/app/tutors', '/app/auth', '/app/library']) {
 const page = await fetch(base + path, {redirect: 'manual'});
 assert.equal(page.status, 200, `${path} must serve HTML without asset canonicalization redirects`);
 const html = await page.text();
 assert.ok(path === '/' ? html.includes('learning-journey') : html.includes('id="root"'), path);
}
for (const path of ['/favicon.ico', '/apple-touch-icon.png', '/favicon-32.png', '/assets/brand-icon-20261031.svg', '/assets/brand-icon-20261031.png']) {
 const icon = await fetch(base + path);
 assert.equal(icon.status, 200, path);
 assert.match(icon.headers.get('content-type'), /image/, path);
 assert.equal(icon.headers.get('cache-control'), 'no-cache', path);
}
const email=`cf-${Date.now()}@example.test`;
const res=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Cloudflare test',email,password:'RuntimeTest2026!',role:'tutor'})});
assert.equal(res.status,201,await res.text());
const cookie=res.headers.getSetCookie().find(c=>c.startsWith('giasu_session='))?.split(';')[0];
const get=path=>fetch(base+path,{headers:{Cookie:cookie}});
assert.equal((await get('/api/auth/me')).status,200);
const setup = async (body) => {
 const response = await fetch(base + '/api/account/onboarding', {method:'PUT', headers:{Cookie:cookie,'Content-Type':'application/json'}, body:JSON.stringify(body)});
 assert.equal(response.status,200,await response.clone().text());
 return (await response.json()).user;
};
assert.equal((await (await get('/api/auth/me')).json()).user.onboarding_step,0);
assert.equal((await setup({step:0,role:'tutor'})).onboarding_step,1);
assert.equal((await setup({step:1,name:'Cloudflare test',headline:'Gia sư kiểm thử',bio:'Học theo mục tiêu.',education:'Sư phạm Toán',subjects:['toan'],rate:150000,experience:1,location:'Trực tuyến',mode:'online'})).onboarding_step,2);
assert.equal((await setup({step:2})).onboarding_step,3);

const photo=await sharp({create:{width:80,height:80,channels:3,background:'#852f36'}}).png().toBuffer();
for(const [kind,body,type] of [['photo',photo,'image/png'],['cv',await (async()=>{const p=await PDFDocument.create();p.addPage();return p.save();})(),'application/pdf']]){
 const upload=await fetch(base+'/api/tutor/uploads/'+kind,{method:'PUT',headers:{Cookie:cookie,'Content-Type':type,'X-File-Name':kind+'.'+(kind==='cv'?'pdf':'png')},body});
 assert.equal(upload.status,200,await upload.clone().text());
 const data=await upload.json();const url=kind==='photo'?data.photo_url:data.cv.url;
 assert.equal((await get(url)).status,200);
 assert.equal((await fetch(base+url)).status,404);
}
const slot=await fetch(base+'/api/tutor/slots',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({starts_at:new Date(Date.now()+3*86400000).toISOString().slice(0,13)+':00:00.000Z'})});
assert.equal(slot.status,201,await slot.text());
const profile=await(await get('/api/tutor/profile')).json();assert.equal(profile.slots.length,1);
const saved = await fetch(base + '/api/tutor/profile', {method:'PUT', headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({...profile, headline:'Gia sư kiểm thử runtime', bio:'Hướng dẫn học sinh theo mục tiêu.', education:'Sư phạm Toán', location:'Hà Nội', subjects:['toan'], teaching_style:'Giải thích bằng hình vẽ.', lesson_plan:'Ôn bài, luyện tập và phản hồi.', profile_theme:'sage'})});
assert.equal(saved.status,200,await saved.text());
const updated = await(await get('/api/tutor/profile')).json();
assert.equal(updated.profile_theme,'sage');
assert.equal(updated.lesson_plan,'Ôn bài, luyện tập và phản hồi.');
assert.equal(updated.status,'pending');

const galleryResponse = await fetch(base+'/api/tutor/gallery', {method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png','X-Caption':encodeURIComponent('Góc học tập')},body:photo});
assert.equal(galleryResponse.status,201,await galleryResponse.clone().text());
const [galleryPhoto] = await galleryResponse.json();
assert.equal((await get(galleryPhoto.url)).status,200);
assert.equal((await fetch(base+galleryPhoto.url)).status,404);
const galleryReload = await(await get('/api/tutor/profile')).json();
assert.equal(galleryReload.gallery[0].caption,'Góc học tập');
const social = await get('/api/gallery/'+galleryPhoto.id+'/social');
assert.equal(social.status,200);
assert.equal((await social.json()).comment_count,0);
assert.equal((await fetch(base+'/api/gallery/'+galleryPhoto.id+'/social')).status,404);
const app=await fetch(base+'/app/',{redirect:'manual'});assert.equal(app.headers.get('location'),base+'/');
console.log('Cloudflare runtime: registration, resumable onboarding, session, portrait/CV upload, private download, availability, custom profile, private gallery and landing routing passed.');

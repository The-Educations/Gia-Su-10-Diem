import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
const base=process.env.TEST_ORIGIN || 'http://127.0.0.1:4176';
const email=`cf-${Date.now()}@example.test`;
const res=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Cloudflare test',email,password:'RuntimeTest2026!',role:'tutor'})});
assert.equal(res.status,201,await res.text());
const cookie=res.headers.getSetCookie().find(c=>c.startsWith('giasu_session='))?.split(';')[0];
const get=path=>fetch(base+path,{headers:{Cookie:cookie}});
assert.equal((await get('/api/auth/me')).status,200);
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
const app=await fetch(base+'/app/',{redirect:'manual'});assert.equal(app.headers.get('location'),base+'/');
console.log('Cloudflare runtime: registration, session, portrait/CV upload, private download, availability and landing routing passed.');

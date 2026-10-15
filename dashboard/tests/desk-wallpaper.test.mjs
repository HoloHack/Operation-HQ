import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wallpaperUrl,readWallpaper} from '../lib/desk-wallpaper.ts';
test('wallpaper URLs allow public HTTPS and refuse local or credential-bearing locations',()=>{
 assert.equal(wallpaperUrl('https://images.example.org/night.jpg'),'https://images.example.org/night.jpg');
 for(const value of ['javascript:alert(1)','data:image/png;base64,abc','http://example.org/a.jpg','https://user:secret@example.org/a.jpg','https://localhost/a','https://127.1/a','https://10.2.3.4/a','https://172.20.0.1/a','https://192.168.1.1/a','https://[::1]/a','https://printer.local/a','https://router/a','https://printer.lan/a','https://portal.internal/a','https://home.corp/a','https://100.64.0.2/a'])assert.throws(()=>wallpaperUrl(value),undefined,value);
});
test('blocked image storage rejects promptly and closes a late connection',async()=>{
 const original=globalThis.indexedDB;let request,closed=false;
 globalThis.indexedDB={open(){request={result:{close(){closed=true;}}};queueMicrotask(()=>request.onblocked());return request;}};
 try{await assert.rejects(readWallpaper('test-account'),/blocked/);request.onsuccess();assert(closed);}finally{if(original===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=original;}
});

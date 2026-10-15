import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wallpaperUrl} from '../lib/desk-wallpaper.ts';
test('wallpaper URLs allow public HTTPS and refuse local or credential-bearing locations',()=>{
 assert.equal(wallpaperUrl('https://images.example.org/night.jpg'),'https://images.example.org/night.jpg');
 for(const value of ['javascript:alert(1)','data:image/png;base64,abc','http://example.org/a.jpg','https://user:secret@example.org/a.jpg','https://localhost/a','https://127.1/a','https://10.2.3.4/a','https://172.20.0.1/a','https://192.168.1.1/a','https://[::1]/a','https://printer.local/a'])assert.throws(()=>wallpaperUrl(value),undefined,value);
});

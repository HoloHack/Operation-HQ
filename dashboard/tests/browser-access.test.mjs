import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeProblem,displayFirstName,isBrowserTool} from '../lib/browser-access.ts';
import {requestExtension} from '../lib/extension-client.ts';
import {routeCommand} from '../lib/command-router.ts';
test('account greetings capitalize the actual first name without hardcoding other users',()=>{assert.equal(displayFirstName('shourya education'),'Shourya');assert.equal(displayFirstName('  alex Student '),'Alex');assert.equal(displayFirstName(''),'There');});
test('native tool failures distinguish disabled access, missing installation and real errors',()=>{assert.equal(bridgeProblem('Enable dashboard access in the extension popup',false).state,'disabled');assert.match(bridgeProblem(Error('Could not establish connection. Receiving end does not exist.')).detail,/same profile/);assert.equal(bridgeProblem(Error('Chrome could not create a tab')).detail,'Chrome could not create a tab');for(const tool of ['bookmarks','gmail','tabs','gleam','settings','nexus'])assert(isBrowserTool(tool));assert(!isBrowserTool('https://other-site'));});
test('Chrome messaging settles errors, timeouts and replies once without accepting late callbacks',async()=>{
 assert.equal(await requestExtension('id',{},20,{sendMessage(_id,_m,cb){cb({ok:true});}}).then(r=>r.ok),true);
 await assert.rejects(requestExtension('id',{},20,{lastError:{message:'Receiving end does not exist.'},sendMessage(_id,_m,cb){cb();}}),/Receiving end/);
 await assert.rejects(requestExtension('id',{},20,{sendMessage(){throw Error('Synchronous error');}}),/Synchronous/);
 let callback;await assert.rejects(requestExtension('id',{},5,{sendMessage(_id,_m,cb){callback=cb;}}),/did not respond/);assert.doesNotThrow(()=>callback({ok:true}));
});
test('general model access has an explicit native settings handoff rather than a fabricated answer',()=>{assert.deepEqual(routeCommand('Open local AI'),{kind:'browser',tool:'settings'});assert.equal(routeCommand('solve everything with magic').kind,'unknown');});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const pins={next:'16.4.5',react:'19.2.9','react-dom':'19.2.9','react-server-dom-webpack':'19.2.9','@vitejs/plugin-rsc':'0.5.38',vinext:'1.2.0','eslint-config-next':'16.4.5'};
test('coordinated security pins resolve to the reviewed installed versions',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('package.json',root),'utf8'));
  for(const [name,version] of Object.entries(pins)){
    assert.equal(pkg.dependencies?.[name]||pkg.devDependencies?.[name],version,name+' manifest');
    assert.equal(JSON.parse(fs.readFileSync(new URL('node_modules/'+name+'/package.json',root),'utf8')).version,version,name+' installed');
  }
});
test('lockfile no longer retains the vulnerable RSC decoder and plugin pins',()=>{
  const lock=fs.readFileSync(new URL('pnpm-lock.yaml',root),'utf8');
  for(const old of ['react-server-dom-webpack@19.2.8','@vitejs/plugin-rsc@0.5.26','vinext@1.0.0-beta.5'])assert(!lock.includes(old),old);
  const vendor=JSON.parse(fs.readFileSync(new URL('node_modules/@vitejs/plugin-rsc/dist/vendor/react-server-dom/package.json',root),'utf8'));
  assert.match(vendor.version,/^19\.3\.1(?:-|$)/,'the plugin has a separately vendored decoder');
});

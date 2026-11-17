import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describeDecoder,securityRscProof} from '../build/security-rsc-proof.ts';

function fixture(version='19.2.9') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ohq-rsc-proof-'));
  const filename=path.join(root,'cjs','react-server-dom-webpack-server.edge.production.js');
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'react-server-dom-webpack',version}));
  fs.writeFileSync(filename,'module.exports = {};\n');
  return {root,filename,clean(){fs.rmSync(root,{recursive:true,force:true});}};
}
test('decoder proof follows actual source package ownership, rejecting vulnerable or unknown versions',()=>{
  for(const version of ['19.2.9','19.3.1']){const f=fixture(version);try{const proof=describeDecoder(f.filename+'?commonjs-proxy');assert.equal(proof.version,version);assert.equal(proof.source,'cjs/react-server-dom-webpack-server.edge.production.js');assert.match(proof.sha256,/^[a-f0-9]{64}$/);}finally{f.clean();}}
  for(const version of ['19.2.8','19.3.0','20.0.0','19.2.9-canary-unreviewed','19.3.1-rc.0']){const f=fixture(version);try{assert.throws(()=>describeDecoder(f.filename),/Unreviewed bundled/);}finally{f.clean();}}
  assert.equal(describeDecoder('/application/not-a-decoder.js'),null);
});
test('production RSC gate requires decoder inclusion in output chunks, not merely installation',async()=>{
  const f=fixture();
  try{
    const plugin=securityRscProof();plugin.configResolved({root:f.root});
    const context={environment:{name:'rsc',config:{build:{write:true}}}};
    assert.doesNotThrow(()=>plugin.generateBundle.call({environment:{name:'rsc',config:{build:{write:false}}}},{},{}));
    assert.throws(()=>plugin.generateBundle.call(context,{},{}),/no proven bundled server decoder/);
    const removed={chunk:{type:'chunk',modules:{[f.filename]:{renderedLength:0}}}};
    assert.throws(()=>plugin.generateBundle.call(context,{},removed),/no proven bundled server decoder/);
    plugin.generateBundle.call(context,{},{chunk:{type:'chunk',modules:{[f.filename]:{renderedLength:30}}}});
    const proof=JSON.parse(fs.readFileSync(path.join(f.root,'.sites-runtime/security-proof/rsc.json'),'utf8'));
    assert.equal(proof.decoders[0].version,'19.2.9');
  }finally{f.clean();}
});

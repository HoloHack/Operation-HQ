import fs from 'node:fs/promises';
/** Linux profile PSS; renderer, GPU and total values are not a Mac per-tab claim. */
export async function profileMemory(profile){
 const all=[];for(const name of await fs.readdir('/proc')){if(!/^\d+$/.test(name))continue;try{const cmd=(await fs.readFile(`/proc/${name}/cmdline`,'utf8')).replaceAll('\0',' '),status=await fs.readFile(`/proc/${name}/status`,'utf8');all.push({pid:Number(name),parent:Number(status.match(/^PPid:\s+(\d+)/m)?.[1]),cmd});}catch{}}
 const ids=new Set(all.filter(p=>p.cmd.includes('--user-data-dir='+profile)&&!p.cmd.includes('--type=')).map(p=>p.pid));for(let changed=true;changed;){changed=false;for(const p of all)if(ids.has(p.parent)&&!ids.has(p.pid)){ids.add(p.pid);changed=true;}}
 const processes=[];for(const p of all.filter(p=>ids.has(p.pid))){try{const roll=await fs.readFile(`/proc/${p.pid}/smaps_rollup`,'utf8'),pss=Number(roll.match(/^Pss:\s+(\d+)/m)?.[1])*1024;if(Number.isFinite(pss))processes.push({pid:p.pid,role:p.cmd.match(/--type=([^ ]+)/)?.[1]||'browser',pssBytes:pss});}catch{}}
 return {available:processes.length>0,rendererPssBytes:processes.filter(p=>p.role==='renderer').reduce((n,p)=>n+p.pssBytes,0),gpuPssBytes:processes.filter(p=>p.role==='gpu-process').reduce((n,p)=>n+p.pssBytes,0),profilePssBytes:processes.reduce((n,p)=>n+p.pssBytes,0),processes,note:'Disposable Linux Chromium profile PSS, not Mac per-tab RAM, a 300MB guarantee, or a 30-minute leak trace.'};
}

(async()=>{
  let appearance;try{appearance=(await chrome.storage.local.get('hq_desk_appearance_v1')).hq_desk_appearance_v1;}catch{}document.documentElement.dataset.deskSurface=appearance?.surface==='ink'?'ink':'paper';
  const build=document.createElement('p');build.id='popup-build';build.textContent='Companion '+chrome.runtime.getManifest().version;document.body.append(build);
  const status=document.getElementById('popup-status');
  const enabled=document.getElementById('bridge-enabled');
  const action=async(fn)=>{try{await fn();status.textContent='Ready.';}catch(error){status.textContent=String(error.message||error);}};
  await action(async()=>{enabled.checked=Boolean((await chrome.storage.local.get(DashboardBridge.ENABLED_KEY))[DashboardBridge.ENABLED_KEY]);});
  enabled.addEventListener('change',()=>action(()=>chrome.storage.local.set({[DashboardBridge.ENABLED_KEY]:enabled.checked})));
  document.getElementById('disconnect-sync').addEventListener('click',()=>action(()=>navigator.locks.request('hq-planning-write',()=>chrome.storage.local.remove('hq_planning_pair_v2'))));
  document.getElementById('open-dashboard').addEventListener('click',()=>action(async()=>{
    const tabs=await chrome.tabs.query({});const found=tabs.find(t=>t.url?.startsWith(DashboardBridge.ORIGIN+'/'));
    if(found){await chrome.tabs.update(found.id,{active:true});await chrome.windows.update(found.windowId,{focused:true});}
    else await chrome.tabs.create({url:DashboardBridge.ORIGIN});
  }));
  document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>action(()=>DashboardBridge.openTool(button.dataset.tool))));
})();

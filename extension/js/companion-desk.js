// Browser tools share the hosted desk's visual language; the old home remains
// available only through the explicit ?legacy=1 compatibility route.
const CompanionDesk = {
  active: new URLSearchParams(location.search).get('legacy')!=='1',
  appearance(value) {
    const v=value&&typeof value==='object'?value:{};
    return {surface:v.surface==='ink'?'ink':'paper',hue:Number.isFinite(v.hue)?Math.max(0,Math.min(359,v.hue)):152,motion:['full','balanced','reduced'].includes(v.motion)?v.motion:'balanced'};
  },
  apply(value) {
    const v=this.appearance(value);document.body.dataset.deskSurface=v.surface;document.body.dataset.deskMotion=v.motion;
    document.body.style.setProperty('--desk-hue',String(v.hue));
  },
  async init() {
    if(!this.active)return;
    document.body.dataset.workspace='tools';
    try{this.apply((await chrome.storage.local.get('hq_desk_appearance_v1')).hq_desk_appearance_v1);}catch(error){this.apply(null);window.HQEarlyDiagnostics?.record('desk-appearance',String(error?.message||error));}
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.hq_desk_appearance_v1)this.apply(changes.hq_desk_appearance_v1.newValue);});
    const shell=document.getElementById('companion-desk');shell.hidden=false;
    document.getElementById('desk-advanced').disabled=true;
    document.getElementById('desk-advanced').onclick=()=>document.getElementById('settings-btn').click();
    const primary=[['bookmarks-flyout','Bookmarks'],['gmail-flyout','Gmail'],['optimizer-flyout','Tabs & groups'],['calendar-flyout','Calendar & timetable'],['notes-flyout','Notes'],['assignments-flyout','Study & assessments'],['nexus-flyout','Commands'],['gleam-flyout','Gleam'],['weather-flyout','Weather'],['exam-countdown-flyout','Exams']];
    const extras=[...document.querySelectorAll('.flyout[id]')].filter(p=>!primary.some(([id])=>id===p.id)).map(p=>[p.id,p.querySelector('h2')?.textContent||p.id.replace('-flyout','').replaceAll('-',' ')]);
    for(const [id,label] of [...primary,...extras]){
      const button=document.createElement('button');button.type='button';button.disabled=true;button.textContent=label;button.dataset.deskPanel=id;button.onclick=()=>{void window.HQPanels.open(id,button).then(ok=>{if(!ok)document.getElementById('desk-tool-status').textContent='This tool could not open. Check Advanced settings → General for startup diagnostics.';}).catch(()=>{document.getElementById('desk-tool-status').textContent='This tool could not open. Try again or check Advanced settings.';});};document.getElementById('desk-tool-nav').append(button);
    }
  },
  ready(){if(!this.active)return;document.querySelectorAll("#companion-desk button").forEach(b=>b.disabled=false);document.getElementById("desk-tool-status").textContent=BootDiagnostics.issues.length?"Some modules need attention. Advanced settings → General has the details.":"Choose a tool. Your main dashboard keeps your day in view.";},
};
if(CompanionDesk.active)document.body.dataset.workspace='tools';

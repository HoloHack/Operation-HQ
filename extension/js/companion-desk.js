// Browser tools share the hosted desk's visual language; the old home remains
// available only for legacy direct links without a tool route.
const CompanionDesk = {
  active: new URLSearchParams(location.hash.slice(1)).has('tool'),
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
    this.apply((await chrome.storage.local.get('hq_desk_appearance_v1')).hq_desk_appearance_v1);
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.hq_desk_appearance_v1)this.apply(changes.hq_desk_appearance_v1.newValue);});
    const shell=document.getElementById('companion-desk');shell.hidden=false;
    document.getElementById('desk-advanced').onclick=()=>document.getElementById('settings-btn').click();
    for(const [id,label] of [['bookmarks-flyout','Bookmarks'],['gmail-flyout','Gmail'],['optimizer-flyout','Tabs & groups'],['calendar-flyout','Calendar & timetable'],['notes-flyout','Notes'],['assignments-flyout','Study & assessments'],['nexus-flyout','Commands'],['gleam-flyout','Gleam'],['weather-flyout','Weather'],['exam-countdown-flyout','Exams']]){
      const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.deskPanel=id;button.onclick=()=>void window.HQPanels.open(id,button);document.getElementById('desk-tool-nav').append(button);
    }
  },
};
if(CompanionDesk.active)document.body.dataset.workspace='tools';

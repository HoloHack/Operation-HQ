// Durable, bounded new-bookmark work. No page polling, model or network requests.
class BookmarkAutoQueue {
  constructor({storage,locks,alarms,sort,now=()=>Date.now()}) {
    Object.assign(this,{storage,locks,alarms,sort,now});
    this.key='hq_bookmark_auto_queue_v1';this.statusKey='hq_bookmark_automation_status_v1';
    this.alarm='hq-bookmark-auto-retry';this.flight=null;
  }
  async locked(run){if(!this.locks?.request)throw Error('Bookmark coordination is unavailable.');return this.locks.request('hq-bookmark-auto-queue',run);}
  async read(){
    const value=(await this.storage.get(this.key))[this.key];if(value===undefined)return [];
    if(!Array.isArray(value)||value.length>2000||value.some(v=>!v||typeof v.id!=='string'||!v.id||v.id.length>120||typeof v.url!=='string'||v.url.length>8192||typeof v.parentId!=='string'||v.parentId.length>120||!Number.isSafeInteger(v.version)||v.version<1||!Number.isInteger(v.attempts)||v.attempts<0||v.attempts>3||v.nextAt!==null&&(!Number.isSafeInteger(v.nextAt)||v.nextAt<0)))throw Error('Saved bookmark automation needs recovery; it was left untouched.');
    return value;
  }
  async edit(change){return this.locked(async()=>{const next=change(await this.read());await this.storage.set({[this.key]:next});return next;});}
  async enqueue(id,bookmark){
    if(!bookmark?.url||(await this.storage.get('hq_realtime_sort_enabled')).hq_realtime_sort_enabled===false)return;
    if(String(id).length>120||bookmark.url.length>8192||String(bookmark.parentId).length>120)throw Error('This bookmark exceeds the automatic sorting size limit. It was left untouched.');
    await this.edit(items=>{const old=items.find(v=>v.id===String(id));if(!old&&items.length>=2000)throw Error('Bookmark automation reached 2,000 waiting links. Resolve existing destinations before adding more. No bookmark was moved.');return [...items.filter(v=>v.id!==String(id)),{id:String(id),url:bookmark.url,parentId:String(bookmark.parentId),version:(old?.version||0)+1,attempts:0,nextAt:this.now(),queuedAt:old?.queuedAt||this.now()}];});
    await this.wake();
  }
  async changed(id,change){let found=false;await this.edit(items=>items.map(v=>{if(v.id!==String(id))return v;found=true;return {...v,url:change.url||v.url,version:v.version+1,attempts:0,nextAt:this.now()};}));if(found)await this.wake();}
  async cancel(id){await this.edit(items=>items.filter(v=>v.id!==String(id)));await this.publish();}
  async retry(){await this.edit(items=>items.map(v=>({...v,version:v.version+1,attempts:0,nextAt:this.now()})));return this.wake();}
  async publish(extra={}){
    const saved=await this.storage.get(['hq_realtime_sort_enabled',this.statusKey]),items=await this.read();
    const status={...(saved[this.statusKey]||{}),enabled:saved.hq_realtime_sort_enabled!==false,pending:items.filter(v=>v.nextAt!==null).length,needsEvidence:items.filter(v=>v.nextAt===null).length,checkedAt:this.now(),...extra};
    await this.storage.set({[this.statusKey]:status});return status;
  }
  async schedule(){
    const items=await this.read(),saved=await this.storage.get('hq_realtime_sort_enabled');
    if(saved.hq_realtime_sort_enabled===false||!items.some(v=>v.nextAt!==null)){await this.alarms.clear(this.alarm);return;}
    await this.alarms.create(this.alarm,{delayInMinutes:1,periodInMinutes:1});
  }
  async wake(){
    try{await this.schedule();}catch(error){await this.storage.set({[this.statusKey]:{lastError:String(error?.message||error).slice(0,400),checkedAt:this.now()}}).catch(()=>{});throw error;}
    if(this.flight){this.again=true;return this.flight;}
    const work=this.drain();this.flight=work;
    try{return await work;}finally{if(this.flight===work)this.flight=null;if(this.again){this.again=false;await this.wake();}}
  }
  async drain(){
    try{
      if((await this.storage.get('hq_realtime_sort_enabled')).hq_realtime_sort_enabled===false)return await this.publish();
      await this.locks.request('hq-bookmark-mutations',{ifAvailable:true},async lock=>{
        if(!lock)return;
        if((await this.storage.get('hq_bookmark_pending_v1')).hq_bookmark_pending_v1?.moves?.length){await this.publish({lastError:'An interrupted bookmark move needs Undo before automatic sorting resumes.'});return;}
        const due=(await this.read()).filter(v=>v.nextAt!==null&&v.nextAt<=this.now()).slice(0,25);
        for(const entry of due){
          if((await this.storage.get('hq_realtime_sort_enabled')).hq_realtime_sort_enabled===false)break;
          const current=(await this.read()).find(v=>v.id===entry.id);if(!current||current.version!==entry.version)continue;
          let result;try{result=await this.sort(entry);}catch(error){await this.publish({lastError:String(error?.message||error).slice(0,400)});continue;}
          await this.edit(items=>items.flatMap(v=>{if(v.id!==entry.id||v.version!==entry.version)return [v];if(result.done)return [];const attempts=v.attempts+1;return [{...v,attempts,nextAt:attempts>=3?null:this.now()+60000}];}));
          await this.publish({lastError:'',lastOutcome:{id:entry.id,outcome:result.outcome,title:String(result.title||'').slice(0,180),at:this.now()}});
        }
      });
      return await this.publish();
    }finally{await this.schedule();}
  }
}

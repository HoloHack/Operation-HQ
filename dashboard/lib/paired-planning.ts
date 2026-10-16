import {sanitizeHQState,type HQState} from './hq-state.ts';
import {applyBrowserImport,reviewBrowserImport} from './browser-import.ts';

export type Pairing={token:string;revision:number};
export type PairingView={connection:Pairing|null;busy:boolean;paused:boolean;message:string;lastSuccess:number|null};
export const initialPairingView=():PairingView=>({connection:null,busy:false,paused:false,lastSuccess:null,message:'Not paired. Your browser data stays local until you enable planning sync.'});
type Store={state:HQState;generation:number;ready:boolean;pending:boolean;conflict:unknown;flush:()=>Promise<void>;change:(update:(state:HQState)=>HQState)=>void};
type Options={accountId:string;store:Store;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;call:<T>(message:unknown,timeout?:number)=>Promise<T>;lock:(name:string,run:()=>Promise<void>)=>Promise<boolean>;visible:()=>boolean;changed:(view:PairingView)=>void};
type Reply={ok?:boolean;error?:string;token?:unknown;revision?:unknown;snapshot?:unknown};
const same=(a:Pairing|null,b:Pairing|null)=>a?.token===b?.token&&a?.revision===b?.revision;

/** Reject a partial acknowledgement before it can replace planning. */
export function pairedSnapshot(value:unknown):HQState{
 const v=value as HQState;
 const collections=['tasks','events','schedule','assignments','exams','habits','captures'] as const;
 if(!v||v.schemaVersion!==1||typeof v.notes?.plain!=='string'||!v.settings||!v.focus||collections.some(k=>!Array.isArray(v[k]))||JSON.stringify(v).length>1500000)throw Error('The companion returned an incomplete planning document. Your dashboard was kept.');
 const clean=sanitizeHQState(v);
 for(const key of [...collections,'releases','tombstones'] as const)if(v[key]!==undefined&&(!Array.isArray(v[key])||v[key]!.length!==clean[key]!.length))throw Error('The companion returned invalid planning records. Your dashboard was kept.');
 return clean;
}
export function readPairing(raw:string|null):Pairing|null{
 if(raw===null)return null;
 if(raw.length>4096)throw Error('Saved pairing is invalid. It was left untouched.');
 let value:Pairing;try{value=JSON.parse(raw);}catch{throw Error('Saved pairing could not be read. It was left untouched.');}
 if(!value||typeof value.token!=='string'||value.token.length<16||value.token.length>256||!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('Saved pairing is invalid. It was left untouched.');
 return {token:value.token,revision:value.revision};
}

/** One lifecycle and one cross-tab lock for pairing, exchange and disconnection. */
export class PairedPlanning{
 readonly key:string;
 view=initialPairingView();
 private active=false;
 private epoch=0;
 private flight=false;
 private options:Options;
 constructor(options:Options){this.options=options;this.key='hq-pair-v2:'+options.accountId;}
 private emit(patch:Partial<PairingView>){this.view={...this.view,...patch};if(this.active)this.options.changed(this.view);}
 private stored(){return readPairing(this.options.storage.getItem(this.key));}
 private current(ticket:number){return this.active&&ticket===this.epoch;}
 start(){this.active=true;this.epoch++;this.refresh();}
 dispose(){this.active=false;this.epoch++;}
 refresh(){if(!this.active)return;try{const connection=this.stored();this.emit({connection,...(!connection?{paused:false,lastSuccess:null,message:'Disconnected. Planning copies were kept on both sides.'}:!this.view.connection?{message:'Pairing saved on this device. Exchanges run while the dashboard is open and visible.'}:{})});}catch(e){this.emit({connection:null,paused:true,message:(e as Error).message});}}
 private unchanged(expected:Pairing|null){if(!same(this.stored(),expected))throw Error('Pairing changed in another dashboard tab. This response was ignored; retry with the current connection.');}
 private persist(expected:Pairing|null,value:Pairing|null){this.unchanged(expected);if(value)this.options.storage.setItem(this.key,JSON.stringify(value));else this.options.storage.removeItem(this.key);this.emit({connection:value});}
 private ready(){if(!this.options.store.ready||this.options.store.pending||this.options.store.conflict)throw Error('Save and resolve your dashboard before synchronizing.');}
 private ack(reply:Reply):HQState{if(!reply?.ok)throw Error(reply?.error||'The companion did not confirm this action.');return pairedSnapshot(reply.snapshot);}
 private async revoke(pair:Pairing){try{const r=await this.options.call<Reply>({type:'hq:sync:disconnect',protocol:2,accountId:this.options.accountId,token:pair.token});return r?.ok===true;}catch{return false;}}
 private async run(action:(ticket:number)=>Promise<void>){
  if(!this.active||this.flight)return false;
  this.flight=true;const ticket=this.epoch;this.emit({busy:true});
  try{
   const acquired=await this.options.lock('hq-dashboard-pair:'+this.options.accountId,async()=>{if(this.current(ticket))await action(ticket);});
   if(!acquired&&this.current(ticket))this.emit({message:'Another dashboard tab is synchronizing. Retry when it finishes.'});
   return acquired;
  }catch(e){if(this.current(ticket))this.emit({paused:true,message:(e as Error).message+' Automatic exchanges are paused. Retry when ready.'});return false;}
  finally{this.flight=false;if(this.current(ticket))this.emit({busy:false});}
 }
 async pair(approved:boolean){
  if(!approved){this.emit({message:'Confirm the browser profile and signed-in account before pairing.'});return false;}
  return this.run(async ticket=>{
   const expected=this.stored();if(expected)throw Error('This dashboard is already paired. Disconnect before replacing its baseline.');
   await this.options.store.flush();if(!this.current(ticket))return;this.ready();
   const read=await this.options.call<Reply>({type:'hq:bridge:pull',protocol:1});if(!this.current(ticket))return;if(!read?.ok)throw Error(read?.error||'Browser preview is unavailable.');
   await this.options.store.flush();if(!this.current(ticket))return;this.ready();this.unchanged(expected);
   const generation=this.options.store.generation,snapshot=this.options.store.state;
   const combined=applyBrowserImport(snapshot,reviewBrowserImport(read.snapshot),'both');
   const reply=await this.options.call<Reply>({type:'hq:sync:pair',protocol:2,accountId:this.options.accountId,approved:true,snapshot:combined},15000);
   if(!reply?.ok)throw Error(reply?.error||'Pairing was not accepted.');
   const pair=readPairing(JSON.stringify({token:reply.token,revision:reply.revision}))!;
   // A remote pair may exist already. Revoke only its exact token on local failure.
   try{
    const incoming=pairedSnapshot(reply.snapshot);
    if(!this.current(ticket))throw Error('Pairing was cancelled because this dashboard closed.');
    if(generation!==this.options.store.generation||JSON.stringify(snapshot)!==JSON.stringify(this.options.store.state))throw Error('Work changed while pairing. Your newer edits were kept. Save them, then pair again.');
    this.ready();this.persist(expected,pair);this.options.store.change(()=>incoming);
    this.emit({paused:false,lastSuccess:Date.now(),message:'Paired. Both notes versions were preserved. Planning exchanges every 30 seconds while the dashboard is open and visible; cloud status confirms saved work.'});
   }catch(e){const revoked=await this.revoke(pair);throw Error((e as Error).message+(revoked?' The unfinished pairing was revoked; existing planning copies were kept.':' The companion did not confirm revocation. Check its pairing controls before reconnecting.'));}
  });
 }
 async exchange(manual=true){
  if(!manual&&(!this.options.visible()||this.view.paused||!this.options.store.ready||this.options.store.conflict))return false;
  return this.run(async ticket=>{
   const pair=this.stored();if(!pair){this.refresh();return;}
   await this.options.store.flush();if(!this.current(ticket))return;this.ready();this.unchanged(pair);
   const generation=this.options.store.generation,snapshot=this.options.store.state;
   const reply=await this.options.call<Reply>({type:'hq:sync:exchange',protocol:2,accountId:this.options.accountId,token:pair.token,revision:pair.revision,snapshot},15000);
   if(!this.current(ticket))return;const incoming=this.ack(reply);
   if(!Number.isSafeInteger(reply.revision)||Number(reply.revision)<=pair.revision)throw Error('The companion returned an invalid revision. Your dashboard was kept.');
   if(generation!==this.options.store.generation||JSON.stringify(snapshot)!==JSON.stringify(this.options.store.state))throw Error('Work changed during browser sync. Your newer edits were kept.');
   this.ready();this.persist(pair,{...pair,revision:Number(reply.revision)});
   if(JSON.stringify(incoming)!==JSON.stringify(snapshot))this.options.store.change(()=>incoming);
   this.emit({paused:false,lastSuccess:Date.now(),message:'Companion exchange confirmed. Cloud status confirms when imported changes are saved.'});
  });
 }
 async disconnect(){return this.run(async ticket=>{
  const pair=this.stored();if(!pair){this.refresh();return;}
  const reply=await this.options.call<Reply>({type:'hq:sync:disconnect',protocol:2,accountId:this.options.accountId,token:pair.token});
  if(!this.current(ticket))return;if(!reply?.ok)throw Error(reply?.error||'Disconnection was not confirmed.');
  this.persist(pair,null);this.emit({paused:false,lastSuccess:null,message:'Disconnected. Existing planning copies were kept on both sides.'});
 });}
}

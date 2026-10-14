type Runtime={sendMessage?:(id:string,message:unknown,callback:(response:unknown)=>void)=>unknown;lastError?:{message?:string}};
/** Clear the deadline on every outcome, including synchronous Chrome errors. */
export function requestExtension<T>(id:string,message:unknown,timeout=2500,provided?:Runtime):Promise<T>{
 const runtime=provided||(globalThis as typeof globalThis&{chrome?:{runtime?:Runtime}}).chrome?.runtime;
 return new Promise((resolve,reject)=>{
  if(!runtime?.sendMessage){reject(Error('Extension bridge is not available.'));return;}
  let settled=false;const finish=(error:Error|null,response?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(response as T);};
  const timer=setTimeout(()=>finish(Error('Extension did not respond.')),timeout);
  try{runtime.sendMessage(id,message,response=>{const error=runtime.lastError;finish(error?Error(error.message||'Extension connection failed.'):null,response);});}
  catch(e){finish(e instanceof Error?e:Error('Extension connection failed.'));}
 });
}

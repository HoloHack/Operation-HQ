export type DeskWallpaper = {blob?:Blob;url?:string;name:string;dim:number};
/** Accept public HTTPS image locations; credentials and local-network URLs stay local. */
export function wallpaperUrl(input:unknown):string {
  const u=new URL(String(input||''));const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(u.protocol!=='https:'||u.username||u.password||host==='localhost'||host==='::1'||host.endsWith('.local')||host.endsWith('.localhost')||/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)||host.includes(':'))throw Error('Use a public HTTPS image URL without login credentials.');
  if(u.href.length>3000)throw Error('Image URL is too long.');return u.href;
}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('hq-desk-backgrounds-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('backgrounds');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function readWallpaper(account:string):Promise<DeskWallpaper|null>{const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('backgrounds','readonly'),r=tx.objectStore('backgrounds').get(account);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function writeWallpaper(account:string,value:DeskWallpaper|null):Promise<void>{const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('backgrounds','readwrite');if(value)tx.objectStore('backgrounds').put(value,account);else tx.objectStore('backgrounds').delete(account);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
/** Bound the retained image to one 3840-pixel bitmap, independent of cloud planning. */
export async function prepareWallpaper(file:File):Promise<DeskWallpaper>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('Choose a JPG, PNG or WebP image smaller than 20 MB.');
  const bitmap=await createImageBitmap(file);try{
    if(bitmap.width<800||bitmap.height<450)throw Error('Choose a larger image: at least 800 × 450 pixels.');
    const scale=Math.min(1,3840/bitmap.width,2160/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const context=canvas.getContext('2d');if(!context)throw Error('Image processing is unavailable.');context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image could not be saved.')),'image/jpeg',.9));canvas.width=canvas.height=1;
    if(blob.size>6*1024*1024)throw Error('This image is too large after processing. Choose another image.');return {blob,name:file.name.slice(0,160),dim:40};
  }finally{bitmap.close();}
}

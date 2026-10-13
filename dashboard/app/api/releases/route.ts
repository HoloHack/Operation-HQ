import {getChatGPTUser} from '../../chatgpt-auth';
import {searchAlias,normalizeRelease,parseViz,vizSlugs} from '../../../lib/release-tracker';
const cache=new Map<string,{expires:number;value:unknown}>();const flights=new Map<string,Promise<unknown>>();
let nextQuery=0;
async function bounded(response:Response){if(!response.ok)throw Error(response.status===429?'Release provider is rate-limited. Retry later.':`Release provider returned ${response.status}.`);const reader=response.body?.getReader();if(!reader)throw Error('Release provider returned no data.');let bytes=0,text='';const decoder=new TextDecoder();try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>1000000){await reader.cancel();throw Error('Release response exceeded the safe limit.');}text+=decoder.decode(r.value,{stream:true});}}finally{reader.releaseLock();}return text+decoder.decode();}
async function catalog(query:string,ids?:number[],kind='MANGA'){
 const key=JSON.stringify({query,ids,kind});const old=cache.get(key);if(old&&old.expires>Date.now())return old.value;
 if(flights.has(key))return flights.get(key);
 if(Date.now()<nextQuery)throw Error('Please wait a moment before another search.');nextQuery=Date.now()+2100;
 const promise=(async()=>{const q='query($search:String,$ids:[Int],$type:MediaType){Page(perPage:20){media(search:$search,id_in:$ids,type:$type,isAdult:false){id title{english romaji} type status chapters siteUrl coverImage{large} nextAiringEpisode{airingAt episode} startDate{year month day}}}}';
 const text=await bounded(await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:{search:ids?undefined:searchAlias(query),ids,type:kind}}),redirect:'error',signal:AbortSignal.timeout(10000)}));
 const data=JSON.parse(text);if(data.errors||!Array.isArray(data.data?.Page?.media))throw Error('Catalog search is unavailable. Nothing has changed.');
 const checkedAt=Date.now();const value=data.data.Page.media.map((m:Record<string,any>)=>{let nextAt=m.nextAiringEpisode?.airingAt*1000,precision='instant';if(!nextAt&&m.type==='ANIME'&&m.status==='NOT_YET_RELEASED'&&m.startDate?.year&&m.startDate?.month&&m.startDate?.day){nextAt=Date.UTC(m.startDate.year,m.startDate.month-1,m.startDate.day,12);precision='date';}return normalizeRelease({id:`anilist:${m.id}`,title:m.title.english||m.title.romaji,kind:m.type,mediaId:m.id,status:m.status,cover:m.coverImage?.large,sourceUrl:m.siteUrl,nextAt,precision,checkedAt,updatedAt:checkedAt});}).filter(Boolean);
 if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{expires:checkedAt+3600000,value});return value;})();flights.set(key,promise);try{return await promise;}finally{flights.delete(key);}
}
export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to search releases.'},{status:401});const url=new URL(request.url);try{
 const q=url.searchParams.get('q'),kind=url.searchParams.get('kind')||'MANGA',raw=url.searchParams.get('ids'),slug=url.searchParams.get('publisher');
 if(!['MANGA','ANIME'].includes(kind))throw Error('Choose manga or anime.');
 if(slug){if(!Object.values(vizSlugs).includes(slug))throw Error('Publisher series is unsupported.');const key='viz:'+slug,old=cache.get(key);if(old&&old.expires>Date.now())return Response.json({publisher:old.value});const value=parseViz(await bounded(await fetch(`https://www.viz.com/shonenjump/chapters/${slug}?locale=en`,{redirect:'error',signal:AbortSignal.timeout(10000)})),slug,Date.now());cache.set(key,{expires:Date.now()+3600000,value});return Response.json({publisher:value});}
 const ids=raw?raw.split(',').map(Number):undefined;if(ids&&(!ids.length||ids.length>20||ids.some(n=>!Number.isSafeInteger(n)||n<1)))throw Error('Refresh at most 20 valid titles.');if(!ids&&(!q||q.trim().length<2||q.length>120))throw Error('Search with 2–120 characters.');
 return Response.json({results:await catalog(q||'',ids,kind)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Release search failed.'},{status:503,headers:{'Cache-Control':'no-store'}});}}

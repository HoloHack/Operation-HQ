// Explicit synthetic-only evaluation. This module never reads or moves bookmarks.
const BookmarkEvaluation = {
  resourceKey(item, classifier) {
    // Evaluation-only alias audit; production classification stays unchanged.
    const url=new URL(item.url),host=url.hostname.toLowerCase().replace(/^www\./,"").replace(/^m\./,""),parts=url.pathname.split('/').filter(Boolean);
    const video=host==='youtu.be'?parts[0]:host==='youtube.com'?(url.searchParams.get('v')||(['shorts','embed','live'].includes(parts[0])?parts[1]:null)):null;
    return video?`youtube-video:${video}`:classifier.fingerprint(item);
  },
  validateFixture(fixture, classifier, {against=[]}={}) {
    if (!Array.isArray(fixture?.cases) || !fixture.cases.length || fixture.cases.length>64) throw new Error("Invalid synthetic evaluation cases.");
    if (!Array.isArray(against) || against.length>64) throw new Error("Invalid comparison cohort.");
    const validate=rows=>{
      const ids=new Set(),resources=new Map(),unique=[];
      for(const item of rows){
        if(!item||typeof item.id!=="string"||!item.id.trim()||item.id!==item.id.trim()||item.id.length>120||ids.has(item.id))throw new Error("Invalid or duplicate evaluation IDs.");
        ids.add(item.id);
        for(const [field,limit]of [["title",2000],["url",6000],["pageContext",3000]]){
          if(field==="pageContext"&&item[field]===undefined)continue;
          if(typeof item[field]!=="string"||item[field].length>limit)throw new Error(`Invalid evaluation ${field}.`);
        }
        let url;try{url=new URL(item.url);}catch{throw new Error("Invalid evaluation URL.");}
        if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error("Invalid evaluation URL.");
        if(item.expected!==null){
          const normalized=classifier.normalizePath(item.expected,{allowOperational:false});
          if(!Array.isArray(item.expected)||!normalized||JSON.stringify(Array.from(normalized))!==JSON.stringify(item.expected))throw new Error("Invalid evaluation taxonomy label.");
        }
        const key=this.resourceKey(item,classifier),label=JSON.stringify(item.expected);
        if(resources.has(key)){
          if(resources.get(key)!==label)throw new Error("Conflicting labels for one evaluation resource.");
        }else{resources.set(key,label);unique.push(item);}
      }
      return {resources,unique};
    };
    const current=validate(fixture.cases),other=validate(against);
    for(const key of current.resources.keys())if(other.resources.has(key))throw new Error("Evaluation cohorts overlap on a resource.");
    return current.unique;
  },
  async hash(value) {
    if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") throw new Error("Evaluation hashing is unavailable.");
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,"0")).join("");
  },
  metrics(rows) {
    const accepted=rows.filter(row=>row.prediction),correct=accepted.filter(row=>JSON.stringify(row.prediction)===JSON.stringify(row.expected)).length;
    return {total:rows.length,accepted:accepted.length,correctAccepted:correct,incorrectAccepted:accepted.length-correct,abstained:rows.length-accepted.length,coverage:rows.length?accepted.length/rows.length:null,selectiveAccuracy:accepted.length?correct/accepted.length:null};
  },
  async evaluate({ai,classifier,fixture,against=[],signal,onProgress=()=>{}}) {
    if (!ai?.isLoadedThisSession() || !ai._engine) throw new Error("Load a local model explicitly first. Evaluation will not download or load one.");
    if (ai.isRunning() || ai._unloading) throw new Error("Local AI is busy. Wait before evaluating.");
    const cases=this.validateFixture(fixture,classifier,{against});
    const engine=ai._engine,modelId=ai.MODEL_ID,profileId=ai.profileId,cancelEpoch=ai._cancelEpoch,started=Date.now();
    const cancelled=()=>signal?.aborted||ai._unloading||ai._engine!==engine||ai.MODEL_ID!==modelId||ai.profileId!==profileId||ai._cancelEpoch!==cancelEpoch;
    const taxonomy=Object.fromEntries(classifier.ROOTS.map(root=>[root,classifier.MANAGED_SUBFOLDERS[root]||[]]));
    const inputs=cases.map(item=>({id:String(item.id),title:String(item.title||""),url:String(item.url||""),pageContext:String(item.pageContext||"")}));
    const inputHash=await this.hash(JSON.stringify(inputs)),fixtureHash=await this.hash(JSON.stringify(fixture)),traces=[],predictions=new Map();
    const counts={missing:0,rejectedItemsInDecodedResponses:0,malformedResponses:0,invalidShapeResponses:0,oversizedResponses:0,failedCases:0,failedBatches:0,cancelledCases:0,completedCases:0};
    const replay=withEvidence=>cases.map(item=>{
      const input=withEvidence?{...item,title:[item.title,item.pageContext].filter(Boolean).join(' ')}:item;
      // Guard the owner's original title, not the metadata-enriched string.
      const result=classifier.shouldNeverSort(item.title)?{source:"protected-title"}:classifier.classify(input,{},[]);
      return {id:item.id,expected:item.expected,source:result.source,path:result.path?Array.from(result.path):null,prediction:result.confidence==="high"&&result.path?Array.from(result.path):null};
    });
    const baseline=replay(false),evidenceBaseline=replay(true);
    let interrupted=false;
    for(let start=0;start<inputs.length;start+=8){
      if(cancelled()){counts.cancelledCases+=inputs.length-start;interrupted=true;break;}
      const batch=inputs.slice(start,start+8),raw=[],at=Date.now();
      const cancel=()=>ai.cancelActive();signal?.addEventListener("abort",cancel,{once:true});
      try{
        const decisions=await ai.classifyBookmarks(batch,taxonomy,{onTrace:trace=>raw.push(trace)});
        if(cancelled()){counts.cancelledCases+=inputs.length-start;interrupted=true;break;}
        for(const decision of decisions)predictions.set(decision.id,decision);
        counts.completedCases+=batch.length;counts.missing+=batch.filter(item=>!decisions.some(decision=>decision.id===item.id)).length;
      }catch(error){
        if(cancelled()){counts.cancelledCases+=inputs.length-start;interrupted=true;break;}
        counts.failedBatches++;counts.failedCases+=batch.length;traces.push({ids:batch.map(item=>item.id),error:String(error?.message||error).slice(0,300),latencyMs:Date.now()-at});
      }finally{
        signal?.removeEventListener("abort",cancel);
        for(const trace of raw){
          if(trace.validation==="decoded-array")counts.rejectedItemsInDecodedResponses+=trace.rejectedItems;
          else if(trace.validation==="malformed-json")counts.malformedResponses++;
          else if(trace.validation==="non-array")counts.invalidShapeResponses++;
          else if(trace.validation==="oversized")counts.oversizedResponses++;
          traces.push({...trace,promptHash:await this.hash(trace.system),inputHash:await this.hash(trace.input),batchElapsedMs:Date.now()-at});
        }
      }
      onProgress({completed:Math.min(start+batch.length,inputs.length),total:inputs.length});
    }
    const suggestions=baseline.map(row=>{const decision=predictions.get(row.id);return {id:row.id,expected:row.expected,prediction:row.source!=="protected-title"&&decision?.confidence==="high"?[decision.root,decision.sub].filter(Boolean):null,decision:decision||null};});
    const automatic=baseline.map((row,index)=>({...row,prediction:row.prediction||(row.source!=="protected-title"&&row.path&&JSON.stringify(row.path)===JSON.stringify(suggestions[index].prediction)?row.path:null)}));
    return {version:1,scope:"Packaged synthetic cohort only; not owner bookmarks, a blinded independent benchmark, calibrated confidence or permission to auto-file model suggestions.",fixture:{name:typeof fixture.name==='string'?fixture.name.slice(0,200):'Synthetic development cohort',scope:typeof fixture.scope==='string'?fixture.scope.slice(0,2000):'',version:fixture.version,sha256:fixtureHash,comparisonResources:against.length},modelInference:interrupted?"interrupted model attempt":"explicit loaded-model attempt",model:{modelId,profileId},fixtureVersion:fixture.version,inputHash,startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started,counts,baseline:{scope:"Title and URL only; excludes supplied pageContext. Comparison with model suggestions is not pure semantic gain because evidence inputs differ.",metrics:this.metrics(baseline),cases:baseline},evidenceBaseline:{scope:"Deterministic replay with the same supplied pageContext appended to title, guarded by original protected title. No page fetching or bookmark mutation; confidence predicate unchanged.",metrics:this.metrics(evidenceBaseline),cases:evidenceBaseline},modelSuggestions:{scope:"Model sees title, URL and supplied pageContext without gold labels. Compare evidenceBaseline as well as title/URL baseline; not calibrated automatic-filing evidence.",metrics:this.metrics(suggestions),cases:suggestions},unchangedAutomaticPolicy:{scope:"Title/URL-input-only replay of the existing high-confidence deterministic / agreeing-model policy; excludes supplied pageContext. No bookmark moves or page fetching; not browser automation acceptance.",metrics:this.metrics(automatic),cases:automatic},traces};
  },
};

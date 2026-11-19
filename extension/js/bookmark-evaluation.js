// Explicit synthetic-only evaluation. This module never reads or moves bookmarks.
const BookmarkEvaluation = {
  async hash(value) {
    if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") throw new Error("Evaluation hashing is unavailable.");
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,"0")).join("");
  },
  metrics(rows) {
    const accepted=rows.filter(row=>row.prediction),correct=accepted.filter(row=>JSON.stringify(row.prediction)===JSON.stringify(row.expected)).length;
    return {total:rows.length,accepted:accepted.length,correctAccepted:correct,incorrectAccepted:accepted.length-correct,abstained:rows.length-accepted.length,coverage:rows.length?accepted.length/rows.length:null,selectiveAccuracy:accepted.length?correct/accepted.length:null};
  },
  async evaluate({ai,classifier,fixture,signal,onProgress=()=>{}}) {
    if (!ai?.isLoadedThisSession() || !ai._engine) throw new Error("Load a local model explicitly first. Evaluation will not download or load one.");
    if (ai.isRunning() || ai._unloading) throw new Error("Local AI is busy. Wait before evaluating.");
    if (!Array.isArray(fixture?.cases) || fixture.cases.length>64) throw new Error("Invalid synthetic evaluation cases.");
    const engine=ai._engine,modelId=ai.MODEL_ID,profileId=ai.profileId,cancelEpoch=ai._cancelEpoch,started=Date.now(),seen=new Set();
    const cancelled=()=>signal?.aborted||ai._unloading||ai._engine!==engine||ai.MODEL_ID!==modelId||ai.profileId!==profileId||ai._cancelEpoch!==cancelEpoch;
    const cases=fixture.cases.filter(item=>{const key=classifier.fingerprint(item);if(seen.has(key))return false;seen.add(key);return true;});
    if(new Set(cases.map(item=>item.id)).size!==cases.length)throw new Error("Duplicate evaluation IDs.");
    const taxonomy=Object.fromEntries(classifier.ROOTS.map(root=>[root,classifier.MANAGED_SUBFOLDERS[root]||[]]));
    const inputs=cases.map(item=>({id:String(item.id),title:String(item.title||""),url:String(item.url||""),pageContext:String(item.pageContext||"")}));
    const inputHash=await this.hash(JSON.stringify(inputs)),traces=[],predictions=new Map();
    const counts={missing:0,rejectedItemsInDecodedResponses:0,malformedResponses:0,invalidShapeResponses:0,oversizedResponses:0,failedCases:0,failedBatches:0,cancelledCases:0,completedCases:0};
    const baseline=cases.map(item=>{const result=classifier.shouldNeverSort(item.title)?{source:"protected-title"}:classifier.classify(item,{},[]);return {id:item.id,expected:item.expected,source:result.source,path:result.path?Array.from(result.path):null,prediction:result.confidence==="high"&&result.path?Array.from(result.path):null};});
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
    return {version:1,scope:"Synthetic development set only; not owner bookmarks, held-out evaluation, calibrated confidence or permission to auto-file model suggestions.",modelInference:interrupted?"interrupted model attempt":"explicit loaded-model attempt",model:{modelId,profileId},fixtureVersion:fixture.version,inputHash,startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started,counts,baseline:{metrics:this.metrics(baseline),cases:baseline},modelSuggestions:{metrics:this.metrics(suggestions),cases:suggestions},unchangedAutomaticPolicy:{scope:"Input-only replay of the existing high-confidence deterministic / agreeing-model policy. No bookmark moves or page fetching; not browser automation acceptance.",metrics:this.metrics(automatic),cases:automatic},traces};
  },
};

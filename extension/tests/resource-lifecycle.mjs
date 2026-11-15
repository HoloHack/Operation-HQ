import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../js/'+name,import.meta.url),'utf8');

test('companion omits hidden task DOM while legacy preserves every record and summary',()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',style:{},setAttribute(){},querySelectorAll(){return [];}});return nodes.get(id);};
 const context=vm.createContext({document:{getElementById:node,createElement:()=>({innerHTML:"",set textContent(value){this.innerHTML=String(value);}})},CompanionDesk:{active:true},Icons:{span:()=>''},escapeHtml:String,escapeAttribute:String,Date});
 vm.runInContext(read('tasks.js'),context);const tasks=vm.runInContext('Tasks',context);
 tasks.data=Array.from({length:2000},(_,i)=>({id:String(i),text:'Task '+i,priority:'low',done:i%2===0,created:Date.now()}));
 const before=JSON.stringify(tasks.data);tasks.render();assert.equal(node('task-list').innerHTML,'');assert.equal(node('task-progress-label').textContent,'1000 / 2000 done');assert.equal(JSON.stringify(tasks.data),before);
 context.CompanionDesk.active=false;tasks.render();assert.equal((node('task-list').innerHTML.match(/class="task-item/g)||[]).length,2000);assert.equal(JSON.stringify(tasks.data),before);
});

test('late statistics reads cannot recreate a closed chart; reopening uses fresh values',async()=>{
 let visible=true,created=0,destroyed=0,resolveRead;
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{width:800,height:400,textContent:'',classList:{contains:()=>visible}});return nodes.get(id);};
 const context=vm.createContext({document:{hidden:false,getElementById:node},ActivityLog:{getLastNDays:()=>new Promise(resolve=>resolveRead=resolve)},DailyTasks:{computeStreak:async()=>2,nextMilestoneGap:()=>({gap:1,next:3}),freezesRemaining:()=>1},Chart:class{constructor(){created++;}destroy(){destroyed++;}}});
 vm.runInContext(read('weekly-stats.js'),context);const stats=vm.runInContext('WeeklyStats',context);
 const pending=stats.render();visible=false;stats.release();resolveRead([]);await pending;assert.equal(created,0);assert.equal(stats.chart,null);assert.equal(node('weekly-stats-canvas').width,1);
 visible=true;context.ActivityLog.getLastNDays=async()=>[{label:'Mon',total:7,daily:2,task:4,plan:1}];await stats.render();assert.equal(created,1);assert.match(node('weekly-stats-sub').textContent,/7 completions/);
 stats.release();stats.release();assert.equal(destroyed,1);assert.equal(stats.chart,null);
 context.document.hidden=true;await stats.render();assert.equal(created,1);
});

test('venture chart buffers release without touching tasks or metrics',()=>{
 let visible=false,created=0,destroyed=0;
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{width:800,height:400,classList:{contains:()=>visible}});return nodes.get(id);};
 const context=vm.createContext({document:{hidden:false,getElementById:node},Chart:class{constructor(){created++;}destroy(){destroyed++;}},Date});
 vm.runInContext(read('venture-dashboard.js'),context);const venture=vm.runInContext('VentureDashboard',context);venture.selected='Study';venture.metrics=[{mrr:10,date:'2026-01-01'},{mrr:20,date:'2026-02-01'}];const before=JSON.stringify(venture.metrics);
 venture.renderChart([]);venture.renderMetricsChart(venture.metrics);assert.equal(created,0);
 visible=true;venture.renderChart([]);venture.renderMetricsChart(venture.metrics);assert.equal(created,2);
 venture.release();venture.release();assert.equal(destroyed,2);assert.equal(venture.chart,null);assert.equal(venture.metricsChart,null);assert.equal(JSON.stringify(venture.metrics),before);assert.equal(node('venture-metrics-canvas').width,1);
});

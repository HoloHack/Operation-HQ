import {spawnSync} from 'node:child_process';
for(const name of ['verify','integrity','bookmarks','intelligence','browser-runtime','startup-budget','bookmark-safety','bookmark-automation','bookmark-meaning','bookmark-evidence','bookmark-ai','bookmark-identity','bookmark-decision-races','model-lifecycle','bridge','calendar-safety','workspace-safety','planning-sync','backup-policy','smoke-regressions','timetable-source','resource-lifecycle']) {
 const result=spawnSync(process.execPath,[`tests/${name}.mjs`],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}


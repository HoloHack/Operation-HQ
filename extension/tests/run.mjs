import {spawnSync} from 'node:child_process';
for(const name of ['verify','integrity','bookmarks','intelligence','browser-runtime','startup-budget','bookmark-safety','model-lifecycle','bridge','calendar-safety','workspace-safety']) {
 const result=spawnSync(process.execPath,[`tests/${name}.mjs`],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}

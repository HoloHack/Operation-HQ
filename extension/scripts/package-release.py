"""Build the installable extension only. Never include test data or dependencies."""
from pathlib import Path
import zipfile,json,hashlib
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'manifest.json').read_text())
name=f'Operation-HQ-Browser-Companion-{manifest["version"]}.zip'
output=root/'release'/name
output.parent.mkdir(exist_ok=True)
skip={'node_modules','tests','test-results','scripts','release','.git','.github'}
files=[]
for path in sorted(root.rglob('*')):
 if not path.is_file():continue
 relative=path.relative_to(root)
 if any(part in skip for part in relative.parts):continue
 if relative.name in {'package.json','package-lock.json'}:continue
 if not relative.name.upper().startswith('LICENSE') and relative.suffix not in {'.js','.mjs','.css','.html','.json','.png','.md','.txt'}:continue
 files.append((path,relative.as_posix()))
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for path,relative in files:
  info=zipfile.ZipInfo('Operation-HQ-Browser-Companion/'+relative,date_time=(2026,10,8,0,0,0))
  info.compress_type=zipfile.ZIP_DEFLATED
  info.external_attr=0o100644<<16
  archive.writestr(info,path.read_bytes())
with zipfile.ZipFile(output) as archive:
 assert archive.testzip() is None
 prefix='Operation-HQ-Browser-Companion/'
 for required in ['manifest.json','popup.html','newtab.html','js/background.js','icons/icon128.png','js/lib/webllm/web-llm.js']:
  assert prefix+required in archive.namelist(),required
 assert not any('/node_modules/' in f or '/test-results/' in f for f in archive.namelist())
 assert json.loads(archive.read(prefix+'manifest.json'))['key']==manifest['key']
print(json.dumps({'zip':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'files':len(files)}))

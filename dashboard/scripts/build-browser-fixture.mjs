import {build} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
await build({configFile:false,root:path.resolve('tests/browser-fixture'),resolve:{alias:{'@':path.resolve('.')}},plugins:[react()],build:{outDir:path.resolve('test-results/browser-fixture'),emptyOutDir:true}});

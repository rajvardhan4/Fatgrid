import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
const assets={};const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.json':'application/json'};
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(!p.endsWith('.map'))assets['/'+path.relative('out',p).replaceAll('\\','/')]=[types[path.extname(p)]||'application/octet-stream',readFileSync(p).toString('base64')];}}
walk('out');mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.ts'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,plugins:[{name:'assets',setup(build){build.onResolve({filter:/^virtual:assets$/},()=>({path:'assets',namespace:'assets'}));build.onLoad({filter:/.*/,namespace:'assets'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}));}}]});
writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
console.log(`Worker built with ${Object.keys(assets).length} Next.js assets and SQL API.`);

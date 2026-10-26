import {spawnSync} from 'node:child_process';
const vercel=process.argv.includes('--vercel')||process.env.VERCEL==='1'||process.env.DEPLOY_TARGET==='vercel';
const env={...process.env,...(vercel?{DEPLOY_TARGET:'vercel'}:{})};
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit',env});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1)}
run(['node_modules/next/dist/bin/next','build']);
if(!vercel)run(['scripts/build-worker.mjs']);

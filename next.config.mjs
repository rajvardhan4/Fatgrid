import path from 'node:path';
export default function config(phase) {
 const production=phase==='phase-production-build'||phase==='phase-production-server';
 const vercel=process.env.DEPLOY_TARGET==='vercel'||process.env.VERCEL==='1';
 const exporting=production&&!vercel;
 return { ...(exporting?{output:'export'}:{}), trailingSlash:true, distDir:production?'.next':'.next-dev', outputFileTracingRoot:path.resolve('.'), outputFileTracingIncludes:{'/api/**/*':['./drizzle/*.sql']}, devIndicators:false, ...(!production&&!vercel?{async rewrites(){return [{source:'/api/:path*',destination:'http://127.0.0.1:3001/api/:path*'}]}}:{}) };
}

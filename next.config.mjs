import path from 'node:path';
export default function config(phase) {
 const exporting=phase==='phase-production-build';
 return { ...(exporting?{output:'export'}:{}), trailingSlash:true, distDir:exporting?'.next':'.next-dev', outputFileTracingRoot:path.resolve('.'), devIndicators:false, ...(exporting?{}:{async rewrites(){return [{source:'/api/:path*',destination:'http://127.0.0.1:3001/api/:path*'}]}}) };
}

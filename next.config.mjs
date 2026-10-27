import path from 'node:path';
// The app loads only same-origin scripts, styles, fonts and API calls; external links are plain navigation.
const csp=dev=>["default-src 'self'","script-src 'self' 'unsafe-inline'"+(dev?" 'unsafe-eval'":''),"style-src 'self' 'unsafe-inline'","img-src 'self' data: https:","font-src 'self' data:","connect-src 'self'"+(dev?' ws:':''),"frame-ancestors 'none'","base-uri 'self'","form-action 'self'","object-src 'none'"].join('; ');
const securityHeaders=dev=>[{key:'Content-Security-Policy',value:csp(dev)},{key:'X-Frame-Options',value:'DENY'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=()'}];
export default function config(phase) {
 const production=phase==='phase-production-build'||phase==='phase-production-server';
 const vercel=process.env.DEPLOY_TARGET==='vercel'||process.env.VERCEL==='1';
 const exporting=production&&!vercel;
 return { ...(exporting?{output:'export'}:{async headers(){return [{source:'/:path*',headers:securityHeaders(!production)}]}}), trailingSlash:true, distDir:production?'.next':'.next-dev', outputFileTracingRoot:path.resolve('.'), outputFileTracingIncludes:{'/api/**/*':['./drizzle/*.sql','./mysql/*.sql']}, devIndicators:false, ...(!production&&!vercel?{async rewrites(){return [{source:'/api/:path*',destination:'http://127.0.0.1:3001/api/:path*'}]}}:{}) };
}

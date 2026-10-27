import {ApiError,type Env} from './auth';
// Google OpenID Connect sign-in (authorization code flow). The profile is read from Google's
// userinfo endpoint with the access token received directly from Google over TLS.
export function googleConfigured(env:Env){return !!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET)}
export const googleRedirectURI=(origin:string)=>`${origin}/api/auth/google/callback/`;
export function googleAuthURL(env:Env,origin:string,state:string){
 const q=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:googleRedirectURI(origin),response_type:'code',scope:'openid email profile',state,prompt:'select_account'});
 return 'https://accounts.google.com/o/oauth2/v2/auth?'+q;
}
export async function googleProfile(env:Env,origin:string,code:string){
 const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:googleRedirectURI(origin),grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000)});
 const tokens=await token.json() as any;if(!token.ok||!tokens.access_token)throw new ApiError(502,'Google sign-in failed.');
 const info=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(15000)});
 const profile=await info.json() as any;if(!info.ok||typeof profile.email!=='string')throw new ApiError(502,'Google sign-in failed.');
 return {email:profile.email.toLowerCase() as string,name:String(profile.name||'').slice(0,100),verified:profile.email_verified===true};
}

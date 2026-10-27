import {ApiError,type Env} from './auth';
// Transactional email through Resend. Without RESEND_API_KEY and EMAIL_FROM nothing is sent.
export function emailConfigured(env:Env){return !!(env.RESEND_API_KEY&&env.EMAIL_FROM)}
export async function sendEmail(env:Env,to:string,subject:string,text:string){
 if(!emailConfigured(env))throw new ApiError(503,'Email is not configured on this server. Ask the administrator to set RESEND_API_KEY and EMAIL_FROM.','email_unavailable');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new ApiError(502,'The email could not be sent. Please try again later.','email_failed');
}

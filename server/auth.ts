import type { Database, Row } from './db';
export class ApiError extends Error { constructor(public status: number, message: string, public code = 'request_error') { super(message); } }
export type Env = Record<string, any> & { AUTH_MODE?: 'local' | 'platform'; APP_ORIGIN?: string; ADMIN_EMAIL?: string };
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const month = () => new Date().toISOString().slice(0, 7);
export const limits: Record<string,{units:number;projects:number;domains:number}> = { start: { units:10,projects:1,domains:100 }, pro:{units:10000,projects:3,domains:3000}, advanced:{units:500000,projects:15,domains:15000} };
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('');
export async function sha(text: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
export async function passwordHash(password: string, salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:600000,hash:'SHA-256'},key,256);
  return `pbkdf2:${salt}:${hex(bits)}`;
}
export function equal(a: string,b:string) { if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0; }
export async function authenticate(request: Request, db: Database, env: Env): Promise<Row|null> {
  let user: Row|null = null;
  if (env.AUTH_MODE === 'platform') {
    const uid=request.headers.get('oai-authenticated-user-id'), email=request.headers.get('oai-authenticated-user-email');
    if (!uid || !email) return null;
    const userId=`platform:${uid}`;
    let name=request.headers.get('oai-authenticated-user-full-name')||email;
    try { if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')name=decodeURIComponent(name); }catch{}
    await db.run("INSERT INTO users (id,email,name,role,period,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,role=CASE WHEN excluded.role='admin' THEN 'admin' ELSE users.role END",[userId,email.toLowerCase(),name,email.toLowerCase()===env.ADMIN_EMAIL?.toLowerCase()?'admin':'member',month(),now()]);
    user=await db.first('SELECT * FROM users WHERE id=?',[userId]);
  } else {
    const token=request.headers.get('cookie')?.match(/(?:^|;\s*)fg_session=([^;]+)/)?.[1];
    if(!token)return null;
    user=await db.first('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',[await sha(token),Date.now()]);
  }
  if(user && user.plan==='start' && user.period!==month()) {
    await db.run('UPDATE users SET units=?,period=? WHERE id=? AND period<>?',[limits[user.plan]?.units||10,month(),user.id,month()]);
    user=await db.first('SELECT * FROM users WHERE id=?',[user.id]);
  }
  return user;
}
export function safeUser(user: Row|null) { if(!user)return null;const {password_hash,...safe}=user;return safe; }
export async function sessionCookie(db:Database,userId:string,secure:boolean) {
  const token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  await db.run('INSERT INTO sessions VALUES (?,?,?)',[await sha(token),userId,Date.now()+7*86400000]);
  return `fg_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure?'; Secure':''}`;
}
export async function rateLimit(db:Database,key:string,max=30,windowMs=60000){
  const expiry=Date.now()+windowMs;
  const row=await db.first('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count',[key,expiry,Date.now(),Date.now()]);
  if(row!.count>max)throw new ApiError(429,'Too many requests. Please try again later.');
}

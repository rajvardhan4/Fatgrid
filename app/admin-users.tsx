'use client';
import {useEffect,useState} from 'react';
import {request,post,date,money,Empty,type Row} from './ui';
import {parseDomains} from '../shared/domain';
// Opens a customer's page in the Users tab; the Users tab reads ?user= when it mounts.
export function openCustomer(id:string,setTab:(t:string)=>void){history.replaceState(null,'','/admin/?tab=users&user='+encodeURIComponent(id));setTab('users');}
const jobLabels:Record<string,string>={'price-check':'Ran a price check',google:'Ran a Google scan',ai:'Ran an AI search',backlinks:'Fetched referring domains',monitor:'Checked a backlink','monitor-group':'Ran a backlink check',export:'Exported a CSV'};
const planNames:Record<string,[string,number]>={start:['Start (free)',10],pro:['Pro',10000],advanced:['Advanced',500000]};
// Turns one activity row (type, a–d) into a sentence an admin can read.
export function describe(e:Row){
 if(e.type==='signup')return {what:'Signed up',detail:`now on ${planNames[e.a]?.[0]||e.a}${e.b==='admin'?' · admin':''}`};
 if(e.type==='job'){const domains=e.a==='price-check'?parseDomains(e.d||'').domains.map(x=>x.domain):[];return {what:jobLabels[e.a]||e.a,detail:(domains.length?domains.slice(0,4).join(', ')+(domains.length>4?` +${domains.length-4} more`:''):e.d?`“${String(e.d).slice(0,80)}”`:'')+` · ${e.c??0} units`,status:e.b};}
 if(e.type==='project')return {what:`Created project “${e.a}”`,detail:e.b||''};
 if(e.type==='order')return {what:`Placed an order on ${e.a}`,detail:`${money(e.c)}${e.d?' · '+e.d:''}`,status:e.b};
 if(e.type==='support')return {what:`Opened support request “${e.a}”`,detail:'',status:e.b};
 if(e.type==='quote')return {what:`Asked for a price on ${e.a}`,detail:`${e.d||''}${e.c!=null?' · quoted '+money(e.c):''}`,status:e.b};
 if(e.type==='monitor')return {what:`Created backlink check “${e.a}”`,detail:'',status:e.b};
 if(e.type==='plan'){const [,plan,,...by]=String(e.a).split(' '),c=Number(e.c)||0;return {what:`Plan set to ${planNames[plan]?.[0]||plan}`,detail:`by ${by.join(' ')} · ${c>=0?'+':''}${c.toLocaleString()} units`};}
 if(e.type==='listing')return {what:`Submitted ${e.a} for listing`,detail:`${e.c!=null?money(e.c)+' · ':''}${e.d||''}`,status:e.b};
 return {what:e.type,detail:''};
}
const activityTypes:[string,string][]=[['','All activity'],['signup','Sign-ups'],['job','Price checks & scans'],['project','Projects'],['order','Orders'],['support','Support'],['quote','Price requests'],['monitor','Backlink checks'],['listing','Publisher listings'],['plan','Plan changes']];
export function AdminActivity({user,setTab,compact=false}:{user?:string,setTab:(t:string)=>void,compact?:boolean}){
 const [type,setType]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[data,setData]=useState<Row>({rows:[],more:false}),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);const q=new URLSearchParams({type,search:query,page:String(page),...(user?{user}:{})});request('/admin/activity?'+q).then(d=>{if(active){setData(d);setError('')}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[type,query,page,user]);
 const rows=compact?data.rows.slice(0,10):data.rows;
 return <section className="results admin-activity">{!compact&&<form className="section-bar" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search)}}><select aria-label="Activity type" value={type} onChange={e=>{setType(e.target.value);setPage(1)}}>{activityTypes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{!user&&<><input aria-label="Search customer" placeholder="Customer name or email" value={search} onChange={e=>setSearch(e.target.value)}/><button type="submit">Search</button></>}</form>}
  {error&&<div className="error" role="alert">{error}</div>}
  <div className="table-wrap"><table><thead><tr><th>When</th>{!user&&<th>Customer</th>}<th>Activity</th><th>Details</th><th>Status</th></tr></thead><tbody>{rows.map((e:Row,i:number)=>{const d=describe(e);return <tr key={e.type+e.at+i}><td className="nowrap">{date(e.at)}</td>{!user&&<td>{e.user_id&&e.email?<button className="text-link" onClick={()=>openCustomer(e.user_id,setTab)}>{e.name||e.email}</button>:<span className="muted">Visitor</span>}{e.email&&<small className="block">{e.email}</small>}</td>}<td>{d.what}</td><td className="activity-detail">{d.detail||'—'}</td><td>{d.status?<span className={'status '+d.status}>{String(d.status).replace('_',' ')}</span>:'—'}</td></tr>})}</tbody></table></div>
  {!rows.length&&!loading&&<Empty title="No activity yet">Customer actions appear here as they use the site.</Empty>}
  {loading&&<p className="muted small-note" role="status">Loading…</p>}
  {!compact&&<div className="section-bar"><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Newer</button><span>Page {page}</span><button disabled={!data.more||loading} onClick={()=>setPage(p=>p+1)}>Older</button></div>}
 </section>;
}
export function AdminOverview({setTab}:{setTab:(t:string)=>void}){
 const [o,setO]=useState<Row|null>(null),[error,setError]=useState('');
 useEffect(()=>{request('/admin/overview').then(setO).catch(e=>setError(e.message))},[]);
 if(error)return <div className="error" role="alert">{error}</div>;
 if(!o)return <p className="muted" role="status">Loading…</p>;
 const card=(label:string,value:any,note?:string,go?:string)=><button className="kpi" key={label} onClick={()=>go&&setTab(go)} disabled={!go}><span>{label}</span><b>{value}</b>{note&&<small>{note}</small>}</button>;
 return <>
  <div className="kpi-grid">
   {card('Customers',o.users.total.toLocaleString(),`${o.users.today} today · ${o.users.week} this week`,'users')}
   {card('Active this week',o.users.activeWeek.toLocaleString(),'ran a check or scan','activity')}
   {card('Price checks',o.usage.priceChecks.toLocaleString(),`${o.usage.priceChecksWeek} this week`,'activity')}
   {card('Units used this week',o.usage.unitsWeek.toLocaleString())}
   {card('Projects',o.projects.toLocaleString())}
   {card('Orders',o.orders.total.toLocaleString(),`${o.orders.drafts} unpaid drafts · ${o.orders.paid} paid`,'orders')}
   {card('Paid order value',money(o.orders.revenue),'paid, in progress or published','orders')}
   {card('Open support',o.support.open.toLocaleString(),'waiting for a reply','requests')}
   {card('Listing requests',o.listings.pending.toLocaleString(),'waiting for review','submissions')}
  </div>
  <h3 className="section-title">Most active customers (30 days)</h3>
  <section className="results"><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Checks & scans</th><th>Last active</th></tr></thead><tbody>{o.topUsers.map((u:Row)=><tr key={u.id}><td><button className="text-link" onClick={()=>openCustomer(u.id,setTab)}>{u.name||u.email}</button><small className="block">{u.email}</small></td><td>{u.plan}</td><td>{u.jobs}</td><td>{date(u.last_active)}</td></tr>)}</tbody></table></div>{!o.topUsers.length&&<Empty title="No customer activity in the last 30 days"/>}</section>
  <div className="section-title activity-heading"><h3>Latest activity</h3><button className="text-link" onClick={()=>setTab('activity')}>See all activity →</button></div>
  <AdminActivity setTab={setTab} compact/>
 </>;
}
// Manual billing until Stripe is connected: activate a plan after the customer pays, and renew it each month.
function PlanControl({account,onSaved}:{account:Row,onSaved:()=>void}){
 const [plan,setPlan]=useState<string>(account.plan),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 if(account.stripe)return <p className="small-note muted">This customer pays through Stripe, so the plan follows their subscription.</p>;
 const [name,units]=planNames[plan]||[plan,0],renew=plan===account.plan,free=plan==='start';
 async function save(){setBusy(true);setError('');setMessage('');try{await post('/admin/users/'+encodeURIComponent(account.id),{plan},'PATCH');setMessage(`${name} ${renew?'renewed':'activated'}: ${units.toLocaleString()} units for this month.`);onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="plan-control"><div className="section-bar"><label>Plan <select aria-label="Plan" value={plan} disabled={busy} onChange={e=>{setPlan(e.target.value);setMessage('')}}>{Object.entries(planNames).map(([k,[n,u]])=><option key={k} value={k}>{n} · {u.toLocaleString()} units</option>)}</select></label><button className="primary" disabled={busy||(free&&renew)} onClick={save}>{free?(renew?'Current plan':'Move to free plan'):renew?`Renew ${name}`:`Activate ${name}`}</button></div>
  <p className="small-note muted">{free?'The free plan has 10 units a month, refilled automatically.':`Use this after the customer has paid. It sets their units to ${units.toLocaleString()} for this month. Plans set here do not renew on their own: when they pay again next month, click Renew.`}</p>
  {message&&<div className="notice positive" role="status">{message}</div>}{error&&<div className="error" role="alert">{error}</div>}</div>;
}
export function AdminUsers({setTab}:{setTab:(t:string)=>void}){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[data,setData]=useState<Row>({rows:[],total:0}),[detail,setDetail]=useState<Row|null>(null),[section,setSection]=useState('projects'),[error,setError]=useState(''),[loading,setLoading]=useState(false),[version,setVersion]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');request('/admin/users?search='+encodeURIComponent(query)+'&page='+page).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[query,page,version]);
 useEffect(()=>{const id=new URLSearchParams(location.search).get('user');if(id)open(id)},[]);
 async function open(id:string){setLoading(true);setError('');try{setDetail(await request('/admin/users/'+encodeURIComponent(id)));setSection('projects');history.replaceState(null,'','/admin/?tab=users&user='+encodeURIComponent(id))}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 async function refresh(id:string){setVersion(v=>v+1);try{setDetail(await request('/admin/users/'+encodeURIComponent(id)))}catch(e){setError((e as Error).message)}}
 function close(){setDetail(null);history.replaceState(null,'','/admin/?tab=users')}
 const labels:Record<string,string>={projects:'Projects',project_domains:'Project domains',messages:'Messages',monitor_checks:'Backlink history',monitor_group_history:'Group history',orders:'Orders',support_requests:'Support requests',jobs:'Scans',ledger:'Unit history',monitors:'Backlinks',monitor_groups:'Monitor groups',publisher_decisions:'Saved publishers',quote_requests:'Quotes'};
 if(detail){const a=detail.account,s=detail.summary||{};return <>{error&&<div className="error" role="alert">{error}</div>}
  <button onClick={close}>← All customers</button>
  <section className="settings-card customer-card"><h3>{a.name} <small className="muted">{a.email}</small></h3><dl className="customer-facts">{[['Plan',a.plan],['Role',a.role],['Units left',a.units],['Joined',date(a.created_at)],['Last active',date(s.lastActive)]].map(([k,v])=><div key={k as string}><dt>{k}</dt><dd>{v??'—'}</dd></div>)}</dl><PlanControl key={a.id} account={a} onSaved={()=>refresh(a.id)}/></section>
  <div className="kpi-grid">{[['Price checks',s.priceChecks],['Scans',s.scans],['Projects',s.projects],['Backlink checks',s.monitors],['Orders',s.orders],['Support requests',s.support],['Units used',s.unitsUsed]].map(([k,v])=><div className="kpi" key={k as string}><span>{k}</span><b>{(v??0).toLocaleString()}</b></div>)}</div>
  <h3 className="section-title">What {a.name} did</h3>
  <AdminActivity key={version} user={a.id} setTab={setTab}/>
  <h3 className="section-title">All records</h3>
  <label className="section-bar">Category<select aria-label="Account record category" value={section} onChange={e=>setSection(e.target.value)}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label} ({detail.collections[key].length})</option>)}</select></label>
  <section className="results"><p className="small-note">Showing up to 100 records per category.</p>{detail.collections[section].length?<div className="table-wrap"><table><thead><tr>{Object.keys(detail.collections[section][0]).map(k=><th key={k}>{k.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{detail.collections[section].map((r:Row,i:number)=><tr key={r.id||i}>{Object.entries(r).map(([k,v])=><td key={k} style={{maxWidth:360,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{v==null?'—':String(v)}</td>)}</tr>)}</tbody></table></div>:<Empty title="No records yet"/>}</section>
 </>}
 return <>{error&&<div className="error" role="alert">{error}</div>}<form className="section-bar" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search)}}><input aria-label="Search users by name or email" placeholder="Search name or email" value={search} onChange={e=>setSearch(e.target.value)}/><button type="submit">Search</button><span>{data.total} registered customers</span></form>
 <section className="results"><div className="table-wrap"><table><thead><tr>{['Name','Email','Role','Plan','Units','Registered','Details'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{data.rows.map((u:Row)=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.plan}</td><td>{u.units}</td><td>{date(u.created_at)}</td><td><button disabled={loading} onClick={()=>open(u.id)}>View customer</button></td></tr>)}</tbody></table></div>{!data.rows.length&&!loading&&<Empty title="No users found"/>}<div className="section-bar"><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button disabled={page*50>=data.total||loading} onClick={()=>setPage(p=>p+1)}>Next</button></div></section>{loading&&<p role="status">Loading…</p>}</>;
}

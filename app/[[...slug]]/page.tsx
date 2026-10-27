import Dashboard from '../dashboard';
// Only the listed routes exist; any other path renders app/not-found.tsx with a 404 status.
export const dynamicParams=false;
export function generateStaticParams(){return [[],['inventory'],['backlinks-checker'],['backlinks-monitoring'],['google-search'],['ai-search'],['projects'],['my-orders'],['my-requests'],['pricing'],['list-your-site'],['auth','login'],['auth','register'],['auth','forgot'],['auth','reset'],['settings'],['admin']].map(slug=>({slug}));}
export default async function Page({params}:{params:Promise<{slug?:string[]}>}) { const {slug}=await params; return <Dashboard route={'/'+(slug||[]).join('/')} />; }

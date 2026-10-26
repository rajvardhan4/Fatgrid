import Dashboard from '../dashboard';
export function generateStaticParams(){return [[],['inventory'],['backlinks-checker'],['backlinks-monitoring'],['google-search'],['ai-search'],['projects'],['my-orders'],['my-requests'],['pricing'],['auth','login'],['auth','register'],['settings'],['admin']].map(slug=>({slug}));}
export default async function Page({params}:{params:Promise<{slug?:string[]}>}) { const {slug}=await params; return <Dashboard route={'/'+(slug||[]).join('/')} />; }

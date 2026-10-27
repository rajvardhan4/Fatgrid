import type {Database,Statement} from './db';
import {id,now} from './auth';
import {DEMO_SOURCE} from '../shared/domain';
// Demo inventory uses the reserved .example top-level domain, so no real site is shown with made-up prices.
const names=['techpulse','travelnest','financebeat','healthwise','foodiehub','marketingmint','edupath','sportszone','gadgetgrid','greenliving','startupdaily','cryptoledger','homecraft','petcorner','autodrive','fashionfold','gamerealm','parentpal','realtyview','beautybay','fitforge','musicmeter','cloudcoder','legalbrief','careercompass','outdoorpeak','photoframe','scienceshelf','wellnessway','budgetbuddy','smarthome','datadriven','bookbound','artisanal','hrhub','ecomedge','mobilemoves','designdesk','localnews','luxurylane'];
const categories=['Business','Technology','Finance','Health and Medicine','News and Media','Travelling','Lifestyle','Marketing and Advertising','Real estate','Education','Sports','Food','Fashion','Automotive','Games','Startups'];
const countries=['United States','United Kingdom','India','Canada','Australia','Germany','France','Netherlands','Singapore','United Arab Emirates'];
const nicheSets=['','','casino,cbd,crypto,dating,forex','crypto,forex','','casino,crypto,dating,pharma,other','cbd,dating','','crypto','casino,cbd,crypto,forex,dating,pharma'];
export function demoRows(){return names.map((name,i)=>{
 const dr=20+(i*37)%66,price=6+((i*53)%29)*9,organic=1200+((i*7919)%97)*1650,all=Math.round(organic*(1.8+(i%5)*0.9));
 const cats=[categories[i%categories.length],categories[(i*5+3)%categories.length],categories[(i*7+1)%categories.length]].filter((c,k,a)=>a.indexOf(c)===k).slice(0,1+i%3);
 const created=new Date(Date.UTC(2025,(i*5)%12,1+(i*11)%27)).toISOString();
 return {domain:`${name}.example`,title:name.replace(/^./,c=>c.toUpperCase())+' (demo)',category:cats.join(', '),country:countries[(i*7)%countries.length],language:i%9===4?'Hindi':'English',authority:Math.max(5,dr-30+(i%9)),dr,referring_domains:400+((i*613)%60)*650,traffic_top:Math.round(organic*0.42),all_traffic_top:Math.round(all*0.35),traffic:organic,monthly_min:Math.round(organic*0.18),all_traffic:all,price,linkInsertion:i%3===0?Math.round(price*0.6)+1:null,follow:i%7===3?'nofollow':'dofollow',sponsored:i%5===2?1:0,niches:nicheSets[i%nicheSets.length],created};
});}
export function demoStatements():Statement[]{
 return demoRows().flatMap(p=>[
  {sql:'INSERT INTO publishers (domain,title,category,language,country,authority,dr,traffic,referring_domains,traffic_top,all_traffic_top,all_traffic,monthly_min,niches,updated_at,metrics_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(domain) DO UPDATE SET title=excluded.title,category=excluded.category,language=excluded.language,country=excluded.country,authority=excluded.authority,dr=excluded.dr,traffic=excluded.traffic,referring_domains=excluded.referring_domains,traffic_top=excluded.traffic_top,all_traffic_top=excluded.all_traffic_top,all_traffic=excluded.all_traffic,monthly_min=excluded.monthly_min,niches=excluded.niches,updated_at=excluded.updated_at,metrics_source=excluded.metrics_source',args:[p.domain,p.title,p.category,p.language,p.country,p.authority,p.dr,p.traffic,p.referring_domains,p.traffic_top,p.all_traffic_top,p.all_traffic,p.monthly_min,p.niches,p.created,DEMO_SOURCE]},
  ...([['Guest Post',p.price],['Link Insertion',p.linkInsertion]] as const).filter(([,price])=>price!=null).map(([type,price])=>({sql:'INSERT INTO offers (id,domain,marketplace,price,type,follow,sponsored,restricted,url,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(domain,marketplace,type) DO UPDATE SET price=excluded.price,follow=excluded.follow,sponsored=excluded.sponsored,restricted=excluded.restricted,active=1,updated_at=excluded.updated_at',args:[id(),p.domain,DEMO_SOURCE,price,type,p.follow,p.sponsored,p.niches?1:0,'',now()]})),
 ]);
}
export async function loadDemo(db:Database){await db.batch(demoStatements());return demoRows().length;}
export async function clearDemo(db:Database){await db.batch([{sql:'DELETE FROM offers WHERE marketplace=?',args:[DEMO_SOURCE]},{sql:'DELETE FROM publishers WHERE metrics_source=? AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.domain=publishers.domain)',args:[DEMO_SOURCE]}]);}
export async function demoCount(db:Database){return (await db.first('SELECT COUNT(DISTINCT domain) AS n FROM offers WHERE marketplace=?',[DEMO_SOURCE]))!.n as number;}

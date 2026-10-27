import type {Database,Statement} from './db';
import {id,now} from './auth';
import {DEMO_SOURCE} from '../shared/domain';
// Demo inventory uses the reserved .example top-level domain, so no real site is shown with made-up prices.
const names=['techpulse','travelnest','financebeat','healthwise','foodiehub','marketingmint','edupath','sportszone','gadgetgrid','greenliving','startupdaily','cryptoledger','homecraft','petcorner','autodrive','fashionfold','gamerealm','parentpal','realtyview','beautybay','fitforge','musicmeter','cloudcoder','legalbrief','careercompass','outdoorpeak','photoframe','scienceshelf','wellnessway','budgetbuddy','smarthome','datadriven','bookbound','artisanal','hrhub','ecomedge','mobilemoves','designdesk','localnews','luxurylane'];
const categories=['Technology','Travel','Finance','Health','Food','Marketing','Education','Sports'];
const countries=['United States','United Kingdom','India','Canada','Australia','Germany'];
export function demoRows(){return names.map((name,i)=>{const dr=20+(i*37)%66,price=60+((i*53)%19)*25;return {domain:`${name}.example`,title:name.replace(/^./,c=>c.toUpperCase())+' (demo)',category:i<8?categories[i]:categories[(i*5)%categories.length],country:countries[(i*7)%countries.length],language:i%9===4?'Hindi':'English',authority:Math.max(5,dr-8),dr,traffic:2000+((i*7919)%95)*1500,referring_domains:150+((i*613)%60)*40,price,linkInsertion:i%3===0?Math.round(price*0.6):null,follow:i%7===3?'nofollow':'dofollow',sponsored:i%5===2?1:0,restricted:i%11===6?1:0};});}
export function demoStatements():Statement[]{
 return demoRows().flatMap(p=>[
  {sql:'INSERT INTO publishers (domain,title,category,language,country,authority,dr,traffic,referring_domains,updated_at,metrics_source) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(domain) DO UPDATE SET title=excluded.title,category=excluded.category,language=excluded.language,country=excluded.country,authority=excluded.authority,dr=excluded.dr,traffic=excluded.traffic,referring_domains=excluded.referring_domains,updated_at=excluded.updated_at,metrics_source=excluded.metrics_source',args:[p.domain,p.title,p.category,p.language,p.country,p.authority,p.dr,p.traffic,p.referring_domains,now(),DEMO_SOURCE]},
  ...([['Guest Post',p.price],['Link Insertion',p.linkInsertion]] as const).filter(([,price])=>price!=null).map(([type,price])=>({sql:'INSERT INTO offers (id,domain,marketplace,price,type,follow,sponsored,restricted,url,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(domain,marketplace,type) DO UPDATE SET price=excluded.price,follow=excluded.follow,sponsored=excluded.sponsored,restricted=excluded.restricted,active=1,updated_at=excluded.updated_at',args:[id(),p.domain,DEMO_SOURCE,price,type,p.follow,p.sponsored,p.restricted,'',now()]})),
 ]);
}
export async function loadDemo(db:Database){await db.batch(demoStatements());return demoRows().length;}
export async function clearDemo(db:Database){await db.batch([{sql:'DELETE FROM offers WHERE marketplace=?',args:[DEMO_SOURCE]},{sql:'DELETE FROM publishers WHERE metrics_source=? AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.domain=publishers.domain)',args:[DEMO_SOURCE]}]);}
export async function demoCount(db:Database){return (await db.first('SELECT COUNT(DISTINCT domain) AS n FROM offers WHERE marketplace=?',[DEMO_SOURCE]))!.n as number;}

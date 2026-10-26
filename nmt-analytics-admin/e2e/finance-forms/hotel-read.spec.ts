import {expect,test} from '@playwright/test';
import {en} from '../../src/lib/i18n/en';import {bs} from '../../src/lib/i18n/bs';
const hotels=Array.from({length:12},(_,i)=>({id:`hotel-${i+1}`,name:`Synthetic hotel ${i+1}`,destination:'Synthetic',total_rooms:0,hotel_rooms:[],hotel_allocations:[]}));
for(const lang of ['bs','en'] as const)for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`hotel directory and deep detail recovery ${lang} ${theme} ${width}`,async({page},info)=>{
 const t=lang==='bs'?bs:en;const tr=t.operations.hotels;let failList=true,failRooms=true;
 await page.setViewportSize({width,height:900});
 await page.addInitScript(({lang,theme})=>{localStorage.setItem('travline_lang',lang);localStorage.setItem('theme',theme);},{lang,theme});
 await page.route('**/__form-test-api/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname.replace('/__form-test-api','');
  if(path==='/hotels')return route.fulfill({status:failList?503:200,json:failList?{error:'Synthetic private read error'}:{data:hotels,total:12,page:1,limit:100}});
  if(path==='/hotels/hotel-12')return route.fulfill({json:hotels[11]});
  if(path==='/hotels/hotel-12/rooms')return route.fulfill({status:failRooms?503:200,json:failRooms?{error:'Synthetic rooms read error'}:[]});
  return route.fulfill({json:{data:[],total:0}});
 });
 await page.goto('/e2e/finance-forms/hotel-read.html');
 await expect(page.getByRole('alert')).toHaveText(tr.loadError);await expect(page.getByText(tr.noHotels,{exact:true})).toHaveCount(0);
 failList=false;await page.getByRole('button',{name:tr.retryLoad}).click();await expect(page.getByText('Synthetic hotel 1',{exact:true})).toBeVisible();
 await page.goto('/e2e/finance-forms/hotel-read.html?detail=hotel-12');
 await expect(page.getByRole('alert')).toHaveText(tr.loadError);await expect(page.getByText(tr.hotelNotFound,{exact:true})).toHaveCount(0);
 failRooms=false;await page.getByRole('button',{name:tr.retryLoad}).click();await expect(page.getByRole('heading',{name:'Synthetic hotel 12',exact:true})).toBeVisible();
 if(theme==='dark')await expect(page.locator('html')).toHaveClass(/\bdark\b/);else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 await page.screenshot({path:info.outputPath('hotel-detail-recovered.png')});
});

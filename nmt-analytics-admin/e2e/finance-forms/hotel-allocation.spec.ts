import {expect,test} from '@playwright/test';
import {en} from '../../src/lib/i18n/en';import {bs} from '../../src/lib/i18n/bs';
for(const lang of ['bs','en'] as const)for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`direct allocation read/save recovery and capacity ${lang} ${theme} ${width}`,async({page},info)=>{
 const t=lang==='bs'?bs:en;const tr=t.operations.hotels;let readFails=true,saveFails=true,posts=0;const saved:any[]=[];let release!:()=>void;
 const hotel={id:'hotel-1',name:'Synthetic allocation hotel',destination:'Synthetic',total_rooms:0,hotel_rooms:[],hotel_allocations:[]};
 await page.setViewportSize({width,height:900});await page.addInitScript(({lang,theme})=>{localStorage.setItem('travline_lang',lang);localStorage.setItem('theme',theme);},{lang,theme});
 await page.route('**/__form-test-api/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname.replace('/__form-test-api','');
  if(path==='/hotels')return route.fulfill({json:{data:[{...hotel,hotel_allocations:saved}],total:1}});
  if(path==='/departures')return route.fulfill({status:readFails?503:200,json:readFails?{error:'PRIVATE read'}:{data:[{id:'dep-1',packageName:'Synthetic departure',depart_at:'2026-11-01T10:00:00Z',packages:{currency:'EUR'}}],total:1}});
  if(path==='/departures/dep-1/allocations'){
   posts++;const payload=route.request().postDataJSON();expect(payload).toMatchObject({hotelId:'hotel-1',roomType:'Family',roomsReserved:3,capacityPerRoom:4,netPrice:87.25,sellPrice:0,checkIn:'2026-11-01',checkOut:'2026-11-04'});
   if(posts===1)await new Promise<void>(resolve=>{release=resolve;});
   if(saveFails)return route.fulfill({status:503,json:{error:'PRIVATE write'}});
   saved.push({id:'allocation',...payload,capacity_per_room:payload.capacityPerRoom,rooms_reserved:payload.roomsReserved});return route.fulfill({status:201,json:saved[0]});
  }
  return route.fulfill({json:{data:[],total:0}});
 });
 await page.goto('/e2e/finance-forms/hotel-read.html');await page.getByRole('button',{name:tr.allocate,exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('alert')).toHaveText(tr.allocationReadError);await expect(dialog.getByLabel(tr.roomsReserved,{exact:true})).toBeDisabled();expect(posts).toBe(0);
 readFails=false;await dialog.getByRole('button',{name:tr.retryDepartures}).click();await dialog.getByLabel(tr.departure,{exact:true}).selectOption('dep-1');
 await dialog.getByLabel(tr.roomType,{exact:true}).fill('Family');await dialog.getByLabel(tr.roomsReserved,{exact:true}).fill('3');await dialog.getByLabel(tr.allocationCapacity,{exact:true}).fill('4');
 await dialog.getByLabel(tr.checkIn,{exact:true}).fill('2026-11-01');await dialog.getByLabel(tr.checkOut,{exact:true}).fill('2026-10-31');
 await expect(dialog.getByRole('button',{name:tr.allocate,exact:true})).toBeDisabled();await dialog.getByLabel(tr.checkOut,{exact:true}).fill('2026-11-04');await dialog.getByLabel(tr.allocationNetPrice,{exact:true}).fill('87.25');
 await expect(dialog.getByText(/EUR/)).toBeVisible();await dialog.getByRole('button',{name:tr.allocate,exact:true}).dblclick();await expect.poll(()=>posts).toBe(1);
 await expect(dialog.getByLabel(tr.allocationCapacity,{exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();release();
 await expect(page.getByText(tr.allocationSaveError,{exact:true})).toBeVisible();await expect(dialog.getByLabel(tr.allocationCapacity,{exact:true})).toHaveValue('4');await expect(dialog.getByLabel(tr.allocationNetPrice,{exact:true})).toHaveValue('87.25');await expect(page.getByText('PRIVATE write')).toHaveCount(0);
 saveFails=false;await dialog.getByRole('button',{name:tr.allocate,exact:true}).click();await expect(dialog).toHaveCount(0);expect(posts).toBe(2);await expect(page.getByText(tr.allocationSaved,{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('Synthetic allocation hotel',{exact:true})).toBeVisible();expect(saved[0]).toMatchObject({capacity_per_room:4,rooms_reserved:3,netPrice:87.25,sellPrice:0});
 await page.getByRole('button',{name:tr.allocate,exact:true}).click();await expect(page.getByRole('dialog').getByLabel(tr.allocationNetPrice,{exact:true})).toHaveValue('0');
 if(theme==='dark')await expect(page.locator('html')).toHaveClass(/\bdark\b/);else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);await page.screenshot({path:info.outputPath('allocation-reopened.png')});
});

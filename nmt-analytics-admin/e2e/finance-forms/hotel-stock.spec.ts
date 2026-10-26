import {expect,test} from '@playwright/test';
import {en} from '../../src/lib/i18n/en';import {bs} from '../../src/lib/i18n/bs';
for(const lang of ['bs','en'] as const)for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`room quantity recovery and persisted stock ${lang} ${theme} ${width}`,async({page},info)=>{
 const t=lang==='bs'?bs:en;const tr=t.operations.hotels;let readFails=true,saveFails=true,posts=0;let rooms:any[]=[];
 const hotel={id:'stock-hotel',name:'Synthetic stock hotel',destination:'Synthetic',total_rooms:10,hotel_rooms:rooms,hotel_allocations:[]};
 await page.setViewportSize({width,height:900});await page.addInitScript(({lang,theme})=>{localStorage.setItem('travline_lang',lang);localStorage.setItem('theme',theme);},{lang,theme});
 await page.route('**/__form-test-api/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/__form-test-api','');const method=route.request().method();
  if(path==='/hotels/stock-hotel/rooms'&&method==='POST'){
   posts++;const data=route.request().postDataJSON();expect(data).toMatchObject({roomType:'family',capacity:4,quantity:3});
   await new Promise(resolve=>setTimeout(resolve,200));if(saveFails)return route.fulfill({status:503,json:{error:'Private room fault'}});
   const room={id:'saved-room',hotel_id:'stock-hotel',room_type:data.roomType,capacity:data.capacity,total:data.quantity,available:data.quantity,base_price:data.basePrice,currency:data.currency};rooms=[room];return route.fulfill({status:201,json:room});
  }
  if(path==='/hotels/stock-hotel/rooms')return route.fulfill({status:readFails?503:200,json:readFails?{error:'Private inventory read fault'}:rooms});
  if(path==='/hotels')return route.fulfill({json:{data:[{...hotel,hotel_rooms:rooms}],total:1}});
  return route.fulfill({json:{data:[],total:0}});
 });
 await page.goto('/e2e/finance-forms/hotel-read.html?stock=stock-hotel');const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('alert')).toHaveText(tr.roomLoadError);
 await dialog.getByLabel(tr.type,{exact:true}).fill('family');await dialog.getByLabel(tr.capacity,{exact:true}).fill('4');await dialog.getByLabel(tr.roomQuantity,{exact:true}).fill('3');
 await expect(dialog.getByRole('button',{name:tr.addRoom,exact:true})).toBeDisabled();expect(posts).toBe(0);
 readFails=false;await dialog.getByRole('button',{name:tr.retryRooms}).click();await expect(dialog.getByText(tr.noRooms,{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:tr.addRoom,exact:true}).dblclick();await expect(page.getByText(tr.roomSaveError,{exact:true})).toBeVisible();expect(posts).toBe(1);
 await expect(dialog.getByLabel(tr.type,{exact:true})).toHaveValue('family');await expect(dialog.getByLabel(tr.roomQuantity,{exact:true})).toHaveValue('3');
 await expect(page.getByText('Private room fault')).toHaveCount(0);saveFails=false;
 await dialog.getByRole('button',{name:tr.addRoom,exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText(tr.roomSaved,{exact:true})).toBeVisible();expect(posts).toBe(2);
 await page.reload();await expect(page.getByRole('dialog').getByText('family',{exact:true})).toBeVisible();await expect(page.getByRole('dialog').getByLabel(tr.roomQuantity,{exact:true})).toHaveValue('1');
 await expect(page.getByRole('dialog').getByText('3/3 '+tr.available,{exact:true})).toBeVisible();
 if(theme==='dark')await expect(page.locator('html')).toHaveClass(/\bdark\b/);else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);await page.screenshot({path:info.outputPath('custom-room-stock.png')});
});
for(const lang of ['bs','en'] as const)test(`hotel creation preserves failed drafts and blocks duplicate commit ${lang}`,async({page})=>{
 const t=lang==='bs'?bs:en;const tr=t.operations.hotels;let posts=0,fail=true;let release!:()=>void;const hotels:any[]=[];
 await page.setViewportSize({width:390,height:900});await page.addInitScript(lang=>localStorage.setItem('travline_lang',lang),lang);
 await page.route('**/__form-test-api/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/__form-test-api','');
  if(path==='/hotels'&&route.request().method()==='POST'){
   posts++;if(posts===1)await new Promise<void>(resolve=>{release=resolve;});
   if(fail)return route.fulfill({status:503,json:{error:'Private hotel fault'}});
   const hotel={...route.request().postDataJSON(),id:'created-hotel',hotel_rooms:[],hotel_allocations:[]};hotels.push(hotel);return route.fulfill({status:201,json:hotel});
  }
  return route.fulfill({json:{data:hotels,total:hotels.length}});
 });
 await page.goto('/e2e/finance-forms/hotel-read.html');await page.getByRole('button',{name:tr.add,exact:true}).first().click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel(tr.name+' *',{exact:true}).fill('Synthetic saved hotel');await dialog.getByLabel(tr.destination,{exact:true}).fill('Synthetic');
 await dialog.getByRole('button',{name:t.common.save,exact:true}).dblclick();await expect.poll(()=>posts).toBe(1);
 await expect(dialog.getByLabel(tr.name+' *',{exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();release();
 await expect(page.getByText(tr.hotelSaveError,{exact:true})).toBeVisible();await expect(dialog.getByLabel(tr.name+' *',{exact:true})).toHaveValue('Synthetic saved hotel');
 fail=false;await dialog.getByRole('button',{name:t.common.save,exact:true}).click();await expect(dialog).toHaveCount(0);expect(posts).toBe(2);await expect(page.getByText('Synthetic saved hotel',{exact:true})).toBeVisible();
});

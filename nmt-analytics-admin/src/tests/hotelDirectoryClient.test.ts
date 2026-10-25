import { beforeEach, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../api/client',()=>({get:(...args:unknown[])=>h.get(...args)}));
import {getHotels,getHotel} from '../api/operations';
beforeEach(()=>h.get.mockReset());
it('loads and normalizes all counted pages without silently truncating the directory',async()=>{
 const rows=Array.from({length:205},(_,i)=>({id:String(i),org_id:'agency',name:`Hotel ${i}`,total_rooms:i}));
 h.get.mockImplementation(async(path:string)=>{const q=new URL('https://fixture.test'+path).searchParams;const page=Number(q.get('page'));return{data:{data:rows.slice((page-1)*100,page*100),total:205}};});
 const result=await getHotels();expect(result).toHaveLength(205);expect(result[204]).toMatchObject({orgId:'agency',totalRooms:204});expect(h.get).toHaveBeenCalledTimes(3);
});
it('preserves an explicit caller limit',async()=>{
 h.get.mockResolvedValue({data:{data:Array.from({length:5},(_,i)=>({id:String(i)})),total:100}});
 expect(await getHotels({limit:5})).toHaveLength(5);expect(h.get).toHaveBeenCalledTimes(1);
});
it('rejects an interrupted second page rather than returning partial hotels',async()=>{
 h.get.mockResolvedValueOnce({data:{data:[{id:'first'}],total:2}}).mockRejectedValueOnce(Error('Synthetic failure'));
 await expect(getHotels()).rejects.toThrow('Synthetic failure');
});
it.each([{data:[],total:2},{data:[{id:'one'}],total:-1}])('rejects an incomplete or invalid directory response',async payload=>{
 h.get.mockResolvedValue({data:payload});await expect(getHotels()).rejects.toThrow();
});
it('reads and normalizes identity independently of list pagination',async()=>{
 h.get.mockResolvedValue({data:{id:'target',org_id:'agency',total_rooms:5,hotel_rooms:[]}});
 expect(await getHotel('target')).toMatchObject({id:'target',orgId:'agency',totalRooms:5});expect(h.get).toHaveBeenCalledWith('/hotels/target');
});

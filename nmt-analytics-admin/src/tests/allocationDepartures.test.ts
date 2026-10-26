import {beforeEach,describe,expect,it,vi} from 'vitest';
const get=vi.hoisted(()=>vi.fn());vi.mock('../api/client',()=>({get,post:vi.fn(),patch:vi.fn(),put:vi.fn(),del:vi.fn()}));
import {getAllocationDepartures} from '../api/departures';
beforeEach(()=>{get.mockReset();});
describe('complete allocation departure choices',()=>{
 it('loads all counted pages without silently truncating choices',async()=>{get.mockResolvedValueOnce({data:{data:[{id:'a'}],total:2}}).mockResolvedValueOnce({data:{data:[{id:'b'}],total:2}});expect((await getAllocationDepartures()).map(d=>d.id)).toEqual(['a','b']);expect(get.mock.calls[1][1]).toMatchObject({params:{page:2,limit:200}});});
 it('accepts an authoritative empty list',async()=>{get.mockResolvedValue({data:{data:[],total:0}});expect(await getAllocationDepartures()).toEqual([]);});
 it.each(['missing','changed','duplicate','empty','overfull'])('rejects %s pages instead of offering partial choices',async kind=>{get.mockResolvedValueOnce({data:{data:[{id:'a'}],total:kind==='missing'?undefined:kind==='overfull'?0:2}}).mockResolvedValueOnce({data:{data:kind==='empty'?[]:[{id:kind==='duplicate'?'a':'b'}],total:kind==='changed'?3:2}});await expect(getAllocationDepartures()).rejects.toThrow();});
 it('propagates unavailable reads',async()=>{get.mockRejectedValue(new Error('unavailable'));await expect(getAllocationDepartures()).rejects.toBeInstanceOf(Error);});
});

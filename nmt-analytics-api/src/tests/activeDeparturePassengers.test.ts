import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({rows:[] as any[],error:null as unknown,filters:[] as [string,unknown][],queries:0}));
vi.mock('../lib/supabase',()=>({supabaseAdmin:{from:()=>{
  state.queries++;
  const filters:[string,unknown][]=[];
  const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters.push([key,value]);state.filters.push([key,value]);return q;},in:(key:string,values:unknown[])=>{filters.push([key,values]);return q;},then:(resolve:any)=>Promise.resolve({data:state.rows.filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value)),error:state.error}).then(resolve)};
  return q;
}}}));
import { activeDeparturePassengers } from '../services/activeDeparturePassengers';
beforeEach(()=>{state.rows=[];state.error=null;state.filters=[];state.queries=0;});
describe('active operational passenger selection',()=>{
  it('excludes cancelled bookings without deleting or changing traveler history',async()=>{
    state.rows=[{id:'cancelled',org_id:'own',departure_id:'trip',status:'cancelled'},{id:'active',org_id:'own',departure_id:'trip',status:'confirmed'}];
    const travelers=[{id:'p1',reservation_id:'cancelled'},{id:'p2',reservation_id:'active'},{id:'legacy',reservation_id:null}];
    expect(await activeDeparturePassengers('own','trip',travelers)).toEqual([travelers[1],travelers[2]]);
    expect(travelers).toHaveLength(3);
    expect(state.filters).toEqual([['org_id','own'],['departure_id','trip'],['status','cancelled']]);
  });
  it('does not use cancelled records from another tenant or departure',async()=>{
    state.rows=[{id:'active',org_id:'foreign',departure_id:'trip',status:'cancelled'},{id:'active',org_id:'own',departure_id:'other-trip',status:'cancelled'}];
    const travelers=[{id:'p',reservation_id:'active'}];
    expect(await activeDeparturePassengers('own','trip',travelers)).toEqual(travelers);
  });
  it('fails the operational read instead of treating a status lookup failure as no cancelled bookings',async()=>{
    state.error=new Error('Synthetic read failure');
    await expect(activeDeparturePassengers('own','trip',[{reservation_id:'r'}])).rejects.toThrow('Synthetic read failure');
  });
  it('retains legacy unlinked travelers and skips an unnecessary lookup',async()=>{
    const travelers=[{id:'legacy',reservation_id:null}];
    expect(await activeDeparturePassengers('own','trip',travelers)).toBe(travelers);
    expect(state.queries).toBe(0);
  });
});

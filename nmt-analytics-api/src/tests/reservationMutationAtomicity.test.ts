import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
const ORG='11111111-1111-4111-8111-111111111111';
const ID='22222222-2222-4222-8222-222222222222';
const DEP='33333333-3333-4333-8333-333333333333';
let booking: any;
let booked=28;
let failWrite=true;
const rpc=vi.fn();
const audit=vi.fn();
const consumes=(row:any)=>row.status!=='cancelled'?row.party_size:0;
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(req:Request,_res:Response,next:NextFunction)=>{req.user={id:'user',email:'synthetic@test.invalid',role:'agent'};next();}}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(req:Request,_res:Response,next:NextFunction)=>{req.orgId=ORG;next();},requireOrgScope:(q:unknown)=>q}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_req:Request,_res:Response,next:NextFunction)=>next(),requireModule:()=> (_req:Request,_res:Response,next:NextFunction)=>next(),requireRole:()=> (_req:Request,_res:Response,next:NextFunction)=>next()}));
vi.mock('../middleware/auditLogger',()=>({auditReservationCreate:(_req:Request,_res:Response,next:NextFunction)=>next(),auditReservationUpdate:(_req:Request,_res:Response,next:NextFunction)=>next(),auditReservationDelete:(_req:Request,_res:Response,next:NextFunction)=>next()}));
vi.mock('../lib/audit',()=>({logAction:(...args:unknown[])=>audit(...args)}));
vi.mock('../lib/notificationService',()=>({notifyNewReservation:vi.fn()}));
vi.mock('../lib/supabase',()=>{
  function query(table:string,action='select',payload:any={}) {
    const filters:((r:any)=>boolean)[]=[];
    function execute(single=false) {
      let rows=table==='reservations'?[booking,{id:'other',org_id:ORG,departure_id:DEP,party_size:26,status:'pending'}].filter(Boolean)
        :table==='departures'?[{id:DEP,org_id:ORG,package_id:'package',packages:{currency:'BAM'},capacity:30,booked}]:[];
      rows=rows.filter(row=>filters.every(f=>f(row)));
      if(action!=='select') {
        if(failWrite)return{data:null,error:{code:'23514',message:'Synthetic database write failure'}};
        if(action==='update'&&rows.some(r=>r.id===ID))booking={...booking,...payload};
        if(action==='delete'&&rows.some(r=>r.id===ID))booking=null;
        rows=booking?[booking]:[];
      }
      return{data:single?(rows[0]||null):rows,count:rows.length,error:single&&!rows.length?{code:'PGRST116'}:null};
    }
    const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return q;},in:(key:string,values:unknown[])=>{filters.push(row=>values.includes(row[key]));return q;},single:async()=>execute(true),then:(resolve:any)=>Promise.resolve(execute()).then(resolve)};
    return q;
  }
  const db={rpc:(...args:any[])=>rpc(...args),from:(table:string)=>({select:()=>query(table),update:(payload:any)=>query(table,'update',payload),delete:()=>query(table,'delete')})};
  return{supabaseAdmin:db,supabase:db,handleSupabaseError:(res:Response,_error:unknown,message:string)=>res.status(500).json({code:'DB_ERROR',message})};
});
let app:express.Express;
beforeAll(async()=>{app=express();app.use(express.json());app.use('/api',(await import('../routes/reservations')).default);});
beforeEach(()=>{
  booking={id:ID,org_id:ORG,departure_id:DEP,customer_name:'Synthetic buyer',party_size:2,status:'pending',total_amount:1000,paid_amount:0,currency:'BAM',reservation_at:'2027-01-01T00:00:00Z'};
  booked=28;failWrite=true;rpc.mockReset();audit.mockReset();
  rpc.mockImplementation(async(name:string,args:any)=>{
    if(name==='reserve_capacity_atomic'){booked+=args.p_party_size;return{data:{booked_after:booked},error:null};}
    if(name==='release_capacity_atomic'){booked-=args.p_party_size;return{data:{booked_after:booked},error:null};}
    // These mocks verify the HTTP transaction boundary, not SQL atomicity.
    // Actual failure/rollback is asserted in the disposable PostgreSQL contract.
    if(failWrite)return{data:null,error:{code:'23514',message:'Synthetic database write failure'}};
    const old=consumes(booking);
    if(name==='delete_reservation_atomic'){const data=booking;booked-=old;booking=null;return{data,error:null};}
    if(name==='update_reservation_core_atomic'){booking={...booking,...args.p_updates};booked+=consumes(booking)-old;return{data:booking,error:null};}
    return{data:null,error:{message:'Unknown RPC'}};
  });
});
describe('reservation mutation failure boundaries',()=>{
  it.each(['core','status','batch','delete'] as const)('failed %s write leaves reservation and departure capacity unchanged',async operation=>{
    const before={...booking};
    const response=operation==='core'?await request(app).patch(`/api/reservations/${ID}`).send({partySize:3,totalAmount:5})
      :operation==='status'?await request(app).patch(`/api/reservations/${ID}/status`).send({status:'cancelled'})
      :operation==='batch'?await request(app).post('/api/reservations/batch/status').send({ids:[ID],status:'cancelled'})
      :await request(app).delete(`/api/reservations/${ID}`);
    expect(booking).toEqual(before);
    expect(booked).toBe(28);
    expect(response.status).toBe(operation==='batch'?200:409);
    if(operation==='batch')expect(response.body.summary).toMatchObject({succeeded:0,failed:1});
    expect(audit).not.toHaveBeenCalled();
  });
  it.each(['status','batch','delete'] as const)('successful %s changes row and capacity once through the transaction',async operation=>{
    failWrite=false;
    const response=operation==='status'?await request(app).patch(`/api/reservations/${ID}/status`).send({status:'cancelled'})
      :operation==='batch'?await request(app).post('/api/reservations/batch/status').send({ids:[ID],status:'cancelled'})
      :await request(app).delete(`/api/reservations/${ID}`);
    expect(response.status).toBe(operation==='delete'?204:200);
    expect(booked).toBe(26);
    expect(booking?.status??null).toBe(operation==='delete'?null:'cancelled');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(operation==='delete'?'delete_reservation_atomic':'update_reservation_core_atomic',expect.objectContaining({p_org_id:ORG,p_reservation_id:ID}));
  });
});

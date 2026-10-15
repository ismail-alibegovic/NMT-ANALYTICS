import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { saleRequestFingerprint } from '../lib/saleIdempotency';

const router=Router();
const idSchema=z.string().uuid().transform(id=>id.toLowerCase());
const bookingSchema=z.object({
  departureId:z.string().uuid().transform(id=>id.toLowerCase()),customerName:z.string().trim().min(1).max(200),
  customerPhone:z.string().trim().min(1).max(60),customerEmail:z.string().email().nullable().optional().default(null),
  passengers:z.array(z.object({full_name:z.string().trim().min(1).max(200)})).min(1).max(10000),
});
function bookingError(res:Response,error:any){
  const message=error?.message || '';
  if(message==='QUOTATION_NOT_FOUND')return apiError(res,404,'NOT_FOUND','Quotation not found');
  if(message==='QUOTATION_ACTOR_INVALID')return apiError(res,403,'INSUFFICIENT_PERMISSIONS','Invalid booking actor');
  if(message==='QUOTATION_ALREADY_BOOKED')return apiError(res,409,message,'Quotation already has a different booking request');
  if(message==='QUOTATION_NOT_ACCEPTED')return apiError(res,409,message,'Accept quotation before booking');
  if(message.includes('CAPACITY_FULL') || message.includes('DEPARTURE_CAPACITY_EXCEEDED'))return apiError(res,409,'DEPARTURE_CAPACITY_EXCEEDED','Departure capacity would be exceeded');
  if(['QUOTATION_CONTEXT_REQUIRED','QUOTATION_DEPARTURE_INCOMPATIBLE','QUOTATION_TRAVELERS_INVALID','QUOTATION_TIMEZONE_INVALID'].includes(message))
    return apiError(res,422,message,'Check quotation context, traveler names and compatible departure');
  if(error?.code==='23503')return apiError(res,422,'QUOTATION_BOOKING_REFERENCE_INVALID','Booking references are invalid');
  return handleSupabaseError(res,error,'Failed to create quotation booking');
}
router.get('/quotations/:id/booking-options',authenticateToken,requireOrgContext,requireMinimumRole('agent'),async(req,res:Response)=>{
  if(!idSchema.safeParse(req.params.id).success)return apiError(res,400,'VALIDATION_ERROR','Invalid quotation ID');
  const {data,error}=await supabaseAdmin.rpc('quotation_booking_departures',{p_org_id:req.orgId!,p_quotation_id:req.params.id.toLowerCase()});
  if(error)return bookingError(res,error);
  if(!Array.isArray(data))return apiError(res,500,'QUOTATION_BOOKING_FAILED','Departure choices could not be confirmed');
  return res.json({departures:data});
});
router.post('/quotations/:id/booking',authenticateToken,requireOrgContext,requireMinimumRole('agent'),async(req,res:Response)=>{
  const parsed=bookingSchema.safeParse(req.body);
  if(!idSchema.safeParse(req.params.id).success || !parsed.success)return apiError(res,400,'VALIDATION_ERROR','Invalid quotation booking');
  const {data,error}=await supabaseAdmin.rpc('book_quotation_atomic',{
    p_org_id:req.orgId!,p_actor_id:req.user!.id,p_quotation_id:req.params.id.toLowerCase(),
    p_payload:parsed.data,p_fingerprint:saleRequestFingerprint(parsed.data),
  });
  if(error)return bookingError(res,error);
  const reservation=data?.reservation;
  if(!reservation?.id || reservation.org_id!==req.orgId || reservation.quotation_id!==req.params.id.toLowerCase() || typeof data.created!=='boolean' || reservation.creation_state!=='completed')
    return apiError(res,500,'QUOTATION_BOOKING_FAILED','Booking could not be confirmed');
  if(data.created)await auditLog('CREATE','reservation',()=>reservation.id)(req,res,()=>{});
  return res.status(data.created?201:200).json({created:!!data.created,reservation});
});
export default router;

import {expect,it,vi} from 'vitest';
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({})}));
import {handleSupabaseError} from '../lib/supabase';
it('keeps database row values, SQL details and hints out of client responses',()=>{
 const res:any={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};
 handleSupabaseError(res,{code:'23505',message:'secret passport',details:'SQL private row',hint:'tenant credential'},'Unable to save');
 expect(res.status).toHaveBeenCalledWith(500);expect(res.json).toHaveBeenCalledWith({code:'23505',message:'Unable to save'});
});
it('normalizes missing database rows without exposing diagnostics',()=>{const res:any={status:vi.fn().mockReturnThis(),json:vi.fn()};handleSupabaseError(res,{code:'PGRST116',details:'private filters'});expect(res.status).toHaveBeenCalledWith(404);expect(res.json).toHaveBeenCalledWith({code:'NOT_FOUND',message:'Resource not found'});});

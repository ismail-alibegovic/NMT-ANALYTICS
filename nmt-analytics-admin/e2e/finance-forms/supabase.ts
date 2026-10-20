// Isolated browser contract only: never constructs a real Supabase client.
async function call(path:string,body:unknown){const response=await fetch('/__form-test-auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return response.json();}
export const supabase={auth:{
 signInWithPassword:(body:unknown)=>call('signin',body),
 resetPasswordForEmail:(email:string)=>call('recover',{email}),
 updateUser:(body:unknown)=>call('update',body),
 signOut:async()=>({error:null}),
 getSession:async()=>({data:{session:{access_token:'isolated-recovery-token'}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}}),
}};
export const getRecoveryRedirectState=()=>({requested:new URLSearchParams(location.search).get('mode')==='update',error:false});

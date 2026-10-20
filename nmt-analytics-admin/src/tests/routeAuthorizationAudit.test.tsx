import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router';
const state=vi.hoisted(()=>({role:'agent',loading:false}));
vi.mock('../context/AppContext',()=>({useApp:()=>({userContext:{role:state.role,modules:['analytics','payments','documents','travel_core']},loading:state.loading,profileLoading:false})}));
import AuthGuard from '../components/auth/AuthGuard';
import ModuleGuard from '../components/auth/ModuleGuard';
afterEach(cleanup);beforeEach(()=>{state.role='agent';state.loading=false;});
const restricted=[['/finance','manager'],['/payments','manager'],['/reports','manager'],['/admin/documents','manager'],['/admin/audit-logs','director'],['/settings','director'],['/operations/commission-rules','director'],['/operations/subagents','manager'],['/operations/receipts','manager'],['/operations/flights','manager'],['/operations/hotels','manager'],['/operations/excursions','manager']];
for(const role of ['director','manager','agent'])for(const [path,min] of restricted)it(`${role} direct route ${path}`,()=>{
 state.role=role;render(<MemoryRouter initialEntries={[path]}><Routes><Route path={path} element={<AuthGuard><span>protected content</span></AuthGuard>}/><Route path="/" element={<span>denied</span>}/></Routes></MemoryRouter>);
 const allowed=role==='director'||(role==='manager'&&min==='manager');expect(Boolean(screen.queryByText('protected content'))).toBe(allowed);
});
it.each(['director','manager','agent'])('%s retains sales routes',role=>{state.role=role;render(<MemoryRouter initialEntries={['/reservations']}><AuthGuard><span>booking</span></AuthGuard></MemoryRouter>);expect(screen.getByText('booking')).toBeInTheDocument();});
it('invalid roles never mount otherwise unrestricted content',()=>{state.role='owner';render(<MemoryRouter initialEntries={['/reservations']}><Routes><Route path='/reservations' element={<AuthGuard><span>secret</span></AuthGuard>}/><Route path='/auth/signin' element={<span>signed out</span>}/></Routes></MemoryRouter>);expect(screen.queryByText('secret')).not.toBeInTheDocument();});
it('module loading cannot mount protected children',()=>{state.loading=true;render(<MemoryRouter><ModuleGuard moduleKey="analytics"><span>secret</span></ModuleGuard></MemoryRouter>);expect(screen.queryByText('secret')).not.toBeInTheDocument();});

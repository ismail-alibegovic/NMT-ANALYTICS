const state: { user: { id: string }; loading: boolean; userContext?: { role: 'manager' | 'agent' } } = { user: { id: 'isolated-fixture-user' }, loading: false };
export const useApp = () => state;
export const setFixtureRole = (role: 'manager' | 'agent') => { state.userContext = { role }; };

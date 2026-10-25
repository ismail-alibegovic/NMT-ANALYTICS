type FixtureRole = 'manager' | 'agent' | 'director' | 'super_admin';
const state: {
  user: { id: string };
  loading: boolean;
  userContext?: { role: FixtureRole };
  refreshUserContext: () => Promise<void>;
} = { user: { id: 'isolated-fixture-user' }, loading: false, refreshUserContext: async () => {} };
export const useApp = () => state;
export const setFixtureRole = (role: FixtureRole) => { state.userContext = { role }; };

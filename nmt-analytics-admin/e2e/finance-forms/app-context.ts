type FixtureRole = 'manager' | 'agent' | 'director' | 'super_admin';
const state: {
  user: { id: string; email: string };
  loading: boolean;
  userContext?: {
    role: FixtureRole;
    user?: { email: string };
    org?: { id: string; name: string; currency: string };
  };
  refreshUserContext: () => Promise<void>;
} = {
  user: { id: 'isolated-fixture-user', email: 'fixture@example.test' },
  loading: false,
  refreshUserContext: async () => {},
};
export const useApp = () => state;
export const setFixtureRole = (role: FixtureRole) => {
  state.userContext = {
    role,
    user: { email: 'fixture@example.test' },
    org: { id: 'org-fixture', name: 'Synthetic Agency', currency: 'BAM' },
  };
};

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTeamMember,
  getTeamMembers,
  reactivateTeamMember,
  revokeTeamMember,
  updateTeamMemberRole,
  type AssignableStaffRole,
  type StaffMember,
} from "../../api/staff";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";

type TeamErrorCode =
  | "VALIDATION_ERROR"
  | "USER_EXISTS"
  | "LAST_DIRECTOR_PROTECTED"
  | "CANNOT_REVOKE_SELF"
  | "MEMBER_REVOKED"
  | "MEMBER_NOT_FOUND"
  | "FORBIDDEN"
  | "MIGRATION_PENDING"
  | "INTERNAL_ERROR";

type TeamFeedbackState =
  | { type: "error"; code: TeamErrorCode }
  | { type: "success"; key: "createdSuccess" | "roleUpdated" | "memberRevoked" | "memberReactivated" };

const ASSIGNABLE_ROLES: AssignableStaffRole[] = ["director", "manager", "agent", "viewer"];

function extractErrorCode(err: any): TeamErrorCode {
  const code = err?.response?.data?.code || err?.code;
  const known: TeamErrorCode[] = [
    "VALIDATION_ERROR",
    "USER_EXISTS",
    "LAST_DIRECTOR_PROTECTED",
    "CANNOT_REVOKE_SELF",
    "MEMBER_REVOKED",
    "MEMBER_NOT_FOUND",
    "FORBIDDEN",
    "MIGRATION_PENDING",
  ];
  return known.includes(code) ? code : "INTERNAL_ERROR";
}

export default function TeamManagementPanel() {
  const { t } = useT();
  const { user, userContext } = useApp();
  const tm = t.settings.teamManagement;

  const canManageTeam =
    userContext?.role === "director" || userContext?.role === "super_admin";
  const currentUserId = user?.id || userContext?.user?.id || "";

  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(canManageTeam);
  const [loadError, setLoadError] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableStaffRole>("agent");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<TeamFeedbackState | null>(null);
  const [provisionedCreds, setProvisionedCreds] = useState<{
    email: string;
    fullName: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const createLockRef = useRef(false);
  const actionLockRef = useRef(false);

  const loadTeam = useCallback(async () => {
    if (!canManageTeam) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getTeamMembers();
      setMembers(Array.isArray(data?.members) ? data.members : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [canManageTeam]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  if (!canManageTeam) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createLockRef.current) return;

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPass = password.trim();

    if (
      trimmedName.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) ||
      (trimmedPass.length > 0 && trimmedPass.length < 12)
    ) {
      setFeedback({ type: "error", code: "VALIDATION_ERROR" });
      return;
    }

    createLockRef.current = true;
    setCreating(true);
    setFeedback(null);
    setCopied(false);

    try {
      const res = await createTeamMember({
        fullName: trimmedName,
        email: trimmedEmail,
        role,
        ...(trimmedPass ? { password: trimmedPass } : {}),
      });
      setMembers((prev) => [...prev, res.member]);
      setProvisionedCreds({
        email: res.member.email || trimmedEmail,
        fullName: res.member.fullName || trimmedName,
        password: res.initialPassword,
      });
      setFullName("");
      setEmail("");
      setRole("agent");
      setPassword("");
      setFeedback({ type: "success", key: "createdSuccess" });
    } catch (err) {
      setFeedback({ type: "error", code: extractErrorCode(err) });
    } finally {
      createLockRef.current = false;
      setCreating(false);
    }
  };

  const handleRoleChange = async (member: StaffMember, nextRole: AssignableStaffRole) => {
    if (actionLockRef.current || member.role === nextRole) return;
    actionLockRef.current = true;
    setBusyMemberId(member.id);
    setFeedback(null);

    try {
      const res = await updateTeamMemberRole(member.id, nextRole);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? res.member : m)));
      setFeedback({ type: "success", key: "roleUpdated" });
    } catch (err) {
      setFeedback({ type: "error", code: extractErrorCode(err) });
    } finally {
      actionLockRef.current = false;
      setBusyMemberId(null);
    }
  };

  const handleToggleRevoke = async (member: StaffMember) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setBusyMemberId(member.id);
    setFeedback(null);

    try {
      const res =
        member.status === "revoked"
          ? await reactivateTeamMember(member.id)
          : await revokeTeamMember(member.id);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? res.member : m)));
      setFeedback({
        type: "success",
        key: member.status === "revoked" ? "memberReactivated" : "memberRevoked",
      });
    } catch (err) {
      setFeedback({ type: "error", code: extractErrorCode(err) });
    } finally {
      actionLockRef.current = false;
      setBusyMemberId(null);
    }
  };

  const handleCopyPassword = async () => {
    if (!provisionedCreds) return;
    try {
      await navigator.clipboard?.writeText(provisionedCreds.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const activeFeedbackText =
    feedback?.type === "error"
      ? tm.errors[feedback.code] || tm.errors.INTERNAL_ERROR
      : feedback?.type === "success"
        ? tm[feedback.key]
        : null;

  return (
    <div id="team" className="border-b border-gray-200 p-6 dark:border-gray-700">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">{tm.title}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tm.subtitle}</p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t.common.loading}
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
        >
          <span>{tm.loadFailed}</span>
          <button
            type="button"
            onClick={() => void loadTeam()}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-300"
          >
            {tm.retry}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {feedback && activeFeedbackText && (
            <div
              role={feedback.type === "error" ? "alert" : "status"}
              className={`rounded-lg border p-3 text-sm ${
                feedback.type === "error"
                  ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
                  : "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-300"
              }`}
            >
              {activeFeedbackText}
            </div>
          )}

          {provisionedCreds && (
            <div
              data-testid="provisioned-credentials"
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{tm.credentialsBannerTitle}</p>
                  <p className="mt-0.5 text-xs opacity-90">{tm.credentialsBannerHint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setProvisionedCreds(null)}
                  className="text-xs font-medium underline"
                >
                  {tm.dismissCredentials}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium">{provisionedCreds.email}</span>
                <code
                  data-testid="initial-password-value"
                  className="rounded bg-white px-2 py-1 font-mono text-xs text-gray-900 ring-1 ring-amber-300 dark:bg-gray-900 dark:text-white dark:ring-amber-700"
                >
                  {provisionedCreds.password}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyPassword()}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-gray-900 dark:text-amber-200"
                >
                  {copied ? tm.passwordCopied : tm.copyPassword}
                </button>
              </div>
            </div>
          )}

          {/* Member list */}
          {members.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{tm.empty}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2.5">{tm.fullName}</th>
                    <th className="px-4 py-2.5">{tm.email}</th>
                    <th className="px-4 py-2.5">{tm.role}</th>
                    <th className="px-4 py-2.5 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {members.map((member) => {
                    const isSelf = member.id === currentUserId;
                    const isPlatform = member.role === "super_admin";
                    const isBusy = busyMemberId === member.id;
                    const displayName = member.fullName || member.email || member.id;

                    return (
                      <tr key={member.id} className="bg-white dark:bg-transparent">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{displayName}</span>
                            {isSelf && (
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                                {tm.youBadge}
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                member.status === "revoked"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                  : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              }`}
                            >
                              {member.status === "revoked" ? tm.statusRevoked : tm.statusActive}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {member.email || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {isPlatform ? (
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              super_admin
                            </span>
                          ) : (
                            <select
                              aria-label={`${tm.roleLabel} ${displayName}`}
                              value={member.role}
                              disabled={isBusy || member.status === "revoked"}
                              onChange={(e) =>
                                void handleRoleChange(member, e.target.value as AssignableStaffRole)
                              }
                              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                            >
                              {ASSIGNABLE_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {tm.roles[r]}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!isPlatform && (
                            <button
                              type="button"
                              disabled={isBusy || (isSelf && member.status !== "revoked")}
                              onClick={() => void handleToggleRevoke(member)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                                member.status === "revoked"
                                  ? "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-950/30"
                                  : "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                              }`}
                            >
                              {isBusy
                                ? tm.updating
                                : member.status === "revoked"
                                  ? tm.reactivateAction
                                  : tm.revokeAction}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Create staff form */}
          <form
            onSubmit={handleCreate}
            noValidate
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{tm.addHeading}</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{tm.noSmtpHint}</p>

            <fieldset disabled={creating} className="mt-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="staff-full-name"
                    className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                  >
                    {tm.fullName}
                  </label>
                  <input
                    id="staff-full-name"
                    type="text"
                    maxLength={100}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={tm.fullNamePlaceholder}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="staff-email"
                    className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                  >
                    {tm.email}
                  </label>
                  <input
                    id="staff-email"
                    type="email"
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tm.emailPlaceholder}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="staff-role"
                    className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                  >
                    {tm.role}
                  </label>
                  <select
                    id="staff-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as AssignableStaffRole)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {tm.roles[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="staff-password"
                    className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
                  >
                    {tm.optionalPassword}
                  </label>
                  <input
                    id="staff-password"
                    type="password"
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tm.optionalPasswordPlaceholder}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? tm.creating : tm.createAction}
                </button>
              </div>
            </fieldset>
          </form>
        </div>
      )}
    </div>
  );
}

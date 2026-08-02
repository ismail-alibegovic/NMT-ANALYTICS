import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Button from "../ui/button/Button";
import { supabase } from "../../lib/supabase";
import { useT } from "../../lib/i18n/context";

type Mode = "request" | "update";

export default function ResetPasswordForm() {
  const { t } = useT();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // Supabase recovery links land here with the session in the URL fragment.
  // `detectSessionInUrl` consumes it and emits PASSWORD_RECOVERY, which flips
  // this form into "set a new password" mode.
  useEffect(() => {
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery")) setMode("update");

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("update");
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError("");

    if (!email.trim()) {
      setError(`${t.auth.email} ${t.common.isRequired}`);
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError("");

    if (password.length < 8) {
      setError(t.auth.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.auth.passwordsDoNotMatch);
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      navigate("/auth/signin?reset=1", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="w-full max-w-md pt-10 mx-auto">
        <Link
          to="/auth/signin"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon className="size-5" />
          {t.auth.signIn}
        </Link>
      </div>

      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
            {mode === "update" ? t.auth.newPasswordTitle : t.auth.resetPasswordTitle}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {mode === "update" ? t.auth.newPasswordSubtitle : t.auth.resetPasswordSubtitle}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-400">
            {error}
          </div>
        )}

        {mode === "request" && sent ? (
          <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-800 dark:bg-success-900/30 dark:text-success-400">
            {t.auth.resetLinkSent}
          </div>
        ) : mode === "request" ? (
          <form onSubmit={handleRequest}>
            <div className="space-y-5">
              <div>
                <Label htmlFor="reset-email">
                  {t.auth.email} <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder={t.auth.enterEmail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button className="w-full" size="sm" type="submit" disabled={loading}>
                {loading ? `${t.common.sending}` : t.auth.sendResetLink}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleUpdate}>
            <div className="space-y-5">
              <div>
                <Label htmlFor="new-password">
                  {t.auth.newPassword} <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    name="new-password"
                    autoComplete="new-password"
                    placeholder={t.auth.enterPassword}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-gray-500 size-5 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 size-5 dark:fill-gray-400" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t.auth.passwordHint}
                </p>
              </div>

              <div>
                <Label htmlFor="confirm-password">
                  {t.auth.confirmPassword} <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  name="confirm-password"
                  autoComplete="new-password"
                  placeholder={t.auth.enterPassword}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <Button className="w-full" size="sm" type="submit" disabled={loading}>
                {loading ? `${t.common.saving}` : t.auth.updatePassword}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

import { useT } from "../../lib/i18n/context";
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
import { supabase } from "../../lib/supabase";
import { markSessionEstablished } from "../../lib/authSession";

export default function SignInForm() {
  const { t } = useT();
  const busy = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const needsVerification = searchParams.get("verify") === "1";
  const justReset = searchParams.get("reset") === "1";

  const handleDevLogin = async () => {
    if (busy.current) return;
    if (!import.meta.env.DEV) {
      setError(t.errors.generic);
      return;
    }

    busy.current = true;

    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: "dev@travline.app",
        password: "devpassword123",
      });

      if (error) {
        localStorage.setItem('nmt_auth_token', 'dev-token');
        localStorage.setItem('nmt_user', JSON.stringify({
          id: '72ed5a01-9095-4045-bd9a-14b3beed9962',
          email: 'dev@travline.app'
        }));
        markSessionEstablished();
        navigate('/');
        return;
      }

      markSessionEstablished();
      navigate('/');
    } catch (err: any) {
      console.error("DEV LOGIN ERROR", err);
      setError(err?.message || t.errors.generic);
    } finally {
      busy.current = false; setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
            >
              <span>←</span>
              <span>{t.landing.backToLanding}</span>
            </Link>
          </div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t.auth.signInTitle}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t.auth.signInSubtitle}
            </p>
          </div>
          <div>
            {needsVerification && <div role="status" className="mb-4 text-sm text-gray-600 dark:text-gray-300">{t.auth.verificationRequired}</div>}
            {justRegistered && (
              <div className="mb-4 p-3 bg-success-50 border border-success-200 text-success-700 rounded-lg dark:bg-success-900/30 dark:border-success-800 dark:text-success-400">
                {t.auth.accountCreated}
              </div>
            )}
            {justReset && (
              <div className="mb-4 p-3 bg-success-50 border border-success-200 text-success-700 rounded-lg dark:bg-success-900/30 dark:border-success-800 dark:text-success-400">
                {t.auth.passwordResetDone}
              </div>
            )}
            {error && (
              <div role="alert" className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-400">
                {error}
              </div>
            )}

            <form aria-label={t.auth.signInTitle} onSubmit={async (e) => {
              e.preventDefault();

              if (busy.current) return;

              busy.current = true;

              setLoading(true);
              setError("");

              try {
                if (!email.trim()) {
                  setError(`${t.auth.email} ${t.common.isRequired}`);
                  setLoading(false);
                  return;
                }

                if (!password) {
                  setError(`${t.auth.password} ${t.common.isRequired}`);
                  setLoading(false);
                  return;
                }

                const { data, error } = await supabase.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });

                if (error) {
                  setError(error.message);
                } else if (data.session) {
                  if (data.session.access_token) {
                    localStorage.setItem('nmt_auth_token', data.session.access_token);
                  }
                  if (isChecked && data.session.refresh_token) {
                    localStorage.setItem('nmt_refresh_token', data.session.refresh_token);
                  }
                  markSessionEstablished();
                  navigate("/");
                } else {
                  setError(t.errors.generic);
                }
              } catch (err: any) {
                setError(err?.message || t.errors.generic);
              } finally {
                busy.current = false; setLoading(false);
              }
            }}>
              <fieldset disabled={loading} className="space-y-6">
                <div>
                  <Label htmlFor="signin-email">
                    {t.auth.email} <span className="text-error-500">*</span>
                  </Label>
                  <Input disabled={loading}
                    id="signin-email" required
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder={t.auth.enterEmail}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="signin-password">
                    {t.auth.password} <span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input disabled={loading}
                      id="signin-password" required
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
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
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox disabled={loading} label={t.auth.keepLoggedIn} checked={isChecked} onChange={setIsChecked} />
                  </div>
                  <Link
                    to="/auth/reset-password"
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    {t.auth.forgotPassword}
                  </Link>
                </div>
                <div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="sm"
                    disabled={loading}
                  >
                    {loading ? `${t.common.loading}...` : t.auth.signIn}
                  </Button>
                </div>
              </fieldset>
            </form>

            {import.meta.env.DEV && (
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  size="sm"
                  disabled={loading}
                  onClick={handleDevLogin}
                >
                  🧪 Dev Login
                </Button>
              </div>
            )}

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                {t.auth.noAccount} {" "}
                <Link
                  to="/auth/signup"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {t.auth.signUp}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


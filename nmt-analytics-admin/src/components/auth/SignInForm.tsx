import { useT } from "../../lib/i18n/context";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
import { supabase } from "../../lib/supabase";

export default function SignInForm() {
  const { t } = useT();
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleDevLogin = async () => {
    if (!import.meta.env.DEV) {
      setError(t.errors.generic);
      return;
    }

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
        window.location.href = '/';
        return;
      }

      navigate("/");
    } catch (err: any) {
      console.error("DEV LOGIN ERROR", err);
      setError(err?.message || t.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="w-full max-w-md pt-10 mx-auto">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon className="size-5" />
          {t.common.back} {t.nav.dashboard}
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t.auth.signInTitle}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t.auth.signInSubtitle}
            </p>
          </div>
          <div>
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <form onSubmit={async (e) => {
              e.preventDefault();

              if (loading) return;

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
                  navigate("/");
                } else {
                  setError(t.errors.generic);
                }
              } catch (err: any) {
                setError(err?.message || t.errors.generic);
              } finally {
                setLoading(false);
              }
            }}>
              <div className="space-y-6">
                <div>
                  <Label>
                    {t.auth.email} <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="info@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label>
                    {t.auth.password} <span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      placeholder={`Enter ${t.auth.password}`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={isChecked} onChange={setIsChecked} />
                    <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                      {t.auth.keepLoggedIn}
                    </span>
                  </div>
                  <Link
                    to="/reset-password"
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
              </div>
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
                  to="/signup"
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

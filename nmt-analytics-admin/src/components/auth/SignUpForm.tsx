import { useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
import { useT } from "../../lib/i18n/context";

export default function SignUpForm() {
  const { t } = useT();
  const busy = useRef(false);
  const formId = useId();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    setError("");

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !orgName.trim()) {
      setError(t.auth.allFieldsRequired);
      return;
    }
    if (!agree) {
      setError(t.auth.termsPrefix);
      return;
    }
    if (password.length < 8) {
      setError(t.auth.passwordTooShort);
      return;
    }

    busy.current = true;

    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || "/api";
      const res = await fetch(`${apiBase}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          org_name: orgName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || t.errors.generic);
        return;
      }

      navigate(data.confirmationRequired ? "/auth/signin?verify=1" : "/auth/signin?registered=1", { replace: true });
    } catch {
      setError(t.errors.generic);
    } finally {
      busy.current = false; setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <Link
              to="/auth/signin"
              className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <ChevronLeftIcon className="size-5" />
              {t.auth.signIn}
            </Link>
          </div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t.auth.signUpTitle}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t.auth.signUpSubtitle}
            </p>
          </div>
          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-400">
              {error}
            </div>
          )}
          <form aria-label={t.auth.signUpTitle} onSubmit={handleSubmit}>
            <fieldset disabled={loading} className="space-y-5">
              <div>
                <Label htmlFor={`${formId}-agency`}>
                  {t.auth.orgName}<span className="text-error-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input disabled={loading}
                    type="text"
                    id={`${formId}-agency`} required autoComplete="organization"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder={t.auth.enterOrgName}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${formId}-first-name`}>
                    {t.auth.firstName}<span className="text-error-500">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input disabled={loading}
                      type="text"
                      id={`${formId}-first-name`} required autoComplete="given-name"
                    value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t.auth.enterFirstName}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`${formId}-last-name`}>
                    {t.auth.lastName}<span className="text-error-500">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input disabled={loading}
                      type="text"
                      id={`${formId}-last-name`} required autoComplete="family-name"
                    value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t.auth.enterLastName}
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor={`${formId}-email`}>
                  {t.auth.email}<span className="text-error-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input disabled={loading}
                    type="email"
                    id={`${formId}-email`} required autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.auth.enterEmail}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor={`${formId}-password`}>
                  {t.auth.password}<span className="text-error-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input disabled={loading}
                    type={showPassword ? "text" : "password"}
                    id={`${formId}-password`} required autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.auth.enterPassword}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-gray-500 size-5 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 size-5 dark:fill-gray-400" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox disabled={loading} label={`${t.auth.termsPrefix} ${t.auth.termsLink} ${t.auth.termsMiddle} ${t.auth.privacyLink}`} checked={agree} onChange={setAgree}/>
              </div>
              <div>
                <Button
                  className="w-full"
                  size="sm"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? t.auth.signingUp : t.auth.signUpButton}
                </Button>
              </div>
            </fieldset>
          </form>
          <div className="mt-5 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t.auth.hasAccount}{" "}
              <Link
                to="/auth/signin"
                className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                {t.auth.signIn}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


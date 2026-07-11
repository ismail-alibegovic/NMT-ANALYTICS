import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
import { useT } from "../../lib/i18n/context";

export default function SignUpForm() {
  const { t } = useT();
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
    setError("");

    if (!firstName || !lastName || !email || !password || !orgName) {
      setError(t.errors.generic);
      return;
    }
    if (!agree) {
      setError(t.terms?.prefix || "Please accept the terms to continue.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || "/api";
      const res = await fetch(`${apiBase}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          orgName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || t.errors.generic);
        return;
      }

      navigate("/signin?registered=1");
    } catch (err) {
      setError(t.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <Link
              to="/signin"
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
            <div className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/30 dark:text-error-400">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="space-y-5">
              <div>
                <Label>
                  {t.auth.orgName}<span className="text-error-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder={t.auth.enterOrgName}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Label>
                    {t.auth.firstName}<span className="text-error-500">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t.auth.enterFirstName}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>
                    {t.auth.lastName}<span className="text-error-500">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t.auth.enterLastName}
                      required
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label>
                  {t.auth.email}<span className="text-error-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.auth.enterEmail}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>
                  {t.auth.password}<span className="text-error-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.auth.enterPassword}
                    required
                  />
                  <button
                    type="button"
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
                <Checkbox
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t.auth.termsPrefix}{" "}
                  <span className="text-brand-500 dark:text-brand-400">
                    {t.auth.termsLink}
                  </span>{" "}
                  {t.auth.termsMiddle}{" "}
                  <span className="text-brand-500 dark:text-brand-400">
                    {t.auth.privacyLink}
                  </span>
                </p>
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
            </div>
          </form>
          <div className="mt-5 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t.auth.hasAccount}{" "}
              <Link
                to="/signin"
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

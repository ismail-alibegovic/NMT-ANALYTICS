import { useState } from "react";
import { Link } from "react-router";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
import { useT } from "../../lib/i18n/context";

export default function SignUpForm() {
  const { t } = useT();
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);

  return (
    <div className="flex flex-col flex-1 w-full overflow-y-auto lg:w-1/2 no-scrollbar">
      <div className="w-full max-w-md mx-auto mb-5 sm:pt-10">
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
              {t.auth.signUp}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t.auth.signUpSubtitle}
            </p>
          </div>
          <div>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {/* <!-- First Name --> */}
                  <div className="sm:col-span-1">
                    <Label>
                      {t.auth.firstName}<span className="text-error-500">*</span>
                    </Label>
                    <Input
                      type="text"
                      id="fname"
                      name="fname"
                      autoComplete="given-name"
                      placeholder={t.auth.enterFirstName}
                    />
                  </div>
                  {/* <!-- Last Name --> */}
                  <div className="sm:col-span-1">
                    <Label>
                      {t.auth.lastName}<span className="text-error-500">*</span>
                    </Label>
                    <Input
                      type="text"
                      id="lname"
                      name="lname"
                      autoComplete="family-name"
                      placeholder={t.auth.enterLastName}
                    />
                  </div>
                </div>
                {/* <!-- Email --> */}
                <div>
                  <Label>
                    {t.auth.email}<span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    autoComplete="email"
                    placeholder={t.auth.enterEmail}
                  />
                </div>
                {/* <!-- Password --> */}
                <div>
                  <Label>
                    {t.auth.password}<span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder={t.auth.enterPassword}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
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
                {/* <!-- Checkbox --> */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="w-5 h-5 mt-0.5 shrink-0"
                    checked={isChecked}
                    onChange={setIsChecked}
                  />
                  <p className="inline-block text-sm font-normal text-gray-500 dark:text-gray-400">
                    {t.auth.termsPrefix}{" "}
                    <span className="text-gray-800 dark:text-white/90">
                      {t.auth.termsLink}
                    </span>{" "}
                    {t.auth.termsMiddle}{" "}
                    <span className="text-gray-800 dark:text-white">
                      {t.auth.privacyLink}
                    </span>
                  </p>
                </div>
                {/* <!-- Button --> */}
                <div>
                  <Button type="submit" className="w-full" size="sm">
                    {t.auth.signUpButton}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
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
    </div>
  );
}

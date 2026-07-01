import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
import { supabase } from "../../lib/supabase";

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Dev login - bypasses Supabase auth for development
  const handleDevLogin = async () => {
    if (!import.meta.env.DEV) {
      setError("Dev login only available in development mode");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Create a mock session by signing in with a test account
      // The backend has DEV_BYPASS_AUTH=true which accepts requests without valid JWT
      // We need to create a minimal Supabase session
      const { error } = await supabase.auth.signInWithPassword({
        email: "dev@travline.app",
        password: "devpassword123",
      });

      // If the dev user doesn't exist, we'll get an error
      // In that case, we'll use a workaround
      if (error) {
        console.log("Dev user not found, creating mock session...");
        
        // Store a mock token that the backend will accept
        localStorage.setItem('nmt_auth_token', 'dev-token');
        localStorage.setItem('nmt_user', JSON.stringify({
          id: '72ed5a01-9095-4045-bd9a-14b3beed9962',
          email: 'dev@travline.app'
        }));
        
        // Force page reload to trigger AppContext to fetch context
        window.location.href = '/';
        return;
      }

      navigate("/");
    } catch (err: any) {
      console.error("DEV LOGIN ERROR", err);
      setError(err?.message || "Dev login failed");
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
          Back to dashboard
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your email and password to sign in!
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

              if (loading) {
                return;
              }

              setLoading(true);
              setError("");

              try {
                // Use controlled state directly
                const emailInput = email.trim();
                const passwordInput = password;

                // Validation
                if (!emailInput) {
                  setError("Email is required");
                  setLoading(false);
                  return;
                }

                if (!passwordInput) {
                  setError("Password is required");
                  setLoading(false);
                  return;
                }

                // Call Supabase auth
                const { data, error } = await supabase.auth.signInWithPassword({
                  email: emailInput,
                  password: passwordInput,
                });

                if (error) {
                  console.error("LOGIN ERROR", error);
                  setError(error.message);
                } else if (data.session) {
                  // Store access token
                  if (data.session.access_token) {
                    localStorage.setItem('nmt_auth_token', data.session.access_token);
                  }

                  // Handle "Keep me logged in"
                  if (isChecked && data.session.refresh_token) {
                    localStorage.setItem('nmt_refresh_token', data.session.refresh_token);
                  }

                  navigate("/");
                } else {
                  setError("Login successful but no session data returned. Please try again.");
                }
              } catch (err: any) {
                console.error("LOGIN EXCEPTION", err);
                setError(err?.message || "An unexpected error occurred");
              } finally {
                setLoading(false);
              }
            }}>
              <div className="space-y-6">
                <div>
                  <Label>
                    Email <span className="text-error-500">*</span>{" "}
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
                    Password <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
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
                      Keep me logged in
                    </span>
                  </div>
                  <Link
                    to="/reset-password"
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="sm"
                    disabled={loading}
                  >
                    {loading ? "Signing in..." : "Sign in"}
                  </Button>
                </div>
              </div>
            </form>

            {/* Dev Login Button */}
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
                  🧪 Dev Login (Bypass Auth)
                </Button>
              </div>
            )}

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Don&apos;t have an account? {""}
                <Link
                  to="/signup"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Sign Up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

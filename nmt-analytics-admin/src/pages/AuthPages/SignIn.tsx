import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Sign In | NMT Analytics"
        description="Sign in to NMT Analytics"
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}

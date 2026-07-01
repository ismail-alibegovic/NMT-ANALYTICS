import { useT } from "../../lib/i18n/context";
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  const { t } = useT();
  return (
    <>
      <PageMeta
        title={`${t.auth.signIn} | ${t.app.name}`}
        description={t.auth.signInSubtitle}
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}

import { useT } from "../../lib/i18n/context";
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignUpForm from "../../components/auth/SignUpForm";

export default function SignUp() {
  const { t } = useT();
  return (
    <>
      <PageMeta
        title={`${t.auth.signUp} | ${t.app.name}`}
        description={t.auth.signUp}
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}

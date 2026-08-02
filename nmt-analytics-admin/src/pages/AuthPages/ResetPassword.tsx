import { useT } from "../../lib/i18n/context";
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import ResetPasswordForm from "../../components/auth/ResetPasswordForm";

export default function ResetPassword() {
  const { t } = useT();
  return (
    <>
      <PageMeta
        title={`${t.auth.resetPasswordTitle} | ${t.app.name}`}
        description={t.auth.resetPasswordSubtitle}
      />
      <AuthLayout>
        <ResetPasswordForm />
      </AuthLayout>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AdminAuthScreen } from "@/components/admin/AdminAuthScreen";
import { ErrorBanner } from "@/components/admin/Banner";
import { db } from "@/db";
import { isResetTokenValid, RESET_EXPIRED } from "@/server/admin-auth";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "NuvemLeads", referrer: "no-referrer" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = await isResetTokenValid(db, token);

  return (
    <AdminAuthScreen>
      <h3 className="m-0">Criar nova senha</h3>
      {valid && token ? (
        <ResetForm token={token} />
      ) : (
        <>
          <ErrorBanner>{RESET_EXPIRED}</ErrorBanner>
          <div>
            <Link href="/admin/esqueci-senha" className="btn btn-ghost text-[13px] no-underline">
              Esqueci minha senha
            </Link>
          </div>
        </>
      )}
    </AdminAuthScreen>
  );
}

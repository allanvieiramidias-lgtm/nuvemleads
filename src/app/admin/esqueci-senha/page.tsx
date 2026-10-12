import type { Metadata } from "next";
import { AdminAuthScreen } from "@/components/admin/AdminAuthScreen";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "NuvemLeads" };

export default function ForgotPasswordPage() {
  return (
    <AdminAuthScreen>
      <ForgotForm />
    </AdminAuthScreen>
  );
}

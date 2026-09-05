"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { VerifyEmailPanel } from "@/components/auth/verify-email-panel";
import {
  AuthSubmitButton,
  AuthSecondaryButton,
} from "@/components/auth/auth-fields";

interface RegisterSuccessProps {
  email: string;
  needsEmailVerification: boolean;
  onLoginClick: () => void;
  onClose: () => void;
}

/**
 * Shown after a successful sign-up inside the auth modal. The standalone
 * /register page shows the same panel, since the two are the same moment
 * reached from two places and used to drift — one said "Verify your email" and
 * the other "Confirm your email", with different body copy under each.
 *
 * It used to open with a pulsing green disc and a bouncing sparkle, then with a
 * 44px tinted square and two flush-left paragraphs. The first was a mobile
 * game; the second was a form validation notice. What it is now lives in
 * ./verify-email-panel, with the reasoning.
 */
export default function RegisterSuccess({
  email,
  needsEmailVerification,
  onLoginClick,
  onClose,
}: RegisterSuccessProps) {
  const t = useTranslations("components_auth");
  const tCommon = useTranslations("common");

  return (
    <VerifyEmailPanel email={email} needsVerification={needsEmailVerification}>
      <AuthSubmitButton type="button" onClick={onLoginClick}>
        {needsEmailVerification ? t("go_to_login") : t("continue_to_login")}
      </AuthSubmitButton>
      <AuthSecondaryButton onClick={onClose}>
        {tCommon("close")}
      </AuthSecondaryButton>
    </VerifyEmailPanel>
  );
}

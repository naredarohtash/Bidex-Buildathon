"use client";

/**
 * The phone verification page.
 *
 * The work is in PhoneCard, which talks to `/api/user/phone/send` and
 * `/api/user/phone/verify`. This file is only the page around it.
 *
 * What was here before is worth recording, because it is the reason for the
 * rebuild: 534 lines that declared their own `useUserStore` returning a frozen
 * empty user, and their own `$fetch` that slept two seconds and returned
 * `{ success: true }` for any URL. Both were labelled "for demo". The screen
 * accepted any number, accepted any six digits, and told the trader their phone
 * was verified — having contacted nothing. The real endpoints existed the whole
 * time.
 */

import { PhoneCard } from "../kit/phone-card";
import { SettingsPage } from "../kit/settings-kit";

export function PhoneVerificationTab() {
  return (
    <SettingsPage
      title="Phone verification"
      description="Confirm the number we use to reach you about withdrawals and account security."
    >
      <PhoneCard />
    </SettingsPage>
  );
}

export default PhoneVerificationTab;

import { SignInForm } from "./sign-in-form";
import {
  getGoogleSignInEnvPresence,
  isGoogleSignInEnabledOnServer,
  logGoogleSignInEnvDiagnosticsIfEnabled,
  missingRequiredGoogleSignInEnvKeys,
} from "@/lib/google-signin-env";

/** Read OAuth-related env on each request (not at build time). See google-signin-env.ts. */
export const dynamic = "force-dynamic";

export default function SignInPage() {
  logGoogleSignInEnvDiagnosticsIfEnabled();
  const presence = getGoogleSignInEnvPresence();
  const googleConfigured = isGoogleSignInEnabledOnServer();
  const missingRequiredKeys = missingRequiredGoogleSignInEnvKeys(presence);

  return (
    <SignInForm
      googleConfigured={googleConfigured}
      missingRequiredKeys={missingRequiredKeys}
      nextAuthUrlPresent={presence.NEXTAUTH_URL}
    />
  );
}

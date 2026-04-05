import { SignInForm } from "./sign-in-form";

function isGoogleAuthConfigured(): boolean {
  return (
    !!process.env.GOOGLE_CLIENT_ID?.trim() &&
    !!process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    !!process.env.NEXTAUTH_SECRET?.trim() &&
    !!process.env.MEMO_OAUTH_SYNC_SECRET?.trim()
  );
}

export default function SignInPage() {
  return <SignInForm googleConfigured={isGoogleAuthConfigured()} />;
}

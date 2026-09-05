import PhoneHandoffClient from "./client";

export const metadata = {
  title: "Continue verification",
  robots: { index: false, follow: false },
};

export default async function PhoneHandoffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PhoneHandoffClient token={token} />;
}

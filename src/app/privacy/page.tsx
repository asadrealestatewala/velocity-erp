import Image from "next/image";

export const metadata = { title: "Privacy Policy" };

// TEMPLATE ONLY. Replace with the organisation's legally reviewed privacy policy, or point
// Settings → Privacy & consent → "Privacy policy URL" at the official policy page.
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[#eef1f5] px-4 py-12">
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow sm:p-12">
        <Image src="/brand/yadea-logo-dark.png" alt="YADEA" width={130} height={28} className="mb-8 h-7 w-auto" />
        <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Template placeholder — this page must be replaced with YADEA&apos;s approved privacy policy before going live.
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-700">
          <p>This notice explains how personal information submitted through YADEA forms (test-drive bookings, customer inquiries and dealership applications) is collected and used.</p>
          <h2 className="pt-2 text-lg font-semibold text-ink-900">What we collect</h2>
          <p>Contact details you provide (name, phone, email, city), your product interests, preferred outlet and appointment time, and — for dealership applications — business information and documents you upload.</p>
          <h2 className="pt-2 text-lg font-semibold text-ink-900">How we use it</h2>
          <p>To respond to your request, arrange test drives through the outlet you select, evaluate dealership applications, and — only where you have agreed — send you product communications.</p>
          <h2 className="pt-2 text-lg font-semibold text-ink-900">Sharing</h2>
          <p>Your request is shared with the authorised YADEA dealership handling it. Dealerships only see requests assigned to them.</p>
          <h2 className="pt-2 text-lg font-semibold text-ink-900">Your choices</h2>
          <p>You may ask us to access, correct or delete your information, or withdraw marketing consent, by contacting YADEA customer care.</p>
        </div>
      </article>
    </div>
  );
}

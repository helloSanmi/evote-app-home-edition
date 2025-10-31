import Head from "next/head";

const sections = [
  {
    heading: "1. Introduction",
    body: [
      "EVote Tech Analytics (\"we\", \"our\", \"us\") provides an online platform that enables eligible voters and administrators to manage electoral processes, including voter onboarding, candidate management, live participation, and publication of results.",
      "By creating an account, accessing, or using the service (the \"Service\"), you (\"you\", \"your\", \"user\") agree to be bound by these Terms and Conditions (\"Terms\"). If you do not agree, you must not use the Service.",
    ],
  },
  {
    heading: "2. Eligibility and Account Responsibilities",
    body: [
      "You represent that you meet all legal requirements to participate in the elections governed through the Service and that any information you provide during registration and verification is accurate, complete, and current.",
      "You are responsible for safeguarding your login credentials. Any action taken using your credentials will be deemed to have been authorised by you. Notify us immediately of any unauthorised use.",
      "We reserve the right to suspend or terminate accounts that provide false information, engage in abusive behaviour, or otherwise violate these Terms or applicable laws.",
    ],
  },
  {
    heading: "3. Verification and Compliance",
    body: [
      "Certain elections may require identity verification. When you upload verification documents, you grant us permission to store, review, and share them with authorised administrators for the sole purpose of validating eligibility.",
      "You must only submit documents you are legally permitted to share. You remain responsible for the accuracy and lawfulness of any materials submitted.",
      "We may decline, revoke, or revoke verification status at our sole discretion if documents are invalid, altered, or otherwise insufficient.",
    ],
  },
  {
    heading: "4. Acceptable Use",
    body: [
      "You agree not to misuse the Service, including but not limited to tampering with electoral processes, disrupting other users' access, introducing malicious code, scraping data, reverse engineering, or infringing intellectual property rights.",
      "You may not use the Service for any unlawful purpose, including interfering with democratic processes, spreading misinformation, or violating privacy, election, or communications laws.",
      "We reserve the right to monitor usage, investigate suspected violations, and take appropriate action, including reporting illegal activities to authorities.",
    ],
  },
  {
    heading: "5. Data Protection and Privacy",
    body: [
      "We handle personal information in accordance with our Privacy Policy. By using the Service, you consent to the collection, use, storage, and processing of your information as described therein.",
      "Where required by law, we may share personal data with electoral bodies, law enforcement, or other competent authorities.",
      "You agree to comply with all applicable data protection obligations when accessing, exporting, or otherwise handling information obtained through the Service.",
    ],
  },
  {
    heading: "6. Intellectual Property",
    body: [
      "The Service, including all software, logos, content, and documentation, is owned by us or our licensors and is protected by intellectual property laws.",
      "You are granted a limited, non-exclusive, non-transferable licence to use the Service solely for lawful participation in managed elections. You may not copy, modify, distribute, sell, lease, or create derivative works from any part of the Service without prior written consent.",
    ],
  },
  {
    heading: "7. Disclaimers",
    body: [
      "The Service is provided on an \"as is\" and \"as available\" basis without warranties of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, or non-infringement.",
      "We do not guarantee uninterrupted, secure, or error-free operation, nor do we warrant that the information provided through the Service is accurate or complete. Users rely on the Service at their own risk.",
      "We expressly disclaim liability for decisions or outcomes of elections conducted using the Service; responsibility remains with the organisers and participants.",
    ],
  },
  {
    heading: "8. Limitation of Liability",
    body: [
      "To the fullest extent permitted by law, we will not be liable for indirect, incidental, consequential, special, exemplary, or punitive damages, nor for lost profits, lost data, or other intangible losses arising out of or relating to your use of the Service.",
      "In jurisdictions that do not allow such limitations, our total liability for any claim arising out of or relating to the Service shall not exceed the greater of (a) the amount you paid (if any) for use of the Service in the twelve (12) months preceding the claim, or (b) one hundred US dollars ($100).",
    ],
  },
  {
    heading: "9. Indemnification",
    body: [
      "You agree to indemnify, defend, and hold harmless EVote Tech Analytics, its officers, directors, employees, contractors, and affiliates from and against any claims, liabilities, damages, losses, and expenses, including reasonable legal fees, arising out of or in any way connected with your use of the Service, your violation of these Terms, or your infringement of any rights of another party.",
    ],
  },
  {
    heading: "10. Modifications and Termination",
    body: [
      "We may modify these Terms at any time. Material changes will be communicated through the Service or by email. Continued use after changes take effect constitutes acceptance of the revised Terms.",
      "We may suspend or terminate access to the Service at any time, with or without notice, for conduct that violates these Terms, applicable law, or risks harm to other users, the platform, or our reputation.",
    ],
  },
  {
    heading: "11. Governing Law and Dispute Resolution",
    body: [
      "These Terms are governed by the laws of the jurisdiction in which EVote Tech Analytics is incorporated, without regard to its conflict of law provisions.",
      "Any dispute arising out of or relating to these Terms or the Service shall be resolved through good-faith negotiations. If unresolved, disputes shall be submitted to the competent courts of that jurisdiction, unless mandatory law provides otherwise.",
    ],
  },
  {
    heading: "12. Contact Information",
    body: [
      "If you have questions about these Terms, please contact: legal@techanalytics.org.",
    ],
  },
];

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms &amp; Conditions • EVote Tech Analytics</title>
        <meta
          name="description"
          content="Terms and Conditions governing the use of the EVote Tech Analytics voting platform."
        />
      </Head>
      <main className="mx-auto max-w-4xl px-4 py-12 space-y-8">
        <header className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">Terms &amp; Conditions</h1>
          <p className="text-sm text-slate-500">
            Last updated {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </header>
        <article className="space-y-6 rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg backdrop-blur sm:p-10">
          {sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-slate-600">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </article>
        <footer className="text-center text-xs text-slate-400">
          By creating an account you acknowledge that you have read, understood, and agree to these Terms &amp; Conditions.
        </footer>
      </main>
    </>
  );
}

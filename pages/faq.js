import { useState } from "react";

const faqs = [
  {
    question: "How do I know if I’m eligible to vote in an election?",
    answer: (
      <div className="space-y-3">
        <p>
          After you complete your profile, the eligibility service checks your age, verified state/LGA, and any whitelist
          requirements for each election. Only sessions that match your details appear on the Vote page and in your
          notifications.
        </p>
        <p>
          If an election doesn’t show up, open your profile to confirm your state of residence, LGA, and date of birth are
          accurate.
        </p>
      </div>
    ),
  },
  {
    question: "What do the election phases (Scheduled, Live, Archived) mean?",
    answer: (
      <div className="space-y-3">
        <p>
          <strong>Scheduled</strong> elections are published in advance so you can review candidates and set reminders.
          <strong>Live</strong> means ballots are open—cast your vote before the countdown ends. Once the administrator
          publishes results, the session moves to <strong>Archived</strong> where you can revisit the tallies anytime.
        </p>
      </div>
    ),
  },
  {
    question: "Why did I receive a notification about an election ending early?",
    answer: (
      <div className="space-y-3">
        <p>
          Administrators can end a session before its scheduled closing time if something unexpected happens. They must
          record a reason, which is delivered with your notification and displayed on the results page so voters understand
          what changed.
        </p>
      </div>
    ),
  },
  {
    question: "How do candidate details get updated before voting starts?",
    answer: (
      <div className="space-y-3">
        <p>
          Admins can edit or replace candidates attached to a scheduled election up until the ballot goes live. Any changes
          sync instantly to the voter view, so double-check the candidate gallery before voting starts.
        </p>
      </div>
    ),
  },
  {
    question: "What should I do if my profile information is wrong?",
    answer: (
      <div className="space-y-3">
        <p>
          Open the profile menu and submit a change request with the correct details (for example, a new LGA or updated ID).
          Super administrators review submissions and, once approved, your eligibility refreshes automatically.
        </p>
      </div>
    ),
  },
  {
    question: "How do real-time notifications work?",
    answer: (
      <div className="space-y-3">
        <p>
          You receive notifications for elections you are eligible for—when a ballot is scheduled, opens, ends, or when
          results publish. Clearing a notification hides it from your tray, but you can reload your feed anytime for the
          latest updates.
        </p>
      </div>
    ),
  },
  {
    question: "Can I get help while I’m voting?",
    answer: (
      <div className="space-y-3">
        <p>
          Yes. Use the chat bubble at the bottom-right of the app to message the support team. Conversations are routed to
          the next available admin, and you can end the chat yourself once the issue is resolved.
        </p>
      </div>
    ),
  },
  {
    question: "How do administrators track participation during a live session?",
    answer: (
      <div className="space-y-3">
        <p>
          The Admin dashboard includes a Live participation tab with real-time vote counts. Admins can filter by scope or
          search by title to focus on specific elections and, if necessary, end a session directly from that view.
        </p>
      </div>
    ),
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_40px_120px_-80px_rgba(15,23,42,0.55)] backdrop-blur md:p-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Support</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">Frequently Asked Questions</h1>
          <p className="mt-3 text-sm text-slate-500">
            Get quick answers about verifying eligibility, staying informed, and keeping elections running smoothly.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          {faqs.map((item, index) => {
            const open = openIndex === index;
            const contentId = `faq-panel-${index}`;
            return (
              <div
                key={item.question}
                className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-indigo-200"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpenIndex((prev) => (prev === index ? -1 : index))}
                  aria-expanded={open}
                  aria-controls={contentId}
                >
                  <span className="text-base font-semibold text-slate-900">{item.question}</span>
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition ${
                      open ? "rotate-45 border-indigo-200 text-indigo-600" : ""
                    }`}
                    aria-hidden="true"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M2 7h10M7 2v10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
                <div
                  id={contentId}
                  className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden px-5 pb-5">
                    <div className="text-sm leading-relaxed text-slate-600">{item.answer}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

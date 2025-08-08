// Additional functionalities to appeal to users and testers
// - Add a "How it Works" page explaining the voting process.
// - Add a "Contact Us" or "Support" page for issues.
// - Integrate a simple "FAQ" section on the homepage or a separate page.
// - Add real-time updates on the vote page (polling backend periodically).
// - Add accessibility improvements (ARIA labels, focus states).

// Example: Add a FAQ page
// frontend/pages/faq.js
export default function FAQ() {
    return (
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Frequently Asked Questions</h1>
        <div>
          <h2 className="font-semibold text-gray-700">How does voting work?</h2>
          <p className="text-gray-600">You need to register and then log in. Once the voting period starts, select your candidate and submit your vote. You can only vote once per period.</p>
        </div>
        <div>
          <h2 className="font-semibold text-gray-700">Can I see past results?</h2>
          <p className="text-gray-600">Yes, click on "Past Results" to view previous voting sessions.</p>
        </div>
        <div>
          <h2 className="font-semibold text-gray-700">Is my vote secure?</h2>
          <p className="text-gray-600">Yes, votes are recorded securely and you cannot vote more than once per session. Results are only published by the admin after voting ends.</p>
        </div>
      </div>
    );
  }
  
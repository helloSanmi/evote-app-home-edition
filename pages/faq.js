// frontend/pages/faq.js
export default function FAQ() {
  return (
    <div className="max-w-4xl mx-auto px-4">
      <div className="bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Frequently Asked Questions</h1>
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold">How do I register?</h2>
            <p className="text-gray-600">Click Register in the navigation and fill out the short form.</p>
          </div>
          <div>
            <h2 className="font-semibold">How do I vote?</h2>
            <p className="text-gray-600">Log in and go to the Vote page while a session is active.</p>
          </div>
          <div>
            <h2 className="font-semibold">When can I see results?</h2>
            <p className="text-gray-600">After the admin publishes results, participants can view them on the Results page.</p>
          </div>
          <div>
            <h2 className="font-semibold">Who manages sessions?</h2>
            <p className="text-gray-600">Only the admin can start sessions, add candidates, and publish results.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

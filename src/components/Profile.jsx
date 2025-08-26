import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';

function Profile({ user, db, onProfileComplete }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await setDoc(doc(db, 'users', user.uid), {
        firstName,
        lastName,
        name: firstName + ' ' + lastName,
        email: user.email,
      }, { merge: true });
      onProfileComplete();
    } catch (err) {
      setError("Failed to save name. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 via-white to-green-100 relative overflow-hidden">
      <div className="w-full max-w-md mx-auto flex flex-col items-center  rounded-2xl p-8 mt-12 bg-opacity-50	">
        {/* <img src="/logogpt.png" alt="Corporate Assistant Logo" className="w-16 h-16 mb-4 drop-shadow-xl" /> */}
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Complete your profile</h2>
        <p className="text-gray-600 mb-6 text-center">Enter your first and last name to personalize your experience.</p>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <input
            type="text"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-200 focus:outline-none text-sm"
            placeholder="First Name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            required
            disabled={loading}
          />
          <input
            type="text"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-200 focus:outline-none text-sm"
            placeholder="Last Name"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            required
            disabled={loading}
          />
          {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
          <button
            type="submit"
            className="w-full py-3 px-8 bg-purple-500 text-white rounded-xl font-semibold text-sm shadow hover:bg-purple-600 transition-all"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Profile; 
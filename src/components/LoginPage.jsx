import React, { useState } from 'react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

function LoginPage({ auth, provider, onLogin, db }) {
  const [error, setError] = useState(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password) => password.length >= 6;
  const [showMobileSignUp, setShowMobileSignUp] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // Keyboard handling for mobile to keep bottom buttons visible
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const heightDelta = Math.max(0, window.innerHeight - vv.height);
      setKeyboardOffset(heightDelta);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists() || !userDocSnap.data().name) {
        onLogin(user, true); // needsProfile = true
      } else {
        onLogin(user, false);
      }
    } catch (error) {
        let userMessage = `Failed to sign in with Google: ${error.message}`;
        if (error.code === 'auth/operation-not-allowed') {
            userMessage = "Sign-in failed: Google Sign-In is not enabled for this project. Please enable it in the Firebase Console.";
        } else if (error.code === 'auth/unauthorized-domain') {
            userMessage = "Sign-in failed: The application's domain is not authorized.";
        }
        setError(userMessage);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address (e.g., user@example.com). Email cannot be blank.");
      return;
    }
    if (!validatePassword(password)) {
      setError("Password must be at least 6 characters long. Please choose a longer password.");
      return;
    }
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;
      // Save profile to Firestore
      await setDoc(doc(db, 'users', user.uid), {
        firstName,
        lastName,
        name: firstName + ' ' + lastName,
        email: user.email,
      });
      setLoading(false);
      onLogin(user);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please sign in or use a different email.');
      } else if (error.code === 'auth/invalid-email') {
        setError('The email address is invalid. Please check and try again.');
      } else {
        setError('Sign up failed. Please check your details and try again.');
      }
      setLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    if (!validateEmail(email)) {
      setError("Please enter a valid email address (e.g., user@example.com). Email cannot be blank.");
      return;
    }
    if (!password) {
      setError("Please enter your password. Password cannot be blank.");
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;
      setLoading(false);
      onLogin(user);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        setError('No account found with this email. Please sign up first.');
      } else if (error.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else if (error.code === 'auth/invalid-email') {
        setError('The email address is invalid. Please check and try again.');
      } else {
        setError('Sign in failed. Please check your credentials and try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-row bg-gradient-to-br from-blue-100 via-white to-green-100 relative overflow-hidden">
      {/* Left: Introduction (always visible on desktop, main content on mobile) */}
      <SimpleBar className={`flex flex-col w-full md:w-2/3 h-[100dvh] bg-white/80 backdrop-blur-lg border-r border-gray-200 relative overflow-y-auto hide-scrollbar ${showMobileSignUp ? 'hidden md:flex' : ''}`} style={{ maxHeight: '100dvh', WebkitOverflowScrolling: 'touch' }}>
        {/* Crystal Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="crystal crystal-1"></div>
          <div className="crystal crystal-2"></div>
          <div className="crystal crystal-3"></div>
          <div className="crystal crystal-4"></div>
          <div className="crystal crystal-5"></div>
          <div className="crystal crystal-6"></div>
          <div className="crystal crystal-7"></div>
          <div className="crystal crystal-8"></div>
        </div>
        <div className="flex items-center gap-3 p-8 pb-2">
          <img src="https://res.cloudinary.com/dletulk75/image/upload/v1754995639/logogpt_lunxdx.png" alt="Corporate Assistant Logo" className="w-14 h-14 drop-shadow-xl" />
          <span className="text-2xl text-gray-800 font-semibold tracking-tight">CorpGPT</span>
        </div>
        <div className="px-8 pb-6 pt-2 flex flex-col gap-6 relative">
          {/* Crystal Background for Content Area */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="crystal crystal-content-1"></div>
            <div className="crystal crystal-content-2"></div>
            <div className="crystal crystal-content-3"></div>
            <div className="crystal crystal-content-4"></div>
            <div className="crystal crystal-content-5"></div>
            <div className="crystal crystal-content-6"></div>
            <div className="crystal crystal-content-7"></div>
            <div className="crystal crystal-content-8"></div>
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mt-4"
            >
              <span
                className="bg-gradient-to-r from-blue-500 via-purple-500 to-green-400 bg-clip-text text-transparent animate-gradient-move"
                style={{
                  backgroundSize: '200% 200%',
                  display: 'inline-block',
                }}
              >
                Empowering Your Workday with AI-Powered Productivity
              </span>
            </h2>
          <div className="text-lg text-gray-700 leading-relaxed">
            <p>CorpGPT is your all-in-one AI-powered productivity suite for the modern workplace. Effortlessly draft professional emails, summarize documents, improve your writing, and communicate with clarity—all in one place.</p>
            <ul className="list-disc pl-6 mt-4 text-base text-gray-600">
              <li>Summarize PDFs, Word, and PowerPoint files instantly</li>
              <li>Draft and polish emails with AI</li>
              <li>Generate clear, effective Teams messages</li>
              <li>Get grammar and clarity feedback on any text</li>
              <li>All processing happens securely in your browser</li>
            </ul>
            <div className="mt-8 text-base text-gray-500 italic">Let CorpGPT handle it, so you can focus on what matters...</div>
          </div>
          {/* Features Showcase - vertical, alternating left/right */}
          
        </div>
        {/* Floating sign up button - only visible on mobile when sign up is not open */}
        {!showMobileSignUp && (
          <div className="fixed bottom-0 left-0 w-full flex justify-center items-end pb-6 z-30 md:hidden" style={{ paddingBottom: `calc(6px + ${keyboardOffset}px)` }}>
            <button
              className="px-6 py-3 bg-black text-white rounded-full font-semibold text-base shadow-lg hover:bg-gray-800 transition-all"
              style={{ maxWidth: '90vw' }}
              onClick={() => setShowMobileSignUp(true)}
            >
              Sign up to get started
            </button>
          </div>
        )}
      </SimpleBar>
      {/* Right: Login/Sign Up (hidden on mobile unless showMobileSignUp) */}
      <div className={`flex flex-1 flex-col items-center justify-center h-[100dvh] relative z-10 px-4 bg-white md:bg-transparent md:w-1/3 ${showMobileSignUp ? 'fixed inset-0 w-full h-full z-50 bg-white' : 'hidden md:flex'}`} style={{ overflowY: 'auto' }}>
        <div className="w-full max-w-sm mx-auto flex flex-col items-center">
          {error && <div className="p-4 mb-6 bg-red-100 text-red-700 rounded-lg text-left text-sm max-w-md w-full">{error}</div>}
          {/* Context-specific heading */}
          {!showSignIn && (
            <h2 className="text-xl font-semibold text-gray-800 mb-8">Sign up to get started</h2>
          )}
          {showSignIn && (
            <h2 className="text-xl font-semibold text-gray-800 mb-8">Sign into your account.</h2>
          )}
          {/* Sign Up Form */}
          {!showSignIn && (
            <form onSubmit={handleSignUp} className="w-full flex flex-col gap-3 mb-4">
              <input
                type="text"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-gray-200 focus:outline-none text-sm bg-gray-50"
                placeholder="First Name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                required
                disabled={loading}
              />
              <input
                type="text"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-gray-200 focus:outline-none text-sm bg-gray-50"
                placeholder="Last Name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                required
                disabled={loading}
              />
              <input
                type="email"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-gray-200 focus:outline-none text-sm bg-gray-50"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              <div className="relative">
                <input
                  type={showSignUpPassword ? "text" : "password"}
                  className="w-full px-3 py-2 pr-10 rounded-md border border-gray-300 focus:ring-2 focus:ring-gray-200 focus:outline-none text-sm bg-gray-50"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                  disabled={loading}
                >
                  {showSignUpPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <button type="submit" className="w-full py-2 px-4 bg-black text-white rounded-md font-medium text-sm hover:bg-gray-800 transition-all" disabled={loading}>
                {loading ? 'Signing Up...' : 'Sign Up'}
              </button>
            </form>
          )}
          {/* Sign In Form */}
          {showSignIn && (
            <form onSubmit={handleSignIn} className="w-full flex flex-col gap-3 mb-4">
              <input
                type="email"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-gray-200 focus:outline-none text-sm bg-gray-50"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full px-3 py-2 pr-10 rounded-md border border-gray-300 focus:ring-2 focus:ring-gray-200 focus:outline-none text-sm bg-gray-50"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <button type="submit" className="w-full py-2 px-4 bg-black text-white rounded-md font-medium text-sm hover:bg-gray-800 transition-all" disabled={loading}>
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          )}
          {/* Toggle Sign Up/Sign In */}
          <button
            className="mt-2 text-gray-600 underline hover:text-gray-800 text-base font-medium focus:outline-none"
            onClick={() => {
              setShowSignIn(v => !v);
              setError(null);
              setEmail("");
              setPassword("");
            }}
            type="button"
          >
            <div className="text-sm">
            {showSignIn ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </div>
          </button>
          {/* Google Sign-In */}
          <button onClick={handleGoogleSignIn} className="inline-flex items-center justify-center gap-3 py-2 px-4 w-full bg-white text-black rounded-md font-medium text-base shadow hover:bg-gray-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mt-4">
            <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.82l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
            <span>Sign in with Google</span>
          </button>
          {/* Close button for mobile sign up overlay */}
          <button
            className="md:hidden mt-8 text-gray-500 underline hover:text-gray-800 text-base font-medium focus:outline-none"
            style={{ display: showMobileSignUp ? 'block' : 'none' }}
            onClick={() => { setShowMobileSignUp(false); setShowSignIn(false); }}
            type="button"
          >
            Back to welcome
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
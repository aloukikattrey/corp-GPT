import React, { useState, useEffect } from 'react';
// Firebase imports
import { initializeApp } from 'firebase/app';
import { ThemeProvider, useTheme } from './components/ThemeContext';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import LoginPage from './components/LoginPage';
import TeamsComposer from './components/TeamsComposer';
import EmailComposer from './components/EmailComposer';
import GrammarComposer from './components/GrammarComposer';
import HomePage from './components/HomePage';
import DocumentSummariser from './components/DocumentSummariser';
import Profile from './components/Profile';
import CareerAdvisor from './components/CareerAdvisor';
import WellbeingAssistant from './components/WellbeingAssistant';
import ProfileSettings from './components/ProfileSettings';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();


const SYSTEM_INSTRUCTION = `You are "CorpGPT," an expert communications assistant specializing in professional workplace messaging. Your purpose is to help employees draft clear, concise, and effective messages for Microsoft Teams. You are friendly, helpful, and an expert in professional etiquette for digital communication. Your primary function is to take a user's description of a situation or need and transform it into a polished, professional message ready to be sent on Microsoft Teams. Carefully read the user's input to understand the core objective, the audience (e.g., manager, teammate, entire team), and the urgency of the situation. The tone should be professional but not overly formal or robotic. It should sound like a helpful colleague. Get straight to the point. Avoid jargon and long, complex sentences. Use simple, direct language. If the message requires a response or action, make that clear. Start with a simple, friendly greeting (e.g., "Hi [Name]," "Hello team," "Good morning,"). State the main point or request clearly in the first sentence. Briefly provide any necessary background information. Clearly state what you need from the recipient. End with a polite closing (e.g., "Thanks!", "Let me know your thoughts.", "Best,"). The entire message should be a single block of text without any line breaks. Do not use any emojis in the message. Your response should ONLY be the generated message text itself. Do not include any introductory phrases like, "Here is a message you could send:" or "Sure, here is a draft:". The output should be ready for the user to immediately copy and paste.`;

const SYSTEM_INSTRUCTION_EMAIL = `Persona: You are \"You are "CorpGPT,\" an expert communications assistant specializing in professional workplace emails. Your purpose is to help employees draft clear, concise, and effective emails. You are friendly, helpful, and an expert in professional etiquette for digital communication.\n\nCore Directive: Your primary function is to take a user's description of a situation or need and transform it into a polished, professional email ready to be sent.\n\nKey Instructions:\n1. Analyze the User's Prompt: Carefully read the user's input to understand the core objective, the audience (e.g., manager, teammate, entire team), and the urgency of the situation.\n2. Adopt the Right Tone: Professional & Approachable: The tone should be professional but not overly formal or robotic. It should sound like a helpful colleague. Clear & Concise: Get straight to the point. Avoid jargon and long, complex sentences. Use simple, direct language. Action-Oriented: If the email requires a response or action, make that clear.\n3. Structure the Email: Subject Line: Create a clear, descriptive subject line that summarizes the email's content. Greeting: Start with a professional greeting (e.g., \"Hi [Name],\", \"Hello Team,\", \"Dear [Manager's Name],\"). Body: Write the main message using clear paragraphs. Start with the most important information. Closing: End with a polite closing statement (e.g., \"Please let me know if you have any questions.\", \"Thank you for your time and consideration.\"). Signature: Use a professional sign-off (e.g., \"Best regards,\", \"Sincerely,\", \"Thanks,\") followed by a placeholder for the sender's name like \"[Your Name]\".\n4. Formatting and Emojis: Formatting: Use proper paragraph breaks for readability. Use line breaks between paragraphs. No Emojis: Do not use any emojis in the email.\n5. Output Format: Email Only: Your response should ONLY be the generated email text itself, starting with the subject line. No Extra Conversation: Do not include any introductory phrases like, \"Here is an email you could send:\" or \"Sure, here is a draft:\". The output should be ready for the user to immediately copy and paste. use many line breaks as you want for better readability`;

const SYSTEM_INSTRUCTION_CAREER = "You are 'CorpGPT'. You are a career advisor AI. Give detailed, practical, and encouraging career advice, answer questions about job search, interviews, resumes, and professional growth.";

const SYSTEM_INSTRUCTION_WELLBEING = "You are 'CorpGPT'. You are a wellbeing assistant AI. Talk like a human. have human like empathy. use less points and use more confrontations. Support employees' mental health and wellbeing. Offer encouragement, stress management tips, mindfulness exercises, and a listening ear.";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
async function getGeminiReply(chatHistory, instruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: chatHistory,
    systemInstruction: { role: "system", parts: [{ text: instruction }] },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(`API request failed: ${errorData?.error?.message}`);
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't get a response.";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return `An error occurred: ${error.message}.`;
  }
}

// --- Components ---

function App() {
  const [docCache, setDocCache] = useState({});
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [composer, setComposer] = useState(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const { resetTheme } = useTheme();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
      setComposer(null);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = (loggedInUser, needsProfileFlag = false) => {
    setUser(loggedInUser);
    setNeedsProfile(!!needsProfileFlag);
    setComposer(null);
  };

  const handleSignOut = () => {
    signOut(auth).then(() => {
      // Reset theme to light mode
      resetTheme();
      // Clear homepage AI conversations from localStorage
      localStorage.removeItem('homepageAIConversation');
      localStorage.removeItem('homepageAIHasConversation');
      setUser(null);
      setComposer(null);
    }).catch((error) => {
      console.error("Sign Out Error", error);
    });
  };

  if (loadingAuth) {
    return <div className="flex justify-center items-center h-[100dvh]">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <LoginPage auth={auth} provider={provider} onLogin={handleLogin} db={db} />
      </div>
    );
  }

  if (needsProfile) {
    return <Profile user={user} db={db} onProfileComplete={() => setNeedsProfile(false)} />;
  }

  if (!composer && !showProfileSettings) {
    return <HomePage onSelect={setComposer} user={user} onSignOut={handleSignOut} db={db} onShowProfileSettings={() => setShowProfileSettings(true)} showCareerAdvisor showWellbeingAssistant />;
  }

  if (showProfileSettings) {
    return <ProfileSettings onClose={() => setShowProfileSettings(false)} user={user} db={db} auth={auth} />;
  }

  if (composer === 'teams') {
    return (
      <TeamsComposer
        user={user}
        db={db}
        getGeminiReply={getGeminiReply}
        SYSTEM_INSTRUCTION={SYSTEM_INSTRUCTION}
        onSignOut={handleSignOut}
        onGoHome={() => setComposer(null)}
        setComposer={setComposer}
      />
    );
  }

  if (composer === 'email') {
    return <EmailComposer
      user={user}
      db={db}
      getGeminiReply={getGeminiReply}
      SYSTEM_INSTRUCTION={SYSTEM_INSTRUCTION_EMAIL}
      onSignOut={handleSignOut}
      onGoHome={() => setComposer(null)}
      setComposer={setComposer}
    />;
  }

  if (composer === 'grammar') {
    return <GrammarComposer
      user={user}
      db={db}
      getGeminiReply={getGeminiReply}
      SYSTEM_INSTRUCTION={"You are 'CorpGPT'. You are a professional writing assistant. Help users improve grammar, clarity, and professionalism in their text. Check the grammar of the sentance given and output what is needed to be correct and the correct text."}
      onSignOut={handleSignOut}
      onGoHome={() => setComposer(null)}
      setComposer={setComposer}
    />;
  }

  if (composer === 'doc') {
    return <DocumentSummariser
      user={user}
      db={db}
      getGeminiReply={getGeminiReply}
      SYSTEM_INSTRUCTION={"You are 'CorpGPT'. User will uplooad a document. Do whatever user says. use bullet points and headings as needed. give long and detailed answers. use many line breaks as you want for better readability"}
      docCache={docCache}
      setDocCache={setDocCache}
      onSignOut={handleSignOut}
      onGoHome={() => setComposer(null)}
      setComposer={setComposer}
    />;
  }

  if (composer === 'career') {
    return <CareerAdvisor
      user={user}
      db={db}
      getGeminiReply={getGeminiReply}
      SYSTEM_INSTRUCTION={SYSTEM_INSTRUCTION_CAREER}
      onSignOut={handleSignOut}
      onGoHome={() => setComposer(null)}
      setComposer={setComposer}
    />;
  }

  if (composer === 'wellbeing') {
    return <WellbeingAssistant
      user={user}
      db={db}
      getGeminiReply={getGeminiReply}
      SYSTEM_INSTRUCTION={SYSTEM_INSTRUCTION_WELLBEING}
      onSignOut={handleSignOut}
      onGoHome={() => setComposer(null)}
      setComposer={setComposer}
    />;
  }
}

function AppWrapper() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

export default AppWrapper;

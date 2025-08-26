import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useTheme } from './ThemeContext';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { motion, AnimatePresence } from 'framer-motion';

// Gemini API function
async function getGeminiReply(chatHistory, instruction) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
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

// Utility to get initials from name
function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(' ');
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Utility to get a random color based on initials
function getColorFromInitials(initials) {
  // Use a hash to pick a color from a palette
  const colors = [
    '#F59E42', // orange
    '#4F8AF4', // blue
    '#34C759', // green
    '#F44292', // pink
    '#A259F7', // purple
    '#F7B32B', // yellow
    '#2D9CDB', // teal
    '#FF6F61', // coral
    '#6DD47E', // light green
    '#FFB946', // gold
  ];
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % colors.length;
  return colors[idx];
}

function HomePage({ onSelect, user, onSignOut, db, onShowProfileSettings }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [userName, setUserName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [showAiResult, setShowAiResult] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [conversation, setConversation] = useState(() => {
    // Load conversation from localStorage on component mount
    const saved = localStorage.getItem('homepageAIConversation');
    return saved ? JSON.parse(saved) : [];
  });
  const [hasConversation, setHasConversation] = useState(() => {
    // Load hasConversation state from localStorage
    const saved = localStorage.getItem('homepageAIHasConversation');
    return saved ? JSON.parse(saved) : false;
  });
  const chatEndRef = useRef(null);
  const { darkMode, toggleDarkMode } = useTheme();

  useEffect(() => {
    const fetchProfile = async () => {
      if (user && db) {
        const profileRef = doc(db, 'users', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const userData = profileSnap.data();
          setUserName(userData.name || "");
          setProfileImageUrl(userData.profileImage || "");
        }
      }
    };
    fetchProfile();
  }, [user, db]);

  // Save conversation to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('homepageAIConversation', JSON.stringify(conversation));
  }, [conversation]);

  // Save hasConversation state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('homepageAIHasConversation', JSON.stringify(hasConversation));
  }, [hasConversation]);

  // Auto-scroll to latest message when conversation changes
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);



  // Card data for search/filter
  const categories = [
    {
      name: "Communication",
      cards: [
        {
          key: 'teams',
          title: 'Teams Composer',
          description: 'Draft clear, professional messages for Microsoft Teams.',
        },
        {
          key: 'email',
          title: 'Email Composer',
          description: 'Write effective, polished emails for any workplace scenario.',
        },
      ],
    },
    {
      name: "Productivity",
      cards: [
        {
          key: 'grammar',
          title: 'Writing Editor',
          description: 'Fix grammar, spelling, and clarity in your writing instantly.',
        },
        {
          key: 'doc',
          title: 'Document Summariser',
          description: 'Summarise and extract key points from PDF and Word documents.',
        },
      ],
    },
    {
      name: "Wellbeing",
      cards: [
        {
          key: 'career',
          title: 'Career Advisor',
          description: 'Get expert advice on job search, interviews, and professional growth.',
        },
        {
          key: 'wellbeing',
          title: 'Wellbeing Assistant',
          description: 'Support your mental health and wellbeing at work. Or, listen to the calm music!',
        },
      ],
    },
  ];

  // Icon mapping for each card
  const cardIcons = {
    teams: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="2" className="fill-blue-400/30" />
        <rect x="14" y="3" width="7" height="7" rx="2" className="fill-blue-400/30" />
        <rect x="14" y="14" width="7" height="7" rx="2" className="fill-blue-400/30" />
        <rect x="3" y="14" width="7" height="7" rx="2" className="fill-blue-400/30" />
      </svg>
    ),
    email: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="3" className="fill-green-400/30" />
        <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    grammar: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M4 19.5A2.5 2.5 0 006.5 22h11a2.5 2.5 0 002.5-2.5v-15A2.5 2.5 0 0017.5 2h-11A2.5 2.5 0 004 4.5v15z" className="stroke-purple-400" />
        <path d="M8 6h8M8 10h8M8 14h6" className="stroke-pink-400" />
      </svg>
    ),
    doc: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="2" className="stroke-purple-300" />
        <path d="M8 8h8M8 12h8M8 16h4" className="stroke-purple-400" />
      </svg>
    ),
    career: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M12 2a7 7 0 017 7v2a7 7 0 01-7 7 7 7 0 01-7-7V9a7 7 0 017-7z" className="stroke-yellow-400" />
        <path d="M12 22v-4" className="stroke-yellow-400" />
      </svg>
    ),
    wellbeing: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" className="stroke-pink-400" />
        <path d="M8 15s1.5-2 4-2 4 2 4 2" className="stroke-pink-400" />
        <path d="M9 9h.01M15 9h.01" className="stroke-pink-400" />
      </svg>
    ),
  };

  // Filter logic
  const filteredCategories = categories.map(cat => {
    const filteredCards = cat.cards.filter(card => {
      const q = search.toLowerCase();
      return (
        cat.name.toLowerCase().includes(q) ||
        card.title.toLowerCase().includes(q) ||
        card.description.toLowerCase().includes(q)
      );
    });
    return { ...cat, cards: filteredCards };
  }).filter(cat => cat.cards.length > 0);

  const handleAiSubmit = async () => {
    if (!aiInput.trim()) return;

    const userMessage = aiInput.trim();
    setIsAiLoading(true);
    setShowAiResult(true);

    // Add user message to conversation
    const newConversation = [...conversation, { role: "user", parts: [{ text: userMessage }] }];
    setConversation(newConversation);

    try {
      // Get AI response using Gemini API
      const systemInstruction = `Your name is CorpGPT. You are an AI assistant for a workplace productivity application.

You have access to 6 specialized composer tools:

1. **Teams Composer** - For drafting Microsoft Teams messages
2. **Email Composer** - For writing professional emails
3. **Writing Editor** - For grammar, spelling, and writing improvement
4. **Document Summariser** - For summarizing PDFs and documents
5. **Career Advisor** - For career advice, job search, and professional growth
6. **Wellbeing Assistant** - For mental health and workplace wellbeing support

If a user asks about or wants to use any of these tools, respond with a helpful message and include a special link format: [COMPOSER:tool_name]. For example:
- If they want to write a Teams message: "I can help you draft a Teams message! (next line) [COMPOSER:teams]"
- If they want email help: "I'd be happy to help you write a professional email! (next line) [COMPOSER:email]"
- If they want writing help: "I can help improve your writing! (next line) [COMPOSER:grammar]"

Always be helpful and guide users to the appropriate tool when relevant.`;
      const response = await getGeminiReply(newConversation, systemInstruction);

            // Add AI response to conversation
      const updatedConversation = [...newConversation, { role: "model", parts: [{ text: response }] }];
      setConversation(updatedConversation);
      setAiResult(response);
      setHasConversation(true);
    } catch (error) {
      console.error("Error getting AI response:", error);
      setAiResult("Sorry, I encountered an error. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
    
    setAiInput("");
  };

  const handleAiKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAiSubmit();
    }
  };

  const handleComposerClick = (composerType) => {
    setShowAiResult(false);
    onSelect(composerType);
  };

  const clearConversation = () => {
    setConversation([]);
    setHasConversation(false);
    setShowAiResult(false);
    setAiResult("");
    setAiInput("");
    // Clear from localStorage
    localStorage.removeItem('homepageAIConversation');
    localStorage.removeItem('homepageAIHasConversation');
  };

  const renderMessageWithComposerLinks = (text) => {
    const composerRegex = /\[COMPOSER:(\w+)\]/g;
    const parts = text.split(composerRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 1) { // This is a composer type
        const composerType = part;
        const composerNames = {
          teams: 'Teams Composer',
          email: 'Email Composer', 
          grammar: 'Writing Editor',
          doc: 'Document Summariser',
          career: 'Career Advisor',
          wellbeing: 'Wellbeing Assistant'
        };
        
        return (
          <button
            key={index}
            onClick={() => handleComposerClick(composerType)}
            className="inline-block px-2 py-1 mx-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-md transition-colors cursor-pointer"
          >
            {composerNames[composerType] || composerType}
          </button>
        );
      }
      return part; // Regular text
    });
  };

  return (
    <div className="min-h-screen w-full flex flex-col relative overflow-hidden bg-white">
      {/* Header with logo, search bar, and user info, centered in a max-w-4xl container */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between px-4 pt-4 z-20">
        <div className="flex items-center gap-3">
          <img src="https://res.cloudinary.com/dletulk75/image/upload/v1754995639/logogpt_lunxdx.png" alt="Corporate Assistant Logo" className="w-10 h-10 drop-shadow-xl" />
          <span className="text-xl font-medium tracking-tight hidden md:inline text-gray-800">CorpGPT</span>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="relative max-w-lg w-full flex justify-center">
            {search ? (
              <button
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                style={{ zIndex: 2 }}
                onClick={() => setSearch("")}
                tabIndex={0}
                aria-label="Clear search"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                  <line x1="6" y1="18" x2="18" y2="6" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
                </svg>
              </span>
            )}
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tools..."
              className="w-full pl-12 pr-4 py-2 rounded-full border border-gray-300 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm bg-white shadow transition-all duration-200 min-w-[140px] sm:min-w-[220px] md:min-w-[320px]"
              style={{}}
            />
          </div>
        </div>
        <div>
          {user && (
            <div className="flex items-center gap-3 bg-white backdrop-blur-sm px-0 py-0 rounded-lg shadow-sm border border-gray-200 teams-composer">
              <div className="flex items-center gap-2 relative">
                <button
                  className="flex items-center gap-1 focus:outline-none px-3 py-1 md:px-3 md:py-1 px-2 py-1 sm:px-2 sm:py-1"
                  onClick={() => setUserMenuOpen(v => !v)}
                  aria-label="Show user menu"
                  type="button"
                >
                  {/* Profile Image */}
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt="Profile"
                      className="w-6 h-6 md:w-7 md:h-7 sm:w-6 sm:h-6 rounded-full object-cover shadow"
                    />
                  ) : userName ? (
                    <span
                      className="w-6 h-6 md:w-7 md:h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-white dark:text-white font-bold text-xs md:text-sm shadow"
                      style={{
                        backgroundColor: getColorFromInitials(getInitials(userName)),
                        color: 'white'
                      }}
                    >
                      {getInitials(userName)}
                    </span>
                  ) : (
                    <span className="w-6 h-6 md:w-7 md:h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-full bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-white font-bold text-xs md:text-sm shadow">
                      ?
                    </span>
                  )}
                  <svg className={`w-4 h-4 text-gray-600 transition-transform md:w-4 md:h-4 w-3 h-3 sm:w-3 sm:h-3 ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-12 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg pt-2 px-2 py-1 flex flex-col min-w-[200px] animate-fade-in z-50">
                    <div className="flex flex-col items-start mb-3">
                      {userName && <span className="font-semibold text-sm text-gray-900">{userName}</span>}
                      <span className="font-medium text-xs text-gray-600">{user.email}</span>
                    </div>
                    <div className="flex items-center justify-between mt-3 w-full mb-3">
                      <span className="text-sm text-gray-600">Dark Mode</span>
                      <button
                        onClick={toggleDarkMode}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${darkMode ? 'bg-blue-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`}></span>
                      </button>
                    </div>
                    <button
                      onClick={() => { onShowProfileSettings(); setUserMenuOpen(false); }}
                      className="w-full py-1 px-3 text-gray-700 text-sm hover:bg-gray-100 transition-colors text-left flex items-center gap-2 mb-1 rounded-md"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </button>
                    <div className="w-full h-px bg-gray-200 mb-1"></div>
                    <button
                      onClick={onSignOut}
                      className="w-full py-1 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 transition-colors text-center flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Expand AI Response Button */}
      {hasConversation && !showAiResult && (
                  <button
            onClick={() => setShowAiResult(true)}
            className="drop-shadow-2xl drop-shadow-indigo-500 fixed bottom-20 mb-2 z-40 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-colors backdrop-blur-md w-5 h-5 flex items-center justify-center"
            style={{ 
              left: '50%',
              transform: 'translateX(-50%)'
            }}
          >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
      
      {/* Categories and cards, filtered by search */}
      <div className="flex flex-1 items-center justify-center w-full min-h-[60vh] pt-8">
        <div className="relative w-full max-w-4xl flex flex-col items-center justify-center gap-10 pb-8 text-xs md:text-sm">
          {filteredCategories.map(cat => (
            <div className="w-full" key={cat.name}>
              <h3 className="text-xs font-semibold text-gray-700 mb-3 pl-1 text-center md:text-sm">{cat.name}</h3>
              <div className="flex flex-row flex-wrap gap-4 w-full justify-center items-center">
                {cat.cards.map(card => (
                  <button
                    key={card.key}
                    className="bg-white border border-gray-300 rounded-xl shadow-sm hover:bg-gray-100 transition-all duration-200 focus:outline-none focus:ring-2 flex flex-col items-center min-w-[10rem] max-w-xs p-3"
                    onClick={() => onSelect(card.key)}
                    style={{ boxSizing: 'border-box' }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {/* Icon placeholder, can be replaced with actual icons */}
                      {cardIcons[card.key]}
                      <span className="text-xs font-semibold text-gray-800 whitespace-nowrap md:text-sm">{card.title}</span>
                    </div>
                    <span className="text-xs text-gray-500 text-center break-words">{card.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Input Box */}
      <div className="backdrop-blur-3xl bg-white/80 dark:bg-gray-800/80 border border-gray-200/50 dark:border-gray-700/50 rounded-full shadow-lg fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
        <div className="">
          <div className="flex items-center gap-3 px-4 py-3">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyPress={handleAiKeyPress}
              placeholder="Ask me anything..."
              className="bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 placeholder-gray-500 dark:placeholder-gray-400 text-sm min-w-[300px] max-w-[500px]"
            />
            <button
              onClick={handleAiSubmit}
              disabled={isAiLoading}
              className="flex items-center justify-center w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-full transition-colors"
              title="Send"
            >
              {isAiLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* AI Result Box */}
      <AnimatePresence>
        {showAiResult && (
          <motion.div
            className="fixed bottom-20 z-30 mb-2 w-1/2 "
            style={{
              left: '50%',
              transform: 'translateX(-50%)',
              // width: 'max-content',
              maxWidth: '500px',
              minWidth: '300px'
            }}
            initial={{ opacity: 0, y: -20, scale: 0.95, x: '-50%' }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, y: -20, scale: 0.95, x: '-50%' }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              duration: 0.3
            }}
          >
            <motion.div
              className="pt-4 backdrop-blur-xl bg-bg-gray-900/30 dark:bg-gray-400/30 border border-white/20 dark:border-gray-700/20 rounded-2xl shadow-xl p-6 w-full"
              style={{ maxHeight: '60vh' }}
              layout
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
                duration: 0.3
              }}
            >
              {/* Fixed Collapse Button - Always Visible */}
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20">
                <button
                  onClick={() => {
                    setShowAiResult(false);
                    setAiResult("");
                    setAiInput("");
                    // Don't clear conversation, just hide the box
                  }}
                  className="text-gray-500 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-500 transition-colors "
                >
                  <i class='bxrd  bx-chevron-down-circle'></i> 
                </button>
              </div>
              
              <SimpleBar className="h-full" style={{ maxHeight: 'calc(60vh - 3rem)' }}>
                <div className="h-full">
                  <div className="text-gray-700 dark:text-gray-300 text-sm space-y-3">
                    {conversation.map((message, index) => (
                      <div key={index} className="space-y-1">
                        <div className="text-xs text-gray-600 dark:text-gray-600">
                          {message.role === "user" ? "You" : "CorpGPT"}
                        </div>
                            <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-800 mb-5">
                           {renderMessageWithComposerLinks(message.parts[0].text)}
                         </div>
                      </div>
                    ))}
                    {isAiLoading && (
                      <>
                        <div className="space-y-1">
                          <div className="text-xs text-gray-400 dark:text-gray-400">CorpGPT</div>
                          {/* <div className="text-xs text-gray-400 dark:text-gray-400 ml-3">Thinking...</div> */}
                          <div className="flex items-center self-start gap-2 py-1">
                            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-.3s]"></div>
                            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-.5s]"></div>
                          </div>
                        </div>
                      </>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              </SimpleBar>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default HomePage;

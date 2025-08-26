import React, { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { marked } from 'marked';
import { Transition } from '@headlessui/react';
import musicMp3 from '../sounds/E11250AO.mp3';
import { motion, AnimatePresence } from 'framer-motion';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { useTheme } from './ThemeContext';

function WellbeingAssistant({ user, db, getGeminiReply, SYSTEM_INSTRUCTION, onSignOut, onGoHome, setComposer }) {
  const { darkMode } = useTheme();
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const chatEndRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const textareaRef = useRef(null);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const [sidebarHoverId, setSidebarHoverId] = useState(null);
  const [optionsOpenId, setOptionsOpenId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [audioStatus, setAudioStatus] = useState('idle'); // 'idle' | 'playing' | 'paused'
  const audioRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const filteredChats = searchValue.trim()
    ? chats.filter(chat => chat.title && chat.title.toLowerCase().includes(searchValue.toLowerCase()))
    : chats;

  // Add state for header title and animation
  const [headerTitle, setHeaderTitle] = useState('CorpGPT');
  const [titleKey, setTitleKey] = useState(0); // for animation

  // Web Audio API for fade in/out
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);

  useEffect(() => {
    // Clean up on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    setIsMobile(window.innerWidth <= 768);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep composer above mobile keyboard
  useEffect(() => {
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

  useEffect(() => {
    if (isMobile) {
      setIsSidebarCollapsed(true);
    }
  }, [isMobile]);

  const fadeIn = (gainNode, duration = 0.7) => {
    gainNode.gain.cancelScheduledValues(audioContextRef.current.currentTime);
    gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
    gainNode.gain.linearRampToValueAtTime(1, audioContextRef.current.currentTime + duration);
  };

  const fadeOut = (gainNode, duration = 0.7) => {
    gainNode.gain.cancelScheduledValues(audioContextRef.current.currentTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioContextRef.current.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioContextRef.current.currentTime + duration);
  };

  // Reset progress on stop
  useEffect(() => {
    if (audioStatus === 'idle') {
      // No audioProgress state, so no need to reset
    }
  }, [audioStatus]);

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setMessages([]);
    setInput("");
    setTimeout(() => {
      if (textareaRef.current) textareaRef.current.focus();
    }, 0);
    if (isMobile) setIsSidebarCollapsed(true);
  }, [isMobile]);

  useEffect(() => {
    if (!user) return;
    const chatsRef = collection(db, "users", user.uid, "wellbeing_chats");
    const q = query(chatsRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const userChats = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setChats(userChats);
    });
    handleNewChat();
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || !activeChatId) {
      setMessages([]);
      setOptimisticMessages([]);
      return;
    }
    const messagesRef = collection(db, 'users', user.uid, 'wellbeing_chats', activeChatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const chatMessages = querySnapshot.docs.map(doc => doc.data());
      setMessages(chatMessages);
      setOptimisticMessages((prev) => prev.filter(opt => !chatMessages.some(msg => msg.parts[0].text === opt.parts[0].text && msg.role === opt.role)));
    });
    return () => unsubscribe();
  }, [user, activeChatId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e) => {
      if (!e.target.closest('.modern-composer-dropdown')) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
  }, [input]);

  useEffect(() => {
    if (!optionsOpenId) return;
    const handler = (e) => {
      const menu = document.querySelector('.floating-chat-options-menu');
      if (menu && !menu.contains(e.target)) {
        setOptionsOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [optionsOpenId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [activeChatId]);

  const handleAudioButton = () => {
    if (!audioRef.current) {
      audioRef.current = new window.Audio(musicMp3);
      audioRef.current.crossOrigin = 'anonymous';
      audioRef.current.onended = () => {
        setAudioStatus('playing'); // Loop
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      };
      // Set up Web Audio API
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      gainNodeRef.current = audioContextRef.current.createGain();
      const source = audioContextRef.current.createMediaElementSource(audioRef.current);
      source.connect(gainNodeRef.current).connect(audioContextRef.current.destination);
    }
    if (audioStatus === 'idle' || audioStatus === 'paused') {
      // Fade in
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      // Do not reset currentTime, so it resumes from where left off
      audioRef.current.play();
      setAudioStatus('playing');
      fadeIn(gainNodeRef.current);
    } else if (audioStatus === 'playing') {
      // Fade out, then pause
      fadeOut(gainNodeRef.current);
      setTimeout(() => {
        audioRef.current.pause();
        setAudioStatus('paused');
      }, 700); // match fade duration
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const currentInput = input;
    let currentChatId = activeChatId;
    const isNewChat = !activeChatId;
    setInput("");
    setLoading(true); // Show 'Thinking...' instantly
    const userMessageForFirestore = {
      role: 'user',
      parts: [{ text: currentInput }],
      type: 'user',
      createdAt: serverTimestamp()
    };
    setOptimisticMessages((prev) => [...prev, { ...userMessageForFirestore, createdAt: { seconds: Date.now() / 1000 } }]);
    if (isNewChat) {
      const newChatRef = await addDoc(collection(db, 'users', user.uid, 'wellbeing_chats'), {
        title: "New Wellbeing Chat",
        createdAt: serverTimestamp(),
      });
      currentChatId = newChatRef.id;
      setActiveChatId(newChatRef.id);
    }
    const messagesRef = collection(db, 'users', user.uid, 'wellbeing_chats', currentChatId, 'messages');
    await addDoc(messagesRef, userMessageForFirestore);
    // Restore AI chat title generation for new chats
    if (isNewChat) {
      const titleInstruction = `Create a very short, concise chat title (4 words max) for this user prompt: "${currentInput}". Do NOT include any formatting, quotes, punctuation, emojis, or special characters like **. Only return the plain title text.`;
      const title = await getGeminiReply([{ role: 'user', parts: [{ text: currentInput }] }], titleInstruction);
      const chatRef = doc(db, 'users', user.uid, 'wellbeing_chats', currentChatId);
      const cleanTitle = title.replace(/"/g, '').replace(/\.$/, '');
      await setDoc(chatRef, { title: cleanTitle }, { merge: true });
      setHeaderTitle(cleanTitle);
      setTitleKey(prev => prev + 1);
    }

    const userMessageForApi = {
      role: 'user',
      parts: [{ text: currentInput }]
    };
    const apiChatHistory = [...messages.map(({ role, parts }) => ({ role, parts })), userMessageForApi];
    const botText = await getGeminiReply(apiChatHistory, SYSTEM_INSTRUCTION);
    const botMessageForFirestore = {
      role: 'model',
      parts: [{ text: botText }],
      type: 'bot',
      createdAt: serverTimestamp()
    };
    await addDoc(messagesRef, botMessageForFirestore);
    setLoading(false);
  };

  const handleDeleteChat = async () => {
    if (!chatToDelete) return;
    setShowDeleteModal(false);
    setChatToDelete(null);
    const chatId = chatToDelete.id;
    try {
      const messagesRef = collection(db, 'users', user.uid, 'wellbeing_chats', chatId, 'messages');
      const messagesSnap = await getDocs(messagesRef);
      for (const docSnap of messagesSnap.docs) {
        await deleteDoc(docSnap.ref);
      }
      const chatRef = doc(db, 'users', user.uid, 'wellbeing_chats', chatId);
      await deleteDoc(chatRef);
      setActiveChatId(null);
      setMessages([]);
      setOptimisticMessages([]);
      handleNewChat();
    } catch (err) {
      alert('Failed to delete chat. Please try again.');
    }
  };

  // Helper to get menu position (right or left)
  const getMenuPosition = (chatId) => {
    const el = document.querySelector(`[data-chat-id='${chatId}']`);
    if (!el) return { left: 0, top: 0 };
    const rect = el.getBoundingClientRect();
    const menuWidth = 160; // px, adjust if needed
    const spaceRight = window.innerWidth - rect.right;
    let left;
    if (spaceRight > menuWidth + 24) {
      // Enough space to the right
      left = rect.right + 12;
    } else {
      // Not enough space, show to the left
      left = rect.left - menuWidth - 12;
    }
    return {
      left,
      top: rect.top + window.scrollY
    };
  };

  // Update header title when activeChatId or chats change
  useEffect(() => {
    if (!activeChatId) {
      setHeaderTitle('CorpGPT');
      setTitleKey(prev => prev + 1);
      return;
    }
    const chat = chats.find(c => c.id === activeChatId);
    if (chat && chat.title) {
      setHeaderTitle(chat.title);
      setTitleKey(prev => prev + 1);
    }
  }, [activeChatId, chats]);

  // Utility to get initials from name
  function getInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(' ');
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }
  // Utility to get a color from initials
  function getColorFromInitials(initials) {
    const colors = [
      '#F59E42', '#4F8AF4', '#34C759', '#F44292', '#A259F7', '#F7B32B', '#2D9CDB', '#FF6F61', '#6DD47E', '#FFB946',
    ];
    let hash = 0;
    for (let i = 0; i < initials.length; i++) {
      hash = initials.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  }

  const [userName, setUserName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  useEffect(() => {
    async function fetchProfile() {
      if (user && db) {
        const profileRef = doc(db, 'users', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const userData = profileSnap.data();
          setUserName(userData.name || "");
          setProfileImageUrl(userData.profileImage || "");
        }
      }
    }
    fetchProfile();
  }, [user, db]);

  return (
    <div className="relative flex w-full h-full bg-white teams-composer">
      <div className={`flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col box-border transition-all duration-300 ease-in-out overflow-hidden teams-sidebar ${isSidebarCollapsed ? 'w-0 p-0' : 'w-64 p-4'} ${isMobile ? 'fixed top-0 left-0 h-full z-40' : ''}`}
        style={isSidebarCollapsed && isMobile ? { width: 0, padding: 0 } : {}}>
        <button className="w-full p-2 mb-4 border border-dashed border-gray-300 rounded-lg bg-transparent text-sm font-medium cursor-pointer transition-all hover:border-pink-500 hover:text-pink-500 whitespace-nowrap" onClick={handleNewChat}>+ New Chat</button>
        <div className="flex items-center gap-2 mb-5 px-1">
          {searchMode ? (
            <input
              autoFocus
              type="text"
              className="w-full text-xs px-2 py-1 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-200"
              placeholder="Search chats..."
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onBlur={() => { setSearchMode(false); setSearchValue(""); }}
              onKeyDown={e => { if (e.key === 'Escape') { setSearchMode(false); setSearchValue(""); } }}
              style={{ minWidth: 0 }}
            />
          ) : (
            <button
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-pink-500 focus:outline-none"
              onClick={() => setSearchMode(true)}
              tabIndex={0}
              aria-label="Search chats"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
              </svg>
              <span>Search chats</span>
            </button>
          )}
        </div>
        <div className="text-xs font-semibold text-gray-500 tracking-wider mb-2 px-1">Recent</div>
        <SimpleBar className="flex-grow min-h-0 h-0" style={{ maxHeight: '100%' }}>
          {activeChatId === null && (
            <div className="p-3 rounded-lg cursor-pointer mb-2 text-xs whitespace-nowrap overflow-hidden text-ellipsis bg-pink-500 text-white">New Chat</div>
          )}
          {filteredChats.map(chat => (
            <div
              key={chat.id}
              className={`relative group p-2 rounded-lg cursor-pointer mb-2 text-xs whitespace-nowrap overflow-hidden text-ellipsis transition-colors flex items-center justify-between ${activeChatId === chat.id ? 'bg-pink-500 text-white' : 'hover:bg-gray-200'}`}
              onMouseEnter={() => setSidebarHoverId(chat.id)}
              onMouseLeave={() => setSidebarHoverId(null)}
            >
              <span onClick={() => { setActiveChatId(chat.id); if (isMobile) setIsSidebarCollapsed(true); }} className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs" data-chat-id={chat.id} title={chat.title}>{chat.title}</span>
              <button
                className={`ml-2 p-1 rounded-full hover:bg-pink-100 transition-opacity ${
                  isMobile
                    ? 'opacity-100'
                    : sidebarHoverId === chat.id || optionsOpenId === chat.id
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                } ${activeChatId === chat.id ? 'text-white' : 'text-pink-500'}`}
                style={{ minWidth: 28, minHeight: 28 }}
                onClick={e => { e.stopPropagation(); setOptionsOpenId(optionsOpenId === chat.id ? null : chat.id); }}
                tabIndex={-1}
                aria-label="Chat options"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
              {optionsOpenId === chat.id && (() => {
                const pos = getMenuPosition(chat.id);
                return (
                  <div className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] animate-fade-in floating-chat-options-menu"
                    style={{
                      zIndex: 1000,
                      left: pos.left,
                      top: pos.top,
                    }}
                  >
                    <button
                      className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 rounded-t-lg"
                      onClick={e => { e.stopPropagation(); setShowDeleteModal(true); setChatToDelete(chat); setOptionsOpenId(null); }}
                    >
                      Delete chat
                    </button>
                  </div>
                );
              })()}
            </div>
          ))}
        </SimpleBar>
        {/* Bottom user bar */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-white text-sm font-medium text-gray-700 rounded-xl mx-2 my-2 px-3 py-1.5 shadow-sm" style={{ minHeight: '34px' }}>
          <div className="flex items-center gap-2 min-w-0">
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt="Profile"
                className="w-7 h-7 rounded-full object-cover shadow"
              />
            ) : (
            <span className="flex items-center justify-center w-7 h-7 rounded-full text-white font-bold text-xs shadow" style={{ backgroundColor: getColorFromInitials(getInitials(userName || user?.displayName || 'User')) }}>
              {getInitials(userName || user?.displayName || 'User')}
            </span>
            )}
            <span className="truncate max-w-[100px]">{userName || user?.displayName || 'User'}</span>
          </div>
          <button onClick={onSignOut} className="ml-2 p-2 rounded-full hover:bg-gray-100 transition-colors" title="Sign Out">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>
      <button
        className={`fixed z-50 w-6 h-12 bg-white border border-gray-200 cursor-pointer flex items-center justify-center text-gray-500 transition-all duration-300 ease-in-out hover:bg-gray-100 ${isSidebarCollapsed ? 'left-0 rounded-r-lg border-l-0' : 'left-64 rounded-r-lg border-l-0'} ${isMobile ? '!left-0' : ''}`}
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        style={isMobile
          ? {
              top: '50%',
              transform: 'translateY(-50%)',
              left: 0,
            }
          : { top: '50%', transform: 'translateY(-50%)' }}
      >
        <svg className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <div className="flex-grow flex flex-col h-[100dvh]">
        <div className="w-full h-full flex flex-col bg-white">
          <div className="p-3 px-6 bg-white border-b border-pink-200 flex justify-between items-center flex-shrink-0 teams-header">
            <div className="flex items-center gap-2">
              <button
                onClick={onGoHome}
                className="mr-2 flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 border border-gray-300 p-0"
                style={{ minWidth: 36, minHeight: 36 }}
                title="Home"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5 mx-auto my-auto" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12L12 5L21 12" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="6" y="12" width="12" height="7" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <AnimatePresence mode="wait" initial={false}>
                <motion.h1
                  key={titleKey}
                  className="m-0 text-lg font-semibold"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.35 }}
                  style={{ minWidth: 80 }}
                  title={headerTitle}
                >
                  {headerTitle.length > 20 ? headerTitle.slice(0, 20) + '...' : headerTitle}
                </motion.h1>
              </AnimatePresence>
              <div className="ml-4 relative modern-composer-dropdown">
                <button
                  className="px-3 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-200 shadow-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  onClick={() => setShowDropdown(v => !v)}
                  type="button"
                  style={{ minWidth: 120 }}
                >
                  Wellbeing Assistant
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
                </button>
                <Transition
                  show={showDropdown}
                  enter="transition duration-200 ease-out"
                  enterFrom="transform scale-y-75 opacity-0"
                  enterTo="transform scale-y-100 opacity-100"
                  leave="transition duration-150 ease-in"
                  leaveFrom="transform scale-y-100 opacity-100"
                  leaveTo="transform scale-y-75 opacity-0"
                >
                  <div className="absolute left-0 mt-1 w-full bg-white rounded-lg shadow-lg z-20 origin-top">
                    <div className="py-1">
                      {/* Communication Category */}
                      <div className="flex items-center gap-2 px-4 py-2 text-blue-700 font-semibold text-xs tracking-wide rounded-t-lg relative">
                        <span>Communication</span>
                        <span className="flex-1 border-t-2 border-blue-500 ml-2"></span>
                      </div>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'wellbeing' === 'teams' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('wellbeing' !== 'teams') { setComposer('teams'); setShowDropdown(false); } }}>Teams Composer</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'wellbeing' === 'email' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('wellbeing' !== 'email') { setComposer('email'); setShowDropdown(false); } }}>Email Composer</button>
                      {/* Productivity Category */}
                      <div className="flex items-center gap-2 px-4 py-2 text-gray-700 font-semibold text-xs tracking-wide mt-2">
                        <span>Productivity</span>
                        <span className="flex-1 border-t-2 border-gray-500 ml-2"></span>
                      </div>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'wellbeing' === 'grammar' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('wellbeing' !== 'grammar') { setComposer('grammar'); setShowDropdown(false); } }}>Writing Editor</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'wellbeing' === 'doc' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('wellbeing' !== 'doc') { setComposer('doc'); setShowDropdown(false); } }}>Document Summariser</button>
                      {/* Wellbeing Category */}
                      <div className="flex items-center gap-2 px-4 py-2 text-pink-700 font-semibold text-xs tracking-wide mt-2">
                        <span>Wellbeing</span>
                        <span className="flex-1 border-t-2 border-pink-500 ml-2"></span>
                      </div>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'wellbeing' === 'career' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('wellbeing' !== 'career') { setComposer('career'); setShowDropdown(false); } }}>Career Advisor</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'wellbeing' === 'wellbeing' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500 rounded-b-lg`} onClick={() => { if ('wellbeing' !== 'wellbeing') { setComposer('wellbeing'); setShowDropdown(false); } }} tabIndex={-1}>Wellbeing Assistant</button>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
          <div className="flex-grow p-6 px-8 md:px-24 overflow-y-auto flex flex-col gap-3 ml-2 pb-36 teams-chat-area">
            {messages.length === 0 && !loading && (
              <div className="text-center mt-8">
                <div className="text-2xl font-bold mb-2">How can I support your wellbeing today?</div>
                <div className="text-sm text-gray-400 mb-4">Tip: Ask for stress relief, mindfulness, or encouragement.</div>
                <div className="flex flex-wrap justify-center gap-2 mb-2">
                  {[
                    'Suggest a mindfulness exercise',
                    'How to handle stress at work?',
                    'Tips for better sleep',
                    'How to stay motivated?',
                    'Quick breathing exercise',
                  ].map((sample, i) => (
                    <button
                      key={i}
                      className="px-4 py-2 rounded-2xl bg-pink-50 text-pink-700 text-xs font-medium shadow-sm border border-pink-100 hover:bg-pink-100 transition-all cursor-pointer teams-sample-button"
                      onClick={() => {
                        setInput(sample);
                        setTimeout(() => textareaRef.current && textareaRef.current.focus(), 0);
                      }}
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {[
                ...optimisticMessages,
                ...messages.filter(
                  msg => !optimisticMessages.some(
                    opt => opt.parts[0].text === msg.parts[0].text && opt.role === msg.role
                  )
                )
              ].map((msg, idx) => {
                const isUser = msg.type === 'user' || msg.role === 'user';
                return (
                  <motion.div
                    key={msg.id || msg.optimisticId || idx}
                    initial={isUser ? { opacity: 0, x: 60, scale: 1.15 } : { opacity: 0, y: 60, scale: 0.95 }}
                    animate={isUser ? { opacity: 1, x: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={isUser ? { opacity: 0, x: 60, scale: 1.15 } : { opacity: 0, y: 60, scale: 0.95 }}
                    transition={isUser ? { type: 'spring', stiffness: 500, damping: 30, mass: 1.2 } : { type: 'spring', stiffness: 400, damping: 32, duration: 0.35 }}
                    className={`flex flex-col max-w-[80%] ${isUser ? 'self-end ml-auto items-end' : 'self-start mr-auto items-start'}`}
                    layout
                  >
                    <div
                      className={`flex py-3 px-4 rounded-2xl text-sm ${isUser ? 'bg-pink-500 text-white self-end' : 'bg-transparent text-black self-start teams-message-bot'}`}
                      style={msg.type === 'bot' ? { background: 'transparent', border: 'none', boxShadow: 'none' } : {}}
                    >
                      {msg.type === 'bot' ? (
                        <span
                          className="prose prose-base prose-pink max-w-none"
                          style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}
                          dangerouslySetInnerHTML={{ __html: marked.parse(msg.parts[0].text) }}
                        />
                      ) : (
                        <span>{msg.parts[0].text}</span>
                      )}
                    </div>
                    {msg.type === 'bot' && (
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          className="p-1 bg-transparent border-none outline-none hover:bg-pink-100 rounded-full transition-colors"
                          style={{ boxShadow: 'none' }}
                          onClick={async () => {
                            await navigator.clipboard.writeText(msg.parts[0].text);
                            setCopiedIdx(idx);
                            setTimeout(() => setCopiedIdx(null), 1500);
                          }}
                          aria-label="Copy to clipboard"
                        >
                          <svg className="w-5 h-5 text-pink-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" className="stroke-pink-400"/>
                            <rect x="3" y="3" width="13" height="13" rx="2" className="stroke-pink-300"/>
                          </svg>
                        </button>
                        {copiedIdx === idx && (
                          <span className="ml-1 text-xs bg-pink-50 text-pink-700 rounded px-2 py-1 border border-pink-100 shadow-sm animate-fade-in">Text copied</span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {loading && (
              <>
                <div className="text-xs text-gray-400 ml-3">Thinking...</div>
                <div className="flex items-center self-start gap-2 py-1 px-4">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-.3s]"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-.5s]"></div>
                </div>
              </>
            )}
            <div ref={chatEndRef} />
          </div>
          {!(isMobile && !isSidebarCollapsed) && (
            <div
              className={`fixed bottom-0 left-0 w-full flex justify-center pointer-events-none z-30`}
              style={{
                paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardOffset}px)`,
                transition: 'left 0.3s cubic-bezier(.4,0,.2,1)',
                left: isSidebarCollapsed ? 0 : '16rem',
                width: isSidebarCollapsed ? '100%' : 'calc(100% - 16rem)'
              }}
            >
              <div className="relative w-full max-w-3xl px-4 pb-4 pointer-events-auto">
                <div className="flex rounded-2xl p-1 items-end shadow-xl border border-gray-200 bg-white teams-input-area" style={{ boxShadow: '0 -8px 24px -8px rgba(0,0,0,0.10), 0 2px 8px 0 rgba(0,0,0,0.04)' }}>
                  {/* Floating Sound Button with Progress */}
                  <button
                    onClick={handleAudioButton}
                    className="mb-1 mt-1 mr-2 flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border-none bg-blue-500 text-white rounded-full shadow-lg cursor-pointer transition-colors hover:bg-blue-600 focus:outline-none"
                    style={{ flex: 'none', position: 'relative', zIndex: 10 }}
                    aria-label="Play music"
                    type="button"
                  >
                    {/* Animated floating notes */}
                    {audioStatus === 'playing' && (
                      <>
                        <style>{`
                          .floating-note {
                            position: absolute;
                            left: 50%;
                            bottom: 100%;
                            opacity: 0.8;
                            transform: translateX(-50%) scale(1);
                            animation: floatNote 1.6s linear infinite;
                          }
                          .floating-note-2 {
                            left: 30%;
                            animation-delay: 0.5s;
                            opacity: 0.7;
                            transform: translateX(-50%) scale(0.8);
                          }
                          .floating-note-3 {
                            left: 70%;
                            animation-delay: 1s;
                            opacity: 0.6;
                            transform: translateX(-50%) scale(0.9);
                          }
                          @keyframes floatNote {
                            0% {
                              opacity: 0.8;
                              transform: translateX(-50%) translateY(0) scale(1);
                            }
                            70% {
                              opacity: 0.7;
                            }
                            100% {
                              opacity: 0;
                              transform: translateX(-50%) translateY(-48px) scale(1.1);
                            }
                          }
                        `}</style>
                        <svg className="floating-note" width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#60a5fa' }}><path d="M9 2v10.56A4 4 0 1 0 11 16V6h4V2H9z" /></svg>
                        <svg className="floating-note floating-note-2" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#818cf8' }}><path d="M13 4v7.56A3 3 0 1 0 15 14V8h2V4h-4z" /></svg>
                        <svg className="floating-note floating-note-3" width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a5b4fc' }}><path d="M7 6v5.56A2 2 0 1 0 9 13V10h2V6H7z" /></svg>
                      </>
                    )}
                    {audioStatus === 'idle' && (
                      // Music note icon
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    )}
                    {audioStatus === 'playing' && (
                      // Pause icon
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                    )}
                    {audioStatus === 'paused' && (
                      // Play icon
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <polygon points="6,4 20,12 6,20 6,4" />
                      </svg>
                    )}
                  </button>
                  {/* Shrink input area slightly to fit button */}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-grow p-3 border-none bg-white text-base focus:outline-none resize-none transition-all duration-200"
                    style={{ minHeight: 44, maxHeight: 160, overflowY: 'auto', marginLeft: 0, marginRight: 0, width: 'calc(100% - 48px)' }}
                    rows={1}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    disabled={loading}
                  />
                  <div className="flex items-center ml-2 ">
                    <button
                      onClick={sendMessage}
                      className="mb-1 mt-1 mr-1 flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border-none bg-pink-500 text-white rounded-xl cursor-pointer disabled:bg-pink-300 transition-colors"
                      style={{ flex: 'none' }}
                      disabled={loading}
                      aria-label="Send"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l14-6-6 14-2-5-5-2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Transition
        show={showDeleteModal}
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-150 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
      >
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full relative">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Delete this chat?</h2>
            <p className="text-gray-700 mb-6">This will permanently delete this chat and all its messages. This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-medium hover:bg-gray-300"
                onClick={() => { setShowDeleteModal(false); setChatToDelete(null); }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-red-500 text-white font-medium hover:bg-red-600"
                onClick={handleDeleteChat}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  );
}

export default WellbeingAssistant; 
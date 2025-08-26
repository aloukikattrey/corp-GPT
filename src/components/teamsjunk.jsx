import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { Transition } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';

function TeamsComposer({ user, db, getGeminiReply, SYSTEM_INSTRUCTION, onSignOut, onGoHome, setComposer }) {
  // ...existing ChatPage code from App.jsx...
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

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setMessages([]);
    setInput("");
    setTimeout(() => {
      if (textareaRef.current) textareaRef.current.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!user) return;
    const chatsRef = collection(db, "users", user.uid, "chats");
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
    };
    const messagesRef = collection(db, 'users', user.uid, 'chats', activeChatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const chatMessages = querySnapshot.docs.map(doc => doc.data());
      setMessages(chatMessages);
      // Remove optimistic messages that are now in Firestore
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
      // If the click is outside any open options menu, close it
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
      const newChatRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
        title: "New Chat",
        createdAt: serverTimestamp(),
      });
      currentChatId = newChatRef.id;
      setActiveChatId(newChatRef.id);
    }
    const messagesRef = collection(db, 'users', user.uid, 'chats', currentChatId, 'messages');
    await addDoc(messagesRef, userMessageForFirestore);
    // Restore AI chat title generation for new chats
    if (isNewChat) {
      const titleInstruction = `Create a very short, concise title (4 words max) for this user prompt: "${currentInput}"`;
      const title = await getGeminiReply([{ role: 'user', parts: [{ text: currentInput }] }], titleInstruction);
      const chatRef = doc(db, 'users', user.uid, 'chats', currentChatId);
      await setDoc(chatRef, { title: title.replace(/"/g, '').replace(/\.$/, '') }, { merge: true });
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

  // Delete chat and all its messages from Firestore
  const handleDeleteChat = async () => {
    if (!chatToDelete) return;
    setShowDeleteModal(false);
    setChatToDelete(null);
    const chatId = chatToDelete.id;
    try {
      // Delete all messages in the chat
      const messagesRef = collection(db, 'users', user.uid, 'chats', chatId, 'messages');
      const messagesSnap = await getDocs(messagesRef);
      for (const docSnap of messagesSnap.docs) {
        await deleteDoc(docSnap.ref);
      }
      // Delete the chat document
      const chatRef = doc(db, 'users', user.uid, 'chats', chatId);
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

  return (
    <div className="relative flex w-full h-full bg-white">
      {/* ...existing ChatPage JSX... */}
      {/* Copy the ChatPage JSX from App.jsx here, replacing ChatPage with TeamsComposer */}
      {/* ...existing code... */}
      <div className={`flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col box-border transition-all duration-300 ease-in-out overflow-hidden ${isSidebarCollapsed ? 'w-0 p-0' : 'w-64 p-4'}`}>
        <button className="w-full p-3 mb-4 border border-dashed border-gray-300 rounded-lg bg-transparent text-sm font-medium cursor-pointer transition-all hover:border-blue-500 hover:text-blue-500 whitespace-nowrap" onClick={handleNewChat}>+ New Chat</button>
        <div className="text-xs font-semibold text-gray-500  tracking-wider mb-2 px-1">Recent</div>
        <div className="flex-grow min-h-0 h-0 overflow-y-auto custom-scrollbar">
          {activeChatId === null && (
            <div className="p-3 rounded-lg cursor-pointer mb-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis bg-blue-500 text-white">New Chat</div>
          )}
          {chats.map(chat => (
            <div 
              key={chat.id} 
              className={`relative group p-3 rounded-lg cursor-pointer mb-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis transition-colors flex items-center justify-between ${activeChatId === chat.id ? 'bg-blue-500 text-white' : 'hover:bg-gray-200'}`}
              onMouseEnter={() => setSidebarHoverId(chat.id)}
              onMouseLeave={() => setSidebarHoverId(null)}
            >
              <span onClick={() => setActiveChatId(chat.id)} className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap" data-chat-id={chat.id}>{chat.title}</span>
              <button
                className={`ml-2 p-1 rounded-full hover:bg-blue-100 transition-opacity ${sidebarHoverId === chat.id || optionsOpenId === chat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${activeChatId === chat.id ? 'text-white' : 'text-blue-500'}`}
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
        </div>
      </div>
      <button
        className={`absolute top-1/2 -translate-y-1/2 w-6 h-12 bg-white border border-gray-200 cursor-pointer z-50 flex items-center justify-center text-gray-500 transition-all duration-300 ease-in-out hover:bg-gray-100 ${isSidebarCollapsed ? 'left-0 rounded-r-lg border-l-0' : 'left-64 rounded-r-lg border-l-0'}`}
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      >
        <svg className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <div className="flex-grow flex flex-col h-screen">
        <div className="w-full h-full flex flex-col bg-white">
          <div className="p-3 px-6 bg-white border-b border-gray-200 flex justify-between items-center flex-shrink-0">
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
              <h1 className="m-0 text-lg font-semibold">Corporate Assistant</h1>
              <div className="ml-4 relative modern-composer-dropdown">
                <button
                  className="px-3 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-200 shadow-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  onClick={() => setShowDropdown(v => !v)}
                  type="button"
                  style={{ minWidth: 120 }}
                >
                  Teams Composer
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
                      <button className={`w-full text-left px-4 py-2 text-sm ${'teams' === 'teams' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('teams' !== 'teams') { setComposer('teams'); setShowDropdown(false); } }} tabIndex={-1}>Teams Composer</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'teams' === 'email' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('teams' !== 'email') { setComposer('email'); setShowDropdown(false); } }}>Email Composer</button>
                      {/* Productivity Category */}
                      <div className="flex items-center gap-2 px-4 py-2 text-gray-700 font-semibold text-xs tracking-wide mt-2">
                        <span>Productivity</span>
                        <span className="flex-1 border-t-2 border-gray-500 ml-2"></span>
                      </div>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'teams' === 'grammar' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('teams' !== 'grammar') { setComposer('grammar'); setShowDropdown(false); } }}>Writing Editor</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'teams' === 'doc' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('teams' !== 'doc') { setComposer('doc'); setShowDropdown(false); } }}>Document Summariser</button>
                      {/* Wellbeing Category */}
                      <div className="flex items-center gap-2 px-4 py-2 text-pink-700 font-semibold text-xs tracking-wide mt-2">
                        <span>Wellbeing</span>
                        <span className="flex-1 border-t-2 border-pink-500 ml-2"></span>
                      </div>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'teams' === 'career' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('teams' !== 'career') { setComposer('career'); setShowDropdown(false); } }}>Career Advisor</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'teams' === 'wellbeing' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500 rounded-b-lg`} onClick={() => { if ('teams' !== 'wellbeing') { setComposer('wellbeing'); setShowDropdown(false); } }}>Wellbeing Assistant</button>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button onClick={onSignOut} className="py-1.5 px-3 border-none bg-gray-200 text-black rounded-md cursor-pointer text-xs font-medium hover:bg-gray-300">Sign Out</button>
            </div>
          </div>
          <div className="flex-grow p-6 px-8 md:px-24 overflow-y-auto flex flex-col gap-3 ml-2 pb-36">
            {messages.length === 0 && !loading && (
              <div className="text-center mt-8">
                <div className="text-2xl font-bold mb-2">Hi, what’s on your mind today?</div>
                <div className="text-sm text-gray-400 mb-4">Tip: Ask for help drafting professional Teams messages.</div>
                <div className="flex flex-wrap justify-center gap-2 mb-2">
                  {[
                    'Request a project update',
                    'Schedule a quick call',
                    'Share meeting notes',
                    'Ask for feedback',
                    'Remind about a deadline',
                  ].map((sample, i) => (
                    <button
                      key={i}
                      className="px-4 py-2 rounded-2xl bg-blue-50 text-blue-700 text-xs font-medium shadow-sm border border-blue-100 hover:bg-blue-100 transition-all cursor-pointer"
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
                      className={`flex py-3 px-4 rounded-2xl text-sm ${isUser ? 'bg-blue-500 text-white self-end' : 'bg-transparent text-black self-start'}`}
                      style={msg.type === 'bot' ? { background: 'transparent', border: 'none', boxShadow: 'none' } : {}}
                    >
                      {msg.type === 'bot' ? (
                        <span
                          className="prose prose-base prose-blue max-w-none"
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
                          className="p-1 bg-transparent border-none outline-none hover:bg-blue-100 rounded-full transition-colors"
                          style={{ boxShadow: 'none' }}
                          onClick={async () => {
                            await navigator.clipboard.writeText(msg.parts[0].text);
                            setCopiedIdx(idx);
                            setTimeout(() => setCopiedIdx(null), 1500);
                          }}
                          aria-label="Copy to clipboard"
                        >
                          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" className="stroke-blue-400"/>
                            <rect x="3" y="3" width="13" height="13" rx="2" className="stroke-blue-300"/>
                          </svg>
                        </button>
                        {copiedIdx === idx && (
                          <span className="ml-1 text-xs bg-blue-50 text-blue-700 rounded px-2 py-1 border border-blue-100 shadow-sm animate-fade-in">Text copied</span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {loading && (
              <>
                <div className="text-xs text-gray-400  ml-3">Thinking...</div>
                <div className="flex items-center self-start gap-2 py-1 px-4">
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-.3s]"></div>
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-.5s]"></div>
              </div>
              </>
            )}
            <div ref={chatEndRef} />
          </div>
          {/* Floating input area with fade effect */}
          <div
            className={`fixed bottom-0 left-0 w-full flex justify-center pointer-events-none z-30`}
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              transition: 'left 0.3s cubic-bezier(.4,0,.2,1)',
              left: isSidebarCollapsed ? 0 : '16rem',
              width: isSidebarCollapsed ? '100%' : 'calc(100% - 16rem)'
            }}
          >
            <div className="relative w-full max-w-3xl px-4 pb-4 pointer-events-auto">
              <div className="flex bg-gray-100 rounded-2xl p-1 items-end shadow-xl border border-gray-200" style={{ boxShadow: '0 -8px 24px -8px rgba(0,0,0,0.10), 0 2px 8px 0 rgba(0,0,0,0.04)' }}>
                <textarea
                  ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type your message..."
                  className="flex-grow p-3 border-none bg-transparent text-base focus:outline-none resize-none transition-all duration-200"
                  style={{ minHeight: 44, maxHeight: 160, overflowY: 'auto', background: 'transparent' }}
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
                    className="mb-1 mt-1 mr-1 flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border-none bg-blue-500 text-white rounded-xl cursor-pointer disabled:bg-blue-300 transition-colors"
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

export default TeamsComposer;

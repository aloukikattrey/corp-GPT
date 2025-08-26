import React, { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { marked } from 'marked';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { Transition } from '@headlessui/react';

// Set the workerSrc for pdf.js.
// By importing the worker file with `?url`, we get a URL to the worker file
// that Vite will correctly handle and place in the build output. This is more
// robust than trying to construct a relative path.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;


function DocumentSummariser({ user, db, getGeminiReply, SYSTEM_INSTRUCTION, onSignOut, onGoHome, setComposer }) {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [fileObj, setFileObj] = useState(null);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [replacingFile, setReplacingFile] = useState(false);
  const [showLearnHow, setShowLearnHow] = useState(false);
  const [sidebarHoverId, setSidebarHoverId] = useState(null);
  const [optionsOpenId, setOptionsOpenId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);

  // Sidebar chat history
  useEffect(() => {
    if (!user) return;
    const chatsRef = collection(db, "users", user.uid, "doc_chats");
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

  // Chat messages
  useEffect(() => {
    if (!user || !activeChatId) {
      setMessages([]);
      setOptimisticMessages([]);
      return;
    }
    const messagesRef = collection(db, 'users', user.uid, 'doc_chats', activeChatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const chatMessages = querySnapshot.docs.map(doc => doc.data());
      setMessages(chatMessages);
      setOptimisticMessages((prev) => prev.filter(opt => !chatMessages.some(msg => msg.parts[0].text === opt.parts[0].text && msg.role === opt.role)));
    });
    return () => unsubscribe();
  }, [user, activeChatId]);

  // Load file info from sessionStorage for the current chat
  useEffect(() => {
    if (activeChatId) {
      const saved = sessionStorage.getItem(`docchat_${activeChatId}`);
      if (saved) {
        try {
          const { fileName, fileText } = JSON.parse(saved);
          setFileName(fileName || "");
          setFileText(fileText || "");
        } catch {}
      } else {
        setFileName("");
        setFileText("");
      }
    }
  }, [activeChatId]);

  // Save file info to sessionStorage for the current chat
  const saveFileInfoToSession = (chatId, fileName, fileText) => {
    if (!chatId) return;
    sessionStorage.setItem(`docchat_${chatId}`, JSON.stringify({ fileName, fileText }));
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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

  // File parsing logic
  const handleFileChange = async (e) => {
    setFileError("");
    setFileText("");
    setFileName("");
    setUploading(true);
    setUploadProgress(10);
    let chatIdForSession = activeChatId;
    const file = e.target.files[0];
    setFileObj(file || null);
    if (!file) {
      setUploading(false);
      return;
    }
    setFileName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'pdf') {
        setUploadProgress(30);
        const pdfData = new Uint8Array(await file.arrayBuffer());
        setUploadProgress(50);

        const pdf = await pdfjsLib.getDocument(pdfData).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          setUploadProgress(50 + Math.floor((i / pdf.numPages) * 40));
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ') + '\n';
        }
        setFileText(text);
        setUploadProgress(100);
        if (chatIdForSession) saveFileInfoToSession(chatIdForSession, file.name, text);
      } else if (ext === 'docx') {
        setUploadProgress(30);
        const arrayBuffer = await file.arrayBuffer();
        setUploadProgress(60);
        const result = await mammoth.extractRawText({ arrayBuffer });
        setFileText(result.value);
        setUploadProgress(100);
        if (chatIdForSession) saveFileInfoToSession(chatIdForSession, file.name, result.value);

      } else {
        setFileError('Unsupported file type. Please upload a PDF or DOCX file.');
        setUploading(false);
      }
      setTimeout(() => setUploading(false), 500); // Hide progress after a short delay
    } catch (err) {
      console.error("File parsing error:", err);
      setFileError('Failed to extract text from file.');
      setUploading(false);
    }
  };

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setMessages([]);
    setOptimisticMessages([]);
    setInput("");
    setFileText("");
    setFileName("");
    setFileError("");
    setTimeout(() => {
      if (textareaRef.current) textareaRef.current.focus();
    }, 0);
  }, []);

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
      const newChatRef = await addDoc(collection(db, 'users', user.uid, 'doc_chats'), {
        title: "New Chat",
        createdAt: serverTimestamp(),
      });
      currentChatId = newChatRef.id;
      setActiveChatId(newChatRef.id);
      // Save file info for the new chat
      saveFileInfoToSession(newChatRef.id, fileName, fileText);
    }
    const messagesRef = collection(db, 'users', user.uid, 'doc_chats', currentChatId, 'messages');
    await addDoc(messagesRef, userMessageForFirestore);
    // Restore AI chat title generation for new chats
    if (isNewChat) {
      const titleInstruction = `Create a very short, concise title (4 words max) for this user prompt: "${currentInput}"`;
      const title = await getGeminiReply([{ role: 'user', parts: [{ text: currentInput }] }], titleInstruction);
      const chatRef = doc(db, 'users', user.uid, 'doc_chats', currentChatId);
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

  // Handler for replacing file
  const handleReplaceFile = () => {
    setReplacingFile(true);
    setFileText("");
    setFileName("");
    setFileError("");
    setInput("");
    setTimeout(() => setReplacingFile(false), 1000); // fallback in case user cancels
    // The actual file input will handle the rest
  };

  const handleDeleteChat = async () => {
    if (!chatToDelete) return;
    setShowDeleteModal(false);
    setChatToDelete(null);
    const chatId = chatToDelete.id;
    try {
      const messagesRef = collection(db, 'users', user.uid, 'doc_chats', chatId, 'messages');
      const messagesSnap = await getDocs(messagesRef);
      for (const docSnap of messagesSnap.docs) {
        await deleteDoc(docSnap.ref);
      }
      const chatRef = doc(db, 'users', user.uid, 'doc_chats', chatId);
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
      <div className={`flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col box-border transition-all duration-300 ease-in-out overflow-hidden ${isSidebarCollapsed ? 'w-0 p-0' : 'w-64 pt-2 pb-4 px-4'}`}>
        <button className="w-full p-3 mb-4 border border-dashed border-gray-300 rounded-lg bg-transparent text-sm font-medium cursor-pointer transition-all hover:border-purple-500 hover:text-purple-500 whitespace-nowrap" onClick={handleNewChat}>+ New Chat</button>
        <div className="text-xs font-semibold text-gray-500  tracking-wider mb-2 px-1">Recent</div>
        <div className="flex-grow min-h-0 h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-300 scrollbar-track-purple-100 scrollbar-thumb-rounded-lg scrollbar-track-rounded-lg hover:scrollbar-thumb-purple-400 transition-all duration-300">
          {activeChatId === null && (
            <div className="p-3 rounded-lg cursor-pointer mb-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis bg-purple-500 text-white">New Chat</div>
          )}
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`relative group p-3 rounded-lg cursor-pointer mb-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis transition-colors flex items-center justify-between ${activeChatId === chat.id ? 'bg-purple-500 text-white' : 'hover:bg-gray-200'}`}
              onMouseEnter={() => setSidebarHoverId(chat.id)}
              onMouseLeave={() => setSidebarHoverId(null)}
            >
              <span onClick={() => setActiveChatId(chat.id)} className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap" data-chat-id={chat.id}>{chat.title}</span>
              <button
                className={`ml-2 p-1 rounded-full hover:bg-purple-100 transition-opacity ${sidebarHoverId === chat.id || optionsOpenId === chat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${activeChatId === chat.id ? 'text-white' : 'text-purple-500'}`}
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
                  <div className="fixed z-50 bg-white border border-purple-200 rounded-lg shadow-lg min-w-[160px] animate-fade-in floating-chat-options-menu"
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
                  className="px-3 py-1 rounded-lg bg-purple-100 text-purple-800 text-xs font-semibold border border-purple-200 shadow-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
                  onClick={() => setShowDropdown(v => !v)}
                  type="button"
                  style={{ minWidth: 120 }}
                >
                  Document Summariser
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
                      <button className={`w-full text-left px-4 py-2 text-sm ${'doc' === 'teams' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('doc' !== 'teams') { setComposer('teams'); setShowDropdown(false); } }}>Teams Composer</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'doc' === 'email' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('doc' !== 'email') { setComposer('email'); setShowDropdown(false); } }}>Email Composer</button>
                      {/* Productivity Category */}
                      <div className="flex items-center gap-2 px-4 py-2 text-gray-700 font-semibold text-xs tracking-wide mt-2">
                        <span>Productivity</span>
                        <span className="flex-1 border-t-2 border-gray-500 ml-2"></span>
                      </div>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'doc' === 'grammar' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('doc' !== 'grammar') { setComposer('grammar'); setShowDropdown(false); } }}>Writing Editor</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'doc' === 'doc' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('doc' !== 'doc') { setComposer('doc'); setShowDropdown(false); } }} tabIndex={-1}>Document Summariser</button>
                      {/* Wellbeing Category */}
                      <div className="flex items-center gap-2 px-4 py-2 text-pink-700 font-semibold text-xs tracking-wide mt-2">
                        <span>Wellbeing</span>
                        <span className="flex-1 border-t-2 border-pink-500 ml-2"></span>
                      </div>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'doc' === 'career' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500`} onClick={() => { if ('doc' !== 'career') { setComposer('career'); setShowDropdown(false); } }}>Career Advisor</button>
                      <button className={`w-full text-left px-4 py-2 text-sm ${'doc' === 'wellbeing' ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} focus:outline-none hover:text-gray-500 rounded-b-lg`} onClick={() => { if ('doc' !== 'wellbeing') { setComposer('wellbeing'); setShowDropdown(false); } }}>Wellbeing Assistant</button>
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
          <div className="flex-grow p-6 px-8 md:px-24 overflow-y-auto flex flex-col gap-3 ml-2">
            {/* File info strip */}
            {fileName && (
              <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 mb-4 shadow-sm sticky top-0 z-10 relative">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="4" y="4" width="16" height="16" rx="2" className="stroke-purple-300"/>
                    <path d="M8 8h8M8 12h8M8 16h4" className="stroke-purple-400"/>
                  </svg>
                  <span className="text-sm text-purple-800 font-medium truncate max-w-[180px]" title={fileName}>{fileName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {fileObj && (
                    <button
                      className="px-3 py-1 rounded bg-purple-100 text-purple-700 text-xs font-medium border border-purple-200 shadow-sm hover:bg-purple-200 cursor-pointer transition-all"
                      onClick={() => {
                        const url = URL.createObjectURL(fileObj);
                        window.open(url, '_blank');
                        setTimeout(() => URL.revokeObjectURL(url), 10000);
                      }}
                      type="button"
                    >
                      View
                    </button>
                  )}
                  <label className="inline-block">
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      onChange={async (e) => {
                        setReplacingFile(true);
                        await handleFileChange(e);
                        setReplacingFile(false);
                      }}
                      className="hidden"
                    />
                    <span className="px-3 py-1 rounded bg-purple-100 text-purple-700 text-xs font-medium border border-purple-200 shadow-sm hover:bg-purple-200 cursor-pointer transition-all">Replace</span>
                  </label>
                </div>
                {replacingFile && (
                  <div className="absolute left-0 bottom-0 w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-400 animate-pulse" style={{ width: uploading ? `${uploadProgress}%` : '100%' }}></div>
                  </div>
                )}
              </div>
            )}
            {messages.length === 0 && !loading && !fileName && (
              <div className="text-center mt-8">
                <div className="text-2xl font-bold mb-2">Upload a document to get started</div>
                <div className="text-sm text-gray-400 mb-4">Supported formats are PDF and DOCX. After upload, ask for a summary or specific details.</div>
                <div className="flex flex-col items-center gap-3 mb-2">
                  <div className="flex flex-col items-center">
                    <div className="mb-3 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center shadow-sm">
                        <svg className="w-12 h-12 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 48 48">
                          <circle cx="24" cy="24" r="22" fill="#f3e8ff" stroke="none" />
                          <path d="M24 32V16" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M18 22l6-6 6 6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                    <label className="mb-2 inline-block">
                      <span className="sr-only">Choose file</span>
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <span className="px-5 py-2 rounded-xl bg-purple-500 text-white font-medium shadow hover:bg-purple-600 cursor-pointer transition-all text-base">Choose File</span>
                    </label>
                    {uploading && (
                      <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-purple-400 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                    )}
                  </div>
                  {fileName && <div className="text-xs text-gray-700 mt-1">{fileName}</div>}
                  {fileError && <div className="text-xs text-red-500">{fileError}</div>}
                </div>
              </div>
            )}
            {fileError && !activeChatId ? (
              <div className="text-center text-xs text-red-500 mb-2">{fileError}</div>
            ) : fileText && !activeChatId ? (
              <div className="text-center text-xs text-gray-500 mb-2">File loaded. Now enter your request below and send to summarize.</div>
            ) : null}
            {[
              ...optimisticMessages,
              ...messages.filter(
                msg => !optimisticMessages.some(
                  opt => opt.parts[0].text === msg.parts[0].text && opt.role === msg.role
                )
              )
            ].map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col w-full ${msg.role === 'user' ? 'self-end ml-auto items-end' : 'self-start mr-auto items-start'}`}
              >
                <div
                  className={`flex py-3 px-4 rounded-2xl ${msg.role === 'user' ? 'bg-purple-500 text-white self-end max-w-[80%]' : 'bg-transparent text-black self-start w-full'}`}
                  style={msg.role === 'model' ? { background: 'transparent', border: 'none', boxShadow: 'none' } : {}}
                >
                  {msg.role === 'user' ? (
                    <span className="text-sm">{msg.parts[0].text}</span>
                  ) : (
                    <span
                      className="prose prose-sm prose-purple max-w-none text-sm leading-relaxed"
                      style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}
                      dangerouslySetInnerHTML={{ __html: marked.parse(msg.parts[0].text) }}
                    />
                  )}
                </div>
                {msg.role === 'model' && (
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      className="p-1 bg-transparent border-none outline-none hover:bg-purple-100 rounded-full transition-colors"
                      style={{ boxShadow: 'none' }}
                      onClick={async () => {
                        await navigator.clipboard.writeText(msg.parts[0].text);
                        setCopiedIdx(idx);
                        setTimeout(() => setCopiedIdx(null), 1500);
                      }}
                      aria-label="Copy to clipboard"
                    >
                      <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="13" height="13" rx="2" className="stroke-purple-400"/>
                        <rect x="3" y="3" width="13" height="13" rx="2" className="stroke-purple-300"/>
                      </svg>
                    </button>
                    {copiedIdx === idx && (
                      <span className="ml-1 text-xs bg-purple-50 text-purple-700 rounded px-2 py-1 border border-purple-100 shadow-sm animate-fade-in">Text copied</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <>
                <div className="text-xs text-gray-400 mb-1 ml-1">Thinking...</div>
                <div className="flex items-center self-start gap-2 py-3 px-4 w-full">
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
              <div className="flex flex-col gap-1">
                <div className="flex rounded-2xl p-1 items-end shadow-xl border border-gray-200 bg-transparent" style={{ boxShadow: '0 -8px 24px -8px rgba(0,0,0,0.10), 0 2px 8px 0 rgba(0,0,0,0.04)', background: 'transparent' }}>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={fileText ? 'Type your request...' : 'Upload a file to enable input'}
                    className="flex-grow p-3 border-none bg-white text-sm focus:outline-none resize-none transition-all duration-200 text-left placeholder:text-left h-full flex items-center"
                    style={{ minHeight: 36, maxHeight: 120, height: '100%', display: 'flex', alignItems: 'center', background: '#fff' }}
                    rows={1}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    disabled={loading || !fileText}
                  />
                  <div className="flex items-center ml-2 ">
                    <button
                      onClick={sendMessage}
                      className="mb-1 mt-1 mr-1 flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border-none bg-purple-500 text-white rounded-xl cursor-pointer disabled:bg-purple-300 transition-colors"
                      style={{ flex: 'none' }}
                      disabled={loading || !fileText}
                      aria-label="Send"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l14-6-6 14-2-5-5-2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-600 bg-purple-50 border border-purple-200 rounded-lg">
                  <span>Your document is processed securely in your browser and is never uploaded to any server.</span>
                  <button
                    className="text-purple-600 underline hover:text-purple-800 ml-2"
                    onClick={() => setShowLearnHow(true)}
                    type="button"
                    tabIndex={-1}
                  >
                    Learn how
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showLearnHow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full relative animate-fade-in">
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold focus:outline-none"
              onClick={() => setShowLearnHow(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-800">How is your document processed locally?</h2>
            <p className="text-base text-gray-700 mb-4">
              When you upload a file, it <strong>never leaves your device</strong>. All file reading and text extraction happens <strong>entirely in your browser</strong> using secure, open-source libraries. No document data is sent to any server or third party for processing.
            </p>
            <ul className="list-disc pl-6 text-base text-gray-700 mb-4">
              <li>PDFs are parsed using <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline hover:text-purple-800">PDF.js</a> (by Mozilla).</li>
              <li>Word documents (.docx) are parsed using <a href="https://github.com/mwilliamson/mammoth.js" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline hover:text-purple-800">Mammoth.js</a>.</li>

            </ul>
            <p className="text-base text-gray-700">
              This approach keeps your sensitive documents <strong>private and secure</strong>. Learn more about <a href="https://developer.mozilla.org/en-US/docs/Web/API/FileReader" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline hover:text-purple-800">browser-based file processing</a>.
            </p>
          </div>
        </div>
      )}
      {/* Delete confirmation modal */}
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

export default DocumentSummariser; 
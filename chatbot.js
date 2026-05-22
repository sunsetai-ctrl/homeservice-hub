/**
 * HomeService Hub AI Chatbot - "Paige"
 * MATCHES ADMIN TRAINING SIMULATOR EXACTLY
 */

(function() {
  'use strict';

  const CONFIG = {
    supabaseUrl: 'https://amggehmbxidqxzjimmzz.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtZ2dlaG1ieGlkcXh6amltbXp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjUwODksImV4cCI6MjA4OTkwMTA4OX0.3vO8gqkb4m71tW0ZiXX_X9npzYUoFJ_2gT8sT1-B1rs',
    botName: 'Paige',
    companyId: '11111111-1111-1111-1111-111111111111',
    inactivityTimeout: 180000
  };

  // ========== KNOWLEDGE - SAME AS SIMULATOR ==========
  let knowledge = {
    faqs: [],
    knowledgeBase: [],
    trainedResponses: []
  };

  // ========== LEAD DATA - SAME AS SIMULATOR ==========
  let lead = {
    job_type: null, urgency: null, name: null, first_name: null,
    zip: null, phone: null, email: null, address: null
  };
  
  let state = {
    currentStep: 'greeting',
    awaitingLastName: false,
    leadSaved: false,
    chatEnded: false
  };

  let consents = { call: false, sms: false, ai: false, terms: false };
  let sessionId = localStorage.getItem('hsh_chat_session');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('hsh_chat_session', sessionId);
  }
  let conversationHistory = [];
  let inactivityTimer = null;

  // ========== LOAD KNOWLEDGE - SAME AS SIMULATOR ==========
  async function loadKnowledge() {
    try {
      const faqRes = await fetch(`${CONFIG.supabaseUrl}/rest/v1/chatbot_faqs?is_active=eq.true`, {
        headers: { 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${CONFIG.supabaseKey}` }
      });
      if (faqRes.ok) knowledge.faqs = await faqRes.json();

      const kbRes = await fetch(`${CONFIG.supabaseUrl}/rest/v1/chatbot_knowledge_base?is_active=eq.true`, {
        headers: { 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${CONFIG.supabaseKey}` }
      });
      if (kbRes.ok) knowledge.knowledgeBase = await kbRes.json();

      const trainRes = await fetch(`${CONFIG.supabaseUrl}/rest/v1/chatbot_training?rating=eq.bad&corrected_response=not.is.null`, {
        headers: { 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${CONFIG.supabaseKey}` }
      });
      if (trainRes.ok) knowledge.trainedResponses = await trainRes.json();

      console.log('[Paige] Knowledge loaded:', { 
        faqs: knowledge.faqs.length, 
        kb: knowledge.knowledgeBase.length, 
        trained: knowledge.trainedResponses.length 
      });
    } catch (e) {
      console.error('[Paige] Load error:', e);
    }
  }

  // ========== MATCH SCORING - SAME AS SIMULATOR ==========
  function matchScore(userInput, text, keywords = []) {
    const words = userInput.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const textLower = (text || '').toLowerCase();
    let score = 0;

    (keywords || []).forEach(kw => {
      if (userInput.toLowerCase().includes(kw.toLowerCase())) score += 15;
    });

    words.forEach(word => {
      if (textLower.includes(word)) score += 3;
    });

    if (textLower.includes(userInput.toLowerCase())) score += 20;

    return score;
  }

  // ========== FIND KNOWLEDGE RESPONSE - SAME AS SIMULATOR ==========
  function findKnowledgeResponse(userInput) {
    let bestMatch = null;
    let bestScore = 0;

    console.log('[Paige] Finding response for:', userInput);
    console.log('[Paige] Trained responses available:', knowledge.trainedResponses.length);

    // 1. Trained corrections (highest priority) - threshold 5
    knowledge.trainedResponses.forEach(tr => {
      const score = matchScore(userInput, tr.user_message, []);
      console.log('[Paige] Trained check:', tr.user_message.substring(0, 30), '-> Score:', score);
      if (score > bestScore && score >= 5) {
        bestScore = score;
        bestMatch = { response: sanitizeResponse(tr.corrected_response), source: 'trained', score };
      }
    });

    // 2. FAQs - threshold 8
    knowledge.faqs.forEach(faq => {
      const score = matchScore(userInput, faq.question, faq.keywords);
      if (score > bestScore && score >= 8) {
        bestScore = score;
        bestMatch = { response: sanitizeResponse(faq.answer), source: 'faq', score };
      }
    });

    // 3. Knowledge Base - ONLY if response_template exists
    knowledge.knowledgeBase.forEach(kb => {
      if (!kb.response_template) return;
      const score = matchScore(userInput, kb.title + ' ' + kb.content, kb.tags);
      if (score > bestScore && score >= 10) {
        bestScore = score;
        bestMatch = { response: sanitizeResponse(kb.response_template), source: 'kb', score };
      }
    });

    console.log('[Paige] Best match:', bestMatch ? bestMatch.source : 'none', 'Score:', bestScore);
    return bestMatch;
  }

  // ========== SANITIZE RESPONSE - SAME AS SIMULATOR ==========
  function sanitizeResponse(text) {
    if (!text) return '';
    return text
      .replace(/^Rule \d+:?\s*/gi, '')
      .replace(/^Step \d+:?\s*/gi, '')
      .replace(/^#+ /gm, '')
      .replace(/\*\*/g, '')
      .replace(/^\s*[-•]\s*/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ========== DETECT QUESTION - SAME AS SIMULATOR ==========
  function detectQuestion(text) {
    const lower = text.toLowerCase();
    const patterns = [
      { regex: /how much|cost|price|pricing|charge|rate|fee|ball\s?park|estimate|expensive|cheap/i, type: 'pricing' },
      { regex: /where.*serve|service area|what area|do you come to|coverage/i, type: 'service_area' },
      { regex: /what.*remove|do you take|can you remove|accept|haul away/i, type: 'services' },
      { regex: /same[- ]?day|today|how soon|how fast|when can|urgent|asap|emergency/i, type: 'scheduling' },
      { regex: /how.*work|process|what happen|steps/i, type: 'process' },
      { regex: /payment|pay|cash|card|credit|venmo|check/i, type: 'payment' },
      { regex: /recycle|donate|eco|green|environment|landfill/i, type: 'eco' }
    ];
    for (const p of patterns) {
      if (p.regex.test(lower)) return p.type;
    }
    if (/^(what|where|when|why|how|can|do|does|is|are|will|would|could)\b/i.test(lower)) return 'general_question';
    if (/\?$/.test(lower)) return 'general_question';
    return null;
  }

  // ========== PARSE JOB TYPE - SAME AS SIMULATOR ==========
  function parseJobType(text) {
    const lower = text.toLowerCase();
    
    const fromPatterns = [
      /(?:items?|stuff|things?|junk|furniture|everything|boxes?)\s+(?:from|in|out of|inside|at)\s+(?:the\s+)?(?:my\s+)?(\w+)/i,
      /(?:clean(?:ing)?\s+out|clear(?:ing)?|empty(?:ing)?)\s+(?:the\s+)?(?:my\s+)?(\w+)/i,
      /(\w+)\s+(?:clean\s*out|cleanout|clear\s*out)/i
    ];
    
    const locationMap = {
      'garage': 'Garage cleanout', 'basement': 'Basement cleanout',
      'attic': 'Attic cleanout', 'house': 'House cleanout', 'home': 'House cleanout',
      'office': 'Office cleanout', 'storage': 'Storage unit cleanout',
      'shed': 'Shed cleanout', 'yard': 'Yard cleanout', 'room': 'Room cleanout'
    };
    
    for (const pattern of fromPatterns) {
      const match = text.match(pattern);
      if (match) {
        const location = match[1].toLowerCase();
        if (locationMap[location]) {
          return { type: locationMap[location], details: text };
        }
      }
    }
    
    const itemPatterns = {
      'couch|sofa|loveseat|sectional': 'Furniture removal',
      'bed|mattress': 'Mattress removal',
      'furniture|dresser|desk|table|chair': 'Furniture removal',
      'appliance|fridge|refrigerator|washer|dryer|stove': 'Appliance removal',
      'tv|television|monitor|computer|electronic': 'Electronics removal',
      'yard waste|branches|leaves|brush|tree': 'Yard waste removal',
      'debris|construction|drywall|lumber|wood': 'Construction debris',
      'hot tub|spa|jacuzzi': 'Hot tub removal',
      'junk|trash|garbage|stuff': 'Junk removal'
    };
    
    for (const [pattern, jobType] of Object.entries(itemPatterns)) {
      if (new RegExp(pattern, 'i').test(lower)) {
        return { type: jobType, details: text };
      }
    }
    
    if (/remove|haul|pick\s*up|get\s*rid|throw\s*out|dispose/i.test(lower)) {
      return { type: 'Junk removal', details: text };
    }
    
    return null;
  }

  // ========== EXTRACT INFO - SAME AS SIMULATOR ==========
  function extractInfo(text) {
    const extracted = {};
    const lower = text.toLowerCase();

    // Phone
    const phoneMatch = text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10,11}/);
    if (phoneMatch) {
      const digits = phoneMatch[0].replace(/\D/g, '');
      if (digits.length >= 10) { extracted.phone = digits; if (!lead.phone) lead.phone = digits; }
    }

    // Email
    const emailMatch = text.match(/[\w\.-]+@[\w\.-]+\.\w{2,}/);
    if (emailMatch) { extracted.email = emailMatch[0]; if (!lead.email) lead.email = emailMatch[0]; }

    // ZIP
    const words = text.split(/[\s,]+/);
    for (const word of words) {
      if (/^\d{5}$/.test(word)) { extracted.zip = word; if (!lead.zip) lead.zip = word; break; }
    }

    // Address
    const addrMatch = text.match(/\d+\s+[\w\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|way|pl)/i);
    if (addrMatch) { extracted.address = addrMatch[0]; if (!lead.address) lead.address = addrMatch[0]; }

    // Job type
    if (!lead.job_type) {
      const job = parseJobType(text);
      if (job) { extracted.job_type = job.type; lead.job_type = job.type; }
    }

    // Urgency
    if (!lead.urgency) {
      if (/asap|urgent|emergency|today|right now|immediately|tomorrow/i.test(lower)) {
        extracted.urgency = 'ASAP'; lead.urgency = 'ASAP';
      } else if (/this week|few days|soon/i.test(lower)) {
        extracted.urgency = 'This Week'; lead.urgency = 'This Week';
      } else if (/next week/i.test(lower)) {
        extracted.urgency = 'Next Week'; lead.urgency = 'Next Week';
      } else if (/flexible|whenever|no rush/i.test(lower)) {
        extracted.urgency = 'Flexible'; lead.urgency = 'Flexible';
      }
    }

    return extracted;
  }

  // ========== GET MISSING FIELDS - SAME AS SIMULATOR ==========
  function getMissingFields() {
    const missing = [];
    if (!lead.job_type) missing.push('job_type');
    if (!lead.urgency) missing.push('urgency');
    if (!lead.name) missing.push('name');
    if (!lead.zip) missing.push('zip');
    if (!lead.phone) missing.push('phone');
    if (!lead.email) missing.push('email');
    if (!lead.address) missing.push('address');
    return missing;
  }

  // ========== GET NEXT QUESTION - SAME AS SIMULATOR ==========
  function getNextQuestion() {
    const missing = getMissingFields();
    if (missing.length === 0) return null;
    
    const field = missing[0];
    state.currentStep = 'collecting_' + field;
    
    const questions = {
      'job_type': "What do you need removed?",
      'urgency': "How soon do you need this done?",
      'name': "What's your name?",
      'zip': "What's the ZIP code for the pickup?",
      'phone': "What's the best phone number to reach you?",
      'email': "And your email address?",
      'address': "What's the pickup address?"
    };
    
    return { field, question: questions[field] || "Can you tell me more?" };
  }

  // ========== RANDOM PHRASES - SAME AS SIMULATOR ==========
  const PHRASES = {
    thanks: ["Thanks!", "Got it!", "Perfect!", "Great!", "Awesome!"],
    acknowledge: ["Good question!", "Great question!", "Absolutely!", "Sure thing!"],
    confirmJob: ["We can definitely help with that!", "No problem, we handle that all the time!", "Absolutely, we can take care of that!"],
    guideBack: ["To help you further,", "So I can get you a quote,", "To connect you with a pro,"],
    closing: ["A pro will reach out soon. Thanks! 🙌", "We'll be in touch shortly! 👍", "You're all set! 😊"]
  };
  
  function randomPhrase(category) {
    const options = PHRASES[category] || [""];
    return options[Math.floor(Math.random() * options.length)];
  }

  // ========== STYLES ==========
  const styles = `
    .hsh-chat-bubble { position: fixed; bottom: 20px; right: 20px; width: 52px; height: 52px; background: linear-gradient(135deg, #f97316, #ea580c); border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(249, 115, 22, 0.4); transition: transform 0.2s; z-index: 9998; border: none; }
    .hsh-chat-bubble:hover { transform: scale(1.1); }
    .hsh-chat-bubble svg { color: white; width: 24px; height: 24px; }
    .hsh-chat-bubble.hsh-hidden { display: none; }
    .hsh-chat-badge { position: absolute; top: -3px; right: -3px; width: 18px; height: 18px; background: #ef4444; border-radius: 50%; font-size: 10px; font-weight: bold; color: white; display: flex; align-items: center; justify-content: center; }
    .hsh-chat-window { position: fixed; bottom: 20px; right: 20px; width: 320px; height: 465px; background: white; border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: none; flex-direction: column; overflow: hidden; z-index: 9999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .hsh-chat-window.hsh-open { display: flex; }
    @media (max-width: 400px) { .hsh-chat-window { width: calc(100vw - 16px); height: calc(100vh - 90px); bottom: 8px; right: 8px; } }
    .hsh-chat-header { background: linear-gradient(135deg, #1e293b, #0f172a); color: white; padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
    .hsh-chat-header-avatar { width: 34px; height: 34px; background: linear-gradient(135deg, #f97316, #ea580c); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; }
    .hsh-chat-header-info h3 { font-size: 14px; font-weight: 600; margin: 0 0 1px 0; }
    .hsh-chat-header-info p { font-size: 11px; opacity: 0.8; margin: 0; }
    .hsh-chat-header-status { width: 7px; height: 7px; background: #22c55e; border-radius: 50%; margin-left: auto; }
    .hsh-chat-close { background: none; border: none; color: white; cursor: pointer; padding: 4px; margin-left: 6px; opacity: 0.7; }
    .hsh-chat-close:hover { opacity: 1; }
    .hsh-chat-close svg { width: 18px; height: 18px; }
    .hsh-chat-messages { flex: 1; overflow-y: auto; padding: 12px; background: #f8fafc; }
    .hsh-message { margin-bottom: 10px; display: flex; gap: 6px; animation: hshFadeIn 0.3s ease; }
    @keyframes hshFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .hsh-message.hsh-bot { justify-content: flex-start; }
    .hsh-message.hsh-user { justify-content: flex-end; }
    .hsh-message-avatar { width: 26px; height: 26px; background: linear-gradient(135deg, #f97316, #ea580c); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; }
    .hsh-message.hsh-user .hsh-message-avatar { display: none; }
    .hsh-message-content { max-width: 82%; padding: 10px 12px; border-radius: 14px; font-size: 13px; line-height: 1.4; }
    .hsh-message.hsh-bot .hsh-message-content { background: white; color: #1e293b; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .hsh-message.hsh-user .hsh-message-content { background: linear-gradient(135deg, #f97316, #ea580c); color: white; border-bottom-right-radius: 4px; }
    .hsh-quick-replies { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; padding-left: 32px; }
    .hsh-quick-reply { background: white; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 16px; font-size: 12px; cursor: pointer; transition: all 0.2s; color: #475569; font-family: inherit; }
    .hsh-quick-reply:hover { background: #f97316; color: white; border-color: #f97316; }
    .hsh-typing-indicator { display: flex; gap: 3px; padding: 10px 12px; background: white; border-radius: 14px; border-bottom-left-radius: 4px; width: fit-content; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .hsh-typing-indicator span { width: 6px; height: 6px; background: #94a3b8; border-radius: 50%; animation: hshBounce 1.4s infinite ease-in-out; }
    .hsh-typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
    .hsh-typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
    @keyframes hshBounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
    .hsh-chat-input { padding: 12px; background: white; border-top: 1px solid #e2e8f0; display: flex; gap: 6px; }
    .hsh-chat-input input { flex: 1; border: 1px solid #e2e8f0; border-radius: 20px; padding: 10px 14px; font-size: 13px; outline: none; font-family: inherit; }
    .hsh-chat-input input:focus { border-color: #f97316; }
    .hsh-chat-input input:disabled { background: #f1f5f9; }
    .hsh-chat-input button { width: 38px; height: 38px; background: linear-gradient(135deg, #f97316, #ea580c); border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .hsh-chat-input button:disabled { opacity: 0.5; cursor: not-allowed; }
    .hsh-chat-input button svg { color: white; width: 16px; height: 16px; }
    .hsh-consent-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin: 8px 0; font-size: 11px; }
    .hsh-consent-box label { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; cursor: pointer; }
    .hsh-consent-box input[type="checkbox"] { margin-top: 2px; accent-color: #f97316; }
    .hsh-consent-btn { background: #f97316; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 6px; }
    .hsh-consent-btn:disabled { background: #94a3b8; cursor: not-allowed; }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // ========== HTML ==========
  const chatHTML = `
    <button class="hsh-chat-bubble" id="hshChatBubble">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div class="hsh-chat-badge">1</div>
    </button>
    <div class="hsh-chat-window" id="hshChatWindow">
      <div class="hsh-chat-header">
        <div class="hsh-chat-header-avatar">👋</div>
        <div class="hsh-chat-header-info"><h3>${CONFIG.botName}</h3><p>Junk Removal Assistant</p></div>
        <div class="hsh-chat-header-status"></div>
        <button class="hsh-chat-close" id="hshChatClose">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="hsh-chat-messages" id="hshChatMessages"></div>
      <div class="hsh-chat-input">
        <input type="text" id="hshUserInput" placeholder="Type your message...">
        <button id="hshSendBtn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.id = 'hsh-chatbot-container';
  container.innerHTML = chatHTML;
  document.body.appendChild(container);

  const bubble = document.getElementById('hshChatBubble');
  const chatWindow = document.getElementById('hshChatWindow');
  const closeBtn = document.getElementById('hshChatClose');
  const messages = document.getElementById('hshChatMessages');
  const input = document.getElementById('hshUserInput');
  const sendBtn = document.getElementById('hshSendBtn');

  bubble.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

  // ========== UI FUNCTIONS ==========
  function toggleChat() {
    const isOpen = chatWindow.classList.toggle('hsh-open');
    bubble.classList.toggle('hsh-hidden', isOpen);
    if (isOpen) { 
      input.focus(); 
      resetInactivityTimer();
      loadKnowledge();
    }
  }

  function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (state.chatEnded) return;
    inactivityTimer = setTimeout(() => {
      if (chatWindow.classList.contains('hsh-open') && !state.chatEnded) {
        addBotMessage("Still there? I'm happy to help whenever you're ready!");
      }
    }, CONFIG.inactivityTimeout);
  }

  function addBotMessage(text) {
    resetInactivityTimer();
    messages.insertAdjacentHTML('beforeend', `
      <div class="hsh-message hsh-bot">
        <div class="hsh-message-avatar">🏠</div>
        <div class="hsh-message-content">${text}</div>
      </div>
    `);
    messages.scrollTop = messages.scrollHeight;
    conversationHistory.push({ role: 'bot', content: text, timestamp: Date.now() });
    saveConversation();
  }

  function addUserMessage(text) {
    resetInactivityTimer();
    messages.insertAdjacentHTML('beforeend', `
      <div class="hsh-message hsh-user"><div class="hsh-message-content">${text}</div></div>
    `);
    messages.scrollTop = messages.scrollHeight;
    conversationHistory.push({ role: 'user', content: text, timestamp: Date.now() });
    saveConversation();
  }

  function showTyping() {
    messages.insertAdjacentHTML('beforeend', `
      <div class="hsh-message hsh-bot" id="hshTyping">
        <div class="hsh-message-avatar">🏠</div>
        <div class="hsh-typing-indicator"><span></span><span></span><span></span></div>
      </div>
    `);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() { 
    const el = document.getElementById('hshTyping'); 
    if (el) el.remove(); 
  }

  function showQuickReplies(options) {
    const el = document.getElementById('hshQuickReplies');
    if (el) el.remove();
    
    messages.insertAdjacentHTML('beforeend', `
      <div class="hsh-quick-replies" id="hshQuickReplies">
        ${options.map(opt => `<button class="hsh-quick-reply" data-reply="${opt}">${opt}</button>`).join('')}
      </div>
    `);
    messages.scrollTop = messages.scrollHeight;
    
    document.querySelectorAll('.hsh-quick-reply').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = document.getElementById('hshQuickReplies');
        if (el) el.remove();
        addUserMessage(btn.dataset.reply);
        processInput(btn.dataset.reply);
      });
    });
  }

  function showConsentForm() {
    state.currentStep = 'consent';
    messages.insertAdjacentHTML('beforeend', `
      <div class="hsh-consent-box" id="hshConsentBox">
        <div style="font-weight:600; margin-bottom:8px;">Before we connect you with a pro:</div>
        <label><input type="checkbox" id="consentTerms"> I agree to the Terms of Service</label>
        <label><input type="checkbox" id="consentCall"> I consent to receive phone calls</label>
        <label><input type="checkbox" id="consentSms"> I consent to receive SMS/text messages</label>
        <label><input type="checkbox" id="consentAi"> I consent to AI-assisted communication</label>
        <button class="hsh-consent-btn" id="consentSubmit" disabled>Submit</button>
      </div>
    `);
    messages.scrollTop = messages.scrollHeight;

    const checkboxes = ['consentTerms', 'consentCall', 'consentSms', 'consentAi'];
    const submitBtn = document.getElementById('consentSubmit');
    
    checkboxes.forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        submitBtn.disabled = !checkboxes.every(cid => document.getElementById(cid).checked);
      });
    });

    submitBtn.addEventListener('click', async () => {
      consents = { terms: true, call: true, sms: true, ai: true };
      document.getElementById('hshConsentBox').remove();
      await saveLead();
      addBotMessage("Thank you! Your information has been submitted. 🎉");
      setTimeout(() => {
        addBotMessage(randomPhrase('closing'));
        endChat();
      }, 600);
    });
  }

  function endChat() {
    state.chatEnded = true;
    input.disabled = true;
    sendBtn.disabled = true;
    input.placeholder = "Chat ended - thanks!";
    if (inactivityTimer) clearTimeout(inactivityTimer);
  }

  function sendMessage() {
    if (state.chatEnded) return;
    const text = input.value.trim();
    if (!text) return;
    const el = document.getElementById('hshQuickReplies');
    if (el) el.remove();
    addUserMessage(text);
    input.value = '';
    processInput(text);
  }

  async function saveConversation() {
    try {
      await fetch(`${CONFIG.supabaseUrl}/rest/v1/chatbot_conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          session_id: sessionId,
          customer_identifier: lead.phone || lead.email || null,
          messages: conversationHistory,
          lead_data: lead,
          consents: consents,
          updated_at: new Date().toISOString()
        })
      });
    } catch (e) { console.error('[Paige] Save error:', e); }
  }

  async function saveLead() {
    if (state.leadSaved) return;
    
    let tier = 'B', price = 33.75;
    const urg = (lead.urgency || '').toLowerCase();
    if (urg.includes('asap')) { tier = 'SUPER'; price = 112.50; }
    else if (urg.includes('this week')) { tier = 'A'; price = 45.00; }
    else if (urg.includes('flexible')) { tier = 'C'; price = 22.50; }

    try {
      await fetch(`${CONFIG.supabaseUrl}/rest/v1/marketplace_leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          name: lead.name || lead.first_name || 'Unknown',
          phone: lead.phone, email: lead.email,
          address: lead.address, city: '', state: 'SC', zip: lead.zip,
          job_type: lead.job_type, service_details: lead.job_type,
          urgency: lead.urgency, tier, price,
          source: 'AI Chatbot - Paige', status: 'available', available: true,
          consent_call: consents.call, consent_sms: consents.sms,
          consent_ai: consents.ai, consent_terms: consents.terms,
          consent_timestamp: new Date().toISOString()
        })
      });
      state.leadSaved = true;
    } catch (e) { console.error('[Paige] Save lead error:', e); }
  }

  // ========== MAIN PROCESS INPUT - MIRRORS SIMULATOR EXACTLY ==========
  async function processInput(userMessage) {
    if (state.chatEnded) return;
    
    await loadKnowledge();
    
    showTyping();
    await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
    hideTyping();

    const lower = userMessage.toLowerCase().trim();
    const extracted = extractInfo(userMessage);
    const missing = getMissingFields();
    
    console.log('[Paige] Extracted:', extracted, 'Lead:', lead, 'State:', state.currentStep);
    
    // Handle last name if waiting
    if (state.awaitingLastName) {
      state.awaitingLastName = false;
      const lastName = userMessage.trim().split(/\s+/)[0];
      lead.name = lead.first_name + ' ' + lastName;
      
      const nextQ = getNextQuestion();
      if (nextQ) {
        addBotMessage(`Nice to meet you, ${lead.name}! 👋 ${nextQ.question}`);
      } else {
        addBotMessage(`Nice to meet you, ${lead.name}! 👋`);
        setTimeout(() => showConsentForm(), 500);
      }
      return;
    }
    
    // Urgency quick replies
    if (/^(asap|this week|next week|flexible)$/i.test(lower)) {
      lead.urgency = userMessage;
      const nextQ = getNextQuestion();
      if (nextQ) {
        addBotMessage(`${randomPhrase('thanks')} We'll prioritize accordingly. ${nextQ.question}`);
      } else {
        addBotMessage(`${randomPhrase('thanks')} I have everything I need!`);
        setTimeout(() => showConsentForm(), 500);
      }
      return;
    }

    // Quick reply buttons
    if (lower === 'get a quote' || lower === 'schedule pickup') {
      state.currentStep = 'collecting_job';
      addBotMessage(`${randomPhrase('confirmJob')} What do you need removed?`);
      return;
    }
    
    if (lower === 'ask a question') {
      addBotMessage("Of course! What would you like to know?");
      return;
    }
    
    // ========== CHECK TRAINING/KB FIRST - BEFORE ANYTHING ELSE ==========
    // This is the key fix: always check for trained responses FIRST
    const kbMatch = findKnowledgeResponse(userMessage);
    if (kbMatch) {
      console.log('[Paige] Found KB/Training match:', kbMatch.source, 'Score:', kbMatch.score);
      const nextQ = getNextQuestion();
      const guideBack = nextQ ? ` ${randomPhrase('guideBack')} ${nextQ.question}` : '';
      
      // If it's a trained response, use it directly
      if (kbMatch.source === 'trained') {
        addBotMessage(kbMatch.response + guideBack);
        return;
      }
      
      // For FAQ/KB, add acknowledge phrase if it's a question
      const questionType = detectQuestion(userMessage);
      if (questionType) {
        addBotMessage(`${randomPhrase('acknowledge')} ${kbMatch.response}${guideBack}`);
      } else {
        addBotMessage(kbMatch.response + guideBack);
      }
      return;
    }
    
    // Check for questions - give generic answers if no KB match
    const questionType = detectQuestion(userMessage);
    if (questionType) {
      let answer = "That's a great question! ";
      switch(questionType) {
        case 'pricing': answer += "Pricing depends on volume. Single items run $75-150, full truck $400-600. We provide free quotes!"; break;
        case 'service_area': answer += "We serve Upstate SC - Greenville, Spartanburg, Anderson, and surrounding areas."; break;
        case 'services': answer += "We remove furniture, appliances, electronics, yard waste, debris - almost anything non-hazardous!"; break;
        case 'scheduling': answer += "Yes, same-day service is often available!"; break;
        case 'process': answer += "We come out, give you a free quote, and if you approve, load everything up right then!"; break;
        case 'payment': answer += "We accept cash, credit/debit, Venmo, and PayPal. Payment due when job is complete."; break;
        case 'eco': answer += "We donate usable items and recycle what we can. Landfill only as last resort."; break;
        default: answer += "Let me get you the details on that.";
      }
      
      const nextQ = getNextQuestion();
      const guideBack = nextQ ? ` ${randomPhrase('guideBack')} ${nextQ.question}` : '';
      addBotMessage(answer + guideBack);
      return;
    }
    
    // Handle extracted data (only if no KB match found)
    if (Object.keys(extracted).length > 0) {
      if (missing.length === 0) {
        addBotMessage(`${randomPhrase('thanks')} I have everything I need!`);
        setTimeout(() => showConsentForm(), 500);
        return;
      }
      
      if (extracted.job_type) {
        const nextQ = getNextQuestion();
        addBotMessage(`${randomPhrase('thanks')} ${randomPhrase('confirmJob')} ${nextQ ? nextQ.question : ''}`);
        return;
      }
      
      const nextQ = getNextQuestion();
      addBotMessage(`${randomPhrase('thanks')} ${nextQ ? nextQ.question : ''}`);
      return;
    }
    
    // Name handling
    if (state.currentStep === 'collecting_name' && !lead.name) {
      const nameText = userMessage.trim().replace(/[^\w\s'-]/g, '');
      
      if (nameText.includes(' ')) {
        const parts = nameText.split(/\s+/);
        lead.first_name = parts[0];
        lead.name = nameText;
        
        const nextQ = getNextQuestion();
        addBotMessage(`Nice to meet you, ${lead.first_name}! 👋 ${nextQ ? nextQ.question : ''}`);
        return;
      }
      
      if (nameText.length > 1 && nameText.length < 30 && !/\d/.test(nameText)) {
        lead.first_name = nameText;
        state.awaitingLastName = true;
        addBotMessage(`Thanks ${nameText}! And your last name?`);
        return;
      }
    }
    
    // Address handling
    if (state.currentStep === 'collecting_address' && !lead.address) {
      lead.address = userMessage.trim();
      const nextQ = getNextQuestion();
      if (!nextQ) {
        addBotMessage(`${randomPhrase('thanks')} I have everything I need!`);
        setTimeout(() => showConsentForm(), 500);
        return;
      }
      addBotMessage(`${randomPhrase('thanks')} ${nextQ.question}`);
      return;
    }
    
    // Fallback
    if (lead.job_type && missing.length > 0) {
      const nextQ = getNextQuestion();
      addBotMessage(`I want to make sure I help you properly! ${nextQ ? nextQ.question : 'Tell me more.'}`);
      return;
    }
    
    addBotMessage("I want to make sure I help you properly. Can you tell me more about what you need removed?");
    showQuickReplies(['Get a Quote', 'Schedule Pickup', 'Ask a Question']);
  }

  // ========== INITIALIZE ==========
  async function init() {
    await loadKnowledge();
    setTimeout(() => {
      addBotMessage("Hi! I'm Paige, your junk removal assistant. 👋 What can I help you with today?");
      showQuickReplies(['Get a Quote', 'Schedule Pickup', 'Ask a Question']);
    }, 800);
  }

  init();
})();

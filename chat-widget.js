(function () {
    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL)
        ? String(window.APP_CONFIG.API_BASE_URL).replace(/\/$/, '')
        : '';
    const CHAT_PROFILE_STORAGE_KEY = 'jc_chat_profile_v2';

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    const style = document.createElement('style');
    style.textContent = `
    .jc-chat-toggle {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        background: var(--primary);
        color: #fff;
        font-size: 20px;
        cursor: pointer;
        z-index: 1001;
        box-shadow: 0 8px 24px rgba(0,0,0,.2);
    }
    .jc-chat-panel {
        position: fixed;
        right: 20px;
        bottom: 90px;
        width: 360px;
        max-width: calc(100vw - 30px);
        height: 520px;
        background: var(--white);
        border: 1px solid var(--border);
        border-radius: 14px;
        box-shadow: var(--shadow);
        z-index: 1001;
        display: none;
        overflow: hidden;
    }
    .jc-chat-panel.active { display: flex; flex-direction: column; }
    .jc-chat-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        border-bottom: 1px solid var(--border);
        background: var(--light);
        font-weight: 700;
    }
    .jc-chat-toolbar {
        border-bottom: 1px solid var(--border);
        background: var(--white);
        padding: 10px 12px;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
    }
    .jc-chat-select {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px;
        font-size: 13px;
        color: var(--dark);
        background: var(--white);
    }
    .jc-chat-close {
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 18px;
    }
    .jc-chat-list {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        background: var(--white);
    }
    .jc-chat-msg {
        margin-bottom: 10px;
        max-width: 85%;
        padding: 10px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.35;
        white-space: pre-wrap;
        border: 1px solid var(--border);
    }
    .jc-chat-msg.mine { margin-left: auto; background: var(--light); border-color: var(--primary); }
    .jc-chat-msg.admin { margin-right: auto; background: var(--white); }
    .jc-chat-meta { font-size: 11px; opacity: .75; margin-bottom: 4px; }
    .jc-chat-meta-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
    }
    .jc-chat-time { color: var(--gray); font-size: 11px; }
    .jc-chat-text { color: var(--dark); }
    .jc-chat-foot { padding: 10px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
    .jc-chat-input {
        flex: 1;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 14px;
    }
    .jc-chat-send {
        border: none;
        border-radius: 10px;
        background: var(--primary);
        color: #fff;
        padding: 8px 12px;
        cursor: pointer;
    }
    .jc-chat-note { color: var(--gray); font-size: 13px; padding: 10px; }
    .jc-chat-identity {
        padding: 12px;
        border-top: 1px solid var(--border);
        display: grid;
        gap: 8px;
        background: var(--light);
    }
    .jc-chat-identity .jc-chat-input { width: 100%; }
    .jc-chat-identity-title { font-size: 13px; color: var(--gray); }
    .jc-chat-actions { display: flex; gap: 8px; }
    `;
    document.head.appendChild(style);

    const toggleButton = document.createElement('button');
    toggleButton.className = 'jc-chat-toggle';
    toggleButton.setAttribute('type', 'button');
    toggleButton.innerHTML = '<i class="fas fa-comments"></i>';

    const panel = document.createElement('div');
    panel.className = 'jc-chat-panel';
    panel.innerHTML = `
        <div class="jc-chat-head">
            <span>Livechat</span>
            <button class="jc-chat-close" type="button">×</button>
        </div>
        <div class="jc-chat-toolbar" id="jcChatToolbar" style="display:none;">
            <select id="jcChatConversationSelect" class="jc-chat-select"></select>
            <button class="jc-chat-send" id="jcChatNewConversation" type="button">Neu</button>
        </div>
        <div class="jc-chat-list" id="jcChatList"></div>
        <div class="jc-chat-foot" id="jcChatFoot" style="display:none;">
            <input class="jc-chat-input" id="jcChatInput" type="text" maxlength="1200" placeholder="Nachricht schreiben..." />
            <button class="jc-chat-send" id="jcChatSend" type="button">Senden</button>
        </div>
        <form class="jc-chat-identity" id="jcChatIdentityForm">
            <div class="jc-chat-identity-title">Bitte zuerst Vorname, Nachname und E-Mail angeben.</div>
            <input class="jc-chat-input" id="jcChatVorname" type="text" maxlength="80" placeholder="Vorname" required />
            <input class="jc-chat-input" id="jcChatNachname" type="text" maxlength="80" placeholder="Nachname" required />
            <input class="jc-chat-input" id="jcChatEmail" type="email" maxlength="140" placeholder="E-Mail" required />
            <div class="jc-chat-actions">
                <button class="jc-chat-send" id="jcChatStart" type="submit">Chat starten</button>
            </div>
        </form>
    `;

    document.body.appendChild(toggleButton);
    document.body.appendChild(panel);

    const closeButton = panel.querySelector('.jc-chat-close');
    const list = panel.querySelector('#jcChatList');
    const input = panel.querySelector('#jcChatInput');
    const sendButton = panel.querySelector('#jcChatSend');
    const foot = panel.querySelector('#jcChatFoot');
    const toolbar = panel.querySelector('#jcChatToolbar');
    const conversationSelect = panel.querySelector('#jcChatConversationSelect');
    const newConversationButton = panel.querySelector('#jcChatNewConversation');
    const identityForm = panel.querySelector('#jcChatIdentityForm');
    const vornameInput = panel.querySelector('#jcChatVorname');
    const nachnameInput = panel.querySelector('#jcChatNachname');
    const emailInput = panel.querySelector('#jcChatEmail');

    let conversationId = '';
    let profile = null;
    let isAuthenticated = false;
    let historyConversations = [];

    async function api(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, options);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Fehler');
        }
        return data;
    }

    function getStoredProfile() {
        try {
            const raw = localStorage.getItem(CHAT_PROFILE_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.vorname || !parsed.nachname || !parsed.email) {
                return null;
            }
            return {
                vorname: String(parsed.vorname).trim(),
                nachname: String(parsed.nachname).trim(),
                email: String(parsed.email).trim().toLowerCase(),
                conversationId: parsed.conversationId ? String(parsed.conversationId) : ''
            };
        } catch {
            return null;
        }
    }

    function saveStoredProfile(nextProfile) {
        localStorage.setItem(CHAT_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    }

    function formatShortDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function saveConversationId(newConversationId) {
        conversationId = String(newConversationId || '').trim();
        if (!profile) return;
        const nextProfile = { ...profile, conversationId };
        profile = nextProfile;
        saveStoredProfile(nextProfile);
    }

    function renderConversationOptions() {
        const options = historyConversations.map((conversation, index) => {
            const conversationValue = String(conversation.conversation_id || '');
            const sender = conversation.letzte_nachricht_von_admin ? 'Support' : 'Sie';
            const previewRaw = String(conversation.letzte_nachricht || '').replace(/\s+/g, ' ').trim();
            const preview = previewRaw.length > 28 ? `${previewRaw.slice(0, 28)}…` : previewRaw;
            const fallbackLabel = `Gespräch ${historyConversations.length - index}`;
            const label = preview ? `${sender}: ${preview}` : fallbackLabel;
            const selected = conversationValue === String(conversationId) ? 'selected' : '';
            return `<option value="${escapeHtml(conversationValue)}" ${selected}>${escapeHtml(label)} (${escapeHtml(formatShortDate(conversation.letzte_nachricht_am))})</option>`;
        });

        conversationSelect.innerHTML = options.join('');
    }

    async function loadConversationHistory() {
        if (!profile) {
            historyConversations = [];
            renderConversationOptions();
            return;
        }

        if (!isAuthenticated) {
            const localFallback = conversationId
                ? [{ conversation_id: conversationId, letzte_nachricht: '', letzte_nachricht_am: new Date().toISOString() }]
                : [];
            historyConversations = localFallback;
            renderConversationOptions();
            return;
        }

        try {
            const result = await api('/api/chat/conversations');
            const serverConversations = result.conversations || [];
            if (conversationId && !serverConversations.some((item) => String(item.conversation_id) === String(conversationId))) {
                serverConversations.unshift({
                    conversation_id: conversationId,
                    letzte_nachricht: '',
                    letzte_nachricht_am: new Date().toISOString()
                });
            }

            historyConversations = serverConversations;
            if (!conversationId && historyConversations.length) {
                saveConversationId(historyConversations[0].conversation_id);
            }
            renderConversationOptions();
        } catch {
            historyConversations = conversationId
                ? [{ conversation_id: conversationId, letzte_nachricht: '', letzte_nachricht_am: new Date().toISOString() }]
                : [];
            renderConversationOptions();
        }
    }

    function showChatInterface() {
        foot.style.display = 'flex';
        identityForm.style.display = 'none';
        toolbar.style.display = 'grid';
    }

    function renderIdentityForm() {
        foot.style.display = 'none';
        toolbar.style.display = 'none';
        identityForm.style.display = 'grid';
        list.innerHTML = '<div class="jc-chat-note">Willkommen im Livechat. Vor dem Start benötigen wir Ihre Kontaktdaten.</div>';
    }

    function renderMessages(messages) {
        if (!messages.length) {
            list.innerHTML = '<div class="jc-chat-note">Noch keine Nachrichten. Schreiben Sie uns gerne.</div>';
            return;
        }

        const visitorDisplayName = profile
            ? `${profile.vorname || ''} ${profile.nachname || ''}`.trim() || profile.email || 'Besucher'
            : 'Besucher';

        list.innerHTML = messages.map((message) => {
            const isAdminMessage = !!message.admin_id;
            const mine = !isAdminMessage;
            const adminDisplayName = String(
                message.admin_anzeige_name
                || `${message.admin_vorname || ''} ${message.admin_nachname || ''}`.trim()
                || message.admin_email
                || 'Support'
            );
            const label = mine ? visitorDisplayName : adminDisplayName;
            const cls = mine ? 'mine' : 'admin';
            const timestamp = formatShortDate(message.erstellt_am);
            return `
                <div class="jc-chat-msg ${cls}">
                    <div class="jc-chat-meta-row">
                        <div class="jc-chat-meta">${escapeHtml(label)}</div>
                        <div class="jc-chat-time">${escapeHtml(timestamp)}</div>
                    </div>
                    <div class="jc-chat-text">${escapeHtml(message.nachricht || '')}</div>
                </div>
            `;
        }).join('');

        list.scrollTop = list.scrollHeight;
    }

    async function loadMessages() {
        if (!profile || !conversationId) {
            renderIdentityForm();
            return;
        }

        showChatInterface();

        try {
            const result = await api(`/api/chat/messages?conversationId=${encodeURIComponent(conversationId)}`);
            renderMessages(result.messages || []);
        } catch (error) {
            list.innerHTML = `<div class="jc-chat-note">${escapeHtml(error.message || 'Chat konnte nicht geladen werden.')}</div>`;
        }
    }

    async function sendMessage() {
        const text = String(input.value || '').trim();
        if (!text) return;
        if (!profile || !conversationId) {
            renderIdentityForm();
            return;
        }

        try {
            await api('/api/chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId,
                    vorname: profile.vorname,
                    nachname: profile.nachname,
                    email: profile.email,
                    nachricht: text
                })
            });
            input.value = '';
            await loadMessages();
        } catch (error) {
            alert(error.message || 'Nachricht konnte nicht gesendet werden.');
        }
    }

    async function initializeIdentityPrefill() {
        profile = getStoredProfile();
        conversationId = profile && profile.conversationId ? profile.conversationId : '';

        if (profile) {
            vornameInput.value = profile.vorname;
            nachnameInput.value = profile.nachname;
            emailInput.value = profile.email;
            return;
        }

        try {
            const session = await api('/api/check-session');
            isAuthenticated = !!session.isAuthenticated;
            if (session.isAuthenticated) {
                const user = await api('/api/user');
                if (user) {
                    vornameInput.value = user.vorname || '';
                    nachnameInput.value = user.nachname || '';
                    emailInput.value = user.email || '';
                }
            }
        } catch {
            // no session prefill available
            isAuthenticated = false;
        }
    }

    async function createNewConversation() {
        if (!profile) {
            renderIdentityForm();
            return;
        }

        const payload = {
            vorname: profile.vorname,
            nachname: profile.nachname,
            email: profile.email
        };

        const result = await api('/api/chat/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        saveConversationId(result.conversationId);
        await loadConversationHistory();
        await loadMessages();
    }

    async function startConversation(event) {
        event.preventDefault();

        const candidate = {
            vorname: String(vornameInput.value || '').trim(),
            nachname: String(nachnameInput.value || '').trim(),
            email: String(emailInput.value || '').trim().toLowerCase(),
            conversationId
        };

        if (!candidate.vorname || !candidate.nachname || !candidate.email) {
            list.innerHTML = '<div class="jc-chat-note">Bitte alle Pflichtfelder ausfüllen.</div>';
            return;
        }

        try {
            const result = await api('/api/chat/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(candidate)
            });

            saveConversationId(result.conversationId);
            profile = {
                vorname: candidate.vorname,
                nachname: candidate.nachname,
                email: candidate.email,
                conversationId
            };
            saveStoredProfile(profile);
            await loadConversationHistory();
            await loadMessages();
        } catch (error) {
            list.innerHTML = `<div class="jc-chat-note">${escapeHtml(error.message || 'Chat konnte nicht gestartet werden.')}</div>`;
        }
    }

    toggleButton.addEventListener('click', async () => {
        panel.classList.toggle('active');
        if (panel.classList.contains('active')) {
            await loadMessages();
        }
    });

    closeButton.addEventListener('click', () => panel.classList.remove('active'));
    sendButton.addEventListener('click', sendMessage);
    conversationSelect.addEventListener('change', async (event) => {
        const selectedConversationId = String(event.target.value || '').trim();
        if (!selectedConversationId) return;
        saveConversationId(selectedConversationId);
        await loadMessages();
    });
    newConversationButton.addEventListener('click', async () => {
        try {
            await createNewConversation();
        } catch (error) {
            list.innerHTML = `<div class="jc-chat-note">${escapeHtml(error.message || 'Neues Gespräch konnte nicht erstellt werden.')}</div>`;
        }
    });
    identityForm.addEventListener('submit', startConversation);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendMessage();
        }
    });

    (async () => {
        await initializeIdentityPrefill();
        await loadConversationHistory();
        await loadMessages();
        setInterval(() => {
            if (panel.classList.contains('active')) {
                loadConversationHistory().then(loadMessages).catch(() => {});
            }
        }, 5000);
    })();
})();

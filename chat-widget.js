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
        border-radius: 10px;
        font-size: 14px;
        line-height: 1.35;
        white-space: pre-wrap;
        border: 1px solid var(--border);
    }
    .jc-chat-msg.mine { margin-left: auto; background: var(--light); border-color: var(--primary); }
    .jc-chat-msg.admin { margin-right: auto; background: var(--white); }
    .jc-chat-meta { font-size: 11px; opacity: .75; margin-bottom: 4px; }
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
    const identityForm = panel.querySelector('#jcChatIdentityForm');
    const vornameInput = panel.querySelector('#jcChatVorname');
    const nachnameInput = panel.querySelector('#jcChatNachname');
    const emailInput = panel.querySelector('#jcChatEmail');

    let conversationId = '';
    let profile = null;

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

    function renderIdentityForm() {
        foot.style.display = 'none';
        identityForm.style.display = 'grid';
        list.innerHTML = '<div class="jc-chat-note">Willkommen im Livechat. Vor dem Start benötigen wir Ihre Kontaktdaten.</div>';
    }

    function renderMessages(messages) {
        if (!messages.length) {
            list.innerHTML = '<div class="jc-chat-note">Noch keine Nachrichten. Schreiben Sie uns gerne.</div>';
            return;
        }

        list.innerHTML = messages.map((message) => {
            const isAdminMessage = !!message.admin_id;
            const mine = !isAdminMessage;
            const label = mine ? 'Ich' : 'Support';
            const cls = mine ? 'mine' : 'admin';
            return `
                <div class="jc-chat-msg ${cls}">
                    <div class="jc-chat-meta">${escapeHtml(label)}</div>
                    <div>${escapeHtml(message.nachricht || '')}</div>
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

        foot.style.display = 'flex';
        identityForm.style.display = 'none';

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
        }
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

            conversationId = result.conversationId;
            profile = {
                vorname: candidate.vorname,
                nachname: candidate.nachname,
                email: candidate.email,
                conversationId
            };
            saveStoredProfile(profile);
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
    identityForm.addEventListener('submit', startConversation);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendMessage();
        }
    });

    (async () => {
        await initializeIdentityPrefill();
        await loadMessages();
        setInterval(() => {
            if (panel.classList.contains('active')) {
                loadMessages();
            }
        }, 5000);
    })();
})();

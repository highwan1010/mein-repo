(function () {
    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL)
        ? String(window.APP_CONFIG.API_BASE_URL).replace(/\/$/, '')
        : '';

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
        width: 340px;
        max-width: calc(100vw - 30px);
        height: 460px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        box-shadow: 0 20px 40px rgba(0,0,0,.18);
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
        border-bottom: 1px solid #eef2f7;
        background: #f8fafc;
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
        padding: 10px;
        background: #ffffff;
    }
    .jc-chat-msg {
        margin-bottom: 8px;
        max-width: 85%;
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 14px;
        line-height: 1.35;
        white-space: pre-wrap;
    }
    .jc-chat-msg.mine { margin-left: auto; background: #dbeafe; color: #1e3a8a; }
    .jc-chat-msg.admin { margin-right: auto; background: #f1f5f9; color: #111827; }
    .jc-chat-meta { font-size: 11px; opacity: .75; margin-bottom: 4px; }
    .jc-chat-foot { padding: 10px; border-top: 1px solid #eef2f7; display: flex; gap: 8px; }
    .jc-chat-input {
        flex: 1;
        border: 1px solid #d1d5db;
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
    .jc-chat-note { color: #6b7280; font-size: 13px; padding: 10px; }
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
        <div class="jc-chat-foot" id="jcChatFoot">
            <input class="jc-chat-input" id="jcChatInput" type="text" maxlength="1200" placeholder="Nachricht schreiben..." />
            <button class="jc-chat-send" id="jcChatSend" type="button">Senden</button>
        </div>
    `;

    document.body.appendChild(toggleButton);
    document.body.appendChild(panel);

    const closeButton = panel.querySelector('.jc-chat-close');
    const list = panel.querySelector('#jcChatList');
    const input = panel.querySelector('#jcChatInput');
    const sendButton = panel.querySelector('#jcChatSend');
    const foot = panel.querySelector('#jcChatFoot');

    let isAuthenticated = false;
    let currentUser = null;

    async function api(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, options);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Fehler');
        }
        return data;
    }

    function renderLoginHint() {
        list.innerHTML = '<div class="jc-chat-note">Bitte zuerst einloggen, um den Livechat zu nutzen.</div>';
        foot.innerHTML = '<button class="jc-chat-send" type="button" onclick="window.location.href=\'login.html\'">Zum Login</button>';
    }

    function renderMessages(messages) {
        if (!messages.length) {
            list.innerHTML = '<div class="jc-chat-note">Noch keine Nachrichten. Schreiben Sie uns gerne.</div>';
            return;
        }

        list.innerHTML = messages.map((message) => {
            const isAdminMessage = !!message.admin_id;
            const mine = !isAdminMessage || (currentUser && Number(message.admin_id) === Number(currentUser.id));
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
        if (!isAuthenticated) {
            renderLoginHint();
            return;
        }

        try {
            const result = await api('/api/chat/messages');
            renderMessages(result.messages || []);
        } catch (error) {
            list.innerHTML = `<div class="jc-chat-note">${escapeHtml(error.message || 'Chat konnte nicht geladen werden.')}</div>`;
        }
    }

    async function sendMessage() {
        const text = String(input.value || '').trim();
        if (!text) return;

        try {
            await api('/api/chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nachricht: text })
            });
            input.value = '';
            await loadMessages();
        } catch (error) {
            alert(error.message || 'Nachricht konnte nicht gesendet werden.');
        }
    }

    async function initAuth() {
        try {
            const session = await api('/api/check-session');
            isAuthenticated = !!session.isAuthenticated;
            if (isAuthenticated) {
                currentUser = await api('/api/user');
            }
        } catch {
            isAuthenticated = false;
            currentUser = null;
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
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendMessage();
        }
    });

    (async () => {
        await initAuth();
        await loadMessages();
        setInterval(() => {
            if (panel.classList.contains('active')) {
                loadMessages();
            }
        }, 5000);
    })();
})();

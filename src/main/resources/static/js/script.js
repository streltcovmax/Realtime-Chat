'use strict';

import {User} from "./user.js";
import {initNotifications, loadNotificationSettings, notifyNewMessage, resetUnreadCount} from "./notifications.js";

// ============================================
// КОНСТАНТЫ
// ============================================

const MESSAGES_PAGE_SIZE = 50;
const SCROLL_THRESHOLD_PX = 250;
const MIN_SEARCH_LENGTH = 2;
const MESSAGE_SEARCH_MIN_LENGTH = 2;
const MESSAGE_SEARCH_LIMIT = 20;
const MESSAGE_SEARCH_DEBOUNCE_MS = 250;
const MOBILE_BREAKPOINT = 600;
const MESSAGE_COMPOSER_MAX_LINES = 12;

// ============================================
// DOM ЭЛЕМЕНТЫ
// ============================================

const DOM = {
    // Основные области
    chatArea: document.querySelector('#chat-area'),
    chatMessagesArea: document.querySelector('#chat-messages'),

    // Информационные сообщения
    pickChatInfoMessage: document.querySelector('#pick-chat-message'),
    emptyChatInfoMessage: document.querySelector('#empty-chat-message'),

    // Ввод сообщения
    messageInput: document.querySelector('#messageInput'),

    // Список чатов
    chatsList: document.querySelector('#chats-list'),
    chatsListContainer: document.querySelector('#chats-list-container'),

    // Шапка чата
    chatHeaderInfo: document.querySelector('#chat-header-info'),
    chatHeaderUserInfoContainer: document.querySelector('#chat-header-user-info-container'),

    // Поиск
    searchResultsContainer: document.querySelector('#search-results-container'),
    foundUsersList: document.querySelector('#foundUsers'),
    searchNoResults: document.querySelector('#search-no-results'),
    searchInput: document.querySelector('#searchUsername'),
    searchClearBtn: document.querySelector('#search-clear-btn'),

    // Информация о текущем пользователе
    connectedUserFullname: document.querySelector('#connected-user-fullname'),
    connectedUserAvatar: document.querySelector('#connected-user-avatar'),

    messageForm: document.querySelector('#messageForm'),
    messageLengthError: document.querySelector('#message-length-error'),
    sendMessageButton: document.querySelector('#send-message-button'),

    messageSearchModal: document.querySelector('#message-search-modal'),
    messageSearchBackdrop: document.querySelector('#message-search-modal-backdrop'),
    messageSearchDialog: document.querySelector('#message-search-modal-dialog'),
    searchMessagesButton: document.querySelector('#search-messages-button'),
    messageSearchQuery: document.querySelector('#message-search-query'),
    messageSearchList: document.querySelector('#message-search-list'),
    messageSearchStatus: document.querySelector('#message-search-status'),

    userProfileModal: document.querySelector('#user-profile-modal'),
    userProfileBackdrop: document.querySelector('#user-profile-modal-backdrop'),
    userProfileDialog: document.querySelector('#user-profile-modal-dialog'),
    userProfileAvatar: document.querySelector('#user-profile-modal-avatar'),
    userProfileTitle: document.querySelector('#user-profile-modal-title'),
    userProfileUsername: document.querySelector('#user-profile-modal-username'),
    userProfileStatus: document.querySelector('#user-profile-modal-status'),

    createGroupButton: document.querySelector('#create-group-button'),
    groupManageButton: document.querySelector('#group-manage-button'),
    groupModal: document.querySelector('#group-modal'),
    groupModalBackdrop: document.querySelector('#group-modal-backdrop'),
    groupNameInput: document.querySelector('#group-name-input'),
    groupMembersInput: document.querySelector('#group-members-input'),
    groupModalStatus: document.querySelector('#group-modal-status'),
    groupSaveButton: document.querySelector('#group-save-button'),
    groupCancelButton: document.querySelector('#group-cancel-button'),
    groupManageModal: document.querySelector('#group-manage-modal'),
    groupManageBackdrop: document.querySelector('#group-manage-modal-backdrop'),
    groupManageStatus: document.querySelector('#group-manage-status'),
    groupAddMemberButton: document.querySelector('#group-add-member-button'),
    groupRemoveMemberButton: document.querySelector('#group-remove-member-button'),
    groupLeaveButton: document.querySelector('#group-leave-button'),
    groupManageCloseButton: document.querySelector('#group-manage-close-button'),
    groupMemberSearch: document.querySelector('#group-member-search'),
    groupMemberSearchQuery: document.querySelector('#group-member-search-query'),
    groupMemberSearchList: document.querySelector('#group-member-search-list'),
};

// ============================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================

const AppState = {
    stompClient: null,
    reconnectTimer: null,
    isConnected: false,
    selectedUser: {
        username: null,
        fullname: null,
        status: null,
        type: 'DIRECT',
        selector: null,
        chatId: null,
        createdBy: null
    },
    pagination: {
        page: 0,
        newestPage: 0,
        isFirstPage: true,
        isLastPage: false,
        isLoading: false,
    },
    // Подтягивается из data-max-message-length формы сообщения после setupUI
    maxMessageLength: 2048,
    chatTailDayKey: null,
    messageSearchTimer: null,
    messageSearchRequestId: 0,
    groupMemberMode: null,
    groupMemberSearchTimer: null,
    groupMemberSearchRequestId: 0,
    groupMembers: [],
};

function updateAppHeightVar() {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
}

function readXsrfTokenFromCookie() {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
}

function resolveCsrfForFetch() {
    const ds = document.body?.dataset;
    const token = (ds?.csrfToken && ds.csrfToken.trim()) || readXsrfTokenFromCookie();
    const headerName = ds?.csrfHeader || 'X-XSRF-TOKEN';
    return {token, headerName};
}

function jsonFetchHeaders() {
    const headers = {'Content-Type': 'application/json'};
    const {token, headerName} = resolveCsrfForFetch();
    if (token) {
        headers[headerName] = token;
    }
    return headers;
}

function jsonFetchHeadersForEmptyBody() {
    const headers = {};
    const {token, headerName} = resolveCsrfForFetch();
    if (token) {
        headers[headerName] = token;
    }
    return headers;
}

const SAME_ORIGIN_FETCH = {credentials: 'same-origin'};

function markMessageReadOnServer(message) {
    const id = message.message_id ?? message.messageId;
    const recipientId = String(message.recipientId || '');
    if (id == null || (recipientId !== User.username && !recipientId.startsWith('chat-'))) {
        return Promise.resolve();
    }

    return fetch(`/messages/read/${id}`, {
        method: 'PUT',
        ...SAME_ORIGIN_FETCH,
        headers: jsonFetchHeadersForEmptyBody()
    });
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

function initCurrentUser() {
    fetch("/user.getCurrent", SAME_ORIGIN_FETCH)
        .then(response => {
            if (response.status === 401) {
                window.location.href = '/oauth2/authorization/keycloak';
                throw new Error("Unauthorized");
            }
            if (!response.ok) throw new Error("Ошибка загрузки пользователя");
            return response.json();
        })
        .then(userJson => {
            User.username = userJson.username;
            User.fullname = userJson.fullname;
            User.status = userJson.status;
            connectWS();
        })
        .catch(error => {
            console.error("Ошибка при инициализации пользователя:", error);
        });
}

function onConnected() {
    AppState.isConnected = true;
    if (AppState.reconnectTimer) {
        clearTimeout(AppState.reconnectTimer);
        AppState.reconnectTimer = null;
    }

    // Подписки на WebSocket каналы
    AppState.stompClient.subscribe(`/user/${User.username}/messages`, onMessageReceived);
    AppState.stompClient.subscribe(`/user/public/`, onUserStatusUpdate);
    AppState.stompClient.subscribe(`/user/${User.username}/usersSearch`, onSearchResults);
    AppState.stompClient.subscribe(`/user/${User.username}/groupUpdates`, onGroupChatUpdate);

    // Регистрация пользователя
    registerUser();
}

function registerUser() {
    fetch('/user.addUser', {
        method: 'POST',
        ...SAME_ORIGIN_FETCH,
        headers: jsonFetchHeaders(),
        body: JSON.stringify({
            username: User.username,
            fullname: User.fullname,
            status: User.status
        })
    }).then(response => {
        if (!response.ok) {
            console.error('Ошибка сохранения пользователя в БД');
            return;
        }
        setupUI();
    });
}

function setupUI() {
    hideChatArea();
    DOM.connectedUserFullname.textContent = User.fullname;
    DOM.connectedUserAvatar.textContent = User.fullname[0];
    readMaxMessageLengthFromDom();
    setEventListeners();
    initMessageComposer();
    fetchAndShowChats();

    loadNotificationSettings();
    initNotifications();
}

function setEventListeners() {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', updateAppHeightVar);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateAppHeightVar);
        window.visualViewport.addEventListener('scroll', updateAppHeightVar);
    }
    // Кнопки
    document.querySelector('#this-profile-button').addEventListener('click', showCurrentUserProfile);
    document.querySelector('#logout-button').addEventListener('click', onLogout);
    document.querySelector('#send-message-button').addEventListener('click', sendMessage);
    if (DOM.chatHeaderUserInfoContainer) {
        DOM.chatHeaderUserInfoContainer.addEventListener('click', showSelectedUserProfile);
    }
    if (DOM.userProfileBackdrop) {
        DOM.userProfileBackdrop.addEventListener('click', closeUserProfileModal);
    }
    if (DOM.userProfileDialog) {
        DOM.userProfileDialog.addEventListener('click', e => e.stopPropagation());
    }
    DOM.createGroupButton?.addEventListener('click', openCreateGroupModal);
    DOM.groupModalBackdrop?.addEventListener('click', closeCreateGroupModal);
    DOM.groupCancelButton?.addEventListener('click', closeCreateGroupModal);
    DOM.groupSaveButton?.addEventListener('click', createGroup);
    DOM.groupManageButton?.addEventListener('click', openGroupManageModal);
    DOM.groupManageBackdrop?.addEventListener('click', closeGroupManageModal);
    DOM.groupManageCloseButton?.addEventListener('click', closeGroupManageModal);
    DOM.groupAddMemberButton?.addEventListener('click', addGroupMember);
    DOM.groupRemoveMemberButton?.addEventListener('click', removeGroupMember);
    DOM.groupLeaveButton?.addEventListener('click', leaveCurrentGroup);
    DOM.groupMemberSearchQuery?.addEventListener('input', onGroupMemberSearchInput);

    // Поиск
    DOM.searchInput.addEventListener('input', onSearchInput);
    DOM.searchClearBtn.addEventListener('click', clearSearch);

    // Скролл сообщений (подгрузка истории)
    DOM.chatMessagesArea.addEventListener('scroll', onMessagesScroll);

    if (DOM.searchMessagesButton) {
        DOM.searchMessagesButton.type = 'button';
        DOM.searchMessagesButton.addEventListener('click', e => {
            e.stopPropagation();
            openMessageSearchModal();
        });
    }
    if (DOM.messageSearchBackdrop) {
        DOM.messageSearchBackdrop.addEventListener('click', () => closeMessageSearchModal());
    }
    if (DOM.messageSearchDialog) {
        DOM.messageSearchDialog.addEventListener('click', e => e.stopPropagation());
    }
    if (DOM.messageSearchQuery) {
        DOM.messageSearchQuery.addEventListener('input', onMessageSearchInput);
        DOM.messageSearchQuery.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                clearTimeout(AppState.messageSearchTimer);
                searchMessagesInCurrentChat();
            }
        });
    }

    // Закрытие по Escape
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (DOM.userProfileModal && !DOM.userProfileModal.classList.contains('hidden')) {
                closeUserProfileModal();
                return;
            }
            if (DOM.messageSearchModal && !DOM.messageSearchModal.classList.contains('hidden')) {
                closeMessageSearchModal();
                return;
            }
            if (DOM.groupModal && !DOM.groupModal.classList.contains('hidden')) {
                closeCreateGroupModal();
                return;
            }
            if (DOM.groupManageModal && !DOM.groupManageModal.classList.contains('hidden')) {
                closeGroupManageModal();
                return;
            }
            hideChatArea();
            hideSearchArea();
        }
    });
}

// ============================================
// ПОЛЕ ВВОДА СООБЩЕНИЯ (лимит длины, авто‑высота)
// ============================================

function readMaxMessageLengthFromDom() {
    const raw = DOM.messageForm?.dataset?.maxMessageLength;
    const n = parseInt(raw, 10);
    AppState.maxMessageLength = Number.isFinite(n) && n > 0 ? n : 2048;
}

function autosizeMessageInput() {
    const ta = DOM.messageInput;
    if (!ta) return;

    const styles = getComputedStyle(ta);
    let lineHeight = parseFloat(styles.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        lineHeight = (parseFloat(styles.fontSize) || 16) * 1.35;
    }
    const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const borderY = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * MESSAGE_COMPOSER_MAX_LINES + paddingY + borderY;

    ta.style.maxHeight = `${maxHeight}px`;
    ta.style.height = '0px';
    const scrollH = ta.scrollHeight;
    const next = Math.min(scrollH, maxHeight);
    ta.style.height = `${next}px`;
    ta.style.overflowY = scrollH > maxHeight ? 'auto' : 'hidden';
}

function syncMessageComposerState() {
    if (!DOM.messageInput || !DOM.messageLengthError || !DOM.sendMessageButton) return;

    const trimmedLength = DOM.messageInput.value.trim().length;
    const tooLong = trimmedLength > AppState.maxMessageLength;
    const limit = AppState.maxMessageLength;

    DOM.messageLengthError.classList.toggle('hidden', !tooLong);
    DOM.messageLengthError.textContent = tooLong
        ? `Слишком длинное сообщение: максимум ${limit} символов, сейчас ${trimmedLength}.`
        : '';

    DOM.sendMessageButton.disabled = tooLong;
    autosizeMessageInput();
}

function initMessageComposer() {
    if (!DOM.messageForm || !DOM.messageInput) return;

    DOM.messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage(e);
    });

    DOM.messageInput.addEventListener('input', syncMessageComposerState);
    DOM.messageInput.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        sendMessage(e);
    });

    syncMessageComposerState();
}

// ============================================
// WEBSOCKET
// ============================================

function connectWS() {
    if (AppState.isConnected) return;

    const socket = new SockJS('/ws');
    AppState.stompClient = Stomp.over(socket);
    AppState.stompClient.heartbeat.outgoing = 20_000;
    AppState.stompClient.heartbeat.incoming = 20_000;
    AppState.stompClient.connect({}, onConnected, onWSError);

    socket.onclose = () => {
        AppState.isConnected = false;
        scheduleReconnect();
    };
}

function onWSError(error) {
    AppState.isConnected = false;
    console.error('WebSocket connection error:', error);
    scheduleReconnect();
}

function scheduleReconnect() {
    if (AppState.reconnectTimer || AppState.isConnected) return;
    AppState.reconnectTimer = setTimeout(() => {
        AppState.reconnectTimer = null;
        connectWS();
    }, 3_000);
}

// ============================================
// ОБЛАСТЬ ЧАТА (показ/скрытие)
// ============================================

function hideChatArea() {
    // Удаляем временные чаты (без сообщений)
    document.querySelectorAll('.chat-item.active').forEach(item => {
        if (item.chatData?.hasChat === false) {
            item.remove();
        }
    });

    DOM.chatArea.classList.add('hidden');
    closeMessageSearchModal();
    DOM.chatMessagesArea.innerHTML = '';
    AppState.chatTailDayKey = null;
    DOM.pickChatInfoMessage.classList.remove('hidden');
    DOM.emptyChatInfoMessage.classList.add('hidden');
    DOM.groupManageButton?.classList.add('hidden');

    clearSelection('.chat-item.active');
    clearSelection('.search-result-item.active');
    resetSelectedUser();

    document.body.classList.remove('mobile-chat-open');
}

function showChatArea() {
    DOM.pickChatInfoMessage.classList.add('hidden');
    DOM.chatArea.classList.remove('hidden');

    if (isMobile()) {
        document.body.classList.add('mobile-chat-open');
    }
}

function showEmptyChatMessage() {
    DOM.emptyChatInfoMessage.classList.remove('hidden');
}

// ============================================
// ПОИСК ПО СООБЩЕНИЯМ (модалка)
// ============================================

function openMessageSearchModal() {
    if (!DOM.messageSearchModal) return;
    clearMessageSearchResults('Введите минимум 2 символа');
    DOM.messageSearchModal.classList.remove('hidden');
    DOM.messageSearchModal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => DOM.messageSearchQuery?.focus());
}

function closeMessageSearchModal() {
    if (!DOM.messageSearchModal) return;
    DOM.messageSearchModal.classList.add('hidden');
    DOM.messageSearchModal.setAttribute('aria-hidden', 'true');
    DOM.messageSearchQuery?.blur();
    DOM.messageSearchQuery.value = '';
}

function onMessageSearchInput() {
    clearTimeout(AppState.messageSearchTimer);
    AppState.messageSearchTimer = setTimeout(searchMessagesInCurrentChat, MESSAGE_SEARCH_DEBOUNCE_MS);
}

async function searchMessagesInCurrentChat() {
    const peer = getChatSelector(AppState.selectedUser);
    const query = DOM.messageSearchQuery?.value.trim() ?? '';

    if (!peer) {
        clearMessageSearchResults('Сначала выберите чат');
        return;
    }

    if (query.length < MESSAGE_SEARCH_MIN_LENGTH) {
        clearMessageSearchResults('Введите минимум 2 символа');
        return;
    }

    const requestId = ++AppState.messageSearchRequestId;
    clearMessageSearchResults('Ищем...');

    try {
        const params = new URLSearchParams({
            peer,
            q: query,
            limit: String(MESSAGE_SEARCH_LIMIT)
        });
        const response = await fetch(`/messages/search?${params}`, SAME_ORIGIN_FETCH);

        if (requestId !== AppState.messageSearchRequestId) {
            return;
        }

        if (response.status === 404) {
            clearMessageSearchResults('Поиск сообщений отключён');
            return;
        }

        if (!response.ok) {
            clearMessageSearchResults('Не удалось выполнить поиск');
            return;
        }

        const hits = await response.json();
        renderMessageSearchResults(Array.isArray(hits) ? hits : []);
    } catch (error) {
        if (requestId === AppState.messageSearchRequestId) {
            clearMessageSearchResults('Не удалось выполнить поиск');
        }
        console.error('Не удалось выполнить поиск сообщений:', error);
    }
}

function clearMessageSearchResults(message) {
    if (DOM.messageSearchList) {
        DOM.messageSearchList.innerHTML = '';
    }
    setMessageSearchStatus(message);
}

function setMessageSearchStatus(message) {
    if (!DOM.messageSearchStatus) return;
    DOM.messageSearchStatus.textContent = message || '';
    DOM.messageSearchStatus.classList.toggle('hidden', !message);
}

function renderMessageSearchResults(hits) {
    DOM.messageSearchList.innerHTML = '';

    if (hits.length === 0) {
        setMessageSearchStatus('Ничего не найдено');
        return;
    }

    setMessageSearchStatus('');
    hits.forEach(hit => DOM.messageSearchList.appendChild(createMessageSearchResultElement(hit)));
}

function createMessageSearchResultElement(hit) {
    const element = document.createElement('li');
    element.classList.add('search-result-item', 'message-search-result-item');

    const snippet = document.createElement('span');
    snippet.classList.add('message-search-snippet');
    snippet.textContent = hit.content ?? '';

    const meta = document.createElement('span');
    meta.classList.add('message-search-meta');
    const sender = hit.senderId === User.username ? 'Вы' : AppState.selectedUser.fullname || hit.senderId || '';
    meta.textContent = `${sender} · ${formatMessageSearchDate(hit.dateCreated)}`;

    element.appendChild(snippet);
    element.appendChild(meta);
    element.addEventListener('click', () => focusLoadedMessageFromSearch(hit.messageId));
    return element;
}

async function focusLoadedMessageFromSearch(messageId) {
    if (messageId == null) return;
    let row = findLoadedMessageRow(messageId);
    if (!row) {
        setMessageSearchStatus('Загружаем найденное сообщение...');
        await loadChatPageAroundMessage(messageId);
        row = findLoadedMessageRow(messageId);
        if (!row) {
            setMessageSearchStatus('Не удалось открыть найденное сообщение');
            return;
        }
    }

    closeMessageSearchModal();
    focusMessageRow(row);
}

function findLoadedMessageRow(messageId) {
    return DOM.chatMessagesArea.querySelector(`.chat-message-row[data-message-id="${messageId}"]`);
}

function focusMessageRow(row) {
    const target = row.querySelector('.message-content') || row.querySelector('.message') || row;
    const containerRect = DOM.chatMessagesArea.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = DOM.chatMessagesArea.scrollTop
        + (targetRect.top - containerRect.top)
        - (DOM.chatMessagesArea.clientHeight / 2)
        + (targetRect.height / 2);

    requestAnimationFrame(() => {
        DOM.chatMessagesArea.scrollTo({
            top: Math.max(0, targetTop),
            behavior: 'smooth'
        });
    });
    row.classList.add('message-search-highlight');
    setTimeout(() => row.classList.remove('message-search-highlight'), 1800);
}

// ============================================
// ПОИСК
// ============================================

function hideSearchArea() {
    DOM.searchInput.value = '';
    DOM.searchClearBtn.classList.add('hidden');
    hideSearchResults();
}

function onSearchInput() {
    const query = DOM.searchInput.value.trim();

    // Обновляем видимость кнопки очистки
    DOM.searchClearBtn.classList.toggle('hidden', query.length === 0);

    // Очищаем результаты
    DOM.foundUsersList.innerHTML = '';
    DOM.searchNoResults.classList.add('hidden');

    if (query.length === 0) {
        hideSearchResults();
        return;
    }

    showSearchResults();

    if (query.length <= MIN_SEARCH_LENGTH) {
        DOM.searchNoResults.textContent = 'Введите минимум 3 символа';
        DOM.searchNoResults.classList.remove('hidden');
        return;
    }

    DOM.searchNoResults.textContent = 'Ничего не найдено';

    if (AppState.stompClient) {
        AppState.stompClient.send("/app/user.findUsers", {}, query);
    }
}

function clearSearch() {
    DOM.searchInput.value = '';
    DOM.searchClearBtn.classList.add('hidden');
    hideSearchResults();
}

function showSearchResults() {
    DOM.searchResultsContainer.classList.remove('hidden');
    DOM.chatsListContainer.classList.add('hidden');
}

function hideSearchResults() {
    DOM.searchResultsContainer.classList.add('hidden');
    DOM.chatsListContainer.classList.remove('hidden');
    DOM.foundUsersList.innerHTML = '';
    DOM.searchNoResults.textContent = 'Ничего не найдено';
    DOM.searchNoResults.classList.add('hidden');
}

function onSearchResults(payload) {
    const foundUsers = JSON.parse(payload.body)
        .filter(user => user.username !== User.username);

    DOM.foundUsersList.innerHTML = '';
    showSearchResults();

    DOM.searchNoResults.textContent = 'Ничего не найдено';
    DOM.searchNoResults.classList.toggle('hidden', foundUsers.length > 0);

    foundUsers.forEach(user => {
        const element = createSearchResultElement(user);
        DOM.foundUsersList.appendChild(element);
    });
}

function createSearchResultElement(user) {
    const element = document.createElement('li');
    element.classList.add('search-result-item');
    element.chatData = user;

    const avatar = document.createElement('span');
    avatar.classList.add('chat-avatar', 'r');
    avatar.textContent = user.fullname?.[0] || user.username?.[0] || '?';

    const label = document.createElement('span');
    label.classList.add('search-result-text');
    const fullname = document.createElement('span');
    fullname.classList.add('search-result-name');
    fullname.textContent = user.fullname || user.username;
    const username = document.createElement('span');
    username.classList.add('search-result-username');
    username.textContent = `@${user.username}`;
    label.appendChild(fullname);
    label.appendChild(username);

    element.appendChild(avatar);
    element.appendChild(label);
    element.addEventListener('click', () => onSearchResultClick(element, user));
    return element;
}

function onSearchResultClick(element, user) {
    setItemActive(element, '.search-result-item.active');

    const existingChat = findChatElement(user.username);
    if (existingChat) {
        existingChat.dispatchEvent(new Event('click', {bubbles: true}));
    } else {
        openNewChat(element);
    }
}

// ============================================
// СПИСОК ЧАТОВ
// ============================================

async function fetchAndShowChats() {
    try {
        const response = await fetch('/chats', SAME_ORIGIN_FETCH);
        const chats = await response.json();

        DOM.chatsList.innerHTML = '';

        chats
            .map(normalizeChatData)
            .filter(chat => chat.type === 'GROUP' || chat.username !== User.username)
            .forEach(chat => appendChatToList(chat));
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

function upsertChatInList(chatData, prependToList = true) {
    const normalized = normalizeChatData(chatData);
    const selector = getChatSelector(normalized);
    const existing = findChatElement(selector);

    if (existing) {
        existing.chatData = {...existing.chatData, ...normalized};
        existing.querySelector('.chat-name').textContent = normalized.fullname ?? '';
        const avatar = existing.querySelector('.chat-avatar');
        if (avatar?.firstChild) {
            avatar.firstChild.textContent = normalized.fullname?.[0] || normalized.username?.[0] || '?';
        }
        if (normalized.lastMessage) {
            updateChatPreview(existing, {
                content: normalized.lastMessage,
                dateCreated: normalized.lastMessageAt
            });
        }
        if (prependToList) {
            moveChatToTop(existing);
        }
        return existing;
    }

    appendChatToList(normalized, prependToList);
    return findChatElement(selector);
}

function onGroupChatUpdate(payload) {
    const event = JSON.parse(payload.body);
    const selector = `chat-${event.chatId}`;

    if (event.action === 'REMOVE') {
        findChatElement(selector)?.remove();
        if (getChatSelector(AppState.selectedUser) === selector) {
            closeGroupManageModal();
            hideChatArea();
        }
        return;
    }

    if (event.action === 'UPSERT' && event.chat) {
        const chat = normalizeChatData(event.chat);
        upsertChatInList(chat, true);
        if (getChatSelector(AppState.selectedUser) === getChatSelector(chat)) {
            AppState.selectedUser = {...AppState.selectedUser, ...chat};
            fillChatHeader(AppState.selectedUser);
        }
    }
}

function moveChatToTop(chatElement) {
    if (!chatElement || chatElement.parentElement !== DOM.chatsList) return;
    DOM.chatsList.prepend(chatElement);
}

function appendChatToList(chatData, prependToList = false) {
    chatData = normalizeChatData(chatData);
    const selector = getChatSelector(chatData);
    const listItem = document.createElement('li');
    listItem.classList.add('chat-item');
    listItem.id = getChatDomId(selector);
    listItem.dataset.chatSelector = selector;
    listItem.chatData = {...chatData};

    const chatInfo = document.createElement('div');
    chatInfo.classList.add('chat-info');
    const avatarWrap = document.createElement('div');
    avatarWrap.classList.add('chat-avatar', 'r');
    avatarWrap.appendChild(document.createTextNode(chatData.fullname?.[0] || chatData.username?.[0] || '?'));
    const onlineIndicator = document.createElement('span');
    onlineIndicator.classList.add('online-indicator', 'hidden');
    avatarWrap.appendChild(onlineIndicator);
    chatInfo.appendChild(avatarWrap);

    const chatText = document.createElement('div');
    chatText.classList.add('chat-text');
    const nameSpan = document.createElement('span');
    nameSpan.classList.add('chat-name');
    nameSpan.textContent = chatData.fullname ?? '';
    const previewSpan = document.createElement('span');
    previewSpan.classList.add('chat-message');
    chatText.appendChild(nameSpan);
    chatText.appendChild(previewSpan);

    const chatNums = document.createElement('div');
    chatNums.classList.add('chat-nums');
    const datetimeSpan = document.createElement('span');
    datetimeSpan.classList.add('datetime');
    const markerSpan = document.createElement('span');
    markerSpan.classList.add('notificationMarker', 'r', 'hidden');
    chatNums.appendChild(datetimeSpan);
    chatNums.appendChild(markerSpan);

    listItem.appendChild(chatInfo);
    listItem.appendChild(chatText);
    listItem.appendChild(chatNums);

    updateStatusIndicator(listItem, chatData.status);
    listItem.addEventListener('click', onChatItemClick);
    if (prependToList) {
        DOM.chatsList.prepend(listItem);
    } else {
        DOM.chatsList.appendChild(listItem);
    }

    if (chatData.lastMessage) {
        updateChatPreview(listItem, {
            content: chatData.lastMessage,
            dateCreated: chatData.lastMessageAt
        });
    } else if (!isGroupChat(chatData)) {
        loadLastMessage(listItem, selector);
    }
    loadUnreadMessagesCount(listItem, selector)
}

async function loadLastMessage(chatElement, targetUsername) {
    try {
        const response = await fetch(`/messages/last/${User.username}/${targetUsername}`, SAME_ORIGIN_FETCH);
        if (!response.ok || response.status === 204) return;

        const message = await response.json();
        if (message) {
            updateChatPreview(chatElement, message);
        }
    } catch (error) {
        console.error('Не удалось получить последнее сообщение:', error);
    }
}

async function loadUnreadMessagesCount(chatElement, targetUsername) {
    try {
        const response = await fetch(`/messages/${User.username}/${targetUsername}/count-unread`, SAME_ORIGIN_FETCH);
        if (!response.ok || response.status === 204) return;

        const count = await response.json();

        console.log("loading unread messages count from " + targetUsername, " found " + count);

        if (count !== null) {
            updateChatNotificationMarker(chatElement, count);
        }
    } catch (error) {
        console.error('Не удалось посчитать непрочитанные сообщения:', error);
    }
}


async function fetchAndAppendNewUser(targetUsername, message) {
    let chatElement = findChatElement(targetUsername);

    if (chatElement) {
        if (message) updateChatPreview(chatElement, message);
        moveChatToTop(chatElement);
        return;
    }

    try {
        const response = await fetch(`/users/${targetUsername}`, SAME_ORIGIN_FETCH);
        const user = await response.json();
        appendChatToList(user, true);

        chatElement = findChatElement(targetUsername);
        if (!chatElement) {
            console.error('Ошибка добавления нового чата');
            return;
        }

        if (message) updateChatPreview(chatElement, message);

        if (getChatSelector(AppState.selectedUser) === targetUsername) {
            setItemActive(chatElement, '.chat-item.active');
        }
    } catch (error) {
        console.error('Ошибка получения данных пользователя:', error);
    }
}

function updateChatPreview(chatElement, message) {
    chatElement.querySelector('.chat-message').textContent = message.content;
    chatElement.querySelector('.datetime').textContent = message.dateCreated ? formatDateTimeForChat(message.dateCreated) : '';
}

function updateChatNotificationMarker(chatElement, count) {
    const notificationMarker = chatElement.querySelector('.notificationMarker');
    if (count === 0) {
        notificationMarker.classList.add('hidden');
        notificationMarker.textContent = '';
        return;
    }
    notificationMarker.classList.remove('hidden');
    notificationMarker.textContent = count;
}

function openCreateGroupModal() {
    if (!DOM.groupModal) return;
    DOM.groupNameInput.value = '';
    DOM.groupMembersInput.value = '';
    setGroupModalStatus('');
    DOM.groupModal.classList.remove('hidden');
    DOM.groupModal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => DOM.groupNameInput?.focus());
}

function closeCreateGroupModal() {
    if (!DOM.groupModal) return;
    DOM.groupModal.classList.add('hidden');
    DOM.groupModal.setAttribute('aria-hidden', 'true');
}

function setGroupModalStatus(message) {
    if (!DOM.groupModalStatus) return;
    DOM.groupModalStatus.textContent = message || '';
    DOM.groupModalStatus.classList.toggle('hidden', !message);
}

function parseMemberInput(value) {
    return String(value || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

async function createGroup() {
    const name = DOM.groupNameInput?.value.trim();
    const usernames = parseMemberInput(DOM.groupMembersInput?.value);

    if (!name) {
        setGroupModalStatus('Введите название группы');
        return;
    }

    try {
        const response = await fetch('/groups', {
            method: 'POST',
            ...SAME_ORIGIN_FETCH,
            headers: jsonFetchHeaders(),
            body: JSON.stringify({name, usernames})
        });
        if (!response.ok) {
            setGroupModalStatus('Не удалось создать группу');
            return;
        }
        const chat = normalizeChatData(await response.json());
        upsertChatInList(chat, true);
        closeCreateGroupModal();
        const chatElement = findChatElement(getChatSelector(chat));
        chatElement?.dispatchEvent(new Event('click', {bubbles: true}));
    } catch (error) {
        console.error('Не удалось создать группу:', error);
        setGroupModalStatus('Не удалось создать группу');
    }
}

function openGroupManageModal() {
    if (!DOM.groupManageModal || !isGroupChat()) return;
    setGroupManageStatus('');
    ensureGroupMembersPanel();
    DOM.groupManageModal.classList.remove('hidden');
    DOM.groupManageModal.setAttribute('aria-hidden', 'false');
    const isCreator = AppState.selectedUser.createdBy === User.username;
    DOM.groupAddMemberButton.classList.toggle('hidden', !isCreator);
    DOM.groupRemoveMemberButton.classList.add('hidden');
    DOM.groupLeaveButton.textContent = isCreator ? 'Выйти и удалить' : 'Выйти из группы';
    closeGroupMemberSearch();
    loadGroupMembers();
}

function closeGroupManageModal() {
    if (!DOM.groupManageModal) return;
    closeGroupMemberSearch();
    DOM.groupManageModal.classList.add('hidden');
    DOM.groupManageModal.setAttribute('aria-hidden', 'true');
    if (DOM.groupMembersListSearch) {
        DOM.groupMembersListSearch.value = '';
    }
}

function setGroupManageStatus(message) {
    if (!DOM.groupManageStatus) return;
    DOM.groupManageStatus.textContent = message || '';
    DOM.groupManageStatus.classList.toggle('hidden', !message);
}

function ensureGroupMembersPanel() {
    if (DOM.groupMembersList) return;
    const dialog = DOM.groupManageModal?.querySelector('.message-search-modal-dialog');
    if (!dialog || !DOM.groupManageStatus) return;

    const panel = document.createElement('div');
    panel.id = 'group-members-panel';
    panel.classList.add('group-members-panel');

    const inputWrap = document.createElement('div');
    inputWrap.classList.add('search-input-wrapper', 'message-search-input-wrap');

    const input = document.createElement('input');
    input.autocomplete = 'off';
    input.type = 'text';
    input.id = 'group-members-list-search';
    input.classList.add('r');
    input.placeholder = 'поиск участников';
    input.addEventListener('input', renderGroupMembersList);

    const list = document.createElement('ul');
    list.id = 'group-members-list';

    const empty = document.createElement('p');
    empty.id = 'group-members-empty';
    empty.classList.add('search-no-results', 'hidden');
    empty.textContent = 'ничего не найдено';

    inputWrap.appendChild(input);
    panel.appendChild(inputWrap);
    panel.appendChild(list);
    panel.appendChild(empty);
    DOM.groupManageStatus.before(panel);

    DOM.groupMembersListSearch = input;
    DOM.groupMembersList = list;
    DOM.groupMembersEmpty = empty;
}

async function loadGroupMembers() {
    if (!isGroupChat() || !AppState.selectedUser.chatId) return;
    ensureGroupMembersPanel();
    try {
        const response = await fetch(`/groups/${AppState.selectedUser.chatId}/members`, SAME_ORIGIN_FETCH);
        if (!response.ok) {
            setGroupManageStatus('Не удалось получить участников группы');
            return;
        }
        AppState.groupMembers = await response.json();
        syncSelectedGroupMemberCount();
        renderGroupMembersList();
    } catch (error) {
        console.error('Не удалось получить участников группы:', error);
        setGroupManageStatus('Не удалось получить участников группы');
    }
}

function renderGroupMembersList() {
    ensureGroupMembersPanel();
    if (!DOM.groupMembersList) return;
    const query = (DOM.groupMembersListSearch?.value || '').trim().toLowerCase();
    const isCreator = AppState.selectedUser.createdBy === User.username;
    const members = AppState.groupMembers.filter(user => {
        if (!query) return true;
        return String(user.username || '').toLowerCase().includes(query)
            || String(user.fullname || '').toLowerCase().includes(query);
    });

    DOM.groupMembersList.innerHTML = '';
    DOM.groupMembersEmpty?.classList.toggle('hidden', members.length > 0);

    members.forEach(user => {
        DOM.groupMembersList.appendChild(createGroupMemberListElement(user, isCreator));
    });
}

function createGroupMemberListElement(user, isCreator) {
    const item = document.createElement('li');
    item.classList.add('search-result-item', 'group-member-list-item');

    const avatar = document.createElement('span');
    avatar.classList.add('chat-avatar', 'r');
    avatar.textContent = user.fullname?.[0] || user.username?.[0] || '?';

    const label = document.createElement('span');
    label.classList.add('search-result-text');

    const fullname = document.createElement('span');
    fullname.classList.add('search-result-name');
    fullname.textContent = user.fullname || user.username;

    const username = document.createElement('span');
    username.classList.add('search-result-username');
    username.textContent = `@${user.username}`;

    label.appendChild(fullname);
    label.appendChild(username);
    item.appendChild(avatar);
    item.appendChild(label);
    item.addEventListener('click', () => openUserProfileModal(user));

    if (isCreator && user.username !== User.username) {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.classList.add('group-member-remove-button');
        removeButton.textContent = '×';
        removeButton.title = 'Удалить участника';
        removeButton.setAttribute('aria-label', `Удалить ${user.username}`);
        removeButton.addEventListener('click', async event => {
            event.stopPropagation();
            const ok = await sendGroupMemberRequest('DELETE', `/groups/${AppState.selectedUser.chatId}/members/${encodeURIComponent(user.username)}`);
            if (ok) {
                await loadGroupMembers();
            }
        });
        item.appendChild(removeButton);
    }

    return item;
}

function syncSelectedGroupMemberCount() {
    if (!isGroupChat()) return;
    AppState.selectedUser.memberCount = AppState.groupMembers.length;
    fillChatHeader(AppState.selectedUser);
    const chatElement = findChatElement(getChatSelector(AppState.selectedUser));
    if (chatElement?.chatData) {
        chatElement.chatData.memberCount = AppState.groupMembers.length;
    }
}

function openGroupMemberSearch(mode) {
    AppState.groupMemberMode = mode;
    setGroupManageStatus('введите не менее 3 символов');
    DOM.groupMemberSearch?.classList.remove('hidden');
    if (DOM.groupMemberSearchQuery) {
        DOM.groupMemberSearchQuery.value = '';
        DOM.groupMemberSearchQuery.placeholder = mode === 'add' ? 'поиск пользователя' : 'поиск участника';
    }
    renderGroupMemberSearchResults([]);
    requestAnimationFrame(() => DOM.groupMemberSearchQuery?.focus());
}

function closeGroupMemberSearch() {
    AppState.groupMemberMode = null;
    clearTimeout(AppState.groupMemberSearchTimer);
    DOM.groupMemberSearch?.classList.add('hidden');
    if (DOM.groupMemberSearchQuery) {
        DOM.groupMemberSearchQuery.value = '';
    }
    renderGroupMemberSearchResults([]);
}

function onGroupMemberSearchInput() {
    clearTimeout(AppState.groupMemberSearchTimer);
    AppState.groupMemberSearchTimer = setTimeout(searchGroupMembers, MESSAGE_SEARCH_DEBOUNCE_MS);
}

async function searchGroupMembers() {
    if (!AppState.groupMemberMode || !isGroupChat()) return;
    const query = DOM.groupMemberSearchQuery?.value.trim() || '';
    const requestId = ++AppState.groupMemberSearchRequestId;

    if (query.length <= MIN_SEARCH_LENGTH) {
        renderGroupMemberSearchResults([]);
        setGroupManageStatus('введите не менее 3 символов');
        return;
    }

    try {
        const users = AppState.groupMemberMode === 'add'
            ? await fetchUsersForGroupAdd(query)
            : await fetchUsersForGroupRemove(query);
        if (requestId !== AppState.groupMemberSearchRequestId) return;
        renderGroupMemberSearchResults(users);
        setGroupManageStatus(users.length === 0 ? 'ничего не найдено' : '');
    } catch (error) {
        console.error('Не удалось выполнить поиск пользователей группы:', error);
        if (requestId === AppState.groupMemberSearchRequestId) {
            renderGroupMemberSearchResults([]);
            setGroupManageStatus('Не удалось выполнить поиск');
        }
    }
}

async function fetchUsersForGroupAdd(query) {
    if (query.length <= MIN_SEARCH_LENGTH) {
        return [];
    }
    const [usersResponse, membersResponse] = await Promise.all([
        fetch(`/users/search?q=${encodeURIComponent(query)}`, SAME_ORIGIN_FETCH),
        fetch(`/groups/${AppState.selectedUser.chatId}/members`, SAME_ORIGIN_FETCH)
    ]);
    if (!usersResponse.ok || !membersResponse.ok) return [];
    const users = await usersResponse.json();
    const members = await membersResponse.json();
    const memberNames = new Set(members.map(user => user.username));
    return users.filter(user => !memberNames.has(user.username));
}

async function fetchUsersForGroupRemove(query) {
    const response = await fetch(`/groups/${AppState.selectedUser.chatId}/members`, SAME_ORIGIN_FETCH);
    if (!response.ok) return [];
    const users = await response.json();
    const normalizedQuery = query.toLowerCase();
    return users
        .filter(user => user.username !== User.username)
        .filter(user => {
            if (!normalizedQuery) return true;
            return String(user.username || '').toLowerCase().includes(normalizedQuery)
                || String(user.fullname || '').toLowerCase().includes(normalizedQuery);
        });
}

function renderGroupMemberSearchResults(users) {
    if (!DOM.groupMemberSearchList) return;
    DOM.groupMemberSearchList.innerHTML = '';
    users.forEach(user => {
        const item = createGroupMemberSearchResultElement(user);
        DOM.groupMemberSearchList.appendChild(item);
    });
}

function createGroupMemberSearchResultElement(user) {
    const element = document.createElement('li');
    element.classList.add('search-result-item');

    const avatar = document.createElement('span');
    avatar.classList.add('chat-avatar', 'r');
    avatar.textContent = user.fullname?.[0] || user.username?.[0] || '?';

    const label = document.createElement('span');
    label.classList.add('search-result-text');

    const fullname = document.createElement('span');
    fullname.classList.add('search-result-name');
    fullname.textContent = user.fullname || user.username;

    const username = document.createElement('span');
    username.classList.add('search-result-username');
    username.textContent = `@${user.username}`;

    label.appendChild(fullname);
    label.appendChild(username);
    element.appendChild(avatar);
    element.appendChild(label);
    element.addEventListener('click', () => selectGroupMember(user));
    return element;
}

async function selectGroupMember(user) {
    if (!AppState.groupMemberMode || !user?.username) return;
    const ok = AppState.groupMemberMode === 'add'
        ? await sendGroupMemberRequest('POST', `/groups/${AppState.selectedUser.chatId}/members`, {username: user.username})
        : await sendGroupMemberRequest('DELETE', `/groups/${AppState.selectedUser.chatId}/members/${encodeURIComponent(user.username)}`);
    if (ok) {
        closeGroupMemberSearch();
        await loadGroupMembers();
    }
}

async function addGroupMember() {
    openGroupMemberSearch('add');
}

async function removeGroupMember() {
    openGroupMemberSearch('remove');
}

async function leaveCurrentGroup() {
    if (!isGroupChat()) return;
    const ok = await sendGroupMemberRequest('DELETE', `/groups/${AppState.selectedUser.chatId}/leave`);
    if (!ok) return;
    findChatElement(getChatSelector(AppState.selectedUser))?.remove();
    closeGroupManageModal();
    hideChatArea();
}

async function sendGroupMemberRequest(method, url, body = null) {
    try {
        const response = await fetch(url, {
            method,
            ...SAME_ORIGIN_FETCH,
            headers: body ? jsonFetchHeaders() : jsonFetchHeadersForEmptyBody(),
            body: body ? JSON.stringify(body) : undefined
        });
        if (!response.ok) {
            setGroupManageStatus('Операция недоступна');
            return false;
        }
        const changed = response.status === 204 ? true : await response.json();
        setGroupManageStatus('Готово');
        return changed !== false;
    } catch (error) {
        console.error('Не удалось выполнить операцию с группой:', error);
        setGroupManageStatus('Операция недоступна');
        return false;
    }
}


// ============================================
// ВЫБОР ЧАТА
// ============================================

function onChatItemClick(event) {
    const chatElement = event.currentTarget;
    const chatData = chatElement.chatData;
    const selector = getChatSelector(chatData);

    // Клик на уже открытый чат — закрываем
    if (selector === getChatSelector(AppState.selectedUser) && hasChatWith(selector)) {
        hideChatArea();
        return;
    }

    setSelectedUser(chatData);
    hideSearchArea();

    fillChatHeader(chatData);
    showChatArea();
    setItemActive(chatElement, '.chat-item.active');

    displayChatMessages(chatData).then(() => {
            const notificationMarker = chatElement.querySelector('.notificationMarker');
            if (notificationMarker.textContent !== 0 && notificationMarker.textContent !== '')
                loadUnreadMessagesCount(chatElement, getChatSelector(AppState.selectedUser));
        }
    );
}

function openNewChat(chatElement) {
    const chatData = chatElement.chatData;

    if (getChatSelector(chatData) === getChatSelector(AppState.selectedUser)) {
        hideChatArea();
        return;
    }

    setItemActive(chatElement, '.chat-item.active');
    setSelectedUser(chatData);
    fillChatHeader(chatData);
    showChatArea();
    resetMessagesState();
    showEmptyChatMessage();
}

function hasChatWith(selector) {
    return Array.from(DOM.chatsList.children).some(el => el.dataset.chatSelector === selector);
}

// ============================================
// ШАПКА ЧАТА
// ============================================

function fillChatHeader(chatData) {
    const header = DOM.chatHeaderInfo;

    // Удаляем старую кнопку "назад" если есть
    const oldBackBtn = header.querySelector('.mobile-back-btn');
    if (oldBackBtn) oldBackBtn.remove();

    // Добавляем кнопку "назад" на мобильных
    if (isMobile()) {
        const backBtn = document.createElement('button');
        backBtn.className = 'mobile-back-btn';
        backBtn.type = 'button';
        backBtn.setAttribute('aria-label', 'Назад к списку чатов');
        backBtn.textContent = '←';
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideChatArea();
        });
        header.insertBefore(backBtn, header.firstChild);
    }
    // === КОНЕЦ БЛОКА ===

    header.querySelector('#chat-header-username').textContent = chatData.fullname || chatData.username;
    header.querySelector('#chat-header-status').textContent = isGroupChat(chatData)
        ? formatGroupMembersCount(chatData.memberCount)
        : String(chatData.status || '').toLowerCase();
    header.querySelector('.chat-avatar').textContent = chatData.fullname?.[0] || chatData.username?.[0] || '?';
    header.classList.toggle('online', !isGroupChat(chatData) && chatData.status === 'ONLINE');
    DOM.groupManageButton?.classList.toggle('hidden', !isGroupChat(chatData));
}

// ============================================
// СООБЩЕНИЯ
// ============================================

async function displayChatMessages(chatData) {
    resetMessagesState();
    await loadChatMessagesPage(getChatSelector(chatData), true);
    scrollToBottom(DOM.chatMessagesArea);
}

function resetMessagesState() {
    AppState.pagination.page = 0;
    AppState.pagination.newestPage = 0;
    AppState.pagination.isFirstPage = true;
    AppState.pagination.isLastPage = false;
    AppState.chatTailDayKey = null;
    DOM.chatMessagesArea.innerHTML = '';
}

function formatGroupMembersCount(memberCount) {
    return `число участников: ${memberCount || 1}`;
}

async function loadChatMessagesPage(chatUsername, isReset) {
    const {pagination} = AppState;

    if (pagination.isLoading || !chatUsername) return;

    pagination.isLoading = true;

    try {
        const pageToLoad = isReset ? 0 : pagination.page + 1;
        const url = `/messages/page/${User.username}/${chatUsername}?page=${pageToLoad}&size=${MESSAGES_PAGE_SIZE}`;
        const response = await fetch(url, SAME_ORIGIN_FETCH);

        if (!response.ok) {
            console.error('Не удалось получить сообщения чата');
            return;
        }

        const pageJson = await response.json();
        const messages = Array.isArray(pageJson) ? pageJson : (pageJson.content || []);

        if (isReset) {
            DOM.chatMessagesArea.innerHTML = '';
        }

        if (messages.length === 0) {
            if (isReset) showEmptyChatMessage();
            pagination.isLastPage = true;
            return;
        }

        DOM.emptyChatInfoMessage.classList.add('hidden');

        const reversedMessages = messages.slice().reverse();

        if (isReset) {
            reversedMessages.forEach(addMessage);
        } else {
            prependMessages(reversedMessages);
        }

        pagination.page = pageToLoad;
        if (isReset) {
            pagination.newestPage = pageToLoad;
            pagination.isFirstPage = pageJson.first ?? pageToLoad === 0;
        }
        pagination.isLastPage = pageJson.last ?? messages.length < MESSAGES_PAGE_SIZE;

    } finally {
        pagination.isLoading = false;
    }
}

async function loadNewerChatMessagesPage(chatUsername) {
    const {pagination} = AppState;

    if (pagination.isLoading || pagination.isFirstPage || !chatUsername) return;

    pagination.isLoading = true;

    try {
        const pageToLoad = pagination.newestPage - 1;
        const url = `/messages/page/${User.username}/${chatUsername}?page=${pageToLoad}&size=${MESSAGES_PAGE_SIZE}`;
        const response = await fetch(url, SAME_ORIGIN_FETCH);

        if (!response.ok) {
            console.error('Не удалось получить новые сообщения чата');
            return;
        }

        const pageJson = await response.json();
        const messages = Array.isArray(pageJson) ? pageJson : (pageJson.content || []);

        if (messages.length === 0) {
            pagination.isFirstPage = true;
            return;
        }

        DOM.emptyChatInfoMessage.classList.add('hidden');
        appendMessages(messages.slice().reverse());
        pagination.newestPage = pageToLoad;
        pagination.isFirstPage = pageJson.first ?? pageToLoad === 0;
    } finally {
        pagination.isLoading = false;
    }
}

async function loadChatPageAroundMessage(messageId) {
    const {pagination, selectedUser} = AppState;

    if (pagination.isLoading || !getChatSelector(selectedUser)) return;

    pagination.isLoading = true;

    try {
        const url = `/messages/page-around/${User.username}/${getChatSelector(selectedUser)}/${messageId}?size=${MESSAGES_PAGE_SIZE}`;
        const response = await fetch(url, SAME_ORIGIN_FETCH);

        if (!response.ok) {
            console.error('Не удалось получить страницу с найденным сообщением');
            return;
        }

        const pageJson = await response.json();
        const messages = Array.isArray(pageJson) ? pageJson : (pageJson.content || []);

        resetMessagesState();
        if (messages.length === 0) {
            showEmptyChatMessage();
            return;
        }

        DOM.emptyChatInfoMessage.classList.add('hidden');
        messages.slice().reverse().forEach(addMessage);

        const pageNumber = pageJson.number ?? 0;
        pagination.page = pageNumber;
        pagination.newestPage = pageNumber;
        pagination.isFirstPage = pageJson.first ?? pageNumber === 0;
        pagination.isLastPage = pageJson.last ?? messages.length < MESSAGES_PAGE_SIZE;
    } finally {
        pagination.isLoading = false;
    }
}

function peerDayKeyStartingFrom(node) {
    let n = node;
    while (n) {
        if (n.nodeType !== Node.ELEMENT_NODE) {
            n = n.nextSibling;
            continue;
        }
        if (n.classList?.contains('message-day-divider')) {
            n = n.nextSibling;
            continue;
        }
        if (n.dataset?.dayKey) {
            return n.dataset.dayKey;
        }
        n = n.nextSibling;
    }
    return null;
}

function prependMessages(messages) {
    const oldScrollHeight = DOM.chatMessagesArea.scrollHeight;

    const reversed = messages.slice().reverse();
    let anchor = DOM.chatMessagesArea.firstChild;

    for (const message of reversed) {
        const msgDay = calendarDayKey(message.dateCreated);
        const belowDay = peerDayKeyStartingFrom(anchor);

        if (belowDay !== null && msgDay !== belowDay) {
            const divider = createDayDividerElement(formatDayDividerLabel(message.dateCreated));
            DOM.chatMessagesArea.insertBefore(divider, anchor);
        }

        const el = createMessageElement(message);
        DOM.chatMessagesArea.insertBefore(el, anchor);
        anchor = el;
    }

    DOM.chatMessagesArea.scrollTop = DOM.chatMessagesArea.scrollHeight - oldScrollHeight;
}

function appendMessages(messages) {
    messages.forEach(appendMessageElement);
}

function createMessageElement(messageData) {
    const container = document.createElement('div');
    container.classList.add('chat-message-row');
    container.dataset.dayKey = calendarDayKey(messageData.dateCreated);
    const messageId = messageData.message_id ?? messageData.messageId;
    if (messageId != null) {
        container.dataset.messageId = String(messageId);
    }

    const isSender = messageData.senderId === User.username;
    const type = isSender ? 'sender' : 'receiver';

    const row = document.createElement('div');
    row.classList.add('message', type);
    const contentBox = document.createElement('div');
    contentBox.classList.add('message-content', type);
    if (!isSender && isGroupChat()) {
        const senderSpan = document.createElement('span');
        senderSpan.classList.add('message-sender');
        senderSpan.textContent = messageData.senderId || '';
        contentBox.appendChild(senderSpan);
    }
    const textSpan = document.createElement('span');
    textSpan.textContent = messageData.content ?? '';
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('time');
    timeSpan.textContent = formatTime(messageData.dateCreated);
    contentBox.appendChild(textSpan);
    contentBox.appendChild(timeSpan);
    row.appendChild(contentBox);
    container.appendChild(row);

    return container;
}

function addMessage(messageData) {
    DOM.emptyChatInfoMessage.classList.add('hidden');
    appendMessageElement(messageData);
    scrollToBottom(DOM.chatMessagesArea);
}

function appendMessageElement(messageData) {
    const dayKey = calendarDayKey(messageData.dateCreated);
    if (AppState.chatTailDayKey !== dayKey) {
        DOM.chatMessagesArea.appendChild(createDayDividerElement(formatDayDividerLabel(messageData.dateCreated)));
        AppState.chatTailDayKey = dayKey;
    }
    DOM.chatMessagesArea.appendChild(createMessageElement(messageData));
}

async function sendMessage(event) {
    event?.preventDefault?.();

    const content = DOM.messageInput.value.trim();
    const {selectedUser, stompClient} = AppState;

    if (content.length > AppState.maxMessageLength) return;

    const selector = getChatSelector(selectedUser);

    if (!content || !stompClient || !selector) return;

    const message = {
        senderId: User.username,
        recipientId: selector,
        content,
        dateCreated: new Date(),
        read: false
    };

    stompClient.send("/app/chat", {}, JSON.stringify(message));
    DOM.messageInput.value = '';
    syncMessageComposerState();
    DOM.emptyChatInfoMessage.classList.add('hidden');

    let chatElement = findChatElement(selector);

    if (!chatElement && !isGroupChat(selectedUser)) {
        hideSearchArea();
        await fetchAndAppendNewUser(message.recipientId, message);
        chatElement = findChatElement(message.recipientId);
    } else if (chatElement) {
        updateChatPreview(chatElement, message);
        moveChatToTop(chatElement);
    }

    if (chatElement?.chatData) {
        chatElement.chatData.hasChat = true;
    }

    addMessage(message);
}

async function onMessageReceived(payload) {
    const message = JSON.parse(payload.body);
    const senderId = message.senderId;
    const chatSelector = String(message.recipientId || '').startsWith('chat-') ? message.recipientId : senderId;

    let chatElement = findChatElement(chatSelector);

    if (chatElement) {
        // Если это не активный чат — показываем уведомление
        if (getChatSelector(AppState.selectedUser) !== chatSelector) {
            const markerTextContent = chatElement.querySelector('.notificationMarker').textContent;
            const unreadMessagesCount = !markerTextContent ? 0 : parseInt(markerTextContent);
            updateChatNotificationMarker(chatElement, unreadMessagesCount + 1)

            const senderName = chatElement.chatData?.fullname || senderId;
            notifyNewMessage(senderName, message.content, senderName[0]);
        } else {
            addMessage(message);
            resetUnreadCount();
            markMessageReadOnServer(message)
                .then(() => loadUnreadMessagesCount(chatElement, chatSelector))
                .catch(() => {
                });
        }
        updateChatPreview(chatElement, message);
        moveChatToTop(chatElement);
    } else {
        if (String(chatSelector).startsWith('chat-')) {
            await fetchAndShowChats();
            chatElement = findChatElement(chatSelector);
            if (chatElement) updateChatPreview(chatElement, message);
        } else {
            await fetchAndAppendNewUser(senderId, message);
        }

        const newChat = findChatElement(chatSelector);
        const senderName = newChat?.chatData?.fullname || senderId;

        const dialogOpenWithSender =
            getChatSelector(AppState.selectedUser) === chatSelector
            && !DOM.chatArea.classList.contains('hidden');

        if (dialogOpenWithSender) {
            DOM.emptyChatInfoMessage.classList.add('hidden');
            addMessage(message);
            resetUnreadCount();
            markMessageReadOnServer(message)
                .then(() => newChat && loadUnreadMessagesCount(newChat, chatSelector))
                .catch(() => {
                });
        } else {
            notifyNewMessage(senderName, message.content, senderName[0]);
        }
    }
}

function onMessagesScroll() {
    const {scrollTop, scrollHeight, clientHeight} = DOM.chatMessagesArea;
    const {isLoading, isLastPage, isFirstPage} = AppState.pagination;
    const selector = getChatSelector(AppState.selectedUser);
    const isNearTop = scrollTop <= SCROLL_THRESHOLD_PX;
    const isNearBottom = scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD_PX;

    if (isNearTop && !isLoading && !isLastPage && selector) {
        loadChatMessagesPage(selector, false);
        return;
    }

    if (isNearBottom && !isLoading && !isFirstPage && selector) {
        loadNewerChatMessagesPage(selector);
    }
}

// ============================================
// СТАТУСЫ ПОЛЬЗОВАТЕЛЕЙ
// ============================================

function onUserStatusUpdate(payload) {
    const user = JSON.parse(payload.body);
    const chatElement = findChatElement(user.username);

    // Обновляем в списке чатов
    if (chatElement) {
        updateStatusIndicator(chatElement, user.status);
        chatElement.chatData.status = user.status;
    }

    // Обновляем в шапке, если это выбранный пользователь
    if (AppState.selectedUser.username === user.username) {
        AppState.selectedUser.status = user.status;
        DOM.chatHeaderInfo.classList.toggle('online', user.status === 'ONLINE');
        DOM.chatHeaderInfo.querySelector('#chat-header-status').textContent = user.status.toLowerCase();
    }
}

function updateStatusIndicator(element, status) {
    const indicator = element.querySelector('.online-indicator');
    indicator.classList.toggle('hidden', status !== 'ONLINE');
}

// ============================================
// УПРАВЛЕНИЕ ВЫБРАННЫМ ПОЛЬЗОВАТЕЛЕМ
// ============================================

function setSelectedUser(chatData) {
    AppState.selectedUser = normalizeChatData(chatData);
}

function resetSelectedUser() {
    AppState.selectedUser = {
        username: null,
        fullname: null,
        status: null,
        type: 'DIRECT',
        selector: null,
        chatId: null,
        createdBy: null
    };
}

// ============================================
// UI ХЕЛПЕРЫ
// ============================================

function clearSelection(selector) {
    document.querySelectorAll(selector).forEach(item => {
        item.classList.remove('active');
    });
}

function setItemActive(element, clearSelector) {
    clearSelection(clearSelector);
    element.classList.add('active');
}

function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
}

function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

function normalizeChatData(chatData) {
    const type = chatData.type || 'DIRECT';
    if (type === 'GROUP') {
        return {
            ...chatData,
            type,
            selector: chatData.selector || `chat-${chatData.chatId}`,
            fullname: chatData.name || chatData.fullname || 'Группа',
            status: null
        };
    }
    return {
        ...chatData,
        type,
        selector: chatData.selector || chatData.username,
        fullname: chatData.fullname || chatData.name || chatData.username,
    };
}

function getChatSelector(chatData) {
    return chatData?.selector || chatData?.username;
}

function getChatDomId(selector) {
    return `chat-item-${String(selector || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function findChatElement(selector) {
    return Array.from(DOM.chatsList.children)
        .find(el => el.dataset.chatSelector === selector) || null;
}

function isGroupChat(chatData = AppState.selectedUser) {
    return chatData?.type === 'GROUP';
}

// ============================================
// ФОРМАТИРОВАНИЕ
// ============================================

function formatDateTimeForChat(dateTimeString) {
    const date = new Date(dateTimeString);
    const pad = num => String(num).padStart(2, '0');

    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const dateStr = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`;

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === now.toDateString()) {
        return time;
    }
    if (date.toDateString() === yesterday.toDateString()) {
        return 'вчера';
    }

    return `${dateStr}`;
}

function formatTime(dateTimeString) {
    const date = new Date(dateTimeString);
    const pad = num => String(num).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMessageSearchDate(dateTimeString) {
    return `${formatDayDividerLabel(dateTimeString)} ${formatTime(dateTimeString)}`;
}

// Локальный календарный день для группировки YYYY-MM-DD
function calendarDayKey(dateTimeString) {
    const date = new Date(dateTimeString);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDayDividerLabel(dateTimeString) {
    const date = new Date(dateTimeString);
    const pad = num => String(num).padStart(2, '0');
    const dateStr = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === now.toDateString()) {
        return 'сегодня';
    }
    if (date.toDateString() === yesterday.toDateString()) {
        return 'вчера';
    }
    return dateStr;
}

function createDayDividerElement(labelText) {
    const wrap = document.createElement('div');
    wrap.className = 'message-day-divider';
    wrap.setAttribute('role', 'presentation');
    const pill = document.createElement('span');
    pill.className = 'message-day-divider-label r';
    pill.textContent = labelText;
    wrap.appendChild(pill);
    return wrap;
}

// ============================================
// ДРУГИЕ ДЕЙСТВИЯ
// ============================================

function showCurrentUserProfile() {
    openUserProfileModal({
        username: User.username,
        fullname: User.fullname,
        status: User.status
    });
}

function showSelectedUserProfile() {
    if (isGroupChat(AppState.selectedUser)) {
        openGroupManageModal();
        return;
    }
    if (!AppState.selectedUser.username) return;
    openUserProfileModal(AppState.selectedUser);
}

function openUserProfileModal(user) {
    if (!DOM.userProfileModal) return;

    const fullname = user.fullname || user.username || '';
    const username = user.username || '';
    const status = user.status || 'UNKNOWN';

    DOM.userProfileAvatar.textContent = fullname?.[0] || username?.[0] || '?';
    DOM.userProfileTitle.textContent = fullname;
    DOM.userProfileUsername.textContent = username ? `@${username}` : '';
    DOM.userProfileStatus.textContent = formatUserStatus(status);

    DOM.userProfileModal.classList.remove('hidden');
    DOM.userProfileModal.setAttribute('aria-hidden', 'false');
}

function closeUserProfileModal() {
    if (!DOM.userProfileModal) return;
    DOM.userProfileModal.classList.add('hidden');
    DOM.userProfileModal.setAttribute('aria-hidden', 'true');
}

function formatUserStatus(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'ONLINE') return 'online';
    if (normalized === 'OFFLINE') return 'offline';
    return normalized.toLowerCase() || 'unknown';
}

function onLogout() {
    User.status = 'OFFLINE';
    window.location.assign('/logout');
}

function onWindowResize() {
    updateAppHeightVar();

    // Если перешли с мобильного на десктоп — убираем класс
    if (!isMobile()) {
        document.body.classList.remove('mobile-chat-open');

        // Убираем кнопку "назад" если она есть
        const backBtn = DOM.chatHeaderInfo.querySelector('.mobile-back-btn');
        if (backBtn) backBtn.remove();
    } else {
        // Если чат открыт и перешли на мобильный — добавляем класс
        if (!DOM.chatArea.classList.contains('hidden')) {
            document.body.classList.add('mobile-chat-open');

            // Добавляем кнопку "назад" если её нет
            if (!DOM.chatHeaderInfo.querySelector('.mobile-back-btn')) {
                const backBtn = document.createElement('button');
                backBtn.className = 'mobile-back-btn';
                backBtn.type = 'button';
                backBtn.setAttribute('aria-label', 'Назад к списку чатов');
                backBtn.textContent = '←';
                backBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideChatArea();
                });
                DOM.chatHeaderInfo.insertBefore(backBtn, DOM.chatHeaderInfo.firstChild);
            }
        }
    }

    syncMessageComposerState();
}

// ============================================
// ЗАПУСК
// ============================================

updateAppHeightVar();
initCurrentUser();


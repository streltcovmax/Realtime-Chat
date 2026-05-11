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
        fullname: null
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
    if (id == null || message.recipientId !== User.username) {
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
            if (DOM.messageSearchModal && !DOM.messageSearchModal.classList.contains('hidden')) {
                closeMessageSearchModal();
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
    const peer = AppState.selectedUser.username;
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

    if (query.length <= MIN_SEARCH_LENGTH) {
        hideSearchResults();
        return;
    }

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
    DOM.searchNoResults.classList.add('hidden');
}

function onSearchResults(payload) {
    const foundUsers = JSON.parse(payload.body)
        .filter(user => user.username !== User.username);

    DOM.foundUsersList.innerHTML = '';
    showSearchResults();

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
    avatar.textContent = user.fullname?.[0] || '?';

    const label = document.createElement('span');
    label.textContent = ` ${user.fullname || user.username} (@${user.username})`;

    element.appendChild(avatar);
    element.appendChild(label);
    element.addEventListener('click', () => onSearchResultClick(element, user));
    return element;
}

function onSearchResultClick(element, user) {
    setItemActive(element, '.search-result-item.active');

    const existingChat = document.querySelector(`#${user.username}`);
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
        const users = await response.json();

        DOM.chatsList.innerHTML = '';

        users
            .filter(user => user.username !== User.username)
            .forEach(user => appendChatToList(user));
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

function moveChatToTop(chatElement) {
    if (!chatElement || chatElement.parentElement !== DOM.chatsList) return;
    DOM.chatsList.prepend(chatElement);
}

function appendChatToList(chatData, prependToList = false) {
    const listItem = document.createElement('li');
    listItem.classList.add('chat-item');
    listItem.id = chatData.username;
    listItem.chatData = {...chatData};

    const chatInfo = document.createElement('div');
    chatInfo.classList.add('chat-info');
    const avatarWrap = document.createElement('div');
    avatarWrap.classList.add('chat-avatar', 'r');
    avatarWrap.appendChild(document.createTextNode(chatData.fullname?.[0] || '?'));
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

    loadLastMessage(listItem, chatData.username);
    loadUnreadMessagesCount(listItem, chatData.username)
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
    let chatElement = document.querySelector(`#${targetUsername}`);

    if (chatElement) {
        if (message) updateChatPreview(chatElement, message);
        moveChatToTop(chatElement);
        return;
    }

    try {
        const response = await fetch(`/users/${targetUsername}`, SAME_ORIGIN_FETCH);
        const user = await response.json();
        appendChatToList(user, true);

        chatElement = document.querySelector(`#${targetUsername}`);
        if (!chatElement) {
            console.error('Ошибка добавления нового чата');
            return;
        }

        if (message) updateChatPreview(chatElement, message);

        if (AppState.selectedUser.username === targetUsername) {
            setItemActive(chatElement, '.chat-item.active');
        }
    } catch (error) {
        console.error('Ошибка получения данных пользователя:', error);
    }
}

function updateChatPreview(chatElement, message) {
    chatElement.querySelector('.chat-message').textContent = message.content;
    chatElement.querySelector('.datetime').textContent = formatDateTimeForChat(message.dateCreated);
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

// ============================================
// ВЫБОР ЧАТА
// ============================================

function onChatItemClick(event) {
    const chatElement = event.currentTarget;
    const chatData = chatElement.chatData;

    // Клик на уже открытый чат — закрываем
    if (chatData.username === AppState.selectedUser.username && hasChatWith(chatData.username)) {
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
                loadUnreadMessagesCount(chatElement, AppState.selectedUser.username);
        }
    );
}

function openNewChat(chatElement) {
    const chatData = chatElement.chatData;

    if (chatData.username === AppState.selectedUser.username) {
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

function hasChatWith(username) {
    return Array.from(DOM.chatsList.children).some(el => el.id === username);
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
        backBtn.innerHTML = '←';
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideChatArea();
        });
        header.insertBefore(backBtn, header.firstChild);
    }
    // === КОНЕЦ БЛОКА ===

    header.querySelector('#chat-header-username').textContent = chatData.username;
    header.querySelector('#chat-header-status').textContent = chatData.status.toLowerCase();
    header.querySelector('.chat-avatar').textContent = chatData.fullname[0];
    header.classList.toggle('online', chatData.status === 'ONLINE');
}

// ============================================
// СООБЩЕНИЯ
// ============================================

async function displayChatMessages(chatData) {
    resetMessagesState();
    await loadChatMessagesPage(chatData.username, true);
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

    if (pagination.isLoading || !selectedUser.username) return;

    pagination.isLoading = true;

    try {
        const url = `/messages/page-around/${User.username}/${selectedUser.username}/${messageId}?size=${MESSAGES_PAGE_SIZE}`;
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

    if (!content || !stompClient || !selectedUser.username) return;

    const message = {
        senderId: User.username,
        recipientId: selectedUser.username,
        content,
        dateCreated: new Date(),
        read: false
    };

    stompClient.send("/app/chat", {}, JSON.stringify(message));
    DOM.messageInput.value = '';
    syncMessageComposerState();
    DOM.emptyChatInfoMessage.classList.add('hidden');

    let chatElement = document.querySelector(`#${message.recipientId}`);

    if (!chatElement) {
        hideSearchArea();
        await fetchAndAppendNewUser(message.recipientId, message);
        chatElement = document.querySelector(`#${message.recipientId}`);
    } else {
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

    let chatElement = document.querySelector(`#${senderId}`);

    if (chatElement) {
        // Если это не активный чат — показываем уведомление
        if (AppState.selectedUser.username !== senderId) {
            const markerTextContent = chatElement.querySelector('.notificationMarker').textContent;
            const unreadMessagesCount = !markerTextContent ? 0 : parseInt(markerTextContent);
            updateChatNotificationMarker(chatElement, unreadMessagesCount + 1)

            const senderName = chatElement.chatData?.fullname || senderId;
            notifyNewMessage(senderName, message.content, senderName[0]);
        } else {
            addMessage(message);
            resetUnreadCount();
            markMessageReadOnServer(message)
                .then(() => loadUnreadMessagesCount(chatElement, senderId))
                .catch(() => {
                });
        }
        updateChatPreview(chatElement, message);
        moveChatToTop(chatElement);
    } else {
        await fetchAndAppendNewUser(senderId, message);

        const newChat = document.querySelector(`#${senderId}`);
        const senderName = newChat?.chatData?.fullname || senderId;

        const dialogOpenWithSender =
            AppState.selectedUser.username === senderId
            && !DOM.chatArea.classList.contains('hidden');

        if (dialogOpenWithSender) {
            DOM.emptyChatInfoMessage.classList.add('hidden');
            addMessage(message);
            resetUnreadCount();
            markMessageReadOnServer(message)
                .then(() => newChat && loadUnreadMessagesCount(newChat, senderId))
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
    const {username} = AppState.selectedUser;
    const isNearTop = scrollTop <= SCROLL_THRESHOLD_PX;
    const isNearBottom = scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD_PX;

    if (isNearTop && !isLoading && !isLastPage && username) {
        loadChatMessagesPage(username, false);
        return;
    }

    if (isNearBottom && !isLoading && !isFirstPage && username) {
        loadNewerChatMessagesPage(username);
    }
}

// ============================================
// СТАТУСЫ ПОЛЬЗОВАТЕЛЕЙ
// ============================================

function onUserStatusUpdate(payload) {
    const user = JSON.parse(payload.body);
    const chatElement = document.querySelector(`#${user.username}`);

    // Обновляем в списке чатов
    if (chatElement) {
        updateStatusIndicator(chatElement, user.status);
        chatElement.chatData.status = user.status;
    }

    // Обновляем в шапке, если это выбранный пользователь
    if (AppState.selectedUser.username === user.username) {
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
    AppState.selectedUser.username = chatData.username;
    AppState.selectedUser.fullname = chatData.fullname;
}

function resetSelectedUser() {
    AppState.selectedUser = {username: null, fullname: null};
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
    // TODO: Реализовать просмотр профиля
    console.log("Просмотр профиля пользователя");
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
                backBtn.innerHTML = '←';
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
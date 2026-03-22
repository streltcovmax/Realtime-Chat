'use strict';

import { User } from "./user.js";

// ============================================
// КОНСТАНТЫ
// ============================================

const MESSAGES_PAGE_SIZE = 50;
const SCROLL_THRESHOLD_PX = 250;
const MIN_SEARCH_LENGTH = 2;
const MOBILE_BREAKPOINT = 600;

// ============================================
// DOM ЭЛЕМЕНТЫ (сгруппированы по назначению)
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
};

// ============================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================

const AppState = {
    stompClient: null,
    selectedUser: {
        username: null,
        fullname: null
    },
    pagination: {
        page: 0,
        isLastPage: false,
        isLoading: false,
    }
};

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

function initCurrentUser() {
    fetch("/user.getCurrent")
        .then(response => {
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
        headers: { 'Content-Type': 'application/json' },
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
    setEventListeners();
    fetchAndShowChats();
}

function setEventListeners() {
    window.addEventListener('resize', onWindowResize);
    // Кнопки
    document.querySelector('#this-profile-button').addEventListener('click', showCurrentUserProfile);
    document.querySelector('#logout-button').addEventListener('click', onLogout);
    document.querySelector('#send-message-button').addEventListener('click', sendMessage);

    // Поиск
    DOM.searchInput.addEventListener('input', onSearchInput);
    DOM.searchClearBtn.addEventListener('click', clearSearch);

    // Скролл сообщений (подгрузка истории)
    DOM.chatMessagesArea.addEventListener('scroll', onMessagesScroll);

    // Закрытие по Escape
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            hideChatArea();
            hideSearchArea();
        }
    });
}

// ============================================
// WEBSOCKET
// ============================================

function connectWS() {
    const socket = new SockJS('/ws');
    AppState.stompClient = Stomp.over(socket);
    AppState.stompClient.connect({}, onConnected, onWSError);
}

function onWSError(error) {
    console.error('WebSocket connection error:', error);
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
    DOM.chatMessagesArea.innerHTML = '';
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
    element.innerHTML = `
        <span class="chat-avatar r">${user.fullname?.[0] || '?'}</span> 
        ${user.fullname || user.username} (@${user.username})
    `;
    element.addEventListener('click', () => onSearchResultClick(element, user));
    return element;
}

function onSearchResultClick(element, user) {
    setItemActive(element, '.search-result-item.active');

    const existingChat = document.querySelector(`#${user.username}`);
    if (existingChat) {
        existingChat.dispatchEvent(new Event('click', { bubbles: true }));
    } else {
        openNewChat(element);
    }
}

// ============================================
// СПИСОК ЧАТОВ
// ============================================

async function fetchAndShowChats() {
    try {
        const response = await fetch('/chats');
        const users = await response.json();

        DOM.chatsList.innerHTML = '';

        users
            .filter(user => user.username !== User.username)
            .forEach(user => appendChatToList(user));
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

function appendChatToList(chatData, hasExistingChat = true) {
    const listItem = document.createElement('li');
    listItem.classList.add('chat-item');
    listItem.id = chatData.username;
    listItem.chatData = { ...chatData, hasChat: hasExistingChat };

    listItem.innerHTML = `
        <div class="chat-info">
            <div class="chat-avatar r">${chatData.fullname[0]}
                <span class="online-indicator hidden"></span>
            </div>
        </div>
        <div class="chat-text">
            <span class="chat-name">${chatData.fullname}</span>
            <span class="chat-message"> </span>
        </div>
        <div class="chat-nums">
            <span class="datetime"></span>
            <span class="notificationMarker r hidden"></span>
        </div>
    `;

    updateStatusIndicator(listItem, chatData.status);
    listItem.addEventListener('click', onChatItemClick);
    DOM.chatsList.appendChild(listItem);

    // Загружаем последнее сообщение асинхронно
    loadLastMessage(listItem, chatData.username);
}

async function loadLastMessage(chatElement, targetUsername) {
    try {
        const response = await fetch(`/messages/last/${User.username}/${targetUsername}`);
        if (!response.ok || response.status === 204) return;

        const message = await response.json();
        if (message) {
            updateChatPreview(chatElement, message);
            chatElement.chatData.hasChat = true;
        }
    } catch (error) {
        console.error('Не удалось получить последнее сообщение:', error);
    }
}

async function fetchAndAppendNewUser(targetUsername, message) {
    let chatElement = document.querySelector(`#${targetUsername}`);

    if (chatElement) {
        if (message) updateChatPreview(chatElement, message);
        return;
    }

    try {
        const response = await fetch(`/users/${targetUsername}`);
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
    chatElement.querySelector('.datetime').textContent = formatDateTime(message.dateCreated);
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

    // Скрываем маркер уведомлений
    const notificationMarker = chatElement.querySelector('.notificationMarker');
    notificationMarker.classList.add('hidden');
    notificationMarker.textContent = '0';

    fillChatHeader(chatData);
    showChatArea();
    setItemActive(chatElement, '.chat-item.active');

    displayChatMessages(chatData);
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
    AppState.pagination.isLastPage = false;
    DOM.chatMessagesArea.innerHTML = '';
}

async function loadChatMessagesPage(chatUsername, isReset) {
    const { pagination } = AppState;

    if (pagination.isLoading || !chatUsername) return;

    pagination.isLoading = true;

    try {
        const pageToLoad = isReset ? 0 : pagination.page + 1;
        const url = `/messages/page/${User.username}/${chatUsername}?page=${pageToLoad}&size=${MESSAGES_PAGE_SIZE}`;
        const response = await fetch(url);

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
        pagination.isLastPage = pageJson.last ?? messages.length < MESSAGES_PAGE_SIZE;

    } finally {
        pagination.isLoading = false;
    }
}

function prependMessages(messages) {
    const oldScrollHeight = DOM.chatMessagesArea.scrollHeight;
    const fragment = document.createDocumentFragment();

    messages.forEach(message => {
        fragment.appendChild(createMessageElement(message));
    });

    DOM.chatMessagesArea.insertBefore(fragment, DOM.chatMessagesArea.firstChild);
    DOM.chatMessagesArea.scrollTop = DOM.chatMessagesArea.scrollHeight - oldScrollHeight;
}

function createMessageElement(messageData) {
    const container = document.createElement('div');
    const isSender = messageData.senderId === User.username;
    const type = isSender ? 'sender' : 'receiver';

    container.innerHTML = `
        <div class="message ${type}">
            <div class="message-content ${type}">
                <span>${messageData.content}</span>
                <span class="time">${formatTime(messageData.dateCreated)}</span>
            </div>
        </div>
    `;

    return container;
}

function addMessage(messageData) {
    DOM.chatMessagesArea.appendChild(createMessageElement(messageData));
    scrollToBottom(DOM.chatMessagesArea);
}

async function sendMessage(event) {
    event.preventDefault();

    const content = DOM.messageInput.value.trim();
    const { selectedUser, stompClient } = AppState;

    if (!content || !stompClient || !selectedUser.username) return;

    const message = {
        senderId: User.username,
        recipientId: selectedUser.username,
        content,
        dateCreated: new Date()
    };

    stompClient.send("/app/chat", {}, JSON.stringify(message));
    DOM.messageInput.value = '';
    DOM.emptyChatInfoMessage.classList.add('hidden');

    let chatElement = document.querySelector(`#${message.recipientId}`);

    if (!chatElement) {
        hideSearchArea();
        await fetchAndAppendNewUser(message.recipientId, message);
        chatElement = document.querySelector(`#${message.recipientId}`);
    } else {
        updateChatPreview(chatElement, message);
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
            const marker = chatElement.querySelector('.notificationMarker');
            marker.classList.remove('hidden');
        } else {
            addMessage(message);
        }
        updateChatPreview(chatElement, message);
    } else {
        await fetchAndAppendNewUser(senderId, message);
    }
}

function onMessagesScroll() {
    const { scrollTop } = DOM.chatMessagesArea;
    const { isLoading, isLastPage } = AppState.pagination;
    const { username } = AppState.selectedUser;

    if (scrollTop <= SCROLL_THRESHOLD_PX && !isLoading && !isLastPage && username) {
        loadChatMessagesPage(username, false);
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
    AppState.selectedUser = { username: null, fullname: null };
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

function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    const pad = num => String(num).padStart(2, '0');

    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const dateStr = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`;

    return `${time} ${dateStr}`;
}

function formatTime(dateTimeString) {
    const date = new Date(dateTimeString);
    const pad = num => String(num).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    window.location.replace('logout');
}

function onWindowResize() {
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
}

// ============================================
// ЗАПУСК
// ============================================

initCurrentUser();
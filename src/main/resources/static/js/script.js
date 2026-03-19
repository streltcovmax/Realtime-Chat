'use strict';

import {User} from "./user.js";


const usernamePage = document.querySelector('#login-page');
const messageInput = document.querySelector('#messageInput');
const chatPage = document.querySelector('#chat-page');
const logout = document.querySelector('#logout-button');
const messageForm = document.querySelector('#messageForm');
const chatMessagesArea = document.querySelector('#chat-messages');
const chat = document.querySelector('#chat')
const searchPage = document.querySelector('#search-page');
const foundUsersList = document.querySelector('#foundUsers');
const searchResultsContainer = document.querySelector('#search-results-container');
const searchNoResults = document.querySelector('#search-no-results');
const chatsListContainer = document.querySelector('#chats-list-container');
const searchClearBtn = document.querySelector('#search-clear-btn');
const usersSearchInput = document.querySelector('#searchUsername');
const selectedUserInfo = document.querySelector('#chat-header-info');
const chatArea = document.querySelector('#chat-area');
const pickChatInfoMessage = document.querySelector('#pick-chat-message');
const emptyChatInfoMessage = document.querySelector('#empty-chat-message');

const MESSAGES_PAGE_SIZE = 50;

const chatsList = document.querySelector('#chats-list');


let stompClient = null;
let selectedChatData = null;
let selectedChatUser = {username: null, fullname: null};
const pendingNewChats = new Set();
const pendingMessagesForNewChats = new Map();
let messagesPage = 0;
let messagesLastPage = false;
let messagesLoading = false;

function initCurrentUser() {
    fetch("/user.getCurrent")
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error("Ошибка загрузки пользователя");
            }
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

function setDOMUserData() {
    document.querySelector('#connected-user-fullname').textContent = User.fullname;
}

function setListeners() {
    document.querySelector('#this-profile-button').addEventListener('click', showCurrentUserProfile);
    document.querySelector('#logout-button').addEventListener('click', onLogout);
    document.querySelector('#send-message-button').addEventListener('click', sendMessage);
    usersSearchInput.addEventListener('input', usersSearch, true);
    usersSearchInput.addEventListener('input', updateSearchClearButton);
    searchClearBtn.addEventListener('click', clearSearch);
    chatMessagesArea.addEventListener('scroll', onMessagesScroll);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            hideDOMChattigArea();
            hideDOMSearchArea();
        }
    });
}

function setSubscriptions() {
    stompClient.subscribe(`/user/${User.username}/usersSearch`, displayFoundUsers);
}

function connectWS() {
    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    console.log("подключение к WS");
    stompClient.connect({}, onConnected, onError);
}

function onConnected() {
    stompClient.subscribe(`/user/${User.username}/messages`, onMessageReceived);
    stompClient.subscribe(`/user/public/`, updateUserStatus);
    fetch('/user.addUser', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: User.username,
            fullname: User.fullname,
            status: User.status
        })
    }).then(response => {
        if (!response.ok) console.error('Ошибка сохранения пользователя в БД');
        else {
            hideDOMChattigArea();
            setDOMUserData();
            setListeners();
            setSubscriptions();
            fetchAndShowChats().then();
        }
    });
}

function removeChatsSelection() {
    const activeChatItems = document.querySelectorAll('.chat-item.active');
    activeChatItems.forEach(item => {
        item.classList.remove('active');
    });
}

function removeSearchChatsSelection() {
    const activeSearchItems = document.querySelectorAll('.search-result-item.active');
    activeSearchItems.forEach(item => {
        item.classList.remove('active');
    });
}

function hideDOMChattigArea() {
    const activeChatItems = document.querySelectorAll('.chat-item.active');
    activeChatItems.forEach(item => {
        console.log(item);
        if (item.chatData && item.chatData.hasChat === false) {
            item.remove();
        }
    });
    chatArea.classList.add('hidden');
    chatMessagesArea.innerHTML = '';
    pickChatInfoMessage.classList.remove('hidden');
    emptyChatInfoMessage.classList.add('hidden');

    removeChatsSelection();
    removeSearchChatsSelection();
    resetSelectedUser();

    console.log("hiding chat");
}

function hideDOMSearchArea() {
    usersSearchInput.value = '';
    searchClearBtn.classList.add('hidden');
    hideSearchResults();
}

function updateSearchClearButton() {
    if (usersSearchInput.value.trim().length > 0) {
        searchClearBtn.classList.remove('hidden');
    } else {
        searchClearBtn.classList.add('hidden');
    }
}

function clearSearch() {
    usersSearchInput.value = '';
    searchClearBtn.classList.add('hidden');
    hideSearchResults();
}

function showSearchResults() {
    searchResultsContainer.classList.remove('hidden');
    chatsListContainer.classList.add('hidden');
}

function hideSearchResults() {
    searchResultsContainer.classList.add('hidden');
    chatsListContainer.classList.remove('hidden');
    foundUsersList.innerHTML = '';
    searchNoResults.classList.add('hidden');
}

function showDOMChattingArea() {
    pickChatInfoMessage.classList.add('hidden');
    chatArea.classList.remove('hidden');
}

async function fetchAndShowChats() {
    const usersResponse = await fetch('/chats');
    let users = await usersResponse.json();
    console.log("trying to get users from db ", users);
    users = users.filter(user => user.username !== User.username)

    chatsList.innerHTML = '';

    users.forEach(user => {
        appendChatToList(user);
    });
}

function appendChatToList(chatData, hasExistingChat = true) {
    const listItem = document.createElement('li');

    listItem.innerHTML = `<div class="chat-info">
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
                        </div>`
    listItem.classList.add('chat-item');
    updateDOMStatusIndicator(listItem, chatData.status);
    listItem.chatData = {...chatData, hasChat: hasExistingChat};
    listItem.id = chatData.username;
    fetch(`/messages/last/${User.username}/${chatData.username}`)
        .then(response => {
            if (!response.ok || response.status === 204) {
                return null;
            }
            return response.json();
        })
        .then(messageJson => {
            if (!messageJson) {
                return;
            }
            listItem.querySelector('.chat-message').textContent = messageJson.content;
            listItem.querySelector('.datetime').textContent = formatLocalDateTime(messageJson.dateCreated);
            listItem.chatData.hasChat = true;
        })
        .catch(err => console.error('не удалось получить последнее сообщение чата', err));
    listItem.addEventListener('click', pickTheChat)
    chatsList.appendChild(listItem);
}

function updateUserStatus(payload) {
    const user = JSON.parse(payload.body);
    console.log('received ', user.username);
    console.log('received ', user.status);
    const userElement = document.querySelector(`#${user.username}`);
    console.log('updating status, ', user.username);
    //для списка контактов обновляем если пользователь в нём есть
    if (userElement) {
        updateDOMStatusIndicator(userElement, user.status);
        userElement.chatData.status = user.status;
    } else {
        console.log(user.username, " not on your list");
    }
    //для шапки обновляем если этот пользователь выбран сейчас
    if (selectedChatUser.username === user.username) {
        if (user.status === 'ONLINE') selectedUserInfo.classList.add('online');
        else selectedUserInfo.classList.remove('online');
    }
}

function updateDOMStatusIndicator(element, status) {
    if (status === 'ONLINE') {
        element.querySelector('.online-indicator').classList.remove('hidden');
    } else {
        element.querySelector('.online-indicator').classList.add('hidden');
    }
    selectedUserInfo.querySelector('#chat-header-status').textContent = status.toLowerCase();
}

function pickTheChat(event) {
    const clickedChatElement = event.currentTarget;
    const clickedChatData = event.currentTarget.chatData;
    if (clickedChatData.username === selectedChatUser.username) {
        console.log('closing chat with', clickedChatData.username);
        hideDOMChattigArea();
        return;
    }

    console.log('opening chat with', clickedChatData.username);

    setSelectedUser(clickedChatData);

    hideDOMSearchArea();

    const notificationMarker = clickedChatElement.querySelector('.notificationMarker');
    notificationMarker.classList.add('hidden');
    notificationMarker.textContent = '0';

    fillDOMChattingAreaHeader(clickedChatData);
    showDOMChattingArea();

    setOneChatToActive(clickedChatElement);

    displayChatMessages(clickedChatData).then();
}

function pickNewChat(clickedChatElement) {
    const clickedChatData = clickedChatElement.chatData;
    if (clickedChatData.username === selectedChatUser.username) {
        console.log('closing chat with', clickedChatData.username);
        hideDOMChattigArea();
        return;
    }
    console.log('opening new chat with', clickedChatData.username);

    setOneChatToActive(clickedChatElement);
    setSelectedUser(clickedChatData);

    fillDOMChattingAreaHeader(clickedChatData);
    showDOMChattingArea();
    resetChatArea();

    showEmptyChatDOMMessage();
    console.log('no need to fetch messages, new chat...');
}

function fillDOMChattingAreaHeader(chatData) {
    selectedUserInfo.querySelector('#chat-header-username').textContent = chatData.username;
    selectedUserInfo.querySelector('#chat-header-status').textContent = chatData.status.toLowerCase();
    selectedUserInfo.querySelector('.chat-avatar').textContent = chatData.fullname[0];
}

async function displayChatMessages(clickedChatData) {
    resetChatArea();
    await loadChatMessagesPage(clickedChatData.username, true);
    scrollToBottom(chatMessagesArea);
}

function resetChatArea() {
    messagesPage = 0;
    messagesLastPage = false;
    chatMessagesArea.innerHTML = '';
}

async function loadChatMessagesPage(chatUsername, reset) {
    if (messagesLoading || !chatUsername) {
        return;
    }
    messagesLoading = true;
    try {
        const pageToLoad = reset ? 0 : messagesPage + 1;
        const messagesResponse = await fetch(`/messages/page/${User.username}/${chatUsername}?page=${pageToLoad}&size=${MESSAGES_PAGE_SIZE}`);
        if (!messagesResponse.ok) {
            console.error('не удалось получить сообщения чата постранично');
            return;
        }
        const pageJson = await messagesResponse.json();
        const messages = Array.isArray(pageJson) ? pageJson : (pageJson.content || []);

        if (reset) {
            chatMessagesArea.innerHTML = '';
        }

        if (messages.length === 0) {
            if (reset) {
                showEmptyChatDOMMessage();
            }
            messagesLastPage = true;
            return;
        } else {
            emptyChatInfoMessage.classList.add('hidden');
        }

        if (reset) {
            messages.slice().reverse().forEach(message => {
                addMessage(message);
            });
        } else {
            const oldScrollHeight = chatMessagesArea.scrollHeight;
            const fragment = document.createDocumentFragment();
            messages.slice().reverse().forEach(message => {
                const el = createMessageElement(message);
                fragment.appendChild(el);
            });
            chatMessagesArea.insertBefore(fragment, chatMessagesArea.firstChild);
            chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight - oldScrollHeight;
        }

        messagesPage = pageToLoad;
        if (!Array.isArray(pageJson) && typeof pageJson === 'object' && pageJson !== null && 'last' in pageJson) {
            messagesLastPage = pageJson.last;
        } else {
            messagesLastPage = messages.length < MESSAGES_PAGE_SIZE;
        }
    } finally {
        messagesLoading = false;
    }
}

async function sendMessage(event) {
    event.preventDefault();
    const messageContent = messageInput.value.trim();
    if (messageContent && stompClient && selectedChatUser) {
        const message = {
            senderId: User.username,
            recipientId: selectedChatUser.username,
            content: messageInput.value,
            dateCreated: new Date()
        };
        stompClient.send("/app/chat", {}, JSON.stringify(message));
        messageInput.value = '';

        console.log('sent message ', message)
        emptyChatInfoMessage.classList.add('hidden');

        let thisMessageChat = document.querySelector(`#${message.recipientId}`)
        if (!thisMessageChat) {
            await fetchAndAppendNewUserToList(message.recipientId, true);
            thisMessageChat = document.querySelector(`#${message.recipientId}`);
        } else {
            updateLastMessageInfo(thisMessageChat, message)
        }
        if (thisMessageChat && thisMessageChat.chatData) {
            thisMessageChat.chatData.hasChat = true;
        }
        addMessage(message);
    }
}

function showEmptyChatDOMMessage() {
    emptyChatInfoMessage.classList.remove('hidden');
}

async function onMessageReceived(payload) {
    const message = JSON.parse(payload.body);
    const senderId = message.senderId;
    console.log("Received message from " + senderId);
    let thisChatInList = document.querySelector(`#${senderId}`)

    if (thisChatInList) {
        if (selectedChatUser.username !== senderId) {
            const notificationMarker = thisChatInList.querySelector('.notificationMarker');
            notificationMarker.classList.remove('hidden');
            notificationMarker.textContent = '';

        } else {
            addMessage(message);
            chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;

        }
        updateLastMessageInfo(thisChatInList, message);
    } else {
        await fetchAndAppendNewUserToList(senderId, false, message);
    }
}

function updateLastMessageInfo(chatElement, message) {
    console.log("*обновляем текст последнего сообщения в чате ", message.senderId, "на ", message.content);

    chatElement.querySelector('.chat-message').textContent = message.content;
    chatElement.querySelector('.datetime').textContent = formatLocalDateTime(message.dateCreated);
}

async function fetchAndAppendNewUserToList(targetUsername, openChat, message) {
    if (pendingNewChats.has(targetUsername)) {
        if (message) pendingMessagesForNewChats.set(targetUsername, message);
        return;
    }
    let chat = document.querySelector(`#${targetUsername}`);
    if (chat) {
        if (message) updateLastMessageInfo(chat, message);
        if (!openChat) {
            const notificationMarker = chat.querySelector('.notificationMarker');
            notificationMarker.classList.remove('hidden');
            notificationMarker.textContent = '';
        } else chat.dispatchEvent(new Event('click', {bubbles: true}));
        return;
    }
    pendingNewChats.add(targetUsername);
    try {
        const userResponse = await fetch(`/users/${targetUsername}`);
        const userJson = await userResponse.json();
        chat = document.querySelector(`#${targetUsername}`);
        if (chat) {
            pendingNewChats.delete(targetUsername);
            return;
        }
        appendChatToList(userJson, true);
        chat = document.querySelector(`#${targetUsername}`);
        if (!chat) return;
        const msgToShow = pendingMessagesForNewChats.get(targetUsername) || message;
        if (msgToShow) updateLastMessageInfo(chat, msgToShow);
        pendingMessagesForNewChats.delete(targetUsername);
        if (openChat) {
            chat.dispatchEvent(new Event('click', {bubbles: true}));
        } else {
            const notificationMarker = chat.querySelector('.notificationMarker');
            notificationMarker.classList.remove('hidden');
            notificationMarker.textContent = '';
        }
    } finally {
        pendingNewChats.delete(targetUsername);
    }
}

function createMessageElement(messageData) {
    const messageContainer = document.createElement('div');
    const senderId = messageData.senderId;
    if (senderId === User.username) {
        messageContainer.innerHTML =
            `<div class="message sender">
<!--                <div class="chat-avatar r">${User.fullname[0]}</div>-->
                <div class="message-content sender">
                    <span>${messageData.content}</span>
                    <span class="time">${formatLocalTime(messageData.dateCreated)}</span>
               </div>
            </div>`
    } else {
        messageContainer.innerHTML =
            `<div class="message receiver">
<!--                <div class="chat-avatar r">${selectedChatUser.fullname[0]}</div>-->
                <div class="message-content receiver">
                    <span>${messageData.content}</span>
                    <span class="time">${formatLocalTime(messageData.dateCreated)}</span>
                </div>
            </div>`
    }
    return messageContainer;
}

function addMessage(messageData) {
    const messageContainer = createMessageElement(messageData);
    chatMessagesArea.appendChild(messageContainer);
    // scrollToBottom(chatMessagesArea);
}

function usersSearch() {
    let usernameToFind = usersSearchInput.value.trim();
    foundUsersList.innerHTML = '';
    searchNoResults.classList.add('hidden');
    if (usernameToFind.length <= 2) {
        hideSearchResults();
        return;
    }
    if (stompClient) {
        stompClient.send("/app/user.findUsers", {}, usernameToFind);
    }
}

function displayFoundUsers(payload) {
    let foundUsers = JSON.parse(payload.body);
    foundUsersList.innerHTML = '';
    foundUsers = foundUsers.filter(user => user.username !== User.username);

    showSearchResults();

    searchNoResults.classList.add('hidden');
    if (foundUsers.length <= 0) {
        searchNoResults.classList.remove('hidden');
    }
    foundUsers.forEach(user => {
        const userElement = document.createElement('li');
        userElement.classList.add('search-result-item');
        userElement.innerHTML = `<span class="chat-avatar r">${user.fullname ? user.fullname[0] : '?'}</span> ${user.fullname || user.username} (@${user.username})`;
        userElement.chatData = user;
        foundUsersList.appendChild(userElement);
        userElement.addEventListener('click', () => {
            pickChatFromSearch(userElement, user);
        });
    });
}

function pickChatFromSearch(userElement, user) {
    setOneSearchChatToActive(userElement);
    const existingChat = document.querySelector(`#${user.username}`);
    if (existingChat) {
        existingChat.dispatchEvent(new Event('click', {bubbles: true}));
    } else {
        pickNewChat(userElement);
    }
}

function setOneChatToActive(chatToSetActive) {
    console.log("Setting to active", chatToSetActive);
    removeChatsSelection();
    chatToSetActive.classList.add('active')
}

function setOneSearchChatToActive(chatToSetActive) {
    console.log("Setting to active", chatToSetActive);
    removeSearchChatsSelection();
    chatToSetActive.classList.add('active')
}

function showCurrentUserProfile() {
    console.log("СМОТРИМ ПОЛНУЮ ИНФУ ЭТОГО ЮЗЕРА наверное тут get запрос");
}

function onError(error) {
    console.log('Error connecting');
}

function onLogout() {
    User.status = 'OFFLINE'
    // stompClient.send("/app/user.disconnectUser",
    //     {},
    //     JSON.stringify({User})
    // );
    window.location.reload();
    window.location.replace('logout');
    // window.location.replace('http://localhost:8080/realms/chat_realm/protocol/openid-connect/logout?redirect_uri=http://localhost:8081');
}

function formatLocalDateTime(dateTimeString) {
    const date = new Date(dateTimeString);

    const pad = (num) => String(num).padStart(2, '0');

    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1); // месяцы с 0 по 11
    const year = String(date.getFullYear()).slice(-2); // последние 2 цифры года

    return `${hours}:${minutes} ${day}.${month}.${year}`;
}

function formatLocalTime(dateTimeString) {
    const date = new Date(dateTimeString);

    const pad = (num) => String(num).padStart(2, '0');

    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${hours}:${minutes}`;
}

function scrollToBottom(area) {
    area.scrollTop = area.scrollHeight;
}

function setSelectedUser(selectedChatData) {
    selectedChatUser.username = selectedChatData.username;
    selectedChatUser.fullname = selectedChatData.fullname;
}

function resetSelectedUser() {
    selectedChatUser = {username: null, fullname: null};
}

function onMessagesScroll() {
    const pxToTop = 250;
    if (chatMessagesArea.scrollTop <= pxToTop && !messagesLoading && !messagesLastPage && selectedChatUser.username) {
        loadChatMessagesPage(selectedChatUser.username, false);
    }
}

initCurrentUser();

//TODO выровнять кнопки на боковой панели

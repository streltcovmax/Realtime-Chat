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
const usersSearchInput = document.querySelector('#searchUsername');
const selectedUserInfo = document.querySelector('#chat-header-info');
const chatArea = document.querySelector('#chat-area');
const pickChatInfoMessage = document.querySelector('#pick-chat-message');
const emptyChatInfoMessage = document.querySelector('#empty-chat-message');


const chatsList = document.querySelector('#chats-list');


let stompClient = null;
let selectedChatData = null;
let selectedChatUser = {username: null, fullname: null};

function initCurrentUser() {
    fetch("/api/me")
        .then(response => {
            if (response.ok) {
                return response.json(); // возвращаем промис
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

function setDOMUserData(){

}

function setListeners(){
    document.querySelector('#this-profile-button').addEventListener('click', showCurrentUserProfile);
    document.querySelector('#logout-button').addEventListener('click', onLogout);
    document.querySelector('#send-message-button').addEventListener('click', sendMessage);
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            // Вызов нужной функции
            hideDOMChattigArea();
        }
    });

}

function connectWS(){
    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    console.log("подключение к WS");
    stompClient.connect({}, onConnected, onError);
}

function onConnected(){
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
        if(!response.ok) console.error('Ошибка сохранения пользователя в БД');
        else{
            hideDOMChattigArea();
            setDOMUserData();
            setListeners();
            findAndShowChats().then();
        }
    });


    // document.querySelector('#connected-user-fullname').textContent = User.fullname;
}

function removeChatsSelection(){
    const activeChatItems = document.querySelectorAll('.chat-item.active');
    activeChatItems.forEach(item => {
        item.classList.remove('active');
    });
}

function hideDOMChattigArea(){
    removeChatsSelection();
    chatArea.classList.add('hidden');
    chatMessagesArea.innerHTML = '';
    pickChatInfoMessage.classList.remove('hidden');
    emptyChatInfoMessage.classList.add('hidden');

    resetSelectedUser();

    console.log("hiding chat");
}

function showDOMChattingArea(){
    pickChatInfoMessage.classList.add('hidden');
    chatArea.classList.remove('hidden');
}

async function findAndShowChats() {
    const usersResponse = await fetch('/chats');
    let users = await usersResponse.json();
    console.log("trying to get users from db ", users);
    users = users.filter(user => user.username !== User.username)

    chatsList.innerHTML = '';

    users.forEach(user => {
        appendChatDataToList(user);
    });
}

function appendChatDataToList(chatData){
    const listItem = document.createElement('li');

    listItem.innerHTML =`<div class="chat-info">
                                <div class="chat-avatar r">${chatData.fullname[0]}
                                    <span class="online-indicator hidden"></span>
                                </div>
                            </div>
                            <div class="chat-text">
                                <span class="chat-name">${chatData.fullname}</span>
                                <span class="chat-message"> </span>
                            </div>
                            <div class="chat-nums">
                                <span class="datetime">00:00</span>
                                <span class="notificationMarker r hidden">0</span>
                            </div>
                        </div>`
    listItem.classList.add('chat-item');
    updateDOMStatusIndicator(listItem, chatData.status);
    listItem.chatData = chatData;
    listItem.id = chatData.username;
    fetch(`/messages/last/${User.username}/${chatData.username}`).then(response => {
        if(!response.ok) console.error('не удалось получить последнее сообщение чата');
        else{
            return response.json();
        }
    } ).then(messageJson => {
        listItem.querySelector('.chat-message').textContent = messageJson.content;
        listItem.querySelector('.datetime').textContent = formatLocalDateTime(messageJson.dateCreated);
    });
    listItem.addEventListener('click', pickTheChat)
    chatsList.appendChild(listItem);
}

// function appendUserToList(user){
//     const listItem = document.createElement('li');
//     listItem.classList.add('user-item');
//     listItem.id = user.username;
//     listItem.fullname = user.fullname;
//
//     if(user.status === "ONLINE") {
//         listItem.classList.add('online');
//     }
//
//     const nameElement = document.createElement('span');
//     nameElement.textContent = user.fullname;
//
//     const messageMarker = document.createElement('span');
//     messageMarker.textContent = '0';
//     messageMarker.classList.add('notificationMarker', 'hidden');
//
//     const separator = document.createElement('li');
//     separator.classList.add('separator');
//
//     listItem.appendChild(nameElement);
//     listItem.appendChild(messageMarker);
//     listItem.addEventListener('click', pickChat);
//
//     chatsList.appendChild(listItem);
//     chatsList.appendChild(separator);
// }

function updateUserStatus(payload){
    const user = JSON.parse(payload.body);
    console.log('received ', user.username);
    console.log('received ', user.status);
    const userElement = document.querySelector(`#${user.username}`);
    console.log('updating status, ', user.username);
    //для списка контактов обновляем если пользователь в нём есть
    if(userElement){
        updateDOMStatusIndicator(userElement, user.status);
        userElement.chatData.status = user.status;
    }
    else{
        console.log(user.username, " not found in ur list");
    }
    //для шапки обновляем если этот пользователь выбран сейчас
    if(selectedChatUser.username === user.username){
        if(user.status === 'ONLINE') selectedUserInfo.classList.add('online');
        else selectedUserInfo.classList.remove('online');
    }
}

function updateDOMStatusIndicator(element, status){
    if(status === 'ONLINE'){
        element.querySelector('.online-indicator').classList.remove('hidden');
    }
    else {
        element.querySelector('.online-indicator').classList.add('hidden');
    }
    selectedUserInfo.querySelector('#chat-header-status').textContent = status.toLowerCase();
}


function pickTheChat(event){
    //убираем выделение с чатов
    removeChatsSelection();
    const clickedChatElement = event.currentTarget;
    const clickedChatData = event.currentTarget.chatData;
    if(clickedChatData.username !== selectedChatUser.username){
        console.log('opening chat with', clickedChatData.username);
        clickedChatElement.classList.add('active');

        selectedChatUser.username = clickedChatData.username;
        selectedChatUser.fullname = clickedChatData.fullname;

        const notificationMarker = clickedChatElement.querySelector('.notificationMarker');
        notificationMarker.classList.add('hidden');
        notificationMarker.textContent = '0';

        selectedUserInfo.querySelector('#chat-header-username').textContent = clickedChatData.username;
        selectedUserInfo.querySelector('#chat-header-status').textContent = clickedChatData.status.toLowerCase();
        selectedUserInfo.querySelector('.chat-avatar').textContent = clickedChatData.fullname[0];

        showDOMChattingArea();
        
        displayChatMessages(clickedChatData).then();
    }
    else{
        console.log('closing chat with', clickedChatData.username);
        hideDOMChattigArea();
    }
}


// function hideChat(){
//     console.log("hiding opened chat");
//     if (event.key === 'Escape') {
//         if(selectedChatUsername){
//             const chatElement = document.querySelector(`#${selectedChatUsername}`);
//             if(chatElement){
//                 chatElement.classList.remove('active');
//                 // chatElement.querySelector('.notificationMarker').classList.remove('hidden');
//             }
//             messageInput.placeholder = "...";
//             chatPage.classList.add('narrow');
//
//             chat.classList.remove('activated');
//             setTimeout(() => {
//                 chat.classList.add('hidden');
//             }, 500);
//
//
//             selectedUserInfo.textContent = '';
//             selectedUserInfo.classList.add('hidden');
//             selectedChatUsername = null;
//             chatMessagesArea.innerHTML='';
//             document.removeEventListener('keydown', hideChat);
//         }
//     }
// }

async function displayChatMessages(clickedChatData){
    const messagesResponse = await fetch(`/messages/all/${User.username}/${clickedChatData.username}`);
    const messagesJson = await messagesResponse.json();
    console.log('chat messages json:', messagesJson);
    chatMessagesArea.innerHTML = '';
    if(messagesJson.length > 0){
        emptyChatInfoMessage.classList.add('hidden');

        messagesJson.forEach(message => {
            addMessage(message);
        })
        scrollToBottom(chatMessagesArea);
    }
    else{
        emptyChatInfoMessage.classList.remove('hidden');
    }
}

function sendMessage(event) {
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
        if(!thisMessageChat) fetchAndAppendNewUserToList(message.recipientId, true).then();
        else updateLastMessageInfo(thisMessageChat, message)
        addMessage(message);
    }
}


async function onMessageReceived(payload) {
    const message = JSON.parse(payload.body);
    const senderId = message.senderId;
    console.log("Received message from " + senderId);
    let thisChatInList = document.querySelector(`#${senderId}`)

    if(thisChatInList){
        if(selectedChatUser.username !== senderId){
            const notificationMarker = thisChatInList.querySelector('.notificationMarker');
            notificationMarker.classList.remove('hidden');
            notificationMarker.textContent = '';

        }
        else{
            addMessage(message);
            chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;

        }
        updateLastMessageInfo(thisChatInList, message);
    }
    else{
        // await fetchAndAppendNewUserToList(senderId, false);
        console.log("*добавляем нового пользователя в список чатов")
    }
}

function updateLastMessageInfo(chatElement, message){
    console.log("*обновляем текст последнего сообщения в чате ", message.senderId, "на ", message.content);

    chatElement.querySelector('.chat-message').textContent = message.content;
    chatElement.querySelector('.datetime').textContent = formatLocalDateTime(message.dateCreated);
}

async function fetchAndAppendNewUserToList(targetUsername, openChat){
    console.log("creating a new chat for this message");

    const userResponse = await fetch(`/users/${targetUsername}`);
    const userJson = await userResponse.json();
    console.log(targetUsername + " INFO: " + userJson);
    appendUserToList(userJson);
    let chat = document.querySelector(`#${targetUsername}`)
    if(openChat){
        if(selectedChatUser)
            document.querySelector(`#${selectedChatUser.username}`).classList.remove('active');

        selectedChatUser.username = chat.getAttribute('id');
        chat.classList.add('active');
        messageInput.placeholder = "Введите сообщение для пользователя " + chat.firstElementChild.textContent  + "...";
        selectedUserInfo.textContent = '';

        const nameElement = document.createElement('span');
        nameElement.textContent = chat.firstElementChild.textContent;
        selectedUserInfo.appendChild(nameElement);

        if(chat.classList.contains('online')) selectedUserInfo.classList.add('online');
        selectedUserInfo.classList.remove('hidden');
    }
    else{
        const notificationMarker = await chat.querySelector('.notificationMarker');
        notificationMarker.classList.remove('hidden');
        notificationMarker.textContent = '';
    }
}

function addMessage(messageData) {
    const messageContainer = document.createElement('div');
    const senderId = messageData.senderId;
    if (senderId === User.username){
        messageContainer.innerHTML =
            `<div class="message sender">
<!--                <div class="chat-avatar r">${User.fullname[0]}</div>-->
                <div class="message-content sender">
                    <span>${messageData.content}</span>
                    <span class="time">${formatLocalTime(messageData.dateCreated)}</span>
               </div>
            </div>`
    }
    else{
        messageContainer.innerHTML =
            `<div class="message receiver">
<!--                <div class="chat-avatar r">${selectedChatUser.fullname[0]}</div>-->
                <div class="message-content receiver">
                    <span>${messageData.content}</span>
                    <span class="time">${formatLocalTime(messageData.dateCreated)}</span>
                </div>
            </div>`
    }
    chatMessagesArea.appendChild(messageContainer);
    scrollToBottom(chatMessagesArea);
}

function showUsersSearch() {
    chatPage.classList.add("hidden");
    searchPage.classList.remove("hidden");
    stompClient.subscribe(`/user/${User.username}/usersSearch`, displayFoundUsers);
}
function usersSearch(){
    let usernameToFind = usersSearchInput.value;
    foundUsersList.innerHTML = '';

    if(usernameToFind.length > 2){
        stompClient.send("/app/user.findUsers", {}, usernameToFind);
    }
}
function displayFoundUsers(payload){
    let foundUsers = JSON.parse(payload.body);
    foundUsersList.innerHTML = '';
    foundUsers = foundUsers.filter(user => user.username !== username)

    foundUsers.forEach(user => {
        //Создание списка найденных пользователей
        const userElement = document.createElement('li');
        userElement.textContent = user.username + " (" + user.fullname +  ")";
        userElement.id = user.username;
        userElement.fullname = user.fullname;
        foundUsersList.appendChild(userElement);
        userElement.addEventListener
        ('click',
            function (event)
            {
                foundUsersList.innerHTML = '';
                usersSearchInput.value = '';
                chatPage.classList.remove("hidden");
                searchPage.classList.add("hidden");
                if(user.status === 'ONLINE') selectedUserInfo.classList.add('online');

                pickChat(event);
        })
    });
}

function showCurrentUserProfile(){
    console.log("СМОТРИМ ПОЛНУЮ ИНФУ ЭТОГО ЮЗЕРА наверное тут get запрос");
}


function onError(error) {
    console.log('Error connecting');
}
function onLogout(){
    User.status = 'OFFLINE'
    // stompClient.send("/app/user.disconnectUser",
    //     {},
    //     JSON.stringify({User})
    // );
    window.location.reload();
    window.location.replace('http://localhost:8080/realms/chat_realm/protocol/openid-connect/logout?redirect_uri=http://localhost:8081');

}

// usernamePage.addEventListener('submit', connect, true);
// chatPage.addEventListener('submit', sendMessage, true);
// logout.addEventListener('click', onLogout, true);
// usersSearchInput.addEventListener('input', usersSearch, true);

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


function scrollToBottom(area){
    area.scrollTop = area.scrollHeight;
}

function resetSelectedUser(){
    selectedChatUser = {username: null, fullname: null};
}


initCurrentUser();

//TODO выровнять кнопки на боковой панели

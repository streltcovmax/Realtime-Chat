'use strict';

import {User} from "./user.js";

const usernamePage = document.querySelector('#login-page');
const messageInput = document.querySelector('#message');
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
let selectedChatUsername = null;

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

    selectedChatUsername = null;
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

//TODO еще должна быть message data, можно просто брать последний msg из бд
function appendChatDataToList(chatData){
    const listItem = document.createElement('li');
    listItem.innerHTML =`<div class="chat-info">
                                <div class="chat-avatar r">${chatData.fullname[0]}
                                    <span class="online-indicator hidden"></span>
                                </div>
                            </div>
                            <div class="chat-text">
                                <span class="chat-name">${chatData.fullname}</span>
                                <span class="chat-message"> here comes the msg</span>
                            </div>
                            <div class="chat-nums">
                                <span class="time">00:00</span>
                                <span class="notificationMarker r hidden">0</span>
                            </div>
                        </div>`
    listItem.classList.add('chat-item');
    updateDOMStatusIndicator(listItem, chatData.status);
    listItem.chatData = chatData;
    listItem.id = chatData.username;
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
    if(selectedChatUsername === user.username){
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
    if(clickedChatData.username !== selectedChatUsername){
        console.log('opening chat with', clickedChatData.username);
        clickedChatElement.classList.add('active');

        selectedChatUsername = clickedChatData.username;

        const notificationMarker = clickedChatElement.querySelector('.notificationMarker');
        notificationMarker.classList.add('hidden');
        notificationMarker.textContent = '0';

        selectedUserInfo.querySelector('#chat-header-username').textContent = clickedChatData.username;
        selectedUserInfo.querySelector('#chat-header-status').textContent = clickedChatData.status.toLowerCase();

        showDOMChattingArea();
        
        displayChatMessages(clickedChatData).then();
    }
    else{
        console.log('closing chat with', clickedChatData.username);
        hideDOMChattigArea();
    }
}

// function pickChat(event){
//     const clickedChat = event.currentTarget;
//     const userFirstName = event.currentTarget.fullname;
//
//     if(clickedChat.getAttribute('id') !== selectedChatUsername) {
//         if(selectedChatUsername) document.querySelector(`#${selectedChatUsername}`).classList.remove('active');
//
//         selectedChatUsername = clickedChat.getAttribute('id');
//
//         chatMessagesArea.innerHTML='';
//
//         const chatElement = document.querySelector(`#${selectedChatUsername}`);
//         if(chatElement){
//             chatElement.classList.add('active');
//             if(chatElement.classList.contains('online')) selectedUserInfo.classList.add('online');
//             const notificationMarker = chatElement.querySelector('.notificationMarker');
//             notificationMarker.classList.add('hidden');
//             notificationMarker.textContent = '0';
//             displayChatMessages().then();
//         }
//
//         messageInput.placeholder = "Введите сообщение для пользователя " + userFirstName + "...";
//         // messageForm.classList.remove('hidden');
//         chatPage.classList.remove('narrow');
//
//         chat.classList.remove('hidden');
//
//         setTimeout(() => {
//             chat.classList.add('activated');
//         }, 100);
//
//         document.addEventListener('keydown', hideChat);
//
//         const nameElement = document.createElement('span');
//         nameElement.textContent = userFirstName;
//         selectedUserInfo.textContent = '';
//         selectedUserInfo.appendChild(nameElement);
//         selectedUserInfo.classList.remove('hidden');
//     }
// }

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
    const messagesResponse = await fetch(`/messages/${User.username}/${clickedChatData.username}`);
    const messagesJson = await messagesResponse.json();
    console.log('chat messages json:', messagesJson);
    chatMessagesArea.innerHTML = '';
    if(messagesJson.length > 0){
        emptyChatInfoMessage.classList.add('hidden');

        messagesJson.forEach(message => {
            addMessage(message, clickedChatData);
        })
        chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    }
    else{
        emptyChatInfoMessage.classList.remove('hidden');
    }
}

function sendMessage(event) {
    const messageContent = messageInput.value.trim();
    if (messageContent && stompClient && selectedChatUsername) {
        const message = {
            senderId: User.username,
            recipientId: selectedChatUsername,
            content: messageInput.value,
            dateCreated: new Date()
        };
        stompClient.send("/app/chat", {}, JSON.stringify(message));
        messageInput.value = '';

        let thisMessageChat = document.querySelector(`#${message.recipientId}`)
        if(!thisMessageChat) fetchAndAppendNewUserToList(message.recipientId, true).then();
        addMessage(message.content, message.senderId);
    }
    event.preventDefault();
}
async function onMessageReceived(payload) {
    const message = JSON.parse(payload.body);
    const senderId = message.senderId;
    console.log("Received message from " + senderId);
    let thisMessageChat = document.querySelector(`#${senderId}`)

    if(thisMessageChat){
        if(selectedChatUsername !== senderId){
            const notificationMarker = thisMessageChat.querySelector('.notificationMarker');
            notificationMarker.classList.remove('hidden');
            notificationMarker.textContent = '';
        }
        else{
            addMessage(message.content, senderId);
            chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
        }
    }
    else{
        await fetchAndAppendNewUserToList(senderId, false);
    }
}

async function fetchAndAppendNewUserToList(targetUsername, openChat){
    console.log("creating a new chat for this message");

    const userResponse = await fetch(`/users/${targetUsername}`);
    const userJson = await userResponse.json();
    console.log(targetUsername + " INFO: " + userJson);
    appendUserToList(userJson);
    let chat = document.querySelector(`#${targetUsername}`)
    if(openChat){
        if(selectedChatUsername)
            document.querySelector(`#${selectedChatUsername}`).classList.remove('active');

        selectedChatUsername = chat.getAttribute('id');
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
            `<div class="message r">
                <span class="message-content sender r">${messageData.content}</span>
            </div>`
    }
    else{
        messageContainer.innerHTML =
            `<div class="message r">
                <span class="message-content receiver r">${messageData.content}</span>
            </div>`
    }
    chatMessagesArea.appendChild(messageContainer);
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
    window.location.replace('/logout');
}

// usernamePage.addEventListener('submit', connect, true);
// chatPage.addEventListener('submit', sendMessage, true);
// logout.addEventListener('click', onLogout, true);
// usersSearchInput.addEventListener('input', usersSearch, true);


initCurrentUser();
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
const selectedUserInfo = document.querySelector('#chat-userInfo');


const chatsList = document.querySelector('#chats-list');

const chattingArea = document.querySelector('#chat-area')
const chattingInfoMessage = document.querySelector('#pick-chat-message')


// let username = null;
// let firstName = null;
let stompClient = null;
let selectedUser = null;

function connect(event){
    let username = document.querySelector('#username-input').value.trim();
    let firstName = document.querySelector('#fullname-input').value.trim();

    if(username && firstName){
        User.username = username;
        User.firstName = firstName;
        User.status = 'ONLINE';
        usernamePage.classList.add('hidden');
        chatPage.classList.remove('hidden');

        const socket = new SockJS('/ws');
        stompClient = Stomp.over(socket);

        stompClient.connect({}, onConnected, onError);
    }
    event.preventDefault();
}

function onConnected(){
    // stompClient.subscribe(`/user/${username}/messages`, onMessageReceived);
    // stompClient.subscribe(`/user/public/`, updateUserStatus);

    // stompClient.send('/app/user.addUser',
    //     {},
    //     JSON.stringify({username: username, status: 'ONLINE', firstName: firstName})
    // );
    console.log('user: ', User.username);
    fetch('/user.addUser', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: User.username,
            firstName: User.firstName,
            status: User.status
        })
    }).then(response => {
        if(!response.ok) console.error('Error creating user');
        else findAndShowChats().then();
    });


    hideChattigArea();
    document.querySelector('#connected-user-firstName').textContent = User.firstName;
}

function hideChattigArea(){
    chattingArea.classList.add('hidden');
    chattingInfoMessage.classList.remove('hidden');
    chattingArea.innerHTML = '';
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
function appendChatDataToList(userData){
    const listItem = document.createElement('li');
    listItem.innerHTML =`<div class="chat-info">
                            <div class="chat-avatar r">${userData.firstName[0]}</div>
                            <div class="chat-text">
                                <span class="chat-name">${userData.firstName}</span>
                                <span class="chat-message"> here comes the msg</span>
                            </div>
                            <div class="chat-nums">
                                <span class="time">00:00</span>
                                <span class="notificationMarker r hidden">0</span>
                            </div>
                        </div>`
    listItem.classList.add('chat-item');
    chatsList.appendChild(listItem);

}

function appendUserToList(user){
    const listItem = document.createElement('li');
    listItem.classList.add('user-item');
    listItem.id = user.username;
    listItem.firstName = user.firstName;

    if(user.status === "ONLINE") {
        listItem.classList.add('online');
    }

    const nameElement = document.createElement('span');
    nameElement.textContent = user.firstName;

    const messageMarker = document.createElement('span');
    messageMarker.textContent = '0';
    messageMarker.classList.add('notificationMarker', 'hidden');

    const separator = document.createElement('li');
    separator.classList.add('separator');

    listItem.appendChild(nameElement);
    listItem.appendChild(messageMarker);
    listItem.addEventListener('click', pickChat);

    chatsList.appendChild(listItem);
    chatsList.appendChild(separator);
}

function updateUserStatus(payload){
    const user = JSON.parse(payload.body);
    let userElement = document.querySelector(`#${user.username}`);
    //для списка контактов обновляем если пользователь в нём есть
    if(userElement){
        if(user.status === 'ONLINE') userElement.classList.add('online');
        else userElement.classList.remove('online');
    }
    //для шапки обновляем если этот пользователь выбран сейчас
    if(selectedUser === user.username){
        if(user.status === 'ONLINE') selectedUserInfo.classList.add('online');
        else selectedUserInfo.classList.remove('online');
    }
}

function pickChat(event){
    const clickedUser = event.currentTarget;
    const userFirstName = event.currentTarget.firstName;

    if(clickedUser.getAttribute('id') !== selectedUser) {
        if(selectedUser) document.querySelector(`#${selectedUser}`).classList.remove('active');

        selectedUser = clickedUser.getAttribute('id');

        chatMessagesArea.innerHTML='';

        const chatElement = document.querySelector(`#${selectedUser}`);
        if(chatElement){
            chatElement.classList.add('active');
            if(chatElement.classList.contains('online')) selectedUserInfo.classList.add('online');
            const notificationMarker = chatElement.querySelector('.notificationMarker');
            notificationMarker.classList.add('hidden');
            notificationMarker.textContent = '0';
            displayUserChat().then();
        }

        messageInput.placeholder = "Введите сообщение для пользователя " + userFirstName + "...";
        // messageForm.classList.remove('hidden');
        chatPage.classList.remove('narrow');

        chat.classList.remove('hidden');

        setTimeout(() => {
            chat.classList.add('activated');
        }, 100);

        document.addEventListener('keydown', hideChat);

        const nameElement = document.createElement('span');
        nameElement.textContent = userFirstName;
        selectedUserInfo.textContent = '';
        selectedUserInfo.appendChild(nameElement);
        selectedUserInfo.classList.remove('hidden');
    }
}

function hideChat(){
    console.log("hiding opened chat");
    if (event.key === 'Escape') {
        if(selectedUser){
            const chatElement = document.querySelector(`#${selectedUser}`);
            if(chatElement){
                chatElement.classList.remove('active');
                // chatElement.querySelector('.notificationMarker').classList.remove('hidden');
            }
            messageInput.placeholder = "...";
            chatPage.classList.add('narrow');

            chat.classList.remove('activated');
            setTimeout(() => {
                chat.classList.add('hidden');
            }, 500);


            selectedUserInfo.textContent = '';
            selectedUserInfo.classList.add('hidden');
            selectedUser = null;
            chatMessagesArea.innerHTML='';
            document.removeEventListener('keydown', hideChat);
        }
    }
}

async function displayUserChat(){
    const chatResponse = await fetch(`/messages/${User.username}/${selectedUser}`);
    const chatJson = await chatResponse.json();
    chatMessagesArea.innerHTML = '';
    chatJson.forEach(chat => {
        addMessage(chat.content, chat.senderId);
    })
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
}

function sendMessage(event) {
    const messageContent = messageInput.value.trim();
    if (messageContent && stompClient && selectedUser) {
        const message = {
            senderId: User.username,
            recipientId: selectedUser,
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
        if(selectedUser !== senderId){
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
        if(selectedUser)
            document.querySelector(`#${selectedUser}`).classList.remove('active');

        selectedUser = chat.getAttribute('id');
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

function addMessage(content, senderId){
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message');
    if (senderId === User.username) {
        messageContainer.classList.add('sender');
    } else {
        messageContainer.classList.add('receiver');
    }
    const message = document.createElement('p');
    message.textContent = content;
    messageContainer.appendChild(message);
    chatMessagesArea.appendChild(messageContainer);
}
function showUsersSearch(){
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
        userElement.textContent = user.username + " (" + user.firstName +  ")";
        userElement.id = user.username;
        userElement.firstName = user.firstName;
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




function onError(error) {
    console.log('Error connecting');
}
function onLogout(){
    User.status = 'OFFLINE'
    stompClient.send("/app/user.disconnectUser",
        {},
        JSON.stringify({User})
    );
    window.location.reload();
}

// usernamePage.addEventListener('submit', connect, true);
document.querySelector('#login-button-submit').addEventListener('click', connect, true);
chatPage.addEventListener('submit', sendMessage, true);
logout.addEventListener('click', onLogout, true);
usersSearchInput.addEventListener('input', usersSearch, true);

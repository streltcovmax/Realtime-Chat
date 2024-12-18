'use strict';

const usernamePage = document.querySelector('#username-page');
const messageInput = document.querySelector('#message');
const chatPage = document.querySelector('#chat-page');
const logout = document.querySelector('#logout');
const messageForm = document.querySelector('#messageForm');
const chatArea = document.querySelector('#chat-messages');
const searchPage = document.querySelector('#search-page');
const foundUsersList = document.querySelector('#foundUsers');
const usersSearchInput = document.querySelector('#searchUsername');
const usersList = document.querySelector('#connectedUsers');
const selectedUserInfo = document.querySelector('#chat-userInfo');


let username = null;
let firstName = null;
let stompClient = null;
let selectedUser = null;

function connect(event){
    username = document.querySelector('#username').value.trim();
    firstName = document.querySelector('#firstName').value.trim();

    if(username && firstName){
        usernamePage.classList.add('hidden');
        chatPage.classList.remove('hidden');

        const socket = new SockJS('/ws');
        stompClient = Stomp.over(socket);

        stompClient.connect({}, onConnected, onError);
    }
    event.preventDefault();
}

function onConnected(){
    stompClient.subscribe(`/user/${username}/messages`, onMessageReceived);
    stompClient.subscribe(`/user/public/`, updateUserStatus);

    stompClient.send('/app/user.addUser',
        {},
        JSON.stringify({username: username, status: 'ONLINE', firstName: firstName})
    );

    document.querySelector("#connected-user-firstName").textContent = firstName;
    findAndShowUsers().then();
}


async function findAndShowUsers() {
    const usersResponse = await fetch('/users');
    let users = await usersResponse.json();
    console.log("trying to get users from db " + users);
    users = users.filter(user => user.username !== username)

    usersList.innerHTML = '';

    users.forEach(user => {
        appendUserToList(user);
    });
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
    listItem.addEventListener('click', pickUserToChat);

    usersList.appendChild(listItem);
    usersList.appendChild(separator);
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

function pickUserToChat(event){
    const clickedUser = event.currentTarget;
    const userFirstName = event.currentTarget.firstName;

    if(clickedUser.getAttribute('id') !== selectedUser) {
        if(selectedUser) document.querySelector(`#${selectedUser}`).classList.remove('active');

        selectedUser = clickedUser.getAttribute('id');

        chatArea.innerHTML='';

        const userElement = document.querySelector(`#${selectedUser}`);
        if(userElement){
            userElement.classList.add('active');
            if(userElement.classList.contains('online')) selectedUserInfo.classList.add('online');
            const notificationMarker = userElement.querySelector('.notificationMarker');
            notificationMarker.classList.add('hidden');
            notificationMarker.textContent = '0';
            displayUserChat().then();
        }


        messageInput.placeholder = "Введите сообщение для пользователя " + userFirstName + "...";
        messageForm.classList.remove('hidden');

        const nameElement = document.createElement('span');
        nameElement.textContent = userFirstName;
        selectedUserInfo.textContent = '';
        selectedUserInfo.appendChild(nameElement);
        selectedUserInfo.classList.remove('hidden');
    }
}

async function displayUserChat(){
    const chatResponse = await fetch(`/messages/${username}/${selectedUser}`);
    const chatJson = await chatResponse.json();
    chatArea.innerHTML = '';
    chatJson.forEach(chat => {
        addMessage(chat.content, chat.senderId);
    })
    chatArea.scrollTop = chatArea.scrollHeight;
}

function sendMessage(event) {
    const messageContent = messageInput.value.trim();
    if (messageContent && stompClient && selectedUser) {
        const message = {
            senderId: username,
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
            chatArea.scrollTop = chatArea.scrollHeight;
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
    if (senderId === username) {
        messageContainer.classList.add('sender');
    } else {
        messageContainer.classList.add('receiver');
    }
    const message = document.createElement('p');
    message.textContent = content;
    messageContainer.appendChild(message);
    chatArea.appendChild(messageContainer);
}
function showUsersSearch(){
    chatPage.classList.add("hidden");
    searchPage.classList.remove("hidden");
    stompClient.subscribe(`/user/${username}/usersSearch`, displayFoundUsers);
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

                pickUserToChat(event);
        })
    });
}




function onError(error) {
    console.log('Error connecting');
}
function onLogout(){
    stompClient.send("/app/user.disconnectUser",
        {},
        JSON.stringify({username: username, status: 'OFFLINE', firstName: firstName})
    );
    window.location.reload();
}

usernamePage.addEventListener('submit', connect, true);
chatPage.addEventListener('submit', sendMessage, true);
logout.addEventListener('click', onLogout, true);
usersSearchInput.addEventListener('input', usersSearch, true);

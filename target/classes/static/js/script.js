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

let username = null;
let fullname = null;
let stompClient = null;
let selectedUser = null;

function connect(event){
    username = document.querySelector('#username').value.trim();
    fullname = document.querySelector('#fullname').value.trim();

    if(username && fullname){
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
        JSON.stringify({username: username, status: 'ONLINE', fullname: fullname})
    );

    document.querySelector("#connected-user-fullname").textContent = fullname;
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
        const separator = document.createElement('li');
        separator.classList.add('separator');
        usersList.appendChild(separator);
    });
}

function appendUserToList(user){
    const listItem = document.createElement('li');
    listItem.classList.add('user-item');
    listItem.id = user.username;

    if(user.status === "ONLINE") {
        listItem.classList.add('online');
    }

    const nameElement = document.createElement('span');
    nameElement.textContent = user.fullname;

    const messageMarker = document.createElement('span');
    messageMarker.textContent = '0';
    messageMarker.classList.add('notificationMarker', 'hidden');

    listItem.appendChild(nameElement);
    listItem.appendChild(messageMarker);
    listItem.addEventListener('click', pickUserToChat);

    usersList.appendChild(listItem);
}

function updateUserStatus(payload){
    const user = JSON.parse(payload.body);
    console.log("this user updated his status: " + user);
    let userElement = document.querySelector(`#${user.username}`);
    if(userElement){
        if(user.status === 'ONLINE')
            userElement.classList.add('online');
        else
            userElement.classList.remove('online');
    }
    else console.log(user.username + " is not ur contact, changes ignored");

}

function pickUserToChat(event){
    const clickedUser = event.currentTarget;
    if(clickedUser.getAttribute('id') !== selectedUser)
    {
        selectedUser = clickedUser.getAttribute('id');
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
        });

        clickedUser.classList.add('active');
        console.log(clickedUser.textContent);
        messageInput.placeholder = "Type message for " + clickedUser.firstElementChild.textContent;

        messageForm.classList.remove('hidden');
        // displayUserChat().then();
        const notificationMarker = clickedUser.querySelector('.notificationMarker');
        notificationMarker.classList.add('hidden');
        notificationMarker.textContent = '0';
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
    //Это надо вызывать только когда создался новый чат с нашим участием, либо пользователь из списка наших чатов сменил свой статус
    // await findAndShowUsers();
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
        selectedUser = chat.getAttribute('id');
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
        });
        chat.classList.add('active');
        messageInput.placeholder = "Type message for " + chat.firstElementChild.textContent  + "...";

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
    // let userToFind = event.target.value;
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
        const userElement = document.createElement('li');
        userElement.textContent = user.username + " (" + user.fullname +  ")";
        userElement.id = user.username;
        foundUsersList.appendChild(userElement);
        userElement.addEventListener('click', function (event) {
            foundUsersList.innerHTML = '';
            usersSearchInput.value = '';
            chatPage.classList.remove("hidden");
            searchPage.classList.add("hidden");
            const clickedUser = event.currentTarget;
            if(clickedUser.getAttribute('id') !== selectedUser){
                document.querySelector(`#${selectedUser}`).classList.remove('active');
                selectedUser = clickedUser.getAttribute('id');
                const userElement = document.querySelector(`#${selectedUser}`);
                if(userElement){
                    userElement.classList.add('active');
                    messageInput.placeholder = "Type message for " + userElement.firstElementChild.textContent + "...";
                }
                else{
                    messageInput.placeholder = "Type message for " + user.fullname + "...";
                }
            }
            messageForm.classList.remove('hidden');
        })
    });
}

function onError(error) {
    console.log('Error connecting');
}

function onLogout(){
    stompClient.send("/app/user.disconnectUser",
        {},
        JSON.stringify({username: username, status: 'OFFLINE', fullname: fullname})
    );
    window.location.reload();
}

usernamePage.addEventListener('submit', connect, true);
chatPage.addEventListener('submit', sendMessage, true);
logout.addEventListener('click', onLogout, true);
usersSearchInput.addEventListener('input', usersSearch, true);

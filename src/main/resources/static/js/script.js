// 'use strict';
//
// const usernamePage = document.querySelector('#username-page');
// const messageInput = document.querySelector('#message');
// const chatPage = document.querySelector('#chat-page');
// const logout = document.querySelector('#logout');
// const messageForm = document.querySelector('#messageForm');
// const chatMessagesArea = document.querySelector('#chat-messages');
// const chat = document.querySelector('#chat')
// const searchPage = document.querySelector('#search-page');
// const foundUsersList = document.querySelector('#foundUsers');
// const usersSearchInput = document.querySelector('#searchUsername');
// const usersList = document.querySelector('#chats-list');
// const selectedUserInfo = document.querySelector('#chat-userInfo');
// const pickChatMessage = document.querySelector('#pick-chat-message');
// const chatArea = document.querySelector('#chatArea');
//
//
// let username = null;
// let firstName = null;
// let stompClient = null;
// let selectedUser = null;
//
// function connect(event){
//     username = document.querySelector('#username-input').value.trim();
//     firstName = document.querySelector('#fullname-input').value.trim();
//
//     if(username && firstName){
//         usernamePage.classList.add('hidden');
//         chatPage.classList.remove('hidden');
//
//         const socket = new SockJS('/ws');
//         stompClient = Stomp.over(socket);
//
//         stompClient.connect({}, onConnected, onError);
//     }
//     event.preventDefault();
// }
//
// function onConnected(){
//     stompClient.subscribe(`/user/${username}/messages`, onMessageReceived);
//     stompClient.subscribe(`/user/public/`, updateUserStatus);
//
//     stompClient.send('/app/user.addUser',
//         {},
//         JSON.stringify({username: username, status: 'ONLINE', firstName: firstName})
//     );
//
//     logout.addEventListener('click', onLogout, true);
//
//     document.querySelector("#connected-user-firstName").textContent = firstName;
//     findAndShowChatsList().then();
//     hideChat();
// }
//
// function updateUserStatus(payload){
//     const user = JSON.parse(payload.body);
//     let userElement = document.querySelector(`#${user.username}`);
//     //для списка контактов обновляем если пользователь в нём есть
//     if(userElement){
//         if(user.status === 'ONLINE') userElement.classList.add('online');
//         else userElement.classList.remove('online');
//     }
//     //для шапки обновляем если этот пользователь выбран сейчас
//     if(selectedUser === user.username){
//         if(user.status === 'ONLINE') selectedUserInfo.classList.add('online');
//         else selectedUserInfo.classList.remove('online');
//     }
// }
//
// async function fetchAndAppendNewUserToList(targetUsername, openChat){
//     console.log("creating a new chat for this message");
//
//     const userResponse = await fetch(`/users/${targetUsername}`);
//     const userJson = await userResponse.json();
//     console.log(targetUsername + " INFO: " + userJson);
//     appendUserToList(userJson);
//     let chat = document.querySelector(`#${targetUsername}`)
//     if(openChat){
//         if(selectedUser)
//             document.querySelector(`#${selectedUser}`).classList.remove('active');
//
//         selectedUser = chat.getAttribute('id');
//         chat.classList.add('active');
//         messageInput.placeholder = "Введите сообщение для пользователя " + chat.firstElementChild.textContent  + "...";
//         selectedUserInfo.textContent = '';
//
//         const nameElement = document.createElement('span');
//         nameElement.textContent = chat.firstElementChild.textContent;
//         selectedUserInfo.appendChild(nameElement);
//
//         if(chat.classList.contains('online')) selectedUserInfo.classList.add('online');
//         selectedUserInfo.classList.remove('hidden');
//     }
//     else{
//         const notificationMarker = await chat.querySelector('.notificationMarker');
//         notificationMarker.classList.remove('hidden');
//         notificationMarker.textContent = '';
//     }
// }
//
// // function hideChat(){
// //     console.log("hide chat");
// //     chatMessagesArea.innerHTML = "";
// //     selectedUserInfo.classList.add("hidden");
// //     messageForm.classList.add("hidden");
// //     pickChatMessage.classList.remove("hidden");
// // }
//
// function onError(error) {
//     console.log('Error connecting');
// }
//
// function onLogout(){
//     stompClient.send("/app/user.disconnectUser",
//         {},
//         JSON.stringify({username: username, status: 'OFFLINE', firstName: firstName})
//     );
//     window.location.reload();
// }
//
// usernamePage.addEventListener('click', connect, true);

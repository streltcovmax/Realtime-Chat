package com.mkstr.chat.controllers;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

@Controller
public class UserInfoController {

//    @MessageMapping("/chat.addUser")
//    @SendTo("/home/1")
//    public UserInfo addUserInfo(
//            @Payload UserInfo userInfo,
//            SimpMessageHeaderAccessor headerAccessor
//    ){
        //Add username in WS session
//        headerAccessor.getSessionAttributes().put("username", user.getUsername());
//        return user;
//    }
}

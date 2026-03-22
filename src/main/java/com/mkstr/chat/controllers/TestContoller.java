package com.mkstr.chat.controllers;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/public")
public class TestContoller {

    @GetMapping("/welcome")
    public String welcome() {
        return "✅ Добро пожаловать! Вы успешно вошли через Keycloak.";
    }
}

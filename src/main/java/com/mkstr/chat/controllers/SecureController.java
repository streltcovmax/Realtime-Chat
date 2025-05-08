//package com.mkstr.chat.controllers;
//
//import org.springframework.security.core.GrantedAuthority;
//import org.springframework.security.core.annotation.AuthenticationPrincipal;
//import org.springframework.security.oauth2.core.oidc.user.OidcUser;
//import org.springframework.web.bind.annotation.GetMapping;
//import org.springframework.web.bind.annotation.RequestMapping;
//import org.springframework.web.bind.annotation.RestController;
//
//import java.util.HashMap;
//import java.util.Map;
//
//@RestController
//@RequestMapping("/secure")
//public class SecureController {
//
//    @GetMapping("/user")
//    public Map<String, Object> userInfo(@AuthenticationPrincipal OidcUser oidcUser) {
//        Map<String, Object> info = new HashMap<>();
//        info.put("username", oidcUser.getPreferredUsername());
//        info.put("email", oidcUser.getEmail());
//        info.put("roles", oidcUser.getAuthorities().stream()
//                .map(GrantedAuthority::getAuthority)
//                .toList());
//        return info;
//    }
//}

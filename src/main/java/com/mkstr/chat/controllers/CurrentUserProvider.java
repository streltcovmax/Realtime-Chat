package com.mkstr.chat.controllers;

import com.mkstr.chat.model.Status;
import com.mkstr.chat.model.User;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;

@Component
public class CurrentUserProvider {

    public User getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        if (auth != null && auth.getPrincipal() instanceof OidcUser oidcUser) {
            return new User(oidcUser.getPreferredUsername(), oidcUser.getFullName(), Status.ONLINE);
        }

        return null; // или бросить кастомное исключение
    }
}

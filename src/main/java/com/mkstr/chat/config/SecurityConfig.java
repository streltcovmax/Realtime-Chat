package com.mkstr.chat.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth
                        .anyRequest().authenticated())
                .oauth2Login(oauth2 -> oauth2
                        .defaultSuccessUrl("/", true)
                        .loginPage("/oauth2/authorization/keycloak"))
                .logout(logout -> logout
                        .logoutSuccessUrl("http://localhost:8080/realms/chat_realm/protocol/openid-connect/logout?redirect_uri=http://localhost:8081")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .permitAll()
                );
        return http.build();
    }
}

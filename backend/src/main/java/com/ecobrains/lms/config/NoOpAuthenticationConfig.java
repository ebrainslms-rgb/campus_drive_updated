package com.ecobrains.lms.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationServiceException;

/**
 * This app's real authentication is fully custom (JWT + manual credential
 * checks in AdminAuthService/StudentAuthService) - Spring Security's
 * AuthenticationManager machinery is never actually used. Defining this
 * bean is what stops Spring Boot's built-in UserDetailsServiceAutoConfiguration
 * from generating and logging a random throwaway password on every startup
 * (it only activates when no AuthenticationManager/AuthenticationProvider/
 * UserDetailsService bean exists anywhere in the app) - version-independent,
 * since it doesn't require referencing that autoconfiguration class directly.
 */
@Configuration
public class NoOpAuthenticationConfig {

    @Bean
    public AuthenticationManager authenticationManager() {
        return authentication -> {
            throw new AuthenticationServiceException(
                "This application does not use Spring Security's AuthenticationManager - authentication is handled via JWT.");
        };
    }
}
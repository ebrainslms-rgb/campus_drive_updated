package com.ecobrains.lms.config;

import com.ecobrains.lms.security.AdminUrlKeyFilter;
import com.ecobrains.lms.security.JwtAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final AdminUrlKeyFilter adminUrlKeyFilter;
    private final CorsConfigurationSource corsConfigurationSource;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter, AdminUrlKeyFilter adminUrlKeyFilter,
                           CorsConfigurationSource corsConfigurationSource) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.adminUrlKeyFilter = adminUrlKeyFilter;
        this.corsConfigurationSource = corsConfigurationSource;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Public
                        .requestMatchers("/api/admin/auth/login").permitAll()
                        .requestMatchers("/api/admin/colleges/public").permitAll()
                        .requestMatchers("/api/admin/courses/public").permitAll()
                        .requestMatchers("/api/admin/banners/public/**").permitAll()
                        .requestMatchers("/api/admin/site-content/public").permitAll()
                        .requestMatchers("/api/admin/dropdown-options/public").permitAll()
                        .requestMatchers("/api/admin/exam-settings/public").permitAll()
                        .requestMatchers("/api/student/auth/register", "/api/student/auth/login", "/api/student/auth/exam-lookup").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        // Admin-only
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // Student-only
                        .requestMatchers("/api/student/**").hasRole("STUDENT")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(adminUrlKeyFilter, JwtAuthFilter.class);

        return http.build();
    }
}
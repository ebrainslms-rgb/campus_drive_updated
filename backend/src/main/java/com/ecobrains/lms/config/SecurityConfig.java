package com.ecobrains.lms.config;

import com.ecobrains.lms.security.AdminUrlKeyFilter;
import com.ecobrains.lms.security.JwtAuthFilter;
import com.ecobrains.lms.security.PortalPermissionFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final AdminUrlKeyFilter adminUrlKeyFilter;
    private final CorsConfigurationSource corsConfigurationSource;
    private final PortalPermissionFilter portalPermissionFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter, AdminUrlKeyFilter adminUrlKeyFilter,
                           CorsConfigurationSource corsConfigurationSource, PortalPermissionFilter portalPermissionFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.adminUrlKeyFilter = adminUrlKeyFilter;
        this.corsConfigurationSource = corsConfigurationSource;
        this.portalPermissionFilter = portalPermissionFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Stateless JWT app: no form login, no HTTP basic, no default login page.
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable())
                // Always answer with JSON so the frontend can show a meaningful message:
                // 401 = not logged in / token expired, 403 = logged in but not allowed.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                writeJson(response, HttpServletResponse.SC_UNAUTHORIZED, "Your session has expired. Please log in again."))
                        .accessDeniedHandler((request, response, accessDeniedException) ->
                                writeJson(response, HttpServletResponse.SC_FORBIDDEN, "You don't have permission to perform this action."))
                )
                .authorizeHttpRequests(auth -> auth
                        // Error/forward dispatches must not be re-secured, otherwise every
                        // unhandled error turns into an empty 401/403 response.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()
                        .requestMatchers("/error").permitAll()
                        // Preflight requests
                        .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()
                        // Public
                        .requestMatchers("/api/admin/auth/login", "/api/user/auth/login").permitAll()
                        .requestMatchers("/api/admin/colleges/public").permitAll()
                        .requestMatchers("/api/admin/courses/public").permitAll()
                        .requestMatchers("/api/admin/banners/public/**").permitAll()
                        .requestMatchers("/api/admin/site-content/public").permitAll()
                        .requestMatchers("/api/admin/dropdown-options/public").permitAll()
                        .requestMatchers("/api/admin/exam-settings/public").permitAll()
                        .requestMatchers("/api/admin/registration-settings/public").permitAll()
                        .requestMatchers("/api/admin/registration-fields/public").permitAll()
                        .requestMatchers("/api/student/auth/register", "/api/student/auth/login", "/api/student/auth/exam-lookup").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        // Admin-only
                        .requestMatchers("/api/admin/**").hasAnyRole("ADMIN", "USER")
                        .requestMatchers("/api/user/auth/session").hasRole("USER")
                        // Student-only
                        .requestMatchers("/api/student/**").hasRole("STUDENT")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(adminUrlKeyFilter, JwtAuthFilter.class)
                .addFilterAfter(portalPermissionFilter, JwtAuthFilter.class);

        return http.build();
    }

    private static void writeJson(HttpServletResponse response, int status, String message) throws java.io.IOException {
        if (response.isCommitted()) return;
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"status\":" + status + ",\"message\":\"" + message.replace("\"", "\\\"") + "\"}");
    }
}
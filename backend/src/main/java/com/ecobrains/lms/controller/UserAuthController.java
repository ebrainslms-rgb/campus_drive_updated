package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.AdminLoginRequest;
import com.ecobrains.lms.dto.response.AdminLoginResponse;
import com.ecobrains.lms.security.AuthenticatedPrincipal;
import com.ecobrains.lms.service.UserAuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/user/auth")
public class UserAuthController {
    private final UserAuthService service;

    public UserAuthController(UserAuthService service) { this.service = service; }

    @PostMapping("/login")
    public ResponseEntity<AdminLoginResponse> login(@Valid @RequestBody AdminLoginRequest request) {
        return ResponseEntity.ok(service.login(request));
    }

    @GetMapping("/session")
    public ResponseEntity<AdminLoginResponse> session() {
        AuthenticatedPrincipal principal = (AuthenticatedPrincipal) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return ResponseEntity.ok(service.refresh(principal.userId()));
    }
}

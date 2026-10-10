package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.RegistrationFieldRequest;
import com.ecobrains.lms.service.RegistrationFieldService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class RegistrationFieldController {
    private final RegistrationFieldService service;
    public RegistrationFieldController(RegistrationFieldService service) { this.service = service; }

    @GetMapping("/api/admin/registration-fields")
    public ResponseEntity<?> adminList() { return ResponseEntity.ok(service.list(false)); }

    @GetMapping("/api/admin/registration-fields/public")
    public ResponseEntity<?> publicList() { return ResponseEntity.ok(service.list(true)); }

    @PostMapping("/api/admin/registration-fields")
    public ResponseEntity<?> create(@Valid @RequestBody RegistrationFieldRequest request) { return ResponseEntity.status(201).body(service.create(request)); }

    @PutMapping("/api/admin/registration-fields/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @Valid @RequestBody RegistrationFieldRequest request) { return ResponseEntity.ok(service.update(id, request)); }

    @DeleteMapping("/api/admin/registration-fields/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) { service.delete(id); return ResponseEntity.noContent().build(); }
}

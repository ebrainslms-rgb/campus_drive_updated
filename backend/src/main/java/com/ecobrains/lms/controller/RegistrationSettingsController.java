package com.ecobrains.lms.controller;
import com.ecobrains.lms.dto.request.RegistrationSettingsRequest;
import com.ecobrains.lms.service.RegistrationSettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/admin/registration-settings")
public class RegistrationSettingsController{
 private final RegistrationSettingsService service;
 public RegistrationSettingsController(RegistrationSettingsService service){this.service=service;}
 @GetMapping("/public") public ResponseEntity<?> publicSettings(){return ResponseEntity.ok(service.get());}
 @GetMapping public ResponseEntity<?> get(){return ResponseEntity.ok(service.get());}
 @PutMapping public ResponseEntity<?> update(@RequestBody RegistrationSettingsRequest request){return ResponseEntity.ok(service.update(request));}
}

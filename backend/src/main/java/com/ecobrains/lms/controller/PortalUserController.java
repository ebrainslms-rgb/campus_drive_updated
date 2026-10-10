package com.ecobrains.lms.controller;
import com.ecobrains.lms.dto.request.PortalUserRequest;import com.ecobrains.lms.service.PortalUserService;import jakarta.validation.Valid;import org.springframework.http.ResponseEntity;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/admin/user-control") public class PortalUserController{
 private final PortalUserService service; public PortalUserController(PortalUserService service){this.service=service;}
 @GetMapping public ResponseEntity<?> list(){return ResponseEntity.ok(service.list());}
 @PostMapping public ResponseEntity<?> create(@Valid @RequestBody PortalUserRequest r){return ResponseEntity.status(201).body(service.create(r));}
 @PutMapping("/{id}") public ResponseEntity<?> update(@PathVariable Long id,@Valid @RequestBody PortalUserRequest r){return ResponseEntity.ok(service.update(id,r));}
 @DeleteMapping("/{id}") public ResponseEntity<?> delete(@PathVariable Long id){service.delete(id);return ResponseEntity.noContent().build();}

}

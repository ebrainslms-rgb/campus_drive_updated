package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.DropdownOptionResponse;
import com.ecobrains.lms.service.DropdownOptionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Admin-managed dropdown option lists (Domain/Branch, Highest
 * Qualification, Year of Passing) shown on the student Registration page.
 * Same reachability/protection pattern as SiteContentController.
 */
@RestController
@RequestMapping("/api/admin/dropdown-options")
public class DropdownOptionController {

    private final DropdownOptionService dropdownOptionService;

    public DropdownOptionController(DropdownOptionService dropdownOptionService) {
        this.dropdownOptionService = dropdownOptionService;
    }

    @GetMapping
    public ResponseEntity<List<DropdownOptionResponse>> listForAdmin(@RequestParam String listKey) {
        return ResponseEntity.ok(dropdownOptionService.listForAdmin(listKey));
    }

    @PostMapping
    public ResponseEntity<DropdownOptionResponse> addOption(@RequestBody Map<String, String> body) {
        return ResponseEntity.status(201).body(dropdownOptionService.addOption(body.get("listKey"), body.get("value")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteOption(@PathVariable Long id) {
        dropdownOptionService.deleteOption(id);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/public")
    public ResponseEntity<Map<String, List<String>>> getAllForPublic() {
        return ResponseEntity.ok(dropdownOptionService.getAllForPublic());
    }
}

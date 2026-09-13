package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.CollegeRequest;
import com.ecobrains.lms.dto.request.ToggleActiveRequest;
import com.ecobrains.lms.dto.response.CollegeResponse;
import com.ecobrains.lms.service.CollegeService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class CollegeController {

    private final CollegeService collegeService;

    public CollegeController(CollegeService collegeService) {
        this.collegeService = collegeService;
    }

    /** Public - used by student registration dropdown. Only active colleges. */
    @GetMapping("/api/admin/colleges/public")
    public ResponseEntity<Map<String, Object>> getPublic() {
        List<CollegeResponse> colleges = collegeService.getActiveForRegistration();
        return ResponseEntity.ok(Map.of("colleges", colleges));
    }

    @PostMapping("/api/admin/colleges")
    public ResponseEntity<CollegeResponse> create(@Valid @RequestBody CollegeRequest request) {
        return ResponseEntity.status(201).body(collegeService.create(request));
    }

    @GetMapping("/api/admin/colleges")
    public ResponseEntity<Map<String, Object>> search(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) Boolean isActive,
            @RequestParam(defaultValue = "false") boolean all,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(collegeService.search(search, state, location, isActive, all, page, size));
    }

    @PutMapping("/api/admin/colleges/{id}")
    public ResponseEntity<CollegeResponse> update(@PathVariable Long id, @Valid @RequestBody CollegeRequest request) {
        return ResponseEntity.ok(collegeService.update(id, request));
    }

    @PatchMapping("/api/admin/colleges/{id}/toggle")
    public ResponseEntity<CollegeResponse> toggle(@PathVariable Long id, @Valid @RequestBody ToggleActiveRequest request) {
        return ResponseEntity.ok(collegeService.toggleActive(id, request.isActive()));
    }
}

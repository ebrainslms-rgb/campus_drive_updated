package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.CourseRequest;
import com.ecobrains.lms.dto.request.ToggleActiveRequest;
import com.ecobrains.lms.dto.response.CoursePublicResponse;
import com.ecobrains.lms.dto.response.CourseResponse;
import com.ecobrains.lms.repository.CourseRepository;
import com.ecobrains.lms.service.CourseService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
public class CourseController {

    private final CourseService courseService;
    private final CourseRepository courseRepository;

    public CourseController(CourseService courseService, CourseRepository courseRepository) {
        this.courseService = courseService;
        this.courseRepository = courseRepository;
    }

    /** Public - used by student registration dropdown. */
    @GetMapping("/api/admin/courses/public")
    public ResponseEntity<List<CoursePublicResponse>> getPublic() {
        return ResponseEntity.ok(courseRepository.findByActiveTrue().stream().map(CoursePublicResponse::from).toList());
    }

    @PostMapping("/api/admin/courses")
    public ResponseEntity<CourseResponse> create(@Valid @RequestBody CourseRequest request) {
        return ResponseEntity.status(201).body(courseService.create(request));
    }

    @GetMapping("/api/admin/courses")
    public ResponseEntity<List<CourseResponse>> getAll(@RequestParam(required = false) Boolean isActive) {
        return ResponseEntity.ok(courseService.getAll(isActive));
    }

    @PutMapping("/api/admin/courses/{id}")
    public ResponseEntity<CourseResponse> update(@PathVariable Long id, @Valid @RequestBody CourseRequest request) {
        return ResponseEntity.ok(courseService.update(id, request));
    }

    @PatchMapping("/api/admin/courses/{id}/toggle")
    public ResponseEntity<CourseResponse> toggle(@PathVariable Long id, @Valid @RequestBody ToggleActiveRequest request) {
        return ResponseEntity.ok(courseService.toggleActive(id, request.isActive()));
    }
}

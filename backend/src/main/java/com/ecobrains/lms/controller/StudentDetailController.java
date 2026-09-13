package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.StudentDetailResponse;
import com.ecobrains.lms.service.StudentDetailService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/students")
public class StudentDetailController {

    private final StudentDetailService studentDetailService;

    public StudentDetailController(StudentDetailService studentDetailService) {
        this.studentDetailService = studentDetailService;
    }

    @GetMapping("/{studentId}")
    public ResponseEntity<StudentDetailResponse> get(@PathVariable Long studentId) {
        return ResponseEntity.ok(studentDetailService.get(studentId));
    }
}

package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.StudentDetailResponse;
import com.ecobrains.lms.dto.request.UpdateStudentRequest;
import jakarta.validation.Valid;
import com.ecobrains.lms.service.StudentDetailService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/students")
public class StudentDetailController {

    private final StudentDetailService studentDetailService;
    private final com.ecobrains.lms.service.StudentAdminService studentAdminService;

    public StudentDetailController(StudentDetailService studentDetailService, com.ecobrains.lms.service.StudentAdminService studentAdminService) {
        this.studentDetailService = studentDetailService;
        this.studentAdminService = studentAdminService;
    }

    @GetMapping("/{studentId}")
    public ResponseEntity<StudentDetailResponse> get(@PathVariable Long studentId) {
        return ResponseEntity.ok(studentDetailService.get(studentId));
    }

    @PutMapping("/{studentId}")
    public ResponseEntity<StudentDetailResponse> update(@PathVariable Long studentId,
                                                        @Valid @RequestBody UpdateStudentRequest request) {
        studentAdminService.update(studentId, request);
        return ResponseEntity.ok(studentDetailService.get(studentId));
    }

    @DeleteMapping("/{studentId}")
    public ResponseEntity<Void> delete(@PathVariable Long studentId) {
        studentAdminService.delete(studentId);
        return ResponseEntity.noContent().build();
    }
}

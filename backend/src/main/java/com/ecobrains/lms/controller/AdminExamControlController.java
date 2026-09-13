package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.LiveExamStudentResponse;
import com.ecobrains.lms.dto.request.AdminExamActionRequest;
import com.ecobrains.lms.service.AdminExamControlService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/drives/{examId}/live")
public class AdminExamControlController {
    private final AdminExamControlService service;
    public AdminExamControlController(AdminExamControlService service) { this.service = service; }

    @GetMapping("/students")
    public ResponseEntity<List<LiveExamStudentResponse>> students(@PathVariable Long examId) {
        return ResponseEntity.ok(service.liveStudents(examId));
    }

    @PostMapping("/students/{studentId}/resume")
    public ResponseEntity<LiveExamStudentResponse> resume(@PathVariable Long examId, @PathVariable Long studentId, @RequestBody(required = false) AdminExamActionRequest request) {
        return ResponseEntity.ok(service.allowResume(examId, studentId, request == null ? null : request.reason()));
    }

    @PostMapping("/students/{studentId}/force-submit")
    public ResponseEntity<LiveExamStudentResponse> forceSubmit(@PathVariable Long examId, @PathVariable Long studentId, @RequestBody(required = false) AdminExamActionRequest request) {
        return ResponseEntity.ok(service.forceSubmit(examId, studentId, request == null ? null : request.reason()));
    }
}

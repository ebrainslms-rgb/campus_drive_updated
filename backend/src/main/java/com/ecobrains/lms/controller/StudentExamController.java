package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.SaveProgressBatchRequest;
import com.ecobrains.lms.dto.request.SubmitExamRequest;
import com.ecobrains.lms.dto.response.ExamStateResponse;
import com.ecobrains.lms.dto.response.SubmitExamResponse;
import com.ecobrains.lms.dto.response.TimeStatusResponse;
import com.ecobrains.lms.security.CurrentUser;
import com.ecobrains.lms.service.StudentExamService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/student/exam")
public class StudentExamController {

    private final StudentExamService studentExamService;

    public StudentExamController(StudentExamService studentExamService) {
        this.studentExamService = studentExamService;
    }

    @GetMapping
    public ResponseEntity<ExamStateResponse> getExam() {
        return ResponseEntity.ok(studentExamService.getExam(CurrentUser.studentId()));
    }

    @GetMapping("/time-status")
    public ResponseEntity<TimeStatusResponse> timeStatus() {
        return ResponseEntity.ok(studentExamService.getTimeStatus(CurrentUser.studentId()));
    }

    @PostMapping("/start")
    public ResponseEntity<Map<String, Object>> start() {
        return ResponseEntity.ok(studentExamService.startExam(CurrentUser.studentId()));
    }

    @PostMapping("/save-progress")
    public ResponseEntity<Map<String, Object>> saveProgress(@RequestBody SaveProgressBatchRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.ok(studentExamService.saveProgress(CurrentUser.studentId(), request, httpRequest));
    }

    @PostMapping("/submit")
    public ResponseEntity<SubmitExamResponse> submit(@RequestBody(required = false) SubmitExamRequest request, HttpServletRequest httpRequest) {
        boolean autoSubmitted = request != null && Boolean.TRUE.equals(request.autoSubmitted());
        return ResponseEntity.ok(studentExamService.submitExam(CurrentUser.studentId(), autoSubmitted, httpRequest));
    }
}

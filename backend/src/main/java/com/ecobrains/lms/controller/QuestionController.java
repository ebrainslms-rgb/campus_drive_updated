package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.AddQuestionRequest;
import com.ecobrains.lms.dto.request.UpdateQuestionRequest;
import com.ecobrains.lms.dto.response.CourseQuestionsResponse;
import com.ecobrains.lms.dto.response.QuestionDetailResponse;
import com.ecobrains.lms.dto.response.QuestionStatsResponse;
import com.ecobrains.lms.dto.response.QuestionUploadResponse;
import com.ecobrains.lms.dto.response.UploadHistoryEntryResponse;
import com.ecobrains.lms.service.QuestionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/questions")
public class QuestionController {

    private final QuestionService questionService;

    public QuestionController(QuestionService questionService) {
        this.questionService = questionService;
    }

    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    public ResponseEntity<QuestionUploadResponse> upload(@RequestParam Long courseId, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(201).body(questionService.upload(courseId, file));
    }

    @GetMapping("/upload-history")
    public ResponseEntity<Map<String, Object>> uploadHistory(@RequestParam(required = false) Long courseId) {
        return ResponseEntity.ok(Map.of("history", questionService.uploadHistory(courseId)));
    }

    @GetMapping("/stats/{courseId}")
    public ResponseEntity<QuestionStatsResponse> stats(@PathVariable Long courseId) {
        return ResponseEntity.ok(questionService.stats(courseId));
    }

    // ---- Individual question review/edit ----

    @GetMapping("/course/{courseId}")
    public ResponseEntity<CourseQuestionsResponse> listForCourse(@PathVariable Long courseId) {
        return ResponseEntity.ok(questionService.listForCourse(courseId));
    }

    @PutMapping("/{id}")
    public ResponseEntity<QuestionDetailResponse> update(@PathVariable Long id, @RequestBody UpdateQuestionRequest request) {
        return ResponseEntity.ok(questionService.updateQuestion(id, request));
    }

    @PostMapping
    public ResponseEntity<QuestionDetailResponse> add(@RequestBody AddQuestionRequest request) {
        return ResponseEntity.status(201).body(questionService.addQuestion(request));
    }
}

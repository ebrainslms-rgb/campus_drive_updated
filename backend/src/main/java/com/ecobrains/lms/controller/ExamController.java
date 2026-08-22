package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.RescheduleExamRequest;
import com.ecobrains.lms.dto.request.ScheduleExamRequest;
import com.ecobrains.lms.dto.response.DriveSummaryResponse;
import com.ecobrains.lms.dto.response.ExamResponse;
import com.ecobrains.lms.repository.ExamRepository;
import com.ecobrains.lms.service.ExamService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/exams")
public class ExamController {

    private final ExamService examService;
    private final ExamRepository examRepository;

    public ExamController(ExamService examService, ExamRepository examRepository) {
        this.examService = examService;
        this.examRepository = examRepository;
    }

    @PostMapping("/schedule")
    public ResponseEntity<ExamResponse> schedule(@Valid @RequestBody ScheduleExamRequest request) {
        return ResponseEntity.status(201).body(examService.schedule(request));
    }

    @GetMapping
    public ResponseEntity<List<ExamResponse>> getAll() {
        return ResponseEntity.ok(examService.getAll());
    }

    /**
     * Reschedule an exam slot. The service enforces (independent of this controller
     * or the frontend) that this is rejected once the exam is locked or completed.
     */
    @PutMapping("/{id}")
    public ResponseEntity<ExamResponse> update(@PathVariable Long id, @Valid @RequestBody RescheduleExamRequest request) {
        return ResponseEntity.ok(examService.update(id, request));
    }

    @GetMapping("/attendance")
public ResponseEntity<java.util.Map<String, Long>> attendance() {
    return ResponseEntity.ok(examService.attendance());
}

    /**
     * Lightweight, searchable, paginated lookup for the dashboard's Drive/Test
     * filter dropdown - separate from getAll() above (which the existing Exam
     * Management page uses unpaginated) so that page's behavior is untouched.
     */
    @GetMapping("/search")
    public ResponseEntity<Page<DriveSummaryResponse>> search(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<com.ecobrains.lms.entity.Exam> exams = examRepository.searchForFilter(
                (search == null || search.isBlank()) ? null : search.trim(),
                PageRequest.of(Math.max(page - 1, 0), size));
        return ResponseEntity.ok(exams.map(e -> DriveSummaryResponse.basic(e, 0, 0, null)));
    }
}

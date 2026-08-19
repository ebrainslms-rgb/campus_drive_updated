package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.*;
import com.ecobrains.lms.service.DashboardOverviewService;
import com.ecobrains.lms.service.DashboardService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;
    private final DashboardOverviewService overviewService;

    public DashboardController(DashboardService dashboardService, DashboardOverviewService overviewService) {
        this.dashboardService = dashboardService;
        this.overviewService = overviewService;
    }

    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> overview() {
        return ResponseEntity.ok(Map.of("data", dashboardService.overview()));
    }

    @GetMapping("/locations")
    public ResponseEntity<List<String>> locations() {
        return ResponseEntity.ok(dashboardService.locations());
    }

    @GetMapping("/colleges/{collegeId}/students")
    public ResponseEntity<Map<String, Object>> collegeStudents(@PathVariable Long collegeId) {
        return ResponseEntity.ok(Map.of("students", dashboardService.collegeStudents(collegeId)));
    }

    @GetMapping(value = "/colleges/{collegeId}/export", produces = "text/csv")
    public ResponseEntity<byte[]> exportCollegeStudentsCsv(@PathVariable Long collegeId) {
        List<StudentSummaryResponse> students = dashboardService.collegeStudents(collegeId);

        StringBuilder csv = new StringBuilder("Name,Branch,Aggregate %,Course,Attempted,Score\n");
        for (StudentSummaryResponse s : students) {
            csv.append(csvEscape(s.name())).append(',')
                    .append(csvEscape(s.branch())).append(',')
                    .append(s.aggregate() != null ? s.aggregate() : "").append(',')
                    .append(csvEscape(s.courseName())).append(',')
                    .append(s.attempted() ? "Yes" : "No").append(',')
                    .append(s.score() != null ? s.score() : "").append('\n');
        }

        byte[] body = csv.toString().getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"students.csv\"")
                .body(body);
    }

    // -- Main Admin Overview dashboard ------------------------------------
    // All four accept the same optional filters: examId, courseId, from, to.
    // from/to are IST LocalDateTime (existing IST storage/handling preserved,
    // no UTC migration per the approved plan).

    @GetMapping("/overview/kpis")
    public ResponseEntity<OverviewKpiResponse> overviewKpis(
            @RequestParam(required = false) Long examId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return ResponseEntity.ok(overviewService.kpis(examId, courseId, from, to));
    }

    @GetMapping("/overview/performance-distribution")
    public ResponseEntity<PerformanceDistributionResponse> overviewPerformanceDistribution(
            @RequestParam(required = false) Long examId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return ResponseEntity.ok(overviewService.performanceDistribution(examId, courseId, from, to));
    }

    @GetMapping("/overview/course-interest")
    public ResponseEntity<List<CourseInterestResponse>> overviewCourseInterest(
            @RequestParam(required = false) Long examId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return ResponseEntity.ok(overviewService.courseInterest(examId, courseId, from, to));
    }

    @GetMapping("/overview/top-colleges")
    public ResponseEntity<List<TopCollegeResponse>> overviewTopColleges(
            @RequestParam(required = false) Long examId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "5") int limit) {
        return ResponseEntity.ok(overviewService.topColleges(examId, courseId, from, to, limit));
    }

    private String csvEscape(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}

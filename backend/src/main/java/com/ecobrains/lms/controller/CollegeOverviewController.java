package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.CollegeOverviewResponse;
import com.ecobrains.lms.dto.response.DriveSummaryResponse;
import com.ecobrains.lms.service.CollegeOverviewService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** The College Overview drill-down page - always a separate page/route from
 *  the main Admin Overview dashboard, never rendered beneath it. */
@RestController
@RequestMapping("/api/admin/colleges/{collegeId}")
public class CollegeOverviewController {

    private final CollegeOverviewService collegeOverviewService;

    public CollegeOverviewController(CollegeOverviewService collegeOverviewService) {
        this.collegeOverviewService = collegeOverviewService;
    }

    @GetMapping("/overview")
    public ResponseEntity<CollegeOverviewResponse> overview(
            @PathVariable Long collegeId,
            @RequestParam(required = false) Integer year) {
        return ResponseEntity.ok(collegeOverviewService.overview(collegeId, year));
    }

    /** Same endpoint powers both the "latest 4" carousel (size=4) and the
     *  "View All Drives" page (larger size + page navigation). */
    @GetMapping("/drives")
    public ResponseEntity<Page<DriveSummaryResponse>> drives(
            @PathVariable Long collegeId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "4") int size) {
        return ResponseEntity.ok(collegeOverviewService.drives(collegeId, page, size));
    }

    /** Top Performers (small size, score desc) and "View All Students" (larger size) - same endpoint. */
    @GetMapping("/students")
    public ResponseEntity<Page<com.ecobrains.lms.dto.response.DriveStudentResponse>> students(
            @PathVariable Long collegeId,
            @RequestParam(required = false) Integer year,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "desc") String sort) {
        return ResponseEntity.ok(collegeOverviewService.students(collegeId, year, page, size, sort));
    }
}

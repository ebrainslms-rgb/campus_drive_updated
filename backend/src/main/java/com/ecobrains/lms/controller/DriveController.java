package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.DriveDetailResponse;
import com.ecobrains.lms.dto.response.DriveStudentResponse;
import com.ecobrains.lms.service.DriveService;
import com.ecobrains.lms.service.ExcelExportService;
import org.springframework.data.domain.Page;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;

/**
 * Drive Details page - students belonging to ONE existing Exam record
 * (the exam entity IS the drive; identified by its real database ID,
 * exam.id, never by date or exam code alone).
 */
@RestController
@RequestMapping("/api/admin/drives/{examId}")
public class DriveController {

    private final DriveService driveService;
    private final ExcelExportService excelExportService;

    public DriveController(DriveService driveService, ExcelExportService excelExportService) {
        this.driveService = driveService;
        this.excelExportService = excelExportService;
    }

    @GetMapping
    public ResponseEntity<DriveDetailResponse> detail(@PathVariable Long examId) {
        return ResponseEntity.ok(driveService.detail(examId));
    }

    @GetMapping("/students")
    public ResponseEntity<Page<DriveStudentResponse>> students(
            @PathVariable Long examId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Double scoreMin,
            @RequestParam(required = false) Double scoreMax,
            @RequestParam(required = false) String attemptStatus,
            @RequestParam(required = false) String submissionStatus,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "desc") String sort) {
        return ResponseEntity.ok(driveService.students(
                examId, courseId, scoreMin, scoreMax, attemptStatus, submissionStatus, page, size, sort));
    }

    /**
     * mode: CURRENT_PAGE | ALL_FILTERED | ALL_STUDENTS (see DriveService.exportForMode).
     * currentPage/currentSize are only used for CURRENT_PAGE - they must
     * be exactly what the admin is looking at on screen at export time,
     * so the frontend sends its live page/size values, not fixed defaults.
     */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @PathVariable Long examId,
            @RequestParam(defaultValue = "ALL_FILTERED") String mode,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Double scoreMin,
            @RequestParam(required = false) Double scoreMax,
            @RequestParam(defaultValue = "desc") String sort,
            @RequestParam(defaultValue = "1") int currentPage,
            @RequestParam(defaultValue = "15") int currentSize) {

        DriveDetailResponse drive = driveService.detail(examId);
        byte[] excel = excelExportService.exportDriveStudents(
                examId, mode, courseId, scoreMin, scoreMax, sort, currentPage, currentSize);
        String filename = excelExportService.buildFilename(drive);

        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(filename, StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(excel);
    }
}

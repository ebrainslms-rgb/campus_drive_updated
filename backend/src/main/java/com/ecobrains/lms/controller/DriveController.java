package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.DriveDetailResponse;
import com.ecobrains.lms.dto.response.DriveStudentResponse;
import com.ecobrains.lms.service.DriveService;
import com.ecobrains.lms.service.ExcelExportService;
import org.springframework.data.domain.Page;
import com.ecobrains.lms.util.ExportFileNames;
import com.ecobrains.lms.dto.response.PageResponse;
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
    private final com.ecobrains.lms.service.ExamFinalizationService finalization;
    private final com.ecobrains.lms.repository.ExamRepository examRepository;
    private final com.ecobrains.lms.service.ShortlistExportService shortlistExportService;

    public DriveController(DriveService driveService, ExcelExportService excelExportService,
                           com.ecobrains.lms.service.ExamFinalizationService finalization,
                           com.ecobrains.lms.repository.ExamRepository examRepository,
                           com.ecobrains.lms.service.ShortlistExportService shortlistExportService) {
        this.driveService = driveService;
        this.excelExportService = excelExportService;
        this.finalization = finalization;
        this.examRepository = examRepository;
        this.shortlistExportService = shortlistExportService;
    }

    /**
     * Results of a slot are finalized on the server just after its end time.
     * Until end time + 1 minute the export is refused, so nobody downloads
     * half-finished results.
     */
    private void requireResultsReady(Long examId) {
        examRepository.findById(examId).ifPresent(exam -> {
            if (finalization.isFinalizing(exam)) {
                String readyAt = finalization.resultsReadyAt(exam)
                        .format(java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.ENGLISH));
                throw com.ecobrains.lms.exception.ApiException.conflict(
                        "Results are being finalized. Export will be available from " + readyAt + ".");
            }
        });
    }

    @GetMapping
    public ResponseEntity<DriveDetailResponse> detail(@PathVariable Long examId) {
        return ResponseEntity.ok(driveService.detail(examId));
    }

    @GetMapping("/students")
    public ResponseEntity<PageResponse<DriveStudentResponse>> students(
            @PathVariable Long examId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Double scoreMin,
            @RequestParam(required = false) Double scoreMax,
            @RequestParam(required = false) String attemptStatus,
            @RequestParam(required = false) String submissionStatus,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "desc") String sort) {
        return ResponseEntity.ok(PageResponse.of(driveService.students(
                examId, courseId, scoreMin, scoreMax, attemptStatus, submissionStatus, search, page, size, sort)));
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
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "desc") String sort,
            @RequestParam(defaultValue = "1") int currentPage,
            @RequestParam(defaultValue = "15") int currentSize,
            @RequestParam(required = false) String filename,
            @RequestParam(required = false) String columns) {

        requireResultsReady(examId);
        DriveDetailResponse drive = driveService.detail(examId);
        // Columns picked in the export popup (click order); none = default columns.
        byte[] excel = excelExportService.exportDriveStudents(
                examId, mode, courseId, scoreMin, scoreMax, search, sort, currentPage, currentSize,
                com.ecobrains.lms.service.ExportColumnsService.split(columns));
        // Optional name typed in the export popup; otherwise built from the applied filters.
        String name = ExportFileNames.resolve(filename,
                excelExportService.defaultDriveFilename(drive, mode, courseId, scoreMin, scoreMax, search, currentPage));

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ExportFileNames.contentDisposition(name))
                .body(excel);
    }

    /** Default file name shown as a hint in the export popup (same rule as /export). */
    @GetMapping("/export/filename")
    public ResponseEntity<java.util.Map<String, String>> exportFilename(
            @PathVariable Long examId,
            @RequestParam(defaultValue = "ALL_FILTERED") String mode,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Double scoreMin,
            @RequestParam(required = false) Double scoreMax,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "1") int currentPage) {
        DriveDetailResponse drive = driveService.detail(examId);
        return ResponseEntity.ok(java.util.Map.of("filename",
                excelExportService.defaultDriveFilename(drive, mode, courseId, scoreMin, scoreMax, search, currentPage)));
    }

    /**
     * Shortlist & Export: interview feedback sheet for the students shortlisted
     * on screen (one domain). Read-only - nothing is stored. Same results-ready
     * rule as /export (blocked until drive end + 1 minute).
     */
    @PostMapping("/shortlist/export")
    public ResponseEntity<byte[]> shortlistExport(
            @PathVariable Long examId,
            @RequestBody com.ecobrains.lms.dto.request.ShortlistExportRequest request) {
        requireResultsReady(examId);
        var result = shortlistExportService.export(examId, request);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ExportFileNames.contentDisposition(result.filename()))
                .body(result.bytes());
    }
}

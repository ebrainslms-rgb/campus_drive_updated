package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.StudentAdminListResponse;
import com.ecobrains.lms.dto.request.StudentRegisterRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.service.StudentAdminService;
import com.ecobrains.lms.service.ExcelExportService;
import com.ecobrains.lms.util.ExcelWriter;
import com.ecobrains.lms.util.ExportFileNames;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/api/admin/students")
public class StudentAdminController {

    private final StudentAdminService studentAdminService;
    private final ExcelExportService excelExportService;

    public StudentAdminController(StudentAdminService studentAdminService, ExcelExportService excelExportService) {
        this.studentAdminService = studentAdminService;
        this.excelExportService = excelExportService;
    }

    @GetMapping
    public ResponseEntity<java.util.Map<String, Object>> list(
            @RequestParam(required = false) Long collegeId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) String testStatus,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "1") int page) {
        return ResponseEntity.ok(studentAdminService.search(collegeId, courseId, year, month, testStatus, search, page));
    }

    @PostMapping
    public ResponseEntity<com.ecobrains.lms.dto.response.StudentRegisterResponse> create(
            @Valid @RequestBody StudentRegisterRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.status(201).body(studentAdminService.create(request, httpRequest));
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @RequestParam(defaultValue = "ALL") String mode,
            @RequestParam(required = false) Long collegeId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) String testStatus,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String filename,
            @RequestParam(required = false) String columns) {

        // The student directory intentionally has only two export scopes:
        // ALL = entire database; ALL_FILTERED = every row matching the filters.
        if (!"ALL".equalsIgnoreCase(mode) && !"ALL_FILTERED".equalsIgnoreCase(mode)) {
            return ResponseEntity.badRequest().build();
        }

        boolean filtered = "ALL_FILTERED".equalsIgnoreCase(mode);
        List<Student> rows = studentAdminService.export(
                filtered ? collegeId : null,
                filtered ? courseId : null,
                filtered ? year : null,
                filtered ? month : null,
                filtered ? testStatus : null,
                filtered ? search : null);

        // Columns picked in the export popup (click order); none = default columns.
        byte[] excel = excelExportService.exportStudents(rows,
                com.ecobrains.lms.service.ExportColumnsService.split(columns), filtered && collegeId != null, filtered && courseId != null);

        // Optional name typed in the export popup; otherwise built from the applied filters.
        String name = ExportFileNames.resolve(filename,
                excelExportService.defaultStudentsFilename(mode, collegeId, courseId, year, month, testStatus, search));

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ExportFileNames.contentDisposition(name))
                .body(excel);
    }

    /** Default file name shown as a hint in the export popup (same rule as /export). */
    @GetMapping("/export/filename")
    public ResponseEntity<java.util.Map<String, String>> exportFilename(
            @RequestParam(defaultValue = "ALL") String mode,
            @RequestParam(required = false) Long collegeId,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) String testStatus,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(java.util.Map.of("filename",
                excelExportService.defaultStudentsFilename(mode, collegeId, courseId, year, month, testStatus, search)));
    }
}

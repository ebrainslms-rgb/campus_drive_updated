package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.BulkStudentConfirmResponse;
import com.ecobrains.lms.dto.response.BulkStudentPreviewResponse;
import com.ecobrains.lms.service.BulkStudentImportService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.ecobrains.lms.entity.College;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/admin/students/bulk")
public class BulkStudentController {

    private static final MediaType XLSX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private final BulkStudentImportService service;

    public BulkStudentController(BulkStudentImportService service) {
        this.service = service;
    }

    @PostMapping(value = "/preview", consumes = "multipart/form-data")
    public ResponseEntity<BulkStudentPreviewResponse> preview(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(service.preview(file));
    }

    @PostMapping(value = "/confirm", consumes = "multipart/form-data")
    public ResponseEntity<BulkStudentConfirmResponse> confirm(@RequestParam("file") MultipartFile file,
                                                              jakarta.servlet.http.HttpServletRequest request) {
        return ResponseEntity.ok(service.confirm(file, request.getRemoteAddr()));
    }

    @GetMapping("/template")
    public ResponseEntity<byte[]> template(@RequestParam Long collegeId) {
        byte[] excel = service.template(collegeId);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename("student-bulk-upload-template.xlsx", StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(XLSX)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(excel);
    }
}

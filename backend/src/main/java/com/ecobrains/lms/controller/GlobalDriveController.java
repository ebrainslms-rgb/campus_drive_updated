package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.DriveSummaryResponse;
import com.ecobrains.lms.service.DriveService;
import org.springframework.data.domain.Page;
import com.ecobrains.lms.dto.response.PageResponse;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Global Drives page (new admin sidebar item) - every drive across every
 * college, server-side paginated, newest scheduled time first. This is a
 * separate controller (not added onto DriveController) purely because
 * DriveController's class-level mapping is "/api/admin/drives/{examId}" -
 * a path-variable prefix that a bare "/api/admin/drives" (no id segment)
 * cannot share. No functional overlap: this controller only ever reads
 * the list; DriveController still owns everything scoped to one exam.
 */
@RestController
@RequestMapping("/api/admin/drives")
public class GlobalDriveController {

    private final DriveService driveService;

    public GlobalDriveController(DriveService driveService) {
        this.driveService = driveService;
    }

    @GetMapping("/ongoing")
    public ResponseEntity<List<DriveSummaryResponse>> ongoing() {
        return ResponseEntity.ok(driveService.ongoingDrives());
    }

    @GetMapping
    public ResponseEntity<PageResponse<DriveSummaryResponse>> allDrives(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(PageResponse.of(driveService.allDrives(page, size)));
    }

    @GetMapping("/completed")
public ResponseEntity<PageResponse<DriveSummaryResponse>> completedDrives(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "50") int size) {
    return ResponseEntity.ok(PageResponse.of(driveService.completedDrives(page, size)));
}
}

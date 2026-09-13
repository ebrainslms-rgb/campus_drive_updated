package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.SiteContentFieldResponse;
import com.ecobrains.lms.service.SiteContentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Admin-editable exam behaviour settings - currently just the manual
 * submit window (how many minutes before the exam ends the manual submit
 * button becomes available; was hardcoded to 5). Reachable from the admin
 * Profile drawer ("Exam Settings"), same placement/protection pattern as
 * Exam Banners and Registration Page Content.
 */
@RestController
@RequestMapping("/api/admin/exam-settings")
public class ExamSettingsController {

    private final SiteContentService siteContentService;

    public ExamSettingsController(SiteContentService siteContentService) {
        this.siteContentService = siteContentService;
    }

    @GetMapping
    public ResponseEntity<List<SiteContentFieldResponse>> listForAdmin() {
        return ResponseEntity.ok(siteContentService.listExamSettingsForAdmin());
    }

    @PutMapping("/{key}")
    public ResponseEntity<Void> update(@PathVariable String key, @RequestBody Map<String, String> body) {
        siteContentService.updateExamSetting(key, body.get("value"));
        return ResponseEntity.ok().build();
    }

    @GetMapping("/public")
    public ResponseEntity<Map<String, Integer>> getPublic() {
        return ResponseEntity.ok(Map.of("manualSubmitWindowMinutes", siteContentService.getManualSubmitWindowMinutes()));
    }
}

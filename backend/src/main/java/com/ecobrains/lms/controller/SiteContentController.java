package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.SiteContentFieldResponse;
import com.ecobrains.lms.service.SiteContentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Admin-editable text for the shared Register/Login brand panel. Reachable
 * from the admin Profile drawer ("Edit Registration Page Data"), not the
 * main sidebar - same placement pattern as Exam Banners. Admin endpoints
 * are protected like every other /api/admin/** route; /public/** is
 * deliberately open (Register.jsx and Login.jsx are unauthenticated pages).
 */
@RestController
@RequestMapping("/api/admin/site-content")
public class SiteContentController {

    private final SiteContentService siteContentService;

    public SiteContentController(SiteContentService siteContentService) {
        this.siteContentService = siteContentService;
    }

    @GetMapping
    public ResponseEntity<java.util.List<SiteContentFieldResponse>> listForAdmin() {
        return ResponseEntity.ok(siteContentService.listForAdmin());
    }

    @PutMapping("/{key}")
    public ResponseEntity<Void> update(@PathVariable String key, @RequestBody Map<String, String> body) {
        siteContentService.update(key, body.get("value"));
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{key}")
    public ResponseEntity<Void> resetToDefault(@PathVariable String key) {
        siteContentService.resetToDefault(key);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/public")
    public ResponseEntity<Map<String, String>> getPublic() {
        return ResponseEntity.ok(siteContentService.getAllForPublic());
    }
}

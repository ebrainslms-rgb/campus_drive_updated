package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.BannerSlotSummary;
import com.ecobrains.lms.entity.ExamBanner;
import com.ecobrains.lms.service.ExamBannerService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * Admin-managed exam banners - one hero image (left side of the Rules
 * page) plus up to 8 poster images (right side, after the timer).
 * Reachable from the admin Profile drawer ("Edit Exam Banners"), not the
 * main sidebar. Admin endpoints below are protected the same way every
 * other /api/admin/** endpoint already is (JWT + AdminUrlKeyFilter); the
 * two /public/** endpoints are deliberately unauthenticated - see the
 * matching entries in SecurityConfig and AdminUrlKeyFilter - because
 * plain <img> tags on the student Rules page can't send an Authorization
 * header.
 */
@RestController
@RequestMapping("/api/admin/banners")
public class ExamBannerController {

    private final ExamBannerService examBannerService;

    public ExamBannerController(ExamBannerService examBannerService) {
        this.examBannerService = examBannerService;
    }

    @GetMapping
    public ResponseEntity<List<BannerSlotSummary>> listSlots() {
        return ResponseEntity.ok(examBannerService.listSlots());
    }

    @PostMapping(value = "/{slot}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Void> upload(@PathVariable String slot, @RequestParam("file") MultipartFile file) {
        examBannerService.uploadImage(slot, file);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{slot}")
    public ResponseEntity<Void> delete(@PathVariable String slot) {
        examBannerService.deleteImage(slot);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/public/active-posters")
    public ResponseEntity<Map<String, Object>> activePosters() {
        return ResponseEntity.ok(Map.of(
                "slots", examBannerService.activePosterSlotsInOrder(),
                "heroHasImage", examBannerService.heroHasImage()
        ));
    }

    @GetMapping("/public/{slot}/image")
    public ResponseEntity<byte[]> publicImage(@PathVariable String slot) {
        ExamBanner banner = examBannerService.getImageOrThrow(slot);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(banner.getContentType()))
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                .body(banner.getImageData());
    }
}

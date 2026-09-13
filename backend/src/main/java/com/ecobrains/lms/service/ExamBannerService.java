package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.BannerSlotSummary;
import com.ecobrains.lms.entity.ExamBanner;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.ExamBannerRepository;
import com.ecobrains.lms.util.BannerSlots;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;

@Service
public class ExamBannerService {

    private static final long MAX_FILE_SIZE_BYTES = 3L * 1024 * 1024; // 3 MB
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("image/png", "image/jpeg", "image/webp");

    private final ExamBannerRepository examBannerRepository;

    public ExamBannerService(ExamBannerRepository examBannerRepository) {
        this.examBannerRepository = examBannerRepository;
    }

    /** All 9 slots (HERO + 8 posters), in fixed display order, each flagged
     *  with whether an admin image currently exists - powers the Banner
     *  Management admin page. */
    public List<BannerSlotSummary> listSlots() {
        Map<String, ExamBanner> existing = new HashMap<>();
        for (ExamBanner b : examBannerRepository.findAllById(BannerSlots.ALL_SLOTS)) {
            existing.put(b.getSlot(), b);
        }
        List<BannerSlotSummary> result = new ArrayList<>();
        for (String slot : BannerSlots.ALL_SLOTS) {
            ExamBanner b = existing.get(slot);
            result.add(new BannerSlotSummary(slot, b != null, b != null ? b.getUpdatedAt() : null,
                    b != null ? b.getOriginalFilename() : null));
        }
        return result;
    }

    public void uploadImage(String slot, MultipartFile file) {
        if (!BannerSlots.isValid(slot)) {
            throw ApiException.badRequest("Unknown banner slot: " + slot);
        }
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("No file provided.");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw ApiException.badRequest("Image must be smaller than 3 MB.");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            throw ApiException.badRequest("Only PNG, JPEG, or WEBP images are allowed.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new RuntimeException("Failed to read uploaded image.", e);
        }

        ExamBanner banner = examBannerRepository.findById(slot)
                .orElse(ExamBanner.builder().slot(slot).build());
        banner.setImageData(bytes);
        banner.setContentType(contentType);
        banner.setOriginalFilename(file.getOriginalFilename());
        examBannerRepository.save(banner);
    }

    public void deleteImage(String slot) {
        if (!BannerSlots.isValid(slot)) {
            throw ApiException.badRequest("Unknown banner slot: " + slot);
        }
        examBannerRepository.deleteById(slot);
    }

    public ExamBanner getImageOrThrow(String slot) {
        if (!BannerSlots.isValid(slot)) {
            throw ApiException.notFound("Unknown banner slot.");
        }
        return examBannerRepository.findById(slot)
                .orElseThrow(() -> ApiException.notFound("No image uploaded for this slot."));
    }

    /** Poster slots that actually have an uploaded image, in POSTER_1..
     *  POSTER_8 order. Empty list means no admin uploads yet - the
     *  frontend falls back to the existing text cards in that case;
     *  otherwise it shows exactly this many image slides, never blank
     *  placeholders for the unfilled slots. */
    public List<String> activePosterSlotsInOrder() {
        Set<String> present = new HashSet<>();
        for (ExamBanner b : examBannerRepository.findAllById(BannerSlots.POSTER_SLOTS)) {
            present.add(b.getSlot());
        }
        List<String> active = new ArrayList<>();
        for (String slot : BannerSlots.POSTER_SLOTS) {
            if (present.contains(slot)) active.add(slot);
        }
        return active;
    }

    public boolean heroHasImage() {
        return examBannerRepository.existsById(BannerSlots.HERO);
    }
}

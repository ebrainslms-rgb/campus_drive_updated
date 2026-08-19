package com.ecobrains.lms.dto.response;

import java.time.LocalDateTime;

/** One row in the admin Banner Management page - whether this slot
 *  currently has an admin-uploaded image or is still on its default. */
public record BannerSlotSummary(String slot, boolean hasImage, LocalDateTime updatedAt, String originalFilename) {}

package com.ecobrains.lms.dto.response;

import java.time.Instant;

public record TimeStatusResponse(
        boolean isSubmitted,
        Instant serverNow,
        Instant slotStartTime,
        Instant slotEndTime,
        long remainingMs,
        boolean isExpired
) {}

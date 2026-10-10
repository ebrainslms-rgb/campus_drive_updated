package com.ecobrains.lms.dto.response;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Stable JSON shape for paginated results. Keeps the same top-level fields the
 * frontend already reads (content, totalElements, totalPages, number, size, ...)
 * instead of serializing Spring's PageImpl directly, which Spring Data warns is
 * not a stable JSON contract.
 */
public record PageResponse<T>(
        List<T> content,
        long totalElements,
        int totalPages,
        int number,
        int size,
        int numberOfElements,
        boolean first,
        boolean last,
        boolean empty
) {
    public static <T> PageResponse<T> of(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.getNumber(),
                page.getSize(),
                page.getNumberOfElements(),
                page.isFirst(),
                page.isLast(),
                page.isEmpty());
    }
}

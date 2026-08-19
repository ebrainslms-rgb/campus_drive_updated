package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** One banner image, keyed by a fixed slot name (HERO, POSTER_1..POSTER_8 -
 *  see util.BannerSlots for the canonical list). Image bytes stored
 *  directly in the database (LONGBLOB) - deliberately, so this works
 *  identically regardless of the server's filesystem persistence, per
 *  the decision to avoid depending on local disk storage. One row per
 *  slot at most; a missing row means "no image uploaded for this slot
 *  yet" (the frontend falls back to a default public-folder image or,
 *  for posters, the existing text cards). */
@Entity
@Table(name = "exam_banners")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExamBanner {

    @Id
    @Column(length = 20)
    private String slot;

    @Lob
    @Column(name = "image_data", columnDefinition = "LONGBLOB")
    private byte[] imageData;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "original_filename", length = 255)
    private String originalFilename;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    void onSave() {
        updatedAt = LocalDateTime.now();
    }
}

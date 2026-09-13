package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Admin-editable text shown on the shared Register/Login brand panel -
 *  one heading, one subtitle, and three feature title/description pairs.
 *  Key IS the field identifier (e.g. "BRAND_TITLE", "FEATURE_1_TITLE"), so
 *  at most one row per field. A missing row means "no admin override yet" -
 *  the frontend falls back to the original hardcoded copy in that case,
 *  same fallback principle already used for Exam Banners. */
@Entity
@Table(name = "site_content")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SiteContent {

    @Id
    @Column(name = "content_key", length = 40)
    private String key;

    @Column(columnDefinition = "TEXT")
    private String value;

    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    void onSave() {
        updatedAt = LocalDateTime.now();
    }
}

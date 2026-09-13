package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "admin_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AdminLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "admin_email", nullable = false, length = 150)
    private String adminEmail;

    @Column(nullable = false, length = 60)
    private String action;

    @Column(name = "target_entity", length = 60)
    private String targetEntity;

    @Column(name = "target_id")
    private String targetId;

    @Lob
    @Column(name = "details")
    private String details;

    // -- Structured fields used by the question-upload history view -----
    @Column(name = "upload_course_name", length = 150)
    private String uploadCourseName;

    @Column(name = "upload_file_name", length = 255)
    private String uploadFileName;

    @Column(name = "upload_inserted")
    private Integer uploadInserted;

    @Column(name = "upload_skipped")
    private Integer uploadSkipped;

    @Column(name = "upload_status", length = 20)
    private String uploadStatus;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }
}

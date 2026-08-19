package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "colleges", uniqueConstraints = {
        @UniqueConstraint(name = "uk_college_code", columnNames = "code")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class College {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    /** Unique, stable, human-readable college code e.g. SVEC-SRPT. Never regenerated on edit. */
    @Column(nullable = false, unique = true, length = 40)
    private String code;

    @Column(nullable = false, length = 150)
    private String location;

    @Column(length = 150)
    private String district;

    @Column(nullable = false, length = 50)
    private String state;

    @Column(name = "spoc_name", length = 150)
    private String spocName;

    @Column(length = 150)
    private String email;

    @Column(name = "mobile_number", length = 20)
    private String mobileNumber;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

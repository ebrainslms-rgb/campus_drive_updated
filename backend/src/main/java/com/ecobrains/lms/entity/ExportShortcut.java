package com.ecobrains.lms.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * A saved set of export columns (in order) owned by one portal account
 * (admin or user). Students and Drive shortcuts are kept apart by exportType.
 */
@Entity
@Table(name = "export_shortcuts",
        uniqueConstraints = @UniqueConstraint(name = "uk_export_shortcut_name",
                columnNames = {"owner_id", "export_type", "name_key"}),
        indexes = @Index(name = "idx_export_shortcut_owner", columnList = "owner_id, export_type"))
public class ExportShortcut {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "owner_id", nullable = false) private Long ownerId;
    @Column(name = "export_type", nullable = false, length = 20) private String exportType;
    @Column(nullable = false, length = 40) private String name;
    /** Lower-case name, used to keep names unique per owner and export type. */
    @Column(name = "name_key", nullable = false, length = 40) private String nameKey;
    /** Column keys in export order, comma separated. */
    @Column(nullable = false, columnDefinition = "TEXT") private String columns;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;

    @PrePersist void onCreate() { if (createdAt == null) createdAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public Long getOwnerId() { return ownerId; } public void setOwnerId(Long v) { ownerId = v; }
    public String getExportType() { return exportType; } public void setExportType(String v) { exportType = v; }
    public String getName() { return name; } public void setName(String v) { name = v; }
    public String getNameKey() { return nameKey; } public void setNameKey(String v) { nameKey = v; }
    public String getColumns() { return columns; } public void setColumns(String v) { columns = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}

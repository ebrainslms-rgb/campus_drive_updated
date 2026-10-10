package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.ExportShortcut;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExportShortcutRepository extends JpaRepository<ExportShortcut, Long> {
    List<ExportShortcut> findByOwnerIdAndExportTypeOrderByCreatedAtAscIdAsc(Long ownerId, String exportType);
    long countByOwnerIdAndExportType(Long ownerId, String exportType);
    boolean existsByOwnerIdAndExportTypeAndNameKey(Long ownerId, String exportType, String nameKey);
}

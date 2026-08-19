package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.AdminLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AdminLogRepository extends JpaRepository<AdminLog, Long> {
    List<AdminLog> findByActionOrderByCreatedAtDesc(String action, org.springframework.data.domain.Pageable pageable);
}

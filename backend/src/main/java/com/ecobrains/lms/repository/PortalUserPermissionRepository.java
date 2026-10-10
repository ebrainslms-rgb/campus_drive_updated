package com.ecobrains.lms.repository;
import com.ecobrains.lms.entity.PortalUserPermission;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface PortalUserPermissionRepository extends JpaRepository<PortalUserPermission,Long>{ List<PortalUserPermission> findByUserId(Long userId); void deleteByUserId(Long userId); }

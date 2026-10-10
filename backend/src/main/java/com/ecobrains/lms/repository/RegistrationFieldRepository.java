package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.RegistrationField;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface RegistrationFieldRepository extends JpaRepository<RegistrationField, Long> {
    Optional<RegistrationField> findByFieldKey(String fieldKey);
    List<RegistrationField> findAllByEnabledTrueOrderBySortOrderAscIdAsc();
    List<RegistrationField> findAllByOrderBySortOrderAscIdAsc();
}

package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.DropdownOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DropdownOptionRepository extends JpaRepository<DropdownOption, Long> {
    List<DropdownOption> findByListKeyOrderByDisplayOrderAscIdAsc(String listKey);
    List<DropdownOption> findAllByOrderByListKeyAscDisplayOrderAscIdAsc();
    long countByListKey(String listKey);
}

package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.CollegeRequest;
import com.ecobrains.lms.dto.response.CollegeResponse;
import com.ecobrains.lms.entity.AdminLog;
import com.ecobrains.lms.entity.College;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.AdminLogRepository;
import com.ecobrains.lms.repository.CollegeRepository;
import com.ecobrains.lms.security.CurrentUser;
import com.ecobrains.lms.util.CollegeCodeGenerator;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CollegeService {

    private final CollegeRepository collegeRepository;
    private final CollegeCodeGenerator codeGenerator;
    private final AdminLogRepository adminLogRepository;

    public CollegeService(CollegeRepository collegeRepository, CollegeCodeGenerator codeGenerator,
                           AdminLogRepository adminLogRepository) {
        this.collegeRepository = collegeRepository;
        this.codeGenerator = codeGenerator;
        this.adminLogRepository = adminLogRepository;
    }

    @Transactional
    public CollegeResponse create(CollegeRequest req) {
        String code = codeGenerator.generate(req.name(), req.location());

        College college = College.builder()
                .name(req.name().trim())
                .code(code)
                .location(req.location().trim())
                .district(req.district() != null ? req.district().trim() : req.location().trim())
                .state(req.state())
                .spocName(req.spocName())
                .email(req.email())
                .mobileNumber(req.mobileNumber())
                .active(true)
                .build();

        college = collegeRepository.save(college);
        logAction("COLLEGE_ONBOARD", "College", college.getId());
        return CollegeResponse.from(college);
    }

    @Transactional
    public CollegeResponse update(Long id, CollegeRequest req) {
        College college = collegeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("College not found"));

        // Code is intentionally never regenerated on edit - it must remain stable.
        college.setName(req.name().trim());
        college.setLocation(req.location().trim());
        college.setDistrict(req.district() != null ? req.district().trim() : college.getDistrict());
        college.setState(req.state());
        college.setSpocName(req.spocName());
        college.setEmail(req.email());
        college.setMobileNumber(req.mobileNumber());

        college = collegeRepository.save(college);
        logAction("COLLEGE_EDIT", "College", college.getId());
        return CollegeResponse.from(college);
    }

    @Transactional
    public CollegeResponse toggleActive(Long id, boolean isActive) {
        College college = collegeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("College not found"));
        college.setActive(isActive);
        college = collegeRepository.save(college);
        logAction("COLLEGE_TOGGLE_ACTIVE", "College", college.getId());
        return CollegeResponse.from(college);
    }

    public List<CollegeResponse> getActiveForRegistration() {
        return collegeRepository.findByActiveTrueOrderByNameAsc().stream()
                .map(CollegeResponse::from)
                .toList();
    }

    public Map<String, Object> search(String search, String state, String location, Boolean isActive,
                                       boolean all, int page, int size) {
        Specification<College> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                String like = "%" + search.toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("code")), like),
                        cb.like(cb.lower(root.get("state")), like)
                ));
            }
            if (state != null && !state.equalsIgnoreCase("All")) {
                predicates.add(cb.equal(root.get("state"), state));
            }
            if (location != null && !location.equalsIgnoreCase("All")) {
                predicates.add(cb.equal(root.get("location"), location));
            }
            if (isActive != null) {
                predicates.add(cb.equal(root.get("active"), isActive));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Sort sort = Sort.by("name").ascending();
        List<CollegeResponse> colleges;
        long total;
        int totalPages;
        int currentPage;

        if (all) {
            List<College> found = collegeRepository.findAll(spec, sort);
            colleges = found.stream().map(CollegeResponse::from).toList();
            total = found.size();
            totalPages = 1;
            currentPage = 1;
        } else {
            Pageable pageable = PageRequest.of(Math.max(page - 1, 0), size, sort);
            Page<College> result = collegeRepository.findAll(spec, pageable);
            colleges = result.map(CollegeResponse::from).getContent();
            total = result.getTotalElements();
            totalPages = result.getTotalPages();
            currentPage = page;
        }

        List<String> locations = collegeRepository.distinctLocations();
        List<String> states = collegeRepository.distinctStates();


        Map<String, Object> body = new LinkedHashMap<>();
        body.put("colleges", colleges);
        body.put("currentPage", currentPage);
        body.put("totalPages", totalPages);
        body.put("totalColleges", total);
        body.put("locations", locations);
        body.put("states", states);
        return body;
    }

    private void logAction(String action, String entity, Long targetId) {
        adminLogRepository.save(AdminLog.builder()
                .adminEmail(CurrentUser.email())
                .action(action)
                .targetEntity(entity)
                .targetId(String.valueOf(targetId))
                .build());
    }
}

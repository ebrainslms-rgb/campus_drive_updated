package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.DropdownOptionResponse;
import com.ecobrains.lms.entity.DropdownOption;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.DropdownOptionRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

/**
 * Admin-managed dropdown option lists for the Registration page (Domain/
 * Branch, Highest Qualification, Year of Passing) - replaces the previous
 * hardcoded JS arrays. A list with zero admin-added rows falls back to its
 * original default set below, so nothing changes for anyone until an
 * admin actually adds/removes an option for that specific list.
 */
@Service
public class DropdownOptionService {

    public static final Set<String> VALID_LIST_KEYS = Set.of("DOMAIN", "QUALIFICATION", "YEAR_OF_PASSING");

    private final DropdownOptionRepository dropdownOptionRepository;

    public DropdownOptionService(DropdownOptionRepository dropdownOptionRepository) {
        this.dropdownOptionRepository = dropdownOptionRepository;
    }

    private List<String> defaultsFor(String listKey) {
        return switch (listKey) {
            case "DOMAIN" -> List.of("CSE & CSE Allied Branches", "ECE", "ISE", "AI/ML", "EEE");
            case "QUALIFICATION" -> List.of("B.E/B.Tech", "M.E/M.Tech", "MCA");
            case "YEAR_OF_PASSING" -> {
                int currentYear = LocalDate.now().getYear();
                yield List.of(String.valueOf(currentYear - 1), String.valueOf(currentYear),
                        String.valueOf(currentYear + 1), String.valueOf(currentYear + 2));
            }
            default -> List.of();
        };
    }

    /** Public, unauthenticated - Register.jsx calls this once on load to
     *  populate all three dropdowns. Each list independently falls back to
     *  its own default if the admin hasn't customised THAT specific list -
     *  customising Domain doesn't affect Qualification's defaults, etc. */
    public Map<String, List<String>> getAllForPublic() {
        Map<String, List<String>> result = new LinkedHashMap<>();
        for (String listKey : VALID_LIST_KEYS) {
            List<DropdownOption> rows = dropdownOptionRepository.findByListKeyOrderByDisplayOrderAscIdAsc(listKey);
            result.put(listKey, rows.isEmpty()
                    ? defaultsFor(listKey)
                    : rows.stream().map(DropdownOption::getValue).toList());
        }
        return result;
    }

    /** Admin listing for one list - if no admin rows exist yet, returns the
     *  defaults as read-only preview rows (id=null) so the admin sees what
     *  students currently see, and can start editing from there. */
    public List<DropdownOptionResponse> listForAdmin(String listKey) {
        validateKey(listKey);
        List<DropdownOption> rows = dropdownOptionRepository.findByListKeyOrderByDisplayOrderAscIdAsc(listKey);
        if (!rows.isEmpty()) {
            return rows.stream().map(r -> new DropdownOptionResponse(r.getId(), r.getListKey(), r.getValue(), r.getDisplayOrder())).toList();
        }
        List<String> defaults = defaultsFor(listKey);
        List<DropdownOptionResponse> preview = new ArrayList<>();
        for (int i = 0; i < defaults.size(); i++) {
            preview.add(new DropdownOptionResponse(null, listKey, defaults.get(i), i));
        }
        return preview;
    }

    /** Adding the FIRST admin option to a list "activates" custom mode for
     *  that list - from then on the list is exactly what the admin has
     *  added (the defaults are no longer silently mixed in), matching how
     *  admin expects "my list" to behave once they've started editing it. */
    public DropdownOptionResponse addOption(String listKey, String value) {
        validateKey(listKey);
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest("Option value cannot be empty.");
        }
        long existing = dropdownOptionRepository.countByListKey(listKey);
        // First customisation of this list: seed it with the current
        // defaults first, so adding one new option doesn't silently wipe
        // out the ones students already see.
        if (existing == 0) {
            List<String> defaults = defaultsFor(listKey);
            for (int i = 0; i < defaults.size(); i++) {
                dropdownOptionRepository.save(DropdownOption.builder()
                        .listKey(listKey).value(defaults.get(i)).displayOrder(i).build());
            }
            existing = defaults.size();
        }
        DropdownOption saved = dropdownOptionRepository.save(DropdownOption.builder()
                .listKey(listKey).value(value.trim()).displayOrder((int) existing).build());
        return new DropdownOptionResponse(saved.getId(), saved.getListKey(), saved.getValue(), saved.getDisplayOrder());
    }

    public void deleteOption(Long id) {
        dropdownOptionRepository.deleteById(id);
    }

    private void validateKey(String listKey) {
        if (!VALID_LIST_KEYS.contains(listKey)) {
            throw ApiException.badRequest("Unknown dropdown list: " + listKey);
        }
    }
}
